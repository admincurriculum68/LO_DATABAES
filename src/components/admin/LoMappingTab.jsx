import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ListChecks, RefreshCw, Save, Search, Sparkles, Table2, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAllByIn, fetchAllRows, supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useAcademic } from '../../AcademicContext';
import { useDialog } from '../../lib/dialogContext';
import {
    areaSelectionState, diffMapping, gradesOf, groupLearningOutcomesByArea, learningOutcomesForGrade,
    sameSelection, shortAreaName, sortSubjectsForMapping, suggestAreasForSubject, toggleArea,
} from '../../lib/loMapping';

// กำหนด LO ของวิชา
// โรงเรียนจริงมีวิชาเป็นร้อยและ LO ชั้นละ 30–50 ข้อ จึงมีสองมุมมอง
//   ตารางรายชั้น: ติ๊กเป็นรายด้าน ระบบช่วยเลือกด้านจากชื่อวิชา ทำทั้งชั้นในหน้าเดียว
//   รายวิชา: เลือกรายข้อเมื่อวิชาใช้ไม่ครบทุกข้อของด้าน
// สิ่งที่ติ๊กแล้วยังไม่บันทึกเก็บแยกตามวิชา เปลี่ยนวิชาหรือเปลี่ยนชั้นแล้วไม่หาย และกู้คืนได้ถ้าเผลอออกจากหน้า

const EMPTY = new Set();
const draftKey = (schoolId, year, semester) => `loMappingDraft:${schoolId}:${year}:${semester}`;
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

function AreaCheckbox({ state, label, onChange }) {
    const ref = useRef(null);
    // สถานะ "บางข้อ" ต้องตั้งผ่าน property เท่านั้น HTML ไม่มี attribute นี้
    useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
    return <input ref={ref} type="checkbox" checked={state === 'all'} onChange={onChange} aria-label={label} className="h-5 w-5 cursor-pointer accent-indigo-700" />;
}

function StatusChip({ savedCount, draftCount, dirty }) {
    if (dirty) return <span className="chip chip-warning">ยังไม่บันทึก · {draftCount} LO</span>;
    if (savedCount) return <span className="chip chip-success">✓ {savedCount} LO</span>;
    return <span className="chip chip-neutral">ยังไม่กำหนด</span>;
}

