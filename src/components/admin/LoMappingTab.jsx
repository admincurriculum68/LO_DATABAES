import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCheck, ListChecks, RefreshCw, RotateCcw, Save, Search, Sparkles, Table2, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAllByIn, fetchAllRows, supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useAcademic } from '../../AcademicContext';
import { useDialog } from '../../lib/dialogContext';
import LoAreaPicker from '../lo/LoAreaPicker';
import {
    areaSelectionState, gradesOf, groupLearningOutcomesByArea, learningOutcomesForGrade,
    sameSelection, shortAreaName, sortSubjectsForMapping, suggestAreasForSubject, toggleArea,
} from '../../lib/loMapping';
import { PROPOSAL_STATUS, lastEditedText, statusOf } from '../../lib/loProposals';
import { LO_PROPOSAL_SQL_HINT, approveSubjects, countEvaluationsAtRisk, loProposalsSupported, loadProposals, planApproval, returnProposal } from '../../lib/loProposalsApi';

// กำหนด LO ของวิชา (ฝ่ายวิชาการ)
// ครูผู้สอนเลือก LO ของวิชาตัวเองแล้วส่งมาให้อนุมัติ หน้านี้ใช้ตรวจ อนุมัติ และส่งกลับ
// ฝ่ายวิชาการแก้เองได้ด้วย แก้แล้วกดบันทึกคืออนุมัติทันที ระบบจึงเขียน subject_lo_mapping ให้ตรงกัน
// มีสองมุมมอง: ตารางรายชั้น ติ๊กเป็นรายด้านทั้งชั้นในหน้าเดียว · รายวิชา เลือกรายข้อเมื่อวิชาใช้ไม่ครบทุกข้อ

const EMPTY = new Set();
const draftKey = (schoolId, year, semester) => `loMappingDraft:${schoolId}:${year}:${semester}`;
const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim();

function AreaCheckbox({ state, label, onChange }) {
    const ref = useRef(null);
    // สถานะ "บางข้อ" ต้องตั้งผ่าน property เท่านั้น HTML ไม่มี attribute นี้
    useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
    return <input ref={ref} type="checkbox" checked={state === 'all'} onChange={onChange} aria-label={label} className="h-5 w-5 cursor-pointer accent-indigo-700" />;
}

function StatusChip({ status, dirty, count }) {
    if (dirty) return <span className="chip chip-warning">แก้แล้วยังไม่บันทึก · {count} LO</span>;
    const tone = PROPOSAL_STATUS[status];
    return <span className={`chip ${tone.chip}`}>{status === 'approved' ? `✓ ${count} LO` : `${tone.short}${count ? ` · ${count} LO` : ''}`}</span>;
}

