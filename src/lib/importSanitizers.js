export const LOSSY_SCIENTIFIC = '__EXCEL_LOSSY__';

export function sanitizeCitizenId(value) {
    if (value === null || value === undefined || value === '') return '';
    let text = String(value).trim();
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
        const leadingYear = Number(digits.slice(0, 4));
        if (leadingYear >= 1900 && leadingYear <= 2600) {
            const year = leadingYear < 2400 ? leadingYear + 543 : leadingYear;
            return `${digits.slice(6, 8)}${digits.slice(4, 6)}${year}`;
        }
        return digits;
    }
    return excelSerialToThaiDob(Number(digits)) || digits;
}