export default function LoMappingTab() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const dialog = useDialog();
    const [subjects, setSubjects] = useState([]);
    const [learningOutcomes, setLearningOutcomes] = useState([]);
    const [saved, setSaved] = useState(new Map());
    const [drafts, setDrafts] = useState(new Map());
    const [suggestedIds, setSuggestedIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState('grade');
    const [grade, setGrade] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [loQuery, setLoQuery] = useState('');
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
    const restoredRef = useRef(false);
    const storageKey = draftKey(currentUser?.school_id, academicYear, semester);

    const load = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        try {
            const [subjectResult, loRows] = await Promise.all([
                supabase.from('subjects').select('subject_id, subject_name, grade_level')
                    .eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
                fetchAllRows((from, to) => supabase.from('learning_outcomes')
                    .select('lo_id, lo_code, ability_no, competency_area, is_custom_competency, lo_description, grade_level')
                    .eq('school_id', currentUser.school_id).range(from, to)),
            ]);
            if (subjectResult.error) throw subjectResult.error;
            const sortedSubjects = sortSubjectsForMapping(subjectResult.data || []);
            const mappings = await fetchAllByIn(sortedSubjects.map(subject => subject.subject_id), (batch, from, to) => supabase
                .from('subject_lo_mapping').select('subject_id, lo_id').in('subject_id', batch).range(from, to));
            const nextSaved = new Map(sortedSubjects.map(subject => [subject.subject_id, new Set()]));
            mappings.forEach(row => nextSaved.get(row.subject_id)?.add(row.lo_id));

            setSubjects(sortedSubjects);
            setLearningOutcomes(loRows || []);
            setSaved(nextSaved);
            const grades = gradesOf(sortedSubjects);
            setGrade(current => (grades.includes(current) ? current : grades[0] || ''));
            setSelectedSubjectId(current => (nextSaved.has(current) ? current : sortedSubjects[0]?.subject_id || ''));

            // กู้สิ่งที่ติ๊กไว้แต่ยังไม่บันทึก ครั้งเดียวต่อการเปิดหน้า
            if (!restoredRef.current) {
                restoredRef.current = true;
                try {
                    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
                    const restored = new Map(Object.entries(stored?.drafts || {})
                        .filter(([id, ids]) => nextSaved.has(id) && !sameSelection(ids, nextSaved.get(id)))
                        .map(([id, ids]) => [id, new Set(ids)]));
                    if (restored.size) {
                        setDrafts(restored);
                        setSuggestedIds(new Set((stored.suggested || []).filter(id => restored.has(id))));
                        toast(`กู้รายการที่ยังไม่บันทึกกลับมา ${restored.size} วิชา`, { icon: '↩️' });
                    }
                } catch { /* เบราว์เซอร์ไม่ให้ใช้ sessionStorage ก็ทำงานต่อได้ */ }
            }
        } catch (error) {
            setLoadError(error.message || 'โหลดข้อมูลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester, storageKey]);

    useEffect(() => { load(); }, [load]);

    const dirtyIds = useMemo(() => [...drafts.keys()].filter(id => !sameSelection(drafts.get(id), saved.get(id))), [drafts, saved]);
    const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);
    const selectionOf = useCallback(id => drafts.get(id) || saved.get(id) || EMPTY, [drafts, saved]);

    useEffect(() => {
        if (!restoredRef.current) return;
        try {
            if (!dirtyIds.length) sessionStorage.removeItem(storageKey);
            else sessionStorage.setItem(storageKey, JSON.stringify({
                drafts: Object.fromEntries(dirtyIds.map(id => [id, [...drafts.get(id)]])),
                suggested: [...suggestedIds].filter(id => dirtySet.has(id)),
            }));
        } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ }
    }, [dirtyIds, dirtySet, drafts, storageKey, suggestedIds]);

    // ปิดแท็บหรือรีเฟรชหน้าขณะมีรายการยังไม่บันทึก ให้เบราว์เซอร์ถามก่อน
    useEffect(() => {
        if (!dirtyIds.length) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirtyIds.length]);

    const setSelection = useCallback((subjectId, next) => {
        setDrafts(previous => {
            const map = new Map(previous);
            if (sameSelection(next, saved.get(subjectId))) map.delete(subjectId);
            else map.set(subjectId, new Set(next));
            return map;
        });
    }, [saved]);

    const completedCount = useMemo(() => subjects.filter(subject => saved.get(subject.subject_id)?.size).length, [saved, subjects]);
    const grades = useMemo(() => gradesOf(subjects), [subjects]);
    const gradeSubjects = useMemo(() => subjects.filter(subject => subject.grade_level === grade), [grade, subjects]);
    const gradeGroups = useMemo(() => groupLearningOutcomesByArea(learningOutcomesForGrade(learningOutcomes, grade)), [grade, learningOutcomes]);

    // วิชาของชั้นนี้ที่ยังไม่มี LO เลย และระบบเดาด้านจากชื่อวิชาได้
    const suggestions = useMemo(() => {
        const areas = gradeGroups.map(group => group.area);
        return gradeSubjects
            .filter(subject => !saved.get(subject.subject_id)?.size && !drafts.has(subject.subject_id))
            .map(subject => ({ subject, areas: suggestAreasForSubject(subject.subject_name, areas) }));
    }, [drafts, gradeGroups, gradeSubjects, saved]);
    const suggestable = suggestions.filter(item => item.areas.length);
    const unsuggestable = suggestions.filter(item => !item.areas.length);

    const applySuggestions = () => {
        const losByArea = new Map(gradeGroups.map(group => [group.area, group.los.map(lo => lo.lo_id)]));
        setDrafts(previous => {
            const map = new Map(previous);
            suggestable.forEach(({ subject, areas }) => map.set(subject.subject_id, new Set(areas.flatMap(area => losByArea.get(area) || []))));
            return map;
        });
        setSuggestedIds(previous => new Set([...previous, ...suggestable.map(item => item.subject.subject_id)]));
        toast.success(`เลือกด้านให้ ${suggestable.length} วิชาแล้ว ตรวจช่องกรอบเส้นประสีเหลืองก่อนกดบันทึก`);
    };

    // นับผลประเมินที่ครูบันทึกไว้แล้วใน LO ที่กำลังจะเอาออก เพื่อเตือนก่อนบันทึก
    const countEvaluationsAtRisk = async plans => {
        const removedBySubject = new Map(plans.map(plan => [plan.subjectId, new Set(plan.toRemove)]));
        const enrollments = await fetchAllByIn([...removedBySubject.keys()], (batch, from, to) => supabase
            .from('student_enrollments').select('enrollment_id, subject_id').in('subject_id', batch).range(from, to));
        const subjectByEnrollment = new Map(enrollments.map(row => [row.enrollment_id, row.subject_id]));
        const evaluations = await fetchAllByIn([...subjectByEnrollment.keys()], (batch, from, to) => supabase
            .from('lo_evaluations').select('enrollment_id, lo_id').in('enrollment_id', batch).range(from, to));
        return evaluations.filter(row => removedBySubject.get(subjectByEnrollment.get(row.enrollment_id))?.has(row.lo_id)).length;
    };

    const saveAll = async () => {
        const ids = dirtyIds;
        if (!ids.length || saving) return;
        setSaving(true);
        try {
            // เทียบกับฐานข้อมูลล่าสุด ไม่ใช่ค่าที่โหลดไว้ตอนเปิดหน้า บันทึกซ้ำหลังเน็ตหลุดจึงไม่เพิ่มซ้ำ
            const current = await fetchAllByIn(ids, (batch, from, to) => supabase
                .from('subject_lo_mapping').select('subject_id, lo_id').in('subject_id', batch).range(from, to));
            const currentBySubject = new Map(ids.map(id => [id, new Set()]));
            current.forEach(row => currentBySubject.get(row.subject_id)?.add(row.lo_id));
            const plans = ids.map(id => ({ subjectId: id, ...diffMapping(currentBySubject.get(id), drafts.get(id)) }));
            const removals = plans.filter(plan => plan.toRemove.length);

            if (removals.length) {
                const evaluated = await countEvaluationsAtRisk(removals);
                if (evaluated > 0) {
                    const confirmed = await dialog.confirm({
                        title: 'เอา LO ที่ครูประเมินแล้วออกจากวิชา',
                        message: `LO ที่จะเอาออกมีผลการประเมินของครูแล้ว ${evaluated.toLocaleString()} รายการ\nผลเดิมยังเก็บอยู่ในระบบ แต่จะไม่แสดงในหน้าประเมินของวิชานั้นจนกว่าจะเลือก LO กลับมา`,
                        confirmLabel: 'เอาออกและบันทึก',
                        cancelLabel: 'กลับไปแก้',
                        tone: 'danger',
                    });
                    if (!confirmed) return;
                }
            }

            // เพิ่มก่อนลบ ถ้าการเพิ่มล้ม LO เดิมของวิชายังอยู่ครบ
            const additions = plans.flatMap(plan => plan.toAdd.map(loId => ({ subject_id: plan.subjectId, lo_id: loId })));
            for (const rows of chunk(additions, 500)) {
                const { error } = await supabase.from('subject_lo_mapping').insert(rows);
                if (error) throw error;
            }
            for (const plan of removals) {
                for (const loIds of chunk(plan.toRemove, 100)) {
                    const { error } = await supabase.from('subject_lo_mapping').delete().eq('subject_id', plan.subjectId).in('lo_id', loIds);
                    if (error) throw error;
                }
            }

            setSaved(previous => {
                const map = new Map(previous);
                ids.forEach(id => map.set(id, new Set(drafts.get(id))));
                return map;
            });
            setDrafts(new Map());
            setSuggestedIds(new Set());
            toast.success(`บันทึก LO ของ ${ids.length} วิชาแล้ว`);
        } catch (error) {
            toast.error(`บันทึกไม่สำเร็จ: ${error.message} รายการที่ติ๊กไว้ยังอยู่ ลองกดบันทึกอีกครั้ง`);
        } finally {
            setSaving(false);
        }
    };

    const discardAll = async () => {
        const confirmed = await dialog.confirm({
            title: 'ยกเลิกการเปลี่ยนแปลง',
            message: `สิ่งที่ติ๊กไว้แต่ยังไม่บันทึกใน ${dirtyIds.length} วิชาจะหายไป LO ที่บันทึกแล้วไม่เปลี่ยน`,
            confirmLabel: 'ยกเลิกการเปลี่ยนแปลง',
            cancelLabel: 'เก็บไว้ก่อน',
            tone: 'danger',
        });
        if (!confirmed) return;
        setDrafts(new Map());
        setSuggestedIds(new Set());
    };

    const openSubject = subjectId => {
        setSelectedSubjectId(subjectId);
        setView('subject');
        setLoQuery('');
        setMobileDetailOpen(true);
    };

    // ── มุมมองรายวิชา ──
    const filteredSubjects = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return subjects.filter(subject => {
            const id = subject.subject_id;
            if (normalized && !`${subject.subject_name} ${subject.grade_level}`.toLowerCase().includes(normalized)) return false;
            if (statusFilter === 'todo') return !saved.get(id)?.size && !dirtySet.has(id);
            if (statusFilter === 'done') return saved.get(id)?.size > 0 && !dirtySet.has(id);
            if (statusFilter === 'dirty') return dirtySet.has(id);
            return true;
        });
    }, [dirtySet, query, saved, statusFilter, subjects]);
    const selectedSubject = subjects.find(subject => subject.subject_id === selectedSubjectId);
    const subjectGroups = useMemo(() => {
        if (!selectedSubject) return [];
        const normalized = loQuery.trim().toLowerCase();
        return groupLearningOutcomesByArea(learningOutcomesForGrade(learningOutcomes, selectedSubject.grade_level))
            .map(group => ({
                ...group,
                visible: normalized ? group.los.filter(lo => `${lo.lo_code || ''} ${lo.lo_description || ''} ${group.area}`.toLowerCase().includes(normalized)) : group.los,
            }))
            .filter(group => group.visible.length);
    }, [learningOutcomes, loQuery, selectedSubject]);

    if (loading) return <div className="flex min-h-72 items-center justify-center" role="status"><div className="loader" aria-label="กำลังโหลดวิชาและ LO" /></div>;
    if (loadError) {
        return (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert">
                <p className="font-bold text-rose-900">โหลดข้อมูลไม่สำเร็จ</p>
                <p className="mt-1 text-sm text-rose-800">{loadError}</p>
                <button type="button" onClick={load} className="btn-secondary mt-3"><RefreshCw className="h-4 w-4" aria-hidden="true" />ลองอีกครั้ง</button>
            </div>
        );
    }
    if (!subjects.length || !learningOutcomes.length) {
        return (
            <div className="rounded-2xl border border-line bg-white p-8 text-center">
                <p className="font-bold text-slate-900">{!subjects.length ? `ยังไม่มีวิชาในภาคเรียนที่ ${semester}/${academicYear}` : 'ยังไม่มี LO ของโรงเรียน'}</p>
                <p className="mt-1 text-sm text-slate-600">นำเข้า{!subjects.length ? 'ข้อมูลวิชา' : 'ผลลัพธ์การเรียนรู้ (LO)'} ในเมนูนำเข้าข้อมูลจากไฟล์ก่อน แล้วค่อยกลับมากำหนด LO ของวิชา</p>
            </div>
        );
    }

    const percent = Math.round((completedCount / subjects.length) * 100);

    return (
        <div className="space-y-5">
            <section className="rounded-2xl border border-line bg-white p-4 sm:p-6" aria-label="ความคืบหน้าและมุมมอง">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">เลือกว่าแต่ละวิชาประเมิน LO ข้อไหน ทำวิชาละครั้ง ใช้กับทุกห้องที่เรียนวิชานั้น</p>
                        <div className="mt-3 flex items-center gap-3">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={subjects.length} aria-valuenow={completedCount} aria-label="วิชาที่กำหนด LO แล้ว">
                                <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${percent}%` }} />
                            </div>
                            <p className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">กำหนดแล้ว {completedCount} จาก {subjects.length} วิชา</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 rounded-xl bg-slate-100 p-1" role="group" aria-label="มุมมอง">
                        <button type="button" aria-pressed={view === 'grade'} onClick={() => setView('grade')} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold ${view === 'grade' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}>
                            <Table2 className="h-4 w-4" aria-hidden="true" />ตารางรายชั้น
                        </button>
                        <button type="button" aria-pressed={view === 'subject'} onClick={() => setView('subject')} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold ${view === 'subject' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-700 hover:text-slate-900'}`}>
                            <ListChecks className="h-4 w-4" aria-hidden="true" />รายวิชา
                        </button>
                    </div>
                </div>
            </section>

            {view === 'grade' && (
                <section className="rounded-2xl border border-line bg-white" aria-labelledby="grade-matrix-title">
                    <div className="border-b border-line p-4 sm:p-6">
                        <h2 id="grade-matrix-title" className="text-lg font-bold text-slate-950">ตารางรายชั้น</h2>
                        <p className="mt-1 text-sm text-slate-600">ติ๊กช่องเพื่อใช้ LO ทุกข้อของด้านนั้นกับวิชา ถ้าวิชาใช้ไม่ครบทุกข้อ กด “เลือกรายข้อ”</p>
                        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="เลือกชั้น">
                            {grades.map(item => {
                                const inGrade = subjects.filter(subject => subject.grade_level === item);
                                const done = inGrade.filter(subject => saved.get(subject.subject_id)?.size).length;
                                const pending = inGrade.some(subject => dirtySet.has(subject.subject_id));
                                return (
                                    <button key={item} type="button" aria-pressed={grade === item} onClick={() => setGrade(item)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold ${grade === item ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}>
                                        {item}
                                        <span className={`tabular-nums ${grade === item ? 'text-indigo-100' : done === inGrade.length ? 'text-emerald-700' : 'text-slate-500'}`}>{done}/{inGrade.length}</span>
                                        {pending && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="มีรายการยังไม่บันทึก" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {(suggestable.length > 0 || unsuggestable.length > 0) && (
                        <div className="border-b border-line bg-indigo-50/60 p-4 sm:px-6">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-start gap-3">
                                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden="true" />
                                    <div className="text-sm text-slate-800">
                                        <p><strong>{grade}</strong> มี {suggestions.length} วิชาที่ยังไม่กำหนด LO{suggestable.length > 0 && <> ระบบเลือกด้านจากชื่อวิชาให้ได้ <strong>{suggestable.length} วิชา</strong></>}</p>
                                        {unsuggestable.length > 0 && <p className="mt-1 text-slate-600">ต้องเลือกด้านเอง: {unsuggestable.map(item => item.subject.subject_name).join(', ')}</p>}
                                    </div>
                                </div>
                                {suggestable.length > 0 && (
                                    <button type="button" onClick={applySuggestions} className="btn-primary shrink-0"><Sparkles className="h-4 w-4" aria-hidden="true" />เลือกด้านตามชื่อวิชา ({suggestable.length} วิชา)</button>
                                )}
                            </div>
                        </div>
                    )}

                    {gradeGroups.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-600">ยังไม่มี LO ของ {grade} นำเข้า LO ของชั้นนี้ก่อน</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-sm">
                                <caption className="sr-only">ด้านความสามารถที่แต่ละวิชาของ {grade} ใช้ประเมิน</caption>
                                <thead className="bg-slate-50 text-slate-700">
                                    <tr>
                                        <th scope="col" className="sticky left-0 z-10 min-w-[9.5rem] border-b border-line bg-slate-50 px-3 py-3 text-left font-bold sm:min-w-[15rem] sm:px-4">วิชา</th>
                                        {gradeGroups.map(group => (
                                            <th key={group.area} scope="col" className="min-w-[5rem] border-b border-line px-1 py-3 text-center align-bottom text-xs font-bold sm:min-w-[6.5rem] sm:px-2">
                                                <span className="block leading-5">{shortAreaName(group.area)}</span>
                                                <span className="mt-0.5 block font-medium text-slate-500">{group.los.length} ข้อ</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {gradeSubjects.map(subject => {
                                        const id = subject.subject_id;
                                        const selection = selectionOf(id);
                                        const dirty = dirtySet.has(id);
                                        const suggested = dirty && suggestedIds.has(id);
                                        const rowTone = dirty ? 'bg-amber-50' : 'bg-white';
                                        return (
                                            <tr key={id} className={`${rowTone} border-b border-line last:border-b-0`}>
                                                <th scope="row" className={`sticky left-0 z-10 ${rowTone} px-3 py-2 text-left align-middle font-normal sm:px-4`}>
                                                    <span className="block font-bold text-slate-900">{subject.subject_name}</span>
                                                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                        <StatusChip savedCount={saved.get(id)?.size || 0} draftCount={selection.size} dirty={dirty} />
                                                        <button type="button" onClick={() => openSubject(id)} className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-bold text-indigo-800 underline-offset-2 hover:bg-indigo-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700">เลือกรายข้อ</button>
                                                    </span>
                                                </th>
                                                {gradeGroups.map(group => {
                                                    const loIds = group.los.map(lo => lo.lo_id);
                                                    const cell = areaSelectionState(loIds, selection);
                                                    const stateLabel = cell.state === 'all' ? 'ใช้ครบทุกข้อ' : cell.state === 'some' ? `ใช้ ${cell.count} จาก ${cell.total} ข้อ` : 'ไม่ใช้';
                                                    return (
                                                        <td key={group.area} className="px-1 py-1 text-center">
                                                            <label className={`mx-auto flex min-h-11 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg ${suggested && cell.state !== 'none' ? 'border-2 border-dashed border-amber-500 bg-amber-100/60' : 'hover:bg-slate-100'}`}>
                                                                <AreaCheckbox state={cell.state} label={`${subject.subject_name} ${shortAreaName(group.area)}: ${stateLabel}`} onChange={() => setSelection(id, toggleArea(selection, loIds))} />
                                                                {cell.state === 'some' && <span className="text-[11px] font-bold leading-none text-slate-700 tabular-nums">{cell.count}/{cell.total}</span>}
                                                            </label>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {gradeSubjects.some(subject => dirtySet.has(subject.subject_id) && suggestedIds.has(subject.subject_id)) && (
                        <p className="flex items-center gap-2 border-t border-line px-4 py-3 text-xs text-slate-700 sm:px-6">
                            <span className="inline-block h-4 w-6 rounded border-2 border-dashed border-amber-500 bg-amber-100/60" aria-hidden="true" />
                            ช่องกรอบเส้นประสีเหลือง คือด้านที่ระบบเลือกให้จากชื่อวิชา ตรวจให้ถูกก่อนกดบันทึก
                        </p>
                    )}
                </section>
            )}

            {view === 'subject' && (
                <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
                    <aside className={`rounded-2xl border border-line bg-white ${mobileDetailOpen ? 'hidden lg:block' : ''}`} aria-label="รายการวิชา">
                        <div className="space-y-2 border-b border-line p-4">
                            <label className="relative block">
                                <span className="sr-only">ค้นหาวิชา</span>
                                <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" aria-hidden="true" />
                                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อวิชาหรือชั้น" className="min-h-11 w-full rounded-xl border border-field bg-white pl-10 pr-3 text-sm placeholder:text-slate-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            </label>
                            <select aria-label="กรองตามสถานะ" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-field bg-white px-3 text-sm font-bold text-slate-800">
                                <option value="all">ทุกวิชา ({subjects.length})</option>
                                <option value="todo">ยังไม่กำหนด ({subjects.filter(subject => !saved.get(subject.subject_id)?.size && !dirtySet.has(subject.subject_id)).length})</option>
                                <option value="dirty">ยังไม่บันทึก ({dirtyIds.length})</option>
                                <option value="done">กำหนดแล้ว ({subjects.filter(subject => saved.get(subject.subject_id)?.size && !dirtySet.has(subject.subject_id)).length})</option>
                            </select>
                        </div>
                        <div className="max-h-[36rem] overflow-y-auto">
                            {filteredSubjects.length === 0 && <p className="p-6 text-center text-sm text-slate-600">ไม่พบวิชาที่ตรงกับที่ค้นหา</p>}
                            {gradesOf(filteredSubjects).map(item => (
                                <div key={item}>
                                    <h3 className="sticky top-0 z-10 border-b border-line bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700">{item}</h3>
                                    <ul className="divide-y divide-line">
                                        {filteredSubjects.filter(subject => subject.grade_level === item).map(subject => {
                                            const id = subject.subject_id;
                                            const active = id === selectedSubjectId;
                                            return (
                                                <li key={id}>
                                                    <button type="button" aria-current={active ? 'true' : undefined} onClick={() => openSubject(id)} className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left ${active ? 'surface-selected' : 'hover:bg-slate-50'}`}>
                                                        <span className={`min-w-0 text-sm ${active ? 'font-bold text-indigo-950' : 'font-semibold text-slate-900'}`}>{subject.subject_name}</span>
                                                        <StatusChip savedCount={saved.get(id)?.size || 0} draftCount={selectionOf(id).size} dirty={dirtySet.has(id)} />
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </aside>

                    <section className={`min-w-0 rounded-2xl border border-line bg-white ${mobileDetailOpen ? '' : 'hidden lg:block'}`} aria-labelledby="subject-lo-title">
                        {!selectedSubject ? (
                            <p className="p-10 text-center text-sm text-slate-600">เลือกวิชาจากรายการด้านซ้าย</p>
                        ) : (
                            <>
                                <div className="border-b border-line p-4 sm:p-6">
                                    <button type="button" onClick={() => setMobileDetailOpen(false)} className="btn-ghost mb-2 lg:hidden"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับไปรายการวิชา</button>
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <h2 id="subject-lo-title" className="text-lg font-bold text-slate-950">{selectedSubject.subject_name} <span className="chip chip-info align-middle">{selectedSubject.grade_level}</span></h2>
                                            <p className="mt-1 text-sm text-slate-600" aria-live="polite">เลือกแล้ว {selectionOf(selectedSubject.subject_id).size} ข้อ · แสดงเฉพาะ LO ของ {selectedSubject.grade_level}</p>
                                        </div>
                                        <label className="relative block sm:w-64">
                                            <span className="sr-only">ค้นหา LO</span>
                                            <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" aria-hidden="true" />
                                            <input value={loQuery} onChange={event => setLoQuery(event.target.value)} placeholder="ค้นหารหัสหรือข้อความ LO" className="min-h-11 w-full rounded-xl border border-field bg-white pl-10 pr-3 text-sm placeholder:text-slate-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                                        </label>
                                    </div>
                                </div>
                                <div className="space-y-4 p-4 sm:p-6">
                                    {subjectGroups.length === 0 && <p className="py-8 text-center text-sm text-slate-600">{loQuery ? 'ไม่พบ LO ที่ตรงกับที่ค้นหา' : `ยังไม่มี LO ของ ${selectedSubject.grade_level}`}</p>}
                                    {subjectGroups.map(group => {
                                        const id = selectedSubject.subject_id;
                                        const selection = selectionOf(id);
                                        const loIds = group.los.map(lo => lo.lo_id);
                                        const groupState = areaSelectionState(loIds, selection);
                                        return (
                                            <fieldset key={group.area} className="overflow-hidden rounded-xl border border-line">
                                                <legend className="sr-only">{group.area}</legend>
                                                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2">
                                                    <p className="text-sm font-bold text-slate-900">{shortAreaName(group.area)} <span className="font-semibold text-slate-600 tabular-nums">· เลือก {groupState.count}/{groupState.total}</span></p>
                                                    <button type="button" onClick={() => setSelection(id, toggleArea(selection, loIds))} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700">
                                                        {groupState.state === 'all' ? 'เอาออกทั้งด้าน' : 'เลือกทั้งด้าน'}
                                                    </button>
                                                </div>
                                                <ul className="divide-y divide-line">
                                                    {group.visible.map(lo => {
                                                        const checked = selection.has(lo.lo_id);
                                                        return (
                                                            <li key={lo.lo_id}>
                                                                <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${checked ? 'surface-selected' : 'hover:bg-slate-50'}`}>
                                                                    <input type="checkbox" checked={checked} onChange={() => {
                                                                        const next = new Set(selection);
                                                                        if (checked) next.delete(lo.lo_id); else next.add(lo.lo_id);
                                                                        setSelection(id, next);
                                                                    }} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-indigo-700" />
                                                                    <span className="min-w-0">
                                                                        <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">
                                                                            {lo.lo_code || 'ไม่มีรหัส'}
                                                                            {lo.ability_no != null && <span className="chip chip-neutral">ข้อที่ {lo.ability_no}</span>}
                                                                            {lo.is_custom_competency && <span className="chip chip-warning">เพิ่มเติมจากหลักสูตร</span>}
                                                                        </span>
                                                                        <span className="mt-1 block text-sm leading-6 text-slate-700">{lo.lo_description}</span>
                                                                    </span>
                                                                </label>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                            </fieldset>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </section>
                </div>
            )}

            {dirtyIds.length > 0 && (
                <div className="sticky bottom-0 z-30 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-lg sm:p-4" role="region" aria-label="รายการที่ยังไม่บันทึก">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 text-sm font-bold text-amber-950" aria-live="polite">
                            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                            ยังไม่บันทึก {dirtyIds.length} วิชา เปลี่ยนวิชาหรือชั้นได้ รายการไม่หาย
                        </p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button type="button" onClick={discardAll} disabled={saving} className="btn-secondary"><Undo2 className="h-4 w-4" aria-hidden="true" />ยกเลิกการเปลี่ยนแปลง</button>
                            <button type="button" onClick={saveAll} disabled={saving} className="btn-primary"><Save className="h-4 w-4" aria-hidden="true" />{saving ? 'กำลังบันทึก...' : `บันทึก ${dirtyIds.length} วิชา`}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
