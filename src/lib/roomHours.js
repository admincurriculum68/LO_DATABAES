// ชั่วโมงเรียนแยกตามห้อง
//
// วิชาเดียวกันเรียนไม่เท่ากันได้ตามโปรแกรม เช่น ภาษาไทย ป.1 ห้อง 1–3 เรียน 80 ชม. ห้อง 4–6 เรียน 100 ชม.
// subjects.teaching_hours เก็บค่าเริ่มต้น (ค่าที่พบบ่อยที่สุด) ส่วน subjects.room_hours เก็บเฉพาะห้องที่ต่าง
// เช่น { "ป.1/4": 100, "ป.1/5": 100 } โค้ดที่อ่านแค่ teaching_hours จึงยังได้ค่าที่ถูกสำหรับห้องส่วนใหญ่
//
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

const toHours = value => {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : null;
};

const roomOrder = (a, b) => a.localeCompare(b, 'th', { numeric: true });

/** ชั่วโมงเรียนของห้องหนึ่ง ถ้าห้องนี้ไม่ได้กำหนดแยก ใช้ค่าเริ่มต้นของวิชา */
export function hoursForRoom(subject, room) {
    const override = room ? toHours(subject?.room_hours?.[room]) : null;
    return override ?? toHours(subject?.teaching_hours);
}

/**
 * สร้างค่าที่จะบันทึกจากแผนที่ ห้อง → ชั่วโมง
 * ค่าเริ่มต้นคือชั่วโมงที่พบบ่อยที่สุด ถ้าเท่ากันใช้ค่าที่พบก่อน ห้องที่ไม่มีชั่วโมงไม่นับ
 * room_hours เก็บเฉพาะห้องที่ต่างจากค่าเริ่มต้น ถ้าทุกห้องเท่ากันเป็น null
 */
export function buildRoomHours(hoursByRoom, fallbackHours = null) {
    const entries = [...(hoursByRoom instanceof Map ? hoursByRoom : Object.entries(hoursByRoom || {}))]
        .map(([room, hours]) => [String(room).trim(), toHours(hours)])
        .filter(([room, hours]) => room && hours !== null);

    const counts = new Map();
    entries.forEach(([, hours]) => counts.set(hours, (counts.get(hours) || 0) + 1));
    let teachingHours = toHours(fallbackHours);
    let best = 0;
    counts.forEach((count, hours) => {
        if (count > best) { best = count; teachingHours = hours; }
    });

    const overrides = Object.fromEntries(entries.filter(([, hours]) => hours !== teachingHours).sort(([a], [b]) => roomOrder(a, b)));
    return { teaching_hours: teachingHours, room_hours: Object.keys(overrides).length ? overrides : null };
}

/** มีชั่วโมงแยกตามห้องหรือไม่ */
export function hasRoomHours(subject) {
    return Boolean(subject?.room_hours && Object.keys(subject.room_hours).length);
}

// "ป.1/1", "ป.1/2", "ป.1/3" → "ห้อง 1–3" เมื่อเลขห้องต่อกัน ถ้าไม่ต่อกันคั่นด้วยจุลภาค
function describeRooms(rooms) {
    const numbered = rooms.map(room => ({ room, number: Number(String(room).split('/').pop()) }));
    if (numbered.some(item => !Number.isInteger(item.number))) return rooms.join(', ');
    const runs = [];
    numbered.sort((a, b) => a.number - b.number).forEach(({ number }) => {
        const last = runs[runs.length - 1];
        if (last && number === last[1] + 1) last[1] = number;
        else runs.push([number, number]);
    });
    return `ห้อง ${runs.map(([from, to]) => (from === to ? `${from}` : `${from}–${to}`)).join(', ')}`;
}

/**
 * ข้อความสรุปชั่วโมงของวิชา สำหรับหัวรายงาน
 * ทุกห้องเท่ากัน → "80 ชั่วโมง" · ต่างกัน → "ห้อง 1–3: 80 ชม. · ห้อง 4–6: 100 ชม."
 * rooms คือห้องที่มีนักเรียนจริง ใช้หาห้องที่ใช้ค่าเริ่มต้น
 */
export function summarizeRoomHours(subject, rooms = []) {
    const defaultHours = toHours(subject?.teaching_hours);
    if (!hasRoomHours(subject)) return defaultHours === null ? '' : `${defaultHours} ชั่วโมง`;

    const allRooms = [...new Set([...rooms, ...Object.keys(subject.room_hours)])].sort(roomOrder);
    const groups = new Map();
    allRooms.forEach(room => {
        const hours = hoursForRoom(subject, room);
        if (hours === null) return;
        if (!groups.has(hours)) groups.set(hours, []);
        groups.get(hours).push(room);
    });
    if (groups.size <= 1) {
        const [only] = groups.keys();
        return only === undefined ? '' : `${only} ชั่วโมง`;
    }
    return [...groups.entries()]
        .sort(([, a], [, b]) => roomOrder(a[0], b[0]))
        .map(([hours, groupRooms]) => `${describeRooms(groupRooms)}: ${hours} ชม.`)
        .join(' · ');
}
