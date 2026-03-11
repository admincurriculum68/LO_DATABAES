import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { loginWithCitizenId } from '../lib/auth';
import { GraduationCap, Lock, User, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
    const [citizenId, setCitizenId] = useState('');
    const [dob, setDob] = useState('');
    const [loading, setLoading] = useState(false);
    const { loginUser } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await loginWithCitizenId(citizenId, dob);
            if (res.status === 'success') {
                toast.success(res.message);
                loginUser(res.user);

                switch (res.user.role) {
                    case 'admin':
                        navigate('/admin');
                        break;
                    case 'executive':
                        navigate('/executive');
                        break;
                    case 'student':
                        navigate('/student');
                        break;
                    default:
                        navigate('/');
                }
            } else {
                toast.error(res.message);
            }
        } catch (err) {
            toast.error('ข้อผิดพลาดระบบ: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-900 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900 via-slate-900 to-black flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Decor */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse"></div>
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-indigo-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse delay-1000"></div>

            <div className="relative w-full max-w-md z-10">
                <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700 p-8 rounded-3xl shadow-2xl">
                    <div className="text-center mb-10">
                        <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-2xl mx-auto flex items-center justify-center shadow-lg transform rotate-3 hover:rotate-6 transition-transform duration-300 mb-6 border border-blue-400/30">
                            <GraduationCap className="w-10 h-10 text-white transform -rotate-3 hover:-rotate-6 transition-transform" />
                        </div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">LO Database</h1>
                        <p className="text-blue-200/80 text-sm font-medium">{import.meta.env.VITE_SCHOOL_NAME || 'ระบบฐานข้อมูลผลการเรียนรู้ สพฐ.'}</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300 ml-1">เลขประจำตัวประชาชน</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-400 transition-colors">
                                    <User className="h-5 w-5" />
                                </div>
                                <input
                                    type="text"
                                    maxLength="13"
                                    required
                                    value={citizenId}
                                    onChange={(e) => setCitizenId(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:bg-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all outline-none"
                                    placeholder="1xxxxxxxxxxxx"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-300 ml-1">รหัสผ่าน (วันเดือนปีเกิด)</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-400 transition-colors">
                                    <Lock className="h-5 w-5" />
                                </div>
                                <input
                                    type="password"
                                    maxLength="8"
                                    required
                                    value={dob}
                                    onChange={(e) => setDob(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-900/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:bg-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all outline-none"
                                    placeholder="DDMMYYYY (เช่น 05012569)"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full relative group overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-600/50 disabled:to-indigo-600/50 text-white font-semibold py-4 rounded-xl shadow-[0_0_30px_-5px_rgba(59,130,246,0.4)] hover:shadow-[0_0_40px_-5px_rgba(59,130,246,0.6)] transition-all duration-300 disabled:cursor-not-allowed transform active:scale-[0.98]"
                        >
                            <span className="relative flex items-center justify-center shadow-black/10 text-shadow-sm text-lg tracking-wide">
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin w-5 h-5 mr-3" />
                                        กำลังตรวจสอบ...
                                    </>
                                ) : (
                                    'เข้าสู่ระบบ'
                                )}
                            </span>
                        </button>
                    </form>
                </div>

                <div className="mt-8 text-center text-sm text-slate-400 font-medium">
                    สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.) &copy; 2569
                </div>
            </div>
        </div>
    );
}
