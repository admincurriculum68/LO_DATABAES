import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, Plus, Search, UserPlus, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { fetchAllRows, supabase } from '../lib/supabase';

const GROUP_TYPES = [
    ['subject', 'กลุ่มเรียนรายวิชา'],
    ['project', 'กลุ่มโครงงาน'],
    ['activity', 'กลุ่มกิจกรรม'],
    ['support', 'กลุ่มเสริม/ช่วยเหลือ'],
    ['custom', 'กลุ่มแบบกำหนดเอง'],
];
const ROLE_LABELS = { lead_teacher: 'ครูหลัก', co_teacher: 'ครูร่วม', assistant: 'ผู้ช่วยสอน' };
const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim();

export default function LearningGroupManager() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [groups, setGroups] = useState([]);
    const [students, setStudents] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [members, setMembers] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [activePanel, setActivePanel] = useState('members');
    const [query, setQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [studentQuery, setStudentQuery] = useState('');
    const [roomFilter, setRoomFilter] = useState('all');
    const [selectedStudents, setSelectedStudents] = useState(new Set());
    const [teacherId, setTeacherId] = useState('');
    const [teacherRole, setTeacherRole] = useState('co_teacher');
    const [form, setForm] = useState({ group_type: 'custom', group_name: '', grade_level: '', room_name: '', capacity: '' });

    const loadBase = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        try {
            const [groupResult, allStudents, teacherResult] = await Promise.all([
                supabase.from('learning_groups').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).eq('is_active', true).order('group_name'),
                fetchAllRows((from, to) => supabase.from('users_students').select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room, student_status').eq('school_id', currentUser.school_id).eq('student_status', 'active').order('student_code').range(from, to)),
                supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name, role').eq('school_id', currentUser.school_id).eq('is_active', true).order('first_name'),
            ]);
            if (groupResult.error) throw groupResult.error;
            if (teacherResult.error) throw teacherResult.error;
            setGroups(groupResult.data || []);
            setStudents(allStudents || []);
            setTeachers(teacherResult.data || []);
            setSelectedGroupId(current => current && groupResult.data?.some(group => group.group_id === current) ? current : groupResult.data?.[0]?.group_id || '');
        } catch (error) {
            toast.error(error.message.includes('learning_groups') ? 'ยังไม่ได้ติดตั้งโครงสร้างกลุ่มเรียน กรุณารัน update_schema_15_req.sql' : `โหลดกลุ่มเรียนไม่สำเร็จ: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    const loadDetail = useCallback(async groupId => {
        if (!groupId) { setMembers([]); setAssignments([]); return; }
        setDetailLoading(true);
        try {
            const [memberResult, teacherResult] = await Promise.all([
                supabase.from('learning_group_members').select('membership_id, student_id, membership_status, joined_at, users_students(student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room)').eq('group_id', groupId).eq('membership_status', 'active').is('left_at', null),
                supabase.from('learning_group_teachers').select('assignment_id, teacher_id, teaching_role, users_teachers(teacher_id, prefix, first_name, last_name)').eq('group_id', groupId).is('unassigned_at', null),
            ]);
            if (memberResult.error) throw memberResult.error;
            if (teacherResult.error) throw teacherResult.error;
            setMembers(memberResult.data || []);
            setAssignments(teacherResult.data || []);
        } catch (error) {
            toast.error('โหลดสมาชิกกลุ่มไม่สำเร็จ: ' + error.message);
        } finally {
            setDetailLoading(false);
        }
    }, []);

    useEffect(() => { loadBase(); }, [loadBase]);
    useEffect(() => { loadDetail(selectedGroupId); setSelectedStudents(new Set()); }, [loadDetail, selectedGroupId]);

    const selectedGroup = groups.find(group => group.group_id === selectedGroupId);
    const rooms = useMemo(() => [...new Set(students.map(student => student.current_room).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [students]);
    const memberIds = useMemo(() => new Set(members.map(member => member.student_id)), [members]);
    const visibleGroups = groups.filter(group => {
        const normalized = query.trim().toLowerCase();
        return (typeFilter === 'all' || group.group_type === typeFilter)
            && (!normalized || `${group.group_name} ${group.room_name || ''} ${group.grade_level || ''}`.toLowerCase().includes(normalized));
    });
    const candidateStudents = students.filter(student => {
        if (memberIds.has(student.student_id)) return false;
        if (roomFilter !== 'all' && student.current_room !== roomFilter) return false;
        const normalized = studentQuery.trim().toLowerCase();
        return !normalized || `${student.student_code || ''} ${fullName(student)} ${student.current_room || ''}`.toLowerCase().includes(normalized);
    });

    const createGroup = async event => {
        event.preventDefault();
        if (!form.group_name.trim()) return toast.error('กรุณาระบุชื่อกลุ่มเรียน');
        try {
            const { data, error } = await supabase.from('learning_groups').insert({
                school_id: currentUser.school_id,
                academic_year: academicYear,
                semester,
                group_type: form.group_type,
                group_name: form.group_name.trim(),
                grade_level: form.grade_level || null,
                room_name: form.room_name.trim() || null,
                capacity: form.capacity ? Number(form.capacity) : null,
                created_by: currentUser.teacher_id,
            }).select().single();
            if (error) throw error;
            setShowCreate(false);
            setForm({ group_type: 'custom', group_name: '', grade_level: '', room_name: '', capacity: '' });
            await loadBase();
            setSelectedGroupId(data.group_id);
            toast.success('สร้างกลุ่มเรียนแล้ว สามารถเพิ่มนักเรียนและครูได้ทันที');
        } catch (error) {
            toast.error('สร้างกลุ่มไม่สำเร็จ: ' + error.message);
        }
    };

    const addStudents = async studentIds => {
        const ids = [...new Set(studentIds)].filter(id => !memberIds.has(id));
        if (!selectedGroupId || !ids.length) return;
        try {
            const { error } = await supabase.from('learning_group_members').insert(ids.map(studentId => ({ group_id: selectedGroupId, student_id: studentId, changed_by: currentUser.teacher_id })));
            if (error) throw error;
            await loadDetail(selectedGroupId);
            setSelectedStudents(new Set());
            toast.success(`เพิ่มนักเรียนเข้ากลุ่มแล้ว ${ids.length} คน`);
        } catch (error) {
            toast.error('เพิ่มนักเรียนไม่สำเร็จ: ' + error.message);
        }
    };

    const removeMember = async member => {
        if (!window.confirm(`ย้ายนักเรียน ${fullName(member.users_students)} ออกจากกลุ่มนี้หรือไม่? ประวัติเดิมจะยังคงอยู่`)) return;
        const now = new Date().toISOString();
        const { error } = await supabase.from('learning_group_members').update({ membership_status: 'moved', left_at: now, changed_by: currentUser.teacher_id, updated_at: now }).eq('membership_id', member.membership_id);
        if (error) return toast.error('นำออกไม่สำเร็จ: ' + error.message);
        await loadDetail(selectedGroupId);
        toast.success('นำออกจากกลุ่มแล้ว โดยยังเก็บประวัติไว้');
    };

    const addTeacher = async () => {
        if (!teacherId || !selectedGroupId) return;
        if (assignments.some(item => item.teacher_id === teacherId)) return toast.error('ครูคนนี้อยู่ในกลุ่มแล้ว');
        const { error } = await supabase.from('learning_group_teachers').insert({ group_id: selectedGroupId, teacher_id: teacherId, teaching_role: teacherRole, assigned_by: currentUser.teacher_id });
        if (error) return toast.error('เพิ่มครูไม่สำเร็จ: ' + error.message);
        await loadDetail(selectedGroupId);
        setTeacherId('');
        toast.success('เพิ่มครูผู้รับผิดชอบแล้ว');
    };

    const removeTeacher = async assignment => {
        const now = new Date().toISOString();
        const { error } = await supabase.from('learning_group_teachers').update({ unassigned_at: now, updated_at: now }).eq('assignment_id', assignment.assignment_id);
        if (error) return toast.error('นำครูออกไม่สำเร็จ: ' + error.message);
        await loadDetail(selectedGroupId);
    };

    return (
        <Layout title="จัดการกลุ่มเรียน">
            <div className="mx-auto max-w-[1680px] space-y-5 pb-12">
                <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><button onClick={() => navigate('/admin')} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="กลับ"><ArrowLeft className="h-5 w-5" /></button><div><h1 className="text-xl font-extrabold text-slate-950">ห้องประจำชั้นและกลุ่มเรียนเป็นคนละส่วน</h1><p className="mt-1 text-sm text-slate-600">สร้างกลุ่มแบบรวมหลายห้อง แบ่งกลุ่มย่อย หรือเลือกนักเรียนรายบุคคลได้ โดยไม่เปลี่ยนห้องประจำชั้น</p></div></div><button onClick={() => setShowCreate(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white"><Plus className="h-4 w-4" />สร้างกลุ่มใหม่</button></header>

                {showCreate && <form onSubmit={createGroup} className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5"><div className="flex items-center justify-between"><div><h2 className="font-extrabold text-indigo-950">สร้างกลุ่มเรียนแบบยืดหยุ่น</h2><p className="mt-1 text-xs text-indigo-800">ชื่อกลุ่มควรสื่อให้ครูทราบว่าเป็นวิชา กิจกรรม หรือกลุ่มเฉพาะใด</p></div><button type="button" onClick={() => setShowCreate(false)} className="rounded-xl p-2 text-indigo-700 hover:bg-indigo-100"><X className="h-5 w-5" /></button></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label><span className="mb-1 block text-xs font-extrabold text-indigo-900">ประเภทกลุ่ม</span><select value={form.group_type} onChange={event => setForm(previous => ({ ...previous, group_type: event.target.value }))} className="min-h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold">{GROUP_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="lg:col-span-2"><span className="mb-1 block text-xs font-extrabold text-indigo-900">ชื่อกลุ่ม *</span><input value={form.group_name} onChange={event => setForm(previous => ({ ...previous, group_name: event.target.value }))} placeholder="เช่น ภาษาอังกฤษ กลุ่ม A" className="min-h-11 w-full rounded-xl border border-indigo-200 px-3 text-sm font-bold" /></label><label><span className="mb-1 block text-xs font-extrabold text-indigo-900">ระดับชั้น</span><select value={form.grade_level} onChange={event => setForm(previous => ({ ...previous, grade_level: event.target.value }))} className="min-h-11 w-full rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold"><option value="">หลายระดับ/ไม่ระบุ</option>{['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6'].map(grade => <option key={grade}>{grade}</option>)}</select></label><label><span className="mb-1 block text-xs font-extrabold text-indigo-900">จำนวนที่รองรับ</span><input type="number" min="1" value={form.capacity} onChange={event => setForm(previous => ({ ...previous, capacity: event.target.value }))} className="min-h-11 w-full rounded-xl border border-indigo-200 px-3 text-sm font-bold" /></label></div><div className="mt-4 flex justify-end"><button type="submit" className="min-h-11 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white">บันทึกและเพิ่มสมาชิก</button></div></form>}

                <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="space-y-3 border-b border-slate-200 p-4"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อกลุ่มหรือห้อง" className="min-h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm" /></div><select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="all">ทุกประเภทกลุ่ม</option>{GROUP_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="max-h-[720px] divide-y divide-slate-100 overflow-y-auto">{loading ? <div className="h-60 animate-pulse bg-slate-100" /> : visibleGroups.length ? visibleGroups.map(group => <button key={group.group_id} onClick={() => setSelectedGroupId(group.group_id)} className={`flex w-full items-center justify-between gap-3 p-4 text-left ${selectedGroupId === group.group_id ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}><div className="min-w-0"><p className="truncate font-extrabold text-slate-900">{group.group_name}</p><p className="mt-1 text-xs text-slate-500">{GROUP_TYPES.find(item => item[0] === group.group_type)?.[1]}{group.room_name ? ` · ${group.room_name}` : ''}</p></div><ChevronRight className={`h-4 w-4 shrink-0 ${selectedGroupId === group.group_id ? 'text-indigo-700' : 'text-slate-300'}`} /></button>) : <div className="p-10 text-center text-sm text-slate-500">ยังไม่มีกลุ่มเรียนในภาคเรียนนี้</div>}</div></aside>

                    <main className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{!selectedGroup ? <div className="p-16 text-center text-slate-500"><Users className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-bold">เลือกกลุ่มจากด้านซ้ายหรือสร้างกลุ่มใหม่</p></div> : <><header className="border-b border-slate-200 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-lg font-extrabold text-slate-950">{selectedGroup.group_name}</h2><p className="mt-1 text-sm text-slate-600">สมาชิก {members.length} คน · ครูรับผิดชอบ {assignments.length} คน{selectedGroup.capacity ? ` · รองรับ ${selectedGroup.capacity} คน` : ''}</p></div><div className="flex rounded-xl bg-slate-100 p-1"><button onClick={() => setActivePanel('members')} className={`min-h-9 rounded-lg px-3 text-sm font-bold ${activePanel === 'members' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600'}`}>นักเรียน</button><button onClick={() => setActivePanel('teachers')} className={`min-h-9 rounded-lg px-3 text-sm font-bold ${activePanel === 'teachers' ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600'}`}>ครูผู้สอน</button></div></div></header>{detailLoading ? <div className="h-72 animate-pulse bg-slate-100" /> : activePanel === 'members' ? <div className="grid min-h-[620px] xl:grid-cols-[minmax(0,1fr)_360px]"><section className="border-b border-slate-200 xl:border-b-0 xl:border-r"><div className="border-b border-slate-200 p-4"><h3 className="font-extrabold text-slate-900">สมาชิกในกลุ่ม</h3><p className="mt-1 text-xs text-slate-500">นำออกจากกลุ่มแล้วประวัติเดิมจะยังอยู่</p></div><div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">{members.length ? members.map(member => <div key={member.membership_id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-bold text-slate-900">{fullName(member.users_students)}</p><p className="mt-1 text-xs text-slate-500">{member.users_students?.student_code || '-'} · ห้องประจำชั้น {member.users_students?.current_room || '-'}</p></div><button onClick={() => removeMember(member)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">นำออก</button></div>) : <div className="p-12 text-center text-sm text-slate-500">กลุ่มนี้ยังไม่มีนักเรียน</div>}</div></section><aside><div className="space-y-3 border-b border-slate-200 p-4"><h3 className="font-extrabold text-slate-900">เพิ่มนักเรียน</h3><select value={roomFilter} onChange={event => { setRoomFilter(event.target.value); setSelectedStudents(new Set()); }} className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="all">ค้นหาจากทุกห้อง</option>{rooms.map(room => <option key={room} value={room}>{room}</option>)}</select><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={studentQuery} onChange={event => setStudentQuery(event.target.value)} placeholder="ชื่อหรือรหัสนักเรียน" className="min-h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm" /></div>{roomFilter !== 'all' && <button onClick={() => addStudents(candidateStudents.map(student => student.student_id))} disabled={!candidateStudents.length} className="min-h-10 w-full rounded-xl border border-emerald-300 bg-emerald-50 text-sm font-extrabold text-emerald-800 disabled:opacity-40">เพิ่มนักเรียนทั้งห้อง {roomFilter} ({candidateStudents.length} คน)</button>}</div><div className="max-h-[430px] divide-y divide-slate-100 overflow-y-auto">{candidateStudents.slice(0, 100).map(student => { const checked = selectedStudents.has(student.student_id); return <label key={student.student_id} className={`flex cursor-pointer items-center gap-3 p-3 ${checked ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}><input type="checkbox" className="sr-only" checked={checked} onChange={() => setSelectedStudents(previous => { const next = new Set(previous); if (next.has(student.student_id)) next.delete(student.student_id); else next.add(student.student_id); return next; })} /><span className={`flex h-5 w-5 items-center justify-center rounded border-2 ${checked ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300'}`}>{checked && <Check className="h-3.5 w-3.5" />}</span><div><p className="text-sm font-bold text-slate-900">{fullName(student)}</p><p className="text-xs text-slate-500">{student.student_code || '-'} · {student.current_room || '-'}</p></div></label>; })}</div><div className="border-t border-slate-200 p-4"><button onClick={() => addStudents([...selectedStudents])} disabled={!selectedStudents.size} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 text-sm font-extrabold text-white disabled:opacity-40"><UserPlus className="h-4 w-4" />เพิ่มที่เลือก {selectedStudents.size} คน</button></div></aside></div> : <div className="p-5"><div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><select value={teacherId} onChange={event => setTeacherId(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold"><option value="">เลือกครูหรือบุคลากร</option>{teachers.filter(teacher => !assignments.some(item => item.teacher_id === teacher.teacher_id)).map(teacher => <option key={teacher.teacher_id} value={teacher.teacher_id}>{fullName(teacher)}</option>)}</select><select value={teacherRole} onChange={event => setTeacherRole(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">{Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={addTeacher} disabled={!teacherId} className="min-h-11 rounded-xl bg-indigo-700 px-4 text-sm font-extrabold text-white disabled:opacity-40">เพิ่มครู</button></div><div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{assignments.length ? assignments.map(assignment => <div key={assignment.assignment_id} className="flex items-center justify-between gap-3 p-4"><div><p className="font-extrabold text-slate-900">{fullName(assignment.users_teachers)}</p><p className="mt-1 text-xs font-bold text-indigo-700">{ROLE_LABELS[assignment.teaching_role]}</p></div><button onClick={() => removeTeacher(assignment)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">นำออก</button></div>) : <div className="p-10 text-center text-sm text-slate-500">ยังไม่ได้กำหนดครูผู้รับผิดชอบ</div>}</div></div>}</>}</main>
                </div>
            </div>
        </Layout>
    );
}
