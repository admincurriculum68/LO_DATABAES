import {
    ArrowRight,
    BookOpenCheck,
    Check,
    ClipboardCheck,
    FileBarChart2,
    School,
    UsersRound,
} from 'lucide-react';

export default function AcademicWorkflowHome({ stats, onOpenTab, onOpenLearningFormats, onOpenApproval, onOpenReports }) {
    const steps = [
        {
            title: 'เตรียมข้อมูลครูและนักเรียน',
            description: 'ตรวจสอบหรือนำเข้าข้อมูลครู บุคลากร และนักเรียนของสถานศึกษา',
            detail: `ครู ${stats.teachers.toLocaleString()} คน · นักเรียน ${stats.students.toLocaleString()} คน`,
            done: stats.teachers > 0 && stats.students > 0,
            action: () => onOpenTab('import'),
            actionLabel: stats.teachers > 0 && stats.students > 0 ? 'ตรวจสอบข้อมูล' : 'เริ่มนำเข้าข้อมูล',
            icon: School,
        },
        {
            title: 'กำหนดรูปแบบการจัดการเรียนรู้',
            description: 'เพิ่มวิชา หน่วยการเรียนรู้ โครงงาน หรือกิจกรรม แล้วเลือก LO ที่ใช้ประเมิน',
            detail: `มีวิชาแล้ว ${stats.subjects.toLocaleString()} วิชา`,
            done: stats.subjects > 0,
            action: onOpenLearningFormats,
            actionLabel: stats.subjects > 0 ? 'ตรวจสอบรูปแบบการเรียนรู้' : 'เพิ่มรูปแบบการเรียนรู้',
            icon: BookOpenCheck,
        },
        {
            title: 'จัดครูและนักเรียนเข้ากลุ่มเรียน',
            description: 'กำหนดผู้รับผิดชอบและรายชื่อนักเรียนสำหรับการประเมิน',
            detail: 'ดำเนินการหลังจากมีข้อมูลผู้เรียนและรูปแบบการเรียนรู้แล้ว',
            done: false,
            action: () => onOpenTab('enrollment'),
            actionLabel: 'จัดผู้เรียนเข้ากลุ่ม',
            icon: UsersRound,
        },
        {
            title: 'ติดตามการประเมิน',
            description: 'ดูว่าผู้เรียนคนใดยังไม่ได้รับการประเมิน และรายการใดต้องติดตาม',
            detail: 'ครูบันทึกผลจากหน้าครูผู้สอน',
            done: false,
            action: () => onOpenTab('progress'),
            actionLabel: 'ดูความก้าวหน้า',
            icon: ClipboardCheck,
        },
        {
            title: 'ตรวจสอบและรับรองผล',
            description: 'พิจารณาหลักฐานจากทุกวิชา หน่วยการเรียนรู้ โครงงาน และกิจกรรม',
            detail: 'ฝ่ายวิชาการเป็นผู้รับรองผลสุดท้ายของ LO',
            done: false,
            action: onOpenApproval,
            actionLabel: 'ตรวจสอบผล',
            icon: Check,
        },
    ];

    const nextStep = steps.find(step => !step.done) || steps[steps.length - 1];
    const NextIcon = nextStep.icon;

    return (
        <div className="mx-auto max-w-5xl">
            <header className="mb-8">
                <p className="text-sm font-bold text-indigo-700">ภารกิจของฝ่ายวิชาการ</p>
                <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">เริ่มทำงานจากตรงนี้</h2>
                <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">ดำเนินการตามลำดับจากบนลงล่าง ระบบจะแสดงข้อมูลและงานที่เกี่ยวข้องในแต่ละขั้นให้เอง</p>
            </header>

            <section className="mb-8 overflow-hidden rounded-3xl bg-indigo-700 text-white shadow-lg shadow-indigo-950/10" aria-labelledby="next-task-heading">
                <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                    <div className="flex items-start gap-4">
                        <span className="rounded-2xl bg-white/15 p-3" aria-hidden="true"><NextIcon className="h-7 w-7" /></span>
                        <div>
                            <p className="text-sm font-bold text-indigo-100">งานที่ควรทำต่อ</p>
                            <h3 id="next-task-heading" className="mt-1 text-xl font-extrabold">{nextStep.title}</h3>
                            <p className="mt-1 max-w-xl text-sm leading-6 text-indigo-100">{nextStep.description}</p>
                        </div>
                    </div>
                    <button onClick={nextStep.action} className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 font-extrabold text-indigo-800 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-indigo-700">
                        {nextStep.actionLabel}<ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </section>

            <section aria-labelledby="workflow-heading">
                <div className="mb-4 flex items-end justify-between gap-4">
                    <div><h3 id="workflow-heading" className="text-xl font-extrabold text-slate-950">ลำดับการทำงาน</h3><p className="mt-1 text-sm text-slate-600">เลือกทำทีละขั้น ไม่จำเป็นต้องเรียนรู้ทุกเมนูพร้อมกัน</p></div>
                </div>
                <ol className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
                    {steps.map((step, index) => {
                        const Icon = step.icon;
                        return (
                            <li key={step.title} className="border-b border-slate-200 last:border-b-0">
                                <button onClick={step.action} className="group flex w-full items-start gap-4 p-5 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 sm:items-center sm:p-6">
                                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${step.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{step.done ? <Check className="h-5 w-5" /> : index + 1}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2 font-extrabold text-slate-900"><Icon className="h-5 w-5 text-slate-500" />{step.title}</span>
                                        <span className="mt-1 block text-sm leading-6 text-slate-600">{step.description}</span>
                                        <span className={`mt-1 block text-xs font-bold ${step.done ? 'text-emerald-700' : 'text-slate-500'}`}>{step.detail}</span>
                                    </span>
                                    <span className="hidden shrink-0 items-center gap-1 text-sm font-extrabold text-indigo-700 group-hover:text-indigo-900 sm:inline-flex">{step.actionLabel}<ArrowRight className="h-4 w-4" /></span>
                                </button>
                            </li>
                        );
                    })}
                </ol>
            </section>

            <section className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div><h3 className="font-extrabold text-slate-900">ต้องการดูผลหรือออกรายงาน?</h3><p className="text-sm text-slate-600">ไปที่รายงานเมื่อบันทึกและรับรองผลเรียบร้อยแล้ว</p></div>
                <button onClick={onOpenReports} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 font-extrabold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"><FileBarChart2 className="h-5 w-5" /> ดูรายงานทางวิชาการ</button>
            </section>
        </div>
    );
}
