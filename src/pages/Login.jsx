import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { loginWithCitizenId } from '../lib/auth';
import {
    BookOpen,
    CheckCircle2,
    Eye,
    EyeOff,
    HelpCircle,
    Loader2,
    Lock,
    LogIn,
    ShieldCheck,
    Sparkles,
    User,
} from 'lucide-react';
import toast from 'react-hot-toast';

const LEARNING_FORMATS = ['วิชา', 'หน่วยการเรียนรู้', 'โครงงาน', 'กิจกรรม'];

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
            toast.error('กรุณากรอกเลขประจำตัวประชาชน 13 หลักให้ครบถ้วน');
            return;
        }
        if (dob.length < 4) {
            toast.error('กรุณากรอกรหัสผ่าน (วันเดือนปีเกิด 8 หลัก)');
            return;
        }
        setLoading(true);
        try {
            const res = await loginWithCitizenId(citizenId, dob);
            if (res.status === 'success') {
                toast.success(res.message);
                loginUser(res.user);
                switch (res.user.role) {
                    case 'admin': navigate('/admin'); break;
                    case 'executive': navigate('/executive'); break;
                    case 'student': navigate('/student'); break;
                    default: navigate('/');
                }
            } else {
                toast.error(res.message);
            }
        } catch (err) {
            toast.error('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const idComplete = citizenId.length === 13;
    const dobComplete = dob.length === 8;

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 font-sans p-4 sm:p-6 lg:p-8 text-slate-100 overflow-hidden">
            
            {/* Background Decorative Glow Bubbles */}
            <div className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
            <div className="pointer-events-none absolute -right-20 -bottom-20 h-96 w-96 rounded-full bg-sky-600/15 blur-3xl" />

            <main className="relative z-10 w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl shadow-indigo-950/50 lg:grid lg:grid-cols-[1.1fr_1fr]">
                
                {/* ═══ Left Side: Brand Hero & Quick Demo Accounts ═══ */}
                <aside className="relative flex flex-col justify-between border-b border-white/10 bg-gradient-to-b from-indigo-900/40 to-slate-950/60 p-8 sm:p-10 lg:border-b-0 lg:border-r lg:p-12">
                    <div className="space-y-6">
                        {/* Brand Logo */}
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-500/30 ring-1 ring-white/20">
                                <BookOpen className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-black tracking-tight text-white">
                                        CBE <span className="text-indigo-400">Track</span>
                                    </span>
                                    <span className="rounded-full bg-indigo-500/20 px-2.5 py-0.5 text-[10px] font-bold text-indigo-300 border border-indigo-400/30">
                                        v2026
                                    </span>
                                </div>
                                <p className="text-xs text-indigo-200/70">ระบบประเมินและติดตามผลลัพธ์การเรียนรู้ฐานสมรรถนะ</p>
                            </div>
                        </div>

                        {/* Tagline */}
                        <div className="space-y-3 pt-2">
                            <h2 className="text-xl font-black text-white sm:text-2xl leading-snug">
                                ประเมินอย่างมีความหมาย <br />
                                <span className="text-indigo-200">
                                    ตัดสินผลด้วยหลักฐานเชิงประจักษ์
                                </span>
                            </h2>
                            <p className="text-xs leading-relaxed text-slate-300">
                                เชื่อมโยงผลลัพธ์การเรียนรู้ (LO) จาก 4 รูปแบบการจัดการเรียนรู้ เพื่อการรับรองผลลัพธ์การเรียนรู้ระดับสถานศึกษาที่โปร่งใสและตรวจสอบได้
                            </p>
                        </div>

                        {/* Learning Formats Pills */}
                        <div className="space-y-2 pt-2">
                            <p className="text-xs font-bold text-indigo-200 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> รูปแบบการจัดการเรียนรู้ที่รองรับ:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {LEARNING_FORMATS.map(format => (
                                    <span
                                        key={format}
                                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-extrabold text-indigo-100 backdrop-blur-md"
                                    >
                                        {format}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Security Feature Notice */}
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-300 backdrop-blur-md space-y-1">
                            <div className="font-extrabold text-white flex items-center gap-1.5">
                                <ShieldCheck className="h-4 w-4 text-emerald-400" /> มาตรฐานความปลอดภัยข้อมูลสถานศึกษา
                            </div>
                            <p className="text-[11px] leading-relaxed text-slate-400">
                                ใช้ข้อมูลเข้าสู่ระบบเฉพาะของตนเอง และออกจากระบบทุกครั้งเมื่อใช้อุปกรณ์ร่วมกัน การรับรองผลจะถูกบันทึกประวัติเพื่อตรวจสอบย้อนหลัง
                            </p>
                        </div>
                    </div>

                </aside>

                {/* ═══ Right Side: Clean Login Form ═══ */}
                <div className="flex flex-col justify-between bg-white p-8 sm:p-10 lg:p-12 text-slate-900">
                    <div className="space-y-6">
                        <div>
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-extrabold text-indigo-700 border border-indigo-100 mb-2">
                                <Lock className="h-3.5 w-3.5" /> เข้าสู่ระบบสถานศึกษา
                            </div>
                            <h1 className="text-2xl font-black text-slate-950 sm:text-3xl">เข้าสู่ระบบ</h1>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                กรอกเลขประจำตัวประชาชน 13 หลัก และรหัสผ่านเพื่อเริ่มใช้งาน
                            </p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5" noValidate>
                            
                            {/* Input 1: Citizen ID */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="citizen-id" className="text-xs font-extrabold text-slate-800">
                                        เลขประจำตัวประชาชน 13 หลัก <span className="text-rose-500">*</span>
                                    </label>
                                    <span className={`text-xs font-mono font-extrabold ${idComplete ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {citizenId.length}/13
                                    </span>
                                </div>

                                <div className="relative">
                                    <User className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                                    <input
                                        id="citizen-id"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="username"
                                        maxLength={13}
                                        required
                                        value={citizenId}
                                        onChange={(e) => setCitizenId(e.target.value.replace(/\D/g, ''))}
                                        placeholder="เช่น 1111111111111"
                                        className="min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50/50 pl-10 pr-10 py-3 text-sm font-extrabold tracking-wider text-slate-900 placeholder:text-slate-600 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                                    />
                                    {idComplete && (
                                        <CheckCircle2 className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-emerald-500" />
                                    )}
                                </div>
                            </div>

                            {/* Input 2: Password (DOB) */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="dob-password" className="text-xs font-extrabold text-slate-800">
                                        รหัสผ่าน (วันเดือนปีเกิด 8 หลัก) <span className="text-rose-500">*</span>
                                    </label>
                                    <span className={`text-xs font-mono font-extrabold ${dobComplete ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {dob.length}/8
                                    </span>
                                </div>

                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                                    <input
                                        id="dob-password"
                                        type={showPassword ? 'text' : 'password'}
                                        inputMode="numeric"
                                        autoComplete="current-password"
                                        maxLength={8}
                                        required
                                        value={dob}
                                        onChange={(e) => setDob(e.target.value.replace(/\D/g, ''))}
                                        placeholder="เช่น 01012540"
                                        className="min-h-12 w-full rounded-2xl border border-slate-300 bg-slate-50/50 pl-10 pr-14 py-3 text-sm font-extrabold tracking-widest text-slate-900 placeholder:text-slate-600 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                        className="absolute right-1 top-0 flex h-12 w-12 items-center justify-center text-slate-600 hover:text-slate-900 transition"
                                        title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>

                                <p className="text-[11px] leading-relaxed text-slate-500 flex items-center gap-1 pt-1">
                                    <HelpCircle className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                                    รหัสผ่านเริ่มต้นใช้วันเดือนปีเกิด พ.ศ. 8 หลัก เช่น 5 ม.ค. 2540 กรอก <strong className="text-slate-800 font-mono">05012540</strong>
                                </p>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-indigo-800 py-3.5 text-sm font-black text-white shadow-lg shadow-indigo-600/30 transition hover:from-indigo-700 hover:to-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/30 disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        กำลังตรวจสอบสิทธิการใช้งาน...
                                    </>
                                ) : (
                                    <>
                                        <LogIn className="h-4 w-4" /> เข้าสู่ระบบ
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Footer Support Info */}
                    <div className="mt-8 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
                        <p>หากพบปัญหาการเข้าสู่ระบบ กรุณาติดต่อฝ่ายวิชาการประจำสถานศึกษา</p>
                    </div>
                </div>
            </main>

            {/* Bottom Global Footer */}
            <footer className="mt-6 text-center text-xs font-semibold text-slate-400">
                CBE Track · ระบบติดตามผลลัพธ์การเรียนรู้ พ.ศ. {new Date().getFullYear() + 543}
            </footer>
        </div>
    );
}
