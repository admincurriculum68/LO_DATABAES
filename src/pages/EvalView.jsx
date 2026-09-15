import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { hasRole } from '../lib/roles';
import { ChevronLeft, Save, FileText, CheckCircle2, AlertCircle, Clock, Send, MessageSquareText, RotateCcw, ClipboardCheck, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import useDocumentTitle from '../lib/useDocumentTitle';
import { useDialog } from '../lib/dialogContext';

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
    const [learningOutcomes, setLearningOutcomes] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const roomParam = new URLSearchParams(location.search).get('room');
    const [selectedRoom, setSelectedRoom] = useState(roomParam || 'all');
    const [submission, setSubmission] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [lockedCells, setLockedCells] = useState(new Set());
    useDocumentTitle(subject ? `ประเมิน ${subject.subject_name}` : 'ประเมินผลรายวิชา');

    useEffect(() => {
        async function loadData() {
            try {
                const { data: subjectRecord, error: subjectError } = await supabase.from('subjects')
                    .select('*').eq('subject_id', subjectId).eq('school_id', currentUser.school_id).single();
                if (subjectError || !subjectRecord) throw new Error('ไม่พบรายวิชานี้ในโรงเรียนของคุณ');

                let allowedRooms = null;
                if (mustCheckAssignment) {
                    const { data: assignments, error: assignmentError } = await supabase.from('subject_teachers')
                        .select('room_name').eq('subject_id', subjectId).eq('teacher_id', currentUser.teacher_id);
                    if (assignmentError) throw assignmentError;
                    const isPrimaryTeacher = subjectRecord.teacher_id === currentUser.teacher_id;
                    const assignedRooms = (assignments || []).map(item => item.room_name).filter(Boolean);
                    const assignedAllRooms = (assignments || []).some(item => !item.room_name);
                    if (!isPrimaryTeacher && !(assignments || []).length) throw new Error('คุณไม่ได้รับมอบหมายให้ประเมินรายวิชานี้');
                    if (roomParam && !isPrimaryTeacher && !assignedAllRooms && !assignedRooms.includes(roomParam)) throw new Error('คุณไม่ได้รับมอบหมายให้ประเมินห้องนี้');
                    if (!isPrimaryTeacher && !assignedAllRooms) allowedRooms = new Set(assignedRooms);
                }
                setSubject(subjectRecord);

                const [enrolls, { data: mappedLOs, error: mappingError }] = await Promise.all([
                    fetchAllRows((from, to) => supabase.from('student_enrollments')
                        .select(`
              enrollment_id, room, attendance_percent,
              users_students(student_id, student_code, prefix, first_name, last_name)
            `).eq('subject_id', subjectId).eq('enrollment_status', 'active').range(from, to)),
                    supabase.from('subject_lo_mapping')
                        .select(`learning_outcomes(lo_id, lo_code, ability_no, competency_area, lo_description)`)
                        .eq('subject_id', subjectId)
                ]);
                if (mappingError) throw mappingError;

                const formatLOs = (mappedLOs || [])
                    .map(item => item.learning_outcomes)
                    .filter(Boolean)
                    .sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0));
                setLearningOutcomes(formatLOs);

                let formatEnrolls = allowedRooms ? enrolls.filter(item => allowedRooms.has(item.room)) : enrolls;
                // sort by student code
                formatEnrolls.sort((a, b) => (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || ''));
                setEnrollments(formatEnrolls);

                const enrollIds = formatEnrolls.map(e => e.enrollment_id);
                const mappedLoIds = new Set(formatLOs.map(lo => lo.lo_id));

                if (enrollIds.length > 0) {
                    const evals = await fetchAllByIn(enrollIds, (batch, from, to) => supabase
                        .from('lo_evaluations').select('*').in('enrollment_id', batch).range(from, to));
                    // เก็บเฉพาะ LO ที่ยังผูกกับวิชานี้ ผลของ LO ที่ถูกยกเลิกการผูกไปแล้วต้องไม่นับรวมในความคืบหน้า
                    setEvaluations(evals.filter(e => mappedLoIds.has(e.lo_id)));
                }

                // เมื่อฝ่ายวิชาการรับรองรายด้านแล้ว ให้ล็อก LO ทุกข้อในด้านนั้น
                const studentIds = formatEnrolls.map(e => e.users_students?.student_id).filter(Boolean);
                if (studentIds.length > 0 && mappedLoIds.size > 0) {
                    const decisions = await fetchAllByIn(studentIds, (batch, from, to) => supabase
                        .from('competency_area_final_decisions')
                        .select('student_id, competency_area, decision_status, is_locked')
                        .eq('school_id', currentUser.school_id)
                        .eq('academic_year', subjectRecord.academic_year)
                        .eq('semester', subjectRecord.semester)
                        .in('student_id', batch).range(from, to));
                    setLockedCells(new Set(
                        decisions
                            .filter(d => d.is_locked || d.decision_status === 'approved')
                            .flatMap(d => formatLOs.filter(lo => lo.competency_area === d.competency_area).map(lo => `${d.student_id}_${lo.lo_id}`))
                    ));
                }

                // Track attendance state separately for easy upsert
                const initialAtt = {};
                formatEnrolls.forEach(e => {
                    initialAtt[e.enrollment_id] = e.attendance_percent ?? 100;
                });
                setAttendance(initialAtt);

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

    // บันทึกอัตโนมัติ 30 วินาทีหลังเริ่มแก้ ไม่แสดงตัวเลขนับถอยหลังทุกวินาทีเหมือนเดิมแล้ว
    // เพราะข้อความที่เปลี่ยนเองเกิน 5 วินาทีโดยหยุดไม่ได้ รบกวนคนที่ใช้โปรแกรมอ่านหน้าจอ
    // และคนที่ต้องมีสมาธิขณะเขียนหลักฐาน (WCAG 2.2.2)
    const autoSaveTimerRef = useRef(null);
    const saveEvaluationsRef = useRef(null);

    useEffect(() => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        if (isDirty && !saving) {
            autoSaveTimerRef.current = setTimeout(() => {
                saveEvaluationsRef.current?.();
            }, 30000);
        }
        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [isDirty, saving]);

    const [attendance, setAttendance] = useState({});

    const handleAttendanceChange = (enrollmentId, val) => {
        let num = parseFloat(val);
        if (isNaN(num)) num = 0;
        if (num < 0) num = 0;
        if (num > 100) num = 100;
        setAttendance(prev => ({ ...prev, [enrollmentId]: num }));
        setIsDirty(true);
    };

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
        setIsDirty(true);
    };

    const saveEvaluations = async (showSuccessToast = true) => {
        setSaving(true);
        try {
            // Updated to also save attendance. Upserting both is possible, but attendance is on student_enrollments

            // 1. Save Evaluations
            if (evaluations.length > 0) {
                const { error: evalErr } = await supabase
                    .from('lo_evaluations')
                    .upsert(evaluations, { onConflict: 'enrollment_id,lo_id' });
                if (evalErr) throw evalErr;
            }

            // 2. Save Attendance
            const attUpdates = Object.entries(attendance);

            if (attUpdates.length > 0) {
                // Update existing enrollments instead of upserting partial rows.
                // The enrollment table has required student/subject/room fields;
                // a partial upsert can fail its NOT NULL checks before conflict handling.
                const attendanceResults = await Promise.all(
                    attUpdates.map(([enrollmentId, attendancePercent]) => (
                        supabase
                            .from('student_enrollments')
                            .update({ attendance_percent: attendancePercent })
                            .eq('enrollment_id', enrollmentId)
                    ))
                );
                const failedAttendance = attendanceResults.find(result => result.error);
                if (failedAttendance?.error) throw failedAttendance.error;
            }

            // 3. แก้ผลหลังส่งตรวจแล้ว ต้องดึงสถานะกลับเป็นฉบับร่าง ไม่เช่นนั้นฝ่ายวิชาการจะเห็นว่ายังส่งอยู่ทั้งที่ผลเปลี่ยนไปแล้ว
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

            setIsDirty(false);
            setLastSaved(new Date());
            if (showSuccessToast) toast.success('บันทึกผลการประเมิน เวลาเรียน และหลักฐานแล้ว');
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
    const totalCells = scopedEnrollments.length * learningOutcomes.length;
    const filledCells = evaluations.filter(e => scopedEnrollmentIds.has(e.enrollment_id) && e.evidence_note?.trim()).length;
    const missingCount = Math.max(0, totalCells - filledCells);

    const fillEvidenceColumn = async lo => {
        const label = lo.lo_code || `LO ${lo.ability_no}`;
        const note = await dialog.prompt({
            title: `เติมข้อความ ${label} ให้ทุกคนที่แสดงอยู่`,
            message: `ระบบจะใส่ข้อความนี้ให้นักเรียน ${displayedEnrollments.length} คนที่กำลังแสดง ช่องที่ฝ่ายวิชาการรับรองแล้วจะไม่ถูกเปลี่ยน และยังแก้รายคนได้ภายหลัง`,
            inputLabel: 'ข้อความตั้งต้น',
            confirmLabel: 'เติมข้อความ',
        });
        if (!note) return;
        const now = new Date().toISOString();
        setEvaluations(previous => {
            const next = previous.map(item => ({ ...item }));
            displayedEnrollments.forEach(enrollment => {
                const studentId = enrollment.users_students?.student_id;
                if (submissionStatus === 'approved' || lockedCells.has(`${studentId}_${lo.lo_id}`)) return;
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
        setIsDirty(true);
        toast.success(`เติมข้อความ ${lo.lo_code || `LO ${lo.ability_no}`} ให้รายการที่แสดงแล้ว`);
    };

    const submitForReview = async () => {
        if (missingCount > 0 && !(await dialog.confirm({
            title: 'ส่งผลทั้งที่ยังกรอกไม่ครบ?',
            message: `ยังมี ${missingCount} ช่องที่ไม่มีข้อความพฤติกรรม ครูประจำชั้นและฝ่ายวิชาการจะเห็นว่าช่องเหล่านี้ว่าง`,
            confirmLabel: 'ส่งผลรายวิชา',
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
            toast.success('ส่งผลรายวิชาแล้ว ครูประจำชั้นนำข้อความไปสรุปความสามารถรายด้านได้');
        } catch (err) {
            toast.error('ส่งผลตรวจสอบไม่สำเร็จ: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    let displayedEnrollments = showMissingOnly
        ? scopedEnrollments.filter(enroll => {
            const studentEvals = evaluations.filter(e => e.enrollment_id === enroll.enrollment_id && e.evidence_note?.trim());
            return studentEvals.length < learningOutcomes.length;
        })
        : scopedEnrollments;

    const uniqueRooms = [...new Set(enrollments.map(e => e.room).filter(Boolean))].sort();
    const submissionStatus = submission?.status || 'draft';
    const submissionLabel = {
        draft: 'ฉบับร่าง',
        submitted: 'ส่งผลแล้ว',
        under_review: 'กำลังตรวจสอบ',
        returned: 'ส่งกลับแก้ไข',
        approved: 'ฝ่ายวิชาการรับรองแล้ว'
    }[submissionStatus] || 'ฉบับร่าง';

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

    const statusTone = submissionStatus === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : submissionStatus === 'returned' ? 'border-rose-200 bg-rose-50 text-rose-700'
            : submissionStatus === 'submitted' || submissionStatus === 'under_review' ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-line bg-slate-50 text-slate-600';
    const StatusIcon = submissionStatus === 'returned' ? RotateCcw : ClipboardCheck;

    // ช่องหลักฐานราย LO ใช้ทั้งในตาราง (จอกว้าง) และในการ์ดรายคน (จอเล็ก)
    // บนจอเล็กใช้ตัวอักษร 16px เพราะ iPhone จะซูมทั้งหน้าเมื่อแตะช่องที่เล็กกว่านั้น
    const renderEvidence = (enroll, st, lo, stacked = false) => {
        const ev = evaluations.find(e => e.enrollment_id === enroll.enrollment_id && e.lo_id === lo.lo_id);
        const cellLocked = submissionStatus === 'approved' || lockedCells.has(`${st.student_id}_${lo.lo_id}`);
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
                        disabled={cellLocked}
                        placeholder={cellLocked ? 'ฝ่ายวิชาการรับรองผลนี้แล้ว' : 'บันทึกหลักฐานหรือข้อสังเกตจากการประเมิน'}
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
                        <span className={`hidden md:inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${statusTone}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {submissionLabel}
                        </span>
                        {isDirty && !saving && (
                            <span className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                                <Clock className="w-3.5 h-3.5" />
                                มีการแก้ไข · บันทึกอัตโนมัติภายใน 30 วินาที
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
                            disabled={saving || !isDirty || submissionStatus === 'approved'}
                            className="btn-secondary hidden md:inline-flex"
                        >
                            {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                            {saving ? 'กำลังบันทึกผล...' : 'บันทึกผลการประเมิน'}
                        </button>
                        <button
                            onClick={submitForReview}
                            disabled={submitting || loading || submissionStatus === 'approved'}
                            className="btn-primary hidden md:inline-flex"
                            title={missingCount > 0 ? `ส่งได้ โดยระบบจะถามยืนยัน ${missingCount} รายการที่ยังไม่ครบ` : 'ส่งผลรายวิชาให้ครูประจำชั้นและฝ่ายวิชาการ'}
                        >
                            {submitting ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                            ส่งผลรายวิชา
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-grow max-w-[1600px] mx-auto w-full px-4 sm:px-6 pt-8 pb-40 md:pb-8">
                {loading ? (
                    <div className="py-20 flex justify-center"><div className="loader"></div></div>
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
                                        <option value="all">แสดงทุกห้อง ({enrollments.length} คน)</option>
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
                                        <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-700">
                                            <span>เวลาเรียน (ร้อยละ)<span className="sr-only"> ของ {st.first_name}</span></span>
                                            <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                inputMode="decimal"
                                                value={attendance[enroll.enrollment_id] ?? 100}
                                                onChange={(e) => handleAttendanceChange(enroll.enrollment_id, e.target.value)}
                                                className="min-h-11 w-20 rounded-lg border border-field px-2 text-center text-base font-bold focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                                            />
                                        </label>
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
                                        <th scope="col" className="px-4 py-4 text-center text-xs font-bold uppercase tracking-wider w-24 border-r border-line">เวลาเรียน (%)</th>
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
                                                <td className="px-4 py-2 text-center border-r border-line bg-slate-50/50">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={attendance[enroll.enrollment_id] ?? 100}
                                                        aria-label={`เวลาเรียนของ ${st.first_name} ${st.last_name} (ร้อยละ)`}
                                                        onChange={(e) => handleAttendanceChange(enroll.enrollment_id, e.target.value)}
                                                        className="min-h-11 w-16 px-2 text-center text-sm font-bold rounded-lg border border-field focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
                                                    />
                                                </td>
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
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${statusTone}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />{submissionLabel}
                        </span>
                        <span className="text-right text-slate-700" aria-live="polite">
                            {saving ? 'กำลังบันทึก...' : isDirty ? 'บันทึกอัตโนมัติภายใน 30 วินาที' : lastSaved ? `บันทึกแล้ว ${lastSaved.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : `กรอกแล้ว ${filledCells}/${totalCells}`}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={saveEvaluations} disabled={saving || !isDirty || submissionStatus === 'approved'} className="btn-secondary">
                            <Save className="h-4 w-4" aria-hidden="true" />บันทึก
                        </button>
                        <button onClick={submitForReview} disabled={submitting || loading || submissionStatus === 'approved'} className="btn-primary">
                            <Send className="h-4 w-4" aria-hidden="true" />{submitting ? 'กำลังส่ง...' : 'ส่งผลรายวิชา'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
