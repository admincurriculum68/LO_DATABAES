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
    subject: { label: LEARNING_FORMATS.subject.label, icon: BookOpen, className: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
    learning_unit: { label: LEARNING_FORMATS.learning_unit.label, icon: ClipboardList, className: 'bg-amber-50 text-amber-800 border-amber-200' },
    project: { label: LEARNING_FORMATS.project.label, icon: FolderKanban, className: 'bg-blue-50 text-blue-800 border-blue-200' },
    activity: { label: LEARNING_FORMATS.activity.label, icon: Users, className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    integrated_unit: { label: LEARNING_FORMATS.learning_unit.label, icon: ClipboardList, className: 'bg-amber-50 text-amber-800 border-amber-200' },
};

const CONTEXT_TYPES = ['learning_unit', 'project', 'activity'];

const EMPTY_FORM = {
    context_type: 'project',
    context_code: '',
    context_name: '',
    description: '',
    grade_level: '',
    responsible_teacher_id: '',
};

export default function LearningContextManager() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [contexts, setContexts] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [los, setLos] = useState([]);
    const [mappedByContext, setMappedByContext] = useState({});
    const [selectedContextId, setSelectedContextId] = useState('');
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
            const [contextsResult, teachersResult, loResult] = await Promise.all([
                supabase.from('learning_contexts').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester).order('created_at'),
                supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name, role').eq('school_id', currentUser.school_id).eq('is_active', true).order('first_name'),
                supabase.from('learning_outcomes').select('lo_id, lo_code, ability_no, competency_area, lo_description').eq('school_id', currentUser.school_id).order('ability_no'),
            ]);
            if (contextsResult.error) throw contextsResult.error;
            if (teachersResult.error) throw teachersResult.error;
            if (loResult.error) throw loResult.error;

            const contextRows = contextsResult.data || [];
            const contextIds = contextRows.map(item => item.context_id);
            let mappings = [];
            if (contextIds.length) {
                const mappingResult = await supabase.from('learning_context_lo_mappings').select('context_id, lo_id').in('context_id', contextIds);
                if (mappingResult.error) throw mappingResult.error;
                mappings = mappingResult.data || [];
            }
            const mappingMap = mappings.reduce((acc, item) => {
                if (!acc[item.context_id]) acc[item.context_id] = [];
                acc[item.context_id].push(item.lo_id);
                return acc;
            }, {});
            setContexts(contextRows);
            setTeachers(teachersResult.data || []);
            setLos(loResult.data || []);
            setMappedByContext(mappingMap);
            setSelectedContextId(current => contextRows.some(item => item.context_id === current) ? current : contextRows[0]?.context_id || '');
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
        setSelectedLOs(mappedByContext[selectedContextId] || []);
    }, [mappedByContext, selectedContextId]);

    const filteredLOs = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return los;
        return los.filter(lo => `${lo.lo_code || ''} ${lo.competency_area || ''} ${lo.lo_description || ''}`.toLowerCase().includes(normalized));
    }, [los, query]);

    const selectedContext = contexts.find(item => item.context_id === selectedContextId) || null;

    const updateForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const createContext = async (event) => {
        event.preventDefault();
        if (!form.context_name.trim()) {
            toast.error(`กรุณาระบุชื่อ${learningFormatLabel(form.context_type)}`);
            return;
        }
        setSaving(true);
        try {
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
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: 'create_learning_context',
                entity_type: 'learning_context',
                entity_id: data.context_id,
                detail: { context_type: data.context_type, context_name: data.context_name },
            });
            setForm(EMPTY_FORM);
            toast.success(`เพิ่ม${learningFormatLabel(data.context_type)}แล้ว กรุณาเลือกผลลัพธ์การเรียนรู้ที่ต้องการประเมิน`);
            await loadData();
            setSelectedContextId(data.context_id);
        } catch (error) {
            toast.error('ไม่สามารถเพิ่มรูปแบบการจัดการเรียนรู้ได้: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleLO = loId => {
        setSelectedLOs(prev => prev.includes(loId) ? prev.filter(item => item !== loId) : [...prev, loId]);
    };

    const saveMapping = async () => {
        if (!selectedContextId) return;
        setMappingSaving(true);
        try {
            const { error: deleteError } = await supabase.from('learning_context_lo_mappings').delete().eq('context_id', selectedContextId);
            if (deleteError) throw deleteError;
            if (selectedLOs.length) {
                const rows = selectedLOs.map(loId => ({ context_id: selectedContextId, lo_id: loId }));
                const { error: insertError } = await supabase.from('learning_context_lo_mappings').insert(rows);
                if (insertError) throw insertError;
            }
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: 'update_learning_context_lo_mapping',
                entity_type: 'learning_context',
                entity_id: selectedContextId,
                detail: { lo_ids: selectedLOs },
            });
            setMappedByContext(prev => ({ ...prev, [selectedContextId]: selectedLOs }));
            toast.success(`บันทึกผลลัพธ์การเรียนรู้ที่เชื่อมโยงแล้ว ${selectedLOs.length} ข้อ`);
        } catch (error) {
            toast.error('ไม่สามารถบันทึกการเชื่อมโยงผลลัพธ์การเรียนรู้ได้: ' + error.message);
        } finally {
            setMappingSaving(false);
        }
    };

    const toggleContextActive = async context => {
        try {
            const { error } = await supabase.from('learning_contexts').update({ is_active: !context.is_active, updated_at: new Date().toISOString() }).eq('context_id', context.context_id);
            if (error) throw error;
            setContexts(prev => prev.map(item => item.context_id === context.context_id ? { ...item, is_active: !item.is_active } : item));
            toast.success(context.is_active ? 'ระงับการใช้งานรายการนี้แล้ว' : 'เปิดใช้งานรายการนี้แล้ว');
        } catch (error) {
            toast.error('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message);
        }
    };

    return (
        <Layout title="รูปแบบการจัดการเรียนรู้และผลลัพธ์การเรียนรู้">
            <header className="mb-7 max-w-4xl">
                <button onClick={() => navigate('/admin')} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"><ArrowLeft className="h-4 w-4" /> กลับหน้าฝ่ายวิชาการ</button>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">จัดการรูปแบบการจัดการเรียนรู้</h2>
                <p className="mt-2 max-w-[70ch] text-base leading-7 text-slate-600">สถานศึกษาสามารถจัดการเรียนรู้ได้ 4 รูปแบบ ได้แก่ รายวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม โดยผลลัพธ์การเรียนรู้ (LO) เดียวกันสามารถเชื่อมโยงและประเมินซ้ำได้ในหลายรูปแบบ</p>
            </header>

            <section className="mb-7" aria-labelledby="learning-format-heading">
                <h3 id="learning-format-heading" className="mb-3 text-sm font-extrabold text-slate-700">รูปแบบการจัดการเรียนรู้ 4 รูปแบบ</h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {LEARNING_FORMAT_ORDER.map(type => {
                        const meta = TYPE_META[type];
                        const Icon = meta.icon;
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => type === 'subject' ? navigate('/admin?tab=mapping') : setForm(prev => ({ ...prev, context_type: type }))}
                                className={`flex min-h-28 items-start gap-3 rounded-2xl border p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${form.context_type === type ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                            >
                                <span className={`rounded-xl border p-2 ${meta.className}`}><Icon className="h-5 w-5" /></span>
                                <span><strong className="block text-slate-900">{meta.label}</strong><span className="mt-1 block text-sm leading-5 text-slate-600">{LEARNING_FORMATS[type].description}</span></span>
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
                        <form onSubmit={createContext} className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-indigo-100 p-2 text-indigo-700"><Plus className="h-5 w-5" /></div><div><h3 className="font-extrabold text-slate-900">เพิ่มหน่วยการเรียนรู้ โครงงาน หรือกิจกรรม</h3><p className="text-sm text-slate-600">ภาคเรียนที่ {semester}/{academicYear}</p></div></div>
                            <div className="space-y-4">
                                <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">รูปแบบการจัดการเรียนรู้</span><select value={form.context_type} onChange={event => updateForm('context_type', event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200">{CONTEXT_TYPES.map(value => <option key={value} value={value}>{TYPE_META[value].label}</option>)}</select></label>
                                <div className="grid grid-cols-[120px_1fr] gap-3">
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">รหัส</span><input value={form.context_code} onChange={event => updateForm('context_code', event.target.value)} placeholder="PRJ-01" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">ชื่อ</span><input required value={form.context_name} onChange={event => updateForm('context_name', event.target.value)} placeholder="เช่น ตลาดนัดพอเพียง" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                </div>
                                <label className="block"><span className="mb-1.5 block text-sm font-bold text-slate-700">คำอธิบาย</span><textarea rows="3" value={form.description} onChange={event => updateForm('description', event.target.value)} placeholder="วัตถุประสงค์และลักษณะกิจกรรม" className="w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                <div className="grid grid-cols-2 gap-3">
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">ระดับชั้น</span><input value={form.grade_level} onChange={event => updateForm('grade_level', event.target.value)} placeholder="ป.1" className="min-h-12 w-full rounded-xl border border-slate-300 px-3 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" /></label>
                                    <label><span className="mb-1.5 block text-sm font-bold text-slate-700">ผู้รับผิดชอบ</span><select value={form.responsible_teacher_id} onChange={event => updateForm('responsible_teacher_id', event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"><option value="">ยังไม่กำหนด</option>{teachers.map(teacher => <option key={teacher.teacher_id} value={teacher.teacher_id}>{teacher.prefix || ''}{teacher.first_name} {teacher.last_name}</option>)}</select></label>
                                </div>
                                <button disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-extrabold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Plus className="h-4 w-4" />} เพิ่มรายการและเชื่อมโยง LO</button>
                            </div>
                        </form>

                        <section aria-label="รายการรูปแบบการจัดการเรียนรู้">
                            <h3 className="mb-3 text-sm font-extrabold text-slate-700">หน่วยการเรียนรู้ โครงงาน และกิจกรรมในภาคเรียนนี้ ({contexts.length})</h3>
                            {loading ? <div className="h-36 animate-pulse rounded-2xl bg-slate-200" /> : contexts.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center text-slate-600">ยังไม่มีรายการสำหรับภาคเรียนนี้ กรุณาเพิ่มหน่วยการเรียนรู้ โครงงาน หรือกิจกรรมจากแบบฟอร์มด้านบน</div> : <div className="space-y-2">{contexts.map(context => { const meta = TYPE_META[context.context_type] || TYPE_META.project; const Icon = meta.icon; return <button key={context.context_id} onClick={() => setSelectedContextId(context.context_id)} className={`w-full rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500 ${selectedContextId === context.context_id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${!context.is_active ? 'opacity-60' : ''}`}><div className="flex items-start gap-3"><div className={`rounded-xl border p-2 ${meta.className}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="truncate font-extrabold text-slate-900">{context.context_name}</p><p className="mt-1 text-sm text-slate-600">{meta.label} · {context.grade_level || 'ทุกระดับชั้น'} · {(mappedByContext[context.context_id] || []).length} LO</p></div></div></button>; })}</div>}
                        </section>
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-white">
                        {!selectedContext ? <div className="flex min-h-[620px] items-center justify-center p-8 text-center text-slate-600">เพิ่มหรือเลือกรายการเพื่อเชื่อมโยงผลลัพธ์การเรียนรู้</div> : <>
                            <header className="border-b border-slate-200 p-6">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2 text-sm font-bold text-indigo-700"><Sparkles className="h-4 w-4" /> {TYPE_META[selectedContext.context_type]?.label}</div><h3 className="mt-1 text-2xl font-extrabold text-slate-900">{selectedContext.context_name}</h3><p className="mt-2 max-w-[70ch] leading-6 text-slate-600">{selectedContext.description || 'ยังไม่มีคำอธิบาย'}</p></div><button onClick={() => toggleContextActive(selectedContext)} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">{selectedContext.is_active ? 'พักการใช้งาน' : 'เปิดใช้งาน'}</button></div>
                            </header>
                            <div className="p-6">
                                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="flex items-center gap-2 font-extrabold text-slate-900"><Link2 className="h-5 w-5 text-indigo-600" /> ผลลัพธ์การเรียนรู้ที่ใช้ประเมิน</h4><p className="mt-1 text-sm text-slate-600">ผลลัพธ์การเรียนรู้เดียวกันสามารถเชื่อมโยงกับรายวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรมได้มากกว่าหนึ่งรายการ</p></div><button onClick={saveMapping} disabled={mappingSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 font-extrabold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50">{mappingSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />} บันทึกการเชื่อมโยง {selectedLOs.length} ข้อ</button></div>
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
