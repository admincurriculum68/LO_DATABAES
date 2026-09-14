import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Save, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { roleLabelsFor } from '../lib/roles';
import { supabase } from '../lib/supabase';
import { buildRoomHours } from '../lib/roomHours';
import { roomHoursSupported } from '../lib/roomHoursApi';

const pairKey = (teacherId, room) => `${teacherId}::${room}`;

export default function SubjectTeacherManager() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [subjects, setSubjects] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [subjectId, setSubjectId] = useState('');
    const [rooms, setRooms] = useState([]);
    // ชั่วโมงที่แก้แต่ยังไม่บันทึก เก็บแยกตามวิชาและห้อง เปลี่ยนวิชาไปมาค่าที่พิมพ์ไว้ไม่หาย
    const [hoursEdits, setHoursEdits] = useState({});
    const [roomHoursEnabled, setRoomHoursEnabled] = useState(false);
    const [selectedPairs, setSelectedPairs] = useState(new Set());
    const [savedPairs, setSavedPairs] = useState(new Set());
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadBaseData = useCallback(async () => {
        if (!currentUser?.school_id) return;
        setLoading(true);
        try {
            const [subjectResult, teacherResult] = await Promise.all([
                supabase.from('subjects').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).order('subject_name'),
                supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name, role').eq('school_id', currentUser.school_id).eq('is_active', true).order('first_name'),
            ]);
            if (subjectResult.error) throw subjectResult.error;
            if (teacherResult.error) throw teacherResult.error;
            setSubjects(subjectResult.data || []);
            setTeachers(teacherResult.data || []);
            setSubjectId(current => current || subjectResult.data?.[0]?.subject_id || '');
        } catch (error) {
            toast.error('โหลดข้อมูลครูประจำวิชาไม่สำเร็จ: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => { loadBaseData(); }, [loadBaseData]);
    useEffect(() => { roomHoursSupported().then(setRoomHoursEnabled); }, []);

    useEffect(() => {
        async function loadAssignments() {
            if (!subjectId) return;
            const [enrollmentResult, assignmentResult] = await Promise.all([
                supabase.from('student_enrollments').select('room').eq('subject_id', subjectId).eq('enrollment_status', 'active'),
                supabase.from('subject_teachers').select('teacher_id, room_name').eq('subject_id', subjectId).eq('school_id', currentUser.school_id),
            ]);
            if (enrollmentResult.error || assignmentResult.error) {
                toast.error('โหลดห้องเรียนหรือครูที่รับผิดชอบไม่สำเร็จ: ' + (enrollmentResult.error || assignmentResult.error).message);
                return;
            }
            setRooms([...new Set((enrollmentResult.data || []).map(item => item.room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')));
            const loadedPairs = new Set((assignmentResult.data || []).filter(item => item.room_name).map(item => pairKey(item.teacher_id, item.room_name)));
            setSelectedPairs(loadedPairs);
            setSavedPairs(new Set(loadedPairs));
        }
        loadAssignments();
    }, [currentUser.school_id, subjectId]);

    const visibleTeachers = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return teachers.filter(teacher => `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`.toLowerCase().includes(normalized));
    }, [query, teachers]);

    const togglePair = (teacherId, room) => {
        const key = pairKey(teacherId, room);
        setSelectedPairs(previous => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const selectedSubject = subjects.find(subject => subject.subject_id === subjectId);
    const hoursKey = room => `${subjectId}::${room}`;
    const roomHoursValue = room => hoursEdits[hoursKey(room)] ?? String(selectedSubject?.room_hours?.[room] ?? '');

    const saveAssignments = async () => {
        if (!subjectId) return;
        const payload = [...selectedPairs].map(key => {
            const [teacherId, roomName] = key.split('::');
            return { school_id: currentUser.school_id, subject_id: subjectId, teacher_id: teacherId, room_name: roomName };
        });
        setSaving(true);
        try {
            const additions = payload.filter(item => !savedPairs.has(pairKey(item.teacher_id, item.room_name)));
            const removals = [...savedPairs].filter(key => !selectedPairs.has(key));
            // เพิ่มรายการใหม่ก่อนเสมอ ถ้า insert ล้ม การมอบหมายเดิมจะไม่หาย
            if (additions.length) {
                const { error: insertError } = await supabase.from('subject_teachers').insert(additions);
                if (insertError) throw insertError;
            }
            for (const key of removals) {
                const [teacherId, roomName] = key.split('::');
                const { error: deleteError } = await supabase.from('subject_teachers').delete()
                    .eq('school_id', currentUser.school_id).eq('subject_id', subjectId)
                    .eq('teacher_id', teacherId).eq('room_name', roomName);
                if (deleteError) throw deleteError;
            }
            if (payload.length) {
                const currentPrimary = subjects.find(subject => subject.subject_id === subjectId)?.teacher_id;
                const teacherIds = [...new Set(payload.map(item => item.teacher_id))].sort();
                const primaryTeacherId = teacherIds.includes(currentPrimary) ? currentPrimary : teacherIds[0];
                const { error: legacyError } = await supabase.from('subjects').update({ teacher_id: primaryTeacherId })
                    .eq('school_id', currentUser.school_id).eq('subject_id', subjectId);
                if (legacyError) throw legacyError;
            } else {
                const { error: legacyError } = await supabase.from('subjects').update({ teacher_id: null })
                    .eq('school_id', currentUser.school_id).eq('subject_id', subjectId);
                if (legacyError) throw legacyError;
            }
            if (roomHoursEnabled && selectedSubject && rooms.length) {
                // ช่องว่างใช้ค่าเริ่มต้นของวิชา ชั่วโมงที่ใช้มากที่สุดเป็นค่าเริ่มต้นใหม่ และเก็บเฉพาะห้องที่ต่าง
                const hoursByRoom = new Map(rooms.map(room => [room, roomHoursValue(room) === '' ? selectedSubject.teaching_hours : roomHoursValue(room)]));
                const nextHours = buildRoomHours(hoursByRoom, selectedSubject.teaching_hours);
                const { error: hoursError } = await supabase.from('subjects').update(nextHours)
                    .eq('school_id', currentUser.school_id).eq('subject_id', subjectId);
                if (hoursError) throw hoursError;
                setSubjects(previous => previous.map(subject => (subject.subject_id === subjectId ? { ...subject, ...nextHours } : subject)));
                setHoursEdits(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !key.startsWith(`${subjectId}::`))));
            }
            setSavedPairs(new Set(selectedPairs));
            toast.success(`บันทึกครูผู้สอน ${new Set(payload.map(item => item.teacher_id)).size} คน ครอบคลุม ${new Set(payload.map(item => item.room_name)).size} ห้องแล้ว`);
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Layout title="กำหนดครูประจำรายวิชา">
            <div className="mx-auto max-w-6xl space-y-5 pb-12">
                <header className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
                    <div><h1 className="text-2xl font-bold text-slate-950">กำหนดครูผู้สอนและห้องเรียน</h1><p className="mt-1 text-sm leading-6 text-slate-600">หนึ่งรายวิชามีครูได้มากกว่า 1 คน และกำหนดขอบเขตห้องของครูแต่ละคนได้</p></div>
                    <button onClick={saveAssignments} disabled={!subjectId || saving} className="action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-40"><Save className="h-4 w-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกครูและชั่วโมงเรียน'}</button>
                </header>

                <section className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                    <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-800">รายวิชา</span><select value={subjectId} onChange={event => setSubjectId(event.target.value)} className="min-h-12 w-full rounded-xl border border-field bg-white px-4 text-sm font-bold"><option value="">เลือกรายวิชา</option>{subjects.map(subject => <option key={subject.subject_id} value={subject.subject_id}>{subject.subject_name} · {subject.grade_level || 'ไม่ระบุชั้น'}</option>)}</select></label>
                </section>

                {loading ? <div className="h-64 animate-pulse rounded-2xl bg-slate-200" /> : rooms.length === 0 ? <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Users className="mx-auto h-9 w-9 text-slate-500" /><h2 className="mt-3 font-bold text-slate-800">รายวิชานี้ยังไม่มีกลุ่มเรียน</h2><p className="mt-1 text-sm text-slate-600">จัดนักเรียนเข้ากลุ่มเรียนและระบุห้องก่อน จึงจะกำหนดขอบเขตห้องให้ครูได้</p></section> : (
                    <section className="overflow-hidden rounded-2xl border border-line bg-white">
                        <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-950">เลือกครูในแต่ละห้อง</h2><p className="mt-1 text-xs text-slate-500">ทำเครื่องหมายได้หลายครูต่อห้องและหลายห้องต่อครู</p></div><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input aria-label="ค้นหาชื่อครู" value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อครู" className="min-h-11 rounded-xl border border-field pl-9 pr-3 text-sm" /></div></div>
                        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="sticky left-0 bg-slate-50 px-5 py-3 text-left font-bold">ครูและบุคลากร</th>{rooms.map(room => <th key={room} scope="col" className="px-4 py-3 text-center font-bold">{room}</th>)}</tr>{roomHoursEnabled && <tr className="border-t border-line bg-white"><th scope="row" className="sticky left-0 bg-white px-5 py-2 text-left text-xs font-semibold text-slate-700">ชั่วโมงเรียนของห้อง<span className="block font-normal text-slate-600">ช่องว่างใช้ค่าเริ่มต้น {selectedSubject?.teaching_hours ?? '-'} ชม.</span></th>{rooms.map(room => <td key={room} className="px-2 py-2 text-center"><input type="number" min="0" step="1" inputMode="numeric" aria-label={`ชั่วโมงเรียนของห้อง ${room}`} value={roomHoursValue(room)} placeholder={selectedSubject?.teaching_hours == null ? '' : String(selectedSubject.teaching_hours)} onChange={event => setHoursEdits(previous => ({ ...previous, [hoursKey(room)]: event.target.value }))} className="min-h-11 w-20 rounded-lg border border-field px-2 text-center text-sm font-semibold placeholder:font-normal placeholder:text-slate-600" /></td>)}</tr>}</thead><tbody className="divide-y divide-line">{visibleTeachers.map(teacher => <tr key={teacher.teacher_id}><td className="sticky left-0 bg-white px-5 py-4 font-bold text-slate-900">{teacher.prefix || ''}{teacher.first_name} {teacher.last_name}<span className="ml-2 text-xs font-normal text-slate-500">{roleLabelsFor(teacher).join(' · ')}</span></td>{rooms.map(room => { const checked = selectedPairs.has(pairKey(teacher.teacher_id, room)); return <td key={room} className="px-4 py-3 text-center"><button type="button" onClick={() => togglePair(teacher.teacher_id, room)} aria-pressed={checked} aria-label={`${checked ? 'ยกเลิก' : 'กำหนด'} ${teacher.first_name} ห้อง ${room}`} className={`mx-auto flex h-11 w-11 items-center justify-center rounded-xl border-2 ${checked ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-transparent hover:border-indigo-400'}`}><Check className="h-5 w-5" /></button></td>; })}</tr>)}</tbody></table></div>
                    </section>
                )}
            </div>
        </Layout>
    );
}
