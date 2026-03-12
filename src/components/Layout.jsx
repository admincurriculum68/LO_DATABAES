import { useAuth } from '../AuthContext';
import { LogOut, UserCircle, BookOpen, ChevronRight } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Layout({ children, title, onActionClick, actionText, actionIcon: ActionIcon }) {
    const { currentUser, logoutUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

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
                    <div className="flex items-center gap-2.5">
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
