import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    ClipboardCheck,
    Download,
    FileBarChart2,
    Filter,
    Printer,
    Search,
    UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import SchoolReportHeader from '../components/SchoolReportHeader';
import { useAuth } from '../AuthContext';
import { hasRole } from '../lib/roles';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { calculateCompletion } from '../lib/evaluationProgress';
import { loadSchoolProfile } from '../lib/schoolProfile';

const LEVELS = ['มีข้อความ'];
const levelMeta = {
    มีข้อความ: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-emerald-600' },
    ยังไม่ประเมิน: { badge: 'border-slate-200 bg-slate-50 text-slate-600', bar: 'bg-slate-300' },
};

const studentName = student => `${student?.prefix || ''}${student?.first_name || ''} ${student?.last_name || ''}`.trim();

function SubjectCover({ school, subject, teacherNames }) {
    return (
        <article className="summary-print-only hidden min-h-[270mm] font-sarabun-new text-black">
            <SchoolReportHeader
                school={school}
                title="แฟ้มหลักฐานการประเมินผลลัพธ์การเรียนรู้"
                subtitle="หลักฐานข้อความสะท้อนพฤติกรรมรายวิชา"
            />
            <div className="flex min-h-[190mm] flex-col items-center justify-center text-center">
                <p className="text-2xl">รายวิชา</p>
                <h2 className="mt-4 max-w-[160mm] text-5xl font-bold leading-tight">{subject?.subject_name || '-'}</h2>
                {subject?.subject_code && <p className="mt-3 text-2xl">รหัสวิชา {subject.subject_code}</p>}
                <dl className="mt-12 grid w-full max-w-[150mm] grid-cols-2 gap-x-8 gap-y-4 border-y border-black py-6 text-left text-xl">
                    <dt className="font-bold">ระดับชั้น</dt><dd>{subject?.grade_level || '-'}</dd>
                    <dt className="font-bold">ภาคเรียน/ปีการศึกษา</dt><dd>{subject?.semester || '-'} / {subject?.academic_year || '-'}</dd>
                    <dt className="font-bold">จำนวนชั่วโมงเรียน</dt><dd>{subject?.teaching_hours ? `${subject.teaching_hours} ชั่วโมง` : '-'}</dd>
                    <dt className="font-bold">ครูผู้สอน</dt><dd>{teacherNames.length ? teacherNames.join(', ') : '-'}</dd>
                </dl>
            </div>
            <div className="mt-auto grid grid-cols-2 gap-16 px-10 text-center text-xl">
                <div><p>(........................................................)</p><p className="mt-2 font-bold">ครูผู้สอน</p></div>
                <div><p>(........................................................)</p><p className="mt-2 font-bold">ผู้ตรวจสอบฝ่ายวิชาการ</p></div>
            </div>
        </article>
    );
}

function SubjectEvidenceReport({ school, subject, teacherNames, enrollments, learningOutcomes, evaluationMap, roomLabel }) {
    const rows = enrollments.flatMap((enrollment, studentIndex) => learningOutcomes.map((lo, loIndex) => ({
        key: `${enrollment.enrollment_id}:${lo.lo_id}`,
        studentIndex,
        loIndex,
        enrollment,
        lo,
        evidence: evaluationMap.get(`${enrollment.enrollment_id}:${lo.lo_id}`) || '',
    })));

    return (
        <article className="summary-print-only hidden font-sarabun-new text-black">
            <SchoolReportHeader
                school={school}
                title="รายงานข้อความสะท้อนพฤติกรรมตามผลลัพธ์การเรียนรู้"
                subtitle={`${subject?.subject_name || '-'} · ชั้น ${subject?.grade_level || '-'} · ${roomLabel} · ภาคเรียนที่ ${subject?.semester || '-'}/${subject?.academic_year || '-'}`}
                compact
            />
            <div className="mt-4 flex justify-between gap-6 text-base">
                <p><strong>ครูผู้สอน:</strong> {teacherNames.length ? teacherNames.join(', ') : '-'}</p>
                <p><strong>ผู้เรียน:</strong> {enrollments.length} คน · <strong>LO:</strong> {learningOutcomes.length} ข้อ</p>
            </div>
            <table className="mt-4 w-full border-collapse text-[13px] leading-5">
                <thead><tr><th className="w-10 border border-black px-2 py-2">ที่</th><th className="w-36 border border-black px-2 py-2">ผู้เรียน</th><th className="w-24 border border-black px-2 py-2">LO</th><th className="border border-black px-2 py-2">ข้อความสะท้อนพฤติกรรม</th></tr></thead>
                <tbody>{rows.map(row => <tr key={row.key} className="break-inside-avoid"><td className="border border-black px-2 py-2 text-center">{row.loIndex === 0 ? row.studentIndex + 1 : ''}</td><td className="border border-black px-2 py-2 align-top">{row.loIndex === 0 ? <><strong>{studentName(row.enrollment.users_students)}</strong><br /><span>{row.enrollment.users_students?.student_code || '-'} · {row.enrollment.room || '-'}</span></> : ''}</td><td className="border border-black px-2 py-2 align-top"><strong>{row.lo.lo_code || `LO ${row.lo.ability_no}`}</strong><br /><span>{row.lo.competency_area || 'ไม่ระบุด้าน'}</span></td><td className="border border-black px-2 py-2 align-top">{row.evidence || 'ยังไม่มีข้อความสะท้อนพฤติกรรม'}</td></tr>)}</tbody>
            </table>
        </article>
    );
}

