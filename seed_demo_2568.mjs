import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
    fs.readFileSync(new URL('./.env', import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => {
            const separator = line.indexOf('=');
            return [line.slice(0, separator), line.slice(separator + 1)];
        })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const SCHOOL_ID = '11111111-1111-1111-1111-111111111111';
const PASSWORD_HASH = 'fda67685b00d0b419b1cff2a9226642c6423fc265a17afbc4d423e612683a9a0';

async function must(label, operation) {
    const result = await operation;
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    return result.data || [];
}

async function optionalDelete(table, column, values) {
    if (!values.length) return;
    const { error } = await supabase.from(table).delete().in(column, values);
    if (error && !/does not exist|schema cache/i.test(error.message)) throw error;
}

async function bestEffort(label, operation) {
    const result = await operation;
    if (result.error) {
        console.warn(`${label} (ข้ามใน REST seed): ${result.error.message}`);
        return [];
    }
    return result.data || [];
}

const teachers = [
    ['a1111111-1111-1111-1111-111111111111', '1111111111111', 'นาง', 'พิมพ์ชนก', 'วิชาการ', 'admin', null],
    ['a2222222-2222-2222-2222-222222222222', '2222222222222', 'นาง', 'กมลวรรณ', 'ใจดี', 'teacher', 'ป.1/1'],
    ['a3333333-3333-3333-3333-333333333333', '3333333333333', 'นาย', 'ธนกฤต', 'คิดเป็น', 'teacher', 'ป.1/2'],
    ['a4444444-4444-4444-4444-444444444444', '4444444444444', 'นางสาว', 'ศิริพร', 'สร้างสรรค์', 'teacher', null],
    ['a5555555-5555-5555-5555-555555555555', '5555555555555', 'นาย', 'ณรงค์ชัย', 'บริหารดี', 'executive', null],
].map(([teacher_id, citizen_id, prefix, first_name, last_name, role, homeroom]) => ({
    teacher_id, school_id: SCHOOL_ID, citizen_id, plain_password: '01012540',
    password_hash: PASSWORD_HASH, prefix, first_name, last_name, role, homeroom, is_active: true,
}));

const studentNames = [
    ['ด.ช.', 'ภูมิพัฒน์', 'ตั้งใจเรียน'], ['ด.ญ.', 'ปุณณภา', 'ใฝ่รู้'],
    ['ด.ช.', 'ธีรภัทร', 'มีวินัย'], ['ด.ญ.', 'ชนัญชิดา', 'แบ่งปัน'],
    ['ด.ช.', 'นราวิชญ์', 'ช่างสังเกต'], ['ด.ญ.', 'พิชญาภา', 'สร้างสรรค์'],
    ['ด.ช.', 'กฤตภาส', 'ร่วมมือดี'], ['ด.ญ.', 'ณิชาภัทร', 'พากเพียร'],
];
const studentIds = [
    'b1111111-1111-1111-1111-111111111111',
    'b2222222-2222-2222-2222-222222222222',
    'b3333333-3333-3333-3333-333333333333',
    'b4444444-4444-4444-4444-444444444444',
    'b5555555-5555-5555-5555-555555555555',
    'b6666666-6666-6666-6666-666666666666',
    'b7777777-7777-7777-7777-777777777777',
    'b8888888-8888-8888-8888-888888888888',
];
const students = studentNames.map(([prefix, first_name, last_name], index) => {
    const n = index + 1;
    return {
        student_id: studentIds[index],
        school_id: SCHOOL_ID,
        citizen_id: `910000000000${n}`,
        plain_password: '01012540',
        password_hash: PASSWORD_HASH,
        student_code: `6900${n}`,
        prefix, first_name, last_name,
        student_status: 'active', current_grade_level: 'ป.1',
        current_room: n <= 4 ? 'ป.1/1' : 'ป.1/2',
    };
});

const capabilities = [
    ['e1111111-1111-1111-1111-111111111111', 'SCH-P1-LO-01', 'ความสามารถด้านการอ่าน', 'อ่านคำ ประโยค และข้อความสั้นจากเรื่องใกล้ตัว แล้วบอกสาระสำคัญหรือข้อมูลที่นำไปใช้ได้'],
    ['e2222222-2222-2222-2222-222222222222', 'SCH-P1-LO-02', 'ความสามารถด้านการเขียน', 'เขียนคำและประโยคสั้นเพื่อถ่ายทอดข้อมูล ความคิด หรือความรู้สึก โดยสื่อความหมายได้เหมาะสมกับสถานการณ์'],
    ['e3333333-3333-3333-3333-333333333333', 'SCH-P1-LO-03', 'ความสามารถด้านการคิดคำนวณ', 'ใช้จำนวนนับ การบวก และการลบเพื่อแก้ปัญหาใกล้ตัว พร้อมอธิบายวิธีคิดด้วยภาษาหรือสื่อที่เข้าใจได้'],
    ['e4444444-4444-4444-4444-444444444444', 'SCH-P1-LO-04', 'ความสามารถด้านวิทยาศาสตร์ สิ่งแวดล้อม และเทคโนโลยี', 'สังเกต ตั้งคำถาม รวบรวมหลักฐาน และอธิบายการเปลี่ยนแปลงของสิ่งรอบตัว โดยใช้เครื่องมือหรือเทคโนโลยีอย่างเหมาะสม'],
    ['e5555555-5555-5555-5555-555555555555', 'SCH-P1-LO-05', 'ความสามารถด้านสังคมและความเป็นพลเมือง', 'ปฏิบัติตนตามข้อตกลง รับฟังผู้อื่น ร่วมตัดสินใจ และรับผิดชอบหน้าที่ของตนในห้องเรียนและชุมชน'],
    ['e6666666-6666-6666-6666-666666666666', 'SCH-P1-LO-06', 'ความสามารถด้านเศรษฐกิจและการเงิน', 'วางแผนใช้ทรัพยากรและเงินในสถานการณ์ใกล้ตัว แยกความจำเป็นกับความต้องการ และตัดสินใจอย่างมีเหตุผล'],
    ['e7777777-7777-7777-7777-777777777777', 'SCH-P1-LO-07', 'ความสามารถด้านสุขภาพกายและจิต', 'ดูแลสุขอนามัยและความปลอดภัยของตน สังเกตอารมณ์ และเลือกวิธีจัดการตนเองหรือขอความช่วยเหลือได้เหมาะสม'],
    ['e8888888-8888-8888-8888-888888888888', 'SCH-P1-LO-08', 'ความสามารถด้านศิลปะและวัฒนธรรมเพื่อสุนทรียภาพ', 'สร้างสรรค์และนำเสนอผลงานจากเสียง สี รูปร่าง การเคลื่อนไหว หรือเรื่องราวท้องถิ่น พร้อมบอกความรู้สึกและคุณค่าที่รับรู้'],
].map(([lo_id, lo_code, competency_area, lo_description], index) => ({
    lo_id, school_id: SCHOOL_ID, lo_code, ability_no: index + 1, level_group: 'ป.ต้น',
    competency_area, lo_description, is_active: true,
}));

const subjects = [
    ['c1111111-1111-1111-1111-111111111111', 'ภาษาไทย: อ่าน เขียน สื่อสาร', 'ภาษาไทย', teachers[1].teacher_id],
    ['c2222222-2222-2222-2222-222222222222', 'คณิตคิดรอบตัว', 'คณิตศาสตร์', teachers[2].teacher_id],
    ['c3333333-3333-3333-3333-333333333333', 'วิทยาศาสตร์และสิ่งแวดล้อมใกล้ตัว', 'วิทยาศาสตร์', teachers[3].teacher_id],
    ['c4444444-4444-4444-4444-444444444444', 'ชีวิต ศิลปะ และชุมชน', 'สังคม สุขภาวะ และศิลปะ', teachers[1].teacher_id],
].map(([subject_id, subject_name, subject_group, teacher_id]) => ({
    subject_id, school_id: SCHOOL_ID, academic_year: 2569, semester: 1,
    subject_code: null, subject_name, grade_level: 'ป.1', subject_group, teacher_id,
}));

const subjectLoIndexes = [[0, 1], [0, 2, 5], [0, 3], [1, 4, 6, 7]];
const contexts = [
    ['91111111-1111-1111-1111-111111111111', 'learning_unit', 'UNIT-P1-01', 'หน่วยการเรียนรู้ ชุมชนของเรา', 'เรียนรู้ข้อมูล บุคคล สถานที่ กติกา และสิ่งแวดล้อมในชุมชนผ่านการสำรวจและสื่อสารผล', teachers[1].teacher_id, [0, 1, 3, 4]],
    ['92222222-2222-2222-2222-222222222222', 'project', 'PROJECT-P1-01', 'โครงงาน ตลาดนัดพอเพียง', 'วางแผนผลิตภัณฑ์อย่างง่าย สำรวจต้นทุน ตั้งราคา สื่อสาร และสะท้อนการใช้ทรัพยากรอย่างรับผิดชอบ', teachers[2].teacher_id, [0, 1, 2, 5]],
    ['93333333-3333-3333-3333-333333333333', 'activity', 'ACTIVITY-P1-01', 'กิจกรรม สุขภาวะดี มีสุนทรียภาพ', 'ฝึกดูแลสุขภาพกายและจิต ทำงานร่วมกัน และสร้างสรรค์ผลงานจากศิลปวัฒนธรรมในท้องถิ่น', teachers[3].teacher_id, [4, 6, 7]],
];

const levelFor = (studentIndex, abilityNo, offset = 0) =>
    ['เชี่ยวชาญ', 'ชำนาญ', 'พัฒนา', 'เริ่มต้น'][(studentIndex + 1 + abilityNo + offset) % 4];

async function run() {
    const oldSubjects = await must('อ่านรายวิชาเดิม', supabase.from('subjects').select('subject_id').eq('school_id', SCHOOL_ID));
    const oldStudents = await must('อ่านนักเรียนเดิม', supabase.from('users_students').select('student_id').eq('school_id', SCHOOL_ID));
    const oldLos = await must('อ่าน LO เดิม', supabase.from('learning_outcomes').select('lo_id').eq('school_id', SCHOOL_ID));
    const orphanLos = await must(
        'อ่าน LO ตัวอย่างกำพร้า',
        supabase.from('learning_outcomes').select('lo_id').is('school_id', null).in('lo_code', ['M1', 'M2', 'L3', 'L4'])
    );
    const oldLoIds = [...oldLos, ...orphanLos].map(x => x.lo_id);
    const oldContexts = await must('อ่านบริบทเดิม', supabase.from('learning_contexts').select('context_id').eq('school_id', SCHOOL_ID));
    const oldEnrollments = oldSubjects.length
        ? await must('อ่านการลงทะเบียนเดิม', supabase.from('student_enrollments').select('enrollment_id').in('subject_id', oldSubjects.map(x => x.subject_id)))
        : [];

    await must('ล้าง audit', supabase.from('audit_logs').delete().eq('school_id', SCHOOL_ID));
    await must('ล้างผลรับรอง', supabase.from('lo_final_decisions').delete().eq('school_id', SCHOOL_ID));
    await must('ล้างผลรูปแบบอื่น', supabase.from('learning_context_evaluations').delete().eq('school_id', SCHOOL_ID));
    await optionalDelete('learning_context_lo_mappings', 'context_id', oldContexts.map(x => x.context_id));
    await must('ล้างรูปแบบอื่น', supabase.from('learning_contexts').delete().eq('school_id', SCHOOL_ID));
    await must('ล้างสถานะส่งตรวจ', supabase.from('assessment_submissions').delete().eq('school_id', SCHOOL_ID));
    await optionalDelete('student_year_evaluations', 'student_id', oldStudents.map(x => x.student_id));
    await optionalDelete('lo_evaluations', 'enrollment_id', oldEnrollments.map(x => x.enrollment_id));
    await optionalDelete('lo_evaluations', 'lo_id', oldLoIds);
    await optionalDelete('subject_lo_mapping', 'subject_id', oldSubjects.map(x => x.subject_id));
    await optionalDelete('subject_lo_mapping', 'lo_id', oldLoIds);
    await optionalDelete('student_enrollments', 'subject_id', oldSubjects.map(x => x.subject_id));
    await must('ล้างรายวิชาเดิม', supabase.from('subjects').delete().eq('school_id', SCHOOL_ID));
    await must('ล้าง LO เดิม', supabase.from('learning_outcomes').delete().eq('school_id', SCHOOL_ID));
    await optionalDelete('learning_outcomes', 'lo_id', orphanLos.map(x => x.lo_id));
    await must('ล้างนักเรียนเดิม', supabase.from('users_students').delete().eq('school_id', SCHOOL_ID));
    await must('ล้างบุคลากรเดิม', supabase.from('users_teachers').delete().eq('school_id', SCHOOL_ID));

    await must('ตั้งค่าโรงเรียน', supabase.from('schools').update({
        school_name: 'โรงเรียนสาธิตต้นแบบ CBE Track', active_academic_year: 2569,
        active_semester: 1, is_active: true,
    }).eq('school_id', SCHOOL_ID));
    await must('เพิ่มบุคลากร', supabase.from('users_teachers').insert(teachers));
    await must('เพิ่มนักเรียน', supabase.from('users_students').insert(students));
    await must('เพิ่ม LO', supabase.from('learning_outcomes').insert(capabilities));
    await must('เพิ่มรายวิชา', supabase.from('subjects').insert(subjects));

    const mappings = subjects.flatMap((subject, subjectIndex) =>
        subjectLoIndexes[subjectIndex].map(loIndex => ({
            mapping_id: crypto.randomUUID(), subject_id: subject.subject_id,
            lo_id: capabilities[loIndex].lo_id,
        }))
    );
    await must('ผูก LO กับวิชา', supabase.from('subject_lo_mapping').insert(mappings));

    const enrollmentRows = students.flatMap((student, studentIndex) => subjects.map(subject => ({
        enrollment_id: crypto.randomUUID(), student_id: student.student_id,
        subject_id: subject.subject_id, room: student.current_room,
        attendance_percent: [96, 96, 96, 95, 94, 91.5, 88, 82.5][studentIndex],
    })));
    const savedEnrollments = await must('จัดนักเรียนเข้าวิชา', supabase.from('student_enrollments').insert(enrollmentRows).select('*'));

    const evidence = [
        'อ่านข้อมูลจากบัตรคำและป้าย แล้วบอกสาระสำคัญโดยอ้างอิงข้อความที่อ่าน',
        'เขียนข้อความสั้นเพื่อสื่อสาร โดยเรียงลำดับความคิดและปรับแก้จากข้อเสนอแนะ',
        'ใช้สื่อรูปธรรมคำนวณ อธิบายวิธีคิด และตรวจสอบคำตอบจากสถานการณ์ใกล้ตัว',
        'บันทึกสิ่งที่สังเกต เปรียบเทียบหลักฐาน และอธิบายการเปลี่ยนแปลงที่พบ',
        'ทำหน้าที่ตามข้อตกลง รับฟังความคิดเห็น และร่วมตัดสินใจในการทำงานกลุ่ม',
        'จำแนกความจำเป็นกับความต้องการ วางแผนใช้เงินจำลอง และบอกเหตุผลของการเลือก',
        'ปฏิบัติกิจวัตรด้านสุขอนามัย บอกอารมณ์ และเลือกวิธีดูแลตนเองได้',
        'สร้างและนำเสนอผลงานจากเรื่องราวท้องถิ่น พร้อมอธิบายสิ่งที่ต้องการสื่อ',
    ];
    const evaluations = [];
    for (const enrollment of savedEnrollments) {
        const studentIndex = students.findIndex(x => x.student_id === enrollment.student_id);
        const subjectIndex = subjects.findIndex(x => x.subject_id === enrollment.subject_id);
        for (const loIndex of subjectLoIndexes[subjectIndex]) {
            evaluations.push({
                evaluation_id: crypto.randomUUID(), enrollment_id: enrollment.enrollment_id,
                lo_id: capabilities[loIndex].lo_id, competency_level: levelFor(studentIndex, loIndex + 1),
                evaluated_by: subjects[subjectIndex].teacher_id, evidence_note: evidence[loIndex],
                workflow_status: studentIndex >= 6 ? 'draft' : 'submitted',
                submitted_at: studentIndex >= 6 ? null : new Date().toISOString(),
            });
        }
    }
    await must('เพิ่มผลรายวิชา', supabase.from('lo_evaluations').insert(evaluations));

    const contextRows = contexts.map(([context_id, context_type, context_code, context_name, description, responsible_teacher_id]) => ({
        context_id, school_id: SCHOOL_ID, context_type, context_code, context_name,
        description, academic_year: 2569, semester: 1, grade_level: 'ป.1',
        responsible_teacher_id, is_active: true,
    }));
    await must('เพิ่มสามรูปแบบอื่น', supabase.from('learning_contexts').insert(contextRows));
    const contextMappings = contexts.flatMap(([context_id,,,,,, loIndexes]) => loIndexes.map(loIndex => ({
        mapping_id: crypto.randomUUID(), context_id, lo_id: capabilities[loIndex].lo_id,
    })));
    await must('ผูก LO กับสามรูปแบบ', supabase.from('learning_context_lo_mappings').insert(contextMappings));

    const contextEvaluations = contexts.flatMap(([context_id, contextType,,,, teacherId, loIndexes]) =>
        students.flatMap((student, studentIndex) => loIndexes.map(loIndex => ({
            context_evaluation_id: crypto.randomUUID(), school_id: SCHOOL_ID, context_id,
            student_id: student.student_id, lo_id: capabilities[loIndex].lo_id,
            competency_level: levelFor(studentIndex, loIndex + 1, 1),
            evidence_note: contextType === 'project'
                ? 'ร่วมวางแผน ใช้ข้อมูลตัดสินใจ แก้ปัญหาระหว่างทำงาน และสะท้อนการเรียนรู้ของตน'
                : contextType === 'learning_unit'
                    ? 'รวบรวมข้อมูลจากการสำรวจ ทำงานตามหน้าที่ และนำเสนอสิ่งที่ค้นพบโดยอ้างอิงหลักฐาน'
                    : 'ปฏิบัติกิจกรรมสุขภาวะและสร้างสรรค์ผลงานร่วมกับผู้อื่น พร้อมอธิบายคุณค่าที่รับรู้',
            evaluated_by: teacherId, workflow_status: studentIndex === 7 ? 'draft' : 'submitted',
            submitted_at: studentIndex === 7 ? null : new Date().toISOString(),
        })))
    );
    await must('เพิ่มผลสามรูปแบบ', supabase.from('learning_context_evaluations').insert(contextEvaluations));

    const submissions = subjects.map((subject, index) => ({
        submission_id: crypto.randomUUID(), school_id: SCHOOL_ID, subject_id: subject.subject_id,
        academic_year: 2569, semester: 1, teacher_id: subject.teacher_id,
        status: ['approved', 'under_review', 'returned', 'submitted'][index],
        teacher_note: 'ส่งผลพร้อมหลักฐานรายบุคคลตาม LO ที่รับผิดชอบ',
        reviewer_comment: index === 2 ? 'กรุณาเพิ่มหลักฐานจากการสังเกตระหว่างปฏิบัติงาน' : index === 0 ? 'ตรวจสอบหลักฐานและรับรองผลแล้ว' : null,
        submitted_at: new Date().toISOString(),
        reviewed_by: [0, 2].includes(index) ? teachers[0].teacher_id : null,
        reviewed_at: [0, 2].includes(index) ? new Date().toISOString() : null,
    }));
    await must('เพิ่มสถานะส่งตรวจ', supabase.from('assessment_submissions').insert(submissions));

    const decisions = students.flatMap((student, studentIndex) => capabilities.map((lo, loIndex) => {
        const pending = studentIndex >= 6;
        const level = levelFor(studentIndex, loIndex + 1);
        return {
            decision_id: crypto.randomUUID(), school_id: SCHOOL_ID, student_id: student.student_id,
            lo_id: lo.lo_id, academic_year: 2569, semester: 1,
            final_level: pending ? null : level,
            pass_status: pending ? 'pending' : level === 'เริ่มต้น' ? 'not_passed' : 'passed',
            decision_status: pending ? 'pending' : 'approved',
            decision_reason: pending ? 'รอครูส่งหลักฐานให้ครบจากรูปแบบที่เกี่ยวข้อง' : 'พิจารณาหลักฐานเชิงคุณภาพจากครูผู้ประเมินทุกแหล่งและรับรองผลแล้ว',
            decided_by: pending ? null : teachers[0].teacher_id,
            decided_at: pending ? null : new Date().toISOString(), is_locked: !pending,
        };
    }));
    await must('เพิ่มผลรับรอง', supabase.from('lo_final_decisions').insert(decisions));

    const yearly = students.map((student, index) => ({
        student_id: student.student_id, academic_year: 2569, semester: 1,
        activity_status: index === 7 ? 'ไม่ผ่าน' : 'ผ่าน', character_status: 'ผ่าน',
        evaluator_id: index < 4 ? teachers[1].teacher_id : teachers[2].teacher_id,
    }));
    // ตารางนี้เปิด RLS สำหรับ authenticated role เท่านั้นในฐานทดลองเดิม
    // ชุด SQL หลักเพิ่มข้อมูลส่วนนี้ได้ครบ; REST seed จะข้ามเมื่อ anon ถูกปฏิเสธ
    await bestEffort('เพิ่มผลครูประจำชั้น', supabase.from('student_year_evaluations').insert(yearly));

    const oldAreas = ['ภาษาไทย', 'คณิตศาสตร์', 'การใช้ภาษา', 'การคิดคำนวณ', 'ความสามารถด้านภาษาไทย', 'ความสามารถด้านคณิตศาสตร์', ...capabilities.map(x => x.competency_area)];
    await must('ล้างคำบรรยายเดิม', supabase.from('behavior_templates').delete().in('competency_area', oldAreas));
    const levelDescriptions = [
        ['เริ่มต้น', 'ปฏิบัติได้บางส่วนในสถานการณ์ที่คุ้นเคย เมื่อมีแบบอย่างและได้รับการช่วยเหลืออย่างใกล้ชิด'],
        ['พัฒนา', 'ปฏิบัติได้ในสถานการณ์ที่คุ้นเคย เมื่อได้รับคำชี้แนะบางส่วน และเริ่มตรวจสอบงานของตน'],
        ['ชำนาญ', 'ปฏิบัติได้ด้วยตนเองอย่างสม่ำเสมอ เลือกวิธีดำเนินงานที่เหมาะสม และอธิบายเหตุผลได้'],
        ['เชี่ยวชาญ', 'ประยุกต์ใช้ได้อย่างคล่องแคล่วในสถานการณ์ที่หลากหลายหรือสถานการณ์ใหม่ อธิบายเหตุผลและถ่ายโอนการเรียนรู้ได้'],
    ];
    const behaviors = capabilities.flatMap(lo => levelDescriptions.map(([competency_level, behavior_text]) => ({
        id: crypto.randomUUID(), competency_area: lo.competency_area, competency_level, behavior_text,
    })));
    await must('เพิ่มคำบรรยาย 8x4', supabase.from('behavior_templates').insert(behaviors));

    await must('เพิ่ม audit', supabase.from('audit_logs').insert({
        audit_id: crypto.randomUUID(), school_id: SCHOOL_ID, actor_id: teachers[0].teacher_id,
        actor_role: 'admin', action: 'IMPORT_DEMO_DATA_2568', entity_type: 'school',
        entity_id: SCHOOL_ID, detail: { curriculum: 'หลักสูตรการศึกษาประถมศึกษาตอนต้น พ.ศ. 2568', tenant_safe: true },
    }));

    console.log(JSON.stringify({
        school: SCHOOL_ID, teachers: teachers.length, students: students.length,
        subjects: subjects.length, learning_outcomes: capabilities.length,
        learning_contexts: contexts.length, subject_evaluations: evaluations.length,
        context_evaluations: contextEvaluations.length, final_decisions: decisions.length,
        behavior_templates: behaviors.length,
    }, null, 2));
}

run().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
