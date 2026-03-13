import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { Settings, Users, Upload, Link as LinkIcon, Download, Trash2, Edit, Save, Plus, X, Search, FileText, LayoutDashboard, GraduationCap, CheckCircle, BookOpen, FileBarChart2, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { hashPassword } from '../lib/auth';

export default function AdminDashboard() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('data');

    // Stats for Dashboard Overview
    const [stats, setStats] = useState({ students: 0, teachers: 0, subjects: 0 });

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

    // Load common base data & stats
    useEffect(() => {
        if (!currentUser) return;
        
        supabase.from('subjects').select('*').eq('school_id', currentUser.school_id)
            .then(({ data }) => {
                setSubjects(data || []);
                setStats(prev => ({ ...prev, subjects: data?.length || 0 }));
            });
            
        supabase.from('users_students').select('*').eq('school_id', currentUser.school_id)
            .then(({ data }) => {
                setAllStudents(data || []);
                setStats(prev => ({ ...prev, students: data?.length || 0 }));
            });

        supabase.from('users_teachers').select('teacher_id', { count: 'exact', head: true })
            .eq('school_id', currentUser.school_id)
            .then(({ count }) => {
                setStats(prev => ({ ...prev, teachers: count || 0 }));
            });
    }, [currentUser]);

    // --- DATA MANAGEMENT ---
    const loadTableData = async (table, page = 1) => {
        if (table !== selectedTable) {
            setSearchTerm(''); // Clear search when switching tables
            setCurrentPage(1);
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
            if (['users_students', 'users_teachers', 'subjects'].includes(table)) {
                query = query.eq('school_id', currentUser.school_id);
            }
            if (table === 'learning_outcomes') query.order('ability_no', { ascending: true });
            else if (table === 'users_students') query.order('student_code', { ascending: true });
            else query.order('created_at', { ascending: false });

            const { data, count, error } = await query.range(from, to);
            if (error) throw error;
            
            setTableData(data || []);
            setTotalPages(Math.ceil((count || 0) / limit) || 1);
            setCurrentPage(page);
        } catch (err) {
            toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
        } finally {
            setLoadingData(false);
        }
    };

    const handleDelete = async (idValue, idCol) => {
        if (!window.confirm('ยืนยันระบบลบข้อมูลนี้ทิ้ง? (หากมีคะแนนประเมินผูกอยู่จะไม่สามารถลบได้)')) return;
        try {
            const { error } = await supabase.from(selectedTable).delete().eq(idCol, idValue);
            if (error) throw error;
            toast.success('ลบข้อมูลสำเร็จ');
            loadTableData(selectedTable);
        } catch (err) {
            toast.error('ลบไม่สำเร็จ: ' + err.message);
        }
    };

    const handleUpdate = async (idValue, idCol, updatedObj) => {
        try {
            const payload = { ...updatedObj };
            if (payload.new_password) {
                payload.password_hash = await hashPassword(payload.new_password.toString().trim());
                delete payload.new_password;
            }

            const { error } = await supabase.from(selectedTable).update(payload).eq(idCol, idValue);
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
    // Fix Excel scientific notation: 1.43E+12 → "1429900127280"
    // Fix decimal suffix: 1234567890123.00 → "1234567890123"
    const sanitizeCitizenId = (raw) => {
        if (!raw && raw !== 0) return '';
        let s = String(raw).trim();
        // Handle scientific notation (e.g. 1.43E+12)
        if (/[eE]/.test(s)) {
            const n = parseFloat(s);
            if (!isNaN(n)) s = Math.round(n).toString();
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
                    const workbook = XLSX.read(e.target.result, { type: 'array', cellText: true, cellDates: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    // Use raw:false so numbers stay as formatted strings (prevents scientific notation)
                    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
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
            const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

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
            for (let i = 0; i < rawRows.slice(2).length; i++) {
                const row = rawRows.slice(2)[i];
                if (!row || row.every(c => !String(c).trim())) continue;
                const cleanId = sanitizeCitizenId(String(row[COL.CITIZEN] || '').replace(/^'+/, ''));
                const dobStr = parseDMCDob(row[COL.DOB]);
                const fname = String(row[COL.FNAME] || '').trim();
                const lname = String(row[COL.LNAME] || '').trim();
                const prefix = prefixMap[String(row[COL.PREFIX] || '').trim()] || String(row[COL.PREFIX] || '').trim();
                const code = String(row[COL.CODE] || '').trim().replace(/\.0+$/, '');
                const errs = [];
                if (cleanId.length !== 13) errs.push(`citizen_id "${row[COL.CITIZEN]}" ไม่ใช่ 13 หลัก (${cleanId.length})`);
                if (!dobStr) errs.push(`วันเกิด "${row[COL.DOB]}" ไม่ถูกต้อง`);
                if (!fname) errs.push('ไม่มีชื่อ');
                if (errs.length > 0) invalidRows.push({ row: i + 3, name: `${fname} ${lname}`, errors: errs });
                else validRows.push({ citizen_id: cleanId, dob: dobStr, student_code: code, prefix, first_name: fname, last_name: lname });
            }

            if (validRows.length === 0) { toast.error(`ไม่มีแถวที่ถูกต้อง (${invalidRows.length} แถวผิด)`, { id: 'dmc' }); return; }
            if (invalidRows.length > 0) { toast.error(`⚠️ ข้ามแถวผิด ${invalidRows.length} แถว`); console.warn('[DMC Invalid]', invalidRows); }

            const payload = await Promise.all(validRows.map(async r => ({
                school_id: currentUser.school_id, citizen_id: r.citizen_id,
                password_hash: await hashPassword(r.dob),
                student_code: r.student_code || null, prefix: r.prefix,
                first_name: r.first_name, last_name: r.last_name, student_status: 'active',
            })));

            const { error } = await supabase.from('users_students').upsert(payload, { onConflict: 'citizen_id' });
            if (error) throw error;
            const { data: updated } = await supabase.from('users_students').select('*').eq('school_id', currentUser.school_id);
            setAllStudents(updated || []);
            setStats(prev => ({ ...prev, students: updated?.length || 0 }));
            toast.success(`นำเข้าจาก DMC สำเร็จ! ${payload.length} คน`, { id: 'dmc' });
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
                            toast.error(`⚠️ ข้ามแถวที่ไม่ถูกต้อง ${invalidRows.length} แถว (ดูรายละเอียดใน Console)`);
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
                            toast.error(`⚠️ ข้ามแถวที่ไม่ถูกต้อง ${invalidRows.length} แถว (ดูรายละเอียดใน Console)`);
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
                        let tempPayload = data.map(s => ({
                            school_id: currentUser.school_id, academic_year: parseInt(s.academic_year) || 2567,
                            semester: parseInt(s.semester) || 1,
                            subject_name: s.subject_name?.trim(), grade_level: s.grade_level?.trim(),
                            subject_group: s.subject_group?.trim() || null, teacher_id: s.teacher_id?.trim() || null
                        }));
                        
                        // ป้องกันข้อมูลซ้ำ (ชื่อวิชา_ปี_เทอม)
                        const existingSet = new Set(subjects.map(s => `${s.subject_name}_${s.academic_year}_${s.semester}`));
                        payload = tempPayload.filter(p => !existingSet.has(`${p.subject_name}_${p.academic_year}_${p.semester}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('subjects').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลรายวิชาซ้ำกับที่มีอยู่ในระบบทั้งหมด', { id: 'csv' });
                            return;
                        }
                    }
                    else if (importType === 'enrollments') {
                        let tempPayload = data.map(e => ({ student_id: e.student_id?.trim(), subject_id: e.subject_id?.trim(), room: e.room?.trim() }));
                        
                        // ดึงข้อมูลการลงทะเบียนทั้งหมดมาเทียบ
                        const { data: existingEn } = await supabase.from('student_enrollments').select('student_id, subject_id');
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
                            lo_code: l.lo_code?.trim(), ability_no: parseInt(l.ability_no), level_group: l.level_group?.trim(),
                            competency_area: l.competency_area?.trim(), lo_description: l.lo_description?.trim()
                        }));
                        
                        // เซ็คซ้ำ (lo_code และ ability_no)
                        const { data: existingLO } = await supabase.from('learning_outcomes').select('lo_code, ability_no');
                        const existingSet = new Set((existingLO || []).map(l => `${l.lo_code}_${l.ability_no}`));
                        
                        payload = tempPayload.filter(p => !existingSet.has(`${p.lo_code}_${p.ability_no}`));

                        if (payload.length > 0) {
                            const { error } = await supabase.from('learning_outcomes').insert(payload);
                            if (error) throw error;
                        } else {
                            toast.error('ข้อมูลสมรรถนะ (LO) ซ้ำกับที่มีอยู่ในระบบทั้งหมด', { id: 'csv' });
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
                        const { data: updatedStudents } = await supabase.from('users_students').select('*').eq('school_id', currentUser.school_id);
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
                supabase.from('learning_outcomes').select('*').order('ability_no', { ascending: true }),
                supabase.from('subject_lo_mapping').select('lo_id').eq('subject_id', subjectId)
            ]);
            setAllLOs(los || []);
            setMappedLOs((mapped || []).map(m => m.lo_id));
        } catch (err) {
            toast.error('ดึงข้อมูล LO ไม่สำเร็จ: ' + err.message);
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
            toast.success('บันทึกการผูก LO สำเร็จ');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            setSavingMapping(false);
        }
    };

    return (
        <Layout title="ระบบจัดการฐานข้อมูล (Admin Dashboard)">
            {/* Overview Stats Dashboard */}
            <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-3xl p-6 text-white shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-indigo-100 font-medium mb-1">นักเรียนทั้งหมด</p>
                        <h3 className="text-4xl font-extrabold">{stats.students.toLocaleString()} <span className="text-lg font-normal">คน</span></h3>
                    </div>
                    <div className="bg-white/20 p-4 rounded-2xl"><Users className="w-8 h-8" /></div>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl p-6 text-white shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-blue-100 font-medium mb-1">บุคลากรครู</p>
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
                <div className="mb-8 bg-white rounded-3xl border border-amber-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-4 border-b border-amber-100 flex items-center gap-3">
                        <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 text-base font-extrabold shrink-0">🚀</div>
                        <div>
                            <p className="font-extrabold text-amber-900 text-sm">เริ่มต้นใช้งาน CBE Track</p>
                            <p className="text-xs text-amber-600 font-medium">ทำตามขั้นตอนด้านล่างให้ครบเพื่อเริ่มระบบประเมินผล</p>
                        </div>
                    </div>
                    <div className="p-6">
                        <div className="space-y-3">
                            {[
                                {
                                    step: 1,
                                    done: stats.teachers > 0,
                                    label: 'นำเข้าข้อมูลครู',
                                    desc: `${stats.teachers > 0 ? `มีครูในระบบ ${stats.teachers} คนแล้ว` : 'ยังไม่มีครูในระบบ'}`,
                                    action: () => setActiveTab('import'),
                                    actionLabel: 'ไปนำเข้าครู →'
                                },
                                {
                                    step: 2,
                                    done: stats.students > 0,
                                    label: 'นำเข้าข้อมูลนักเรียน',
                                    desc: `${stats.students > 0 ? `มีนักเรียนในระบบ ${stats.students} คนแล้ว` : 'ยังไม่มีนักเรียนในระบบ'}`,
                                    action: () => setActiveTab('import'),
                                    actionLabel: 'ไปนำเข้านักเรียน →'
                                },
                                {
                                    step: 3,
                                    done: stats.subjects > 0,
                                    label: 'สร้างรายวิชาและผูก LO',
                                    desc: `${stats.subjects > 0 ? `มีรายวิชา ${stats.subjects} วิชาแล้ว` : 'ยังไม่มีรายวิชาในระบบ'}`,
                                    action: () => setActiveTab('import'),
                                    actionLabel: 'ไปสร้างรายวิชา →'
                                },
                                {
                                    step: 4,
                                    done: stats.subjects > 0 && stats.students > 0,
                                    label: 'จัดนักเรียนเข้าห้องเรียน/รายวิชา',
                                    desc: 'เชื่อมนักเรียนเข้ากับรายวิชาที่ต้องการ',
                                    action: () => setActiveTab('enrollment'),
                                    actionLabel: 'ไปจัดนักเรียน →'
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
            <div className="mb-8">
                <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest mb-4">📊 รายงานภาพรวมวิชาการ (สำหรับ Admin เท่านั้น)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => navigate('/admin/report-lo')}
                        className="group flex items-center gap-4 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-2xl p-5 text-left transition-all shadow-sm hover:shadow-md"
                    >
                        <div className="w-12 h-12 bg-indigo-100 group-hover:bg-indigo-600 rounded-2xl flex items-center justify-center transition-colors">
                            <FileBarChart2 className="w-6 h-6 text-indigo-600 group-hover:text-white transition-colors" />
                        </div>
                        <div>
                            <p className="font-extrabold text-slate-800">ตารางที่ 2 — ภาพรวม LO รายผลลัพธ์</p>
                            <p className="text-sm text-slate-500 mt-0.5">รายงานผลลัพธ์การเรียนรู้ระดับรายผลลัพธ์การเรียนกับรายวิชาที่ผูกไว้ทั้งหมด</p>
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
                            <p className="font-extrabold text-slate-800">ตารางที่ 3 — ภาพรวมรายด้านความสามารถ</p>
                            <p className="text-sm text-slate-500 mt-0.5">รายงานผลการประเมินรายด้านความสามารถของนักเรียนทุกรายวิชาที่ผูกไว้</p>
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
                        <div className="w-12 h-12 bg-teal-100 group-hover:bg-teal-600 rounded-2xl flex items-center justify-center transition-colors text-xl">
                            🎓
                        </div>
                        <div>
                            <p className="font-extrabold text-slate-800">รายงานผลการเรียนจบช่วงชั้น</p>
                            <p className="text-sm text-slate-500 mt-0.5">บันทึกและพิมพ์ผลจบช่วงชั้นตอนต้น (ป.1–ป.3) / ตอนปลาย (ป.4–ป.6)</p>
                        </div>
                    </button>
                </div>
            </div>


            <div className="lg:flex gap-8 mb-10">
                {/* Modern Sidebar Navigation */}
                <div className="w-full lg:w-64 flex-shrink-0 mb-6 lg:mb-0">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-3 flex flex-row lg:flex-col overflow-x-auto gap-2 lg:sticky lg:top-24">
                        {[
                            { id: 'data', label: 'จัดการข้อมูลดิบ', icon: Search },
                            { id: 'import', label: 'ฟอร์มนำเข้าข้อมูล', icon: Upload },
                            { id: 'mapping', label: 'ผูกมาตรฐาน (LO)', icon: LinkIcon },
                            { id: 'enrollment', label: 'จัดผู้เรียนเข้าห้อง', icon: Users }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-3 px-5 py-4 rounded-2xl transition-all font-bold whitespace-nowrap ${
                                    activeTab === tab.id 
                                    ? 'bg-slate-900 text-white shadow-md' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                            >
                                <tab.icon className="w-5 h-5 flex-shrink-0" />
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 bg-transparent min-w-0">
                    <div className="animate-in fade-in slide-in-from-right-8 duration-500">

                        {/* --- TAB 1: DATA TABLE --- */}
                        {activeTab === 'data' && (
                            <div className="bg-white p-1 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
                                <h2 className="text-xl font-extrabold text-slate-800 mb-6 flex items-center px-4 sm:px-0"><Search className="w-5 h-5 mr-3 text-indigo-500" /> ตารางฐานข้อมูลในระบบ (Database Tables)</h2>
                                
                                <div className="flex flex-col md:flex-row gap-4 mb-6 px-4 sm:px-0">
                                    <select
                                        value={selectedTable}
                                        onChange={(e) => loadTableData(e.target.value)}
                                        className="w-full md:w-64 bg-slate-50 border border-slate-200 text-slate-700 py-3.5 px-4 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none shadow-inner"
                                    >
                                        <option value="" disabled>- เลือกตาราง -</option>
                                        <option value="users_students">👨‍🎓 นักเรียน (Students)</option>
                                        <option value="users_teachers">👩‍🏫 ครู (Teachers)</option>
                                        <option value="subjects">📚 รายวิชา (Subjects)</option>
                                        <option value="learning_outcomes">🎯 สมรรถนะ (Learning Outcomes)</option>
                                        <option value="behavior_templates">💬 คำอธิบายพฤติกรรม</option>
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
                                        {loadingData ? <div className="loader w-5 h-5 !border-2 !border-indigo-600 !border-t-transparent" /> : 'รีเฟรช'}
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
                                                    {Object.keys(filteredTableData[0]).filter(k => !['password_hash', 'plain_password', 'school_id'].includes(k)).map(key => (
                                                        <th key={key} className="px-5 py-4 font-extrabold border-b border-slate-200">{key}</th>
                                                    ))}
                                                    <th className="px-5 py-4 font-extrabold w-40 text-center border-b border-slate-200 sticky right-0 bg-slate-100 shadow-[-4px_0_10px_rgba(0,0,0,0.02)]">✏️ จัดการ</th>
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

                                                    const isEditing = editingRow?.id === idValue;

                                                    return (
                                                    <tr key={idx} className="hover:bg-slate-50 py-2 group transition-colors">
                                                        <td className="px-5 py-3 text-center text-slate-400 font-medium">{idx + 1}</td>
                                                    {Object.keys(row).filter(k => !['password_hash', 'plain_password', 'school_id'].includes(k)).map(key => (
                                                        <td key={key} className="px-5 py-3 text-slate-700 max-w-[200px] truncate">
                                                            {isEditing ? (
                                                                <input
                                                                    className="border-2 border-indigo-400 rounded-lg px-3 py-1.5 w-full bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-indigo-900"
                                                                    value={editingRow.data[key] || ''}
                                                                    onChange={(e) => setEditingRow({ ...editingRow, data: { ...editingRow.data, [key]: e.target.value } })}
                                                                />
                                                            ) : (
                                                                <span className={key === 'new_password' ? 'font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded' : ''}>
                                                                    {row[key]?.toString() || '-'}
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
                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                <div className="mb-8">
                                    <h2 className="text-xl font-extrabold text-slate-800 mb-2 flex items-center"><Upload className="w-6 h-6 mr-3 text-indigo-500" /> นำเข้าข้อมูลแบบรวดเร็ว (Bulk Upload)</h2>
                                    <p className="text-slate-500 font-medium">ดาวน์โหลดแม่แบบ Excel ไปกรอกข้อมูล แล้วนำกลับมาอัปโหลดที่นี่</p>
                                </div>

                                {/* 🏫 DMC Import Card (Prominent) */}
                                <div className="mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-indigo-300 rounded-3xl p-6">
                                    <div className="flex flex-col md:flex-row md:items-start gap-5 mb-5 md:mb-0">
                                        <div className="flex items-start gap-4 flex-1">
                                            <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shrink-0 text-white text-3xl shadow-md border-b-4 border-indigo-800">🏫</div>
                                            <div>
                                                <h3 className="font-extrabold text-xl text-indigo-900">นำเข้านักเรียนจากระบบ DMC โดยตรง</h3>
                                                <p className="text-sm text-indigo-700 font-medium mt-1 leading-relaxed">รองรับไฟล์ Excel <span className="font-bold">(.xlsx, .xls)</span> ที่ส่งออกจากระบบ DMC <br className="hidden md:block" />โดยระบบจะจัดรูปแบบวันเกิดให้สามารถใช้เป็นรหัสผ่านได้ทันที</p>
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {['เลขประจำตัว → citizen_id', 'วันเกิดในรูปแบบ พ.ศ. → รหัสผ่าน', 'รหัสนักเรียน', 'ชื่อ/สกุล'].map(t => (
                                                        <span key={t} className="text-xs bg-white/70 border border-indigo-200 text-indigo-800 font-bold px-3 py-1.5 rounded-full shadow-sm">✓ {t}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <label className="md:self-center shrink-0 flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-8 py-5 rounded-2xl font-extrabold text-[15px] cursor-pointer shadow-lg transition-all w-full md:w-auto transform hover:-translate-y-1">
                                            <Upload className="w-6 h-6" />
                                            อัปโหลดไฟล์ Excel ของ DMC
                                            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleDMCImport} />
                                        </label>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                                    {[
                                        { id: 'students', title: '1. ข้อมูลนักเรียน (Students)', desc: 'รายชื่อนักเรียนทั้งหมดในโรงเรียน', template: 'citizen_id,dob,student_code,prefix,first_name,last_name\n1234567890123,01012555,66001,ด.ช.,สมชาย,ใจดี' },
                                        { id: 'teachers', title: '2. ข้อมูลครู (Teachers)', desc: 'รายชื่อครูและบุคลากรในโรงเรียน', template: 'citizen_id,dob,prefix,first_name,last_name,role\n1234567890123,01012540,นาย,สมชาย,ใจดี,teacher' },
                                        { id: 'subjects', title: '3. ข้อมูลรายวิชา (Subjects)', desc: 'รายวิชาที่เปิดสอนเพื่อออก ปพ.๖', template: 'academic_year,semester,subject_name,grade_level,subject_group,teacher_id\n2569,1,ความสามารถพื้นฐานด้านการเรียนรู้,ป.1,ความสามารถพื้นฐานด้านการเรียนรู้,id-ครู' },
                                        { id: 'enrollments', title: '4. จัดประชากรเข้าห้องเรียน (Enrollments)', desc: 'ระบบจะนำนักเรียนไปอยู่ในวิชาที่เลือก', template: 'student_id,subject_id,room\nid-นักเรียน,id-วิชา,ป.1/1' },
                                        { id: 'learning_outcomes', title: '5. คลังสมรรถนะ (LO)', desc: 'คำอธิบายรายวิชา (LO) ทั้งหมด', template: 'lo_code,ability_no,level_group,competency_area,lo_description\nM1,1,ป.ต้น,การคิดคำนวณ,ผู้เรียนสามารถบวก ลบ เลขได้' },
                                        { id: 'behaviors', title: '6. คลังพฤติกรรม (Behaviors)', desc: 'มาตรฐานการประเมินพฤติกรรม', template: 'competency_area,competency_level,behavior_text\nการคิดคำนวณ,พัฒนา,เข้าใจตัวเลขได้บ้างต้องพยายามอีกนิด' },
                                        { id: 'yearly_competencies', title: '7. ความคาดหวังรายชั้นปี (ปพ.๖)', desc: 'กำหนดระดับความสามารถที่คาดหวังในแต่ละชั้น', template: 'grade_level,competency_no,description,expected_level\nป.1,1,เข้าใจความหมายของคำ...,พัฒนา\nป.1,2,เขียนประโยคง่ายๆ...,พัฒนา' },
                                        { id: 'yearly_behavior_templates', title: '8. คลังพฤติกรรมรายชั้นปี (ปพ.๖)', desc: 'พฤติกรรมเปรียบเทียบในแต่ละระดับแยกตามข้อ', template: 'grade_level,competency_no,competency_level,behavior_text\nป.1,1,เริ่มต้น,เด็กชายสนใจ เข้าใจความหมาย...\nป.1,1,ชำนาญ,เด็กชายสนใจ เขียนประโยค...' }
                                    ].map(card => (
                                        <div key={card.id} className="bg-slate-50 border border-slate-200 rounded-3xl p-6 hover:shadow-lg transition-all group flex flex-col">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <h3 className="font-extrabold text-lg text-slate-800">{card.title}</h3>
                                                    <p className="text-sm text-slate-500 font-medium mt-1">{card.desc}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-6 border-t border-slate-200">
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
                                                    className="flex-1 bg-white border-2 border-slate-300 hover:border-indigo-600 hover:text-indigo-600 text-slate-600 px-4 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 group/btn"
                                                >
                                                    <Download className="w-4 h-4 group-hover/btn:-translate-y-1 transition-transform" />
                                                    <span>ไฟล์ Excel แม่แบบ (.xlsx)</span>
                                                </button>
                                                <label className="flex-1 bg-slate-900 hover:bg-black border-2 border-slate-900 hover:border-black text-white px-4 py-3 rounded-2xl font-bold text-sm cursor-pointer shadow-md transition-all flex items-center justify-center gap-2 relative overflow-hidden group/btn2">
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
                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                                <div className="mb-6 border-b border-slate-100 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h2 className="text-xl font-extrabold text-slate-800 flex items-center"><LinkIcon className="w-6 h-6 mr-3 text-indigo-500" /> ผูกโครงสร้างรายวิชาและสมรรถนะ (Mapping)</h2>
                                        <p className="text-slate-500 font-medium mt-1 text-sm">เลือกลายวิชาแล้วติ๊กเลือกสมรรถนะที่ต้องการจัดการประเมินในเทอมนี้</p>
                                    </div>
                                    <div className="w-full md:w-1/3">
                                        <select
                                            value={mappingSubject}
                                            onChange={(e) => loadMappingData(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-3 px-4 rounded-xl focus:ring-2 focus:ring-indigo-400 font-extrabold outline-none"
                                        >
                                            <option value="" disabled>- โปรดเลือกลายวิชาเพื่อจัดการ -</option>
                                            {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_name} ({s.grade_level}) เทอม {s.semester}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="min-h-[400px]">
                                    {loadingMapping ? (
                                        <div className="py-20 flex justify-center"><div className="loader scale-125"></div></div>
                                    ) : !mappingSubject ? (
                                        <div className="text-center py-24 text-slate-400 font-medium flex flex-col items-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                            <FileText className="w-16 h-16 text-slate-200 mb-4" />
                                            กรุณาเลือกรายวิชาที่ช่องตัวเลือกด้านบนขวา
                                        </div>
                                    ) : allLOs.length === 0 ? (
                                        <div className="text-center py-10 text-red-500 bg-red-50 rounded-2xl border border-red-100 font-bold">ไม่พบคลัง LO ในระบบ กรุณานำเข้าก่อน</div>
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
                                                    บันทึกโครงสร้างรายวิชานี้
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                                {allLOs.map(lo => {
                                                    const isChecked = mappedLOs.includes(lo.lo_id);
                                                    return (
                                                        <label key={lo.lo_id} className={`flex items-start p-5 rounded-2xl border bg-white transition-all cursor-pointer ${isChecked ? 'border-indigo-500 ring-2 ring-indigo-100 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
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
                            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm min-h-[500px]">
                                <div className="mb-6 border-b border-slate-100 pb-6">
                                    <h2 className="text-xl font-extrabold text-slate-800 flex items-center mb-2"><Users className="w-6 h-6 mr-3 text-indigo-500" /> จัดผู้เรียนเข้าห้องสอบ/รายวิชา (Enrollments)</h2>
                                    <p className="text-slate-500 font-medium text-sm">เลือกลายวิชาเพื่อดูรายชื่อนักเรียน นำเข้า หรือนำออกจากการประเมินในวิชานี้</p>
                                </div>

                                <div className="flex flex-col lg:flex-row gap-4 mb-8 bg-slate-50 p-4 rounded-2xl border border-slate-100">
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
                                        <option value="" disabled>- 1. เลือกรายวิชาต้นทาง -</option>
                                        {subjects.map(s => (
                                            <option key={s.subject_id} value={s.subject_id}>{s.subject_name} ({s.grade_level}) เทอม {s.semester}</option>
                                        ))}
                                    </select>

                                    <div className="flex flex-1 gap-2 border-l-0 lg:border-l border-slate-200 pl-0 lg:pl-4">
                                        <select
                                            disabled={!enrollSubject}
                                            onChange={async (e) => {
                                                if (!enrollSubject) return toast.error('กรุณาเลือกวิชาก่อน');
                                                const studentId = e.target.value;
                                                if (!studentId) return;
                                                if (subjectEnrollments.some(en => en.student_id === studentId)) {
                                                    toast.error('นักเรียนคนนี้อยู่ในวิชานี้แล้ว');
                                                    e.target.value = '';
                                                    return;
                                                }

                                                toast.loading('กำลังเพิ่มนักเรียน...', { id: 'add_en' });
                                                const { data, error } = await supabase.from('student_enrollments').insert([
                                                    { student_id: studentId, subject_id: enrollSubject, room: enrollRoom }
                                                ]).select('*, users_students(*)');

                                                if (error) {
                                                    toast.error('เพิ่มไม่สำเร็จ ' + error.message, { id: 'add_en' });
                                                } else {
                                                    toast.success('เพิ่มนักเรียนสำเร็จ', { id: 'add_en' });
                                                    setSubjectEnrollments(prev => [...prev, data[0]]);
                                                }
                                                e.target.value = "";
                                            }}
                                            className="flex-1 bg-white border border-slate-200 text-slate-700 py-3.5 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm disabled:bg-slate-100 disabled:opacity-75"
                                        >
                                            <option value="">+ 2. เพิ่มนักเรียนทีละคน...</option>
                                            {allStudents.map(st => (
                                                <option key={st.student_id} value={st.student_id}>{st.student_code} : {st.prefix || ''}{st.first_name} {st.last_name}</option>
                                            ))}
                                        </select>

                                        <input
                                            type="text"
                                            placeholder="ห้อง เช่น ป.1/1"
                                            value={enrollRoom}
                                            onChange={(e) => setEnrollRoom(e.target.value)}
                                            className="w-32 bg-white border border-slate-200 text-slate-800 py-3.5 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none shadow-sm text-center"
                                            disabled={!enrollSubject}
                                        />
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
                                                                    toast.success('ลบนักเรียนออกสำเร็จ');
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
                    </div>
                </div>
            </div>
        </Layout>
    );
}
