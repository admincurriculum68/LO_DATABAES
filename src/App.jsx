import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Login from './pages/Login';
import ProtectedRoute from './ProtectedRoute';
import { Toaster } from 'react-hot-toast';

const TeacherDashboard = lazy(() => import('./pages/TeacherDashboard'));
const EvalView = lazy(() => import('./pages/EvalView'));
const ReportView = lazy(() => import('./pages/ReportView'));
const SummaryView = lazy(() => import('./pages/SummaryView'));
const HomeroomView = lazy(() => import('./pages/HomeroomView'));
const StudentDashboard = lazy(() => import('./pages/StudentDashboard'));
const ExecutiveDashboard = lazy(() => import('./pages/ExecutiveDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminReportLO = lazy(() => import('./pages/AdminReportLO'));
const AdminReportCompetency = lazy(() => import('./pages/AdminReportCompetency'));
const YearlyReportAdmin = lazy(() => import('./pages/YearlyReportAdmin'));
const PhaseReportAdmin = lazy(() => import('./pages/PhaseReportAdmin'));
const BatchReportView = lazy(() => import('./pages/BatchReportView'));
const AcademicApprovalCenter = lazy(() => import('./pages/AcademicApprovalCenter'));
const LearningContextManager = lazy(() => import('./pages/LearningContextManager'));
const FormativeCompetencyView = lazy(() => import('./pages/FormativeCompetencyView'));
const SubjectTeacherManager = lazy(() => import('./pages/SubjectTeacherManager'));
const CurriculumEquivalency = lazy(() => import('./pages/CurriculumEquivalency'));
const LearningGroupManager = lazy(() => import('./pages/LearningGroupManager'));
const DataSetupCenter = lazy(() => import('./pages/DataSetupCenter'));

export default function App() {
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <Toaster position="top-right" />
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="loader" aria-label="กำลังเปิดหน้า" /></div>}>
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
        <Route path="/formative/:subjectId" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <FormativeCompetencyView />
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
        <Route path="/batch-report/:room/:academicYear/:semester" element={
          <ProtectedRoute allowedRoles={['teacher']}>
            <BatchReportView />
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
          <ProtectedRoute allowedRoles={['admin', 'executive']}>
            <AdminReportLO />
          </ProtectedRoute>
        } />
        <Route path="/admin/report-competency" element={
          <ProtectedRoute allowedRoles={['admin', 'executive']}>
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
        <Route path="/admin/approval" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AcademicApprovalCenter />
          </ProtectedRoute>
        } />
        <Route path="/admin/learning-contexts" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <LearningContextManager />
          </ProtectedRoute>
        } />
        <Route path="/admin/subject-teachers" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <SubjectTeacherManager />
          </ProtectedRoute>
        } />
        <Route path="/admin/curriculum-equivalency" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <CurriculumEquivalency />
          </ProtectedRoute>
        } />
        <Route path="/admin/learning-groups" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <LearningGroupManager />
          </ProtectedRoute>
        } />
        <Route path="/admin/setup" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <DataSetupCenter />
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </Suspense>
    </div>
  );
}
