// โครงสร้างข้อมูลที่ตัวช่วยนำเข้ารู้จัก แต่ละช่องมีคำเทียบ (aliases) ไว้จับคู่กับหัวคอลัมน์
// ในไฟล์ของโรงเรียน แยกออกมาจากหน้าจอเพื่อให้เทสต์ใช้คำเทียบชุดเดียวกับของจริง

const FIELD = (key, label, aliases, options = {}) => ({ key, label, aliases: [label, key, ...aliases], ...options });

export const IMPORT_SCHEMAS = {
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
            FIELD('homeroom', 'ห้องประจำชั้น', ['ครูประจำชั้น', 'homeroom']),
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
            FIELD('room', 'ห้องที่ครูคนนี้รับผิดชอบ', ['ห้อง', 'ห้องเรียน', 'กลุ่มเรียน', 'room']),
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
