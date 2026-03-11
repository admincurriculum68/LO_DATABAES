import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { FileBarChart2, ChevronRight, BookOpen, Clock, Activity, GraduationCap, ArrowRight, LayoutDashboard, Bookmark, BookMarked } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherDashboard() {
    const { currentUser } = useAuth();
    const [subjects, setSubjects] = useState([]);
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
                setSubjects(data || []);
            } catch (err) {
                toast.error('ไม่สามารถดึงข้อมูลรายวิชาได้: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadSubjects();
    }, [currentUser]);

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
                            ยินดีต้อนรับ {currentUser?.full_name} | จัดการผลการเรียนรู้รายวิชาในภาคเรียนปัจจุบัน
                        </p>
                    </div>
                </div>
            </div>

            {/* Quick Stats (Optional for visual balance) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-3xl p-6 border border-indigo-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] flex items-center gap-5">
                    <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                        <BookOpen className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-500 text-sm mb-1">รายวิชาที่คุณสอนทั้งหมด</p>
                        <h4 className="text-3xl font-extrabold text-slate-800 leading-none">{loading ? '-' : subjects.length} <span className="text-base font-normal text-slate-500 ml-1">วิชา</span></h4>
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
                    <h3 className="text-2xl font-extrabold text-slate-700 mb-2">ไม่พบรายวิชาในการดูแล</h3>
                    <p className="text-slate-500 max-w-sm leading-relaxed text-lg">
                        คุณยังไม่มีการถูกมอบหมายให้สอนในรายวิชาใดๆ กรุณาติดต่อแอดมินหรือฝ่ายวิชาการเพื่อจัดรายวิชาให้คุณ
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {subjects.map((sub) => (
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
                                    <span className="text-xs font-bold text-indigo-700 tracking-wider bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg flex items-center">
                                        <Clock className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                                        เทอม {sub.semester}/{sub.academic_year}
                                    </span>
                                </div>

                                <div className="space-y-2 mb-8">
                                    <span className="inline-block text-sm font-extrabold text-slate-400 font-mono tracking-widest uppercase">
                                        {sub.subject_code}
                                    </span>
                                    <h3 className="text-2xl font-extrabold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2">
                                        {sub.subject_name}
                                    </h3>
                                </div>

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
                    ))}
                </div>
            )}
        </Layout>
    );
}
