import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Save, Scale, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { fetchAllRows, supabase } from '../lib/supabase';

const EMPTY_FORM = { source_competency_area: '', source_evidence: '', target_learning_area: '', target_subject_name: '', target_result: '', decision_reason: '' };

export default function CurriculumEquivalency() {
    const { currentUser } = useAuth();
    const { academicYear } = useAcademic();
    const [students, setStudents] = useState([]);
    const [studentId, setStudentId] = useState('');
    const [query, setQuery] = useState('');
    const [form, setForm] = useState(EMPTY_FORM);
    const [records, setRecords] = useState([]);
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear) return;
        try {
            const [studentRows, recordRows] = await Promise.all([
                fetchAllRows((from, to) => supabase.from('users_students').select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room').eq('school_id', currentUser.school_id).order('student_code').range(from, to)),
                fetchAllRows((from, to) => supabase.from('curriculum_equivalency_results').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).order('updated_at', { ascending: false }).range(from, to)),
            ]);
            setStudents(studentRows);
            setRecords(recordRows);
            setStudentId(current => current || studentRows[0]?.student_id || '');
        } catch (error) {
            toast.error('โหลดข้อมูลการเทียบผลไม่สำเร็จ: ' + error.message);
        }
    }, [academicYear, currentUser?.school_id]);

    useEffect(() => { loadData(); }, [loadData]);
    const selectedStudent = students.find(student => student.student_id === studentId);
    const visibleStudents = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return students.filter(student => `${student.student_code || ''} ${student.first_name} ${student.last_name} ${student.current_room || ''}`.toLowerCase().includes(normalized)).slice(0, 30);
    }, [query, students]);
    const studentRecords = records.filter(record => record.student_id === studentId);
    const updateForm = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

    const save = async (status) => {
        if (!studentId || !form.source_competency_area.trim() || !form.source_evidence.trim() || !form.target_learning_area.trim()) {
            toast.error('กรุณาระบุนักเรียน ด้านความสามารถ หลักฐาน และกลุ่มสาระปลายทาง');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                school_id: currentUser.school_id,
                student_id: studentId,
                academic_year: academicYear,
                source_curriculum: '2568',
                target_curriculum: '2551',
                grade_level: selectedStudent?.current_grade_level || null,
                source_competency_area: form.source_competency_area.trim(),
                source_evidence: form.source_evidence.trim(),
                target_learning_area: form.target_learning_area.trim(),
                target_subject_name: form.target_subject_name.trim(),
                target_result: form.target_result.trim() || null,
                decision_status: status,
                decision_reason: form.decision_reason.trim() || null,
                decided_by: status === 'approved' ? currentUser.teacher_id : null,
                decided_at: status === 'approved' ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            };
            const { error } = await supabase.from('curriculum_equivalency_results').upsert(payload, { onConflict: 'student_id,academic_year,source_competency_area,target_learning_area,target_subject_name' });
            if (error) throw error;
            toast.success(status === 'approved' ? 'รับรองผลเทียบหลักสูตรแล้ว' : 'บันทึกฉบับร่างแล้ว');
            setForm(EMPTY_FORM);
            await loadData();
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Layout title="เทียบผลการเรียน 2568 ไป 2551">
            <div className="mx-auto max-w-7xl space-y-5 pb-12">
                <header className="border-b border-slate-200 pb-5"><h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-950"><Scale className="h-6 w-6 text-indigo-700" />เทียบผลการเรียน หลักสูตร 2568 → 2551</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">บันทึกหลักฐานต้นทางและผลปลายทางเป็นรายบุคคล ระบบไม่แปลงผลอัตโนมัติ การรับรองต้องใช้ดุลยพินิจฝ่ายวิชาการและมีเหตุผลตรวจสอบได้</p></header>
                <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4"><label className="relative block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัส ชื่อ หรือห้อง" className="min-h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm" /></label></div><div className="max-h-[650px] divide-y divide-slate-100 overflow-y-auto">{visibleStudents.map(student => <button key={student.student_id} onClick={() => setStudentId(student.student_id)} className={`w-full p-4 text-left ${studentId === student.student_id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}><p className="font-extrabold text-slate-900">{student.prefix || ''}{student.first_name} {student.last_name}</p><p className="mt-1 text-xs text-slate-500">{student.student_code || '-'} · {student.current_room || 'ไม่ระบุห้อง'}</p></button>)}</div></aside>
                    <main className="space-y-5">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-slate-950">{selectedStudent ? `${selectedStudent.prefix || ''}${selectedStudent.first_name} ${selectedStudent.last_name}` : 'เลือกนักเรียน'}</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-sm font-extrabold text-slate-700">ด้านความสามารถตามหลักสูตร 2568 *</span><input value={form.source_competency_area} onChange={event => updateForm('source_competency_area', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="เช่น ความสามารถด้านการคิดคำนวณ" /></label><label><span className="mb-1.5 block text-sm font-extrabold text-slate-700">กลุ่มสาระการเรียนรู้ตามหลักสูตร 2551 *</span><input value={form.target_learning_area} onChange={event => updateForm('target_learning_area', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="เช่น คณิตศาสตร์" /></label><label><span className="mb-1.5 block text-sm font-extrabold text-slate-700">รายวิชาปลายทาง</span><input value={form.target_subject_name} onChange={event => updateForm('target_subject_name', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="ถ้ามี" /></label><label><span className="mb-1.5 block text-sm font-extrabold text-slate-700">ผลที่เทียบได้</span><input value={form.target_result} onChange={event => updateForm('target_result', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="เช่น ผ่าน หรือระดับผลการเรียน" /></label><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-extrabold text-slate-700">หลักฐานจากหลักสูตร 2568 *</span><textarea rows="4" value={form.source_evidence} onChange={event => updateForm('source_evidence', event.target.value)} className="w-full rounded-xl border border-slate-300 p-3 text-sm leading-6" placeholder="สรุป LO ข้อความพฤติกรรม ชิ้นงาน หรือหลักฐานที่ใช้เทียบ" /></label><label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-extrabold text-slate-700">เหตุผลการเทียบผล</span><textarea rows="3" value={form.decision_reason} onChange={event => updateForm('decision_reason', event.target.value)} className="w-full rounded-xl border border-slate-300 p-3 text-sm leading-6" placeholder="อธิบายความสอดคล้องของเนื้อหา เวลาเรียน และหลักฐาน" /></label></div><div className="mt-5 flex flex-wrap justify-end gap-2"><button onClick={() => save('draft')} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-extrabold text-slate-700"><Save className="h-4 w-4" />บันทึกฉบับร่าง</button><button onClick={() => save('approved')} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white"><CheckCircle2 className="h-4 w-4" />รับรองผลเทียบ</button></div></section>
                        {studentRecords.length > 0 && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-4 font-extrabold text-slate-900">ประวัติการเทียบผล</div><div className="divide-y divide-slate-100">{studentRecords.map(record => <div key={record.equivalency_id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-extrabold text-slate-900">{record.source_competency_area} → {record.target_learning_area}{record.target_subject_name ? ` / ${record.target_subject_name}` : ''}</p><span className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${record.decision_status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{record.decision_status === 'approved' ? 'รับรองแล้ว' : 'ฉบับร่าง'}</span></div><p className="mt-2 text-sm text-slate-600">ผลที่เทียบได้: {record.target_result || 'ยังไม่ระบุ'}</p></div>)}</div></section>}
                    </main>
                </div>
            </div>
        </Layout>
    );
}
