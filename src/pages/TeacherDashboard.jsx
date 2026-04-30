import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import Layout from '../components/Layout';
import { FileBarChart2, ChevronRight, BookOpen, Clock, Activity, GraduationCap, ArrowRight, LayoutDashboard, Bookmark, BookMarked, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [allSubjects, setAllSubjects] = useState([]);
    const [progressMap, setProgressMap] = useState({});
    const [loading, setLoading] = useState(true);
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
                toast.error('ไม่สามารถดึงข้อมูลรายวิชาได้: ' + err.message);
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
        if (subjects.length === 0) return;

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
                    .select('enrollment_id, lo_id')
                    .in('enrollment_id', enrollIds);
                evals = data || [];
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

    return (
        <Layout
            title="พื้นที่จัดการข้อมูลครูผู้สอน"
            actionText="ดูข้อมูลประเมินในห้องประจำชั้น (Homeroom)"
            actionIcon={GraduationCap}
            onActionClick={() => navigate('/homeroom')}
        >
            {/* Dashboard Overview Header */}
            <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4 border-b border-slate-200 pb-8">
                <div className="flex items-center">
                    <div className="bg-indigo-600 p-3.5 rounded-2xl shadow-inner border border-indigo-500 mr-5 hidden sm:block">
                        <LayoutDashboard className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">รายวิชาที่รับผิดชอบ</h2>
                        <p className="text-slate-500 font-medium text-lg mt-1">
                            ยินดีต้อนรับ {currentUser?.full_name} | ภาคเรียนที่ <span className="font-bold text-indigo-600">{semester}/{academicYear}</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-3xl p-6 border border-indigo-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                        <BookOpen className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-500 text-sm mb-1">รายวิชาในเทอมนี้</p>
                        <h4 className="text-3xl font-extrabold text-slate-800 leading-none">{loading ? '-' : totalSubjects} <span className="text-base font-normal text-slate-500 ml-1">วิชา</span></h4>
                    </div>
                </div>

                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-3xl p-6 border border-emerald-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center gap-5">
                    <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center">
                        <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-500 text-sm mb-1">ประเมินครบแล้ว</p>
                        <h4 className="text-3xl font-extrabold text-slate-800 leading-none">
                            {loading ? '-' : completedSubjects}<span className="text-lg font-bold text-slate-400">/{totalSubjects}</span>
                            <span className="text-base font-normal text-slate-500 ml-1">วิชา</span>
                        </h4>
                    </div>
                </div>

                {currentUser?.homeroom && (
                    <div className="bg-gradient-to-br from-blue-50 to-white rounded-3xl p-6 border border-blue-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center gap-5">
                        <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center">
                            <GraduationCap className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="font-bold text-slate-500 text-sm mb-1">ครูประจำชั้นห้อง</p>
                            <h4 className="text-2xl font-extrabold text-slate-800 leading-none">{currentUser.homeroom}</h4>
                        </div>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="py-24 flex flex-col items-center justify-center space-y-4">
                    <div className="loader scale-150 border-4 border-indigo-200 border-t-indigo-600"></div>
                    <p className="text-slate-400 font-medium">กำลังโหลดรายวิชาของคุณ...</p>
                </div>
            ) : subjects.length === 0 ? (
                <div className="text-center bg-slate-50/50 rounded-3xl p-16 border-2 border-dashed border-slate-200 flex flex-col items-center">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-sm border border-slate-100">
                        <BookMarked className="w-12 h-12 text-slate-300" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-700 mb-2">ไม่พบรายวิชาในเทอม {semester}/{academicYear}</h3>
                    <p className="text-slate-500 max-w-sm leading-relaxed text-lg">
                        คุณยังไม่มีการถูกมอบหมายให้สอนในภาคเรียนนี้ กรุณาติดต่อแอดมินหรือฝ่ายวิชาการ
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {subjects.map((sub) => {
                        const progress = progressMap[sub.subject_id] || { studentCount: 0, loCount: 0, percent: 0 };
                        const isComplete = progress.percent === 100;
                        const hasStudents = progress.studentCount > 0;
                        
                        return (
                            <div
                                key={sub.subject_id}
                                className="group bg-white rounded-3xl overflow-hidden hover:shadow-2xl hover:shadow-indigo-500/10 hover:-translate-y-1.5 transition-all duration-300 flex flex-col border border-slate-200 shadow-sm"
                            >
                                <div
                                    className="p-8 cursor-pointer flex-grow relative bg-white"
                                    onClick={() => navigate(`/eval/${sub.subject_id}`, { state: { subject: sub } })}
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-indigo-50 to-transparent rounded-bl-full -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                                    
                                    <div className="flex justify-between items-start mb-6 gap-2">
                                        <span className="bg-slate-100 text-slate-600 text-xs font-extrabold px-3 py-1.5 rounded-lg border border-slate-200 shrink-0 shadow-sm">
                                            ระดับชั้น {sub.grade_level}
                                        </span>
                                        {/* Status badge */}
                                        {hasStudents ? (
                                            isComplete ? (
                                                <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    ประเมินครบแล้ว
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                                                    <AlertTriangle className="w-3.5 h-3.5" />
                                                    {progress.percent}%
                                                </span>
                                            )
                                        ) : (
                                            <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                                                ยังไม่มีนักเรียน
                                            </span>
                                        )}
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <span className="inline-block text-sm font-extrabold text-slate-400 font-mono tracking-widest uppercase">
                                            {sub.subject_code || sub.subject_name}
                                        </span>
                                        <h3 className="text-2xl font-extrabold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2">
                                            {sub.subject_name}
                                        </h3>
                                    </div>

                                    {/* Progress Bar */}
                                    {hasStudents && (
                                        <div className="mb-6">
                                            <div className="flex justify-between text-xs font-bold text-slate-500 mb-1.5">
                                                <span>{progress.studentCount} คน · {progress.loCount} LO</span>
                                                <span>{progress.filledCells}/{progress.totalCells} ช่อง</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                        isComplete ? 'bg-emerald-500' : progress.percent > 50 ? 'bg-indigo-500' : 'bg-amber-400'
                                                    }`}
                                                    style={{ width: `${Math.max(progress.percent, 1)}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="inline-flex items-center px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl group-hover:bg-indigo-600 transition-colors shadow-sm w-full justify-center">
                                        <Activity className="w-4 h-4 mr-2" />
                                        เข้าไปประเมินผลผู้เรียน
                                        <ArrowRight className="w-4 h-4 ml-2 opacity-70 group-hover:translate-x-1 group-hover:opacity-100 transition-all" />
                                    </div>
                                </div>

                                <div className="bg-slate-50 px-8 py-5 flex justify-between items-center group-hover:bg-indigo-50/50 transition-colors border-t border-slate-100">
                                    <span className="text-sm text-slate-500 font-semibold flex items-center"><FileBarChart2 className="w-4 h-4 mr-2" /> รายงาน ปพ.๖</span>
                                    <button
                                        onClick={() => navigate(`/summary/${sub.subject_id}`, { state: { subject: sub } })}
                                        className="text-sm bg-white text-indigo-700 hover:bg-indigo-600 hover:text-white font-extrabold transition-colors px-4 py-2 border border-slate-200 group-hover:border-indigo-200 rounded-xl shadow-sm"
                                    >
                                        เปิดหน้ารวม
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Layout>
    );
}
