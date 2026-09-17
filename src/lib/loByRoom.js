// LO ของวิชาแยกตามห้อง
//
// subject_lo_mapping.room_name ว่าง = ใช้กับทุกห้องของวิชา มีค่า = เฉพาะห้องนั้นและมาก่อนแถวที่ว่าง
// ห้องที่ไม่มีทั้งสองแบบ คือครูยังไม่ได้เลือก LO
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

import { sameSelection } from './loMapping.js';

const EMPTY = Object.freeze([]);

/**
 * rows: [{ subject_id, lo_id, room_name, updated_by, updated_at, learning_outcomes? }]
 * คืนตัวช่วยหา LO ของวิชา × ห้อง
 */
export function buildLoResolver(rows) {
    const shared = new Map();
    const byRoom = new Map();
    (rows || []).forEach(row => {
        if (!row?.subject_id) return;
        if (!row.room_name) {
            if (!shared.has(row.subject_id)) shared.set(row.subject_id, []);
            shared.get(row.subject_id).push(row);
            return;
        }
        const key = `${row.subject_id}|${row.room_name}`;
        if (!byRoom.has(key)) byRoom.set(key, []);
        byRoom.get(key).push(row);
    });

    const rowsFor = (subjectId, room) => (room && byRoom.get(`${subjectId}|${room}`)) || shared.get(subjectId) || EMPTY;
    const idsFor = (subjectId, room) => new Set(rowsFor(subjectId, room).map(row => row.lo_id));
    const isRoomSpecific = (subjectId, room) => Boolean(room && byRoom.has(`${subjectId}|${room}`));
    const lastEdit = (subjectId, room) => rowsFor(subjectId, room).reduce((latest, row) => (
        row.updated_at && (!latest || row.updated_at > latest.updated_at) ? row : latest
    ), null);
    // LO ทุกข้อที่วิชานี้ใช้ในห้องใดห้องหนึ่ง ใช้กับหน้าที่ไม่แยกห้อง
    const allIdsForSubject = subjectId => {
        const ids = new Set((shared.get(subjectId) || EMPTY).map(row => row.lo_id));
        byRoom.forEach((list, key) => { if (key.startsWith(`${subjectId}|`)) list.forEach(row => ids.add(row.lo_id)); });
        return ids;
    };

    return { rowsFor, idsFor, isRoomSpecific, lastEdit, allIdsForSubject };
}

/** LO ที่ใช้กับแถวนักเรียนในวิชา (enrollment มี subject_id และ room) */
export function idsForEnrollment(resolver, enrollment) {
    return resolver.idsFor(enrollment.subject_id, enrollment.room);
}

/** แถว mapping ที่ใช้กับแถวนักเรียนในวิชา */
export function rowsForEnrollment(resolver, enrollment) {
    return resolver.rowsFor(enrollment.subject_id, enrollment.room);
}

/**
 * สรุปรายห้องของวิชาหนึ่ง: [{ room, count, specific, lastEdit }]
 * และบอกว่าทุกห้องใช้ชุดเดียวกันหรือไม่
 */
export function roomsSummary(resolver, subjectId, rooms) {
    const list = [...new Set(rooms || [])].map(room => ({
        room,
        ids: resolver.idsFor(subjectId, room),
        specific: resolver.isRoomSpecific(subjectId, room),
        lastEdit: resolver.lastEdit(subjectId, room),
    }));
    return {
        rooms: list.map(({ ids, ...item }) => ({ ...item, count: ids.size })),
        sameSet: sameSetAcrossRooms(list.map(item => item.ids)),
        missing: list.filter(item => item.ids.size === 0).map(item => item.room),
    };
}

/** ทุกชุดเหมือนกันหรือไม่ (ชุดว่างนับเป็นชุดหนึ่ง) */
export function sameSetAcrossRooms(sets) {
    const list = sets || [];
    return list.every(set => sameSelection(set, list[0]));
}

/**
 * แผนการเขียนของห้องหนึ่ง เทียบกับแถวในฐานข้อมูลตอนนี้
 * currentRoomRows: แถวของห้องนี้โดยเฉพาะ · sharedIds: LO ทั้งวิชาที่ห้องนี้ใช้อยู่ถ้ายังไม่มีแถวของตัวเอง
 * ห้องที่ยังใช้ชุดทั้งวิชา ต้องเขียนเป็นแถวของห้องนั้นทั้งชุด ห้องอื่นจึงไม่กระทบ
 */
export function planRoomWrite(currentRoomRows, sharedIds, nextIds) {
    const next = new Set(nextIds || []);
    const roomRows = currentRoomRows || [];
    if (!roomRows.length) {
        const shared = new Set(sharedIds || []);
        // ชุดเดิมของทั้งวิชาเหมือนกับที่เลือกอยู่แล้ว ไม่ต้องเขียน
        if (shared.size && sameSelection(shared, next)) return { toAdd: [], toRemove: [], effectiveBefore: shared };
        return { toAdd: [...next], toRemove: [], effectiveBefore: shared };
    }
    const current = new Set(roomRows.map(row => row.lo_id));
    return {
        toAdd: [...next].filter(id => !current.has(id)),
        toRemove: [...current].filter(id => !next.has(id)),
        effectiveBefore: current,
    };
}
