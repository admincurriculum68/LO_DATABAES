import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import Layout from '../components/Layout';
import {
    AlertTriangle,
    ArrowRight,
    BookMarked,
    BookOpen,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    FileBarChart2,
    GraduationCap,
    LayoutDashboard,
    Search,
    Sparkles,
    UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [allSubjects, setAllSubjects] = useState([]);
    const [progressMap, setProgressMap] = useState({});
    const [loading, setLoading] = useState(true);
    const [subjectQuery, setSubjectQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const navigate = useNavigate();

    useEffect(() => {
        async function loadSubjects() {
            if (!currentUser?.teacher_id) return;
            try {
                const { data, error } = await supabase
                    .from('subjects')
                    .select('*')
                    .eq('teacher_id', currentUser.teacher_id)
                    .order('academic_year', { ascending: false })
                    .order('semester', { ascending: false });

                if (error) throw error;
                setAllSubjects(data || []);
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
            setProgressMap({});
            return;
        }

        const loadProgress = async () => {
            const subjectIds = subjects.map(s => s.subject_id);

            const { data: enrollments } = await supabase
                .from('student_enrollments')
                .select('enrollment_id, subject_id')
                .in('subject_id', subjectIds);

            const { data: loMappings } = await supabase
                .from('subject_lo_mapping')
                .select('subject_id, lo_id')
                .in('subject_id', subjectIds);

            const enrollIds = (enrollments || []).map(e => e.enrollment_id);
            let evals = [];
            if (enrollIds.length > 0) {
                const { data } = await supabase
                    .from('lo_evaluations')
                    .select('enrollment_id, lo_id, competency_level')
                    .in('enrollment_id', enrollIds);
                evals = (data || []).filter(e => e.competency_level);
            }

            const pMap = {};
            subjectIds.forEach(sid => {
                const subEnrolls = (enrollments || []).filter(e => e.subject_id === sid);
                const subLOs = (loMappings || []).filter(m => m.subject_id === sid);
                const totalCells = subEnrolls.length * subLOs.length;

                const subEnrollIds = subEnrolls.map(e => e.enrollment_id);
                const subLoIds = subLOs.map(l => l.lo_id);
                const filledCells = evals.filter(ev =>
                    subEnrollIds.includes(ev.enrollment_id) && subLoIds.includes(ev.lo_id)
                ).length;

                pMap[sid] = {
                    studentCount: subEnrolls.length,
                    loCount: subLOs.length,
                    totalCells,
                    filledCells,
                    percent: totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0
                };
            });
            setProgressMap(pMap);
        };

        loadProgress();
    }, [subjects]);

    const totalSubjects = subjects.length;
    const completedSubjects = subjects.filter(s => progressMap[s.subject_id]?.percent === 100).length;
    const pendingSubjects = totalSubjects - completedSubjects;
    const totalStudents = subjects.reduce((sum, subject) => sum + (progressMap[subject.subject_id]?.studentCount || 0), 0);
    const totalAssessmentItems = subjects.reduce((sum, subject) => sum + (progressMap[subject.subject_id]?.totalCells || 0), 0);
    const completedAssessmentItems = subjects.reduce((sum, subject) => sum + (progressMap[subject.subject_id]?.filledCells || 0), 0);
    const overallPercent = totalAssessmentItems > 0 ? Math.round((completedAssessmentItems / totalAssessmentItems) * 100) : 0;

    const visibleSubjects = subjects.filter(subject => {
        const progress = progressMap[subject.subject_id] || { percent: 0 };
        const matchesQuery = `${subject.subject_name || ''} ${subject.grade_level || ''}`.toLowerCase().includes(subjectQuery.trim().toLowerCase());
        const matchesStatus = statusFilter === 'all' || (statusFilter === 'complete' ? progress.percent === 100 : progress.percent < 100);
        return matchesQuery && matchesStatus;
    });

    return (
        <Layout
            title="งานประเมินผลสำหรับครูผู้สอน"
            actionText="ประเมินกิจกรรมและคุณลักษณะประจำชั้น"
            actionIcon={GraduationCap}
            onActionClick={() => navigate('/homeroom')}
        >
            <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-12">
                
                {/* Top Teacher Dashboard Hero Banner */}
                <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl ring-1 ring-white/10">
                    <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
                    <div className="absolute -left-10 -bottom-10 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

                    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2 max-w-2xl">
                            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3.5 py-1 text-xs font-semibold text-indigo-200 border border-indigo-400/20 backdrop-blur-md">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-300" /> แผงควบคุมครูผู้สอน (Teacher Workspace)
                            </div>
                            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
                                สวัสดีครับ/ค่ะ, {currentUser?.prefix || ''}{currentUser?.first_name || ''} {currentUser?.last_name || ''}
                            </h1>
                            <p className="text-xs sm:text-sm leading-relaxed text-indigo-100/80">
                                ติดตามความก้าวหน้า บันทึกระดับความสามารถผู้เรียน และแนบหลักฐานเชิงประจักษ์ในแต่ละรายวิชา
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="rounded-2xl bg-white/10 px-4 py-3 text-xs backdrop-blur-md border border-white/15">
                                <span className="block font-medium text-indigo-200">รอบการประเมินปัจจุบัน</span>
                                <strong className="text-sm font-extrabold text-white">ภาคเรียนที่ {semester}/{academicYear}</strong>
                            </div>
                            {currentUser?.homeroom && (
                                <button
                                    onClick={() => navigate('/homeroom')}
                                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-700 px-5 py-3 text-xs font-black text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-indigo-800"
                                >
                                    <GraduationCap className="h-4 w-4" /> ประเมินประจำชั้น ({currentUser.homeroom})
                                </button>
                            )}
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
                                <p className="mt-0.5 text-xs text-amber-900/80">กรุณาเลือกรายวิชาเพื่อบันทึกระดับความสามารถและแนบหลักฐานการเรียนรู้เพิ่มเติม</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setStatusFilter('pending')}
                            className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-xs font-extrabold text-amber-900 shadow-2xs hover:bg-amber-100 transition shrink-0"
                        >
                            แสดงเฉพาะวิชาที่ยังไม่ครบ
                        </button>
                    </section>
                )}

                {loading ? (
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
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
                                            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                            <input
                                                type="text"
                                                value={subjectQuery}
                                                onChange={e => setSubjectQuery(e.target.value)}
                                                placeholder="ค้นหาชื่อวิชา/ชั้น..."
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-48"
                                            />
                                        </div>
                                        <select
                                            value={statusFilter}
                                            onChange={e => setStatusFilter(e.target.value)}
                                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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
                                    const progress = progressMap[sub.subject_id] || { studentCount: 0, loCount: 0, percent: 0 };
                                    const isComplete = progress.percent === 100;
                                    const hasStudents = progress.studentCount > 0;

                                    return (
                                        <div
                                            key={sub.subject_id}
                                            className="p-5 transition hover:bg-slate-50/80 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                                        >
                                            <div className="space-y-1 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-extrabold text-sm text-slate-950">{sub.subject_name}</span>
                                                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-100">
                                                        ชั้น {sub.grade_level || 'ไม่ระบุ'}
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
                                                    <span className={`font-bold ${isComplete ? 'text-emerald-600' : hasStudents ? 'text-amber-600' : 'text-slate-400'}`}>
                                                        {isComplete ? 'ครบ 100%' : hasStudents ? `ความก้าวหน้า ${progress.percent}%` : 'ไม่มีนักเรียน'}
                                                    </span>
                                                    <span className="font-mono text-slate-400 text-[11px]">
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

                                            {/* Action Button */}
                                            <button
                                                onClick={() => navigate(`/eval/${sub.subject_id}`, { state: { subject: sub } })}
                                                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-extrabold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/30 shrink-0"
                                            >
                                                บันทึกประเมินผล <ArrowRight className="h-3.5 w-3.5" />
                                            </button>
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

                        {/* Right Sidebar Menu */}
                        <aside className="space-y-6">
                            <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm">
                                <div className="border-b border-slate-100 p-5">
                                    <h3 className="text-sm font-extrabold text-slate-900">เมนูงานประเมินครู</h3>
                                </div>
                                <div className="divide-y divide-slate-100">
                                    <button
                                        onClick={() => currentUser?.homeroom && navigate('/homeroom')}
                                        disabled={!currentUser?.homeroom}
                                        className="group flex w-full items-center justify-between p-4 text-left hover:bg-slate-50 transition focus:outline-none disabled:opacity-50"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                <GraduationCap className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <strong className="block text-xs font-extrabold text-slate-900">งานครูประจำชั้น</strong>
                                                <span className="text-[11px] text-slate-500">กิจกรรมและคุณลักษณะ</span>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition" />
                                    </button>

                                    <button
                                        onClick={() => subjects[0] && navigate(`/summary/${subjects[0].subject_id}`, { state: { subject: subjects[0] } })}
                                        className="group flex w-full items-center justify-between p-4 text-left hover:bg-slate-50 transition focus:outline-none"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700 border border-sky-100">
                                                <FileBarChart2 className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <strong className="block text-xs font-extrabold text-slate-900">สรุปผลภาพรวมรายวิชา</strong>
                                                <span className="text-[11px] text-slate-500">เลือกดูรายงานของแต่ละวิชา</span>
                                            </div>
                                        </div>
                                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 transition" />
                                    </button>
                                </div>
                            </section>
                        </aside>
                    </div>
                )}
            </div>
        </Layout>
    );
}
