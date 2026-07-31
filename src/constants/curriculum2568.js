export const CBE_CAPABILITIES_2568 = [
    { key: 'reading', name: 'ความสามารถด้านการอ่าน', expectedAtPhaseEnd: 'ชำนาญ' },
    { key: 'writing', name: 'ความสามารถด้านการเขียน', expectedAtPhaseEnd: 'ชำนาญ' },
    { key: 'numeracy', name: 'ความสามารถด้านการคิดคำนวณ', expectedAtPhaseEnd: 'ชำนาญ' },
    { key: 'science_environment_technology', name: 'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี', expectedAtPhaseEnd: 'พัฒนา' },
    { key: 'society_citizenship', name: 'ความสามารถด้านสังคมและความเป็นพลเมือง', expectedAtPhaseEnd: 'พัฒนา' },
    { key: 'economics_finance', name: 'ความสามารถด้านเศรษฐกิจและการเงิน', expectedAtPhaseEnd: 'พัฒนา' },
    { key: 'physical_mental_health', name: 'ความสามารถด้านสุขภาพกายและจิต', expectedAtPhaseEnd: 'พัฒนา' },
    { key: 'arts_culture_aesthetics', name: 'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', expectedAtPhaseEnd: 'พัฒนา' },
];

export const CBE_LEVELS_2568 = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'];

export const PHASE_END_CAPABILITY_GROUPS_2568 = [
    {
        groupName: 'ความสามารถพื้นฐานด้านการเรียนรู้',
        abilities: CBE_CAPABILITIES_2568.slice(0, 3).map(item => ({
            key: item.key,
            name: item.name,
            expected: item.expectedAtPhaseEnd,
        })),
    },
    {
        groupName: 'ความสามารถด้านการประยุกต์ใช้ในชีวิตประจำวัน',
        abilities: CBE_CAPABILITIES_2568.slice(3).map(item => ({
            key: item.key,
            name: item.name,
            expected: item.expectedAtPhaseEnd,
        })),
    },
];

// จัดกลุ่มด้านความสามารถตามช่วงชั้น สำหรับหน้ารับรองผลของฝ่ายวิชาการ
// ป.ต้น: พื้นฐาน (อ่าน เขียน คิดคำนวณ) + ประยุกต์ใช้ (5 ด้าน)
// ป.ปลาย: เครื่องมือการเรียนรู้ (ภาษาและการสื่อสาร, คิดคำนวณ) + ประยุกต์ใช้ (5 ด้าน)
export const APPROVAL_COMPETENCY_GROUPS = {
    'ป.ต้น': [
        {
            groupName: 'ด้านความสามารถพื้นฐาน',
            competencyAreas: [
                'ความสามารถด้านการอ่าน',
                'ความสามารถด้านการเขียน',
                'ความสามารถด้านการคิดคำนวณ',
            ],
        },
        {
            groupName: 'ด้านความสามารถในการประยุกต์ใช้',
            competencyAreas: [
                'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี',
                'ความสามารถด้านสังคมและความเป็นพลเมือง',
                'ความสามารถด้านเศรษฐกิจและการเงิน',
                'ความสามารถด้านสุขภาพกายและจิต',
                'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ',
            ],
        },
    ],
    'ป.ปลาย': [
        {
            groupName: 'ด้านเครื่องมือการเรียนรู้',
            competencyAreas: [
                'ความสามารถด้านภาษาและการสื่อสาร',
                'ความสามารถด้านการคิดคำนวณ',
            ],
        },
        {
            groupName: 'ด้านความสามารถในการประยุกต์ใช้',
            competencyAreas: [
                'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี',
                'ความสามารถด้านสังคมและความเป็นพลเมือง',
                'ความสามารถด้านเศรษฐกิจและการเงิน',
                'ความสามารถด้านสุขภาพกายและจิต',
                'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ',
            ],
        },
    ],
};
