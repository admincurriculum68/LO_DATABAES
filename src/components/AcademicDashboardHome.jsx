import {
    ArrowRight,
    BarChart3,
    BookOpenCheck,
    CheckCircle2,
    ClipboardCheck,
    Database,
    FileBarChart2,
    FileSpreadsheet,
    GraduationCap,
    Link2,
    School,
    ShieldCheck,
    Upload,
    UsersRound,
} from 'lucide-react';

const Metric = ({ icon: Icon, label, value, unit, tone = 'indigo' }) => {
    const tones = {
        indigo: 'bg-indigo-50 text-indigo-700',
        blue: 'bg-blue-50 text-blue-700',
        emerald: 'bg-emerald-50 text-emerald-700',
        violet: 'bg-violet-50 text-violet-700',
    };
    return (
        <div className="flex min-w-0 items-center gap-3 border-b border-slate-200 p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-5">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-600">{label}</p><p className="mt-0.5 text-2xl font-extrabold tabular-nums text-slate-950">{value.toLocaleString()} <span className="text-sm font-semibold text-slate-500">{unit}</span></p></div>
        </div>
    );
};

export default function AcademicDashboardHome({ stats, onOpenTab, onNavigate }) {
    const learningFormatCount = stats.subjects + stats.contexts;
    const setupChecks = [
        { label: 'ข้อมูลครูและบุคลากร', ready: stats.teachers > 0, action: () => onOpenTab('data') },
        { label: 'ข้อมูลนักเรียน', ready: stats.students > 0, action: () => onOpenTab('data') },
        { label: 'รูปแบบการจัดการเรียนรู้', ready: learningFormatCount > 0, action: () => onNavigate('/admin/learning-contexts') },
        { label: 'ผลลัพธ์การเรียนรู้ (LO)', ready: stats.learningOutcomes > 0, action: () => onOpenTab('import') },
    ];
    const readyCount = setupChecks.filter(item => item.ready).length;

    const managementItems = [
        { title: 'ข้อมูลพื้นฐานสถานศึกษา', description: 'ครู บุคลากร นักเรียน และข้อมูลที่ใช้ในระบบ', icon: Database, action: () => onOpenTab('data') },
        { title: 'นำเข้าข้อมูล', description: 'นำเข้าจาก DMC, Excel หรือ CSV', icon: Upload, action: () => onOpenTab('import') },
        { title: 'รูปแบบการจัดการเรียนรู้', description: 'วิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม', icon: BookOpenCheck, action: () => onNavigate('/admin/learning-contexts') },
        { title: 'กำหนด LO ของวิชา', description: 'เลือกผลลัพธ์การเรียนรู้ที่ครูต้องประเมิน', icon: Link2, action: () => onOpenTab('mapping') },
        { title: 'จัดนักเรียนเข้ากลุ่มเรียน', description: 'กำหนดรายชื่อนักเรียนสำหรับแต่ละวิชา', icon: UsersRound, action: () => onOpenTab('enrollment') },
        { title: 'เลื่อนชั้นและจัดห้องเรียน', description: 'เตรียมข้อมูลผู้เรียนสำหรับปีการศึกษาถัดไป', icon: GraduationCap, action: () => onOpenTab('promotion') },
    ];

    const reports = [
        { title: 'ผลราย LO', icon: FileBarChart2, path: '/admin/report-lo' },
        { title: 'ผลรายด้านความสามารถ', icon: BarChart3, path: '/admin/report-competency' },
        { title: 'รายงานผลการเรียน ปพ.๖', icon: FileSpreadsheet, path: '/admin/yearly-report' },
        { title: 'รายงานจบช่วงชั้น', icon: School, path: '/admin/phase-report' },
    ];

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><h2 className="text-2xl font-extrabold text-slate-950">ภาพรวมงานวิชาการ</h2><p className="mt-1 text-sm text-slate-600">ตรวจสอบสถานะและเลือกงานที่ต้องการดำเนินการได้จากหน้านี้</p></div>
                <button onClick={() => onNavigate('/admin/approval')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-extrabold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2"><ShieldCheck className="h-5 w-5" /> ตรวจสอบและรับรองผล</button>
            </header>

            <section className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4" aria-label="ข้อมูลภาพรวม">
                <Metric icon={GraduationCap} label="ครูและบุคลากร" value={stats.teachers} unit="คน" tone="blue" />
                <Metric icon={UsersRound} label="นักเรียน" value={stats.students} unit="คน" tone="indigo" />
                <Metric icon={BookOpenCheck} label="รูปแบบการเรียนรู้" value={learningFormatCount} unit="รายการ" tone="violet" />
                <Metric icon={ClipboardCheck} label="ผลลัพธ์การเรียนรู้" value={stats.learningOutcomes} unit="LO" tone="emerald" />
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="management-heading">
                    <div className="border-b border-slate-200 px-5 py-4"><h3 id="management-heading" className="font-extrabold text-slate-950">งานบริหารจัดการ</h3><p className="mt-0.5 text-sm text-slate-600">ทุกเมนูสามารถเข้าใช้งานได้ทันที</p></div>
                    <div className="grid sm:grid-cols-2">
                        {managementItems.map((item, index) => {
                            const Icon = item.icon;
                            return <button key={item.title} onClick={item.action} className={`group flex min-h-24 items-start gap-3 p-5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${index % 2 === 0 ? 'sm:border-r' : ''} ${index < managementItems.length - 2 ? 'border-b' : ''} border-slate-200`}><span className="rounded-xl bg-slate-100 p-2.5 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-700"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><strong className="block text-sm text-slate-900">{item.title}</strong><span className="mt-1 block text-sm leading-5 text-slate-600">{item.description}</span></span><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-700" /></button>;
                        })}
                    </div>
                </section>

                <aside className="space-y-6">
                    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h3 className="font-extrabold text-slate-950">ความพร้อมของข้อมูล</h3><p className="mt-0.5 text-sm text-slate-600">พร้อมแล้ว {readyCount} จาก {setupChecks.length} รายการ</p></div><span className={`rounded-full px-3 py-1 text-xs font-extrabold ${readyCount === setupChecks.length ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{Math.round((readyCount / setupChecks.length) * 100)}%</span></div>
                        <div className="divide-y divide-slate-200">{setupChecks.map(item => <button key={item.label} onClick={item.action} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"><CheckCircle2 className={`h-5 w-5 ${item.ready ? 'text-emerald-600' : 'text-slate-300'}`} /><span className="flex-1 text-sm font-semibold text-slate-700">{item.label}</span><span className={`text-xs font-bold ${item.ready ? 'text-emerald-700' : 'text-amber-700'}`}>{item.ready ? 'พร้อม' : 'รอดำเนินการ'}</span></button>)}</div>
                    </section>

                    <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                        <div className="flex items-start gap-3"><span className="rounded-xl bg-indigo-700 p-2.5 text-white"><ShieldCheck className="h-5 w-5" /></span><div><h3 className="font-extrabold text-indigo-950">ศูนย์ตรวจสอบผล</h3><p className="mt-1 text-sm leading-5 text-indigo-900">ตรวจหลักฐานจากครู ติดตามรายการที่ยังไม่ครบ และรับรองผล LO ขั้นสุดท้าย</p></div></div>
                        <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => onOpenTab('progress')} className="min-h-10 rounded-xl border border-indigo-200 bg-white px-3 text-sm font-bold text-indigo-800 hover:bg-indigo-100">ติดตามการประเมิน</button><button onClick={() => onNavigate('/admin/approval')} className="min-h-10 rounded-xl bg-indigo-700 px-3 text-sm font-bold text-white hover:bg-indigo-800">รับรองผล</button></div>
                    </section>
                </aside>
            </div>

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="reports-heading">
                <div className="border-b border-slate-200 px-5 py-4"><h3 id="reports-heading" className="font-extrabold text-slate-950">รายงานทางวิชาการ</h3><p className="mt-0.5 text-sm text-slate-600">ตรวจสอบ ส่งออก และจัดพิมพ์รายงาน</p></div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-4">{reports.map((report, index) => { const Icon = report.icon; return <button key={report.path} onClick={() => onNavigate(report.path)} className={`group flex min-h-20 items-center gap-3 p-5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 ${index < reports.length - 1 ? 'border-b sm:border-b-0 sm:border-r' : ''} border-slate-200`}><Icon className="h-5 w-5 shrink-0 text-indigo-700" /><span className="flex-1 text-sm font-bold text-slate-800">{report.title}</span><ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-700" /></button>; })}</div>
            </section>
        </div>
    );
}
