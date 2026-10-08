import { useEffect, useRef } from 'react';

// เวลาบันทึกอัตโนมัติของหน้าที่ครูพิมพ์ยาว (บันทึกข้อความ LO และสรุปความสามารถรายด้าน)
// ใช้ค่าเดียวทั้งตัวจับเวลาและข้อความบนจอ ข้อความจะได้ตรงกับเวลาจริงเสมอ
// โรงเรียนขอให้บันทึกถี่ขึ้นจาก 30 วินาที เพราะครูมักปิดหน้าไปก่อนระบบบันทึก
export const AUTOSAVE_SECONDS = 10;
export const AUTOSAVE_MS = AUTOSAVE_SECONDS * 1000;
const MAX_BACKOFF_MS = 120000;

/** เวลารอก่อนลองบันทึกอัตโนมัติรอบถัดไป ล้มติดกันกี่ครั้งก็รอนานขึ้นเท่าตัว แต่ไม่เกิน 2 นาที */
export function autosaveDelay(failures) {
    return Math.min(AUTOSAVE_MS * 2 ** Math.max(0, failures), MAX_BACKOFF_MS);
}

/**
 * บันทึกอัตโนมัติ AUTOSAVE_SECONDS วินาทีหลังมีการแก้ แล้วหยุดรอถ้ากำลังบันทึกอยู่
 * save ต้องคืน false เมื่อบันทึกไม่สำเร็จ ระบบจะรอนานขึ้นก่อนลองใหม่ ไม่ยิงซ้ำทุก 10 วินาทีตอนเน็ตหลุด
 */
export function useAutosave({ dirty, saving, save }) {
    const saveRef = useRef(save);
    const failuresRef = useRef(0);
    useEffect(() => { saveRef.current = save; });
    useEffect(() => {
        if (!dirty || saving) return undefined;
        const timer = setTimeout(async () => {
            const ok = await saveRef.current();
            failuresRef.current = ok === false ? failuresRef.current + 1 : 0;
        }, autosaveDelay(failuresRef.current));
        return () => clearTimeout(timer);
    }, [dirty, saving]);
}
