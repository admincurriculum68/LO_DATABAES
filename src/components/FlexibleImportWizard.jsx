import { useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileSpreadsheet, RefreshCw, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

const normalizeHeader = value => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s._/\\()\-[\]]+/g, '')
    .replace(/ปีการศึกษา/g, 'ปี')
    .replace(/หมายเลข/g, 'เลข');

const normalizeDigits = value => String(value ?? '').trim().replace(/\.0+$/, '').replace(/\D/g, '');

const excelSerialToThaiDob = serial => {
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return '';
    const parsed = XLSX.SSF?.parse_date_code?.(serial);
    if (!parsed?.y || !parsed?.m || !parsed?.d) return '';
    const year = parsed.y < 2400 ? parsed.y + 543 : parsed.y;
    return `${String(parsed.d).padStart(2, '0')}${String(parsed.m).padStart(2, '0')}${year}`;
};

const normalizeDob = value => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const separated = text.match(/^(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{2,4})$/);
    if (separated) {
        let year = Number(separated[3]);
        if (year < 100) year += year <= 30 ? 2500 : 2400;
        if (year < 2400) year += 543;
        return `${separated[1].padStart(2, '0')}${separated[2].padStart(2, '0')}${year}`;
    }
    const digits = normalizeDigits(text);
    if (/^\d{8}$/.test(digits)) {
        const leadingYear = Number(digits.slice(0, 4));
        if (leadingYear >= 1900 && leadingYear <= 2600) {
            const year = leadingYear < 2400 ? leadingYear + 543 : leadingYear;
            return `${digits.slice(6, 8)}${digits.slice(4, 6)}${year}`;
        }
        return digits;
    }
    const excelDate = excelSerialToThaiDob(Number(digits));
    return excelDate || (digits ? digits.padStart(8, '0') : '');
};

const normalizeGrade = value => {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const match = text.match(/(?:ป\.?|ประถม(?:ศึกษา)?(?:ปีที่)?\s*)?([1-6])/i);
    return match ? `ป.${match[1]}` : text;
};

const normalizeBoolean = value => ['true', '1', 'yes', 'ใช่', 'เพิ่มเติม', 'มากกว่าหลักสูตร'].includes(String(value ?? '').trim().toLowerCase());

const FIELD = (key, label, aliases, options = {}) => ({ key, label, aliases: [label, key, ...aliases], ...options });

