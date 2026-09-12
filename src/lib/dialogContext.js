import { createContext, useContext } from 'react';

export const DialogContext = createContext(null);

// ใช้แทน window.confirm และ window.prompt ทั้งระบบ ทุกคำสั่งคืนค่าเป็น Promise
//   confirm({ title, message, confirmLabel, tone }) → true เมื่อยืนยัน false เมื่อยกเลิก
//   prompt({ title, message, inputLabel, placeholder }) → ข้อความที่กรอก หรือ null เมื่อยกเลิก
//   undo(message, onUndo) → แจ้งผลพร้อมปุ่ม "เลิกทำ" ค้างไว้ 8 วินาที
export function useDialog() {
    const context = useContext(DialogContext);
    if (!context) throw new Error('useDialog ต้องใช้ภายใน DialogProvider');
    return context;
}