export default function SummaryView() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    // ครูที่มีบทบาท teacher ต้องถูกตรวจการมอบหมายเสมอ แม้จะทำงานฝ่ายวิชาการด้วย
    const mustCheckAssignment = hasRole(currentUser, 'teacher');
    const [subject, setSubject] = useState(location.state?.subject || null);
    const [data, setData] = useState({ enrollments: [], learningOutcomes: [], evaluations: [] });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [query, setQuery] = useState('');
    const [roomFilter, setRoomFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [distributionLo, setDistributionLo] = useState('');
    const [school, setSchool] = useState({ school_name: currentUser?.school_name || '', logo_data_url: '' });
    const [teacherNames, setTeacherNames] = useState([]);
    const [printMode, setPrintMode] = useState('');

    useEffect(() => {
        async function loadSummary() {
            if (!currentUser?.school_id || !currentUser?.teacher_id) return;
            setLoading(true);
            setLoadError('');
            try {
                const { data: subjectData, error: subjectError } = await supabase
                    .from('subjects')
                    .select('*')
                    .eq('subject_id', subjectId)
                    .eq('school_id', currentUser.school_id)
                    .single();
                if (subjectError) throw subjectError;
                if (mustCheckAssignment && subjectData.teacher_id !== currentUser.teacher_id) {
                    const { data: assignment, error: assignmentError } = await supabase.from('subject_teachers')
                        .select('assignment_id').eq('subject_id', subjectId).eq('teacher_id', currentUser.teacher_id).limit(1).maybeSingle();
                    if (assignmentError) throw assignmentError;
                    if (!assignment) throw new Error('คุณไม่ได้รับมอบหมายให้ดูรายงานของรายวิชานี้');
                }
                setSubject(subjectData);

                const [mappingResult, enrollments, schoolProfile, assignmentResult] = await Promise.all([
                    supabase.from('subject_lo_mapping')
                        .select('learning_outcomes(lo_id, lo_code, ability_no, lo_description, competency_area)')
                        .eq('subject_id', subjectId),
                    fetchAllRows((from, to) => supabase.from('student_enrollments')
                        .select('enrollment_id, room, users_students!inner(student_code, prefix, first_name, last_name, school_id)')
                        .eq('subject_id', subjectId)
                        .eq('enrollment_status', 'active')
                        .eq('users_students.school_id', currentUser.school_id)
                        .range(from, to)),
                    loadSchoolProfile(currentUser.school_id),
                    supabase.from('subject_teachers').select('teacher_id').eq('subject_id', subjectId),
                ]);
                if (mappingResult.error) throw mappingResult.error;
                if (assignmentResult.error) throw assignmentResult.error;
                setSchool(schoolProfile);

                const teacherIds = [...new Set([subjectData.teacher_id, ...(assignmentResult.data || []).map(item => item.teacher_id)].filter(Boolean))];
                if (teacherIds.length) {
                    const { data: teachers, error: teacherError } = await supabase.from('users_teachers')
                        .select('teacher_id, prefix, first_name, last_name')
                        .in('teacher_id', teacherIds);
                    if (teacherError) throw teacherError;
                    setTeacherNames((teachers || []).map(teacher => `${teacher.prefix || ''}${teacher.first_name || ''} ${teacher.last_name || ''}`.trim()));
                } else {
                    setTeacherNames([]);
                }

                const learningOutcomes = (mappingResult.data || [])
                    .map(item => item.learning_outcomes)
                    .filter(Boolean)
                    .sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0) || (a.lo_code || '').localeCompare(b.lo_code || '', 'th'));
                const sortedEnrollments = (enrollments || []).sort((a, b) =>
                    (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || '', 'th')
                );
                const enrollmentIds = sortedEnrollments.map(item => item.enrollment_id);
                let evaluations = [];
                if (enrollmentIds.length) {
                    evaluations = await fetchAllByIn(enrollmentIds, (batch, from, to) => supabase
                        .from('lo_evaluations')
                        .select('lo_id, enrollment_id, evidence_note, workflow_status')
                        .in('enrollment_id', batch)
                        .range(from, to));
                }

                setData({ enrollments: sortedEnrollments, learningOutcomes, evaluations });
                setDistributionLo(current => learningOutcomes.some(lo => lo.lo_id === current) ? current : learningOutcomes[0]?.lo_id || '');
            } catch (error) {
                setLoadError(error.message || 'ไม่สามารถโหลดรายงานรายวิชาได้');
            } finally {
                setLoading(false);
            }
        }
        loadSummary();
    }, [mustCheckAssignment, currentUser?.school_id, currentUser?.teacher_id, subjectId]);

    const evaluationMap = useMemo(() => new Map(data.evaluations.map(item => [`${item.enrollment_id}:${item.lo_id}`, item.evidence_note?.trim() || ''])), [data.evaluations]);
    const rooms = useMemo(() => [...new Set(data.enrollments.map(item => item.room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [data.enrollments]);
    const totalExpected = data.enrollments.length * data.learningOutcomes.length;
    const totalEvaluated = data.enrollments.reduce((total, enrollment) => total + data.learningOutcomes.filter(lo => evaluationMap.get(`${enrollment.enrollment_id}:${lo.lo_id}`)).length, 0);
    const { missing: missingCount, percent } = calculateCompletion(totalEvaluated, totalExpected);

    const filteredEnrollments = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return data.enrollments.filter(enrollment => {
            const student = enrollment.users_students;
            const evaluated = data.learningOutcomes.filter(lo => evaluationMap.get(`${enrollment.enrollment_id}:${lo.lo_id}`)).length;
            const complete = data.learningOutcomes.length > 0 && evaluated === data.learningOutcomes.length;
            const matchesQuery = !normalized || `${student?.student_code || ''} ${studentName(student)}`.toLowerCase().includes(normalized);
            const matchesRoom = roomFilter === 'all' || enrollment.room === roomFilter;
            const matchesStatus = statusFilter === 'all' || (statusFilter === 'complete' ? complete : !complete);
            return matchesQuery && matchesRoom && matchesStatus;
        });
    }, [data.enrollments, data.learningOutcomes, evaluationMap, query, roomFilter, statusFilter]);

    const distribution = useMemo(() => {
        const counts = Object.fromEntries([...LEVELS, 'ยังไม่ประเมิน'].map(level => [level, 0]));
        data.enrollments.forEach(enrollment => {
            const value = evaluationMap.get(`${enrollment.enrollment_id}:${distributionLo}`);
            if (value) counts['มีข้อความ'] += 1;
            else counts['ยังไม่ประเมิน'] += 1;
        });
        return counts;
    }, [data.enrollments, distributionLo, evaluationMap]);

    const exportExcel = () => {
        if (!data.enrollments.length) return toast.error('ไม่มีข้อมูลให้ส่งออก');
        const headers = ['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ห้อง', ...data.learningOutcomes.map(lo => lo.lo_code || `LO ${lo.ability_no}`), 'ประเมินแล้ว'];
        const rows = data.enrollments.map((enrollment, index) => {
            const student = enrollment.users_students;
            const values = data.learningOutcomes.map(lo => evaluationMap.get(`${enrollment.enrollment_id}:${lo.lo_id}`) || '');
            const completed = values.filter(Boolean).length;
            return [index + 1, student?.student_code || '', studentName(student), enrollment.room || '', ...values, `${completed}/${data.learningOutcomes.length}`];
        });
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        worksheet['!cols'] = headers.map((header, index) => ({ wch: index === 2 ? 28 : Math.max(12, header.length + 2) }));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'ผลรายวิชา');
        XLSX.writeFile(workbook, `ผลลัพธ์_${subject?.subject_name || 'รายวิชา'}.xlsx`);
        toast.success('จัดทำไฟล์ Excel เรียบร้อยแล้ว');
    };

    useEffect(() => {
        const resetPrintMode = () => setPrintMode('');
        window.addEventListener('afterprint', resetPrintMode);
        return () => window.removeEventListener('afterprint', resetPrintMode);
    }, []);

    const printDocument = mode => {
        setPrintMode(mode);
        window.setTimeout(() => window.print(), 100);
    };

    const printableEnrollments = filteredEnrollments;
    const printableRoomLabel = query.trim() || statusFilter !== 'all'
        ? `ตามตัวกรอง ${filteredEnrollments.length} คน`
        : roomFilter === 'all' ? 'ทุกห้องเรียน' : `ห้อง ${roomFilter}`;

    return (
        <Layout title="สรุปผลรายวิชา">
            <style>{`
                @media print {
                    .summary-controls { display: none !important; }
                    .summary-screen-only { display: none !important; }
                    .summary-print-only { display: block !important; }
                    .summary-document { border: 0 !important; box-shadow: none !important; }
                    .summary-table { font-size: 10px !important; }
                    body { background: white !important; }
                    thead { display: table-header-group; }
                    tr { break-inside: avoid; }
                    @page { size: A4 portrait; margin: 12mm; }
                }
            `}</style>
            <div className="mx-auto w-full max-w-[1800px]">
                <header className="summary-controls mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div><button onClick={() => navigate('/')} className="mb-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"><ArrowLeft className="h-4 w-4" /> กลับ Dashboard ครู</button><div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><FileBarChart2 className="h-4 w-4" /> รายงานผลรายวิชา</div><h2 className="mt-1 text-2xl font-extrabold text-slate-950">{subject?.subject_name || 'กำลังโหลดรายวิชา'}</h2><p className="mt-1 text-sm text-slate-600">ตารางที่ 1 · ผลลัพธ์การเรียนรู้ระดับรายวิชา · ชั้น {subject?.grade_level || '-'} · ภาคเรียนที่ {subject?.semester || '-'}/{subject?.academic_year || '-'}</p></div>
                    <div className="flex flex-wrap gap-2"><button onClick={() => navigate(`/eval/${subjectId}`, { state: { subject } })} className="action-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"><ClipboardCheck className="h-4 w-4" />กลับไปประเมินผล</button><button onClick={exportExcel} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" />Excel</button><button onClick={() => printDocument('cover')} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50"><BookOpen className="h-4 w-4" />พิมพ์ปกรายวิชา</button><button onClick={() => printDocument('evidence')} disabled={!printableEnrollments.length || !data.learningOutcomes.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" />พิมพ์ข้อความ LO</button></div>
                </header>

                {loadError ? (
                    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert"><div className="flex gap-3"><AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" /><div><h3 className="font-extrabold text-rose-950">เปิดรายงานไม่สำเร็จ</h3><p className="mt-1 text-sm text-rose-800">{loadError}</p></div></div></section>
                ) : loading ? (
                    <div className="space-y-5"><div className="h-24 animate-pulse rounded-2xl bg-slate-200" /><div className="h-96 animate-pulse rounded-2xl bg-slate-200" /></div>
                ) : (
                    <>
                        {printMode === 'cover' && <SubjectCover school={school} subject={subject} teacherNames={teacherNames} />}
                        {printMode === 'evidence' && <SubjectEvidenceReport school={school} subject={subject} teacherNames={teacherNames} enrollments={printableEnrollments} learningOutcomes={data.learningOutcomes} evaluationMap={evaluationMap} roomLabel={printableRoomLabel} />}
                        <div className="summary-screen-only">
                        <div className="hidden print:block mb-5"><h1 className="text-base font-bold">ตารางที่ 1 รายงานผลลัพธ์การเรียนรู้ระดับรายวิชา</h1><p className="mt-1 text-sm">รายวิชา {subject?.subject_name} · ชั้น {subject?.grade_level} · ภาคเรียนที่ {subject?.semester}/{subject?.academic_year}</p></div>

                        <section className="summary-controls mb-5 grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="ภาพรวมรายวิชา">
                            {[
                                { label: 'นักเรียนในรายวิชา', value: data.enrollments.length, unit: 'คน', icon: UsersRound, tone: 'bg-indigo-50 text-indigo-700' },
                                { label: 'ผลลัพธ์การเรียนรู้', value: data.learningOutcomes.length, unit: 'LO', icon: BookOpen, tone: 'bg-blue-50 text-blue-700' },
                                { label: 'รายการที่ประเมินแล้ว', value: totalEvaluated, unit: `จาก ${totalExpected}`, icon: ClipboardCheck, tone: 'bg-violet-50 text-violet-700' },
                                { label: 'ความก้าวหน้ารวม', value: percent, unit: '%', icon: CheckCircle2, tone: percent === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800' },
                            ].map((metric, index) => <div key={metric.label} className={`flex items-center gap-3 border-b border-slate-200 p-4 sm:p-5 ${index % 2 === 0 ? 'sm:border-r' : ''} ${index < 2 ? 'xl:border-b-0' : 'sm:border-b-0'} ${index < 3 ? 'xl:border-r' : ''}`}><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}><metric.icon className="h-5 w-5" /></span><div><p className="text-sm font-semibold text-slate-600">{metric.label}</p><p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-950">{metric.value} <span className="text-sm font-semibold text-slate-500">{metric.unit}</span></p></div></div>)}
                        </section>

                        {missingCount > 0 && <section className="summary-controls mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" /><div><h3 className="text-sm font-extrabold text-amber-950">ยังมี {missingCount} รายการที่ไม่ได้ประเมิน</h3><p className="mt-0.5 text-sm text-amber-900">กรองเฉพาะผู้เรียนที่ผลยังไม่ครบ หรือลงผลต่อในหน้าประเมิน</p></div></div><button onClick={() => setStatusFilter('pending')} className="min-h-10 rounded-xl border border-amber-300 bg-white px-4 text-sm font-extrabold text-amber-900 hover:bg-amber-100">แสดงเฉพาะผลที่ยังไม่ครบ</button></section>}

                        <section className="summary-controls mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="ค้นหาและกรองรายงาน"><div className="flex flex-col gap-3 lg:flex-row"><label className="relative flex-1"><span className="sr-only">ค้นหานักเรียน</span><Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อหรือรหัสนักเรียน" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label><label className="relative lg:w-56"><span className="sr-only">กรองตามห้องเรียน</span><Filter className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" /><select value={roomFilter} onChange={event => setRoomFilter(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-8 text-sm font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"><option value="all">ทุกห้องเรียน</option>{rooms.map(room => <option key={room} value={room}>{room}</option>)}</select></label><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 lg:w-52"><option value="all">ทุกสถานะ</option><option value="pending">ผลยังไม่ครบ</option><option value="complete">ประเมินครบแล้ว</option></select></div><p className="mt-2 text-xs font-semibold text-slate-500">แสดง {filteredEnrollments.length} จาก {data.enrollments.length} คน</p></section>

                        <section className="summary-document overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="summary-controls border-b border-slate-200 p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="font-extrabold text-slate-950">ข้อความสะท้อนพฤติกรรมรายบุคคล</h3><p className="mt-1 text-sm text-slate-600">LO เก็บข้อความเชิงคุณภาพเท่านั้น การตัดสินระดับทำเป็นรายด้านความสามารถในขั้น Formative</p></div><div className="flex flex-wrap gap-1.5">{[...LEVELS, 'ยังไม่ประเมิน'].map(level => <span key={level} className={`rounded-lg border px-2.5 py-1 text-xs font-bold ${levelMeta[level].badge}`}>{level}</span>)}</div></div></div>
                            <div className="overflow-x-auto"><table className="summary-table w-full min-w-[780px] border-collapse text-left text-sm"><thead className="bg-slate-100 text-xs font-extrabold text-slate-700"><tr><th className="sticky left-0 z-20 w-16 border-r border-slate-200 bg-slate-100 px-4 py-3 text-center">เลขที่</th><th className="sticky left-16 z-20 min-w-56 border-r border-slate-200 bg-slate-100 px-4 py-3">ผู้เรียน</th><th className="w-24 px-3 py-3 text-center">ห้อง</th>{data.learningOutcomes.map(lo => <th key={lo.lo_id} className="min-w-64 border-l border-slate-200 px-3 py-3 text-center"><span className="block text-indigo-800">{lo.lo_code || `LO ${lo.ability_no}`}</span><span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-600">{lo.competency_area || 'ไม่ระบุด้าน'}</span><span className="mt-1 block max-w-64 whitespace-normal text-[10px] font-normal leading-4 text-slate-500">{lo.lo_description}</span></th>)}<th className="sticky right-0 z-20 w-32 border-l border-slate-200 bg-slate-100 px-4 py-3 text-center">ความครบถ้วน</th></tr></thead><tbody className="divide-y divide-slate-200">{filteredEnrollments.map(enrollment => { const student = enrollment.users_students; const values = data.learningOutcomes.map(lo => evaluationMap.get(`${enrollment.enrollment_id}:${lo.lo_id}`)); const completed = values.filter(Boolean).length; const complete = data.learningOutcomes.length > 0 && completed === data.learningOutcomes.length; return <tr key={enrollment.enrollment_id} className="group hover:bg-slate-50"><td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-4 py-3 text-center font-semibold text-slate-500 group-hover:bg-slate-50">{data.enrollments.indexOf(enrollment) + 1}</td><td className="sticky left-16 z-10 border-r border-slate-200 bg-white px-4 py-3 group-hover:bg-slate-50"><strong className="block text-slate-900">{studentName(student)}</strong><span className="mt-0.5 block text-xs text-slate-500">{student?.student_code}</span></td><td className="px-3 py-3 text-center font-semibold text-slate-600">{enrollment.room || '-'}</td>{data.learningOutcomes.map((lo, loIndex) => { const value = values[loIndex]; return <td key={lo.lo_id} className="border-l border-slate-100 px-3 py-3 align-top">{value ? <p className="min-w-56 whitespace-normal text-xs leading-5 text-slate-700">{value}</p> : <span className="text-xs font-bold text-slate-400">ยังไม่มีข้อความ</span>}</td>; })}<td className="sticky right-0 z-10 border-l border-slate-200 bg-white px-4 py-3 text-center group-hover:bg-slate-50"><span className={`inline-flex rounded-lg px-2.5 py-1.5 text-xs font-extrabold ${complete ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{complete ? 'ครบแล้ว' : `${completed}/${data.learningOutcomes.length}`}</span></td></tr>; })}{filteredEnrollments.length === 0 && <tr><td colSpan={4 + data.learningOutcomes.length} className="px-6 py-14 text-center text-sm text-slate-600">ไม่พบผู้เรียนที่ตรงกับคำค้นหาหรือตัวกรอง</td></tr>}</tbody></table></div>
                        </section>

                        {data.enrollments.length > 0 && data.learningOutcomes.length > 0 && <section className="summary-controls mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="font-extrabold text-slate-950">ความครบถ้วนของข้อความราย LO</h3><p className="mt-1 text-sm text-slate-600">เลือก LO เพื่อดูว่าครูบันทึกข้อความสะท้อนพฤติกรรมแล้วกี่คน</p></div><label><span className="mb-1 block text-xs font-bold text-slate-600">เลือก LO</span><select value={distributionLo} onChange={event => setDistributionLo(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 sm:w-72">{data.learningOutcomes.map(lo => <option key={lo.lo_id} value={lo.lo_id}>{lo.lo_code || `LO ${lo.ability_no}`} · {lo.competency_area || 'ไม่ระบุด้าน'}</option>)}</select></label></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{[...LEVELS].concat('ยังไม่ประเมิน').map(level => { const count = distribution[level]; const levelPercent = data.enrollments.length ? Math.round((count / data.enrollments.length) * 100) : 0; return <div key={level} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-sm font-bold text-slate-700">{level}</span><strong className="text-slate-950">{count} คน</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${levelMeta[level].bar}`} style={{ width: `${levelPercent}%` }} /></div><p className="mt-1.5 text-right text-xs font-semibold text-slate-500">{levelPercent}%</p></div>; })}</div></section>}
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
}
