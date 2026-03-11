import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { FileBarChart2, ChevronRight, BookOpen, Clock, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherDashboard() {
    const { currentUser } = useAuth();
    const [subjects, setSubjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        async function loadSubjects() {
            try {
                const { data, error } = await supabase
                    .from('subjects')
                    .select('*')
                    .eq('teacher_id', currentUser.teacher_id)
                    .order('academic_year', { ascending: false })
                    .order('semester', { ascending: false });

                if (error) throw error;
                setSubjects(data);
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
            title="รายวิชาที่รับผิดชอบ"
            actionText="เมนูครูประจำชั้น (Dashboard รวม)"
            actionIcon={FileBarChart2}
            onActionClick={() => navigate('/homeroom')}
        >
            <div className="mb-8">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">รายวิชาของฉัน</h2>
                <p className="text-slate-500 font-medium">จัดการผลการเรียนรู้รายวิชาที่คุณรับผิดชอบ</p>
            </div>

            {loading ? (
                <div className="py-20 flex justify-center">
                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                </div>
            ) : subjects.length === 0 ? (
                <div className="text-center bg-white rounded-3xl p-16 border border-dashed border-slate-300 shadow-sm flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        <BookOpen className="w-10 h-10 text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 mb-1">ไม่พบรายวิชา</h3>
                    <p className="text-slate-500 max-w-sm">คุณยังไม่มีรายวิชาที่รับผิดชอบในระบบ กรุณาติดต่อฝ่ายวิชาการ</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {subjects.map((sub) => (
                        <div
                            key={sub.subject_id}
                            className="group bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-xl hover:border-indigo-300 hover:-translate-y-1 transition-all duration-300 flex flex-col"
                        >
                            <div
                                className="p-6 cursor-pointer flex-grow relative overflow-hidden"
                                onClick={() => navigate(`/eval/${sub.subject_id}`, { state: { subject: sub } })}
                            >
                                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-indigo-50 to-transparent rounded-bl-full -z-10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex justify-between items-start mb-4">
                                    <div className="space-y-1">
                                        <span className="text-xs font-bold text-indigo-600 tracking-wider uppercase bg-indigo-50 px-2.5 py-1 rounded-md">
                                            {sub.subject_code}
                                        </span>
                                        <h3 className="text-xl font-bold text-slate-800 leading-tight group-hover:text-indigo-700 transition-colors">
                                            {sub.subject_name}
                                        </h3>
                                    </div>
                                    <span className="bg-slate-100 text-slate-700 text-xs font-bold px-3 py-1 rounded-full border border-slate-200 shrink-0 shadow-sm">
                                        {sub.grade_level}
                                    </span>
                                </div>

                                <div className="flex items-center text-sm text-slate-500 mb-4 font-medium">
                                    <Clock className="w-4 h-4 mr-1.5 opacity-60" />
                                    ภาคเรียนที่ {sub.semester}/{sub.academic_year}
                                </div>

                                <div className="flex items-center text-sm font-bold text-indigo-600 mt-2">
                                    <Activity className="w-4 h-4 mr-2" />
                                    ประเมิน LO
                                    <ChevronRight className="w-4 h-4 ml-1 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                                </div>
                            </div>

                            <div className="border-t border-slate-100 bg-slate-50 px-6 py-4 flex justify-between items-center group-hover:bg-indigo-50/30 transition-colors">
                                <span className="text-xs text-slate-400 font-medium">การจัดการรายงาน</span>
                                <button
                                    onClick={() => navigate(`/summary/${sub.subject_id}`, { state: { subject: sub } })}
                                    className="text-sm text-slate-600 hover:text-indigo-700 font-bold flex items-center transition-colors bg-white px-3 py-1.5 border border-slate-200 hover:border-indigo-300 rounded-lg shadow-sm"
                                >
                                    📊 สรุปภาพรวมวิชา
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Layout>
    );
}