const IMPORT_SCHEMAS = {
    students: {
        title: 'ข้อมูลนักเรียน',
        description: 'ระบบจะพยายามรู้จักชื่อคอลัมน์จาก DMC และ Excel ของโรงเรียน',
        fields: [
            FIELD('citizen_id', 'เลขประจำตัวประชาชน', ['เลขบัตรประชาชน', 'เลข13หลัก', 'เลขบัตร', 'เลขประชาชน'], { required: true, kind: 'citizen' }),
            FIELD('dob', 'วันเดือนปีเกิด', ['วันเกิด', 'ว/ด/ปเกิด', 'birthdate', 'dateofbirth'], { required: true, kind: 'dob' }),
            FIELD('student_code', 'รหัสนักเรียน', ['รหัสประจำตัวนักเรียน', 'เลขประจำตัวนักเรียน', 'studentid']),
            FIELD('prefix', 'คำนำหน้า', ['คำนำหน้าชื่อ', 'title']),
            FIELD('first_name', 'ชื่อ', ['ชื่อนักเรียน', 'ชื่อจริง', 'firstname'], { required: true }),
            FIELD('last_name', 'นามสกุล', ['นามสกุลนักเรียน', 'lastname'], { required: true }),
            FIELD('current_grade_level', 'ระดับชั้น', ['ชั้น', 'ระดับ', 'ชั้นปี', 'grade'], { required: true, kind: 'grade' }),
            FIELD('current_room', 'ห้องประจำชั้น', ['ห้อง', 'ห้องเรียน', 'ชั้นห้อง', 'room'], { required: true, kind: 'room' }),
        ],
    },
    teachers: {
        title: 'ข้อมูลครูและบุคลากร',
        description: 'รองรับครูผู้สอน ฝ่ายวิชาการ และผู้บริหาร',
        fields: [
            FIELD('citizen_id', 'เลขประจำตัวประชาชน', ['เลขบัตรประชาชน', 'เลข13หลัก'], { required: true, kind: 'citizen' }),
            FIELD('dob', 'วันเดือนปีเกิด', ['วันเกิด', 'ว/ด/ปเกิด', 'birthdate'], { required: true, kind: 'dob' }),
            FIELD('prefix', 'คำนำหน้า', ['คำนำหน้าชื่อ', 'title']),
            FIELD('first_name', 'ชื่อ', ['ชื่อครู', 'ชื่อจริง', 'firstname'], { required: true }),
            FIELD('last_name', 'นามสกุล', ['นามสกุลครู', 'lastname'], { required: true }),
            FIELD('role', 'บทบาท', ['ตำแหน่งในระบบ', 'สิทธิ', 'role']),
        ],
    },
    subjects: {
        title: 'ข้อมูลวิชา',
        description: 'ชื่อวิชา ระดับชั้น เวลาเรียน และครูหลัก',
        fields: [
            FIELD('academic_year', 'ปีการศึกษา', ['ปี', 'ปีการเรียน']),
            FIELD('semester', 'ภาคเรียน', ['เทอม', 'ภาค']),
            FIELD('subject_name', 'ชื่อวิชา', ['รายวิชา', 'วิชา', 'subject'], { required: true }),
            FIELD('grade_level', 'ระดับชั้น', ['ชั้น', 'ชั้นปี', 'grade'], { required: true, kind: 'grade' }),
            FIELD('subject_group', 'กลุ่มวิชา', ['กลุ่มสาระ', 'ด้านความสามารถ']),
            FIELD('teaching_hours', 'จำนวนชั่วโมงเรียน', ['ชั่วโมง', 'เวลาเรียน', 'ชม'], { kind: 'number' }),
            FIELD('teacher_citizen_id', 'เลขประจำตัวประชาชนครู', ['เลขบัตรครู', 'เลข13หลักครู', 'ครูผู้สอน']),
        ],
    },
    learning_units: {
        title: 'ข้อมูลหน่วยการเรียนรู้',
        description: 'หน่วยการเรียนรู้ที่โรงเรียนออกแบบ',
        context: true,
    },
    projects: {
        title: 'ข้อมูลโครงงาน',
        description: 'โครงงานรายชั้นหรือโครงงานแบบรวมกลุ่ม',
        context: true,
    },
    activities: {
        title: 'ข้อมูลกิจกรรม',
        description: 'กิจกรรมทั่วไปและกิจกรรมพัฒนาผู้เรียน',
        context: true,
    },
    enrollments: {
        title: 'ข้อมูลกลุ่มเรียนรายวิชา',
        description: 'จับคู่นักเรียนกับวิชาและห้อง/กลุ่มที่เข้าเรียน',
        fields: [
            FIELD('student_citizen_id', 'เลขประจำตัวประชาชนนักเรียน', ['เลขบัตรนักเรียน', 'เลข13หลัก', 'studentid'], { required: true, kind: 'citizen' }),
            FIELD('subject_name', 'ชื่อวิชา', ['รายวิชา', 'วิชา', 'subject'], { required: true }),
            FIELD('room', 'ชื่อห้องหรือกลุ่มเรียน', ['ห้อง', 'กลุ่มเรียน', 'กลุ่ม', 'room'], { required: true }),
        ],
    },
    learning_outcomes: {
        title: 'ผลลัพธ์การเรียนรู้ (LO)',
        description: 'LO แยกระดับชั้นและด้านความสามารถ',
        fields: [
            FIELD('grade_level', 'ระดับชั้น', ['ชั้น', 'ชั้นปี', 'grade'], { required: true, kind: 'grade' }),
            FIELD('lo_code', 'รหัส LO', ['รหัสผลลัพธ์', 'รหัส']),
            FIELD('ability_no', 'ข้อที่', ['ลำดับ', 'ข้อ', 'หมายเลข'], { kind: 'number' }),
            FIELD('level_group', 'ช่วงชั้น', ['ช่วง', 'phase']),
            FIELD('competency_area', 'ด้านความสามารถ', ['สมรรถนะ', 'ความสามารถ', 'competency'], { required: true }),
            FIELD('is_custom_competency', 'เพิ่มเติมจากหลักสูตร', ['มากกว่าหลักสูตร', 'กำหนดเอง'], { kind: 'boolean' }),
            FIELD('lo_description', 'รายละเอียด LO', ['ผลลัพธ์การเรียนรู้', 'คำอธิบาย', 'รายละเอียด'], { required: true }),
        ],
    },
};

