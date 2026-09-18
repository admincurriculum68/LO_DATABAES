import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Check, Save, Search, UserPlus, UserRound, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import { useDialog } from '../lib/dialogContext';
import { fetchAllRows, supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/roles';
import {
    ROLE_CHOICES, personSearchText, primaryTeacherRoleOf, teacherRoleSummary, teacherRolesOf, personFieldErrors, thaiDobPassword,
    STUDENT_STATUS_CHOICES, studentStatusLabel,
} from '../lib/people';
import { syncTeacherRoles } from '../lib/peopleApi';
import { normalizeCitizenInput, sanitizeCitizenId } from '../lib/importSanitizers';
import { LEAVE_STATUS, placementSummary, planStudentPlacement } from '../lib/studentPlacement';
import { gradeOfRoom } from '../lib/teacherAccess';
import {
    applyStudentPlacement, createStudent, findCitizenOwner, loadRoomSubjects, loadStudentTermEnrollments,
} from '../lib/studentPlacementApi';

const TEACHER_SELECT = 'teacher_id, citizen_id, prefix, first_name, last_name, role, homeroom, is_active, teacher_roles(role, is_primary)';
const STUDENT_SELECT = 'student_id, citizen_id, student_code, prefix, first_name, last_name, current_grade_level, current_room, student_status';

const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim() || 'ไม่ระบุชื่อ';
const isActivePerson = (person, kind) => (kind === 'teachers' ? person.is_active === true : person.student_status === 'active');
const inactiveLabel = kind => (kind === 'teachers' ? 'ระงับการใช้งาน' : 'ย้ายออก ลาออก หรือจบการศึกษา');
const BLANK_STUDENT = {
    citizen_id: '', dob: '', student_code: '', prefix: '', first_name: '', last_name: '',
    current_grade_level: '', current_room: '', student_status: 'active',
};

function Field({ label, hint, error, errorId, children }) {
    return (
        <label className="block">
            <span className="text-sm font-bold text-slate-800">{label}</span>
            {hint && <span className="mt-0.5 block text-xs text-slate-600">{hint}</span>}
            <div className="mt-2">{children}</div>
            {error && (
                <span id={errorId} className="mt-1.5 flex items-start gap-1.5 text-sm font-bold text-rose-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}
                </span>
            )}
        </label>
    );
}

const inputClass = 'min-h-11 w-full rounded-xl border border-field bg-white px-3 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-600 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200 aria-invalid:border-rose-600 aria-invalid:ring-2 aria-invalid:ring-rose-200';

export default function PeopleManager() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const dialog = useDialog();
    const [searchParams, setSearchParams] = useSearchParams();

    const kind = searchParams.get('type') === 'students' ? 'students' : 'teachers';
    const [teachers, setTeachers] = useState([]);
    const [students, setStudents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [groupFilter, setGroupFilter] = useState('all');
    const [selectedId, setSelectedId] = useState('');
    const [draft, setDraft] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [saving, setSaving] = useState(false);
    // เพิ่มนักเรียนใหม่ใช้แผงเดียวกับการแก้ไข
    const [creating, setCreating] = useState(false);
    const [roomPreview, setRoomPreview] = useState({ room: '', subjects: [], loading: false });

    const idKey = kind === 'teachers' ? 'teacher_id' : 'student_id';
    const people = kind === 'teachers' ? teachers : students;

    const loadPeople = useCallback(async () => {
        if (!currentUser?.school_id) return;
        setLoading(true);
        setLoadError('');
        try {
            // โหลดทั้งโรงเรียนเพื่อให้ค้นหาเจอทุกคน ไม่ใช่เฉพาะหน้าที่เปิดอยู่
            const [teacherRows, studentRows] = await Promise.all([
                fetchAllRows((from, to) => supabase.from('users_teachers').select(TEACHER_SELECT)
                    .eq('school_id', currentUser.school_id).order('first_name').range(from, to)),
                fetchAllRows((from, to) => supabase.from('users_students').select(STUDENT_SELECT)
                    .eq('school_id', currentUser.school_id).order('student_code').range(from, to)),
            ]);
            setTeachers(teacherRows);
            setStudents(studentRows);
        } catch (error) {
            setLoadError(error.message || 'โหลดข้อมูลไม่สำเร็จ');
        } finally {
            setLoading(false);
        }
    }, [currentUser?.school_id]);

    useEffect(() => { loadPeople(); }, [loadPeople]);

    const groupOptions = useMemo(() => {
        if (kind === 'teachers') return ROLE_CHOICES.map(([value, label]) => ({ value, label }));
        return [...new Set(students.map(item => item.current_room).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'th'))
            .map(room => ({ value: room, label: `ห้อง ${room}` }));
    }, [kind, students]);

    const visiblePeople = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return people.filter(person => {
            if (needle && !personSearchText(person).includes(needle)) return false;
            if (statusFilter !== 'all' && isActivePerson(person, kind) !== (statusFilter === 'active')) return false;
            if (groupFilter !== 'all') {
                if (kind === 'teachers' && !teacherRolesOf(person).includes(groupFilter)) return false;
                if (kind === 'students' && person.current_room !== groupFilter) return false;
            }
            return true;
        });
    }, [people, query, statusFilter, groupFilter, kind]);

    const selected = useMemo(
        () => people.find(person => person[idKey] === selectedId) || null,
        [people, selectedId, idKey],
    );

    // เตรียมแบบร่างใหม่ทุกครั้งที่เปลี่ยนคนที่เลือก เพื่อไม่ให้ค่าที่แก้ค้างข้ามคน
    useEffect(() => {
        if (creating) return;
        if (!selected) { setDraft(null); return; }
        setDraft(kind === 'teachers'
            ? {
                citizen_id: selected.citizen_id || '', prefix: selected.prefix || '',
                first_name: selected.first_name || '', last_name: selected.last_name || '',
                homeroom: selected.homeroom || '', is_active: selected.is_active !== false,
                roles: teacherRolesOf(selected), role: primaryTeacherRoleOf(selected),
            }
            : {
                citizen_id: selected.citizen_id || '', student_code: selected.student_code || '',
                prefix: selected.prefix || '', first_name: selected.first_name || '', last_name: selected.last_name || '',
                current_grade_level: selected.current_grade_level || '', current_room: selected.current_room || '',
                student_status: selected.student_status || 'active',
            });
    }, [selected, kind, creating]);

    // ตอนเพิ่มนักเรียน แสดงวิชาที่จะจัดให้ตามห้องที่กรอก
    const previewRoom = creating ? String(draft?.current_room || '').trim() : '';
    useEffect(() => {
        if (!previewRoom) { setRoomPreview({ room: '', subjects: [], loading: false }); return undefined; }
        let cancelled = false;
        setRoomPreview(current => ({ ...current, loading: true }));
        const timer = setTimeout(() => {
            loadRoomSubjects({ schoolId: currentUser?.school_id, academicYear, semester, room: previewRoom })
                .then(({ subjects }) => { if (!cancelled) setRoomPreview({ room: previewRoom, subjects, loading: false }); })
                .catch(() => { if (!cancelled) setRoomPreview({ room: previewRoom, subjects: [], loading: false, failed: true }); });
        }, 400);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [academicYear, currentUser?.school_id, previewRoom, semester]);

    const startCreate = () => {
        setSelectedId('');
        setFieldErrors({});
        setCreating(true);
        setDraft({ ...BLANK_STUDENT, current_room: groupFilter !== 'all' ? groupFilter : '' });
    };

    const closePanel = () => {
        setCreating(false);
        setSelectedId('');
    };

    const switchKind = nextKind => {
        setSearchParams(nextKind === 'students' ? { type: 'students' } : {}, { replace: true });
        setSelectedId('');
        setCreating(false);
        setQuery('');
        setStatusFilter('all');
        setGroupFilter('all');
    };

    const toggleRole = role => {
        setDraft(current => {
            const owned = new Set(current.roles);
            if (owned.has(role)) owned.delete(role); else owned.add(role);
            const nextRoles = ROLE_CHOICES.map(([value]) => value).filter(value => owned.has(value));
            if (nextRoles.length === 0) {
                toast.error('ครู 1 คนต้องมีอย่างน้อย 1 บทบาท');
                return current;
            }
            return { ...current, roles: nextRoles, role: nextRoles.includes(current.role) ? current.role : nextRoles[0] };
        });
    };

    const updateDraft = (key, value) => {
        setDraft(current => ({ ...current, [key]: value }));
        setFieldErrors(current => ({ ...current, [key]: undefined }));
    };
    const invalidProps = key => ({
        id: `person-${key}`,
        'aria-invalid': fieldErrors[key] ? true : undefined,
        'aria-describedby': fieldErrors[key] ? `person-${key}-error` : undefined,
    });

    const focusFirstError = errors => {
        const firstInvalid = Object.keys(errors)[0];
        if (firstInvalid) document.getElementById(`person-${firstInvalid}`)?.focus();
        return Boolean(firstInvalid);
    };

    // วิชาของภาคเรียนนี้ที่ต้องเปลี่ยนเมื่อย้ายห้อง ย้ายออก หรือกลับมาเรียน ถามก่อนทุกครั้ง
    // คืน null ถ้าผู้ใช้ยกเลิก คืน { plan } ถ้าไปต่อได้ (plan ว่างได้)
    const confirmPlacement = async ({ mode, room, name }) => {
        const withdraw = mode === 'withdraw';
        const { subjects, termSubjects } = await loadRoomSubjects({
            schoolId: currentUser.school_id, academicYear, semester, room: withdraw ? '' : room,
        });
        const enrollments = await loadStudentTermEnrollments(selectedId, termSubjects.map(subject => subject.subject_id));
        const plan = planStudentPlacement({
            enrollments,
            targetSubjectIds: withdraw ? [] : subjects.map(subject => subject.subject_id),
            targetRoom: room || null,
            leaveStatus: withdraw ? LEAVE_STATUS.withdraw : LEAVE_STATUS.move,
        });
        if (!plan.hasChanges) return { plan };
        const names = new Map(termSubjects.map(subject => [subject.subject_id, subject.subject_name]));
        const lines = placementSummary(plan, names);
        if (!withdraw && room && subjects.length === 0) {
            lines.unshift(`ห้อง ${room} ยังไม่มีวิชาในภาคเรียนที่ ${semester}/${academicYear} ตรวจชื่อห้องอีกครั้ง`);
        }
        const copy = {
            withdraw: { title: `บันทึกว่า ${name} ${studentStatusLabel(draft.student_status)}?`, confirmLabel: 'นำออกจากทุกวิชา' },
            reopen: { title: `${name} กลับมาเรียนห้อง ${room || '-'}?`, confirmLabel: 'จัดเข้าวิชาของห้อง' },
            move: { title: room ? `ย้าย ${name} ไปห้อง ${room}?` : `นำ ${name} ออกจากห้องเรียน?`, confirmLabel: 'ย้ายห้องและวิชา' },
        }[mode];
        const confirmed = await dialog.confirm({
            ...copy,
            message: `ภาคเรียนที่ ${semester}/${academicYear}\n${lines.map(line => `• ${line}`).join('\n')}`,
            tone: plan.toLeave.length ? 'danger' : undefined,
        });
        return confirmed ? { plan } : null;
    };

    const addStudent = async () => {
        const citizenId = sanitizeCitizenId(draft.citizen_id);
        const owner = await findCitizenOwner(citizenId);
        if (owner) {
            const message = owner.kind === 'teacher'
                ? 'เลขนี้เป็นของครูหรือบุคลากรในระบบแล้ว ตรวจเลขอีกครั้ง'
                : owner.school_id === currentUser.school_id
                    ? 'มีนักเรียนเลขนี้ในโรงเรียนแล้ว ค้นหาชื่อในรายการทางซ้ายแทนการเพิ่มใหม่'
                    : 'เลขนี้ถูกใช้ในโรงเรียนอื่นแล้ว ตรวจเลขอีกครั้ง';
            const errors = { citizen_id: message };
            setFieldErrors(errors);
            focusFirstError(errors);
            return;
        }
        const room = draft.current_room.trim();
        const { subjects } = await loadRoomSubjects({ schoolId: currentUser.school_id, academicYear, semester, room });
        const plan = planStudentPlacement({ enrollments: [], targetSubjectIds: subjects.map(subject => subject.subject_id), targetRoom: room || null });
        const studentId = await createStudent({
            schoolId: currentUser.school_id,
            dob: thaiDobPassword(draft.dob),
            student: {
                citizen_id: citizenId,
                student_code: draft.student_code.trim(),
                prefix: draft.prefix.trim(),
                first_name: draft.first_name.trim(),
                last_name: draft.last_name.trim(),
                current_grade_level: draft.current_grade_level.trim() || gradeOfRoom(room),
                current_room: room,
            },
        });
        const name = fullName(draft);
        try {
            if (plan.hasChanges) {
                await applyStudentPlacement({
                    studentId, plan, schoolId: currentUser.school_id, actor: currentUser,
                    action: 'add_student', detail: { room, academic_year: academicYear, semester },
                });
            }
            toast.success(subjects.length
                ? `เพิ่ม ${name} แล้ว เข้าเรียน ${subjects.length} วิชาของห้อง ${room}`
                : `เพิ่ม ${name} แล้ว ยังไม่ได้เข้าวิชาใด`);
        } catch (error) {
            toast.error(`เพิ่ม ${name} แล้ว แต่จัดเข้าวิชาไม่สำเร็จ: ${error.message} เปิดชื่อนักเรียนแล้วแก้ห้องเพื่อจัดวิชาอีกครั้ง`);
        }
        setCreating(false);
        await loadPeople();
        setSelectedId(studentId);
    };

    const save = async () => {
        const errors = personFieldErrors(kind, draft);
        setFieldErrors(errors);
        if (focusFirstError(errors)) return;
        setSaving(true);
        try {
            if (creating) {
                await addStudent();
                return;
            }
            const citizenId = sanitizeCitizenId(draft.citizen_id);
            if (kind === 'teachers') {
                const { error } = await supabase.from('users_teachers').update({
                    citizen_id: citizenId, prefix: draft.prefix.trim(),
                    first_name: draft.first_name.trim(), last_name: draft.last_name.trim(),
                    homeroom: draft.homeroom.trim() || null, is_active: draft.is_active, role: draft.role,
                }).eq('teacher_id', selectedId).eq('school_id', currentUser.school_id);
                if (error) throw error;
                await syncTeacherRoles(selectedId, draft.roles, draft.role);
            } else {
                const roomBefore = String(selected.current_room || '').trim();
                const roomAfter = draft.current_room.trim();
                const wasActive = selected.student_status === 'active';
                const isActive = draft.student_status === 'active';
                const mode = wasActive && !isActive ? 'withdraw'
                    : !wasActive && isActive ? 'reopen'
                        : isActive && roomBefore !== roomAfter ? 'move' : null;
                // จัดวิชาก่อนแก้ข้อมูลนักเรียน ถ้าล้มกลางทาง กดบันทึกซ้ำแล้วระบบคำนวณจากข้อมูลล่าสุดใหม่
                if (mode && academicYear && semester) {
                    const decision = await confirmPlacement({ mode, room: roomAfter, name: fullName(selected) });
                    if (!decision) return;
                    if (decision.plan.hasChanges) {
                        await applyStudentPlacement({
                            studentId: selectedId, plan: decision.plan, schoolId: currentUser.school_id, actor: currentUser,
                            action: { withdraw: 'withdraw_student', reopen: 'reopen_student', move: 'move_student_room' }[mode],
                            detail: { from_room: roomBefore || null, to_room: roomAfter || null, academic_year: academicYear, semester },
                        });
                    }
                }
                const { error } = await supabase.from('users_students').update({
                    citizen_id: citizenId, student_code: draft.student_code.trim() || null,
                    prefix: draft.prefix.trim(), first_name: draft.first_name.trim(), last_name: draft.last_name.trim(),
                    current_grade_level: draft.current_grade_level.trim() || null,
                    current_room: roomAfter || null, student_status: draft.student_status,
                }).eq('student_id', selectedId).eq('school_id', currentUser.school_id);
                if (error) throw error;
            }
            toast.success('บันทึกข้อมูลแล้ว');
            await loadPeople();
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const detailOpen = Boolean(selectedId) || creating;
    const roomOptions = groupOptions.map(option => option.value);

    return (
        <Layout title="ครูและนักเรียน">
            <div className="mx-auto w-full max-w-7xl space-y-5">
                <header>
                    <h1 className="text-2xl font-bold text-slate-950">ครูและนักเรียน</h1>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                        ค้นหาและแก้ไขข้อมูลรายบุคคล การเปลี่ยนบทบาทมีผลกับเมนูที่ครูท่านนั้นเห็นทันทีที่เข้าสู่ระบบครั้งถัดไป
                    </p>
                </header>

                <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm" aria-label="ตัวกรอง">
                    <div className="flex rounded-xl border border-slate-300 p-1" role="group" aria-label="เลือกกลุ่มผู้ใช้">
                        {[['teachers', 'ครูและบุคลากร'], ['students', 'นักเรียน']].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => switchKind(value)}
                                aria-pressed={kind === value}
                                className={`min-h-11 rounded-lg px-4 text-sm font-bold transition ${kind === value ? 'action-primary' : 'text-slate-700 hover:bg-slate-100'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <label className="relative min-w-60 flex-1">
                        <span className="sr-only">ค้นหาชื่อ เลขประจำตัวประชาชน หรือห้องเรียน</span>
                        <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-500" />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="ค้นหาชื่อ เลขประจำตัว หรือห้องเรียน"
                            className="min-h-11 w-full rounded-xl border border-field pl-9 pr-3 text-sm placeholder:text-slate-600 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                    </label>

                    <select
                        aria-label={kind === 'teachers' ? 'กรองตามบทบาท' : 'กรองตามห้องเรียน'}
                        value={groupFilter}
                        onChange={event => setGroupFilter(event.target.value)}
                        className="min-h-11 rounded-xl border border-field bg-white px-3 text-sm font-bold text-slate-800"
                    >
                        <option value="all">{kind === 'teachers' ? 'ทุกบทบาท' : 'ทุกห้องเรียน'}</option>
                        {groupOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>

                    <select
                        aria-label="กรองตามสถานะ"
                        value={statusFilter}
                        onChange={event => setStatusFilter(event.target.value)}
                        className="min-h-11 rounded-xl border border-field bg-white px-3 text-sm font-bold text-slate-800"
                    >
                        <option value="all">ทุกสถานะ</option>
                        <option value="active">ใช้งานอยู่</option>
                        <option value="inactive">{inactiveLabel(kind)}</option>
                    </select>
                </section>

                {loadError && (
                    <p className="surface-danger flex items-start gap-2 rounded-2xl border border-rose-200 p-4 text-sm font-bold text-rose-900">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}
                    </p>
                )}

                <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                    <aside className={`overflow-hidden rounded-2xl border border-line bg-white ${detailOpen ? 'hidden lg:block' : ''}`}>
                        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                            <div>
                                <h2 className="font-bold text-slate-900">
                                    {kind === 'teachers' ? 'ครูและบุคลากร' : 'นักเรียน'} {visiblePeople.length} คน
                                </h2>
                                {visiblePeople.length !== people.length && (
                                    <p className="mt-0.5 text-xs text-slate-600">จากทั้งหมด {people.length} คน</p>
                                )}
                            </div>
                            {kind === 'students' && (
                                <button type="button" onClick={startCreate} aria-pressed={creating} className="action-primary inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-bold">
                                    <UserPlus className="h-4 w-4" aria-hidden="true" />เพิ่มนักเรียน
                                </button>
                            )}
                        </div>
                        <div className="max-h-[640px] divide-y divide-line overflow-y-auto">
                            {loading ? (
                                <div className="h-64 animate-pulse bg-slate-100" />
                            ) : visiblePeople.length ? visiblePeople.map(person => {
                                const active = isActivePerson(person, kind);
                                return (
                                    <button
                                        key={person[idKey]}
                                        type="button"
                                        onClick={() => { setCreating(false); setSelectedId(person[idKey]); setFieldErrors({}); }}
                                        aria-current={selectedId === person[idKey] ? 'true' : undefined}
                                        className={`flex w-full items-center gap-3 p-4 text-left ${selectedId === person[idKey] ? 'surface-selected' : 'hover:bg-slate-50'}`}
                                    >
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                            <UserRound className="h-5 w-5" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <strong className="block truncate text-sm text-slate-950">{fullName(person)}</strong>
                                            <span className="mt-1 block truncate text-xs text-slate-600">
                                                {kind === 'teachers'
                                                    ? teacherRoleSummary(person)
                                                    : `${person.student_code || 'ไม่มีรหัส'} · ${person.current_room || 'ยังไม่จัดห้อง'}`}
                                            </span>
                                        </span>
                                        {!active && (
                                            <span className="shrink-0 rounded-lg border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                                                {kind === 'teachers' ? 'ระงับ' : studentStatusLabel(person.student_status)}
                                            </span>
                                        )}
                                    </button>
                                );
                            }) : (
                                <div className="p-10 text-center text-sm text-slate-600">
                                    <Users className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                                    {people.length === 0
                                        ? `ยังไม่มีข้อมูล${kind === 'teachers' ? 'ครู' : 'นักเรียน'} เริ่มจากการนำเข้าไฟล์ที่เมนูตั้งค่าข้อมูล`
                                        : 'ไม่พบคนที่ตรงกับที่ค้นหา ลองลดตัวกรองลง'}
                                </div>
                            )}
                        </div>
                    </aside>

                    <section className={`overflow-hidden rounded-2xl border border-line bg-white ${detailOpen ? '' : 'hidden lg:block'}`}>
                        {(!selected && !creating) || !draft ? (
                            <div className="p-16 text-center text-slate-600">
                                <UserRound className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                                เลือกรายชื่อทางซ้ายเพื่อดูและแก้ไขข้อมูล
                            </div>
                        ) : (
                            <>
                                <header className="border-b border-line p-5">
                                    <button type="button" onClick={closePanel} className="btn-ghost -ml-2 mb-2 lg:hidden">
                                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับไปรายชื่อ
                                    </button>
                                    <h2 className="text-lg font-bold text-slate-950">{creating ? 'เพิ่มนักเรียนใหม่' : fullName(selected)}</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        {creating
                                            ? `บันทึกแล้วระบบจัดเข้าทุกวิชาของห้องในภาคเรียนที่ ${semester}/${academicYear} ให้`
                                            : kind === 'teachers'
                                                ? teacherRoleSummary(selected)
                                                : `${selected.current_grade_level || 'ยังไม่ระบุชั้น'} · ห้อง ${selected.current_room || 'ยังไม่จัด'}`}
                                    </p>
                                </header>

                                <div className="space-y-6 p-5">
                                    <section className="space-y-4">
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">ข้อมูลส่วนตัว</h3>
                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <Field label="คำนำหน้า">
                                                <input value={draft.prefix} onChange={e => updateDraft('prefix', e.target.value)} className={inputClass} />
                                            </Field>
                                            <Field label="ชื่อ" error={fieldErrors.first_name} errorId="person-first_name-error">
                                                <input {...invalidProps('first_name')} value={draft.first_name} onChange={e => updateDraft('first_name', e.target.value)} className={inputClass} />
                                            </Field>
                                            <Field label="นามสกุล" error={fieldErrors.last_name} errorId="person-last_name-error">
                                                <input {...invalidProps('last_name')} value={draft.last_name} onChange={e => updateDraft('last_name', e.target.value)} className={inputClass} />
                                            </Field>
                                        </div>
                                        <Field label="เลขประจำตัวประชาชน" hint="ใช้เข้าสู่ระบบ หากแก้ผิด เจ้าของบัญชีจะเข้าสู่ระบบไม่ได้ นักเรียนที่ไม่มีเลขประจำตัวประชาชนใช้เลข G ได้" error={fieldErrors.citizen_id} errorId="person-citizen_id-error">
                                            <input
                                                {...invalidProps('citizen_id')}
                                                value={draft.citizen_id}
                                                onChange={e => updateDraft('citizen_id', normalizeCitizenInput(e.target.value))}
                                                inputMode="numeric" maxLength={13}
                                                className={`${inputClass} font-mono tracking-wide`}
                                            />
                                        </Field>
                                        {creating && (
                                            <Field label="วันเดือนปีเกิด" hint="ใช้เป็นรหัสผ่านเข้าสู่ระบบ 8 หลัก ปี พ.ศ. เช่น 05012560" error={fieldErrors.dob} errorId="person-dob-error">
                                                <input
                                                    {...invalidProps('dob')}
                                                    value={draft.dob}
                                                    onChange={e => updateDraft('dob', e.target.value)}
                                                    inputMode="numeric" maxLength={10} autoComplete="off" placeholder="วันเดือนปี พ.ศ."
                                                    className={`${inputClass} font-mono tracking-wide`}
                                                />
                                            </Field>
                                        )}
                                    </section>

                                    {kind === 'teachers' ? (
                                        <section className="space-y-4">
                                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">บทบาทและหน้าที่</h3>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">บทบาทในระบบ</p>
                                                <p className="mt-0.5 text-xs text-slate-600">ครู 1 ท่านทำหน้าที่พร้อมกันได้หลายบทบาท บทบาทหลักใช้กำหนดหน้าแรกหลังเข้าสู่ระบบ</p>
                                                <div className="mt-3 space-y-2">
                                                    {ROLE_CHOICES.map(([value, label]) => {
                                                        const owned = draft.roles.includes(value);
                                                        const primary = draft.role === value;
                                                        return (
                                                            <div key={value} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${owned ? 'border-indigo-300 surface-selected' : 'border-line'}`}>
                                                                <label className="flex flex-1 cursor-pointer items-center gap-3 text-sm font-bold text-slate-900">
                                                                    <span className={`flex h-6 w-6 items-center justify-center rounded-lg border-2 ${owned ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                                                                        <Check className="h-4 w-4" />
                                                                    </span>
                                                                    <input type="checkbox" className="sr-only" checked={owned} onChange={() => toggleRole(value)} />
                                                                    {label}
                                                                </label>
                                                                {owned && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDraft({ ...draft, role: value })}
                                                                        className={`min-h-11 rounded-lg border px-3 text-xs font-bold ${primary ? 'action-primary border-indigo-700' : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'}`}
                                                                    >
                                                                        {primary ? 'บทบาทหลัก' : 'ตั้งเป็นหลัก'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {fieldErrors.roles && <p id="person-roles-error" className="mt-2 text-sm font-bold text-rose-700">{fieldErrors.roles}</p>}
                                            </div>
                                            <Field label="ห้องประจำชั้น" hint="กรอกเมื่อเป็นครูประจำชั้น เช่น ป.1/1 จะทำให้เมนูงานประจำชั้นแสดงขึ้น">
                                                <input value={draft.homeroom} onChange={e => setDraft({ ...draft, homeroom: e.target.value })} placeholder="เว้นว่างหากไม่ได้เป็นครูประจำชั้น" className={inputClass} />
                                            </Field>
                                        </section>
                                    ) : (
                                        <section className="space-y-4">
                                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">ข้อมูลการเรียน</h3>
                                            <div className="grid gap-4 sm:grid-cols-3">
                                                <Field label="รหัสนักเรียน">
                                                    <input value={draft.student_code} onChange={e => setDraft({ ...draft, student_code: e.target.value })} className={inputClass} />
                                                </Field>
                                                <Field label="ระดับชั้น">
                                                    <input value={draft.current_grade_level} onChange={e => setDraft({ ...draft, current_grade_level: e.target.value })} placeholder="เช่น ป.1" className={inputClass} />
                                                </Field>
                                                <Field label="ห้องเรียน">
                                                    <input value={draft.current_room} onChange={e => setDraft({ ...draft, current_room: e.target.value })} list="student-room-options" placeholder="เช่น ป.1/1" className={inputClass} />
                                                </Field>
                                            </div>
                                            <datalist id="student-room-options">
                                                {roomOptions.map(room => <option key={room} value={room} />)}
                                            </datalist>
                                            {creating ? (
                                                <div className="rounded-xl border border-line bg-slate-50 p-4 text-sm" aria-live="polite">
                                                    {!previewRoom ? (
                                                        <p className="text-slate-600">กรอกห้องเรียน ระบบจะจัดเข้าทุกวิชาของห้องนั้นให้</p>
                                                    ) : roomPreview.loading || roomPreview.room !== previewRoom ? (
                                                        <p className="text-slate-600">กำลังดูวิชาของห้อง {previewRoom}...</p>
                                                    ) : roomPreview.subjects.length ? (
                                                        <>
                                                            <p className="font-bold text-slate-900">จะเข้าเรียน {roomPreview.subjects.length} วิชาของห้อง {previewRoom}</p>
                                                            <p className="mt-1 leading-6 text-slate-700">{roomPreview.subjects.map(subject => subject.subject_name).join(' · ')}</p>
                                                        </>
                                                    ) : (
                                                        <p className="flex items-start gap-2 font-bold text-amber-800">
                                                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                                            {roomPreview.failed
                                                                ? 'ดูวิชาของห้องไม่สำเร็จ ลองพิมพ์ห้องอีกครั้ง'
                                                                : `ห้อง ${previewRoom} ยังไม่มีวิชาในภาคเรียนนี้ ตรวจชื่อห้อง หรือเพิ่มแล้วจัดเข้าวิชาภายหลัง`}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-600">เปลี่ยนห้องแล้ว ระบบจะถามก่อนย้ายวิชาของภาคเรียนนี้ไปห้องใหม่ ข้อความ LO ของวิชาเดิมย้ายตามไปด้วย</p>
                                            )}
                                        </section>
                                    )}

                                    {!creating && (
                                        <section className="space-y-4">
                                            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600">สถานะบัญชี</h3>
                                            <Field
                                                label="สถานะการใช้งาน"
                                                hint={kind === 'teachers'
                                                    ? 'บัญชีที่ระงับจะเข้าสู่ระบบไม่ได้ แต่ผลงานที่บันทึกไว้ยังอยู่ครบ'
                                                    : 'นักเรียนที่ไม่ได้เรียนแล้วจะเข้าสู่ระบบไม่ได้ และชื่อจะหายจากหน้าครูทุกวิชาของภาคเรียนนี้ ข้อความที่บันทึกไว้ยังเก็บอยู่'}
                                            >
                                                <select
                                                    value={kind === 'teachers' ? String(draft.is_active) : draft.student_status}
                                                    onChange={e => setDraft(kind === 'teachers'
                                                        ? { ...draft, is_active: e.target.value === 'true' }
                                                        : { ...draft, student_status: e.target.value })}
                                                    className={inputClass}
                                                >
                                                    {kind === 'teachers' ? (
                                                        <><option value="true">ใช้งานอยู่</option><option value="false">ระงับการใช้งาน</option></>
                                                    ) : (
                                                        STUDENT_STATUS_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)
                                                    )}
                                                </select>
                                            </Field>
                                        </section>
                                    )}
                                </div>

                                <footer className="flex flex-col-reverse gap-2 border-t border-line p-5 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={closePanel}
                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                    >
                                        <X className="h-4 w-4" />ปิด
                                    </button>
                                    <button
                                        type="button"
                                        onClick={save}
                                        disabled={saving}
                                        className="action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:opacity-50"
                                    >
                                        {creating ? <UserPlus className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                                        {saving ? 'กำลังบันทึก...' : creating ? 'เพิ่มนักเรียน' : 'บันทึกข้อมูล'}
                                    </button>
                                </footer>
                            </>
                        )}
                    </section>
                </div>
            </div>
        </Layout>
    );
}
