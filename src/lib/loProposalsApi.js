import { fetchAllByIn, supabase } from './supabase';
import { diffMapping } from './loMapping';

// เรียกฐานข้อมูลสำหรับการเสนอ LO ของครูและการอนุมัติของฝ่ายวิชาการ
// ต้องมีตาราง subject_lo_proposals (สร้างด้วย update_schema_lo_proposals.sql)
// ถ้ายังไม่ได้รัน SQL หน้าจอต้องทำงานแบบเดิมได้ ไม่ใช่พังทั้งหน้า

export const PROPOSAL_SELECT = 'proposal_id, subject_id, lo_ids, status, review_note, updated_by, updated_at, submitted_by, submitted_at, reviewed_by, reviewed_at';
export const LO_PROPOSAL_SQL_HINT = 'ฐานข้อมูลยังไม่รองรับการให้ครูเลือก LO เอง ผู้ดูแลระบบต้องรันไฟล์ update_schema_lo_proposals.sql ใน Supabase ก่อน ระหว่างนี้ฝ่ายวิชาการกำหนด LO ให้ได้ตามเดิม';

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

// จำผลไว้เฉพาะเมื่อรู้แน่ว่ามีหรือไม่มีตาราง ถ้าเน็ตหลุดจะถามใหม่ครั้งหน้า
let supported = null;

export async function loProposalsSupported() {
    if (supported !== null) return supported;
    const { error } = await supabase.from('subject_lo_proposals').select('proposal_id').limit(1);
    if (!error) supported = true;
    else if (error.code === '42P01') supported = false;
    return supported ?? false;
}

/** แถวการเสนอ LO ของวิชาเหล่านี้ คืน Map subject_id → แถว */
export async function loadProposals(subjectIds) {
    if (!(await loProposalsSupported())) return new Map();
    const rows = await fetchAllByIn(subjectIds, (batch, from, to) => supabase
        .from('subject_lo_proposals').select(PROPOSAL_SELECT).in('subject_id', batch).range(from, to));
    return new Map(rows.map(row => [row.subject_id, row]));
}

/** LO ที่อนุมัติไว้แล้วจริง ๆ ของวิชาเหล่านี้ คืน Map subject_id → Set(lo_id) */
export async function loadApprovedMappings(subjectIds) {
    const rows = await fetchAllByIn(subjectIds, (batch, from, to) => supabase
        .from('subject_lo_mapping').select('subject_id, lo_id').in('subject_id', batch).range(from, to));
    const map = new Map((subjectIds || []).map(id => [id, new Set()]));
    rows.forEach(row => {
        if (!map.has(row.subject_id)) map.set(row.subject_id, new Set());
        map.get(row.subject_id).add(row.lo_id);
    });
    return map;
}

async function writeAudit(actor, action, detail) {
    await supabase.from('audit_logs').insert({
        school_id: actor.school_id,
        actor_id: actor.teacher_id || actor.id,
        actor_role: actor.role,
        action,
        entity_type: 'subject_lo',
        entity_id: detail.subject_id || null,
        detail,
    });
}

/**
 * บันทึกสิ่งที่ครูเลือก (status 'draft' หรือ 'submitted')
 * วิชาหนึ่งมีครูได้หลายคน ถ้าครูอีกคนแก้ไปแล้วจะไม่เขียนทับ แต่คืน { conflict, current } ให้หน้าจอบอกให้โหลดใหม่
 */
export async function saveProposal({ schoolId, subjectId, loIds, actor, proposal, status = 'draft' }) {
    const now = new Date().toISOString();
    const values = {
        lo_ids: [...loIds],
        status,
        updated_by: actor.teacher_id || null,
        updated_at: now,
        ...(status === 'submitted' ? { submitted_by: actor.teacher_id || null, submitted_at: now, review_note: null } : {}),
    };

    if (!proposal?.proposal_id) {
        const { data, error } = await supabase.from('subject_lo_proposals')
            .insert({ school_id: schoolId, subject_id: subjectId, ...values }).select(PROPOSAL_SELECT).single();
        // ครูอีกคนเพิ่งสร้างแถวของวิชานี้พอดี ให้โหลดของเขามาแสดงแทนการเขียนทับ
        if (error?.code === '23505') return { conflict: true, current: await reloadProposal(subjectId) };
        if (error) throw error;
        if (status === 'submitted') await writeAudit(actor, 'submit_lo_proposal', { subject_id: subjectId, lo_count: values.lo_ids.length });
        return { row: data };
    }

    const { data, error } = await supabase.from('subject_lo_proposals')
        .update(values).eq('proposal_id', proposal.proposal_id).eq('updated_at', proposal.updated_at)
        .select(PROPOSAL_SELECT);
    if (error) throw error;
    if (!data?.length) return { conflict: true, current: await reloadProposal(subjectId) };
    if (status === 'submitted') await writeAudit(actor, 'submit_lo_proposal', { subject_id: subjectId, lo_count: values.lo_ids.length });
    return { row: data[0] };
}

