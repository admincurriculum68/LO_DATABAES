
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { Search, ChevronLeft, BookOpen, Printer, Star, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function HomeroomView() {
    const navigate = useNavigate();
    const [room, setRoom] = useState('');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState(null);
    const [selectedLo, setSelectedLo] = useState('');
    const [availableRooms, setAvailableRooms] = useState([]);

    // Activity Evaluation States
    const [activeTab, setActiveTab] = useState('academic');
    const [activityData, setActivityData] = useState({});
    const [savingActivity, setSavingActivity] = useState(false);
    const [currentContext, setCurrentContext] = useState(null);

    const { currentUser } = useAuth();

    useEffect(() => {
        async function fetchRooms() {
            try {
                // If it's an admin or executive, maybe allow all?
                // But request says "ควรเป็นห้องตัวเอง เป็นครูประจำชั้นเท่านั้น"
                if (currentUser && currentUser.homeroom) {
                    setAvailableRooms([currentUser.homeroom]);
                    setRoom(currentUser.homeroom);
                } else {
                    setAvailableRooms([]);
                }
            } catch (err) {
                console.error("Error fetching available rooms:", err);
            }
        }
        fetchRooms();
    }, [currentUser]);

    const searchHomeroom = async (e) => {
        e.preventDefault();
        if (!room.trim()) {
            toast.error('กรุณาระบุชื่อห้องเรียน');
            return;
        }
        setLoading(true);
        setData(null);

        try {
            const { data: enrollments, error: enrollErr } = await supabase
                .from('student_enrollments')
                .select(`
enrollment_id, room, student_id, subject_id,
    users_students(student_code, prefix, first_name, last_name),
    subjects(subject_code, subject_name)
        `)
                .eq('room', room.trim());

            if (enrollErr) throw enrollErr;
            if (!enrollments || enrollments.length === 0) {
                toast.error('ไม่พบข้อมูลนักเรียนและการลงทะเบียนในห้องนี้');
                return;
            }

            const subjectIds = [...new Set(enrollments.map(e => e.subject_id))];
            const enrollmentIds = enrollments.map(e => e.enrollment_id);
            const studentIds = [...new Set(enrollments.map(e => e.student_id))];

            const [{ data: loData }, { data: evalData }] = await Promise.all([
                supabase.from('subject_lo_mapping')
                    .select('subject_id, learning_outcomes(lo_id, lo_code, ability_no, lo_description)')
                    .in('subject_id', subjectIds),
                supabase.from('lo_evaluations')
                    .select('enrollment_id, lo_id, competency_level')
                    .in('enrollment_id', enrollmentIds)
            ]);

            // Deduce year and semester
            const subjectsInfo = enrollments.map(e => e.subjects).filter(Boolean);
            const repYear = subjectsInfo[0]?.academic_year || new Date().getFullYear() + 543;
            const repSem = subjectsInfo[0]?.semester || 1;
            setCurrentContext({ year: repYear, semester: repSem });

            // Fetch activity evaluations
            const { data: actData } = await supabase
                .from('student_year_evaluations')
                .select('*')
                .eq('academic_year', repYear)
                .eq('semester', repSem)
                .in('student_id', studentIds);

            const initialActData = {};
            studentIds.forEach(sId => {
                const match = actData?.find(a => a.student_id === sId);
                initialActData[sId] = {
                    eval_id: match?.eval_id || null,
                    activity_status: match?.activity_status || 'ผ่าน',
                    character_status: match?.character_status || 'ผ่าน'
                };
            });
            setActivityData(initialActData);

            const formatData = {
                enrollments,
                loData: loData || [],
                evalData: evalData || []
            };

            setData(formatData);

            const allAbilityNos = [...new Set((loData || []).map(l => l.learning_outcomes.ability_no))].sort((a, b) => a - b);
            if (allAbilityNos.length > 0) setSelectedLo(allAbilityNos[0]);

        } catch (err) {
            toast.error('ดึงข้อมูลครูประจำชั้นไม่สำเร็จ: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleActivityChange = (studentId, field, value) => {
        setActivityData(prev => ({
            ...prev,
            [studentId]: {
                ...prev[studentId],
                [field]: value
            }
        }));
    };

    const saveActivities = async () => {
        setSavingActivity(true);
        try {
            const { year, semester } = currentContext;

            const updates = Object.keys(activityData).map(studentId => {
                const d = activityData[studentId];
                return {
                    ...(d.eval_id ? { eval_id: d.eval_id } : {}),
                    student_id: studentId,
                    academic_year: year,
                    semester: semester,
                    activity_status: d.activity_status,
                    character_status: d.character_status
                };
            });

            const { error } = await supabase
                .from('student_year_evaluations')
                .upsert(updates, { onConflict: 'student_id,academic_year,semester' });

            if (error) throw error;
            toast.success('บันทึกผลการประเมินกิจกรรมเรียบร้อยแล้ว');

            // Refetch to get newly generated eval_ids
            searchHomeroom({ preventDefault: () => { } });
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            setSavingActivity(false);
        }
    };

    const renderTable2 = () => {
        if (!data || !selectedLo) return null;
        const { enrollments, loData, evalData } = data;

        const uniqueStudents = [];
        const studentMap = new Map();
        enrollments.forEach(e => {
            if (!studentMap.has(e.student_id)) {
                studentMap.set(e.student_id, e.users_students);
                uniqueStudents.push({ id: e.student_id, info: e.users_students });
            }
        });

        const uniqueSubjects = [];
        const subjectMap = new Map();
        enrollments.forEach(e => {
            if (!subjectMap.has(e.subject_id)) {
                subjectMap.set(e.subject_id, e.subjects);
                uniqueSubjects.push({ id: e.subject_id, info: e.subjects });
            }
        });

        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                <div className="bg-indigo-50/50 p-4 border-b border-indigo-100 flex items-center justify-between">
                    <h3 className="font-bold text-indigo-900 flex items-center">
                        <BookOpen className="w-5 h-5 mr-2 text-indigo-600" />
                        ผลการประเมินรายวิชา
                    </h3>
                    <div className="flex gap-4">
                        <select
                            value={selectedLo}
                            onChange={(e) => setSelectedLo(Number(e.target.value))}
                            className="text-sm font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:border-indigo-500 outline-none max-w-sm"
                        >
                            {[...new Set(loData.map(l => l.learning_outcomes.ability_no))].sort((a, b) => a - b).map(no => {
                                const loMatch = loData.find(l => l.learning_outcomes.ability_no === no);
                                const loCode = loMatch?.learning_outcomes?.lo_code;
                                return (
                                    <option key={no} value={no}>ดูสมรรถนะ LO ข้อ {no} {loCode ? `(${loCode})` : ''}</option>
                                );
                            })}
                        </select>
                        <button
                            onClick={() => {
                                // Simulate printing all class. We navigate using a special multi-student route or just alert for now.
                                // A perfect way is a special BatchReportView. 
                                // Alternatively, passing all IDs is difficult in URL.
                                // For now, we'll navigate to the first student and tell them how to print all, OR we create a true batch print route.
                                // Actually, let's open all student reports in new tabs, or better, navigate to a new route /batch-report.
                                // Easiest for this task: Alert the user that this feature opens a print dialog for the whole class, 
                                // then open students in new tabs (or loop window.open)
                                const repYear = currentContext?.year || new Date().getFullYear() + 543;
                                const repSem = currentContext?.semester || 1;
                                const studentUris = uniqueStudents.map(s => `/report/${s.id}/${repYear}/${repSem}`);

                                toast((t) => (
                                    <div>
                                        <b>กำลังเตรียมพิมพ์ ปพ.๖ ทั้งห้อง ({studentUris.length} คน)</b>
                                        <p className="text-sm mt-1">ระบบจะเปิดแท็บใหม่สำหรับนักเรียนแต่ละคน กรุณาอนุญาต Pop-ups บนเบราว์เซอร์ของคุณ</p>
                                        <div className="mt-3 flex gap-2">
                                            <button className="bg-indigo-600 text-white px-3 py-1 rounded text-sm" onClick={() => {
                                                toast.dismiss(t.id);
                                                studentUris.forEach(uri => window.open(uri, '_blank'));
                                            }}>เริ่มพิมพ์เลย</button>
                                            <button className="bg-slate-200 px-3 py-1 rounded text-sm" onClick={() => toast.dismiss(t.id)}>ยกเลิก</button>
                                        </div>
                                    </div>
                                ), { duration: Infinity });
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center"
                        >
                            <Printer className="w-4 h-4 mr-2" /> พิมพ์ทั้งห้อง
                        </button>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left divide-y divide-slate-200 whitespace-nowrap border-collapse">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="px-4 py-4 text-center text-xs font-bold uppercase tracking-wider w-16 border-r border-slate-200">เลขที่</th>
                                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider min-w-[200px] border-r border-slate-200">ชื่อ-นามสกุล</th>
                                {uniqueSubjects.map(sub => (
                                    <th key={sub.id} className="px-3 py-4 text-center text-xs font-bold uppercase w-24 border-r border-slate-200 leading-tight">
                                        <span className="block text-indigo-600">{sub.info.subject_code}</span>
                                        <span className="block font-medium text-[10px] text-slate-400 truncate max-w-[100px]">{sub.info.subject_name}</span>
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider w-32 border-l border-slate-200 sticky right-0 bg-slate-50">ออกรายงาน</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {uniqueStudents.map((student, index) => (
                                <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                                    <td className="px-4 py-3 text-center text-sm font-semibold text-slate-500 border-r border-slate-100">{index + 1}</td>
                                    <td className="px-6 py-3 text-sm font-bold text-slate-800 border-r border-slate-100">
                                        {student.info.prefix || ''}{student.info.first_name} {student.info.last_name}
                                    </td>
                                    {uniqueSubjects.map(sub => {
                                        const enrollMatch = enrollments.find(e => e.student_id === student.id && e.subject_id === sub.id);
                                        let level = '-';
                                        if (enrollMatch) {
                                            const loMatch = loData.find(l => l.subject_id === sub.id && l.learning_outcomes.ability_no === Number(selectedLo));
                                            if (loMatch) {
                                                const evMatch = evalData.find(ev => ev.enrollment_id === enrollMatch.enrollment_id && ev.lo_id === loMatch.learning_outcomes.lo_id);
                                                if (evMatch) level = evMatch.competency_level || '-';
                                            } else {
                                                level = 'N/A';
                                            }
                                        }

                                        let color = 'text-slate-400 font-normal';
                                        if (level === 'เริ่มต้น') color = 'text-red-600 font-bold';
                                        if (level === 'พัฒนา') color = 'text-orange-500 font-bold';
                                        if (level === 'ชำนาญ') color = 'text-blue-600 font-bold';
                                        if (level === 'เชี่ยวชาญ') color = 'text-green-600 font-bold';
                                        if (level === 'N/A') color = 'text-slate-300 font-medium text-xs';

                                        return (
                                            <td key={sub.id} className={`px-3 py-3 text-center text-sm border-r border-slate-100 ${color}`}>
                                                {level}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-3 text-center border-l border-slate-100 sticky right-0 bg-white group-hover:bg-slate-50/80">
                                        <button
                                            onClick={() => {
                                                const repYear = uniqueSubjects[0]?.info?.academic_year || new Date().getFullYear() + 543;
                                                const repSem = uniqueSubjects[0]?.info?.semester || 1;
                                                navigate(`/report/${student.id}/${repYear}/${repSem}`);
                                            }}
                                            className="inline-flex text-indigo-600 hover:text-white bg-indigo-50 hover:bg-indigo-600 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm items-center hover:shadow-indigo-600/30 ring-1 ring-inset ring-indigo-600/20"
                                        >
                                            <Printer className="w-4 h-4 mr-2" />
                                            พิมพ์ ปพ.๖
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderActivityTable = () => {
        if (!data) return null;
        const { enrollments } = data;
        const uniqueStudents = [];
        const studentMap = new Map();
        enrollments.forEach(e => {
            if (!studentMap.has(e.student_id)) {
                studentMap.set(e.student_id, e.users_students);
                uniqueStudents.push({ id: e.student_id, info: e.users_students });
            }
        });

        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
                <div className="bg-amber-50/50 p-4 border-b border-amber-100 flex items-center justify-between">
                    <h3 className="font-bold text-amber-900 flex items-center">
                        <Star className="w-5 h-5 mr-2 text-amber-500" />
                        ประเมินกิจกรรมพัฒาผู้เรียน / คุณลักษณะอันพึงประสงค์
                    </h3>
                    <button
                        onClick={saveActivities}
                        disabled={savingActivity}
                        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center"
                    >
                        {savingActivity ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                        บันทึกผลกิจกรรม
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left divide-y divide-slate-200 whitespace-nowrap border-collapse">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="px-4 py-4 text-center text-xs font-bold uppercase tracking-wider w-16 border-r border-slate-200">เลขที่</th>
                                <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider min-w-[200px] border-r border-slate-200">ชื่อ-นามสกุล</th>
                                <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider border-r border-slate-200 bg-emerald-50/50">กิจกรรมพัฒนาผู้เรียน</th>
                                <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider border-r border-slate-200 bg-sky-50/50">คุณลักษณะอันพึงประสงค์</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {uniqueStudents.map((student, index) => {
                                const stData = activityData[student.id] || {};
                                return (
                                    <tr key={student.id} className="hover:bg-slate-50/80 transition-colors">
                                        <td className="px-4 py-3 text-center text-sm font-semibold text-slate-500 border-r border-slate-100">{index + 1}</td>
                                        <td className="px-6 py-3 text-sm font-bold text-slate-800 border-r border-slate-100">
                                            {student.info.prefix || ''}{student.info.first_name} {student.info.last_name}
                                        </td>
                                        <td className="px-6 py-2 text-center border-r border-slate-100 bg-emerald-50/10">
                                            <select
                                                value={stData.activity_status || 'ผ่าน'}
                                                onChange={(e) => handleActivityChange(student.id, 'activity_status', e.target.value)}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-bold border outline-none ${stData.activity_status === 'ไม่ผ่าน' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}
                                            >
                                                <option value="ผ่าน">ผ่าน</option>
                                                <option value="ไม่ผ่าน">ไม่ผ่าน</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-2 text-center border-r border-slate-100 bg-sky-50/10">
                                            <select
                                                value={stData.character_status || 'ผ่าน'}
                                                onChange={(e) => handleActivityChange(student.id, 'character_status', e.target.value)}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-bold border outline-none ${stData.character_status === 'ไม่ผ่าน' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-sky-50 text-sky-600 border-sky-200'}`}
                                            >
                                                <option value="ผ่าน">ผ่าน</option>
                                                <option value="ไม่ผ่าน">ไม่ผ่าน</option>
                                            </select>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <Layout
            title="แดชบอร์ดครูประจำชั้น"
            actionText="กลับหน้ารายวิชา"
            actionIcon={ChevronLeft}
            onActionClick={() => navigate('/')}
        >
            <div className="mb-8">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700 tracking-tight">ครูประจำชั้น</h2>
                <p className="text-slate-500 font-medium">ดูสรุปผลการประเมินภาพรวมของนักเรียนในห้อง</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 max-w-xl mx-auto">
                <form onSubmit={searchHomeroom} className="flex gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-bold text-slate-700 mb-2">เลือกห้องเรียน</label>
                        <select
                            value={room}
                            onChange={(e) => setRoom(e.target.value)}
                            disabled={currentUser?.role !== 'admin' && currentUser?.role !== 'executive'}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 disabled:opacity-75 disabled:cursor-not-allowed focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all outline-none appearance-none cursor-pointer"
                        >
                            <option value="">-- เลือกห้องเรียน --</option>
                            {availableRooms.length === 0 && <option value="" disabled>ยังไม่ได้กำหนดให้เป็นครูประจำชั้น</option>}
                            {availableRooms.map(r => (
                                <option key={r} value={r}>{r}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            disabled={loading}
                            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-sm shadow-indigo-600/30 transition-all flex items-center h-[50px]"
                        >
                            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> : <Search className="w-5 h-5 mr-2" />}
                            ค้นหา
                        </button>
                    </div>
                </form>
            </div>

            {loading ? null : !data ? null : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex border-b border-slate-200 mb-6">
                        <button
                            onClick={() => setActiveTab('academic')}
                            className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'academic' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        >
                            ผลการประเมินวิชาการ
                        </button>
                        <button
                            onClick={() => setActiveTab('activity')}
                            className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'activity' ? 'border-amber-500 text-amber-700 bg-amber-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                        >
                            กิจกรรม / คุณลักษณะฯ
                        </button>
                    </div>

                    {activeTab === 'academic' ? renderTable2() : renderActivityTable()}
                </div>
            )}
        </Layout>
    );
}
