import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ListChecks, RefreshCw, Save, Search, Sparkles, Table2, Undo2 } from 'lucide-react';
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
import { buildLoResolver } from '../../lib/loByRoom';
import { LO_BY_ROOM_SQL_HINT, countEvaluationsAtRisk, loByRoomSupported, loadRoomMappings, loadSubjectAssignments, planRoomSelection, saveRoomSelection } from '../../lib/loByRoomApi';
import { compareRooms } from '../../lib/teacherAccess';

// กำหนด LO ของวิชา (ฝ่ายวิชาการ)
// ครูผู้สอนเลือก LO ของห้องที่ตัวเองสอนแล้วใช้ได้ทันที หน้านี้ใช้ดูภาพรวมทุกวิชาทุกห้อง และแก้แทนครูได้
// หน่วยงานคือ "วิชา × ห้อง" เพราะห้องปกติกับห้อง IEP ของวิชาเดียวกันใช้ LO ต่างกันได้
// มีสองมุมมอง: ตารางรายชั้น ติ๊กเป็นรายด้าน · รายวิชา เลือกรายข้อทีละห้อง

const draftKey = (schoolId, year, semester) => `loRoomDraft:${schoolId}:${year}:${semester}`;
const slotKey = (subjectId, room) => `${subjectId}|${room || ''}`;
const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim();
const formatWhen = value => (value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '');

function AreaCheckbox({ state, label, onChange }) {
    const ref = useRef(null);
    // สถานะ "บางข้อ" ต้องตั้งผ่าน property เท่านั้น HTML ไม่มี attribute นี้
    useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
    return <input ref={ref} type="checkbox" checked={state === 'all'} onChange={onChange} aria-label={label} className="h-5 w-5 cursor-pointer accent-indigo-700" />;
}

function StatusChip({ savedCount, draftCount, dirty }) {
    if (dirty) return <span className="chip chip-warning">ยังไม่บันทึก · {draftCount} LO</span>;
    if (savedCount) return <span className="chip chip-success">✓ {savedCount} LO</span>;
    return <span className="chip chip-neutral">ยังไม่เลือก</span>;
}

