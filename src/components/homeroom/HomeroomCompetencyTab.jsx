import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, PenLine, Printer, RefreshCw, Save, Send, Sparkles, Table2, Undo2, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAllByIn, supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useDialog } from '../../lib/dialogContext';
import { normalizeCompetencyArea } from '../../constants/curriculum2568';
import { shortAreaName } from '../../lib/loMapping';
import {
    ROOM_STATUS, SUMMARY_LEVELS, buildNarrativeDraft, collectRoomEvidence, decisionKey, isPublishedDecision, passStatusFor, roomStatus, summaryProgress,
} from '../../lib/homeroomSummary';
import { HOMEROOM_SUMMARY_SQL_HINT, homeroomSummarySupported } from '../../lib/homeroomSummaryApi';
import { areasToSubmit, canEditArea } from '../../lib/homeroomScope';
import { AUTOSAVE_MS, AUTOSAVE_SECONDS } from '../../lib/autosave';

// สรุปความสามารถรายด้านของห้องเรียน
// ครูผู้สอนแต่ละวิชาเขียนข้อความพฤติกรรมราย LO ไว้แล้ว หน้านี้รวมข้อความของทุกวิชามาให้คนที่สรุป
// เลือกระดับและเขียนคำบรรยายด้านละหนึ่งข้อความ แล้วกดส่ง ผลออกสู่นักเรียนและผู้ปกครองทันที แก้ได้ตลอด
// ห้องหนึ่งมีได้ถึง 40 คน × 10 ด้าน จึงมีทั้งตารางทั้งห้องสำหรับเลือกระดับรวดเดียว และหน้ารายคนสำหรับเขียนคำบรรยาย
// editableAreas = null คือแก้ได้ทุกด้าน (ครูประจำชั้นและฝ่ายวิชาการ) หรือ Set ของด้านที่ครูรายวิชานั้นรับผิดชอบ
// ครูรายวิชากดส่งผลสรุปได้เฉพาะด้านของตัวเอง ครูประจำชั้นส่งทั้งห้อง
// ระบบบันทึกฉบับร่างให้อัตโนมัติ (AUTOSAVE_SECONDS) และมีปุ่มบันทึกให้กดเองได้ตลอด

const DECISION_SELECT = 'decision_id, student_id, competency_area, final_level, summary_text, decision_status, decision_reason, submitted_at';
const fullName = info => `${info?.prefix || ''}${info?.first_name || ''} ${info?.last_name || ''}`.trim();
const draftKey = (schoolId, year, semester, room) => `homeroomSummaryDraft:${schoolId}:${year}:${semester}:${room}`;
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

