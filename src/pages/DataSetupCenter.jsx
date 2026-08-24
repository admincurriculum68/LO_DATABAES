import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, BookOpenCheck, CheckCircle2, ClipboardCheck, Database, GraduationCap, Users, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { calculateSetupReadiness } from '../lib/evaluationProgress';
import SchoolBrandingSettings from '../components/SchoolBrandingSettings';

export default function DataSetupCenter() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [summary, setSummary] = useState({ teachers: 0, students: 0, missingRooms: 0, formats: 0, groups: 0, emptyGroups: 0, teacherlessGroups: 0, los: 0, mappedSubjects: 0, subjects: 0 });

    const loadSummary = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');
        try {
            const [students, teacherResult, subjectResult, contextResult, loResult, groupResult] = await Promise.all([
                fetchAllRows((from, to) => supabase.from('users_students').select('student_id, current_grade_level, current_room, student_status').eq('school_id', currentUser.school_id).range(from, to)),
                supabase.from('users_teachers').select('teacher_id', { count: 'exact', head: true }).eq('school_id', currentUser.school_id).eq('is_active', true),
                supabase.from('subjects').select('subject_id, teacher_id').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
                supabase.from('learning_contexts').select('context_id', { count: 'exact', head: true }).eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
                supabase.from('learning_outcomes').select('lo_id', { count: 'exact', head: true }).eq('school_id', currentUser.school_id),
                supabase.from('learning_groups').select('group_id').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).eq('is_active', true),
            ]);
            const baseError = [teacherResult, subjectResult, contextResult, loResult, groupResult].find(result => result.error)?.error;
            if (baseError) throw baseError;
            const activeStudents = (students || []).filter(student => student.student_status === 'active');
            const subjects = subjectResult.data || [];
            const groups = groupResult.data || [];
            const subjectIds = subjects.map(subject => subject.subject_id);
            const groupIds = groups.map(group => group.group_id);
            const [mappings, members, assignments] = await Promise.all([
                fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('subject_lo_mapping').select('subject_id').in('subject_id', batch).range(from, to)),
                fetchAllByIn(groupIds, (batch, from, to) => supabase.from('learning_group_members').select('group_id').in('group_id', batch).eq('membership_status', 'active').is('left_at', null).range(from, to)),
                fetchAllByIn(groupIds, (batch, from, to) => supabase.from('learning_group_teachers').select('group_id').in('group_id', batch).is('unassigned_at', null).range(from, to)),
            ]);
            const groupsWithMembers = new Set(members.map(item => item.group_id));
            const groupsWithTeachers = new Set(assignments.map(item => item.group_id));
            setSummary({
                teachers: teacherResult.count || 0,
                students: activeStudents.length,
                missingRooms: activeStudents.filter(student => !student.current_grade_level || !student.current_room).length,
                formats: subjects.length + (contextResult.count || 0),
                subjects: subjects.length,
                groups: groups.length,
                emptyGroups: groups.filter(group => !groupsWithMembers.has(group.group_id)).length,
                teacherlessGroups: groups.filter(group => !groupsWithTeachers.has(group.group_id)).length,
                los: loResult.count || 0,
                mappedSubjects: new Set(mappings.map(item => item.subject_id)).size,
            });
        } catch (error) {
            setLoadError(error.message || 'โหลดสถานะการตั้งค่าไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => { loadSummary(); }, [loadSummary]);

    const steps = [
        { title: 'เพิ่มครูและบุคลากร', description: 'ฝ่ายวิชาการ ครูผู้สอน และผู้บริหาร', value: summary.teachers, unit: 'คน', ready: summary.teachers > 0, icon: GraduationCap, action: () => navigate(summary.teachers > 0 ? '/admin/people' : '/admin?tab=import') },
        { title: 'เพิ่มนักเรียนและห้องประจำชั้น', description: summary.missingRooms ? `มี ${summary.missingRooms} คนที่ยังไม่มีชั้นหรือห้อง` : 'ข้อมูลชั้นและห้องครบถ้วน', value: summary.students, unit: 'คน', ready: summary.students > 0 && summary.missingRooms === 0, icon: UsersRound, action: () => navigate(summary.students > 0 ? '/admin/people?type=students' : '/admin?tab=import') },
        { title: 'กำหนดวิชา หน่วย โครงงาน และกิจกรรม', description: 'รูปแบบการเรียนรู้ในภาคเรียนปัจจุบัน', value: summary.formats, unit: 'รายการ', ready: summary.formats > 0, icon: BookOpenCheck, action: () => navigate('/admin/learning-contexts') },
        { title: 'จัดกลุ่มเรียน', description: summary.emptyGroups ? `มี ${summary.emptyGroups} กลุ่มที่ยังไม่มีนักเรียน` : 'รองรับรวมหลายห้องและแบ่งกลุ่มย่อย', value: summary.groups, unit: 'กลุ่ม', ready: summary.groups > 0 && summary.emptyGroups === 0, icon: Users, action: () => navigate('/admin/learning-groups') },
        { title: 'กำหนดครูผู้รับผิดชอบ', description: summary.teacherlessGroups ? `มี ${summary.teacherlessGroups} กลุ่มที่ยังไม่มีครู` : 'กำหนดครูหลักและครูร่วมแล้ว', value: Math.max(0, summary.groups - summary.teacherlessGroups), unit: `จาก ${summary.groups}`, ready: summary.groups > 0 && summary.teacherlessGroups === 0, icon: ClipboardCheck, action: () => navigate('/admin/learning-groups') },
        { title: 'เพิ่มและเชื่อมโยง LO', description: `วิชาที่เชื่อม LO แล้ว ${summary.mappedSubjects} จาก ${summary.subjects}`, value: summary.los, unit: 'LO', ready: summary.los > 0 && summary.subjects > 0 && summary.mappedSubjects === summary.subjects, icon: Database, action: () => navigate('/admin?tab=mapping') },
    ];
    const readiness = calculateSetupReadiness(summary);
    const readyCount = readiness.completed;

    return (
        <Layout title="ศูนย์ตั้งค่าข้อมูล">
            <div className="mx-auto max-w-6xl space-y-5 pb-12">
                <header className="border-b border-slate-200 pb-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-extrabold text-slate-950">ตั้งค่าข้อมูลทีละขั้น</h1><p className="mt-1 text-sm leading-6 text-slate-600">ทำจากบนลงล่าง ระบบบอกว่าส่วนไหนพร้อมและควรทำอะไรต่อ</p></div><div className="surface-selected rounded-xl px-4 py-3 text-sm font-bold text-blue-900">พร้อม {readyCount}/{readiness.total} ขั้น</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="action-primary h-full rounded-full" style={{ width: `${readiness.percent}%` }} /></div></header>

                <SchoolBrandingSettings />

                {loadError && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4" role="alert"><div className="flex gap-3"><AlertTriangle className="h-5 w-5 shrink-0 text-rose-700" /><div><h2 className="font-extrabold text-rose-950">โหลดสถานะการตั้งค่าไม่สำเร็จ</h2><p className="mt-1 text-sm text-rose-800">{loadError}</p><button onClick={loadSummary} className="mt-3 min-h-11 rounded-lg bg-rose-700 px-4 text-sm font-bold text-white">ลองโหลดอีกครั้ง</button></div></div></section>}

                {(summary.missingRooms > 0 || summary.emptyGroups > 0 || summary.teacherlessGroups > 0) && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" /><div><h2 className="font-extrabold text-amber-950">มีข้อมูลที่ต้องจัดการก่อนเริ่มประเมิน</h2><ul className="mt-2 space-y-1 text-sm text-amber-900">{summary.missingRooms > 0 && <li>• นักเรียนไม่มีชั้นหรือห้องประจำชั้น {summary.missingRooms} คน</li>}{summary.emptyGroups > 0 && <li>• กลุ่มเรียนยังไม่มีสมาชิก {summary.emptyGroups} กลุ่ม</li>}{summary.teacherlessGroups > 0 && <li>• กลุ่มเรียนยังไม่มีครูรับผิดชอบ {summary.teacherlessGroups} กลุ่ม</li>}</ul></div></div></section>}

                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{steps.map((step, index) => <button key={step.title} onClick={step.action} className="group grid min-h-20 w-full gap-4 border-b border-slate-200 p-5 text-left last:border-b-0 hover:bg-slate-50 sm:grid-cols-[44px_minmax(0,1fr)_140px_36px] sm:items-center"><span className={`flex h-11 w-11 items-center justify-center rounded-xl font-extrabold ${step.ready ? 'surface-success text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{step.ready ? <CheckCircle2 className="h-5 w-5" /> : index + 1}</span><div><h2 className="font-extrabold text-slate-950">{step.title}</h2><p className={`mt-1 text-sm ${step.ready ? 'text-slate-600' : 'text-amber-800'}`}>{step.description}</p></div><div className="sm:text-right"><strong className="text-xl font-extrabold text-slate-900">{loading ? '–' : step.value.toLocaleString()}</strong><span className="ml-1 text-sm font-bold text-slate-500">{step.unit}</span><p className={`mt-1 text-xs font-extrabold ${step.ready ? 'text-emerald-700' : 'text-amber-700'}`}>{step.ready ? 'พร้อมแล้ว' : 'รอดำเนินการ'}</p></div><ArrowRight className="hidden h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-700 sm:block" /></button>)}</section>
            </div>
        </Layout>
    );
}
