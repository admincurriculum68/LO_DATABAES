import { fetchAllByIn, fetchAllRows, supabase } from './supabase';
import { planRoomWrite } from './loByRoom';

// อ่านและบันทึก LO ของวิชาแยกตามห้อง (ต้องมีคอลัมน์ subject_lo_mapping.room_name จาก update_schema_lo_by_room.sql)
// ถ้ายังไม่ได้รัน SQL ระบบใช้ LO ทั้งวิชาแบบเดิม และบอกให้รัน SQL แทนการพังทั้งหน้า
// ครูเลือกแล้วใช้ได้ทันที ไม่มีขั้นอนุมัติ

export const LO_BY_ROOM_SQL_HINT = 'ฐานข้อมูลยังไม่รองรับ LO แยกตามห้อง ผู้ดูแลระบบต้องรันไฟล์ update_schema_lo_by_room.sql ใน Supabase ก่อน ระหว่างนี้ LO ที่บันทึกจะใช้กับทุกห้องของวิชา';
export const LO_FIELDS = 'lo_id, lo_code, ability_no, competency_area, lo_description';

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

// จำผลไว้เฉพาะเมื่อรู้แน่ว่ามีหรือไม่มีคอลัมน์ ถ้าเน็ตหลุดจะถามใหม่ครั้งหน้า
let supported = null;

export async function loByRoomSupported() {
    if (supported !== null) return supported;
    const { error } = await supabase.from('subject_lo_mapping').select('room_name').limit(1);
    if (!error) supported = true;
    else if (error.code === '42703') supported = false;
    return supported ?? false;
}

/** คอลัมน์ที่ต้องเลือกจาก subject_lo_mapping ตามความพร้อมของฐานข้อมูล */
export async function mappingSelect(extra = '') {
    const roomColumns = (await loByRoomSupported()) ? ', room_name, updated_by, updated_at' : '';
    return `subject_id, lo_id${roomColumns}${extra ? `, ${extra}` : ''}`;
}

/** แถว LO ของวิชาเหล่านี้ทุกห้อง withLo = แนบรายละเอียด LO มาด้วย */
export async function loadRoomMappings(subjectIds, { withLo = false } = {}) {
    const select = await mappingSelect(withLo ? `learning_outcomes(${LO_FIELDS})` : '');
    const rows = await fetchAllByIn(subjectIds, (batch, from, to) => supabase
        .from('subject_lo_mapping').select(select).in('subject_id', batch).range(from, to));
    return rows.map(row => ({ room_name: null, ...row }));
}

/** แถวครูรายห้องของวิชาเหล่านี้ทั้งหมด ใช้ตัดสินว่าครูเห็นห้องไหน */
export async function loadSubjectAssignments(subjectIds) {
    return fetchAllByIn(subjectIds, (batch, from, to) => supabase
        .from('subject_teachers').select('subject_id, teacher_id, room_name').in('subject_id', batch).range(from, to));
}

async function currentSubjectRows(subjectId) {
    const select = await mappingSelect();
    const { data, error } = await supabase.from('subject_lo_mapping').select(`mapping_id, ${select}`).eq('subject_id', subjectId);
    if (error) throw error;
    return (data || []).map(row => ({ room_name: null, ...row }));
}

/**
 * แผนการบันทึกของแต่ละห้อง เทียบกับฐานข้อมูลล่าสุด
 * คืน [{ room, toAdd, toRemove, removedFromRoom }] removedFromRoom = LO ที่ห้องนี้ใช้อยู่แต่จะไม่ใช้แล้ว
 */
export async function planRoomSelection(subjectId, rooms, loIds) {
    const rows = await currentSubjectRows(subjectId);
    const sharedIds = rows.filter(row => !row.room_name).map(row => row.lo_id);
    const next = new Set(loIds);
    return rooms.map(room => {
        const plan = planRoomWrite(rows.filter(row => row.room_name === room), sharedIds, next);
        return { room, ...plan, removedFromRoom: [...plan.effectiveBefore].filter(id => !next.has(id)) };
    });
}