async function reloadProposal(subjectId) {
    const { data } = await supabase.from('subject_lo_proposals').select(PROPOSAL_SELECT).eq('subject_id', subjectId).maybeSingle();
    return data || null;
}

/** ฝ่ายวิชาการส่งกลับให้ครูแก้ ใช้ทั้งกับวิชาที่รออนุมัติและวิชาที่อนุมัติไปแล้ว (ปลดล็อก) */
export async function returnProposal({ schoolId, subjectId, reason, actor, proposal, loIds }) {
    const now = new Date().toISOString();
    const values = {
        status: 'returned',
        review_note: reason,
        reviewed_by: actor.teacher_id || null,
        reviewed_at: now,
        updated_at: now,
    };
    let row;
    if (proposal?.proposal_id) {
        const { data, error } = await supabase.from('subject_lo_proposals')
            .update(values).eq('proposal_id', proposal.proposal_id).select(PROPOSAL_SELECT).single();
        if (error) throw error;
        row = data;
    } else {
        // วิชาที่ฝ่ายวิชาการกำหนดไว้ก่อนมีระบบนี้ ยังไม่มีแถว ให้สร้างจาก LO ที่ใช้อยู่จริง
        const { data, error } = await supabase.from('subject_lo_proposals')
            .insert({ school_id: schoolId, subject_id: subjectId, lo_ids: [...(loIds || [])], ...values })
            .select(PROPOSAL_SELECT).single();
        if (error) throw error;
        row = data;
    }
    await writeAudit(actor, 'return_lo_proposal', { subject_id: subjectId, reason });
    return row;
}

/** ผลการประเมินที่ครูบันทึกไว้แล้วใน LO ที่กำลังจะถูกเอาออก ใช้เตือนก่อนอนุมัติ */
export async function countEvaluationsAtRisk(plans) {
    const removedBySubject = new Map(plans.map(plan => [plan.subjectId, new Set(plan.toRemove)]));
    const enrollments = await fetchAllByIn([...removedBySubject.keys()], (batch, from, to) => supabase
        .from('student_enrollments').select('enrollment_id, subject_id').in('subject_id', batch).range(from, to));
    const subjectByEnrollment = new Map(enrollments.map(row => [row.enrollment_id, row.subject_id]));
    const evaluations = await fetchAllByIn([...subjectByEnrollment.keys()], (batch, from, to) => supabase
        .from('lo_evaluations').select('enrollment_id, lo_id').in('enrollment_id', batch).range(from, to));
    return evaluations.filter(row => removedBySubject.get(subjectByEnrollment.get(row.enrollment_id))?.has(row.lo_id)).length;
}

/** แผนการเขียน LO จริงของแต่ละวิชา เทียบกับฐานข้อมูลล่าสุด ไม่ใช่ค่าที่โหลดไว้ตอนเปิดหน้า */
export async function planApproval(entries) {
    const subjectIds = entries.map(entry => entry.subjectId);
    const current = await loadApprovedMappings(subjectIds);
    return entries.map(entry => ({
        subjectId: entry.subjectId,
        loIds: [...entry.loIds],
        ...diffMapping(current.get(entry.subjectId), entry.loIds),
    }));
}

/**
 * อนุมัติ: เขียน LO ลง subject_lo_mapping ให้ตรงกับที่อนุมัติ แล้วตั้งสถานะเป็น approved
 * เพิ่มก่อนลบ ถ้าการเพิ่มล้ม LO เดิมของวิชายังอยู่ครบ
 */
export async function approveSubjects({ schoolId, entries, actor, plans }) {
    const steps = plans || await planApproval(entries);
    const additions = steps.flatMap(step => step.toAdd.map(loId => ({ subject_id: step.subjectId, lo_id: loId })));
    for (const rows of chunk(additions, 500)) {
        const { error } = await supabase.from('subject_lo_mapping').insert(rows);
        if (error) throw error;
    }
    for (const step of steps.filter(item => item.toRemove.length)) {
        for (const loIds of chunk(step.toRemove, 100)) {
            const { error } = await supabase.from('subject_lo_mapping').delete().eq('subject_id', step.subjectId).in('lo_id', loIds);
            if (error) throw error;
        }
    }

    const now = new Date().toISOString();
    const rows = steps.map(step => ({
        school_id: schoolId,
        subject_id: step.subjectId,
        lo_ids: step.loIds,
        status: 'approved',
        review_note: null,
        reviewed_by: actor.teacher_id || null,
        reviewed_at: now,
        updated_at: now,
    }));
    let saved = [];
    if (await loProposalsSupported()) {
        for (const batch of chunk(rows, 200)) {
            const { data, error } = await supabase.from('subject_lo_proposals')
                .upsert(batch, { onConflict: 'subject_id' }).select(PROPOSAL_SELECT);
            if (error) throw error;
            saved = saved.concat(data || []);
        }
    }
    await writeAudit(actor, 'approve_lo_proposal', {
        subject_count: steps.length,
        added: steps.reduce((sum, step) => sum + step.toAdd.length, 0),
        removed: steps.reduce((sum, step) => sum + step.toRemove.length, 0),
    });
    return saved;
}
