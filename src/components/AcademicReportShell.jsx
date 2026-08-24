import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, FileBarChart2, FileSpreadsheet, GraduationCap } from 'lucide-react';
import Layout from './Layout';
import { useAuth } from '../AuthContext';
import { hasAnyRole } from '../lib/roles';

// ผู้บริหารดูรายงานภาพรวมได้ แต่แบบบันทึกผลรายบุคคลยังเป็นงานของฝ่ายวิชาการ
const REPORTS = [
    { path: '/admin/report-lo', label: 'ผลราย LO', icon: FileBarChart2, roles: ['admin', 'executive'] },
    { path: '/admin/report-competency', label: 'ผลรายด้านความสามารถ', icon: BarChart3, roles: ['admin', 'executive'] },
    { path: '/admin/yearly-report', label: 'ปพ.๖ รายบุคคล', icon: FileSpreadsheet, roles: ['admin'] },
    { path: '/admin/phase-report', label: 'ผลจบช่วงชั้น', icon: GraduationCap, roles: ['admin'] },
];

export default function AcademicReportShell({ title, description, actions, children, wide = false }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();

    const visibleReports = REPORTS.filter(report => hasAnyRole(currentUser, report.roles));

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
                            <h1 className="text-2xl font-extrabold text-slate-950">{title}</h1>
                            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
                        </div>
                        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
                    </header>

                    <nav className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="เลือกรายงานทางวิชาการ">
                        <div className="flex min-w-max gap-1">
                            {visibleReports.map(report => {
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
