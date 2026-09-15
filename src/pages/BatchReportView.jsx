import { useParams } from 'react-router-dom';
import ParentReportPage from '../components/reports/ParentReportPage';

// รายงานผู้ปกครองทั้งห้อง พิมพ์ต่อกันคนละหน้า
export default function BatchReportView() {
    const { room, academicYear, semester } = useParams();
    return <ParentReportPage room={decodeURIComponent(room)} academicYear={academicYear} semester={semester} />;
}
