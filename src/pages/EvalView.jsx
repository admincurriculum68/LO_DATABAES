import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { hasRole } from '../lib/roles';
import { ChevronLeft, Save, FileText, CheckCircle2, AlertCircle, Clock, Send, MessageSquareText, ClipboardCheck, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import useDocumentTitle from '../lib/useDocumentTitle';
import { useDialog } from '../lib/dialogContext';
import { buildLoResolver, sameSetAcrossRooms } from '../lib/loByRoom';
import { LO_FIELDS, mappingSelect } from '../lib/loByRoomApi';
import { compareRooms, teacherRoomAccess } from '../lib/teacherAccess';
import { isPublishedDecision } from '../lib/homeroomSummary';
import { AUTOSAVE_MS, AUTOSAVE_SECONDS } from '../lib/autosave';

export default function EvalView() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    const dialog = useDialog();
    // ครูที่มีบทบาท teacher ต้องถูกตรวจการมอบหมายเสมอ แม้จะทำงานฝ่ายวิชาการด้วย
    const mustCheckAssignment = hasRole(currentUser, 'teacher');

    const [subject, setSubject] = useState(location.state?.subject || null);
    const [enrollments, setEnrollments] = useState([]);
    // แถว LO ของวิชาทุกห้อง LO ที่แสดงขึ้นกับห้องที่เลือก
    const [mappingRows, setMappingRows] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    // นับการแก้ทุกครั้ง ถ้าครูพิมพ์ต่อระหว่างกำลังบันทึก ต้องยังถือว่ามีการแก้ค้างอยู่
    const editVersionRef = useRef(0);
    const [lastSaved, setLastSaved] = useState(null);
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const roomParam = new URLSearchParams(location.search).get('room');
    const [selectedRoom, setSelectedRoom] = useState(roomParam || 'all');
    const [submission, setSubmission] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    // ห้องที่ครูประจำชั้นสรุปผลรายด้านแล้ว ใช้แจ้งเตือนเฉย ๆ ไม่ล็อกช่อง ครูผู้สอนแก้ข้อความได้ตลอด
    const [summarizedAreas, setSummarizedAreas] = useState([]);
    useDocumentTitle(subject ? `ประเมิน ${subject.subject_name}` : 'ประเมินผลรายวิชา');

    // ห้องต่างกันอาจใช้ LO ต่างกัน "ทุกห้อง" แสดงได้เฉพาะเมื่อทุกห้องใช้ชุดเดียวกัน
    const resolver = useMemo(() => buildLoResolver(mappingRows), [mappingRows]);
    const roomList = useMemo(() => [...new Set(enrollments.map(e => e.room).filter(Boolean))].sort(compareRooms), [enrollments]);
    const roomsShareLo = useMemo(() => sameSetAcrossRooms(roomList.map(room => resolver.idsFor(subjectId, room))), [resolver, roomList, subjectId]);
    const loRoom = selectedRoom === 'all' ? (roomsShareLo ? roomList[0] || null : null) : selectedRoom;
    const learningOutcomes = useMemo(() => resolver.rowsFor(subjectId, loRoom)
        .map(row => row.learning_outcomes)
        .filter(Boolean)
        .sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0) || String(a.lo_code || '').localeCompare(String(b.lo_code || ''), 'th', { numeric: true })),
    [loRoom, resolver, subjectId]);

    useEffect(() => {
        if (selectedRoom === 'all' && !roomsShareLo && roomList.length) setSelectedRoom(roomList[0]);
    }, [roomList, roomsShareLo, selectedRoom]);

    useEffect(() => {
        async function loadData() {
            try {
                const { data: subjectRecord, error: subjectError } = await supabase.from('subjects')
                    .select('*').eq('subject_id', subjectId).eq('school_id', currentUser.school_id).single();
                if (subjectError || !subjectRecord) throw new Error('ไม่พบรายวิชานี้ในโรงเรียนของคุณ');

                let access = null;
                if (mustCheckAssignment) {
                    // ครูหลักของวิชาไม่ได้แปลว่าสอนทุกห้อง ดูแถวครูรายห้องของวิชาทั้งหมด
                    const { data: assignments, error: assignmentError } = await supabase.from('subject_teachers')
                        .select('teacher_id, room_name').eq('subject_id', subjectId);
                    if (assignmentError) throw assignmentError;
                    access = teacherRoomAccess(subjectRecord, assignments || [], currentUser.teacher_id);
                    if (!access.canAccess) throw new Error('คุณไม่ได้รับมอบหมายให้ประเมินรายวิชานี้');
                    if (roomParam && !access.allows(roomParam)) throw new Error('คุณไม่ได้รับมอบหมายให้ประเมินห้องนี้');
                }
                setSubject(subjectRecord);

                const mappingColumns = await mappingSelect(`learning_outcomes(${LO_FIELDS})`);
                const [enrolls, { data: mappedLOs, error: mappingError }] = await Promise.all([
                    fetchAllRows((from, to) => supabase.from('student_enrollments')
                        .select(`
              enrollment_id, room,
              users_students(student_id, student_code, prefix, first_name, last_name)
            `).eq('subject_id', subjectId).eq('enrollment_status', 'active').range(from, to)),
                    supabase.from('subject_lo_mapping')
                        .select(mappingColumns)
                        .eq('subject_id', subjectId)
                ]);
                if (mappingError) throw mappingError;

                const rows = (mappedLOs || []).map(row => ({ room_name: null, ...row })).filter(row => row.learning_outcomes);
                setMappingRows(rows);
                // LO ทุกข้อที่ใช้ในห้องใดห้องหนึ่งของวิชา ใช้กรองผลและหาช่องที่ถูกล็อก
                const unionIds = buildLoResolver(rows).allIdsForSubject(subjectId);
                const formatLOs = [...new Map(rows.map(row => [row.lo_id, row.learning_outcomes])).values()]
                    .filter(lo => unionIds.has(lo.lo_id));

                let formatEnrolls = access && !access.allRooms ? enrolls.filter(item => access.allows(item.room)) : enrolls;
                // sort by student code
                formatEnrolls.sort((a, b) => (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || ''));
                setEnrollments(formatEnrolls);

                const enrollIds = formatEnrolls.map(e => e.enrollment_id);
                const mappedLoIds = unionIds;

                if (enrollIds.length > 0) {
                    const evals = await fetchAllByIn(enrollIds, (batch, from, to) => supabase
                        .from('lo_evaluations').select('*').in('enrollment_id', batch).range(from, to));
                    // เก็บเฉพาะ LO ที่ยังผูกกับวิชานี้ ผลของ LO ที่ถูกยกเลิกการผูกไปแล้วต้องไม่นับรวมในความคืบหน้า
                    setEvaluations(evals.filter(e => mappedLoIds.has(e.lo_id)));
                }

                // ครูประจำชั้นสรุปด้านไหนไปแล้วบ้าง ถ้าครูผู้สอนแก้ข้อความหลังจากนี้ ครูประจำชั้นต้องสรุปใหม่เอง
                const studentIds = formatEnrolls.map(e => e.users_students?.student_id).filter(Boolean);
                if (studentIds.length > 0 && mappedLoIds.size > 0) {
                    const decisions = await fetchAllByIn(studentIds, (batch, from, to) => supabase
                        .from('competency_area_final_decisions')
                        .select('student_id, competency_area, decision_status')
                        .eq('school_id', currentUser.school_id)
                        .eq('academic_year', subjectRecord.academic_year)
                        .eq('semester', subjectRecord.semester)
                        .in('student_id', batch).range(from, to));
                    const areasOfThisSubject = new Set(formatLOs.map(lo => lo.competency_area));
                    setSummarizedAreas([...new Set(decisions
                        .filter(row => isPublishedDecision(row) && areasOfThisSubject.has(row.competency_area))
                        .map(row => row.competency_area))]);
                }

            } catch (err) {
                toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [mustCheckAssignment, currentUser.school_id, currentUser.teacher_id, roomParam, subjectId]);

    useEffect(() => {
        if (!subjectId) return;
        const roomScope = selectedRoom === 'all' ? '*' : selectedRoom;
        supabase.from('assessment_submissions').select('*')
            .eq('subject_id', subjectId).eq('room_scope', roomScope).maybeSingle()
            .then(({ data, error }) => {
                if (error) toast.error('โหลดสถานะการส่งผลไม่สำเร็จ: ' + error.message);
                else setSubmission(data || null);
            });
    }, [selectedRoom, subjectId]);

    // Warn before closing browser tab if there are unsaved changes
    useEffect(() => {
        const handler = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // บันทึกอัตโนมัติ AUTOSAVE_SECONDS วินาทีหลังเริ่มแก้ ไม่แสดงตัวเลขนับถอยหลังทุกวินาทีเหมือนเดิมแล้ว
    // เพราะข้อความที่เปลี่ยนเองเกิน 5 วินาทีโดยหยุดไม่ได้ รบกวนคนที่ใช้โปรแกรมอ่านหน้าจอ
    // และคนที่ต้องมีสมาธิขณะเขียนหลักฐาน (WCAG 2.2.2)
    const autoSaveTimerRef = useRef(null);
    const saveEvaluationsRef = useRef(null);

    useEffect(() => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        if (isDirty && !saving) {
            autoSaveTimerRef.current = setTimeout(() => {
                saveEvaluationsRef.current?.(false);
            }, AUTOSAVE_MS);
        }
        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [isDirty, saving]);

    const handleEvidenceChange = (enrollmentId, loId, evidenceNote) => {
        setEvaluations(prev => {
            const existing = prev.find(e => e.enrollment_id === enrollmentId && e.lo_id === loId);
            if (existing) {
                return prev.map(e => e.enrollment_id === enrollmentId && e.lo_id === loId
                    ? { ...e, evidence_note: evidenceNote, workflow_status: 'draft', updated_at: new Date().toISOString() }
                    : e);
            }
            return [...prev, {
                evaluation_id: crypto.randomUUID(),
                enrollment_id: enrollmentId,
                lo_id: loId,
                // ราย LO เก็บเฉพาะข้อความคุณภาพ การตัดสินระดับทำที่ด้านความสามารถ
                competency_level: null,
                evidence_note: evidenceNote,
                workflow_status: 'draft',
                evaluated_by: currentUser.teacher_id,
                updated_at: new Date().toISOString()
            }];
        });
        editVersionRef.current += 1;
        setIsDirty(true);
    };

    const saveEvaluations = async (showSuccessToast = true) => {
        const versionAtStart = editVersionRef.current;
        setSaving(true);
        try {
            // 1. Save Evaluations
            if (evaluations.length > 0) {
                const { error: evalErr } = await supabase
                    .from('lo_evaluations')
                    .upsert(evaluations, { onConflict: 'enrollment_id,lo_id' });
                if (evalErr) throw evalErr;
            }

            // 2. แก้ผลหลังส่งตรวจแล้ว ต้องดึงสถานะกลับเป็นฉบับร่าง ไม่เช่นนั้นฝ่ายวิชาการจะเห็นว่ายังส่งอยู่ทั้งที่ผลเปลี่ยนไปแล้ว
            if (submission && submission.status !== 'draft') {
                const { data: revertedSubmission, error: submissionErr } = await supabase
                    .from('assessment_submissions')
                    .update({ status: 'draft', updated_at: new Date().toISOString() })
                    .eq('submission_id', submission.submission_id)
                    .select()
                    .single();
                if (submissionErr) throw submissionErr;
                setSubmission(revertedSubmission);
            }

            // แก้ต่อระหว่างบันทึก ข้อความใหม่ยังไม่ถูกบันทึก ต้องค้างสถานะแก้ไขไว้ให้บันทึกรอบถัดไป
            if (editVersionRef.current === versionAtStart) setIsDirty(false);
            setLastSaved(new Date());
            if (showSuccessToast) toast.success('บันทึกข้อความแล้ว');
            return true;
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
            return false;
        } finally {
            setSaving(false);
        }
    };
    saveEvaluationsRef.current = saveEvaluations;

    const scopedEnrollments = selectedRoom === 'all' ? enrollments : enrollments.filter(enrollment => enrollment.room === selectedRoom);
    const scopedEnrollmentIds = new Set(scopedEnrollments.map(enrollment => enrollment.enrollment_id));
    const currentLoIds = new Set(learningOutcomes.map(lo => lo.lo_id));
    const totalCells = scopedEnrollments.length * learningOutcomes.length;
    const filledCells = evaluations.filter(e => scopedEnrollmentIds.has(e.enrollment_id) && currentLoIds.has(e.lo_id) && e.evidence_note?.trim()).length;
    const missingCount = Math.max(0, totalCells - filledCells);

    const fillEvidenceColumn = async lo => {
        const label = lo.lo_code || `LO ${lo.ability_no}`;
        const note = await dialog.prompt({
            title: `เติมข้อความ ${label} ให้ทุกคนที่แสดงอยู่`,
            message: `ระบบจะใส่ข้อความนี้ให้นักเรียน ${displayedEnrollments.length} คนที่กำลังแสดง และยังแก้รายคนได้ภายหลัง`,
            inputLabel: 'ข้อความตั้งต้น',
            confirmLabel: 'เติมข้อความ',
        });
        if (!note) return;
        const now = new Date().toISOString();
        setEvaluations(previous => {
            const next = previous.map(item => ({ ...item }));
            displayedEnrollments.forEach(enrollment => {
                const index = next.findIndex(item => item.enrollment_id === enrollment.enrollment_id && item.lo_id === lo.lo_id);
                const value = {
                    evaluation_id: index >= 0 ? next[index].evaluation_id : crypto.randomUUID(),
                    enrollment_id: enrollment.enrollment_id,
                    lo_id: lo.lo_id,
                    competency_level: null,
                    evidence_note: note.trim(),
                    workflow_status: 'draft',
                    evaluated_by: currentUser.teacher_id,
                    updated_at: now,
                };
                if (index >= 0) next[index] = { ...next[index], ...value };
                else next.push(value);
            });
            return next;
        });
        editVersionRef.current += 1;
        setIsDirty(true);
        toast.success(`เติมข้อความ ${lo.lo_code || `LO ${lo.ability_no}`} ให้รายการที่แสดงแล้ว`);
    };

    const submitForReview = async () => {
        if (missingCount > 0 && !(await dialog.confirm({
            title: 'ยืนยันทั้งที่ยังกรอกไม่ครบ?',
            message: `ยังมี ${missingCount} ช่องที่ไม่มีข้อความพฤติกรรม ครูประจำชั้นและฝ่ายวิชาการจะเห็นว่าช่องเหล่านี้ว่าง ยืนยันแล้วยังกลับมาแก้ได้ตลอด`,
            confirmLabel: 'ยืนยันว่าบันทึกครบ',
        }))) {
            return;
        }

        setSubmitting(true);
        try {
            if (isDirty) {
                const saved = await saveEvaluations(false);
                if (!saved) return;
            }
            const now = new Date().toISOString();
            const payload = {
                school_id: currentUser.school_id,
                subject_id: subjectId,
                academic_year: subject.academic_year,
                semester: subject.semester,
                teacher_id: currentUser.teacher_id,
                room_scope: selectedRoom === 'all' ? '*' : selectedRoom,
                status: 'submitted',
                submitted_at: now,
                updated_at: now,
            };
            const { data, error } = await supabase
                .from('assessment_submissions')
                .upsert(payload, { onConflict: 'subject_id,academic_year,semester,room_scope' })
                .select()
                .single();
            if (error) throw error;

            const completedEvaluations = evaluations.filter(e => scopedEnrollmentIds.has(e.enrollment_id) && e.evidence_note?.trim());
            const evaluationIds = completedEvaluations.map(e => e.evaluation_id);
            for (let index = 0; index < evaluationIds.length; index += 200) {
                const { error: statusError } = await supabase.from('lo_evaluations')
                    .update({ workflow_status: 'submitted', submitted_at: now, updated_at: now })
                    .in('evaluation_id', evaluationIds.slice(index, index + 200));
                if (statusError) throw statusError;
            }
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id,
                actor_role: currentUser.role,
                action: 'submit_subject_assessment',
                entity_type: 'subject',
                entity_id: subjectId,
                detail: { academic_year: subject.academic_year, semester: subject.semester, room_scope: payload.room_scope, evaluation_count: evaluationIds.length }
            });
            setSubmission(data);
            setEvaluations(prev => prev.map(e => scopedEnrollmentIds.has(e.enrollment_id) && e.evidence_note?.trim()
                ? { ...e, workflow_status: 'submitted', submitted_at: now }
                : e));
            toast.success('ยืนยันแล้ว ครูประจำชั้นนำข้อความไปสรุปความสามารถรายด้านได้ และยังแก้ข้อความได้ตลอด');
        } catch (err) {
            toast.error('ยืนยันไม่สำเร็จ: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    let displayedEnrollments = showMissingOnly
        ? scopedEnrollments.filter(enroll => {
            const studentEvals = evaluations.filter(e => e.enrollment_id === enroll.enrollment_id && currentLoIds.has(e.lo_id) && e.evidence_note?.trim());
            return studentEvals.length < learningOutcomes.length;
        })
        : scopedEnrollments;

    const uniqueRooms = roomList;
    const submissionStatus = submission?.status || 'draft';
    // ไม่มีขั้นรอตรวจแล้ว ส่งผลคือการยืนยันว่าบันทึกครบ แถวเก่าที่เป็น approved ถือว่าส่งแล้วเช่นกัน
    const submissionLabel = {
        draft: 'ยังไม่ได้ยืนยัน',
        submitted: 'ยืนยันแล้ว',
        under_review: 'ยืนยันแล้ว',
        returned: 'ยังไม่ได้ยืนยัน',
        approved: 'ยืนยันแล้ว',
    }[submissionStatus] || 'ยังไม่ได้ยืนยัน';

    // Warn if navigating away with unsaved changes
    const handleBack = async () => {
        if (isDirty && !(await dialog.confirm({
            title: 'ออกจากหน้านี้โดยไม่บันทึก?',
            message: 'ข้อความที่แก้หลังการบันทึกครั้งล่าสุดจะหายไป',
            confirmLabel: 'ออกโดยไม่บันทึก',
            tone: 'danger',
        }))) return;
        navigate(-1);
    };

    const confirmed = ['submitted', 'under_review', 'approved'].includes(submissionStatus);
    const statusTone = confirmed ? 'text-emerald-700' : 'text-slate-600';
    const StatusIcon = ClipboardCheck;

    // ช่องหลักฐานราย LO ใช้ทั้งในตาราง (จอกว้าง) และในการ์ดรายคน (จอเล็ก)
    // บนจอเล็กใช้ตัวอักษร 16px เพราะ iPhone จะซูมทั้งหน้าเมื่อแตะช่องที่เล็กกว่านั้น
    const renderEvidence = (enroll, st, lo, stacked = false) => {
        const ev = evaluations.find(e => e.enrollment_id === enroll.enrollment_id && e.lo_id === lo.lo_id);
        const code = lo.lo_code || `LO ${lo.ability_no}`;
        return (
            <label key={lo.lo_id} className="block text-left">
                {stacked
                    ? <span className="mb-1 block text-xs font-bold text-indigo-900">{code}<span className="sr-only"> ของ {st.first_name}</span></span>
                    : <span className="sr-only">หลักฐานเชิงคุณภาพ {code} ของ {st.first_name}</span>}
                <div className="relative">
                    <MessageSquareText className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" aria-hidden="true" />
                    <textarea
                        rows="2"
                        value={ev?.evidence_note || ''}
                        onChange={(e) => handleEvidenceChange(enroll.enrollment_id, lo.lo_id, e.target.value)}
                        placeholder="บันทึกหลักฐานหรือข้อสังเกตจากการประเมิน"
                        className={`w-full resize-y rounded-lg border border-field bg-white py-2 pl-8 pr-2 text-slate-800 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 ${stacked ? 'text-base leading-6' : 'text-xs leading-5'}`}
                    />
                </div>
            </label>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-white shadow-sm border-b border-line sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center space-x-4">
                        <button
                            onClick={handleBack}
                            className="min-h-11 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 rounded-xl transition-colors flex items-center"
                        >
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span className="font-semibold text-sm">กลับ</span>
                        </button>
                        <div className="hidden sm:block w-px h-6 bg-slate-300"></div>
                        <h1 className="font-bold text-lg text-slate-800 truncate">
                            {subject ? subject.subject_name : 'กำลังโหลด...'}
                        </h1>
                    </div>
                    {/* Auto-save / Save state indicator */}
                    <div className="flex flex-wrap items-center gap-3">
                        <span className={`hidden md:inline-flex items-center gap-1.5 text-xs font-bold ${statusTone}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            สถานะ: {submissionLabel}
                        </span>
                        {isDirty && !saving && (
                            <span className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                                <Clock className="w-3.5 h-3.5" />
                                มีการแก้ไข · บันทึกอัตโนมัติภายใน {AUTOSAVE_SECONDS} วินาที
                            </span>
                        )}
                        {!isDirty && lastSaved && (
                            <span className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                บันทึกแล้วเมื่อ {lastSaved.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => navigate(`/summary/${subjectId}${selectedRoom !== 'all' ? `?room=${encodeURIComponent(selectedRoom)}` : ''}`, { state: { subject } })}
                            className="btn-secondary hidden md:inline-flex"
                        >
                            <Printer className="h-4 w-4" aria-hidden="true" />พิมพ์ผลรายวิชา
                        </button>
                        <button
                            onClick={saveEvaluations}
                            disabled={saving || !isDirty}
                            className="btn-secondary hidden md:inline-flex"
                        >
                            {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                            {saving ? 'กำลังบันทึก...' : 'บันทึกข้อความ'}
                        </button>
                        <button
                            onClick={submitForReview}
                            disabled={submitting || loading}
                            className="btn-primary hidden md:inline-flex"
                            title={missingCount > 0 ? `ยืนยันได้ โดยระบบจะถามก่อน ${missingCount} รายการที่ยังไม่ครบ` : 'บอกครูประจำชั้นและฝ่ายวิชาการว่าบันทึกครบแล้ว'}
                        >
                            {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                            ยืนยันว่าบันทึกครบ
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-grow max-w-[1600px] mx-auto w-full px-4 sm:px-6 pt-8 pb-40 md:pb-8">
                {/* บอกวิธีทำงานแบบค่อย ๆ เขียน ครูไม่ต้องกรอกให้ครบในครั้งเดียว */}
                {!loading && enrollments.length > 0 && (
                    <p className="mb-5 rounded-2xl border border-line bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                        เขียนทีละคนได้ ไม่ต้องเสร็จในครั้งเดียว ระบบบันทึกให้อัตโนมัติทุก {AUTOSAVE_SECONDS} วินาที และกดปุ่ม "บันทึกข้อความ" เองได้ตลอด ปิดหน้าไปแล้วกลับมาเขียนต่อได้
                        {lastSaved && <span className="font-bold text-emerald-800"> · บันทึกล่าสุด {lastSaved.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>}
                    </p>
                )}

                {/* แก้ข้อความได้ตลอด แต่ถ้าครูประจำชั้นสรุปรายด้านไปแล้ว ต้องบอกให้สรุปใหม่ */}
                {!loading && summarizedAreas.length > 0 && (
                    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                        <p className="text-sm leading-6 text-amber-900">
                            ครูประจำชั้นสรุปผลรายด้านของนักเรียนในห้องนี้ไปแล้ว ({summarizedAreas.join(' · ')}) แก้ข้อความได้ตลอด แต่ช่วยแจ้งครูประจำชั้นให้สรุปใหม่ด้วย
                        </p>
                    </div>
                )}
                {loading ? (
                    <div className="py-20 flex justify-center"><div className="loader"></div></div>
                ) : learningOutcomes.length === 0 ? (
                    // ห้องนี้ยังไม่ได้เลือก LO ครูเลือกเองได้ทันที ไม่ต้องรอใครอนุมัติ
                    <div className="text-center bg-white rounded-2xl p-12 border border-line mt-10 shadow-sm max-w-2xl mx-auto">
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ClipboardCheck className="w-8 h-8 text-indigo-700" aria-hidden="true" />
                        </div>
                        <p className="text-xl font-bold text-slate-800">{loRoom ? `ห้อง ${loRoom} ยังไม่ได้เลือก LO` : 'วิชานี้ยังไม่ได้เลือก LO'}</p>
                        <p className="text-slate-600 mt-2">เลือก LO ตามคำอธิบายรายวิชาก่อน บันทึกแล้วกลับมาบันทึกข้อความพฤติกรรมได้ทันที</p>
                        <button type="button" onClick={() => navigate(`/lo-setup/${subjectId}${loRoom ? `?room=${encodeURIComponent(loRoom)}` : ''}`)} className="btn-primary mt-5">
                            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />เลือก LO{loRoom ? `ของห้อง ${loRoom}` : 'ของวิชานี้'}
                        </button>
                    </div>
                ) : enrollments.length === 0 ? (
                    <div className="text-center bg-white rounded-2xl p-16 border border-line mt-10 shadow-sm max-w-2xl mx-auto">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-slate-500" />
                        </div>
                        <p className="text-xl font-bold text-slate-700">ไม่มีนักเรียนในรายวิชานี้</p>
                        <p className="text-slate-500 mt-2">กรุณาแจ้งฝ่ายวิชาการเพื่อจัดนักเรียนเข้ากลุ่มเรียนก่อนเริ่มประเมินผลลัพธ์การเรียนรู้</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-line overflow-hidden">
                        {/* Toolbar above table */}
                        <div className="p-4 border-b border-line bg-slate-50 flex items-center justify-between">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="text-sm font-bold text-slate-700">
                                    ความคืบหน้า: <span className={missingCount === 0 ? "text-emerald-700" : "text-amber-700"}>{filledCells}/{totalCells}</span>
                                </div>
                                {missingCount > 0 && (
                                    <button
                                        onClick={() => setShowMissingOnly(!showMissingOnly)}
                                        className={`min-h-11 text-sm px-3 py-1.5 rounded-lg border font-bold flex items-center transition-all ${
                                            showMissingOnly 
                                            ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <AlertCircle className="w-4 h-4 mr-1.5" />
                                        {showMissingOnly ? 'แสดงนักเรียนทั้งหมด' : `รายการที่ยังไม่มีข้อความ (${missingCount})`}
                                    </button>
                                )}
                                {uniqueRooms.length > 0 && (
                                    <select
                                        aria-label="เลือกห้องเรียนที่ต้องการบันทึกผล"
                                        value={selectedRoom}
                                        onChange={(e) => setSelectedRoom(e.target.value)}
                                        className="min-h-11 text-sm px-3 py-1.5 rounded-lg border border-field font-bold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                                    >
                                        {roomsShareLo && <option value="all">แสดงทุกห้อง ({enrollments.length} คน)</option>}
                                        {uniqueRooms.map(room => {
                                            const count = enrollments.filter(e => e.room === room).length;
                                            return <option key={room} value={room}>{room} ({count} คน)</option>;
                                        })}
                                    </select>
                                )}
                            </div>
                        </div>
                        {learningOutcomes.length > 0 && (
                            <div className="flex flex-wrap gap-2 border-b border-line p-4 md:hidden">
                                {learningOutcomes.map(lo => (
                                    <button key={lo.lo_id} type="button" onClick={() => fillEvidenceColumn(lo)} className="btn-secondary text-xs">
                                        เติม {lo.lo_code || `LO ข้อ ${lo.ability_no}`} ทุกคน
                                    </button>
                                ))}
                            </div>
                        )}
                        {/* จอเล็กใช้การ์ดรายคน ชื่อนักเรียนอยู่หัวการ์ดเสมอ ไม่ถูกช่องกรอกทับเหมือนเวลาเลื่อนตาราง */}
                        <ul className="divide-y divide-line md:hidden" aria-label="นักเรียนที่ต้องบันทึกผล">
                            {displayedEnrollments.map((enroll, i) => {
                                const st = enroll.users_students;
                                return (
                                    <li key={enroll.enrollment_id} className="space-y-3 p-4">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <h2 className="text-base font-bold text-slate-900">{i + 1}. {st.prefix || ''}{st.first_name} {st.last_name}</h2>
                                            <span className="shrink-0 font-mono text-xs text-slate-600">{st.student_code}</span>
                                        </div>
                                        {learningOutcomes.map(lo => renderEvidence(enroll, st, lo, true))}
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="relative hidden overflow-x-auto md:block">
                            <table className="w-full text-left divide-y divide-line whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-600">
                                    <tr>
                                        <th scope="col" className="sticky left-0 z-20 w-16 min-w-16 bg-slate-50 px-3 py-4 text-center text-xs font-bold uppercase tracking-wider">เลขที่</th>
                                        <th scope="col" className="sticky left-16 z-20 w-24 min-w-24 bg-slate-50 px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">รหัส</th>
                                        <th scope="col" className="sticky left-40 z-20 min-w-[200px] border-r border-line bg-slate-50 px-4 py-4 text-left text-xs font-bold uppercase tracking-wider shadow-[10px_0_10px_-10px_rgba(0,0,0,0.05)]">ชื่อ-นามสกุล</th>
                                        {learningOutcomes.map(lo => (
                                            <th key={lo.lo_id} scope="col" className="min-w-[220px] bg-indigo-50/50 px-4 py-4 text-center text-xs font-bold uppercase text-indigo-900" title={lo.lo_description}>
                                                <div>{lo.lo_code ? lo.lo_code : `LO ข้อ ${lo.ability_no}`}</div>
                                                {lo.lo_code && <div className="mt-1 text-xs font-medium text-indigo-700">ข้อ {lo.ability_no}</div>}
                                                <button type="button" onClick={() => fillEvidenceColumn(lo)} className="mt-2 min-h-11 rounded-lg border border-indigo-300 bg-white px-3 text-xs font-bold normal-case text-indigo-900 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">เติมข้อความทั้งคอลัมน์</button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line bg-white">
                                    {displayedEnrollments.map((enroll, i) => {
                                        const st = enroll.users_students;
                                        return (
                                            <tr key={enroll.enrollment_id} className="group transition-colors hover:bg-slate-50">
                                                <td className="sticky left-0 z-10 w-16 min-w-16 bg-white px-3 py-3 text-center text-sm font-semibold text-slate-500 group-hover:bg-slate-50">{i + 1}</td>
                                                <td className="sticky left-16 z-10 w-24 min-w-24 bg-white px-3 py-3 font-mono text-sm text-slate-600 group-hover:bg-slate-50">{st.student_code}</td>
                                                <th scope="row" className="sticky left-40 z-10 min-w-[200px] border-r border-line bg-white px-4 py-2 text-left text-sm font-bold text-slate-800 shadow-[10px_0_10px_-10px_rgba(0,0,0,0.05)] group-hover:bg-slate-50">
                                                    {st.prefix || ''}{st.first_name} {st.last_name}
                                                </th>
                                                {learningOutcomes.map(lo => (
                                                    <td key={lo.lo_id} className="px-2 py-2 text-center">{renderEvidence(enroll, st, lo)}</td>
                                                ))}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>

            {/* จอเล็ก: ปุ่มบันทึกและส่งอยู่ติดล่างจอเสมอ เดิมปุ่มส่งถูกซ่อนบนโทรศัพท์ ครูจึงส่งผลไม่ได้ */}
            {!loading && enrollments.length > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-300 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.12)] md:hidden">
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold">
                        <span className={`inline-flex items-center gap-1.5 ${statusTone}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />สถานะ: {submissionLabel}
                        </span>
                        <span className="text-right text-slate-700" aria-live="polite">
                            {saving ? 'กำลังบันทึก...' : isDirty ? `บันทึกอัตโนมัติภายใน ${AUTOSAVE_SECONDS} วินาที` : lastSaved ? `บันทึกแล้ว ${lastSaved.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : `กรอกแล้ว ${filledCells}/${totalCells}`}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={saveEvaluations} disabled={saving || !isDirty} className="btn-secondary">
                            <Save className="h-4 w-4" aria-hidden="true" />บันทึก
                        </button>
                        <button onClick={submitForReview} disabled={submitting || loading} className="btn-primary">
                            <Send className="h-4 w-4" aria-hidden="true" />{submitting ? 'กำลังยืนยัน...' : 'ยืนยันว่าบันทึกครบ'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