export default function LoMappingTab() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const dialog = useDialog();
    const [subjects, setSubjects] = useState([]);
    const [slots, setSlots] = useState([]);
    const [learningOutcomes, setLearningOutcomes] = useState([]);
    const [mappings, setMappings] = useState([]);
    const [names, setNames] = useState(new Map());
    const [supported, setSupported] = useState(true);
    const [drafts, setDrafts] = useState(new Map());
    const [suggestedKeys, setSuggestedKeys] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState('grade');
    const [grade, setGrade] = useState('');
    const [onlyMissing, setOnlyMissing] = useState(false);
    const [selectedSubjectId, setSelectedSubjectId] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [query, setQuery] = useState('');
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
    const restoredRef = useRef(false);
    const storageKey = draftKey(currentUser?.school_id, academicYear, semester);

    const load = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        try {
            const [subjectResult, loRows, teacherRows, isSupported] = await Promise.all([
                supabase.from('subjects').select('subject_id, subject_name, grade_level, teacher_id')
                    .eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
                fetchAllRows((from, to) => supabase.from('learning_outcomes')
                    .select('lo_id, lo_code, ability_no, competency_area, is_custom_competency, lo_description, grade_level')
                    .eq('school_id', currentUser.school_id).range(from, to)),
                fetchAllRows((from, to) => supabase.from('users_teachers')
                    .select('teacher_id, prefix, first_name, last_name').eq('school_id', currentUser.school_id).range(from, to)),
                loByRoomSupported(),
            ]);
            if (subjectResult.error) throw subjectResult.error;
            const sortedSubjects = sortSubjectsForMapping(subjectResult.data || []);
            const subjectIds = sortedSubjects.map(subject => subject.subject_id);
            const [mappingRows, assignments, enrollments] = await Promise.all([
                loadRoomMappings(subjectIds),
                loadSubjectAssignments(subjectIds),
                isSupported
                    ? fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('student_enrollments')
                        .select('subject_id, room').in('subject_id', batch).eq('enrollment_status', 'active').range(from, to))
                    : Promise.resolve([]),
            ]);
            const nameById = new Map((teacherRows || []).map(teacher => [teacher.teacher_id, fullName(teacher)]));

            // หน่วยงาน: วิชา × ห้องที่มีนักเรียนจริง ถ้าฐานข้อมูลยังไม่รองรับรายห้อง ใช้วิชาละหนึ่งหน่วย
            const roomsBySubject = new Map(subjectIds.map(id => [id, new Set()]));
            enrollments.forEach(row => { if (row.room) roomsBySubject.get(row.subject_id)?.add(row.room); });
            const nextSlots = sortedSubjects.flatMap(subject => {
                const rows = assignments.filter(row => row.subject_id === subject.subject_id);
                const teacherNamesFor = room => {
                    const ids = rows.length
                        ? rows.filter(row => !row.room_name || row.room_name === room).map(row => row.teacher_id)
                        : [subject.teacher_id];
                    return [...new Set(ids.filter(Boolean))].map(id => nameById.get(id)).filter(Boolean);
                };
                const rooms = isSupported ? [...roomsBySubject.get(subject.subject_id)].sort(compareRooms) : [];
                if (!rooms.length) return [{ key: slotKey(subject.subject_id, null), subject, room: null, teachers: teacherNamesFor(null) }];
                return rooms.map(room => ({ key: slotKey(subject.subject_id, room), subject, room, teachers: teacherNamesFor(room) }));
            });

            setSubjects(sortedSubjects);
            setSlots(nextSlots);
            setLearningOutcomes(loRows || []);
            setMappings(mappingRows);
            setNames(nameById);
            setSupported(isSupported);
            const grades = gradesOf(sortedSubjects);
            setGrade(current => (grades.includes(current) ? current : grades[0] || ''));
            setSelectedSubjectId(current => (subjectIds.includes(current) ? current : subjectIds[0] || ''));

            // กู้สิ่งที่ติ๊กไว้แต่ยังไม่บันทึก ครั้งเดียวต่อการเปิดหน้า
            if (!restoredRef.current) {
                restoredRef.current = true;
                try {
                    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
                    const resolver = buildLoResolver(mappingRows);
                    const validKeys = new Map(nextSlots.map(slot => [slot.key, slot]));
                    const restored = new Map(Object.entries(stored?.drafts || {})
                        .filter(([key, ids]) => validKeys.has(key) && !sameSelection(ids, resolver.idsFor(validKeys.get(key).subject.subject_id, validKeys.get(key).room)))
                        .map(([key, ids]) => [key, new Set(ids)]));
                    if (restored.size) {
                        setDrafts(restored);
                        setSuggestedKeys(new Set((stored.suggested || []).filter(key => restored.has(key))));
                        toast(`กู้รายการที่ยังไม่บันทึกกลับมา ${restored.size} ห้อง`, { icon: '↩️' });
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

    const resolver = useMemo(() => buildLoResolver(mappings), [mappings]);
    const slotByKey = useMemo(() => new Map(slots.map(slot => [slot.key, slot])), [slots]);
    const savedOf = useCallback(slot => resolver.idsFor(slot.subject.subject_id, slot.room), [resolver]);
    const selectionOf = useCallback(slot => drafts.get(slot.key) || savedOf(slot), [drafts, savedOf]);
    const dirtyKeys = useMemo(() => [...drafts.keys()].filter(key => slotByKey.has(key) && !sameSelection(drafts.get(key), savedOf(slotByKey.get(key)))), [drafts, savedOf, slotByKey]);
    const dirtySet = useMemo(() => new Set(dirtyKeys), [dirtyKeys]);

    useEffect(() => {
        if (!restoredRef.current) return;
        try {
            if (!dirtyKeys.length) sessionStorage.removeItem(storageKey);
            else sessionStorage.setItem(storageKey, JSON.stringify({
                drafts: Object.fromEntries(dirtyKeys.map(key => [key, [...drafts.get(key)]])),
                suggested: [...suggestedKeys].filter(key => dirtySet.has(key)),
            }));
        } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ }
    }, [dirtyKeys, dirtySet, drafts, storageKey, suggestedKeys]);

    // ปิดแท็บหรือรีเฟรชหน้าขณะมีรายการยังไม่บันทึก ให้เบราว์เซอร์ถามก่อน
    useEffect(() => {
        if (!dirtyKeys.length) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirtyKeys.length]);

    const setSelection = useCallback((slot, next) => {
        setDrafts(previous => {
            const map = new Map(previous);
            if (sameSelection(next, savedOf(slot))) map.delete(slot.key);
            else map.set(slot.key, new Set(next));
            return map;
        });
    }, [savedOf]);

    const doneCount = useMemo(() => slots.filter(slot => savedOf(slot).size > 0).length, [savedOf, slots]);
    const grades = useMemo(() => gradesOf(subjects), [subjects]);
    const gradeSlots = useMemo(() => slots.filter(slot => slot.subject.grade_level === grade && (!onlyMissing || savedOf(slot).size === 0 || dirtySet.has(slot.key))), [dirtySet, grade, onlyMissing, savedOf, slots]);
    const gradeGroups = useMemo(() => groupLearningOutcomesByArea(learningOutcomesForGrade(learningOutcomes, grade)), [grade, learningOutcomes]);

    // ห้องของชั้นนี้ที่ยังไม่มี LO และระบบเดาด้านจากชื่อวิชาได้
    const suggestions = useMemo(() => {
        const areas = gradeGroups.map(group => group.area);
        return slots
            .filter(slot => slot.subject.grade_level === grade && savedOf(slot).size === 0 && !drafts.has(slot.key))
            .map(slot => ({ slot, areas: suggestAreasForSubject(slot.subject.subject_name, areas) }));
    }, [drafts, grade, gradeGroups, savedOf, slots]);
    const suggestable = suggestions.filter(item => item.areas.length);
    const unsuggestable = [...new Set(suggestions.filter(item => !item.areas.length).map(item => item.slot.subject.subject_name))];

    const applySuggestions = () => {
        const losByArea = new Map(gradeGroups.map(group => [group.area, group.los.map(lo => lo.lo_id)]));
        setDrafts(previous => {
            const map = new Map(previous);
            suggestable.forEach(({ slot, areas }) => map.set(slot.key, new Set(areas.flatMap(area => losByArea.get(area) || []))));
            return map;
        });
        setSuggestedKeys(previous => new Set([...previous, ...suggestable.map(item => item.slot.key)]));
        toast.success(`เลือกด้านให้ ${suggestable.length} ห้องแล้ว ตรวจช่องกรอบเส้นประสีเหลืองก่อนกดบันทึก`);
    };

    const saveAll = async () => {
        if (!dirtyKeys.length || saving) return;
        setSaving(true);
        try {
            // รวมห้องของวิชาเดียวกันที่เลือกชุดเดียวกันเป็นการบันทึกครั้งเดียว
            const groups = new Map();
            dirtyKeys.forEach(key => {
                const slot = slotByKey.get(key);
                const ids = [...drafts.get(key)].sort();
                const groupKey = `${slot.subject.subject_id}|${ids.join(',')}`;
                if (!groups.has(groupKey)) groups.set(groupKey, { subjectId: slot.subject.subject_id, rooms: [], loIds: ids });
                if (slot.room) groups.get(groupKey).rooms.push(slot.room);
            });
            const jobs = [...groups.values()];
            if (jobs.some(job => !job.loIds.length)) {
                toast.error('ห้องที่ไม่เลือก LO เลยบันทึกไม่ได้ ติ๊กอย่างน้อย 1 ด้าน หรือกดยกเลิกการเปลี่ยนแปลง');
                return;
            }

            const planned = [];
            let atRisk = 0;
            for (const job of jobs) {
                const plans = supported && job.rooms.length ? await planRoomSelection(job.subjectId, job.rooms, job.loIds) : null;
                if (plans) atRisk += await countEvaluationsAtRisk(job.subjectId, plans);
                planned.push({ ...job, plans });
            }
            if (atRisk > 0) {
                const confirmed = await dialog.confirm({
                    title: 'LO ที่จะเอาออกมีข้อความของนักเรียนแล้ว',
                    message: `มีข้อความพฤติกรรมที่ครูบันทึกไว้แล้ว ${atRisk.toLocaleString()} รายการใน LO ที่ห้องเหล่านี้จะเลิกใช้\nข้อความยังเก็บอยู่ในระบบ แต่จะไม่แสดงจนกว่าจะเลือก LO นั้นกลับมา`,
                    confirmLabel: 'บันทึกต่อ',
                    cancelLabel: 'กลับไปแก้',
                    tone: 'danger',
                });
                if (!confirmed) return;
            }
            for (const job of planned) {
                await saveRoomSelection({ subjectId: job.subjectId, rooms: job.rooms, loIds: job.loIds, actor: currentUser, plans: job.plans, schoolId: currentUser.school_id });
            }
            const savedCount = dirtyKeys.length;
            setMappings(await loadRoomMappings(subjects.map(subject => subject.subject_id)));
            setDrafts(new Map());
            setSuggestedKeys(new Set());
            toast.success(`บันทึก LO ของ ${savedCount} ห้องแล้ว ครูบันทึกข้อความได้ทันที`);
        } catch (error) {
            toast.error(`บันทึกไม่สำเร็จ: ${error.message} รายการที่ติ๊กไว้ยังอยู่ ลองกดบันทึกอีกครั้ง`);
        } finally {
            setSaving(false);
        }
    };

    const discardAll = async () => {
        const confirmed = await dialog.confirm({
            title: 'ยกเลิกการเปลี่ยนแปลง',
            message: `สิ่งที่ติ๊กไว้แต่ยังไม่บันทึกใน ${dirtyKeys.length} ห้องจะหายไป LO ที่บันทึกแล้วไม่เปลี่ยน`,
            confirmLabel: 'ยกเลิกการเปลี่ยนแปลง',
            cancelLabel: 'เก็บไว้ก่อน',
            tone: 'danger',
        });
        if (!confirmed) return;
        setDrafts(new Map());
        setSuggestedKeys(new Set());
    };

    const openSlot = slot => {
        setSelectedSubjectId(slot.subject.subject_id);
        setSelectedRoom(slot.room || '');
        setView('subject');
        setMobileDetailOpen(true);
    };

    // ── มุมมองรายวิชา ──
    const filteredSubjects = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return subjects.filter(subject => !normalized || `${subject.subject_name} ${subject.grade_level}`.toLowerCase().includes(normalized));
    }, [query, subjects]);
    const selectedSubject = subjects.find(subject => subject.subject_id === selectedSubjectId);
    const subjectSlots = useMemo(() => slots.filter(slot => slot.subject.subject_id === selectedSubjectId), [selectedSubjectId, slots]);
    const activeSlot = subjectSlots.find(slot => (slot.room || '') === selectedRoom) || subjectSlots[0];
    const activeEdit = activeSlot ? resolver.lastEdit(activeSlot.subject.subject_id, activeSlot.room) : null;
    const subjectLos = useMemo(() => (selectedSubject ? learningOutcomesForGrade(learningOutcomes, selectedSubject.grade_level) : []), [learningOutcomes, selectedSubject]);
    const subjectProgress = subject => {
        const list = slots.filter(slot => slot.subject.subject_id === subject.subject_id);
        return { done: list.filter(slot => savedOf(slot).size > 0).length, total: list.length, dirty: list.some(slot => dirtySet.has(slot.key)) };
    };

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

    const unit = supported ? 'ห้องเรียน' : 'วิชา';
    const percent = slots.length ? Math.round((doneCount / slots.length) * 100) : 0;

    return (
        <div className="space-y-5">
            {!supported && (
                <p className="flex gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />{LO_BY_ROOM_SQL_HINT}
                </p>
            )}

            <section className="rounded-2xl border border-line bg-white p-4 sm:p-6" aria-label="ความคืบหน้าและมุมมอง">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-700">ครูผู้สอนเลือก LO ของห้องที่ตัวเองสอนตามคำอธิบายรายวิชา แล้วใช้ได้ทันที หน้านี้ใช้ติดตามและแก้แทนครู</p>
                        <div className="mt-3 flex items-center gap-3">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={slots.length} aria-valuenow={doneCount} aria-label={`${unit}ที่เลือก LO แล้ว`}>
                                <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${percent}%` }} />
                            </div>
                            <p className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">เลือก LO แล้ว {doneCount} จาก {slots.length} {unit}</p>
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
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 id="grade-matrix-title" className="text-lg font-bold text-slate-950">ตารางรายชั้น</h2>
                                <p className="mt-1 text-sm text-slate-600">แต่ละแถวคือวิชาของห้องหนึ่ง ติ๊กช่องเพื่อใช้ LO ทุกข้อของด้านนั้น ถ้าใช้ไม่ครบทุกข้อ กด “เลือกรายข้อ”</p>
                            </div>
                            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-bold text-slate-800">
                                <input type="checkbox" checked={onlyMissing} onChange={event => setOnlyMissing(event.target.checked)} className="h-5 w-5 accent-indigo-700" />
                                เฉพาะ{unit}ที่ยังไม่เลือก
                            </label>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="เลือกชั้น">
                            {grades.map(item => {
                                const inGrade = slots.filter(slot => slot.subject.grade_level === item);
                                const done = inGrade.filter(slot => savedOf(slot).size > 0).length;
                                const pending = inGrade.some(slot => dirtySet.has(slot.key));
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
                                        <p><strong>{grade}</strong> มี {suggestions.length} {unit}ที่ยังไม่เลือก LO{suggestable.length > 0 && <> ถ้าไม่รอครู ระบบเลือกด้านจากชื่อวิชาให้ได้ <strong>{suggestable.length} {unit}</strong></>}</p>
                                        {unsuggestable.length > 0 && <p className="mt-1 text-slate-600">ต้องเลือกด้านเอง: {unsuggestable.join(', ')}</p>}
                                    </div>
                                </div>
                                {suggestable.length > 0 && (
                                    <button type="button" onClick={applySuggestions} className="btn-secondary shrink-0"><Sparkles className="h-4 w-4" aria-hidden="true" />เลือกด้านตามชื่อวิชา ({suggestable.length} {unit})</button>
                                )}
                            </div>
                        </div>
                    )}

                    {gradeGroups.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-600">ยังไม่มี LO ของ {grade} นำเข้า LO ของชั้นนี้ก่อน</p>
                    ) : gradeSlots.length === 0 ? (
                        <p className="p-8 text-center text-sm text-slate-600">{grade} เลือก LO ครบทุก{unit}แล้ว</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-sm">
                                <caption className="sr-only">ด้านความสามารถที่แต่ละวิชาและห้องของ {grade} ใช้ประเมิน</caption>
                                <thead className="bg-slate-50 text-slate-700">
                                    <tr>
                                        <th scope="col" className="sticky left-0 z-10 min-w-[10rem] border-b border-line bg-slate-50 px-3 py-3 text-left font-bold sm:min-w-[16rem] sm:px-4">วิชา · ห้อง</th>
                                        {gradeGroups.map(group => (
                                            <th key={group.area} scope="col" className="min-w-[5rem] border-b border-line px-1 py-3 text-center align-bottom text-xs font-bold sm:min-w-[6.5rem] sm:px-2">
                                                <span className="block leading-5">{shortAreaName(group.area)}</span>
                                                <span className="mt-0.5 block font-medium text-slate-500">{group.los.length} ข้อ</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {gradeSlots.map((slot, index) => {
                                        const selection = selectionOf(slot);
                                        const dirty = dirtySet.has(slot.key);
                                        const suggested = dirty && suggestedKeys.has(slot.key);
                                        const firstOfSubject = index === 0 || gradeSlots[index - 1].subject.subject_id !== slot.subject.subject_id;
                                        const rowTone = dirty ? 'bg-amber-50' : 'bg-white';
                                        return (
                                            <tr key={slot.key} className={`${rowTone} border-b ${firstOfSubject ? 'border-t-2 border-t-slate-200' : ''} border-line`}>
                                                <th scope="row" className={`sticky left-0 z-10 ${rowTone} px-3 py-2 text-left align-middle font-normal sm:px-4`}>
                                                    {firstOfSubject
                                                        ? <span className="block font-bold text-slate-900">{slot.subject.subject_name}</span>
                                                        : <span className="sr-only">{slot.subject.subject_name}</span>}
                                                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                                        {slot.room && <span className="chip chip-info">{slot.room}</span>}
                                                        <StatusChip savedCount={savedOf(slot).size} draftCount={selection.size} dirty={dirty} />
                                                        <button type="button" onClick={() => openSlot(slot)} className="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-bold text-indigo-800 underline-offset-2 hover:bg-indigo-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700">เลือกรายข้อ</button>
                                                    </span>
                                                    {slot.teachers.length > 0 && <span className="mt-0.5 block text-xs text-slate-500">{slot.teachers.join(', ')}</span>}
                                                </th>
                                                {gradeGroups.map(group => {
                                                    const loIds = group.los.map(lo => lo.lo_id);
                                                    const cell = areaSelectionState(loIds, selection);
                                                    const stateLabel = cell.state === 'all' ? 'ใช้ครบทุกข้อ' : cell.state === 'some' ? `ใช้ ${cell.count} จาก ${cell.total} ข้อ` : 'ไม่ใช้';
                                                    return (
                                                        <td key={group.area} className="px-1 py-1 text-center">
                                                            <label className={`mx-auto flex min-h-11 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg ${suggested && cell.state !== 'none' ? 'border-2 border-dashed border-amber-500 bg-amber-100/60' : 'hover:bg-slate-100'}`}>
                                                                <AreaCheckbox state={cell.state} label={`${slot.subject.subject_name} ${slot.room || ''} ${shortAreaName(group.area)}: ${stateLabel}`} onChange={() => setSelection(slot, toggleArea(selection, loIds))} />
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
                    {gradeSlots.some(slot => dirtySet.has(slot.key) && suggestedKeys.has(slot.key)) && (
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
                        <div className="border-b border-line p-4">
                            <label className="relative block">
                                <span className="sr-only">ค้นหาวิชา</span>
                                <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" aria-hidden="true" />
                                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อวิชาหรือชั้น" className="min-h-11 w-full rounded-xl border border-field bg-white pl-10 pr-3 text-sm placeholder:text-slate-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                            </label>
                        </div>
                        <div className="max-h-[36rem] overflow-y-auto">
                            {filteredSubjects.length === 0 && <p className="p-6 text-center text-sm text-slate-600">ไม่พบวิชาที่ตรงกับที่ค้นหา</p>}
                            {gradesOf(filteredSubjects).map(item => (
                                <div key={item}>
                                    <h3 className="sticky top-0 z-10 border-b border-line bg-slate-50 px-4 py-2 text-xs font-bold text-slate-700">{item}</h3>
                                    <ul className="divide-y divide-line">
                                        {filteredSubjects.filter(subject => subject.grade_level === item).map(subject => {
                                            const active = subject.subject_id === selectedSubjectId;
                                            const progress = subjectProgress(subject);
                                            return (
                                                <li key={subject.subject_id}>
                                                    <button type="button" aria-current={active ? 'true' : undefined} onClick={() => { setSelectedSubjectId(subject.subject_id); setSelectedRoom(''); setMobileDetailOpen(true); }} className={`flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left ${active ? 'surface-selected' : 'hover:bg-slate-50'}`}>
                                                        <span className={`min-w-0 text-sm ${active ? 'font-bold text-indigo-950' : 'font-semibold text-slate-900'}`}>{subject.subject_name}</span>
                                                        <span className={`chip ${progress.dirty ? 'chip-warning' : progress.done === progress.total ? 'chip-success' : 'chip-neutral'}`}>{progress.done}/{progress.total}</span>
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
                        {!selectedSubject || !activeSlot ? (
                            <p className="p-10 text-center text-sm text-slate-600">เลือกวิชาจากรายการด้านซ้าย</p>
                        ) : (
                            <>
                                <div className="border-b border-line p-4 sm:p-6">
                                    <button type="button" onClick={() => setMobileDetailOpen(false)} className="btn-ghost mb-2 lg:hidden"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับไปรายการวิชา</button>
                                    <h2 id="subject-lo-title" className="text-lg font-bold text-slate-950">{selectedSubject.subject_name} <span className="chip chip-info align-middle">{selectedSubject.grade_level}</span></h2>
                                    {subjectSlots.length > 1 || activeSlot.room ? (
                                        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="เลือกห้อง">
                                            {subjectSlots.map(slot => {
                                                const active = slot.key === activeSlot.key;
                                                const count = savedOf(slot).size;
                                                return (
                                                    <button key={slot.key} type="button" aria-pressed={active} onClick={() => setSelectedRoom(slot.room || '')} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold ${active ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'}`}>
                                                        {slot.room}
                                                        <span className={`text-xs tabular-nums ${active ? 'text-indigo-100' : count ? 'text-emerald-700' : 'text-amber-700'}`}>{dirtySet.has(slot.key) ? 'แก้อยู่' : count ? `${count} ข้อ` : 'ยังไม่เลือก'}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                    <p className="mt-2 text-sm text-slate-600" aria-live="polite">
                                        {activeSlot.room ? `ห้อง ${activeSlot.room} · ` : ''}เลือกแล้ว {selectionOf(activeSlot).size} ข้อ
                                        {activeSlot.teachers.length > 0 && ` · ครูผู้สอน ${activeSlot.teachers.join(', ')}`}
                                    </p>
                                    {activeEdit?.updated_at && <p className="mt-0.5 text-xs text-slate-500">แก้ล่าสุด{names.get(activeEdit.updated_by) ? `โดย ${names.get(activeEdit.updated_by)}` : ''} {formatWhen(activeEdit.updated_at)}</p>}
                                </div>
                                <div className="p-4 sm:p-6">
                                    <LoAreaPicker
                                        learningOutcomes={subjectLos}
                                        selection={selectionOf(activeSlot)}
                                        onChange={next => setSelection(activeSlot, next)}
                                        emptyText={`ยังไม่มี LO ของ ${selectedSubject.grade_level}`}
                                    />
                                </div>
                            </>
                        )}
                    </section>
                </div>
            )}

            {dirtyKeys.length > 0 && (
                <div className="sticky bottom-0 z-30 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-lg sm:p-4" role="region" aria-label="รายการที่ยังไม่บันทึก">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 text-sm font-bold text-amber-950" aria-live="polite">
                            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
                            ยังไม่บันทึก {dirtyKeys.length} {unit} เปลี่ยนชั้นหรือวิชาได้ รายการไม่หาย
                        </p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button type="button" onClick={discardAll} disabled={saving} className="btn-secondary"><Undo2 className="h-4 w-4" aria-hidden="true" />ยกเลิกการเปลี่ยนแปลง</button>
                            <button type="button" onClick={saveAll} disabled={saving} className="btn-primary"><Save className="h-4 w-4" aria-hidden="true" />{saving ? 'กำลังบันทึก...' : `บันทึก ${dirtyKeys.length} ${unit}`}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
