import { buildSigners, signerNameLine } from '../../lib/reportSigners';

/**
 * ช่องลงชื่อท้ายเอกสารที่พิมพ์ 4 ตำแหน่ง จัด 2 ช่องต่อแถวบนกระดาษ A4
 * school: แถวโรงเรียนที่มีชื่อผู้ลงนาม · teacherName/teacherRole: ช่องแรกของเอกสารฉบับนั้น
 */
export default function SignatureRow({ school, teacherName, teacherRole, className = '', size = 'normal' }) {
    const signers = buildSigners(school, { teacherName, teacherRole });
    const text = size === 'small' ? 'text-[13pt]' : 'text-lg';
    return (
        <div className={`grid grid-cols-2 gap-x-10 gap-y-8 text-center ${text} ${className}`}>
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
