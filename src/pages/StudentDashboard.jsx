import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { GraduationCap, BookOpen, UserCircle2 } from 'lucide-react';
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

    return (
        <Layout title="รายงานรายบุคคล">
            <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                <div>
                    <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-teal-600 to-emerald-600 tracking-tight flex items-center mb-2">
                        <GraduationCap className="w-8 h-8 mr-3 text-emerald-500" /> ห้องเรียนของฉัน
                    </h2>
                    <p className="text-slate-500 font-medium ml-11">ดูผลลัพธ์การเรียนรู้และการพัฒนาสมรรถนะของคุณ</p>
                </div>
                <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-200 flex items-center space-x-4 max-w-sm">
                    <div className="bg-emerald-100 p-2.5 rounded-full"><UserCircle2 className="w-8 h-8 text-emerald-600" /></div>
                    <div>
                        <div className="text-sm font-bold text-slate-800">{currentUser.full_name}</div>
                        <div className="text-xs text-slate-500 font-medium">รหัสนักเรียน: {currentUser.student_id?.split('-')[0] || 'N/A'}</div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-20 flex justify-center"><div className="loader border-t-emerald-600"></div></div>
            ) : data.length === 0 ? (
                <div className="text-center bg-white rounded-3xl p-16 border border-dashed border-slate-300 shadow-sm">
                    <p className="text-xl font-bold text-slate-700">ยังไม่มีข้อมูลการลงทะเบียนเรียนในระบบ</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {data.map(sub => (
                        <div key={sub.subject_id} className="bg-white rounded-2xl shadow-sm border border-emerald-100 overflow-hidden transform hover:-translate-y-1 transition-transform duration-300">
                            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 px-6 py-5 border-b border-emerald-100 flex justify-between items-center sm:items-start flex-col sm:flex-row gap-4">
                                <div className="flex items-start">
                                    <div className="bg-white p-2.5 rounded-xl shadow-sm mr-4 mt-0.5 border border-emerald-100 hidden sm:block">
                                        <BookOpen className="w-6 h-6 text-emerald-500" />
                                    </div>
                                    <div>
                                        <span className="text-xs font-black text-emerald-600 tracking-wider uppercase bg-emerald-100 px-2 py-1 rounded-md mb-1.5 inline-block">{sub.subject_code}</span>
                                        <h3 className="text-xl font-bold text-slate-900 leading-tight">{sub.subject_name}</h3>
                                    </div>
                                </div>
                                <div className="text-right flex flex-row sm:flex-col gap-3 sm:gap-1 items-center sm:items-end w-full sm:w-auto bg-white sm:bg-transparent p-3 sm:p-0 rounded-xl border border-slate-100 sm:border-none">
                                    <span className="text-sm text-slate-600 font-medium bg-slate-100 px-2.5 py-1 rounded-md">ภาคเรียน {sub.term}</span>
                                    <span className="text-sm text-slate-500 font-medium bg-slate-100 px-2.5 py-1 rounded-md">ห้อง {sub.room}</span>
                                </div>
                            </div>

                            <div className="p-0 sm:p-6 overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase text-xs tracking-wider">
                                        <tr>
                                            <th className="py-3 px-4 sm:px-6 w-20 text-center font-bold">ข้อที่</th>
                                            <th className="py-3 px-4 font-bold">ผลลัพธ์การเรียนรู้ (Learning Outcomes)</th>
                                            <th className="py-3 px-4 sm:px-6 w-32 text-center font-bold">ระดับที่ได้</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sub.evaluations.length === 0 ? (
                                            <tr><td colSpan="3" className="py-6 text-center text-slate-400 font-medium">ยังไม่มีเกณฑ์การประเมินในวิชานี้</td></tr>
                                        ) : (
                                            sub.evaluations.map(ev => {
                                                let badgeClass = 'bg-slate-100 text-slate-500';
                                                if (ev.level === 'เริ่มต้น') badgeClass = 'bg-red-50 text-red-600 border border-red-100';
                                                if (ev.level === 'พัฒนา') badgeClass = 'bg-orange-50 text-orange-600 border border-orange-100';
                                                if (ev.level === 'ชำนาญ') badgeClass = 'bg-blue-50 text-blue-600 border border-blue-100';
                                                if (ev.level === 'เชี่ยวชาญ') badgeClass = 'bg-green-50 text-green-600 border border-green-100';
                                                if (ev.level === '-') badgeClass = 'text-slate-300';

                                                return (
                                                    <tr key={ev.ability_no} className="hover:bg-slate-50/80 transition-colors">
                                                        <td className="py-4 px-4 sm:px-6 text-center font-bold text-slate-400 text-lg border-r border-slate-50">
                                                            {ev.ability_no}
                                                            {ev.lo_code && <span className="block text-xs text-slate-400 font-medium">({ev.lo_code})</span>}
                                                        </td>
                                                        <td className="py-4 px-4 text-slate-800 font-medium leading-relaxed max-w-xl">{ev.description}</td>
                                                        <td className="py-4 px-4 sm:px-6 text-center border-l border-slate-50">
                                                            <span className={`px-3 py-1.5 rounded-full text-xs font-bold inline-block shadow-sm ${badgeClass}`}>{ev.level}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Layout>
    );
}
