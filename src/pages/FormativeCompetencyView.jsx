import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, Info, Save, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../AuthContext';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { CBE_LEVELS_2568 } from '../constants/curriculum2568';

const LEVELS = [...CBE_LEVELS_2568, 'N/A'];

export default function FormativeCompetencyView() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    const roomParam = new URLSearchParams(location.search).get('room');
    const [subject, setSubject] = useState(location.state?.subject || null);
    const [enrollments, setEnrollments] = useState([]);
    const [los, setLos] = useState([]);
    const [evidence, setEvidence] = useState([]);
    const [decisions, setDecisions] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                const [subjectResult, loadedEnrollmentRows, mappingResult, assignmentResult] = await Promise.all([
                    supabase.from('subjects').select('*').eq('subject_id', subjectId).eq('school_id', currentUser.school_id).single(),
                    fetchAllRows((from, to) => supabase.from('student_enrollments')
                        .select('enrollment_id, room, users_students(student_id, student_code, prefix, first_name, last_name)')
                        .eq('subject_id', subjectId).eq('enrollment_status', 'active').range(from, to)),
                    supabase.from('subject_lo_mapping')
                        .select('learning_outcomes(lo_id, lo_code, ability_no, competency_area, lo_description)')
                        .eq('subject_id', subjectId),
                    supabase.from('subject_teachers').select('room_name').eq('subject_id', subjectId).eq('teacher_id', currentUser.teacher_id),
                ]);
                if (subjectResult.error) throw subjectResult.error;
                if (mappingResult.error) throw mappingResult.error;
                if (assignmentResult.error) throw assignmentResult.error;
                let allowedRooms = null;
                if (currentUser.role === 'teacher') {
                    const isPrimary = subjectResult.data.teacher_id === currentUser.teacher_id;
                    const assignedAll = (assignmentResult.data || []).some(item => !item.room_name);
                    const assignedRooms = (assignmentResult.data || []).map(item => item.room_name).filter(Boolean);
                    if (!isPrimary && !(assignmentResult.data || []).length) throw new Error('คุณไม่ได้รับมอบหมายให้ประเมินรายวิชานี้');
                    if (roomParam && !isPrimary && !assignedAll && !assignedRooms.includes(roomParam)) throw new Error('คุณไม่ได้รับมอบหมายให้ประเมินห้องนี้');
                    if (!isPrimary && !assignedAll) allowedRooms = new Set(assignedRooms);
                }

                const loadedEnrollments = loadedEnrollmentRows
                    .filter(item => !roomParam || item.room === roomParam)
                    .filter(item => !allowedRooms || allowedRooms.has(item.room))
                    .sort((a, b) => (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || ''));
                const loadedLos = (mappingResult.data || [])
                    .map(item => item.learning_outcomes)
                    .filter(Boolean)
                    .sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0));
                const enrollmentIds = loadedEnrollments.map(item => item.enrollment_id);
                const [evidenceRows, decisionRows] = await Promise.all([
                    fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('lo_evaluations')
                        .select('enrollment_id, lo_id, evidence_note, workflow_status').in('enrollment_id', batch).range(from, to)),
                    fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('competency_area_evaluations')
                        .select('*').in('enrollment_id', batch).range(from, to)),
                ]);

                setSubject(subjectResult.data);
                setEnrollments(loadedEnrollments);
                setLos(loadedLos);
                setEvidence(evidenceRows);
                const initialDecisions = Object.fromEntries(decisionRows.map(item => [
                    `${item.enrollment_id}:${item.competency_area}`,
                    { id: item.id, level: item.competency_level || '', summary: item.qualitative_summary || '', workflow_status: item.workflow_status || 'draft' },
                ]));
                const loadedAreas = [...new Set(loadedLos.map(lo => lo.competency_area || 'ไม่ระบุด้านความสามารถ'))];
                loadedEnrollments.forEach(enrollment => loadedAreas.forEach(area => {
                    const key = `${enrollment.enrollment_id}:${area}`;
                    if (initialDecisions[key]?.summary) return;
                    const areaLoIds = new Set(loadedLos.filter(lo => (lo.competency_area || 'ไม่ระบุด้านความสามารถ') === area).map(lo => lo.lo_id));
                    const summary = evidenceRows
                        .filter(item => item.enrollment_id === enrollment.enrollment_id && areaLoIds.has(item.lo_id) && item.evidence_note?.trim())
                        .map(item => item.evidence_note.trim())
                        .join(' • ');
                    if (summary) initialDecisions[key] = { ...(initialDecisions[key] || { level: '', workflow_status: 'draft' }), summary };
                }));
                setDecisions(initialDecisions);
            } catch (error) {
                toast.error('โหลดหน้าสรุประดับรายด้านไม่สำเร็จ: ' + error.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [currentUser.role, currentUser.school_id, currentUser.teacher_id, roomParam, subjectId]);

    const areas = useMemo(() => [...new Set(los.map(lo => lo.competency_area || 'ไม่ระบุด้านความสามารถ'))], [los]);
    const loById = useMemo(() => new Map(los.map(lo => [lo.lo_id, lo])), [los]);
    const totalDecisionCount = enrollments.length * areas.length;
    const missingDecisionCount = enrollments.reduce((count, enrollment) =>
        count + areas.filter(area => !decisions[`${enrollment.enrollment_id}:${area}`]?.level).length, 0);

    const updateDecision = (enrollmentId, area, field, value) => {
        const key = `${enrollmentId}:${area}`;
        setDecisions(previous => ({
            ...previous,
            [key]: { ...(previous[key] || { level: '', summary: '' }), [field]: value },
        }));
        setDirty(true);
    };

    const saveAll = async (submit = false) => {
        if (submit) {
            const missing = enrollments.reduce((count, enrollment) => count + areas.filter(area => !decisions[`${enrollment.enrollment_id}:${area}`]?.level).length, 0);
            if (missing > 0 && !window.confirm(`ยังไม่ได้สรุประดับ ${missing} รายการ ต้องการส่งเฉพาะรายการที่กรอกแล้วให้ฝ่ายวิชาการหรือไม่?`)) return;
        }
        const payload = [];
        const deleteIds = [];
        const now = new Date().toISOString();
        enrollments.forEach(enrollment => {
            areas.forEach(area => {
                const decision = decisions[`${enrollment.enrollment_id}:${area}`];
                if (!decision?.level && !decision?.summary?.trim()) {
                    if (decision?.id) deleteIds.push(decision.id);
                    return;
                }
                payload.push({
                    school_id: currentUser.school_id,
                    enrollment_id: enrollment.enrollment_id,
                    competency_area: area,
                    competency_level: decision.level || null,
                    qualitative_summary: decision.summary?.trim() || null,
                    evaluated_by: currentUser.teacher_id,
                    workflow_status: submit ? 'submitted' : 'draft',
                    submitted_at: submit ? now : null,
                    updated_at: now,
                });
            });
        });
        setSaving(true);
        try {
            if (payload.length) {
                const { data: savedRows, error } = await supabase.from('competency_area_evaluations')
                    .upsert(payload, { onConflict: 'enrollment_id,competency_area' })
                    .select('id, enrollment_id, competency_area, competency_level, qualitative_summary, workflow_status');
                if (error) throw error;
                setDecisions(previous => {
                    const next = { ...previous };
                    (savedRows || []).forEach(item => {
                        next[`${item.enrollment_id}:${item.competency_area}`] = {
                            id: item.id,
                            level: item.competency_level || '',
                            summary: item.qualitative_summary || '',
                            workflow_status: item.workflow_status || 'draft',
                        };
                    });
                    return next;
                });
            }
            if (deleteIds.length) {
                for (let index = 0; index < deleteIds.length; index += 200) {
                    const { error } = await supabase.from('competency_area_evaluations').delete().in('id', deleteIds.slice(index, index + 200));
                    if (error) throw error;
                }
                setDecisions(previous => Object.fromEntries(Object.entries(previous).filter(([, decision]) => !deleteIds.includes(decision.id))));
            }
            if (submit) {
                const enrollmentIds = enrollments.map(item => item.enrollment_id);
                for (let index = 0; index < enrollmentIds.length; index += 200) {
                    const { error } = await supabase.from('lo_evaluations')
                        .update({ workflow_status: 'submitted', submitted_at: now, updated_at: now })
                        .in('enrollment_id', enrollmentIds.slice(index, index + 200))
                        .not('evidence_note', 'is', null);
                    if (error) throw error;
                }
                const { error: submissionError } = await supabase.from('assessment_submissions').upsert({
                    school_id: currentUser.school_id,
                    subject_id: subjectId,
                    academic_year: subject.academic_year,
                    semester: subject.semester,
                    teacher_id: currentUser.teacher_id,
                    room_scope: roomParam || '*',
                    status: 'submitted',
                    submitted_at: now,
                    updated_at: now,
                }, { onConflict: 'subject_id,academic_year,semester,room_scope' });
                if (submissionError) throw submissionError;
                setDecisions(previous => Object.fromEntries(Object.entries(previous).map(([key, decision]) => [key, decision.level ? { ...decision, workflow_status: 'submitted' } : decision])));
            }
            setDirty(false);
            toast.success(submit ? 'บันทึกและส่งผลสรุปรายด้านให้ฝ่ายวิชาการแล้ว' : 'บันทึกฉบับร่างรายด้านความสามารถแล้ว');
        } catch (error) {
            toast.error('บันทึกผลไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Layout title="สรุประดับรายด้านความสามารถ">
            <div className="mx-auto max-w-[1680px] space-y-5 pb-28">
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <button onClick={() => navigate(-1)} className="mt-0.5 rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="กลับ"><ArrowLeft className="h-5 w-5" /></button>
                        <div>
                            <h1 className="text-lg font-extrabold text-slate-950">{subject?.subject_name || 'รายวิชา'}{roomParam ? ` · ห้อง ${roomParam}` : ''}</h1>
                            <p className="mt-1 text-sm text-slate-600">ขั้นที่ 2: ระบบนำข้อความจากแต่ละ LO มาให้แล้ว ครูเลือกเพียงระดับรายด้านและตรวจข้อความสรุป</p>
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                    <p><strong>ระบบไม่คำนวณระดับจากจำนวนครั้งที่ได้แต่ละระดับ</strong> เพราะกิจกรรมมีความยากและบริบทต่างกัน ครูพิจารณาความสม่ำเสมอ ความซับซ้อน ความช่วยเหลือที่ต้องใช้ และหลักฐานล่าสุด แล้วบันทึกเหตุผลสรุปไว้ตรวจสอบได้</p>
                </div>

                {loading ? <div className="h-72 animate-pulse rounded-2xl bg-slate-200" /> : enrollments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-600">ไม่พบนักเรียนในกลุ่มเรียนนี้</div>
                ) : (
                    <div className="space-y-5">
                        {enrollments.map((enrollment, index) => {
                            const student = enrollment.users_students;
                            return (
                                <details key={enrollment.enrollment_id} open={index === 0} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    <summary className="flex min-h-16 cursor-pointer items-center gap-3 bg-slate-50 px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-extrabold text-indigo-700">{student?.first_name?.[0] || '?'}</span>
                                        <span><strong className="block font-extrabold text-slate-950">{student?.prefix || ''}{student?.first_name} {student?.last_name}</strong><span className="text-xs text-slate-600">รหัส {student?.student_code || '-'} · {enrollment.room || 'ไม่ระบุห้อง'}</span></span>
                                    </summary>
                                    <div className="divide-y divide-slate-100 border-t border-slate-200">
                                        {areas.map(area => {
                                            const areaLos = los.filter(lo => (lo.competency_area || 'ไม่ระบุด้านความสามารถ') === area);
                                            const notes = evidence.filter(item => item.enrollment_id === enrollment.enrollment_id && areaLos.some(lo => lo.lo_id === item.lo_id) && item.evidence_note?.trim());
                                            const key = `${enrollment.enrollment_id}:${area}`;
                                            const decision = decisions[key] || { level: '', summary: '' };
                                            return (
                                                <div key={area} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
                                                    <div>
                                                        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><BookOpen className="h-4 w-4 text-indigo-600" />{area}</h3>
                                                        <div className="mt-3 space-y-2">
                                                            {notes.length ? notes.map(note => <div key={note.lo_id} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-xs font-bold text-indigo-700">{loById.get(note.lo_id)?.lo_code || `LO ${loById.get(note.lo_id)?.ability_no || ''}`}</p><p className="mt-1 text-sm leading-6 text-slate-700">{note.evidence_note}</p></div>) : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">ยังไม่มีข้อความพฤติกรรมในด้านนี้</p>}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                                                        <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-700">ระดับสรุปของด้านนี้</span><select value={decision.level} onChange={event => updateDecision(enrollment.enrollment_id, area, 'level', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="">ยังไม่ตัดสิน</option>{LEVELS.map(level => <option key={level} value={level}>{level}</option>)}</select></label>
                                                        <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-700">ข้อความสรุปจาก LO (ระบบเติมให้ แก้ได้)</span><textarea rows="4" value={decision.summary} onChange={event => updateDecision(enrollment.enrollment_id, area, 'summary', event.target.value)} placeholder="ระบบจะนำข้อความพฤติกรรมราย LO มาเป็นข้อความตั้งต้น" className="w-full rounded-xl border border-slate-300 p-3 text-sm leading-6 placeholder:text-slate-600" /></label>
                                                        {decision.level && <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />กำหนดระดับแล้ว</p>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </details>
                            );
                        })}
                    </div>
                )}
            </div>
            {!loading && enrollments.length > 0 && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-300 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur print:hidden">
                    <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-slate-700"><strong className="text-slate-950">กำหนดระดับแล้ว {totalDecisionCount - missingDecisionCount}/{totalDecisionCount}</strong><span className="ml-2">เหลือ {missingDecisionCount} รายการ{dirty ? ' · มีการแก้ไขที่ยังไม่บันทึก' : ''}</span></div>
                        <div className="flex gap-2"><button onClick={() => saveAll(false)} disabled={!dirty || saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-white px-5 text-sm font-extrabold text-indigo-800 disabled:opacity-40 sm:flex-none"><Save className="h-4 w-4" />บันทึกฉบับร่าง</button><button onClick={() => saveAll(true)} disabled={saving} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white disabled:opacity-40 sm:flex-none"><Send className="h-4 w-4" />{saving ? 'กำลังส่ง...' : 'บันทึกและส่งฝ่ายวิชาการ'}</button></div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
