import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    Check,
    CheckCircle2,
    ChevronRight,
    ClipboardList,
    Compass,
    Filter,
    FolderKanban,
    GraduationCap,
    Info,
    Layers,
    Link2,
    PauseCircle,
    PlayCircle,
    Plus,
    Save,
    Search,
    ShieldCheck,
    Sparkles,
    User,
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
import { CBE_SUBJECT_GROUPS_2568 } from '../constants/curriculum2568';

const TYPE_META = {
    subject: { icon: BookOpen, className: 'border-indigo-200 bg-indigo-50 text-indigo-700', activeBadge: 'bg-indigo-600 text-white' },
    learning_unit: { icon: ClipboardList, className: 'border-amber-200 bg-amber-50 text-amber-800', activeBadge: 'bg-amber-600 text-white' },
    project: { icon: FolderKanban, className: 'border-sky-200 bg-sky-50 text-sky-800', activeBadge: 'bg-sky-600 text-white' },
    activity: { icon: Users, className: 'border-emerald-200 bg-emerald-50 text-emerald-800', activeBadge: 'bg-emerald-600 text-white' },
    integrated_unit: { icon: ClipboardList, className: 'border-amber-200 bg-amber-50 text-amber-800', activeBadge: 'bg-amber-600 text-white' },
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
        <div className="space-y-3 p-2" aria-label="กำลังโหลดรายการรูปแบบการจัดการเรียนรู้">
            {[1, 2, 3, 4, 5].map(item => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-2xs">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200/80 animate-pulse" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 rounded bg-slate-200/80 animate-pulse" />
                        <div className="h-3 w-20 rounded bg-slate-200/60 animate-pulse" />
                    </div>
                </div>
            ))}
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
                    subject_group: subject.subject_group || '',
                    description: subject.description || (subject.subject_group ? `กลุ่มวิชา: ${subject.subject_group}` : ''),
                    grade_level: subject.grade_level,
                    responsible_teacher_id: subject.teacher_id,
                    is_active: true,
                })),
                ...contexts.map(context => ({
                    ...context,
                    key: itemKey('context', context.context_id),
                    source: 'context',
                    recordId: context.context_id,
                    subject_group: context.subject_group || '',
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
            return `${item.context_name || ''} ${item.subject_group || ''} ${item.description || ''} ${item.grade_level || ''} ${teacherName}`.toLowerCase().includes(normalized);
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
                    subject_group: form.subject_group.trim() || null,
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
                detail: { format_type: createdItem.type, format_name: createdItem.name, subject_group: form.subject_group },
            });
            toast.success(`เพิ่ม${learningFormatLabel(createdItem.type)}เรียบร้อย เลือก LO ที่ใช้ประเมินต่อได้ทันที`);
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
            toast.success(`บันทึก LO ที่ใช้ประเมินเรียบร้อยแล้ว (${selectedLOs.length} ข้อ)`);
        } catch (error) {
            toast.error('ไม่สามารถบันทึกการเชื่อมโยง LO ได้: ' + error.message);
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
            <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-12">
                
                {/* Datalist for CBE 2568 Subject Groups autocomplete */}
                <datalist id="cbe-subject-groups-list">
                    {CBE_SUBJECT_GROUPS_2568.map(g => <option key={g} value={g} />)}
                </datalist>

                {/* Top Header Hero Banner */}
                <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl ring-1 ring-white/10">
                    <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
                    <div className="absolute -left-10 -bottom-10 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

                    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2 max-w-3xl">
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => navigate('/admin')}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20 hover:text-white"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" /> กลับ Dashboard วิชาการ
                                </button>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200 border border-indigo-400/20 backdrop-blur-md">
                                    <Compass className="h-3.5 w-3.5 text-indigo-300" /> หลักสูตรฐานสมรรถนะ พ.ศ. 2568
                                </span>
                            </div>
                            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
                                รูปแบบการจัดการเรียนรู้ (Learning Contexts)
                            </h1>
                            <p className="text-xs sm:text-sm leading-relaxed text-indigo-100/80">
                                จัดการรายวิชา, หน่วยการเรียนรู้, โครงงาน และกิจกรรมพัฒนาผู้เรียน พร้อมระบุ <strong>กลุ่มวิชา</strong> ตามหลักสูตร 2568 และเชื่อมโยง LO ที่ใช้ประเมิน
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={() => openCreate('subject')}
                                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-700 px-5 py-3 text-xs font-black text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-indigo-800"
                            >
                                <Plus className="h-4 w-4" /> เพิ่มรูปแบบการเรียนรู้ใหม่
                            </button>
                        </div>
                    </div>
                </header>

                {errorMessage ? (
                    <section className="rounded-3xl border border-rose-200 bg-rose-50/80 p-8 text-slate-900 shadow-sm" role="alert">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                                <AlertCircle className="h-6 w-6" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-extrabold text-rose-950">ไม่สามารถแสดงข้อมูลรูปแบบการเรียนรู้ได้</h3>
                                <p className="text-sm leading-relaxed text-rose-800">{errorMessage}</p>
                                <button
                                    onClick={loadData}
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-rose-800 focus:outline-none"
                                >
                                    ลองโหลดข้อมูลอีกครั้ง
                                </button>
                            </div>
                        </div>
                    </section>
                ) : (
                    <>
                        {/* 4 Core Learning Formats Summary Tabs */}
                        <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm" aria-label="สรุปรูปแบบการจัดการเรียนรู้">
                            <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
                                {LEARNING_FORMAT_ORDER.map(type => {
                                    const meta = TYPE_META[type];
                                    const Icon = meta.icon;
                                    const active = formatFilter === type;
                                    const count = formatCounts[type] || 0;

                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => applyFormatFilter(type)}
                                            className={`flex items-center gap-3.5 p-5 text-left transition-all ${
                                                active
                                                    ? 'bg-gradient-to-br from-slate-900 to-indigo-950 text-white shadow-md'
                                                    : 'bg-white hover:bg-slate-50 text-slate-900'
                                            }`}
                                        >
                                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-2xs ${
                                                active ? 'border-white/20 bg-white/10 text-white' : meta.className
                                            }`}>
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <div>
                                                <strong className="block text-sm font-black">{learningFormatLabel(type)}</strong>
                                                <span className={`mt-0.5 block text-xs font-bold ${active ? 'text-indigo-200' : 'text-slate-500'}`}>
                                                    {loading ? '—' : `${count} รายการ`}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>

                        {/* Main Grid: Left Context Items vs Right Mapping Workspace */}
                        <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
                            
                            {/* Left Sidebar: Context Items List */}
                            <aside className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm xl:sticky xl:top-6" aria-label="รายการรูปแบบการจัดการเรียนรู้">
                                <div className="space-y-3.5 border-b border-slate-100 p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-base font-extrabold text-slate-900">รายการในภาคเรียนนี้</h3>
                                            <p className="mt-0.5 text-xs text-slate-500">ภาค {semester}/{academicYear} · รวม {learningFormats.length} รายการ</p>
                                        </div>
                                        {formatFilter !== 'all' && (
                                            <button
                                                type="button"
                                                onClick={() => setFormatFilter('all')}
                                                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-slate-200"
                                            >
                                                แสดงทั้งหมด
                                            </button>
                                        )}
                                    </div>

                                    {/* Search Bar */}
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={itemQuery}
                                            onChange={e => setItemQuery(e.target.value)}
                                            placeholder="ค้นหาชื่อ, กลุ่มวิชา, ชั้นเรียน, ครู..."
                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                    </div>
                                </div>

                                {/* Items Scroll Container */}
                                <div className="max-h-[720px] overflow-y-auto p-3 space-y-2">
                                    {loading ? (
                                        <LoadingRows />
                                    ) : filteredFormats.length === 0 ? (
                                        <div className="p-8 text-center space-y-3">
                                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                                <BookOpen className="h-6 w-6" />
                                            </div>
                                            <h4 className="text-sm font-bold text-slate-800">ไม่พบรายการที่ตรงกับค้นหา</h4>
                                            <button
                                                onClick={() => openCreate(formatFilter === 'all' ? 'subject' : formatFilter)}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-extrabold text-white shadow-md"
                                            >
                                                <Plus className="h-3.5 w-3.5" /> เพิ่มรายการใหม่
                                            </button>
                                        </div>
                                    ) : (
                                        filteredFormats.map(item => {
                                            const meta = TYPE_META[item.context_type] || TYPE_META.project;
                                            const Icon = meta.icon;
                                            const isActiveItem = selectedItemKey === item.key && viewMode === 'manage';
                                            const loCount = (mappedByItem[item.key] || []).length;

                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => selectLearningFormat(item.key)}
                                                    className={`group relative w-full rounded-2xl p-4 text-left transition-all duration-200 border ${
                                                        isActiveItem
                                                            ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/20 border-indigo-600'
                                                            : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200/80 shadow-2xs'
                                                    } ${!item.is_active ? 'opacity-60' : ''}`}
                                                >
                                                    <div className="flex items-start gap-3">
                                                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                                                            isActiveItem ? 'bg-white/20 text-white border-white/20' : meta.className
                                                        }`}>
                                                            <Icon className="h-5 w-5" />
                                                        </span>
                                                        
                                                        <div className="min-w-0 flex-1 space-y-1">
                                                            <div className="flex items-center justify-between">
                                                                <p className={`truncate text-sm font-extrabold ${isActiveItem ? 'text-white' : 'text-slate-900'}`}>
                                                                    {item.context_name}
                                                                </p>
                                                                <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${
                                                                    isActiveItem ? 'text-white translate-x-0.5' : 'text-slate-300 group-hover:text-slate-500'
                                                                }`} />
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                                                <span className={`font-bold ${isActiveItem ? 'text-indigo-100' : 'text-slate-500'}`}>
                                                                    {learningFormatLabel(item.context_type)}
                                                                </span>
                                                                {item.subject_group && (
                                                                    <>
                                                                        <span className={isActiveItem ? 'text-indigo-200' : 'text-slate-300'}>·</span>
                                                                        <span className={`rounded-md px-1.5 py-0.2 text-[11px] font-extrabold ${
                                                                            isActiveItem ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                                                                        }`}>
                                                                            {item.subject_group}
                                                                        </span>
                                                                    </>
                                                                )}
                                                                <span className={isActiveItem ? 'text-indigo-200' : 'text-slate-300'}>·</span>
                                                                <span className={isActiveItem ? 'text-indigo-100' : 'text-slate-500'}>
                                                                    {item.grade_level || 'ทุกระดับชั้น'}
                                                                </span>
                                                                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-black border shadow-2xs ${
                                                                    isActiveItem ? 'bg-white/20 text-white border-white/20' : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                                                }`}>
                                                                    {loCount} LO
                                                                </span>
                                                            </div>

                                                            {item.responsible_teacher_id && (
                                                                <p className={`text-[11px] truncate ${isActiveItem ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                                    ผู้รับผิดชอบ: {teacherById[item.responsible_teacher_id] || '-'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </aside>

                            {/* Right Main Workspace (LO Mapping Form / Create Form) */}
                            <main ref={detailRef} className="scroll-mt-6 overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm min-h-[680px]">
                                {viewMode === 'create' ? (
                                    <form onSubmit={createLearningFormat} className="space-y-6">
                                        <div className="flex items-center justify-between border-b border-slate-100 p-6">
                                            <div>
                                                <h3 className="text-lg font-extrabold text-slate-900">เพิ่มรูปแบบการจัดการเรียนรู้ใหม่</h3>
                                                <p className="mt-0.5 text-xs text-slate-500">กรอกข้อมูลพื้นฐานและเลือกกลุ่มวิชาตามหลักสูตร 2568 แล้วระบบจะพาไปเลือก LO ต่อทันที</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('manage')}
                                                className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                        </div>

                                        <div className="p-6 space-y-6">
                                            {/* Type Selector Pills */}
                                            <div className="space-y-2">
                                                <label className="text-xs font-extrabold text-slate-800">เลือกประเภทรูปแบบการเรียนรู้</label>
                                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                    {LEARNING_FORMAT_ORDER.map(type => {
                                                        const meta = TYPE_META[type];
                                                        const Icon = meta.icon;
                                                        const active = form.context_type === type;
                                                        return (
                                                            <button
                                                                key={type}
                                                                type="button"
                                                                onClick={() => updateForm('context_type', type)}
                                                                className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-black transition-all ${
                                                                    active
                                                                        ? 'bg-indigo-700 text-white shadow-md border-indigo-700'
                                                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                <Icon className="h-4 w-4" /> {learningFormatLabel(type)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Form Inputs */}
                                            <div className="grid gap-4 sm:grid-cols-2">
                                                <div className="sm:col-span-2 space-y-1">
                                                    <label className="text-xs font-extrabold text-slate-800">
                                                        ชื่อ{learningFormatLabel(form.context_type)} <span className="text-rose-500">*</span>
                                                    </label>
                                                    <input
                                                        required
                                                        autoFocus
                                                        value={form.context_name}
                                                        onChange={e => updateForm('context_name', e.target.value)}
                                                        placeholder={isSubjectForm ? 'เช่น ภาษาและการสื่อสาร 1' : 'เช่น ตลาดนัดเรียนรู้พอเพียง'}
                                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    />
                                                </div>

                                                {/* Subject Group Input / Selection (CBE 2568 กลุ่มวิชา) */}
                                                <div className="space-y-1">
                                                    <label className="text-xs font-extrabold text-slate-800">
                                                        กลุ่มวิชา (หลักสูตร 2568)
                                                    </label>
                                                    <input
                                                        list="cbe-subject-groups-list"
                                                        value={form.subject_group}
                                                        onChange={e => updateForm('subject_group', e.target.value)}
                                                        placeholder="เลือกหรือพิมพ์ เช่น ภาษาและการสื่อสาร, การคิดคำนวณ..."
                                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-xs font-extrabold text-slate-800">ระดับชั้น</label>
                                                    <select
                                                        value={form.grade_level}
                                                        onChange={e => updateForm('grade_level', e.target.value)}
                                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    >
                                                        <option value="">ทุกระดับชั้น</option>
                                                        {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                                                    </select>
                                                </div>

                                                <div className="sm:col-span-2 space-y-1">
                                                    <label className="text-xs font-extrabold text-slate-800">
                                                        {isSubjectForm ? 'ครูผู้สอน' : 'ครูผู้รับผิดชอบ'}
                                                    </label>
                                                    <select
                                                        value={form.responsible_teacher_id}
                                                        onChange={e => updateForm('responsible_teacher_id', e.target.value)}
                                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    >
                                                        <option value="">ยังไม่กำหนด</option>
                                                        {teachers.map(t => (
                                                            <option key={t.teacher_id} value={t.teacher_id}>
                                                                {teacherById[t.teacher_id]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {!isSubjectForm && (
                                                    <div className="sm:col-span-2 space-y-1">
                                                        <label className="text-xs font-extrabold text-slate-800">คำอธิบายรายละเอียด</label>
                                                        <textarea
                                                            rows="3"
                                                            value={form.description}
                                                            onChange={e => updateForm('description', e.target.value)}
                                                            placeholder="อธิบายวัตถุประสงค์หรือลักษณะการจัดการเรียนรู้โดยย่อ"
                                                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/80 p-5">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('manage')}
                                                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-indigo-800 disabled:opacity-50"
                                            >
                                                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Plus className="h-4 w-4" />}
                                                บันทึกและกำหนด LO ต่อ
                                            </button>
                                        </div>
                                    </form>
                                ) : !selectedItem ? (
                                    <div className="flex flex-col items-center justify-center p-16 text-center space-y-4">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                                            <Link2 className="h-8 w-8" />
                                        </div>
                                        <h3 className="text-base font-extrabold text-slate-900">เลือกรายการที่ต้องการจัดการ</h3>
                                        <p className="max-w-md text-xs text-slate-500 leading-relaxed">
                                            เลือกรายการจากด้านซ้ายเพื่อดูและเลือก LO สำหรับใช้ประเมิน หรือกดเพิ่มรูปแบบการจัดการเรียนรู้ใหม่
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col min-h-[680px]">
                                        
                                        {/* Selected Item Header */}
                                        <header className="border-b border-slate-100 p-6">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="space-y-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-lg border px-2.5 py-0.5 text-xs font-black ${(TYPE_META[selectedItem.context_type] || TYPE_META.project).className}`}>
                                                            {learningFormatLabel(selectedItem.context_type)}
                                                        </span>
                                                        {selectedItem.subject_group && (
                                                            <span className="rounded-lg bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-100">
                                                                กลุ่มวิชา: {selectedItem.subject_group}
                                                            </span>
                                                        )}
                                                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                                            ระดับชั้น {selectedItem.grade_level || 'ทุกระดับชั้น'}
                                                        </span>
                                                    </div>

                                                    <h2 className="text-xl font-black text-slate-950 sm:text-2xl">
                                                        {selectedItem.context_name}
                                                    </h2>

                                                    <p className="text-xs font-medium text-slate-500">
                                                        ผู้รับผิดชอบ: <strong className="text-slate-800">{teacherById[selectedItem.responsible_teacher_id] || 'ยังไม่กำหนด'}</strong>
                                                    </p>
                                                </div>

                                                {selectedItem.source === 'context' && (
                                                    <button
                                                        onClick={() => toggleContextActive(selectedItem)}
                                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50"
                                                    >
                                                        {selectedItem.is_active ? <PauseCircle className="h-4 w-4 text-amber-600" /> : <PlayCircle className="h-4 w-4 text-emerald-600" />}
                                                        {selectedItem.is_active ? 'พักการใช้งาน' : 'เปิดใช้งาน'}
                                                    </button>
                                                )}
                                            </div>
                                        </header>

                                        {/* LO Filter & Toolbar */}
                                        <div className="border-b border-slate-100 bg-slate-50/70 p-5 space-y-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="relative flex-1">
                                                    <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        value={loQuery}
                                                        onChange={e => setLoQuery(e.target.value)}
                                                        placeholder="ค้นหารหัส LO, ด้านความสามารถ, หรือรายละเอียด..."
                                                        className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    />
                                                </div>

                                                <select
                                                    value={areaFilter}
                                                    onChange={e => setAreaFilter(e.target.value)}
                                                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                >
                                                    <option value="all">ทุกด้านความสามารถ</option>
                                                    {competencyAreas.map(area => (
                                                        <option key={area} value={area}>{area}</option>
                                                    ))}
                                                </select>

                                                <button
                                                    type="button"
                                                    onClick={() => setShowSelectedOnly(v => !v)}
                                                    className={`rounded-2xl border px-3 py-2 text-xs font-extrabold transition-all ${
                                                        showSelectedOnly
                                                            ? 'bg-indigo-700 text-white border-indigo-700 shadow-sm'
                                                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    เลือกแล้ว ({selectedLOs.length})
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-semibold text-slate-500">
                                                    แสดง {filteredLOs.length} จาก {los.length} LO
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={selectAllVisible}
                                                        disabled={!filteredLOs.length}
                                                        className="font-bold text-indigo-700 hover:underline disabled:opacity-40"
                                                    >
                                                        เลือกทั้งหมดที่แสดง
                                                    </button>
                                                    <span>·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLOs([])}
                                                        disabled={!selectedLOs.length}
                                                        className="font-bold text-slate-500 hover:underline disabled:opacity-40"
                                                    >
                                                        ล้างที่เลือก
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* LO Selection Cards List */}
                                        <div className="flex-1 overflow-y-auto max-h-[540px] divide-y divide-slate-100">
                                            {filteredLOs.length === 0 ? (
                                                <div className="p-12 text-center text-xs text-slate-500 space-y-2">
                                                    <AlertCircle className="mx-auto h-8 w-8 text-slate-300" />
                                                    <p className="font-bold text-slate-700">ไม่พบผลลัพธ์การเรียนรู้ (LO) ที่ตรงตามตัวกรอง</p>
                                                </div>
                                            ) : (
                                                filteredLOs.map(lo => {
                                                    const checked = selectedLOs.includes(lo.lo_id);
                                                    return (
                                                        <label
                                                            key={lo.lo_id}
                                                            className={`flex cursor-pointer items-start gap-3.5 p-5 transition hover:bg-slate-50/80 ${
                                                                checked ? 'bg-indigo-50/50' : 'bg-white'
                                                            }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={() => toggleLO(lo.lo_id)}
                                                                className="sr-only"
                                                            />
                                                            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition ${
                                                                checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                                                            }`}>
                                                                {checked && <Check className="h-3.5 w-3.5" />}
                                                            </div>

                                                            <div className="space-y-1 min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="rounded-md bg-indigo-700 px-2.5 py-0.5 text-xs font-black text-white shadow-2xs">
                                                                        {lo.lo_code || `LO ${lo.ability_no}`}
                                                                    </span>
                                                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                                                                        {lo.competency_area || 'ไม่ระบุด้าน'}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs leading-relaxed text-slate-700 max-w-[80ch]">
                                                                    {lo.lo_description}
                                                                </p>
                                                            </div>
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* Footer Sticky Save Action Bar */}
                                        <footer className="mt-auto flex flex-col gap-3 border-t border-slate-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-2 text-xs font-bold">
                                                {mappingDirty ? (
                                                    <>
                                                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                                                        <span className="text-amber-700">มีการเปลี่ยนแปลง LO ที่ยังไม่ได้บันทึก</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                                        <span className="text-emerald-700">บันทึกเรียบร้อย · กำหนดใช้ประเมิน {selectedLOs.length} LO</span>
                                                    </>
                                                )}
                                            </div>

                                            <button
                                                onClick={saveMapping}
                                                disabled={mappingSaving || !mappingDirty}
                                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-6 py-2.5 text-xs font-black text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-800 transition disabled:opacity-40"
                                            >
                                                {mappingSaving ? (
                                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                                ) : (
                                                    <Save className="h-4 w-4" />
                                                )}
                                                บันทึก LO ที่ใช้ประเมิน
                                            </button>
                                        </footer>
                                    </div>
                                )}
                            </main>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
}
