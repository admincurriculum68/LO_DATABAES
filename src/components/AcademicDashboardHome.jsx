import {
    ArrowRight,
    Award,
    BarChart3,
    BookOpenCheck,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    Compass,
    Database,
    FileBarChart2,
    FileSpreadsheet,
    GraduationCap,
    Layers,
    Link2,
    School,
    ShieldCheck,
    Sparkles,
    Upload,
    UserCheck,
    UsersRound,
} from 'lucide-react';

const MetricCard = ({ icon: Icon, label, value, unit, colorScheme = 'indigo', onClick }) => {
    const colorStyles = {
        indigo: 'from-indigo-500/10 via-indigo-500/5 to-transparent text-indigo-700 border-indigo-200/80 icon-bg:bg-indigo-600',
        blue: 'from-blue-500/10 via-blue-500/5 to-transparent text-blue-700 border-blue-200/80 icon-bg:bg-blue-600',
        emerald: 'from-emerald-500/10 via-emerald-500/5 to-transparent text-emerald-700 border-emerald-200/80 icon-bg:bg-emerald-600',
        violet: 'from-violet-500/10 via-violet-500/5 to-transparent text-violet-700 border-violet-200/80 icon-bg:bg-violet-600',
    };

    const iconBgs = {
        indigo: 'bg-indigo-600 text-white shadow-indigo-500/30',
        blue: 'bg-blue-600 text-white shadow-blue-500/30',
        emerald: 'bg-emerald-600 text-white shadow-emerald-500/30',
        violet: 'bg-violet-600 text-white shadow-violet-500/30',
    };

    return (
        <div
            onClick={onClick}
            className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md ${
                onClick ? 'cursor-pointer' : ''
            } ${colorStyles[colorScheme]}`}
        >
            <div className="flex items-center justify-between">
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-md ${iconBgs[colorScheme]}`}>
                    <Icon className="h-6 w-6" />
                </span>
                <span className="text-xs font-bold text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 flex items-center gap-0.5">
                    เปิดดู <ChevronRight className="h-3.5 w-3.5" />
                </span>
            </div>

            <div className="mt-4 space-y-1">
                <p className="text-xs font-bold text-slate-500">{label}</p>
                <p className="text-3xl font-black tabular-nums tracking-tight text-slate-900">
                    {value.toLocaleString()} <span className="text-xs font-bold text-slate-500">{unit}</span>
                </p>
            </div>
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
    const readyPercent = Math.round((readyCount / setupChecks.length) * 100);

    const managementItems = [
        { title: 'ข้อมูลพื้นฐานสถานศึกษา', description: 'ครู บุคลากร นักเรียน และโครงสร้างข้อมูล', icon: Database, action: () => onOpenTab('data'), color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
        { title: 'นำเข้าข้อมูลอัตโนมัติ', description: 'นำเข้าจาก DMC, Excel หรือ CSV ได้ใน 1 คลิก', icon: Upload, action: () => onOpenTab('import'), color: 'text-sky-600 bg-sky-50 border-sky-100' },
        { title: 'รูปแบบการจัดการเรียนรู้', description: 'วิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม', icon: BookOpenCheck, action: () => onNavigate('/admin/learning-contexts'), color: 'text-violet-600 bg-violet-50 border-violet-100' },
        { title: 'กำหนด LO ของวิชา', description: 'เลือกผลลัพธ์การเรียนรู้ที่ครูต้องประเมิน', icon: Link2, action: () => onOpenTab('mapping'), color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
        { title: 'จัดนักเรียนเข้ากลุ่มเรียน', description: 'กำหนดรายชื่อนักเรียนสำหรับแต่ละวิชา', icon: UsersRound, action: () => onOpenTab('enrollment'), color: 'text-amber-600 bg-amber-50 border-amber-100' },
        { title: 'เลื่อนชั้นและจัดห้องเรียน', description: 'ปรับระดับชั้นและเตรียมข้อมูลปีถัดไป', icon: GraduationCap, action: () => onOpenTab('promotion'), color: 'text-rose-600 bg-rose-50 border-rose-100' },
    ];

    const reports = [
        { title: 'ผลการประเมินราย LO', description: 'การกระจายระดับความสามารถแยกรายข้อ', icon: FileBarChart2, path: '/admin/report-lo', color: 'text-indigo-600 bg-indigo-50' },
        { title: 'ผลรายด้านความสามารถ', description: 'เปรียบเทียบตามสมรรถนะหลัก 8 ด้าน', icon: BarChart3, path: '/admin/report-competency', color: 'text-sky-600 bg-sky-50' },
        { title: 'รายงานผลการเรียน ปพ.๖', description: 'สมุดรายงานผลพัฒนาการผู้เรียนรายปี', icon: FileSpreadsheet, path: '/admin/yearly-report', color: 'text-emerald-600 bg-emerald-50' },
        { title: 'รายงานจบช่วงชั้น', description: 'สรุปการผ่านเกณฑ์เมื่อจบ ป.3 / ป.6', icon: School, path: '/admin/phase-report', color: 'text-amber-600 bg-amber-50' },
    ];

    return (
        <div className="space-y-6">
            
            {/* Top Dashboard Hero Banner */}
            <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl ring-1 ring-white/10">
                <div className="absolute -right-10 -top-10 h-56 w-56 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="absolute -left-10 -bottom-10 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2 max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-indigo-500/20 px-3.5 py-1 text-xs font-semibold text-indigo-200 border border-indigo-400/20 backdrop-blur-md">
                            <Sparkles className="h-3.5 w-3.5 text-indigo-300" /> ระบบบริหารจัดการงานวิชาการ พ.ศ. 2568
                        </div>
                        <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
                            ภาพรวมงานวิชาการและศูนย์รับรองผล
                        </h1>
                        <p className="text-xs sm:text-sm leading-relaxed text-indigo-100/80">
                            ตรวจสอบสถานะความพร้อมข้อมูล ติดตามการประเมินครูผู้สอน และดำเนินการรับรองผลลัพธ์การเรียนรู้ขั้นสุดท้าย
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={() => onOpenTab('progress')}
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
                        >
                            <ClipboardCheck className="h-4 w-4 text-sky-300" /> ติดตามการประเมิน
                        </button>
                        <button
                            onClick={() => onNavigate('/admin/approval')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-indigo-700 px-5 py-3 text-xs font-black text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-indigo-800"
                        >
                            <ShieldCheck className="h-4 w-4" /> ศูนย์รับรองผล LO
                        </button>
                    </div>
                </div>
            </header>

            {/* Metrics Overview Grid */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ข้อมูลภาพรวม">
                <MetricCard icon={GraduationCap} label="ครูและบุคลากร" value={stats.teachers} unit="คน" colorScheme="blue" onClick={() => onOpenTab('data')} />
                <MetricCard icon={UsersRound} label="นักเรียนในระบบ" value={stats.students} unit="คน" colorScheme="indigo" onClick={() => onOpenTab('data')} />
                <MetricCard icon={BookOpenCheck} label="รูปแบบการเรียนรู้" value={learningFormatCount} unit="รายการ" colorScheme="violet" onClick={() => onNavigate('/admin/learning-contexts')} />
                <MetricCard icon={ClipboardCheck} label="ผลลัพธ์การเรียนรู้" value={stats.learningOutcomes} unit="LO" colorScheme="emerald" onClick={() => onOpenTab('import')} />
            </section>

            {/* Main Content Grid: Management Tasks vs Readiness Sidebar */}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                
                {/* Left: Management Hub Cards Grid */}
                <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm" aria-labelledby="management-heading">
                    <div className="border-b border-slate-100 p-6">
                        <h2 id="management-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                            <Compass className="h-5 w-5 text-indigo-600" /> งานบริหารจัดการวิชาการ
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">เลือกเมนูด้านล่างเพื่อตั้งค่าข้อมูลหรือดำเนินการ</p>
                    </div>

                    <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
                        {managementItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.title}
                                    onClick={item.action}
                                    className="group flex items-start gap-4 bg-white p-6 text-left transition hover:bg-indigo-50/40 focus:outline-none"
                                >
                                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border shadow-2xs transition group-hover:scale-105 ${item.color}`}>
                                        <Icon className="h-6 w-6" />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <strong className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-700 transition">
                                                {item.title}
                                            </strong>
                                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
                                        </div>
                                        <p className="text-xs leading-relaxed text-slate-500">{item.description}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Right Sidebar: Data Readiness & Decision Center Quick Access */}
                <aside className="space-y-6">
                    
                    {/* Readiness Progress Card */}
                    <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-sm font-extrabold text-slate-900">ความพร้อมของข้อมูล</h3>
                                <p className="text-xs text-slate-500">พร้อมแล้ว {readyCount} จาก {setupChecks.length} รายการ</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-black border ${
                                readyPercent === 100
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                                {readyPercent}%
                            </span>
                        </div>

                        {/* Progress Meter Bar */}
                        <div className="space-y-1.5">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                                    style={{ width: `${readyPercent}%` }}
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-1">
                            {setupChecks.map(item => (
                                <button
                                    key={item.label}
                                    onClick={item.action}
                                    className="flex w-full items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 transition hover:bg-slate-100"
                                >
                                    <span className="flex items-center gap-2">
                                        <CheckCircle2 className={`h-4 w-4 ${item.ready ? 'text-emerald-500' : 'text-slate-300'}`} />
                                        {item.label}
                                    </span>
                                    <span className={`text-[11px] font-extrabold ${item.ready ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {item.ready ? 'พร้อมแล้ว' : 'รอดำเนินการ'}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Academic Decision Center Banner */}
                    <section className="rounded-3xl border border-indigo-200/80 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 p-6 text-white shadow-lg shadow-indigo-600/20 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white border border-white/20 backdrop-blur-md">
                                <ShieldCheck className="h-6 w-6 text-indigo-200" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-base font-black text-white">ศูนย์รับรองผลลัพธ์การเรียนรู้</h3>
                                <p className="text-xs leading-relaxed text-indigo-100/80">
                                    ตรวจสอบและรับรองระดับความสามารถรายบุคคลโดยฝ่ายวิชาการ แยกช่วงชั้น ป.ต้น / ป.ปลาย
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                                onClick={() => onOpenTab('progress')}
                                className="rounded-xl border border-white/20 bg-white/10 py-2.5 text-xs font-extrabold text-white backdrop-blur-md transition hover:bg-white/20"
                            >
                                ติดตามครู
                            </button>
                            <button
                                onClick={() => onNavigate('/admin/approval')}
                                className="rounded-xl bg-white py-2.5 text-xs font-black text-indigo-900 shadow-md transition hover:bg-indigo-50"
                            >
                                เข้าศูนย์รับรองผล
                            </button>
                        </div>
                    </section>
                </aside>
            </div>

            {/* Bottom Reports Section */}
            <section className="overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-sm" aria-labelledby="reports-heading">
                <div className="border-b border-slate-100 p-6">
                    <h2 id="reports-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5 text-indigo-600" /> รายงานทางวิชาการและการส่งออกข้อมูล
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">เลือกประเภทรายงานที่ต้องการตรวจสอบหรือพิมพ์ออกฉบับจริง</p>
                </div>

                <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
                    {reports.map((report) => {
                        const Icon = report.icon;
                        return (
                            <button
                                key={report.path}
                                onClick={() => onNavigate(report.path)}
                                className="group flex flex-col justify-between bg-white p-6 text-left transition hover:bg-indigo-50/30"
                            >
                                <div className="space-y-3">
                                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${report.color}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-700 transition">
                                            {report.title}
                                        </h3>
                                        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                                            {report.description}
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-4 flex items-center text-xs font-extrabold text-indigo-600 gap-1 opacity-80 group-hover:opacity-100">
                                    ดูรายงาน <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                                </div>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
