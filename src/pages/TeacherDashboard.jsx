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
    Search,
    UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { calculateCompletion, calculateEvidenceProgress } from '../lib/evaluationProgress';

export default function TeacherDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [allSubjects, setAllSubjects] = useState([]);
    const [subjectRooms, setSubjectRooms] = useState([]);
    const [progressMap, setProgressMap] = useState({});
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
                <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl ring-1 ring-white/10">
                    <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
                    <div className="absolute -left-10 -bottom-10 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

                    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2 max-w-2xl">
                            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/20 px-3.5 py-1 text-xs font-semibold text-indigo-100">งานของครูผู้สอน</div>
                            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
                                สวัสดีครับ/ค่ะ, {currentUser?.full_name || 'คุณครู'}
                            </h1>
                            <p className="text-xs sm:text-sm leading-relaxed text-indigo-100">
                                ทำตาม 2 ขั้น: บันทึกข้อความพฤติกรรมราย LO ให้ครบ แล้วสรุประดับเป็นรายด้านความสามารถ
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="rounded-2xl bg-white/10 px-4 py-3 text-xs backdrop-blur-md border border-white/15">
                                <span className="block font-medium text-indigo-200">รอบการประเมินปัจจุบัน</span>
                                <strong className="text-sm font-extrabold text-white">ภาคเรียนที่ {semester}/{academicYear}</strong>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Metrics Overview Cards */}
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ข้อมูลภาพรวมงานครู">
                    {[
                        { label: 'วิชาที่รับผิดชอบ', value: totalSubjects, unit: 'วิชา', icon: BookOpen, color: 'from-indigo-500/10 via-indigo-500/5 to-transparent text-indigo-700 border-indigo-200/80 icon-bg:bg-indigo-600' },
                        { label: 'นักเรียนในกลุ่มเรียน', value: totalStudents, unit: 'คน', icon: UsersRound, color: 'from-blue-500/10 via-blue-500/5 to-transparent text-blue-700 border-blue-200/80 icon-bg:bg-blue-600' },
                        { label: 'รายการที่ประเมินแล้ว', value: completedAssessmentItems, unit: `จาก ${totalAssessmentItems}`, icon: ClipboardCheck, color: 'from-violet-500/10 via-violet-500/5 to-transparent text-violet-700 border-violet-200/80 icon-bg:bg-violet-600' },
                        { label: 'ความก้าวหน้ารวม', value: overallPercent, unit: '%', icon: CheckCircle2, color: 'from-emerald-500/10 via-emerald-500/5 to-transparent text-emerald-700 border-emerald-200/80 icon-bg:bg-emerald-600' },
                    ].map((metric) => {
                        const Icon = metric.icon;
                        return (
                            <div key={metric.label} className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition hover:shadow-md ${metric.color}`}>
                                <div className="flex items-center justify-between">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-500/30">
                                        <Icon className="h-6 w-6" />
                                    </span>
                                </div>
                                <div className="mt-4 space-y-1">
                                    <p className="text-xs font-bold text-slate-500">{metric.label}</p>
                                    <p className="text-3xl font-black tabular-nums tracking-tight text-slate-900">
                                        {loading ? '-' : metric.value.toLocaleString()} <span className="text-xs font-bold text-slate-500">{metric.unit}</span>
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </section>

                {/* Warning Notification Banner for Pending Subjects */}
                {!loading && pendingSubjects > 0 && subjects.length > 0 && (
                    <section className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-5 sm:flex-row sm:items-center sm:justify-between shadow-2xs">
                        <div className="flex items-start gap-3.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 shadow-xs">
                                <AlertTriangle className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-extrabold text-amber-950">มี {pendingSubjects} วิชาที่ยังประเมินผลไม่ครบถ้วน</h3>
                                <p className="mt-0.5 text-xs text-amber-900/80">กรุณาเลือกรายวิชาเพื่อบันทึกข้อความพฤติกรรมที่ยังไม่ครบ</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setStatusFilter('pending')}
                            className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-extrabold text-amber-900 shadow-2xs hover:bg-amber-100 transition shrink-0"
                        >
                            แสดงเฉพาะวิชาที่ยังไม่ครบ
                        </button>
                    </section>
                )}

                {loading ? (
                    <div>
                        <div className="h-96 animate-pulse rounded-3xl bg-slate-200" />
                        <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
                    </div>
                ) : subjects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100 mb-4">
                            <BookMarked className="h-8 w-8" />
                        </div>
                        <h3 className="text-base font-extrabold text-slate-900">ยังไม่มีรายวิชาที่ได้รับมอบหมาย</h3>
                        <p className="mt-1 max-w-md text-xs text-slate-500 leading-relaxed">
                            กรุณาติดต่อฝ่ายวิชาการเพื่อจัดสรรวิชาและกลุ่มเรียนในภาคเรียนที่ {semester}/{academicYear}
                        </p>
                    </div>
                ) : (
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                        
                        {/* Main Table: Subjects List */}
                        <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
                            <div className="border-b border-slate-100 p-6">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                            <BookOpen className="h-5 w-5 text-indigo-600" /> วิชาที่รับผิดชอบ
                                        </h3>
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
                                                className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-600 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20 sm:w-48"
                                            />
                                        </div>
                                        <select
                                            value={statusFilter}
                                            onChange={e => setStatusFilter(e.target.value)}
                                            aria-label="กรองรายวิชาตามสถานะ"
                                            className="min-h-11 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
                                        >
                                            <option value="all">ทุกสถานะ</option>
                                            <option value="pending">ยังไม่ครบ</option>
                                            <option value="complete">ประเมินครบแล้ว</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Responsive Cards / Table List */}
                            <div className="divide-y divide-slate-100">
                                {visibleSubjects.map((sub) => {
                                    const progress = progressMap[sub.key] || { studentCount: 0, loCount: 0, percent: 0 };
                                    const isComplete = progress.percent === 100;
                                    const hasStudents = progress.studentCount > 0;

                                    return (
                                        <div
                                            key={sub.key}
                                            className="p-5 transition hover:bg-slate-50/80 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="space-y-1 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-extrabold text-sm text-slate-950">{sub.subject_name}</span>
                                                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-100">
                                                        ชั้น {sub.grade_level || 'ไม่ระบุ'} {sub.room ? `ห้อง ${sub.room}` : ''}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-3 text-xs text-slate-500">
                                                    <span>นักเรียน <strong className="text-slate-800 font-extrabold">{progress.studentCount}</strong> คน</span>
                                                    <span>·</span>
                                                    <span>จำนวน <strong className="text-slate-800 font-extrabold">{progress.loCount}</strong> LO</span>
                                                </div>
                                            </div>

                                            {/* Progress Bar */}
                                            <div className="w-full md:w-48 space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className={`font-bold ${isComplete ? 'text-emerald-800' : hasStudents ? 'text-amber-800' : 'text-slate-600'}`}>
                                                        {isComplete ? 'ครบ 100%' : hasStudents ? `ความก้าวหน้า ${progress.percent}%` : 'ไม่มีนักเรียน'}
                                                    </span>
                                                    <span className="font-mono text-slate-600 text-[11px]">
                                                        {progress.filledCells || 0}/{progress.totalCells || 0}
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-300 ${
                                                            isComplete ? 'bg-emerald-500' : 'bg-indigo-600'
                                                        }`}
                                                        style={{ width: `${progress.percent}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex shrink-0 flex-wrap gap-2">
                                                <button
                                                    onClick={() => navigate(`/eval/${sub.subject_id}${sub.room ? `?room=${encodeURIComponent(sub.room)}` : ''}`, { state: { subject: sub } })}
                                                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                                >
                                                    ขั้นที่ 1 · บันทึกข้อความ LO <ArrowRight className="h-3.5 w-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => navigate(`/formative/${sub.subject_id}${sub.room ? `?room=${encodeURIComponent(sub.room)}` : ''}`, { state: { subject: sub } })}
                                                    disabled={!isComplete}
                                                    title={!isComplete ? 'บันทึกข้อความ LO ให้ครบก่อนสรุประดับรายด้าน' : undefined}
                                                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-2.5 text-xs font-extrabold text-indigo-900 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
                                                >
                                                    ขั้นที่ 2 · สรุประดับรายด้าน
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
