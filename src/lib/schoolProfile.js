import { supabase } from './supabase';

// คอลัมน์เสริมที่เพิ่มด้วยไฟล์ SQL ภายหลัง โรงเรียนที่ยังไม่ได้รันต้องใช้งานหน้าอื่นได้ตามปกติ
const SIGNER_COLUMNS = 'academic_head_name, academic_deputy_name, director_name';
const EMPTY_SIGNERS = { academic_head_name: '', academic_deputy_name: '', director_name: '' };

// จำไว้ว่าฐานข้อมูลมีคอลัมน์ชื่อผู้ลงนามหรือยัง จะได้ไม่ยิงคำขอที่ล้มซ้ำทุกครั้งที่เปิดหน้า
let signersSupported = null;

const missingColumn = (error, names) => error?.code === '42703'
    || error?.code === 'PGRST204'
    || names.some(name => error?.message?.includes(name));

export async function loadSchoolProfile(schoolId) {
    if (!schoolId) return { school_name: '', logo_data_url: '', ...EMPTY_SIGNERS, logoReady: false, signersReady: false };

    if (signersSupported !== false) {
        const full = await supabase
            .from('schools')
            .select(`school_name, logo_data_url, ${SIGNER_COLUMNS}`)
            .eq('school_id', schoolId)
            .single();
        if (!full.error) {
            signersSupported = true;
            return { ...full.data, logoReady: true, signersReady: true };
        }
        if (!missingColumn(full.error, ['logo_data_url', 'academic_head_name', 'academic_deputy_name', 'director_name'])) throw full.error;
        signersSupported = false;
    }

    const withLogo = await supabase
        .from('schools')
        .select('school_name, logo_data_url')
        .eq('school_id', schoolId)
        .single();
    if (!withLogo.error) return { ...withLogo.data, ...EMPTY_SIGNERS, logoReady: true, signersReady: false };
    if (!missingColumn(withLogo.error, ['logo_data_url'])) throw withLogo.error;

    const fallback = await supabase
        .from('schools')
        .select('school_name')
        .eq('school_id', schoolId)
        .single();
    if (fallback.error) throw fallback.error;
    return { ...fallback.data, logo_data_url: '', ...EMPTY_SIGNERS, logoReady: false, signersReady: false };
}

export async function resizeSchoolLogo(file, maxSize = 512) {
    if (!file?.type?.startsWith('image/')) throw new Error('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
    if (file.size > 3 * 1024 * 1024) throw new Error('ไฟล์ตราโรงเรียนต้องมีขนาดไม่เกิน 3 MB');

    const objectUrl = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = objectUrl;
        await image.decode();

        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('อุปกรณ์นี้ไม่สามารถเตรียมไฟล์ตราโรงเรียนได้');
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        return canvas.toDataURL('image/webp', 0.88);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export async function saveSchoolProfile(schoolId, values) {
    const payload = {
        school_name: values.school_name.trim(),
        logo_data_url: values.logo_data_url || null,
    };
    // เขียนชื่อผู้ลงนามเฉพาะเมื่อฐานข้อมูลมีคอลัมน์แล้ว
    if (values.signersReady) {
        payload.academic_head_name = values.academic_head_name?.trim() || null;
        payload.academic_deputy_name = values.academic_deputy_name?.trim() || null;
        payload.director_name = values.director_name?.trim() || null;
    }
    const { data, error } = await supabase
        .from('schools')
        .update(payload)
        .eq('school_id', schoolId)
        .select('school_id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ไม่มีสิทธิ์แก้ไขข้อมูลโรงเรียน หรือไม่พบโรงเรียนที่เลือก');
}
