import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllByIn, supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import Layout from '../components/Layout';
import {
    AlertTriangle,
    ArrowRight,
    BookMarked,
    BookOpen,
    CheckCircle2,
    ClipboardCheck,
    ListChecks,
    Printer,
    Search,
    UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calculateCompletion, calculateEvidenceProgress } from '../lib/evaluationProgress';
import { PROPOSAL_STATUS, statusOf } from '../lib/loProposals';
import { loadProposals } from '../lib/loProposalsApi';

export default function TeacherDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [allSubjects, setAllSubjects] = useState([]);
    const [subjectRooms, setSubjectRooms] = useState([]);
    const [progressMap, setProgressMap] = useState({});
    // สถานะ LO ของแต่ละวิชา ครูต้องเลือก LO และรอฝ่ายวิชาการอนุมัติก่อนจึงบันทึกข้อความ LO ได้
    const [loStatus, setLoStatus] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [subjectQuery, setSubjectQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const navigate = useNavigate();

    useEffect(() => {
        async function loadSubjects() {
            if (!currentUser?.teacher_id) return;
            try {
                const { data: primary, error: err1 } = await supabase
                    .from('subjects')
                    .select('*')
                    .eq('teacher_id', currentUser.teacher_id)
                    .eq('school_id', currentUser.school_id)
                    .order('academic_year', { ascending: false })
                    .order('semester', { ascending: false });

                if (err1) throw err1;

                const { data: co, error: err2 } = await supabase
                    .from('subject_teachers')
                    .select('room_name, subjects!inner(*)')
                    .eq('teacher_id', currentUser.teacher_id);

                if (err2) throw err2;

                const subMap = new Map();
                (primary || []).forEach(s => {
                    subMap.set(s.subject_id, { ...s, assigned_rooms: null });
                });
                (co || []).forEach(c => {
                    if (c.subjects?.school_id === currentUser.school_id) {
                        if (!subMap.has(c.subjects.subject_id)) {
                            subMap.set(c.subjects.subject_id, { ...c.subjects, assigned_rooms: c.room_name ? new Set([c.room_name]) : null });
                            return;
                        }
                        const s = subMap.get(c.subjects.subject_id);
                        // null หมายถึงรับผิดชอบทุกห้อง; อย่าเปลี่ยนครูหลักกลับเป็นรายห้อง
                        if (s.assigned_rooms && !c.room_name) s.assigned_rooms = null;
                        else if (s.assigned_rooms && c.room_name) {
                            s.assigned_rooms.add(c.room_name);
                        }
                    }
                });

                setAllSubjects(Array.from(subMap.values()));
            } catch (err) {
                toast.error('ไม่สามารถดึงข้อมูลวิชาได้: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadSubjects();
    }, [currentUser]);

    const subjects = useMemo(() => {
        if (!academicYear || !semester) return allSubjects;
        return allSubjects.filter(s =>
            s.academic_year === academicYear && s.semester === semester
        );
    }, [allSubjects, academicYear, semester]);

    useEffect(() => {
        if (subjects.length === 0) {
            setSubjectRooms([]);
            setProgressMap({});
            setLoStatus(new Map());
            return;
        }

        const loadProgress = async () => {
            const subjectIds = subjects.map(s => s.subject_id);

            const [enrollments, loMappings] = await Promise.all([
                fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('student_enrollments')
                    .select('enrollment_id, student_id, subject_id, room').in('subject_id', batch).eq('enrollment_status', 'active').range(from, to)),
                fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('subject_lo_mapping')
                    .select('subject_id, lo_id').in('subject_id', batch).range(from, to)),
            ]);

            const proposals = await loadProposals(subjectIds);
            setLoStatus(new Map(subjects.map(sub => [
                sub.subject_id,
                statusOf(proposals.get(sub.subject_id), loMappings.filter(m => m.subject_id === sub.subject_id).map(m => m.lo_id)),
            ])));

            const enrollIds = (enrollments || []).map(e => e.enrollment_id);
            let evals = [];
            if (enrollIds.length > 0) {
                const data = await fetchAllByIn(enrollIds, (batch, from, to) => supabase.from('lo_evaluations')
                    .select('enrollment_id, lo_id, evidence_note').in('enrollment_id', batch).range(from, to));
                evals = data.filter(e => e.evidence_note);
            }

            const pMap = {};
            const newSubjectRooms = [];

            subjects.forEach(sub => {
                const subEnrolls = enrollments.filter(e => e.subject_id === sub.subject_id);
                const subLOs = loMappings.filter(m => m.subject_id === sub.subject_id);
                const uniqueRooms = [...new Set(subEnrolls.map(e => e.room).filter(Boolean))];
                const roomsToShow = uniqueRooms.length ? uniqueRooms : [null];

                roomsToShow.forEach(room => {
                    if (room && sub.assigned_rooms && !sub.assigned_rooms.has(room)) return;

                    const roomEnrolls = room ? subEnrolls.filter(e => e.room === room) : subEnrolls;
                    const roomEnrollIds = new Set(roomEnrolls.map(e => e.enrollment_id));
                    const subLoIds = new Set(subLOs.map(l => l.lo_id));
                    const filledCells = evals.filter(ev =>
                        roomEnrollIds.has(ev.enrollment_id) && subLoIds.has(ev.lo_id)
                    ).length;
                    const progress = calculateEvidenceProgress({ enrollmentCount: roomEnrolls.length, loCount: subLOs.length, filledCount: filledCells });

                    const key = `${sub.subject_id}_${room || 'all'}`;
                    newSubjectRooms.push({ ...sub, room, key });
                    pMap[key] = {
                        studentCount: roomEnrolls.length,
                        studentIds: roomEnrolls.map(item => item.student_id),
                        loCount: subLOs.length,
                        totalCells: progress.total,
                        filledCells,
                        percent: progress.percent,
                    };
                });
            });

            setSubjectRooms(newSubjectRooms);
            setProgressMap(pMap);
        };

        loadProgress();
    }, [subjects]);

    // วิชาที่ยังไม่ผ่านการอนุมัติ LO ครูต้องเลือก LO ก่อน ยังบันทึกข้อความไม่ได้
    const loPendingSubjects = subjects.filter(sub => loStatus.get(sub.subject_id) && loStatus.get(sub.subject_id) !== 'approved');
    const loReturnedSubjects = loPendingSubjects.filter(sub => loStatus.get(sub.subject_id) === 'returned');
    const totalSubjects = subjectRooms.length;
    const completedSubjects = subjectRooms.filter(sr => progressMap[sr.key]?.percent === 100).length;
    const pendingSubjects = totalSubjects - completedSubjects;
    const totalStudents = new Set(subjectRooms.flatMap(sr => progressMap[sr.key]?.studentIds || [])).size;
    const totalAssessmentItems = subjectRooms.reduce((sum, sr) => sum + (progressMap[sr.key]?.totalCells || 0), 0);
    const completedAssessmentItems = subjectRooms.reduce((sum, sr) => sum + (progressMap[sr.key]?.filledCells || 0), 0);
    const overallPercent = calculateCompletion(completedAssessmentItems, totalAssessmentItems).percent;

    const visibleSubjects = subjectRooms.filter(sr => {
        const progress = progressMap[sr.key] || { percent: 0 };
        const matchesQuery = `${sr.subject_name || ''} ${sr.grade_level || ''} ${sr.room || ''}`.toLowerCase().includes(subjectQuery.trim().toLowerCase());
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'complete' ? progress.percent === 100 : progress.percent < 100);
        return matchesQuery && matchesStatus;
    });

    return (
        <Layout title="งานประเมินผลสำหรับครูผู้สอน">
            <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-12">
                
                {/* Top Teacher Dashboard Hero Banner */}
                <header className="overflow-hidden rounded-2xl border border-indigo-900 bg-indigo-800 text-white">
                    <div className="flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-2xl space-y-2">
                            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-amber-300">
                                <span className="block h-0.5 w-6 bg-amber-400" aria-hidden="true" />งานของครูผู้สอน
                            </p>
                            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                                สวัสดีครับ/ค่ะ, {currentUser?.full_name || 'คุณครู'}
                            </h1>
                            <p className="text-sm leading-relaxed text-indigo-100">
                                เลือก LO ของวิชาที่สอนให้ฝ่ายวิชาการอนุมัติก่อน แล้วบันทึกข้อความพฤติกรรมราย LO ครูประจำชั้นจะนำข้อความของทุกวิชาไปสรุปความสามารถรายด้าน
                            </p>
                        </div>
                        <div className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-4 py-3 text-xs">
                            <span className="block font-medium text-indigo-100">รอบการประเมินปัจจุบัน</span>
                            <strong className="text-sm font-bold text-white">ภาคเรียนที่ {semester}/{academicYear}</strong>
                        </div>
                    </div>
                </header>

                {/* ต้องเลือก LO ของวิชาและรอฝ่ายวิชาการอนุมัติก่อน จึงจะบันทึกข้อความ LO ได้ */}
                {!loading && loPendingSubjects.length > 0 && (
                    <section className="flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800 shadow-sm">
                                <ListChecks className="h-6 w-6" aria-hidden="true" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-indigo-950">มี {loPendingSubjects.length} วิชาที่ต้องเลือก LO ก่อนเริ่มบันทึกข้อความ</h2>
                                <p className="mt-0.5 text-xs text-indigo-900/80">
                                    เลือกว่าวิชาของคุณประเมิน LO ข้อไหน แล้วส่งให้ฝ่ายวิชาการอนุมัติ
                                    {loReturnedSubjects.length > 0 && ` · มี ${loReturnedSubjects.length} วิชาที่ฝ่ายวิชาการส่งกลับให้แก้`}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => navigate(`/lo-setup/${loPendingSubjects[0].subject_id}`)}
                            className="min-h-11 shrink-0 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        >
                            เริ่มที่วิชา {loPendingSubjects[0].subject_name}
                        </button>
                    </section>
                )}

                {/* Warning Notification Banner for Pending Subjects */}
                {!loading && pendingSubjects > 0 && subjects.length > 0 && (
                    <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 sm:flex-row sm:items-center sm:justify-between shadow-sm">
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-sm">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-sm font-bold text-amber-950">มี {pendingSubjects} วิชาที่ยังประเมินผลไม่ครบถ้วน</h2>
                                <p className="mt-0.5 text-xs text-amber-900/80">กรุณาเลือกรายวิชาเพื่อบันทึกข้อความพฤติกรรมที่ยังไม่ครบ</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setStatusFilter('pending')}
                            className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-bold text-amber-900 shadow-sm hover:bg-amber-100 transition shrink-0"
                        >
                            แสดงเฉพาะวิชาที่ยังไม่ครบ
                        </button>
                    </section>
                )}

                {/* Metrics Overview Cards */}
                <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="ข้อมูลภาพรวมงานครู">
                    {[
                        { label: 'วิชาที่รับผิดชอบ', value: totalSubjects, unit: 'วิชา', icon: BookOpen },
                        { label: 'นักเรียนในกลุ่มเรียน', value: totalStudents, unit: 'คน', icon: UsersRound },
                        { label: 'รายการที่ประเมินแล้ว', value: completedAssessmentItems, unit: `จาก ${totalAssessmentItems}`, icon: ClipboardCheck },
                        { label: 'ความก้าวหน้ารวม', value: overallPercent, unit: '%', icon: CheckCircle2 },
                    ].map((metric) => {
                        const Icon = metric.icon;
                        return (
                            <div key={metric.label} className="rounded-2xl border border-line bg-white p-4 sm:p-5">
                                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 sm:h-11 sm:w-11" aria-hidden="true">
                                    <Icon className="h-5 w-5" />
                                </span>
                                <div className="mt-4 space-y-1">
                                    <p className="text-xs font-semibold text-slate-600">{metric.label}</p>
                                    <p className="text-2xl font-bold tabular-nums tracking-tight text-ink sm:text-3xl">
                                        {loading ? '-' : metric.value.toLocaleString()} <span className="text-xs font-bold text-slate-500">{metric.unit}</span>
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </section>

                {loading ? (
                    <div>
                        <div className="h-96 animate-pulse rounded-2xl bg-slate-200" />
                        <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
                    </div>
                ) : subjects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100 mb-4">
                            <BookMarked className="h-8 w-8" />
                        </div>
                        <h2 className="text-base font-bold text-slate-900">ยังไม่มีรายวิชาที่ได้รับมอบหมาย</h2>
                        <p className="mt-1 max-w-md text-xs text-slate-500 leading-relaxed">
                            กรุณาติดต่อฝ่ายวิชาการเพื่อจัดสรรวิชาและกลุ่มเรียนในภาคเรียนที่ {semester}/{academicYear}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                        
                        {/* Main Table: Subjects List */}
                        <section className="overflow-hidden rounded-2xl border border-line/90 bg-white shadow-sm">
                            <div className="border-b border-line p-6">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                            <BookOpen className="h-5 w-5 text-indigo-600" /> วิชาที่รับผิดชอบ
                                        </h2>
                                        <p className="mt-0.5 text-xs text-slate-500">เลือกวิชาเพื่อบันทึกผลการประเมินราย LO</p>
                                    </div>

                                    {/* Search & Filter Toolbar */}
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                                            <input
                                                type="text"
                                                value={subjectQuery}
                                                onChange={e => setSubjectQuery(e.target.value)}
                                                placeholder="ค้นหาชื่อวิชา/ชั้น..."
                                                aria-label="ค้นหารายวิชาและระดับชั้น"
                                                className="min-h-11 w-full rounded-xl border border-field bg-slate-50 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-600 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 sm:w-48"
                                            />
                                        </div>
                                        <select
                                            value={statusFilter}
                                            onChange={e => setStatusFilter(e.target.value)}
                                            aria-label="กรองรายวิชาตามสถานะ"
                                            className="min-h-11 rounded-xl border border-field bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                                        >
                                            <option value="all">ทุกสถานะ</option>
                                            <option value="pending">ยังไม่ครบ</option>
                                            <option value="complete">ประเมินครบแล้ว</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Responsive Cards / Table List */}
                            <div className="divide-y divide-line">
                                {visibleSubjects.map((sub) => {
                                    const progress = progressMap[sub.key] || { studentCount: 0, loCount: 0, percent: 0 };
                                    const isComplete = progress.percent === 100;
                                    const hasStudents = progress.studentCount > 0;
                                    const subjectLoStatus = loStatus.get(sub.subject_id) || 'none';
                                    const loApproved = subjectLoStatus === 'approved';

                                    return (
                                        <div
                                            key={sub.key}
                                            className="p-5 transition hover:bg-slate-50/80 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="space-y-1 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm text-slate-950">{sub.subject_name}</span>
                                                    <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-100">
                                                        ชั้น {sub.grade_level || 'ไม่ระบุ'} {sub.room ? `ห้อง ${sub.room}` : ''}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                    <span>นักเรียน <strong className="text-slate-800 font-bold">{progress.studentCount}</strong> คน</span>
                                                    <span>·</span>
                                                    <span>จำนวน <strong className="text-slate-800 font-bold">{progress.loCount}</strong> LO</span>
                                                    {!loApproved && <span className={`chip ${PROPOSAL_STATUS[subjectLoStatus].chip}`}>LO · {PROPOSAL_STATUS[subjectLoStatus].short}</span>}
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="w-full md:w-48 space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className={`font-bold ${isComplete ? 'text-emerald-800' : hasStudents ? 'text-amber-800' : 'text-slate-600'}`}>
                                                        {isComplete ? 'ครบ 100%' : hasStudents ? `ความก้าวหน้า ${progress.percent}%` : 'ไม่มีนักเรียน'}
                                                    </span>
                                                    <span className="font-mono text-slate-600 text-xs">
                                                        {progress.filledCells || 0}/{progress.totalCells || 0}
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-300 ${
                                                            isComplete ? 'bg-emerald-500' : 'bg-indigo-700'
                                                        }`}
                                                        style={{ width: `${progress.percent}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex shrink-0 flex-wrap gap-2">
                                                {loApproved ? (
                                                    <button
                                                        onClick={() => navigate(`/eval/${sub.subject_id}${sub.room ? `?room=${encodeURIComponent(sub.room)}` : ''}`, { state: { subject: sub } })}
                                                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                                    >
                                                        บันทึกข้อความ LO <ArrowRight className="h-3.5 w-3.5" />
                                                    </button>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => navigate(`/lo-setup/${sub.subject_id}`)}
                                                            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-indigo-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                                        >
                                                            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                                                            {subjectLoStatus === 'submitted' ? 'ดู LO ที่ส่งไป' : 'เลือก LO ของวิชา'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled
                                                            title={subjectLoStatus === 'submitted' ? 'รอฝ่ายวิชาการอนุมัติ LO ของวิชานี้ก่อน' : 'ต้องเลือก LO ของวิชาและให้ฝ่ายวิชาการอนุมัติก่อน'}
                                                            className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-500"
                                                        >
                                                            บันทึกข้อความ LO
                                                        </button>
                                                    </>
                                                )}
                                                <button
                                                    onClick={() => navigate(`/summary/${sub.subject_id}${sub.room ? `?room=${encodeURIComponent(sub.room)}` : ''}`, { state: { subject: sub } })}
                                                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                                >
                                                    <Printer className="h-3.5 w-3.5" aria-hidden="true" /> พิมพ์ผลรายวิชา
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}

                                {visibleSubjects.length === 0 && (
                                    <div className="p-12 text-center text-xs text-slate-500">
                                        ไม่พบรายวิชาที่ตรงกับคำค้นหาหรือสถานะที่เลือก
                                    </div>
                                )}
                            </div>
                        </section>

                    </div>
                )}
            </div>
        </Layout>
    );
}
