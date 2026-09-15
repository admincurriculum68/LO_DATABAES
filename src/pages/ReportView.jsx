import { useParams } from 'react-router-dom';
import ParentReportPage from '../components/reports/ParentReportPage';

// รายงานผู้ปกครองรายบุคคล: ผลรายด้านที่ครูประจำชั้นสรุปพร้อมคำบรรยาย
export default function ReportView() {
    const { studentId, academicYear, semester } = useParams();
    return <ParentReportPage studentId={studentId} academicYear={academicYear} semester={semester} />;
}
