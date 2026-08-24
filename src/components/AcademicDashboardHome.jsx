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
    Scale,
    ShieldCheck,
    Upload,
    UserCheck,
    UsersRound,
} from 'lucide-react';

function MetricCard({ icon: Icon, label, value, unit, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="group min-h-32 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
        >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-700 text-white" aria-hidden="true">
                <Icon className="h-5 w-5" />
            </span>
            <span className="mt-3 block text-sm font-bold text-slate-700">{label}</span>
            <span className="mt-0.5 block text-2xl font-extrabold tabular-nums text-slate-950">
                {Number(value || 0).toLocaleString()} <span className="text-sm font-bold text-slate-700">{unit}</span>
            </span>
        </button>
    );
}

function TaskButton({ icon: Icon, title, description, action, primary = false }) {
    return (
        <button
            type="button"
            onClick={action}
            className={`group flex min-h-24 w-full items-start gap-4 rounded-2xl border p-5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                primary
                    ? 'border-indigo-700 bg-indigo-700 text-white hover:bg-indigo-800'
                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
            }`}
        >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${primary ? 'bg-white/15 text-white' : 'bg-indigo-100 text-indigo-800'}`} aria-hidden="true">
                <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
                <strong className={`block text-sm font-extrabold ${primary ? 'text-white' : 'text-slate-950'}`}>{title}</strong>
                <span className={`mt-1 block text-xs leading-5 ${primary ? 'text-indigo-100' : 'text-slate-600'}`}>{description}</span>
            </span>
            <ArrowRight className={`mt-3 h-4 w-4 shrink-0 ${primary ? 'text-white' : 'text-slate-500'}`} aria-hidden="true" />
        </button>
    );
}

export default function AcademicDashboardHome({ stats, onOpenTab, onNavigate }) {
    const learningFormatCount = Number(stats.subjects || 0) + Number(stats.contexts || 0);
    const firstRun = !stats.teachers || !stats.students || !learningFormatCount || !stats.learningOutcomes;

    const primaryTasks = [
        { title: 'ตั้งค่าข้อมูลโรงเรียน', description: 'ทำตามเช็กลิสต์ 6 ขั้น ตั้งแต่ครู นักเรียน ห้องเรียน ไปจนถึง LO', icon: CheckCircle2, action: () => onNavigate('/admin/setup') },
        { title: 'จัดกลุ่มเรียนและสมาชิก', description: 'รวมหลายห้อง แบ่งกลุ่มย่อย หรือเลือกนักเรียนรายบุคคล', icon: UsersRound, action: () => onNavigate('/admin/learning-groups') },
        { title: 'ติดตามการรายงานผลการเรียน', description: 'ดูว่าวิชาและห้องใดบันทึกข้อความ LO หรือสรุปรายด้านค้างอยู่', icon: ClipboardCheck, action: () => onOpenTab('progress') },
        { title: 'ตรวจสอบและรับรองผล', description: 'รับรองตามผลครูได้ทันที และแก้เฉพาะรายการที่เห็นต่าง', icon: ShieldCheck, action: () => onNavigate('/admin/approval') },
        { title: 'ดูรายงานผลรายด้าน', description: 'ดูผลที่ผ่านการรับรองแล้ว แยกตามด้านความสามารถ', icon: BarChart3, action: () => onNavigate('/admin/report-competency') },
    ];

    const otherTasks = [
        { title: 'ครูและนักเรียน', description: 'ค้นหา แก้ไขข้อมูลรายบุคคล และกำหนดบทบาทของครู', icon: UserCheck, action: () => onNavigate('/admin/people') },
        { title: 'ข้อมูลหลักสูตร', description: 'ตรวจสอบและแก้ไขรายวิชา LO และคำบรรยายระดับความสามารถ', icon: Database, action: () => onOpenTab('data') },
        { title: 'นำเข้าข้อมูลจากไฟล์', description: 'ใช้ไฟล์ DMC, Excel หรือ CSV ที่โรงเรียนมีอยู่', icon: Upload, action: () => onOpenTab('import') },
        { title: 'วิชา หน่วย โครงงาน และกิจกรรม', description: 'จัดการรูปแบบการเรียนรู้และจำนวนชั่วโมง', icon: BookOpenCheck, action: () => onNavigate('/admin/learning-contexts') },
        { title: 'กำหนด LO ของวิชา', description: 'เลือก LO ตามระดับชั้นที่ต้องใช้ในแต่ละวิชา', icon: Link2, action: () => onOpenTab('mapping') },
        { title: 'กำหนดครูผู้สอน', description: 'มอบหมายครูร่วมสอนหลายคนและระบุห้องเรียน', icon: UserCheck, action: () => onNavigate('/admin/subject-teachers') },
        { title: 'เลื่อนชั้นและย้ายห้อง', description: 'จัดการทั้งห้องหรือเลือกผู้เรียนรายบุคคล', icon: GraduationCap, action: () => onOpenTab('promotion') },
        { title: 'เทียบผลหลักสูตร 2568 → 2551', description: 'บันทึกหลักฐานและรับรองผลเทียบรายบุคคล', icon: Scale, action: () => onNavigate('/admin/curriculum-equivalency') },
        { title: 'รวมข้อความ LO ข้ามรายวิชา', description: 'นำข้อความที่ครูหลายวิชาเขียนใน LO เดียวกันมาเปรียบเทียบและพิมพ์เป็นหลักฐาน', icon: FileBarChart2, action: () => onNavigate('/admin/report-lo') },
        { title: 'รายงานผลการเรียน ปพ.๖', description: 'ตรวจสอบและพิมพ์รายงานผลรายปี', icon: FileSpreadsheet, action: () => onNavigate('/admin/yearly-report') },
    ];

    return (
        <div className="space-y-6">
            <header className="rounded-3xl border border-slate-800 bg-slate-950 p-6 text-white shadow-lg sm:p-8">
                <p className="text-sm font-bold text-indigo-200">งานฝ่ายวิชาการ · ภาคเรียนปัจจุบัน</p>
                <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">วันนี้ต้องจัดการอะไรต่อ</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
                    เริ่มจากตั้งค่าข้อมูล ติดตามการรายงานผลของครู แล้วจึงตรวจรับรองผลรายด้านความสามารถ
                </p>
            </header>

            {firstRun && (
                <section className="rounded-3xl border-2 border-indigo-300 bg-indigo-50 p-6 sm:p-8" aria-labelledby="first-run-title">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <p className="text-sm font-extrabold text-indigo-800">เริ่มใช้งานครั้งแรก</p>
                            <h2 id="first-run-title" className="mt-1 text-xl font-extrabold text-slate-950">ตั้งค่าข้อมูลให้ครบตามลำดับ 6 ขั้น</h2>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">ระบบจะบอกว่าข้อมูลใดพร้อมแล้ว สิ่งใดยังขาด และพาไปยังหน้าที่ต้องทำโดยตรง</p>
                        </div>
                        <button type="button" onClick={() => onNavigate('/admin/setup')} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 focus-visible:ring-offset-2">
                            เปิดเช็กลิสต์ 6 ขั้น <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                </section>
            )}

            {!firstRun && (
                <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="ข้อมูลภาพรวม">
                    <MetricCard icon={GraduationCap} label="ครูและบุคลากร" value={stats.teachers} unit="คน" onClick={() => onNavigate('/admin/people')} />
                    <MetricCard icon={UsersRound} label="นักเรียนที่ใช้งาน" value={stats.students} unit="คน" onClick={() => onNavigate('/admin/people?type=students')} />
                    <MetricCard icon={BookOpenCheck} label="วิชา หน่วย โครงงาน และกิจกรรม" value={learningFormatCount} unit="รายการ" onClick={() => onNavigate('/admin/learning-contexts')} />
                    <MetricCard icon={ClipboardCheck} label="ผลลัพธ์การเรียนรู้" value={stats.learningOutcomes} unit="LO" onClick={() => onOpenTab('mapping')} />
                </section>
            )}

            <section aria-labelledby="main-work-title">
                <h2 id="main-work-title" className="text-lg font-extrabold text-slate-950">งานหลัก</h2>
                <p className="mt-1 text-sm text-slate-600">เหลือเฉพาะทางเข้าที่ใช้ประจำ 5 งาน</p>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {primaryTasks.map((task, index) => <TaskButton key={task.title} {...task} primary={firstRun && index === 0} />)}
                </div>
            </section>

            <details className="rounded-2xl border border-slate-200 bg-white">
                <summary className="flex min-h-14 cursor-pointer items-center px-5 text-sm font-extrabold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-600">
                    งานตั้งค่าและรายงานอื่น ๆ
                </summary>
                <div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
                    {otherTasks.map(task => <TaskButton key={task.title} {...task} />)}
                </div>
            </details>
        </div>
    );
}
