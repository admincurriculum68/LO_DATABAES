// ครูผู้สอนเสนอ LO ของวิชา ฝ่ายวิชาการอนุมัติแล้วล็อก
//
// subject_lo_proposals เก็บสิ่งที่ครูเลือกไว้ subject_lo_mapping คือของจริงที่ทุกหน้าใช้
// ไฟล์นี้ต้องไม่เรียกฐานข้อมูล เพื่อให้ node --test นำเข้าไปทดสอบได้โดยตรง

export const PROPOSAL_STATUS = {
    none: { label: 'ยังไม่เลือก LO', chip: 'chip-neutral', short: 'ยังไม่เลือก' },
    draft: { label: 'ครูกำลังเลือก', chip: 'chip-info', short: 'กำลังเลือก' },
    submitted: { label: 'รอฝ่ายวิชาการอนุมัติ', chip: 'chip-warning', short: 'รออนุมัติ' },
    returned: { label: 'ฝ่ายวิชาการส่งกลับให้แก้', chip: 'chip-danger', short: 'ส่งกลับ' },
    approved: { label: 'อนุมัติแล้ว', chip: 'chip-success', short: 'อนุมัติแล้ว' },
};

/**
 * สถานะของวิชาหนึ่ง
 * วิชาที่ฝ่ายวิชาการกำหนด LO ไว้ก่อนมีระบบนี้ (มี mapping แต่ไม่มีแถว proposal) ถือว่าอนุมัติแล้ว
 */
export function statusOf(proposal, savedLoIds) {
    if (proposal?.status && PROPOSAL_STATUS[proposal.status]) return proposal.status;
    const saved = savedLoIds instanceof Set ? savedLoIds.size : (savedLoIds || []).length;
    return saved > 0 ? 'approved' : 'none';
}

/** ครูแก้ LO ได้เฉพาะตอนที่ยังไม่ส่ง หรือถูกส่งกลับมาให้แก้ */
export function teacherCanEdit(status) {
    return status === 'none' || status === 'draft' || status === 'returned';
}

/** LO ที่ต้องแสดงบนหน้าจอ: สิ่งที่ครูเลือกไว้ ถ้ายังไม่มีก็ใช้ของจริงที่อนุมัติไว้แล้ว */
export function selectionOfProposal(proposal, savedLoIds) {
    if (proposal?.lo_ids?.length) return new Set(proposal.lo_ids);
    if (proposal && proposal.lo_ids) return new Set();
    return new Set(savedLoIds || []);
}

/** นับวิชาตามสถานะ ใช้ทั้งเช็กลิสต์ตั้งค่าข้อมูลและหน้าอนุมัติ */
export function proposalSummary(subjects, proposalBySubject, savedBySubject) {
    const counts = { total: 0, none: 0, draft: 0, submitted: 0, returned: 0, approved: 0 };
    (subjects || []).forEach(subject => {
        const id = subject.subject_id;
        counts.total += 1;
        counts[statusOf(proposalBySubject?.get(id), savedBySubject?.get(id))] += 1;
    });
    return counts;
}

/** ข้อความบอกว่าใครแก้ล่าสุดเมื่อไหร่ ใช้เตือนครูที่สอนวิชาเดียวกันหลายคน */
export function lastEditedText(proposal, nameById) {
    if (!proposal?.updated_at) return '';
    const name = nameById?.get(proposal.updated_by) || '';
    const when = new Date(proposal.updated_at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
    return name ? `แก้ล่าสุดโดย ${name} เมื่อ ${when}` : `แก้ล่าสุดเมื่อ ${when}`;
}