export default function HomeroomCompetencyTab({ room, students, data, academicYear, semester, editableAreas = null, canSubmitRoom = true }) {
    const navigate = useNavigate();
    const dialog = useDialog();
    const { currentUser } = useAuth();
    const [supported, setSupported] = useState(null);
    const [rows, setRows] = useState(new Map());
    const [drafts, setDrafts] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState('table');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const restoredRef = useRef('');
    const storageKey = draftKey(currentUser?.school_id, academicYear, semester, room);
    const studentIds = useMemo(() => students.map(student => student.id), [students]);

    // ด้านที่ห้องนี้ใช้จริง และข้อความ LO ของนักเรียนแต่ละคนแยกตามด้าน
    const { areas, notesByKey } = useMemo(
        () => collectRoomEvidence(data?.enrollments, data?.loData, data?.evalData, { areas: data?.areaNames }),
        [data],
    );

    // ครูรายวิชาเห็นทุกด้านของห้องเพื่อรู้ภาพรวม แต่แก้ได้เฉพาะด้านของวิชาตัวเอง
    const canEdit = useCallback(area => canEditArea(editableAreas, area), [editableAreas]);
    const myAreas = useMemo(() => areas.filter(canEdit), [areas, canEdit]);
    const doneAreasOf = useCallback(studentId => myAreas.filter(area => {
        const key = decisionKey(studentId, area);
        const row = rows.get(key);
        const value = drafts.has(key) ? drafts.get(key) : { level: row?.final_level || '', summary: row?.summary_text || '' };
        return value.level && value.summary?.trim();
    }).length, [drafts, myAreas, rows]);

    // ชั้นที่มีหลายด้าน ตารางจะกว้างเกินจอ จึงมีปุ่มเลื่อนให้กดแทนการลากอย่างเดียว
    const scrollRef = useRef(null);
    const [canScroll, setCanScroll] = useState(false);
    useEffect(() => {
        const box = scrollRef.current;
        if (!box) { setCanScroll(false); return undefined; }
        const update = () => setCanScroll(box.scrollWidth - box.clientWidth > 8);
        update();
        // วัดอีกครั้งหลังเบราว์เซอร์จัดตารางเสร็จ ตอน effect ทำงานความกว้างจริงอาจยังไม่นิ่ง
        const timer = setTimeout(update, 300);
        const observer = new ResizeObserver(update);
        observer.observe(box);
        // ความกว้างของกล่องไม่เปลี่ยนตอนคอลัมน์เพิ่ม จึงต้องเฝ้าดูตารางด้วย
        if (box.firstElementChild) observer.observe(box.firstElementChild);
        window.addEventListener('resize', update);
        return () => {
            clearTimeout(timer);
            observer.disconnect();
            window.removeEventListener('resize', update);
        };
    }, [view, areas.length, students.length, loading]);
    // ตั้งค่า scrollLeft ตรง ๆ ความนุ่มมาจาก CSS scroll-smooth เบราว์เซอร์ที่ไม่รองรับก็ยังเลื่อนได้
    const scrollAreas = direction => {
        const box = scrollRef.current;
        if (box) box.scrollLeft += direction * 220;
    };

    const load = useCallback(async () => {
        if (!currentUser?.school_id || !room || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        try {
            const ok = await homeroomSummarySupported();
            setSupported(ok);
            if (!ok) return;
            const decisionRows = await fetchAllByIn(studentIds, (batch, from, to) => supabase.from('competency_area_final_decisions')
                .select(DECISION_SELECT).eq('school_id', currentUser.school_id)
                .eq('academic_year', Number(academicYear)).eq('semester', Number(semester))
                .in('student_id', batch).range(from, to));
            const map = new Map(decisionRows.map(row => [decisionKey(row.student_id, row.competency_area), row]));
            setRows(map);

            // กู้รายการที่ยังไม่บันทึกของห้องนี้ ครั้งเดียวต่อการเปิดห้อง
            if (restoredRef.current !== storageKey) {
                restoredRef.current = storageKey;
                try {
                    const stored = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
                    const restored = new Map(Object.entries(stored || {}));
                    setDrafts(restored);
                    if (restored.size) toast(`กู้รายการที่ยังไม่บันทึกกลับมา ${restored.size} รายการ`, { icon: '↩️' });
                } catch { setDrafts(new Map()); }
            }
        } catch (error) {
            setLoadError(error.message || 'โหลดผลสรุปไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, room, semester, storageKey, studentIds]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setSelectedStudentId(current => (studentIds.includes(current) ? current : studentIds[0] || '')); }, [studentIds]);

    const valueOf = useCallback((studentId, area) => {
        const key = decisionKey(studentId, area);
        if (drafts.has(key)) return drafts.get(key);
        const row = rows.get(key);
        return { level: row?.final_level || '', summary: row?.summary_text || '' };
    }, [drafts, rows]);

    const dirtyKeys = useMemo(() => [...drafts.entries()].filter(([key, value]) => {
        const row = rows.get(key);
        return (value.level || '') !== (row?.final_level || '') || (value.summary || '').trim() !== (row?.summary_text || '').trim();
    }).map(([key]) => key), [drafts, rows]);

    useEffect(() => {
        if (restoredRef.current !== storageKey) return;
        try {
            if (!dirtyKeys.length) sessionStorage.removeItem(storageKey);
            else sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(dirtyKeys.map(key => [key, drafts.get(key)]))));
        } catch { /* เก็บไม่ได้ก็ยังใช้หน้าได้ */ }
    }, [dirtyKeys, drafts, storageKey]);

    useEffect(() => {
        if (!dirtyKeys.length) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirtyKeys.length]);

    const setValue = (studentId, area, patch) => {
        if (!canEdit(area)) return;
        const key = decisionKey(studentId, area);
        setDrafts(previous => {
            const map = new Map(previous);
            map.set(key, { ...valueOf(studentId, area), ...patch });
            return map;
        });
    };

    const valuesByKey = useMemo(() => {
        const map = new Map();
        studentIds.forEach(studentId => myAreas.forEach(area => map.set(decisionKey(studentId, area), valueOf(studentId, area))));
        return map;
    }, [myAreas, studentIds, valueOf]);
    const progress = summaryProgress(studentIds, myAreas, valuesByKey);
    const publishedByArea = useMemo(() => new Map(areas.map(area => [
        area,
        studentIds.filter(studentId => isPublishedDecision(rows.get(decisionKey(studentId, area)))).length,
    ])), [areas, rows, studentIds]);
    const roomRows = useMemo(() => studentIds.flatMap(studentId => myAreas.map(area => rows.get(decisionKey(studentId, area)))).filter(Boolean), [myAreas, rows, studentIds]);
    const status = roomStatus(roomRows, studentIds.length * myAreas.length);
    const returnedRows = roomRows.filter(row => row.decision_status === 'returned');

    const emptyNarratives = studentIds.flatMap(studentId => myAreas.map(area => ({ studentId, area })))
        .filter(({ studentId, area }) => !valueOf(studentId, area).summary?.trim() && notesByKey.get(decisionKey(studentId, area))?.length);

    const draftAllNarratives = () => {
        setDrafts(previous => {
            const map = new Map(previous);
            emptyNarratives.forEach(({ studentId, area }) => {
                map.set(decisionKey(studentId, area), { ...valueOf(studentId, area), summary: buildNarrativeDraft(notesByKey.get(decisionKey(studentId, area))) });
            });
            return map;
        });
        toast.success(`ร่างคำบรรยายจากข้อความ LO ให้ ${emptyNarratives.length} รายการแล้ว ตรวจและแก้ก่อนบันทึก`);
    };

    const fillAreaLevel = (area, level) => {
        if (!level || !canEdit(area)) return;
        setDrafts(previous => {
            const map = new Map(previous);
            studentIds.forEach(studentId => {
                const key = decisionKey(studentId, area);
                const current = map.get(key) || valueOf(studentId, area);
                if (current.level) return;
                map.set(key, { ...current, level });
            });
            return map;
        });
        toast.success(`ใส่ระดับ ${level} ให้คนที่ยังว่างในด้าน${shortAreaName(area)}แล้ว`);
    };

    const saveDrafts = async ({ quiet = false } = {}) => {
        const keys = [...dirtyKeys];
        if (!keys.length) return true;
        // จำค่าที่ส่งไปบันทึก ถ้าครูแก้ช่องเดิมระหว่างรอ ค่าใหม่ต้องยังค้างเป็นฉบับร่างรอบันทึกรอบถัดไป
        const sentValues = new Map(keys.map(key => [key, drafts.get(key)]));
        setSaving(true);
        try {
            const now = new Date().toISOString();
            const payload = keys.map(key => {
                const [studentId, ...areaParts] = key.split(':');
                const area = normalizeCompetencyArea(areaParts.join(':'));
                const value = drafts.get(key);
                return {
                    school_id: currentUser.school_id,
                    student_id: studentId,
                    competency_area: area,
                    academic_year: Number(academicYear),
                    semester: Number(semester),
                    final_level: value.level || null,
                    pass_status: passStatusFor(value.level),
                    summary_text: value.summary?.trim() || null,
                    decision_status: 'draft',
                    summarized_by: currentUser.teacher_id || null,
                    summarized_at: now,
                    updated_at: now,
                };
            });
            const saved = [];
            for (const part of chunk(payload, 300)) {
                const { data: savedRows, error } = await supabase.from('competency_area_final_decisions')
                    .upsert(part, { onConflict: 'student_id,competency_area,academic_year,semester' })
                    .select(DECISION_SELECT);
                if (error) throw error;
                saved.push(...(savedRows || []));
            }
            setRows(previous => {
                const map = new Map(previous);
                saved.forEach(row => map.set(decisionKey(row.student_id, row.competency_area), row));
                return map;
            });
            setDrafts(previous => new Map([...previous].filter(([key, value]) => sentValues.get(key) !== value)));
            setLastSaved(new Date());
            if (!quiet) toast.success(`บันทึกฉบับร่าง ${keys.length} รายการแล้ว`);
            return true;
        } catch (error) {
            toast.error(`บันทึกไม่สำเร็จ: ${error.message} รายการที่แก้ไว้ยังอยู่ ลองบันทึกอีกครั้ง`);
            return false;
        } finally {
            setSaving(false);
        }
    };

    // บันทึกฉบับร่างให้อัตโนมัติทุก AUTOSAVE_SECONDS วินาทีที่มีการแก้ ครูเขียนทีละคนได้ไม่ต้องเสร็จในครั้งเดียว
    // ไม่นับถอยหลังให้เห็นทุกวินาที เพราะข้อความที่เปลี่ยนเองรบกวนคนที่ต้องมีสมาธิและโปรแกรมอ่านหน้าจอ (WCAG 2.2.2)
    const saveDraftsRef = useRef(null);
    saveDraftsRef.current = saveDrafts;
    const autoSaveTimerRef = useRef(null);
    useEffect(() => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        if (dirtyKeys.length && !saving) {
            autoSaveTimerRef.current = setTimeout(() => saveDraftsRef.current?.({ quiet: true }), AUTOSAVE_MS);
        }
        return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
    }, [dirtyKeys.length, saving]);

    const submitRoom = async () => {
        const missing = progress.missing;
        // ครูรายวิชาส่งเฉพาะด้านของวิชาตัวเอง ด้านอื่นของห้องไม่ถูกแตะ
        const scopedAreas = areasToSubmit(editableAreas, myAreas);
        if (scopedAreas && !scopedAreas.length) return;
        const confirmed = await dialog.confirm({
            title: scopedAreas ? `ส่งผลสรุป ${scopedAreas.length} ด้านของคุณ · ห้อง ${room}` : `ส่งผลสรุปห้อง ${room}`,
            message: [
                scopedAreas ? `ส่งเฉพาะด้าน${scopedAreas.map(shortAreaName).join(' · ')} ด้านอื่นของห้องครูท่านอื่นหรือครูประจำชั้นเป็นผู้ส่ง` : '',
                missing > 0
                    ? `ยังไม่ครบ ${missing} รายการ (ต้องมีทั้งระดับและคำบรรยาย) รายการที่ยังไม่มีระดับจะไม่ถูกส่ง`
                    : `ครบทั้ง ${progress.total} รายการ`,
                'ส่งแล้วนักเรียนและผู้ปกครองเห็นผลทันที ไม่ต้องรอฝ่ายวิชาการรับรอง และยังแก้ไขได้ตลอด ถ้าแก้หลังส่งให้กดส่งอีกครั้ง',
            ].filter(Boolean).join('\n'),
            confirmLabel: 'ส่งผลสรุป',
        });
        if (!confirmed) return;
        const saved = await saveDrafts({ quiet: true });
        if (!saved) return;
        setSaving(true);
        try {
            const now = new Date().toISOString();
            const updated = [];
            for (const batch of chunk(studentIds, 150)) {
                let query = supabase.from('competency_area_final_decisions')
                    .update({ decision_status: 'submitted', submitted_at: now, updated_at: now })
                    .eq('school_id', currentUser.school_id).eq('academic_year', Number(academicYear)).eq('semester', Number(semester))
                    .in('student_id', batch).in('decision_status', ['draft', 'returned', 'pending']).not('final_level', 'is', null);
                if (scopedAreas) query = query.in('competency_area', scopedAreas);
                const { data: updatedRows, error } = await query.select(DECISION_SELECT);
                if (error) throw error;
                updated.push(...(updatedRows || []));
            }
            setRows(previous => {
                const map = new Map(previous);
                updated.forEach(row => map.set(decisionKey(row.student_id, row.competency_area), row));
                return map;
            });
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: scopedAreas ? 'submit_subject_competency_summary' : 'submit_homeroom_competency_summary',
                entity_type: 'homeroom',
                detail: {
                    room, academic_year: Number(academicYear), semester: Number(semester), submitted_count: updated.length,
                    ...(scopedAreas ? { areas: scopedAreas } : {}),
                },
            });
            toast.success(updated.length
                ? `ส่งผลสรุปแล้ว ${updated.length} รายการ นักเรียนและผู้ปกครองเห็นผลได้ทันที`
                : 'ไม่มีรายการใหม่ให้ส่ง รายการที่มีระดับแล้วถูกส่งไปก่อนหน้านี้แล้ว');
        } catch (error) {
            toast.error('ส่งไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const discardDrafts = async () => {
        const confirmed = await dialog.confirm({
            title: 'ยกเลิกการแก้ไขที่ยังไม่บันทึก',
            message: `รายการที่แก้ไว้ ${dirtyKeys.length} รายการจะกลับเป็นค่าที่บันทึกล่าสุด`,
            confirmLabel: 'ยกเลิกการแก้ไข',
            cancelLabel: 'เก็บไว้ก่อน',
            tone: 'danger',
        });
        if (confirmed) setDrafts(new Map());
    };

    if (loading && supported === null) return <div className="flex min-h-72 items-center justify-center" role="status"><div className="loader" aria-label="กำลังโหลดผลสรุป" /></div>;
    if (supported === false) {
        return (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6" role="alert">
                <p className="font-bold text-amber-950">ยังใช้การสรุปโดยครูประจำชั้นไม่ได้</p>
                <p className="mt-1 text-sm text-amber-900">{HOMEROOM_SUMMARY_SQL_HINT}</p>
            </section>
        );
    }
    if (loadError) {
        return (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
                <p className="font-bold text-rose-950">โหลดผลสรุปไม่สำเร็จ</p>
                <p className="mt-1 text-sm text-rose-800">{loadError}</p>
                <button type="button" onClick={load} className="btn-secondary mt-3"><RefreshCw className="h-4 w-4" aria-hidden="true" />ลองอีกครั้ง</button>
            </section>
        );
    }
    if (!areas.length) {
        return (
            <section className="rounded-2xl border border-line bg-white p-8 text-center">
                <p className="font-bold text-slate-900">วิชาของห้อง {room} ยังไม่ได้กำหนด LO</p>
                <p className="mt-1 text-sm text-slate-600">ครูผู้สอนต้องเลือก LO ของห้องนี้ก่อน จึงจะเขียนข้อความพฤติกรรมและสรุปรายด้านได้</p>
            </section>
        );
    }

    const percent = progress.total ? Math.round((progress.complete / progress.total) * 100) : 0;
    const selectedIndex = students.findIndex(student => student.id === selectedStudentId);
    const selectedStudent = students[selectedIndex];
    const savedAtLabel = lastSaved ? lastSaved.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';
    const printRoom = () => navigate(`/batch-report/${encodeURIComponent(room)}/${academicYear}/${semester}`);
    const printStudent = studentId => navigate(`/report/${studentId}/${academicYear}/${semester}`);

    return (
        <div className="space-y-5">
            <section className="rounded-2xl border border-line bg-white p-4 sm:p-6" aria-labelledby="homeroom-summary-title">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 id="homeroom-summary-title" className="text-lg font-bold text-slate-950">สรุปความสามารถรายด้าน · ห้อง {room}</h2>
                            <span className={`chip ${ROOM_STATUS[status].chip}`}>{ROOM_STATUS[status].label}</span>
                        </div>
                        <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                            <li><strong className="text-slate-900">1)</strong> เลือกระดับของแต่ละด้าน</li>
                            <li><strong className="text-slate-900">2)</strong> เขียนคำบรรยายของแต่ละด้าน (แบบ สพฐ. ต้องมีคำบรรยาย)</li>
                            <li><strong className="text-slate-900">3)</strong> {canSubmitRoom ? 'กดส่งผลสรุป ผู้ปกครองเห็นผลทันที' : 'กดส่งผลสรุปด้านของคุณ ผู้ปกครองเห็นผลด้านนั้นทันที'}</li>
                        </ol>
                        <p className="mt-1 text-sm text-slate-600">ระบบร่างคำบรรยายจากข้อความ LO ของครูผู้สอนทุกวิชาให้ได้ แล้วแก้เพิ่มเองได้</p>
                        <p className="mt-1 text-sm text-slate-700">
                            เขียนทีละคนได้ ไม่ต้องเสร็จในครั้งเดียว ระบบบันทึกให้อัตโนมัติทุก {AUTOSAVE_SECONDS} วินาที และกดปุ่ม “บันทึก” เองได้ตลอด
                            {savedAtLabel && <span className="font-bold text-emerald-800"> · บันทึกล่าสุด {savedAtLabel} น.</span>}
                        </p>
                        {!canSubmitRoom && (myAreas.length ? (
                            <p className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm leading-6 text-indigo-950">
                                คุณสรุปได้ {myAreas.length} ด้านจากวิชาที่คุณสอน: {myAreas.map(shortAreaName).join(' · ')} ด้านอื่นในตารางเป็นของครูท่านอื่น จะแก้ไม่ได้
                                <span className="mt-1 block">สรุปครบแล้วกด “ส่งผลสรุป” ระบบส่งเฉพาะด้านของคุณ ผู้ปกครองเห็นผลด้านนั้นทันที ครูประจำชั้นดูได้ว่าด้านไหนส่งแล้วที่หัวคอลัมน์</span>
                            </p>
                        ) : (
                            <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                                วิชาที่คุณสอนในห้อง {room} ยังไม่ได้เลือก LO จึงยังไม่มีด้านให้คุณสรุป เปิดเมนู “งานของฉัน” แล้วกด “แก้ LO” ของวิชานั้นก่อน
                            </p>
                        ))}
                        <div className="mt-3 flex items-center gap-3">
                            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.complete} aria-label="สรุปครบแล้ว">
                                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${percent}%` }} />
                            </div>
                            <p className="shrink-0 text-sm font-bold text-slate-900 tabular-nums">ครบ {progress.complete} จาก {progress.total} รายการ</p>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{students.length} คน × {myAreas.length} ด้าน{canSubmitRoom ? '' : 'ที่คุณสรุป'} · มีระดับแล้ว {progress.leveled} · มีคำบรรยายแล้ว {progress.narrated}</p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
                        <button type="button" onClick={() => saveDrafts()} disabled={saving || !dirtyKeys.length} className="btn-primary bg-emerald-700 hover:bg-emerald-800 focus-visible:ring-emerald-700">
                            <Save className="h-4 w-4" aria-hidden="true" />
                            {saving ? 'กำลังบันทึก...' : dirtyKeys.length ? `บันทึก (${dirtyKeys.length})` : 'บันทึกแล้ว'}
                        </button>
                        <button type="button" onClick={draftAllNarratives} disabled={!emptyNarratives.length} className="btn-secondary"><Sparkles className="h-4 w-4" aria-hidden="true" />ร่างคำบรรยายจาก LO ({emptyNarratives.length})</button>
                        {canSubmitRoom && <button type="button" onClick={printRoom} className="btn-secondary"><Printer className="h-4 w-4" aria-hidden="true" />พิมพ์รายงานผู้ปกครองทั้งห้อง</button>}
                        <button type="button" onClick={submitRoom} disabled={saving || progress.leveled === 0 || !myAreas.length} className="btn-primary"><Send className="h-4 w-4" aria-hidden="true" />ส่งผลสรุป</button>
                        <p className="text-xs leading-5 text-slate-600 sm:max-w-56">
                            {canSubmitRoom
                                ? 'ส่งผลสรุปแล้วผู้ปกครองและนักเรียนเห็นผลทันที และฝ่ายวิชาการเห็นว่าห้องนี้สรุปเสร็จแล้ว แก้ไขได้ตลอด'
                                : `ส่งเฉพาะ ${myAreas.length} ด้านของคุณ ผู้ปกครองเห็นผลด้านนั้นทันที แก้ไขได้ตลอด`}
                        </p>
                    </div>
                </div>
                {returnedRows.length > 0 && (
                    <div className="mt-4 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="status">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
                        <p>ฝ่ายวิชาการขอให้แก้ {returnedRows.length} รายการ ระหว่างนี้ผู้ปกครองจะไม่เห็นผลเหล่านี้ เปิดดูเหตุผลได้ในหน้ารายคน (ช่องที่มีกรอบสีแดง) แก้แล้วกดส่งอีกครั้ง</p>
                    </div>
                )}
                <div className="mt-4 flex w-fit rounded-xl bg-slate-100 p-1" role="group" aria-label="มุมมอง">
                    <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold ${view === 'table' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-700'}`}><Table2 className="h-4 w-4" aria-hidden="true" />ตารางทั้งห้อง</button>
                    <button type="button" aria-pressed={view === 'student'} onClick={() => setView('student')} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-bold ${view === 'student' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-700'}`}><UserRound className="h-4 w-4" aria-hidden="true" />รายคน</button>
                </div>
            </section>

            {view === 'table' && (
                <section className="overflow-hidden rounded-2xl border border-line bg-white" aria-label="ตารางระดับทั้งห้อง">
                    <p className="border-b border-line px-4 py-3 text-sm text-slate-700 sm:px-6">ช่องในตารางคือ<strong className="font-bold text-slate-900">ระดับความสามารถ</strong>ของนักเรียนแต่ละคน ช่องบนหัวคอลัมน์ใช้เติมระดับให้คนที่ยังว่างทั้งด้านรวดเดียว ส่วนคำบรรยายกดที่ไอคอนดินสอหรือชื่อนักเรียนเพื่อเขียน · ใต้ชื่อด้านบอกว่าส่งผลแล้วกี่คน</p>
                    {canScroll && (
                        <div className="flex items-center justify-end gap-2 border-b border-line px-4 py-2 sm:px-6">
                            <span className="mr-auto text-xs text-slate-600">เลื่อนดูด้านอื่นได้</span>
                            <button type="button" onClick={() => scrollAreas(-1)} aria-label="เลื่อนไปด้านก่อนหน้า" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700">
                                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                            </button>
                            <button type="button" onClick={() => scrollAreas(1)} aria-label="เลื่อนไปด้านถัดไป" className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700">
                                <ChevronRight className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    )}
                    <div ref={scrollRef} className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm" style={{ minWidth: `${15 + areas.length * 9.5}rem` }}>
                            <caption className="sr-only">ระดับความสามารถรายด้านของนักเรียนห้อง {room}</caption>
                            <thead className="bg-slate-50 text-slate-700">
                                <tr>
                                    <th scope="col" className="sticky left-0 z-10 min-w-[11rem] border-b border-line bg-slate-50 px-3 py-3 text-left font-bold sm:min-w-[15rem] sm:px-4">
                                        นักเรียน
                                        <span className="mt-0.5 block text-xs font-normal text-slate-600">ระดับความสามารถรายด้าน</span>
                                    </th>
                                    {areas.map(area => (
                                        <th key={area} scope="col" className={`min-w-[8.5rem] border-b border-line px-2 py-2 text-left align-bottom text-xs font-bold ${canEdit(area) ? '' : 'bg-slate-100 text-slate-600'}`}>
                                            <span className="block leading-5">{shortAreaName(area)}</span>
                                            <span className={`block text-[11px] font-semibold tabular-nums ${publishedByArea.get(area) === students.length ? 'text-emerald-700' : 'text-slate-600'}`}>ส่งแล้ว {publishedByArea.get(area) || 0}/{students.length}</span>
                                            {canEdit(area) ? (
                                                <select aria-label={`เติมระดับให้คนที่ยังว่าง ด้าน${shortAreaName(area)}`} value="" onChange={event => fillAreaLevel(area, event.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-field bg-white px-2 text-xs font-semibold text-slate-700">
                                                    <option value="">เติมคนที่ว่าง…</option>
                                                    {SUMMARY_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                                                </select>
                                            ) : <span className="mt-1 block text-xs font-semibold text-slate-600">ของครูท่านอื่น</span>}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {students.map((student, index) => {
                                    const done = doneAreasOf(student.id);
                                    return (
                                        <tr key={student.id} className="border-b border-line last:border-b-0">
                                            <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-2 text-left align-middle font-normal sm:px-4">
                                                <button type="button" onClick={() => { setSelectedStudentId(student.id); setView('student'); setMobileDetailOpen(true); }} className="text-left font-bold text-indigo-900 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700">
                                                    {index + 1}. {fullName(student.info)}
                                                </button>
                                                <span className={`mt-1 block text-xs tabular-nums ${done === myAreas.length ? 'font-bold text-emerald-700' : 'text-slate-600'}`}>ครบ {done}/{myAreas.length} ด้าน (ระดับ + คำบรรยาย)</span>
                                            </th>
                                            {areas.map(area => {
                                                const key = decisionKey(student.id, area);
                                                const row = rows.get(key);
                                                const value = valueOf(student.id, area);
                                                const dirty = dirtyKeys.includes(key);
                                                return (
                                                    <td key={area} className={`px-2 py-1.5 align-middle ${!canEdit(area) ? 'bg-slate-50' : row?.decision_status === 'returned' ? 'bg-rose-50' : dirty ? 'bg-amber-50' : ''}`}>
                                                        <div className="flex items-center gap-1.5">
                                                            <select
                                                                aria-label={`ระดับ ${shortAreaName(area)} ของ ${fullName(student.info)}${canEdit(area) ? '' : ' (ด้านของครูท่านอื่น แก้ไม่ได้)'}`}
                                                                value={value.level}
                                                                disabled={!canEdit(area)}
                                                                onChange={event => setValue(student.id, area, { level: event.target.value })}
                                                                className="min-h-9 w-full min-w-[6rem] rounded-lg border border-field bg-white px-2 text-xs font-bold text-slate-800 disabled:bg-slate-100 disabled:text-slate-600"
                                                            >
                                                                <option value="">—</option>
                                                                {SUMMARY_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                                                            </select>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setSelectedStudentId(student.id); setView('student'); setMobileDetailOpen(true); }}
                                                                title={canEdit(area) ? (value.summary?.trim() ? 'มีคำบรรยายแล้ว แก้ไขได้' : 'ยังไม่มีคำบรรยาย กดเพื่อเขียน') : 'ด้านของครูท่านอื่น กดเพื่อดูข้อความ'}
                                                                aria-label={`${canEdit(area) ? (value.summary?.trim() ? 'แก้คำบรรยาย' : 'เขียนคำบรรยาย') : 'ดูคำบรรยาย'} ${shortAreaName(area)} ของ ${fullName(student.info)}`}
                                                                className={`shrink-0 rounded-md p-1 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 ${!canEdit(area) ? 'text-slate-500' : value.summary?.trim() ? 'text-emerald-700' : 'text-amber-700'}`}
                                                            >
                                                                <PenLine className="h-4 w-4" aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-xs text-slate-600 sm:px-6">
                        <span className="inline-flex items-center gap-1"><PenLine className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />มีคำบรรยายแล้ว</span>
                        <span className="inline-flex items-center gap-1"><PenLine className="h-3.5 w-3.5 text-amber-700" aria-hidden="true" />ยังไม่มีคำบรรยาย กดเพื่อเขียน</span>
                        <span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded bg-rose-100" aria-hidden="true" />ฝ่ายวิชาการขอให้แก้</span>
                        {!canSubmitRoom && <span className="inline-flex items-center gap-1"><span className="h-3 w-5 rounded bg-slate-100" aria-hidden="true" />ด้านของครูท่านอื่น แก้ไม่ได้</span>}
                    </p>
                </section>
            )}

            {view === 'student' && selectedStudent && (
                <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
                    <aside className={`rounded-2xl border border-line bg-white ${mobileDetailOpen ? 'hidden lg:block' : ''}`} aria-label="รายชื่อนักเรียน">
                        <ul className="max-h-[40rem] divide-y divide-line overflow-y-auto">
                            {students.map((student, index) => {
                                const done = doneAreasOf(student.id);
                                const returned = myAreas.some(area => rows.get(decisionKey(student.id, area))?.decision_status === 'returned');
                                const active = student.id === selectedStudentId;
                                return (
                                    <li key={student.id}>
                                        <button type="button" aria-current={active ? 'true' : undefined} onClick={() => { setSelectedStudentId(student.id); setMobileDetailOpen(true); }} className={`flex min-h-14 w-full items-center justify-between gap-2 px-4 py-2 text-left ${active ? 'surface-selected' : 'hover:bg-slate-50'}`}>
                                            <span className="min-w-0 text-sm"><span className={active ? 'font-bold text-indigo-950' : 'font-semibold text-slate-900'}>{index + 1}. {fullName(student.info)}</span></span>
                                            <span className={`chip ${returned ? 'chip-danger' : done === myAreas.length ? 'chip-success' : 'chip-neutral'} shrink-0`}>{returned ? 'ส่งกลับ' : `${done}/${myAreas.length}`}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </aside>

                    <section className={`min-w-0 rounded-2xl border border-line bg-white ${mobileDetailOpen ? '' : 'hidden lg:block'}`} aria-labelledby="homeroom-student-title">
                        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                            <div>
                                <button type="button" onClick={() => setMobileDetailOpen(false)} className="btn-ghost mb-2 lg:hidden"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับไปรายชื่อ</button>
                                <h3 id="homeroom-student-title" className="text-lg font-bold text-slate-950">{selectedIndex + 1}. {fullName(selectedStudent.info)}</h3>
                                <p className="text-sm text-slate-600">รหัส {selectedStudent.info.student_code || '-'} · ห้อง {room}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => printStudent(selectedStudent.id)} className="btn-secondary"><Printer className="h-4 w-4" aria-hidden="true" />พิมพ์รายงานผู้ปกครองของคนนี้</button>
                                <button type="button" onClick={() => setSelectedStudentId(students[selectedIndex - 1]?.id)} disabled={selectedIndex <= 0} className="btn-secondary" aria-label="นักเรียนคนก่อน"><ChevronLeft className="h-4 w-4" aria-hidden="true" />คนก่อน</button>
                                <button type="button" onClick={() => setSelectedStudentId(students[selectedIndex + 1]?.id)} disabled={selectedIndex >= students.length - 1} className="btn-secondary" aria-label="นักเรียนคนถัดไป">คนถัดไป<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                                <button type="button" onClick={() => navigate(`/report/${selectedStudent.id}/${academicYear}/${semester}`)} className="btn-secondary"><Printer className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">รายงานผู้ปกครอง</span></button>
                            </div>
                        </div>
                        <div className="divide-y divide-line">
                            {areas.map(area => {
                                const key = decisionKey(selectedStudent.id, area);
                                const row = rows.get(key);
                                const value = valueOf(selectedStudent.id, area);
                                const notes = notesByKey.get(key) || [];
                                const fieldId = `summary-${selectedStudent.id}-${areas.indexOf(area)}`;
                                return (
                                    <div key={area} className={`grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.9fr)] ${row?.decision_status === 'returned' ? 'bg-rose-50/60' : ''}`}>
                                        <div className="min-w-0">
                                            <h4 className="text-sm font-bold text-slate-950">{area}{!canEdit(area) && <span className="chip chip-neutral ml-2 align-middle">ของครูท่านอื่น</span>}</h4>
                                            {row?.decision_status === 'returned' && row.decision_reason && <p className="mt-2 rounded-lg border border-rose-200 bg-white p-2 text-sm text-rose-900"><strong>ฝ่ายวิชาการขอให้แก้:</strong> {row.decision_reason}</p>}
                                            <div className="mt-3 space-y-2">
                                                {notes.length ? notes.map((note, index) => (
                                                    <div key={`${note.subject}-${note.loCode}-${index}`} className="rounded-xl border border-line bg-slate-50 p-3">
                                                        <p className="text-xs font-bold text-indigo-800">{note.subject} · {note.loCode}</p>
                                                        <p className="mt-1 text-sm leading-6 text-slate-700">{note.text}</p>
                                                    </div>
                                                )) : <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">ครูผู้สอนยังไม่ได้เขียนข้อความ LO ในด้านนี้</p>}
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="block">
                                                <span className="mb-1.5 block text-xs font-bold text-slate-700">ระดับความสามารถ</span>
                                                <select value={value.level} disabled={!canEdit(area)} onChange={event => setValue(selectedStudent.id, area, { level: event.target.value })} className="min-h-11 w-full rounded-xl border border-field bg-white px-3 text-sm font-bold disabled:bg-slate-100 disabled:text-slate-600">
                                                    <option value="">ยังไม่ได้เลือก</option>
                                                    {SUMMARY_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}
                                                </select>
                                            </label>
                                            <div>
                                                <div className="mb-1.5 flex items-center justify-between gap-2">
                                                    <label htmlFor={fieldId} className="text-xs font-bold text-slate-700">คำบรรยาย</label>
                                                    {notes.length > 0 && canEdit(area) && (
                                                        <button type="button" onClick={() => setValue(selectedStudent.id, area, { summary: buildNarrativeDraft(notes) })} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" />ร่างใหม่จาก LO</button>
                                                    )}
                                                </div>
                                                <textarea id={fieldId} rows={5} value={value.summary} readOnly={!canEdit(area)} onChange={event => setValue(selectedStudent.id, area, { summary: event.target.value })} placeholder={canEdit(area) ? 'เขียนคำบรรยายสิ่งที่นักเรียนทำได้ในด้านนี้ หรือกด “ร่างใหม่จาก LO”' : 'ครูที่สอนวิชาของด้านนี้เป็นผู้เขียน'} className="w-full rounded-xl border border-field p-3 text-sm leading-6 placeholder:text-slate-500 read-only:bg-slate-100 read-only:text-slate-700" />
                                                {!canEdit(area) && <p className="mt-1 text-xs text-slate-600">ด้านนี้ไม่ได้มาจากวิชาที่คุณสอน จึงดูได้แต่แก้ไม่ได้</p>}
                                            </div>
                                            {row?.decision_status === 'submitted' && <p className="text-xs font-bold text-emerald-800">ส่งแล้ว ผู้ปกครองเห็นผลนี้ได้ และยังแก้ได้ตลอด</p>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            )}

            {dirtyKeys.length > 0 && (
                <div className="sticky bottom-0 z-30 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-lg sm:p-4" role="region" aria-label="รายการที่ยังไม่บันทึก">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex items-center gap-2 text-sm font-bold text-amber-950" aria-live="polite"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />ยังไม่บันทึก {dirtyKeys.length} รายการ</p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button type="button" onClick={discardDrafts} disabled={saving} className="btn-secondary"><Undo2 className="h-4 w-4" aria-hidden="true" />ยกเลิกการแก้ไข</button>
                            <button type="button" onClick={() => saveDrafts()} disabled={saving} className="btn-primary"><Save className="h-4 w-4" aria-hidden="true" />{saving ? 'กำลังบันทึก...' : 'บันทึกฉบับร่าง'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
