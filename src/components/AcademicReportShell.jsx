import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, FileBarChart2, FileSpreadsheet, GraduationCap } from 'lucide-react';
import Layout from './Layout';

const REPORTS = [
    { path: '/admin/report-lo', label: 'ผลราย LO', icon: FileBarChart2 },
    { path: '/admin/report-competency', label: 'ผลรายด้านความสามารถ', icon: BarChart3 },
    { path: '/admin/yearly-report', label: 'ปพ.๖ รายบุคคล', icon: FileSpreadsheet },
    { path: '/admin/phase-report', label: 'ผลจบช่วงชั้น', icon: GraduationCap },
];

export default function AcademicReportShell({ title, description, actions, children, wide = false }) {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <Layout title="รายงานทางวิชาการ">
            <style>{`
                @media print {
                    .report-controls { display: none !important; }
                    body { background: white !important; }
                    .report-document { box-shadow: none !important; border: 0 !important; }
                }
            `}</style>
            <div className={`${wide ? 'max-w-[1800px]' : 'max-w-6xl'} mx-auto w-full print:max-w-none`}>
                <div className="report-controls mb-6 space-y-4">
                    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <button onClick={() => navigate('/admin')} className="mb-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"><ArrowLeft className="h-4 w-4" /> กลับ Dashboard</button>
                            <h2 className="text-2xl font-extrabold text-slate-950">{title}</h2>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
                        </div>
                        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
                    </header>

                    <nav className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="เลือกรายงานทางวิชาการ">
                        <div className="flex min-w-max gap-1">
                            {REPORTS.map(report => {
                                const Icon = report.icon;
                                const active = location.pathname === report.path;
                                return <button key={report.path} onClick={() => navigate(report.path)} className={`flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${active ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><Icon className="h-4 w-4" />{report.label}</button>;
                            })}
                        </div>
                    </nav>
                </div>
                {children}
            </div>
        </Layout>
    );
}
