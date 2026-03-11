import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { ChevronLeft, Printer, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ReportView() {
    const { studentId, academicYear, semester } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    // use location.state.subject if navigated from teacher dashboard EvalView
    const subjectPassed = location.state?.subject;

    useEffect(() => {
        async function fetchReport() {
            try {
                const { data: enrollData, error: enrollErr } = await supabase
                    .from('student_enrollments')
                    .select('*, users_students(*), subjects(*)')
                    .eq('student_id', studentId);

                if (enrollErr) throw enrollErr;

                // Filter by academicYear and semester
                const targetEnrollments = enrollData.filter(e =>
                    e.subjects &&
                    e.subjects.academic_year.toString() === academicYear &&
                    e.subjects.semester.toString() === semester
                );

                if (targetEnrollments.length === 0) throw new Error('ไม่พบข้อมูลการลงทะเบียนในภาคเรียนนี้');

                const enrollmentIds = targetEnrollments.map(e => e.enrollment_id);

                const [{ data: evalData, error: evalErr }, { data: behaviorData }, { data: activityData }] = await Promise.all([
                    supabase.from('lo_evaluations')
                        .select('*, learning_outcomes(*)')
                        .in('enrollment_id', enrollmentIds),
                    supabase.from('behavior_templates')
                        .select('*'),
                    supabase.from('student_year_evaluations')
                        .select('activity_status, character_status')
                        .eq('student_id', studentId)
                        .eq('academic_year', academicYear)
                        .eq('semester', semester)
                        .maybeSingle()
                ]);

                if (evalErr) throw evalErr;

                setData({
                    student: targetEnrollments[0].users_students,
                    representativeSubject: subjectPassed || targetEnrollments[0].subjects,
                    evaluations: evalData || [],
                    behaviors: behaviorData || [],
                    enrollments: targetEnrollments,
                    activities: activityData || { activity_status: 'ผ่าน', character_status: 'ผ่าน' }
                });
            } catch (err) {
                toast.error('โหลดรายงานไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        if (studentId) fetchReport();
    }, [studentId, academicYear, semester, subjectPassed]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-slate-100"><Loader2 className="animate-spin text-indigo-600 w-10 h-10" /></div>;
    }

    if (!data) return <div className="text-center py-10">ไม่พบข้อมูลรายงาน</div>;

    const { student, representativeSubject, evaluations, behaviors, enrollments, activities } = data;
    const fullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;

    // calculate average attendance
    let totalAttendance = 0;
    let attendanceCount = 0;
    enrollments.forEach(e => {
        if (e.attendance_percent !== null && e.attendance_percent !== undefined) {
            totalAttendance += Number(e.attendance_percent);
            attendanceCount++;
        }
    });
    const avgAttendance = attendanceCount > 0 ? (totalAttendance / attendanceCount).toFixed(0) : 100;

    // Convert avgAttendance to Thai numerals
    const thaiNumerals = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
    const avgAttendanceThai = String(avgAttendance).split('').map(char => {
        if (char >= '0' && char <= '9') return thaiNumerals[parseInt(char)];
        return char;
    }).join('');

    // Behavior summary calculation
    // Group evaluations by subject_group
    const groupedEvals = {};
    evaluations.forEach(ev => {
        const enroll = enrollments.find(e => e.enrollment_id === ev.enrollment_id);
        const groupName = enroll?.subjects?.subject_group || 'กลุ่มวิชาอื่นๆ';
        if (!groupedEvals[groupName]) groupedEvals[groupName] = [];
        groupedEvals[groupName].push(ev);
    });

    Object.keys(groupedEvals).forEach(g => {
        groupedEvals[g].sort((a, b) => a.learning_outcomes.ability_no - b.learning_outcomes.ability_no);
    });

    const levelScore = { 'เริ่มต้น': 1, 'พัฒนา': 2, 'ชำนาญ': 3, 'เชี่ยวชาญ': 4 };

    // Get a flat list of sorted evals for behavioral explanations
    let allSortedEvals = [];
    Object.values(groupedEvals).forEach(group => {
        allSortedEvals = [...allSortedEvals, ...group];
    });

    const getGrowth = (level) => {
        const score = levelScore[level] || 0;
        const expectedScore = 2; // "พัฒนา"
        if (score === 0) return '-';
        if (score < expectedScore) return 'เข้าใกล้เกณฑ์';
        if (score === expectedScore) return 'ตามเกณฑ์';
        return 'สูงกว่าเกณฑ์';
    };

    return (
        <div className="min-h-screen bg-slate-200 py-8 print:py-0 print:bg-white font-sans text-slate-900">

            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden px-4">
                <button
                    onClick={() => navigate(-1)}
                    className="bg-white/80 backdrop-blur border border-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-50 transition flex items-center group"
                >
                    <ChevronLeft className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" /> กลับ
                </button>
                <button
                    onClick={() => window.print()}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:bg-indigo-700 transition flex items-center"
                >
                    <Printer className="w-5 h-5 mr-2" /> พิมพ์แบบรายงาน
                </button>
            </div>

            <div className="max-w-[210mm] min-h-[297mm] mx-auto bg-white shadow-2xl p-10 sm:p-14 print:shadow-none print:m-0 print:p-8 relative font-['Sarabun'] text-black text-[16pt] leading-tight flex flex-col justify-between">

                <div>
                    {/* Header */}
                    <div className="text-center mb-6">
                        <h1 className="text-[20pt] font-bold text-black mb-4">แบบการรายงานผลการเรียนชั้น{representativeSubject.grade_level || 'ประถมศึกษา'}</h1>
                        <h2 className="text-[18pt] font-bold text-black flex justify-between px-8">
                            <span>ชื่อ - สกุล <span className="mx-2 underline decoration-dotted underline-offset-4">{fullName}</span></span>
                            <span>การเข้าชั้นเรียน <span className="mx-2 underline decoration-dotted underline-offset-4">&nbsp;&nbsp;{avgAttendanceThai}&nbsp;&nbsp;</span>%</span>
                        </h2>
                    </div>

                    {/* Table 1 */}
                    <table className="w-full text-[16pt] border-collapse border border-black mb-8 leading-tight">
                        <thead className="print:bg-transparent text-center">
                            <tr>
                                <th className="py-2 px-3 font-bold border border-black w-1/2">ความสามารถชั้นปี</th>
                                <th className="py-2 px-3 font-bold border border-black w-1/6">ระดับ<br />ความสามารถที่<br />คาดหวัง</th>
                                <th className="py-2 px-3 font-bold border border-black w-1/6">ระดับ<br />ความสามารถที่<br />ที่ได้</th>
                                <th className="py-2 px-3 font-bold border border-black w-1/6">พัฒนาการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black text-center border-black">
                            {Object.keys(groupedEvals).length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="py-8 text-center text-slate-500">ยังไม่มีข้อมูลการประเมินวิชาในภาคเรียนนี้</td>
                                </tr>
                            ) : (
                                Object.keys(groupedEvals).map((groupName) => {
                                    return (
                                        <React.Fragment key={groupName}>
                                            <tr className="bg-slate-100/50 print:bg-transparent border-y border-black font-bold">
                                                <td colSpan="4" className="py-2.5 px-4 text-left border-r border-black">{groupName}</td>
                                            </tr>
                                            {groupedEvals[groupName].map((ev, index) => {
                                                const lo = ev.learning_outcomes;
                                                const level = ev.competency_level || '-';
                                                const growth = getGrowth(level);

                                                return (
                                                    <tr key={ev.evaluation_id} className="border-y border-black">
                                                        <td className="py-3 px-4 text-left border-r border-black align-top">
                                                            <div className="flex">
                                                                <span className="mr-2">{index + 1}.</span>
                                                                <span>{lo.lo_description}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-4 px-2 border-r border-black align-middle">
                                                            พัฒนา
                                                        </td>
                                                        <td className="py-4 px-2 border-r border-black align-middle">
                                                            {level}
                                                        </td>
                                                        <td className="py-4 px-2 border-r border-black align-middle text-[14pt]">
                                                            {growth}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </React.Fragment>
                                    )
                                })
                            )}
                            <tr className="border-t border-black font-bold text-left">
                                <td colSpan="2" className="py-3 px-4 text-left border-r border-black">กิจกรรมพัฒนาผู้เรียน</td>
                                <td colSpan="2" className="py-3 px-4 text-center">
                                    <span className="mr-6"><span className="border border-black inline-flex justify-center items-center w-4 h-4 mr-2 align-middle text-[10pt] leading-none overflow-hidden pb-0.5">{activities.activity_status === 'ผ่าน' ? '✓' : ''}</span>ผ่าน</span>
                                    <span><span className="border border-black inline-flex justify-center items-center w-4 h-4 mr-2 align-middle text-[10pt] leading-none overflow-hidden pb-0.5">{activities.activity_status === 'ไม่ผ่าน' ? '✓' : ''}</span>ไม่ผ่าน</span>
                                </td>
                            </tr>
                            <tr className="border-t border-black font-bold text-left">
                                <td colSpan="2" className="py-3 px-4 text-left border-r border-black">คุณลักษณะอันพึงประสงค์</td>
                                <td colSpan="2" className="py-3 px-4 text-center">
                                    <span className="mr-6"><span className="border border-black inline-flex justify-center items-center w-4 h-4 mr-2 align-middle text-[10pt] leading-none overflow-hidden pb-0.5">{activities.character_status === 'ผ่าน' ? '✓' : ''}</span>ผ่าน</span>
                                    <span><span className="border border-black inline-flex justify-center items-center w-4 h-4 mr-2 align-middle text-[10pt] leading-none overflow-hidden pb-0.5">{activities.character_status === 'ไม่ผ่าน' ? '✓' : ''}</span>ไม่ผ่าน</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="flex justify-between items-end mt-12 px-8">
                        <div className="text-center">
                            <p className="mb-2">(.................................................................)</p>
                            <p className="font-bold">ครูประจำชั้น</p>
                        </div>
                        <div className="text-center">
                            <p className="mb-2">(.................................................................)</p>
                            <p className="font-bold">ผู้อำนวยการ</p>
                        </div>
                    </div>
                </div>

                <div className="page-break-before mt-16 print:mt-16 print:break-before-page">
                    <h3 className="text-[18pt] font-bold mb-4 font-bold">คำอธิบายพฤติกรรม</h3>
                    <table className="w-full text-[16pt] border-collapse border border-black">
                        <thead className="print:bg-transparent text-center font-bold">
                            <tr>
                                <th className="py-2 px-3 border border-black w-24">ความสามารถ<br />ข้อที่</th>
                                <th className="py-2 px-3 border border-black w-32">ระดับความสามารถ<br />ที่ได้</th>
                                <th className="py-2 px-3 border border-black">พฤติกรรมของนักเรียน</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black text-center">
                            {allSortedEvals.map((ev, index) => {
                                const lo = ev.learning_outcomes;
                                const level = ev.competency_level;
                                const area = lo.competency_area || 'ทั่วไป';

                                // หาคำอธิบาย
                                let behaviorText = '';
                                const bMatch = behaviors.find(b => b.competency_area === area && b.competency_level === level);
                                if (bMatch) {
                                    behaviorText = bMatch.behavior_text;
                                } else {
                                    behaviorText = `(ยังไม่มีคำอธิบายพฤติกรรมในฐานข้อมูลสำหรับด้าน ${area} ระดับ ${level})`;
                                }

                                return (
                                    <tr key={ev.evaluation_id} className="border-y border-black">
                                        <td className="py-3 px-2 border-r border-black align-top font-bold">
                                            {index + 1}
                                        </td>
                                        <td className="py-3 px-2 border-r border-black align-top">
                                            {level}
                                        </td>
                                        <td className="py-3 px-4 text-left align-top leading-tight text-justify">
                                            {behaviorText}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
