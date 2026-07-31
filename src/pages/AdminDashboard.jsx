import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, fetchAllRows } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { Settings, Users, Upload, Link as LinkIcon, Download, Trash2, Edit, Save, Plus, X, Search, FileText, LayoutDashboard, GraduationCap, CheckCircle, BookOpen, FileBarChart2, BarChart3, UsersRound, ArrowUpCircle, ShieldCheck, Database, School, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { hashPassword } from '../lib/auth';
import { useAcademic } from '../AcademicContext';
import AcademicDashboardHome from '../components/AcademicDashboardHome';

const WORKSPACE_TABS = [
    { id: 'overview', label: 'Dashboard', shortLabel: 'หน้าหลัก', description: 'กลับไปดูภาพรวมงานวิชาการ', icon: LayoutDashboard },
    { id: 'data', label: 'ข้อมูลสถานศึกษา', shortLabel: 'ข้อมูล', description: 'ตรวจสอบและแก้ไขข้อมูลครู นักเรียน วิชา และ LO', icon: Database },
    { id: 'import', label: 'นำเข้าข้อมูล', shortLabel: 'นำเข้า', description: 'นำเข้าข้อมูลจาก DMC, Excel หรือ CSV', icon: Upload },
    { id: 'mapping', label: 'กำหนด LO ของวิชา', shortLabel: 'กำหนด LO', description: 'เลือกผลลัพธ์การเรียนรู้ที่ใช้ประเมินในแต่ละวิชา', icon: LinkIcon },
    { id: 'enrollment', label: 'จัดกลุ่มเรียน', shortLabel: 'กลุ่มเรียน', description: 'จัดนักเรียนเข้าวิชาและตรวจสอบรายชื่อในแต่ละกลุ่ม', icon: Users },
    { id: 'progress', label: 'ติดตามการประเมิน', shortLabel: 'ติดตามผล', description: 'ตรวจสอบความก้าวหน้าของครูผู้สอนและแต่ละวิชา', icon: CheckCircle },
    { id: 'promotion', label: 'เลื่อนชั้นและจัดห้อง', shortLabel: 'เลื่อนชั้น', description: 'ปรับระดับชั้นและห้องเรียนสำหรับปีการศึกษาถัดไป', icon: ArrowUpCircle },
];

const SCHOOL_SCOPED_TABLES = ['users_students', 'users_teachers', 'subjects', 'learning_outcomes'];

const FIELD_LABELS = {
    citizen_id: 'เลขประจำตัวประชาชน', student_code: 'รหัสนักเรียน', prefix: 'คำนำหน้า', first_name: 'ชื่อ', last_name: 'นามสกุล',
    current_grade_level: 'ระดับชั้น', current_room: 'ห้องเรียน', student_status: 'สถานภาพ', role: 'บทบาท', homeroom: 'ห้องประจำชั้น',
    is_active: 'สถานะใช้งาน', academic_year: 'ปีการศึกษา', semester: 'ภาคเรียน', subject_name: 'ชื่อวิชา', grade_level: 'ระดับชั้น',
    subject_group: 'กลุ่มวิชา', teacher_id: 'ครูผู้สอน', lo_code: 'รหัส LO', ability_no: 'ข้อที่', level_group: 'ช่วงชั้น',
    competency_area: 'ด้านความสามารถ', lo_description: 'รายละเอียดผลลัพธ์การเรียนรู้', competency_level: 'ระดับความสามารถ', behavior_text: 'คำบรรยายพฤติกรรม',
    new_password: 'กำหนดรหัสผ่านใหม่', dob: 'วันเดือนปีเกิด',
};

const hiddenField = (key, table) => ['password_hash', 'plain_password', 'school_id', 'created_at', 'updated_at', 'student_id', 'subject_id', 'lo_id', 'id'].includes(key)
    || (table === 'subjects' && key === 'subject_code');

const VALUE_LABELS = {
    active: 'ใช้งาน', inactive: 'ไม่ใช้งาน', admin: 'ฝ่ายวิชาการ', teacher: 'ครูผู้สอน', executive: 'ผู้บริหาร', student: 'นักเรียน',
};

// คอลัมน์ที่แก้ไม่ได้ เพราะเป็นรหัสอ้างอิงที่ผูกกับผลการประเมินและการลงทะเบียนไว้แล้ว
// ถ้าแก้ ข้อมูลที่เชื่อมกันอยู่จะขาดออกจากกันโดยไม่มีทางกู้คืน
const READONLY_FIELDS = {
    users_teachers: ['teacher_id'],
    users_students: ['student_id'],
    subjects: ['subject_id'],
    learning_outcomes: ['lo_id'],
};
const isReadonlyField = (key, table) => (READONLY_FIELDS[table] || []).includes(key);

// ช่องที่มีค่าที่เป็นไปได้จำกัด ต้องเลือกจากรายการ พิมพ์เองแล้วผิดเพียงตัวอักษรเดียว
// เช่น admi แทน admin จะทำให้บัญชีนั้นเข้าใช้งานไม่ได้ทันที
const FIELD_OPTIONS = {
    role: [['teacher', 'ครูผู้สอน'], ['admin', 'ฝ่ายวิชาการ'], ['executive', 'ผู้บริหาร']],
    is_active: [['true', 'ใช้งาน'], ['false', 'ระงับการใช้งาน']],
    student_status: [['active', 'ใช้งาน'], ['inactive', 'ไม่ใช้งาน']],
    semester: [['1', 'ภาคเรียนที่ 1'], ['2', 'ภาคเรียนที่ 2']],
};

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

const displayValue = value => {
    if (value === true) return 'ใช้งาน';
    if (value === false) return 'ไม่ใช้งาน';
    if (VALUE_LABELS[value]) return VALUE_LABELS[value];
    return value?.toString() || '-';
};

export default function AdminDashboard() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab');
    const [activeTab, setActiveTab] = useState(['data', 'import', 'mapping', 'enrollment', 'progress', 'promotion'].includes(requestedTab) ? requestedTab : 'overview');

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

    // Promotion States
    const [promoFromRoom, setPromoFromRoom] = useState('');
    const [promoToGrade, setPromoToGrade] = useState('');
    const [promoToRoom, setPromoToRoom] = useState('');
    const [loadingPromo, setLoadingPromo] = useState(false);
    const [promoStudents, setPromoStudents] = useState([]);

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
            supabase.from('users_students').select('*').eq('school_id', currentUser.school_id).range(from, to)
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

            let query = supabase.from(table).select('*', { count: 'exact' });
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
            if (payload.citizen_id !== undefined) payload.citizen_id = String(payload.citizen_id).replace(/\D/g, '');
            if (payload.new_password) {
                payload.password_hash = await hashPassword(payload.new_password.toString().trim());
                delete payload.new_password;
            }

            let query = supabase.from(selectedTable).update(payload).eq(idCol, idValue);
            if (SCHOOL_SCOPED_TABLES.includes(selectedTable)) {
                query = query.eq('school_id', currentUser.school_id);
            }
            const { error } = await query;
            if (error) throw error;
            toast.success('อัปเดตข้อมูลสำเร็จ');
            setEditingRow(null);
            loadTableData(selectedTable);
        } catch (err) {
            toast.error('อัปเดตไม่สำเร็จ: ' + err.message);
        }
    };

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
        else if (cleanId === LOSSY_SCIENTIFIC) errors.push(`แถว ${rowNum}: citizen_id ถูก Excel ย่อเป็นตัวเลขวิทยาศาสตร์ (เช่น 1.43E+12) ทำให้เลขหายไป กรุณาตั้งรูปแบบคอลัมน์เป็น "ข้อความ" (Text) แล้วส่งออกไฟล์ใหม่`);
        else if (cleanId.length !== 13) errors.push(`แถว ${rowNum}: citizen_id "${cleanId}" ต้องมี 13 หลัก (มี ${cleanId.length} หลัก)`);
        else if (/^(1{13}|2{13}|3{13}|0{13})$/.test(cleanId)) errors.push(`แถว ${rowNum}: citizen_id "${cleanId}" ดูเหมือนเป็นข้อมูลทดสอบ`);
        if (!cleanDob) errors.push(`แถว ${rowNum}: dob ว่างเปล่า`);
        else if (cleanDob.length !== 8) errors.push(`แถว ${rowNum}: dob "${cleanDob}" ต้องมี 8 หลัก DDMMYYYY`);
        return errors;
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
                if (cleanId === LOSSY_SCIENTIFIC) errs.push(`citizen_id "${row[COL.CITIZEN]}" ถูก Excel ย่อเป็นตัวเลขวิทยาศาสตร์ ทำให้เลขหายไป กรุณาตั้งรูปแบบคอลัมน์เป็น "ข้อความ" (Text) แล้วส่งออกไฟล์ใหม่`);
                else if (cleanId.length !== 13) errs.push(`citizen_id "${row[COL.CITIZEN]}" ไม่ใช่ 13 หลัก (${cleanId.length})`);
                if (!dobStr) errs.push(`วันเกิด "${row[COL.DOB]}" ไม่ถูกต้อง`);
                if (!fname) errs.push('ไม่มีชื่อ');
                if (errs.length > 0) invalidRows.push({ row: i + 3, name: `${fname} ${lname}`, errors: errs });
                else validRows.push({ citizen_id: cleanId, dob: dobStr, student_code: code, prefix, first_name: fname, last_name: lname, current_room: currentRoom, current_grade_level: currentGradeLevel });
            }

            if (validRows.length === 0) { toast.error(`ไม่มีแถวที่ถูกต้อง (${invalidRows.length} แถวผิด)`, { id: 'dmc' }); return; }
            if (invalidRows.length > 0) { toast.error(`ไม่นำเข้าข้อมูลที่ไม่ถูกต้อง ${invalidRows.length} แถว`); console.warn('[DMC Invalid]', invalidRows); }

            const payload = await Promise.all(validRows.map(async r => ({
                school_id: currentUser.school_id, citizen_id: r.citizen_id,
                password_hash: await hashPassword(r.dob),
                student_code: r.student_code || null, prefix: r.prefix,
                first_name: r.first_name, last_name: r.last_name,
                current_room: r.current_room || null,
                current_grade_level: r.current_grade_level || null,
                student_status: 'active',
            })));

            const { error } = await supabase.from('users_students').upsert(payload, { onConflict: 'citizen_id' });
            if (error) throw error;
            const updated = await fetchAllRows((from, to) =>
                supabase.from('users_students').select('*').eq('school_id', currentUser.school_id).range(from, to)
            );
            setAllStudents(updated || []);
            setStats(prev => ({ ...prev, students: updated?.length || 0 }));
            toast.success(`นำเข้าข้อมูลนักเรียนจาก DMC แล้ว ${payload.length} คน`, { id: 'dmc' });
            if (selectedTable === 'users_students') loadTableData('users_students');
        } catch (err) {
            toast.error('นำเข้าผิดพลาด: ' + err.message, { id: 'dmc' });
        }
    };

    // --- CSV IMPORT ---
    const handleFileUpload = async (e, importType) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = null;
        const ext = file.name.split('.').pop().toLowerCase();
        const label = ext === 'xlsx' || ext === 'xls' ? 'Excel' : 'CSV';
        toast.loading(`กำลังอ่านไฟล์ ${label} สำหรับ: ${importType}...`, { id: 'csv' });

        try {
            const data = await parseUploadedFile(file);
            if (!data || data.length === 0) { toast.error('ไฟล์ว่างเปล่า', { id: 'csv' }); return; }

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
                        const { error } = await supabase.from('users_students').upsert(payload, { onConflict: 'citizen_id' });
                        if (error) throw error;
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
                            role: t.role?.trim() || 'teacher',
                            is_active: true
                        })));
                        if (payload.length === 0) { toast.error('ไม่มีข้อมูลนำเข้า', { id: 'csv' }); return; }
                        const { error } = await supabase.from('users_teachers').upsert(payload, { onConflict: 'citizen_id' });
                        if (error) throw error;
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
                                teacher_id: tId
                            };
                        });
                        
                        // ป้องกันข้อมูลซ้ำ (ชื่อวิชา_ปี_เทอม)
                        const existingSet = new Set(subjects.map(s => `${s.subject_name}_${s.academic_year}_${s.semester}`));
                        payload = tempPayload.filter(p => !existingSet.has(`${p.subject_name}_${p.academic_year}_${p.semester}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('subjects').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลวิชาซ้ำกับที่มีอยู่ในระบบทั้งหมด', { id: 'csv' });
                            return;
                        }
                    }
                    else if (importType === 'enrollments') {
                        const studentMap = {};
                        allStudents.forEach(st => studentMap[st.citizen_id] = st.student_id);
                        
                        const subjectMap = {};
                        subjects.forEach(su => subjectMap[su.subject_name] = su.subject_id);

                        let tempPayload = [];
                        let missingData = 0;

                        data.forEach(e => {
                            const cId = e.student_citizen_id ? String(e.student_citizen_id).replace(/\D/g, '') : null;
                            const sName = e.subject_name?.trim();
                            const stId = studentMap[cId];
                            const suId = subjectMap[sName];
                            
                            if (stId && suId) {
                                tempPayload.push({ student_id: stId, subject_id: suId, room: e.room?.trim() });
                            } else {
                                missingData++;
                            }
                        });

                        if (missingData > 0) {
                            toast.error(`ข้ามข้อมูล ${missingData} แถว เนื่องจากไม่พบเลข ปชช. นร. หรือ ชื่อวิชา ในระบบ`, { id: 'csv' });
                        }

                        if (tempPayload.length === 0) {
                            toast.error('ไม่มีข้อมูลที่ถูกต้องให้เพิ่มเข้าสู่ระบบ', { id: 'csv' });
                            return;
                        }
                        
                        // ดึงข้อมูลการลงทะเบียนทั้งหมดมาเทียบ (paginated, filter by school via subjects)
                        const { data: schoolSubjects } = await supabase.from('subjects').select('subject_id').eq('school_id', currentUser.school_id);
                        const schoolSubjectIds = (schoolSubjects || []).map(s => s.subject_id);
                        const existingEn = schoolSubjectIds.length > 0
                            ? await fetchAllRows((from, to) =>
                                supabase.from('student_enrollments').select('student_id, subject_id').in('subject_id', schoolSubjectIds).range(from, to)
                              )
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
                            lo_code: l.lo_code?.trim(), ability_no: parseInt(l.ability_no), level_group: l.level_group?.trim(),
                            competency_area: l.competency_area?.trim(), lo_description: l.lo_description?.trim()
                        }));
                        
                        // เซ็คซ้ำ (lo_code และ ability_no ของโรงเรียนนี้)
                        const { data: existingLO } = await supabase.from('learning_outcomes').select('lo_code, ability_no').eq('school_id', currentUser.school_id);
                        const existingSet = new Set((existingLO || []).map(l => `${l.lo_code}_${l.ability_no}`));
                        
                        payload = tempPayload.filter(p => !existingSet.has(`${p.lo_code}_${p.ability_no}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('learning_outcomes').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ผลลัพธ์การเรียนรู้ (LO) ในไฟล์ซ้ำกับข้อมูลที่มีอยู่ทั้งหมด', { id: 'csv' });
                            return;
                        }
                    }
                    else if (importType === 'behaviors') {
                        let tempPayload = data.map(b => ({
                            competency_area: b.competency_area?.trim(), competency_level: b.competency_level?.trim(), behavior_text: b.behavior_text?.trim()
                        }));
                        
                        // เซ็คซ้ำ 
                        const { data: existingB } = await supabase.from('behavior_templates').select('competency_area, competency_level, behavior_text');
                        const existingSet = new Set((existingB || []).map(b => `${b.competency_area}_${b.competency_level}_${b.behavior_text}`));
                        
                        payload = tempPayload.filter(p => !existingSet.has(`${p.competency_area}_${p.competency_level}_${p.behavior_text}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('behavior_templates').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลคลังพฤติกรรม ซ้ำกับที่มีอยู่ในระบบทั้งหมด', { id: 'csv' });
                            return;
                        }
                    }
                    else if (importType === 'yearly_competencies') {
                        let tempPayload = data.map(c => ({
                            school_id: currentUser.school_id, 
                            grade_level: c.grade_level?.trim(),
                            competency_no: parseInt(c.competency_no),
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
                            supabase.from('users_students').select('*').eq('school_id', currentUser.school_id).range(from, to)
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
                        'students': 'users_students',
                        'teachers': 'users_teachers',
                        'subjects': 'subjects',
                        'enrollments': 'student_enrollments',
                        'learning_outcomes': 'learning_outcomes',
                        'behaviors': 'behavior_templates'
                    };
                    if (selectedTable === mapImportToTable[importType]) {
                        loadTableData(selectedTable);
                    }

                } catch (err) {
                    toast.error('ข้อผิดพลาดการนำเข้า: ' + err.message, { id: 'csv' });
                }
        } catch (err) {
            toast.error('อ่านไฟล์ไม่สำเร็จ: ' + err.message, { id: 'csv' });
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
        if (tabId === 'data' && !selectedTable) loadTableData('users_students');
    };
    const activeWorkspace = WORKSPACE_TABS.find(tab => tab.id === activeTab) || WORKSPACE_TABS[1];

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
            {/* Overview Stats Dashboard */}
            <div className="hidden">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-3xl p-6 text-white shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-indigo-100 font-medium mb-1">นักเรียนทั้งหมด</p>
                        <h3 className="text-4xl font-extrabold">{stats.students.toLocaleString()} <span className="text-lg font-normal">คน</span></h3>
                    </div>
                    <div className="bg-white/20 p-4 rounded-2xl"><Users className="w-8 h-8" /></div>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl p-6 text-white shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-blue-100 font-medium mb-1">ครูและบุคลากร</p>
                        <h3 className="text-4xl font-extrabold">{stats.teachers.toLocaleString()} <span className="text-lg font-normal">คน</span></h3>
                    </div>
                    <div className="bg-white/20 p-4 rounded-2xl"><GraduationCap className="w-8 h-8" /></div>
                </div>
                <div className="bg-gradient-to-br from-slate-700 to-slate-900 rounded-3xl p-6 text-white shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-slate-200 font-medium mb-1">รายวิชาที่เปิดสอน</p>
                        <h3 className="text-4xl font-extrabold">{stats.subjects.toLocaleString()} <span className="text-lg font-normal">วิชา</span></h3>
                    </div>
                    <div className="bg-white/20 p-4 rounded-2xl"><BookOpen className="w-8 h-8" /></div>
                </div>
            </div>

            {/* Setup Checklist — shown until all steps complete */}
            {(stats.teachers === 0 || stats.students === 0 || stats.subjects === 0) && (
                <div className="hidden">
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-amber-100 flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 shrink-0"><Settings className="h-4 w-4" /></div>
                        <div>
                            <p className="font-extrabold text-amber-900 text-sm">การเตรียมข้อมูลก่อนเริ่มประเมินผล</p>
                            <p className="text-xs text-amber-700 font-medium">ดำเนินการตามขั้นตอนให้ครบเพื่อให้โครงสร้างการประเมินพร้อมใช้งาน</p>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {[
                                {
                                    step: 1,
                                    done: stats.teachers > 0,
                                    label: 'นำเข้าข้อมูลครูและบุคลากร',
                                    desc: `${stats.teachers > 0 ? `มีข้อมูลครูและบุคลากร ${stats.teachers} คน` : 'ยังไม่มีข้อมูลครูและบุคลากร'}`,
                                    action: () => setActiveTab('import'),
                                    actionLabel: 'นำเข้าข้อมูลครู'
                                },
                                {
                                    step: 2,
                                    done: stats.students > 0,
                                    label: 'นำเข้าข้อมูลนักเรียน',
                                    desc: `${stats.students > 0 ? `มีข้อมูลนักเรียน ${stats.students} คน` : 'ยังไม่มีข้อมูลนักเรียน'}`,
                                    action: () => setActiveTab('import'),
                                    actionLabel: 'นำเข้าข้อมูลนักเรียน'
                                },
                                {
                                    step: 3,
                                    done: stats.subjects > 0,
                                    label: 'กำหนดรายวิชาและเชื่อมโยงผลลัพธ์การเรียนรู้',
                                    desc: `${stats.subjects > 0 ? `มีรายวิชาที่เปิดสอน ${stats.subjects} วิชา` : 'ยังไม่มีข้อมูลรายวิชาที่เปิดสอน'}`,
                                    action: () => setActiveTab('import'),
                                    actionLabel: 'กำหนดรายวิชา'
                                },
                                {
                                    step: 4,
                                    done: stats.subjects > 0 && stats.students > 0,
                                    label: 'จัดนักเรียนเข้าชั้นเรียนและรายวิชา',
                                    desc: 'กำหนดห้องเรียนและรายวิชาที่นักเรียนลงทะเบียน',
                                    action: () => setActiveTab('enrollment'),
                                    actionLabel: 'จัดนักเรียนเข้ารายวิชา'
                                },
                            ].map(item => (
                                <div key={item.step} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${item.done ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'}`}>
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0 ${item.done ? 'bg-green-500 text-white' : 'bg-white border-2 border-slate-300 text-slate-500'}`}>
                                        {item.done ? '✓' : item.step}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-bold text-sm ${item.done ? 'text-green-800 line-through decoration-green-400' : 'text-slate-800'}`}>{item.label}</p>
                                        <p className={`text-xs mt-0.5 ${item.done ? 'text-green-600' : 'text-slate-500'}`}>{item.desc}</p>
                                    </div>
                                    {!item.done && (
                                        <button onClick={item.action} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 hover:bg-indigo-50 px-3 py-1.5 rounded-xl transition-all shrink-0">
                                            {item.actionLabel}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Admin Reports Quick Access */}
            <div className="hidden">
                <button
                    onClick={() => navigate('/admin/approval')}
                    className="mb-5 flex w-full flex-col gap-4 rounded-3xl border border-indigo-300 bg-indigo-700 p-6 text-left text-white shadow-lg shadow-indigo-950/10 transition hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 md:flex-row md:items-center md:justify-between"
                >
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-white/15 p-3" aria-hidden="true">
                            <ShieldCheck className="h-7 w-7" />
                        </div>
                        <div>
                            <p className="text-xl font-extrabold">ตรวจสอบและรับรองผลลัพธ์การเรียนรู้</p>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-indigo-100">รวบรวมผลลัพธ์การเรียนรู้เดียวกันจากวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม เพื่อพิจารณาหลักฐานและรับรองผลของผู้เรียน</p>
                        </div>
                    </div>
                    <span className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-4 font-extrabold text-indigo-800">ตรวจสอบรายการรอรับรอง</span>
                </button>
                <button
                    onClick={() => navigate('/admin/learning-contexts')}
                    className="mb-5 flex w-full flex-col gap-4 rounded-2xl border border-slate-300 bg-white p-5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 md:flex-row md:items-center md:justify-between"
                >
                    <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-violet-100 p-3 text-violet-700" aria-hidden="true"><LinkIcon className="h-6 w-6" /></div>
                        <div><p className="font-extrabold text-slate-900">รูปแบบการจัดการเรียนรู้</p><p className="mt-1 text-sm leading-6 text-slate-600">กำหนดวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม พร้อมเชื่อมโยงผลลัพธ์การเรียนรู้ที่ต้องการประเมิน</p></div>
                    </div>
                    <span className="font-extrabold text-indigo-700">จัดการรูปแบบการเรียนรู้</span>
                </button>
                <h3 className="mb-4 text-sm font-extrabold text-slate-600">รายงานสารสนเทศทางวิชาการ</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => navigate('/admin/report-lo')}
                        className="group flex items-center gap-4 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 text-left transition-all shadow-sm hover:shadow-md"
                    >
                        <div className="w-12 h-12 bg-indigo-100 group-hover:bg-indigo-600 rounded-2xl flex items-center justify-center transition-colors">
                            <FileBarChart2 className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                        </div>
                        <div>
                            <p className="font-extrabold text-slate-800">ตารางที่ 2 — ผลการประเมินรายผลลัพธ์การเรียนรู้</p>
                            <p className="text-sm text-slate-500 mt-0.5">สรุปผลการประเมินแต่ละผลลัพธ์การเรียนรู้ จำแนกตามรายวิชาที่เชื่อมโยง</p>
                        </div>
                    </button>
                    <button
                        onClick={() => navigate('/admin/report-competency')}
                        className="group flex items-center gap-4 bg-white hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-2xl p-5 text-left transition-all shadow-sm hover:shadow-md"
                    >
                        <div className="w-12 h-12 bg-purple-100 group-hover:bg-purple-600 rounded-2xl flex items-center justify-center transition-colors">
                            <BarChart3 className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                        </div>
                        <div>
                            <p className="font-extrabold text-slate-800">ตารางที่ 3 — ผลการประเมินรายด้านความสามารถ</p>
                            <p className="text-sm text-slate-500 mt-0.5">สรุปผลการประเมินผู้เรียนตามด้านความสามารถจากรายวิชาที่เชื่อมโยง</p>
                        </div>
                    </button>
                    <button
                        onClick={() => navigate('/admin/yearly-report')}
                        className="group flex items-center gap-4 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-2xl p-5 text-left transition-all shadow-sm hover:shadow-md"
                    >
                        <div className="w-12 h-12 bg-emerald-100 group-hover:bg-emerald-600 rounded-2xl flex items-center justify-center transition-colors">
                            <GraduationCap className="w-6 h-6 text-emerald-600 group-hover:text-white transition-colors" />
                        </div>
                        <div>
                            <p className="font-extrabold text-slate-800">รายงานผลการเรียนรายบุคคล (ปพ.๖)</p>
                            <p className="text-sm text-slate-500 mt-0.5">บันทึกผลและพิมพ์แบบรายงานผลการเรียนชั้นปีรายบุคคล</p>
                        </div>
                    </button>
                    <button
                        onClick={() => navigate('/admin/phase-report')}
                        className="group flex items-center gap-4 bg-white hover:bg-teal-50 border border-slate-200 hover:border-teal-300 rounded-2xl p-5 text-left transition-all shadow-sm hover:shadow-md"
                    >
                        <div className="w-12 h-12 bg-teal-100 group-hover:bg-teal-600 rounded-2xl flex items-center justify-center transition-colors">
                            <GraduationCap className="h-6 w-6 text-teal-700 group-hover:text-white" />
                        </div>
                        <div>
                            <p className="font-extrabold text-slate-800">รายงานผลการเรียนจบช่วงชั้น</p>
                            <p className="text-sm text-slate-500 mt-0.5">บันทึกและพิมพ์ผลจบช่วงชั้นตอนต้น (ป.1–ป.3) / ตอนปลาย (ป.4–ป.6)</p>
                        </div>
                    </button>
                </div>
            </div>


            <div className="academic-workspace mb-10 space-y-5">
                <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div><button onClick={() => openWorkspaceTab('overview')} className="mb-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"><LayoutDashboard className="h-4 w-4" /> กลับ Dashboard</button><h2 className="text-2xl font-extrabold text-slate-950">{activeWorkspace.label}</h2><p className="mt-1 text-sm text-slate-600">{activeWorkspace.description}</p></div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">ภาคเรียนที่ <strong className="text-slate-900">{semester}/{academicYear}</strong></div>
                </header>

                <nav className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="เมนูงานบริหารวิชาการ">
                    <div className="flex min-w-max gap-1">
                        {WORKSPACE_TABS.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => openWorkspaceTab(tab.id)}
                                className={`flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                    activeTab === tab.id 
                                    ? 'bg-indigo-700 text-white'
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <tab.icon className="h-4 w-4 flex-shrink-0" />
                                <span>{tab.shortLabel}</span>
                            </button>
                        ))}
                    </div>
                </nav>

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
                                        <option value="users_students">ข้อมูลนักเรียน</option>
                                        <option value="users_teachers">ข้อมูลครูและบุคลากร</option>
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
                                                                    {displayValue(row[key])}
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
                                                                <button onClick={() => setEditingRow({ id: idValue, data: { ...row } })} className="text-indigo-600 bg-indigo-50 p-2 rounded-xl hover:bg-indigo-100 transition-colors border border-indigo-100"><Edit className="w-4 h-4" /></button>
                                                                <button onClick={() => handleDelete(idValue, idCol)} className="text-red-600 bg-red-50 p-2 rounded-xl hover:bg-red-100 transition-colors border border-red-100"><Trash2 className="w-4 h-4" /></button>
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
                                <div className="mb-6">
                                    <h3 className="font-extrabold text-slate-900">เลือกข้อมูลที่ต้องการนำเข้า</h3>
                                    <p className="mt-1 text-sm text-slate-600">สำหรับข้อมูลนักเรียน แนะนำให้นำเข้าไฟล์ DMC โดยตรง ส่วนข้อมูลอื่นดาวน์โหลดแม่แบบก่อนกรอกข้อมูล</p>
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
                                        <label className="flex min-h-11 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-extrabold text-white hover:bg-blue-800 md:w-auto md:self-center">
                                            <Upload className="w-6 h-6" />
                                            อัปโหลดไฟล์ Excel ของ DMC
                                            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleDMCImport} />
                                        </label>
                                    </div>
                                </div>

                                <div className="overflow-hidden rounded-2xl border border-slate-200">
                                    {[
                                        { id: 'students', title: 'ข้อมูลนักเรียน', desc: 'ข้อมูลนักเรียน ระดับชั้น ห้องเรียน และสถานภาพการศึกษา', template: 'citizen_id,dob,student_code,prefix,first_name,last_name,current_room,current_grade_level\n1234567890123,01012555,66001,ด.ช.,สมชาย,ใจดี,ป.3/2,ป.3' },
                                        { id: 'teachers', title: 'ข้อมูลครูและบุคลากร', desc: 'ข้อมูลครู บุคลากร บทบาท และหน้าที่ที่ได้รับมอบหมาย', template: 'citizen_id,dob,prefix,first_name,last_name,role\n1234567890123,01012540,นาย,สมชาย,ใจดี,teacher' },
                                        { id: 'subjects', title: 'ข้อมูลวิชา', desc: 'วิชาที่สถานศึกษาเปิดสอนในแต่ละปีการศึกษาและภาคเรียน', template: 'academic_year,semester,subject_name,grade_level,subject_group,teacher_citizen_id\n2569,1,ภาษาไทย,ป.1,ภาษาไทย,เลขบัตรประชาชนครู 13 หลัก' },
                                        { id: 'enrollments', title: 'ข้อมูลกลุ่มเรียน', desc: 'ข้อมูลการจัดนักเรียนเข้าชั้นเรียนและวิชา', template: 'student_citizen_id,subject_name,room\nเลขบัตรปชช_นร_13หลัก,ความสามารถพื้นฐานด้านการเรียนรู้,ป.1/1' },
                                        { id: 'learning_outcomes', title: 'ผลลัพธ์การเรียนรู้ (LO)', desc: 'ผลลัพธ์การเรียนรู้ตามหลักสูตรสถานศึกษาที่ใช้เชื่อมโยงกับรูปแบบการจัดการเรียนรู้', template: 'lo_code,ability_no,level_group,competency_area,lo_description\nSCH-P1-LO-03,3,ป.ต้น,ความสามารถด้านการคิดคำนวณ,ใช้จำนวนนับ การบวก และการลบเพื่อแก้ปัญหาใกล้ตัว พร้อมอธิบายวิธีคิดได้' },
                                        { id: 'behaviors', title: 'คำบรรยายระดับความสามารถ', desc: 'คำบรรยายพฤติกรรมสำหรับแต่ละระดับความสามารถ', template: 'competency_area,competency_level,behavior_text\nความสามารถด้านการคิดคำนวณ,พัฒนา,ปฏิบัติได้ในสถานการณ์ที่คุ้นเคยเมื่อได้รับคำชี้แนะบางส่วน และเริ่มตรวจสอบงานของตน' },
                                        { id: 'yearly_competencies', title: 'ความคาดหวังรายชั้นปี (ปพ.๖)', desc: 'กำหนดระดับความสามารถที่คาดหวังในแต่ละชั้น', template: 'grade_level,competency_no,description,expected_level\nป.1,1,เข้าใจความหมายของคำ...,พัฒนา\nป.1,2,เขียนประโยคง่ายๆ...,พัฒนา' },
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
                                                        const sampleRow = card.template.split('\n')[1]?.split(',') || [];
                                                        XLSX.utils.sheet_add_aoa(ws, [headers, sampleRow], { origin: 'A1' });
                                                        // Format citizen_id and dob columns as Text to prevent Excel scientific notation
                                                        const textCols = ['citizen_id', 'dob', 'student_code'];
                                                        headers.forEach((h, colIdx) => {
                                                            if (textCols.includes(h.trim())) {
                                                                const colLetter = XLSX.utils.encode_col(colIdx);
                                                                if (!ws['!cols']) ws['!cols'] = [];
                                                                ws['!cols'][colIdx] = { wch: 18 };
                                                                // Mark sample cell as text
                                                                const cellAddr = colLetter + '2';
                                                                if (ws[cellAddr]) ws[cellAddr].t = 's';
                                                            }
                                                        });
                                                        const wb = XLSX.utils.book_new();
                                                        XLSX.utils.book_append_sheet(wb, ws, 'data');
                                                        XLSX.writeFile(wb, `แม่แบบ_${card.id}.xlsx`);
                                                    }}
                                                    className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                                >
                                                    <Download className="w-4 h-4 group-hover/btn:-translate-y-1 transition-transform" />
                                                    <span>ไฟล์ Excel แม่แบบ (.xlsx)</span>
                                                </button>
                                                <label className="flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-700 px-3 text-sm font-bold text-white hover:bg-indigo-800">
                                                    <Upload className="w-4 h-4 group-hover/btn2:-translate-y-1 transition-transform" />
                                                    <span>อัปโหลดข้อมูล</span>
                                                    <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFileUpload(e, card.id)} />
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* --- TAB 3: SUBJECT - LO MAPPING --- */}
                        {activeTab === 'mapping' && (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                                <div className="mb-6 border-b border-slate-100 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-extrabold text-slate-800 flex items-center"><LinkIcon className="w-6 h-6 mr-3 text-indigo-500" /> กำหนดผลลัพธ์การเรียนรู้ของวิชา</h2>
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
                                    ) : allLOs.length === 0 ? (
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
                                                {allLOs.map(lo => {
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
                                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center mb-2"><Users className="w-6 h-6 mr-3 text-indigo-500" /> จัดนักเรียนเข้ากลุ่มเรียน</h2>
                                    <p className="text-slate-600 text-sm">เลือกวิชา จากนั้นเพิ่มนักเรียนเป็นรายคนหรือเพิ่มพร้อมกันทั้งห้อง</p>
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
                                                .select('*, users_students(*)')
                                                .eq('subject_id', e.target.value);
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
                                                                        { student_id: st.student_id, subject_id: enrollSubject, room: enrollRoom }
                                                                    ]).select('*, users_students(*)');
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
                                                        room: enrollRoom
                                                    }));
                                                    const { error } = await supabase.from('student_enrollments').insert(payload);
                                                    if (error) {
                                                        toast.error('เพิ่มไม่สำเร็จ: ' + error.message, { id: 'bulk_en' });
                                                    } else {
                                                        toast.success(`จัดนักเรียนเข้ารายวิชาแล้ว ${newStudents.length} คน จากห้อง ${enrollRoom}`, { id: 'bulk_en' });
                                                        // Reload enrollments (paginated)
                                                        const reloaded = await fetchAllRows((from, to) =>
                                                            supabase.from('student_enrollments')
                                                                .select('*, users_students(*)')
                                                                .eq('subject_id', enrollSubject)
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
                                <div className="mb-6 border-b border-slate-100 pb-6">
                                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center mb-2"><CheckCircle className="w-6 h-6 mr-3 text-emerald-500" /> ความก้าวหน้าการประเมินผลรายวิชา</h2>
                                    <p className="text-slate-500 font-medium text-sm">ติดตามความครบถ้วนของการประเมิน จำแนกตามครูผู้สอนและรายวิชา</p>
                                    <button
                                        onClick={async () => {
                                            setLoadingProgress(true);
                                            try {
                                                // Load all subjects with teacher info
                                                const { data: subs } = await supabase
                                                    .from('subjects')
                                                    .select('subject_id, subject_name, grade_level, semester, academic_year, teacher_id, users_teachers(prefix, first_name, last_name)')
                                                    .eq('school_id', currentUser.school_id)
                                                    .order('academic_year', { ascending: false });

                                                const subjectIds = (subs || []).map(s => s.subject_id);
                                                if (subjectIds.length === 0) { setEvalProgress([]); setLoadingProgress(false); return; }

                                                // Load enrollments
                                                const { data: enrolls } = await supabase
                                                    .from('student_enrollments')
                                                    .select('enrollment_id, subject_id')
                                                    .in('subject_id', subjectIds);

                                                // Load LO mappings
                                                const { data: loMaps } = await supabase
                                                    .from('subject_lo_mapping')
                                                    .select('subject_id, lo_id')
                                                    .in('subject_id', subjectIds);

                                                // Load evaluations
                                                const enrollIds = (enrolls || []).map(e => e.enrollment_id);
                                                let evals = [];
                                                if (enrollIds.length > 0) {
                                                    const { data } = await supabase
                                                        .from('lo_evaluations')
                                                        .select('enrollment_id, lo_id')
                                                        .in('enrollment_id', enrollIds);
                                                    evals = data || [];
                                                }

                                                // Calculate per subject
                                                const progress = (subs || []).map(sub => {
                                                    const subEnrolls = (enrolls || []).filter(e => e.subject_id === sub.subject_id);
                                                    const subLOs = (loMaps || []).filter(m => m.subject_id === sub.subject_id);
                                                    const totalCells = subEnrolls.length * subLOs.length;
                                                    const subEnrollIds = subEnrolls.map(e => e.enrollment_id);
                                                    const subLoIds = subLOs.map(l => l.lo_id);
                                                    const filled = evals.filter(ev =>
                                                        subEnrollIds.includes(ev.enrollment_id) && subLoIds.includes(ev.lo_id)
                                                    ).length;
                                                    const pct = totalCells > 0 ? Math.round((filled / totalCells) * 100) : 0;
                                                    const teacher = sub.users_teachers;
                                                    return {
                                                        ...sub,
                                                        teacherName: teacher ? `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}` : 'ยังไม่มอบหมาย',
                                                        studentCount: subEnrolls.length,
                                                        loCount: subLOs.length,
                                                        totalCells,
                                                        filledCells: filled,
                                                        percent: pct
                                                    };
                                                });

                                                setEvalProgress(progress);
                                            } catch (err) {
                                                toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
                                            } finally {
                                                setLoadingProgress(false);
                                            }
                                        }}
                                        className="mt-4 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                                    >
                                        <CheckCircle className="w-4 h-4" />
                                        แสดงสถานะล่าสุด
                                    </button>
                                </div>

                                {loadingProgress ? (
                                    <div className="py-24 flex justify-center"><div className="loader scale-150"></div></div>
                                ) : evalProgress.length === 0 ? (
                                    <div className="text-center py-20 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        เลือก “แสดงสถานะล่าสุด” เพื่อดูความก้าวหน้าของทุกวิชา
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {/* Summary bar */}
                                        <div className="grid grid-cols-3 gap-4 mb-6">
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
                                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center mb-2"><ArrowUpCircle className="w-6 h-6 mr-3 text-indigo-500" /> เลื่อนชั้นและจัดห้องเรียนสำหรับปีการศึกษาถัดไป</h2>
                                    <p className="text-slate-500 font-medium text-sm">ปรับระดับชั้นและห้องเรียนของนักเรียนเป็นกลุ่มเมื่อสิ้นสุดปีการศึกษา</p>
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
                                                            .select('*')
                                                            .eq('school_id', currentUser.school_id)
                                                            .eq('current_room', promoFromRoom.trim())
                                                            .order('student_code');
                                                        if (error) throw error;
                                                        if (data.length === 0) toast.error('ไม่พบนักเรียนในห้องนี้');
                                                        else toast.success(`พบนักเรียน ${data.length} คน`);
                                                        setPromoStudents(data || []);
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
                                                disabled={promoStudents.length === 0 || !promoToGrade || !promoToRoom}
                                                onClick={async () => {
                                                    if (!window.confirm(`ยืนยันการเปลี่ยนนักเรียนทั้ง ${promoStudents.length} คน ไปยังชั้น ${promoToGrade} ห้อง ${promoToRoom} หรือไม่?`)) return;
                                                    try {
                                                        const { error } = await supabase
                                                            .from('users_students')
                                                            .update({ current_grade_level: promoToGrade.trim(), current_room: promoToRoom.trim() })
                                                            .in('student_id', promoStudents.map(s => s.student_id));
                                                        if (error) throw error;
                                                        toast.success('บันทึกการเลื่อนชั้นและจัดห้องเรียนแล้ว');
                                                        setPromoStudents([]);
                                                        setPromoFromRoom('');
                                                        setPromoToGrade('');
                                                        setPromoToRoom('');
                                                    } catch (err) {
                                                        toast.error('บันทึกไม่สำเร็จ: ' + err.message);
                                                    }
                                                }}
                                                className="w-full mt-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                บันทึกการเลื่อนชั้น ({promoStudents.length} คน)
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {promoStudents.length > 0 && (
                                    <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden">
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 font-bold text-slate-700 flex justify-between items-center">
                                            <span>รายชื่อนักเรียนที่กำหนดให้เลื่อนชั้น</span>
                                            <span className="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-lg">พบ {promoStudents.length} คน</span>
                                        </div>
                                        <div className="max-h-80 overflow-y-auto">
                                            <table className="w-full text-left text-sm whitespace-nowrap">
                                                <thead className="bg-white sticky top-0 border-b border-slate-100">
                                                    <tr className="text-slate-500">
                                                        <th className="px-4 py-2 font-medium w-16 text-center">ลำดับ</th>
                                                        <th className="px-4 py-2 font-medium w-32">รหัสนักเรียน</th>
                                                        <th className="px-4 py-2 font-medium">ชื่อ-นามสกุล</th>
                                                        <th className="px-4 py-2 font-medium">ชั้นปัจจุบัน</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                    {promoStudents.map((s, i) => (
                                                        <tr key={s.student_id} className="hover:bg-slate-50">
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