/** ผลการประเมินที่ครูบันทึกไว้แล้วใน LO ที่ห้องนั้นจะเลิกใช้ ใช้เตือนก่อนบันทึก */
export async function countEvaluationsAtRisk(subjectId, plans) {
    const removedByRoom = new Map(plans.filter(plan => plan.removedFromRoom.length).map(plan => [plan.room, new Set(plan.removedFromRoom)]));
    if (!removedByRoom.size) return 0;
    const enrollments = await fetchAllRows((from, to) => supabase.from('student_enrollments')
        .select('enrollment_id, room').eq('subject_id', subjectId).in('room', [...removedByRoom.keys()]).range(from, to));
    const roomByEnrollment = new Map(enrollments.map(row => [row.enrollment_id, row.room]));
    const evaluations = await fetchAllByIn([...roomByEnrollment.keys()], (batch, from, to) => supabase
        .from('lo_evaluations').select('enrollment_id, lo_id, evidence_note').in('enrollment_id', batch).range(from, to));
    return evaluations.filter(row => row.evidence_note && removedByRoom.get(roomByEnrollment.get(row.enrollment_id))?.has(row.lo_id)).length;
}

/**
 * บันทึก LO ให้หลายห้องพร้อมกัน มีผลทันที
 * ห้องที่ยังใช้ชุดทั้งวิชาจะได้แถวของห้องตัวเอง ห้องอื่นในวิชาไม่กระทบ
 * เพิ่มก่อนลบ ถ้าการเพิ่มล้ม LO เดิมของห้องยังอยู่ครบ
 */
export async function saveRoomSelection({ subjectId, rooms, loIds, actor, plans, schoolId }) {
    const now = new Date().toISOString();
    const actorId = actor?.teacher_id || null;

    const roomReady = await loByRoomSupported();
    if (!roomReady || !rooms.length) {
        // บันทึกเป็นชุดทั้งวิชา: ฐานข้อมูลเก่า หรือวิชาที่ยังไม่มีนักเรียนจึงยังไม่มีห้อง
        const sharedOnly = query => (roomReady ? query.is('room_name', null) : query);
        const { data: current, error } = await sharedOnly(supabase.from('subject_lo_mapping').select('lo_id').eq('subject_id', subjectId));
        if (error) throw error;
        const have = new Set((current || []).map(row => row.lo_id));
        const next = new Set(loIds);
        const additions = [...next].filter(id => !have.has(id))
            .map(loId => (roomReady ? { subject_id: subjectId, lo_id: loId, room_name: null, updated_by: actorId, updated_at: now } : { subject_id: subjectId, lo_id: loId }));
        if (additions.length) {
            const { error: insertError } = await supabase.from('subject_lo_mapping').insert(additions);
            if (insertError) throw insertError;
        }
        const removals = [...have].filter(id => !next.has(id));
        for (const ids of chunk(removals, 100)) {
            const { error: deleteError } = await sharedOnly(supabase.from('subject_lo_mapping').delete().eq('subject_id', subjectId).in('lo_id', ids));
            if (deleteError) throw deleteError;
        }
        return { changedRooms: additions.length || removals.length ? rooms : [] };
    }

    const steps = plans || await planRoomSelection(subjectId, rooms, loIds);
    const additions = steps.flatMap(step => step.toAdd.map(loId => ({
        subject_id: subjectId, lo_id: loId, room_name: step.room, updated_by: actorId, updated_at: now,
    })));
    for (const batch of chunk(additions, 500)) {
        const { error } = await supabase.from('subject_lo_mapping').insert(batch);
        if (error) throw error;
    }
    for (const step of steps.filter(item => item.toRemove.length)) {
        for (const ids of chunk(step.toRemove, 100)) {
            const { error } = await supabase.from('subject_lo_mapping').delete()
                .eq('subject_id', subjectId).eq('room_name', step.room).in('lo_id', ids);
            if (error) throw error;
        }
    }
    const changedRooms = steps.filter(step => step.toAdd.length || step.toRemove.length).map(step => step.room);
    // ให้ทุกแถวของห้องที่เปลี่ยนบอกคนแก้ล่าสุดตรงกัน
    for (const room of changedRooms) {
        const { error } = await supabase.from('subject_lo_mapping').update({ updated_by: actorId, updated_at: now })
            .eq('subject_id', subjectId).eq('room_name', room);
        if (error) throw error;
    }
    if (changedRooms.length) {
        await supabase.from('audit_logs').insert({
            school_id: schoolId || actor?.school_id,
            actor_id: actor?.teacher_id || actor?.id,
            actor_role: actor?.role,
            action: 'save_room_lo_mapping',
            entity_type: 'subject',
            entity_id: subjectId,
            detail: { rooms: changedRooms, lo_count: new Set(loIds).size },
        });
    }
    return { changedRooms };
}
