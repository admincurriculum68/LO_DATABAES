import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    Check,
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    FolderKanban,
    Link2,
    PauseCircle,
    PlayCircle,
    Plus,
    Save,
    Search,
    Users,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';
import { LEARNING_FORMATS, LEARNING_FORMAT_ORDER, learningFormatLabel } from '../lib/terminology';

const TYPE_META = {
    subject: { icon: BookOpen, className: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
    learning_unit: { icon: ClipboardList, className: 'border-amber-200 bg-amber-50 text-amber-800' },
    project: { icon: FolderKanban, className: 'border-blue-200 bg-blue-50 text-blue-800' },
    activity: { icon: Users, className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    integrated_unit: { icon: ClipboardList, className: 'border-amber-200 bg-amber-50 text-amber-800' },
};

const EMPTY_FORM = {
    context_type: 'subject',
    context_name: '',
    description: '',
    subject_group: '',
    grade_level: '',
    responsible_teacher_id: '',
};

const GRADE_LEVELS = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
const itemKey = (source, id) => `${source}:${id}`;
const sameIds = (left, right) => [...left].sort().join('|') === [...right].sort().join('|');

function LoadingRows() {
    return (
        <div className="space-y-2" aria-label="กำลังโหลดรายการรูปแบบการจัดการเรียนรู้">
            {[1, 2, 3, 4].map(item => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
    );
}

export default function LearningContextManager() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const detailRef = useRef(null);
    const [learningFormats, setLearningFormats] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [los, setLos] = useState([]);
    const [mappedByItem, setMappedByItem] = useState({});
    const [selectedItemKey, setSelectedItemKey] = useState('');
    const [selectedLOs, setSelectedLOs] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [viewMode, setViewMode] = useState('manage');
    const [formatFilter, setFormatFilter] = useState('all');
    const [itemQuery, setItemQuery] = useState('');
    const [loQuery, setLoQuery] = useState('');
    const [areaFilter, setAreaFilter] = useState('all');
    const [showSelectedOnly, setShowSelectedOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mappingSaving, setMappingSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const loadData = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) {
            setLoading(true);
            return;
        }
        setLoading(true);
        setErrorMessage('');
        try {
            const [subjectsResult, contextsResult, teachersResult, loResult] = await Promise.all([
                supabase.from('subjects').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).order('subject_name'),
                supabase.from('learning_contexts').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).order('created_at'),
                supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name, role').eq('school_id', currentUser.school_id).eq('is_active', true).order('first_name'),
                supabase.from('learning_outcomes').select('lo_id, lo_code, ability_no, competency_area, lo_description').eq('school_id', currentUser.school_id).order('ability_no'),
            ]);
            if (subjectsResult.error) throw subjectsResult.error;
            if (contextsResult.error) throw contextsResult.error;
            if (teachersResult.error) throw teachersResult.error;
            if (loResult.error) throw loResult.error;

            const subjects = subjectsResult.data || [];
            const contexts = contextsResult.data || [];
            const subjectIds = subjects.map(item => item.subject_id);
            const contextIds = contexts.map(item => item.context_id);
            const [subjectMappingsResult, contextMappingsResult] = await Promise.all([
                subjectIds.length
                    ? supabase.from('subject_lo_mapping').select('subject_id, lo_id').in('subject_id', subjectIds)
                    : Promise.resolve({ data: [], error: null }),
                contextIds.length
                    ? supabase.from('learning_context_lo_mappings').select('context_id, lo_id').in('context_id', contextIds)
                    : Promise.resolve({ data: [], error: null }),
            ]);
            if (subjectMappingsResult.error) throw subjectMappingsResult.error;
            if (contextMappingsResult.error) throw contextMappingsResult.error;

            const items = [
                ...subjects.map(subject => ({
                    key: itemKey('subject', subject.subject_id),
                    source: 'subject',
                    recordId: subject.subject_id,
                    context_type: 'subject',
                    context_name: subject.subject_name,
                    description: subject.subject_group ? `กลุ่มสาระหรือกลุ่มวิชา: ${subject.subject_group}` : '',
                    grade_level: subject.grade_level,
                    responsible_teacher_id: subject.teacher_id,
                    is_active: true,
                })),
                ...contexts.map(context => ({
                    ...context,
                    key: itemKey('context', context.context_id),
                    source: 'context',
                    recordId: context.context_id,
                })),
            ].sort((a, b) => LEARNING_FORMAT_ORDER.indexOf(a.context_type) - LEARNING_FORMAT_ORDER.indexOf(b.context_type)
                || (a.context_name || '').localeCompare(b.context_name || '', 'th'));

            const mappingMap = {};
            (subjectMappingsResult.data || []).forEach(mapping => {
                const key = itemKey('subject', mapping.subject_id);
                if (!mappingMap[key]) mappingMap[key] = [];
                mappingMap[key].push(mapping.lo_id);
            });
            (contextMappingsResult.data || []).forEach(mapping => {
                const key = itemKey('context', mapping.context_id);
                if (!mappingMap[key]) mappingMap[key] = [];
                mappingMap[key].push(mapping.lo_id);
            });

            setLearningFormats(items);
            setTeachers(teachersResult.data || []);
            setLos(loResult.data || []);
            setMappedByItem(mappingMap);
            setSelectedItemKey(current => items.some(item => item.key === current) ? current : items[0]?.key || '');
        } catch (error) {
            const message = error.message || 'ไม่สามารถโหลดข้อมูลได้';
            setErrorMessage(message.includes('does not exist') || message.includes('schema cache')
                ? 'ระบบยังไม่มีโครงสร้างข้อมูลสำหรับรูปแบบการจัดการเรียนรู้ กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบการติดตั้งฐานข้อมูล'
                : `ไม่สามารถโหลดข้อมูลรูปแบบการจัดการเรียนรู้ได้: ${message}`);
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => { setSelectedLOs(mappedByItem[selectedItemKey] || []); }, [mappedByItem, selectedItemKey]);

    const selectedItem = learningFormats.find(item => item.key === selectedItemKey) || null;
    const savedSelectedLOs = mappedByItem[selectedItemKey] || [];
    const mappingDirty = selectedItem ? !sameIds(selectedLOs, savedSelectedLOs) : false;
    const isSubjectForm = form.context_type === 'subject';

    const teacherById = useMemo(() => Object.fromEntries(teachers.map(teacher => [
        teacher.teacher_id,
        `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`.trim(),
    ])), [teachers]);

    const formatCounts = useMemo(() => {
        const counts = Object.fromEntries(LEARNING_FORMAT_ORDER.map(type => [type, 0]));
        learningFormats.forEach(item => { counts[item.context_type] = (counts[item.context_type] || 0) + 1; });
        return counts;
    }, [learningFormats]);

    const filteredFormats = useMemo(() => {
        const normalized = itemQuery.trim().toLowerCase();
        return learningFormats.filter(item => {
            if (formatFilter !== 'all' && item.context_type !== formatFilter) return false;
            if (!normalized) return true;
            const teacherName = teacherById[item.responsible_teacher_id] || '';
            return `${item.context_name || ''} ${item.description || ''} ${item.grade_level || ''} ${teacherName}`.toLowerCase().includes(normalized);
        });
    }, [formatFilter, itemQuery, learningFormats, teacherById]);

    const competencyAreas = useMemo(() => [...new Set(los.map(lo => lo.competency_area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [los]);
    const filteredLOs = useMemo(() => {
        const normalized = loQuery.trim().toLowerCase();
        return los.filter(lo => {
            if (areaFilter !== 'all' && lo.competency_area !== areaFilter) return false;
            if (showSelectedOnly && !selectedLOs.includes(lo.lo_id)) return false;
            if (!normalized) return true;
            return `${lo.lo_code || ''} ${lo.competency_area || ''} ${lo.lo_description || ''}`.toLowerCase().includes(normalized);
        });
    }, [areaFilter, loQuery, los, selectedLOs, showSelectedOnly]);

    const updateForm = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

    const confirmDiscardMapping = () => !mappingDirty || window.confirm('ยังไม่ได้บันทึกการเชื่อมโยง LO ต้องการออกจากรายการนี้หรือไม่');

    const selectLearningFormat = key => {
        if (key === selectedItemKey || !confirmDiscardMapping()) return;
        setSelectedItemKey(key);
        setViewMode('manage');
        setLoQuery('');
        setAreaFilter('all');
        setShowSelectedOnly(false);
        window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const applyFormatFilter = type => {
        if (!confirmDiscardMapping()) return;
        const nextFilter = formatFilter === type ? 'all' : type;
        setFormatFilter(nextFilter);
        setViewMode('manage');
        if (nextFilter !== 'all') {
            const firstMatchingItem = learningFormats.find(item => item.context_type === nextFilter);
            if (firstMatchingItem) setSelectedItemKey(firstMatchingItem.key);
        }
    };

    const openCreate = type => {
        if (!confirmDiscardMapping()) return;
        setForm({ ...EMPTY_FORM, context_type: type || 'subject' });
        setViewMode('create');
        window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const createLearningFormat = async event => {
        event.preventDefault();
        const formatLabel = learningFormatLabel(form.context_type);
        if (!form.context_name.trim()) {
            toast.error(`กรุณาระบุชื่อ${formatLabel}`);
            return;
        }
        setSaving(true);
        try {
            let createdItem;
            if (form.context_type === 'subject') {
                const payload = {
                    school_id: currentUser.school_id,
                    academic_year: academicYear,
                    semester,
                    subject_code: null,
                    subject_name: form.context_name.trim(),
                    grade_level: form.grade_level || null,
                    subject_group: form.subject_group.trim() || null,
                    teacher_id: form.responsible_teacher_id || null,
                };
                const { data, error } = await supabase.from('subjects').insert(payload).select().single();
                if (error) throw error;
                createdItem = { source: 'subject', id: data.subject_id, type: 'subject', name: data.subject_name };
            } else {
                const payload = {
                    school_id: currentUser.school_id,
                    context_type: form.context_type,
                    context_name: form.context_name.trim(),
                    description: form.description.trim() || null,
                    academic_year: academicYear,
                    semester,
                    grade_level: form.grade_level || null,
                    responsible_teacher_id: form.responsible_teacher_id || null,
                };
                const { data, error } = await supabase.from('learning_contexts').insert(payload).select().single();
                if (error) throw error;
                createdItem = { source: 'context', id: data.context_id, type: data.context_type, name: data.context_name };
            }

            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: 'create_learning_format',
                entity_type: createdItem.source === 'subject' ? 'subject' : 'learning_context',
                entity_id: createdItem.id,
                detail: { format_type: createdItem.type, format_name: createdItem.name },
            });
            toast.success(`เพิ่ม${learningFormatLabel(createdItem.type)}แล้ว เลือก LO ที่ต้องการประเมินต่อได้ทันที`);
            await loadData();
            setSelectedItemKey(itemKey(createdItem.source, createdItem.id));
            setViewMode('manage');
        } catch (error) {
            toast.error('ไม่สามารถเพิ่มรูปแบบการจัดการเรียนรู้ได้: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleLO = loId => setSelectedLOs(previous => previous.includes(loId) ? previous.filter(item => item !== loId) : [...previous, loId]);

    const selectAllVisible = () => {
        const visibleIds = filteredLOs.map(lo => lo.lo_id);
        setSelectedLOs(previous => [...new Set([...previous, ...visibleIds])]);
    };

    const saveMapping = async () => {
        if (!selectedItem || !mappingDirty) return;
        setMappingSaving(true);
        try {
            const isSubject = selectedItem.source === 'subject';
            const table = isSubject ? 'subject_lo_mapping' : 'learning_context_lo_mappings';
            const idColumn = isSubject ? 'subject_id' : 'context_id';
            const { error: deleteError } = await supabase.from(table).delete().eq(idColumn, selectedItem.recordId);
            if (deleteError) throw deleteError;
            if (selectedLOs.length) {
                const rows = selectedLOs.map(loId => ({ [idColumn]: selectedItem.recordId, lo_id: loId }));
                const { error: insertError } = await supabase.from(table).insert(rows);
                if (insertError) throw insertError;
            }
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: 'update_learning_format_lo_mapping',
                entity_type: isSubject ? 'subject' : 'learning_context',
                entity_id: selectedItem.recordId,
                detail: { format_type: selectedItem.context_type, lo_ids: selectedLOs },
            });
            setMappedByItem(previous => ({ ...previous, [selectedItem.key]: selectedLOs }));
            toast.success(`บันทึก LO ที่ใช้ประเมินแล้ว ${selectedLOs.length} ข้อ`);
        } catch (error) {
            toast.error('ไม่สามารถบันทึกการเชื่อมโยงผลลัพธ์การเรียนรู้ได้: ' + error.message);
        } finally {
            setMappingSaving(false);
        }
    };

    const toggleContextActive = async item => {
        if (item.source !== 'context') return;
        try {
            const { error } = await supabase.from('learning_contexts').update({ is_active: !item.is_active, updated_at: new Date().toISOString() }).eq('context_id', item.recordId);
            if (error) throw error;
            setLearningFormats(previous => previous.map(current => current.key === item.key ? { ...current, is_active: !current.is_active } : current));
            toast.success(item.is_active ? 'พักการใช้งานรายการนี้แล้ว' : 'เปิดใช้งานรายการนี้แล้ว');
        } catch (error) {
            toast.error('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message);
        }
    };

    return (
        <Layout title="รูปแบบการจัดการเรียนรู้">
            <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                    <button onClick={() => navigate('/admin')} className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"><ArrowLeft className="h-4 w-4" /> กลับหน้าฝ่ายวิชาการ</button>
                    <h2 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">รูปแบบการจัดการเรียนรู้</h2>
                    <p className="mt-1.5 max-w-[70ch] text-sm leading-6 text-slate-600 sm:text-base">จัดการวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม พร้อมกำหนด LO ที่ใช้ประเมินในแต่ละรายการ</p>
                </div>
                <button type="button" onClick={() => openCreate('subject')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"><Plus className="h-5 w-5" /> เพิ่มรูปแบบการจัดการเรียนรู้</button>
            </header>

            {errorMessage ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900" role="alert"><strong>ไม่สามารถแสดงข้อมูลได้:</strong> {errorMessage}<button onClick={loadData} className="ml-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-bold hover:bg-rose-100">ลองใหม่</button></div>
            ) : (
                <>
                    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="สรุปรูปแบบการจัดการเรียนรู้">
                        <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-4 sm:divide-y-0">
                            {LEARNING_FORMAT_ORDER.map(type => {
                                const meta = TYPE_META[type];
                                const Icon = meta.icon;
                                const active = formatFilter === type;
                                return <button key={type} type="button" onClick={() => applyFormatFilter(type)} aria-pressed={active} className={`flex min-h-20 items-center gap-3 p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${active ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${active ? 'border-white/20 bg-white/10 text-white' : meta.className}`}><Icon className="h-5 w-5" /></span><span><strong className="block text-sm">{learningFormatLabel(type)}</strong><span className={`mt-0.5 block text-xs font-semibold ${active ? 'text-slate-300' : 'text-slate-500'}`}>{loading ? '—' : `${formatCounts[type] || 0} รายการ`}</span></span></button>;
                            })}
                        </div>
                    </section>

                    <div className="grid items-start gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
                        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white xl:sticky xl:top-4" aria-label="รายการรูปแบบการจัดการเรียนรู้">
                            <div className="border-b border-slate-200 p-4">
                                <div className="flex items-center justify-between gap-3"><div><h3 className="font-extrabold text-slate-950">รายการในภาคเรียนนี้</h3><p className="mt-0.5 text-xs font-semibold text-slate-500">ภาคเรียนที่ {semester || '—'}/{academicYear || '—'} · {learningFormats.length} รายการ</p></div>{formatFilter !== 'all' && <button type="button" onClick={() => setFormatFilter('all')} className="min-h-9 rounded-lg px-2 text-xs font-bold text-indigo-700 hover:bg-indigo-50">แสดงทั้งหมด</button>}</div>
                                <label className="relative mt-3 block"><span className="sr-only">ค้นหารูปแบบการจัดการเรียนรู้</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={itemQuery} onChange={event => setItemQuery(event.target.value)} placeholder="ค้นหาชื่อ ระดับชั้น หรือครู" className="min-h-10 w-full rounded-xl border border-slate-300 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                            </div>
                            <div className="max-h-[680px] overflow-y-auto p-2">
                                {loading ? <LoadingRows /> : filteredFormats.length === 0 ? (
                                    <div className="p-7 text-center"><p className="font-bold text-slate-800">ไม่พบรายการ</p><p className="mt-1 text-sm leading-5 text-slate-600">ลองเปลี่ยนคำค้นหาหรือตัวกรอง หรือเพิ่มรูปแบบการจัดการเรียนรู้รายการใหม่</p><button onClick={() => openCreate(formatFilter === 'all' ? 'subject' : formatFilter)} className="mt-4 min-h-10 rounded-xl bg-indigo-700 px-4 text-sm font-bold text-white hover:bg-indigo-800"><Plus className="mr-1 inline h-4 w-4" /> เพิ่มรายการ</button></div>
                                ) : filteredFormats.map(item => {
                                    const meta = TYPE_META[item.context_type] || TYPE_META.project;
                                    const Icon = meta.icon;
                                    const active = selectedItemKey === item.key && viewMode === 'manage';
                                    return <button key={item.key} type="button" onClick={() => selectLearningFormat(item.key)} aria-pressed={active} className={`mb-1 flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition last:mb-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'} ${!item.is_active ? 'opacity-60' : ''}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.className}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-slate-950">{item.context_name}</span><span className="mt-1 flex flex-wrap gap-x-1.5 text-xs font-semibold text-slate-500"><span>{learningFormatLabel(item.context_type)}</span><span>·</span><span>{item.grade_level || 'ทุกระดับชั้น'}</span><span>·</span><span>{(mappedByItem[item.key] || []).length} LO</span></span>{item.responsible_teacher_id && <span className="mt-1 block truncate text-xs text-slate-500">{teacherById[item.responsible_teacher_id] || 'ยังไม่พบข้อมูลผู้รับผิดชอบ'}</span>}</span><ChevronRight className={`mt-2 h-4 w-4 shrink-0 ${active ? 'text-indigo-700' : 'text-slate-400'}`} /></button>;
                                })}
                            </div>
                        </aside>

                        <main ref={detailRef} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {viewMode === 'create' ? (
                                <form onSubmit={createLearningFormat}>
                                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6"><div><h3 className="text-lg font-extrabold text-slate-950">เพิ่มรูปแบบการจัดการเรียนรู้</h3><p className="mt-1 text-sm text-slate-600">กรอกข้อมูลพื้นฐาน แล้วระบบจะพาไปกำหนด LO ต่อทันที</p></div><button type="button" onClick={() => setViewMode('manage')} aria-label="ปิดแบบฟอร์มเพิ่มรูปแบบการจัดการเรียนรู้" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"><X className="h-5 w-5" /></button></div>
                                    <div className="p-5 sm:p-6">
                                        <fieldset><legend className="text-sm font-extrabold text-slate-800">เลือกรูปแบบ</legend><div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">{LEARNING_FORMAT_ORDER.map(type => { const meta = TYPE_META[type]; const Icon = meta.icon; const active = form.context_type === type; return <button key={type} type="button" onClick={() => updateForm('context_type', type)} aria-pressed={active} className={`flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${active ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}><Icon className="h-4 w-4" /> {learningFormatLabel(type)}</button>; })}</div><p className="mt-2 text-sm leading-5 text-slate-600">{LEARNING_FORMATS[form.context_type].description}</p></fieldset>
                                        <div className="mt-6 grid gap-4 sm:grid-cols-2">
                                            <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">ชื่อ{learningFormatLabel(form.context_type)} <span className="text-rose-600">*</span></span><input required autoFocus value={form.context_name} onChange={event => updateForm('context_name', event.target.value)} placeholder={isSubjectForm ? 'เช่น ภาษาไทย: อ่าน เขียน สื่อสาร' : `เช่น ${form.context_type === 'project' ? 'ตลาดนัดพอเพียง' : form.context_type === 'activity' ? 'สุขภาวะดี มีสุนทรียภาพ' : 'ชุมชนของเรา'}`} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                            {isSubjectForm && <label><span className="mb-1.5 block text-sm font-bold text-slate-700">กลุ่มสาระหรือกลุ่มวิชา</span><input value={form.subject_group} onChange={event => updateForm('subject_group', event.target.value)} placeholder="เช่น ภาษาไทย" className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>}
                                            <label><span className="mb-1.5 block text-sm font-bold text-slate-700">ระดับชั้น</span><select value={form.grade_level} onChange={event => updateForm('grade_level', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"><option value="">ทุกระดับชั้น</option>{GRADE_LEVELS.map(grade => <option key={grade}>{grade}</option>)}</select></label>
                                            <label><span className="mb-1.5 block text-sm font-bold text-slate-700">{isSubjectForm ? 'ครูผู้สอน' : 'ผู้รับผิดชอบ'}</span><select value={form.responsible_teacher_id} onChange={event => updateForm('responsible_teacher_id', event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"><option value="">ยังไม่กำหนด</option>{teachers.map(teacher => <option key={teacher.teacher_id} value={teacher.teacher_id}>{teacherById[teacher.teacher_id]}</option>)}</select></label>
                                            {!isSubjectForm && <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold text-slate-700">คำอธิบาย</span><textarea rows="3" value={form.description} onChange={event => updateForm('description', event.target.value)} placeholder="อธิบายวัตถุประสงค์หรือลักษณะการจัดการเรียนรู้โดยย่อ" className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6"><button type="button" onClick={() => setViewMode('manage')} className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-100">ยกเลิก</button><button disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white hover:bg-indigo-800 disabled:bg-slate-300">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Plus className="h-4 w-4" />} บันทึกและกำหนด LO ต่อ</button></div>
                                </form>
                            ) : loading ? (
                                <div className="min-h-[620px] p-6"><div className="h-7 w-1/2 animate-pulse rounded bg-slate-100" /><div className="mt-4 h-20 animate-pulse rounded-xl bg-slate-100" /><div className="mt-6 space-y-2">{[1, 2, 3, 4].map(item => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}</div></div>
                            ) : !selectedItem ? (
                                <div className="flex min-h-[620px] flex-col items-center justify-center p-8 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Link2 className="h-7 w-7" /></div><h3 className="mt-4 text-lg font-extrabold text-slate-900">เลือกรายการที่ต้องการจัดการ</h3><p className="mt-1 max-w-md text-sm leading-6 text-slate-600">เลือกรายการจากด้านซ้ายเพื่อดูและกำหนด LO หรือเพิ่มรูปแบบการจัดการเรียนรู้รายการใหม่</p><button onClick={() => openCreate('subject')} className="mt-5 min-h-11 rounded-xl bg-indigo-700 px-5 text-sm font-bold text-white hover:bg-indigo-800"><Plus className="mr-1 inline h-4 w-4" /> เพิ่มรูปแบบการจัดการเรียนรู้</button></div>
                            ) : (
                                <div className="flex min-h-[620px] flex-col">
                                    <header className="border-b border-slate-200 px-5 py-4 sm:px-6">
                                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex rounded-lg border px-2.5 py-1 text-xs font-extrabold ${(TYPE_META[selectedItem.context_type] || TYPE_META.project).className}`}>{learningFormatLabel(selectedItem.context_type)}</span>{!selectedItem.is_active && <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">พักการใช้งาน</span>}</div><h3 className="mt-2 text-xl font-extrabold text-slate-950 sm:text-2xl">{selectedItem.context_name}</h3><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600"><span>ระดับชั้น: <strong className="text-slate-800">{selectedItem.grade_level || 'ทุกระดับชั้น'}</strong></span><span>{selectedItem.source === 'subject' ? 'ครูผู้สอน' : 'ผู้รับผิดชอบ'}: <strong className="text-slate-800">{teacherById[selectedItem.responsible_teacher_id] || 'ยังไม่กำหนด'}</strong></span></div>{selectedItem.description && <p className="mt-2 max-w-[70ch] text-sm leading-6 text-slate-600">{selectedItem.description}</p>}</div>{selectedItem.source === 'context' && <button onClick={() => toggleContextActive(selectedItem)} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">{selectedItem.is_active ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}{selectedItem.is_active ? 'พักการใช้งาน' : 'เปิดใช้งาน'}</button>}</div>
                                    </header>

                                    <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6"><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><label className="relative flex-1"><span className="mb-1 block text-xs font-bold text-slate-600">ค้นหา LO</span><Search className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 text-slate-500" /><input value={loQuery} onChange={event => setLoQuery(event.target.value)} placeholder="ค้นหารหัส ด้านความสามารถ หรือรายละเอียด" className="min-h-10 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label><label className="lg:w-72"><span className="mb-1 block text-xs font-bold text-slate-600">ด้านความสามารถ</span><select value={areaFilter} onChange={event => setAreaFilter(event.target.value)} className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"><option value="all">ทั้งหมด</option>{competencyAreas.map(area => <option key={area}>{area}</option>)}</select></label><button type="button" onClick={() => setShowSelectedOnly(value => !value)} aria-pressed={showSelectedOnly} className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${showSelectedOnly ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>เลือกแล้ว {selectedLOs.length}</button></div><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-500">แสดง {filteredLOs.length} จาก {los.length} LO</p><div className="flex gap-2"><button type="button" onClick={selectAllVisible} disabled={!filteredLOs.length} className="min-h-8 rounded-lg px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 disabled:text-slate-400">เลือกทั้งหมดที่แสดง</button><button type="button" onClick={() => setSelectedLOs([])} disabled={!selectedLOs.length} className="min-h-8 rounded-lg px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:text-slate-400">ล้างที่เลือก</button></div></div></div>

                                    <div className="max-h-[560px] flex-1 overflow-y-auto">
                                        {filteredLOs.length === 0 ? <div className="p-10 text-center"><AlertCircle className="mx-auto h-8 w-8 text-slate-400" /><h4 className="mt-3 font-extrabold text-slate-800">ไม่พบ LO ที่ตรงกับตัวกรอง</h4><p className="mt-1 text-sm text-slate-600">ลองเปลี่ยนคำค้นหา ด้านความสามารถ หรือปิดตัวกรอง “เลือกแล้ว”</p></div> : <div className="divide-y divide-slate-200">{filteredLOs.map(lo => { const checked = selectedLOs.includes(lo.lo_id); return <label key={lo.lo_id} className={`flex cursor-pointer gap-3 px-5 py-4 transition hover:bg-slate-50 sm:px-6 ${checked ? 'bg-indigo-50/70' : 'bg-white'}`}><input type="checkbox" checked={checked} onChange={() => toggleLO(lo.lo_id)} className="sr-only" /><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${checked ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check className="h-4 w-4" />}</span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">{lo.lo_code || `LO ${lo.ability_no}`}</strong><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{lo.competency_area || 'ไม่ระบุด้าน'}</span></span><span className="mt-1 block max-w-[75ch] text-sm leading-6 text-slate-600">{lo.lo_description}</span></span></label>; })}</div>}
                                    </div>

                                    <footer className="mt-auto flex flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div className="flex items-center gap-2">{mappingDirty ? <><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /><span className="text-sm font-bold text-amber-800">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span></> : <><CheckCircle2 className="h-5 w-5 text-emerald-600" /><span className="text-sm font-bold text-emerald-800">บันทึกแล้ว · ใช้ประเมิน {selectedLOs.length} LO</span></>}</div><button onClick={saveMapping} disabled={mappingSaving || !mappingDirty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white hover:bg-indigo-800 disabled:bg-slate-300 disabled:text-slate-600">{mappingSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />} บันทึก LO ที่ใช้ประเมิน</button></footer>
                                </div>
                            )}
                        </main>
                    </div>
                </>
            )}
        </Layout>
    );
}
