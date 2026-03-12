import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { loginWithCitizenId } from '../lib/auth';
import { GraduationCap, Lock, User, Loader2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Login() {
    const [citizenId, setCitizenId] = useState('');
    const [dob, setDob] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { loginUser } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        if (citizenId.length < 13) {
            toast.error('กรุณากรอกเลขประจำตัวประชาชน 13 หลักให้ครบ');
            return;
        }
        if (dob.length !== 8) {
            toast.error('กรุณากรอกวันเดือนปีเกิด 8 หลัก (DDMMYYYY)');
            return;
        }
        setLoading(true);
        try {
            const res = await loginWithCitizenId(citizenId, dob);
            if (res.status === 'success') {
                toast.success(res.message);
                loginUser(res.user);
                switch (res.user.role) {
                    case 'admin':    navigate('/admin'); break;
                    case 'executive': navigate('/executive'); break;
                    case 'student':  navigate('/student'); break;
                    default:         navigate('/');
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
            {/* Animated background blobs */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse"></div>
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-indigo-600 rounded-full mix-blend-screen filter blur-[128px] opacity-20 animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-violet-700 rounded-full mix-blend-screen filter blur-[160px] opacity-10"></div>

            <div className="relative w-full max-w-md z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Brand Badge */}
                <div className="flex items-center justify-center mb-8 gap-2">
                    <div className="w-10 h-10 bg-gradient-to-tr from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg border border-blue-400/30">
                        <GraduationCap className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white font-extrabold text-2xl tracking-tight">CBE <span className="text-blue-400">Track</span></span>
                </div>

                <div className="bg-slate-800/70 backdrop-blur-xl border border-slate-700/80 p-8 rounded-3xl shadow-2xl shadow-black/40">
                    <div className="text-center mb-8">
                        <h1 className="text-xl font-extrabold text-white mb-1">เข้าสู่ระบบ</h1>
                        <p className="text-slate-400 text-sm">ระบบติดตามผลลัพธ์การเรียนรู้เชิงสมรรถนะ</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        {/* Citizen ID */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-wider">เลขประจำตัวประชาชน</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-400 transition-colors">
                                    <User className="h-4 w-4" />
                                </div>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength="13"
                                    required
                                    value={citizenId}
                                    onChange={(e) => setCitizenId(e.target.value.replace(/\D/g, ''))}
                                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-900/60 border border-slate-600/80 rounded-xl text-white placeholder-slate-600 focus:bg-slate-900/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none text-sm font-medium"
                                    placeholder="1 3 หลัก"
                                />
                                {/* Character counter */}
                                {citizenId.length > 0 && (
                                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold tabular-nums ${citizenId.length === 13 ? 'text-green-400' : 'text-slate-500'}`}>
                                        {citizenId.length}/13
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Password / DOB */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 ml-1 uppercase tracking-wider">รหัสผ่าน (วันเดือนปีเกิด)</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-400 transition-colors">
                                    <Lock className="h-4 w-4" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    inputMode="numeric"
                                    maxLength="8"
                                    required
                                    value={dob}
                                    onChange={(e) => setDob(e.target.value.replace(/\D/g, ''))}
                                    className="block w-full pl-11 pr-12 py-3.5 bg-slate-900/60 border border-slate-600/80 rounded-xl text-white placeholder-slate-600 focus:bg-slate-900/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all outline-none text-sm font-medium tracking-widest"
                                    placeholder="DDMMYYYY"
                                />
                                {/* Toggle show/hide */}
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-blue-400 transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                            <p className="text-[11px] text-slate-500 ml-1">ตัวอย่าง: เกิดวันที่ 5 ม.ค. 2555 → <span className="font-mono text-slate-400">05012555</span></p>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full relative group overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)] hover:shadow-[0_0_40px_-5px_rgba(59,130,246,0.7)] transition-all duration-300 disabled:cursor-not-allowed transform active:scale-[0.98] mt-2"
                        >
                            {/* Shimmer effect */}
                            <span className="absolute inset-0 w-1/3 h-full bg-white/10 skew-x-12 -translate-x-full group-hover:translate-x-[400%] transition-transform duration-700"></span>
                            <span className="relative flex items-center justify-center text-base tracking-wide">
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin w-5 h-5 mr-2" />
                                        กำลังตรวจสอบ...
                                    </>
                                ) : 'เข้าสู่ระบบ'}
                            </span>
                        </button>
                    </form>
                </div>

                <div className="mt-6 text-center text-xs text-slate-500">
                    <span className="font-bold text-slate-400">CBE Track</span> · สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.) © 2569
                </div>
            </div>
        </div>
    );
}
