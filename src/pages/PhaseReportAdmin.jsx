import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { Search, Printer, Save, ChevronLeft, XCircle, Loader, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Level ordering ──────────────────────────────────────────────────────────
const LEVEL_ORDER = { 'เริ่มต้น': 1, 'พัฒนา': 2, 'ชำนาญ': 3, 'เชี่ยวชาญ': 4 };
const LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'];

function compareLevels(achieved, expected) {
    const a = LEVEL_ORDER[achieved] ?? 0;
    const e = LEVEL_ORDER[expected] ?? 0;
    if (!a || !e) return '—';
    if (a > e) return 'สูงกว่าเกณฑ์';
    if (a === e) return 'ตามเกณฑ์';
    return 'เข้าใกล้เกณฑ์';
}

// ─── Fixed Phase Structure (curriculum-defined) ───────────────────────────────
const PHASE_CONFIG = {
    'ตอนต้น': {
        label: 'ประถมศึกษาตอนต้น (ป.1 – ป.3)',
        groups: [
            {
                groupName: 'ความสามารถพื้นฐานด้านการเรียนรู้',
                abilities: [
                    { key: 'reading', name: 'การอ่าน', expected: 'ชำนาญ' },
                    { key: 'writing', name: 'การเขียน', expected: 'ชำนาญ' },
                    { key: 'math', name: 'การคิดคำนวณ', expected: 'ชำนาญ' },
                ]
            },
            {
                groupName: null,
                abilities: [
                    { key: 'applied', name: 'ความสามารถในการประยุกต์ใช้ในชีวิตประจำวัน', expected: 'พัฒนา' },
                ]
            },
        ]
    },
    'ตอนปลาย': {
        label: 'ประถมศึกษาตอนปลาย (ป.4 – ป.6)',
        groups: [
            {
                groupName: null,
                abilities: [
                    { key: 'language', name: 'ความสามารถด้านภาษาและการสื่อสาร', expected: 'ชำนาญ' },
                    { key: 'math', name: 'ความสามารถด้านคณิตศาสตร์', expected: 'ชำนาญ' },
                    { key: 'science', name: 'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อมและเทคโนโลยี', expected: 'พัฒนา' },
                    { key: 'social', name: 'ความสามารถด้านสังคมและความเป็นพลเมือง', expected: 'พัฒนา' },
                    { key: 'economics', name: 'ความสามารถด้านเศรษฐกิจและการเงิน', expected: 'พัฒนา' },
                    { key: 'health', name: 'ความสามารถด้านสุขภาพกายและสุขภาวะจิต', expected: 'พัฒนา' },
                    { key: 'arts', name: 'ความสามารถด้านศิลปะและสุนทรียภาพ', expected: 'พัฒนา' },
                ]
            },
        ]
    }
};

const ALL_ABILITIES = (phase) =>
    (PHASE_CONFIG[phase]?.groups || []).flatMap(g => g.abilities);

const CURRENT_YEAR = 2567;

export default function PhaseReportAdmin() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    // ─── State ──────────────────────────────────────────────────────────────
    const [searchTerm, setSearchTerm] = useState('');
    const [allStudents, setAllStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [selectedPhase, setSelectedPhase] = useState('ตอนต้น');
    const [academicYear, setAcademicYear] = useState(CURRENT_YEAR);
    const [saving, setSaving] = useState(false);
    const [existingResultId, setExistingResultId] = useState(null);

    // Result state
    const [achievedLevels, setAchievedLevels] = useState({});
    const [learnerActivities, setLearnerActivities] = useState('ผ่าน');
    const [desirableChars, setDesirableChars] = useState('ผ่าน');

    // Central behaviors from DB (สพฐ.)
    const [centralBehaviors, setCentralBehaviors] = useState([]);
    const [loadingBehaviors, setLoadingBehaviors] = useState(false);

    // ─── Load students ───────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            const { data } = await supabase
                .from('users_students')
                .select('student_id, prefix, first_name, last_name, student_code')
                .eq('school_id', currentUser.school_id)
                .order('student_code');
            setAllStudents(data || []);
        };
        load();
    }, [currentUser.school_id]);

    const filteredStudents = allStudents.filter(s => {
        const q = searchTerm.toLowerCase();
        return s.first_name?.toLowerCase().includes(q) ||
            s.last_name?.toLowerCase().includes(q) ||
            s.student_code?.includes(q);
    });

    // ─── Load central behaviors (สพฐ.) ──────────────────────────────────────
    const loadBehaviors = useCallback(async (phase) => {
        setLoadingBehaviors(true);
        const { data } = await supabase
            .from('central_phase_behaviors')
            .select('*')
            .eq('phase', phase);
        setCentralBehaviors(data || []);
        setLoadingBehaviors(false);
    }, []);

    useEffect(() => { loadBehaviors(selectedPhase); }, [selectedPhase, loadBehaviors]);

    // ─── Load existing results ───────────────────────────────────────────────
    const loadResult = useCallback(async (studentId, phase, year) => {
        const { data } = await supabase
            .from('phase_completion_results')
            .select('*')
            .eq('student_id', studentId)
            .eq('phase', phase)
            .eq('academic_year', year)
            .maybeSingle();

        if (data) {
            setExistingResultId(data.result_id);
            setAchievedLevels(data.ability_levels || {});
            setLearnerActivities(data.learner_activities || 'ผ่าน');
            setDesirableChars(data.desirable_chars || 'ผ่าน');
        } else {
            setExistingResultId(null);
            setAchievedLevels({});
            setLearnerActivities('ผ่าน');
            setDesirableChars('ผ่าน');
        }
    }, []);

    useEffect(() => {
        if (selectedStudent) {
            loadResult(selectedStudent.student_id, selectedPhase, academicYear);
        }
    }, [selectedStudent, selectedPhase, academicYear, loadResult]);

    // ─── Handle phase change: reset data ────────────────────────────────────
    const handlePhaseChange = (phase) => {
        setSelectedPhase(phase);
        setAchievedLevels({});
    };

    // ─── Save ────────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!selectedStudent) { toast.error('กรุณาเลือกนักเรียนก่อน'); return; }
        setSaving(true);
        try {
            const payload = {
                school_id: currentUser.school_id,
                student_id: selectedStudent.student_id,
                academic_year: academicYear,
                phase: selectedPhase,
                ability_levels: achievedLevels,
                learner_activities: learnerActivities,
                desirable_chars: desirableChars,
            };

            if (existingResultId) {
                const { error } = await supabase.from('phase_completion_results').update(payload).eq('result_id', existingResultId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from('phase_completion_results').insert(payload).select().single();
                if (error) throw error;
                setExistingResultId(data.result_id);
            }
            toast.success('บันทึกผลจบช่วงชั้นสำเร็จ!');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // ─── Helpers ─────────────────────────────────────────────────────────────
    const getBehavior = (abilityKey, achievedLevel) => {
        const b = centralBehaviors.find(x => x.ability_key === abilityKey && x.competency_level === achievedLevel);
        return b?.behavior_text || null;
    };

    const studentPrefix = selectedStudent?.prefix || '';
    const studentFullName = selectedStudent
        ? `${studentPrefix}${selectedStudent.first_name} ${selectedStudent.last_name}`
        : '—';

    const phaseConfig = PHASE_CONFIG[selectedPhase];
    const allAbilities = ALL_ABILITIES(selectedPhase);
    const hasBehaviors = centralBehaviors.length > 0;

    const devColor = (dev) => ({
        'สูงกว่าเกณฑ์': 'text-emerald-700',
        'ตามเกณฑ์': 'text-blue-700',
        'เข้าใกล้เกณฑ์': 'text-amber-700',
    }[dev] || 'text-slate-400');

    return (
        <Layout title="รายงานผลการเรียนเมื่อจบช่วงชั้น">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; }
                    .print-doc { box-shadow: none !important; margin: 0 !important; }
                }
                @page { margin: 1.5cm; }
            `}</style>

            <div className="max-w-6xl mx-auto px-4 py-8">

                {/* ─── Control Panel ─────────────────────────────────────────── */}
                <div className="no-print space-y-6 mb-8">
                    <button onClick={() => navigate('/admin')}
                        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors">
                        <ChevronLeft className="w-5 h-5" /> กลับหน้า Admin
                    </button>

                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
                        <h2 className="text-xl font-extrabold text-slate-800 mb-5">⚙️ ตั้งค่ารายงานจบช่วงชั้น</h2>

                        {/* Phase Selector */}
                        <div className="flex gap-3 mb-6">
                            {['ตอนต้น', 'ตอนปลาย'].map(p => (
                                <button key={p} onClick={() => handlePhaseChange(p)}
                                    className={`flex-1 py-3 px-6 rounded-2xl font-extrabold text-sm border-2 transition-all ${selectedPhase === p
                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}>
                                    ช่วงชั้น{p}
                                    <span className={`block text-xs font-medium mt-0.5 ${selectedPhase === p ? 'text-indigo-200' : 'text-slate-400'}`}>
                                        {p === 'ตอนต้น' ? 'ป.1 – ป.3' : 'ป.4 – ป.6'}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {/* Student Search */}
                            <div className="md:col-span-1 relative">
                                <label className="block text-sm font-bold text-slate-600 mb-2">ค้นหานักเรียน</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                        placeholder="ชื่อ หรือ รหัส..."
                                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                                </div>
                                {searchTerm && (
                                    <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto z-20">
                                        {filteredStudents.length === 0
                                            ? <div className="px-4 py-3 text-sm text-slate-400">ไม่พบนักเรียน</div>
                                            : filteredStudents.map(s => (
                                                <button key={s.student_id}
                                                    onClick={() => { setSelectedStudent(s); setSearchTerm(''); }}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-medium transition-colors border-b border-slate-100 last:border-0">
                                                    {s.prefix}{s.first_name} {s.last_name}
                                                    <span className="ml-2 text-slate-400 text-xs">{s.student_code}</span>
                                                </button>
                                            ))
                                        }
                                    </div>
                                )}
                                {selectedStudent && (
                                    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
                                        <span className="text-sm font-bold text-indigo-800">{studentFullName}</span>
                                        <button onClick={() => setSelectedStudent(null)} className="text-indigo-400 hover:text-red-500"><XCircle className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>

                            {/* Academic Year */}
                            <div>
                                <label className="block text-sm font-bold text-slate-600 mb-2">ปีการศึกษา</label>
                                <input type="number" value={academicYear} onChange={e => setAcademicYear(parseInt(e.target.value))}
                                    className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            </div>
                        </div>

                        {/* ─── Ability Level Inputs ─── */}
                        <div className="mb-5">
                            <h3 className="font-extrabold text-slate-700 mb-3 text-sm">ระดับความสามารถที่นักเรียนได้รับ</h3>
                            <div className="space-y-2">
                                {allAbilities.map(ab => (
                                    <div key={ab.key} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                                        <p className="text-sm text-slate-700 flex-1 font-medium">{ab.name}</p>
                                        <span className="text-xs text-slate-400 font-bold shrink-0">คาดหวัง: <span className="text-indigo-600">{ab.expected}</span></span>
                                        <select
                                            value={achievedLevels[ab.key] || ''}
                                            onChange={e => setAchievedLevels(prev => ({ ...prev, [ab.key]: e.target.value }))}
                                            className="border border-slate-300 rounded-lg py-1.5 px-2 text-xs font-bold shrink-0 focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                            <option value="">-- เลือก --</option>
                                            {LEVELS.map(l => <option key={l}>{l}</option>)}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Activities & Desirable chars */}
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            {[
                                { label: 'กิจกรรมพัฒนาผู้เรียน', val: learnerActivities, set: setLearnerActivities },
                                { label: 'คุณลักษณะอันพึงประสงค์', val: desirableChars, set: setDesirableChars },
                            ].map(({ label, val, set }) => (
                                <div key={label}>
                                    <label className="block text-sm font-bold text-slate-600 mb-2">{label}</label>
                                    <select value={val} onChange={e => set(e.target.value)}
                                        className="w-full border border-slate-200 rounded-xl py-3 px-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400">
                                        <option>ผ่าน</option><option>ไม่ผ่าน</option>
                                    </select>
                                </div>
                            ))}
                        </div>

                        {!hasBehaviors && !loadingBehaviors && (
                            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700 font-medium mb-4">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                ยังไม่มีข้อมูลคำอธิบายพฤติกรรม — กรุณานำเข้าข้อมูลจาก สพฐ. ผ่าน SQL เพื่อให้ตารางพฤติกรรมแสดงผล
                            </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-3">
                            <button onClick={handleSave} disabled={saving || !selectedStudent}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-md">
                                {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? 'กำลังบันทึก...' : 'บันทึกผลจบช่วงชั้น'}
                            </button>
                            <button onClick={() => { if (!selectedStudent) { toast.error('กรุณาเลือกนักเรียนก่อน'); return; } window.print(); }}
                                disabled={!selectedStudent}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-6 py-3 rounded-2xl font-bold text-sm transition-all shadow-md">
                                <Printer className="w-4 h-4" /> พิมพ์รายงานจบช่วงชั้น
                            </button>
                        </div>
                    </div>
                </div>

                {/* ─── Print Document ──────────────────────────────────── */}
                <div className="print-doc bg-white rounded-3xl border border-slate-200 shadow-sm p-8">
                    {!selectedStudent ? (
                        <div className="no-print text-center py-24 text-slate-400 font-medium">
                            เลือกนักเรียนเพื่อแสดงตัวอย่างเอกสาร
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="text-center mb-6">
                                <h1 className="text-xl font-extrabold text-slate-900">
                                    แบบการรายงานผลการเรียนระดับ{phaseConfig.label}
                                </h1>
                                <div className="flex justify-center gap-10 mt-2 text-base font-medium text-slate-700">
                                    <span>ชื่อ – สกุล <strong>{studentFullName}</strong></span>
                                </div>
                            </div>

                            {/* ─── Table 1: Phase Results ───── */}
                            <table className="w-full border-collapse text-sm mb-8">
                                <thead>
                                    <tr>
                                        <th className="border border-black p-3 bg-slate-100 text-left font-bold" style={{ width: '50%' }}>ความสามารถ/กิจกรรม</th>
                                        <th className="border border-black p-3 bg-slate-100 text-center font-bold" style={{ width: '25%' }}>ระดับความสามารถที่คาดหวัง</th>
                                        <th className="border border-black p-3 bg-slate-100 text-center font-bold" style={{ width: '25%' }}>ระดับความสามารถที่ได้</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {phaseConfig.groups.map((group, gi) => (
                                        group.abilities.map((ab, ai) => {
                                            const achieved = achievedLevels[ab.key] || '';
                                            return (
                                                <tr key={ab.key}>
                                                    {/* Group cell — only shown for first row of group */}
                                                    {group.groupName && ai === 0 && (
                                                        <td className="border border-black p-3 font-medium align-top leading-relaxed" rowSpan={group.abilities.length}>
                                                            {group.groupName}
                                                            <div className="mt-1 pl-2 text-slate-500 text-xs">{ab.name}</div>
                                                        </td>
                                                    )}
                                                    {group.groupName && ai > 0 && (
                                                        <td className="border border-black p-3 pl-5 text-slate-600">{ab.name}</td>
                                                    )}
                                                    {!group.groupName && (
                                                        <td className="border border-black p-3 font-medium leading-relaxed">{ab.name}</td>
                                                    )}
                                                    <td className="border border-black p-3 text-center font-medium">{ab.expected}</td>
                                                    <td className="border border-black p-3 text-center font-bold">{achieved || '—'}</td>
                                                </tr>
                                            );
                                        })
                                    ))}

                                    {/* Activities */}
                                    <tr className="bg-slate-50">
                                        <td className="border border-black p-3 font-extrabold">กิจกรรมพัฒนาผู้เรียน</td>
                                        <td className="border border-black p-3 text-center">
                                            <span className="text-sm">☑ ผ่าน &nbsp; □ ไม่ผ่าน</span>
                                        </td>
                                        <td className={`border border-black p-3 text-center font-extrabold ${learnerActivities === 'ผ่าน' ? 'text-emerald-700' : 'text-red-600'}`}>
                                            {learnerActivities === 'ผ่าน' ? '☑ ผ่าน' : '☑ ไม่ผ่าน'}
                                        </td>
                                    </tr>
                                    <tr className="bg-slate-50">
                                        <td className="border border-black p-3 font-extrabold">คุณลักษณะอันพึงประสงค์</td>
                                        <td className="border border-black p-3 text-center">
                                            <span className="text-sm">☑ ผ่าน &nbsp; □ ไม่ผ่าน</span>
                                        </td>
                                        <td className={`border border-black p-3 text-center font-extrabold ${desirableChars === 'ผ่าน' ? 'text-emerald-700' : 'text-red-600'}`}>
                                            {desirableChars === 'ผ่าน' ? '☑ ผ่าน' : '☑ ไม่ผ่าน'}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Signatures */}
                            <div className="flex justify-between mt-8 mb-10 text-sm text-slate-700">
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

                            {/* ─── Table 2: Behavior Descriptions (สพฐ. central data) ─── */}
                            {hasBehaviors && (
                                <>
                                    <h2 className="text-base font-extrabold text-slate-800 mb-3">คำอธิบายพฤติกรรม</h2>
                                    <table className="w-full border-collapse text-sm">
                                        <thead>
                                            <tr>
                                                <th className="border border-black p-3 bg-slate-100 text-left font-bold w-40">ความสามารถ</th>
                                                <th className="border border-black p-3 bg-slate-100 text-center font-bold w-36">ระดับความสามารถที่ได้</th>
                                                <th className="border border-black p-3 bg-slate-100 text-left font-bold">พฤติกรรมของนักเรียน</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allAbilities.map((ab, i) => {
                                                const achieved = achievedLevels[ab.key] || '';
                                                const behavior = achieved ? getBehavior(ab.key, achieved) : null;
                                                return (
                                                    <tr key={ab.key} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                                                        <td className="border border-black p-3 font-medium leading-snug">{ab.name}</td>
                                                        <td className="border border-black p-3 text-center font-bold">{achieved || '—'}</td>
                                                        <td className="border border-black p-3 leading-relaxed">
                                                            {behavior
                                                                ? <span><strong>{studentFullName}</strong> {behavior}</span>
                                                                : <span className="text-slate-400 text-xs">{achieved ? '(ยังไม่มีข้อมูลพฤติกรรมสำหรับระดับนี้)' : '—'}</span>
                                                            }
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Layout>
    );
}
