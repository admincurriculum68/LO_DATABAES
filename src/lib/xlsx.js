// ไลบรารี Excel ใหญ่ราว 424KB แต่ใช้เฉพาะตอนนำเข้าและส่งออกไฟล์
// จึงโหลดเมื่อผู้ใช้กดปุ่มเท่านั้น ครูที่แค่เปิดหน้าสรุปผลจะไม่ต้องรอดาวน์โหลด
let pending = null;

export function loadXLSX() {
    pending ??= import('xlsx');
    return pending;
}
