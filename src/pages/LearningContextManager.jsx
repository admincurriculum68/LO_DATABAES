import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    ClipboardList,
    FolderKanban,
    Link2,
    Plus,
    Save,
    Search,
    Sparkles,
    Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';
import { LEARNING_FORMATS, LEARNING_FORMAT_ORDER, learningFormatLabel } from '../lib/terminology';

const TYPE_META = {
    subject: { icon: BookOpen, className: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    learning_unit: { icon: ClipboardList, className: 'bg-amber-50 text-amber-800 border-amber-200' },
    project: { icon: FolderKanban, className: 'bg-blue-50 text-blue-800 border-blue-200' },
    activity: { icon: Users, className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    integrated_unit: { icon: ClipboardList, className: 'bg-amber-50 text-amber-800 border-amber-200' },
};

const EMPTY_FORM = {
    context_type: 'subject',
    context_code: '',
    context_name: '',
    description: '',
    subject_group: '',
    grade_level: '',
    responsible_teacher_id: '',
};

const itemKey = (source, id) => `${source}:${id}`;

export default function LearningContextManager() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [learningFormats, setLearningFormats] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [los, setLos] = useState([]);
    const [mappedByItem, setMappedByItem] = useState({});
    const [selectedItemKey, setSelectedItemKey] = useState('');
    const [selectedLOs, setSelectedLOs] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mappingSaving, setMappingSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const loadData = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
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
                    context_code: subject.subject_code,
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

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        setSelectedLOs(mappedByItem[selectedItemKey] || []);
    }, [mappedByItem, selectedItemKey]);

    const filteredLOs = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return los;
        return los.filter(lo => `${lo.lo_code || ''} ${lo.competency_area || ''} ${lo.lo_description || ''}`.toLowerCase().includes(normalized));
    }, [los, query]);

    const selectedItem = learningFormats.find(item => item.key === selectedItemKey) || null;
    const updateForm = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

    const createLearningFormat = async event => {
        event.preventDefault();
        const formatLabel = learningFormatLabel(form.context_type);
        if (!form.context_name.trim()) {
            toast.error(`กรุณาระบุชื่อ${formatLabel}`);
            return;
        }
        if (form.context_type === 'subject' && !form.context_code.trim()) {
            toast.error('กรุณาระบุรหัสวิชา');
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
                    subject_code: form.context_code.trim(),
                    subject_name: form.context_name.trim(),
                    grade_level: form.grade_level.trim() || null,
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
                    context_code: form.context_code.trim() || null,
                    context_name: form.context_name.trim(),
                    description: form.description.trim() || null,
                    academic_year: academicYear,
                    semester,
                    grade_level: form.grade_level.trim() || null,
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
            setForm(EMPTY_FORM);
            toast.success(`เพิ่ม${learningFormatLabel(createdItem.type)}แล้ว กรุณาเลือกผลลัพธ์การเรียนรู้ที่ต้องการประเมิน`);
            await loadData();
            setSelectedItemKey(itemKey(createdItem.source, createdItem.id));
        } catch (error) {
            toast.error('ไม่สามารถเพิ่มรูปแบบการจัดการเรียนรู้ได้: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleLO = loId => {
        setSelectedLOs(previous => previous.includes(loId) ? previous.filter(item => item !== loId) : [...previous, loId]);
    };

    const saveMapping = async () => {
        if (!selectedItem) return;
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
            toast.success(`บันทึกผลลัพธ์การเรียนรู้ที่เชื่อมโยงแล้ว ${selectedLOs.length} ข้อ`);
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

    const selectedLabel = selectedItem ? learningFormatLabel(selectedItem.context_type) : '';
    const isSubjectForm = form.context_type === 'subject';

    return (
        <Layout title="รูปแบบการจัดการเรียนรู้และผลลัพธ์การเรียนรู้">
            <header className="mb-7 max-w-4xl">
                <button onClick={() => navigate('/admin')} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"><ArrowLeft className="h-4 w-4" /> กลับหน้าฝ่ายวิชาการ</button>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">จัดการรูปแบบการจัดการเรียนรู้</h2>
                <p className="mt-2 max-w-[70ch] text-base leading-7 text-slate-600">สถานศึกษาจัดการเรียนรู้ได้ 4 รูปแบบ ได้แก่ วิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม โดยแต่ละรูปแบบสามารถเชื่อมโยงผลลัพธ์การเรียนรู้ (LO) ที่ต้องการประเมิน และใช้ LO เดียวกันร่วมกันได้</p>
            </header>

            <section className="mb-7" aria-labelledby="learning-format-heading">
                <h3 id="learning-format-heading" className="mb-3 text-sm font-extrabold text-slate-700">เลือกรูปแบบที่ต้องการเพิ่ม</h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {LEARNING_FORMAT_ORDER.map(type => {
                        const meta = TYPE_META[type];
                        const Icon = meta.icon;
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => updateForm('context_type', type)}
                                aria-pressed={form.context_type === type}
                                className={`flex min-h-28 items-start gap-3 rounded-2xl border p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${form.context_type === type ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                            >
                                <span className={`rounded-xl border p-2 ${meta.className}`}><Icon className="h-5 w-5" /></span>
                                <span><strong className="block text-slate-900">{learningFormatLabel(type)}</strong><span className="mt-1 block text-sm leading-5 text-slate-600">{LEARNING_FORMATS[type].description}</span></span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {errorMessage ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900" role="alert"><strong>ไม่สามารถแสดงข้อมูลได้:</strong> {errorMessage}</div>
            ) : (
                <div className="grid gap-7 xl:grid-cols-[380px_minmax(0,1fr)]">
                    <div className="space-y-6">
                        <form onSubmit={createLearningFormat} className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><Plus className="h-5 w-5" /></div><div><h3 className="font-extrabold text-slate-900">เพิ่มรูปแบบการจัดการเรียนรู้</h3><p className="text-sm text-slate-600">{learningFormatLabel(form.context_type)} · ภาคเรียนที่ {semester}/{academicYear}</p></div></div>
                            <div className="space-y-4">
                                <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">รูปแบบการจัดการเรียนรู้</span><select value={form.context_type} onChange={event => updateForm('context_type', event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200">{LEARNING_FORMAT_ORDER.map(value => <option key={value} value={value}>{learningFormatLabel(value)}</option>)}</select></label>
                                <div className="grid grid-cols-[120px_1fr] gap-3">
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">รหัส{isSubjectForm ? 'วิชา' : 'รายการ'}</span><input required={isSubjectForm} value={form.context_code} onChange={event => updateForm('context_code', event.target.value)} placeholder={isSubjectForm ? 'เช่น ท11101' : 'เช่น PRJ-01'} className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">ชื่อ{learningFormatLabel(form.context_type)}</span><input required value={form.context_name} onChange={event => updateForm('context_name', event.target.value)} placeholder={isSubjectForm ? 'เช่น ภาษาไทย' : 'เช่น ตลาดนัดพอเพียง'} className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                </div>
                                {isSubjectForm ? (
                                    <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">กลุ่มสาระหรือกลุ่มวิชา</span><input value={form.subject_group} onChange={event => updateForm('subject_group', event.target.value)} placeholder="เช่น ภาษาไทย" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                ) : (
                                    <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">คำอธิบาย</span><textarea rows="3" value={form.description} onChange={event => updateForm('description', event.target.value)} placeholder="ระบุวัตถุประสงค์และลักษณะการจัดการเรียนรู้" className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                )}
                                <div className="grid grid-cols-2 gap-3">
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">ระดับชั้น</span><input value={form.grade_level} onChange={event => updateForm('grade_level', event.target.value)} placeholder="เช่น ป.1" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">{isSubjectForm ? 'ครูผู้สอน' : 'ผู้รับผิดชอบ'}</span><select value={form.responsible_teacher_id} onChange={event => updateForm('responsible_teacher_id', event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"><option value="">ยังไม่กำหนด</option>{teachers.map(teacher => <option key={teacher.teacher_id} value={teacher.teacher_id}>{teacher.prefix || ''}{teacher.first_name} {teacher.last_name}</option>)}</select></label>
                                </div>
                                <button disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-extrabold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Plus className="h-4 w-4" />} เพิ่ม{learningFormatLabel(form.context_type)}และเชื่อมโยง LO</button>
                            </div>
                        </form>

                        <section aria-label="รายการรูปแบบการจัดการเรียนรู้">
                            <h3 className="mb-3 text-sm font-extrabold text-slate-700">รูปแบบการจัดการเรียนรู้ในภาคเรียนนี้ ({learningFormats.length})</h3>
                            {loading ? <div className="h-36 animate-pulse rounded-2xl bg-slate-200" /> : learningFormats.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-slate-600">ยังไม่มีรูปแบบการจัดการเรียนรู้ในภาคเรียนนี้ กรุณาเลือกหนึ่งใน 4 รูปแบบและเพิ่มข้อมูลจากแบบฟอร์มด้านบน</div> : <div className="space-y-2">{learningFormats.map(item => { const meta = TYPE_META[item.context_type] || TYPE_META.project; const Icon = meta.icon; return <button key={item.key} onClick={() => setSelectedItemKey(item.key)} className={`w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${selectedItemKey === item.key ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${!item.is_active ? 'opacity-60' : ''}`}><div className="flex items-start gap-3"><div className={`rounded-xl border p-2 ${meta.className}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-extrabold text-slate-900">{item.context_name}</p><p className="mt-1 text-sm text-slate-600">{learningFormatLabel(item.context_type)} · {item.grade_level || 'ทุกระดับชั้น'} · {(mappedByItem[item.key] || []).length} LO</p></div></div></button>; })}</div>}
                        </section>
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-white">
                        {!selectedItem ? <div className="flex min-h-[620px] items-center justify-center p-8 text-center text-slate-600">เพิ่มหรือเลือกรูปแบบการจัดการเรียนรู้เพื่อเชื่อมโยงผลลัพธ์การเรียนรู้</div> : <>
                            <header className="border-b border-slate-200 p-6">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><Sparkles className="h-4 w-4" /> {selectedLabel}</div><h3 className="mt-1 text-2xl font-extrabold text-slate-900">{selectedItem.context_name}</h3><p className="mt-2 max-w-[70ch] leading-6 text-slate-600">{selectedItem.description || `รหัส${selectedLabel} ${selectedItem.context_code || '-'}`}</p></div>{selectedItem.source === 'context' && <button onClick={() => toggleContextActive(selectedItem)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">{selectedItem.is_active ? 'พักการใช้งาน' : 'เปิดใช้งาน'}</button>}</div>
                            </header>
                            <div className="p-6">
                                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="flex items-center gap-2 font-extrabold text-slate-900"><Link2 className="h-5 w-5 text-indigo-600" /> ผลลัพธ์การเรียนรู้ที่ใช้ประเมิน</h4><p className="mt-1 text-sm text-slate-600">LO เดียวกันสามารถเชื่อมโยงกับวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรมได้มากกว่าหนึ่งรายการ</p></div><button onClick={saveMapping} disabled={mappingSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-extrabold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50">{mappingSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />} บันทึกการเชื่อมโยง {selectedLOs.length} ข้อ</button></div>
                                <label className="relative mb-4 block"><span className="sr-only">ค้นหา LO</span><Search className="pointer-events-none absolute left-3 top-3.5 h-5 w-5 text-slate-500" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัส LO ด้านความสามารถ หรือคำอธิบาย" className="min-h-12 w-full rounded-xl border border-slate-300 pl-11 pr-4 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                {filteredLOs.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-600">ไม่พบ LO ที่ตรงกับคำค้นหา</div> : <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">{filteredLOs.map(lo => { const checked = selectedLOs.includes(lo.lo_id); return <label key={lo.lo_id} className={`flex cursor-pointer gap-4 p-4 transition hover:bg-slate-50 ${checked ? 'bg-indigo-50/60' : 'bg-white'}`}><input type="checkbox" checked={checked} onChange={() => toggleLO(lo.lo_id)} className="sr-only" /><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{checked && <CheckCircle2 className="h-4 w-4" />}</span><span><span className="font-extrabold text-slate-900">{lo.lo_code || `LO ${lo.ability_no}`} <span className="font-semibold text-indigo-700">· {lo.competency_area || 'ทั่วไป'}</span></span><span className="mt-1 block max-w-[75ch] text-sm leading-6 text-slate-600">{lo.lo_description}</span></span></label>; })}</div>}
                            </div>
                        </>}
                    </section>
                </div>
            )}
        </Layout>
    );
}
