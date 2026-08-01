import { supabase } from './supabase';

const missingLogoColumn = error => error?.code === '42703'
    || error?.code === 'PGRST204'
    || error?.message?.includes('logo_data_url');

export async function loadSchoolProfile(schoolId) {
    if (!schoolId) return { school_name: '', logo_data_url: '', logoReady: false };

    const result = await supabase
        .from('schools')
        .select('school_name, logo_data_url')
        .eq('school_id', schoolId)
        .single();

    if (!result.error) return { ...result.data, logoReady: true };
    if (!missingLogoColumn(result.error)) throw result.error;

    const fallback = await supabase
        .from('schools')
        .select('school_name')
        .eq('school_id', schoolId)
        .single();
    if (fallback.error) throw fallback.error;
    return { ...fallback.data, logo_data_url: '', logoReady: false };
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
    const { data, error } = await supabase
        .from('schools')
        .update({
            school_name: values.school_name.trim(),
            logo_data_url: values.logo_data_url || null,
        })
        .eq('school_id', schoolId)
        .select('school_id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('ไม่มีสิทธิ์แก้ไขข้อมูลโรงเรียน หรือไม่พบโรงเรียนที่เลือก');
}
