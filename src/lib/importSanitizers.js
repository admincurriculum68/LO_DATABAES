export const LOSSY_SCIENTIFIC = '__EXCEL_LOSSY__';

// เลขประจำตัวที่ใช้เข้าสู่ระบบมี 2 แบบ: เลขประจำตัวประชาชน 13 หลัก
// และเลข G (G ตามด้วยตัวเลข 12 หลัก) ที่ออกให้นักเรียนที่ไม่มีเลขประจำตัวประชาชน
export const CITIZEN_ID_PATTERN = /^(?:\d{13}|G\d{12})$/;

export function isCitizenIdFormat(value) {
    return CITIZEN_ID_PATTERN.test(String(value ?? ''));
}

export function citizenIdFormatError(value) {
    const id = String(value ?? '');
    if (!id) return 'ยังไม่ได้กรอกเลขประจำตัว';
    if (id.startsWith('G')) return `เลข G ต้องมีตัวเลข 12 หลักต่อจาก G (ขณะนี้ ${id.length - 1} หลัก)`;
    return `เลขประจำตัวต้องเป็นตัวเลข 13 หลัก หรือ G ตามด้วยตัวเลข 12 หลัก (ขณะนี้ ${id.length} หลัก)`;
}

// ใช้กับช่องพิมพ์เลขประจำตัว: คงตัว G นำหน้าได้ ตัวอื่นที่ไม่ใช่ตัวเลขถูกตัดทิ้ง และยาวไม่เกิน 13 ตัว
export function normalizeCitizenInput(value) {
    const text = String(value ?? '').trimStart();
    const lead = /^[gG]/.test(text) ? 'G' : '';
    return `${lead}${text.slice(lead.length).replace(/\D/g, '')}`.slice(0, 13);
}

export function sanitizeCitizenId(value) {
    if (value === null || value === undefined || value === '') return '';
    let text = String(value).trim();
    // คงตัว G นำหน้าไว้ ไม่อย่างนั้นเลข G จะเหลือ 12 หลัก นำเข้าไม่ผ่านและเข้าสู่ระบบไม่ได้
    if (/^[gG]/.test(text)) return `G${text.slice(1).replace(/\D/g, '')}`;
    if (/[eE]/.test(text)) {
        const numeric = Number(text);
        if (!Number.isFinite(numeric)) return '';
        const restored = Math.round(numeric).toString();
        const significantDigits = text.split(/[eE]/)[0].replace(/\D/g, '').replace(/^0+/, '').length;
        if (significantDigits < restored.length) return LOSSY_SCIENTIFIC;
        text = restored;
    }
    return text.replace(/\.0+$/, '').replace(/\D/g, '');
}

export function excelSerialToThaiDob(serial) {
    if (!Number.isFinite(serial) || serial < 1 || serial > 100000) return '';
    const milliseconds = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getUTCFullYear() + 543;
    return `${String(date.getUTCDate()).padStart(2, '0')}${String(date.getUTCMonth() + 1).padStart(2, '0')}${year}`;
}

const isDayMonth = (day, month) => Number(day) >= 1 && Number(day) <= 31 && Number(month) >= 1 && Number(month) <= 12;
const isBuddhistYear = year => year >= 2400 && year <= 2700;

export function normalizeThaiDob(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const separated = text.match(/^(\d{1,2})[\s./-](\d{1,2})[\s./-](\d{2,4})$/);
    if (separated) {
        let year = Number(separated[3]);
        if (year < 100) year += year <= 30 ? 2500 : 2400;
        if (year < 2400) year += 543;
        return `${separated[1].padStart(2, '0')}${separated[2].padStart(2, '0')}${year}`;
    }
    const digits = String(value ?? '').trim().replace(/\.0+$/, '').replace(/\D/g, '');
    if (/^\d{8}$/.test(digits)) {
        // ปี พ.ศ. ท้ายสตริงบอกชัดว่าเป็น DDMMYYYY จึงต้องตรวจก่อน ไม่อย่างนั้นวันที่ 19–26
        // เช่น 23042517 จะถูกอ่านเป็นปี 2304 แบบ YYYYMMDD แล้วกลายเป็นเดือนที่ 25
        if (isDayMonth(digits.slice(0, 2), digits.slice(2, 4)) && isBuddhistYear(Number(digits.slice(4)))) return digits;
        const leadingYear = Number(digits.slice(0, 4));
        if (leadingYear >= 1900 && leadingYear <= 2600 && isDayMonth(digits.slice(6, 8), digits.slice(4, 6))) {
            const year = leadingYear < 2400 ? leadingYear + 543 : leadingYear;
            return `${digits.slice(6, 8)}${digits.slice(4, 6)}${year}`;
        }
        const trailingYear = Number(digits.slice(4));
        if (trailingYear >= 1900 && trailingYear < 2400 && isDayMonth(digits.slice(0, 2), digits.slice(2, 4))) {
            return `${digits.slice(0, 4)}${trailingYear + 543}`;
        }
        return digits;
    }
    return excelSerialToThaiDob(Number(digits)) || digits;
}
