import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, Printer, FileBarChart } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SummaryView() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [subject, setSubject] = useState(location.state?.subject || null);

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadSummary() {
            try {
                if (!subject) {
                    const { data: sub } = await supabase.from('subjects').select('*').eq('subject_id', subjectId).single();
                    setSubject(sub);
                }

                const [{ data: mappedLOs }, { data: enrolls }] = await Promise.all([
                    supabase.from('subject_lo_mapping')
                        .select('learning_outcomes(lo_id, lo_code, ability_no, lo_description)')
                        .eq('subject_id', subjectId),
                    supabase.from('student_enrollments')
                        .select('enrollment_id, users_students(student_code, prefix, first_name, last_name)')
                        .eq('subject_id', subjectId)
                ]);

                const formatLOs = mappedLOs?.map(item => item.learning_outcomes).sort((a, b) => a.ability_no - b.ability_no) || [];
                const formatEnrolls = enrolls || [];
                formatEnrolls.sort((a, b) => (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || ''));

                const enrollIds = formatEnrolls.map(e => e.enrollment_id);
                let evals = [];
                if (enrollIds.length > 0) {
                    const { data: evalsData } = await supabase
                        .from('lo_evaluations')
                        .select('lo_id, enrollment_id, competency_level')
                        .in('enrollment_id', enrollIds);
                    evals = evalsData || [];
                }

                setData({
                    enrollments: formatEnrolls,
                    learningOutcomes: formatLOs,
                    evaluations: evals
                });

            } catch (err) {
                toast.error('โหลดสรุปไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadSummary();
    }, [subjectId, subject]);

    if (loading) return <div className="py-20 flex justify-center"><div className="loader"></div></div>;

    const { enrollments, learningOutcomes, evaluations } = data;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans print:bg-white text-slate-800">
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-200 sticky top-0 z-40 print:hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={() => navigate(-1)}
                            className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-xl transition-colors flex items-center"
                        >
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span className="font-semibold text-sm">กลับ</span>
                        </button>
                        <div className="hidden sm:block w-px h-6 bg-slate-300"></div>
                        <h1 className="font-bold text-lg text-slate-800 truncate flex items-center">
                            <FileBarChart className="w-5 h-5 mr-2 text-indigo-500" />
                            สรุปผลรายวิชา: {subject ? `${subject.subject_code} ${subject.subject_name}` : ''}
                        </h1>
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm shadow-slate-900/20 transition-all flex items-center"
                    >
                        <Printer className="w-4 h-4 mr-2" />
                        พิมพ์ตาราง
                    </button>
                </div>
            </header>

            <main className="flex-grow max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-8 print:p-0">
                <div className="hidden print:block text-center mb-6">
                    <h2 className="text-xl font-bold mb-2">ตารางสรุปผลการประเมินผลลัพธ์การเรียนรู้ (LO)</h2>
                    <p className="font-semibold text-sm">รายวิชา {subject?.subject_code} {subject?.subject_name} ชั้น {subject?.grade_level}</p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left divide-y divide-slate-200 whitespace-nowrap border-collapse print:border print:border-black">
                            <thead className="bg-slate-50 text-slate-600 print:bg-transparent">
                                <tr>
                                    <th className="px-4 py-4 text-center text-xs font-bold uppercase tracking-wider w-16 border-r border-slate-200 print:border-black sticky left-0 bg-slate-50 z-20">เลขที่</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider min-w-[200px] border-r border-slate-200 print:border-black sticky left-[64px] bg-slate-50 z-20 shadow-[10px_0_10px_-10px_rgba(0,0,0,0.05)]">
                                        ชื่อ - นามสกุล<br />
                                        <span className="text-[10px] font-medium text-slate-400 normal-case">(นักเรียน)</span>
                                    </th>
                                    {learningOutcomes.map(lo => (
                                        <th key={lo.lo_id} className="px-3 py-4 text-center text-xs font-bold text-indigo-900 uppercase min-w-[80px] border-r border-slate-200 print:border-black bg-indigo-50/30" title={lo.lo_description}>
                                            <span className="block">{lo.lo_code ? lo.lo_code : `LO ${lo.ability_no}`}</span>
                                            {lo.lo_code && <span className="block text-[10px] text-slate-500 font-medium">ข้อ {lo.ability_no}</span>}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white print:divide-black">
                                {enrollments.length === 0 ? (
                                    <tr>
                                        <td colSpan={2 + learningOutcomes.length} className="px-4 py-8 text-center text-slate-500 font-medium">ไม่พบรายชื่อนักเรียนในวิชานี้</td>
                                    </tr>
                                ) : (
                                    enrollments.map((enroll, i) => {
                                        const st = enroll.users_students;
                                        return (
                                            <tr key={enroll.enrollment_id} className="hover:bg-slate-50/80 transition-colors group">
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-slate-500 border-r border-slate-100 print:border-black sticky left-0 bg-white group-hover:bg-slate-50/80">{i + 1}</td>
                                                <td className="px-6 py-3 text-sm font-bold text-slate-800 border-r border-slate-100 print:border-black sticky left-[64px] bg-white shadow-[10px_0_10px_-10px_rgba(0,0,0,0.05)] group-hover:bg-slate-50/80">
                                                    {st.prefix || ''}{st.first_name} {st.last_name}
                                                </td>
                                                {learningOutcomes.map(lo => {
                                                    const ev = evaluations.find(e => e.enrollment_id === enroll.enrollment_id && e.lo_id === lo.lo_id);
                                                    const val = ev?.competency_level || '-';

                                                    let textColor = 'text-slate-400 font-normal';
                                                    if (val === 'เริ่มต้น') textColor = 'text-red-600 font-bold';
                                                    if (val === 'พัฒนา') textColor = 'text-orange-500 font-bold';
                                                    if (val === 'ชำนาญ') textColor = 'text-blue-600 font-bold';
                                                    if (val === 'เชี่ยวชาญ') textColor = 'text-green-600 font-bold';

                                                    return (
                                                        <td key={lo.lo_id} className={`px-3 py-3 text-center text-sm border-r border-slate-100 print:border-black ${textColor}`}>
                                                            {val}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
