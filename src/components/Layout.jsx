import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import { LogOut, UserCircle, BookOpen, ChevronRight, Calendar, ChevronDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Layout({ children, title, onActionClick, actionText, actionIcon: ActionIcon }) {
    const { currentUser, logoutUser } = useAuth();
    const { academicYear, semester, setAcademicYear, setSemester, updateAcademicSettings } = useAcademic();
    const navigate = useNavigate();
    const location = useLocation();
    const [showTermPicker, setShowTermPicker] = useState(false);

    const handleLogout = () => {
        if (window.confirm('ยืนยันการออกจากระบบ CBE Track')) {
            logoutUser();
            navigate('/login');
        }
    };

    // Role badge
    const roleMeta = {
        admin:     { label: 'ฝ่ายวิชาการ', color: 'bg-violet-100 text-violet-700 border-violet-200' },
        teacher:   { label: 'ครูผู้สอน',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
        executive: { label: 'ผู้บริหาร',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
        student:   { label: 'นักเรียน',   color: 'bg-green-100 text-green-700 border-green-200' },
    };
    const role = roleMeta[currentUser?.role] || { label: currentUser?.role || '', color: 'bg-slate-100 text-slate-600 border-slate-200' };

    const navigationByRole = {
        admin: [
            { label: 'หน้าหลัก', path: '/admin', exact: true },
            { label: 'ตั้งค่าข้อมูล', path: '/admin/setup' },
            { label: 'กลุ่มเรียน', path: '/admin/learning-groups' },
            { label: 'ติดตามการรายงานผล', path: '/admin?tab=progress', tab: 'progress' },
            { label: 'รับรองผล', path: '/admin/approval' },
        ],
        teacher: [
            { label: 'งานของฉัน', path: '/', exact: true },
            ...(currentUser?.homeroom ? [{ label: 'งานประจำชั้น', path: '/homeroom' }] : []),
        ],
        executive: [
            { label: 'ภาพรวม', path: '/executive', exact: true },
            { label: 'ผลรายด้าน', path: '/admin/report-competency' },
        ],
        student: [{ label: 'ผลการเรียนของฉัน', path: '/student', exact: true }],
    };
    const navigation = navigationByRole[currentUser?.role] || [];
    const isActive = item => {
        if (item.tab) return location.pathname === '/admin' && new URLSearchParams(location.search).get('tab') === item.tab;
        if (item.exact) return location.pathname === item.path && !location.search;
        return location.pathname.startsWith(item.path);
    };

    const isAdmin = currentUser?.role === 'admin';

    const handleTermChange = (year, sem) => {
        if (isAdmin) {
            updateAcademicSettings(year, sem);
        } else {
            setAcademicYear(year);
            setSemester(sem);
        }
        setShowTermPicker(false);
    };

    // Generate year options (current year ± 3)
    const baseYear = academicYear || (new Date().getFullYear() + 543);
    const yearOptions = [];
    for (let y = baseYear - 3; y <= baseYear + 2; y++) {
        yearOptions.push(y);
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
            <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/90 print:hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
                    {/* Brand + Title */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => navigate(currentUser?.role === 'admin' ? '/admin' : currentUser?.role === 'student' ? '/student' : currentUser?.role === 'executive' ? '/executive' : '/')}
                            aria-label="กลับหน้าหลัก CBE Track"
                            className="flex min-h-11 items-center gap-2.5 shrink-0 group"
                        >
                            <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm border border-blue-500/20 group-hover:shadow-blue-500/20 group-hover:shadow-md transition-all">
                                <BookOpen className="text-white w-4 h-4 flex-shrink-0" />
                            </div>
                            <div className="hidden sm:flex flex-col justify-center leading-none">
                                <span className="font-extrabold text-sm text-slate-800 tracking-tight">
                                    CBE <span className="text-blue-600">Track</span>
                                </span>
                                <span className="text-[10px] text-slate-600 font-medium truncate max-w-[160px]">
                                    {currentUser?.school_name || 'ระบบติดตามผลลัพธ์การเรียนรู้'}
                                </span>
                            </div>
                        </button>

                        {title && (
                            <>
                                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 hidden sm:block" />
                                <span className="font-semibold text-slate-600 truncate text-sm hidden sm:block max-w-[200px] lg:max-w-xs">{title}</span>
                            </>
                        )}
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-2">
                        {/* Academic Year / Semester Picker */}
                        {currentUser?.role !== 'student' && academicYear && (
                            <div className="relative">
                                <button
                                    onClick={() => setShowTermPicker(!showTermPicker)}
                                    className="flex min-h-11 items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-bold text-indigo-800 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                    aria-expanded={showTermPicker}
                                    aria-label="เลือกปีการศึกษาและภาคเรียน"
                                >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">ภาคเรียนที่</span> {semester}/{academicYear}
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showTermPicker ? 'rotate-180' : ''}`} />
                                </button>

                                {showTermPicker && (
                                    <>
                                        {/* Backdrop */}
                                        <div className="fixed inset-0 z-30" onClick={() => setShowTermPicker(false)} />
                                        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-40 w-64 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <p className="mb-3 text-xs font-bold text-slate-600">
                                                {isAdmin ? 'กำหนดปีการศึกษาและภาคเรียนของระบบ' : 'เลือกปีการศึกษาและภาคเรียน'}
                                            </p>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">ปีการศึกษา</label>
                                                    <select
                                                        value={academicYear}
                                                        onChange={(e) => handleTermChange(parseInt(e.target.value), semester)}
                                                        className="w-full border border-slate-200 rounded-xl py-2.5 px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                                    >
                                                        {yearOptions.map(y => (
                                                            <option key={y} value={y}>{y}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 mb-1 block">ภาคเรียน</label>
                                                    <div className="flex gap-2">
                                                        {[1, 2].map(s => (
                                                            <button
                                                                key={s}
                                                                onClick={() => handleTermChange(academicYear, s)}
                                                                className={`min-h-11 flex-1 py-2.5 rounded-xl text-sm font-extrabold border-2 transition-all ${
                                                                    semester === s
                                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                                                                }`}
                                                            >
                                                                ภาคเรียนที่ {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {isAdmin && (
                                                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                                                        การเปลี่ยนค่านี้มีผลต่อปีการศึกษาและภาคเรียนเริ่มต้นของผู้ใช้ทุกบทบาท
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Action button */}
                        {onActionClick && (
                            <button
                                onClick={onActionClick}
                                className="hidden min-h-11 sm:flex text-sm bg-indigo-50 border border-indigo-100 text-indigo-800 hover:bg-indigo-100 hover:border-indigo-200 px-4 py-2 rounded-xl font-semibold transition-all items-center gap-2 shadow-sm"
                            >
                                {ActionIcon && <ActionIcon className="w-4 h-4" />}
                                {actionText}
                            </button>
                        )}

                        {/* User Pill */}
                        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
                            <UserCircle className="w-6 h-6 text-slate-400 shrink-0" />
                            <div className="hidden sm:flex flex-col leading-none">
                                <span className="text-xs font-bold text-slate-800 truncate max-w-[140px]">{currentUser?.full_name}</span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border w-fit mt-0.5 ${role.color}`}>{role.label}</span>
                            </div>
                        </div>

                        {/* Logout */}
                        <button
                            onClick={handleLogout}
                            title="ออกจากระบบ"
                            aria-label="ออกจากระบบ"
                            className="flex h-11 w-11 items-center justify-center text-slate-600 hover:text-red-700 hover:bg-slate-100 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                {navigation.length > 0 && (
                    <nav className="border-t border-slate-200 bg-white" aria-label="เมนูหลัก">
                        <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-1.5 sm:px-6 lg:px-8">
                            {navigation.map(item => (
                                <button
                                    key={item.path}
                                    type="button"
                                    onClick={() => navigate(item.path)}
                                    aria-current={isActive(item) ? 'page' : undefined}
                                    className={`min-h-11 shrink-0 rounded-xl px-3.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                                        isActive(item) ? 'action-primary' : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </nav>
                )}
            </header>

            {/* Mobile action button */}
            {onActionClick && (
                <div className="sm:hidden px-4 pt-4 print:hidden">
                    <button
                        onClick={onActionClick}
                        className="w-full flex text-sm bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 px-4 py-3 rounded-xl font-semibold transition-all justify-center items-center gap-2 shadow-sm"
                    >
                        {ActionIcon && <ActionIcon className="w-4 h-4" />}
                        {actionText}
                    </button>
                </div>
            )}

            <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:max-w-none print:p-0">
                {children}
            </main>
        </div>
    );
}
