// ห้องที่ครูเข้าถึงได้ในวิชาหนึ่ง
//
// ตอนนำเข้าข้อมูล ระบบตั้งครูคนแรกของวิชาเป็นครูหลัก (subjects.teacher_id) เพื่อใช้กับรายงานแบบเดิม
// ครูหลักจึงไม่ได้แปลว่าสอนทุกห้อง ห้องที่สอนจริงดูจากแถวใน subject_teachers ก่อนเสมอ
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

const NONE = { canAccess: false, allRooms: false, rooms: new Set(), allows: () => false };
const ALL = { canAccess: true, allRooms: true, rooms: null, allows: () => true };

/**
 * subject: { teacher_id }
 * subjectAssignments: แถว subject_teachers ของวิชานี้ทั้งหมด [{ teacher_id, room_name }]
 * คืน { canAccess, allRooms, rooms, allows(room) }
 */
export function teacherRoomAccess(subject, subjectAssignments, teacherId) {
    if (!teacherId) return NONE;
    const rows = subjectAssignments || [];
    const mine = rows.filter(row => row.teacher_id === teacherId);

    // ได้รับมอบหมายทั้งวิชา
    if (mine.some(row => !row.room_name)) return ALL;

    // ได้รับมอบหมายรายห้อง แม้เป็นครูหลักก็เห็นเฉพาะห้องของตัวเอง
    if (mine.length) {
        const rooms = new Set(mine.map(row => row.room_name));
        return { canAccess: true, allRooms: false, rooms, allows: room => rooms.has(room) };
    }

    if (subject?.teacher_id !== teacherId) return NONE;

    // ครูหลักของวิชาแบบเก่าที่ไม่มีการมอบหมายรายห้องเลย สอนทุกห้อง
    if (!rows.length) return ALL;

    // มีครูคนอื่นรับห้องไปแล้ว ครูหลักเห็นเฉพาะห้องที่ยังไม่มีใครรับ
    if (rows.some(row => !row.room_name)) return NONE;
    const taken = new Set(rows.map(row => row.room_name));
    return { canAccess: true, allRooms: false, rooms: null, allows: room => !taken.has(room) };
}

/** ห้องที่ครูเห็นได้จากรายการห้องที่มีนักเรียนจริง เรียงตามชื่อห้อง */
export function accessibleRooms(access, rooms) {
    return [...new Set(rooms || [])].filter(room => access.allows(room)).sort(compareRooms);
}

export function compareRooms(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'th', { numeric: true });
}

/** ย่อรายชื่อห้องต่อเนื่อง เช่น ป.4/1, ป.4/2, ป.4/3 → ป.4/1–4/3 */
export function formatRoomRange(rooms) {
    const sorted = [...new Set(rooms || [])].filter(Boolean).sort(compareRooms);
    if (sorted.length <= 1) return sorted.join('');
    const parse = room => {
        const match = String(room).match(/^(.*?)(\d+)\/(\d+)$/);
        return match ? { prefix: match[1], grade: match[2], number: Number(match[3]) } : null;
    };
    const parts = [];
    let start = 0;
    for (let index = 1; index <= sorted.length; index += 1) {
        const previous = parse(sorted[index - 1]);
        const current = index < sorted.length ? parse(sorted[index]) : null;
        const continues = previous && current && current.prefix === previous.prefix && current.grade === previous.grade && current.number === previous.number + 1;
        if (continues) continue;
        const first = sorted[start];
        const last = sorted[index - 1];
        const lastParsed = parse(last);
        parts.push(first === last ? first : `${first}–${lastParsed ? `${lastParsed.grade}/${lastParsed.number}` : last}`);
        start = index;
    }
    return parts.join(', ');
}

/**
 * ชื่อครูของแต่ละห้องในวิชา ใช้ในหน้าติดตามของฝ่ายวิชาการ
 * คืนรายการ [{ teacherId, rooms: [...] }] เรียงตามห้องแรก ครูที่รับทั้งวิชาได้ rooms ว่าง
 */
export function teachersWithRooms(subject, subjectAssignments) {
    const rows = subjectAssignments || [];
    if (!rows.length) return subject?.teacher_id ? [{ teacherId: subject.teacher_id, rooms: [] }] : [];
    const byTeacher = new Map();
    rows.forEach(row => {
        if (!byTeacher.has(row.teacher_id)) byTeacher.set(row.teacher_id, new Set());
        if (row.room_name) byTeacher.get(row.teacher_id).add(row.room_name);
    });
    return [...byTeacher.entries()]
        .map(([teacherId, rooms]) => ({ teacherId, rooms: [...rooms].sort(compareRooms) }))
        .sort((a, b) => compareRooms(a.rooms[0] || '', b.rooms[0] || ''));
}
