import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ChevronLeft, Printer, FileBarChart } from 'lucide-react';
import toast from 'react-hot-toast';

// Color map for competency levels
const levelStyle = (val) => {
    if (!val || val === '-') return { cell: 'text-slate-300', badge: '' };
    const map = {
        'เริ่มต้น': { cell: 'text-red-600 font-bold', badge: 'bg-red-50 text-red-600 border-red-200' },
        'พัฒนา':   { cell: 'text-orange-500 font-bold', badge: 'bg-orange-50 text-orange-600 border-orange-200' },
        'ชำนาญ':  { cell: 'text-blue-600 font-bold', badge: 'bg-blue-50 text-blue-600 border-blue-200' },
        'เชี่ยวชาญ': { cell: 'text-green-600 font-bold', badge: 'bg-green-50 text-green-600 border-green-200' },
    };
    return map[val] || { cell: 'text-slate-500', badge: '' };
};

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
                        .select('learning_outcomes(lo_id, lo_code, ability_no, lo_description, competency_area)')
                        .eq('subject_id', subjectId),
                    supabase.from('student_enrollments')
                        .select('enrollment_id, users_students(student_code, prefix, first_name, last_name)')
                        .eq('subject_id', subjectId)
                ]);

                const formatLOs = mappedLOs?.map(item => item.learning_outcomes)
                    .filter(Boolean)
                    .sort((a, b) => a.ability_no - b.ability_no) || [];
                const formatEnrolls = (enrolls || []).sort((a, b) =>
                    (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || '')
                );

                const enrollIds = formatEnrolls.map(e => e.enrollment_id);
                let evals = [];
                if (enrollIds.length > 0) {
                    const { data: evalsData } = await supabase
                        .from('lo_evaluations')
                        .select('lo_id, enrollment_id, competency_level')
                        .in('enrollment_id', enrollIds);
                    evals = evalsData || [];
                }

                setData({ enrollments: formatEnrolls, learningOutcomes: formatLOs, evaluations: evals });
            } catch (err) {
                toast.error('โหลดสรุปไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadSummary();
    }, [subjectId, subject]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="loader scale-150"></div>
                    <p className="text-slate-400 font-medium">กำลังโหลดข้อมูล...</p>
                </div>
            </div>
        );
    }

    const { enrollments, learningOutcomes, evaluations } = data;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans print:bg-white text-slate-800">
            {/* Top Navigation Bar */}
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-200 sticky top-0 z-40 print:hidden">
                <div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
                    <div className="flex items-center space-x-3 min-w-0">
                        <button
                            onClick={() => navigate(-1)}
                            className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-xl transition-colors flex items-center shrink-0"
                        >
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span className="font-semibold text-sm">กลับ</span>
                        </button>
                        <div className="hidden sm:block w-px h-6 bg-slate-300 shrink-0"></div>
                        <h1 className="font-bold text-base text-slate-800 truncate flex items-center">
                            <FileBarChart className="w-5 h-5 mr-2 text-indigo-500 shrink-0" />
                            ตารางที่ 1 — รายงานผลลัพธ์ฯ รายวิชา:&nbsp;
                            <span className="text-indigo-600">{subject ? subject.subject_name : ''}</span>
                        </h1>
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center shrink-0"
                    >
                        <Printer className="w-4 h-4 mr-2" />
                        พิมพ์ตาราง
                    </button>
                </div>
            </header>

            <main className="flex-grow max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-8 print:p-4">

                {/* Print-only title block */}
                <div className="hidden print:block mb-6">
                    <p className="font-extrabold text-base mb-1">ตารางที่ 1 รายงานผลลัพธ์การเรียนรู้ระดับรายวิชา</p>
                    <p className="text-sm">รายวิชา {subject?.subject_name}&emsp;
                       ระดับชั้น {subject?.grade_level}&emsp;
                       ภาคเรียน {subject?.semester}/{subject?.academic_year}</p>
                </div>

                {/* Subject Info Card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 print:hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                            <p className="text-xs text-indigo-500 font-extrabold uppercase tracking-widest mb-1">ตารางที่ 1 — รายงานผลลัพธ์การเรียนรู้ระดับรายวิชา</p>
                            <h2 className="text-lg font-extrabold text-slate-800">
                                {subject?.subject_name}
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">
                                ระดับชั้น <span className="font-bold text-slate-700">{subject?.grade_level}</span>
                                &ensp;|&ensp; ภาคเรียน <span className="font-bold text-slate-700">{subject?.semester}/{subject?.academic_year}</span>
                                &ensp;|&ensp; LO ที่ผูกไว้ <span className="font-bold text-slate-700">{learningOutcomes.length} รายการ</span>
                                &ensp;|&ensp; นักเรียน <span className="font-bold text-slate-700">{enrollments.length} คน</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 mb-4 print:hidden">
                    {[
                        { label: 'เริ่มต้น', bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200' },
                        { label: 'พัฒนา', bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
                        { label: 'ชำนาญ', bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200' },
                        { label: 'เชี่ยวชาญ', bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200' },
                    ].map(l => (
                        <span key={l.label} className={`inline-flex items-center px-3 py-1 rounded-lg border text-xs font-bold ${l.bg} ${l.text} ${l.border}`}>
                            {l.label}
                        </span>
                    ))}
                    <span className="text-xs text-slate-400 font-medium self-center ml-1">← ระดับผลลัพธ์การเรียนรู้</span>
                </div>

                {/* Main Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-none print:shadow-none print:rounded-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left whitespace-nowrap border-collapse text-sm print:border print:border-black">
                            <thead>
                                <tr>
                                    {/* Sticky fixed columns */}
                                    <th className="px-4 py-4 text-center text-xs font-extrabold uppercase tracking-wider w-12 border-r border-slate-200 print:border-black bg-slate-100 sticky left-0 z-20">
                                        เลขที่
                                    </th>
                                    <th className="px-5 py-4 text-left text-xs font-extrabold uppercase tracking-wider min-w-[200px] border-r border-slate-200 print:border-black bg-slate-100 sticky left-[48px] z-20">
                                        รายชื่อนักเรียน
                                    </th>
                                    {/* One column per LO */}
                                    {learningOutcomes.map(lo => (
                                        <th
                                            key={lo.lo_id}
                                            className="px-3 py-3 text-center text-xs font-extrabold uppercase min-w-[110px] border-r border-slate-200 print:border-black bg-indigo-600 text-white print:bg-transparent print:text-black"
                                            title={lo.lo_description}
                                        >
                                            <span className="block">{lo.lo_code || `LO ${lo.ability_no}`}</span>
                                            {lo.lo_code && <span className="block text-[10px] text-indigo-200 print:text-slate-500 font-normal mt-0.5">ข้อ {lo.ability_no}</span>}
                                            {lo.competency_area && (
                                                <span className="block text-[10px] text-indigo-100 print:text-slate-400 font-normal leading-tight whitespace-normal max-w-[100px] mx-auto">{lo.competency_area}</span>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                                {/* Sub-header with LO description */}
                                {learningOutcomes.some(lo => lo.lo_description) && (
                                    <tr className="bg-indigo-50 print:bg-transparent">
                                        <td className="border-r border-slate-200 print:border-black sticky left-0 bg-indigo-50 z-20"></td>
                                        <td className="px-5 py-2 text-xs text-slate-500 font-medium border-r border-slate-200 print:border-black sticky left-[48px] bg-indigo-50 z-20">
                                            คำอธิบาย LO
                                        </td>
                                        {learningOutcomes.map(lo => (
                                            <td key={lo.lo_id} className="px-3 py-2 text-center text-[11px] text-indigo-700 font-medium border-r border-indigo-100 print:border-black max-w-[120px]">
                                                <span className="block whitespace-normal leading-tight">{lo.lo_description}</span>
                                            </td>
                                        ))}
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white print:divide-black">
                                {enrollments.length === 0 ? (
                                    <tr>
                                        <td colSpan={2 + learningOutcomes.length} className="px-4 py-12 text-center text-slate-400 font-medium">
                                            ไม่พบรายชื่อนักเรียนในวิชานี้
                                        </td>
                                    </tr>
                                ) : (
                                    enrollments.map((enroll, i) => {
                                        const st = enroll.users_students;
                                        return (
                                            <tr key={enroll.enrollment_id} className="hover:bg-slate-50/80 transition-colors group">
                                                <td className="px-4 py-3 text-center text-sm font-semibold text-slate-400 border-r border-slate-100 print:border-black sticky left-0 bg-white group-hover:bg-slate-50/80">
                                                    {i + 1}
                                                </td>
                                                <td className="px-5 py-3 text-sm font-bold text-slate-800 border-r border-slate-100 print:border-black sticky left-[48px] bg-white group-hover:bg-slate-50/80">
                                                    {st?.prefix || ''}{st?.first_name} {st?.last_name}
                                                    <span className="block text-xs text-slate-400 font-mono font-normal">{st?.student_code}</span>
                                                </td>
                                                {learningOutcomes.map(lo => {
                                                    const ev = evaluations.find(e => e.enrollment_id === enroll.enrollment_id && e.lo_id === lo.lo_id);
                                                    const val = ev?.competency_level || '-';
                                                    const style = levelStyle(val);
                                                    return (
                                                        <td key={lo.lo_id} className="px-3 py-3 text-center text-sm border-r border-slate-100 print:border-black">
                                                            {val !== '-' ? (
                                                                <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-bold print:border-none print:p-0 ${style.badge}`}>
                                                                    {val}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-200 text-xs print:text-slate-400">—</span>
                                                            )}
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

                {/* Summary Stats */}
                {enrollments.length > 0 && learningOutcomes.length > 0 && (
                    <div className="mt-6 print:hidden">
                        <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest mb-3">สรุปจำนวนนักเรียนแต่ละระดับต่อ LO</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {learningOutcomes.map(lo => {
                                const counts = { 'เริ่มต้น': 0, 'พัฒนา': 0, 'ชำนาญ': 0, 'เชี่ยวชาญ': 0, 'ยังไม่ประเมิน': 0 };
                                enrollments.forEach(enroll => {
                                    const ev = evaluations.find(e => e.enrollment_id === enroll.enrollment_id && e.lo_id === lo.lo_id);
                                    const val = ev?.competency_level;
                                    if (val && counts[val] !== undefined) counts[val]++;
                                    else counts['ยังไม่ประเมิน']++;
                                });
                                return (
                                    <div key={lo.lo_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                                        <p className="text-xs font-extrabold text-indigo-600 mb-2">{lo.lo_code || `LO ข้อ ${lo.ability_no}`}</p>
                                        <div className="space-y-1.5">
                                            {[
                                                { k: 'เชี่ยวชาญ', color: 'bg-green-500' },
                                                { k: 'ชำนาญ', color: 'bg-blue-500' },
                                                { k: 'พัฒนา', color: 'bg-orange-400' },
                                                { k: 'เริ่มต้น', color: 'bg-red-400' },
                                                { k: 'ยังไม่ประเมิน', color: 'bg-slate-300' },
                                            ].map(({ k, color }) => (
                                                <div key={k} className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${color}`}></div>
                                                    <span className="text-xs text-slate-600 flex-1">{k}</span>
                                                    <span className="text-xs font-extrabold text-slate-800">{counts[k]}</span>
                                                    <div className="w-20 bg-slate-100 rounded-full h-1.5">
                                                        <div
                                                            className={`${color} h-1.5 rounded-full`}
                                                            style={{ width: `${enrollments.length ? (counts[k] / enrollments.length) * 100 : 0}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