const CONTEXT_FIELDS = [
    FIELD('academic_year', 'ปีการศึกษา', ['ปี', 'ปีการเรียน']),
    FIELD('semester', 'ภาคเรียน', ['เทอม', 'ภาค']),
    FIELD('context_name', 'ชื่อรายการ', ['ชื่อหน่วย', 'ชื่อโครงงาน', 'ชื่อกิจกรรม', 'ชื่อ'], { required: true }),
    FIELD('grade_level', 'ระดับชั้น', ['ชั้น', 'ชั้นปี', 'grade'], { required: true, kind: 'grade' }),
    FIELD('subject_group', 'กลุ่มวิชา', ['กลุ่มสาระ', 'ด้านความสามารถ']),
    FIELD('teaching_hours', 'จำนวนชั่วโมงเรียน', ['ชั่วโมง', 'เวลาเรียน', 'ชม'], { kind: 'number' }),
    FIELD('teacher_citizen_id', 'เลขประจำตัวประชาชนครู', ['เลขบัตรครู', 'เลข13หลักครู']),
    FIELD('activity_category', 'หมวดกิจกรรม', ['ประเภทกิจกรรม', 'หมวด']),
    FIELD('description', 'คำอธิบาย', ['รายละเอียด', 'วัตถุประสงค์']),
];

Object.values(IMPORT_SCHEMAS).forEach(schema => {
    if (schema.context) schema.fields = CONTEXT_FIELDS;
});

const suggestMapping = (headers, fields) => {
    const normalizedHeaders = headers.map(normalizeHeader);
    return Object.fromEntries(fields.map(field => {
        const aliases = field.aliases.map(normalizeHeader);
        let index = normalizedHeaders.findIndex(header => aliases.includes(header));
        if (index < 0) {
            index = normalizedHeaders.findIndex(header => aliases.some(alias => alias.length >= 3 && (header.includes(alias) || alias.includes(header))));
        }
        return [field.key, index >= 0 ? String(index) : ''];
    }));
};

const detectHeaderRow = (rows, fields) => {
    let best = { index: 0, score: -1 };
    rows.slice(0, 20).forEach((row, index) => {
        const mapping = suggestMapping(row || [], fields);
        const matched = Object.values(mapping).filter(value => value !== '').length;
        const requiredMatched = fields.filter(field => field.required && mapping[field.key] !== '').length;
        const nonEmpty = (row || []).filter(value => String(value ?? '').trim()).length;
        const score = requiredMatched * 20 + matched * 5 + Math.min(nonEmpty, 10);
        if (score > best.score) best = { index, score };
    });
    return best.index;
};

