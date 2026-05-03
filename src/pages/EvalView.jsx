import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { ChevronLeft, Save, FileText, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function EvalView() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    const [subject, setSubject] = useState(location.state?.subject || null);
    const [enrollments, setEnrollments] = useState([]);
    const [learningOutcomes, setLearningOutcomes] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [showMissingOnly, setShowMissingOnly] = useState(false);
    const [selectedRoom, setSelectedRoom] = useState('all');

    useEffect(() => {
        async function loadData() {
            try {
                if (!subject) {
                    const { data: sub } = await supabase.from('subjects').select('*').eq('subject_id', subjectId).single();
                    setSubject(sub);
                }

                const [{ data: enrolls }, { data: mappedLOs }] = await Promise.all([
                    supabase.from('student_enrollments')
                        .select(`
              enrollment_id, room, attendance_percent,
              users_students(student_id, student_code, prefix, first_name, last_name)
            `).eq('subject_id', subjectId),
                    supabase.from('subject_lo_mapping')
                        .select(`learning_outcomes(lo_id, lo_code, ability_no, lo_description)`)
                        .eq('subject_id', subjectId)
                ]);

                const formatLOs = mappedLOs?.map(item => item.learning_outcomes).sort((a, b) => a.ability_no - b.ability_no) || [];
                setLearningOutcomes(formatLOs);

                let formatEnrolls = enrolls || [];
                // sort by student code
                formatEnrolls.sort((a, b) => (a.users_students?.student_code || '').localeCompare(b.users_students?.student_code || ''));
                setEnrollments(formatEnrolls);

                const enrollIds = formatEnrolls.map(e => e.enrollment_id);

                if (enrollIds.length > 0) {
                    const { data: evals } = await supabase
                        .from('lo_evaluations')
                        .select('*')
                        .in('enrollment_id', enrollIds);
                    setEvaluations(evals || []);
                }

                // Track attendance state separately for easy upsert
                const initialAtt = {};
                formatEnrolls.forEach(e => {
                    initialAtt[e.enrollment_id] = e.attendance_percent ?? 100;
                });
                setAttendance(initialAtt);

            } catch (err) {
                toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [subjectId, subject]);

    // Warn before closing browser tab if there are unsaved changes
    useEffect(() => {
        const handler = (e) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);

    // Auto-save: debounced 30 seconds after last change
    const autoSaveTimerRef = useRef(null);
    const autoSaveCountdownRef = useRef(null);
    const [autoSaveIn, setAutoSaveIn] = useState(null);

    useEffect(() => {
        if (isDirty && !saving) {
            // Clear previous timers
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            if (autoSaveCountdownRef.current) clearInterval(autoSaveCountdownRef.current);

            let secondsLeft = 30;
            setAutoSaveIn(secondsLeft);

            autoSaveCountdownRef.current = setInterval(() => {
                secondsLeft -= 1;
                setAutoSaveIn(secondsLeft);
                if (secondsLeft <= 0) {
                    clearInterval(autoSaveCountdownRef.current);
                }
            }, 1000);

            autoSaveTimerRef.current = setTimeout(() => {
                saveEvaluations();
            }, 30000);
        } else {
            setAutoSaveIn(null);
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            if (autoSaveCountdownRef.current) clearInterval(autoSaveCountdownRef.current);
        }

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            if (autoSaveCountdownRef.current) clearInterval(autoSaveCountdownRef.current);
        };
    }, [isDirty, saving]);

    const [attendance, setAttendance] = useState({});

    const handleAttendanceChange = (enrollmentId, val) => {
        let num = parseFloat(val);
        if (isNaN(num)) num = 0;
        if (num < 0) num = 0;
        if (num > 100) num = 100;
        setAttendance(prev => ({ ...prev, [enrollmentId]: num }));
        setIsDirty(true);
    };

    const handleLevelChange = (enrollmentId, loId, newLevel) => {
        setEvaluations(prev => {
            const existing = prev.find(e => e.enrollment_id === enrollmentId && e.lo_id === loId);
            if (existing) {
                return prev.map(e => e.enrollment_id === enrollmentId && e.lo_id === loId ? { ...e, competency_level: newLevel } : e);
            } else {
                return [...prev, { evaluation_id: crypto.randomUUID(), enrollment_id: enrollmentId, lo_id: loId, competency_level: newLevel, evaluated_by: currentUser.teacher_id }];
            }
        });
        setIsDirty(true);
    };

    const saveEvaluations = async () => {
        setSaving(true);
        try {
            // Updated to also save attendance. Upserting both is possible, but attendance is on student_enrollments

            // 1. Save Evaluations
            if (evaluations.length > 0) {
                const { error: evalErr } = await supabase
                    .from('lo_evaluations')
                    .upsert(evaluations, { onConflict: 'enrollment_id,lo_id' });
                if (evalErr) throw evalErr;
            }

            // 2. Save Attendance
            const attUpdates = Object.keys(attendance).map(eId => ({
                enrollment_id: eId,
                attendance_percent: attendance[eId]
            }));

            if (attUpdates.length > 0) {
                const { error: attErr } = await supabase
                    .from('student_enrollments')
                    .upsert(attUpdates, { onConflict: 'enrollment_id' });
                if (attErr) throw attErr;
            }

            setIsDirty(false);
            setLastSaved(new Date());
            toast.success('บันทึกผลการประเมินและเวลาเรียนสำเร็จ!');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const getSelectColor = (val) => {
        if (!val) return 'border-slate-300 text-slate-500 bg-white placeholder-slate-400';
        if (val === 'N/A') return 'border-slate-300 bg-slate-100 text-slate-500 font-bold';
        if (val === 'เริ่มต้น') return 'border-red-300 bg-red-50 text-red-700 font-bold';
        if (val === 'พัฒนา') return 'border-orange-300 bg-orange-50 text-orange-700 font-bold';
        if (val === 'ชำนาญ') return 'border-blue-300 bg-blue-50 text-blue-700 font-bold';
        if (val === 'เชี่ยวชาญ') return 'border-green-300 bg-green-50 text-green-700 font-bold';
        return '';
    };

    const getSubjectResult = (enrollmentId) => {
        if (learningOutcomes.length === 0) return null;
        const studentEvals = evaluations.filter(e => e.enrollment_id === enrollmentId);
        
        // Count how many LOs are evaluated as "พัฒนา" or higher
        const passedLevels = ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'];
        const passedCount = studentEvals.filter(e => passedLevels.includes(e.competency_level)).length;
        const passPercent = (passedCount / learningOutcomes.length) * 100;

        // If not fully evaluated, return pending
        const isFullyEvaluated = studentEvals.length === learningOutcomes.length && !studentEvals.some(e => !e.competency_level || e.competency_level === '');
        if (!isFullyEvaluated) return { status: 'pending', text: 'รอประเมิน' };

        return passPercent >= 80 
            ? { status: 'pass', text: 'ผ่าน', percent: passPercent } 
            : { status: 'fail', text: 'ไม่ผ่าน', percent: passPercent };
    };

    const totalCells = enrollments.length * learningOutcomes.length;
    const filledCells = evaluations.filter(e => e.competency_level && e.competency_level !== '').length;
    const missingCount = totalCells - filledCells;

    let displayedEnrollments = showMissingOnly
        ? enrollments.filter(enroll => {
            const studentEvals = evaluations.filter(e => e.enrollment_id === enroll.enrollment_id && e.competency_level && e.competency_level !== '');
            return studentEvals.length < learningOutcomes.length;
        })
        : enrollments;

    if (selectedRoom !== 'all') {
        displayedEnrollments = displayedEnrollments.filter(e => e.room === selectedRoom);
    }

    const uniqueRooms = [...new Set(enrollments.map(e => e.room).filter(Boolean))].sort();

    // Warn if navigating away with unsaved changes
    const handleBack = () => {
        if (isDirty) {
            if (window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก\nต้องการออกจากหน้านี้โดยไม่บันทึกใช่ไหม?')) {
                navigate(-1);
            }
        } else {
            navigate(-1);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <button
                            onClick={handleBack}
                            className="text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded-xl transition-colors flex items-center"
                        >
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span className="font-semibold text-sm">กลับ</span>
                        </button>
                        <div className="hidden sm:block w-px h-6 bg-slate-300"></div>
                        <h1 className="font-bold text-lg text-slate-800 truncate">
                            {subject ? subject.subject_name : 'กำลังโหลด...'}
                        </h1>
                    </div>
                    {/* Auto-save / Save state indicator */}
                    <div className="flex items-center gap-3">
                        {isDirty && !saving && (
                            <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                                <Clock className="w-3.5 h-3.5" />
                                {autoSaveIn !== null ? `บันทึกอัตโนมัติใน ${autoSaveIn}s` : 'มีการเปลี่ยนแปลง'}
                            </span>
                        )}
                        {!isDirty && lastSaved && (
                            <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-xl">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                บันทึกแล้วเมื่อ {lastSaved.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                        <button
                            onClick={saveEvaluations}
                            disabled={saving || !isDirty}
                            className={`px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center ${
                                isDirty
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30'
                                    : 'bg-slate-100 text-slate-400 cursor-default'
                            } disabled:opacity-50`}
                        >
                            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            {saving ? 'กำลังบันทึก...' : 'บันทึกผล'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-grow max-w-[1600px] mx-auto w-full px-4 sm:px-6 py-8">
                {loading ? (
                    <div className="py-20 flex justify-center"><div className="loader"></div></div>
                ) : enrollments.length === 0 ? (
                    <div className="text-center bg-white rounded-3xl p-16 border border-slate-200 mt-10 shadow-sm max-w-2xl mx-auto">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="text-xl font-bold text-slate-700">ไม่มีนักเรียนในรายวิชานี้</p>
                        <p className="text-slate-500 mt-2">โปรดแจ้งฝ่ายวิชาการเพื่อเพิ่มรายชื่อนักเรียนก่อนประเมิน LO</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        {/* Toolbar above table */}
                        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="text-sm font-bold text-slate-700">
                                    ความคืบหน้า: <span className={missingCount === 0 ? "text-emerald-600" : "text-amber-600"}>{filledCells}/{totalCells}</span>
                                </div>
                                {missingCount > 0 && (
                                    <button
                                        onClick={() => setShowMissingOnly(!showMissingOnly)}
                                        className={`text-sm px-3 py-1.5 rounded-lg border font-bold flex items-center transition-all ${
                                            showMissingOnly 
                                            ? 'bg-amber-100 text-amber-800 border-amber-300' 
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                                        }`}
                                    >
                                        <AlertCircle className="w-4 h-4 mr-1.5" />
                                        {showMissingOnly ? 'ดูนักเรียนทั้งหมด' : `ช่องที่ยังไม่ประเมิน (${missingCount})`}
                                    </button>
                                )}
                                {uniqueRooms.length > 0 && (
                                    <select
                                        value={selectedRoom}
                                        onChange={(e) => setSelectedRoom(e.target.value)}
                                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 font-bold bg-white text-slate-700 outline-none focus:ring-2 focus:ring-indigo-400"
                                    >
                                        <option value="all">แสดงทุกห้อง ({enrollments.length} คน)</option>
                                        {uniqueRooms.map(room => {
                                            const count = enrollments.filter(e => e.room === room).length;
                                            return <option key={room} value={room}>{room} ({count} คน)</option>;
                                        })}
                                    </select>
                                )}
                            </div>
                            <div className="text-xs font-semibold text-slate-500">
                                เกณฑ์ผ่านรายวิชา: ได้ระดับ "พัฒนา" ขึ้นไป ≥ 80%
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left divide-y divide-slate-200 whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-600">
                                    <tr>
                                        <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider w-16 sticky left-0 bg-slate-50 z-20">เลขที่</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider w-24 sticky left-[110px] bg-slate-50 z-20">รหัส</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider min-w-[200px] sticky left-[190px] bg-slate-50 z-20 border-r border-slate-200 shadow-[10px_0_10px_-10px_rgba(0,0,0,0.05)]">ชื่อ-นามสกุล</th>
                                        <th className="px-4 py-4 text-center text-xs font-bold uppercase tracking-wider w-24 border-r border-slate-200">เวลาเรียน (%)</th>
                                        {learningOutcomes.map(lo => (
                                            <th key={lo.lo_id} className="px-4 py-4 text-center text-xs font-bold text-indigo-900 uppercase min-w-[140px] bg-indigo-50/50" title={lo.lo_description}>
                                                <div>{lo.lo_code ? lo.lo_code : `LO ข้อ ${lo.ability_no}`}</div>
                                                {lo.lo_code && <div className="text-[10px] text-indigo-500 font-medium mt-1">ข้อ {lo.ability_no}</div>}
                                            </th>
                                        ))}
                                        <th className="px-4 py-4 text-center text-xs font-bold uppercase tracking-wider w-24 border-l border-slate-200 sticky right-0 bg-slate-50 shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.05)] z-20">สรุปผลวิชา</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {displayedEnrollments.map((enroll, i) => {
                                        const st = enroll.users_students;
                                        return (
                                            <tr key={enroll.enrollment_id} className="hover:bg-slate-50/80 transition-colors group">
                                                <td className="px-6 py-3 text-center text-sm font-semibold text-slate-500 sticky left-0 bg-white group-hover:bg-slate-50/80">{i + 1}</td>
                                                <td className="px-6 py-3 text-sm text-slate-600 font-mono sticky left-[110px] bg-white group-hover:bg-slate-50/80">{st.student_code}</td>
                                                <td className="px-6 py-2 text-sm font-bold text-slate-800 border-r border-slate-100 sticky left-[190px] bg-white shadow-[10px_0_10px_-10px_rgba(0,0,0,0.05)] group-hover:bg-slate-50/80">
                                                    {st.prefix || ''}{st.first_name} {st.last_name}
                                                </td>
                                                <td className="px-4 py-2 text-center border-r border-slate-100 bg-slate-50/50">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="100"
                                                        value={attendance[enroll.enrollment_id] ?? 100}
                                                        onChange={(e) => handleAttendanceChange(enroll.enrollment_id, e.target.value)}
                                                        className="w-16 px-2 py-1.5 text-center text-sm font-bold rounded-lg border border-slate-200 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
                                                    />
                                                </td>
                                                {learningOutcomes.map(lo => {
                                                    const ev = evaluations.find(e => e.enrollment_id === enroll.enrollment_id && e.lo_id === lo.lo_id);
                                                    const val = ev?.competency_level || '';
                                                    return (
                                                        <td key={lo.lo_id} className="px-2 py-2 text-center">
                                                            <select
                                                                value={val}
                                                                onChange={(e) => handleLevelChange(enroll.enrollment_id, lo.lo_id, e.target.value)}
                                                                className={`block w-full px-3 py-2 text-sm border-2 rounded-xl focus:ring-offset-1 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all outline-none cursor-pointer ${getSelectColor(val)} hover:border-slate-400`}
                                                            >
                                                                <option value="" disabled className="text-slate-400">- เลือก -</option>
                                                                <option value="เริ่มต้น">เริ่มต้น</option>
                                                                <option value="พัฒนา">พัฒนา</option>
                                                                <option value="ชำนาญ">ชำนาญ</option>
                                                                <option value="เชี่ยวชาญ">เชี่ยวชาญ</option>
                                                                <option value="N/A">N/A (ข้าม)</option>
                                                            </select>
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-4 py-2 text-center border-l border-slate-100 sticky right-0 bg-white shadow-[-10px_0_10px_-10px_rgba(0,0,0,0.05)] group-hover:bg-slate-50/80">
                                                    {(() => {
                                                        const res = getSubjectResult(enroll.enrollment_id);
                                                        if (!res) return null;
                                                        if (res.status === 'pending') return <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md">{res.text}</span>;
                                                        if (res.status === 'pass') return <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200" title={`ผ่านเกณฑ์ ${res.percent.toFixed(0)}%`}>✅ {res.text}</span>;
                                                        if (res.status === 'fail') return <span className="text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-md border border-red-200" title={`ได้ ${res.percent.toFixed(0)}% (ไม่ถึง 80%)`}>❌ {res.text}</span>;
                                                    })()}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
