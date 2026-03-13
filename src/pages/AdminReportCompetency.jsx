import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { ChevronLeft, Printer, BarChart3, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

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

export default function AdminReportCompetency() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [competencyAreas, setCompetencyAreas] = useState([]);
    const [selectedArea, setSelectedArea] = useState('');

    // After selecting an area
    const [losByArea, setLosByArea] = useState([]);        // LOs in this competency area
    const [subjects, setSubjects] = useState([]);          // distinct subjects mapped to ANY lo in this area
    const [students, setStudents] = useState([]);
    const [evals, setEvals] = useState([]);
    const [enrollmentMap, setEnrollmentMap] = useState({}); // enrollment_id -> { student_id, subject_id }
    const [subjectLoMap, setSubjectLoMap] = useState({});   // lo_id -> [subject_ids]

    useEffect(() => {
        async function init() {
            try {
                const [{ data: los }, { data: studs }] = await Promise.all([
                    supabase.from('learning_outcomes').select('competency_area').order('competency_area'),
                    supabase.from('users_students').select('student_id, student_code, prefix, first_name, last_name').eq('school_id', currentUser.school_id).order('student_code', { ascending: true })
                ]);
                const uniqueAreas = [...new Set((los || []).map(l => l.competency_area).filter(Boolean))];
                setCompetencyAreas(uniqueAreas);
                setStudents(studs || []);
            } catch (err) {
                toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        init();
    }, [currentUser]);

    const handleAreaChange = async (area) => {
        setSelectedArea(area);
        if (!area) return;
        setLoading(true);
        try {
            // 1. Get LOs in this area
            const { data: los } = await supabase
                .from('learning_outcomes')
                .select('*')
                .eq('competency_area', area)
                .order('ability_no', { ascending: true });
            setLosByArea(los || []);

            const loIds = (los || []).map(l => l.lo_id);
            if (loIds.length === 0) { setSubjects([]); setEvals([]); setEnrollmentMap({}); setSubjectLoMap({}); setLoading(false); return; }

            // 2. Get all subject_lo_mapping for these LOs
            const { data: mappings } = await supabase
                .from('subject_lo_mapping')
                .select('lo_id, subject_id, subjects(subject_id, subject_code, subject_name, grade_level, semester, academic_year)')
                .in('lo_id', loIds);

            // Build subjectLoMap: lo_id -> Set of subject_ids
            const slMap = {};
            const subjectSet = {};
            (mappings || []).forEach(m => {
                if (!slMap[m.lo_id]) slMap[m.lo_id] = new Set();
                slMap[m.lo_id].add(m.subject_id);
                if (m.subjects && !subjectSet[m.subject_id]) subjectSet[m.subject_id] = m.subjects;
            });
            // Convert sets to arrays
            const slMapArr = {};
            Object.keys(slMap).forEach(k => { slMapArr[k] = [...slMap[k]]; });
            setSubjectLoMap(slMapArr);

            const uniqueSubjects = Object.values(subjectSet);
            setSubjects(uniqueSubjects);

            // 3. Get all enrollments for these subjects
            const subjectIds = uniqueSubjects.map(s => s.subject_id);
            if (subjectIds.length === 0) { setEvals([]); setEnrollmentMap({}); setLoading(false); return; }

            const { data: enrolls } = await supabase
                .from('student_enrollments')
                .select('enrollment_id, student_id, subject_id')
                .in('subject_id', subjectIds);

            const eMap = {};
            (enrolls || []).forEach(e => { eMap[e.enrollment_id] = { student_id: e.student_id, subject_id: e.subject_id }; });
            setEnrollmentMap(eMap);

            // 4. Get evaluations for all LOs in this area
            const enrollIds = (enrolls || []).map(e => e.enrollment_id);
            if (enrollIds.length > 0) {
                const { data: evData } = await supabase
                    .from('lo_evaluations')
                    .select('enrollment_id, lo_id, competency_level')
                    .in('lo_id', loIds)
                    .in('enrollment_id', enrollIds);
                setEvals(evData || []);
            } else {
                setEvals([]);
            }
        } catch (err) {
            toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // Build lookup: lo_id + subject_id + student_id -> competency_level
    const evalLookup = useMemo(() => {
        const map = {};
        evals.forEach(ev => {
            const enrollment = enrollmentMap[ev.enrollment_id];
            if (enrollment) {
                const key = `${ev.lo_id}_${enrollment.subject_id}_${enrollment.student_id}`;
                map[key] = ev.competency_level;
            }
        });
        return map;
    }, [evals, enrollmentMap]);

    // Build columns: for each LO, list all subjects that include it
    // Column = { lo, sub } pair
    const columns = useMemo(() => {
        const cols = [];
        losByArea.forEach(lo => {
            const subIds = subjectLoMap[lo.lo_id] || [];
            subIds.forEach(subId => {
                const sub = subjects.find(s => s.subject_id === subId);
                if (sub) cols.push({ lo, sub });
            });
        });
        return cols;
    }, [losByArea, subjectLoMap, subjects]);

    // Group columns by LO for colspan
    const loGroups = useMemo(() => {
        const groups = [];
        let last = null;
        columns.forEach(col => {
            if (last && last.lo.lo_id === col.lo.lo_id) {
                last.count++;
            } else {
                last = { lo: col.lo, count: 1 };
                groups.push(last);
            }
        });
        return groups;
    }, [columns]);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans print:bg-white text-slate-800">
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-200 sticky top-0 z-40 print:hidden">
                <div className="max-w-[1800px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
                    <div className="flex items-center space-x-3 min-w-0">
                        <button onClick={() => navigate('/admin')} className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-xl transition-colors flex items-center shrink-0">
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span className="font-semibold text-sm">กลับ</span>
                        </button>
                        <div className="hidden sm:block w-px h-6 bg-slate-300 shrink-0"></div>
                        <h1 className="font-bold text-base text-slate-800 truncate flex items-center">
                            <BarChart3 className="w-5 h-5 mr-2 text-purple-500 shrink-0" />
                            ตารางที่ 3 — รายงานประเมินรายด้านความสามารถ (ข้ามทุกวิชา)
                        </h1>
                    </div>
                    <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center shrink-0">
                        <Printer className="w-4 h-4 mr-2" /> พิมพ์
                    </button>
                </div>
            </header>

            <main className="flex-grow max-w-[1800px] mx-auto w-full px-4 sm:px-6 py-8 print:p-4">
                {/* Area Selector */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 print:hidden">
                    <p className="text-sm font-bold text-slate-500 mb-2">เลือกด้านความสามารถที่ต้องการดูภาพรวม:</p>
                    <div className="relative max-w-xl">
                        <select
                            value={selectedArea}
                            onChange={(e) => handleAreaChange(e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 text-slate-800 py-3 pl-4 pr-10 rounded-xl font-bold focus:ring-2 focus:ring-purple-400 outline-none"
                        >
                            <option value="">— กรุณาเลือกด้านความสามารถ —</option>
                            {competencyAreas.map(a => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {!selectedArea ? (
                    <div className="text-center py-32 text-slate-400 font-medium bg-white rounded-2xl border border-dashed border-slate-200">
                        กรุณาเลือกด้านความสามารถจากเมนูด้านบน
                    </div>
                ) : loading ? (
                    <div className="py-24 flex justify-center"><div className="loader scale-150"></div></div>
                ) : (
                    <>
                        <div className="mb-6">
                            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-1">ตารางที่ 3 รายงานผลการประเมินรายด้านความสามารถของนักเรียนทุกรายวิชาที่ผูกกับด้านความสามารถนั้น ๆ</p>
                            <div className="bg-white rounded-2xl border border-purple-100 p-5 shadow-sm">
                                <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">ด้านความสามารถที่เลือก</p>
                                <h2 className="text-lg font-extrabold text-slate-800">{selectedArea}</h2>
                                <p className="text-sm text-slate-500 mt-1">
                                    จำนวน LO ในด้านนี้: <span className="font-bold text-slate-700">{losByArea.length} ข้อ</span> |
                                    รายวิชาที่เกี่ยวข้อง: <span className="font-bold text-slate-700">{subjects.length} วิชา</span>
                                </p>
                            </div>
                        </div>

                        {columns.length === 0 ? (
                            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 text-slate-500 font-bold">ไม่มีรายวิชาใดที่ผูก LO ในด้านนี้ไว้</div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:border-black print:border">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left whitespace-nowrap border-collapse text-sm print:border print:border-black">
                                        <thead>
                                            {/* Row 1: LO groups spanning multiple subject columns */}
                                            <tr className="bg-purple-600 text-white print:bg-transparent print:text-black">
                                                <th rowSpan={3} className="px-5 py-4 text-left font-extrabold min-w-[200px] border-r border-purple-500 print:border-black align-middle">
                                                    รายชื่อนักเรียน
                                                </th>
                                                {loGroups.map(g => (
                                                    <th key={g.lo.lo_id} colSpan={g.count} className="px-4 py-3 text-center font-extrabold border-r border-purple-400 print:border-black text-xs">
                                                        {g.lo.lo_code ? `${g.lo.lo_code} — ` : ''}ข้อ {g.lo.ability_no}
                                                    </th>
                                                ))}
                                            </tr>
                                            {/* Row 2: subject name under each LO */}
                                            <tr className="bg-purple-700 text-purple-100 print:bg-transparent print:text-black">
                                                {columns.map((col, i) => (
                                                    <th key={i} className="px-3 py-2 text-center border-r border-purple-500 print:border-black min-w-[110px] text-xs">
                                                        <span className="block font-normal text-purple-200 print:text-slate-500 whitespace-normal leading-tight">{col.sub.subject_name}</span>
                                                    </th>
                                                ))}
                                            </tr>
                                            {/* Row 3: grade + semester */}
                                            <tr className="bg-purple-50 print:bg-transparent">
                                                {columns.map((col, i) => (
                                                    <th key={i} className="px-3 py-2 text-center border-r border-purple-100 print:border-black text-[11px] font-bold text-purple-600">
                                                        {col.sub.grade_level} | เทอม {col.sub.semester}/{col.sub.academic_year}
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
                                                    {columns.map((col, i) => {
                                                        const key = `${col.lo.lo_id}_${col.sub.subject_id}_${st.student_id}`;
                                                        const level = evalLookup[key] || '-';
                                                        return (
                                                            <td key={i} className="px-3 py-3 text-center border-r border-slate-100 print:border-black">
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
