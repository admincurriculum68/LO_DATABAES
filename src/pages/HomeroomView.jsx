import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    BookOpen,
    CheckCircle2,
    ClipboardCheck,
    LayoutDashboard,
    PenLine,
    Printer,
    RefreshCw,
    Save,
    Search,
    Star,
    UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { hasAnyRole } from '../lib/roles';
import HomeroomCompetencyTab from '../components/homeroom/HomeroomCompetencyTab';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { buildLoResolver } from '../lib/loByRoom';
import { loadRoomMappings } from '../lib/loByRoomApi';
import { loadCompetencyAreas } from '../lib/competencyAreasApi';
import { compareRooms, gradeOfRoom } from '../lib/teacherAccess';
import { editableAreasFor } from '../lib/homeroomScope';
import { loadTeachingRooms } from '../lib/homeroomScopeApi';

const fullName = student => `${student?.prefix || ''}${student?.first_name || ''} ${student?.last_name || ''}`.trim();

function LoadingState() {
    return (
        <div className="space-y-4" aria-label="กำลังโหลดข้อมูลห้องเรียน">
            <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
            <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
        </div>
    );
}

export default function HomeroomView() {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    // ฝ่ายวิชาการและผู้บริหารเปิดได้ทุกห้อง ครูประจำชั้นได้ห้องตัวเอง
    // ครูรายวิชาเปิดห้องที่ตัวเองสอนได้ แต่สรุปได้เฉพาะด้านของวิชาตัวเอง
    const isAcademic = hasAnyRole(currentUser, ['admin', 'executive']);
    const { academicYear, semester } = useAcademic();
    const [room, setRoom] = useState('');
    const [availableRooms, setAvailableRooms] = useState([]);
    const [roomsReady, setRoomsReady] = useState(false);
    const [teaching, setTeaching] = useState({ rooms: [], accessBySubject: new Map() });
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('summary');
    const [selectedLo, setSelectedLo] = useState('');
    const [activityData, setActivityData] = useState({});
    const [activityDirty, setActivityDirty] = useState(false);
    const [savingActivity, setSavingActivity] = useState(false);

    useEffect(() => {
        let cancelled = false;
        async function fetchRooms() {
            if (!currentUser?.school_id) return;
            if (isAcademic) {
                const { data: students, error } = await supabase
                    .from('users_students')
                    .select('current_room')
                    .eq('school_id', currentUser.school_id);
                if (error || cancelled) return;
                const rooms = [...new Set((students || []).map(item => item.current_room).filter(Boolean))].sort(compareRooms);
                setAvailableRooms(rooms);
                setRoom(current => current || rooms[0] || '');
                setRoomsReady(true);
                return;
            }
            // ครูรายวิชาสรุปด้านของวิชาตัวเองได้ จึงต้องเห็นห้องที่ตัวเองสอน ไม่ใช่เฉพาะห้องประจำชั้น
            const scope = await loadTeachingRooms({
                teacherId: currentUser.teacher_id,
                schoolId: currentUser.school_id,
                academicYear,
                semester,
            }).catch(() => ({ rooms: [], accessBySubject: new Map() }));
            if (cancelled) return;
            setTeaching(scope);
            const homeroom = currentUser.homeroom || '';
            const rooms = [...new Set([homeroom, ...scope.rooms].filter(Boolean))].sort(compareRooms);
            setAvailableRooms(rooms);
            setRoom(current => (rooms.includes(current) ? current : homeroom || rooms[0] || ''));
            setRoomsReady(true);
        }
        fetchRooms();
        return () => { cancelled = true; };
    }, [academicYear, currentUser, isAcademic, semester]);

    const loadHomeroom = useCallback(async targetRoom => {
        const normalizedRoom = (targetRoom || '').trim();
        if (!normalizedRoom || !currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        setData(null);
        setActivityDirty(false);

        try {
            const enrollments = await fetchAllRows((from, to) => supabase.from('student_enrollments')
                .select(`
                    enrollment_id, room, student_id, subject_id,
                    users_students!inner(student_code, prefix, first_name, last_name, school_id),
                    subjects!inner(subject_name, academic_year, semester, school_id)
                `)
                .eq('room', normalizedRoom)
                .eq('enrollment_status', 'active')
                .eq('users_students.school_id', currentUser.school_id)
                .eq('subjects.school_id', currentUser.school_id)
                .eq('subjects.academic_year', academicYear)
                .eq('subjects.semester', semester)
                .range(from, to));
            if (!enrollments.length) {
                setData({ enrollments: [], loData: [], evalData: [], areaNames: [] });
                setActivityData({});
                return;
            }

            const subjectIds = [...new Set(enrollments.map(item => item.subject_id))];
            const enrollmentIds = enrollments.map(item => item.enrollment_id);
            const studentIds = [...new Set(enrollments.map(item => item.student_id))];
            const [mappings, evaluations, activities] = await Promise.all([
                loadRoomMappings(subjectIds, { withLo: true }),
                fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('lo_evaluations')
                    .select('enrollment_id, lo_id, evidence_note, workflow_status')
                    .in('enrollment_id', batch).range(from, to)),
                fetchAllByIn(studentIds, (batch, from, to) => supabase.from('student_year_evaluations')
                    .select('eval_id, student_id, activity_status, character_status')
                    .eq('academic_year', academicYear)
                    .eq('semester', semester)
                    .in('student_id', batch).range(from, to)),
            ]);

            const nextActivityData = {};
            studentIds.forEach(studentId => {
                const existing = activities.find(item => item.student_id === studentId);
                nextActivityData[studentId] = {
                    eval_id: existing?.eval_id || null,
                    activity_status: existing?.activity_status || '',
                    character_status: existing?.character_status || '',
                };
            });

            // ด้านที่ต้องสรุปมาจากคลัง LO ของชั้น ไม่ใช่เฉพาะด้านที่ครูผูก LO ไว้แล้ว
            const areaNames = await loadCompetencyAreas({
                schoolId: currentUser.school_id,
                grades: [gradeOfRoom(normalizedRoom)],
            }).catch(() => []);

            const nextData = {
                enrollments,
                loData: mappings.filter(item => item.learning_outcomes),
                evalData: evaluations,
                areaNames,
            };
            const firstLoId = nextData.loData[0]?.learning_outcomes?.lo_id || '';
            setData(nextData);
            setActivityData(nextActivityData);
            setSelectedLo(current => nextData.loData.some(item => item.learning_outcomes?.lo_id === current) ? current : firstLoId);
        } catch (error) {
            setLoadError(error.message || 'ไม่สามารถโหลดข้อมูลห้องเรียนได้');
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    // โหลดเองทุกบทบาท เดิมโหลดเฉพาะครูประจำชั้น ฝ่ายวิชาการจึงเปิดมาเจอหน้าว่างจนกว่าจะกดปุ่ม
    useEffect(() => {
        if (room && academicYear && semester) loadHomeroom(room);
    }, [academicYear, loadHomeroom, room, semester]);

    const students = useMemo(() => {
        if (!data) return [];
        const map = new Map();
        data.enrollments.forEach(enrollment => {
            if (!map.has(enrollment.student_id)) map.set(enrollment.student_id, { id: enrollment.student_id, info: enrollment.users_students });
        });
        return [...map.values()].sort((a, b) => (a.info.student_code || '').localeCompare(b.info.student_code || '', 'th'));
    }, [data]);

    const subjects = useMemo(() => {
        if (!data) return [];
        const map = new Map();
        data.enrollments.forEach(enrollment => {
            if (!map.has(enrollment.subject_id)) map.set(enrollment.subject_id, { id: enrollment.subject_id, info: enrollment.subjects });
        });
        return [...map.values()].sort((a, b) => (a.info.subject_name || '').localeCompare(b.info.subject_name || '', 'th'));
    }, [data]);

    // LO ของแต่ละวิชาขึ้นกับห้องของนักเรียน ห้องปกติกับห้อง IEP ใช้ชุดต่างกันได้
    const loResolver = useMemo(() => buildLoResolver(data?.loData || []), [data]);
    const learningOutcomes = useMemo(() => {
        const map = new Map();
        (data?.enrollments || []).forEach(enrollment => loResolver.rowsFor(enrollment.subject_id, enrollment.room)
            .forEach(item => { if (item.learning_outcomes) map.set(item.learning_outcomes.lo_id, item.learning_outcomes); }));
        return [...map.values()].sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0) || (a.lo_code || '').localeCompare(b.lo_code || '', 'th'));
    }, [data, loResolver]);

    // ครูประจำชั้นและฝ่ายวิชาการสรุปได้ทุกด้าน ครูรายวิชาสรุปได้เฉพาะด้านของ LO วิชาที่ตัวเองสอนในห้องนี้
    const canEditAllAreas = isAcademic || (Boolean(currentUser?.homeroom) && currentUser.homeroom === room);
    const canEditSubjectHere = useCallback(
        (subjectId, enrollmentRoom) => Boolean(teaching.accessBySubject.get(subjectId)?.allows(enrollmentRoom || room)),
        [room, teaching],
    );
    const editableAreas = useMemo(() => editableAreasFor({
        canEditAll: canEditAllAreas,
        enrollments: data?.enrollments || [],
        mappings: data?.loData || [],
        canEditSubject: canEditSubjectHere,
    }), [canEditAllAreas, canEditSubjectHere, data]);

    // แท็บผลราย LO และกิจกรรมเป็นงานของครูประจำชั้น ครูรายวิชาที่เปิดมาต้องไม่ค้างอยู่ที่แท็บที่ไม่มีให้กด
    useEffect(() => {
        if (!canEditAllAreas) setActiveTab('summary');
    }, [canEditAllAreas]);

    const selectedLoInfo = learningOutcomes.find(item => item.lo_id === selectedLo) || null;
    const totalAcademicCells = (data?.enrollments || []).reduce((total, enrollment) => {
        return total + loResolver.idsFor(enrollment.subject_id, enrollment.room).size;
    }, 0);
    // LO ถือว่าบันทึกแล้วเมื่อมีข้อความสะท้อนพฤติกรรม ไม่ใช้ระดับตัดสินราย LO
    const assessedAcademicCells = (() => {
        if (!data?.evalData?.length) return 0;
        const enrollmentById = new Map((data.enrollments || []).map(item => [item.enrollment_id, item]));
        return data.evalData.filter(item => {
            const enrollment = enrollmentById.get(item.enrollment_id);
            return item.evidence_note?.trim() && enrollment && loResolver.idsFor(enrollment.subject_id, enrollment.room).has(item.lo_id);
        }).length;
    })();
    const savedActivityStudents = Object.values(activityData).filter(item => item.eval_id).length;
    const academicPercent = totalAcademicCells ? Math.min(100, Math.round((assessedAcademicCells / totalAcademicCells) * 100)) : 0;

    const handleActivityChange = (studentId, field, value) => {
        setActivityData(current => ({ ...current, [studentId]: { ...current[studentId], [field]: value } }));
        setActivityDirty(true);
    };

    const markAllPassed = () => {
        setActivityData(current => Object.fromEntries(Object.entries(current).map(([studentId, value]) => [studentId, { ...value, activity_status: 'ผ่าน', character_status: 'ผ่าน' }])));
        setActivityDirty(true);
    };

    const saveActivities = async () => {
        const incomplete = students.filter(student => !activityData[student.id]?.activity_status || !activityData[student.id]?.character_status);
        if (incomplete.length) {
            toast.error(`กรุณาประเมินให้ครบทั้ง 2 รายการ อีก ${incomplete.length} คน`);
            return;
        }
        setSavingActivity(true);
        try {
            const payload = students.map(student => ({
                ...(activityData[student.id]?.eval_id ? { eval_id: activityData[student.id].eval_id } : {}),
                student_id: student.id,
                academic_year: academicYear,
                semester,
                activity_status: activityData[student.id].activity_status,
                character_status: activityData[student.id].character_status,
            }));
            const { error } = await supabase.from('student_year_evaluations').upsert(payload, { onConflict: 'student_id,academic_year,semester' });
            if (error) throw error;
            toast.success('บันทึกผลกิจกรรมและคุณลักษณะเรียบร้อยแล้ว');
            setActivityDirty(false);
            await loadHomeroom(room);
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
        } finally {
            setSavingActivity(false);
        }
    };

    const renderAcademicTable = () => (
        <section className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="border-b border-line p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div><h2 className="font-bold text-slate-950">ผลการประเมิน LO จากรายวิชา</h2><p className="mt-1 text-sm text-slate-600">เปรียบเทียบ LO เดียวกันจากรายวิชาที่นำไปใช้ โดยไม่ตัดสินผลแทนครูผู้สอน</p></div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <label><span className="mb-1 block text-xs font-bold text-slate-600">เลือกผลลัพธ์การเรียนรู้</span><select value={selectedLo} onChange={event => setSelectedLo(event.target.value)} className="min-h-11 w-full rounded-xl border border-field bg-white px-3 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-72">{learningOutcomes.map(lo => <option key={lo.lo_id} value={lo.lo_id}>{lo.lo_code || `LO ${lo.ability_no}`} · {lo.competency_area || 'ไม่ระบุด้าน'}</option>)}</select></label>
                        <button onClick={() => navigate(`/batch-report/${encodeURIComponent(room)}/${academicYear}/${semester}`)} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"><Printer className="h-4 w-4" /> พิมพ์รายงานทั้งห้อง</button>
                    </div>
                </div>
                {selectedLoInfo && <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3"><div className="flex flex-wrap items-center gap-2"><span className="action-primary rounded-lg px-2.5 py-1 text-xs font-bold">{selectedLoInfo.lo_code || `LO ${selectedLoInfo.ability_no}`}</span><span className="text-xs font-bold text-slate-600">{selectedLoInfo.competency_area || 'ไม่ระบุด้านความสามารถ'}</span></div><p className="mt-2 text-sm leading-6 text-slate-700">{selectedLoInfo.lo_description}</p></div>}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs font-bold text-slate-700"><tr><th className="w-16 px-4 py-3 text-center">เลขที่</th><th className="min-w-52 px-4 py-3">ผู้เรียน</th>{subjects.map(subject => <th key={subject.id} className="min-w-36 px-3 py-3 text-center">{subject.info.subject_name}</th>)}<th className="w-32 px-4 py-3 text-right">รายงาน</th></tr></thead>
                    <tbody className="divide-y divide-line">
                        {students.map((student, index) => (
                            <tr key={student.id} className="hover:bg-slate-50">
                                <td className="px-4 py-3.5 text-center font-semibold text-slate-500">{index + 1}</td>
                                <td className="px-4 py-3.5"><strong className="block text-slate-900">{fullName(student.info)}</strong><span className="mt-0.5 block text-xs text-slate-500">{student.info.student_code}</span></td>
                                {subjects.map(subject => {
                                    const enrollment = data.enrollments.find(item => item.student_id === student.id && item.subject_id === subject.id);
                                    const isMapped = Boolean(enrollment) && loResolver.idsFor(subject.id, enrollment.room).has(selectedLo);
                                    const evaluation = enrollment && isMapped ? data.evalData.find(item => item.enrollment_id === enrollment.enrollment_id && item.lo_id === selectedLo) : null;
                                    const evidence = isMapped ? evaluation?.evidence_note?.trim() || '' : 'N/A';
                                    return <td key={subject.id} className="px-3 py-3.5 align-top">{evidence === 'N/A' ? <span className="text-xs font-semibold text-slate-600">ไม่ได้ใช้ LO นี้</span> : evidence ? <p className="min-w-52 whitespace-normal text-left text-xs leading-5 text-slate-700">{evidence}</p> : <span className="surface-warning inline-flex rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-800">ยังไม่มีข้อความ</span>}</td>;
                                })}
                                <td className="px-4 py-3.5 text-right"><button onClick={() => navigate(`/report/${student.id}/${academicYear}/${semester}`)} aria-label={`พิมพ์รายงานของ ${fullName(student.info)}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"><Printer className="h-4 w-4" /> ปพ.๖</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );

    const renderActivityTable = () => (
        <section className="overflow-hidden rounded-2xl border border-line bg-white">
            <div className="border-b border-line p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div><h2 className="font-bold text-slate-950">กิจกรรมพัฒนาผู้เรียนและคุณลักษณะอันพึงประสงค์</h2><p className="mt-1 text-sm text-slate-600">ครูประจำชั้นประเมินผู้เรียนให้ครบทั้ง 2 รายการก่อนบันทึกผล</p></div>
                    <div className="flex flex-col gap-2 sm:flex-row"><button onClick={markAllPassed} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">กำหนด “ผ่าน” ทั้งห้อง</button><button onClick={saveActivities} disabled={savingActivity || !activityDirty} className="action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{savingActivity ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />} บันทึกผลทั้งห้อง</button></div>
                </div>
                {activityDirty && <p className="mt-3 text-sm font-bold text-amber-800">มีการแก้ไขที่ยังไม่ได้บันทึก</p>}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                    <thead className="bg-slate-100 text-xs font-bold text-slate-700"><tr><th className="w-16 px-4 py-3 text-center">เลขที่</th><th className="min-w-56 px-4 py-3">ผู้เรียน</th><th className="w-56 px-4 py-3 text-center">กิจกรรมพัฒนาผู้เรียน</th><th className="w-56 px-4 py-3 text-center">คุณลักษณะอันพึงประสงค์</th><th className="w-28 px-4 py-3 text-center">สถานะ</th></tr></thead>
                    <tbody className="divide-y divide-line">
                        {students.map((student, index) => {
                            const result = activityData[student.id] || {};
                            const complete = Boolean(result.activity_status && result.character_status);
                            return <tr key={student.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-center font-semibold text-slate-600">{index + 1}</td><td className="px-4 py-3"><strong className="block text-slate-900">{fullName(student.info)}</strong><span className="text-xs text-slate-600">{student.info.student_code}</span></td>{['activity_status', 'character_status'].map(field => <td key={field} className="px-4 py-3 text-center"><select value={result[field] || ''} onChange={event => handleActivityChange(student.id, field, event.target.value)} aria-label={`${field === 'activity_status' ? 'กิจกรรมพัฒนาผู้เรียน' : 'คุณลักษณะอันพึงประสงค์'}ของ ${fullName(student.info)}`} className={`min-h-11 w-36 rounded-xl border px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-200 ${result[field] === 'ผ่าน' ? 'surface-success border-emerald-200 text-emerald-800' : result[field] === 'ไม่ผ่าน' ? 'surface-danger border-rose-200 text-rose-800' : 'border-field bg-white text-slate-600'}`}><option value="">เลือกผล</option><option value="ผ่าน">ผ่าน</option><option value="ไม่ผ่าน">ไม่ผ่าน</option></select></td>)}<td className="px-4 py-3 text-center"><span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${complete ? 'surface-success text-emerald-800' : 'surface-warning text-amber-800'}`}>{complete ? 'ครบแล้ว' : 'ยังไม่ครบ'}</span></td></tr>;
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    );

    return (
        <Layout title={canEditAllAreas ? 'งานประเมินผลสำหรับครูประจำชั้น' : 'สรุปความสามารถรายด้านของวิชาที่สอน'}>
            <div className="mx-auto w-full max-w-[1600px]">
                <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div><div className="flex items-center gap-2 text-sm font-bold text-blue-700"><LayoutDashboard className="h-4 w-4" /> {canEditAllAreas ? 'งานครูประจำชั้น' : 'งานครูผู้สอน'}</div><h1 className="mt-1 text-2xl font-bold text-slate-950">{canEditAllAreas ? 'งานประเมินประจำชั้นเรียน' : 'สรุปความสามารถรายด้านของวิชาที่สอน'}</h1><p className="mt-1 text-sm text-slate-600">{canEditAllAreas ? 'สรุปความสามารถรายด้านจากข้อความ LO ของทุกวิชา ประเมินกิจกรรมกับคุณลักษณะ และพิมพ์รายงานผู้ปกครอง' : 'สรุปเฉพาะด้านที่วิชาของคุณรับผิดชอบ ด้วยบัญชีของคุณเอง ด้านอื่นเป็นของครูท่านอื่น'}</p></div>
                    <div className="rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-sm"><span className="block text-xs font-semibold text-slate-500">รอบการประเมิน</span><strong className="text-slate-900">ภาคเรียนที่ {semester}/{academicYear}</strong></div>
                </header>

                {!isAcademic && roomsReady && !availableRooms.length ? (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-800" /><div><h2 className="font-bold text-amber-950">ยังไม่มีห้องที่คุณรับผิดชอบ</h2><p className="mt-1 text-sm leading-6 text-amber-900">หน้านี้ใช้ได้เมื่อคุณเป็นครูประจำชั้น หรือมีชื่อเป็นครูผู้สอนของวิชาในภาคเรียนที่ {semester}/{academicYear} กรุณาติดต่อฝ่ายวิชาการเพื่อกำหนดห้องประจำชั้นหรือเพิ่มชื่อคุณในรายวิชา</p></div></div></section>
                ) : (
                    <>
                        <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm sm:flex-row sm:items-end" aria-label="เลือกห้องเรียน">
                            <label className="flex-1"><span className="mb-1.5 block text-sm font-bold text-slate-800">ห้องเรียนที่รับผิดชอบ</span><select value={room} onChange={event => setRoom(event.target.value)} disabled={availableRooms.length <= 1} className="min-h-11 w-full rounded-xl border border-field bg-white px-3 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-100 disabled:text-slate-700">{availableRooms.length ? availableRooms.map(item => <option key={item} value={item}>{item}</option>) : <option value="">ไม่มีห้องเรียน</option>}</select></label>
                            <button onClick={() => loadHomeroom(room)} disabled={loading || !room} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50">{loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700" /> : <RefreshCw className="h-4 w-4" />} โหลดข้อมูลล่าสุด</button>
                        </section>

                        {loadError ? <section className="surface-danger rounded-2xl border border-rose-200 p-6" role="alert"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" /><div><h2 className="font-bold text-rose-950">โหลดข้อมูลไม่สำเร็จ</h2><p className="mt-1 text-sm text-rose-800">{loadError}</p><button onClick={() => loadHomeroom(room)} className="action-danger mt-3 min-h-11 rounded-lg px-4 text-sm font-bold">ลองอีกครั้ง</button></div></div></section> : loading ? <LoadingState /> : data && students.length === 0 ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><UsersRound className="mx-auto h-10 w-10 text-slate-500" /><h3 className="mt-3 font-bold text-slate-800">ยังไม่มีนักเรียนในห้อง {room}</h3><p className="mt-1 text-sm text-slate-600">ฝ่ายวิชาการต้องจัดนักเรียนเข้ากลุ่มเรียนในภาคเรียนที่ {semester}/{academicYear} ก่อน</p></section> : data ? (
                            <>
                                <section className={`mb-5 grid overflow-hidden rounded-2xl border border-line bg-white sm:grid-cols-2 ${canEditAllAreas ? 'xl:grid-cols-4' : ''}`} aria-label="ภาพรวมงานประจำชั้น">
                                    {(canEditAllAreas ? [
                                        { label: 'นักเรียนในห้อง', value: students.length, unit: 'คน', icon: UsersRound, tone: 'bg-indigo-50 text-indigo-700' },
                                        { label: 'ผลลัพธ์การเรียนรู้', value: learningOutcomes.length, unit: 'LO', icon: BookOpen, tone: 'bg-blue-50 text-blue-700' },
                                        { label: 'ความก้าวหน้ารายวิชา', value: academicPercent, unit: '%', icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-700' },
                                        { label: 'กิจกรรมที่บันทึกแล้ว', value: savedActivityStudents, unit: `จาก ${students.length}`, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
                                    ] : [
                                        { label: 'นักเรียนในห้อง', value: students.length, unit: 'คน', icon: UsersRound, tone: 'bg-indigo-50 text-indigo-700' },
                                        { label: 'ด้านที่คุณสรุปได้', value: editableAreas ? editableAreas.size : 0, unit: `จาก ${data.areaNames?.length || 0} ด้าน`, icon: PenLine, tone: 'bg-blue-50 text-blue-700' },
                                    ]).map((metric, index) => <div key={metric.label} className={`flex items-center gap-3 border-b border-line p-4 last:border-b-0 sm:p-5 ${index % 2 === 0 ? 'sm:border-r' : ''} ${canEditAllAreas ? (index < 2 ? 'xl:border-b-0' : 'sm:border-b-0') : 'sm:border-b-0'} ${canEditAllAreas && index < 3 ? 'xl:border-r' : ''}`}><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${metric.tone}`}><metric.icon className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-slate-600">{metric.label}</p><p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-950">{metric.value} <span className="text-sm font-semibold text-slate-500">{metric.unit}</span></p></div></div>)}
                                </section>

                                {canEditAllAreas && (
                                    <nav className="mb-5 overflow-x-auto rounded-2xl border border-line bg-white p-1.5 shadow-sm" aria-label="เลือกงานประจำชั้น"><div className="flex min-w-max gap-1"><button onClick={() => setActiveTab('summary')} aria-pressed={activeTab === 'summary'} className={`min-h-11 rounded-xl px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${activeTab === 'summary' ? 'action-primary' : 'text-slate-600 hover:bg-slate-100'}`}><PenLine className="mr-2 inline h-4 w-4" />สรุปความสามารถรายด้าน</button><button onClick={() => setActiveTab('academic')} className={`min-h-11 rounded-xl px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${activeTab === 'academic' ? 'action-primary' : 'text-slate-600 hover:bg-slate-100'}`}><BookOpen className="mr-2 inline h-4 w-4" />ผลราย LO จากรายวิชา</button><button onClick={() => setActiveTab('activity')} className={`min-h-11 rounded-xl px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${activeTab === 'activity' ? 'action-primary' : 'text-slate-600 hover:bg-slate-100'}`}><Star className="mr-2 inline h-4 w-4" />กิจกรรมและคุณลักษณะ {savedActivityStudents < students.length && <span className={`ml-1 rounded-lg px-1.5 py-0.5 text-xs ${activeTab === 'activity' ? 'bg-white/20 text-white' : 'surface-warning text-amber-800'}`}>{students.length - savedActivityStudents} ค้าง</span>}</button></div></nav>
                                )}
                                {activeTab === 'summary' ? <HomeroomCompetencyTab room={room} students={students} data={data} academicYear={academicYear} semester={semester} editableAreas={editableAreas} canSubmitRoom={canEditAllAreas} /> : activeTab === 'academic' ? renderAcademicTable() : renderActivityTable()}
                            </>
                        ) : (
                            <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                                <UsersRound className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
                                <h3 className="mt-3 font-bold text-slate-800">เลือกห้องเรียนเพื่อเริ่มงานประจำชั้น</h3>
                                <p className="mt-1 text-sm text-slate-600">เลือกห้องด้านบน ระบบจะดึงข้อมูลนักเรียนและข้อความ LO ของทุกวิชาให้เอง</p>
                            </section>
                        )}
                    </>
                )}
            </div>
        </Layout>
    );
}
