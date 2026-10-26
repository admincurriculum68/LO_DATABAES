import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Printer } from 'lucide-react';
import { useAuth } from '../../AuthContext';
import useDocumentTitle from '../../lib/useDocumentTitle';
import { loadParentReports } from '../../lib/parentReportApi';
import ParentReportSheet from './ParentReportSheet';

// หน้าพิมพ์รายงานผู้ปกครอง ใช้ร่วมกันทั้งรายคน (/report) และทั้งห้อง (/batch-report)
export default function ParentReportPage({ studentId = '', room = '', academicYear, semester }) {
    const isRoom = Boolean(room);
    useDocumentTitle(isRoom ? `รายงานผู้ปกครอง ห้อง ${room}` : 'รายงานผู้ปกครองรายบุคคล');
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [state, setState] = useState({ loading: true, error: '', school: null, reports: [] });
    const [includeEvidence, setIncludeEvidence] = useState(false);
    // พิมพ์ทีละคนจากหน้าพิมพ์ทั้งห้อง ครูไม่ต้องกลับไปหาปุ่มในหน้างานประจำชั้น
    const [soloStudentId, setSoloStudentId] = useState('');
    // ชื่อคนที่เพิ่งส่งพิมพ์ ใช้บอกครูว่าระบบเลื่อนมาคนถัดไปให้แล้ว
    const [lastPrinted, setLastPrinted] = useState(null);

    const showSolo = id => {
        setSoloStudentId(id);
        setLastPrinted(null);
        window.scrollTo(0, 0);
    };

    // พิมพ์ทีละคนเสร็จแล้วเลื่อนไปคนถัดไปให้เลย ครูกดพิมพ์ต่อได้ทันที
    useEffect(() => {
        if (!soloStudentId) return undefined;
        const onAfterPrint = () => {
            const index = state.reports.findIndex(report => report.student.student_id === soloStudentId);
            const printed = state.reports[index];
            const next = state.reports[index + 1];
            if (!printed) return;
            if (next) {
                setSoloStudentId(next.student.student_id);
                window.scrollTo(0, 0);
            }
            setLastPrinted({ name: fullName(printed.student), advanced: Boolean(next) });
        };
        window.addEventListener('afterprint', onAfterPrint);
        return () => window.removeEventListener('afterprint', onAfterPrint);
    }, [soloStudentId, state.reports]);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const result = await loadParentReports({ schoolId: currentUser.school_id, academicYear, semester, studentId, room });
                if (active) setState({ loading: false, error: '', ...result });
            } catch (error) {
                if (active) setState({ loading: false, error: error.message || 'โหลดรายงานไม่สำเร็จ', school: null, reports: [] });
            }
        })();
        return () => { active = false; };
    }, [academicYear, currentUser.school_id, room, semester, studentId]);

    if (state.loading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-100" role="status">
                <div className="flex flex-col items-center gap-3"><Loader2 className="h-10 w-10 animate-spin text-indigo-700" aria-hidden="true" /><p className="font-bold text-slate-600">กำลังเตรียมรายงาน{isRoom ? 'ทั้งห้อง' : ''}...</p></div>
            </main>
        );
    }

    const soloIndex = state.reports.findIndex(report => report.student.student_id === soloStudentId);
    const soloReport = state.reports[soloIndex] || null;
    const prevReport = state.reports[soloIndex - 1];
    const nextReport = state.reports[soloIndex + 1];
    const visibleReports = soloReport ? [soloReport] : state.reports;
    const draftCount = visibleReports.filter(report => !report.allPublished).length;
    const studentName = report => fullName(report.student);

    return (
        <main className="min-h-screen bg-slate-200 py-6 font-sans text-slate-900 print:bg-white print:py-0">
            <div className="mx-auto mb-6 flex max-w-[210mm] flex-col gap-3 px-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={() => navigate(-1)} className="btn-secondary w-fit"><ChevronLeft className="h-4 w-4" aria-hidden="true" />กลับ</button>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800">
                        <input type="checkbox" checked={includeEvidence} onChange={event => setIncludeEvidence(event.target.checked)} className="h-5 w-5 accent-indigo-700" />
                        แนบหน้าข้อความพฤติกรรมรายวิชา (ไม่บังคับ)
                    </label>
                    <button type="button" onClick={() => window.print()} disabled={!visibleReports.length} className="btn-primary"><Printer className="h-4 w-4" aria-hidden="true" />{soloReport ? `พิมพ์ของ ${studentName(soloReport)}` : isRoom ? `พิมพ์ทั้งห้อง (${state.reports.length} คน)` : 'พิมพ์รายงาน'}</button>
                </div>
            </div>

            <p className="mx-4 mb-4 max-w-[210mm] text-xs leading-5 text-slate-600 sm:mx-auto print:hidden">
                ช่อง "แนบหน้าข้อความพฤติกรรมรายวิชา" ไม่ติ๊กก็พิมพ์ได้ครับ ติ๊กเมื่อต้องการแนบหน้าข้อความราย LO ที่ครูผู้สอนเขียนไว้ ต่อท้ายใบรายงานของนักเรียนแต่ละคน
                {isRoom && ' · ถ้าต้องการพิมพ์ทีละคน กดปุ่ม "พิมพ์เฉพาะคนนี้" เหนือใบรายงานของคนนั้น'}
            </p>
            {soloReport && (
                <div className="mx-4 mb-4 flex max-w-[210mm] flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-950 sm:mx-auto print:hidden">
                    {lastPrinted && (
                        <p role="status" className="font-semibold text-emerald-800">
                            ส่งพิมพ์ของ {lastPrinted.name} แล้ว{lastPrinted.advanced ? ' · ตอนนี้แสดงคนถัดไป กดพิมพ์ต่อได้เลย' : ' · คนนี้เป็นคนสุดท้ายของห้องแล้ว'}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-bold">คนที่ {soloIndex + 1} จาก {state.reports.length} · {studentName(soloReport)}</span>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => showSolo(prevReport.student.student_id)} disabled={!prevReport} className="btn-secondary"><ChevronLeft className="h-4 w-4" aria-hidden="true" />คนก่อนหน้า</button>
                            <button type="button" onClick={() => showSolo(nextReport.student.student_id)} disabled={!nextReport} className="btn-secondary">คนถัดไป<ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
                            <button type="button" onClick={() => showSolo('')} className="btn-secondary">กลับไปทั้งห้อง</button>
                        </div>
                    </div>
                </div>
            )}
            {state.error && <p className="mx-4 mb-4 max-w-[210mm] rounded-xl border border-rose-200 sm:mx-auto bg-rose-50 p-4 text-sm font-bold text-rose-900 print:hidden" role="alert">{state.error}</p>}
            {draftCount > 0 && (
                <p className="mx-4 mb-4 flex max-w-[210mm] gap-2 rounded-xl border border-amber-300 sm:mx-auto bg-amber-50 p-3 text-sm text-amber-950 print:hidden">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                    {isRoom ? `${draftCount} จาก ${state.reports.length} คน` : 'รายงานนี้'} ยังมีผลที่ครูประจำชั้นยังไม่ได้ส่ง แผ่นรายงานจะมีคำว่า “ฉบับร่าง” กำกับไว้</p>
            )}

            {!state.error && state.reports.length === 0 ? (
                <p className="mx-4 max-w-[210mm] rounded-2xl bg-white p-16 sm:mx-auto text-center font-bold text-slate-600">ไม่พบข้อมูลนักเรียน{isRoom ? `ในห้อง ${room}` : ''} ในภาคเรียนที่ {semester}/{academicYear}</p>
            ) : visibleReports.map((report, index) => (
                <div key={report.student.student_id}>
                    {isRoom && !soloReport && (
                        <div className="mx-4 mb-2 flex max-w-[210mm] justify-end sm:mx-auto print:hidden">
                            <button type="button" onClick={() => showSolo(report.student.student_id)} className="btn-secondary">
                                <Printer className="h-4 w-4" aria-hidden="true" />พิมพ์เฉพาะคนนี้
                            </button>
                        </div>
                    )}
                    <ParentReportSheet
                        school={state.school}
                        report={report}
                        academicYear={academicYear}
                        semester={semester}
                        includeEvidence={includeEvidence}
                        isLast={index === visibleReports.length - 1}
                    />
                </div>
            ))}
        </main>
    );
}

function fullName(student) {
    return `${student?.prefix || ''}${student?.first_name || ''} ${student?.last_name || ''}`.trim();
}
