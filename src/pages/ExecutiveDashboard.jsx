import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { BarChart3, Users, BookOpenCheck, PieChart, Activity } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ExecutiveDashboard() {
    const { currentUser } = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const [
                    { count: studentCount },
                    { count: teacherCount },
                    { count: subjectCount },
                    { data: evals }
                ] = await Promise.all([
                    supabase.from('users_students').select('*', { count: 'exact', head: true }).eq('school_id', currentUser.school_id),
                    supabase.from('users_teachers').select('*', { count: 'exact', head: true }).eq('school_id', currentUser.school_id),
                    supabase.from('subjects').select('*', { count: 'exact', head: true }).eq('school_id', currentUser.school_id),
                    supabase.from('lo_evaluations').select('competency_level')
                ]);

                let counts = { 'เริ่มต้น': 0, 'พัฒนา': 0, 'ชำนาญ': 0, 'เชี่ยวชาญ': 0 };
                (evals || []).forEach(e => {
                    if (counts[e.competency_level] !== undefined) counts[e.competency_level]++;
                });

                setData({
                    total_students: studentCount || 0,
                    total_teachers: teacherCount || 0,
                    total_subjects: subjectCount || 0,
                    eval_stats: counts,
                    total_evals: evals?.length || 0
                });

            } catch (err) {
                toast.error('ดึงข้อมูลผู้บริหารไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [currentUser]);

    const StatCard = ({ title, value, icon: Icon, colorClass, borderClass }) => (
        <div className={`bg-white rounded-2xl shadow-sm border-2 ${borderClass} p-6 flex flex-col items-center sm:items-start text-center sm:text-left transition-all hover:shadow-lg hover:-translate-y-1 duration-300`}>
            <div className={`p-4 rounded-xl ${colorClass} mb-4 border border-white/20 shadow-inner`}>
                <Icon className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">{title}</h3>
            <p className="text-4xl font-black text-slate-800 mt-2 tracking-tight">{value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</p>
        </div>
    );

    return (
        <Layout title="ระบบสำหรับผู้บริหาร (Executive Dashboard)">
            <div className="mb-12 border-b border-slate-200 pb-8 flex items-center">
                <div className="bg-amber-100 p-3 rounded-2xl shadow-inner border border-amber-200 mr-5">
                    <BarChart3 className="w-8 h-8 text-amber-600" />
                </div>
                <div>
                    <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-amber-600 to-orange-600 tracking-tight">ภาพรวมสถานศึกษา</h2>
                    <p className="text-slate-500 font-medium text-lg mt-1">สถิติและข้อมูลการบริหารจัดการผลการเรียนรู้ LO</p>
                </div>
            </div>

            {loading ? (
                <div className="py-32 flex justify-center"><div className="loader border-t-amber-600 border-4 w-12 h-12"></div></div>
            ) : !data ? null : (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <StatCard
                            title="จำนวนครูและบุคลากร"
                            value={data.total_teachers}
                            icon={Users}
                            colorClass="bg-gradient-to-br from-blue-500 to-indigo-600"
                            borderClass="border-blue-100"
                        />
                        <StatCard
                            title="จำนวนนักเรียนทั้งหมด"
                            value={data.total_students}
                            icon={Users}
                            colorClass="bg-gradient-to-br from-emerald-500 to-teal-600"
                            borderClass="border-emerald-100"
                        />
                        <StatCard
                            title="จำนวนรายวิชาที่เปิดสอน"
                            value={data.total_subjects}
                            icon={BookOpenCheck}
                            colorClass="bg-gradient-to-br from-violet-500 to-purple-600"
                            borderClass="border-violet-100"
                        />
                    </div>

                    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
                        <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-8 py-6 flex items-center">
                            <Activity className="w-6 h-6 text-amber-400 mr-3" />
                            <h3 className="text-xl font-bold text-white tracking-wide">สถิติผลการประเมินภาพรวม (School-Wide Assessment)</h3>
                        </div>
                        <div className="p-8 lg:p-12">
                            <div className="max-w-4xl mx-auto space-y-10">
                                {[
                                    { label: 'ระดับเชี่ยวชาญ', count: data.eval_stats['เชี่ยวชาญ'], colorClass: 'text-green-700', bgClass: 'bg-green-500 shadow-green-500/50', borderClass: 'border-green-200' },
                                    { label: 'ระดับชำนาญ', count: data.eval_stats['ชำนาญ'], colorClass: 'text-blue-700', bgClass: 'bg-blue-500 shadow-blue-500/50', borderClass: 'border-blue-200' },
                                    { label: 'ระดับพัฒนา', count: data.eval_stats['พัฒนา'], colorClass: 'text-orange-700', bgClass: 'bg-orange-500 shadow-orange-500/50', borderClass: 'border-orange-200' },
                                    { label: 'ระดับเริ่มต้น', count: data.eval_stats['เริ่มต้น'], colorClass: 'text-red-700', bgClass: 'bg-red-500 shadow-red-500/50', borderClass: 'border-red-200' }
                                ].map((stat, idx) => {
                                    const pct = Math.round((stat.count / (data.total_evals || 1)) * 100) || 0;
                                    return (
                                        <div key={idx} className="relative group">
                                            <div className="flex justify-between items-end mb-3">
                                                <span className={`text-lg font-black tracking-wide ${stat.colorClass}`}>{stat.label}</span>
                                                <div className="text-right">
                                                    <span className="text-2xl font-black text-slate-800 mr-3">{stat.count.toLocaleString()}</span>
                                                    <span className="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full border border-slate-200">({pct}%)</span>
                                                </div>
                                            </div>
                                            <div className={`w-full bg-slate-100 rounded-full h-5 border ${stat.borderClass} shadow-inner overflow-hidden relative`}>
                                                <div
                                                    className={`h-full rounded-full transition-all duration-1000 ease-out shadow-lg ${stat.bgClass} relative overflow-hidden`}
                                                    style={{ width: `${pct}%` }}
                                                >
                                                    <div className="absolute inset-0 bg-white/20 w-1/2 -skew-x-12 translate-x-[-150%] group-hover:translate-x-[250%] transition-transform duration-1000"></div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
