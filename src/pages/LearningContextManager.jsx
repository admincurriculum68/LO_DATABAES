import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    BookOpen,
    Check,
    CheckCircle2,
    ChevronDown,
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
    RotateCcw,
    Save,
    Search,
    ShieldCheck,
    User,
    Users,
    Trash2,
    Pencil,
    X, ArrowLeft} from 'lucide-react';
import toast from 'react-hot-toast';
import { useDialog } from '../lib/dialogContext';
import { scrollBehavior } from '../lib/motion';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { LEARNING_FORMATS, LEARNING_FORMAT_ORDER, learningFormatLabel } from '../lib/terminology';
import { loadSubjectAssignments } from '../lib/loByRoomApi';
import { formatRoomRange, teachersWithRooms } from '../lib/teacherAccess';
import { ACTIVITY_CATEGORIES_51, CBE_SUBJECT_GROUPS_ALL_2568, CBE_SUBJECT_GROUPS_BY_PHASE_2568 } from '../constants/curriculum2568';

const TYPE_META = {
    subject: {
        icon: BookOpen,
        className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        activeBadge: 'bg-indigo-700 text-white',
        colorTone: 'indigo',
    },
    learning_unit: {
        icon: ClipboardList,
        className: 'border-amber-200 bg-amber-50 text-amber-800',
        activeBadge: 'bg-amber-600 text-white',
        colorTone: 'amber',
    },
    project: {
        icon: FolderKanban,
        className: 'border-sky-200 bg-sky-50 text-sky-800',
        activeBadge: 'bg-sky-700 text-white',
        colorTone: 'sky',
    },
    activity: {
        icon: Users,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        activeBadge: 'bg-emerald-700 text-white',
        colorTone: 'emerald',
    },
    integrated_unit: {
        icon: ClipboardList,
        className: 'border-amber-200 bg-amber-50 text-amber-800',
        activeBadge: 'bg-amber-600 text-white',
        colorTone: 'amber',
    },
};

const EMPTY_FORM = {
    context_type: 'subject',
    context_name: '',
    description: '',
    subject_group: '',
    grade_level: '',
    responsible_teacher_id: '',
    teaching_hours: '',
    activity_category: '',
};

const GRADE_LEVELS = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6'];
const itemKey = (source, id) => `${source}:${id}`;
const sameIds = (left, right) => [...left].sort().join('|') === [...right].sort().join('|');

const getPhaseLabel = (gradeLevel) => {
    if (!gradeLevel) return null;
    if (['ป.1', 'ป.2', 'ป.3'].includes(gradeLevel)) return 'ป.ต้น';
    if (['ป.4', 'ป.5', 'ป.6'].includes(gradeLevel)) return 'ป.ปลาย';
    return null;
};

