import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import EvalView from './pages/EvalView';
import ReportView from './pages/ReportView';
import SummaryView from './pages/SummaryView';
import HomeroomView from './pages/HomeroomView';
import StudentDashboard from './pages/StudentDashboard';
import ExecutiveDashboard from './pages/ExecutiveDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminReportLO from './pages/AdminReportLO';
import AdminReportCompetency from './pages/AdminReportCompetency';
import YearlyReportAdmin from './pages/YearlyReportAdmin';
import PhaseReportAdmin from './pages/PhaseReportAdmin';
import ProtectedRoute from './ProtectedRoute';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={!currentUser ? <Login /> : <Navigate to="/" />} />

        {/* Core Teacher Routes */}
        <Route path="/" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <TeacherDashboard />
          </ProtectedRoute>
        } />
        <Route path="/eval/:subjectId" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <EvalView />
          </ProtectedRoute>
        } />
        <Route path="/report/:studentId/:academicYear/:semester" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <ReportView />
          </ProtectedRoute>
        } />
        <Route path="/summary/:subjectId" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <SummaryView />
          </ProtectedRoute>
        } />
        <Route path="/homeroom" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <HomeroomView />
          </ProtectedRoute>
        } />

        {/* Student Route */}
        <Route path="/student" element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentDashboard />
          </ProtectedRoute>
        } />

        {/* Executive Route */}
        <Route path="/executive" element={
          <ProtectedRoute allowedRoles={['executive']}>
            <ExecutiveDashboard />
          </ProtectedRoute>
        } />

        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        } />
        <Route path="/admin/report-lo" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminReportLO />
          </ProtectedRoute>
        } />
        <Route path="/admin/report-competency" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminReportCompetency />
          </ProtectedRoute>
        } />
        <Route path="/admin/yearly-report" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <YearlyReportAdmin />
          </ProtectedRoute>
        } />
        <Route path="/admin/phase-report" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <PhaseReportAdmin />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
