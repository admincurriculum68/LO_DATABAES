import { useAuth } from '../AuthContext';
import { LogOut, LayoutDashboard, UserCircle, BookOpen } from 'lucide-react';

export default function Layout({ children, title, onActionClick, actionText, actionIcon: ActionIcon }) {
    const { currentUser, logoutUser } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
            <header className="bg-white border-b shadow-sm sticky top-0 z-40 backdrop-blur-xl bg-white/80">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600p-2 rounded-lg shadow-sm w-9 h-9 flex items-center justify-center">
                            <BookOpen className="text-white w-5 h-5 flex-shrink-0" />
                        </div>
                        <div className="hidden sm:flex flex-col justify-center">
                            <span className="font-bold text-lg text-slate-800 tracking-tight leading-none">
                                LO Database
                            </span>
                            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-full w-max mt-1 leading-none truncate max-w-[200px]">
                                {import.meta.env.VITE_SCHOOL_NAME || 'ระบบฐานข้อมูล สพฐ.'}
                            </span>
                        </div>
                        <span className="text-slate-300 mx-2 hidden sm:block">|</span>
                        <h1 className="font-semibold text-slate-600 truncate max-w-[200px] sm:max-w-xs">{title}</h1>
                    </div>

                    <div className="flex items-center space-x-4">
                        {onActionClick && (
                            <button
                                onClick={onActionClick}
                                className="hidden sm:flex text-sm bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 px-4 py-2 rounded-lg font-semibold transition-all items-center shadow-sm"
                            >
                                {ActionIcon && <ActionIcon className="w-4 h-4 mr-2" />}
                                {actionText}
                            </button>
                        )}

                        <div className="flex items-center space-x-2 text-sm font-medium bg-slate-100 px-3 py-1.5 rounded-full text-slate-700 border border-slate-200">
                            <UserCircle className="w-5 h-5 text-slate-400" />
                            <span className="truncate max-w-[120px]">{currentUser?.full_name}</span>
                        </div>

                        <button
                            onClick={logoutUser}
                            title="ออกจากระบบ"
                            className="text-slate-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors flexitems-center"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {onActionClick && (
                    <div className="sm:hidden mb-6">
                        <button
                            onClick={onActionClick}
                            className="w-full flex text-sm bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 px-4 py-3 rounded-xl font-semibold transition-all justify-center items-center shadow-sm"
                        >
                            {ActionIcon && <ActionIcon className="w-4 h-4 mr-2" />}
                            {actionText}
                        </button>
                    </div>
                )}
                {children}
            </main>
        </div>
    );
}
