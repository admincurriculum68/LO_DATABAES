import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    Filter,
    FolderKanban,
    History,
    RotateCcw,
    Save,
    Search,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';

const LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'];
const LEVEL_ORDER = { เริ่มต้น: 1, พัฒนา: 2, ชำนาญ: 3, เชี่ยวชาญ: 4, 'N/A': 0 };

const statusMeta = {
    pending: { label: 'รอรับรอง', className: 'bg-amber-50 text-amber-800 border-amber-200' },
    approved: { label: 'รับรองแล้ว', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    returned: { label: 'ส่งกลับแก้ไข', className: 'bg-rose-50 text-rose-800 border-rose-200' },
};

function fullName(student) {
    if (!student) return 'ไม่พบข้อมูลผู้เรียน';
    return `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim();
}

function recommendedLevel(sources) {
    const valid = sources
        .map(source => source.competency_level)
        .filter(level => level && level !== 'N/A');
    if (valid.length === 0) return '';
    const counts = valid.reduce((acc, level) => ({ ...acc, [level]: (acc[level] || 0) + 1 }), {});
    return [...valid].sort((a, b) => {
        const frequency = counts[b] - counts[a];
        return frequency !== 0 ? frequency : LEVEL_ORDER[b] - LEVEL_ORDER[a];
    })[0];
}

function sourceLabel(source) {
    if (source.source_type === 'subject') return source.source_name || 'รายวิชา';
    const type = {
        project: 'โครงงาน',
        activity: 'กิจกรรม',
        integrated_unit: 'หน่วยบูรณาการ',
        learning_unit: 'หน่วยการเรียนรู้',
    }[source.context_type] || 'บริบทการเรียนรู้';
    return `${type}: ${source.source_name || '-'}`;
}

function LoadingState() {
    return (
        <div className="space-y-4" aria-label="กำลังโหลดข้อมูล">
            {[1, 2, 3, 4].map(item => (
                <div key={item} className="h-24 rounded-2xl bg-slate-200/70 animate-pulse" />
            ))}
        </div>
    );
}

export default function AcademicApprovalCenter() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [groups, setGroups] = useState([]);
    const [selectedKey, setSelectedKey] = useState('');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('pending');
    const [loFilter, setLoFilter] = useState('all');
    const [decisionLevel, setDecisionLevel] = useState('');
    const [decisionReason, setDecisionReason] = useState('');

    const loadApprovalData = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');

        try {
            const [{ data: students, error: studentError }, { data: subjects, error: subjectError }, { data: los, error: loError }] = await Promise.all([
                supabase.from('users_students').select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room').eq('school_id', currentUser.school_id),
                supabase.from('subjects').select('subject_id, subject_code, subject_name, academic_year, semester').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
                supabase.from('learning_outcomes').select('lo_id, lo_code, ability_no, competency_area, lo_description').eq('school_id', currentUser.school_id),
            ]);
            if (studentError) throw studentError;
            if (subjectError) throw subjectError;
            if (loError) throw loError;

            const subjectIds = (subjects || []).map(subject => subject.subject_id);
            const [{ data: enrollments, error: enrollmentError }, { data: contexts, error: contextError }] = await Promise.all([
                subjectIds.length
                    ? supabase.from('student_enrollments').select('enrollment_id, student_id, subject_id, room').in('subject_id', subjectIds)
                    : Promise.resolve({ data: [], error: null }),
                supabase.from('learning_contexts').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
            ]);
            if (enrollmentError) throw enrollmentError;
            if (contextError) throw contextError;

            const enrollmentIds = (enrollments || []).map(enrollment => enrollment.enrollment_id);
            const contextIds = (contexts || []).map(context => context.context_id);
            const [{ data: subjectEvaluations, error: subjectEvaluationError }, { data: contextEvaluations, error: contextEvaluationError }, { data: decisions, error: decisionError }] = await Promise.all([
                enrollmentIds.length
                    ? supabase.from('lo_evaluations').select('*').in('enrollment_id', enrollmentIds)
                    : Promise.resolve({ data: [], error: null }),
                contextIds.length
                    ? supabase.from('learning_context_evaluations').select('*').in('context_id', contextIds)
                    : Promise.resolve({ data: [], error: null }),
                supabase.from('lo_final_decisions').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
            ]);
            if (subjectEvaluationError) throw subjectEvaluationError;
            if (contextEvaluationError) throw contextEvaluationError;
            if (decisionError) throw decisionError;

            const studentMap = new Map((students || []).map(student => [student.student_id, student]));
            const subjectMap = new Map((subjects || []).map(subject => [subject.subject_id, subject]));
            const enrollmentMap = new Map((enrollments || []).map(enrollment => [enrollment.enrollment_id, enrollment]));
            const contextMap = new Map((contexts || []).map(context => [context.context_id, context]));
            const loMap = new Map((los || []).map(lo => [lo.lo_id, lo]));
            const decisionMap = new Map((decisions || []).map(decision => [`${decision.student_id}:${decision.lo_id}`, decision]));
            const grouped = new Map();

            const addSource = (studentId, loId, source) => {
                const student = studentMap.get(studentId);
                const lo = loMap.get(loId);
                if (!student || !lo) return;
                const key = `${studentId}:${loId}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        key,
                        student,
                        lo,
                        sources: [],
                        decision: decisionMap.get(key) || null,
                    });
                }
                grouped.get(key).sources.push(source);
            };

            (subjectEvaluations || []).forEach(evaluation => {
                const enrollment = enrollmentMap.get(evaluation.enrollment_id);
                if (!enrollment) return;
                const subject = subjectMap.get(enrollment.subject_id);
                addSource(enrollment.student_id, evaluation.lo_id, {
                    source_type: 'subject',
                    source_id: subject?.subject_id,
                    source_code: subject?.subject_code,
                    source_name: subject?.subject_name,
                    competency_level: evaluation.competency_level,
                    evidence_note: evaluation.evidence_note,
                    workflow_status: evaluation.workflow_status || 'draft',
                    evaluation_id: evaluation.evaluation_id,
                });
            });

            (contextEvaluations || []).forEach(evaluation => {
                const context = contextMap.get(evaluation.context_id);
                addSource(evaluation.student_id, evaluation.lo_id, {
                    source_type: 'context',
                    source_id: evaluation.context_id,
                    source_name: context?.context_name,
                    context_type: context?.context_type,
                    competency_level: evaluation.competency_level,
                    evidence_note: evaluation.evidence_note,
                    workflow_status: evaluation.workflow_status || 'draft',
                    context_evaluation_id: evaluation.context_evaluation_id,
                });
            });

            const result = [...grouped.values()]
                .map(group => ({ ...group, recommended_level: recommendedLevel(group.sources) }))
                .sort((a, b) => {
                    const roomCompare = (a.student.current_room || '').localeCompare(b.student.current_room || '', 'th');
                    if (roomCompare !== 0) return roomCompare;
                    const studentCompare = (a.student.student_code || '').localeCompare(b.student.student_code || '', 'th');
                    return studentCompare !== 0 ? studentCompare : (a.lo.ability_no || 0) - (b.lo.ability_no || 0);
                });
            setGroups(result);
            setSelectedKey(current => result.some(group => group.key === current) ? current : result[0]?.key || '');
        } catch (error) {
            const message = error.message || 'ไม่สามารถโหลดข้อมูลได้';
            setLoadError(message.includes('does not exist') || message.includes('schema cache')
                ? 'ยังไม่ได้ติดตั้งโครงสร้างฐานข้อมูล CBE Track รุ่นรับรองผล กรุณารันไฟล์ cbe_track_demo_upgrade.sql ใน Supabase SQL Editor'
                : message);
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => {
        loadApprovalData();
    }, [loadApprovalData]);

    const selected = groups.find(group => group.key === selectedKey) || null;

    useEffect(() => {
        if (!selected) return;
        setDecisionLevel(selected.decision?.final_level || selected.recommended_level || '');
        setDecisionReason(selected.decision?.decision_reason || '');
    }, [selected]);

    const loOptions = useMemo(() => {
        const unique = new Map();
        groups.forEach(group => unique.set(group.lo.lo_id, group.lo));
        return [...unique.values()].sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0));
    }, [groups]);

    const filteredGroups = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return groups.filter(group => {
            const decisionStatus = group.decision?.decision_status || 'pending';
            const matchesStatus = statusFilter === 'all' || decisionStatus === statusFilter;
            const matchesLo = loFilter === 'all' || group.lo.lo_id === loFilter;
            const haystack = `${group.student.student_code || ''} ${fullName(group.student)} ${group.student.current_room || ''} ${group.lo.lo_code || ''} ${group.lo.lo_description || ''}`.toLowerCase();
            return matchesStatus && matchesLo && (!normalized || haystack.includes(normalized));
        });
    }, [groups, loFilter, query, statusFilter]);

    const stats = useMemo(() => groups.reduce((acc, group) => {
        const status = group.decision?.decision_status || 'pending';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { pending: 0, approved: 0, returned: 0 }), [groups]);

    const saveDecision = async (decisionStatus) => {
        if (!selected || !decisionLevel) {
            toast.error('กรุณาเลือกระดับความสามารถสุดท้าย');
            return;
        }
        if (!decisionReason.trim()) {
            toast.error(decisionStatus === 'returned' ? 'กรุณาระบุสิ่งที่ต้องการให้ครูแก้ไข' : 'กรุณาบันทึกเหตุผลหรือหลักฐานประกอบการรับรอง');
            return;
        }

        setSaving(true);
        try {
            const passed = ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(decisionLevel);
            const payload = {
                school_id: currentUser.school_id,
                student_id: selected.student.student_id,
                lo_id: selected.lo.lo_id,
                academic_year: academicYear,
                semester,
                final_level: decisionLevel,
                pass_status: decisionLevel === 'N/A' ? 'pending' : passed ? 'passed' : 'not_passed',
                decision_status: decisionStatus,
                decision_reason: decisionReason.trim(),
                decided_by: currentUser.teacher_id || currentUser.id,
                decided_at: new Date().toISOString(),
                is_locked: decisionStatus === 'approved',
                updated_at: new Date().toISOString(),
            };
            const { error: decisionError } = await supabase
                .from('lo_final_decisions')
                .upsert(payload, { onConflict: 'student_id,lo_id,academic_year,semester' });
            if (decisionError) throw decisionError;

            const subjectEvaluationIds = selected.sources.filter(source => source.evaluation_id).map(source => source.evaluation_id);
            const contextEvaluationIds = selected.sources.filter(source => source.context_evaluation_id).map(source => source.context_evaluation_id);
            const nextWorkflowStatus = decisionStatus === 'approved' ? 'approved' : 'returned';
            const updates = [];
            if (subjectEvaluationIds.length) {
                updates.push(supabase.from('lo_evaluations').update({ workflow_status: nextWorkflowStatus, updated_at: new Date().toISOString() }).in('evaluation_id', subjectEvaluationIds));
            }
            if (contextEvaluationIds.length) {
                updates.push(supabase.from('learning_context_evaluations').update({ workflow_status: nextWorkflowStatus, updated_at: new Date().toISOString() }).in('context_evaluation_id', contextEvaluationIds));
            }
            const updateResults = await Promise.all(updates);
            const updateError = updateResults.find(result => result.error)?.error;
            if (updateError) throw updateError;

            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: decisionStatus === 'approved' ? 'approve_lo_result' : 'return_lo_result',
                entity_type: 'lo_final_decision',
                detail: {
                    student_id: selected.student.student_id,
                    lo_id: selected.lo.lo_id,
                    final_level: decisionLevel,
                    reason: decisionReason.trim(),
                    source_count: selected.sources.length,
                },
            });

            toast.success(decisionStatus === 'approved' ? 'รับรองผล LO เรียบร้อยแล้ว' : 'ส่งผลกลับให้ครูแก้ไขแล้ว');
            await loadApprovalData();
        } catch (error) {
            toast.error('บันทึกการรับรองไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Layout title="ศูนย์ตรวจสอบและรับรองผล LO">
            <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                    <button onClick={() => history.back()} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <ArrowLeft className="h-4 w-4" /> กลับหน้าฝ่ายวิชาการ
                    </button>
                    <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">ศูนย์ตรวจสอบและรับรองผล LO</h2>
                    <p className="mt-2 max-w-[70ch] text-base leading-7 text-slate-600">
                        รวมผล LO เดียวกันจากรายวิชา โครงงาน และกิจกรรม เพื่อให้ฝ่ายวิชาการพิจารณาหลักฐานก่อนรับรองผลสุดท้ายของผู้เรียน
                    </p>
                </div>
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-sm text-indigo-950">
                    <div className="flex items-center gap-2 font-extrabold"><ShieldCheck className="h-5 w-5" /> รอบการรับรอง</div>
                    <div className="mt-1">ภาคเรียนที่ {semester}/{academicYear}</div>
                </div>
            </div>

            {loadError ? (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" />
                        <div>
                            <h3 className="font-extrabold text-rose-950">ยังเปิดศูนย์รับรองผลไม่ได้</h3>
                            <p className="mt-1 leading-6 text-rose-800">{loadError}</p>
                            <button onClick={loadApprovalData} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 font-bold text-white hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-700 focus:ring-offset-2">
                                <RotateCcw className="h-4 w-4" /> ลองโหลดอีกครั้ง
                            </button>
                        </div>
                    </div>
                </section>
            ) : (
                <>
                    <section className="mb-6 flex flex-wrap gap-3" aria-label="สรุปสถานะการรับรอง">
                        {[
                            { key: 'pending', label: 'รอรับรอง', value: stats.pending, icon: ClipboardCheck },
                            { key: 'approved', label: 'รับรองแล้ว', value: stats.approved, icon: CheckCircle2 },
                            { key: 'returned', label: 'ส่งกลับแก้ไข', value: stats.returned, icon: RotateCcw },
                        ].map(item => (
                            <button key={item.key} onClick={() => setStatusFilter(item.key)} className={`flex min-h-16 min-w-48 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${statusFilter === item.key ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                <item.icon className="h-6 w-6 text-indigo-600" />
                                <span><span className="block text-2xl font-extrabold text-slate-900">{item.value}</span><span className="text-sm font-semibold text-slate-600">{item.label}</span></span>
                            </button>
                        ))}
                    </section>

                    <section className="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row" aria-label="ตัวกรองคิวรับรองผล">
                        <label className="relative flex-1">
                            <span className="sr-only">ค้นหาผู้เรียนหรือ LO</span>
                            <Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
                            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อ รหัสนักเรียน ห้อง หรือรหัส LO" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                        </label>
                        <label className="relative md:w-72">
                            <span className="sr-only">กรองตาม LO</span>
                            <Filter className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-500" />
                            <select value={loFilter} onChange={event => setLoFilter(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                <option value="all">ทุกผลลัพธ์การเรียนรู้</option>
                                {loOptions.map(lo => <option key={lo.lo_id} value={lo.lo_id}>{lo.lo_code || `LO ${lo.ability_no}`} — {lo.competency_area || 'ทั่วไป'}</option>)}
                            </select>
                        </label>
                        <button onClick={() => setStatusFilter('all')} className="min-h-12 rounded-xl border border-slate-300 px-4 font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">ดูทุกสถานะ</button>
                    </section>

                    <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.4fr)]">
                        <section aria-label="รายการรอตรวจสอบ">
                            {loading ? <LoadingState /> : filteredGroups.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
                                    <ClipboardCheck className="mx-auto h-12 w-12 text-slate-300" />
                                    <h3 className="mt-4 text-lg font-extrabold text-slate-800">ไม่พบรายการในตัวกรองนี้</h3>
                                    <p className="mt-1 text-slate-600">ลองเปลี่ยนสถานะ LO หรือคำค้นหา</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredGroups.map(group => {
                                        const status = group.decision?.decision_status || 'pending';
                                        const meta = statusMeta[status] || statusMeta.pending;
                                        const selectedRow = selectedKey === group.key;
                                        return (
                                            <button key={group.key} onClick={() => setSelectedKey(group.key)} className={`w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${selectedRow ? 'border-indigo-400 bg-indigo-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="truncate font-extrabold text-slate-900">{fullName(group.student)}</p>
                                                        <p className="mt-0.5 text-sm text-slate-600">{group.student.student_code} · {group.student.current_room || group.student.current_grade_level || '-'}</p>
                                                    </div>
                                                    <ChevronRight className={`mt-1 h-5 w-5 shrink-0 ${selectedRow ? 'text-indigo-600' : 'text-slate-400'}`} />
                                                </div>
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-extrabold text-slate-700">{group.lo.lo_code || `LO ${group.lo.ability_no}`}</span>
                                                    <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${meta.className}`}>{meta.label}</span>
                                                    <span className="text-xs font-semibold text-slate-600">{group.sources.length} แหล่งหลักฐาน</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        <section className="min-h-[560px] rounded-2xl border border-slate-200 bg-white" aria-label="รายละเอียดการรับรองผล">
                            {!selected ? (
                                <div className="flex min-h-[560px] items-center justify-center p-8 text-center text-slate-600">เลือกรายการทางซ้ายเพื่อพิจารณาหลักฐาน</div>
                            ) : (
                                <div>
                                    <header className="border-b border-slate-200 p-6">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><UserRound className="h-4 w-4" /> ผู้เรียนรายบุคคล</div>
                                                <h3 className="mt-1 text-2xl font-extrabold text-slate-900">{fullName(selected.student)}</h3>
                                                <p className="mt-1 text-slate-600">{selected.student.student_code} · {selected.student.current_room || selected.student.current_grade_level || '-'}</p>
                                            </div>
                                            <span className="w-fit rounded-xl bg-indigo-600 px-3 py-2 text-sm font-extrabold text-white">{selected.lo.lo_code || `LO ${selected.lo.ability_no}`}</span>
                                        </div>
                                        <p className="mt-5 max-w-[70ch] text-base font-semibold leading-7 text-slate-800">{selected.lo.lo_description}</p>
                                        <p className="mt-1 text-sm text-slate-600">ด้านความสามารถ: {selected.lo.competency_area || 'ไม่ระบุ'}</p>
                                    </header>

                                    <div className="p-6">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <h4 className="font-extrabold text-slate-900">หลักฐานจากทุกบริบท</h4>
                                            <span className="text-sm font-bold text-slate-600">ระบบแนะนำ: <strong className="text-indigo-700">{selected.recommended_level || 'ยังไม่มีข้อมูลพอ'}</strong></span>
                                        </div>
                                        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
                                            {selected.sources.map((source, index) => (
                                                <article key={`${source.source_type}-${source.source_id}-${index}`} className="p-4">
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="flex gap-3">
                                                            <div className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-700">{source.source_type === 'subject' ? <BookOpen className="h-5 w-5" /> : <FolderKanban className="h-5 w-5" />}</div>
                                                            <div>
                                                                <h5 className="font-extrabold text-slate-900">{sourceLabel(source)}</h5>
                                                                <p className="mt-1 max-w-[58ch] text-sm leading-6 text-slate-600">{source.evidence_note || 'ครูยังไม่ได้บันทึกหลักฐานเชิงคุณภาพ'}</p>
                                                            </div>
                                                        </div>
                                                        <span className="w-fit rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-extrabold text-slate-800">{source.competency_level || 'ยังไม่ประเมิน'}</span>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>

                                        <div className="mt-6 grid gap-5 md:grid-cols-[220px_1fr]">
                                            <label>
                                                <span className="mb-2 block text-sm font-extrabold text-slate-800">ระดับความสามารถสุดท้าย</span>
                                                <select value={decisionLevel} onChange={event => setDecisionLevel(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 font-bold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                                                    <option value="">เลือกระดับ</option>
                                                    {LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                                                </select>
                                            </label>
                                            <label>
                                                <span className="mb-2 block text-sm font-extrabold text-slate-800">เหตุผลและหลักฐานประกอบการตัดสิน</span>
                                                <textarea value={decisionReason} onChange={event => setDecisionReason(event.target.value)} rows="4" placeholder="สรุปเหตุผลที่เลือกระดับนี้ หรือระบุสิ่งที่ต้องการให้ครูเพิ่มเติม" className="w-full resize-y rounded-xl border border-slate-300 px-4 py-3 leading-6 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                                            </label>
                                        </div>

                                        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                            <button onClick={() => saveDecision('returned')} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-5 font-extrabold text-rose-800 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-600 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> ส่งกลับให้ครูแก้ไข</button>
                                            <button onClick={() => saveDecision('approved')} disabled={saving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-extrabold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />} รับรองผลสุดท้าย</button>
                                        </div>
                                        <p className="mt-4 flex items-center justify-end gap-2 text-xs text-slate-500"><History className="h-4 w-4" /> การรับรองและการส่งกลับจะถูกบันทึกในประวัติการใช้งาน</p>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </>
            )}
        </Layout>
    );
}