const readFile = file => new Promise((resolve, reject) => {
    const extension = file.name.split('.').pop().toLowerCase();
    if (extension === 'csv') {
        Papa.parse(file, {
            header: false,
            skipEmptyLines: 'greedy',
            complete: result => resolve({ sheets: [{ name: 'ข้อมูล CSV', rows: result.data }] }),
            error: error => reject(error),
        });
        return;
    }
    const reader = new FileReader();
    reader.onload = event => {
        try {
            const workbook = XLSX.read(event.target.result, { type: 'array', cellText: true, cellDates: false });
            const sheets = workbook.SheetNames.map(name => {
                const formattedRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false, blankrows: false });
                const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: true, blankrows: false });
                const rows = formattedRows.map((row, rowIndex) => row.map((value, columnIndex) => {
                    const rawValue = rawRows[rowIndex]?.[columnIndex];
                    // ป้องกัน Excel แสดงเลขบัตร 13 หลักเป็น scientific notation จนหลักท้ายหาย
                    if (typeof rawValue === 'number' && Number.isInteger(rawValue) && Math.abs(rawValue) >= 1e10) {
                        return rawValue.toFixed(0);
                    }
                    return value;
                }));
                return { name, rows };
            });
            resolve({ sheets });
        } catch (error) {
            reject(error);
        }
    };
    reader.onerror = () => reject(new Error('เปิดไฟล์ไม่สำเร็จ'));
    reader.readAsArrayBuffer(file);
});

const transformValue = (value, field) => {
    const text = String(value ?? '').trim();
    if (field.kind === 'citizen') return normalizeDigits(text);
    if (field.kind === 'dob') return normalizeDob(text);
    if (field.kind === 'grade') return normalizeGrade(text);
    if (field.kind === 'number') return text ? String(parseInt(text.replace(/,/g, ''), 10) || '') : '';
    if (field.kind === 'boolean') return normalizeBoolean(text) ? 'true' : 'false';
    return text;
};

const validateRecord = (record, fields) => {
    const errors = [];
    fields.forEach(field => {
        const value = String(record[field.key] ?? '').trim();
        if (field.required && !value) errors.push(`ไม่มี${field.label}`);
        if (field.kind === 'citizen' && value && value.length !== 13) errors.push(`${field.label}ต้องมี 13 หลัก`);
        if (field.kind === 'dob' && value) {
            const day = Number(value.slice(0, 2));
            const month = Number(value.slice(2, 4));
            const year = Number(value.slice(4, 8));
            if (value.length !== 8 || day < 1 || day > 31 || month < 1 || month > 12 || year < 2400 || year > 2700) errors.push(`${field.label}ไม่ถูกต้อง`);
        }
        if (field.kind === 'grade' && value && !/^ป\.[1-6]$/.test(value)) errors.push(`${field.label}ต้องอยู่ระหว่าง ป.1–ป.6`);
    });
    return errors;
};

