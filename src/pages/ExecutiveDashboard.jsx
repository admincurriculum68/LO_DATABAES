import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { BarChart3, Users, BookOpenCheck, Activity, Award, GraduationCap, TrendingUp, Sparkles } from 'lucide-react';
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

    const StatCard = ({ title, value, icon: Icon, colorClass, borderClass, bgGradient }) => (
        <div className={`relative bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border ${borderClass} p-8 overflow-hidden group hover:-translate-y-1.5 transition-all duration-300`}>
            {/* Background glowing orb */}
            <div className={`absolute -right-12 -top-12 w-40 h-40 rounded-full blur-3xl opacity-20 ${bgGradient} group-hover:scale-150 transition-transform duration-700 ease-out z-0`}></div>
            
            <div className="flex items-start justify-between relative z-10 space-x-4">
                <div className={`w-16 h-16 rounded-[1.25rem] shadow-inner border border-white/20 flex items-center justify-center shrink-0 ${colorClass}`}>
                    <Icon className="w-8 h-8 text-white drop-shadow-sm" />
                </div>
                <div className="flex-1 text-right">
                    <h3 className="text-sm font-extrabold text-slate-400 uppercase tracking-widest mb-1">{title}</h3>
                    <p className="text-5xl font-black text-slate-800 tracking-tighter leading-none">{loading ? '-' : value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</p>
                </div>
            </div>
            {/* Minimal decorative line */}
            <div className={`h-1 w-1/3 mt-8 bg-gradient-to-r ${colorClass} opacity-20 rounded-full`}></div>
        </div>
    );

    return (
        <Layout title="ระบบสำหรับผู้บริหาร (Executive Dashboard)">
            {/* Hero / Header Section */}
            <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8 relative">
                <div className="flex items-center">
                    <div className="bg-gradient-to-bl from-amber-400 to-orange-600 p-4 rounded-3xl shadow-lg shadow-orange-500/20 border border-orange-400/50 mr-6 hidden sm:block relative overflow-hidden group">
                        <div className="absolute inset-0 bg-white/20 -skew-x-12 translate-x-[-150%] group-hover:translate-x-[250%] transition-transform duration-700"></div>
                        <BarChart3 className="w-10 h-10 text-white relative z-10" />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            ข้อมูลภาพรวมระดับองค์กร <Sparkles className="w-6 h-6 text-amber-500 hidden sm:block" />
                        </h2>
                        <p className="text-slate-500 font-medium text-lg mt-2 tracking-wide">
                            ยินดีต้อนรับท่าน <span className="font-bold text-slate-700">{currentUser?.full_name}</span> | ติดตามสถิติและผลการประเมิน
                        </p>
                    </div>
                </div>

                <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-4 rounded-3xl shadow-lg border border-slate-700 flex items-center gap-4 text-white">
                    <div className="bg-white/10 p-2.5 rounded-2xl backdrop-blur-sm border border-white/10">
                        <Award className="w-7 h-7 text-amber-400" />
                    </div>
                    <div className="text-right">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-0.5">ปีการศึกษาปัจจุบัน</div>
                        <div className="text-sm font-extrabold tracking-wider">กำลังสรุปผล LO</div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-32 flex flex-col items-center justify-center space-y-4">
                    <div className="loader scale-150 border-4 border-amber-100 border-t-amber-600"></div>
                    <p className="text-slate-400 font-medium animate-pulse mt-4">กำลังประมวลผลสถิติของโรงเรียน...</p>
                </div>
            ) : !data ? null : (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pt-2">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <StatCard
                            title="บุคลากรครู"
                            value={data.total_teachers}
                            icon={Users}
                            colorClass="bg-gradient-to-br from-blue-500 to-indigo-600"
                            borderClass="border-blue-100"
                            bgGradient="bg-blue-400"
                        />
                        <StatCard
                            title="จำนวนนักเรียน"
                            value={data.total_students}
                            icon={GraduationCap}
                            colorClass="bg-gradient-to-br from-emerald-500 to-teal-600"
                            borderClass="border-emerald-100"
                            bgGradient="bg-emerald-400"
                        />
                        <StatCard
                            title="รายวิชาที่เปิดสอน"
                            value={data.total_subjects}
                            icon={BookOpenCheck}
                            colorClass="bg-gradient-to-br from-violet-500 to-fuchsia-600"
                            borderClass="border-violet-100"
                            bgGradient="bg-violet-400"
                        />
                    </div>

                    {/* Complex Analytics Section */}
                    <div className="bg-white rounded-3xl shadow-[0_8px_40px_rgba(0,0,0,0.06)] border border-slate-200 overflow-hidden relative">
                        {/* Title Bar */}
                        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6 flex items-center justify-between border-b border-slate-800 relative overflow-hidden">
                            <div className="absolute right-0 top-0 w-64 h-64 bg-amber-500 opacity-5 rounded-full blur-3xl"></div>
                            <div className="flex items-center relative z-10">
                                <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/5 mr-4">
                                    <TrendingUp className="w-7 h-7 text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-black text-white tracking-wide">สถิติผลการประเมินภาพรวมระดับโรงเรียน</h3>
                                    <p className="text-slate-400 font-medium text-sm mt-1 tracking-wide">School-Wide Learning Outcomes Assessment Overview</p>
                                </div>
                            </div>
                            <div className="hidden md:block text-right relative z-10">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">จำนวนการประเมินทั้งหมด</span>
                                <span className="text-2xl font-black text-amber-400">{data.total_evals.toLocaleString()} <span className="text-sm text-slate-400 font-bold">รายการ</span></span>
                            </div>
                        </div>

                        {/* Chart / Bars Section */}
                        <div className="p-8 lg:p-14 bg-slate-50/50">
                            <div className="max-w-5xl mx-auto space-y-12">
                                {[
                                    { label: 'ระดับเชี่ยวชาญ', count: data.eval_stats['เชี่ยวชาญ'], colorClass: 'text-emerald-700', bgClass: 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.4)]', borderClass: 'border-emerald-200' },
                                    { label: 'ระดับชำนาญ', count: data.eval_stats['ชำนาญ'], colorClass: 'text-blue-700', bgClass: 'bg-gradient-to-r from-blue-500 to-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.4)]', borderClass: 'border-blue-200' },
                                    { label: 'ระดับพัฒนา', count: data.eval_stats['พัฒนา'], colorClass: 'text-amber-700', bgClass: 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.4)]', borderClass: 'border-amber-200' },
                                    { label: 'ระดับเริ่มต้น', count: data.eval_stats['เริ่มต้น'], colorClass: 'text-rose-700', bgClass: 'bg-gradient-to-r from-rose-500 to-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.4)]', borderClass: 'border-rose-200' }
                                ].map((stat, idx) => {
                                    const pct = Math.round((stat.count / (data.total_evals || 1)) * 100) || 0;
                                    return (
                                        <div key={idx} className="relative group">
                                            <div className="flex justify-between items-end mb-4 px-1">
                                                <div className="flex items-center">
                                                    <span className={`w-3 h-3 rounded-full mr-3 border ${stat.borderClass} ${stat.bgClass.split(' ')[0]}`}></span>
                                                    <span className={`text-xl font-black tracking-wide ${stat.colorClass}`}>{stat.label}</span>
                                                </div>
                                                <div className="text-right flex file:items-baseline items-end">
                                                    <span className="text-3xl font-black text-slate-800 mr-3">{stat.count.toLocaleString()}</span>
                                                    <span className="text-sm font-extrabold text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm min-w-[4rem] text-center inline-block translate-y-[-2px]">{pct}%</span>
                                                </div>
                                            </div>
                                            
                                            {/* Beautiful Glowing Progress Bar */}
                                            <div className={`w-full bg-slate-200/80 rounded-full h-6 border ${stat.borderClass} shadow-inner p-1 overflow-hidden relative`}>
                                                <div
                                                    className={`h-full rounded-full transition-all duration-1000 ease-out ${stat.bgClass} relative overflow-hidden`}
                                                    style={{ width: `${Math.max(pct, 1)}%` }} // Ensure at least a sliver shows if > 0
                                                >
                                                    {/* Animated shine effect on the bar */}
                                                    <div className="absolute top-0 bottom-0 left-[-20%] w-[120%] bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-1000"></div>
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