export default function LoMappingTab() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const dialog = useDialog();
    const [subjects, setSubjects] = useState([]);
    const [learningOutcomes, setLearningOutcomes] = useState([]);
    const [saved, setSaved] = useState(new Map());
    const [proposals, setProposals] = useState(new Map());
    const [teacherNames, setTeacherNames] = useState(new Map());
    const [supported, setSupported] = useState(true);
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
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
    const restoredRef = useRef(false);
    const storageKey = draftKey(currentUser?.school_id, academicYear, semester);

    const load = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        try {
            const [subjectResult, loRows, teacherResult] = await Promise.all([
                supabase.from('subjects').select('subject_id, subject_name, grade_level')
                    .eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
                fetchAllRows((from, to) => supabase.from('learning_outcomes')
                    .select('lo_id, lo_code, ability_no, competency_area, is_custom_competency, lo_description, grade_level')
                    .eq('school_id', currentUser.school_id).range(from, to)),
                fetchAllRows((from, to) => supabase.from('users_teachers')
                    .select('teacher_id, prefix, first_name, last_name').eq('school_id', currentUser.school_id).range(from, to)),
            ]);
            if (subjectResult.error) throw subjectResult.error;
            const sortedSubjects = sortSubjectsForMapping(subjectResult.data || []);
            const subjectIds = sortedSubjects.map(subject => subject.subject_id);
            const [mappings, proposalMap, isSupported] = await Promise.all([
                fetchAllByIn(subjectIds, (batch, from, to) => supabase
                    .from('subject_lo_mapping').select('subject_id, lo_id').in('subject_id', batch).range(from, to)),
                loadProposals(subjectIds),
                loProposalsSupported(),
            ]);
            const nextSaved = new Map(sortedSubjects.map(subject => [subject.subject_id, new Set()]));
            mappings.forEach(row => nextSaved.get(row.subject_id)?.add(row.lo_id));

            setSubjects(sortedSubjects);
            setLearningOutcomes(loRows || []);
            setSaved(nextSaved);
            setProposals(proposalMap);
            setSupported(isSupported);
            setTeacherNames(new Map((teacherResult || []).map(teacher => [teacher.teacher_id, fullName(teacher)])));
            const grades = gradesOf(sortedSubjects);
            setGrade(current => (grades.includes(current) ? current : grades[0] || ''));
            setSelectedSubjectId(current => (nextSaved.has(current) ? current : sortedSubjects[0]?.subject_id || ''));

            // กู้สิ่งที่ติ๊กไว้แต่ยังไม่บันทึก ครั้งเดียวต่อการเปิดหน้า
            if (!restoredRef.current) {
                restoredRef.current = true;
                try {
                    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
                    const baseOf = id => (proposalMap.get(id)?.lo_ids ? new Set(proposalMap.get(id).lo_ids) : nextSaved.get(id));
                    const restored = new Map(Object.entries(stored?.drafts || {})
                        .filter(([id, ids]) => nextSaved.has(id) && !sameSelection(ids, baseOf(id)))
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

    // สิ่งที่ต้องแสดง: ของที่ฝ่ายวิชาการกำลังแก้ → ของที่ครูเสนอ → ของที่อนุมัติไว้แล้ว
    const baseOf = useCallback(id => (proposals.get(id)?.lo_ids ? new Set(proposals.get(id).lo_ids) : (saved.get(id) || EMPTY)), [proposals, saved]);
    const selectionOf = useCallback(id => drafts.get(id) || baseOf(id), [baseOf, drafts]);
    const statusFor = useCallback(id => statusOf(proposals.get(id), saved.get(id)), [proposals, saved]);

    const dirtyIds = useMemo(() => [...drafts.keys()].filter(id => !sameSelection(drafts.get(id), baseOf(id))), [baseOf, drafts]);
    const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);

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
            if (sameSelection(next, baseOf(subjectId))) map.delete(subjectId);
            else map.set(subjectId, new Set(next));
            return map;
        });
    }, [baseOf]);

    const counts = useMemo(() => {
        const result = { approved: 0, submitted: 0, waiting: 0 };
        subjects.forEach(subject => {
            const status = statusFor(subject.subject_id);
            if (status === 'approved') result.approved += 1;
            else if (status === 'submitted') result.submitted += 1;
            else result.waiting += 1;
        });
        return result;
    }, [statusFor, subjects]);

    const grades = useMemo(() => gradesOf(subjects), [subjects]);
    const gradeSubjects = useMemo(() => subjects.filter(subject => subject.grade_level === grade), [grade, subjects]);
    const gradeGroups = useMemo(() => groupLearningOutcomesByArea(learningOutcomesForGrade(learningOutcomes, grade)), [grade, learningOutcomes]);
    const gradeSubmitted = useMemo(() => gradeSubjects.filter(subject => statusFor(subject.subject_id) === 'submitted' && !dirtySet.has(subject.subject_id)), [dirtySet, gradeSubjects, statusFor]);

    // วิชาของชั้นนี้ที่ครูยังไม่ได้เสนอ LO และระบบเดาด้านจากชื่อวิชาได้
    const suggestions = useMemo(() => {
        const areas = gradeGroups.map(group => group.area);
        return gradeSubjects
            .filter(subject => statusFor(subject.subject_id) === 'none' && !drafts.has(subject.subject_id))
            .map(subject => ({ subject, areas: suggestAreasForSubject(subject.subject_name, areas) }));
    }, [drafts, gradeGroups, gradeSubjects, statusFor]);
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

    /** เขียน LO ที่อนุมัติลงฐานข้อมูล ใช้ทั้งตอนฝ่ายวิชาการแก้เอง และตอนอนุมัติของที่ครูส่งมา */
    const approve = async (entries, { successText }) => {
        if (!entries.length || saving) return;
        setSaving(true);
        try {
            const plans = await planApproval(entries);
            const removals = plans.filter(plan => plan.toRemove.length);
            if (removals.length) {
                const evaluated = await countEvaluationsAtRisk(removals);
                if (evaluated > 0) {
                    const confirmed = await dialog.confirm({
                        title: 'เอา LO ที่ครูประเมินแล้วออกจากวิชา',
                        message: `LO ที่จะเอาออกมีผลการประเมินของครูแล้ว ${evaluated.toLocaleString()} รายการ\nผลเดิมยังเก็บอยู่ในระบบ แต่จะไม่แสดงในหน้าประเมินของวิชานั้นจนกว่าจะเลือก LO กลับมา`,
                        confirmLabel: 'เอาออกและอนุมัติ',
                        cancelLabel: 'กลับไปแก้',
                        tone: 'danger',
                    });
                    if (!confirmed) return;
                }
            }
            const rows = await approveSubjects({ schoolId: currentUser.school_id, entries, actor: currentUser, plans });

            const ids = entries.map(entry => entry.subjectId);
            setSaved(previous => {
                const map = new Map(previous);
                entries.forEach(entry => map.set(entry.subjectId, new Set(entry.loIds)));
                return map;
            });
            setProposals(previous => {
                const map = new Map(previous);
                rows.forEach(row => map.set(row.subject_id, row));
                return map;
            });
            setDrafts(previous => {
                const map = new Map(previous);
                ids.forEach(id => map.delete(id));
                return map;
            });
            setSuggestedIds(previous => new Set([...previous].filter(id => !ids.includes(id))));
            toast.success(successText(entries.length));
        } catch (error) {
            toast.error(`บันทึกไม่สำเร็จ: ${error.message} รายการที่ติ๊กไว้ยังอยู่ ลองกดอีกครั้ง`);
        } finally {
            setSaving(false);
        }
    };

    const saveAll = () => approve(
        dirtyIds.map(id => ({ subjectId: id, loIds: [...drafts.get(id)] })),
        { successText: count => `บันทึกและอนุมัติ LO ของ ${count} วิชาแล้ว ครูบันทึกข้อความ LO ได้เลย` },
    );

    const approveSubmitted = subjectList => approve(
        subjectList.map(subject => ({ subjectId: subject.subject_id, loIds: [...selectionOf(subject.subject_id)] })),
        { successText: count => `อนุมัติ LO ของ ${count} วิชาแล้ว` },
    );

    const sendBack = async subject => {
        const id = subject.subject_id;
        const approved = statusFor(id) === 'approved';
        const reason = await dialog.prompt({
            title: approved ? `ปลดล็อกให้ครูแก้ LO · ${subject.subject_name}` : `ส่งกลับให้ครูแก้ · ${subject.subject_name}`,
            message: approved
                ? 'ครูจะแก้ LO ได้อีกครั้ง LO ที่อนุมัติไว้ยังใช้งานอยู่จนกว่าจะอนุมัติรอบใหม่'
                : 'ครูผู้สอนจะเห็นเหตุผลนี้ในหน้าเลือก LO ของวิชา',
            inputLabel: 'เหตุผล',
            placeholder: 'เช่น วิชานี้ควรประเมินด้านการเขียนด้วย',
        });
        if (reason === null) return;
        try {
            const row = await returnProposal({
                schoolId: currentUser.school_id, subjectId: id, reason: reason.trim() || 'ฝ่ายวิชาการขอให้ทบทวน',
                actor: currentUser, proposal: proposals.get(id), loIds: [...selectionOf(id)],
            });
            setProposals(previous => new Map(previous).set(id, row));
            toast.success(approved ? 'ปลดล็อกให้ครูแก้แล้ว' : 'ส่งกลับให้ครูแก้แล้ว');
        } catch (error) {
            toast.error('ทำรายการไม่สำเร็จ: ' + error.message);
        }
    };

    const discardAll = async () => {
        const confirmed = await dialog.confirm({
            title: 'ยกเลิกการเปลี่ยนแปลง',
            message: `สิ่งที่ติ๊กไว้แต่ยังไม่บันทึกใน ${dirtyIds.length} วิชาจะหายไป LO ที่อนุมัติแล้วไม่เปลี่ยน`,
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
        setMobileDetailOpen(true);
    };

    // ── มุมมองรายวิชา ──
    const filteredSubjects = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return subjects.filter(subject => {
            const id = subject.subject_id;
            if (normalized && !`${subject.subject_name} ${subject.grade_level}`.toLowerCase().includes(normalized)) return false;
            if (statusFilter === 'dirty') return dirtySet.has(id);
            if (statusFilter === 'all') return true;
            return statusFor(id) === statusFilter && !dirtySet.has(id);
        });
    }, [dirtySet, query, statusFilter, statusFor, subjects]);
    const selectedSubject = subjects.find(subject => subject.subject_id === selectedSubjectId);
    const selectedStatus = selectedSubject ? statusFor(selectedSubject.subject_id) : 'none';
    const selectedProposal = selectedSubject ? proposals.get(selectedSubject.subject_id) : null;
    const subjectLos = useMemo(
        () => (selectedSubject ? learningOutcomesForGrade(learningOutcomes, selectedSubject.grade_level) : []),
        [learningOutcomes, selectedSubject],
    );

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

    const percent = Math.round((counts.approved / subjects.length) * 100);

    return (
        <div className="space-y-5">
            {!supported && (
                <p className="flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />{LO_PROPOSAL_SQL_HINT}
                </p>
            )}

            <section className="rounded-2xl border border-line bg-white p-4 sm:p-6" aria-label="ความคืบหน้าและมุมมอง">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">ครูผู้สอนเลือก LO ของวิชาตัวเองแล้วส่งมาให้อนุมัติ ฝ่ายวิชาการแก้เองแล้วกดบันทึกก็ถือว่าอนุมัติทันที</p>
                        <div className="mt-3 flex items-center gap-3">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={subjects.length} aria-valuenow={counts.approved} aria-label="วิชาที่อนุมัติ LO แล้ว">
                                <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${percent}%` }} />
                            </div>
                            <p className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">
                                อนุมัติแล้ว {counts.approved} จาก {subjects.length} วิชา
                                {counts.submitted > 0 && <span className="ml-2 text-amber-800">· รออนุมัติ {counts.submitted}</span>}
                            </p>
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
                                const done = inGrade.filter(subject => statusFor(subject.subject_id) === 'approved').length;
                                const waiting = inGrade.filter(subject => statusFor(subject.subject_id) === 'submitted').length;
                                const pending = inGrade.some(subject => dirtySet.has(subject.subject_id));
                                return (
                                    <button key={item} type="button" aria-pressed={grade === item} onClick={() => setGrade(item)} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold ${grade === item ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}>
                                        {item}
                                        <span className={`tabular-nums ${grade === item ? 'text-indigo-100' : done === inGrade.length ? 'text-emerald-700' : 'text-slate-500'}`}>{done}/{inGrade.length}</span>
                                        {waiting > 0 && <span className={`rounded-md px-1.5 text-xs tabular-nums ${grade === item ? 'bg-white/20' : 'bg-amber-100 text-amber-900'}`} title={`รออนุมัติ ${waiting} วิชา`}>รอ {waiting}</span>}
                                        {pending && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="มีรายการยังไม่บันทึก" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {gradeSubmitted.length > 0 && (
                        <div className="flex flex-col gap-3 border-b border-line bg-emerald-50/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                            <p className="text-sm text-emerald-950"><strong>{grade}</strong> มี <strong>{gradeSubmitted.length} วิชา</strong>ที่ครูส่ง LO มาให้อนุมัติ ตรวจในตารางแล้วอนุมัติได้ทีเดียว</p>
                            <button type="button" onClick={() => approveSubmitted(gradeSubmitted)} disabled={saving} className="btn-primary shrink-0"><CheckCheck className="h-4 w-4" aria-hidden="true" />อนุมัติทั้งชั้น ({gradeSubmitted.length} วิชา)</button>
                        </div>
                    )}

                    {(suggestable.length > 0 || unsuggestable.length > 0) && (
                        <div className="border-b border-line bg-indigo-50/60 p-4 sm:px-6">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-start gap-3">
                                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden="true" />
                                    <div className="text-sm text-slate-800">
                                        <p><strong>{grade}</strong> มี {suggestions.length} วิชาที่ครูยังไม่ส่ง LO{suggestable.length > 0 && <> ถ้าไม่รอครู ระบบเลือกด้านจากชื่อวิชาให้ได้ <strong>{suggestable.length} วิชา</strong></>}</p>
                                        {unsuggestable.length > 0 && <p className="mt-1 text-slate-600">ต้องเลือกด้านเอง: {unsuggestable.map(item => item.subject.subject_name).join(', ')}</p>}
                                    </div>
                                </div>
                                {suggestable.length > 0 && (
                                    <button type="button" onClick={applySuggestions} className="btn-secondary shrink-0"><Sparkles className="h-4 w-4" aria-hidden="true" />เลือกด้านตามชื่อวิชา ({suggestable.length} วิชา)</button>
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
                                        const status = statusFor(id);
                                        const suggested = dirty && suggestedIds.has(id);
                                        const rowTone = dirty ? 'bg-amber-50' : status === 'submitted' ? 'bg-emerald-50/50' : 'bg-white';
                                        return (
                                            <tr key={id} className={`${rowTone} border-b border-line last:border-b-0`}>
                                                <th scope="row" className={`sticky left-0 z-10 ${rowTone} px-3 py-2 text-left align-middle font-normal sm:px-4`}>
                                                    <span className="block font-bold text-slate-900">{subject.subject_name}</span>
                                                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                                                        <StatusChip status={status} dirty={dirty} count={selection.size} />
                                                        <button type="button" onClick={() => openSubject(id)} className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-bold text-indigo-800 underline-offset-2 hover:bg-indigo-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700">เลือกรายข้อ</button>
                                                        {!dirty && status === 'submitted' && (
                                                            <button type="button" onClick={() => approveSubmitted([subject])} disabled={saving} className="inline-flex min-h-8 items-center gap-1 rounded-md bg-emerald-700 px-2 text-xs font-bold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                                                                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />อนุมัติ
                                                            </button>
                                                        )}
                                                        {supported && !dirty && (status === 'submitted' || status === 'approved') && (
                                                            <button type="button" onClick={() => sendBack(subject)} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-bold text-rose-800 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">
                                                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{status === 'approved' ? 'ปลดล็อก' : 'ส่งกลับ'}
                                                            </button>
                                                        )}
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
                                <option value="submitted">รออนุมัติ ({counts.submitted})</option>
                                <option value="none">ครูยังไม่ส่ง ({subjects.filter(subject => statusFor(subject.subject_id) === 'none').length})</option>
                                <option value="draft">ครูกำลังเลือก ({subjects.filter(subject => statusFor(subject.subject_id) === 'draft').length})</option>
                                <option value="returned">ส่งกลับแล้ว ({subjects.filter(subject => statusFor(subject.subject_id) === 'returned').length})</option>
                                <option value="approved">อนุมัติแล้ว ({counts.approved})</option>
                                <option value="dirty">ยังไม่บันทึก ({dirtyIds.length})</option>
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
                                                        <StatusChip status={statusFor(id)} dirty={dirtySet.has(id)} count={selectionOf(id).size} />
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
                                        <div className="min-w-0">
                                            <h2 id="subject-lo-title" className="text-lg font-bold text-slate-950">{selectedSubject.subject_name} <span className="chip chip-info align-middle">{selectedSubject.grade_level}</span></h2>
                                            <p className="mt-1 text-sm text-slate-600" aria-live="polite">
                                                เลือกแล้ว {selectionOf(selectedSubject.subject_id).size} ข้อ · {PROPOSAL_STATUS[selectedStatus].label}
                                            </p>
                                            {selectedProposal?.updated_at && <p className="mt-0.5 text-xs text-slate-500">{lastEditedText(selectedProposal, teacherNames)}</p>}
                                            {selectedStatus === 'returned' && selectedProposal?.review_note && (
                                                <p className="mt-1 text-xs text-rose-800">ส่งกลับเพราะ: {selectedProposal.review_note}</p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-2">
                                            {!dirtySet.has(selectedSubject.subject_id) && selectedStatus === 'submitted' && (
                                                <button type="button" onClick={() => approveSubmitted([selectedSubject])} disabled={saving} className="btn-primary"><CheckCheck className="h-4 w-4" aria-hidden="true" />อนุมัติวิชานี้</button>
                                            )}
                                            {supported && !dirtySet.has(selectedSubject.subject_id) && (selectedStatus === 'submitted' || selectedStatus === 'approved') && (
                                                <button type="button" onClick={() => sendBack(selectedSubject)} className="btn-secondary"><RotateCcw className="h-4 w-4" aria-hidden="true" />{selectedStatus === 'approved' ? 'ปลดล็อกให้ครูแก้' : 'ส่งกลับให้ครูแก้'}</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 sm:p-6">
                                    <LoAreaPicker
                                        learningOutcomes={subjectLos}
                                        selection={selectionOf(selectedSubject.subject_id)}
                                        onChange={next => setSelection(selectedSubject.subject_id, next)}
                                        emptyText={`ยังไม่มี LO ของ ${selectedSubject.grade_level}`}
                                    />
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
                            แก้ไว้ {dirtyIds.length} วิชา · กดบันทึกแล้วถือว่าอนุมัติทันที
                        </p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button type="button" onClick={discardAll} disabled={saving} className="btn-secondary"><Undo2 className="h-4 w-4" aria-hidden="true" />ยกเลิกการเปลี่ยนแปลง</button>
                            <button type="button" onClick={saveAll} disabled={saving} className="btn-primary"><Save className="h-4 w-4" aria-hidden="true" />{saving ? 'กำลังบันทึก...' : `บันทึกและอนุมัติ ${dirtyIds.length} วิชา`}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