export default function FlexibleImportWizard({ initialType = 'students', onCancel, onConfirm }) {
    const fileInputRef = useRef(null);
    const [step, setStep] = useState(1);
    const [importType, setImportType] = useState(initialType);
    const [fileName, setFileName] = useState('');
    const [sheets, setSheets] = useState([]);
    const [sheetIndex, setSheetIndex] = useState(0);
    const [headerRow, setHeaderRow] = useState(0);
    const [mapping, setMapping] = useState({});
    const [edits, setEdits] = useState({});
    const [showOnlyErrors, setShowOnlyErrors] = useState(false);
    const [loading, setLoading] = useState(false);
    const schema = IMPORT_SCHEMAS[importType];
    const rows = useMemo(() => sheets[sheetIndex]?.rows || [], [sheetIndex, sheets]);
    const headers = useMemo(() => rows[headerRow] || [], [headerRow, rows]);

    const mappedRows = useMemo(() => rows.slice(headerRow + 1)
        .map((row, rowOffset) => {
            const sourceRow = headerRow + rowOffset + 2;
            const record = {};
            schema.fields.forEach(field => {
                const columnIndex = mapping[field.key];
                const editKey = `${sourceRow}:${field.key}`;
                const rawValue = edits[editKey] !== undefined ? edits[editKey] : (columnIndex === '' || columnIndex === undefined ? '' : row[Number(columnIndex)]);
                record[field.key] = transformValue(rawValue, field);
            });
            if (record.current_room && /^\d+$/.test(record.current_room) && record.current_grade_level) {
                record.current_room = `${record.current_grade_level}/${record.current_room}`;
            }
            return { sourceRow, record, errors: validateRecord(record, schema.fields) };
        })
        .filter(item => Object.values(item.record).some(value => String(value ?? '').trim())), [edits, headerRow, mapping, rows, schema.fields]);

    const errorCount = mappedRows.filter(item => item.errors.length).length;
    const readyRows = mappedRows.filter(item => !item.errors.length);
    const requiredMissing = schema.fields.filter(field => field.required && (mapping[field.key] === '' || mapping[field.key] === undefined));
    const visiblePreview = (showOnlyErrors ? mappedRows.filter(item => item.errors.length) : mappedRows).slice(0, 50);

    const selectFile = async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        event.target.value = '';
        setLoading(true);
        try {
            const result = await readFile(file);
            const firstUsableSheet = result.sheets.findIndex(sheet => sheet.rows.length > 0);
            const nextSheetIndex = firstUsableSheet >= 0 ? firstUsableSheet : 0;
            const nextRows = result.sheets[nextSheetIndex]?.rows || [];
            const detectedHeader = detectHeaderRow(nextRows, schema.fields);
            setFileName(file.name);
            setSheets(result.sheets);
            setSheetIndex(nextSheetIndex);
            setHeaderRow(detectedHeader);
            setMapping(suggestMapping(nextRows[detectedHeader] || [], schema.fields));
            setEdits({});
            setStep(2);
        } finally {
            setLoading(false);
        }
    };

    const changeSheet = index => {
        const nextRows = sheets[index]?.rows || [];
        const detectedHeader = detectHeaderRow(nextRows, schema.fields);
        setSheetIndex(index);
        setHeaderRow(detectedHeader);
        setMapping(suggestMapping(nextRows[detectedHeader] || [], schema.fields));
        setEdits({});
    };

    const changeHeaderRow = value => {
        const nextHeaderRow = Number(value);
        setHeaderRow(nextHeaderRow);
        setMapping(suggestMapping(rows[nextHeaderRow] || [], schema.fields));
        setEdits({});
    };

    const confirm = async () => {
        if (!readyRows.length) return;
        setLoading(true);
        try {
            await onConfirm(readyRows.map(item => item.record), importType);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="ตัวช่วยนำเข้าข้อมูล">
            <header className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                    <div><h2 className="text-lg font-extrabold text-slate-950">ตัวช่วยนำเข้าข้อมูล</h2><p className="mt-1 text-sm text-slate-600">ไม่จำเป็นต้องเปลี่ยนชื่อคอลัมน์ในไฟล์ ระบบช่วยจับคู่ให้และตรวจสอบก่อนบันทึก</p></div>
                    <button onClick={onCancel} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="ปิดตัวช่วย"><X className="h-5 w-5" /></button>
                </div>
                <ol className="mt-4 flex gap-1" aria-label="ขั้นตอนนำเข้า">
                    {['เลือกข้อมูลและไฟล์', 'จับคู่คอลัมน์', 'ตรวจสอบและแก้ไข'].map((label, index) => {
                        const number = index + 1;
                        return <li key={label} className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${step === number ? 'bg-indigo-700 text-white' : step > number ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${step === number ? 'bg-white/20' : 'bg-white'}`}>{step > number ? <Check className="h-3.5 w-3.5" /> : number}</span><span className="hidden truncate sm:block">{label}</span></li>;
                    })}
                </ol>
            </header>

            {step === 1 && <div className="space-y-5 p-5 sm:p-6">
                <div><label className="mb-1.5 block text-sm font-extrabold text-slate-800">ต้องการเพิ่มข้อมูลอะไร?</label><select value={importType} onChange={event => setImportType(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold">{Object.entries(IMPORT_SCHEMAS).map(([key, item]) => <option key={key} value={key}>{item.title}</option>)}</select><p className="mt-2 text-sm text-slate-600">{schema.description}</p></div>
                <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="flex min-h-56 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 p-8 text-center hover:bg-indigo-50"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-700 text-white"><Upload className="h-7 w-7" /></span><strong className="mt-4 text-base text-slate-950">เลือกไฟล์ Excel หรือ CSV ของโรงเรียน</strong><span className="mt-1 text-sm text-slate-600">รองรับไฟล์ .xlsx, .xls และ .csv โดยไม่บังคับรูปแบบหัวคอลัมน์</span></button>
            </div>}

            {step === 2 && <div className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><FileSpreadsheet className="h-7 w-7 text-blue-700" /><div><strong className="block text-sm text-blue-950">{fileName}</strong><span className="text-xs text-blue-800">เลือกชีตและแถวที่เป็นชื่อคอลัมน์ให้ถูกต้อง</span></div></div><button onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-300 bg-white px-3 text-sm font-bold text-blue-800"><RefreshCw className="h-4 w-4" />เปลี่ยนไฟล์</button></div>
                <div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-sm font-extrabold text-slate-700">ชีตข้อมูล</span><select value={sheetIndex} onChange={event => changeSheet(Number(event.target.value))} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">{sheets.map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name} · {sheet.rows.length} แถว</option>)}</select></label><label><span className="mb-1.5 block text-sm font-extrabold text-slate-700">แถวที่เป็นชื่อคอลัมน์</span><select value={headerRow} onChange={event => changeHeaderRow(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold">{rows.slice(0, 20).map((row, index) => <option key={index} value={index}>แถวที่ {index + 1}: {(row || []).filter(Boolean).slice(0, 4).join(' · ') || 'ไม่มีข้อมูล'}</option>)}</select></label></div>
                <div className="overflow-hidden rounded-xl border border-slate-200"><div className="border-b border-slate-200 bg-slate-50 px-4 py-3"><h3 className="font-extrabold text-slate-900">จับคู่ข้อมูลที่ระบบต้องการกับคอลัมน์ในไฟล์</h3><p className="mt-1 text-xs text-slate-600">ระบบจับคู่ให้อัตโนมัติแล้ว โปรดตรวจช่องที่มีเครื่องหมาย *</p></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2">{schema.fields.map(field => <label key={field.key} className="bg-white p-4"><span className="mb-1.5 flex items-center justify-between text-sm font-extrabold text-slate-800"><span>{field.label}{field.required && <span className="text-rose-600"> *</span>}</span>{mapping[field.key] !== '' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}</span><select value={mapping[field.key] ?? ''} onChange={event => setMapping(previous => ({ ...previous, [field.key]: event.target.value }))} className={`min-h-11 w-full rounded-xl border bg-white px-3 text-sm font-bold ${field.required && (mapping[field.key] === '' || mapping[field.key] === undefined) ? 'border-rose-400 text-rose-800' : 'border-slate-300 text-slate-800'}`}><option value="">— ไม่มีคอลัมน์นี้ —</option>{headers.map((header, index) => String(header ?? '').trim() && <option key={`${index}-${header}`} value={String(index)}>{String(header)} · คอลัมน์ {index + 1}</option>)}</select></label>)}</div></div>
                {requiredMissing.length > 0 && <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><AlertCircle className="h-5 w-5 shrink-0" /><p>ยังไม่ได้จับคู่: <strong>{requiredMissing.map(field => field.label).join(', ')}</strong></p></div>}
                <div className="flex justify-between gap-3"><button onClick={() => setStep(1)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700"><ArrowLeft className="h-4 w-4" />ย้อนกลับ</button><button onClick={() => setStep(3)} disabled={requiredMissing.length > 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white disabled:opacity-40">ตรวจสอบข้อมูล<ArrowRight className="h-4 w-4" /></button></div>
            </div>}

            {step === 3 && <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-600">ข้อมูลทั้งหมด</p><p className="mt-1 text-2xl font-extrabold text-slate-950">{mappedRows.length.toLocaleString()} <span className="text-sm">รายการ</span></p></div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-800">พร้อมนำเข้า</p><p className="mt-1 text-2xl font-extrabold text-emerald-900">{readyRows.length.toLocaleString()} <span className="text-sm">รายการ</span></p></div><div className={`rounded-xl border p-4 ${errorCount ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}><p className={`text-xs font-bold ${errorCount ? 'text-rose-800' : 'text-slate-600'}`}>ต้องแก้ไข</p><p className={`mt-1 text-2xl font-extrabold ${errorCount ? 'text-rose-900' : 'text-slate-800'}`}>{errorCount.toLocaleString()} <span className="text-sm">รายการ</span></p></div></div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-extrabold text-slate-950">ตรวจสอบตัวอย่างและแก้ไขข้อมูล</h3><p className="mt-1 text-xs text-slate-600">แสดงสูงสุด 50 แถว ระบบจะนำเข้าเฉพาะรายการที่ไม่มีข้อผิดพลาด</p></div>{errorCount > 0 && <button onClick={() => setShowOnlyErrors(value => !value)} className={`min-h-10 rounded-xl border px-3 text-sm font-bold ${showOnlyErrors ? 'border-rose-700 bg-rose-700 text-white' : 'border-rose-300 bg-white text-rose-800'}`}>{showOnlyErrors ? 'แสดงทุกรายการ' : `แสดงเฉพาะ ${errorCount} รายการที่ผิด`}</button>}</div>
                <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200"><table className="min-w-max w-full text-sm"><thead className="sticky top-0 z-10 bg-slate-100 text-slate-700"><tr><th className="px-3 py-3 text-center">แถว</th><th className="px-3 py-3 text-left">สถานะ</th>{schema.fields.map(field => <th key={field.key} className="min-w-[160px] px-3 py-3 text-left">{field.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 bg-white">{visiblePreview.map(item => <tr key={item.sourceRow} className={item.errors.length ? 'bg-rose-50/40' : ''}><td className="px-3 py-2 text-center font-mono text-xs text-slate-500">{item.sourceRow}</td><td className="max-w-[220px] px-3 py-2">{item.errors.length ? <span className="text-xs font-bold leading-5 text-rose-700">{item.errors.join(' · ')}</span> : <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />พร้อม</span>}</td>{schema.fields.map(field => <td key={field.key} className="px-2 py-2"><input value={item.record[field.key] ?? ''} onChange={event => setEdits(previous => ({ ...previous, [`${item.sourceRow}:${field.key}`]: event.target.value }))} className={`min-h-9 w-full rounded-lg border px-2 text-xs ${item.errors.length && (!item.record[field.key] || (field.kind === 'citizen' && item.record[field.key].length !== 13)) ? 'border-rose-400 bg-white' : 'border-slate-200 bg-white'}`} /></td>)}</tr>)}</tbody></table></div>
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button onClick={() => setStep(2)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700"><ArrowLeft className="h-4 w-4" />กลับไปจับคู่คอลัมน์</button><button onClick={confirm} disabled={!readyRows.length || loading} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 text-sm font-extrabold text-white disabled:opacity-40"><Upload className="h-4 w-4" />{loading ? 'กำลังนำเข้า...' : `ยืนยันนำเข้า ${readyRows.length.toLocaleString()} รายการ`}</button></div>
            </div>}
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={selectFile} />
        </section>
    );
}
