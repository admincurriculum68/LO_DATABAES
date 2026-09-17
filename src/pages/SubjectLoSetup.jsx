import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Save, Sparkles, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import LoAreaPicker from '../components/lo/LoAreaPicker';
import { fetchAllRows, supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { useDialog } from '../lib/dialogContext';
import { groupLearningOutcomesByArea, learningOutcomesForGrade, sameSelection, suggestAreasForSubject } from '../lib/loMapping';
import { buildLoResolver, sameSetAcrossRooms } from '../lib/loByRoom';
import { LO_BY_ROOM_SQL_HINT, countEvaluationsAtRisk, loByRoomSupported, loadRoomMappings, planRoomSelection, saveRoomSelection } from '../lib/loByRoomApi';
import { accessibleRooms, compareRooms, formatRoomRange, teacherRoomAccess, teachersWithRooms } from '../lib/teacherAccess';

// ครูผู้สอนเลือก LO ของวิชาตัวเอง แยกตามห้องที่สอน บันทึกแล้วใช้ได้ทันที ไม่ต้องรออนุมัติ
// ครูที่สอนหลายห้องเลือกครั้งเดียวแล้วติ๊กห้องที่จะใช้ ห้องของครูคนอื่นในวิชาเดียวกันไม่กระทบ
// ครูแก้ได้ตลอด ระบบเตือนก่อนเอา LO ที่บันทึกข้อความไปแล้วออก

const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim();
const formatWhen = value => (value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function SubjectLoSetup() {
    const { subjectId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const dialog = useDialog();
    const roomParam = new URLSearchParams(location.search).get('room');
    const [state, setState] = useState({ loading: true, error: '', subject: null, learningOutcomes: [], mappings: [], assignments: [], rooms: [], myRooms: [], names: new Map(), supported: true });
    const [checkedRooms, setCheckedRooms] = useState(new Set());
    const [selection, setSelection] = useState(new Set());
    const [saving, setSaving] = useState(false);

    const load = useCallback(async ({ keepSelection = false } = {}) => {
        setState(previous => ({ ...previous, loading: !keepSelection, error: '' }));
        try {
            const { data: subject, error: subjectError } = await supabase.from('subjects')
                .select('subject_id, subject_name, grade_level, teacher_id')
                .eq('subject_id', subjectId).eq('school_id', currentUser.school_id).single();
            if (subjectError || !subject) throw new Error('ไม่พบรายวิชานี้ในโรงเรียนของคุณ');

            const [assignmentResult, enrollments, supported] = await Promise.all([
                supabase.from('subject_teachers').select('teacher_id, room_name').eq('subject_id', subjectId),
                fetchAllRows((from, to) => supabase.from('student_enrollments').select('room')
                    .eq('subject_id', subjectId).eq('enrollment_status', 'active').range(from, to)),
                loByRoomSupported(),
            ]);
            if (assignmentResult.error) throw assignmentResult.error;
            const assignments = assignmentResult.data || [];
            const access = teacherRoomAccess(subject, assignments, currentUser.teacher_id);
            if (!access.canAccess) throw new Error('คุณไม่ได้รับมอบหมายให้สอนรายวิชานี้');
            const rooms = [...new Set(enrollments.map(row => row.room).filter(Boolean))].sort(compareRooms);
            const myRooms = accessibleRooms(access, rooms);
            if (rooms.length && !myRooms.length) throw new Error('คุณไม่ได้รับมอบหมายให้สอนห้องใดในรายวิชานี้');

            const [learningOutcomes, mappings] = await Promise.all([
                fetchAllRows((from, to) => supabase.from('learning_outcomes')
                    .select('lo_id, lo_code, ability_no, competency_area, is_custom_competency, lo_description, grade_level')
                    .eq('school_id', currentUser.school_id).range(from, to)),
                loadRoomMappings([subjectId]),
            ]);
            const peopleIds = [...new Set([subject.teacher_id, ...assignments.map(row => row.teacher_id), ...mappings.map(row => row.updated_by)].filter(Boolean))];
            const { data: people } = peopleIds.length
                ? await supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name').in('teacher_id', peopleIds)
                : { data: [] };

            setState({
                loading: false, error: '', subject, assignments, rooms, myRooms, mappings, supported,
                learningOutcomes: learningOutcomesForGrade(learningOutcomes, subject.grade_level),
                names: new Map((people || []).map(person => [person.teacher_id, fullName(person)])),
            });

            if (!keepSelection) {
                const resolver = buildLoResolver(mappings);
                const start = roomParam && myRooms.includes(roomParam) ? [roomParam] : myRooms;
                // ค่าเริ่มต้น: ห้องทั้งหมดของฉันที่ใช้ชุดเดียวกับห้องแรก ห้องที่ต่างให้ครูติ๊กเพิ่มเอง
                const firstIds = resolver.idsFor(subjectId, start[0]);
                const initial = roomParam ? start : start.filter(room => sameSelection(resolver.idsFor(subjectId, room), firstIds));
                setCheckedRooms(new Set(initial.length ? initial : start));
                setSelection(firstIds);
            }
        } catch (error) {
            setState(previous => ({ ...previous, loading: false, error: error.message || 'โหลดข้อมูลไม่สำเร็จ' }));
        }
    }, [currentUser.school_id, currentUser.teacher_id, roomParam, subjectId]);

    useEffect(() => { load(); }, [load]);

    const resolver = useMemo(() => buildLoResolver(state.mappings), [state.mappings]);
    const groups = useMemo(() => groupLearningOutcomesByArea(state.learningOutcomes), [state.learningOutcomes]);
    const checkedList = state.myRooms.filter(room => checkedRooms.has(room));
    const checkedSets = checkedList.map(room => resolver.idsFor(subjectId, room));
    const checkedDiffer = !sameSetAcrossRooms(checkedSets);
    const dirty = checkedList.some(room => !sameSelection(resolver.idsFor(subjectId, room), selection));

    useEffect(() => {
        if (!dirty) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const toggleRoom = room => setCheckedRooms(previous => {
        const next = new Set(previous);
        if (next.has(room)) next.delete(room); else next.add(room);
        return next;
    });

    const startFrom = room => {
        setSelection(resolver.idsFor(subjectId, room));
        toast(`เริ่มจาก LO ของห้อง ${room}`, { icon: '↩️' });
    };

    const applySuggestion = () => {
        const areas = suggestAreasForSubject(state.subject?.subject_name, groups.map(group => group.area));
        if (!areas.length) {
            toast('ระบบเดาด้านจากชื่อวิชานี้ไม่ได้ เลือกเองได้เลย', { icon: 'ℹ️' });
            return;
        }
        const next = new Set(selection);
        groups.filter(group => areas.includes(group.area)).forEach(group => group.los.forEach(lo => next.add(lo.lo_id)));
        setSelection(next);
        toast.success(`เลือกให้แล้ว ${areas.length} ด้าน ตรวจให้ตรงกับคำอธิบายรายวิชาก่อนบันทึก`);
    };

    const save = async () => {
        if (saving) return;
        if (!selection.size) {
            toast.error('เลือก LO อย่างน้อย 1 ข้อก่อนบันทึก');
            return;
        }
        const rooms = state.supported ? checkedList : state.myRooms;
        if (state.supported && !rooms.length) {
            toast.error('ติ๊กห้องที่จะใช้ LO ชุดนี้อย่างน้อย 1 ห้อง');
            return;
        }
        setSaving(true);
        try {
            const plans = state.supported ? await planRoomSelection(subjectId, rooms, [...selection]) : null;
            if (plans) {
                const atRisk = await countEvaluationsAtRisk(subjectId, plans);
                if (atRisk > 0) {
                    const confirmed = await dialog.confirm({
                        title: 'LO ที่จะเอาออกมีข้อความของนักเรียนแล้ว',
                        message: `มีข้อความพฤติกรรมที่บันทึกไว้แล้ว ${atRisk.toLocaleString()} รายการใน LO ที่ห้องเหล่านี้จะเลิกใช้\nข้อความยังเก็บอยู่ในระบบ แต่จะไม่แสดงจนกว่าจะเลือก LO นั้นกลับมา`,
                        confirmLabel: 'บันทึกต่อ',
                        cancelLabel: 'กลับไปแก้',
                        tone: 'danger',
                    });
                    if (!confirmed) return;
                }
            }
            const { changedRooms } = await saveRoomSelection({ subjectId, rooms, loIds: [...selection], actor: currentUser, plans, schoolId: currentUser.school_id });
            await load({ keepSelection: true });
            toast.success(changedRooms.length
                ? `บันทึก LO ${selection.size} ข้อให้ ${formatRoomRange(changedRooms) || 'ทุกห้อง'} แล้ว บันทึกข้อความ LO ได้ทันที`
                : 'LO ของห้องที่เลือกตรงกับที่บันทึกไว้แล้ว');
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    if (state.loading) {
        return (
            <Layout title="เลือก LO ของวิชา">
                <div className="flex min-h-72 items-center justify-center" role="status">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-700" aria-hidden="true" /><span className="sr-only">กำลังโหลด</span>
                </div>
            </Layout>
        );
    }

    if (state.error) {
        return (
            <Layout title="เลือก LO ของวิชา">
                <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
                    <p className="font-bold text-rose-900">เปิดหน้านี้ไม่ได้</p>
                    <p className="mt-1 text-sm text-rose-800">{state.error}</p>
                    <button type="button" onClick={() => navigate('/')} className="btn-secondary mt-4"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับหน้างานของฉัน</button>
                </div>
            </Layout>
        );
    }

    // ห้องของครูคนอื่นในวิชานี้ แสดงให้รู้ว่าเลือกไว้อย่างไร แต่แก้ไม่ได้
    const otherTeachers = teachersWithRooms(state.subject, state.assignments)
        .filter(item => item.teacherId !== currentUser.teacher_id && item.rooms.length)
        .map(item => ({ ...item, rooms: item.rooms.filter(room => !state.myRooms.includes(room)) }))
        .filter(item => item.rooms.length);

    return (
        <Layout title={`เลือก LO · ${state.subject.subject_name}`}>
            <div className="mx-auto w-full max-w-4xl space-y-5 pb-28">
                <button type="button" onClick={() => navigate('/')} className="btn-ghost"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับหน้างานของฉัน</button>

                <section className="rounded-2xl border border-line bg-white p-5 sm:p-6" aria-labelledby="lo-setup-title">
                    <h1 id="lo-setup-title" className="text-xl font-bold text-slate-950">{state.subject.subject_name} <span className="chip chip-info align-middle">{state.subject.grade_level}</span></h1>
                    <p className="mt-1 text-sm text-slate-700">เลือก LO ตามคำอธิบายรายวิชา ติ๊กห้องที่จะใช้ชุดนี้ แล้วกดบันทึก ใช้บันทึกข้อความ LO ได้ทันที แก้ภายหลังได้ตลอด</p>

                    {!state.supported && (
                        <p className="mt-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />{LO_BY_ROOM_SQL_HINT}
                        </p>
                    )}

                    {state.supported && (
                        <fieldset className="mt-5">
                            <legend className="text-sm font-bold text-slate-900">ห้องที่จะใช้ LO ชุดนี้</legend>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {state.myRooms.map(room => {
                                    const count = resolver.idsFor(subjectId, room).size;
                                    const edit = resolver.lastEdit(subjectId, room);
                                    const checked = checkedRooms.has(room);
                                    return (
                                        <label key={room} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${checked ? 'border-indigo-300 surface-selected' : 'border-line hover:bg-slate-50'}`}>
                                            <input type="checkbox" checked={checked} onChange={() => toggleRoom(room)} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-indigo-700" />
                                            <span className="min-w-0 text-sm">
                                                <span className="block font-bold text-slate-900">{room}</span>
                                                <span className={count ? 'text-emerald-800' : 'text-amber-800'}>{count ? `เลือกไว้ ${count} ข้อ` : 'ยังไม่เลือก LO'}</span>
                                                {edit?.updated_at && <span className="block text-xs text-slate-500">แก้ล่าสุด{state.names.get(edit.updated_by) ? `โดย ${state.names.get(edit.updated_by)}` : ''} {formatWhen(edit.updated_at)}</span>}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {checkedDiffer && (
                                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                                    <p className="flex gap-2 font-bold"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />ห้องที่ติ๊กใช้ LO ไม่เหมือนกัน บันทึกแล้วทุกห้องที่ติ๊กจะใช้ชุดเดียวกัน</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <span>เริ่มจากชุดของห้อง</span>
                                        {checkedList.map(room => (
                                            <button key={room} type="button" onClick={() => startFrom(room)} className="inline-flex min-h-9 items-center rounded-lg border border-amber-300 bg-white px-3 text-xs font-bold text-amber-950 hover:bg-amber-100">{room}</button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </fieldset>
                    )}

                    {otherTeachers.length > 0 && (
                        <div className="mt-4 rounded-xl border border-line bg-slate-50 p-3 text-sm text-slate-700">
                            <p className="flex items-center gap-1.5 font-bold text-slate-800"><Users className="h-4 w-4 text-slate-500" aria-hidden="true" />ห้องอื่นในวิชานี้ (ครูคนอื่นเลือกเอง แก้จากหน้านี้ไม่ได้)</p>
                            <ul className="mt-1 space-y-0.5">
                                {otherTeachers.map(item => (
                                    <li key={item.teacherId}>
                                        {formatRoomRange(item.rooms)} · {state.names.get(item.teacherId) || 'ครูผู้สอน'} · {(() => {
                                            const counts = item.rooms.map(room => resolver.idsFor(subjectId, room).size);
                                            if (counts.every(count => count === 0)) return 'ยังไม่เลือก';
                                            if (counts.every(count => count === counts[0])) return `เลือกไว้ ${counts[0]} ข้อ`;
                                            return item.rooms.map((room, index) => `${room} ${counts[index]} ข้อ`).join(', ');
                                        })()}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button type="button" onClick={applySuggestion} className="btn-secondary"><Sparkles className="h-4 w-4" aria-hidden="true" />เลือกด้านตามชื่อวิชา</button>
                        <button type="button" onClick={() => load()} className="btn-ghost"><RefreshCw className="h-4 w-4" aria-hidden="true" />โหลดรายการล่าสุด</button>
                    </div>
                </section>

                <section className="rounded-2xl border border-line bg-white p-4 sm:p-6" aria-label="รายการ LO ของชั้นนี้">
                    <LoAreaPicker
                        learningOutcomes={state.learningOutcomes}
                        selection={selection}
                        onChange={setSelection}
                        emptyText={`ยังไม่มี LO ของ ${state.subject.grade_level} ในระบบ แจ้งฝ่ายวิชาการให้นำเข้า LO ของชั้นนี้ก่อน`}
                    />
                </section>
            </div>

            <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-line bg-white/95 p-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
                <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-800" aria-live="polite">
                        {dirty
                            ? <><AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />ยังไม่ได้บันทึก · เลือกไว้ {selection.size} ข้อ</>
                            : <><CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />บันทึกแล้ว · เลือกไว้ {selection.size} ข้อ</>}
                    </p>
                    <button type="button" onClick={save} disabled={saving || !selection.size || (state.supported && !checkedList.length)} className="btn-primary">
                        <Save className="h-4 w-4" aria-hidden="true" />
                        {saving ? 'กำลังบันทึก...' : state.supported ? `บันทึก LO ให้ ${checkedList.length} ห้อง` : 'บันทึก LO ของวิชา'}
                    </button>
                </div>
            </div>
        </Layout>
    );
}
