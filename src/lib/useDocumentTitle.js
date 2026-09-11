import { useEffect } from 'react';

// ชื่อแท็บของแต่ละหน้าต้องไม่ซ้ำกัน โปรแกรมอ่านหน้าจอประกาศชื่อนี้เมื่อเปลี่ยนหน้า
// และครูที่เปิดหลายแท็บพร้อมกันใช้ชื่อนี้แยกแท็บ (WCAG 2.4.2)
// คอมโพเนนต์แม่เรียกทีหลังลูก ชื่อที่เจาะจงกว่าจึงทับชื่อทั่วไปของ Layout ได้
export default function useDocumentTitle(title) {
    useEffect(() => {
        document.title = title ? `${title} — CBE Track` : 'CBE Track — ระบบติดตามผลลัพธ์การเรียนรู้ สพฐ.';
    }, [title]);
}
