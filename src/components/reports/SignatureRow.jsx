import { buildSigners, signerNameLine } from '../../lib/reportSigners';

/**
 * ช่องลงชื่อท้ายเอกสารที่พิมพ์ 4 ตำแหน่ง จัด 2 ช่องต่อแถวบนกระดาษ A4
 * school: แถวโรงเรียนที่มีชื่อผู้ลงนาม · teacherName/teacherRole: ช่องแรกของเอกสารฉบับนั้น
 */
export default function SignatureRow({ school, teacherName, teacherRole, className = '', size = 'normal' }) {
    const signers = buildSigners(school, { teacherName, teacherRole });
    // ปกแฟ้มใช้ตัวใหญ่กว่าเอกสารเนื้อหา ให้เข้ากับหัวเรื่องของปก
    const text = { small: 'text-[14pt]', cover: 'text-[18pt]' }[size] || 'text-lg';
    return (
        // ช่องลงชื่อทั้ง 4 ช่องต้องอยู่หน้าเดียวกันเสมอ ไม่แยกไปคนละหน้า
        <div className={`grid break-inside-avoid grid-cols-2 gap-x-10 gap-y-8 text-center ${text} ${className}`}>
            {signers.map(signer => (
                <div key={signer.role}>
                    <p>ลงชื่อ ..............................................</p>
                    <p className="mt-1">({signerNameLine(signer.name, 38)})</p>
                    <p className="mt-1 font-bold">{signer.role}</p>
                </div>
            ))}
        </div>
    );
}
