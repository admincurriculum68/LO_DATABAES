export const LEARNING_FORMATS = {
    subject: {
        label: 'วิชา',
        description: 'การจัดการเรียนรู้ตามวิชาที่สถานศึกษาเปิดสอน',
    },
    learning_unit: {
        label: 'หน่วยการเรียนรู้',
        description: 'การจัดการเรียนรู้ตามหน่วยที่กำหนดเป้าหมายและหลักฐานการเรียนรู้ไว้ชัดเจน',
    },
    project: {
        label: 'โครงงาน',
        description: 'การเรียนรู้ผ่านการลงมือปฏิบัติและสร้างผลงานจากสถานการณ์หรือปัญหา',
    },
    activity: {
        label: 'กิจกรรม',
        description: 'การเรียนรู้ผ่านกิจกรรมหรือประสบการณ์ที่สถานศึกษากำหนด',
    },
};

export const LEARNING_FORMAT_ORDER = ['subject', 'learning_unit', 'project', 'activity'];

export function learningFormatLabel(type) {
    // integrated_unit is retained only for displaying legacy sandbox records.
    if (type === 'integrated_unit') return LEARNING_FORMATS.learning_unit.label;
    return LEARNING_FORMATS[type]?.label || 'รูปแบบการจัดการเรียนรู้';
}

export const FORMAL_LEVEL_LABELS = {
    'N/A': 'ไม่อยู่ในขอบเขตการประเมิน',
};

export function formalLevelLabel(level) {
    return FORMAL_LEVEL_LABELS[level] || level;
}
