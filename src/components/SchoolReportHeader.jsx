import { School } from 'lucide-react';

export default function SchoolReportHeader({ school, title, subtitle, compact = false }) {
    return (
        <header className={`school-report-header flex items-center border-b-2 border-slate-900 ${compact ? 'gap-4 pb-4' : 'gap-6 pb-6'}`}>
            {school?.logo_data_url ? (
                <img
                    src={school.logo_data_url}
                    alt={`ตรา${school.school_name || 'โรงเรียน'}`}
                    className={`${compact ? 'h-16 w-16' : 'h-24 w-24'} shrink-0 object-contain`}
                />
            ) : (
                <span className={`${compact ? 'h-16 w-16' : 'h-24 w-24'} flex shrink-0 items-center justify-center rounded-full border-2 border-slate-400 text-slate-500`} aria-label="ยังไม่ได้ตั้งค่าตราโรงเรียน">
                    <School className={compact ? 'h-8 w-8' : 'h-11 w-11'} />
                </span>
            )}
            <div className="min-w-0 flex-1 text-center">
                <p className={`${compact ? 'text-lg' : 'text-2xl'} font-bold text-black`}>{school?.school_name || 'โรงเรียน'}</p>
                <h1 className={`${compact ? 'mt-1 text-xl' : 'mt-3 text-3xl'} font-bold text-black`}>{title}</h1>
                {subtitle && <p className={`${compact ? 'mt-1 text-sm' : 'mt-2 text-lg'} text-black`}>{subtitle}</p>}
            </div>
            <span className={`${compact ? 'h-16 w-16' : 'h-24 w-24'} shrink-0`} aria-hidden="true" />
        </header>
    );
}

