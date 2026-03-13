import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { Search, Printer, Save, ChevronLeft, CheckCircle, XCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Level ordering for comparison ─────────────────────────────────────────
const LEVEL_ORDER = { 'เริ่มต้น': 1, 'พัฒนา': 2, 'ชำนาญ': 3, 'เชี่ยวชาญ': 4 };
const LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'];

function compareLevels(achieved, expected) {
    const a = LEVEL_ORDER[achieved] ?? 0;
    const e = LEVEL_ORDER[expected] ?? 0;
    if (a > e) return 'สูงกว่าเกณฑ์';
    if (a === e) return 'ตามเกณฑ์';
    return 'เข้าใกล้เกณฑ์';
}

const GRADE_LEVELS = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
const CURRENT_YEAR = 2567;

export default function YearlyReportAdmin() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const printRef = useRef();

    // ─── State ────────────────────────────────────────────────────────────
    const [searchTerm, setSearchTerm] = useState('');
    const [allStudents, setAllStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedGrade, setSelectedGrade] = useState('ป.1');
    const [academicYear, setAcademicYear] = useState(CURRENT_YEAR);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Report data
    const [competencies, setCompetencies] = useState([]); // yearly_competencies
    const [behaviorTemplates, setBehaviorTemplates] = useState([]); // yearly_behavior_templates
    const [achievedLevels, setAchievedLevels] = useState({}); // { competency_id: 'ชำนาญ' }
    const [attendancePercent, setAttendancePercent] = useState('');
    const [learnerActivities, setLearnerActivities] = useState('ผ่าน');
    const [desirableChars, setDesirableChars] = useState('ผ่าน');
    const [existingResultId, setExistingResultId] = useState(null);

    // ─── Load students ──────────────────────────────────────────────────
    useEffect(() => {
        const loadStudents = async () => {
            const { data } = await supabase
                .from('users_students')
                .select('student_id, prefix, first_name, last_name, student_code')
                .eq('school_id', currentUser.school_id)
                .order('student_code');
            setAllStudents(data || []);
        };
        loadStudents();
    }, [currentUser.school_id]);

    const filteredStudents = allStudents.filter(s => {
        const q = searchTerm.toLowerCase();
        return (
            s.first_name?.toLowerCase().includes(q) ||
            s.last_name?.toLowerCase().includes(q) ||
            s.student_code?.includes(q)
        );
    });

    // ─── Load competencies & behavior templates for selected grade ──────
    const loadCompetencies = useCallback(async (grade) => {
        setLoading(true);
        const [{ data: comps }, { data: behaviors }] = await Promise.all([
            supabase.from('yearly_competencies')
                .select('*')
                .eq('school_id', currentUser.school_id)
                .eq('grade_level', grade)
                .order('competency_no'),
            supabase.from('yearly_behavior_templates')
                .select('*')
                .eq('school_id', currentUser.school_id)
                .eq('grade_level', grade)
        ]);
        setCompetencies(comps || []);
        setBehaviorTemplates(behaviors || []);
        setLoading(false);
    }, [currentUser.school_id]);

    // ─── Load existing results for student+grade+year ───────────────────
    const loadExistingResult = useCallback(async (studentId, grade, year) => {
        const { data: result } = await supabase
            .from('student_yearly_results')
            .select('*, student_yearly_competency_evaluations(*)')
            .eq('student_id', studentId)
            .eq('grade_level', grade)
            .eq('academic_year', year)
            .maybeSingle();

        if (result) {
            setExistingResultId(result.result_id);
            setAttendancePercent(result.attendance_percent?.toString() || '');
            setLearnerActivities(result.learner_activities || 'ผ่าน');
            setDesirableChars(result.desirable_chars || 'ผ่าน');
            const levels = {};
            (result.student_yearly_competency_evaluations || []).forEach(ev => {
                levels[ev.competency_id] = ev.achieved_level;
            });
            setAchievedLevels(levels);
        } else {
            setExistingResultId(null);
            setAttendancePercent('');
            setLearnerActivities('ผ่าน');
            setDesirableChars('ผ่าน');
            setAchievedLevels({});
        }
    }, []);

    useEffect(() => {
        loadCompetencies(selectedGrade);
    }, [selectedGrade, loadCompetencies]);

    useEffect(() => {
        if (selectedStudent) {
            loadExistingResult(selectedStudent.student_id, selectedGrade, academicYear);
        }
    }, [selectedStudent, selectedGrade, academicYear, loadExistingResult]);

    // ─── Save results ────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!selectedStudent) { toast.error('กรุณาเลือกนักเรียนก่อน'); return; }
        setSaving(true);
        try {
            let resultId = existingResultId;

            const resultPayload = {
                school_id: currentUser.school_id,
                student_id: selectedStudent.student_id,
                academic_year: academicYear,
                grade_level: selectedGrade,
                attendance_percent: parseFloat(attendancePercent) || null,
                learner_activities: learnerActivities,
                desirable_chars: desirableChars,
            };

            if (existingResultId) {
                const { error } = await supabase.from('student_yearly_results').update(resultPayload).eq('result_id', existingResultId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('student_yearly_results').insert(resultPayload).select().single();
                if (error) throw error;
                resultId = data.result_id;
                setExistingResultId(resultId);
            }

            // Save evaluations per competency
            for (const comp of competencies) {
                const level = achievedLevels[comp.competency_id];
                if (!level) continue;
                await supabase.from('student_yearly_competency_evaluations').upsert(
                    { result_id: resultId, competency_id: comp.competency_id, achieved_level: level },
                    { onConflict: 'result_id,competency_id' }
                );
            }

            toast.success('บันทึกผลการเรียนสำเร็จ!');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // ─── Print ───────────────────────────────────────────────────────────
    const handlePrint = () => {
        if (!selectedStudent) { toast.error('กรุณาเลือกนักเรียนก่อน'); return; }
        window.print();
    };

    // ─── Render helpers ──────────────────────────────────────────────────
    const getBehaviorText = (competency_no, achieved_level) => {
        const t = behaviorTemplates.find(b =>
            b.competency_no === competency_no && b.competency_level === achieved_level
        );
        return t?.behavior_text || '—';
    };

    const gradeNames = {
        'ป.1': 'หนึ่ง', 'ป.2': 'สอง', 'ป.3': 'สาม',
        'ป.4': 'สี่', 'ป.5': 'ห้า', 'ป.6': 'หก'
    };

    const studentName = selectedStudent
        ? `${selectedStudent.prefix || ''}${selectedStudent.first_name} ${selectedStudent.last_name}`
        : '—';

    return (
        <Layout title="รายงานผลการเรียนรายบุคคล (ปพ.๖)">
            {/* ─── Print Styles ─────────────────────────────────────────── */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    .print-area { box-shadow: none !important; border: none !important; }
                }
            `}</style>

            <div className="max-w-6xl mx-auto px-4 py-8">

                {/* ─── Control Panel (no-print) ─────────────────────────── */}
                <div className="no-print space-y-6 mb-8">
                    <button onClick={() => navigate('/admin')} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors">
                        <ChevronLeft className="w-5 h-5" /> กลับหน้า Admin
                    </button>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                        <h2 className="text-xl font-extrabold text-slate-800 mb-5">⚙️ ตั้งค่ารายงาน</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {/* Student Search */}
                            <div className="md:col-span-1">
                                <label className="block text-sm font-bold text-slate-600 mb-2">ค้นหานักเรียน</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        placeholder="ชื่อ หรือ รหัส..."
                                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                </div>
                                {searchTerm && (
                                    <div className="mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto z-10 relative">
                                        {filteredStudents.length === 0 ? (
                                            <div className="px-4 py-3 text-sm text-slate-400">ไม่พบนักเรียน</div>
                                        ) : filteredStudents.map(s => (
                                            <button
                                                key={s.student_id}
                                                onClick={() => { setSelectedStudent(s); setSearchTerm(''); }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-medium transition-colors border-b border-slate-100 last:border-0"
                                            >
                                                {s.prefix}{s.first_name} {s.last_name}
                                                <span className="ml-2 text-slate-400 text-xs">{s.student_code}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {selectedStudent && (
                                    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                                        <span className="text-sm font-bold text-indigo-800">{studentName}</span>
                                        <button onClick={() => setSelectedStudent(null)} className="text-indigo-400 hover:text-red-500 transition-colors"><XCircle className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>

                            {/* Grade */}
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">ชั้นปี</label>
                                <select value={selectedGrade} onChange={e => setSelectedGrade(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                    {GRADE_LEVELS.map(g => <option key={g}>{g}</option>)}
                                </select>
                            </div>

                            {/* Academic Year */}
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">ปีการศึกษา</label>
                                <input type="number" value={academicYear} onChange={e => setAcademicYear(parseInt(e.target.value))}
                                    className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            </div>
                        </div>

                        {/* Attendance & Activities */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">การเข้าชั้นเรียน (%)</label>
                                <input type="number" min="0" max="100" value={attendancePercent}
                                    onChange={e => setAttendancePercent(e.target.value)}
                                    placeholder="เช่น 100"
                                    className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">กิจกรรมพัฒนาผู้เรียน</label>
                                <select value={learnerActivities} onChange={e => setLearnerActivities(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                    <option>ผ่าน</option><option>ไม่ผ่าน</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">คุณลักษณะอันพึงประสงค์</label>
                                <select value={desirableChars} onChange={e => setDesirableChars(e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                    <option>ผ่าน</option><option>ไม่ผ่าน</option>
                                </select>
                            </div>
                        </div>

                        {/* Competency Level Inputs */}
                        {loading ? (
                            <div className="flex justify-center py-8"><Loader className="w-6 h-6 animate-spin text-indigo-500" /></div>
                        ) : competencies.length === 0 ? (
                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700 font-medium">
                                ⚠️ ยังไม่มีข้อมูลความสามารถชั้นปีสำหรับ <strong>{selectedGrade}</strong> — กรุณานำเข้าข้อมูลในแท็บ "นำเข้าข้อมูล" ก่อนครับ
                            </div>
                        ) : (
                            <div>
                                <h3 className="font-extrabold text-slate-700 mb-3 text-sm">กำหนดระดับความสามารถที่นักเรียนได้รับ</h3>
                                <div className="space-y-2">
                                    {competencies.map((comp, i) => (
                                        <div key={comp.competency_id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                            <span className="text-xs font-extrabold text-slate-500 w-6 shrink-0">{i + 1}.</span>
                                            <p className="text-sm text-slate-700 flex-1 leading-snug">{comp.description}</p>
                                            <span className="text-xs text-slate-400 font-bold shrink-0">คาดหวัง: <span className="text-indigo-600">{comp.expected_level}</span></span>
                                            <select
                                                value={achievedLevels[comp.competency_id] || ''}
                                                onChange={e => setAchievedLevels(prev => ({ ...prev, [comp.competency_id]: e.target.value }))}
                                                className="border border-slate-300 rounded-lg py-1.5 px-2 text-xs font-bold shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                            >
                                                <option value="">-- เลือก --</option>
                                                {LEVELS.map(l => <option key={l}>{l}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-3 mt-6">
                            <button onClick={handleSave} disabled={saving || !selectedStudent}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-md">
                                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? 'กำลังบันทึก...' : 'บันทึกผลการเรียน'}
                            </button>
                            <button onClick={handlePrint} disabled={!selectedStudent || competencies.length === 0}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-md">
                                <Printer className="w-4 h-4" /> พิมพ์ ปพ.๖
                            </button>
                        </div>
                    </div>
                </div>

                {/* ─── Print Area (ปพ.6 Document) ──────────────────────── */}
                <div ref={printRef} className="print-area bg-white rounded-3xl border border-slate-200 shadow-sm p-8 font-['Sarabun',sans-serif]">
                    {!selectedStudent ? (
                        <div className="no-print text-center py-24 text-slate-400 font-medium">
                            กรุณาเลือกนักเรียนจากแผงด้านบนเพื่อแสดงตัวอย่าง ปพ.๖
                        </div>
                    ) : (
                        <>
                            {/* ─── Header ─────────────────────────────────── */}
                            <div className="text-center mb-6">
                                <h1 className="text-xl font-extrabold text-slate-900">
                                    แบบการรายงานผลการเรียนชั้นประถมศึกษาปีที่ {gradeNames[selectedGrade] || selectedGrade}
                                </h1>
                                <div className="flex justify-center gap-8 mt-3 text-base font-medium text-slate-700">
                                    <span>ชื่อ – สกุล <strong>{studentName}</strong></span>
                                    <span>การเข้าชั้นเรียน <strong>{attendancePercent || '—'}%</strong></span>
                                </div>
                            </div>

                            {/* ─── Table 1: Per-Year Results ───────────────── */}
                            <table className="w-full border-collapse text-sm mb-8" style={{ borderColor: '#000' }}>
                                <thead>
                                    <tr>
                                        <th className="border border-black p-3 bg-slate-100 text-left font-bold w-1/2">ความสามารถชั้นปี</th>
                                        <th className="border border-black p-3 bg-slate-100 text-center font-bold w-1/6">ระดับความสามารถที่คาดหวัง</th>
                                        <th className="border border-black p-3 bg-slate-100 text-center font-bold w-1/6">ระดับความสามารถที่ได้</th>
                                        <th className="border border-black p-3 bg-slate-100 text-center font-bold w-1/6">พัฒนาการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {competencies.map((comp, i) => {
                                        const achieved = achievedLevels[comp.competency_id] || '';
                                        const development = achieved ? compareLevels(achieved, comp.expected_level) : '—';
                                        const devColor = development === 'สูงกว่าเกณฑ์' ? 'text-emerald-700' : development === 'ตามเกณฑ์' ? 'text-blue-700' : development === 'เข้าใกล้เกณฑ์' ? 'text-amber-700' : 'text-slate-400';
                                        return (
                                            <tr key={comp.competency_id} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                                                <td className="border border-black p-3 leading-relaxed">
                                                    <span className="font-bold">{i + 1}.</span> {comp.description}
                                                </td>
                                                <td className="border border-black p-3 text-center font-medium">{comp.expected_level}</td>
                                                <td className="border border-black p-3 text-center font-bold">{achieved || '—'}</td>
                                                <td className={`border border-black p-3 text-center font-extrabold ${devColor}`}>
                                                    {development}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Activities & Desirable Chars rows */}
                                    <tr className="bg-slate-100">
                                        <td className="border border-black p-3 font-extrabold">กิจกรรมพัฒนาผู้เรียน</td>
                                        <td colSpan={3} className="border border-black p-3 text-center">
                                            <span className={`font-extrabold text-base ${learnerActivities === 'ผ่าน' ? 'text-emerald-700' : 'text-red-600'}`}>
                                                {learnerActivities === 'ผ่าน' ? '☑ ผ่าน' : '☑ ไม่ผ่าน'}
                                            </span>
                                        </td>
                                    </tr>
                                    <tr className="bg-slate-100">
                                        <td className="border border-black p-3 font-extrabold">คุณลักษณะอันพึงประสงค์</td>
                                        <td colSpan={3} className="border border-black p-3 text-center">
                                            <span className={`font-extrabold text-base ${desirableChars === 'ผ่าน' ? 'text-emerald-700' : 'text-red-600'}`}>
                                                {desirableChars === 'ผ่าน' ? '☑ ผ่าน' : '☑ ไม่ผ่าน'}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* ─── Table 2: Per-Competency Behavior Description ─ */}
                            {behaviorTemplates.length > 0 && (
                                <>
                                    <h2 className="text-base font-extrabold text-slate-800 mb-3">คำอธิบายพฤติกรรม</h2>
                                    <table className="w-full border-collapse text-sm mb-8" style={{ borderColor: '#000' }}>
                                        <thead>
                                            <tr>
                                                <th className="border border-black p-3 bg-slate-100 text-center font-bold w-24">ความสามารถข้อที่</th>
                                                <th className="border border-black p-3 bg-slate-100 text-center font-bold w-36">ระดับความสามารถที่ได้</th>
                                                <th className="border border-black p-3 bg-slate-100 text-left font-bold">พฤติกรรมของนักเรียน</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {competencies.map((comp, i) => {
                                                const achieved = achievedLevels[comp.competency_id] || '';
                                                const behavior = achieved ? getBehaviorText(comp.competency_no, achieved) : '—';
                                                return (
                                                    <tr key={comp.competency_id} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                                                        <td className="border border-black p-3 text-center font-bold">{comp.competency_no}</td>
                                                        <td className="border border-black p-3 text-center font-medium">{achieved || '—'}</td>
                                                        <td className="border border-black p-3 leading-relaxed">{behavior}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </>
                            )}

                            {/* ─── Signatures ─────────────────────────────── */}
                            <div className="flex justify-between mt-12 text-sm text-slate-700">
                                <div className="text-center">
                                    <div className="w-56 border-b border-slate-400 mb-1 mx-auto mt-8"></div>
                                    <p>(..................................................)</p>
                                    <p className="font-bold mt-1">ครูประจำชั้น</p>
                                </div>
                                <div className="text-center">
                                    <div className="w-56 border-b border-slate-400 mb-1 mx-auto mt-8"></div>
                                    <p>(..................................................)</p>
                                    <p className="font-bold mt-1">ผู้อำนวยการ</p>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </Layout>
    );
}
