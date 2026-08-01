import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, ClipboardCheck, FileText, Filter, RotateCcw, Save, Search, ShieldCheck, UserRound, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { formalLevelLabel } from '../lib/terminology';
import { isReviewableWorkflow } from '../lib/evaluationProgress';

const LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'];
const LEVEL_CLASS = {
    เริ่มต้น: 'border-amber-300 bg-amber-50 text-amber-900',
    พัฒนา: 'border-sky-300 bg-sky-50 text-sky-900',
    ชำนาญ: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    เชี่ยวชาญ: 'border-violet-300 bg-violet-50 text-violet-900',
    'N/A': 'border-slate-300 bg-slate-100 text-slate-700',
};
const STATUS = {
    pending: { label: 'รอตรวจรับรอง', className: 'border-amber-200 bg-amber-50 text-amber-800' },
    approved: { label: 'รับรองแล้ว', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    returned: { label: 'ส่งกลับแก้ไข', className: 'border-rose-200 bg-rose-50 text-rose-800' },
};

const fullName = student => student
    ? `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim()
    : 'ไม่พบข้อมูลผู้เรียน';

const consensusLevel = sources => {
    const levels = [...new Set(sources.map(source => source.competency_level).filter(Boolean))];
    return levels.length === 1 ? levels[0] : '';
};
const AUTO_APPROVAL_REASON = 'รับรองตามผลสรุปรายด้านของครูผู้สอน';

export default function AcademicApprovalCenter() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [entries, setEntries] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [localDecisions, setLocalDecisions] = useState({});
    const [gradeFilter, setGradeFilter] = useState('all');
    const [roomFilter, setRoomFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState('');
    const [loadError, setLoadError] = useState('');

    const loadApprovalData = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        try {
            const [students, subjects, contexts, los, decisions] = await Promise.all([
                fetchAllRows((from, to) => supabase.from('users_students')
                    .select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room, student_status')
                    .eq('school_id', currentUser.school_id).range(from, to)),
                fetchAllRows((from, to) => supabase.from('subjects')
                    .select('subject_id, subject_name, grade_level, academic_year, semester')
                    .eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).range(from, to)),
                fetchAllRows((from, to) => supabase.from('learning_contexts')
                    .select('context_id, context_name, context_type')
                    .eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).range(from, to)),
                fetchAllRows((from, to) => supabase.from('learning_outcomes')
                    .select('lo_id, lo_code, ability_no, competency_area, lo_description, grade_level')
                    .eq('school_id', currentUser.school_id).range(from, to)),
                fetchAllRows((from, to) => supabase.from('competency_area_final_decisions')
                    .select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).range(from, to)),
            ]);

            const subjectIds = subjects.map(subject => subject.subject_id);
            const contextIds = contexts.map(context => context.context_id);
            const enrollments = await fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('student_enrollments')
                .select('enrollment_id, student_id, subject_id, room').in('subject_id', batch).eq('enrollment_status', 'active').range(from, to));
            const enrollmentIds = enrollments.map(enrollment => enrollment.enrollment_id);
            const [areaEvaluations, loEvaluations, contextEvaluations] = await Promise.all([
                fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('competency_area_evaluations')
                    .select('id, enrollment_id, competency_area, competency_level, qualitative_summary, workflow_status, submitted_at')
                    .in('enrollment_id', batch).range(from, to)),
                fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('lo_evaluations')
                    .select('evaluation_id, enrollment_id, lo_id, evidence_note, workflow_status, submitted_at')
                    .in('enrollment_id', batch).range(from, to)),
                fetchAllByIn(contextIds, (batch, from, to) => supabase.from('learning_context_evaluations')
                    .select('context_evaluation_id, context_id, student_id, lo_id, evidence_note, workflow_status, submitted_at')
                    .in('context_id', batch).range(from, to)),
            ]);

            const studentMap = new Map(students.filter(student => student.student_status === 'active').map(student => [student.student_id, student]));
            const subjectMap = new Map(subjects.map(subject => [subject.subject_id, subject]));
            const contextMap = new Map(contexts.map(context => [context.context_id, context]));
            const enrollmentMap = new Map(enrollments.map(enrollment => [enrollment.enrollment_id, enrollment]));
            const loMap = new Map(los.map(lo => [lo.lo_id, lo]));
            const decisionMap = new Map(decisions.map(decision => [`${decision.student_id}:${decision.competency_area}`, decision]));
            const grouped = new Map();

            const ensureEntry = (studentId, area) => {
                const student = studentMap.get(studentId);
                if (!student || !area) return null;
                const key = `${studentId}:${area}`;
                if (!grouped.has(key)) grouped.set(key, {
                    key,
                    student,
                    competency_area: area,
                    formative_sources: [],
                    evidence: [],
                    decision: decisionMap.get(key) || null,
                });
                return grouped.get(key);
            };

            areaEvaluations.forEach(evaluation => {
                if (!isReviewableWorkflow(evaluation.workflow_status)) return;
                const enrollment = enrollmentMap.get(evaluation.enrollment_id);
                const subject = enrollment ? subjectMap.get(enrollment.subject_id) : null;
                const entry = enrollment ? ensureEntry(enrollment.student_id, evaluation.competency_area) : null;
                if (!entry) return;
                entry.formative_sources.push({
                    ...evaluation,
                    subject_name: subject?.subject_name || 'รายวิชา',
                    room: enrollment.room,
                });
            });

            loEvaluations.forEach(evaluation => {
                if (!evaluation.evidence_note?.trim()) return;
                if (!isReviewableWorkflow(evaluation.workflow_status)) return;
                const enrollment = enrollmentMap.get(evaluation.enrollment_id);
                const subject = enrollment ? subjectMap.get(enrollment.subject_id) : null;
                const lo = loMap.get(evaluation.lo_id);
                const entry = enrollment && lo ? ensureEntry(enrollment.student_id, lo.competency_area) : null;
                if (!entry) return;
                entry.evidence.push({
                    id: evaluation.evaluation_id,
                    source_table: 'lo_evaluations',
                    source_name: subject?.subject_name || 'รายวิชา',
                    lo,
                    evidence_note: evaluation.evidence_note,
                    workflow_status: evaluation.workflow_status || 'draft',
                });
            });

            contextEvaluations.forEach(evaluation => {
                if (!evaluation.evidence_note?.trim()) return;
                if (!isReviewableWorkflow(evaluation.workflow_status)) return;
                const lo = loMap.get(evaluation.lo_id);
                const context = contextMap.get(evaluation.context_id);
                const entry = lo ? ensureEntry(evaluation.student_id, lo.competency_area) : null;
                if (!entry) return;
                entry.evidence.push({
                    id: evaluation.context_evaluation_id,
                    source_table: 'learning_context_evaluations',
                    source_name: context?.context_name || 'รูปแบบการเรียนรู้',
                    lo,
                    evidence_note: evaluation.evidence_note,
                    workflow_status: evaluation.workflow_status || 'draft',
                });
            });

            const result = [...grouped.values()].sort((left, right) =>
                (left.student.current_room || '').localeCompare(right.student.current_room || '', 'th')
                || (left.student.student_code || '').localeCompare(right.student.student_code || '', 'th')
                || left.competency_area.localeCompare(right.competency_area, 'th'));
            const initial = {};
            result.forEach(entry => {
                initial[entry.key] = {
                    level: entry.decision?.final_level || consensusLevel(entry.formative_sources),
                    reason: entry.decision?.decision_reason || '',
                };
            });
            setEntries(result);
            setLocalDecisions(initial);
            setSelectedStudentId(current => result.some(entry => entry.student.student_id === current)
                ? current
                : result[0]?.student.student_id || '');
        } catch (error) {
            setLoadError(error.message?.includes('competency_area_final_decisions')
                ? 'ยังไม่ได้ติดตั้งตารางรับรองผลรายด้าน กรุณารัน update_schema_formative_pipeline.sql ก่อนเปิดหน้านี้'
                : (error.message || 'ไม่สามารถโหลดข้อมูลรับรองผลได้'));
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => { loadApprovalData(); }, [loadApprovalData]);

    const students = useMemo(() => {
        const map = new Map();
        entries.forEach(entry => {
            const current = map.get(entry.student.student_id) || { student: entry.student, entries: [] };
            current.entries.push(entry);
            map.set(entry.student.student_id, current);
        });
        return [...map.values()];
    }, [entries]);
    const grades = useMemo(() => [...new Set(students.map(item => item.student.current_grade_level).filter(Boolean))].sort(), [students]);
    const rooms = useMemo(() => [...new Set(students
        .filter(item => gradeFilter === 'all' || item.student.current_grade_level === gradeFilter)
        .map(item => item.student.current_room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [gradeFilter, students]);
    const filteredStudents = useMemo(() => students.filter(item => {
        const normalized = query.trim().toLowerCase();
        const statusMatch = statusFilter === 'all' || item.entries.some(entry => (entry.decision?.decision_status || 'pending') === statusFilter);
        return (gradeFilter === 'all' || item.student.current_grade_level === gradeFilter)
            && (roomFilter === 'all' || item.student.current_room === roomFilter)
            && statusMatch
            && (!normalized || `${item.student.student_code || ''} ${fullName(item.student)}`.toLowerCase().includes(normalized));
    }), [gradeFilter, query, roomFilter, statusFilter, students]);
    const selected = students.find(item => item.student.student_id === selectedStudentId) || null;
    const totalAreas = entries.length;
    const approvedAreas = entries.filter(entry => entry.decision?.decision_status === 'approved').length;
    const percent = totalAreas ? Math.round((approvedAreas / totalAreas) * 100) : 0;

    useEffect(() => {
        if (!loading && filteredStudents.length && !filteredStudents.some(item => item.student.student_id === selectedStudentId)) {
            setSelectedStudentId(filteredStudents[0].student.student_id);
        }
    }, [filteredStudents, loading, selectedStudentId]);

    const updateLocal = (key, field, value) => setLocalDecisions(previous => ({
        ...previous,
        [key]: { ...previous[key], [field]: value },
    }));

    const saveDecision = async (entry, decisionStatus) => {
        const local = localDecisions[entry.key] || {};
        const teacherLevel = consensusLevel(entry.formative_sources);
        const needsManualReason = decisionStatus === 'returned' || !teacherLevel || local.level !== teacherLevel;
        if (decisionStatus === 'approved' && !entry.formative_sources.length) return toast.error('ยังรับรองไม่ได้ เพราะครูยังไม่ได้ส่งผล Formative รายด้านนี้');
        if (!local.level) return toast.error('กรุณาเลือกระดับความสามารถ');
        if (needsManualReason && !local.reason?.trim()) return toast.error(decisionStatus === 'returned' ? 'กรุณาระบุสิ่งที่ต้องการให้ครูแก้ไข' : 'กรุณาระบุเหตุผลเมื่อผลที่รับรองต่างจากผลของครู');
        setSavingKey(entry.key);
        try {
            const now = new Date().toISOString();
            const passed = ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(local.level);
            const { error } = await supabase.from('competency_area_final_decisions').upsert({
                school_id: currentUser.school_id,
                student_id: entry.student.student_id,
                competency_area: entry.competency_area,
                academic_year: academicYear,
                semester,
                final_level: local.level,
                pass_status: local.level === 'N/A' ? 'pending' : passed ? 'passed' : 'not_passed',
                decision_status: decisionStatus,
                decision_reason: local.reason?.trim() || AUTO_APPROVAL_REASON,
                decided_by: currentUser.teacher_id || currentUser.id,
                decided_at: now,
                is_locked: decisionStatus === 'approved',
                updated_at: now,
            }, { onConflict: 'student_id,competency_area,academic_year,semester' });
            if (error) throw error;

            const nextWorkflow = decisionStatus === 'approved' ? 'approved' : 'returned';
            const areaIds = entry.formative_sources.map(source => source.id);
            if (areaIds.length) {
                const result = await supabase.from('competency_area_evaluations')
                    .update({ workflow_status: nextWorkflow, reviewed_at: now, updated_at: now }).in('id', areaIds);
                if (result.error) throw result.error;
            }
            for (const table of ['lo_evaluations', 'learning_context_evaluations']) {
                const idColumn = table === 'lo_evaluations' ? 'evaluation_id' : 'context_evaluation_id';
                const ids = entry.evidence.filter(item => item.source_table === table).map(item => item.id);
                if (!ids.length) continue;
                const result = await supabase.from(table).update({ workflow_status: nextWorkflow, updated_at: now }).in(idColumn, ids);
                if (result.error) throw result.error;
            }
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: decisionStatus === 'approved' ? 'approve_competency_area' : 'return_competency_area',
                entity_type: 'competency_area_final_decision',
                detail: { student_id: entry.student.student_id, competency_area: entry.competency_area, final_level: local.level, evidence_count: entry.evidence.length },
            });
            toast.success(decisionStatus === 'approved' ? 'รับรองผลรายด้านแล้ว' : 'ส่งกลับให้ครูแก้ไขแล้ว');
            await loadApprovalData();
        } catch (error) {
            toast.error('บันทึกการรับรองไม่สำเร็จ: ' + error.message);
        } finally {
            setSavingKey('');
        }
    };

    const bulkApprove = async targetEntries => {
        const eligible = targetEntries.filter(entry =>
            entry.decision?.decision_status !== 'approved'
            && entry.formative_sources.length
            && consensusLevel(entry.formative_sources));
        if (!eligible.length) return toast.error('ไม่มีรายการที่ผลครูตรงกันและพร้อมรับรอง');
        if (!window.confirm(`ยืนยันรับรองตามผลครู ${eligible.length} ด้าน? รายการที่ผลต่างกันจะยังคงไว้ให้ตรวจทีละรายการ`)) return;
        setSavingKey('bulk');
        try {
            const now = new Date().toISOString();
            const actorId = currentUser.teacher_id || currentUser.id;
            const rows = eligible.map(entry => {
                const level = consensusLevel(entry.formative_sources);
                return {
                    school_id: currentUser.school_id,
                    student_id: entry.student.student_id,
                    competency_area: entry.competency_area,
                    academic_year: academicYear,
                    semester,
                    final_level: level,
                    pass_status: level === 'N/A' ? 'pending' : ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(level) ? 'passed' : 'not_passed',
                    decision_status: 'approved',
                    decision_reason: AUTO_APPROVAL_REASON,
                    decided_by: actorId,
                    decided_at: now,
                    is_locked: true,
                    updated_at: now,
                };
            });
            for (let index = 0; index < rows.length; index += 200) {
                const { error } = await supabase.from('competency_area_final_decisions')
                    .upsert(rows.slice(index, index + 200), { onConflict: 'student_id,competency_area,academic_year,semester' });
                if (error) throw error;
            }
            const updateIds = async (table, idColumn, ids) => {
                for (let index = 0; index < ids.length; index += 200) {
                    const { error } = await supabase.from(table)
                        .update({ workflow_status: 'approved', reviewed_at: table === 'competency_area_evaluations' ? now : undefined, updated_at: now })
                        .in(idColumn, ids.slice(index, index + 200));
                    if (error) throw error;
                }
            };
            await updateIds('competency_area_evaluations', 'id', eligible.flatMap(entry => entry.formative_sources.map(source => source.id)));
            await updateIds('lo_evaluations', 'evaluation_id', eligible.flatMap(entry => entry.evidence.filter(item => item.source_table === 'lo_evaluations').map(item => item.id)));
            await updateIds('learning_context_evaluations', 'context_evaluation_id', eligible.flatMap(entry => entry.evidence.filter(item => item.source_table === 'learning_context_evaluations').map(item => item.id)));
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: actorId,
                actor_role: currentUser.role,
                action: 'bulk_approve_competency_areas',
                entity_type: 'competency_area_final_decision',
                detail: { approved_count: eligible.length, reason: AUTO_APPROVAL_REASON },
            });
            toast.success(`รับรองตามผลครูแล้ว ${eligible.length} ด้าน`);
            await loadApprovalData();
        } catch (error) {
            toast.error('รับรองหลายรายการไม่สำเร็จ: ' + error.message);
        } finally {
            setSavingKey('');
        }
    };

    return (
        <Layout title="ศูนย์รับรองผลรายด้านความสามารถ">
            <div className="mx-auto max-w-[1680px] space-y-5 pb-12">
                <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div><div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-blue-700" /><h1 className="text-2xl font-extrabold text-slate-950">รับรองผลเป็นรายด้านความสามารถ</h1></div><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">ระบบเติมผลสรุปของครูให้แล้ว กดรับรองได้ทันทีเมื่อเห็นตรงกัน และระบุเหตุผลเฉพาะเมื่อแก้ผลหรือส่งกลับ</p></div>
                        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col"><div className="min-w-64 rounded-xl bg-slate-100 px-4 py-3"><div className="flex justify-between text-sm font-bold text-slate-700"><span>รับรองผลรายด้านแล้ว</span><span>{approvedAreas}/{totalAreas} ด้าน</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="action-success h-full rounded-full" style={{ width: `${percent}%` }} /></div></div><button type="button" onClick={() => bulkApprove(filteredStudents.flatMap(item => item.entries))} disabled={savingKey === 'bulk' || loading} className="action-success min-h-11 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50">{savingKey === 'bulk' ? 'กำลังรับรอง...' : 'รับรองผลที่ตรงกับครูทั้งหมด'}</button></div>
                    </div>
                </header>

                {loadError && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert"><div className="flex gap-3"><AlertCircle className="h-5 w-5 shrink-0 text-rose-700" /><div><h2 className="font-extrabold text-rose-950">เปิดศูนย์รับรองผลไม่ได้</h2><p className="mt-1 text-sm text-rose-800">{loadError}</p><button onClick={loadApprovalData} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-bold text-white"><RotateCcw className="h-4 w-4" />ลองใหม่</button></div></div></section>}

                <section className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="ตัวกรอง">
                    <span className="flex items-center gap-2 text-sm font-extrabold text-slate-700"><Filter className="h-4 w-4 text-indigo-700" />กรองผู้เรียน</span>
                    <select aria-label="กรองตามระดับชั้น" value={gradeFilter} onChange={event => { setGradeFilter(event.target.value); setRoomFilter('all'); }} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="all">ทุกระดับชั้น</option>{grades.map(grade => <option key={grade}>{grade}</option>)}</select>
                    <select aria-label="กรองตามห้องเรียน" value={roomFilter} onChange={event => setRoomFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="all">ทุกห้อง</option>{rooms.map(room => <option key={room}>{room}</option>)}</select>
                    <select aria-label="กรองตามสถานะการรับรอง" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="all">ทุกสถานะ</option><option value="pending">รอตรวจรับรอง</option><option value="returned">ส่งกลับแก้ไข</option><option value="approved">รับรองแล้ว</option></select>
                    <label className="relative min-w-60 flex-1"><span className="sr-only">ค้นหาชื่อหรือรหัสนักเรียน</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือรหัสนักเรียน" className="min-h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm placeholder:text-slate-600" /></label>
                </section>

                <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 py-3"><h2 className="font-extrabold text-slate-900">ผู้เรียน {filteredStudents.length} คน</h2></div><div className="max-h-[760px] divide-y divide-slate-100 overflow-y-auto">{loading ? <div className="h-64 animate-pulse bg-slate-100" /> : filteredStudents.length ? filteredStudents.map(item => { const approved = item.entries.filter(entry => entry.decision?.decision_status === 'approved').length; return <button key={item.student.student_id} onClick={() => setSelectedStudentId(item.student.student_id)} className={`flex w-full items-center gap-3 p-4 text-left ${selectedStudentId === item.student.student_id ? 'surface-selected' : 'hover:bg-slate-50'}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><UserRound className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-950">{fullName(item.student)}</strong><span className="mt-1 block text-xs text-slate-500">{item.student.student_code || '-'} · {item.student.current_room || '-'}</span></span><span className="text-xs font-extrabold text-slate-600">{approved}/{item.entries.length}</span><ChevronRight className="h-4 w-4 text-slate-300" /></button>; }) : <div className="p-10 text-center text-sm text-slate-500"><Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />ไม่พบผลสรุปรายด้านตามตัวกรอง</div>}</div></aside>

                    <main className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{!selected ? <div className="p-16 text-center text-slate-500"><ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" />เลือกผู้เรียนเพื่อพิจารณาผลรายด้าน</div> : <><header className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-extrabold text-slate-950">{fullName(selected.student)}</h2><p className="mt-1 text-sm text-slate-600">{selected.student.current_grade_level || '-'} · ห้อง {selected.student.current_room || '-'} · {selected.entries.length} ด้านความสามารถ</p></div><button type="button" onClick={() => bulkApprove(selected.entries)} disabled={savingKey === 'bulk'} className="surface-success min-h-11 rounded-xl border border-emerald-300 px-4 text-sm font-extrabold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50">รับรองตามผลครูทุกด้านของคนนี้</button></header><div className="divide-y divide-slate-200">{selected.entries.map(entry => { const local = localDecisions[entry.key] || {}; const status = STATUS[entry.decision?.decision_status || 'pending']; const sourceLevels = [...new Set(entry.formative_sources.map(source => source.competency_level).filter(Boolean))]; const teacherLevel = consensusLevel(entry.formative_sources); const needsReason = !teacherLevel || local.level !== teacherLevel; return <article key={entry.key} className="space-y-5 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-extrabold text-slate-950">{entry.competency_area}</h3><p className="mt-1 text-sm text-slate-600">ผลสรุปรายด้านจากครู {entry.formative_sources.length} รายการ · หลักฐาน LO {entry.evidence.length} ข้อความ</p></div><span className={`w-fit rounded-lg border px-2.5 py-1 text-xs font-extrabold ${status.className}`}>{status.label}</span></div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h4 className="text-xs font-extrabold text-slate-700">ผลสรุปรายด้านที่ครูส่งมา</h4>{entry.formative_sources.length ? <div className="mt-3 space-y-2">{entry.formative_sources.map(source => <div key={source.id} className="flex flex-col gap-1 rounded-lg bg-white px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-bold text-slate-800">{source.subject_name}{source.room ? ` · ${source.room}` : ''}</span><span className={`w-fit rounded-lg border px-2 py-1 text-xs font-extrabold ${LEVEL_CLASS[source.competency_level] || LEVEL_CLASS['N/A']}`}>{source.competency_level ? formalLevelLabel(source.competency_level) : 'ยังไม่ตัดสินระดับ'}</span>{source.qualitative_summary && <span className="text-xs text-slate-600 sm:max-w-md">{source.qualitative_summary}</span>}</div>)}</div> : <p className="mt-2 text-sm text-amber-800">ยังไม่มีผลสรุปรายด้านจากครู</p>}{sourceLevels.length > 1 && <p className="mt-3 text-xs font-bold text-amber-800">ผลจากแต่ละวิชาแตกต่างกัน ฝ่ายวิชาการต้องอ่านหลักฐานและตัดสินโดยไม่เฉลี่ยอัตโนมัติ</p>}</div>
                        <details className="rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-extrabold text-indigo-800"><FileText className="mr-2 inline h-4 w-4" />เปิดอ่านข้อความพฤติกรรมราย LO ({entry.evidence.length})</summary><div className="divide-y divide-slate-100 border-t border-slate-200">{entry.evidence.length ? entry.evidence.map(item => <div key={`${item.source_table}:${item.id}`} className="p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{item.lo.lo_code || `LO ${item.lo.ability_no || '-'}`}</span><span className="text-xs font-bold text-slate-500">{item.source_name}</span></div><p className="mt-2 text-sm leading-6 text-slate-800">{item.evidence_note}</p></div>) : <p className="p-4 text-sm text-slate-500">ยังไม่มีข้อความหลักฐาน</p>}</div></details>
                        <div><h4 className="text-xs font-extrabold text-slate-700">ผลที่ฝ่ายวิชาการรับรอง *</h4><div className="mt-2 flex flex-wrap gap-2">{LEVELS.map(level => <button key={level} type="button" onClick={() => updateLocal(entry.key, 'level', level)} className={`min-h-11 rounded-xl border px-3 text-sm font-extrabold ${local.level === level ? `${LEVEL_CLASS[level]} ring-2 ring-indigo-500` : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>{formalLevelLabel(level)}</button>)}</div>{teacherLevel && local.level === teacherLevel && <p className="mt-2 text-xs font-bold text-emerald-800">ตรงกับผลของครู กดรับรองได้ทันที</p>}</div>
                        <label className="block"><span className="text-xs font-extrabold text-slate-700">เหตุผลหรือคำแนะนำ {needsReason ? '(ต้องกรอกเมื่อแก้ผลหรือส่งกลับ)' : '(ไม่ต้องกรอกเมื่อรับรองตามครู)'}</span><textarea rows="3" value={local.reason || ''} onChange={event => updateLocal(entry.key, 'reason', event.target.value)} placeholder={needsReason ? 'อธิบายเหตุผลที่แก้ผล หรือสิ่งที่ต้องการให้ครูแก้ไข' : AUTO_APPROVAL_REASON} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm leading-6 placeholder:text-slate-600" /></label>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button onClick={() => saveDecision(entry, 'returned')} disabled={savingKey === entry.key} className="min-h-11 rounded-xl border border-rose-300 bg-white px-4 text-sm font-extrabold text-rose-800 disabled:opacity-50">ส่งกลับแก้ไข</button><button onClick={() => saveDecision(entry, 'approved')} disabled={savingKey === entry.key || !entry.formative_sources.length || !local.level || (needsReason && !local.reason?.trim())} title={!entry.formative_sources.length ? 'รอครูส่งผลสรุปรายด้านก่อน' : undefined} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-extrabold text-white disabled:opacity-40"><Save className="h-4 w-4" />{savingKey === entry.key ? 'กำลังบันทึก...' : 'ยืนยันรับรองผลรายด้าน'}</button></div>
                    </article>; })}</div></>}</main>
                </div>
            </div>
        </Layout>
    );
}
