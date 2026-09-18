import { School } from 'lucide-react';

// หัวเรื่องรับได้ทั้งข้อความเดียวและหลายบรรทัด (array หรือมี \n)
// ภาษาไทยไม่มีช่องว่างระหว่างคำ เบราว์เซอร์บางตัวจึงตัดบรรทัดกลางคำ จึงกำหนดบรรทัดเองและสั่งไม่ให้ตัดคำ
//
// variant = 'cover' ใช้กับปกแฟ้ม: ตราโรงเรียนกึ่งกลางบนสุดขนาดใหญ่ ชื่อโรงเรียนอยู่ใต้บรรทัดคำอธิบาย และไม่มีเส้นคั่น
const THAI_LINE = { wordBreak: 'keep-all', lineBreak: 'strict' };

function SchoolLogo({ school, className, iconClassName }) {
    if (school?.logo_data_url) {
        return <img src={school.logo_data_url} alt={`ตรา${school.school_name || 'โรงเรียน'}`} className={`${className} shrink-0 object-contain`} />;
    }
    return (
        <span className={`${className} flex shrink-0 items-center justify-center rounded-full border-2 border-slate-400 text-slate-500`} aria-label="ยังไม่ได้ตั้งค่าตราโรงเรียน">
            <School className={iconClassName} />
        </span>
    );
}

export default function SchoolReportHeader({ school, title, subtitle, compact = false, variant = 'default' }) {
    const titleLines = (Array.isArray(title) ? title : String(title ?? '').split('\n')).filter(line => String(line).trim());

    if (variant === 'cover') {
        return (
            <header className="school-report-header flex flex-col items-center text-center text-black">
                <SchoolLogo school={school} className="h-40 w-40" iconClassName="h-20 w-20" />
                <h1 className="mt-5 text-4xl font-bold leading-snug" style={THAI_LINE}>
                    {titleLines.map((line, index) => <span key={line} className={index === 0 ? 'block' : 'mt-1 block'}>{line}</span>)}
                </h1>
                {subtitle && <p className="mt-2 text-xl" style={THAI_LINE}>{subtitle}</p>}
                <p className="mt-2 text-2xl font-bold" style={THAI_LINE}>{school?.school_name || 'โรงเรียน'}</p>
            </header>
        );
    }

    return (
        <header className={`school-report-header flex items-center border-b-2 border-slate-900 ${compact ? 'gap-4 pb-4' : 'gap-6 pb-6'}`}>
            <SchoolLogo school={school} className={compact ? 'h-16 w-16' : 'h-24 w-24'} iconClassName={compact ? 'h-8 w-8' : 'h-11 w-11'} />
            <div className="min-w-0 flex-1 text-center">
                <p className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-black`}>{school?.school_name || 'โรงเรียน'}</p>
                <h1 className={`${compact ? 'mt-1 text-xl' : 'mt-3 text-3xl'} font-bold leading-snug text-black`} style={THAI_LINE}>
                    {titleLines.map((line, index) => <span key={line} className={index === 0 ? 'block' : 'mt-1 block'}>{line}</span>)}
                </h1>
                {subtitle && <p className={`${compact ? 'mt-1 text-sm' : 'mt-2 text-lg'} text-black`}>{subtitle}</p>}
            </div>
            <span className={`${compact ? 'h-16 w-16' : 'h-24 w-24'} shrink-0`} aria-hidden="true" />
        </header>
    );
}
