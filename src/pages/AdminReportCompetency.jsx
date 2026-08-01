import { useEffect, useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import AcademicReportShell from '../components/AcademicReportShell';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { fetchAllRows, supabase } from '../lib/supabase';

const LEVEL_STYLES = {
    เริ่มต้น: 'border-rose-200 bg-rose-50 text-rose-800',
    พัฒนา: 'border-amber-200 bg-amber-50 text-amber-800',
    ชำนาญ: 'border-blue-200 bg-blue-50 text-blue-800',
    เชี่ยวชาญ: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    'N/A': 'border-slate-200 bg-slate-50 text-slate-600',
};

const statusLabel = status => ({ approved: 'รับรองแล้ว', returned: 'ส่งกลับแก้ไข', pending: 'รอรับรอง' }[status] || 'รอรับรอง');
const studentName = student => `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim();

export default function AdminReportCompetency() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [loading, setLoading] = useState(true);
    const [students, setStudents] = useState([]);
    const [areas, setAreas] = useState([]);
    const [decisions, setDecisions] = useState([]);
    const [selectedArea, setSelectedArea] = useState('');
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(1);
    const pageSize = 50;

    useEffect(() => {
        async function loadReport() {
            if (!currentUser?.school_id || !academicYear || !semester) return;
            setLoading(true);
            try {
                const [studentRows, loRows, decisionRows] = await Promise.all([
                    fetchAllRows((from, to) => supabase.from('users_students')
                        .select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room')
                        .eq('school_id', currentUser.school_id)
                        .eq('student_status', 'active')
                        .order('student_code')
                        .range(from, to)),
                    fetchAllRows((from, to) => supabase.from('learning_outcomes')
                        .select('competency_area')
                        .eq('school_id', currentUser.school_id)
                        .range(from, to)),
                    fetchAllRows((from, to) => supabase.from('competency_area_final_decisions')
                        .select('student_id, competency_area, final_level, decision_status, decision_reason, decided_at')
                        .eq('school_id', currentUser.school_id)
                        .eq('academic_year', academicYear)
                        .eq('semester', semester)
                        .range(from, to)),
                ]);
                const areaNames = [...new Set([...loRows, ...decisionRows].map(row => row.competency_area).filter(Boolean))]
                    .sort((a, b) => a.localeCompare(b, 'th'));
                setStudents(studentRows);
                setAreas(areaNames);
                setDecisions(decisionRows);
                setSelectedArea(current => areaNames.includes(current) ? current : areaNames[0] || '');
            } catch (error) {
                const migrationHint = error.message?.includes('competency_area_final_decisions')
                    ? ' กรุณารัน update_schema_formative_pipeline.sql ก่อนใช้งานรายงานนี้'
                    : '';
                toast.error(`โหลดรายงานไม่สำเร็จ: ${error.message}${migrationHint}`, { duration: 10000 });
            } finally {
                setLoading(false);
            }
        }
        loadReport();
    }, [academicYear, currentUser?.school_id, semester]);

    const decisionMap = useMemo(() => new Map(decisions.map(item => [`${item.student_id}:${item.competency_area}`, item])), [decisions]);
    const filteredStudents = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return students.filter(student => {
            const decision = decisionMap.get(`${student.student_id}:${selectedArea}`);
            const matchesText = !needle || `${student.student_code || ''} ${studentName(student)} ${student.current_room || ''}`.toLowerCase().includes(needle);
            const matchesStatus = status === 'all' || (status === 'none' ? !decision : decision?.decision_status === status);
            return matchesText && matchesStatus;
        });
    }, [decisionMap, query, selectedArea, status, students]);
    const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
    const visibleStudents = filteredStudents.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => setPage(1), [query, selectedArea, status]);

    const exportExcel = () => {
        if (!selectedArea) return toast.error('ยังไม่มีด้านความสามารถสำหรับออกรายงาน');
        const rows = filteredStudents.map((student, index) => {
            const decision = decisionMap.get(`${student.student_id}:${selectedArea}`);
            return [index + 1, student.student_code, studentName(student), student.current_grade_level, student.current_room, decision?.final_level || '', statusLabel(decision?.decision_status), decision?.decision_reason || ''];
        });
        const sheet = XLSX.utils.aoa_to_sheet([['เลขที่', 'รหัสนักเรียน', 'ชื่อ-นามสกุล', 'ชั้น', 'ห้อง', 'ผลรับรองรายด้าน', 'สถานะ', 'เหตุผล/หมายเหตุ'], ...rows]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'ผลรับรองรายด้าน');
        XLSX.writeFile(workbook, `ผลรับรอง_${selectedArea}_${academicYear}_${semester}.xlsx`);
        toast.success('จัดทำไฟล์ Excel แล้ว');
    };

    return (
        <AcademicReportShell
            title="รายงานผลรายด้านความสามารถ"
            description={`ผลที่ฝ่ายวิชาการรับรอง ภาคเรียนที่ ${semester}/${academicYear} — ข้อความราย LO ใช้เป็นหลักฐานประกอบและไม่ถูกเฉลี่ยเป็นระดับ`}
            wide
            actions={<>
                <button onClick={exportExcel} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4" /> ส่งออก Excel</button>
                <button onClick={() => window.print()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-bold text-white hover:bg-indigo-800"><Printer className="h-4 w-4" /> พิมพ์รายงาน</button>
            </>}
        >
            <section className="mb-5 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden md:grid-cols-[minmax(240px,1fr)_minmax(240px,1fr)_220px]">
                <label><span className="mb-1.5 block text-xs font-bold text-slate-600">ด้านความสามารถ</span><select value={selectedArea} onChange={event => setSelectedArea(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800"><option value="">ยังไม่มีข้อมูล</option>{areas.map(area => <option key={area} value={area}>{area}</option>)}</select></label>
                <label><span className="mb-1.5 block text-xs font-bold text-slate-600">ค้นหาผู้เรียน</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ชื่อ รหัส หรือห้องเรียน" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></label>
                <label><span className="mb-1.5 block text-xs font-bold text-slate-600">สถานะ</span><select value={status} onChange={event => setStatus(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="all">ทุกสถานะ</option><option value="approved">รับรองแล้ว</option><option value="pending">รอรับรอง</option><option value="returned">ส่งกลับแก้ไข</option><option value="none">ยังไม่มีผล</option></select></label>
            </section>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-5"><p className="text-xs font-bold text-indigo-700">ด้านความสามารถ</p><h2 className="mt-1 text-lg font-extrabold text-slate-950">{selectedArea || 'ยังไม่มีข้อมูล'}</h2><p className="mt-1 text-sm text-slate-600">แสดง {filteredStudents.length} คน · หน่วยรับรองคือผู้เรียน 1 คน ต่อ 1 ด้านความสามารถ ต่อภาคเรียน</p></div>
                {loading ? <div className="py-20 text-center text-sm font-semibold text-slate-500">กำลังโหลดรายงาน…</div> : (
                    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-slate-100 text-xs font-extrabold text-slate-700"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">ผู้เรียน</th><th className="px-4 py-3">ชั้น/ห้อง</th><th className="px-4 py-3 text-center">ผลรับรองรายด้าน</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">เหตุผล/หมายเหตุ</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleStudents.map((student, index) => { const decision = decisionMap.get(`${student.student_id}:${selectedArea}`); return <tr key={student.student_id}><td className="px-4 py-3 text-slate-500">{(page - 1) * pageSize + index + 1}</td><td className="px-4 py-3"><strong className="block text-slate-900">{studentName(student)}</strong><span className="text-xs text-slate-500">{student.student_code}</span></td><td className="px-4 py-3 text-slate-700">{student.current_grade_level || '-'} / {student.current_room || '-'}</td><td className="px-4 py-3 text-center">{decision?.final_level ? <span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-extrabold ${LEVEL_STYLES[decision.final_level] || LEVEL_STYLES['N/A']}`}>{decision.final_level}</span> : <span className="text-slate-400">-</span>}</td><td className="px-4 py-3 font-bold text-slate-700">{statusLabel(decision?.decision_status)}</td><td className="max-w-md whitespace-normal px-4 py-3 text-slate-600">{decision?.decision_reason || '-'}</td></tr>; })}{!visibleStudents.length && <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-500">ไม่พบผู้เรียนตามเงื่อนไข</td></tr>}</tbody></table></div>
                )}
            </section>
            {totalPages > 1 && <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 print:hidden"><span className="text-sm font-semibold text-slate-600">หน้า {page} จาก {totalPages}</span><div className="flex gap-2"><button onClick={() => setPage(value => Math.max(1, value - 1))} disabled={page === 1} className="min-h-10 rounded-lg bg-slate-100 px-4 text-sm font-bold disabled:opacity-40">ก่อนหน้า</button><button onClick={() => setPage(value => Math.min(totalPages, value + 1))} disabled={page === totalPages} className="min-h-10 rounded-lg bg-indigo-700 px-4 text-sm font-bold text-white disabled:opacity-40">ถัดไป</button></div></div>}
        </AcademicReportShell>
    );
}
