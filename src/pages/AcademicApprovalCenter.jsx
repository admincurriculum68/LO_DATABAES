import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ChevronRight, FileText, Printer, RotateCcw, Search, ShieldCheck, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDialog } from '../lib/dialogContext';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { formalLevelLabel } from '../lib/terminology';
import { shortAreaName } from '../lib/loMapping';
import { loadRoomMappings } from '../lib/loByRoomApi';
import { loadCompetencyAreas } from '../lib/competencyAreasApi';
import { ROOM_STATUS, SUMMARY_LEVELS, collectRoomEvidence, decisionKey, isPublishedDecision, passStatusFor, roomStatus } from '../lib/homeroomSummary';
import { HOMEROOM_SUMMARY_SQL_HINT, homeroomSummarySupported } from '../lib/homeroomSummaryApi';

// ฝ่ายวิชาการตรวจผลสรุปรายด้านภายหลัง
// ครูประจำชั้นเป็นคนสรุประดับและเขียนคำบรรยาย ฝ่ายวิชาการไม่ได้รู้จักนักเรียนทุกคน
// งานหลักจึงเป็นการกด "รับรองทั้งห้อง" และส่งกลับเฉพาะรายการที่มีปัญหาพร้อมเหตุผล

const LEVEL_CLASS = {
    เริ่มต้น: 'border-amber-300 bg-amber-50 text-amber-900',
    พัฒนา: 'border-sky-300 bg-sky-50 text-sky-900',
    ชำนาญ: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    เชี่ยวชาญ: 'border-violet-300 bg-violet-50 text-violet-900',
    'N/A': 'border-slate-300 bg-slate-100 text-slate-700',
};
const ROW_STATUS = {
    draft: { label: 'ครูประจำชั้นยังไม่ส่ง', chip: 'chip-neutral' },
    pending: { label: 'ครูประจำชั้นยังไม่ส่ง', chip: 'chip-neutral' },
    submitted: { label: 'ส่งแล้ว ผู้ปกครองเห็นได้', chip: 'chip-success' },
    returned: { label: 'ขอให้ครูประจำชั้นแก้', chip: 'chip-danger' },
    approved: { label: 'ส่งแล้ว ผู้ปกครองเห็นได้', chip: 'chip-success' },
};
const LEVEL_CHANGE_REASON = 'ฝ่ายวิชาการแก้ระดับ';
const DECISION_SELECT = 'decision_id, student_id, competency_area, final_level, summary_text, decision_status, decision_reason, submitted_at';
const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim() || 'ไม่ระบุชื่อ';
const roomOrder = (a, b) => String(a).localeCompare(String(b), 'th', { numeric: true });
const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

