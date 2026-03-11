import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { GraduationCap, BookOpen, UserCheck, Compass, CheckCircle2, Bookmark, ArrowRight, BookMarked, UserCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function StudentDashboard() {
    const { currentUser } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDashboard() {
            try {
                const { data: enrollments, error: enrollErr } = await supabase
                    .from('student_enrollments')
                    .select(`
            enrollment_id, room,
            subjects(subject_id, subject_code, subject_name, academic_year, semester)
          `)
                    .eq('student_id', currentUser.student_id);

                if (enrollErr) throw enrollErr;

                if (!enrollments || enrollments.length === 0) {
                    setData([]);
                    setLoading(false);
                    return;
                }

                const subjectIds = enrollments.map(e => e.subjects.subject_id);
                const enrollmentIds = enrollments.map(e => e.enrollment_id);

                const [{ data: loData }, { data: evalData }] = await Promise.all([
                    supabase.from('subject_lo_mapping')
                        .select('subject_id, learning_outcomes(lo_id, lo_code, ability_no, lo_description)')
                        .in('subject_id', subjectIds),
                    supabase.from('lo_evaluations')
                        .select('enrollment_id, lo_id, competency_level')
                        .in('enrollment_id', enrollmentIds)
                ]);

                const dashboardData = enrollments.map(enroll => {
                    const subject = enroll.subjects;
                    const subjectLos = (loData || [])
                        .filter(l => l.subject_id === subject.subject_id)
                        .map(l => l.learning_outcomes)
                        .sort((a, b) => a.ability_no - b.ability_no);

                    const evalsMap = (evalData || []).filter(e => e.enrollment_id === enroll.enrollment_id);

                    const subjectEvals = subjectLos.map(lo => {
                        const evMatch = evalsMap.find(e => e.lo_id === lo.lo_id);
                        return {
                            lo_code: lo.lo_code,
                            ability_no: lo.ability_no,
                            description: lo.lo_description,
                            level: evMatch ? evMatch.competency_level : '-'
                        };
                    });

                    return {
                        subject_id: subject.subject_id,
                        subject_code: subject.subject_code,
                        subject_name: subject.subject_name,
                        term: `${subject.semester}/${subject.academic_year}`,
                        room: enroll.room,
                        evaluations: subjectEvals
                    };
                });

                setData(dashboardData);

            } catch (err) {
                toast.error('ดึงข้อมูลไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchDashboard();
    }, [currentUser]);

    // Calculate overall stats
    const totalSubjects = data.length;
    let totalEvals = 0;
    let passedEvals = 0;
    
    data.forEach(sub => {
        sub.evaluations.forEach(ev => {
            if (ev.level !== '-') totalEvals++;
            if (['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(ev.level)) passedEvals++;
        });
    });

    return (
        <Layout title="ระบบสำหรับผู้เรียน (Student Portal)">
            {/* Hero / Header Section */}
            <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-200 pb-8">
                <div className="flex items-center">
                    <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-4 rounded-3xl shadow-lg shadow-emerald-500/20 mr-6 hidden sm:block">
                        <GraduationCap className="w-10 h-10 text-white" />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-700 to-teal-700 tracking-tight">ห้องเรียนของฉัน</h2>
                        <p className="text-slate-500 font-medium text-lg mt-2">
                            ยินดีต้อนรับ, <span className="font-bold text-slate-700">{currentUser?.full_name}</span> | ติดตามผลลัพธ์การเรียนรู้ (LO)
                        </p>
                    </div>
                </div>

                <div className="bg-white/80 backdrop-blur-xl px-6 py-4 rounded-3xl shadow-sm border border-slate-200 flex items-center gap-4 min-w-[280px]">
                    <div className="bg-emerald-100 p-3 rounded-2xl">
                        <UserCircle2 className="w-8 h-8 text-emerald-600" />
                    </div>
                    <div>
                        <div className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-0.5">สถานะนักเรียน</div>
                        <div className="text-sm text-slate-600 font-extrabold font-mono">{currentUser.student_id?.split('-')[0] || 'ID: N/A'}</div>
                    </div>
                </div>
            </div>

            {/* Quick Stats Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
                    <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center z-10">
                        <BookOpen className="w-7 h-7" />
                    </div>
                    <div className="z-10">
                        <p className="font-bold text-slate-400 text-sm mb-1 uppercase tracking-wider">วิชาที่ลงทะเบียน</p>
                        <h4 className="text-3xl font-black text-slate-800 leading-none">{loading ? '-' : totalSubjects} <span className="text-base font-medium text-slate-500 ml-1">วิชา</span></h4>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-teal-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
                    <div className="w-14 h-14 bg-teal-100 text-teal-600 rounded-2xl flex items-center justify-center z-10">
                        <Compass className="w-7 h-7" />
                    </div>
                    <div className="z-10">
                        <p className="font-bold text-slate-400 text-sm mb-1 uppercase tracking-wider">LO ที่ประเมินแล้ว</p>
                        <h4 className="text-3xl font-black text-slate-800 leading-none">{loading ? '-' : totalEvals} <span className="text-base font-medium text-slate-500 ml-1">ข้อ</span></h4>
                    </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-50 rounded-full group-hover:scale-150 transition-transform duration-500 ease-out z-0"></div>
                    <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center z-10">
                        <UserCheck className="w-7 h-7" />
                    </div>
                    <div className="z-10">
                        <p className="font-bold text-slate-400 text-sm mb-1 uppercase tracking-wider">LO ที่ผ่านเกณฑ์</p>
                        <h4 className="text-3xl font-black text-slate-800 leading-none">{loading ? '-' : passedEvals} <span className="text-base font-medium text-slate-500 ml-1">ข้อ</span></h4>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            {loading ? (
                <div className="py-24 flex flex-col items-center justify-center space-y-4">
                    <div className="loader scale-150 border-4 border-emerald-100 border-t-emerald-600"></div>
                    <p className="text-slate-400 font-medium animate-pulse">กำลังโหลดข้อมูลการเรียนของคุณ...</p>
                </div>
            ) : data.length === 0 ? (
                <div className="text-center bg-white rounded-3xl p-16 border-2 border-dashed border-slate-200 shadow-sm flex flex-col items-center">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                        <BookMarked className="w-12 h-12 text-slate-300" />
                    </div>
                    <h3 className="text-2xl font-extrabold text-slate-700 mb-2">ยังไม่มีข้อมูลการลงทะเบียนเรียน</h3>
                    <p className="text-slate-500 text-lg max-w-md mx-auto">
                        กรุณารอครูประจํารายวิชาหรือฝ่ายวิชาการลงทะเบียนวิชาเรียนของคุณเข้าสู่ระบบ
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {data.map(sub => (
                        <div key={sub.subject_id} className="bg-white rounded-[2rem] shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-200 overflow-hidden flex flex-col transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:-translate-y-1">
                            {/* Card Header */}
                            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
                                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white opacity-5 rounded-full blur-2xl"></div>
                                <div className="flex items-center relative z-10 w-full">
                                    <div className="bg-white/10 backdrop-blur-sm p-3 rounded-2xl mr-4 border border-white/10">
                                        <Bookmark className="w-6 h-6 text-emerald-400" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-3 mb-1.5">
                                            <span className="text-xs font-black text-emerald-950 bg-emerald-400 px-3 py-1 rounded-lg tracking-wider">
                                                {sub.subject_code}
                                            </span>
                                            <span className="text-xs font-bold text-slate-300 bg-white/10 px-3 py-1 rounded-lg border border-white/10">
                                                ห้อง {sub.room}
                                            </span>
                                        </div>
                                        <h3 className="text-2xl font-bold text-white leading-tight line-clamp-1">{sub.subject_name}</h3>
                                    </div>
                                </div>
                            </div>

                            {/* Evaluation Table */}
                            <div className="p-6 md:p-8 flex-1 bg-slate-50/30">
                                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-100 text-slate-500 border-b border-slate-200 uppercase text-xs tracking-wider font-extrabold">
                                                <tr>
                                                    <th className="py-4 px-5 w-20 text-center">ข้อที่</th>
                                                    <th className="py-4 px-5">ผลลัพธ์การเรียนรู้ (Learning Outcomes)</th>
                                                    <th className="py-4 px-5 w-36 text-center">ระดับที่ได้</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sub.evaluations.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="3" className="py-12 text-center text-slate-400 font-medium">
                                                            ยังไม่พบข้อสอบ/เกณฑ์การประเมินในวิชานี้
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sub.evaluations.map(ev => {
                                                        let badgeClass = 'bg-slate-100 text-slate-500 border border-slate-200';
                                                        let Icon = null;
                                                        
                                                        if (ev.level === 'เริ่มต้น') badgeClass = 'bg-red-50 text-red-700 border border-red-200 shadow-sm shadow-red-100';
                                                        if (ev.level === 'พัฒนา') badgeClass = 'bg-orange-50 text-orange-700 border border-orange-200 shadow-sm shadow-orange-100';
                                                        if (ev.level === 'ชำนาญ') badgeClass = 'bg-blue-50 text-blue-700 border border-blue-200 shadow-sm shadow-blue-100';
                                                        if (ev.level === 'เชี่ยวชาญ') badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm shadow-emerald-100';
                                                        
                                                        if (ev.level === 'เชี่ยวชาญ' || ev.level === 'ชำนาญ') {
                                                            Icon = <CheckCircle2 className="w-3.5 h-3.5 mr-1 inline-block" />;
                                                        }

                                                        return (
                                                            <tr key={ev.ability_no} className="hover:bg-slate-50 transition-colors group">
                                                                <td className="py-5 px-5 text-center align-top border-r border-slate-50">
                                                                    <div className="font-black text-slate-400 text-xl group-hover:text-emerald-500 transition-colors">{ev.ability_no}</div>
                                                                    {ev.lo_code && <div className="text-[10px] text-slate-400 font-bold mt-1 bg-slate-100 rounded px-1 py-0.5 inline-block">{ev.lo_code}</div>}
                                                                </td>
                                                                <td className="py-4 px-5 text-slate-700 font-medium leading-relaxed align-top">
                                                                    {ev.description}
                                                                </td>
                                                                <td className="py-4 px-5 text-center align-top border-l border-slate-50">
                                                                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center justify-center w-full ${badgeClass}`}>
                                                                        {Icon} {ev.level}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50 border-t border-slate-200 py-4 px-8 flex justify-between items-center text-sm font-bold text-slate-500">
                                <span>ภาคเรียนที่ {sub.term}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Layout>
    );
}
