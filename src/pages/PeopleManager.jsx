import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, Save, Search, UserRound, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../AuthContext';
import { fetchAllRows, supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/roles';
import {
    ROLE_CHOICES, personSearchText, primaryTeacherRoleOf, teacherRoleSummary, teacherRolesOf, validatePersonDraft,
} from '../lib/people';
import { syncTeacherRoles } from '../lib/peopleApi';

const TEACHER_SELECT = 'teacher_id, citizen_id, prefix, first_name, last_name, role, homeroom, is_active, teacher_roles(role, is_primary)';
const STUDENT_SELECT = 'student_id, citizen_id, student_code, prefix, first_name, last_name, current_grade_level, current_room, student_status';

const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim() || 'ไม่ระบุชื่อ';
const isActivePerson = (person, kind) => (kind === 'teachers' ? person.is_active === true : person.student_status === 'active');

function Field({ label, hint, children }) {
    return (
        <label className="block">
            <span className="text-sm font-extrabold text-slate-800">{label}</span>
            {hint && <span className="mt-0.5 block text-xs text-slate-600">{hint}</span>}
            <div className="mt-2">{children}</div>
        </label>
    );
}

const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 placeholder:font-normal placeholder:text-slate-600 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200';

export default function PeopleManager() {
    const { currentUser } = useAuth();
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
    const [saving, setSaving] = useState(false);

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
    }, [selected, kind]);

    const switchKind = nextKind => {
        setSearchParams(nextKind === 'students' ? { type: 'students' } : {}, { replace: true });
        setSelectedId('');
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

    const save = async () => {
        const problems = validatePersonDraft(kind, draft);
        if (problems.length) { toast.error(problems[0], { duration: 6000 }); return; }
        setSaving(true);
        try {
            const citizenId = String(draft.citizen_id).replace(/\D/g, '');
            if (kind === 'teachers') {
                const { error } = await supabase.from('users_teachers').update({
                    citizen_id: citizenId, prefix: draft.prefix.trim(),
                    first_name: draft.first_name.trim(), last_name: draft.last_name.trim(),
                    homeroom: draft.homeroom.trim() || null, is_active: draft.is_active, role: draft.role,
                }).eq('teacher_id', selectedId).eq('school_id', currentUser.school_id);
                if (error) throw error;
                await syncTeacherRoles(selectedId, draft.roles, draft.role);
            } else {
                const { error } = await supabase.from('users_students').update({
                    citizen_id: citizenId, student_code: draft.student_code.trim() || null,
                    prefix: draft.prefix.trim(), first_name: draft.first_name.trim(), last_name: draft.last_name.trim(),
                    current_grade_level: draft.current_grade_level.trim() || null,
                    current_room: draft.current_room.trim() || null, student_status: draft.student_status,
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

    return (
        <Layout title="ครูและนักเรียน">
            <div className="mx-auto w-full max-w-7xl space-y-5">
                <header>
                    <h2 className="text-2xl font-extrabold text-slate-950">ครูและนักเรียน</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                        ค้นหาและแก้ไขข้อมูลรายบุคคล การเปลี่ยนบทบาทมีผลกับเมนูที่ครูท่านนั้นเห็นทันทีที่เข้าสู่ระบบครั้งถัดไป
                    </p>
                </header>

                <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="ตัวกรอง">
                    <div className="flex rounded-xl border border-slate-300 p-1" role="group" aria-label="เลือกกลุ่มผู้ใช้">
                        {[['teachers', 'ครูและบุคลากร'], ['students', 'นักเรียน']].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => switchKind(value)}
                                aria-pressed={kind === value}
                                className={`min-h-11 rounded-lg px-4 text-sm font-extrabold transition ${kind === value ? 'action-primary' : 'text-slate-700 hover:bg-slate-100'}`}
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
                            className="min-h-11 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm placeholder:text-slate-600 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                    </label>

                    <select
                        aria-label={kind === 'teachers' ? 'กรองตามบทบาท' : 'กรองตามห้องเรียน'}
                        value={groupFilter}
                        onChange={event => setGroupFilter(event.target.value)}
                        className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800"
                    >
                        <option value="all">{kind === 'teachers' ? 'ทุกบทบาท' : 'ทุกห้องเรียน'}</option>
                        {groupOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>

                    <select
                        aria-label="กรองตามสถานะ"
                        value={statusFilter}
                        onChange={event => setStatusFilter(event.target.value)}
                        className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800"
                    >
                        <option value="all">ทุกสถานะ</option>
                        <option value="active">ใช้งานอยู่</option>
                        <option value="inactive">ระงับการใช้งาน</option>
                    </select>
                </section>

                {loadError && (
                    <p className="surface-danger flex items-start gap-2 rounded-2xl border border-rose-200 p-4 text-sm font-bold text-rose-900">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}
                    </p>
                )}

                <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-4 py-3">
                            <h3 className="font-extrabold text-slate-900">
                                {kind === 'teachers' ? 'ครูและบุคลากร' : 'นักเรียน'} {visiblePeople.length} คน
                            </h3>
                            {visiblePeople.length !== people.length && (
                                <p className="mt-0.5 text-xs text-slate-600">จากทั้งหมด {people.length} คน</p>
                            )}
                        </div>
                        <div className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
                            {loading ? (
                                <div className="h-64 animate-pulse bg-slate-100" />
                            ) : visiblePeople.length ? visiblePeople.map(person => {
                                const active = isActivePerson(person, kind);
                                return (
                                    <button
                                        key={person[idKey]}
                                        type="button"
                                        onClick={() => setSelectedId(person[idKey])}
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
                                            <span className="shrink-0 rounded-md border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                                                ระงับ
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

                    <main className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {!selected || !draft ? (
                            <div className="p-16 text-center text-slate-600">
                                <UserRound className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                                เลือกรายชื่อทางซ้ายเพื่อดูและแก้ไขข้อมูล
                            </div>
                        ) : (
                            <>
                                <header className="border-b border-slate-200 p-5">
                                    <h3 className="text-lg font-extrabold text-slate-950">{fullName(selected)}</h3>
                                    <p className="mt-1 text-sm text-slate-600">
                                        {kind === 'teachers'
                                            ? teacherRoleSummary(selected)
                                            : `${selected.current_grade_level || 'ยังไม่ระบุชั้น'} · ห้อง ${selected.current_room || 'ยังไม่จัด'}`}
                                    </p>
                                </header>

                                <div className="space-y-6 p-5">
                                    <section className="space-y-4">
                                        <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">ข้อมูลส่วนตัว</h4>
                                        <div className="grid gap-4 sm:grid-cols-3">
                                            <Field label="คำนำหน้า">
                                                <input value={draft.prefix} onChange={e => setDraft({ ...draft, prefix: e.target.value })} className={inputClass} />
                                            </Field>
                                            <Field label="ชื่อ">
                                                <input value={draft.first_name} onChange={e => setDraft({ ...draft, first_name: e.target.value })} className={inputClass} />
                                            </Field>
                                            <Field label="นามสกุล">
                                                <input value={draft.last_name} onChange={e => setDraft({ ...draft, last_name: e.target.value })} className={inputClass} />
                                            </Field>
                                        </div>
                                        <Field label="เลขประจำตัวประชาชน" hint="ใช้เข้าสู่ระบบ หากแก้ผิด เจ้าของบัญชีจะเข้าสู่ระบบไม่ได้">
                                            <input
                                                value={draft.citizen_id}
                                                onChange={e => setDraft({ ...draft, citizen_id: e.target.value.replace(/\D/g, '') })}
                                                inputMode="numeric" maxLength={13}
                                                className={`${inputClass} font-mono tracking-wide`}
                                            />
                                        </Field>
                                    </section>

                                    {kind === 'teachers' ? (
                                        <section className="space-y-4">
                                            <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">บทบาทและหน้าที่</h4>
                                            <div>
                                                <p className="text-sm font-extrabold text-slate-800">บทบาทในระบบ</p>
                                                <p className="mt-0.5 text-xs text-slate-600">ครู 1 ท่านทำหน้าที่พร้อมกันได้หลายบทบาท บทบาทหลักใช้กำหนดหน้าแรกหลังเข้าสู่ระบบ</p>
                                                <div className="mt-3 space-y-2">
                                                    {ROLE_CHOICES.map(([value, label]) => {
                                                        const owned = draft.roles.includes(value);
                                                        const primary = draft.role === value;
                                                        return (
                                                            <div key={value} className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${owned ? 'border-indigo-300 surface-selected' : 'border-slate-200'}`}>
                                                                <label className="flex flex-1 cursor-pointer items-center gap-3 text-sm font-bold text-slate-900">
                                                                    <span className={`flex h-6 w-6 items-center justify-center rounded border-2 ${owned ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                                                                        <Check className="h-4 w-4" />
                                                                    </span>
                                                                    <input type="checkbox" className="sr-only" checked={owned} onChange={() => toggleRole(value)} />
                                                                    {label}
                                                                </label>
                                                                {owned && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setDraft({ ...draft, role: value })}
                                                                        className={`min-h-9 rounded-lg border px-3 text-xs font-extrabold ${primary ? 'action-primary border-indigo-700' : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'}`}
                                                                    >
                                                                        {primary ? 'บทบาทหลัก' : 'ตั้งเป็นหลัก'}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <Field label="ห้องประจำชั้น" hint="กรอกเมื่อเป็นครูประจำชั้น เช่น ป.1/1 จะทำให้เมนูงานประจำชั้นแสดงขึ้น">
                                                <input value={draft.homeroom} onChange={e => setDraft({ ...draft, homeroom: e.target.value })} placeholder="เว้นว่างหากไม่ได้เป็นครูประจำชั้น" className={inputClass} />
                                            </Field>
                                        </section>
                                    ) : (
                                        <section className="space-y-4">
                                            <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">ข้อมูลการเรียน</h4>
                                            <div className="grid gap-4 sm:grid-cols-3">
                                                <Field label="รหัสนักเรียน">
                                                    <input value={draft.student_code} onChange={e => setDraft({ ...draft, student_code: e.target.value })} className={inputClass} />
                                                </Field>
                                                <Field label="ระดับชั้น">
                                                    <input value={draft.current_grade_level} onChange={e => setDraft({ ...draft, current_grade_level: e.target.value })} placeholder="เช่น ป.1" className={inputClass} />
                                                </Field>
                                                <Field label="ห้องเรียน">
                                                    <input value={draft.current_room} onChange={e => setDraft({ ...draft, current_room: e.target.value })} placeholder="เช่น ป.1/1" className={inputClass} />
                                                </Field>
                                            </div>
                                        </section>
                                    )}

                                    <section className="space-y-4">
                                        <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-600">สถานะบัญชี</h4>
                                        <Field label="สถานะการใช้งาน" hint="บัญชีที่ระงับจะเข้าสู่ระบบไม่ได้ แต่ผลงานที่บันทึกไว้ยังอยู่ครบ">
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
                                                    <><option value="active">ใช้งานอยู่</option><option value="inactive">ระงับการใช้งาน</option></>
                                                )}
                                            </select>
                                        </Field>
                                    </section>
                                </div>

                                <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 p-5 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId('')}
                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
                                    >
                                        <X className="h-4 w-4" />ปิด
                                    </button>
                                    <button
                                        type="button"
                                        onClick={save}
                                        disabled={saving}
                                        className="action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"
                                    >
                                        <Save className="h-4 w-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                                    </button>
                                </footer>
                            </>
                        )}
                    </main>
                </div>
            </div>
        </Layout>
    );
}