export default function AcademicApprovalCenter() {
    const navigate = useNavigate();
    const dialog = useDialog();
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [supported, setSupported] = useState(null);
    const [students, setStudents] = useState([]);
    const [homeroomTeachers, setHomeroomTeachers] = useState(new Map());
    const [decisions, setDecisions] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [gradeFilter, setGradeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
    const [evidence, setEvidence] = useState({ room: '', areas: [], notesByKey: new Map(), loading: false });
    const [openStudentId, setOpenStudentId] = useState('');
    const [overrides, setOverrides] = useState({});
    const [busy, setBusy] = useState('');
    const evidenceRoomRef = useRef('');

    const loadData = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        try {
            const ok = await homeroomSummarySupported();
            setSupported(ok);
            if (!ok) return;
            const [studentRows, teacherRows, decisionRows] = await Promise.all([
                fetchAllRows((from, to) => supabase.from('users_students')
                    .select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room, student_status')
                    .eq('school_id', currentUser.school_id).eq('student_status', 'active').range(from, to)),
                fetchAllRows((from, to) => supabase.from('users_teachers')
                    .select('prefix, first_name, last_name, homeroom').eq('school_id', currentUser.school_id).eq('is_active', true)
                    .not('homeroom', 'is', null).range(from, to)),
                fetchAllRows((from, to) => supabase.from('competency_area_final_decisions')
                    .select(DECISION_SELECT).eq('school_id', currentUser.school_id)
                    .eq('academic_year', Number(academicYear)).eq('semester', Number(semester)).range(from, to)),
            ]);
            const teachersByRoom = new Map();
            teacherRows.forEach(teacher => {
                if (!teachersByRoom.has(teacher.homeroom)) teachersByRoom.set(teacher.homeroom, []);
                teachersByRoom.get(teacher.homeroom).push(fullName(teacher));
            });
            setStudents(studentRows.sort((a, b) => roomOrder(a.current_room, b.current_room) || String(a.student_code || '').localeCompare(String(b.student_code || ''), 'th', { numeric: true })));
            setHomeroomTeachers(teachersByRoom);
            setDecisions(new Map(decisionRows.map(row => [decisionKey(row.student_id, row.competency_area), row])));
        } catch (error) {
            setLoadError(error.message || 'โหลดข้อมูลรับรองผลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => { loadData(); }, [loadData]);

    // สรุปรายห้องจากแถวผลที่มี จำนวนด้านจริงของห้องรู้ตอนเปิดห้อง รายการห้องจึงนับเป็นรายคน
    const rooms = useMemo(() => {
        const rowsByStudent = new Map();
        decisions.forEach(row => {
            if (!rowsByStudent.has(row.student_id)) rowsByStudent.set(row.student_id, []);
            rowsByStudent.get(row.student_id).push(row);
        });
        const map = new Map();
        students.forEach(student => {
            const room = student.current_room || 'ไม่ระบุห้อง';
            if (!map.has(room)) map.set(room, { room, grade: student.current_grade_level || '', students: [], rows: [] });
            const entry = map.get(room);
            entry.students.push(student);
            entry.rows.push(...(rowsByStudent.get(student.student_id) || []));
        });
        return [...map.values()].map(entry => {
            const counts = { draft: 0, submitted: 0, returned: 0, approved: 0 };
            entry.rows.forEach(row => { counts[row.decision_status === 'pending' ? 'draft' : row.decision_status] = (counts[row.decision_status === 'pending' ? 'draft' : row.decision_status] || 0) + 1; });
            const summarizedStudents = new Set(entry.rows.map(row => row.student_id)).size;
            return { ...entry, counts, summarizedStudents, status: roomStatus(entry.rows, entry.rows.length) };
        }).sort((a, b) => roomOrder(a.room, b.room));
    }, [decisions, students]);

    const grades = useMemo(() => [...new Set(rooms.map(room => room.grade).filter(Boolean))].sort(roomOrder), [rooms]);
    const visibleRooms = rooms.filter(room => (gradeFilter === 'all' || room.grade === gradeFilter)
        && (statusFilter === 'all' || room.status === statusFilter)
        && (!query.trim() || `${room.room} ${(homeroomTeachers.get(room.room) || []).join(' ')}`.includes(query.trim())));
    const selected = rooms.find(room => room.room === selectedRoom) || null;
    // ส่งแล้ว = ผู้ปกครองเห็นได้ (รวมแถวเก่าที่เคยรับรองไว้)
    const totals = rooms.reduce((sum, room) => ({
        published: sum.published + room.counts.submitted + room.counts.approved,
        all: sum.all + room.rows.length,
    }), { published: 0, all: 0 });
    const roomsPending = rooms.filter(room => room.summarizedStudents < room.students.length || room.counts.draft > 0 || room.counts.returned > 0).length;

    // เปิดห้อง: โหลดข้อความ LO ของนักเรียนในห้องไว้ให้อ่านประกอบ
    // จำห้องที่กำลังโหลดไว้ใน ref ไม่ใช่ state การตั้ง state ระหว่างโหลดจะทำให้ effect รันใหม่และทิ้งผลที่กำลังโหลด
    const selectedRoomName = selected?.room || '';
    const selectedStudentIds = useMemo(() => (selected ? selected.students.map(student => student.student_id) : []), [selected]);
    useEffect(() => {
        if (!selectedRoomName || evidenceRoomRef.current === selectedRoomName) return;
        evidenceRoomRef.current = selectedRoomName;
        let active = true;
        (async () => {
            setEvidence({ room: selectedRoomName, areas: [], notesByKey: new Map(), loading: true });
            try {
                const enrollments = await fetchAllByIn(selectedStudentIds, (batch, from, to) => supabase.from('student_enrollments')
                    .select('enrollment_id, student_id, subject_id, room, subjects!inner(subject_name, academic_year, semester)')
                    .in('student_id', batch).eq('enrollment_status', 'active')
                    .eq('subjects.academic_year', Number(academicYear)).eq('subjects.semester', Number(semester)).range(from, to));
                const subjectIds = [...new Set(enrollments.map(item => item.subject_id))];
                const [mappings, evaluations] = await Promise.all([
                    loadRoomMappings(subjectIds, { withLo: true }),
                    fetchAllByIn(enrollments.map(item => item.enrollment_id), (batch, from, to) => supabase.from('lo_evaluations')
                        .select('enrollment_id, lo_id, evidence_note').in('enrollment_id', batch).range(from, to)),
                ]);
                if (!active) return;
                const areaNames = await loadCompetencyAreas({ schoolId: currentUser.school_id, grades: [selected?.grade] }).catch(() => []);
                const { areas, notesByKey } = collectRoomEvidence(enrollments, mappings, evaluations, { areas: areaNames });
                setEvidence({ room: selectedRoomName, areas, notesByKey, loading: false, enrollmentIds: enrollments.map(item => item.enrollment_id) });
            } catch (error) {
                if (active) {
                    evidenceRoomRef.current = '';
                    setEvidence({ room: selectedRoomName, areas: [], notesByKey: new Map(), loading: false });
                    toast.error('โหลดข้อความ LO ของห้องไม่สำเร็จ: ' + error.message);
                }
            }
        })();
        return () => {
            // เปลี่ยนห้องระหว่างโหลด ให้ห้องเดิมโหลดใหม่ได้เมื่อกลับมา
            if (active && evidenceRoomRef.current === selectedRoomName) evidenceRoomRef.current = '';
            active = false;
        };
        // selectedStudentIds เปลี่ยนตามผลที่บันทึก ไม่ต้องโหลดข้อความ LO ใหม่ทุกครั้ง
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [academicYear, selectedRoomName, semester]);

    const applyRows = updatedRows => setDecisions(previous => {
        const map = new Map(previous);
        (updatedRows || []).forEach(row => map.set(decisionKey(row.student_id, row.competency_area), row));
        return map;
    });

    const audit = (action, detail) => supabase.from('audit_logs').insert({
        school_id: currentUser.school_id,
        actor_id: currentUser.teacher_id || currentUser.id,
        actor_role: currentUser.role,
        action,
        entity_type: 'competency_area_final_decision',
        detail: { academic_year: Number(academicYear), semester: Number(semester), ...detail },
    });

    const updateRoomRows = async (room, fromStatuses, patch) => {
        const updated = [];
        for (const batch of chunk(room.students.map(student => student.student_id), 150)) {
            const { data, error } = await supabase.from('competency_area_final_decisions').update(patch)
                .eq('school_id', currentUser.school_id).eq('academic_year', Number(academicYear)).eq('semester', Number(semester))
                .in('student_id', batch).in('decision_status', fromStatuses).select(DECISION_SELECT);
            if (error) throw error;
            updated.push(...(data || []));
        }
        return updated;
    };

    const returnRoom = async room => {
        const reason = await dialog.prompt({
            title: `ขอให้ครูประจำชั้นแก้ผลสรุปห้อง ${room.room}`,
            message: 'รายการที่ส่งแล้วทั้งห้องจะกลับไปให้ครูประจำชั้นแก้ และจะไม่แสดงกับนักเรียนและผู้ปกครองจนกว่าครูจะส่งใหม่',
            inputLabel: 'เหตุผลที่ส่งกลับ',
            placeholder: 'เช่น คำบรรยายด้านการคิดคำนวณยังสั้นเกินไป',
            confirmLabel: 'ขอให้แก้ทั้งห้อง',
        });
        if (!reason) return;
        setBusy(`room:${room.room}`);
        try {
            const now = new Date().toISOString();
            const updated = await updateRoomRows(room, ['submitted', 'approved'], {
                decision_status: 'returned', is_locked: false, decision_reason: reason, decided_by: currentUser.teacher_id || null, decided_at: now, updated_at: now,
            });
            applyRows(updated);
            await audit('return_homeroom_room', { room: room.room, returned_count: updated.length, reason });
            toast.success(`ขอให้ครูประจำชั้นแก้ห้อง ${room.room} แล้ว ${updated.length} รายการ`);
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
        } finally {
            setBusy('');
        }
    };

    // ฝ่ายวิชาการทำได้ 2 อย่าง: แก้ระดับเอง (ผลยังแสดงต่อเนื่อง) หรือขอให้ครูประจำชั้นแก้ (ผลถูกดึงกลับ)
    const decideOne = async (row, action) => {
        const key = decisionKey(row.student_id, row.competency_area);
        const override = overrides[key] || {};
        const level = action === 'return' ? row.final_level : (override.level || row.final_level);
        let reason = override.reason?.trim() || '';
        if (!reason) {
            reason = await dialog.prompt({
                title: action === 'return' ? 'ขอให้ครูประจำชั้นแก้รายการนี้' : 'เหตุผลที่แก้ระดับ',
                message: `${shortAreaName(row.competency_area)} · ระบุให้ครูประจำชั้นเข้าใจว่าต้องแก้อะไร หรือทำไมจึงเปลี่ยนระดับ`,
                inputLabel: 'เหตุผล',
                confirmLabel: action === 'return' ? 'ขอให้แก้' : 'บันทึกระดับใหม่',
            });
            if (!reason) return;
        }
        setBusy(key);
        try {
            const now = new Date().toISOString();
            const patch = {
                final_level: level,
                pass_status: passStatusFor(level),
                decision_reason: reason || LEVEL_CHANGE_REASON,
                decided_by: currentUser.teacher_id || null,
                decided_at: now,
                updated_at: now,
            };
            // แก้ระดับไม่เปลี่ยนสถานะ ผู้ปกครองจึงเห็นผลต่อเนื่อง ส่วนการขอให้แก้จะดึงผลกลับเป็นฉบับร่าง
            if (action === 'return') patch.decision_status = 'returned';
            const { data, error } = await supabase.from('competency_area_final_decisions').update(patch)
                .eq('decision_id', row.decision_id).select(DECISION_SELECT);
            if (error) throw error;
            applyRows(data);
            setOverrides(previous => { const next = { ...previous }; delete next[key]; return next; });
            await audit(action === 'return' ? 'return_competency_area' : 'edit_competency_area_level', { student_id: row.student_id, competency_area: row.competency_area, final_level: level, reason });
            toast.success(action === 'return' ? 'ขอให้ครูประจำชั้นแก้รายการนี้แล้ว' : 'บันทึกระดับใหม่แล้ว ผู้ปกครองเห็นผลที่แก้ทันที');
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
        } finally {
            setBusy('');
        }
    };

    if (supported === false) {
        return (
            <Layout title="ตรวจผลรายด้านความสามารถ">
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6" role="alert">
                    <p className="font-bold text-amber-950">ยังเปิดหน้าตรวจผลไม่ได้</p>
                    <p className="mt-1 text-sm text-amber-900">{HOMEROOM_SUMMARY_SQL_HINT}</p>
                </section>
            </Layout>
        );
    }

    const publishedPercent = totals.all ? Math.round((totals.published / totals.all) * 100) : 0;
    const roomAreas = evidence.room === selected?.room ? evidence.areas : [];

    return (
        <Layout title="ตรวจผลรายด้านความสามารถ">
            <div className="mx-auto max-w-[1680px] space-y-5 pb-12">
                <header className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-indigo-700" aria-hidden="true" /><h1 className="text-2xl font-bold text-slate-950">ตรวจผลรายด้านความสามารถ</h1></div>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">ครูประจำชั้นสรุประดับและกดส่ง ผลออกสู่นักเรียนและผู้ปกครองทันที หน้านี้ใช้ตรวจภายหลัง แก้ระดับเองได้ หรือขอให้ครูประจำชั้นแก้</p>
                        </div>
                        <div className="min-w-64 rounded-xl bg-slate-100 px-4 py-3">
                            <div className="flex justify-between gap-4 text-sm font-bold text-slate-700"><span>ส่งแล้ว</span><span className="tabular-nums">{totals.published}/{totals.all} รายการ</span></div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${publishedPercent}%` }} /></div>
                            <p className="mt-2 text-xs font-semibold text-slate-600">{roomsPending} ห้องยังส่งไม่ครบ</p>
                        </div>
                    </div>
                </header>

                {loadError && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5" role="alert"><div className="flex gap-3"><AlertCircle className="h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" /><div><h2 className="font-bold text-rose-950">เปิดหน้าตรวจผลไม่ได้</h2><p className="mt-1 text-sm text-rose-800">{loadError}</p><button type="button" onClick={loadData} className="btn-secondary mt-3"><RotateCcw className="h-4 w-4" aria-hidden="true" />ลองใหม่</button></div></div></section>}

                <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
                    <aside className={`overflow-hidden rounded-2xl border border-line bg-white ${mobileDetailOpen ? 'hidden lg:block' : ''}`} aria-label="รายการห้องเรียน">
                        <div className="space-y-2 border-b border-line p-4">
                            <label className="relative block"><span className="sr-only">ค้นหาห้องหรือครูประจำชั้น</span><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาห้องหรือครูประจำชั้น" className="min-h-11 w-full rounded-xl border border-field pl-10 pr-3 text-sm placeholder:text-slate-500" /></label>
                            <div className="grid grid-cols-2 gap-2">
                                <select aria-label="กรองตามชั้น" value={gradeFilter} onChange={event => setGradeFilter(event.target.value)} className="min-h-11 rounded-xl border border-field bg-white px-3 text-sm font-bold"><option value="all">ทุกชั้น</option>{grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select>
                                <select aria-label="กรองตามสถานะ" value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-11 rounded-xl border border-field bg-white px-3 text-sm font-bold"><option value="all">ทุกสถานะ</option>{Object.entries(ROOM_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
                            </div>
                        </div>
                        <ul className="max-h-[46rem] divide-y divide-line overflow-y-auto">
                            {loading ? <li className="h-64 animate-pulse bg-slate-100" /> : visibleRooms.length ? visibleRooms.map(room => (
                                <li key={room.room}>
                                    <button type="button" aria-current={selectedRoom === room.room ? 'true' : undefined} onClick={() => { setSelectedRoom(room.room); setMobileDetailOpen(true); setOpenStudentId(''); }} className={`flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left ${selectedRoom === room.room ? 'surface-selected' : 'hover:bg-slate-50'}`}>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">ห้อง {room.room}</strong><span className={`chip ${ROOM_STATUS[room.status].chip}`}>{ROOM_STATUS[room.status].label}</span></span>
                                            <span className="mt-1 block truncate text-xs text-slate-600">{(homeroomTeachers.get(room.room) || ['ยังไม่มีครูประจำชั้น']).join(', ')}</span>
                                            <span className="mt-0.5 block text-xs text-slate-600 tabular-nums">สรุปแล้ว {room.summarizedStudents}/{room.students.length} คน · ยังไม่ส่ง {room.counts.draft}</span>
                                        </span>
                                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                                    </button>
                                </li>
                            )) : <li className="p-8 text-center text-sm text-slate-600">ไม่พบห้องตามตัวกรอง</li>}
                        </ul>
                    </aside>

                    <section className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-white ${mobileDetailOpen ? '' : 'hidden lg:block'}`} aria-labelledby="approval-room-title">
                        {!selected ? (
                            <div className="p-16 text-center text-slate-600"><ShieldCheck className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden="true" />เลือกห้องจากรายการด้านซ้าย</div>
                        ) : (
                            <>
                                <header className="space-y-3 border-b border-line p-4 sm:p-5">
                                    <button type="button" onClick={() => setMobileDetailOpen(false)} className="btn-ghost lg:hidden"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับไปรายการห้อง</button>
                                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2"><h2 id="approval-room-title" className="text-lg font-bold text-slate-950">ห้อง {selected.room}</h2><span className={`chip ${ROOM_STATUS[selected.status].chip}`}>{ROOM_STATUS[selected.status].label}</span></div>
                                            <p className="mt-1 text-sm text-slate-600">ครูประจำชั้น: {(homeroomTeachers.get(selected.room) || ['ยังไม่ได้กำหนด']).join(', ')} · นักเรียน {selected.students.length} คน{roomAreas.length ? ` · ${roomAreas.length} ด้าน` : ''}</p>
                                            <p className="mt-1 text-xs text-slate-600 tabular-nums">ส่งแล้ว {selected.counts.submitted + selected.counts.approved} · ยังไม่ส่ง {selected.counts.draft} · ขอให้แก้ {selected.counts.returned}</p>
                                        </div>
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <button type="button" onClick={() => navigate(`/batch-report/${encodeURIComponent(selected.room)}/${academicYear}/${semester}`)} className="btn-secondary"><Printer className="h-4 w-4" aria-hidden="true" />พิมพ์รายงานผู้ปกครอง</button>
                                            <button type="button" onClick={() => returnRoom(selected)} disabled={Boolean(busy) || !(selected.counts.submitted + selected.counts.approved)} className="btn-secondary"><Undo2 className="h-4 w-4" aria-hidden="true" />ขอให้ครูประจำชั้นแก้ทั้งห้อง</button>
                                        </div>
                                    </div>
                                </header>

                                {evidence.loading && <p className="border-b border-line px-5 py-2 text-xs text-slate-600" role="status">กำลังโหลดข้อความ LO ของห้อง...</p>}
                                <ul className="divide-y divide-line">
                                    {selected.students.map((student, index) => {
                                        const areas = roomAreas.length ? roomAreas : [...new Set(selected.rows.filter(row => row.student_id === student.student_id).map(row => row.competency_area))];
                                        const studentRows = areas.map(area => decisions.get(decisionKey(student.student_id, area))).filter(Boolean);
                                        const open = openStudentId === student.student_id;
                                        const published = studentRows.filter(isPublishedDecision).length;
                                        return (
                                            <li key={student.student_id}>
                                                <button type="button" aria-expanded={open} onClick={() => setOpenStudentId(open ? '' : student.student_id)} className={`flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left sm:px-5 ${open ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                                    <ChevronRight className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true" />
                                                    <span className="min-w-0 flex-1 text-sm"><strong className="text-slate-950">{index + 1}. {fullName(student)}</strong><span className="ml-2 text-xs text-slate-600">{student.student_code || ''}</span></span>
                                                    <span className="shrink-0 text-xs font-semibold text-slate-600 tabular-nums">{studentRows.length ? `ส่งแล้ว ${published}/${areas.length}` : 'ยังไม่มีผลสรุป'}</span>
                                                </button>
                                                {open && (
                                                    <div className="space-y-3 bg-slate-50/60 px-4 pb-5 sm:px-5">
                                                        <div className="flex justify-end"><button type="button" onClick={() => navigate(`/report/${student.student_id}/${academicYear}/${semester}`)} className="btn-ghost"><FileText className="h-4 w-4" aria-hidden="true" />ดูรายงานผู้ปกครอง</button></div>
                                                        {areas.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">ครูประจำชั้นยังไม่ได้สรุปนักเรียนคนนี้</p>}
                                                        {areas.map(area => {
                                                            const key = decisionKey(student.student_id, area);
                                                            const row = decisions.get(key);
                                                            const notes = evidence.notesByKey.get(key) || [];
                                                            const override = overrides[key] || {};
                                                            const status = ROW_STATUS[row?.decision_status] || ROW_STATUS.draft;
                                                            return (
                                                                <article key={area} className="rounded-xl border border-line bg-white p-4">
                                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                                        <h3 className="text-sm font-bold text-slate-950">{area}</h3>
                                                                        <span className={`chip ${status.chip} w-fit`}>{row ? status.label : 'ยังไม่มีผลสรุป'}</span>
                                                                    </div>
                                                                    {row ? (
                                                                        <>
                                                                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                                                                <span className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${LEVEL_CLASS[row.final_level] || LEVEL_CLASS['N/A']}`}>{row.final_level ? formalLevelLabel(row.final_level) : 'ยังไม่เลือกระดับ'}</span>
                                                                            </div>
                                                                            <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-800">{row.summary_text || <span className="text-amber-800">ยังไม่มีคำบรรยาย</span>}</p>
                                                                            {row.decision_status === 'returned' && row.decision_reason && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-900"><strong>เหตุผลที่ขอให้แก้:</strong> {row.decision_reason}</p>}
                                                                            {notes.length > 0 && (
                                                                                <details className="mt-3 rounded-lg border border-line">
                                                                                    <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-indigo-800">ข้อความ LO จากครูผู้สอน ({notes.length})</summary>
                                                                                    <ul className="divide-y divide-line border-t border-line">{notes.map((note, noteIndex) => <li key={noteIndex} className="p-3 text-sm"><span className="text-xs font-bold text-slate-600">{note.subject} · {note.loCode}</span><p className="mt-1 leading-6 text-slate-800">{note.text}</p></li>)}</ul>
                                                                                </details>
                                                                            )}
                                                                            {isPublishedDecision(row) && (
                                                                                <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-end">
                                                                                    {isPublishedDecision(row) && (
                                                                                        <select aria-label={`แก้ระดับ ${shortAreaName(area)} ของ ${fullName(student)}`} value={override.level || row.final_level || ''} onChange={event => setOverrides(previous => ({ ...previous, [key]: { ...previous[key], level: event.target.value } }))} className="min-h-11 rounded-xl border border-field bg-white px-3 text-sm font-bold">
                                                                                            {SUMMARY_LEVELS.map(level => <option key={level} value={level}>{level === row.final_level ? `${level} (ครูประจำชั้นเสนอ)` : level}</option>)}
                                                                                        </select>
                                                                                    )}
                                                                                    <button type="button" onClick={() => decideOne(row, 'return')} disabled={busy === key} className="min-h-11 rounded-xl border border-rose-300 bg-white px-4 text-sm font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">ขอให้ครูประจำชั้นแก้</button>
                                                                                    <button type="button" onClick={() => decideOne(row, 'edit')} disabled={busy === key || !override.level || override.level === row.final_level} className="btn-primary">บันทึกระดับใหม่</button>
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    ) : <p className="mt-2 text-sm text-slate-600">ครูประจำชั้นยังไม่ได้สรุปด้านนี้</p>}
                                                                </article>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </>
                        )}
                    </section>
                </div>
            </div>
        </Layout>
    );
}