function LoadingRows() {
    return (
        <div className="space-y-3 p-2" aria-label="กำลังโหลดรายการรูปแบบการจัดการเรียนรู้">
            {[1, 2, 3, 4, 5].map(item => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-sm">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200/80 animate-pulse" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 rounded-lg bg-slate-200/80 animate-pulse" />
                        <div className="h-3 w-20 rounded-lg bg-slate-200/60 animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function LearningContextManager() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const dialog = useDialog();
    const { academicYear, semester } = useAcademic();
    const detailRef = useRef(null);
    const [learningFormats, setLearningFormats] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const [los, setLos] = useState([]);
    const [mappedByItem, setMappedByItem] = useState({});
    const [selectedItemKey, setSelectedItemKey] = useState('');
    const [selectedLOs, setSelectedLOs] = useState([]);
    const [form, setForm] = useState(EMPTY_FORM);
    const [viewMode, setViewMode] = useState('manage');
    // จอเล็กแสดงทีละขั้น: รายการ → รายละเอียด หน้านี้เลือกรายการแรกให้เองตอนโหลด
    // จึงต้องแยก state นี้ไว้ ไม่งั้นรายการจะหายตั้งแต่เปิดหน้า
    const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    
    // Multi-level Filters for Real School Scale (500-2,000 students / 100+ contexts)
    const [formatFilter, setFormatFilter] = useState('all');
    const [gradeFilter, setGradeFilter] = useState('all');
    const [groupFilter, setGroupFilter] = useState('all');
    const [loStatusFilter, setLoStatusFilter] = useState('all');
    const [itemQuery, setItemQuery] = useState('');
    const [showFiltersPanel, setShowFiltersPanel] = useState(false);

    // Form Subject Group UI Selection Mode ('select' vs 'custom')
    const [customGroupInput, setCustomGroupInput] = useState(false);
    const [formPhaseTab, setFormPhaseTab] = useState('auto'); // 'auto', 'ป.ต้น', 'ป.ปลาย'

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
                supabase.from('learning_outcomes').select('lo_id, lo_code, ability_no, competency_area, lo_description, grade_level, is_custom_competency').eq('school_id', currentUser.school_id).order('ability_no'),
            ]);
            if (subjectsResult.error) throw subjectsResult.error;
            if (contextsResult.error) throw contextsResult.error;
            if (teachersResult.error) throw teachersResult.error;
            if (loResult.error) throw loResult.error;

            const subjects = subjectsResult.data || [];
            const contexts = contextsResult.data || [];
            const subjectIds = subjects.map(item => item.subject_id);
            const contextIds = contexts.map(item => item.context_id);
            const [subjectMappings, contextMappings, subjectAssignments] = await Promise.all([
                fetchAllByIn(subjectIds, (batch, from, to) => supabase.from('subject_lo_mapping').select('subject_id, lo_id').in('subject_id', batch).range(from, to)),
                fetchAllByIn(contextIds, (batch, from, to) => supabase.from('learning_context_lo_mappings').select('context_id, lo_id').in('context_id', batch).range(from, to)),
                loadSubjectAssignments(subjectIds),
            ]);

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
                    // วิชาหนึ่งมีครูได้หลายคนแยกตามห้อง ครูหลักคนเดียวไม่พอบอกว่าใครสอนห้องไหน
                    teacher_rooms: teachersWithRooms(subject, subjectAssignments.filter(row => row.subject_id === subject.subject_id)),
                    teaching_hours: subject.teaching_hours,
                    is_active: true,
                })),
                ...contexts.map(context => ({
                    ...context,
                    key: itemKey('context', context.context_id),
                    source: 'context',
                    recordId: context.context_id,
                    subject_group: context.subject_group || '',
                    teaching_hours: context.teaching_hours,
                    activity_category: context.activity_category,
                })),
            ].sort((a, b) => LEARNING_FORMAT_ORDER.indexOf(a.context_type) - LEARNING_FORMAT_ORDER.indexOf(b.context_type)
                || (a.context_name || '').localeCompare(b.context_name || '', 'th'));

            const mappingMap = {};
            // วิชาหนึ่งมี LO เดียวกันได้หลายห้อง นับเป็น LO ที่ต่างกันเท่านั้น
            subjectMappings.forEach(mapping => {
                const key = itemKey('subject', mapping.subject_id);
                if (!mappingMap[key]) mappingMap[key] = [];
                if (!mappingMap[key].includes(mapping.lo_id)) mappingMap[key].push(mapping.lo_id);
            });
            contextMappings.forEach(mapping => {
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

    const teacherLabel = useCallback(item => {
        if (item.source !== 'subject') return teacherById[item.responsible_teacher_id] || '';
        return (item.teacher_rooms || [])
            .map(entry => `${teacherById[entry.teacherId] || 'ครูผู้สอน'}${entry.rooms.length ? ` (${formatRoomRange(entry.rooms)})` : ''}`)
            .join(' · ');
    }, [teacherById]);

    const formatCounts = useMemo(() => {
        const counts = Object.fromEntries(LEARNING_FORMAT_ORDER.map(type => [type, 0]));
        learningFormats.forEach(item => { counts[item.context_type] = (counts[item.context_type] || 0) + 1; });
        return counts;
    }, [learningFormats]);

    const totalMappedItems = useMemo(() => {
        return learningFormats.filter(item => (mappedByItem[item.key] || []).length > 0).length;
    }, [learningFormats, mappedByItem]);

    // Unique Subject Groups available in existing data for filter dropdown
    const availableGroupsInSystem = useMemo(() => {
        const set = new Set();
        learningFormats.forEach(item => {
            if (item.subject_group) set.add(item.subject_group);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'th'));
    }, [learningFormats]);

    // Active Filters Counter
    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (gradeFilter !== 'all') count++;
        if (groupFilter !== 'all') count++;
        if (loStatusFilter !== 'all') count++;
        if (itemQuery.trim()) count++;
        return count;
    }, [gradeFilter, groupFilter, loStatusFilter, itemQuery]);

    const resetFilters = () => {
        setGradeFilter('all');
        setGroupFilter('all');
        setLoStatusFilter('all');
        setItemQuery('');
    };

    // Advanced Multi-Level Filtered Learning Formats for Real-World School Scale
    const filteredFormats = useMemo(() => {
        const normalized = itemQuery.trim().toLowerCase();
        return learningFormats.filter(item => {
            // 1. Format Type filter
            if (formatFilter !== 'all' && item.context_type !== formatFilter) return false;
            
            // 2. Grade Level / Phase filter
            if (gradeFilter !== 'all') {
                if (gradeFilter === 'ป.ต้น' && !['ป.1', 'ป.2', 'ป.3'].includes(item.grade_level)) return false;
                if (gradeFilter === 'ป.ปลาย' && !['ป.4', 'ป.5', 'ป.6'].includes(item.grade_level)) return false;
                if (!['ป.ต้น', 'ป.ปลาย'].includes(gradeFilter) && item.grade_level !== gradeFilter) return false;
            }

            // 3. Subject Group filter
            if (groupFilter !== 'all' && item.subject_group !== groupFilter) return false;

            // 4. LO Status filter (ผูกแล้ว vs ยังไม่ผูก)
            const loCount = (mappedByItem[item.key] || []).length;
            if (loStatusFilter === 'mapped' && loCount === 0) return false;
            if (loStatusFilter === 'unmapped' && loCount > 0) return false;

            // 5. Search Text Query
            if (normalized) {
                const teacherName = teacherLabel(item);
                const haystack = `${item.context_name || ''} ${item.subject_group || ''} ${item.description || ''} ${item.grade_level || ''} ${teacherName}`.toLowerCase();
                if (!haystack.includes(normalized)) return false;
            }

            return true;
        });
    }, [formatFilter, gradeFilter, groupFilter, loStatusFilter, itemQuery, learningFormats, mappedByItem, teacherLabel]);

    const competencyAreas = useMemo(() => [...new Set(los.map(lo => lo.competency_area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th')), [los]);
    const filteredLOs = useMemo(() => {
        const normalized = loQuery.trim().toLowerCase();
        return los.filter(lo => {
            if (selectedItem?.grade_level && lo.grade_level && lo.grade_level !== selectedItem.grade_level) return false;
            if (areaFilter !== 'all' && lo.competency_area !== areaFilter) return false;
            if (showSelectedOnly && !selectedLOs.includes(lo.lo_id)) return false;
            if (!normalized) return true;
            return `${lo.lo_code || ''} ${lo.competency_area || ''} ${lo.lo_description || ''}`.toLowerCase().includes(normalized);
        });
    }, [areaFilter, loQuery, los, selectedItem?.grade_level, selectedLOs, showSelectedOnly]);

    const updateForm = (field, value) => setForm(previous => ({ ...previous, [field]: value }));
    const confirmDiscardMapping = async () => !mappingDirty || dialog.confirm({
        title: 'ออกจากรายการนี้โดยไม่บันทึก?',
        message: 'LO ที่เลือกไว้แต่ยังไม่ได้กดบันทึกจะหายไป',
        confirmLabel: 'ออกโดยไม่บันทึก',
        tone: 'danger',
    });
    const showDetail = () => window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }));

    const selectLearningFormat = async key => {
        if (key === selectedItemKey) {
            setMobileDetailOpen(true);
            showDetail();
            return;
        }
        if (!(await confirmDiscardMapping())) return;
        setSelectedItemKey(key);
        setViewMode('manage');
        setMobileDetailOpen(true);
        setLoQuery('');
        setAreaFilter('all');
        setShowSelectedOnly(false);
        showDetail();
    };

    const applyFormatFilter = async type => {
        if (!(await confirmDiscardMapping())) return;
        const nextFilter = formatFilter === type ? 'all' : type;
        setFormatFilter(nextFilter);
        setViewMode('manage');
        if (nextFilter !== 'all') {
            const firstMatchingItem = learningFormats.find(item => item.context_type === nextFilter);
            if (firstMatchingItem) setSelectedItemKey(firstMatchingItem.key);
        }
    };

    const openCreate = async type => {
        if (!(await confirmDiscardMapping())) return;
        setFormErrors({});
        setMobileDetailOpen(true);
        setForm({
            ...EMPTY_FORM,
            context_type: type || 'subject',
            grade_level: GRADE_LEVELS.includes(gradeFilter) ? gradeFilter : '',
        });
        setCustomGroupInput(false);
        setFormPhaseTab('auto');
        setViewMode('create');
        showDetail();
    };

    const createLearningFormat = async event => {
        event.preventDefault();
        const formatLabel = learningFormatLabel(form.context_type);
        const errors = {};
        if (!form.context_name.trim()) errors.context_name = `กรุณาระบุชื่อ${formatLabel}`;
        if (!GRADE_LEVELS.includes(form.grade_level)) errors.grade_level = 'กรุณาเลือกระดับชั้น ป.1–ป.6';
        setFormErrors(errors);
        if (Object.keys(errors).length) {
            document.getElementById(errors.context_name ? 'lcm-context-name' : 'lcm-grade-level')?.focus();
            return;
        }
        setSaving(true);
        try {
            if (viewMode === 'edit') {
                await saveEdit();
                return;
            }
            let createdItem;
            if (form.context_type === 'subject') {
                const payload = {
                    school_id: currentUser.school_id,
                    academic_year: academicYear,
                    semester,
                    subject_code: null,
                    subject_name: form.context_name.trim(),
                    grade_level: form.grade_level,
                    subject_group: form.subject_group.trim() || null,
                    teacher_id: form.responsible_teacher_id || null,
                    teaching_hours: form.teaching_hours ? Number(form.teaching_hours) : null,
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
                    grade_level: form.grade_level,
                    responsible_teacher_id: form.responsible_teacher_id || null,
                    teaching_hours: form.teaching_hours ? Number(form.teaching_hours) : null,
                    activity_category: form.context_type === 'activity' ? (form.activity_category || null) : null,
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
            const message = error.code === '23502' && error.message?.includes('grade_level')
                ? 'กรุณาเลือกระดับชั้น ป.1–ป.6'
                : error.message;
            toast.error(`ไม่สามารถ${viewMode === 'edit' ? 'แก้ไขรายการนี้' : 'เพิ่มรูปแบบการจัดการเรียนรู้'}ได้: ` + message);
        } finally {
            setSaving(false);
        }
    };

    // แก้ไขข้อมูลของรายการที่เลือก ใช้ฟอร์มเดียวกับตอนเพิ่มใหม่
    const openEdit = async item => {
        if (!(await confirmDiscardMapping())) return;
        setFormErrors({});
        setMobileDetailOpen(true);
        setForm({
            context_type: item.context_type,
            context_name: item.context_name || '',
            description: item.description || '',
            subject_group: item.subject_group || '',
            grade_level: item.grade_level || '',
            responsible_teacher_id: item.responsible_teacher_id || '',
            teaching_hours: item.teaching_hours == null ? '' : String(item.teaching_hours),
            activity_category: item.activity_category || '',
        });
        setCustomGroupInput(false);
        setViewMode('edit');
        showDetail();
    };

    const saveEdit = async () => {
        const isSubject = selectedItem.source === 'subject';
        const payload = isSubject
            ? {
                subject_name: form.context_name.trim(),
                grade_level: form.grade_level,
                subject_group: form.subject_group.trim() || null,
                teaching_hours: form.teaching_hours ? Number(form.teaching_hours) : null,
            }
            : {
                context_name: form.context_name.trim(),
                description: form.description.trim() || null,
                subject_group: form.subject_group.trim() || null,
                grade_level: form.grade_level,
                responsible_teacher_id: form.responsible_teacher_id || null,
                teaching_hours: form.teaching_hours ? Number(form.teaching_hours) : null,
                activity_category: form.context_type === 'activity' ? (form.activity_category || null) : null,
                updated_at: new Date().toISOString(),
            };
        const { error } = await supabase.from(isSubject ? 'subjects' : 'learning_contexts')
            .update(payload).eq(isSubject ? 'subject_id' : 'context_id', selectedItem.recordId);
        if (error) throw error;
        await supabase.from('audit_logs').insert({
            school_id: currentUser.school_id,
            actor_id: currentUser.teacher_id || currentUser.id,
            actor_role: currentUser.role,
            action: 'update_learning_format',
            entity_type: isSubject ? 'subject' : 'learning_context',
            entity_id: selectedItem.recordId,
            detail: { name: form.context_name.trim(), grade_level: form.grade_level },
        });
        await loadData();
        setViewMode('manage');
        toast.success(`แก้ไข${learningFormatLabel(selectedItem.context_type)}เรียบร้อยแล้ว`);
    };

    // ลบวิชาหรือรูปแบบการเรียนรู้ที่โรงเรียนไม่ได้เปิดสอน
    // วิชาที่ครูบันทึกข้อความ LO ไปแล้วจะลบไม่ได้ ต้องเอาผลออกก่อน กันข้อมูลของนักเรียนหายโดยไม่ตั้งใจ
    const deleteLearningFormat = async item => {
        const isSubject = item.source === 'subject';
        setSaving(true);
        try {
            let enrollmentIds = [];
            if (isSubject) {
                const enrollments = await fetchAllRows((from, to) => supabase.from('student_enrollments')
                    .select('enrollment_id').eq('subject_id', item.recordId).range(from, to));
                enrollmentIds = enrollments.map(row => row.enrollment_id);
                const evaluations = await fetchAllByIn(enrollmentIds, (batch, from, to) => supabase
                    .from('lo_evaluations').select('evaluation_id').in('enrollment_id', batch).range(from, to));
                if (evaluations.length) {
                    await dialog.confirm({
                        title: 'ลบวิชานี้ไม่ได้',
                        message: `วิชา ${item.context_name} มีผลการประเมินของครูแล้ว ${evaluations.length.toLocaleString()} รายการ\nถ้าต้องการลบจริง ให้แจ้งผู้ดูแลระบบ`,
                        confirmLabel: 'เข้าใจแล้ว',
                        cancelLabel: 'ปิด',
                    });
                    return;
                }
            }
            const confirmed = await dialog.confirm({
                title: `ลบ${learningFormatLabel(item.context_type)} ${item.context_name}`,
                message: isSubject
                    ? `ระบบจะลบวิชานี้ออกพร้อมรายชื่อนักเรียนในวิชา ${enrollmentIds.length.toLocaleString()} รายการ การมอบหมายครู และ LO ที่ผูกไว้\nลบแล้วกู้คืนไม่ได้`
                    : 'ระบบจะลบรายการนี้และ LO ที่ผูกไว้ ลบแล้วกู้คืนไม่ได้',
                confirmLabel: 'ลบออกจากระบบ',
                cancelLabel: 'ยกเลิก',
                tone: 'danger',
            });
            if (!confirmed) return;

            if (isSubject) {
                for (const [table, column] of [['subject_lo_mapping', 'subject_id'], ['subject_teachers', 'subject_id'], ['assessment_submissions', 'subject_id'], ['subject_lo_proposals', 'subject_id'], ['student_enrollments', 'subject_id']]) {
                    const { error } = await supabase.from(table).delete().eq(column, item.recordId);
                    // ตารางที่โรงเรียนยังไม่ได้รัน SQL ให้ข้ามไป ไม่ใช่ลบไม่สำเร็จทั้งหมด
                    if (error && error.code !== '42P01') throw error;
                }
                const { error } = await supabase.from('subjects').delete().eq('subject_id', item.recordId).eq('school_id', currentUser.school_id);
                if (error) throw error;
            } else {
                const { error: mappingError } = await supabase.from('learning_context_lo_mappings').delete().eq('context_id', item.recordId);
                if (mappingError) throw mappingError;
                const { error } = await supabase.from('learning_contexts').delete().eq('context_id', item.recordId).eq('school_id', currentUser.school_id);
                if (error) throw error;
            }
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: 'delete_learning_format',
                entity_type: isSubject ? 'subject' : 'learning_context',
                entity_id: item.recordId,
                detail: { name: item.context_name, grade_level: item.grade_level, enrollments: enrollmentIds.length },
            });
            setSelectedItemKey('');
            setViewMode('manage');
            await loadData();
            toast.success(`ลบ ${item.context_name} ออกจากระบบแล้ว`);
        } catch (error) {
            toast.error('ลบไม่สำเร็จ: ' + error.message);
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

    // Determine current phase for form subject group chips
    const effectivePhase = useMemo(() => {
        if (formPhaseTab === 'ป.ต้น') return 'ป.ต้น';
        if (formPhaseTab === 'ป.ปลาย') return 'ป.ปลาย';
        return getPhaseLabel(form.grade_level) || 'ป.ต้น';
    }, [formPhaseTab, form.grade_level]);

    return (
        <Layout title="รูปแบบการจัดการเรียนรู้">
            <div className="mx-auto w-full max-w-[1680px] space-y-6 pb-12">
                
                <header className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="text-2xl font-bold text-slate-950">รูปแบบการจัดการเรียนรู้</h1>
                        <p className="mt-1 text-sm leading-6 text-slate-600">จัดการวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรมพัฒนาผู้เรียน พร้อมเชื่อมโยง LO ที่ใช้ประเมิน</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-white px-4 text-sm text-slate-600">
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                            กำหนด LO แล้ว <strong className="font-bold text-slate-900">{totalMappedItems}/{learningFormats.length}</strong> รายการ
                        </div>
                        <button type="button" onClick={() => openCreate('subject')} className="action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold">
                            <Plus className="h-4 w-4" />เพิ่มรูปแบบใหม่
                        </button>
                    </div>
                </header>

                {errorMessage ? (
                    <section className="rounded-2xl border border-rose-200 bg-rose-50/80 p-8 text-slate-900 shadow-sm" role="alert">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                                <AlertCircle className="h-6 w-6" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-lg font-bold text-rose-950">ไม่สามารถแสดงข้อมูลรูปแบบการเรียนรู้ได้</h2>
                                <p className="text-sm leading-relaxed text-rose-800">{errorMessage}</p>
                                <button
                                    onClick={loadData}
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                >
                                    ลองโหลดข้อมูลอีกครั้ง
                                </button>
                            </div>
                        </div>
                    </section>
                ) : (
                    <>
                        {/* 4 Core Learning Formats Summary Tabs */}
                        <section className={`overflow-hidden rounded-2xl border border-line/90 bg-white shadow-sm ${mobileDetailOpen ? 'hidden xl:block' : ''}`} aria-label="สรุปรูปแบบการจัดการเรียนรู้">
                            <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-4 sm:divide-y-0">
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
                                                    ? 'bg-indigo-800 text-white'
                                                    : 'bg-white hover:bg-slate-50 text-slate-900'
                                            }`}
                                        >
                                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border shadow-sm transition-transform ${
                                                active ? 'border-white/20 bg-white/10 text-white scale-105' : meta.className
                                            }`}>
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <div>
                                                <strong className="block text-sm font-bold">{learningFormatLabel(type)}</strong>
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
                            
                            {/* Left Sidebar: Context Items List & Multi-level Filters */}
                            <aside className={`overflow-hidden rounded-2xl border border-line/90 bg-white shadow-sm xl:sticky xl:top-6 ${mobileDetailOpen ? 'hidden xl:block' : ''}`} aria-label="รายการรูปแบบการจัดการเรียนรู้">
                                <div className="space-y-3 border-b border-line p-5">
                                    
                                    {/* Sidebar Header */}
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h2 className="text-base font-bold text-slate-900">รายการในภาคเรียนนี้</h2>
                                            <p className="mt-0.5 text-xs text-slate-500">
                                                แสดง <strong className="text-indigo-700 font-bold">{filteredFormats.length}</strong> จาก {learningFormats.length} รายการ
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setShowFiltersPanel(v => !v)}
                                            className={`relative inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition ${
                                                showFiltersPanel || activeFiltersCount > 0
                                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                                    : 'border-line bg-slate-50 text-slate-700 hover:bg-slate-100'
                                            }`}
                                        >
                                            <Filter className="h-3.5 w-3.5" /> ตัวกรอง
                                            {activeFiltersCount > 0 && (
                                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-700 px-1 text-xs font-bold text-white">
                                                    {activeFiltersCount}
                                                </span>
                                            )}
                                        </button>
                                    </div>

                                    {/* Search Input Bar */}
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" aria-hidden="true" />
                                        <input
 aria-label="ค้นหารายการในภาคเรียนนี้"                                            type="text"
                                            value={itemQuery}
                                            onChange={e => setItemQuery(e.target.value)}
                                            placeholder="ค้นหาชื่อวิชา, กลุ่มวิชา, ชั้นเรียน, ครู..."
                                            className="min-h-11 w-full rounded-2xl border border-field bg-slate-50 pl-10 pr-11 text-xs font-medium text-slate-900 placeholder-slate-500 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                        />
                                        {itemQuery && (
                                            <button
                                                onClick={() => setItemQuery('')}
                                                aria-label="ล้างคำค้นหา"
                                                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-2xl text-slate-600 hover:text-slate-800"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Collapsible Multi-Level Filter Panel (For Real School Scale 500-2,000 Students) */}
                                    {showFiltersPanel && (
                                        <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs">
                                            <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                                                <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                                                    <SlidersIcon className="h-3.5 w-3.5 text-indigo-600" /> ตัวกรองข้อมูลขั้นสูง
                                                </span>
                                                {activeFiltersCount > 0 && (
                                                    <button
                                                        onClick={resetFilters}
                                                        className="inline-flex min-h-11 items-center gap-1 px-2 text-xs font-bold text-rose-700 hover:underline"
                                                    >
                                                        <RotateCcw className="h-3 w-3" /> ล้างตัวกรอง
                                                    </button>
                                                )}
                                            </div>

                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {/* Grade Level Filter */}
                                                <div className="space-y-1">
                                                    <label htmlFor="lcm-grade-filter" className="text-xs font-bold text-slate-700">ระดับชั้น / ช่วงชั้น</label>
                                                    <select
 id="lcm-grade-filter"                                                        value={gradeFilter}
                                                        onChange={e => setGradeFilter(e.target.value)}
                                                        className="min-h-11 w-full rounded-xl border border-field bg-white px-2.5 text-xs font-bold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                                    >
                                                        <option value="all">ทุกระดับชั้น</option>
                                                        <option value="ป.ต้น">ป.ต้น (ป.1 - ป.3)</option>
                                                        <option value="ป.ปลาย">ป.ปลาย (ป.4 - ป.6)</option>
                                                        {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                                                    </select>
                                                </div>

                                                <div className="space-y-1">
                                                    <label htmlFor="lcm-hours" className="text-xs font-bold text-slate-800">จำนวนชั่วโมงเรียน</label>
                                                    <input id="lcm-hours" type="number" min="0" step="1" value={form.teaching_hours} onChange={e => updateForm('teaching_hours', e.target.value)} placeholder="เช่น 40" className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 placeholder-slate-500 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                                                </div>

                                                {form.context_type === 'activity' && (
                                                    <div className="space-y-1">
                                                        <label htmlFor="lcm-activity-category" className="text-xs font-bold text-slate-800">หมวดกิจกรรมพัฒนาผู้เรียน (หลักสูตร 2551)</label>
                                                        <select id="lcm-activity-category" value={form.activity_category} onChange={e => updateForm('activity_category', e.target.value)} className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
                                                            <option value="">ไม่เข้าหมวดกิจกรรมพัฒนาผู้เรียน</option>
                                                            {ACTIVITY_CATEGORIES_51.map(category => <option key={category} value={category}>{category}</option>)}
                                                        </select>
                                                    </div>
                                                )}

                                                {/* LO Mapping Status Filter */}
                                                <div className="space-y-1">
                                                    <label htmlFor="lcm-lo-status" className="text-xs font-bold text-slate-700">สถานะการผูก LO</label>
                                                    <select
 id="lcm-lo-status"                                                        value={loStatusFilter}
                                                        onChange={e => setLoStatusFilter(e.target.value)}
                                                        className="min-h-11 w-full rounded-xl border border-field bg-white px-2.5 text-xs font-bold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                                    >
                                                        <option value="all">ทั้งหมด</option>
                                                        <option value="mapped">ผูก LO แล้ว</option>
                                                        <option value="unmapped">ยังไม่ได้ผูก LO</option>
                                                    </select>
                                                </div>

                                                {/* Subject Group Filter */}
                                                <div className="sm:col-span-2 space-y-1">
                                                    <label htmlFor="lcm-group-filter" className="text-xs font-bold text-slate-700">กลุ่มวิชา</label>
                                                    <select
 id="lcm-group-filter"                                                        value={groupFilter}
                                                        onChange={e => setGroupFilter(e.target.value)}
                                                        className="min-h-11 w-full rounded-xl border border-field bg-white px-2.5 text-xs font-bold text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                                    >
                                                        <option value="all">ทุกกลุ่มวิชา</option>
                                                        {availableGroupsInSystem.map(g => (
                                                            <option key={g} value={g}>{g}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Items Scroll Container */}
                                <div className="max-h-[720px] overflow-y-auto p-3 space-y-2">
                                    {loading ? (
                                        <LoadingRows />
                                    ) : filteredFormats.length === 0 ? (
                                        <div className="p-8 text-center space-y-3">
                                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                                                <BookOpen className="h-6 w-6" />
                                            </div>
                                            <h3 className="text-sm font-bold text-slate-800">ไม่พบรายการที่ตรงกับค้นหา</h3>
                                            <p className="text-xs text-slate-500">ลองเปลี่ยนตัวกรองหรือเพิ่มรายการใหม่</p>
                                            <button
                                                onClick={() => openCreate(formatFilter === 'all' ? 'subject' : formatFilter)}
                                                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-bold text-white shadow-md"
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
                                            const phaseTag = getPhaseLabel(item.grade_level);

                                            return (
                                                <button
                                                    key={item.key}
                                                    type="button"
                                                    onClick={() => selectLearningFormat(item.key)}
                                                    className={`group relative w-full rounded-2xl p-4 text-left transition-all duration-200 border ${
                                                        isActiveItem
                                                            ? 'bg-indigo-800 text-white border-indigo-800'
                                                            : 'bg-white hover:bg-slate-50 text-slate-900 border-line/80 shadow-sm'
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
                                                                <p className={`truncate text-sm font-bold ${isActiveItem ? 'text-white' : 'text-slate-900'}`}>
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
                                                                        <span aria-hidden="true" className={isActiveItem ? 'text-indigo-200' : 'text-slate-300'}>·</span>
                                                                        <span className={`rounded-lg px-1.5 py-0.2 text-xs font-bold ${
                                                                            isActiveItem ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                                                                        }`}>
                                                                            {item.subject_group}
                                                                        </span>
                                                                    </>
                                                                )}
                                                                <span aria-hidden="true" className={isActiveItem ? 'text-indigo-200' : 'text-slate-300'}>·</span>
                                                                <span className={isActiveItem ? 'text-indigo-100' : 'text-slate-500'}>
                                                                    {item.grade_level || 'ทุกชั้น'} {phaseTag ? `(${phaseTag})` : ''}
                                                                </span>
                                                                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold border shadow-sm ${
                                                                    isActiveItem
                                                                        ? 'bg-white/20 text-white border-white/20'
                                                                        : loCount > 0
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                            : 'bg-amber-50 text-amber-700 border-amber-200'
                                                                }`}>
                                                                    {loCount > 0 ? `${loCount} LO` : 'ยังไม่ผูก LO'}
                                                                </span>
                                                            </div>

                                                            {teacherLabel(item) && (
                                                                <p className={`text-xs truncate ${isActiveItem ? 'text-indigo-200' : 'text-slate-500'}`}>
                                                                    {item.source === 'subject' ? 'ครูผู้สอน' : 'ผู้รับผิดชอบ'}: {teacherLabel(item)}
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
                            <section ref={detailRef} className={`scroll-mt-6 overflow-hidden rounded-2xl border border-line/90 bg-white shadow-sm xl:min-h-[680px] ${mobileDetailOpen ? '' : 'hidden xl:block'}`}>
                                <div className="border-b border-line p-3 xl:hidden">
                                    <button type="button" onClick={() => { setMobileDetailOpen(false); window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: scrollBehavior() })); }} className="btn-ghost">
                                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับไปรายการ
                                    </button>
                                </div>
                                {viewMode === 'create' || viewMode === 'edit' ? (
                                    <form onSubmit={createLearningFormat} noValidate className="space-y-6">
                                        <div className="flex items-center justify-between border-b border-line p-6">
                                            <div>
                                                <h2 className="text-lg font-bold text-slate-900">{viewMode === 'edit' ? `แก้ไข${learningFormatLabel(form.context_type)}` : 'เพิ่มรูปแบบการจัดการเรียนรู้ใหม่'}</h2>
                                                <p className="mt-0.5 text-xs text-slate-500">{viewMode === 'edit' ? 'แก้ชื่อ ระดับชั้น กลุ่มวิชา และชั่วโมงเรียน แล้วกดบันทึก' : 'กรอกข้อมูลพื้นฐานและเลือกกลุ่มวิชาตามหลักสูตร 2568 แล้วระบบจะพาไปเลือก LO ต่อทันที'}</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('manage')}
                                                aria-label="ปิดฟอร์ม"
                                                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                            >
                                                <X className="h-5 w-5" />
                                            </button>
                                        </div>

                                        <div className="p-6 space-y-6">
                                            {/* Type Selector Pills */}
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-slate-800">เลือกประเภทรูปแบบการเรียนรู้</label>
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
                                                                className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-xs font-bold transition-all ${
                                                                    active
                                                                        ? 'bg-indigo-700 text-white shadow-md border-indigo-700'
                                                                        : 'bg-white text-slate-700 border-line hover:bg-slate-50'
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
                                                    <label htmlFor="lcm-context-name" className="text-xs font-bold text-slate-800">
                                                        ชื่อ{learningFormatLabel(form.context_type)} <span className="text-rose-600">*</span>
                                                    </label>
                                                    <input
 id="lcm-context-name"                                                        required
                                                        autoFocus
                                                        value={form.context_name}
                                                        onChange={e => { updateForm('context_name', e.target.value); setFormErrors(previous => ({ ...previous, context_name: undefined })); }}
                                                        aria-invalid={formErrors.context_name ? true : undefined}
                                                        aria-describedby={formErrors.context_name ? 'lcm-context-name-error' : undefined}
                                                        placeholder={isSubjectForm ? 'เช่น ภาษาและการสื่อสาร 1' : 'เช่น ตลาดนัดเรียนรู้พอเพียง'}
                                                        className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 placeholder-slate-500 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    />
                                                    {formErrors.context_name && <p id="lcm-context-name-error" className="text-xs font-bold text-rose-700">{formErrors.context_name}</p>}
                                                </div>

                                                <div className="space-y-1">
                                                    <label htmlFor="lcm-grade-level" className="text-xs font-bold text-slate-800">ระดับชั้น <span className="text-rose-600">*</span></label>
                                                    <select
 id="lcm-grade-level"                                                        required
                                                        value={form.grade_level}
                                                        onChange={e => { updateForm('grade_level', e.target.value); setFormErrors(previous => ({ ...previous, grade_level: undefined })); }}
                                                        aria-invalid={formErrors.grade_level ? true : undefined}
                                                        aria-describedby={formErrors.grade_level ? 'lcm-grade-level-error' : undefined}
                                                        className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    >
                                                        <option value="">-- กรุณาเลือกระดับชั้น --</option>
                                                        {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                                                    </select>
                                                    {formErrors.grade_level && <p id="lcm-grade-level-error" className="text-xs font-bold text-rose-700">{formErrors.grade_level}</p>}
                                                </div>

                                                <div className="space-y-1">
                                                    <label htmlFor="lcm-teacher" className="text-xs font-bold text-slate-800">
                                                        {isSubjectForm ? 'ครูผู้สอน' : 'ครูผู้รับผิดชอบ'}
                                                    </label>
                                                    <select
 id="lcm-teacher"                                                        value={form.responsible_teacher_id}
                                                        onChange={e => updateForm('responsible_teacher_id', e.target.value)}
                                                        className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    >
                                                        <option value="">ยังไม่กำหนด</option>
                                                        {teachers.map(t => (
                                                            <option key={t.teacher_id} value={t.teacher_id}>
                                                                {teacherById[t.teacher_id]}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {/* Subject Group Select & Preset Picker (Clean & Elegant UI) */}
                                                <div className="space-y-2 sm:col-span-2">
                                                    <div className="flex items-center justify-between">
                                                        <label htmlFor="lcm-subject-group" className="text-xs font-bold text-slate-800">
                                                            กลุ่มวิชา (หลักสูตร 2568)
                                                        </label>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCustomGroupInput(v => !v)}
                                                            className="text-xs font-bold text-indigo-700 hover:underline"
                                                        >
                                                            {customGroupInput ? 'เลือกจากรายการมาตรฐาน' : '+ พิมพ์กลุ่มวิชาเอง'}
                                                        </button>
                                                    </div>

                                                    {customGroupInput ? (
                                                        <input
                                                            id="lcm-subject-group"
                                                            value={form.subject_group}
                                                            onChange={e => updateForm('subject_group', e.target.value)}
                                                            placeholder="พิมพ์ระบุชื่อกลุ่มวิชา..."
                                                            className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        />
                                                    ) : (
                                                        <select
                                                            id="lcm-subject-group"
                                                            value={form.subject_group}
                                                            onChange={e => updateForm('subject_group', e.target.value)}
                                                            className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        >
                                                            <option value="">-- เลือกกลุ่มวิชา --</option>
                                                            <optgroup label="— กลุ่มวิชา ป.ต้น (ป.1 - ป.3) —">
                                                                {CBE_SUBJECT_GROUPS_BY_PHASE_2568['ป.ต้น'].flatMap(g => g.items).map(item => (
                                                                    <option key={`opt-ton-${item}`} value={item}>{item}</option>
                                                                ))}
                                                            </optgroup>
                                                            <optgroup label="— กลุ่มวิชา ป.ปลาย (ป.4 - ป.6) —">
                                                                {CBE_SUBJECT_GROUPS_BY_PHASE_2568['ป.ปลาย'].flatMap(g => g.items).map(item => (
                                                                    <option key={`opt-plai-${item}`} value={item}>{item}</option>
                                                                ))}
                                                            </optgroup>
                                                            <optgroup label="— รูปแบบอื่น —">
                                                                <option value="บูรณาการหลายกลุ่มวิชา">บูรณาการหลายกลุ่มวิชา</option>
                                                                <option value="กิจกรรมพัฒนาผู้เรียน">กิจกรรมพัฒนาผู้เรียน</option>
                                                            </optgroup>
                                                        </select>
                                                    )}

                                                    {/* Phase Filter Tabs for Quick Chips */}
                                                    <div className="rounded-2xl border border-line bg-slate-50/80 p-3 space-y-2.5">
                                                        <div className="flex items-center justify-between border-b border-line/60 pb-2">
                                                            <span className="text-xs font-bold text-slate-700">คลิกเลือกกลุ่มวิชาด่วน:</span>
                                                            <div className="flex gap-1 rounded-xl bg-white p-0.5 border border-line">
                                                                {['ป.ต้น', 'ป.ปลาย'].map(phase => (
                                                                    <button
                                                                        key={phase}
                                                                        type="button"
                                                                        onClick={() => setFormPhaseTab(phase)}
                                                                        className={`rounded-lg px-2.5 py-0.5 text-xs font-bold transition ${
                                                                            effectivePhase === phase
                                                                                ? 'bg-indigo-700 text-white shadow-sm'
                                                                                : 'text-slate-600 hover:bg-slate-100'
                                                                        }`}
                                                                    >
                                                                        {phase}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Phase Specific Quick Chips */}
                                                        <div className="space-y-2">
                                                            {CBE_SUBJECT_GROUPS_BY_PHASE_2568[effectivePhase]?.map(group => (
                                                                <div key={group.groupName} className="space-y-1">
                                                                    <span className="text-xs font-bold text-indigo-900 block">{group.groupName}:</span>
                                                                    <div className="flex flex-wrap gap-1.5">
                                                                        {group.items.map(item => (
                                                                            <button
                                                                                key={item}
                                                                                type="button"
                                                                                onClick={() => updateForm('subject_group', item)}
                                                                                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                                                                                    form.subject_group === item
                                                                                        ? 'bg-indigo-700 text-white shadow-sm'
                                                                                        : 'bg-white text-slate-700 border border-line hover:bg-indigo-50 hover:text-indigo-700'
                                                                                }`}
                                                                            >
                                                                                {item}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                {!isSubjectForm && (
                                                    <div className="sm:col-span-2 space-y-1">
                                                        <label htmlFor="lcm-description" className="text-xs font-bold text-slate-800">คำอธิบายรายละเอียด</label>
                                                        <textarea
 id="lcm-description"                                                            rows="3"
                                                            value={form.description}
                                                            onChange={e => updateForm('description', e.target.value)}
                                                            placeholder="อธิบายวัตถุประสงค์หรือลักษณะการจัดการเรียนรู้โดยย่อ"
                                                            className="w-full rounded-2xl border border-field bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-500 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-3 border-t border-line bg-slate-50/80 p-5">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('manage')}
                                                className="rounded-xl border border-line bg-white px-5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-6 text-xs font-bold text-white shadow-md hover:bg-indigo-800 disabled:opacity-50"
                                            >
                                                {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : viewMode === 'edit' ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                                {viewMode === 'edit' ? 'บันทึกการแก้ไข' : 'บันทึกและกำหนด LO ต่อ'}
                                            </button>
                                        </div>
                                    </form>
                                ) : !selectedItem ? (
                                    <div className="flex flex-col items-center justify-center p-16 text-center space-y-4">
                                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                                            <Link2 className="h-8 w-8" />
                                        </div>
                                        <h2 className="text-base font-bold text-slate-900">เลือกรายการที่ต้องการจัดการ</h2>
                                        <p className="max-w-md text-xs text-slate-500 leading-relaxed">
                                            เลือกรายการจากด้านซ้ายเพื่อดูและเลือก LO สำหรับใช้ประเมิน หรือกดเพิ่มรูปแบบการจัดการเรียนรู้ใหม่
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col min-h-[680px]">
                                        
                                        {/* Selected Item Header */}
                                        <header className="border-b border-line p-6">
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="space-y-2.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`rounded-xl border px-3 py-1 text-xs font-bold ${(TYPE_META[selectedItem.context_type] || TYPE_META.project).className}`}>
                                                            {learningFormatLabel(selectedItem.context_type)}
                                                        </span>
                                                        {selectedItem.subject_group && (
                                                            <span className="rounded-xl bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-100">
                                                                กลุ่มวิชา: {selectedItem.subject_group}
                                                            </span>
                                                        )}
                                                        <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                                                            ชั้น {selectedItem.grade_level || 'ทุกชั้น'} {getPhaseLabel(selectedItem.grade_level) ? `(${getPhaseLabel(selectedItem.grade_level)})` : ''}
                                                        </span>
                                                    </div>

                                                    <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">
                                                        {selectedItem.context_name}
                                                    </h2>

                                                    <div className="flex items-start gap-2 text-xs font-medium text-slate-600">
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                                                            <User className="h-3.5 w-3.5" />
                                                        </span>
                                                        <span className="pt-1 leading-5">
                                                            {selectedItem.source === 'subject' ? 'ครูผู้สอน' : 'ผู้รับผิดชอบ'}: <strong className="text-slate-800 font-bold">{teacherLabel(selectedItem) || 'ยังไม่กำหนด'}</strong>
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {selectedItem.source === 'context' && (
                                                        <button
                                                            onClick={() => toggleContextActive(selectedItem)}
                                                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                                                        >
                                                            {selectedItem.is_active ? <PauseCircle className="h-4 w-4 text-amber-700" /> : <PlayCircle className="h-4 w-4 text-emerald-700" />}
                                                            {selectedItem.is_active ? 'พักการใช้งาน' : 'เปิดใช้งาน'}
                                                        </button>
                                                    )}
                                                    {selectedItem.source === 'subject' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/admin/subject-teachers?subject=${selectedItem.recordId}`)}
                                                            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                                                        >
                                                            <User className="h-4 w-4 text-slate-600" aria-hidden="true" />แก้ครูผู้สอน
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => openEdit(selectedItem)}
                                                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                                                    >
                                                        <Pencil className="h-4 w-4 text-slate-600" aria-hidden="true" />แก้ไขข้อมูล
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => deleteLearningFormat(selectedItem)}
                                                        disabled={saving}
                                                        className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-bold text-rose-800 shadow-sm hover:bg-rose-50 transition disabled:opacity-40"
                                                    >
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />ลบ
                                                    </button>
                                                </div>
                                            </div>
                                        </header>

                                        {selectedItem.source === 'subject' ? (
                                            <div className="space-y-4 p-6">
                                                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5">
                                                    <h3 className="text-base font-bold text-indigo-950">LO ของวิชานี้กำหนดที่หน้า “กำหนด LO ของวิชา”</h3>
                                                    <p className="mt-1 text-sm leading-6 text-indigo-900">
                                                        ครูผู้สอนเลือก LO ของห้องที่ตัวเองสอนตามคำอธิบายรายวิชา แต่ละห้องใช้ LO ต่างกันได้ หน้านี้จึงไม่ให้แก้ LO เพื่อไม่ให้ทับงานของครู
                                                    </p>
                                                    <p className="mt-3 text-sm font-bold text-indigo-950 tabular-nums">ตอนนี้ใช้ LO {(mappedByItem[selectedItem.key] || []).length} ข้อ (รวมทุกห้อง)</p>
                                                    <button type="button" onClick={() => navigate('/admin?tab=mapping')} className="btn-primary mt-4">
                                                        <Link2 className="h-4 w-4" aria-hidden="true" />ไปหน้ากำหนด LO ของวิชา
                                                    </button>
                                                </div>
                                                <p className="text-xs leading-6 text-slate-600">หน้านี้ใช้แก้ชื่อวิชา ระดับชั้น กลุ่มวิชา และชั่วโมงเรียน หรือลบวิชาที่ไม่ได้เปิดสอนในภาคเรียนนี้ · ครูผู้สอนแก้ที่เมนู “กำหนดครูผู้สอน”</p>
                                            </div>
                                        ) : (
                                            <>
                                        {/* LO Filter & Toolbar */}
                                        <div className="border-b border-line bg-slate-50/70 p-5 space-y-3">
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="relative flex-1">
                                                    <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" aria-hidden="true" />
                                                    <input
 aria-label="ค้นหา LO"                                                        type="text"
                                                        value={loQuery}
                                                        onChange={e => setLoQuery(e.target.value)}
                                                        placeholder="ค้นหารหัส LO, ด้านความสามารถ, หรือรายละเอียด..."
                                                        className="min-h-11 w-full rounded-2xl border border-field bg-white pl-10 pr-4 text-xs font-medium text-slate-900 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                    />
                                                </div>

                                                <select
 aria-label="กรองตามด้านความสามารถ"                                                    value={areaFilter}
                                                    onChange={e => setAreaFilter(e.target.value)}
                                                    className="min-h-11 rounded-2xl border border-field bg-white px-3 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                >
                                                    <option value="all">ทุกด้านความสามารถ</option>
                                                    {competencyAreas.map(area => (
                                                        <option key={area} value={area}>{area}</option>
                                                    ))}
                                                </select>

                                                <button
                                                    type="button"
                                                    onClick={() => setShowSelectedOnly(v => !v)}
                                                    className={`min-h-11 rounded-2xl border px-3.5 text-xs font-bold transition-all ${
                                                        showSelectedOnly
                                                            ? 'bg-indigo-700 text-white border-indigo-700 shadow-sm'
                                                            : 'bg-white text-slate-700 border-line hover:bg-slate-100'
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
                                                        className="inline-flex min-h-11 items-center px-2 font-bold text-indigo-700 hover:underline disabled:opacity-40"
                                                    >
                                                        เลือกทั้งหมดที่แสดง
                                                    </button>
                                                    <span aria-hidden="true">·</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedLOs([])}
                                                        disabled={!selectedLOs.length}
                                                        className="inline-flex min-h-11 items-center px-2 font-bold text-slate-600 hover:underline disabled:opacity-40"
                                                    >
                                                        ล้างที่เลือก
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* LO Selection Cards List */}
                                        <div className="flex-1 overflow-y-auto max-h-[540px] divide-y divide-line">
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
                                                            <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border-2 transition ${
                                                                checked ? 'border-indigo-600 bg-indigo-700 text-white' : 'border-slate-300 bg-white'
                                                            }`}>
                                                                {checked && <Check className="h-3.5 w-3.5" />}
                                                            </div>

                                                            <div className="space-y-1 min-w-0">
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className="rounded-lg bg-indigo-700 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
                                                                        {lo.lo_code || `LO ${lo.ability_no}`}
                                                                    </span>
                                                                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                                                                        {lo.competency_area || 'ไม่ระบุด้าน'}
                                                                    </span>
                                                                    {lo.grade_level && <span className="rounded-lg bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{lo.grade_level}</span>}
                                                                    {lo.is_custom_competency && <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">เพิ่มเติมจากหลักสูตร</span>}
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
                                        <footer className="mt-auto flex flex-col gap-3 border-t border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-2 text-xs font-bold">
                                                {mappingDirty ? (
                                                    <>
                                                        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
                                                        <span className="text-amber-700">มีการเปลี่ยนแปลง LO ที่ยังไม่ได้บันทึก</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                                                        <span className="text-emerald-700">บันทึกเรียบร้อย · กำหนดใช้ประเมิน {selectedLOs.length} LO</span>
                                                    </>
                                                )}
                                            </div>

                                            <button
                                                onClick={saveMapping}
                                                disabled={mappingSaving || !mappingDirty}
                                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-indigo-700 px-6 text-xs font-bold text-white shadow-md hover:bg-indigo-800 transition disabled:opacity-40"
                                            >
                                                {mappingSaving ? (
                                                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                                ) : (
                                                    <Save className="h-4 w-4" />
                                                )}
                                                บันทึก LO ที่ใช้ประเมิน
                                            </button>
                                        </footer>
                                            </>
                                        )}
                                    </div>
                                )}
                            </section>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
}

// Helper icon component for Filter Sliders
function SlidersIcon(props) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="4" x2="4" y1="21" y2="14" />
            <line x1="4" x2="4" y1="10" y2="3" />
            <line x1="12" x2="12" y1="21" y2="12" />
            <line x1="12" x2="12" y1="8" y2="3" />
            <line x1="20" x2="20" y1="21" y2="16" />
            <line x1="20" x2="20" y1="12" y2="3" />
            <line x1="2" x2="6" y1="14" y2="14" />
            <line x1="10" x2="14" y1="8" y2="8" />
            <line x1="18" x2="22" y1="16" y2="16" />
        </svg>
    );
}
