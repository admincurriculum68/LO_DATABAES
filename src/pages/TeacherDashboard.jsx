import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import Layout from '../components/Layout';
import { FileBarChart2, BookOpen, GraduationCap, ArrowRight, LayoutDashboard, BookMarked, CheckCircle2, AlertTriangle, UsersRound, ClipboardCheck, Search } from 'lucide-react';
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

    // Filter subjects by current academic year/semester
    const subjects = useMemo(() => {
        if (!academicYear || !semester) return allSubjects;
        return allSubjects.filter(s =>
            s.academic_year === academicYear && s.semester === semester
        );
    }, [allSubjects, academicYear, semester]);

    // Load progress for filtered subjects
    useEffect(() => {
        if (subjects.length === 0) {
            setProgressMap({});
            return;
        }

        const loadProgress = async () => {
            const subjectIds = subjects.map(s => s.subject_id);

            // Get enrollment counts per subject
            const { data: enrollments } = await supabase
                .from('student_enrollments')
                .select('enrollment_id, subject_id')
                .in('subject_id', subjectIds);

            // Get LO mapping counts per subject
            const { data: loMappings } = await supabase
                .from('subject_lo_mapping')
                .select('subject_id, lo_id')
                .in('subject_id', subjectIds);

            // Get evaluation counts
            const enrollIds = (enrollments || []).map(e => e.enrollment_id);
            let evals = [];
            if (enrollIds.length > 0) {
                const { data } = await supabase
                    .from('lo_evaluations')
                    .select('enrollment_id, lo_id, competency_level')
                    .in('enrollment_id', enrollIds);
                // แถวที่มีแต่หลักฐานแต่ยังไม่เลือกระดับ ยังถือว่าประเมินไม่เสร็จ
                evals = (data || []).filter(e => e.competency_level);
            }

            // Build progress map
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

    // Summary stats
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
            <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><LayoutDashboard className="h-4 w-4" /> Dashboard ครูผู้สอน</div><h2 className="mt-1 text-2xl font-extrabold text-slate-950">ภาพรวมงานประเมินของฉัน</h2><p className="mt-1 text-sm text-slate-600">{currentUser?.full_name} · ภาคเรียนที่ {semester}/{academicYear}</p></div>
            </header>

            <section className="mb-6 grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="ข้อมูลภาพรวมงานครู">
                {[
                    { label: 'วิชาที่รับผิดชอบ', value: totalSubjects, unit: 'วิชา', icon: BookOpen, tone: 'bg-indigo-50 text-indigo-700' },
                    { label: 'นักเรียนในกลุ่มเรียน', value: totalStudents, unit: 'รายชื่อ', icon: UsersRound, tone: 'bg-blue-50 text-blue-700' },
                    { label: 'รายการที่ประเมินแล้ว', value: completedAssessmentItems, unit: `จาก ${totalAssessmentItems}`, icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-700' },
                    { label: 'ความก้าวหน้ารวม', value: overallPercent, unit: '%', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700' },
                ].map((metric, index) => { const Icon = metric.icon; return <div key={metric.label} className={`flex items-center gap-3 border-b border-slate-200 p-4 sm:p-5 ${index % 2 === 0 ? 'sm:border-r' : ''} ${index < 2 ? 'xl:border-b-0' : 'sm:border-b-0'} ${index < 3 ? 'xl:border-r' : ''}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}><Icon className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-slate-600">{metric.label}</p><p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-950">{loading ? '-' : metric.value.toLocaleString()} <span className="text-sm font-semibold text-slate-500">{metric.unit}</span></p></div></div>; })}
            </section>

            {!loading && pendingSubjects > 0 && subjects.length > 0 && (
                <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between" aria-label="งานที่ต้องดำเนินการ">
                    <div className="flex items-start gap-3"><span className="rounded-xl bg-amber-100 p-2.5 text-amber-800"><AlertTriangle className="h-5 w-5" /></span><div><h3 className="font-extrabold text-amber-950">มี {pendingSubjects} วิชาที่ยังประเมินไม่ครบ</h3><p className="mt-1 text-sm text-amber-900">เลือกวิชาจากตารางด้านล่างเพื่อบันทึกผลต่อได้ทันที</p></div></div>
                    <button onClick={() => setStatusFilter('pending')} className="min-h-10 rounded-xl border border-amber-300 bg-white px-4 text-sm font-extrabold text-amber-900 hover:bg-amber-100">แสดงเฉพาะงานที่ยังไม่ครบ</button>
                </section>
            )}

            {loading ? (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /><div className="h-64 animate-pulse rounded-2xl bg-slate-200" /></div>
            ) : subjects.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
                    <span className="mb-4 rounded-2xl bg-slate-100 p-4"><BookMarked className="h-9 w-9 text-slate-500" /></span>
                    <h3 className="text-lg font-extrabold text-slate-800">ยังไม่มีวิชาที่ได้รับมอบหมาย</h3>
                    <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">กรุณาติดต่อฝ่ายวิชาการเพื่อตรวจสอบการมอบหมายครูผู้สอนในภาคเรียนที่ {semester}/{academicYear}</p>
                </div>
            ) : (
                <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="font-extrabold text-slate-950">วิชาที่รับผิดชอบ</h3><p className="mt-0.5 text-sm text-slate-600">เลือกวิชาเพื่อบันทึกผลการประเมินหรือดูรายงาน</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><span className="sr-only">ค้นหาวิชา</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" /><input value={subjectQuery} onChange={event => setSubjectQuery(event.target.value)} placeholder="ค้นหาชื่อวิชา/ชั้น" className="min-h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-44" /></label><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"><option value="all">ทุกสถานะ</option><option value="pending">ยังไม่ครบ</option><option value="complete">ครบแล้ว</option></select></div></div></div>
                        <div className="hidden grid-cols-[minmax(180px,1fr)_90px_100px_150px_110px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-extrabold text-slate-600 md:grid"><span>วิชา</span><span>นักเรียน</span><span>LO</span><span>ความก้าวหน้า</span><span className="text-right">ดำเนินการ</span></div>
                        <div className="divide-y divide-slate-200">{visibleSubjects.map((sub) => {
                        const progress = progressMap[sub.subject_id] || { studentCount: 0, loCount: 0, percent: 0 };
                        const isComplete = progress.percent === 100;
                        const hasStudents = progress.studentCount > 0;
                        return (
                            <div key={sub.subject_id} className="grid gap-3 p-5 hover:bg-slate-50 md:grid-cols-[minmax(180px,1fr)_90px_100px_150px_110px] md:items-center"><div><p className="font-extrabold text-slate-900">{sub.subject_name}</p><p className="mt-1 text-sm text-slate-600">ระดับชั้น {sub.grade_level || 'ไม่ระบุ'}</p></div><div className="text-sm text-slate-700"><span className="font-extrabold md:block">{progress.studentCount}</span><span className="md:text-xs md:text-slate-500"> คน</span></div><div className="text-sm text-slate-700"><span className="font-extrabold md:block">{progress.loCount}</span><span className="md:text-xs md:text-slate-500"> LO</span></div><div><div className="mb-1.5 flex items-center justify-between text-xs font-bold"><span className={isComplete ? 'text-emerald-700' : hasStudents ? 'text-amber-700' : 'text-slate-500'}>{isComplete ? 'ครบแล้ว' : hasStudents ? `${progress.percent}%` : 'ยังไม่มีนักเรียน'}</span><span className="text-slate-500">{progress.filledCells || 0}/{progress.totalCells || 0}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${isComplete ? 'bg-emerald-600' : 'bg-indigo-600'}`} style={{ width: `${progress.percent}%` }} /></div></div><button onClick={() => navigate(`/eval/${sub.subject_id}`, { state: { subject: sub } })} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-xl bg-indigo-700 px-3 text-sm font-extrabold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2">ประเมินผล <ArrowRight className="h-4 w-4" /></button></div>
                        );
                    })}{visibleSubjects.length === 0 && <div className="p-10 text-center text-sm text-slate-600">ไม่พบวิชาที่ตรงกับคำค้นหาหรือสถานะที่เลือก</div>}</div>
                    </section>

                    <aside className="space-y-6">
                        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4"><h3 className="font-extrabold text-slate-950">เมนูงานครู</h3></div><div className="divide-y divide-slate-200"><button onClick={() => currentUser?.homeroom && navigate('/homeroom')} disabled={!currentUser?.homeroom} className="group flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"><GraduationCap className="h-5 w-5 text-indigo-700" /><span className="flex-1"><strong className="block text-sm text-slate-900">งานครูประจำชั้น</strong><span className="mt-0.5 block text-xs text-slate-600">กิจกรรมและคุณลักษณะ</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></button><button onClick={() => subjects[0] && navigate(`/summary/${subjects[0].subject_id}`, { state: { subject: subjects[0] } })} className="group flex w-full items-center gap-3 p-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"><FileBarChart2 className="h-5 w-5 text-indigo-700" /><span className="flex-1"><strong className="block text-sm text-slate-900">สรุปผลรายวิชา</strong><span className="mt-0.5 block text-xs text-slate-600">เลือกดูจากแต่ละวิชา</span></span><ArrowRight className="h-4 w-4 text-slate-400" /></button></div></section>
                    </aside>
                </div>
            )}
        </Layout>
    );
}
