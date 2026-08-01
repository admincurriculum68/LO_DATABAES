import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import Layout from '../components/Layout';
import {
    BarChart3,
    Users,
    BookOpenCheck,
    Award,
    GraduationCap,
    TrendingUp,
    ClipboardCheck,
    AlertTriangle,
    FileBarChart2,
    LayoutGrid,
    ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formalLevelLabel } from '../lib/terminology';
import { calculateEvidenceProgress, isReviewableWorkflow } from '../lib/evaluationProgress';

const LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'];
const PASSING_LEVELS = ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'];

const levelTone = {
    เริ่มต้น: { bar: 'bg-rose-500', text: 'text-rose-700', chip: 'bg-rose-50 text-rose-800 border-rose-200' },
    พัฒนา: { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-50 text-amber-800 border-amber-200' },
    ชำนาญ: { bar: 'bg-blue-500', text: 'text-blue-700', chip: 'bg-blue-50 text-blue-800 border-blue-200' },
    เชี่ยวชาญ: { bar: 'bg-emerald-500', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

const submissionMeta = {
    draft: { label: 'ครูยังไม่ส่ง', className: 'bg-slate-100 text-slate-700 border-slate-200' },
    submitted: { label: 'ส่งให้วิชาการแล้ว', className: 'bg-blue-50 text-blue-800 border-blue-200' },
    under_review: { label: 'วิชาการกำลังตรวจ', className: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    returned: { label: 'ส่งกลับให้แก้ไข', className: 'bg-rose-50 text-rose-800 border-rose-200' },
    approved: { label: 'รับรองผลแล้ว', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

const teacherName = teacher => (teacher ? `${teacher.prefix || ''}${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() : 'ยังไม่กำหนดครูผู้สอน');

function SectionCard({ title, description, icon: Icon, action, children }) {
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
                <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-700"><Icon className="h-5 w-5" /></span>
                    <div>
                        <h3 className="font-extrabold text-slate-950">{title}</h3>
                        <p className="mt-0.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
                    </div>
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

function EmptyRow({ children }) {
    return <p className="px-5 py-10 text-center text-sm font-semibold text-slate-500 lg:px-6">{children}</p>;
}

export default function ExecutiveDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            if (!currentUser?.school_id || !academicYear || !semester) return;
            setLoading(true);
            try {
                const schoolId = currentUser.school_id;
                const [subjects, teachers, students, los, contexts, decisions] = await Promise.all([
                    fetchAllRows((from, to) => supabase.from('subjects').select('subject_id, subject_name, grade_level, teacher_id')
                        .eq('school_id', schoolId).eq('academic_year', academicYear).eq('semester', semester).range(from, to)),
                    fetchAllRows((from, to) => supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name')
                        .eq('school_id', schoolId).range(from, to)),
                    fetchAllRows((from, to) => supabase.from('users_students').select('student_id, current_room, current_grade_level')
                        .eq('school_id', schoolId).range(from, to)),
                    fetchAllRows((from, to) => supabase.from('learning_outcomes').select('lo_id, competency_area, ability_no')
                        .eq('school_id', schoolId).range(from, to)),
                    fetchAllRows((from, to) => supabase.from('learning_contexts').select('context_id, context_type')
                        .eq('school_id', schoolId).eq('academic_year', academicYear).eq('semester', semester).range(from, to)),
                    fetchAllRows((from, to) => supabase.from('competency_area_final_decisions').select('student_id, competency_area, final_level, decision_status')
                        .eq('school_id', schoolId).eq('academic_year', academicYear).eq('semester', semester).range(from, to)),
                ]);
                const subjectIds = subjects.map(item => item.subject_id);
                const contextIds = contexts.map(item => item.context_id);

                const [enrollments, mappings, submissions] = await Promise.all([
                    fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('student_enrollments').select('enrollment_id, subject_id, student_id')
                        .in('subject_id', batch).eq('enrollment_status', 'active').range(from, to)),
                    fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('subject_lo_mapping').select('subject_id, lo_id')
                        .in('subject_id', batch).range(from, to)),
                    fetchAllRows((from, to) => supabase.from('assessment_submissions').select('subject_id, status')
                        .eq('school_id', schoolId).eq('academic_year', academicYear).eq('semester', semester).range(from, to)),
                ]);
                const enrollmentIds = enrollments.map(item => item.enrollment_id);

                const [evaluations, contextEvaluations, areaEvaluations] = await Promise.all([
                    fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('lo_evaluations').select('enrollment_id, lo_id, evidence_note, workflow_status')
                        .in('enrollment_id', batch).range(from, to)),
                    fetchAllByIn(contextIds, (batch, from, to) => supabase.from('learning_context_evaluations').select('student_id, lo_id, evidence_note, workflow_status')
                        .in('context_id', batch).range(from, to)),
                    fetchAllByIn(enrollmentIds, (batch, from, to) => supabase.from('competency_area_evaluations').select('enrollment_id, competency_area, competency_level, workflow_status')
                        .in('enrollment_id', batch).range(from, to)),
                ]);

                setData({
                    subjects,
                    contexts,
                    teachers,
                    students,
                    los,
                    decisions,
                    enrollments,
                    mappings,
                    submissions,
                    evaluations,
                    contextEvaluations,
                    areaEvaluations,
                });
            } catch (err) {
                toast.error('ไม่สามารถโหลดข้อมูลสารสนเทศสำหรับผู้บริหารได้: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [currentUser, academicYear, semester]);

    const view = useMemo(() => {
        if (!data) return null;

        const enrollmentById = new Map(data.enrollments.map(item => [item.enrollment_id, item]));
        const teacherById = new Map(data.teachers.map(item => [item.teacher_id, item]));
        const loById = new Map(data.los.map(item => [item.lo_id, item]));
        const submissionBySubject = new Map(data.submissions.map(item => [item.subject_id, item.status]));
        const mappedPairs = new Set(data.mappings.map(item => `${item.subject_id}_${item.lo_id}`));

        // ผลรายวิชาที่ยังผูกกับ LO อยู่จริงเท่านั้น เพื่อให้ตัวเลขตรงกับหน้าประเมินของครู
        const validEvaluations = data.evaluations.filter(item => {
            const enrollment = enrollmentById.get(item.enrollment_id);
            return enrollment && mappedPairs.has(`${enrollment.subject_id}_${item.lo_id}`);
        });

        // 1. ความคืบหน้ารายวิชา
        const subjectRows = data.subjects.map(subject => {
            const subjectEnrollments = data.enrollments.filter(item => item.subject_id === subject.subject_id);
            const subjectLoCount = data.mappings.filter(item => item.subject_id === subject.subject_id).length;
            const enrollmentIdSet = new Set(subjectEnrollments.map(item => item.enrollment_id));
            const filled = validEvaluations.filter(item => enrollmentIdSet.has(item.enrollment_id) && item.evidence_note?.trim()).length;
            const progress = calculateEvidenceProgress({ enrollmentCount: subjectEnrollments.length, loCount: subjectLoCount, filledCount: filled });
            return {
                id: subject.subject_id,
                name: subject.subject_name,
                gradeLevel: subject.grade_level,
                teacher: teacherName(teacherById.get(subject.teacher_id)),
                studentCount: subjectEnrollments.length,
                loCount: subjectLoCount,
                total: progress.total,
                filled,
                percent: progress.percent,
                status: submissionBySubject.get(subject.subject_id) || 'draft',
                blocked: subjectEnrollments.length === 0 || subjectLoCount === 0,
            };
        }).sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name, 'th'));

        const totalCells = subjectRows.reduce((sum, row) => sum + row.total, 0);
        const filledCells = subjectRows.reduce((sum, row) => sum + row.filled, 0);
        const overallPercent = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;

        // 2. คอขวดการรับรองผล นับเป็นคู่ ผู้เรียน x ด้านความสามารถ
        const pairKeys = new Set();
        data.areaEvaluations.forEach(item => {
            if (!isReviewableWorkflow(item.workflow_status)) return;
            const enrollment = enrollmentById.get(item.enrollment_id);
            if (enrollment) pairKeys.add(`${enrollment.student_id}:${item.competency_area}`);
        });
        validEvaluations.forEach(item => {
            if (!isReviewableWorkflow(item.workflow_status)) return;
            const enrollment = enrollmentById.get(item.enrollment_id);
            const area = loById.get(item.lo_id)?.competency_area;
            if (enrollment && area) pairKeys.add(`${enrollment.student_id}:${area}`);
        });
        data.contextEvaluations.forEach(item => {
            if (!isReviewableWorkflow(item.workflow_status)) return;
            const area = loById.get(item.lo_id)?.competency_area;
            if (area) pairKeys.add(`${item.student_id}:${area}`);
        });

        const decisionByPair = new Map(data.decisions.map(item => [`${item.student_id}:${item.competency_area}`, item]));
        let approvedCount = 0;
        let returnedCount = 0;
        pairKeys.forEach(key => {
            const status = decisionByPair.get(key)?.decision_status;
            if (status === 'approved') approvedCount += 1;
            else if (status === 'returned') returnedCount += 1;
        });
        const certification = {
            total: pairKeys.size,
            approved: approvedCount,
            returned: returnedCount,
            pending: Math.max(0, pairKeys.size - approvedCount - returnedCount),
        };

        // 3. ผลแยกตามด้านความสามารถ ใช้เฉพาะผลที่รับรองแล้ว
        const areaMap = new Map();
        data.decisions.filter(item => item.decision_status === 'approved').forEach(item => {
            const area = item.competency_area || 'ไม่ระบุด้านความสามารถ';
            if (!areaMap.has(area)) areaMap.set(area, { area, total: 0, passed: 0, counts: { เริ่มต้น: 0, พัฒนา: 0, ชำนาญ: 0, เชี่ยวชาญ: 0 } });
            const entry = areaMap.get(area);
            entry.total += 1;
            if (PASSING_LEVELS.includes(item.final_level)) entry.passed += 1;
            if (entry.counts[item.final_level] !== undefined) entry.counts[item.final_level] += 1;
        });
        const competencyAreas = [...areaMap.values()]
            .map(entry => ({ ...entry, passPercent: entry.total > 0 ? Math.round((entry.passed / entry.total) * 100) : 0 }))
            .sort((a, b) => a.passPercent - b.passPercent);

        // 4. เทียบรายห้องเรียน
        const studentById = new Map(data.students.map(item => [item.student_id, item]));
        const roomMap = new Map();
        const ensureRoom = room => {
            if (!roomMap.has(room)) roomMap.set(room, { room, students: new Set(), total: 0, filled: 0, decided: 0, passed: 0 });
            return roomMap.get(room);
        };
        data.enrollments.forEach(enrollment => {
            const room = studentById.get(enrollment.student_id)?.current_room || 'ไม่ระบุห้อง';
            const entry = ensureRoom(room);
            entry.students.add(enrollment.student_id);
            entry.total += data.mappings.filter(item => item.subject_id === enrollment.subject_id).length;
        });
        validEvaluations.forEach(item => {
            const enrollment = enrollmentById.get(item.enrollment_id);
            if (!enrollment || !item.evidence_note?.trim()) return;
            ensureRoom(studentById.get(enrollment.student_id)?.current_room || 'ไม่ระบุห้อง').filled += 1;
        });
        data.decisions.filter(item => item.decision_status === 'approved').forEach(item => {
            const room = studentById.get(item.student_id)?.current_room;
            if (!room) return;
            const entry = ensureRoom(room);
            entry.decided += 1;
            if (PASSING_LEVELS.includes(item.final_level)) entry.passed += 1;
        });
        const rooms = [...roomMap.values()]
            .map(entry => ({
                room: entry.room,
                studentCount: entry.students.size,
                progressPercent: entry.total > 0 ? Math.round((entry.filled / entry.total) * 100) : 0,
                decided: entry.decided,
                passPercent: entry.decided > 0 ? Math.round((entry.passed / entry.decided) * 100) : null,
            }))
            .sort((a, b) => a.room.localeCompare(b.room, 'th'));

        // 5. การกระจายระดับ Formative รายด้าน แยกผลที่ส่งแล้วออกจากฉบับร่าง
        const confirmedCounts = { เริ่มต้น: 0, พัฒนา: 0, ชำนาญ: 0, เชี่ยวชาญ: 0 };
        let confirmedTotal = 0;
        let draftTotal = 0;
        data.areaEvaluations.forEach(item => {
            if (!item.competency_level) return;
            if (['submitted', 'approved'].includes(item.workflow_status)) {
                if (confirmedCounts[item.competency_level] !== undefined) {
                    confirmedCounts[item.competency_level] += 1;
                    confirmedTotal += 1;
                }
            } else {
                draftTotal += 1;
            }
        });

        return {
            teacherCount: data.teachers.length,
            studentCount: data.students.length,
            formatCount: data.subjects.length + data.contexts.length,
            subjectCount: data.subjects.length,
            contextCount: data.contexts.length,
            overallPercent,
            filledCells,
            totalCells,
            subjectRows,
            certification,
            competencyAreas,
            rooms,
            confirmedCounts,
            confirmedTotal,
            draftTotal,
        };
    }, [data]);

    const StatCard = ({ title, value, unit, icon: Icon, tone }) => (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
                <span className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-bold text-slate-600">{title}</span>
            </div>
            <p className="mt-3 text-4xl font-black tracking-tight text-slate-900">
                {loading || !view ? '–' : value}
                {unit && <span className="ml-1.5 text-base font-bold text-slate-500">{unit}</span>}
            </p>
        </div>
    );

    return (
        <Layout title="สารสนเทศเพื่อการบริหารสถานศึกษา">
            <header className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
                <div className="flex items-center gap-4">
                    <span className="hidden rounded-2xl bg-slate-900 p-3.5 text-amber-400 sm:block"><BarChart3 className="h-8 w-8" /></span>
                    <div>
                        <h2 className="text-3xl font-black tracking-tight text-slate-950">ข้อมูลภาพรวมของสถานศึกษา</h2>
                        <p className="mt-1.5 text-slate-600">
                            <span className="font-bold text-slate-800">{currentUser?.full_name}</span> · สถิติและผลการประเมินสำหรับประกอบการบริหารจัดการ
                        </p>
                    </div>
                </div>
                <div className="flex w-fit items-center gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white">
                    <Award className="h-6 w-6 text-amber-400" />
                    <div>
                        <div className="text-xs font-bold text-slate-300">รอบข้อมูลที่แสดง</div>
                        <div className="text-sm font-extrabold">ภาคเรียนที่ {semester}/{academicYear}</div>
                    </div>
                </div>
            </header>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-4 py-32">
                    <div className="loader scale-150 border-4 border-amber-100 border-t-amber-600" />
                    <p className="mt-4 font-medium text-slate-500">กำลังประมวลผลสถิติของโรงเรียน...</p>
                </div>
            ) : !view ? null : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard title="ครูและบุคลากร" value={view.teacherCount} unit="คน" icon={Users} tone="bg-blue-50 text-blue-700" />
                        <StatCard title="จำนวนนักเรียน" value={view.studentCount} unit="คน" icon={GraduationCap} tone="bg-emerald-50 text-emerald-700" />
                        <StatCard title="รูปแบบการจัดการเรียนรู้" value={view.formatCount} unit="รายการ" icon={BookOpenCheck} tone="bg-violet-50 text-violet-700" />
                        <StatCard title="บันทึกข้อความ LO แล้ว" value={`${view.overallPercent}%`} icon={TrendingUp} tone="bg-amber-50 text-amber-800" />
                    </div>

                    {/* 1. คอขวดของกระบวนการ */}
                    <SectionCard
                        icon={ClipboardCheck}
                        title="สถานะการรับรองผลลัพธ์การเรียนรู้"
                        description="นับเป็นคู่ ผู้เรียน × ด้านความสามารถที่ครูส่งตรวจแล้ว ตัวเลขนี้เป็นขั้นหลังจากการบันทึกข้อความ LO จึงอาจมีร้อยละต่างกัน"
                    >
                        <div className="grid grid-cols-2 divide-slate-200 border-b border-slate-200 sm:grid-cols-4 sm:divide-x">
                            {[
                                { label: 'รอฝ่ายวิชาการรับรอง', value: view.certification.pending, tone: 'text-amber-700' },
                                { label: 'รับรองแล้ว', value: view.certification.approved, tone: 'text-emerald-700' },
                                { label: 'ส่งกลับให้แก้ไข', value: view.certification.returned, tone: 'text-rose-700' },
                                { label: 'ทั้งหมด', value: view.certification.total, tone: 'text-slate-900' },
                            ].map(item => (
                                <div key={item.label} className="px-5 py-4">
                                    <p className={`text-3xl font-black ${item.tone}`}>{item.value.toLocaleString()}</p>
                                    <p className="mt-1 text-sm font-bold text-slate-600">{item.label}</p>
                                </div>
                            ))}
                        </div>
                        {view.certification.total > 0 && (
                            <div className="px-5 py-4 lg:px-6">
                                <div className="flex h-3 overflow-hidden rounded-full bg-slate-200">
                                    <div className="bg-emerald-500" style={{ width: `${(view.certification.approved / view.certification.total) * 100}%` }} />
                                    <div className="bg-rose-500" style={{ width: `${(view.certification.returned / view.certification.total) * 100}%` }} />
                                </div>
                                <p className="mt-2.5 text-sm font-semibold text-slate-600">
                                    รับรองแล้ว {Math.round((view.certification.approved / view.certification.total) * 100)}% ของรายการที่ครูประเมินไว้
                                </p>
                            </div>
                        )}
                    </SectionCard>

                    {/* 2. ความคืบหน้ารายวิชา */}
                    <SectionCard
                        icon={LayoutGrid}
                        title="ความครบถ้วนของข้อความ LO รายวิชาและรายครู"
                        description="นับช่องข้อความพฤติกรรมราย LO ที่บันทึกแล้ว เรียงจากวิชาที่ค้างมากที่สุด เพื่อดูว่าควรสนับสนุนครูคนใดก่อน"
                    >
                        {view.subjectRows.length === 0 ? (
                            <EmptyRow>ยังไม่มีรายวิชาในภาคเรียนนี้</EmptyRow>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-left text-sm">
                                    <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                                        <tr>
                                            <th className="px-5 py-3">รายวิชา</th>
                                            <th className="px-4 py-3">ครูผู้สอน</th>
                                            <th className="w-24 px-4 py-3 text-center">ผู้เรียน</th>
                                            <th className="w-20 px-4 py-3 text-center">LO</th>
                                            <th className="w-56 px-4 py-3">ประเมินแล้ว</th>
                                            <th className="w-44 px-4 py-3">สถานะ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {view.subjectRows.map(row => {
                                            const meta = submissionMeta[row.status] || submissionMeta.draft;
                                            return (
                                                <tr key={row.id} className="align-middle hover:bg-slate-50/70">
                                                    <td className="px-5 py-3.5">
                                                        <p className="font-bold text-slate-900">{row.name}</p>
                                                        {row.gradeLevel && <p className="mt-0.5 text-xs text-slate-500">ระดับชั้น {row.gradeLevel}</p>}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-slate-700">{row.teacher}</td>
                                                    <td className="px-4 py-3.5 text-center font-bold text-slate-800">{row.studentCount}</td>
                                                    <td className="px-4 py-3.5 text-center font-bold text-slate-800">{row.loCount}</td>
                                                    <td className="px-4 py-3.5">
                                                        {row.blocked ? (
                                                            <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">
                                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                                {row.studentCount === 0 ? 'ยังไม่ได้จัดนักเรียนเข้ากลุ่มเรียน' : 'ยังไม่ได้กำหนด LO'}
                                                            </span>
                                                        ) : (
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-2.5 w-24 overflow-hidden rounded-full bg-slate-200">
                                                                    <div className={`h-full rounded-full ${row.percent === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${row.percent}%` }} />
                                                                </div>
                                                                <span className="text-sm font-extrabold text-slate-800">{row.percent}%</span>
                                                                <span className="text-xs font-semibold text-slate-500">{row.filled}/{row.total}</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-bold ${meta.className}`}>{meta.label}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </SectionCard>

                    {/* 3. ผลรายด้านความสามารถ */}
                    <SectionCard
                        icon={FileBarChart2}
                        title="ผลรายด้านความสามารถที่ฝ่ายวิชาการรับรองแล้ว"
                        description="เรียงจากด้านที่ผู้เรียนผ่านเกณฑ์น้อยที่สุด ใช้กำหนดทิศทางการพัฒนาคุณภาพของสถานศึกษา"
                        action={
                            <button
                                onClick={() => navigate('/admin/report-competency')}
                                className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                เปิดรายงานฉบับเต็ม <ArrowRight className="h-4 w-4" />
                            </button>
                        }
                    >
                        {view.competencyAreas.length === 0 ? (
                            <EmptyRow>ยังไม่มีผลที่ฝ่ายวิชาการรับรอง จึงยังไม่สามารถสรุปรายด้านความสามารถได้</EmptyRow>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {view.competencyAreas.map(area => (
                                    <li key={area.area} className="px-5 py-4 lg:px-6">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <p className="font-bold text-slate-900">{area.area}</p>
                                            <p className="text-sm font-semibold text-slate-600">
                                                ผ่านเกณฑ์ <strong className={area.passPercent >= 80 ? 'text-emerald-700' : area.passPercent >= 50 ? 'text-amber-700' : 'text-rose-700'}>{area.passPercent}%</strong>
                                                <span className="ml-1 text-slate-500">({area.passed}/{area.total} ผลการรับรอง)</span>
                                            </p>
                                        </div>
                                        <div className="mt-2.5 flex h-3 overflow-hidden rounded-full bg-slate-100">
                                            {LEVELS.map(level => {
                                                const width = area.total > 0 ? (area.counts[level] / area.total) * 100 : 0;
                                                if (!width) return null;
                                                return <div key={level} className={levelTone[level].bar} style={{ width: `${width}%` }} title={`${formalLevelLabel(level)} ${area.counts[level]}`} />;
                                            })}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {LEVELS.map(level => (
                                                <span key={level} className={`rounded-md border px-1.5 py-0.5 text-xs font-bold ${levelTone[level].chip}`}>
                                                    {formalLevelLabel(level)} {area.counts[level]}
                                                </span>
                                            ))}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {/* 4. เทียบรายห้องเรียน */}
                        <SectionCard
                            icon={Users}
                            title="เปรียบเทียบรายห้องเรียน"
                            description="ใช้ดูว่าห้องใดควรได้รับการสนับสนุนก่อน"
                        >
                            {view.rooms.length === 0 ? (
                                <EmptyRow>ยังไม่มีการจัดนักเรียนเข้ากลุ่มเรียน</EmptyRow>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[440px] text-left text-sm">
                                        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
                                            <tr>
                                                <th className="px-5 py-3">ห้องเรียน</th>
                                                <th className="w-24 px-4 py-3 text-center">ผู้เรียน</th>
                                                <th className="w-32 px-4 py-3 text-center">ประเมินแล้ว</th>
                                                <th className="w-36 px-4 py-3 text-center">ผ่านเกณฑ์</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {view.rooms.map(room => (
                                                <tr key={room.room} className="hover:bg-slate-50/70">
                                                    <td className="px-5 py-3 font-bold text-slate-900">{room.room}</td>
                                                    <td className="px-4 py-3 text-center font-bold text-slate-800">{room.studentCount}</td>
                                                    <td className="px-4 py-3 text-center font-extrabold text-slate-800">{room.progressPercent}%</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {room.passPercent === null ? (
                                                            <span className="text-xs font-semibold text-slate-400">ยังไม่รับรอง</span>
                                                        ) : (
                                                            <span className={`font-extrabold ${room.passPercent >= 80 ? 'text-emerald-700' : room.passPercent >= 50 ? 'text-amber-700' : 'text-rose-700'}`}>
                                                                {room.passPercent}%
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </SectionCard>

                        {/* 5. การกระจายระดับ */}
                        <SectionCard
                            icon={TrendingUp}
                            title="การกระจายระดับความสามารถ"
                            description="นับเฉพาะผลที่ครูยืนยันส่งตรวจแล้ว ผลที่ยังเป็นฉบับร่างไม่ถูกนำมาคิด"
                            action={
                                <button
                                    onClick={() => navigate('/admin/report-lo')}
                                    className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    ผลราย LO <ArrowRight className="h-4 w-4" />
                                </button>
                            }
                        >
                            <div className="space-y-5 px-5 py-5 lg:px-6">
                                {view.confirmedTotal === 0 ? (
                                    <p className="py-6 text-center text-sm font-semibold text-slate-500">ยังไม่มีผลที่ครูส่งตรวจในภาคเรียนนี้</p>
                                ) : (
                                    [...LEVELS].reverse().map(level => {
                                        const count = view.confirmedCounts[level];
                                        const percent = Math.round((count / view.confirmedTotal) * 100);
                                        return (
                                            <div key={level}>
                                                <div className="mb-1.5 flex items-baseline justify-between">
                                                    <span className={`font-extrabold ${levelTone[level].text}`}>{formalLevelLabel(level)}</span>
                                                    <span className="text-sm font-bold text-slate-700">{count.toLocaleString()} <span className="text-slate-500">({percent}%)</span></span>
                                                </div>
                                                <div className="h-4 overflow-hidden rounded-full bg-slate-100">
                                                    <div className={`h-full rounded-full ${levelTone[level].bar}`} style={{ width: `${percent}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                {view.draftTotal > 0 && (
                                    <p className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-600">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                                        มีอีก {view.draftTotal.toLocaleString()} รายการที่ครูยังบันทึกเป็นฉบับร่าง ยังไม่นับรวมในสัดส่วนด้านบน
                                    </p>
                                )}
                            </div>
                        </SectionCard>
                    </div>
                </div>
            )}
        </Layout>
    );
}
