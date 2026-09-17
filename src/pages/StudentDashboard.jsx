import { useEffect, useState } from 'react';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { buildLoResolver } from '../lib/loByRoom';
import { loadRoomMappings } from '../lib/loByRoomApi';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import Layout from '../components/Layout';
import { GraduationCap, BookOpen, UserCheck, Compass, Bookmark, BookMarked, UserCircle2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { formalLevelLabel } from '../lib/terminology';
import { homeroomSummarySupported } from '../lib/homeroomSummaryApi';

export default function StudentDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [data, setData] = useState([]);
    const [finalResults, setFinalResults] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDashboard() {
            try {
                if (!currentUser?.student_id || !currentUser?.school_id || !academicYear || !semester) return;
                const enrollments = await fetchAllRows((from, to) => supabase.from('student_enrollments')
                    .select(`
            enrollment_id, room,
            subjects(subject_id, subject_name, academic_year, semester)
          `)
                    .eq('student_id', currentUser.student_id).eq('enrollment_status', 'active').range(from, to));

                const currentEnrollments = enrollments.filter(enrollment => enrollment.subjects
                    && enrollment.subjects.academic_year === academicYear
                    && enrollment.subjects.semester === semester);

                if (currentEnrollments.length === 0) {
                    setData([]);
                    setFinalResults([]);
                    setLoading(false);
                    return;
                }

                const subjectIds = currentEnrollments.map(e => e.subjects?.subject_id).filter(Boolean);
                const enrollmentIds = currentEnrollments.map(e => e.enrollment_id);

                // ผลรายด้านมาจากครูประจำชั้นที่ฝ่ายวิชาการรับรองแล้วเท่านั้น
                const hasSummary = await homeroomSummarySupported();
                const [loData, evalData, finalData] = await Promise.all([
                    loadRoomMappings(subjectIds, { withLo: true }),
                    fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('lo_evaluations')
                        .select('enrollment_id, lo_id, evidence_note')
                        .in('enrollment_id', batch).range(from, to)),
                    fetchAllRows((from, to) => supabase.from('competency_area_final_decisions')
                        .select(`decision_id, competency_area, final_level, pass_status, decision_reason, academic_year, semester, decided_at${hasSummary ? ', summary_text' : ''}`)
                        .eq('school_id', currentUser.school_id).eq('student_id', currentUser.student_id)
                        .eq('academic_year', academicYear).eq('semester', semester).eq('decision_status', 'approved').range(from, to)),
                ]);
                setFinalResults(finalData);

                // LO ของวิชาขึ้นกับห้องของนักเรียน
                const loResolver = buildLoResolver(loData);
                const dashboardData = currentEnrollments.map(enroll => {
                    const subject = enroll.subjects;
                    const subjectLos = loResolver.rowsFor(subject.subject_id, enroll.room)
                        .map(l => l.learning_outcomes)
                        .filter(Boolean)
                        .sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0));

                    const evalsMap = evalData.filter(e => e.enrollment_id === enroll.enrollment_id);

                    const subjectEvals = subjectLos.map(lo => {
                        const evMatch = evalsMap.find(e => e.lo_id === lo.lo_id);
                        return {
                            lo_id: lo.lo_id,
                            lo_code: lo.lo_code,
                            ability_no: lo.ability_no,
                            description: lo.lo_description,
                            evidence_text: evMatch?.evidence_note || ''
                        };
                    });

                    return {
                        subject_id: subject.subject_id,
                        subject_name: subject.subject_name,
                        term: `${subject.semester}/${subject.academic_year}`,
                        room: enroll.room,
                        evaluations: subjectEvals
                    };
                });

                setData(dashboardData);

            } catch (err) {
                toast.error('ไม่สามารถโหลดข้อมูลผลการเรียนรู้ได้: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        fetchDashboard();
    }, [academicYear, currentUser, semester]);

    // Calculate overall stats
    const totalSubjects = data.length;
    // LO เดียวกันถูกประเมินได้หลายวิชา ตัวเลขสรุปจึงต้องนับเป็นจำนวน LO ที่ไม่ซ้ำ ไม่ใช่จำนวนช่องประเมิน
    const evaluatedLoIds = new Set();

    data.forEach(sub => {
        sub.evaluations.forEach(ev => {
            if (ev.evidence_text?.trim()) evaluatedLoIds.add(ev.lo_id);
        });
    });

    const totalEvals = evaluatedLoIds.size;
    const passedEvals = new Set(finalResults.filter(result => result.final_level).map(result => result.competency_area)).size;

    return (
        <Layout title="ข้อมูลผลการเรียนรู้ของผู้เรียน">
            {/* Hero / Header Section */}
            <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-line pb-8">
                <div className="flex items-center">
                    <div className="mr-6 hidden rounded-2xl bg-indigo-800 p-4 sm:block">
                        <GraduationCap className="w-10 h-10 text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-bold text-ink tracking-tight">ผลการเรียนรู้ของฉัน</h1>
                        <p className="text-slate-600 font-medium text-lg mt-2">
                            <span className="font-bold text-slate-700">{currentUser?.full_name}</span> · ข้อมูลผลการประเมินและผลลัพธ์การเรียนรู้ (LO)
                        </p>
                    </div>
                </div>

                <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border border-line flex items-center gap-4 min-w-[280px]">
                    <div className="bg-indigo-50 p-3 rounded-lg">
                        <UserCircle2 className="w-8 h-8 text-indigo-700" />
                    </div>
                    <div>
                        <div className="mb-0.5 text-xs font-semibold text-slate-600">รหัสนักเรียน</div>
                        <div className="text-sm text-slate-700 font-bold font-mono">{currentUser.student_code || currentUser.student_id?.split('-')[0] || 'ไม่ระบุ'}</div>
                    </div>
                </div>
            </div>

            {/* Quick Stats Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                <div className="bg-white rounded-2xl p-6 border border-line flex items-center gap-5 relative overflow-hidden group">
                    <div className="h-11 w-11 bg-indigo-50 text-indigo-700 rounded-lg flex items-center justify-center z-10">
                        <BookOpen className="w-7 h-7" />
                    </div>
                    <div className="z-10">
                        <p className="font-bold text-slate-600 text-sm mb-1">รายวิชาที่ลงทะเบียน</p>
                        <p className="text-3xl font-bold text-ink leading-none">{loading ? '-' : totalSubjects} <span className="text-base font-medium text-slate-600 ml-1">วิชา</span></p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-line flex items-center gap-5 relative overflow-hidden group">
                    <div className="h-11 w-11 bg-indigo-50 text-indigo-700 rounded-lg flex items-center justify-center z-10">
                        <Compass className="w-7 h-7" />
                    </div>
                    <div className="z-10">
                        <p className="font-bold text-slate-600 text-sm mb-1">ผลลัพธ์การเรียนรู้ที่ประเมินแล้ว</p>
                        <p className="text-3xl font-bold text-ink leading-none">{loading ? '-' : totalEvals} <span className="text-base font-medium text-slate-600 ml-1">ข้อ</span></p>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-line flex items-center gap-5 relative overflow-hidden group">
                    <div className="h-11 w-11 bg-indigo-50 text-indigo-700 rounded-lg flex items-center justify-center z-10">
                        <UserCheck className="w-7 h-7" />
                    </div>
                    <div className="z-10">
                        <p className="font-bold text-slate-600 text-sm mb-1">ด้านความสามารถที่รับรองแล้ว</p>
                        <p className="text-3xl font-bold text-ink leading-none">{loading ? '-' : passedEvals} <span className="text-base font-medium text-slate-600 ml-1">ด้าน</span></p>
                    </div>
                </div>
            </div>

            {finalResults.length > 0 && (
                <section className="mb-10 overflow-hidden rounded-2xl border border-emerald-200 bg-white" aria-labelledby="certified-results-title">
                    <div className="flex flex-col gap-3 border-b border-emerald-200 bg-emerald-50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-emerald-700 p-3 text-white"><ShieldCheck className="h-6 w-6" /></div>
                            <div><h2 id="certified-results-title" className="text-xl font-bold text-emerald-950">ผลรายด้านความสามารถที่ฝ่ายวิชาการรับรอง</h2><p className="text-sm text-emerald-800">ผลที่ผ่านการพิจารณา Formative และข้อความพฤติกรรมราย LO แล้ว</p></div>
                        </div>
                        <span className="w-fit rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm font-bold text-emerald-800">{finalResults.length} ผลลัพธ์</span>
                    </div>
                    <div className="divide-y divide-line">
                        {finalResults.map(result => (
                                <article key={result.decision_id} className="grid gap-3 px-6 py-5 md:grid-cols-[150px_minmax(0,1fr)_140px] md:items-center">
                                    <div><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">ผลรับรองรายด้าน</span><p className="mt-2 text-xs font-semibold text-slate-500">ภาคเรียนที่ {result.semester}/{result.academic_year}</p></div>
                                    <div><p className="font-bold leading-6 text-slate-900">{result.competency_area}</p>{(result.summary_text || result.decision_reason) && <p className="mt-1 text-sm leading-6 text-slate-600">{result.summary_text || result.decision_reason}</p>}</div>
                                    <div className="md:text-right"><span className={`inline-flex rounded-xl border px-3 py-2 text-sm font-bold ${result.pass_status === 'passed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{formalLevelLabel(result.final_level)}</span></div>
                                </article>
                            ))}
                    </div>
                </section>
            )}

            {/* Main Content */}
            {loading ? (
                <div className="py-24 flex flex-col items-center justify-center space-y-4">
                    <div className="loader scale-150 border-4 border-emerald-100 border-t-emerald-600"></div>
                    <p className="text-slate-500 font-medium animate-pulse">กำลังโหลดข้อมูลผลการเรียนรู้...</p>
                </div>
            ) : data.length === 0 ? (
                <div className="text-center bg-white rounded-2xl p-16 border-2 border-dashed border-line shadow-sm flex flex-col items-center">
                    <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-line">
                        <BookMarked className="w-12 h-12 text-slate-300" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-700 mb-2">ยังไม่มีข้อมูลการลงทะเบียนเรียน</h2>
                    <p className="text-slate-500 text-lg max-w-md mx-auto">
                        กรุณาติดต่อครูผู้สอนหรือฝ่ายวิชาการเพื่อตรวจสอบการลงทะเบียนรายวิชา
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {data.map(sub => (
                        <div key={sub.subject_id} className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-line overflow-hidden flex flex-col transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] hover:-translate-y-1">
                            {/* Card Header */}
                            <div className="relative flex flex-col items-start justify-between gap-4 overflow-hidden bg-indigo-800 px-8 py-6 sm:flex-row sm:items-center">
                                <div className="flex items-center relative z-10 w-full">
                                    <div className="bg-white/10 p-3 rounded-2xl mr-4 border border-white/10">
                                        <Bookmark className="w-6 h-6 text-amber-300" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-3 mb-1.5">
                                            <span className="text-xs font-bold text-slate-300 bg-white/10 px-3 py-1 rounded-lg border border-white/10">
                                                ห้อง {sub.room}
                                            </span>
                                        </div>
                                        <h2 className="text-2xl font-bold text-white leading-tight line-clamp-1">{sub.subject_name}</h2>
                                    </div>
                                </div>
                            </div>

                            {/* Evaluation Table */}
                            <div className="p-6 md:p-8 flex-1 bg-slate-50/30">
                                <div className="bg-white rounded-2xl border border-line overflow-hidden shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-100 text-slate-600 border-b border-line uppercase text-xs tracking-wider font-bold">
                                                <tr>
                                                    <th className="py-4 px-5 w-20 text-center">ข้อที่</th>
                                                    <th className="py-4 px-5">ผลลัพธ์การเรียนรู้ (LO)</th>
                                                    <th className="py-4 px-5 min-w-[280px]">ข้อความสะท้อนพฤติกรรม</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-line">
                                                {sub.evaluations.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="3" className="py-12 text-center text-slate-500 font-medium">
                                                            รายวิชานี้ยังไม่ได้กำหนดผลลัพธ์การเรียนรู้สำหรับการประเมิน
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sub.evaluations.map(ev => {
                                                        return (
                                                            <tr key={ev.ability_no} className="hover:bg-slate-50 transition-colors group">
                                                                <td className="py-5 px-5 text-center align-top border-r border-slate-50">
                                                                    <div className="font-bold text-slate-500 text-xl group-hover:text-emerald-500 transition-colors">{ev.ability_no}</div>
                                                                    {ev.lo_code && <div className="text-xs text-slate-600 font-bold mt-1 bg-slate-100 rounded-lg px-1 py-0.5 inline-block">{ev.lo_code}</div>}
                                                                </td>
                                                                <td className="py-4 px-5 text-slate-700 font-medium leading-relaxed align-top">
                                                                    {ev.description}
                                                                </td>
                                                                <td className="py-4 px-5 align-top border-l border-slate-50">
                                                                    <p className={`rounded-xl border px-3 py-2 text-sm leading-6 ${ev.evidence_text ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-line bg-slate-50 text-slate-500'}`}>
                                                                        {ev.evidence_text || 'ยังไม่มีข้อความสะท้อนพฤติกรรม'}
                                                                    </p>
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
                            <div className="bg-slate-50 border-t border-line py-4 px-8 flex justify-between items-center text-sm font-bold text-slate-500">
                                <span>ภาคเรียนที่ {sub.term}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Layout>
    );
}
