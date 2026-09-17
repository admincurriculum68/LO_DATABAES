import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAllByIn, supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useAcademic } from '../../AcademicContext';
import { buildLoResolver } from '../../lib/loByRoom';
import { loadRoomMappings, loadSubjectAssignments } from '../../lib/loByRoomApi';
import { formatRoomRange, teachersWithRooms } from '../../lib/teacherAccess';

// แท็บติดตามการรายงานผลของฝ่ายวิชาการ แยกออกจาก AdminDashboard ให้โหลดเฉพาะตอนเปิดแท็บ
// และแก้แท็บนี้ได้โดยไม่เสี่ยงกระทบแท็บอื่น
export default function ProgressTab() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [evalProgress, setEvalProgress] = useState([]);
    const [loadingProgress, setLoadingProgress] = useState(false);
    const [progressLoaded, setProgressLoaded] = useState(false);
    const [progressError, setProgressError] = useState('');

    const loadEvaluationProgress = useCallback(async () => {
        if (!currentUser?.school_id) return;

        setLoadingProgress(true);
        setProgressError('');
        try {
            const { data: subs, error: subjectsError } = await supabase
                .from('subjects')
                .select('subject_id, subject_name, grade_level, semester, academic_year, teacher_id, users_teachers(prefix, first_name, last_name)')
                .eq('school_id', currentUser.school_id)
                .eq('academic_year', academicYear)
                .eq('semester', semester)
                .order('subject_name');
            if (subjectsError) throw subjectsError;

            const subjectIds = (subs || []).map(subject => subject.subject_id);
            if (subjectIds.length === 0) {
                setEvalProgress([]);
                return;
            }

            const [enrolls, loMaps, assignments] = await Promise.all([
                fetchAllByIn(subjectIds, (batch, from, to) => supabase
                    .from('student_enrollments')
                    .select('enrollment_id, subject_id, room')
                    .in('subject_id', batch)
                    .eq('enrollment_status', 'active')
                    .range(from, to)),
                loadRoomMappings(subjectIds),
                loadSubjectAssignments(subjectIds),
            ]);
            // LO ของแต่ละห้องต่างกันได้ จำนวนช่องที่ต้องบันทึกจึงนับตามห้องของนักเรียน
            const loResolver = buildLoResolver(loMaps);
            const teacherIds = [...new Set([...(subs || []).map(subject => subject.teacher_id), ...assignments.map(row => row.teacher_id)].filter(Boolean))];
            const { data: teacherRows } = teacherIds.length
                ? await supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name').in('teacher_id', teacherIds)
                : { data: [] };
            const teacherNameById = new Map((teacherRows || []).map(teacher => [teacher.teacher_id, `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`]));

            const enrollmentIds = enrolls.map(enrollment => enrollment.enrollment_id);
            const evaluations = enrollmentIds.length > 0
                ? await fetchAllByIn(enrollmentIds, (batch, from, to) => supabase
                    .from('lo_evaluations')
                    .select('enrollment_id, lo_id, evidence_note')
                    .in('enrollment_id', batch)
                    .range(from, to))
                : [];

            const enrollmentCountBySubject = new Map();
            const cellCountBySubject = new Map();
            const enrollmentById = new Map();
            enrolls.forEach(enrollment => {
                enrollmentCountBySubject.set(enrollment.subject_id, (enrollmentCountBySubject.get(enrollment.subject_id) || 0) + 1);
                cellCountBySubject.set(enrollment.subject_id, (cellCountBySubject.get(enrollment.subject_id) || 0) + loResolver.idsFor(enrollment.subject_id, enrollment.room).size);
                enrollmentById.set(enrollment.enrollment_id, enrollment);
            });

            const filledCountBySubject = new Map();
            evaluations.forEach(evaluation => {
                if (!evaluation.evidence_note?.trim()) return;
                const enrollment = enrollmentById.get(evaluation.enrollment_id);
                if (!enrollment || !loResolver.idsFor(enrollment.subject_id, enrollment.room).has(evaluation.lo_id)) return;
                filledCountBySubject.set(enrollment.subject_id, (filledCountBySubject.get(enrollment.subject_id) || 0) + 1);
            });

            const progress = (subs || []).map(subject => {
                const studentCount = enrollmentCountBySubject.get(subject.subject_id) || 0;
                const loCount = loResolver.allIdsForSubject(subject.subject_id).size;
                const totalCells = cellCountBySubject.get(subject.subject_id) || 0;
                const filledCells = filledCountBySubject.get(subject.subject_id) || 0;
                const percent = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
                // ครูของวิชาแยกตามห้อง ไม่ใช้ครูหลักคนเดียว ฝ่ายวิชาการจะได้ตามถูกคน
                const teacherName = teachersWithRooms(subject, assignments.filter(row => row.subject_id === subject.subject_id))
                    .map(item => `${teacherNameById.get(item.teacherId) || 'ครูผู้สอน'}${item.rooms.length ? ` (${formatRoomRange(item.rooms)})` : ''}`)
                    .join(' · ');

                return {
                    ...subject,
                    teacherName: teacherName || 'ยังไม่มอบหมาย',
                    studentCount,
                    loCount,
                    totalCells,
                    filledCells,
                    percent,
                };
            }).sort((a, b) => a.percent - b.percent || (a.subject_name || '').localeCompare(b.subject_name || '', 'th'));

            setEvalProgress(progress);
        } catch (error) {
            const message = error.message || 'ไม่สามารถโหลดสถานะการรายงานผลได้';
            setProgressError(message);
            toast.error('โหลดข้อมูลไม่สำเร็จ: ' + message);
        } finally {
            setLoadingProgress(false);
            setProgressLoaded(true);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => {
        loadEvaluationProgress();
    }, [loadEvaluationProgress]);

    return (
        <div className="min-h-[500px] rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center text-lg font-bold text-slate-900"><CheckCircle className="mr-2 h-5 w-5 text-emerald-700" />สถานะรายวิชาทั้งหมด</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">แสดงวิชาที่ยังรายงานไม่ครบก่อน เพื่อให้ติดตามงานต่อได้ทันที</p>
                </div>
                <button
                    type="button"
                    onClick={loadEvaluationProgress}
                    disabled={loadingProgress}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                >
                    <RefreshCw className={`h-4 w-4 ${loadingProgress ? 'animate-spin' : ''}`} />
                    {loadingProgress ? 'กำลังอัปเดต' : 'รีเฟรชข้อมูล'}
                </button>
            </div>

            {loadingProgress && !progressLoaded ? (
                <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm font-bold text-slate-600" role="status">
                    <div className="loader scale-125"></div>
                    กำลังรวบรวมสถานะการรายงานผล
                </div>
            ) : progressError ? (
                <div className="surface-danger rounded-2xl border border-rose-200 px-5 py-10 text-center" role="alert">
                    <p className="font-bold text-rose-950">โหลดสถานะการรายงานผลไม่สำเร็จ</p>
                    <p className="mt-1 text-sm text-rose-800">{progressError}</p>
                    <button type="button" onClick={loadEvaluationProgress} className="action-danger mt-4 min-h-11 rounded-xl px-4 text-sm font-bold">ลองโหลดอีกครั้ง</button>
                </div>
            ) : evalProgress.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-16 text-center">
                    <p className="font-bold text-slate-800">ยังไม่มีรายวิชาในภาคเรียนนี้</p>
                    <p className="mt-1 text-sm text-slate-600">ตรวจสอบปีการศึกษาและภาคเรียน หรือเพิ่มข้อมูลรายวิชาก่อนติดตามผล</p>
                    <button type="button" onClick={() => navigate('/admin/setup')} className="mt-4 min-h-11 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-bold text-indigo-700 hover:bg-indigo-50">ไปที่ตั้งค่าข้อมูล</button>
                </div>
            ) : (
                <div className="space-y-3">
                    {/* Summary bar */}
                    <div className="mb-6 grid gap-3 sm:grid-cols-3">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                            <p className="text-3xl font-bold text-emerald-700">{evalProgress.filter(p => p.percent === 100).length}</p>
                            <p className="text-xs font-bold text-emerald-700">ประเมินครบแล้ว</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                            <p className="text-3xl font-bold text-amber-700">{evalProgress.filter(p => p.percent > 0 && p.percent < 100).length}</p>
                            <p className="text-xs font-bold text-amber-700">กำลังดำเนินการ</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                            <p className="text-3xl font-bold text-red-700">{evalProgress.filter(p => p.percent === 0).length}</p>
                            <p className="text-xs font-bold text-red-700">ยังไม่เริ่ม</p>
                        </div>
                    </div>

                    {/* Per-subject cards */}
                    {evalProgress.map(p => (
                        <div key={p.subject_id} className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border transition-all ${
                            p.percent === 100 ? 'bg-emerald-50/50 border-emerald-200' :
                            p.percent > 0 ? 'bg-amber-50/30 border-amber-200' :
                            'bg-red-50/30 border-red-200'
                        }`}>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 text-sm truncate">{p.subject_name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    ครู: <span className="font-bold text-slate-700">{p.teacherName}</span>
                                    &ensp;|&ensp;{p.grade_level} ภาคเรียนที่ {p.semester}/{p.academic_year}
                                    &ensp;|&ensp;{p.studentCount} คน · {p.loCount} ผลลัพธ์การเรียนรู้
                                </p>
                            </div>
                            <div className="w-full sm:w-48 shrink-0">
                                <div className="flex justify-between text-xs font-bold mb-1">
                                    <span className={p.percent === 100 ? 'text-emerald-700' : p.percent > 0 ? 'text-amber-700' : 'text-red-700'}>
                                        {p.filledCells}/{p.totalCells}
                                    </span>
                                    <span className="text-slate-600">{p.percent}%</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            p.percent === 100 ? 'bg-emerald-500' : p.percent > 50 ? 'bg-indigo-500' : p.percent > 0 ? 'bg-amber-400' : 'bg-red-300'
                                        }`}
                                        style={{ width: `${Math.max(p.percent, 1)}%` }}
                                    />
                                </div>
                            </div>
                            <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border shrink-0 ${
                                p.percent === 100 ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                                p.percent > 0 ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                'bg-red-100 text-red-700 border-red-300'
                            }`}>
                                {p.percent === 100 ? 'ประเมินครบ' : p.percent > 0 ? `ดำเนินการแล้ว ${p.percent}%` : 'ยังไม่เริ่มประเมิน'}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
