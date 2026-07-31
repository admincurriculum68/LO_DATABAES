import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, Info, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';
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
                const [subjectResult, enrollmentResult, mappingResult] = await Promise.all([
                    supabase.from('subjects').select('*').eq('subject_id', subjectId).single(),
                    supabase.from('student_enrollments')
                        .select('enrollment_id, room, users_students(student_id, student_code, prefix, first_name, last_name)')
                        .eq('subject_id', subjectId),
                    supabase.from('subject_lo_mapping')
                        .select('learning_outcomes(lo_id, lo_code, ability_no, competency_area, lo_description)')
                        .eq('subject_id', subjectId),
                ]);
                if (subjectResult.error) throw subjectResult.error;
                if (enrollmentResult.error) throw enrollmentResult.error;
                if (mappingResult.error) throw mappingResult.error;

                const loadedEnrollments = (enrollmentResult.data || [])
                    .filter(item => !roomParam || item.room === roomParam)
                    .sort((a, b) => (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || ''));
                const loadedLos = (mappingResult.data || [])
                    .map(item => item.learning_outcomes)
                    .filter(Boolean)
                    .sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0));
                const enrollmentIds = loadedEnrollments.map(item => item.enrollment_id);
                const [evidenceResult, decisionResult] = await Promise.all([
                    enrollmentIds.length
                        ? supabase.from('lo_evaluations').select('enrollment_id, lo_id, evidence_note, workflow_status').in('enrollment_id', enrollmentIds)
                        : Promise.resolve({ data: [], error: null }),
                    enrollmentIds.length
                        ? supabase.from('competency_area_evaluations').select('*').in('enrollment_id', enrollmentIds)
                        : Promise.resolve({ data: [], error: null }),
                ]);
                if (evidenceResult.error) throw evidenceResult.error;
                if (decisionResult.error) throw decisionResult.error;

                setSubject(subjectResult.data);
                setEnrollments(loadedEnrollments);
                setLos(loadedLos);
                setEvidence(evidenceResult.data || []);
                setDecisions(Object.fromEntries((decisionResult.data || []).map(item => [
                    `${item.enrollment_id}:${item.competency_area}`,
                    { id: item.id, level: item.competency_level || '', summary: item.qualitative_summary || '' },
                ])));
            } catch (error) {
                toast.error('โหลดผล Formative ไม่สำเร็จ: ' + error.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [roomParam, subjectId]);

    const areas = useMemo(() => [...new Set(los.map(lo => lo.competency_area || 'ไม่ระบุด้านความสามารถ'))], [los]);
    const loById = useMemo(() => new Map(los.map(lo => [lo.lo_id, lo])), [los]);

    const updateDecision = (enrollmentId, area, field, value) => {
        const key = `${enrollmentId}:${area}`;
        setDecisions(previous => ({
            ...previous,
            [key]: { ...(previous[key] || { level: '', summary: '' }), [field]: value },
        }));
        setDirty(true);
    };

    const saveAll = async () => {
        const payload = [];
        enrollments.forEach(enrollment => {
            areas.forEach(area => {
                const decision = decisions[`${enrollment.enrollment_id}:${area}`];
                if (!decision?.level && !decision?.summary?.trim()) return;
                payload.push({
                    school_id: currentUser.school_id,
                    enrollment_id: enrollment.enrollment_id,
                    competency_area: area,
                    competency_level: decision.level || null,
                    qualitative_summary: decision.summary?.trim() || null,
                    evaluated_by: currentUser.teacher_id,
                    updated_at: new Date().toISOString(),
                });
            });
        });
        setSaving(true);
        try {
            if (payload.length) {
                const { error } = await supabase.from('competency_area_evaluations')
                    .upsert(payload, { onConflict: 'enrollment_id,competency_area' });
                if (error) throw error;
            }
            setDirty(false);
            toast.success('บันทึกผล Formative รายด้านความสามารถแล้ว');
        } catch (error) {
            toast.error('บันทึกผลไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Layout title="ตัดสิน Formative รายด้านความสามารถ">
            <div className="mx-auto max-w-[1680px] space-y-5 pb-12">
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <button onClick={() => navigate(-1)} className="mt-0.5 rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="กลับ"><ArrowLeft className="h-5 w-5" /></button>
                        <div>
                            <h1 className="text-lg font-extrabold text-slate-950">{subject?.subject_name || 'รายวิชา'}{roomParam ? ` · ห้อง ${roomParam}` : ''}</h1>
                            <p className="mt-1 text-sm text-slate-600">อ่านข้อความพฤติกรรมจากแต่ละ LO แล้วใช้ดุลยพินิจตัดสินระดับเป็นรายด้านความสามารถ</p>
                        </div>
                    </div>
                    <button onClick={saveAll} disabled={!dirty || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white disabled:opacity-40">
                        <Save className="h-4 w-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึกผล Formative'}
                    </button>
                </div>

                <div className="flex gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                    <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                    <p><strong>ระบบไม่คำนวณระดับจากจำนวนครั้งที่ได้แต่ละระดับ</strong> เพราะกิจกรรมมีความยากและบริบทต่างกัน ครูพิจารณาความสม่ำเสมอ ความซับซ้อน ความช่วยเหลือที่ต้องใช้ และหลักฐานล่าสุด แล้วบันทึกเหตุผลสรุปไว้ตรวจสอบได้</p>
                </div>

                {loading ? <div className="h-72 animate-pulse rounded-2xl bg-slate-200" /> : enrollments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-600">ไม่พบนักเรียนในกลุ่มเรียนนี้</div>
                ) : (
                    <div className="space-y-5">
                        {enrollments.map(enrollment => {
                            const student = enrollment.users_students;
                            return (
                                <section key={enrollment.enrollment_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                                    <header className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-extrabold text-indigo-700">{student?.first_name?.[0] || '?'}</span>
                                        <div><h2 className="font-extrabold text-slate-950">{student?.prefix || ''}{student?.first_name} {student?.last_name}</h2><p className="text-xs text-slate-500">รหัส {student?.student_code || '-'} · {enrollment.room || 'ไม่ระบุห้อง'}</p></div>
                                    </header>
                                    <div className="divide-y divide-slate-100">
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
                                                        <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-700">ระดับ Formative ของด้านนี้</span><select value={decision.level} onChange={event => updateDecision(enrollment.enrollment_id, area, 'level', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="">ยังไม่ตัดสิน</option>{LEVELS.map(level => <option key={level} value={level}>{level}</option>)}</select></label>
                                                        <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-slate-700">ข้อความสรุปและเหตุผล</span><textarea rows="4" value={decision.summary} onChange={event => updateDecision(enrollment.enrollment_id, area, 'summary', event.target.value)} placeholder="สรุปพฤติกรรมเด่น ความสม่ำเสมอ และบริบทที่ใช้ตัดสิน" className="w-full rounded-xl border border-slate-300 p-3 text-sm leading-6 placeholder:text-slate-500" /></label>
                                                        {decision.level && <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />กำหนดระดับแล้ว</p>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                )}
            </div>
        </Layout>
    );
}
