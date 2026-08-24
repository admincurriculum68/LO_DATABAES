import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchAllByIn, fetchAllRows, supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { Users, Upload, Link as LinkIcon, Download, Trash2, Edit, Save, Plus, X, Search, FileText, CheckCircle, ArrowUpCircle, School, Lock, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { hashPassword } from '../lib/auth';
import { parseRoleList } from '../lib/roles';
import { useAcademic } from '../AcademicContext';
import AcademicDashboardHome from '../components/AcademicDashboardHome';
import { CBE_CAPABILITIES_2568 } from '../constants/curriculum2568';
import FlexibleImportWizard from '../components/FlexibleImportWizard';

const WORKSPACE_TABS = [
    { id: 'overview', label: 'หน้าหลักฝ่ายวิชาการ', description: 'ภาพรวมและงานที่ควรดำเนินการต่อ' },
    { id: 'data', label: 'ข้อมูลหลักสูตร', description: 'ตรวจสอบและแก้ไขรายวิชา ผลลัพธ์การเรียนรู้ และคำบรรยายระดับความสามารถ' },
    { id: 'import', label: 'ตั้งค่าและเพิ่มข้อมูล', description: 'เพิ่มข้อมูลจาก DMC หรือ Excel รูปแบบใดก็ได้ด้วยตัวช่วยทีละขั้น' },
    { id: 'mapping', label: 'กำหนด LO ของวิชา', description: 'เลือกผลลัพธ์การเรียนรู้ที่ใช้ประเมินในแต่ละวิชา' },
    { id: 'enrollment', label: 'จัดนักเรียนเข้ารายวิชา', description: 'จัดนักเรียนเข้าวิชาและตรวจสอบรายชื่อในแต่ละกลุ่ม' },
    { id: 'progress', label: 'ติดตามการรายงานผลการเรียน', description: 'ตรวจสอบความก้าวหน้าของครูผู้สอนและแต่ละวิชา' },
    { id: 'promotion', label: 'เลื่อนชั้นและจัดห้อง', description: 'ปรับระดับชั้นและห้องเรียนสำหรับปีการศึกษาถัดไป' },
];

const SCHOOL_SCOPED_TABLES = ['users_students', 'users_teachers', 'subjects', 'learning_outcomes'];
const SAFE_TABLE_SELECT = {
    users_students: 'student_id, school_id, citizen_id, student_code, prefix, first_name, last_name, current_room, current_grade_level, student_status, created_at',
    users_teachers: 'teacher_id, school_id, citizen_id, prefix, first_name, last_name, role, homeroom, is_active, created_at, teacher_roles(role, is_primary)',
};
const READ_ONLY_TABLES = new Set(['behavior_templates']);
const WIZARD_IMPORT_TYPES = new Set(['students', 'teachers', 'subjects', 'learning_units', 'projects', 'activities', 'enrollments', 'learning_outcomes']);

const FIELD_LABELS = {
    citizen_id: 'เลขประจำตัวประชาชน', student_code: 'รหัสนักเรียน', prefix: 'คำนำหน้า', first_name: 'ชื่อ', last_name: 'นามสกุล',
    current_grade_level: 'ระดับชั้น', current_room: 'ห้องเรียน', student_status: 'สถานภาพ', role: 'บทบาท', homeroom: 'ห้องประจำชั้น',
    is_active: 'สถานะใช้งาน', academic_year: 'ปีการศึกษา', semester: 'ภาคเรียน', subject_name: 'ชื่อวิชา', grade_level: 'ระดับชั้น',
    subject_group: 'กลุ่มวิชา', teacher_id: 'ครูผู้สอน', lo_code: 'รหัส LO', ability_no: 'ข้อที่', level_group: 'ช่วงชั้น',
    competency_area: 'ด้านความสามารถ', lo_description: 'รายละเอียดผลลัพธ์การเรียนรู้', competency_level: 'ระดับความสามารถ', behavior_text: 'คำบรรยายพฤติกรรม',
    new_password: 'กำหนดรหัสผ่านใหม่', dob: 'วันเดือนปีเกิด', teaching_hours: 'จำนวนชั่วโมงเรียน', is_custom_competency: 'สมรรถนะเพิ่มเติม',
};

const hiddenField = (key, table) => ['teacher_roles', 'password_hash', 'plain_password', 'school_id', 'created_at', 'updated_at', 'student_id', 'teacher_id', 'subject_id', 'lo_id', 'id'].includes(key)
    || (table === 'subjects' && key === 'subject_code');

const VALUE_LABELS = {
    active: 'ใช้งาน', inactive: 'ไม่ใช้งาน', admin: 'ฝ่ายวิชาการ', teacher: 'ครูผู้สอน', executive: 'ผู้บริหาร', student: 'นักเรียน',
};

// คอลัมน์ที่แก้ไม่ได้ เพราะเป็นรหัสอ้างอิงที่ผูกกับผลการประเมินและการลงทะเบียนไว้แล้ว
// ถ้าแก้ ข้อมูลที่เชื่อมกันอยู่จะขาดออกจากกันโดยไม่มีทางกู้คืน
// รหัสอ้างอิงถูกซ่อนไม่ให้แสดงเป็นคอลัมน์อยู่แล้ว รายการนี้กันไว้อีกชั้น
// เผื่อข้อมูลบางตารางส่งคีย์นี้กลับมา จะได้ไม่ถูกส่งไปแก้โดยไม่ตั้งใจ
const READONLY_FIELDS = {
    users_teachers: ['teacher_id'],
    users_students: ['student_id'],
    subjects: ['subject_id'],
    learning_outcomes: ['lo_id'],
};
const isReadonlyField = (key, table) => (READONLY_FIELDS[table] || []).includes(key);

// ช่องที่มีค่าที่เป็นไปได้จำกัด ต้องเลือกจากรายการ พิมพ์เองแล้วผิดเพียงตัวอักษรเดียว
// เช่น admi แทน admin จะทำให้บัญชีนั้นเข้าใช้งานไม่ได้ทันที
const ROLE_CHOICES = [['teacher', 'ครูผู้สอน'], ['admin', 'ฝ่ายวิชาการ'], ['executive', 'ผู้บริหาร']];

const FIELD_OPTIONS = {
    is_active: [['true', 'ใช้งาน'], ['false', 'ระงับการใช้งาน']],
    student_status: [['active', 'ใช้งาน'], ['inactive', 'ไม่ใช้งาน']],
    semester: [['1', 'ภาคเรียนที่ 1'], ['2', 'ภาคเรียนที่ 2']],
    is_custom_competency: [['true', 'ใช่'], ['false', 'ไม่ใช่']],
    grade_level: [['ป.1', 'ป.1'], ['ป.2', 'ป.2'], ['ป.3', 'ป.3'], ['ป.4', 'ป.4'], ['ป.5', 'ป.5'], ['ป.6', 'ป.6']],
};


// ครู 1 คนมีได้หลายบทบาท teacher_roles คือแหล่งข้อมูลจริง
// ส่วน users_teachers.role คงไว้เป็นบทบาทหลักเพื่อให้โค้ดเดิมและ session ยังทำงานได้
async function syncTeacherRoles(teacherId, roles, primaryRole) {
    const wanted = [...new Set(roles)].filter(Boolean);
    if (wanted.length === 0) return;
    const primary = wanted.includes(primaryRole) ? primaryRole : wanted[0];

    const { data: existing, error: readError } = await supabase.from('teacher_roles')
        .select('teacher_role_id, role').eq('teacher_id', teacherId);
    if (readError) throw readError;

    const current = new Set((existing || []).map(row => row.role));
    const toAdd = wanted.filter(role => !current.has(role));
    const toRemove = (existing || []).filter(row => !wanted.includes(row.role));

    if (toAdd.length) {
        const { error } = await supabase.from('teacher_roles')
            .insert(toAdd.map(role => ({ teacher_id: teacherId, role, is_primary: false })));
        if (error) throw error;
    }
    for (const row of toRemove) {
        const { error } = await supabase.from('teacher_roles').delete().eq('teacher_role_id', row.teacher_role_id);
        if (error) throw error;
    }
    // ตั้งบทบาทหลักทีละขั้น เพื่อไม่ให้ชน unique index ที่อนุญาตให้มี primary ได้คนละ 1 แถว
    const { error: clearError } = await supabase.from('teacher_roles')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('teacher_id', teacherId).neq('role', primary);
    if (clearError) throw clearError;
    const { error: setError } = await supabase.from('teacher_roles')
        .update({ is_primary: true, updated_at: new Date().toISOString() })
        .eq('teacher_id', teacherId).eq('role', primary);
    if (setError) throw setError;
}

// ตรวจก่อนบันทึก คืนข้อความเตือนถ้าพบข้อผิดพลาด
function validateRowEdit(table, data) {
    const errors = [];
    if (['users_teachers', 'users_students'].includes(table)) {
        const id = String(data.citizen_id ?? '').replace(/\D/g, '');
        if (id.length !== 13) errors.push(`เลขประจำตัวประชาชนต้องมี 13 หลัก (ขณะนี้ ${id.length} หลัก) หากแก้ผิด เจ้าของบัญชีจะเข้าสู่ระบบไม่ได้`);
        if (!String(data.first_name ?? '').trim()) errors.push('ต้องมีชื่อ');
    }
    if (data.new_password !== undefined && data.new_password !== null && String(data.new_password).trim() !== '') {
        const pw = String(data.new_password).replace(/\D/g, '');
        if (pw.length !== 8) errors.push('รหัสผ่านใหม่ต้องเป็นวันเดือนปีเกิด 8 หลัก เช่น 05012555');
    }
    if (table === 'learning_outcomes' && !String(data.lo_description ?? '').trim()) {
        errors.push('ต้องมีรายละเอียดผลลัพธ์การเรียนรู้');
    }
    return errors;
}

const displayValue = (value, key, row) => {
    if (key === 'role' && Array.isArray(row?.teacher_roles) && row.teacher_roles.length > 0) {
        // ครูที่ปฏิบัติหลายหน้าที่ ต้องเห็นครบทุกบทบาท ไม่ใช่เฉพาะบทบาทหลัก
        return row.teacher_roles
            .map(item => (item.is_primary ? `${VALUE_LABELS[item.role] || item.role} (หลัก)` : VALUE_LABELS[item.role] || item.role))
            .join(' · ');
    }
    if (key === 'is_custom_competency') return value === true ? 'เพิ่มเติมจากหลักสูตร' : 'ตามหลักสูตร';
    if (value === true) return 'ใช้งาน';
    if (value === false) return 'ไม่ใช้งาน';
    if (VALUE_LABELS[value]) return VALUE_LABELS[value];
    return value?.toString() || '-';
};

export default function AdminDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(['data', 'import', 'mapping', 'enrollment', 'progress', 'promotion'].includes(requestedTab) ? requestedTab : 'overview');

    useEffect(() => {
        const nextTab = WORKSPACE_TABS.some(tab => tab.id === requestedTab) ? requestedTab : 'overview';
        setActiveTab(nextTab);
    }, [requestedTab]);

    // Stats for Dashboard Overview
    const [stats, setStats] = useState({ students: 0, teachers: 0, subjects: 0, contexts: 0, learningOutcomes: 0 });

    // Data Tab States
    const [selectedTable, setSelectedTable] = useState('');
    const [tableData, setTableData] = useState([]);
    const [loadingData, setLoadingData] = useState(false);
    const [editingRow, setEditingRow] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Mapping Tab States
    const [subjects, setSubjects] = useState([]);
    const [mappingSubject, setMappingSubject] = useState('');
    const [allLOs, setAllLOs] = useState([]);
    const [mappedLOs, setMappedLOs] = useState([]);
    const [loadingMapping, setLoadingMapping] = useState(false);
    const [savingMapping, setSavingMapping] = useState(false);

    // Enrollment UI States
    const [allStudents, setAllStudents] = useState([]);
    const [enrollSubject, setEnrollSubject] = useState('');
    const [enrollRoom, setEnrollRoom] = useState('ป.1/1');
    const [loadingEnrollments, setLoadingEnrollments] = useState(false);
    const [subjectEnrollments, setSubjectEnrollments] = useState([]);
    
    // Auto-complete student search
    const [studentSearchInput, setStudentSearchInput] = useState('');
    const [showStudentDropdown, setShowStudentDropdown] = useState(false);
    const studentSearchRef = useRef(null);

    const filteredEnrollStudents = useMemo(() => {
        if (!studentSearchInput.trim()) return [];
        const lower = studentSearchInput.toLowerCase();
        return allStudents.filter(s => 
            (s.first_name?.toLowerCase().includes(lower) || 
             s.last_name?.toLowerCase().includes(lower) || 
             s.student_code?.toLowerCase().includes(lower) ||
             s.current_room?.toLowerCase().includes(lower))
        ).slice(0, 15); // Show only top 15 matches to keep UI fast
    }, [studentSearchInput, allStudents]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (studentSearchRef.current && !studentSearchRef.current.contains(event.target)) {
                setShowStudentDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Evaluation Progress States
    const [evalProgress, setEvalProgress] = useState([]);
    const [loadingProgress, setLoadingProgress] = useState(false);
    const [progressLoaded, setProgressLoaded] = useState(false);
    const [progressError, setProgressError] = useState('');

    const loadEvaluationProgress = useCallback(async () => {
        if (!currentUser?.school_id) return;

        setLoadingProgress(true);
        setProgressError('');
        try {
            const { data: subs, error: subjectsError } = await supabase
                .from('subjects')
                .select('subject_id, subject_name, grade_level, semester, academic_year, teacher_id, users_teachers(prefix, first_name, last_name)')
                .eq('school_id', currentUser.school_id)
                .eq('academic_year', academicYear)
                .eq('semester', semester)
                .order('subject_name');
            if (subjectsError) throw subjectsError;

            const subjectIds = (subs || []).map(subject => subject.subject_id);
            if (subjectIds.length === 0) {
                setEvalProgress([]);
                return;
            }

            const enrolls = await fetchAllByIn(subjectIds, (batch, from, to) => supabase
                .from('student_enrollments')
                .select('enrollment_id, subject_id')
                .in('subject_id', batch)
                .eq('enrollment_status', 'active')
                .range(from, to));

            const loMaps = await fetchAllByIn(subjectIds, (batch, from, to) => supabase
                .from('subject_lo_mapping')
                .select('subject_id, lo_id')
                .in('subject_id', batch)
                .range(from, to));

            const enrollmentIds = enrolls.map(enrollment => enrollment.enrollment_id);
            const evaluations = enrollmentIds.length > 0
                ? await fetchAllByIn(enrollmentIds, (batch, from, to) => supabase
                    .from('lo_evaluations')
                    .select('enrollment_id, lo_id, evidence_note')
                    .in('enrollment_id', batch)
                    .range(from, to))
                : [];

            const enrollmentCountBySubject = new Map();
            const subjectByEnrollment = new Map();
            enrolls.forEach(enrollment => {
                enrollmentCountBySubject.set(enrollment.subject_id, (enrollmentCountBySubject.get(enrollment.subject_id) || 0) + 1);
                subjectByEnrollment.set(enrollment.enrollment_id, enrollment.subject_id);
            });

            const loIdsBySubject = new Map();
            loMaps.forEach(mapping => {
                if (!loIdsBySubject.has(mapping.subject_id)) loIdsBySubject.set(mapping.subject_id, new Set());
                loIdsBySubject.get(mapping.subject_id).add(mapping.lo_id);
            });

            const filledCountBySubject = new Map();
            evaluations.forEach(evaluation => {
                if (!evaluation.evidence_note?.trim()) return;
                const subjectId = subjectByEnrollment.get(evaluation.enrollment_id);
                if (!subjectId || !loIdsBySubject.get(subjectId)?.has(evaluation.lo_id)) return;
                filledCountBySubject.set(subjectId, (filledCountBySubject.get(subjectId) || 0) + 1);
            });

            const progress = (subs || []).map(subject => {
                const studentCount = enrollmentCountBySubject.get(subject.subject_id) || 0;
                const loCount = loIdsBySubject.get(subject.subject_id)?.size || 0;
                const totalCells = studentCount * loCount;
                const filledCells = filledCountBySubject.get(subject.subject_id) || 0;
                const percent = totalCells > 0 ? Math.round((filledCells / totalCells) * 100) : 0;
                const teacher = subject.users_teachers;

                return {
                    ...subject,
                    teacherName: teacher ? `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}` : 'ยังไม่มอบหมาย',
                    studentCount,
                    loCount,
                    totalCells,
                    filledCells,
                    percent,
                };
            }).sort((a, b) => a.percent - b.percent || (a.subject_name || '').localeCompare(b.subject_name || '', 'th'));

            setEvalProgress(progress);
        } catch (error) {
            const message = error.message || 'ไม่สามารถโหลดสถานะการรายงานผลได้';
            setProgressError(message);
            toast.error('โหลดข้อมูลไม่สำเร็จ: ' + message);
        } finally {
            setLoadingProgress(false);
            setProgressLoaded(true);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => {
        if (activeTab !== 'progress') return;
        setProgressLoaded(false);
        setEvalProgress([]);
        loadEvaluationProgress();
    }, [activeTab, loadEvaluationProgress]);

    // Promotion States
    const [promoFromRoom, setPromoFromRoom] = useState('');
    const [promoToGrade, setPromoToGrade] = useState('');
    const [promoToRoom, setPromoToRoom] = useState('');
    const [loadingPromo, setLoadingPromo] = useState(false);
    const [promoStudents, setPromoStudents] = useState([]);
    const [promoSelectedStudents, setPromoSelectedStudents] = useState([]);
    const [importWizardType, setImportWizardType] = useState(null);

    // Load common base data & stats
    useEffect(() => {
        if (!currentUser) return;
        
        supabase.from('subjects').select('*').eq('school_id', currentUser.school_id)
            .then(({ data }) => {
                setSubjects(data || []);
                const currentSubjects = (data || []).filter(item => item.academic_year === academicYear && item.semester === semester);
                setStats(prev => ({ ...prev, subjects: currentSubjects.length }));
            });
            
        // ใช้ fetchAllRows เพื่อดึงนักเรียนทุกคน (ไม่ติด Supabase 1,000 row limit)
        fetchAllRows((from, to) =>
            supabase.from('users_students').select('student_id, citizen_id, student_code, prefix, first_name, last_name, current_room, current_grade_level, student_status').eq('school_id', currentUser.school_id).range(from, to)
        ).then(data => {
            setAllStudents(data || []);
            setStats(prev => ({ ...prev, students: data?.length || 0 }));
        }).catch(err => console.error('โหลดนักเรียนไม่สำเร็จ:', err.message));

        supabase.from('users_teachers').select('teacher_id', { count: 'exact', head: true })
            .eq('school_id', currentUser.school_id)
            .then(({ count }) => {
                setStats(prev => ({ ...prev, teachers: count || 0 }));
            });

        supabase.from('learning_contexts').select('context_id', { count: 'exact', head: true })
            .eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester)
            .then(({ count }) => setStats(prev => ({ ...prev, contexts: count || 0 })));

        supabase.from('learning_outcomes').select('lo_id', { count: 'exact', head: true })
            .eq('school_id', currentUser.school_id)
            .then(({ count }) => setStats(prev => ({ ...prev, learningOutcomes: count || 0 })));
    }, [academicYear, currentUser, semester]);

    // --- DATA MANAGEMENT ---
    const loadTableData = async (table, page = 1) => {
        if (table !== selectedTable) {
            setSearchTerm(''); // Clear search when switching tables
            setCurrentPage(1);
            setTableData([]);
            setEditingRow(null);
            page = 1;
        }
        setSelectedTable(table);
        if (!table) { setTableData([]); return; }

        setLoadingData(true);
        try {
            const limit = 50;
            const from = (page - 1) * limit;
            const to = from + limit - 1;

            let query = supabase.from(table).select(SAFE_TABLE_SELECT[table] || '*', { count: 'exact' });
            if (SCHOOL_SCOPED_TABLES.includes(table)) {
                query = query.eq('school_id', currentUser.school_id);
            }
            if (table === 'learning_outcomes') query.order('ability_no', { ascending: true });
            else if (table === 'users_students') query.order('student_code', { ascending: true });
            else if (table === 'behavior_templates') query.order('competency_area', { ascending: true }).order('competency_level', { ascending: true });
            else query.order('created_at', { ascending: false });

            const { data, count, error } = await query.range(from, to);
            if (error) throw error;
            
            setTableData(data || []);
            setTotalPages(Math.ceil((count || 0) / limit) || 1);
            setCurrentPage(page);
        } catch (err) {
            setTableData([]);
            setTotalPages(1);
            toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
        } finally {
            setLoadingData(false);
        }
    };

    const handleDelete = async (idValue, idCol) => {
        if (READ_ONLY_TABLES.has(selectedTable)) {
            toast.error('คลังคำบรรยายกลางเป็นข้อมูลอ่านอย่างเดียว เพื่อไม่ให้โรงเรียนหนึ่งแก้ข้อมูลที่ทุกโรงเรียนใช้ร่วมกัน');
            return;
        }
        if (!window.confirm('ยืนยันการลบข้อมูลรายการนี้ หากมีผลการประเมินเชื่อมโยงอยู่ ระบบจะไม่อนุญาตให้ลบ')) return;
        try {
            let query = supabase.from(selectedTable).delete().eq(idCol, idValue);
            if (SCHOOL_SCOPED_TABLES.includes(selectedTable)) {
                query = query.eq('school_id', currentUser.school_id);
            }
            const { error } = await query;
            if (error) throw error;
            toast.success('ลบข้อมูลสำเร็จ');
            loadTableData(selectedTable);
        } catch (err) {
            toast.error('ลบไม่สำเร็จ: ' + err.message);
        }
    };

    const handleUpdate = async (idValue, idCol, updatedObj) => {
        if (READ_ONLY_TABLES.has(selectedTable)) {
            toast.error('คลังคำบรรยายกลางเป็นข้อมูลอ่านอย่างเดียว');
            return;
        }
        const problems = validateRowEdit(selectedTable, updatedObj);
        if (problems.length > 0) {
            toast.error(problems[0], { duration: 6000 });
            return;
        }
        try {
            const payload = { ...updatedObj };
            // รหัสอ้างอิงห้ามถูกส่งไปแก้ไม่ว่ากรณีใด
            (READONLY_FIELDS[selectedTable] || []).forEach(field => delete payload[field]);
            if (payload.is_active !== undefined) payload.is_active = payload.is_active === true || payload.is_active === 'true';
            if (payload.is_custom_competency !== undefined) payload.is_custom_competency = payload.is_custom_competency === true || payload.is_custom_competency === 'true';
            if (payload.teaching_hours !== undefined) payload.teaching_hours = payload.teaching_hours === '' ? null : Number(payload.teaching_hours);
            if (payload.citizen_id !== undefined) payload.citizen_id = String(payload.citizen_id).replace(/\D/g, '');
            if (payload.new_password) {
                payload.password_hash = await hashPassword(payload.new_password.toString().trim());
                delete payload.new_password;
            }

            // บทบาทหลายค่าเก็บในตารางแยก ไม่ส่งไปกับ payload ของ users_teachers
            const nextRoles = selectedTable === 'users_teachers' && Array.isArray(payload.roles) ? payload.roles : null;
            delete payload.roles;
            delete payload.teacher_roles;
            if (nextRoles) payload.role = nextRoles.includes(payload.role) ? payload.role : nextRoles[0];

            let query = supabase.from(selectedTable).update(payload).eq(idCol, idValue);
            if (SCHOOL_SCOPED_TABLES.includes(selectedTable)) {
                query = query.eq('school_id', currentUser.school_id);
            }
            const { error } = await query;
            if (error) throw error;
            if (nextRoles) await syncTeacherRoles(idValue, nextRoles, payload.role);
            toast.success('อัปเดตข้อมูลสำเร็จ');
            setEditingRow(null);
            loadTableData(selectedTable);
        } catch (err) {
            toast.error('อัปเดตไม่สำเร็จ: ' + err.message);
        }
    };

    // เปิดแท็บข้อมูลหลักสูตรแล้วเลือกรายวิชาให้เลย ไม่ต้องให้ผู้ใช้เจอหน้าว่างก่อน
    // วางไว้ที่ effect เพราะเข้าหน้านี้ผ่าน URL ตรงได้ ไม่ได้ผ่านการกดแท็บเสมอไป
    useEffect(() => {
        if (activeTab === 'data' && !selectedTable && !loadingData) loadTableData('subjects');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, selectedTable]);

    // Filtered data for real-time search
    const filteredTableData = useMemo(() => {
        if (!searchTerm) return tableData;
        return tableData.filter(row => 
            Object.values(row).some(val => 
                val !== null && val !== undefined && 
                String(val).toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [tableData, searchTerm]);

    // ─── CSV Sanitize Helpers ────────────────────────────────────────────
    // Fix Excel scientific notation: 1.4299001272800E+12 → "1429900127280"
    // Fix decimal suffix: 1234567890123.00 → "1234567890123"
    // ค่าที่ Excel ย่อจนเลขหายไปแล้ว เช่น 1.43E+12 กู้คืนไม่ได้ ต้องให้ผู้ใช้แก้ไฟล์
    const LOSSY_SCIENTIFIC = '__EXCEL_LOSSY__';
    // ข้อความนี้จะขึ้นเฉพาะกรณีที่ตัวเลขหายไปจากไฟล์จริงแล้ว
    // ถ้าเซลล์ยังเป็นชนิดตัวเลข ระบบอ่านค่าเต็มได้เองและไม่แจ้งเตือน
    const LOSSY_HELP = 'เลขประจำตัวประชาชนในไฟล์เหลือแค่ตัวเลขย่อ (เช่น 1.23457E+12) ไม่ใช่แค่การแสดงผล แต่ตัวเลขหายจากไฟล์แล้วและกู้คืนไม่ได้ วิธีแก้: ส่งออกจาก DMC เป็น .xlsx โดยตรง หรือถ้าเป็นไฟล์ CSV ให้เปิด Excel เปล่าแล้วใช้ Data › From Text/CSV และตั้งคอลัมน์เลขบัตรเป็น Text ก่อนกด Load ห้ามดับเบิลคลิกเปิดไฟล์ CSV แล้วกดบันทึก';

    // Excel เก็บเลขบัตรเป็น "ตัวเลข" ได้ ซึ่งค่าที่เก็บไว้ยังครบทุกหลัก
    // แต่ SheetJS จะจัดรูปแบบเป็น 1.4299E+12 ตอนอ่านเป็นข้อความ
    // จึงต้องใช้ค่าดิบเมื่อเซลล์เป็นตัวเลข ส่วนกรณีที่ "ข้อความในไฟล์" เป็น
    // ตัวเลขวิทยาศาสตร์อยู่แล้ว คือเลขหายไปจริงและต้องปฏิเสธ
    const cellToIdText = (rawValue, formattedValue) => {
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            return Number.isInteger(rawValue) ? rawValue.toFixed(0) : String(rawValue);
        }
        const raw = String(rawValue ?? '').trim();
        if (raw) return raw;
        return String(formattedValue ?? '').trim();
    };

    // แปลงวันที่ของ Excel เป็น DDMMYYYY พุทธศักราช
    // เซลล์วันที่จริงจะถูกเก็บเป็นเลขลำดับวัน ต้องแปลงก่อน
    // ปีที่ได้ถ้าน้อยกว่า 2400 แปลว่าเป็น ค.ศ. ต้องบวก 543
    const excelSerialToThaiDob = (serial) => {
        if (typeof serial !== 'number' || !Number.isFinite(serial) || serial <= 0) return null;
        const parsed = XLSX.SSF?.parse_date_code?.(serial);
        if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
        const year = parsed.y < 2400 ? parsed.y + 543 : parsed.y;
        return `${String(parsed.d).padStart(2, '0')}${String(parsed.m).padStart(2, '0')}${year}`;
    };
    const sanitizeCitizenId = (raw) => {
        if (!raw && raw !== 0) return '';
        let s = String(raw).trim();
        // Handle scientific notation (e.g. 1.43E+12)
        if (/[eE]/.test(s)) {
            const n = parseFloat(s);
            if (isNaN(n)) return '';
            // เลขที่ Excel เก็บไว้ต้องมีจำนวนหลักไม่น้อยกว่าเลขที่แปลงกลับได้ มิฉะนั้นแปลว่าหลักท้ายหายไปแล้ว
            const mantissaDigits = s.split(/[eE]/)[0].replace(/\D/g, '').length;
            const restored = Math.round(n).toString();
            if (mantissaDigits < restored.length) return LOSSY_SCIENTIFIC;
            s = restored;
        }
        // Strip trailing .0, .00, etc. (Excel decimal)
        s = s.replace(/\.0+$/, '');
        // Strip any non-digit characters (spaces, dashes)
        s = s.replace(/\D/g, '');
        return s;
    };

    const sanitizeDOB = (raw) => {
        if (!raw && raw !== 0) return '';
        let s = String(raw).trim();
        // Handle scientific notation in dob (rare but possible)
        if (/[eE]/.test(s)) {
            const n = parseFloat(s);
            if (!isNaN(n)) s = Math.round(n).toString();
        }
        s = s.replace(/\.0+$/, '');
        s = s.replace(/\D/g, '');
        // Pad to 8 digits if needed (e.g. 2022534 → 02022534)
        s = s.padStart(8, '0');
        return s;
    };

    // Validate a row's citizen_id and dob, return null if OK or error string
    const validateCitizenRow = (cleanId, cleanDob, rowNum) => {
        const errors = [];
        if (!cleanId) errors.push(`แถว ${rowNum}: citizen_id ว่างเปล่า`);
        else if (cleanId === LOSSY_SCIENTIFIC) errors.push(`แถว ${rowNum}: ${LOSSY_HELP}`);
        else if (cleanId.length !== 13) errors.push(`แถว ${rowNum}: citizen_id "${cleanId}" ต้องมี 13 หลัก (มี ${cleanId.length} หลัก)`);
        else if (/^(1{13}|2{13}|3{13}|0{13})$/.test(cleanId)) errors.push(`แถว ${rowNum}: citizen_id "${cleanId}" ดูเหมือนเป็นข้อมูลทดสอบ`);
        if (!cleanDob) errors.push(`แถว ${rowNum}: dob ว่างเปล่า`);
        else if (cleanDob.length !== 8) errors.push(`แถว ${rowNum}: dob "${cleanDob}" ต้องมี 8 หลัก DDMMYYYY`);
        return errors;
    };

    // ห้าม upsert เลขบัตรที่เป็นของโรงเรียนอื่น เพราะ onConflict แบบ global
    // สามารถย้ายเจ้าของบัญชีและเปลี่ยนรหัสผ่านโดยไม่ตั้งใจได้
    const saveIdentityRowsSafely = async (table, rows) => {
        const deduplicated = [...new Map(rows.map(row => [row.citizen_id, row])).values()];
        const ids = deduplicated.map(row => row.citizen_id);
        const existing = await fetchAllByIn(ids, (batch, from, to) => supabase.from(table)
            .select('citizen_id, school_id').in('citizen_id', batch).range(from, to));
        const existingById = new Map(existing.map(row => [row.citizen_id, row]));
        const crossSchool = deduplicated.filter(row => {
            const found = existingById.get(row.citizen_id);
            return found && found.school_id !== currentUser.school_id;
        });
        const safeRows = deduplicated.filter(row => !crossSchool.some(item => item.citizen_id === row.citizen_id));
        const existingHere = safeRows.filter(row => existingById.get(row.citizen_id)?.school_id === currentUser.school_id);
        const newRows = safeRows.filter(row => !existingById.has(row.citizen_id));

        if (existingHere.length) {
            const { error } = await supabase.from(table).upsert(existingHere, { onConflict: 'citizen_id' });
            if (error) throw error;
        }
        if (newRows.length) {
            // ignoreDuplicates ปิดช่อง race condition: ถ้าโรงเรียนอื่นเพิ่มเลขเดียวกัน
            // หลังขั้นตรวจสอบ แถวใหม่จะถูกข้าม ไม่เขียนทับบัญชีที่เพิ่งสร้าง
            const { error } = await supabase.from(table).upsert(newRows, { onConflict: 'citizen_id', ignoreDuplicates: true });
            if (error) throw error;
        }
        if (crossSchool.length) {
            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: 'reject_cross_school_identity_import',
                entity_type: table,
                detail: { rejected_count: crossSchool.length },
            });
            toast.error(`ไม่นำเข้า ${crossSchool.length} รายการ เพราะเลขประจำตัวนี้อยู่ในโรงเรียนอื่นแล้ว กรุณาติดต่อผู้ดูแลระบบเพื่อดำเนินการย้ายสถานศึกษา`, { duration: 12000 });
        }
        return { savedRows: safeRows, rejectedCount: crossSchool.length };
    };
    // ────────────────────────────────────────────────────────────────────────

    // ─── File Parser: supports both .csv and .xlsx ───────────────────────────
    const parseUploadedFile = (file) => new Promise((resolve, reject) => {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'xlsx' || ext === 'xls') {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'array', cellText: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    // ข้อความตามที่แสดงใช้กับข้อความทั่วไป ส่วนเลขบัตรและวันเกิดต้องใช้ค่าดิบ
                    // เพราะ Excel เก็บเป็นตัวเลขได้ แล้วจะถูกจัดรูปแบบเป็น 1.43E+12 หรือเลขลำดับวัน
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
                    const valueRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
                    rows.forEach((row, i) => {
                        const values = valueRows[i] || {};
                        if ('citizen_id' in row) row.citizen_id = cellToIdText(values.citizen_id, row.citizen_id);
                        if ('student_citizen_id' in row) row.student_citizen_id = cellToIdText(values.student_citizen_id, row.student_citizen_id);
                        if ('teacher_citizen_id' in row) row.teacher_citizen_id = cellToIdText(values.teacher_citizen_id, row.teacher_citizen_id);
                        if ('student_code' in row) row.student_code = cellToIdText(values.student_code, row.student_code);
                        if ('dob' in row && typeof values.dob === 'number') {
                            row.dob = excelSerialToThaiDob(values.dob) || row.dob;
                        }
                    });
                    resolve(rows);
                } catch (err) {
                    reject(new Error('อ่านไฟล์ Excel ไม่สำเร็จ: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('เปิดไฟล์ไม่สำเร็จ'));
            reader.readAsArrayBuffer(file);
        } else {
            // CSV fallback via PapaParse
            Papa.parse(file, {
                header: true, skipEmptyLines: true,
                complete: (results) => resolve(results.data),
                error: (err) => reject(new Error(err.message)),
            });
        }
    });
    // ──────────────────────────────────────────────────────────────

    // --- DMC Import Handler ---
    const handleDMCImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = null;
        toast.loading('กำลังอ่านไฟล์ DMC...', { id: 'dmc' });
        try {
            const reader = new FileReader();
            const buffer = await new Promise((res, rej) => { reader.onload = ev => res(ev.target.result); reader.onerror = rej; reader.readAsArrayBuffer(file); });
            const wb = XLSX.read(buffer, { type: 'array', cellText: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            // อ่านสองชุด ข้อความตามที่แสดงใช้กับวันเกิด ค่าดิบใช้กับเลขบัตรและรหัสนักเรียน
            const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
            const valueRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

            // DMC: Row0=metadata (contains "วันและเวลา"), Row1=column headers, Row2+=data
            const isDMC = String(rawRows[0]?.[0] || '').includes('วันและเวลา');
            if (!isDMC) { toast.error('ไฟล์นี้ไม่ใช่รูปแบบ DMC (แถวแรกต้องเป็น "วันและเวลาที่สร้างรายงาน")', { id: 'dmc' }); return; }

            // DMC Column index (0-based): 0=รหัสรร 1=ลำดับ 2=citizen_id 3=ชั้น 4=ห้อง 5=student_code 6=เพศ 7=prefix 8=first_name 9=last_name 10=dob
            const COL = { CITIZEN: 2, GRADE: 3, ROOM: 4, CODE: 5, PREFIX: 7, FNAME: 8, LNAME: 9, DOB: 10 };
            const prefixMap = { 'เด็กชาย': 'ด.ช.', 'เด็กหญิง': 'ด.ญ.' };

            // Convert DMC DOB: "25/06/2564" → "25062564" (DDMMYYYY BE for password)
            const parseDMCDob = (raw) => {
                const m = String(raw || '').trim().match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
                if (!m) return null;
                return `${m[1].padStart(2,'0')}${m[2].padStart(2,'0')}${m[3]}`;
            };

            const validRows = [], invalidRows = [];
            const dataRows = rawRows.slice(2);
            const dataValueRows = valueRows.slice(2);
            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                const valueRow = dataValueRows[i] || [];
                if (!row || row.every(c => !String(c).trim())) continue;
                const cleanId = sanitizeCitizenId(cellToIdText(valueRow[COL.CITIZEN], row[COL.CITIZEN]).replace(/^'+/, ''));
                const dobStr = parseDMCDob(row[COL.DOB]) || excelSerialToThaiDob(valueRow[COL.DOB]);
                const fname = String(row[COL.FNAME] || '').trim();
                const lname = String(row[COL.LNAME] || '').trim();
                const prefix = prefixMap[String(row[COL.PREFIX] || '').trim()] || String(row[COL.PREFIX] || '').trim();
                const code = cellToIdText(valueRow[COL.CODE], row[COL.CODE]).replace(/\.0+$/, '');
                // ดึงชั้นและห้องจาก DMC แล้วรวมเป็น current_room เช่น "ป.3/2"
                const gradeRaw = String(row[COL.GRADE] || '').trim();   // เช่น "ป.3"
                const roomRaw  = String(row[COL.ROOM]  || '').trim().replace(/\.0+$/, ''); // เช่น "2"
                const currentRoom       = gradeRaw && roomRaw ? `${gradeRaw}/${roomRaw}` : (gradeRaw || null); // เช่น "ป.3/2"
                const currentGradeLevel = gradeRaw || null; // เช่น "ป.3" แยกเก็บสำหรับฟีเจอร์เลื่อนชั้น
                const errs = [];
                if (cleanId === LOSSY_SCIENTIFIC) errs.push(LOSSY_HELP);
                else if (cleanId.length !== 13) errs.push(`citizen_id "${row[COL.CITIZEN]}" ไม่ใช่ 13 หลัก (${cleanId.length})`);
                if (!dobStr) errs.push(`วันเกิด "${row[COL.DOB]}" ไม่ถูกต้อง`);
                if (!fname) errs.push('ไม่มีชื่อ');
                if (errs.length > 0) invalidRows.push({ row: i + 3, name: `${fname} ${lname}`, errors: errs });
                else validRows.push({ citizen_id: cleanId, dob: dobStr, student_code: code, prefix, first_name: fname, last_name: lname, current_room: currentRoom, current_grade_level: currentGradeLevel });
            }

            // ถ้าสาเหตุคือเลขบัตรหายจากไฟล์ ต้องอธิบายวิธีแก้ให้เห็นบนหน้าจอ ไม่ใช่ซ่อนไว้ใน console
            const lossyCount = invalidRows.filter(r => r.errors.some(e => e === LOSSY_HELP)).length;
            if (lossyCount > 0) {
                toast.error(`${lossyCount} แถวมีปัญหาเลขประจำตัวประชาชน\n\n${LOSSY_HELP}`, { id: 'dmc-lossy', duration: 30000 });
            }
            if (validRows.length === 0) {
                toast.error(`ไม่มีแถวที่นำเข้าได้เลย (ผิดทั้งหมด ${invalidRows.length} แถว)`, { id: 'dmc' });
                console.warn('[DMC Invalid]', invalidRows);
                return;
            }
            if (invalidRows.length > 0) {
                toast.error(`ข้ามแถวที่ข้อมูลไม่ครบ ${invalidRows.length} แถว จะนำเข้า ${validRows.length} แถวที่ถูกต้อง`, { duration: 8000 });
                console.warn('[DMC Invalid]', invalidRows);
            }

            const payload = await Promise.all(validRows.map(async r => ({
                school_id: currentUser.school_id, citizen_id: r.citizen_id,
                password_hash: await hashPassword(r.dob),
                student_code: r.student_code || null, prefix: r.prefix,
                first_name: r.first_name, last_name: r.last_name,
                current_room: r.current_room || null,
                current_grade_level: r.current_grade_level || null,
                student_status: 'active',
            })));

            const { savedRows } = await saveIdentityRowsSafely('users_students', payload);
            if (!savedRows.length) throw new Error('ไม่มีรายการที่นำเข้าได้ เนื่องจากเลขประจำตัวอยู่ในโรงเรียนอื่นทั้งหมด');
            const updated = await fetchAllRows((from, to) =>
                supabase.from('users_students').select('student_id, citizen_id, student_code, prefix, first_name, last_name, current_room, current_grade_level, student_status').eq('school_id', currentUser.school_id).range(from, to)
            );
            setAllStudents(updated || []);
            setStats(prev => ({ ...prev, students: updated?.length || 0 }));
            toast.success(`นำเข้าข้อมูลนักเรียนจาก DMC แล้ว ${savedRows.length} คน`, { id: 'dmc' });
            if (selectedTable === 'users_students') loadTableData('users_students');
        } catch (err) {
            toast.error('นำเข้าผิดพลาด: ' + err.message, { id: 'dmc' });
        }
    };

    // Flexible Import Wizard ส่งข้อมูลที่จับคู่ชื่อคอลัมน์แล้วเข้าฟังก์ชันเดียวกัน
    // เพื่อให้การนำเข้าจาก Template เดิมและไฟล์ของโรงเรียนใช้ validation ชุดเดียวกัน
    const processImportData = async (data, importType) => {
        if (!data || data.length === 0) { toast.error('ไม่พบข้อมูลสำหรับนำเข้า', { id: 'csv' }); return; }
        toast.loading('กำลังตรวจสอบและบันทึกข้อมูล...', { id: 'csv' });
        try {
                    let payload = [];
                    if (importType === 'students') {
                        if (!data[0].citizen_id || !data[0].dob) { toast.error('คอลัมน์ไม่ถูกต้อง: ต้องมี citizen_id และ dob', { id: 'csv' }); return; }

                        // Sanitize & validate all rows first
                        const validRows = [];
                        const invalidRows = [];
                        for (let i = 0; i < data.length; i++) {
                            const cleanId = sanitizeCitizenId(data[i].citizen_id);
                            const cleanDob = sanitizeDOB(data[i].dob);
                            const errs = validateCitizenRow(cleanId, cleanDob, i + 2);
                            if (errs.length > 0) {
                                invalidRows.push({ row: i + 2, errors: errs, original: data[i].citizen_id });
                            } else {
                                validRows.push({ ...data[i], citizen_id: cleanId, dob: cleanDob });
                            }
                        }

                        if (invalidRows.length > 0) {
                            const msg = `พบข้อมูลไม่ถูกต้อง ${invalidRows.length} แถว:\n` +
                                invalidRows.slice(0, 5).map(r => r.errors.join(', ')).join('\n') +
                                (invalidRows.length > 5 ? `\n...และอีก ${invalidRows.length - 5} แถว` : '');
                            if (validRows.length === 0) {
                                toast.error('ไม่มีแถวที่ถูกต้อง — ยกเลิกการนำเข้า กรุณาตรวจสอบไฟล์ CSV', { id: 'csv' });
                                toast.error(msg);
                                return;
                            }
                            // Partial import: warn but continue with valid rows
                            toast.error(`ไม่นำเข้าข้อมูลที่ไม่ถูกต้อง ${invalidRows.length} แถว กรุณาตรวจสอบรูปแบบไฟล์`);
                            console.warn('[CSV Import] Invalid rows:', invalidRows);
                        }

                        payload = await Promise.all(validRows.map(async s => ({
                            school_id: currentUser.school_id,
                            citizen_id: s.citizen_id,
                            password_hash: await hashPassword(s.dob),
                            student_code: s.student_code?.trim(),
                            prefix: s.prefix?.trim() || '',
                            first_name: s.first_name?.trim(),
                            last_name: s.last_name?.trim(),
                            // รองรับ current_room และ current_grade_level จาก CSV (ถ้ามีในไฟล์)
                            current_room: s.current_room?.trim() || null,
                            current_grade_level: s.current_grade_level?.trim() || null,
                            student_status: 'active'
                        })));
                        if (payload.length === 0) { toast.error('ไม่มีข้อมูลนำเข้า', { id: 'csv' }); return; }
                        const result = await saveIdentityRowsSafely('users_students', payload);
                        payload = result.savedRows;
                        if (!payload.length) { toast.error('ไม่มีรายการนักเรียนที่นำเข้าได้', { id: 'csv' }); return; }
                    }
                    else if (importType === 'teachers') {
                        if (!data[0].citizen_id || !data[0].dob) { toast.error('คอลัมน์ไม่ถูกต้อง: ต้องมี citizen_id และ dob', { id: 'csv' }); return; }

                        // Sanitize & validate all rows first
                        const validRows = [];
                        const invalidRows = [];
                        for (let i = 0; i < data.length; i++) {
                            const cleanId = sanitizeCitizenId(data[i].citizen_id);
                            const cleanDob = sanitizeDOB(data[i].dob);
                            const errs = validateCitizenRow(cleanId, cleanDob, i + 2);
                            if (errs.length > 0) {
                                invalidRows.push({ row: i + 2, errors: errs, original: data[i].citizen_id });
                            } else {
                                validRows.push({ ...data[i], citizen_id: cleanId, dob: cleanDob });
                            }
                        }

                        if (invalidRows.length > 0) {
                            const msg = `พบข้อมูลไม่ถูกต้อง ${invalidRows.length} แถว:\n` +
                                invalidRows.slice(0, 5).map(r => r.errors.join(', ')).join('\n') +
                                (invalidRows.length > 5 ? `\n...และอีก ${invalidRows.length - 5} แถว` : '');
                            if (validRows.length === 0) {
                                toast.error('ไม่มีแถวที่ถูกต้อง — ยกเลิกการนำเข้า กรุณาตรวจสอบไฟล์ CSV', { id: 'csv' });
                                toast.error(msg);
                                return;
                            }
                            toast.error(`ไม่นำเข้าข้อมูลที่ไม่ถูกต้อง ${invalidRows.length} แถว กรุณาตรวจสอบรูปแบบไฟล์`);
                            console.warn('[CSV Import] Invalid rows:', invalidRows);
                        }

                        payload = await Promise.all(validRows.map(async t => ({
                            school_id: currentUser.school_id,
                            citizen_id: t.citizen_id,
                            password_hash: await hashPassword(t.dob),
                            prefix: t.prefix?.trim() || '',
                            first_name: t.first_name?.trim(),
                            last_name: t.last_name?.trim(),
                            // ไฟล์นำเข้าระบุได้หลายบทบาท เช่น "teacher,admin" บทบาทแรกเป็นบทบาทหลัก
                            role: (parseRoleList(t.role)[0]) || 'teacher',
                            is_active: true
                        })));
                        if (payload.length === 0) { toast.error('ไม่มีข้อมูลนำเข้า', { id: 'csv' }); return; }
                        const result = await saveIdentityRowsSafely('users_teachers', payload);
                        payload = result.savedRows;
                        if (!payload.length) { toast.error('ไม่มีรายการครูที่นำเข้าได้', { id: 'csv' }); return; }

                        // ซิงก์บทบาททั้งหมดของแต่ละคนหลังบันทึกแถวหลักเสร็จ
                        const rolesByCitizen = new Map(validRows.map(t => {
                            const parsed = parseRoleList(t.role);
                            return [String(t.citizen_id).replace(/\D/g, ''), parsed.length ? parsed : ['teacher']];
                        }));
                        const savedTeachers = await fetchAllByIn(
                            payload.map(item => item.citizen_id),
                            (batch, from, to) => supabase.from('users_teachers')
                                .select('teacher_id, citizen_id').eq('school_id', currentUser.school_id)
                                .in('citizen_id', batch).range(from, to)
                        );
                        for (const teacher of savedTeachers) {
                            const roles = rolesByCitizen.get(teacher.citizen_id);
                            if (roles) await syncTeacherRoles(teacher.teacher_id, roles, roles[0]);
                        }
                    }
                    else if (importType === 'subjects') {
                        // Create a map to lookup teacher_id from citizen_id
                        const teachers = await fetchAllRows((from, to) =>
                            supabase.from('users_teachers')
                                .select('teacher_id, citizen_id')
                                .eq('school_id', currentUser.school_id)
                                .range(from, to)
                        );
                        const teacherMap = {};
                        teachers.forEach(t => teacherMap[t.citizen_id] = t.teacher_id);

                        let tempPayload = data.map(s => {
                            const tcId = s.teacher_citizen_id ? String(s.teacher_citizen_id).replace(/\D/g, '') : null;
                            const tId = tcId ? teacherMap[tcId] : null;

                            return {
                                school_id: currentUser.school_id, 
                                academic_year: parseInt(s.academic_year) || academicYear || (new Date().getFullYear() + 543),
                                semester: parseInt(s.semester) || semester || 1,
                                subject_code: null,
                                subject_name: s.subject_name?.trim(), 
                                grade_level: s.grade_level?.trim(),
                                subject_group: s.subject_group?.trim() || null, 
                                teacher_id: tId,
                                teaching_hours: s.teaching_hours ? parseInt(s.teaching_hours) : null
                            };
                        });
                        
                        // ชื่อวิชาเดียวกันเปิดได้หลายระดับชั้นในภาคเรียนเดียวกัน
                        const existingSet = new Set(subjects.map(s => `${s.subject_name}_${s.grade_level}_${s.academic_year}_${s.semester}`));
                        payload = tempPayload.filter(p => !existingSet.has(`${p.subject_name}_${p.grade_level}_${p.academic_year}_${p.semester}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('subjects').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลวิชาซ้ำกับที่มีอยู่ในระบบทั้งหมด', { id: 'csv' });
                            return;
                        }
                    }
                    else if (['learning_units', 'projects', 'activities'].includes(importType)) {
                        const contextType = { learning_units: 'learning_unit', projects: 'project', activities: 'activity' }[importType];
                        const teachers = await fetchAllRows((from, to) =>
                            supabase.from('users_teachers').select('teacher_id, citizen_id').eq('school_id', currentUser.school_id).range(from, to)
                        );
                        const teacherMap = Object.fromEntries(teachers.map(teacher => [teacher.citizen_id, teacher.teacher_id]));
                        payload = data.filter(row => row.context_name?.trim()).map(row => {
                            const citizenId = row.teacher_citizen_id ? String(row.teacher_citizen_id).replace(/\D/g, '') : '';
                            return {
                                school_id: currentUser.school_id,
                                context_type: contextType,
                                context_name: row.context_name.trim(),
                                description: row.description?.trim() || null,
                                academic_year: parseInt(row.academic_year) || academicYear,
                                semester: parseInt(row.semester) || semester,
                                grade_level: row.grade_level?.trim() || null,
                                subject_group: row.subject_group?.trim() || null,
                                teaching_hours: row.teaching_hours ? parseInt(row.teaching_hours) : null,
                                activity_category: contextType === 'activity' ? (row.activity_category?.trim() || null) : null,
                                responsible_teacher_id: teacherMap[citizenId] || null,
                            };
                        });
                        if (!payload.length) { toast.error('ไม่พบแถวที่มี context_name', { id: 'csv' }); return; }
                        const { error } = await supabase.from('learning_contexts').insert(payload);
                        if (error) throw error;
                    }
                    else if (importType === 'enrollments') {
                        const studentMap = {};
                        allStudents.forEach(st => studentMap[st.citizen_id] = st.student_id);
                        
                        let tempPayload = [];
                        let missingData = 0;
                        let ambiguousData = 0;

                        data.forEach(e => {
                            const cId = e.student_citizen_id ? String(e.student_citizen_id).replace(/\D/g, '') : null;
                            const sName = e.subject_name?.trim();
                            const stId = studentMap[cId];
                            const room = e.room?.trim() || '';
                            const grade = room.match(/ป\.[1-6]/)?.[0] || allStudents.find(student => student.student_id === stId)?.current_grade_level;
                            const candidates = subjects.filter(subject => subject.subject_name === sName
                                && subject.academic_year === academicYear
                                && subject.semester === semester
                                && (!grade || subject.grade_level === grade));
                            const suId = candidates.length === 1 ? candidates[0].subject_id : null;

                            if (stId && suId) {
                                tempPayload.push({ student_id: stId, subject_id: suId, room, enrollment_status: 'active' });
                            } else {
                                if (stId && candidates.length > 1) ambiguousData++;
                                missingData++;
                            }
                        });

                        if (missingData > 0) {
                            toast.error(`ข้ามข้อมูล ${missingData} แถว เนื่องจากไม่พบเลข ปชช. นร. หรือ ชื่อวิชา ในระบบ`, { id: 'csv' });
                        }
                        if (ambiguousData > 0) toast.error(`มี ${ambiguousData} แถวที่ชื่อวิชาซ้ำและระบุชั้น/ห้องไม่ชัดเจน จึงไม่นำเข้า`, { duration: 10000 });

                        if (tempPayload.length === 0) {
                            toast.error('ไม่มีข้อมูลที่ถูกต้องให้เพิ่มเข้าสู่ระบบ', { id: 'csv' });
                            return;
                        }
                        
                        // ดึงข้อมูลการลงทะเบียนทั้งหมดมาเทียบ (paginated, filter by school via subjects)
                        const schoolSubjectIds = subjects.map(subject => subject.subject_id);
                        const existingEn = schoolSubjectIds.length > 0
                            ? await fetchAllByIn(schoolSubjectIds, (batch, from, to) => supabase.from('student_enrollments')
                                .select('student_id, subject_id').in('subject_id', batch).eq('enrollment_status', 'active').range(from, to))
                            : [];
                        const existingSet = new Set((existingEn || []).map(e => `${e.student_id}_${e.subject_id}`));
                        
                        payload = tempPayload.filter(p => !existingSet.has(`${p.student_id}_${p.subject_id}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('student_enrollments').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลลงทะเบียนซ้ำกับที่มีอยู่ในระบบทั้งหมด', { id: 'csv' });
                            return;
                        }
                    }
                    else if (importType === 'learning_outcomes') {
                        let tempPayload = data.map(l => ({
                            school_id: currentUser.school_id,
                            grade_level: l.grade_level?.trim() || null,
                            lo_code: l.lo_code?.trim(), ability_no: parseInt(l.ability_no), level_group: l.level_group?.trim(),
                            competency_area: l.competency_area?.trim(), lo_description: l.lo_description?.trim(),
                            is_custom_competency: String(l.is_custom_competency).toLowerCase() === 'true'
                        }));
                        
                        // LO แยกตามระดับชั้น รหัส/ลำดับเดียวกันคนละชั้นต้องนำเข้าได้
                        const { data: existingLO } = await supabase.from('learning_outcomes').select('grade_level, lo_code, ability_no').eq('school_id', currentUser.school_id);
                        const existingSet = new Set((existingLO || []).map(l => `${l.grade_level}_${l.lo_code}_${l.ability_no}`));
                        
                        payload = tempPayload.filter(p => !existingSet.has(`${p.grade_level}_${p.lo_code}_${p.ability_no}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('learning_outcomes').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ผลลัพธ์การเรียนรู้ (LO) ในไฟล์ซ้ำกับข้อมูลที่มีอยู่ทั้งหมด', { id: 'csv' });
                            return;
                        }
                    }
                    else if (importType === 'behaviors') {
                        toast.error('คลังคำบรรยายกลางเป็นข้อมูลอ่านอย่างเดียว กรุณาใช้คำอธิบายรายโรงเรียนหรือรายชั้นปีแทน', { id: 'csv', duration: 8000 });
                        return;
                    }
                    else if (importType === 'yearly_competencies') {
                        let tempPayload = data.map(c => ({
                            school_id: currentUser.school_id, 
                            grade_level: c.grade_level?.trim(),
                            competency_no: parseInt(c.competency_no),
                            competency_area: c.competency_area?.trim() || null,
                            description: c.description?.trim(),
                            expected_level: c.expected_level?.trim()
                        }));

                        const { data: existing } = await supabase.from('yearly_competencies').select('grade_level, competency_no').eq('school_id', currentUser.school_id);
                        const existingSet = new Set((existing || []).map(x => `${x.grade_level}_${x.competency_no}`));
                        
                        payload = tempPayload.filter(p => !existingSet.has(`${p.grade_level}_${p.competency_no}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('yearly_competencies').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลตั้งค่าความสามารถ ปพ.๖ ซ้ำกับที่มีอยู่แล้ว', { id: 'csv' });
                            return;
                        }
                    }
                    else if (importType === 'yearly_behavior_templates') {
                        let tempPayload = data.map(b => ({
                            school_id: currentUser.school_id,
                            grade_level: b.grade_level?.trim(),
                            competency_no: parseInt(b.competency_no),
                            competency_level: b.competency_level?.trim(),
                            behavior_text: b.behavior_text?.trim()
                        }));

                        const { data: existing } = await supabase.from('yearly_behavior_templates').select('grade_level, competency_no, competency_level').eq('school_id', currentUser.school_id);
                        const existingSet = new Set((existing || []).map(x => `${x.grade_level}_${x.competency_no}_${x.competency_level}`));
                        
                        payload = tempPayload.filter(p => !existingSet.has(`${p.grade_level}_${p.competency_no}_${p.competency_level}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('yearly_behavior_templates').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลพฤติกรรมรายชั้นปี ซ้ำกับที่มีอยู่แล้ว', { id: 'csv' });
                            return;
                        }
                    }

                    toast.success(`นำเข้าสำเร็จ ${payload.length} รายการ`, { id: 'csv' });

                    // อัปเดต state ตัวแปรที่ใช้ทำงานต่อไม่ต้องให้ผู้ใช้รีโหลดหน้า
                    if (importType === 'subjects') {
                        const { data: updatedSubjects } = await supabase.from('subjects').select('*').eq('school_id', currentUser.school_id);
                        setSubjects(updatedSubjects || []);
                        setStats(prev => ({ ...prev, subjects: updatedSubjects?.length || 0 }));
                    } else if (importType === 'students') {
                        const updatedStudents = await fetchAllRows((from, to) =>
                            supabase.from('users_students').select('student_id, citizen_id, student_code, prefix, first_name, last_name, current_room, current_grade_level, student_status').eq('school_id', currentUser.school_id).range(from, to)
                        );
                        setAllStudents(updatedStudents || []);
                        setStats(prev => ({ ...prev, students: updatedStudents?.length || 0 }));
                    } else if (importType === 'teachers') {
                        const { count } = await supabase.from('users_teachers').select('teacher_id', { count: 'exact', head: true }).eq('school_id', currentUser.school_id);
                        setStats(prev => ({ ...prev, teachers: count || 0 }));
                    } else if (importType === 'learning_outcomes' && mappingSubject) {
                        // refresh mapping data if a subject is already selected
                        loadMappingData(mappingSubject);
                    }

                    // อัปเดตตารางข้อมูลดิบถ้ากำลังเปิดดูตารางนั้นอยู่
                    const mapImportToTable = {
                        'subjects': 'subjects',
                        'enrollments': 'student_enrollments',
                        'learning_outcomes': 'learning_outcomes',
                        'behaviors': 'behavior_templates'
                    };
                    if (selectedTable === mapImportToTable[importType]) {
                        loadTableData(selectedTable);
                    }

                    return { count: payload.length };

        } catch (err) {
            toast.error('ข้อผิดพลาดการนำเข้า: ' + err.message, { id: 'csv' });
            throw err;
        }
    };

    // รองรับปุ่มอัปโหลดแบบเดิมระหว่างช่วงเปลี่ยนผ่าน
    const handleFileUpload = async (e, importType) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = null;
        try {
            const data = await parseUploadedFile(file);
            await processImportData(data, importType);
        } catch (err) {
            if (!String(err.message || '').includes('ข้อผิดพลาดการนำเข้า')) {
                toast.error('อ่านไฟล์ไม่สำเร็จ: ' + err.message, { id: 'csv' });
            }
        }
    };

    // --- LO MAPPING ---
    const loadMappingData = async (subjectId) => {
        setMappingSubject(subjectId);
        if (!subjectId) return;

        setLoadingMapping(true);
        try {
            const [{ data: los }, { data: mapped }] = await Promise.all([
                supabase.from('learning_outcomes').select('*')
                    .eq('school_id', currentUser.school_id)
                    .order('ability_no', { ascending: true }),
                supabase.from('subject_lo_mapping').select('lo_id').eq('subject_id', subjectId)
            ]);
            setAllLOs(los || []);
            setMappedLOs((mapped || []).map(m => m.lo_id));
        } catch (err) {
            toast.error('ไม่สามารถโหลดข้อมูลผลลัพธ์การเรียนรู้ได้: ' + err.message);
        } finally {
            setLoadingMapping(false);
        }
    };

    const toggleMapping = (loId) => {
        setMappedLOs(prev => prev.includes(loId) ? prev.filter(id => id !== loId) : [...prev, loId]);
    };

    const saveMapping = async () => {
        setSavingMapping(true);
        try {
            await supabase.from('subject_lo_mapping').delete().eq('subject_id', mappingSubject);
            if (mappedLOs.length > 0) {
                const payload = mappedLOs.map(loId => ({ subject_id: mappingSubject, lo_id: loId }));
                const { error } = await supabase.from('subject_lo_mapping').insert(payload);
                if (error) throw error;
            }
            toast.success('บันทึกการเชื่อมโยงผลลัพธ์การเรียนรู้แล้ว');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            setSavingMapping(false);
        }
    };

    const openWorkspaceTab = tabId => {
        setActiveTab(tabId);
        setSearchParams(tabId === 'overview' ? {} : { tab: tabId });
        if (tabId === 'data' && !selectedTable) loadTableData('subjects');
    };
    const activeWorkspace = WORKSPACE_TABS.find(tab => tab.id === activeTab) || WORKSPACE_TABS[1];
    const mappingGradeLevel = subjects.find(subject => subject.subject_id === mappingSubject)?.grade_level || '';
    const gradeCompatibleLOs = allLOs.filter(lo => !mappingGradeLevel || !lo.grade_level || lo.grade_level === mappingGradeLevel);

    if (activeTab === 'overview') {
        return (
            <Layout title="ฝ่ายวิชาการ">
                <AcademicDashboardHome
                    stats={stats}
                    onOpenTab={openWorkspaceTab}
                    onNavigate={navigate}
                />
            </Layout>
        );
    }

    return (
        <Layout title="งานบริหารวิชาการ">
            <div className="academic-workspace mb-10 space-y-5">
                <header className="border-b border-slate-200 pb-5">
                    <h1 className="text-2xl font-extrabold text-slate-950">{activeWorkspace.label}</h1>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{activeWorkspace.description}</p>
                </header>

                {/* Main Content Area */}
                <div className="min-w-0">
                    <div>

                        {/* --- TAB 1: DATA TABLE --- */}
                        {activeTab === 'data' && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                                <div className="mb-5"><h3 className="font-extrabold text-slate-900">เลือกชุดข้อมูลที่ต้องการตรวจสอบ</h3><p className="mt-1 text-sm text-slate-600">ชื่อคอลัมน์และข้อมูลทางเทคนิคที่ไม่จำเป็นถูกซ่อนไว้ เพื่อให้อ่านและแก้ไขได้ง่ายขึ้น</p></div>
                                
                                <div className="flex flex-col md:flex-row gap-4 mb-6 px-4 sm:px-0">
                                    <select
                                        value={selectedTable}
                                        onChange={(e) => loadTableData(e.target.value)}
                                        className="w-full md:w-64 bg-slate-50 border border-slate-200 text-slate-700 py-3.5 px-4 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none shadow-inner"
                                    >
                                        <option value="" disabled>เลือกประเภทข้อมูล</option>
                                        <option value="subjects">ข้อมูลวิชา</option>
                                        <option value="learning_outcomes">ผลลัพธ์การเรียนรู้ (LO)</option>
                                        <option value="behavior_templates">คำบรรยายระดับความสามารถ</option>
                                    </select>
                                    
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Search className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            placeholder="ค้นหาข้อมูลในตารางนี้..."
                                            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                                            disabled={!selectedTable || loadingData}
                                        />
                                    </div>

                                    <button onClick={() => loadTableData(selectedTable)} disabled={!selectedTable || loadingData} className="bg-indigo-50 text-indigo-600 px-6 py-3.5 rounded-2xl font-bold border border-indigo-100 hover:bg-indigo-100 flex items-center justify-center min-w-[120px] transition-colors">
                                        {loadingData ? <div className="loader w-5 h-5 !border-2 !border-indigo-600 !border-t-transparent" /> : 'โหลดข้อมูลใหม่'}
                                    </button>
                                </div>

                                {loadingData ? (
                                    <div className="py-24 flex flex-col items-center justify-center space-y-4">
                                        <div className="loader scale-150"></div>
                                        <p className="text-slate-400 font-medium">กำลังโหลดข้อมูล...</p>
                                    </div>
                                ) : !selectedTable ? (
                                    <div className="text-center py-24 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200 mx-4 sm:mx-0">
                                        โปรดเลือกตารางจากเมนูดรอปดาวน์ด้านบน
                                    </div>
                                ) : filteredTableData.length === 0 ? (
                                    <div className="text-center py-24 text-slate-500 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200 mx-4 sm:mx-0">
                                        {searchTerm ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีข้อมูลในตารางนี้'}
                                    </div>
                                ) : (
                                    <div className="flex flex-col space-y-4">
                                        <div className="overflow-x-auto rounded-2xl border border-slate-200 h-[600px] overflow-y-auto">
                                        <table className="w-full text-sm text-left whitespace-nowrap">
                                            <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm uppercase tracking-wider text-xs">
                                                <tr>
                                                    <th className="px-5 py-4 font-extrabold w-12 text-center border-b border-slate-200">#</th>
                                                    {Object.keys(filteredTableData[0]).filter(k => !hiddenField(k, selectedTable)).map(key => (
                                                        <th key={key} className="px-5 py-4 font-extrabold border-b border-slate-200">{FIELD_LABELS[key] || key}</th>
                                                    ))}
                                                    <th className="px-5 py-4 font-extrabold w-40 text-center border-b border-slate-200 sticky right-0 bg-slate-100 shadow-[-4px_0_10px_rgba(0,0,0,0.02)]">การดำเนินการ</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                                {filteredTableData.map((row, idx) => {
                                                    let idCol, idValue;
                                                    if (selectedTable === 'users_students') {idCol = 'student_id'; idValue = row.student_id; }
                                                    if (selectedTable === 'users_teachers') {idCol = 'teacher_id'; idValue = row.teacher_id; }
                                                    if (selectedTable === 'subjects') {idCol = 'subject_id'; idValue = row.subject_id; }
                                                    if (selectedTable === 'learning_outcomes') {idCol = 'lo_id'; idValue = row.lo_id; }
                                                    if (selectedTable === 'behavior_templates') {idCol = 'id'; idValue = row.id; }

                                                    const isEditing = Boolean(editingRow && editingRow.id === idValue);

                                                    return (
                                                    <tr key={idx} className="hover:bg-slate-50 py-2 group transition-colors">
                                                        <td className="px-5 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                                                    {Object.keys(row).filter(k => !hiddenField(k, selectedTable)).map(key => (
                                                        <td key={key} className="px-5 py-3 text-slate-700 max-w-[240px] truncate">
                                                            {isEditing && isReadonlyField(key, selectedTable) ? (
                                                                <span
                                                                    title="รหัสอ้างอิงของระบบ แก้ไขไม่ได้ เพราะผูกกับผลการประเมินที่บันทึกไว้แล้ว"
                                                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-500"
                                                                >
                                                                    <Lock className="h-3 w-3 shrink-0" />
                                                                    {String(row[key] ?? '').slice(0, 8)}…
                                                                </span>
                                                            ) : isEditing && selectedTable === 'learning_outcomes' && key === 'competency_area' && !['true', true].includes(editingRow.data.is_custom_competency) ? (
                                                                <select
                                                                    className="w-full min-w-[18rem] rounded-lg border-2 border-indigo-400 bg-white px-3 py-1.5 font-bold text-indigo-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                                    value={String(editingRow.data[key] ?? '')}
                                                                    onChange={(e) => setEditingRow({ ...editingRow, data: { ...editingRow.data, [key]: e.target.value } })}
                                                                >
                                                                    <option value="">เลือกด้านความสามารถตามหลักสูตร</option>
                                                                    {CBE_CAPABILITIES_2568.map(capability => <option key={capability.key} value={capability.name}>{capability.name}</option>)}
                                                                </select>
                                                            ) : isEditing && selectedTable === 'users_teachers' && key === 'role' ? (
                                                                <div className="min-w-[15rem] space-y-1.5 rounded-lg border-2 border-indigo-400 bg-white p-2.5">
                                                                    <p className="text-[11px] font-bold text-slate-600">เลือกได้มากกว่า 1 บทบาท</p>
                                                                    {ROLE_CHOICES.map(([val, label]) => {
                                                                        const selected = (editingRow.data.roles || []).includes(val);
                                                                        const isPrimary = editingRow.data.role === val;
                                                                        return (
                                                                            <div key={val} className="flex items-center gap-2">
                                                                                <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        className="h-4 w-4 accent-indigo-700"
                                                                                        checked={selected}
                                                                                        onChange={(e) => {
                                                                                            const current = new Set(editingRow.data.roles || []);
                                                                                            if (e.target.checked) current.add(val); else current.delete(val);
                                                                                            const nextRoles = ROLE_CHOICES.map(([r]) => r).filter(r => current.has(r));
                                                                                            if (nextRoles.length === 0) {
                                                                                                toast.error('ต้องมีอย่างน้อย 1 บทบาท');
                                                                                                return;
                                                                                            }
                                                                                            const nextPrimary = nextRoles.includes(editingRow.data.role) ? editingRow.data.role : nextRoles[0];
                                                                                            setEditingRow({ ...editingRow, data: { ...editingRow.data, roles: nextRoles, role: nextPrimary } });
                                                                                        }}
                                                                                    />
                                                                                    {label}
                                                                                </label>
                                                                                {selected && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setEditingRow({ ...editingRow, data: { ...editingRow.data, role: val } })}
                                                                                        className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${isPrimary ? 'border-indigo-700 bg-indigo-700 text-white' : 'border-slate-300 text-slate-600 hover:border-indigo-400'}`}
                                                                                        title="บทบาทหลักใช้ตัดสินหน้าแรกหลังเข้าสู่ระบบ"
                                                                                    >
                                                                                        {isPrimary ? 'บทบาทหลัก' : 'ตั้งเป็นหลัก'}
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            ) : isEditing && FIELD_OPTIONS[key] ? (
                                                                <select
                                                                    className="w-full min-w-[9rem] rounded-lg border-2 border-indigo-400 bg-white px-3 py-1.5 font-bold text-indigo-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                                    value={String(editingRow.data[key] ?? '')}
                                                                    onChange={(e) => setEditingRow({ ...editingRow, data: { ...editingRow.data, [key]: e.target.value } })}
                                                                >
                                                                    {FIELD_OPTIONS[key].map(([val, label]) => (
                                                                        <option key={val} value={val}>{label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : isEditing ? (
                                                                <input
                                                                    className="border-2 border-indigo-400 rounded-lg px-3 py-1.5 w-full min-w-[9rem] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-indigo-900"
                                                                    value={editingRow.data[key] ?? ''}
                                                                    inputMode={key === 'citizen_id' || key === 'new_password' ? 'numeric' : undefined}
                                                                    maxLength={key === 'citizen_id' ? 13 : key === 'new_password' ? 8 : undefined}
                                                                    onChange={(e) => setEditingRow({ ...editingRow, data: { ...editingRow.data, [key]: e.target.value } })}
                                                                />
                                                            ) : (
                                                                <span className={key === 'new_password' ? 'font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded' : ''}>
                                                                    {displayValue(row[key], key, row)}
                                                                </span>
                                                            )}
                                                        </td>
                                                    ))}
                                                    <td className="px-5 py-3 text-center sticky right-0 bg-white group-hover:bg-slate-50 border-l border-slate-100 flex justify-center gap-2 shadow-[-4px_0_10px_rgba(0,0,0,0.02)]">
                                                        {isEditing ? (
                                                            <>
                                                                <button onClick={() => handleUpdate(idValue, idCol, editingRow.data)} className="text-white bg-green-500 p-2 rounded-xl hover:bg-green-600 shadow-sm transition-all"><Save className="w-4 h-4" /></button>
                                                                <button onClick={() => setEditingRow(null)} className="text-slate-600 bg-slate-200 p-2 rounded-xl hover:bg-slate-300 transition-all"><X className="w-4 h-4" /></button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {!READ_ONLY_TABLES.has(selectedTable) && <button onClick={() => setEditingRow({ id: idValue, data: { ...row, roles: Array.isArray(row.teacher_roles) && row.teacher_roles.length ? row.teacher_roles.map(item => item.role) : (row.role ? [row.role] : []) } })} className="text-indigo-600 bg-indigo-50 p-2 rounded-xl hover:bg-indigo-100 transition-colors border border-indigo-100"><Edit className="w-4 h-4" /></button>}
                                                                {!READ_ONLY_TABLES.has(selectedTable) && <button onClick={() => handleDelete(idValue, idCol)} className="text-red-600 bg-red-50 p-2 rounded-xl hover:bg-red-100 transition-colors border border-red-100"><Trash2 className="w-4 h-4" /></button>}
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                                );
                                                })}
                                            </tbody>
                                        </table>
                                        </div>

                                        {/* Pagination Controls */}
                                        <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-50 px-6 py-4 rounded-2xl border border-slate-200 gap-4">
                                            <div className="text-sm text-slate-500 font-medium">
                                                กำลังแสดงหน้า <span className="font-bold text-slate-800">{currentPage}</span> จากทั้งหมด <span className="font-bold text-slate-800">{totalPages}</span>
                                                <span className="ml-2">(คำค้นหาอาจค้นพบแค่ในหน้านี้)</span>
                                            </div>
                                            <div className="flex space-x-2">
                                                <button 
                                                    onClick={() => loadTableData(selectedTable, currentPage - 1)}
                                                    disabled={currentPage === 1 || loadingData}
                                                    className="px-4 py-2 border border-slate-300 rounded-xl bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all shadow-sm"
                                                >
                                                    &larr; หน้าก่อน
                                                </button>
                                                <button 
                                                    onClick={() => loadTableData(selectedTable, currentPage + 1)}
                                                    disabled={currentPage === totalPages || loadingData}
                                                    className="px-4 py-2 border border-slate-300 rounded-xl bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all shadow-sm"
                                                >
                                                    หน้าถัดไป &rarr;
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* --- TAB 2: CSV IMPORT --- */}
                        {activeTab === 'import' && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                                {importWizardType ? (
                                    <FlexibleImportWizard
                                        initialType={importWizardType}
                                        onCancel={() => setImportWizardType(null)}
                                        onConfirm={async (records, type) => {
                                            const result = await processImportData(records, type);
                                            if (result) setImportWizardType(null);
                                        }}
                                    />
                                ) : (
                                <>
                                <div className="mb-6">
                                    <h3 className="font-extrabold text-slate-900">เพิ่มข้อมูลจากไฟล์ของโรงเรียน</h3>
                                    <p className="mt-1 text-sm text-slate-600">ใช้ไฟล์ Excel ที่มีอยู่ได้เลย ระบบช่วยจับคู่ชื่อคอลัมน์และให้ตรวจสอบข้อมูลก่อนบันทึก</p>
                                </div>

                                <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-700 text-white"><FileText className="h-6 w-6" /></div><div><h3 className="font-extrabold text-indigo-950">Excel ของโรงเรียน ไม่ต้องเปลี่ยนหัวคอลัมน์</h3><p className="mt-1 max-w-2xl text-sm leading-6 text-indigo-900">เลือกประเภทข้อมูล อัปโหลดไฟล์ จับคู่คอลัมน์ และแก้รายการที่ผิดได้ในหน้าเดียว</p></div></div>
                                    <button onClick={() => setImportWizardType('students')} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white hover:bg-indigo-800"><Upload className="h-4 w-4" />เริ่มนำเข้าข้อมูล</button>
                                </div>

                                {/* 🏫 DMC Import Card (Prominent) */}
                                <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-5">
                                    <div className="flex flex-col md:flex-row md:items-start gap-5 mb-5 md:mb-0">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white"><School className="h-6 w-6" /></div>
                                            <div>
                                                <h3 className="font-extrabold text-blue-950">ข้อมูลนักเรียนจาก DMC</h3>
                                                <p className="mt-1 text-sm leading-6 text-blue-900">รองรับไฟล์ Excel (.xlsx, .xls) จาก DMC ระบบจะนำเข้าชื่อ รหัสนักเรียน ระดับชั้น ห้องเรียน และกำหนดรหัสผ่านเริ่มต้นจากวันเดือนปีเกิด</p>
                                            </div>
                                        </div>
                                        <div className="flex w-full shrink-0 flex-col gap-2 md:w-auto md:self-center">
                                            <button onClick={() => setImportWizardType('students')} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-extrabold text-white hover:bg-blue-800"><Upload className="h-4 w-4" />ตรวจสอบไฟล์ก่อนนำเข้า</button>
                                            <label className="flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-blue-300 bg-white px-4 text-xs font-bold text-blue-800 hover:bg-blue-100">นำเข้าไฟล์ DMC รูปแบบมาตรฐานแบบด่วน<input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleDMCImport} /></label>
                                        </div>
                                    </div>
                                </div>

                                <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                                    <summary className="cursor-pointer bg-slate-50 px-5 py-4 text-sm font-extrabold text-slate-700 hover:bg-slate-100">แม่แบบและตัวเลือกขั้นสูง</summary>
                                <div className="border-t border-slate-200">
                                    {[
                                        { id: 'students', title: 'ข้อมูลนักเรียน', desc: 'ข้อมูลนักเรียน ระดับชั้น ห้องเรียน และสถานภาพการศึกษา', template: 'citizen_id,dob,student_code,prefix,first_name,last_name,current_room,current_grade_level\n1234567890123,01012555,66001,ด.ช.,สมชาย,ใจดี,ป.3/2,ป.3' },
                                        { id: 'teachers', title: 'ข้อมูลครูและบุคลากร', desc: 'ข้อมูลครู บุคลากร บทบาท และหน้าที่ที่ได้รับมอบหมาย', template: 'citizen_id,dob,prefix,first_name,last_name,role\n1234567890123,01012540,นาย,สมชาย,ใจดี,teacher' },
                                        { id: 'subjects', title: 'ข้อมูลวิชา', desc: 'วิชาที่สถานศึกษาเปิดสอน พร้อมจำนวนชั่วโมงเรียน', template: 'academic_year,semester,subject_name,grade_level,subject_group,teaching_hours,teacher_citizen_id\n2569,1,ภาษาและการสื่อสาร 1,ป.1,ภาษาและการสื่อสาร,40,1234567890123\n2569,1,การคิดคำนวณ 1,ป.1,การคิดคำนวณ,40,1234567890123' },
                                        { id: 'learning_units', title: 'ข้อมูลหน่วยการเรียนรู้', desc: 'หน่วยการเรียนรู้ที่ออกแบบแยกจากรายวิชา', template: 'academic_year,semester,context_name,grade_level,subject_group,teaching_hours,teacher_citizen_id,description\n2569,1,ชุมชนของเรา,ป.1,บูรณาการหลายกลุ่มวิชา,12,1234567890123,สำรวจชุมชนและสื่อสารสิ่งที่ค้นพบ\n2569,1,อาหารดีมีประโยชน์,ป.1,สุขภาพกายและจิต,8,1234567890123,เลือกอาหารและดูแลสุขภาพ' },
                                        { id: 'projects', title: 'ข้อมูลโครงงาน', desc: 'โครงงานพร้อมชั้น กลุ่มวิชา และจำนวนชั่วโมง', template: 'academic_year,semester,context_name,grade_level,subject_group,teaching_hours,teacher_citizen_id,description\n2569,1,ตลาดนัดพอเพียง,ป.3,เศรษฐกิจและการเงิน,16,1234567890123,วางแผนผลิตและจำหน่ายสินค้า\n2569,1,นักสืบสายน้ำ,ป.3,วิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี,12,1234567890123,สำรวจคุณภาพน้ำในชุมชน' },
                                        { id: 'activities', title: 'ข้อมูลกิจกรรม', desc: 'กิจกรรมทั่วไปหรือกิจกรรมพัฒนาผู้เรียน 3 หมวดตามหลักสูตร 2551', template: 'academic_year,semester,context_name,grade_level,subject_group,teaching_hours,teacher_citizen_id,activity_category,description\n2569,1,รู้จักตนเอง,ป.2,กิจกรรมพัฒนาผู้เรียน,10,1234567890123,กิจกรรมแนะแนว,กิจกรรมสำรวจความสนใจ\n2569,1,ลูกเสือสำรอง,ป.2,กิจกรรมพัฒนาผู้เรียน,20,1234567890123,กิจกรรมนักเรียน,ฝึกระเบียบและการทำงานเป็นทีม\n2569,1,จิตอาสาพัฒนาโรงเรียน,ป.2,กิจกรรมพัฒนาผู้เรียน,10,1234567890123,กิจกรรมเพื่อสังคมและสาธารณประโยชน์,ร่วมดูแลพื้นที่ส่วนรวม' },
                                        { id: 'enrollments', title: 'ข้อมูลกลุ่มเรียน', desc: 'ข้อมูลการจัดนักเรียนเข้าชั้นเรียนและวิชา', template: 'student_citizen_id,subject_name,room\nเลขบัตรปชช_นร_13หลัก,ความสามารถพื้นฐานด้านการเรียนรู้,ป.1/1' },
                                        { id: 'learning_outcomes', title: 'ผลลัพธ์การเรียนรู้ (LO)', desc: 'ผลลัพธ์การเรียนรู้ตามหลักสูตรสถานศึกษาที่ใช้เชื่อมโยงกับรูปแบบการจัดการเรียนรู้', template: 'grade_level,lo_code,ability_no,level_group,competency_area,is_custom_competency,lo_description\nป.1,SCH-P1-LO-03,3,ป.ต้น,ความสามารถด้านการคิดคำนวณ,false,ใช้จำนวนนับ การบวก และการลบเพื่อแก้ปัญหาใกล้ตัว พร้อมอธิบายวิธีคิดได้' },
                                        { id: 'behaviors', title: 'คำบรรยายระดับความสามารถ', desc: 'คำบรรยายพฤติกรรมสำหรับแต่ละระดับความสามารถ', template: 'competency_area,competency_level,behavior_text\nความสามารถด้านการคิดคำนวณ,พัฒนา,ปฏิบัติได้ในสถานการณ์ที่คุ้นเคยเมื่อได้รับคำชี้แนะบางส่วน และเริ่มตรวจสอบงานของตน' },
                                        { id: 'yearly_competencies', title: 'ความคาดหวังรายชั้นปี (ปพ.๖)', desc: 'กำหนดด้านความสามารถและระดับที่คาดหวังในแต่ละชั้น เพื่อดึงผลรับรองมาใช้ได้ตรงด้าน', template: 'grade_level,competency_no,competency_area,description,expected_level\nป.1,1,ความสามารถด้านการอ่าน,เข้าใจความหมายของคำและข้อความสั้น ๆ,พัฒนา\nป.1,2,ความสามารถด้านการเขียน,เขียนประโยคง่าย ๆ เพื่อสื่อความหมาย,พัฒนา' },
                                        { id: 'yearly_behavior_templates', title: 'คำบรรยายรายชั้นปี (ปพ.๖)', desc: 'คำบรรยายพฤติกรรมในแต่ละระดับ แยกตามข้อและชั้นปี', template: 'grade_level,competency_no,competency_level,behavior_text\nป.1,1,เริ่มต้น,เด็กชายสนใจ เข้าใจความหมาย...\nป.1,1,ชำนาญ,เด็กชายสนใจ เขียนประโยค...' }
                                    ].map(card => (
                                        <div key={card.id} className="flex flex-col gap-4 border-b border-slate-200 bg-white p-5 last:border-b-0 sm:flex-row sm:items-center">
                                            <div className="min-w-0 flex-1">
                                                <div>
                                                    <h3 className="font-extrabold text-lg text-slate-800">{card.title}</h3>
                                                    <p className="text-sm text-slate-500 font-medium mt-1">{card.desc}</p>
                                                </div>
                                            </div>
                                            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                                                <button
                                                    onClick={() => {
                                                        // Build XLSX with Text-formatted columns
                                                        const ws = XLSX.utils.aoa_to_sheet([]);
                                                        const headers = card.template.split('\n')[0].split(',');
                                                        const sampleRows = card.template.split('\n').slice(1).map(row => row.split(','));
                                                        XLSX.utils.sheet_add_aoa(ws, [headers, ...sampleRows], { origin: 'A1' });
                                                        // Format citizen_id and dob columns as Text to prevent Excel scientific notation
                                                        const textCols = ['citizen_id', 'dob', 'student_code'];
                                                        headers.forEach((h, colIdx) => {
                                                            if (textCols.includes(h.trim())) {
                                                                const colLetter = XLSX.utils.encode_col(colIdx);
                                                                if (!ws['!cols']) ws['!cols'] = [];
                                                                ws['!cols'][colIdx] = { wch: 18 };
                                                                sampleRows.forEach((_, rowIndex) => {
                                                                    const cellAddr = colLetter + String(rowIndex + 2);
                                                                    if (ws[cellAddr]) ws[cellAddr].t = 's';
                                                                });
                                                            }
                                                        });
                                                        ws['!freeze'] = { xSplit: 0, ySplit: 1 };
                                                        ws['!cols'] = headers.map(header => ({ wch: Math.min(42, Math.max(14, header.length + 4)) }));
                                                        const wb = XLSX.utils.book_new();
                                                        XLSX.utils.book_append_sheet(wb, ws, 'data');
                                                        const guide = XLSX.utils.aoa_to_sheet([
                                                            ['วิธีใช้แม่แบบ', card.title],
                                                            ['1', 'อ่านตัวอย่างในชีต data แล้วแทนข้อมูลตัวอย่างด้วยข้อมูลจริง'],
                                                            ['2', 'ห้ามแก้ชื่อคอลัมน์แถวแรก และควรเก็บเลขบัตรประชาชน/วันเกิดเป็นข้อความ'],
                                                            ['3', 'หนึ่งแถวเท่ากับหนึ่งรายการ ลบแถวตัวอย่างที่ไม่ใช้ได้'],
                                                            ['4', 'บันทึกเป็น .xlsx แล้วอัปโหลดกลับในเมนูนำเข้าข้อมูล'],
                                                            ['หมายเหตุ', card.desc],
                                                        ]);
                                                        guide['!cols'] = [{ wch: 14 }, { wch: 80 }];
                                                        XLSX.utils.book_append_sheet(wb, guide, 'วิธีใช้');
                                                        XLSX.writeFile(wb, `แม่แบบ_${card.id}.xlsx`);
                                                    }}
                                                    className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                                >
                                                    <Download className="w-4 h-4 group-hover/btn:-translate-y-1 transition-transform" />
                                                    <span>ไฟล์ Excel แม่แบบ (.xlsx)</span>
                                                </button>
                                                {WIZARD_IMPORT_TYPES.has(card.id) ? <button onClick={() => setImportWizardType(card.id)} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-3 text-sm font-bold text-white hover:bg-indigo-800">
                                                    <Upload className="w-4 h-4 group-hover/btn2:-translate-y-1 transition-transform" />
                                                    <span>เปิดตัวช่วยนำเข้า</span>
                                                </button> : <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-700 px-3 text-sm font-bold text-white hover:bg-indigo-800"><Upload className="h-4 w-4" /><span>อัปโหลดแบบเดิม</span><input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFileUpload(e, card.id)} /></label>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                </details>
                                </>
                                )}
                            </div>
                        )}

                        {/* --- TAB 3: SUBJECT - LO MAPPING --- */}
                        {activeTab === 'mapping' && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                                <div className="mb-6 border-b border-slate-100 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h2 className="flex items-center text-lg font-extrabold text-slate-900"><LinkIcon className="mr-2 h-5 w-5 text-indigo-600" />เลือกวิชาและ LO ที่ใช้ประเมิน</h2>
                                        <p className="text-slate-600 mt-1 text-sm">เลือกวิชา แล้วทำเครื่องหมาย LO ที่ครูผู้สอนต้องประเมิน</p>
                                    </div>
                                    <div className="w-full md:w-1/3">
                                        <select
                                            value={mappingSubject}
                                            onChange={(e) => loadMappingData(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-3 px-4 rounded-xl focus:ring-2 focus:ring-indigo-400 font-extrabold outline-none"
                                        >
                                            <option value="" disabled>เลือกวิชา</option>
                                            {subjects.filter(s => s.academic_year === academicYear && s.semester === semester).map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} · {s.grade_level || 'ไม่ระบุชั้น'}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="min-h-[400px]">
                                    {loadingMapping ? (
                                        <div className="py-20 flex justify-center"><div className="loader scale-125"></div></div>
                                    ) : !mappingSubject ? (
                                        <div className="text-center py-24 text-slate-400 font-medium flex flex-col items-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                            <FileText className="w-16 h-16 text-slate-200 mb-4" />
                                            เลือกวิชาจากช่องด้านบนเพื่อแสดงรายการ LO
                                        </div>
                                    ) : gradeCompatibleLOs.length === 0 ? (
                                        <div className="text-center py-10 text-red-700 bg-red-50 rounded-2xl border border-red-100 font-bold">ยังไม่มีข้อมูลผลลัพธ์การเรียนรู้ กรุณานำเข้าข้อมูล LO ก่อนดำเนินการ</div>
                                    ) : (
                                        <>
                                            <div className="flex justify-between items-center mb-6 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                                                <div className="flex items-center text-indigo-800 font-bold">
                                                    <CheckCircle className="w-5 h-5 mr-2 text-indigo-600" /> 
                                                    เลือกแล้ว {mappedLOs.length} ข้อ
                                                </div>
                                                <button
                                                    onClick={saveMapping}
                                                    disabled={savingMapping}
                                                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 hover:shadow-lg disabled:opacity-50 flex items-center transition-all"
                                                >
                                                    {savingMapping ? <div className="loader w-4 h-4 !border-2 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                                    บันทึก LO ของวิชานี้
                                                </button>
                                            </div>

                                            <div className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
                                                {gradeCompatibleLOs.map(lo => {
                                                    const isChecked = mappedLOs.includes(lo.lo_id);
                                                    return (
                                                        <label key={lo.lo_id} className={`flex cursor-pointer items-start p-4 transition-colors ${isChecked ? 'bg-indigo-50' : 'bg-white hover:bg-slate-50'}`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleMapping(lo.lo_id)}
                                                                className="sr-only"
                                                            />
                                                            <div className="flex items-center h-full mr-4">
                                                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${isChecked ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`}>
                                                                    {isChecked && <CheckCircle className="w-4 h-4 text-white" />}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <span className={`block font-extrabold text-sm mb-1.5 ${isChecked ? 'text-indigo-900' : 'text-slate-800'}`}>
                                                                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs mr-2 border border-slate-200">ข้อ {lo.ability_no}</span>
                                                                    {lo.lo_code ? `${lo.lo_code} ` : ''} 
                                                                    <span className="text-indigo-600">[{lo.competency_area || 'ทั่วไป'}]</span>
                                                                    {lo.grade_level && <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{lo.grade_level}</span>}
                                                                    {lo.is_custom_competency && <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">เพิ่มเติมจากหลักสูตร</span>}
                                                                </span>
                                                                <span className={`block text-sm leading-relaxed ${isChecked ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>{lo.lo_description}</span>
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- TAB 4: ENROLLMENT MANAGEMENT --- */}
                        {activeTab === 'enrollment' && (
                            <div className="min-h-[500px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                                <div className="mb-6 border-b border-slate-100 pb-6">
                                    <h2 className="mb-2 flex items-center text-lg font-extrabold text-slate-900"><Users className="mr-2 h-5 w-5 text-indigo-600" />เลือกรายวิชาและจัดรายชื่อนักเรียน</h2>
                                    <p className="text-sm text-slate-600">เพิ่มนักเรียนรายบุคคลหรือทั้งห้อง โดยไม่เปลี่ยนห้องประจำชั้น</p>
                                </div>

                                <div className="flex flex-col gap-4 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div className="flex flex-col lg:flex-row gap-4 w-full">
                                        <select
                                        value={enrollSubject}
                                        onChange={async (e) => {
                                            setEnrollSubject(e.target.value);
                                            if (!e.target.value) return;
                                            setLoadingEnrollments(true);
                                            const { data } = await supabase.from('student_enrollments')
                                                .select('enrollment_id, student_id, subject_id, room, attendance_percent, enrollment_status, users_students(student_id, student_code, prefix, first_name, last_name, current_room, current_grade_level)')
                                                .eq('subject_id', e.target.value).eq('enrollment_status', 'active');
                                            setSubjectEnrollments(data || []);
                                            setLoadingEnrollments(false);
                                        }}
                                        className="flex-1 bg-white border border-slate-200 text-slate-800 py-3.5 px-4 rounded-xl font-extrabold focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm"
                                    >
                                        <option value="" disabled>เลือกวิชา</option>
                                        {subjects.filter(s => s.academic_year === academicYear && s.semester === semester).map(s => (
                                            <option key={s.subject_id} value={s.subject_id}>{s.subject_name} · {s.grade_level || 'ไม่ระบุชั้น'}</option>
                                        ))}
                                    </select>

                                    <div className="flex flex-1 gap-2 border-l-0 lg:border-l border-slate-200 pl-0 lg:pl-4">
                                        <div className="flex-1 relative" ref={studentSearchRef}>
                                            <input
                                                type="text"
                                                disabled={!enrollSubject}
                                                placeholder={!enrollSubject ? "เลือกวิชาก่อน" : "ค้นหาชื่อหรือรหัสนักเรียนเพื่อเพิ่มรายคน"}
                                                value={studentSearchInput}
                                                onChange={(e) => {
                                                    setStudentSearchInput(e.target.value);
                                                    setShowStudentDropdown(true);
                                                }}
                                                onFocus={() => setShowStudentDropdown(true)}
                                                className="w-full bg-white border border-slate-200 text-slate-700 py-3.5 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm disabled:bg-slate-100 disabled:opacity-75"
                                            />
                                            {showStudentDropdown && enrollSubject && (
                                                <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                                    {filteredEnrollStudents.length > 0 ? (
                                                        filteredEnrollStudents.map(st => (
                                                            <div 
                                                                key={st.student_id} 
                                                                className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0"
                                                                onClick={async () => {
                                                                    setStudentSearchInput('');
                                                                    setShowStudentDropdown(false);
                                                                    if (subjectEnrollments.some(en => en.student_id === st.student_id)) {
                                                                        toast.error('นักเรียนคนนี้อยู่ในวิชานี้แล้ว');
                                                                        return;
                                                                    }
                                                                    toast.loading('กำลังเพิ่มนักเรียน...', { id: 'add_en' });
                                                                    const { data, error } = await supabase.from('student_enrollments').insert([
                                                                        { student_id: st.student_id, subject_id: enrollSubject, room: enrollRoom, enrollment_status: 'active' }
                                                                    ]).select('enrollment_id, student_id, subject_id, room, attendance_percent, enrollment_status, users_students(student_id, student_code, prefix, first_name, last_name, current_room, current_grade_level)');
                                                                    if (error) {
                                                                        toast.error('เพิ่มไม่สำเร็จ ' + error.message, { id: 'add_en' });
                                                                    } else {
                                                                        toast.success('เพิ่มนักเรียนสำเร็จ', { id: 'add_en' });
                                                                        setSubjectEnrollments(prev => [...prev, data[0]]);
                                                                    }
                                                                }}
                                                            >
                                                                <p className="font-bold text-slate-800 text-sm">{st.prefix || ''}{st.first_name} {st.last_name}</p>
                                                                <p className="text-xs text-slate-500 font-mono mt-0.5">รหัส: {st.student_code} {st.current_room ? `| ${st.current_room}` : ''}</p>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="px-4 py-6 text-center text-sm font-bold text-slate-500">
                                                            {studentSearchInput ? 'ไม่พบนักเรียน' : 'พิมพ์เพื่อค้นหา (แสดงสูงสุด 15 คน)'}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <input
                                            type="text"
                                            placeholder="ห้อง เช่น ป.1/1"
                                            list="enroll-rooms-list"
                                            value={enrollRoom}
                                            onChange={(e) => setEnrollRoom(e.target.value)}
                                            className="w-32 bg-white border border-slate-200 text-slate-800 py-3.5 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm text-center"
                                            disabled={!enrollSubject}
                                        />
                                    </div>

                                    </div>

                                    {/* 🔥 Bulk Enrollment: เพิ่มทั้งห้อง */}
                                    <div className="flex w-full flex-col items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center">
                                        <div className="flex items-center gap-3 flex-1">
                                            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                                                <UsersRound className="w-5 h-5 text-emerald-600" />
                                            </div>
                                            <div>
                                                <p className="font-extrabold text-sm text-emerald-900">เพิ่มนักเรียนพร้อมกันทั้งห้อง</p>
                                                <p className="text-xs text-emerald-800">เลือกห้อง แล้วเพิ่มนักเรียนทุกคนเข้าวิชาที่เลือก</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 items-center w-full sm:w-auto">
                                            <input
                                                type="text"
                                                placeholder="เลือกหรือพิมพ์ชื่อห้อง..."
                                                list="enroll-rooms-list"
                                                value={enrollRoom}
                                                onChange={(e) => setEnrollRoom(e.target.value)}
                                                disabled={!enrollSubject}
                                                className="bg-white border border-emerald-200 text-slate-800 py-2.5 px-3 rounded-xl font-bold text-sm focus:ring-2 focus:ring-emerald-400 outline-none shadow-sm disabled:opacity-50"
                                            />
                                            <datalist id="enroll-rooms-list">
                                                {[...new Set(allStudents.map(s => s.current_room).filter(Boolean))].sort().map(room => (
                                                    <option key={room} value={room} />
                                                ))}
                                            </datalist>
                                            <button
                                                disabled={!enrollSubject}
                                                onClick={async () => {
                                                    if (!enrollSubject) return;
                                                    const roomStudents = allStudents.filter(s => s.current_room === enrollRoom);
                                                    if (roomStudents.length === 0) {
                                                        toast.error(`ไม่พบนักเรียนในห้อง ${enrollRoom}`);
                                                        return;
                                                    }
                                                    const existingIds = new Set(subjectEnrollments.map(e => e.student_id));
                                                    const newStudents = roomStudents.filter(s => !existingIds.has(s.student_id));
                                                    if (newStudents.length === 0) {
                                                        toast.error(`นักเรียนในห้อง ${enrollRoom} ลงทะเบียนในวิชานี้ครบแล้ว`);
                                                        return;
                                                    }
                                                    if (!window.confirm(`ยืนยันเพิ่มนักเรียน ${newStudents.length} คน จากห้อง ${enrollRoom} เข้าวิชานี้?`)) return;
                                                    toast.loading(`กำลังเพิ่ม ${newStudents.length} คน...`, { id: 'bulk_en' });
                                                    const payload = newStudents.map(s => ({
                                                        student_id: s.student_id,
                                                        subject_id: enrollSubject,
                                                        room: enrollRoom,
                                                        enrollment_status: 'active'
                                                    }));
                                                    const { error } = await supabase.from('student_enrollments').insert(payload);
                                                    if (error) {
                                                        toast.error('เพิ่มไม่สำเร็จ: ' + error.message, { id: 'bulk_en' });
                                                    } else {
                                                        toast.success(`จัดนักเรียนเข้ารายวิชาแล้ว ${newStudents.length} คน จากห้อง ${enrollRoom}`, { id: 'bulk_en' });
                                                        // Reload enrollments (paginated)
                                                        const reloaded = await fetchAllRows((from, to) =>
                                                            supabase.from('student_enrollments')
                                                                .select('enrollment_id, student_id, subject_id, room, attendance_percent, enrollment_status, users_students(student_id, student_code, prefix, first_name, last_name, current_room, current_grade_level)')
                                                                .eq('subject_id', enrollSubject)
                                                                .eq('enrollment_status', 'active')
                                                                .range(from, to)
                                                        );
                                                        setSubjectEnrollments(reloaded || []);
                                                    }
                                                }}
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-extrabold text-sm shadow-md transition-all disabled:opacity-50 whitespace-nowrap"
                                            >
                                                เพิ่มทั้งห้อง
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {loadingEnrollments ? (
                                    <div className="py-24 flex justify-center"><div className="loader scale-150"></div></div>
                                ) : enrollSubject ? (
                                    <div className="overflow-x-auto rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
                                        <table className="w-full text-sm text-left whitespace-nowrap">
                                            <thead className="bg-slate-800 text-white sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-5 py-4 font-extrabold w-16 text-center">ลำดับ</th>
                                                    <th className="px-5 py-4 font-extrabold">รหัสนักเรียน</th>
                                                    <th className="px-5 py-4 font-extrabold">ชื่อ - นามสกุล</th>
                                                    <th className="px-5 py-4 font-extrabold text-center">ห้องประจำชั้น</th>
                                                    <th className="px-5 py-4 font-extrabold w-32 text-center">จัดการ</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                                {subjectEnrollments.length === 0 ? (
                                                    <tr><td colSpan="5" className="text-center py-12 text-slate-400 font-medium">ยังไม่มีนักเรียนลงทะเบียนในวิชานี้</td></tr>
                                                ) : subjectEnrollments.map((en, idx) => (
                                                    <tr key={en.enrollment_id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="px-5 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                                                        <td className="px-5 py-3 font-mono text-slate-600 bg-slate-50 text-center rounded">{en.users_students?.student_code}</td>
                                                        <td className="px-5 py-3 font-extrabold text-slate-800">{en.users_students?.prefix || ''}{en.users_students?.first_name} {en.users_students?.last_name}</td>
                                                        <td className="px-5 py-3 text-center font-bold text-indigo-600 bg-indigo-50/50 rounded">{en.room}</td>
                                                        <td className="px-5 py-3 text-center">
                                                            <button onClick={async () => {
                                                                if (!window.confirm('ยืนยันระบบลบนักเรียนคนนี้ออกจากวิชา?')) return;
                                                                const { error } = await supabase.from('student_enrollments').delete().eq('enrollment_id', en.enrollment_id);
                                                                if (error) toast.error('ลบไม่สำเร็จ: ' + error.message);
                                                                else {
                                                                    setSubjectEnrollments(prev => prev.filter(p => p.enrollment_id !== en.enrollment_id));
                                                                    toast.success('นำรายชื่อนักเรียนออกจากรายวิชาแล้ว');
                                                                }
                                                            }} className="text-red-500 hover:text-white border border-red-200 hover:bg-red-500 hover:border-red-500 px-4 py-2 rounded-xl font-bold transition-all w-full shadow-sm">
                                                                นำออก
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-32 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        โปรดเลือกรายวิชาที่ช่องตัวเลือกด้านบนซ้ายก่อน
                                    </div>
                                )}
                            </div>
                        )}
                        {/* --- TAB 5: EVALUATION PROGRESS --- */}
                        {activeTab === 'progress' && (
                            <div className="min-h-[500px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                                <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h2 className="flex items-center text-lg font-extrabold text-slate-900"><CheckCircle className="mr-2 h-5 w-5 text-emerald-600" />สถานะรายวิชาทั้งหมด</h2>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">แสดงวิชาที่ยังรายงานไม่ครบก่อน เพื่อให้ติดตามงานต่อได้ทันที</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={loadEvaluationProgress}
                                        disabled={loadingProgress}
                                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                                    >
                                        <RefreshCw className={`h-4 w-4 ${loadingProgress ? 'animate-spin' : ''}`} />
                                        {loadingProgress ? 'กำลังอัปเดต' : 'รีเฟรชข้อมูล'}
                                    </button>
                                </div>

                                {loadingProgress && !progressLoaded ? (
                                    <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-sm font-bold text-slate-600" role="status">
                                        <div className="loader scale-125"></div>
                                        กำลังรวบรวมสถานะการรายงานผล
                                    </div>
                                ) : progressError ? (
                                    <div className="surface-danger rounded-2xl border border-rose-200 px-5 py-10 text-center" role="alert">
                                        <p className="font-extrabold text-rose-950">โหลดสถานะการรายงานผลไม่สำเร็จ</p>
                                        <p className="mt-1 text-sm text-rose-800">{progressError}</p>
                                        <button type="button" onClick={loadEvaluationProgress} className="action-danger mt-4 min-h-11 rounded-xl px-4 text-sm font-extrabold">ลองโหลดอีกครั้ง</button>
                                    </div>
                                ) : evalProgress.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-16 text-center">
                                        <p className="font-extrabold text-slate-800">ยังไม่มีรายวิชาในภาคเรียนนี้</p>
                                        <p className="mt-1 text-sm text-slate-600">ตรวจสอบปีการศึกษาและภาคเรียน หรือเพิ่มข้อมูลรายวิชาก่อนติดตามผล</p>
                                        <button type="button" onClick={() => navigate('/admin/setup')} className="mt-4 min-h-11 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-extrabold text-indigo-700 hover:bg-indigo-50">ไปที่ตั้งค่าข้อมูล</button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {/* Summary bar */}
                                        <div className="mb-6 grid gap-3 sm:grid-cols-3">
                                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                                                <p className="text-3xl font-extrabold text-emerald-700">{evalProgress.filter(p => p.percent === 100).length}</p>
                                                <p className="text-xs font-bold text-emerald-600">ประเมินครบแล้ว</p>
                                            </div>
                                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                                                <p className="text-3xl font-extrabold text-amber-700">{evalProgress.filter(p => p.percent > 0 && p.percent < 100).length}</p>
                                                <p className="text-xs font-bold text-amber-600">กำลังดำเนินการ</p>
                                            </div>
                                            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
                                                <p className="text-3xl font-extrabold text-red-700">{evalProgress.filter(p => p.percent === 0).length}</p>
                                                <p className="text-xs font-bold text-red-600">ยังไม่เริ่ม</p>
                                            </div>
                                        </div>

                                        {/* Per-subject cards */}
                                        {evalProgress.map(p => (
                                            <div key={p.subject_id} className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 p-5 rounded-2xl border transition-all ${
                                                p.percent === 100 ? 'bg-emerald-50/50 border-emerald-200' :
                                                p.percent > 0 ? 'bg-amber-50/30 border-amber-200' :
                                                'bg-red-50/30 border-red-200'
                                            }`}>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-extrabold text-slate-800 text-sm truncate">{p.subject_name}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        ครู: <span className="font-bold text-slate-700">{p.teacherName}</span>
                                                        &ensp;|&ensp;{p.grade_level} ภาคเรียนที่ {p.semester}/{p.academic_year}
                                                        &ensp;|&ensp;{p.studentCount} คน · {p.loCount} ผลลัพธ์การเรียนรู้
                                                    </p>
                                                </div>
                                                <div className="w-full sm:w-48 shrink-0">
                                                    <div className="flex justify-between text-xs font-bold mb-1">
                                                        <span className={p.percent === 100 ? 'text-emerald-600' : p.percent > 0 ? 'text-amber-600' : 'text-red-500'}>
                                                            {p.filledCells}/{p.totalCells}
                                                        </span>
                                                        <span className="text-slate-600">{p.percent}%</span>
                                                    </div>
                                                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                p.percent === 100 ? 'bg-emerald-500' : p.percent > 50 ? 'bg-indigo-500' : p.percent > 0 ? 'bg-amber-400' : 'bg-red-300'
                                                            }`}
                                                            style={{ width: `${Math.max(p.percent, 1)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <span className={`text-xs font-extrabold px-3 py-1.5 rounded-lg border shrink-0 ${
                                                    p.percent === 100 ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                                                    p.percent > 0 ? 'bg-amber-100 text-amber-700 border-amber-300' :
                                                    'bg-red-100 text-red-600 border-red-300'
                                                }`}>
                                                    {p.percent === 100 ? 'ประเมินครบ' : p.percent > 0 ? `ดำเนินการแล้ว ${p.percent}%` : 'ยังไม่เริ่มประเมิน'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* --- TAB 6: STUDENT PROMOTION --- */}
                        {activeTab === 'promotion' && (
                            <div className="min-h-[500px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                                <div className="mb-6 border-b border-slate-100 pb-6">
                                    <h2 className="mb-2 flex items-center text-lg font-extrabold text-slate-900"><ArrowUpCircle className="mr-2 h-5 w-5 text-indigo-600" />เลือกนักเรียนและกำหนดห้องใหม่</h2>
                                    <p className="text-sm font-medium text-slate-600">จัดการทั้งห้องหรือเลือกเฉพาะนักเรียนที่ย้ายห้องและต้องดูแลรายบุคคล</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                                        <h3 className="font-bold text-slate-700 mb-4 flex items-center"><Search className="w-4 h-4 mr-2"/> 1. ค้นหานักเรียนจากห้องปัจจุบัน</h3>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="เช่น ป.1/1 (พิมพ์หรือเลือกจากรายการ)"
                                                list="promo-rooms-list"
                                                className="flex-1 px-4 py-2 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                                value={promoFromRoom}
                                                onChange={(e) => setPromoFromRoom(e.target.value)}
                                            />
                                            <datalist id="promo-rooms-list">
                                                {[...new Set(allStudents.map(s => s.current_room).filter(Boolean))].sort().map(room => (
                                                    <option key={room} value={room} />
                                                ))}
                                            </datalist>
                                            <button 
                                                onClick={async () => {
                                                    if (!promoFromRoom.trim()) return toast.error('กรุณาระบุห้อง');
                                                    setLoadingPromo(true);
                                                    try {
                                                        const { data, error } = await supabase
                                                            .from('users_students')
                                                            .select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room, student_status')
                                                            .eq('school_id', currentUser.school_id)
                                                            .eq('current_room', promoFromRoom.trim())
                                                            .order('student_code');
                                                        if (error) throw error;
                                                        if (data.length === 0) toast.error('ไม่พบนักเรียนในห้องนี้');
                                                        else toast.success(`พบนักเรียน ${data.length} คน`);
                                                        setPromoStudents(data || []);
                                                        setPromoSelectedStudents((data || []).map(s => s.student_id));
                                                    } catch (err) {
                                                        toast.error('ข้อผิดพลาด: ' + err.message);
                                                    } finally {
                                                        setLoadingPromo(false);
                                                    }
                                                }}
                                                className="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold hover:bg-slate-900 transition flex items-center"
                                            >
                                                {loadingPromo ? <div className="loader w-4 h-4 mr-2" /> : <Search className="w-4 h-4 mr-2" />}
                                                ค้นหา
                                            </button>
                                        </div>
                                    </div>

                                    <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-200">
                                        <h3 className="font-bold text-indigo-800 mb-4 flex items-center"><ArrowUpCircle className="w-4 h-4 mr-2"/> 2. กำหนดระดับชั้นและห้องเรียนใหม่</h3>
                                        <div className="flex flex-col gap-3">
                                            <input 
                                                type="text" 
                                                placeholder="ชั้นใหม่ (เช่น ป.2) พิมพ์หรือเลือก"
                                                list="promo-grades-list"
                                                className="w-full px-4 py-2 border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                                value={promoToGrade}
                                                onChange={(e) => setPromoToGrade(e.target.value)}
                                            />
                                            <datalist id="promo-grades-list">
                                                {[...new Set(allStudents.map(s => s.current_grade_level).filter(Boolean))].sort().map(grade => (
                                                    <option key={grade} value={grade} />
                                                ))}
                                            </datalist>
                                            <input 
                                                type="text" 
                                                placeholder="ห้องใหม่ (เช่น ป.2/1) พิมพ์หรือเลือก"
                                                list="promo-rooms-list"
                                                className="w-full px-4 py-2 border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                                                value={promoToRoom}
                                                onChange={(e) => setPromoToRoom(e.target.value)}
                                            />
                                            <button 
                                                disabled={promoSelectedStudents.length === 0 || !promoToGrade || !promoToRoom}
                                                onClick={async () => {
                                                    if (!window.confirm(`ยืนยันการเปลี่ยนนักเรียนที่เลือกทั้ง ${promoSelectedStudents.length} คน ไปยังชั้น ${promoToGrade} ห้อง ${promoToRoom} หรือไม่?`)) return;
                                                    try {
                                                        for (let index = 0; index < promoSelectedStudents.length; index += 200) {
                                                            const { error } = await supabase.from('users_students')
                                                                .update({ current_grade_level: promoToGrade.trim(), current_room: promoToRoom.trim() })
                                                                .eq('school_id', currentUser.school_id)
                                                                .in('student_id', promoSelectedStudents.slice(index, index + 200));
                                                            if (error) throw error;
                                                        }
                                                        toast.success('บันทึกการเลื่อนชั้นและจัดห้องเรียนแล้ว');
                                                        setPromoStudents([]);
                                                        setPromoSelectedStudents([]);
                                                        setPromoFromRoom('');
                                                        setPromoToGrade('');
                                                        setPromoToRoom('');
                                                    } catch (err) {
                                                        toast.error('บันทึกไม่สำเร็จ: ' + err.message);
                                                    }
                                                }}
                                                className="w-full mt-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                บันทึกการเลื่อนชั้น ({promoSelectedStudents.length} คน)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {promoStudents.length > 0 && (
                                    <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                                            <span>รายชื่อนักเรียนในห้อง</span>
                                            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-lg">เลือก {promoSelectedStudents.length}/{promoStudents.length} คน</span>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            <table className="w-full text-left text-sm whitespace-nowrap">
                                                <thead className="bg-white sticky top-0 border-b border-slate-100 z-10 shadow-sm">
                                                    <tr className="text-slate-500">
                                                        <th className="px-4 py-3 font-medium w-16 text-center">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                                                checked={promoSelectedStudents.length === promoStudents.length && promoStudents.length > 0}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setPromoSelectedStudents(promoStudents.map(s => s.student_id));
                                                                    else setPromoSelectedStudents([]);
                                                                }}
                                                            />
                                                        </th>
                                                        <th className="px-4 py-3 font-medium w-16 text-center">ลำดับ</th>
                                                        <th className="px-4 py-3 font-medium w-32">รหัสนักเรียน</th>
                                                        <th className="px-4 py-3 font-medium">ชื่อ-นามสกุล</th>
                                                        <th className="px-4 py-3 font-medium">ชั้นปัจจุบัน</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                    {promoStudents.map((s, i) => (
                                                        <tr key={s.student_id} className="hover:bg-slate-50">
                                                            <td className="px-4 py-2 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                                                    checked={promoSelectedStudents.includes(s.student_id)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) setPromoSelectedStudents([...promoSelectedStudents, s.student_id]);
                                                                        else setPromoSelectedStudents(promoSelectedStudents.filter(id => id !== s.student_id));
                                                                    }}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-2 text-center text-slate-400 font-semibold">{i+1}</td>
                                                            <td className="px-4 py-2 font-mono text-slate-600">{s.student_code}</td>
                                                            <td className="px-4 py-2 font-bold text-slate-800">{s.prefix||''}{s.first_name} {s.last_name}</td>
                                                            <td className="px-4 py-2 text-slate-500">{s.current_grade_level} ({s.current_room})</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
