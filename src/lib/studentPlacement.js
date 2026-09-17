// จัดนักเรียนเข้าวิชาของห้อง ใช้ตอนเพิ่มนักเรียนใหม่ ย้ายห้อง ย้ายออก และกลับเข้าเรียน
//
// ข้อความ LO ผูกกับแถวลงทะเบียน (student_enrollments) จึงไม่ลบแถวเลย
// - วิชาเดียวกันคนละห้อง ใช้แถวเดิมแล้วเปลี่ยนห้อง ข้อความเดิมตามนักเรียนไปด้วย
// - วิชาที่ไม่ได้เรียนแล้ว เปลี่ยนสถานะเป็น moved หรือ withdrawn ชื่อหายจากหน้าครู แต่ข้อความยังเก็บอยู่
// - กลับมาเรียนวิชาที่เคยออก เปิดแถวเดิม ข้อความเดิมกลับมา
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

export const LEAVE_STATUS = { move: 'moved', withdraw: 'withdrawn' };

const sameRoom = (a, b) => (a || null) === (b || null);

/**
 * enrollments: แถวลงทะเบียนของนักเรียนในวิชาของภาคเรียนนี้ ทุกสถานะ [{ enrollment_id, subject_id, room, enrollment_status }]
 * targetSubjectIds: วิชาที่นักเรียนต้องเรียนหลังจัดเสร็จ (ว่าง = ออกจากทุกวิชา)
 * targetRoom: ห้องที่จะบันทึกในแถวลงทะเบียน
 * leaveStatus: สถานะของแถวที่ไม่ได้เรียนแล้ว
 */
export function planStudentPlacement({ enrollments = [], targetSubjectIds = [], targetRoom = null, leaveStatus = LEAVE_STATUS.move } = {}) {
    const targets = new Set(targetSubjectIds);
    // วิชาหนึ่งควรมีแถวเดียว ถ้ามีหลายแถวใช้แถวที่ยังเรียนอยู่ก่อน
    const bySubject = new Map();
    enrollments.forEach(row => {
        const current = bySubject.get(row.subject_id);
        if (!current || (current.enrollment_status !== 'active' && row.enrollment_status === 'active')) {
            bySubject.set(row.subject_id, row);
        }
    });

    const toInsert = [];
    const toUpdate = [];
    const unchanged = [];
    targets.forEach(subjectId => {
        const row = bySubject.get(subjectId);
        if (!row) {
            toInsert.push({ subject_id: subjectId, room: targetRoom });
        } else if (row.enrollment_status !== 'active' || !sameRoom(row.room, targetRoom)) {
            toUpdate.push({
                enrollment_id: row.enrollment_id,
                subject_id: subjectId,
                room: targetRoom,
                fromRoom: row.room || null,
                reopened: row.enrollment_status !== 'active',
            });
        } else {
            unchanged.push(row);
        }
    });

    const toLeave = enrollments
        .filter(row => row.enrollment_status === 'active' && !targets.has(row.subject_id))
        .map(row => ({ enrollment_id: row.enrollment_id, subject_id: row.subject_id, status: leaveStatus }));

    return {
        toInsert,
        toUpdate,
        toLeave,
        unchanged,
        hasChanges: toInsert.length + toUpdate.length + toLeave.length > 0,
    };
}

const nameList = (items, subjectNames) => items
    .map(item => subjectNames?.get?.(item.subject_id) || 'ไม่ทราบชื่อวิชา')
    .sort((a, b) => a.localeCompare(b, 'th'))
    .join(', ');

/** ข้อความสรุปสำหรับกล่องยืนยัน บรรทัดละ 1 เรื่อง */
export function placementSummary(plan, subjectNames) {
    const moved = plan.toUpdate.filter(item => !item.reopened);
    const reopened = plan.toUpdate.filter(item => item.reopened);
    const lines = [];
    if (moved.length) lines.push(`ย้ายห้องในวิชาเดิม ${moved.length} วิชา ข้อความ LO ที่บันทึกไว้ย้ายตามไปด้วย`);
    if (reopened.length) lines.push(`กลับเข้าเรียน ${reopened.length} วิชา ข้อความเดิมกลับมาด้วย: ${nameList(reopened, subjectNames)}`);
    if (plan.toInsert.length) lines.push(`เข้าเรียนวิชาใหม่ ${plan.toInsert.length} วิชา: ${nameList(plan.toInsert, subjectNames)}`);
    if (plan.toLeave.length) lines.push(`ออกจาก ${plan.toLeave.length} วิชา: ${nameList(plan.toLeave, subjectNames)} (ข้อความที่บันทึกไว้ยังเก็บอยู่)`);
    if (!lines.length) lines.push('ไม่มีวิชาที่ต้องเปลี่ยน');
    return lines;
}
