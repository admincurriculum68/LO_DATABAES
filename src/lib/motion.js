// คนที่ตั้งค่าเครื่องให้ลดการเคลื่อนไหว (เช่นคนที่เวียนหัวง่าย) ไม่ควรเจอการเลื่อนหน้าแบบนุ่ม ๆ
export function scrollBehavior() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
