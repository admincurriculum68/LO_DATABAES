import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import { LogOut, UserCircle, BookOpen, ChevronRight, Calendar, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Layout({ children, title, onActionClick, actionText, actionIcon: ActionIcon }) {
    const { currentUser, logoutUser } = useAuth();
    const { academicYear, semester, setAcademicYear, setSemester, updateAcademicSettings } = useAcademic();
    const navigate = useNavigate();
    const [showTermPicker, setShowTermPicker] = useState(false);

    const handleLogout = () => {
        if (window.confirm('ต้องการออกจากระบบใช่ไหม?')) {
            logoutUser();
            navigate('/login');
        }
    };

    // Role badge
    const roleMeta = {
        admin:     { label: 'ครูวิชาการ', color: 'bg-violet-100 text-violet-700 border-violet-200' },
        teacher:   { label: 'ครูผู้สอน',  color: 'bg-blue-100 text-blue-700 border-blue-200' },
        executive: { label: 'ผู้บริหาร',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
        student:   { label: 'นักเรียน',   color: 'bg-green-100 text-green-700 border-green-200' },
    };
    const role = roleMeta[currentUser?.role] || { label: currentUser?.role || '', color: 'bg-slate-100 text-slate-600 border-slate-200' };

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
            <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/90">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
                    {/* Brand + Title */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => navigate(currentUser?.role === 'admin' ? '/admin' : currentUser?.role === 'student' ? '/student' : currentUser?.role === 'executive' ? '/executive' : '/')}
                            className="flex items-center gap-2.5 shrink-0 group"
                        >
                            <div className="w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm border border-blue-500/20 group-hover:shadow-blue-500/20 group-hover:shadow-md transition-all">
                                <BookOpen className="text-white w-4 h-4 flex-shrink-0" />
                            </div>
                            <div className="hidden sm:flex flex-col justify-center leading-none">
                                <span className="font-extrabold text-sm text-slate-800 tracking-tight">
                                    CBE <span className="text-blue-600">Track</span>
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[160px]">
                                    {currentUser?.school_name || 'ระบบติดตามผลลัพธ์การเรียนรู้'}
                                </span>
                            </div>
                        </button>

                        {title && (
                            <>
                                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 hidden sm:block" />
                                <h1 className="font-semibold text-slate-600 truncate text-sm hidden sm:block max-w-[200px] lg:max-w-xs">{title}</h1>
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
                                    className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-3 py-2 rounded-xl text-xs font-bold text-indigo-700 transition-all shadow-sm"
                                >
                                    <Calendar className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">เทอม</span> {semester}/{academicYear}
                                    <ChevronDown className={`w-3 h-3 transition-transform ${showTermPicker ? 'rotate-180' : ''}`} />
                                </button>

                                {showTermPicker && (
                                    <>
                                        {/* Backdrop */}
                                        <div className="fixed inset-0 z-30" onClick={() => setShowTermPicker(false)} />
                                        <div className="absolute right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 z-40 w-64 animate-in fade-in slide-in-from-top-2 duration-200">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
                                                {isAdmin ? '⚙️ ตั้งค่าภาคเรียนทั้งระบบ' : 'เลือกภาคเรียนที่ต้องการดู'}
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
                                                                className={`flex-1 py-2.5 rounded-xl text-sm font-extrabold border-2 transition-all ${
                                                                    semester === s
                                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                                        : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                                                                }`}
                                                            >
                                                                เทอม {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {isAdmin && (
                                                    <p className="text-[10px] text-amber-600 font-medium bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                                                        ⚠️ การเปลี่ยนภาคเรียนจะมีผลกับผู้ใช้ทุกคนในระบบ
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
                                className="hidden sm:flex text-sm bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 px-4 py-2 rounded-xl font-semibold transition-all items-center gap-2 shadow-sm"
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
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile action button */}
            {onActionClick && (
                <div className="sm:hidden px-4 pt-4">
                    <button
                        onClick={onActionClick}
                        className="w-full flex text-sm bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 px-4 py-3 rounded-xl font-semibold transition-all justify-center items-center gap-2 shadow-sm"
                    >
                        {ActionIcon && <ActionIcon className="w-4 h-4" />}
                        {actionText}
                    </button>
                </div>
            )}

            <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-400">
                {children}
            </main>
        </div>
    );
}
