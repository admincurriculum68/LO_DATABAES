import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { ChevronLeft, Printer, FileBarChart2, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

// Competency level badge
const LevelBadge = ({ val }) => {
    if (!val || val === '-') return <span className="text-slate-300 text-xs">-</span>;
    const map = {
        'เริ่มต้น': 'bg-red-50 text-red-600 border-red-200',
        'พัฒนา': 'bg-orange-50 text-orange-600 border-orange-200',
        'ชำนาญ': 'bg-blue-50 text-blue-600 border-blue-200',
        'เชี่ยวชาญ': 'bg-green-50 text-green-600 border-green-200',
    };
    return (
        <span className={`inline-block px-2 py-0.5 rounded-md border text-xs font-bold whitespace-nowrap ${map[val] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
            {val}
        </span>
    );
};

export default function AdminReportLO() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [allLOs, setAllLOs] = useState([]);
    const [selectedLO, setSelectedLO] = useState('');
    const [subjects, setSubjects] = useState([]);     // subjects mapped to this LO
    const [students, setStudents] = useState([]);     // all students of this school
    const [evalsByLO, setEvalsByLO] = useState([]);  // all evaluations for this LO
    const [enrollmentMap, setEnrollmentMap] = useState({}); // enrollment_id -> {student_id, subject_id}

    useEffect(() => {
        async function loadBase() {
            try {
                const [{ data: los }, { data: studs }] = await Promise.all([
                    supabase.from('learning_outcomes').select('*').order('ability_no', { ascending: true }),
                    supabase.from('users_students').select('student_id, student_code, prefix, first_name, last_name').eq('school_id', currentUser.school_id).order('student_code', { ascending: true })
                ]);
                setAllLOs(los || []);
                setStudents(studs || []);
            } catch (err) {
                toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadBase();
    }, [currentUser]);

    const handleLOChange = async (loId) => {
        setSelectedLO(loId);
        if (!loId) return;
        setLoading(true);
        try {
            // 1. Find all subjects mapped to this LO
            const { data: mappings } = await supabase
                .from('subject_lo_mapping')
                .select('subject_id, subjects(subject_id, subject_code, subject_name, grade_level, semester, academic_year)')
                .eq('lo_id', loId);

            const mappedSubjects = (mappings || []).map(m => m.subjects).filter(Boolean);
            // Filter to this school's subjects
            const filtered = mappedSubjects.filter(s => s);
            setSubjects(filtered);

            const subjectIds = filtered.map(s => s.subject_id);
            if (subjectIds.length === 0) { setEvalsByLO([]); setEnrollmentMap({}); setLoading(false); return; }

            // 2. Get all enrollments for those subjects
            const { data: enrolls } = await supabase
                .from('student_enrollments')
                .select('enrollment_id, student_id, subject_id')
                .in('subject_id', subjectIds);

            const eMap = {};
            (enrolls || []).forEach(e => { eMap[e.enrollment_id] = { student_id: e.student_id, subject_id: e.subject_id }; });
            setEnrollmentMap(eMap);

            // 3. Get evaluations for this LO
            const enrollIds = (enrolls || []).map(e => e.enrollment_id);
            if (enrollIds.length > 0) {
                const { data: evals } = await supabase
                    .from('lo_evaluations')
                    .select('enrollment_id, lo_id, competency_level')
                    .eq('lo_id', loId)
                    .in('enrollment_id', enrollIds);
                setEvalsByLO(evals || []);
            } else {
                setEvalsByLO([]);
            }
        } catch (err) {
            toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Build lookup: studentId + subjectId -> competency_level
    const evalLookup = useMemo(() => {
        const map = {};
        evalsByLO.forEach(ev => {
            const enrollment = enrollmentMap[ev.enrollment_id];
            if (enrollment) {
                const key = `${enrollment.student_id}_${enrollment.subject_id}`;
                map[key] = ev.competency_level;
            }
        });
        return map;
    }, [evalsByLO, enrollmentMap]);

    const selectedLOData = allLOs.find(l => l.lo_id === selectedLO);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans print:bg-white text-slate-800">
            {/* Header */}
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-200 sticky top-0 z-40 print:hidden">
                <div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 min-w-0">
                        <button onClick={() => navigate('/admin')} className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-xl transition-colors flex items-center shrink-0">
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span className="font-semibold text-sm">กลับ</span>
                        </button>
                        <div className="hidden sm:block w-px h-6 bg-slate-300 shrink-0"></div>
                        <h1 className="font-bold text-base text-slate-800 truncate flex items-center">
                            <FileBarChart2 className="w-5 h-5 mr-2 text-indigo-500 shrink-0" />
                            ตารางที่ 2 — รายงาน LO ระดับรายผลลัพธ์การเรียนรู้
                        </h1>
                    </div>
                    <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center shrink-0">
                        <Printer className="w-4 h-4 mr-2" /> พิมพ์
                    </button>
                </div>
            </header>

            <main className="flex-grow max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-8 print:p-4">
                {/* LO Selector */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 print:hidden">
                    <p className="text-sm font-bold text-slate-500 mb-2">เลือกผลลัพธ์การเรียนรู้ (LO) ที่ต้องการดูภาพรวม:</p>
                    <div className="relative max-w-xl">
                        <select
                            value={selectedLO}
                            onChange={(e) => handleLOChange(e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-800 py-3 pl-4 pr-10 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none"
                        >
                            <option value="">— กรุณาเลือก LO ที่ต้องการ —</option>
                            {allLOs.map(lo => (
                                <option key={lo.lo_id} value={lo.lo_id}>
                                    {lo.lo_code ? `[${lo.lo_code}]` : ''} ข้อ {lo.ability_no} — {lo.competency_area} : {lo.lo_description?.substring(0, 60)}{lo.lo_description?.length > 60 ? '...' : ''}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {!selectedLO ? (
                    <div className="text-center py-32 text-slate-400 font-medium bg-white rounded-2xl border border-dashed border-slate-200">
                        กรุณาเลือก LO ที่ต้องการจากเมนูด้านบน
                    </div>
                ) : loading ? (
                    <div className="py-24 flex justify-center"><div className="loader scale-150"></div></div>
                ) : (
                    <>
                        {/* Print Title */}
                        <div className="mb-6">
                            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">ตารางที่ 2 รายงานผลลัพธ์การเรียนรู้ระดับรายผลลัพธ์การเรียนกับรายวิชาที่ผูกไว้ทั้งหมด</p>
                            <div className="bg-white rounded-2xl border border-indigo-100 p-5 shadow-sm">
                                <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-1">ผลลัพธ์การเรียนรู้</p>
                                <h2 className="text-lg font-extrabold text-slate-800">
                                    {selectedLOData?.lo_code ? `${selectedLOData.lo_code} — ` : ''}ข้อ {selectedLOData?.ability_no}: {selectedLOData?.lo_description}
                                </h2>
                                <p className="text-sm text-slate-500 mt-1">ด้านความสามารถ: <span className="font-bold text-slate-700">{selectedLOData?.competency_area || '-'}</span> | ระดับช่วงชั้น: <span className="font-bold text-slate-700">{selectedLOData?.level_group || '-'}</span></p>
                            </div>
                        </div>

                        {subjects.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-slate-500 font-bold">ไม่มีรายวิชาใดที่ผูก LO นี้ไว้</div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-black print:border">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left whitespace-nowrap border-collapse text-sm print:border print:border-black">
                                        <thead>
                                            {/* Row 1: subject headers */}
                                            <tr className="bg-indigo-600 text-white print:bg-transparent print:text-black">
                                                <th rowSpan={2} className="px-5 py-4 text-left font-extrabold min-w-[200px] border-r border-indigo-500 print:border-black align-middle">
                                                    รายชื่อนักเรียน
                                                </th>
                                                {subjects.map(sub => (
                                                    <th key={sub.subject_id} className="px-4 py-3 text-center font-bold border-r border-indigo-500 print:border-black min-w-[120px] text-xs">
                                                        <span className="block font-extrabold">{sub.subject_code}</span>
                                                        <span className="block font-normal text-indigo-200 print:text-slate-500 mt-0.5 whitespace-normal leading-tight max-w-[120px]">{sub.subject_name}</span>
                                                        <span className="block text-[11px] font-normal text-indigo-300 print:text-slate-400">{sub.grade_level} | เทอม {sub.semester}/{sub.academic_year}</span>
                                                    </th>
                                                ))}
                                            </tr>
                                            <tr className="bg-indigo-50 print:bg-transparent">
                                                {subjects.map(sub => (
                                                    <th key={sub.subject_id} className="px-4 py-2 text-center text-xs font-bold text-indigo-700 border-r border-indigo-100 print:border-black">
                                                        ระดับผลลัพธ์
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white print:divide-black">
                                            {students.map((st, idx) => (
                                                <tr key={st.student_id} className="hover:bg-slate-50 transition-colors group">
                                                    <td className="px-5 py-3 font-bold text-slate-800 border-r border-slate-100 print:border-black sticky left-0 bg-white group-hover:bg-slate-50">
                                                        <span className="text-slate-400 font-normal text-xs mr-2">{idx + 1}.</span>
                                                        {st.prefix || ''}{st.first_name} {st.last_name}
                                                        <span className="block text-xs text-slate-400 font-mono">{st.student_code}</span>
                                                    </td>
                                                    {subjects.map(sub => {
                                                        const key = `${st.student_id}_${sub.subject_id}`;
                                                        const level = evalLookup[key] || '-';
                                                        return (
                                                            <td key={sub.subject_id} className="px-4 py-3 text-center border-r border-slate-100 print:border-black">
                                                                <LevelBadge val={level} />
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
