import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { ChevronLeft, Printer, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

// Reusable single-student report component (same layout as ReportView)
function SingleStudentReport({ student, enrollments, evaluations, behaviors, activities, isLast }) {
    const fullName = `${student.prefix || ''}${student.first_name} ${student.last_name}`;

    // Calculate average attendance
    let totalAtt = 0, attCount = 0;
    enrollments.forEach(e => {
        if (e.attendance_percent !== null && e.attendance_percent !== undefined) {
            totalAtt += Number(e.attendance_percent);
            attCount++;
        }
    });
    const avgAtt = attCount > 0 ? (totalAtt / attCount).toFixed(0) : 100;
    const thaiNumerals = ["๐", "๑", "๒", "๓", "๔", "๕", "๖", "๗", "๘", "๙"];
    const avgAttThai = String(avgAtt).split('').map(c => c >= '0' && c <= '9' ? thaiNumerals[parseInt(c)] : c).join('');

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
    const getGrowth = (level) => {
        const score = levelScore[level] || 0;
        if (score === 0) return '-';
        if (score < 2) return 'เข้าใกล้เกณฑ์';
        if (score === 2) return 'ตามเกณฑ์';
        return 'สูงกว่าเกณฑ์';
    };

    let allSortedEvals = [];
    Object.values(groupedEvals).forEach(group => { allSortedEvals = [...allSortedEvals, ...group]; });

    const gradeLevel = enrollments[0]?.subjects?.grade_level || 'ประถมศึกษา';

    return (
        <div className={`max-w-[210mm] min-h-[297mm] mx-auto bg-white p-10 sm:p-14 print:shadow-none print:m-0 print:p-10 relative font-sarabun-new text-black text-[16pt] leading-[1.2] flex flex-col justify-between ${!isLast ? 'print:break-after-page' : ''}`}>
            <div>
                {/* Header */}
                <div className="text-center mb-6">
                    <h1 className="text-[22pt] font-bold text-black mb-3">แบบการรายงานผลการเรียนชั้น{gradeLevel}</h1>
                    <h2 className="text-[18pt] font-bold text-black flex justify-between px-4">
                        <span>ชื่อ - สกุล <span className="mx-2 underline decoration-dotted underline-offset-4">{fullName}</span></span>
                        <span>การเข้าชั้นเรียน <span className="mx-2 underline decoration-dotted underline-offset-4">&nbsp;&nbsp;{avgAttThai}&nbsp;&nbsp;</span>%</span>
                    </h2>
                </div>

                {/* Table */}
                <table className="w-full text-[16pt] border-collapse border border-black mb-10 leading-[1.3]">
                    <thead className="print:bg-transparent text-center bg-slate-50/80">
                        <tr>
                            <th className="py-2.5 px-3 font-bold border border-black w-1/2 align-middle">ความสามารถชั้นปี</th>
                            <th className="py-2.5 px-3 font-bold border border-black w-1/6 align-middle">ระดับ<br />ความสามารถที่<br />คาดหวัง</th>
                            <th className="py-2.5 px-3 font-bold border border-black w-1/6 align-middle">ระดับ<br />ความสามารถ<br />ที่ได้</th>
                            <th className="py-2.5 px-3 font-bold border border-black w-1/6 align-middle">พัฒนาการ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black text-center border-black">
                        {Object.keys(groupedEvals).length === 0 ? (
                            <tr><td colSpan="4" className="py-10 text-center text-slate-500 text-[14pt]">ยังไม่มีข้อมูลการประเมิน</td></tr>
                        ) : (
                            Object.keys(groupedEvals).map(groupName => (
                                <React.Fragment key={groupName}>
                                    <tr className="bg-slate-100/40 print:bg-transparent border-y border-black font-bold">
                                        <td colSpan="4" className="py-2.5 px-3 text-left border-r border-black">{groupName}</td>
                                    </tr>
                                    {groupedEvals[groupName].map((ev, idx) => {
                                        const lo = ev.learning_outcomes;
                                        const level = ev.competency_level || '-';
                                        return (
                                            <tr key={ev.evaluation_id} className="border-y border-black">
                                                <td className="py-2 px-3 text-left border-r border-black align-top font-normal">
                                                    <div className="flex"><span className="mr-2">{idx + 1}.</span><span className="text-justify">{lo.lo_description}</span></div>
                                                </td>
                                                <td className="py-2 px-2 border-r border-black align-middle font-normal">พัฒนา</td>
                                                <td className="py-2 px-2 border-r border-black align-middle font-normal">{level}</td>
                                                <td className="py-2 px-2 border-r border-black align-middle font-normal">{getGrowth(level)}</td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))
                        )}
                        <tr className="border-t border-black text-left">
                            <td colSpan="2" className="py-2.5 px-3 text-left border-r border-black font-bold">กิจกรรมพัฒนาผู้เรียน</td>
                            <td colSpan="2" className="py-2.5 px-3 text-center font-normal">
                                <span className="mr-6"><span className="border border-black inline-flex justify-center items-center w-3 h-3 mr-1.5 align-middle text-[12pt] leading-none overflow-hidden pb-0.5">{activities?.activity_status === 'ผ่าน' ? '✓' : ''}</span>ผ่าน</span>
                                <span><span className="border border-black inline-flex justify-center items-center w-3 h-3 mr-1.5 align-middle text-[12pt] leading-none overflow-hidden pb-0.5">{activities?.activity_status === 'ไม่ผ่าน' ? '✓' : ''}</span>ไม่ผ่าน</span>
                            </td>
                        </tr>
                        <tr className="border-t border-black text-left">
                            <td colSpan="2" className="py-2.5 px-3 text-left border-r border-black font-bold">คุณลักษณะอันพึงประสงค์</td>
                            <td colSpan="2" className="py-2.5 px-3 text-center font-normal">
                                <span className="mr-6"><span className="border border-black inline-flex justify-center items-center w-3 h-3 mr-1.5 align-middle text-[12pt] leading-none overflow-hidden pb-0.5">{activities?.character_status === 'ผ่าน' ? '✓' : ''}</span>ผ่าน</span>
                                <span><span className="border border-black inline-flex justify-center items-center w-3 h-3 mr-1.5 align-middle text-[12pt] leading-none overflow-hidden pb-0.5">{activities?.character_status === 'ไม่ผ่าน' ? '✓' : ''}</span>ไม่ผ่าน</span>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div className="flex justify-between items-end mt-16 px-12">
                    <div className="text-center">
                        <p className="mb-2 font-normal">(.................................................................)</p>
                        <p className="font-bold">ครูประจำชั้น</p>
                    </div>
                    <div className="text-center">
                        <p className="mb-2 font-normal">(.................................................................)</p>
                        <p className="font-bold">ผู้อำนวยการ</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function BatchReportView() {
    const { room, academicYear, semester } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [behaviors, setBehaviors] = useState([]);

    useEffect(() => {
        async function fetchAll() {
            try {
                // 1. Get all enrollments in this room
                const { data: enrollments, error: enrollErr } = await supabase
                    .from('student_enrollments')
                    .select('*, users_students(*), subjects(*)')
                    .eq('room', decodeURIComponent(room));
                if (enrollErr) throw enrollErr;

                // Filter by year/semester
                const filtered = (enrollments || []).filter(e =>
                    e.subjects &&
                    e.subjects.academic_year.toString() === academicYear &&
                    e.subjects.semester.toString() === semester
                );

                if (filtered.length === 0) {
                    toast.error('ไม่พบข้อมูลในห้อง/ภาคเรียนนี้');
                    setLoading(false);
                    return;
                }

                // 2. Group by student
                const studentMap = {};
                filtered.forEach(e => {
                    if (!studentMap[e.student_id]) {
                        studentMap[e.student_id] = {
                            student: e.users_students,
                            enrollments: []
                        };
                    }
                    studentMap[e.student_id].enrollments.push(e);
                });

                const studentIds = Object.keys(studentMap);
                const enrollmentIds = filtered.map(e => e.enrollment_id);

                // 3. Load evaluations, behaviors, activities
                const [{ data: evalData }, { data: behaviorData }, { data: activityData }] = await Promise.all([
                    supabase.from('lo_evaluations')
                        .select('*, learning_outcomes(*)')
                        .in('enrollment_id', enrollmentIds),
                    supabase.from('behavior_templates').select('*'),
                    supabase.from('student_year_evaluations')
                        .select('*')
                        .in('student_id', studentIds)
                        .eq('academic_year', parseInt(academicYear))
                        .eq('semester', parseInt(semester))
                ]);

                setBehaviors(behaviorData || []);

                // Build activity map
                const actMap = {};
                (activityData || []).forEach(a => { actMap[a.student_id] = a; });

                // Build report list
                const reportList = Object.values(studentMap)
                    .sort((a, b) => (a.student.student_code || '').localeCompare(b.student.student_code || ''))
                    .map(item => {
                        const studentEvalIds = item.enrollments.map(e => e.enrollment_id);
                        const studentEvals = (evalData || []).filter(ev => studentEvalIds.includes(ev.enrollment_id));
                        return {
                            student: item.student,
                            enrollments: item.enrollments,
                            evaluations: studentEvals,
                            activities: actMap[item.student.student_id] || { activity_status: 'ผ่าน', character_status: 'ผ่าน' }
                        };
                    });

                setReports(reportList);
            } catch (err) {
                toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchAll();
    }, [room, academicYear, semester]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-200">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
                    <p className="text-slate-500 font-bold">กำลังเตรียมรายงานทั้งห้อง...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-200 py-8 print:py-0 print:bg-white font-sans text-slate-900">
            {/* Toolbar */}
            <div className="max-w-[210mm] mx-auto mb-6 flex justify-between items-center print:hidden px-4">
                <button
                    onClick={() => navigate(-1)}
                    className="bg-white/80 backdrop-blur border border-slate-300 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-semibold shadow-sm hover:bg-slate-50 transition flex items-center group"
                >
                    <ChevronLeft className="w-5 h-5 mr-1 group-hover:-translate-x-1 transition-transform" /> กลับ
                </button>
                <div className="flex items-center gap-3">
                    <span className="bg-indigo-50 border border-indigo-200 px-4 py-2 rounded-xl text-sm font-bold text-indigo-700">
                        🖨️ {reports.length} คน | ห้อง {decodeURIComponent(room)} | เทอม {semester}/{academicYear}
                    </span>
                    <button
                        onClick={() => window.print()}
                        className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:bg-indigo-700 transition flex items-center"
                    >
                        <Printer className="w-5 h-5 mr-2" /> พิมพ์ทั้งห้อง
                    </button>
                </div>
            </div>

            {reports.length === 0 ? (
                <div className="max-w-[210mm] mx-auto bg-white rounded-2xl p-20 text-center text-slate-400 font-bold shadow-lg">
                    ไม่พบข้อมูลในห้องนี้
                </div>
            ) : (
                reports.map((r, i) => (
                    <SingleStudentReport
                        key={r.student.student_id}
                        student={r.student}
                        enrollments={r.enrollments}
                        evaluations={r.evaluations}
                        behaviors={behaviors}
                        activities={r.activities}
                        isLast={i === reports.length - 1}
                    />
                ))
            )}
        </div>
    );
}
