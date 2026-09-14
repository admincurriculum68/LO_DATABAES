import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { loginWithCitizenId } from '../lib/auth';
import { isCitizenIdFormat, normalizeCitizenInput } from '../lib/importSanitizers';
import { defaultRouteFor } from '../lib/roles';
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
import useDocumentTitle from '../lib/useDocumentTitle';

const LEARNING_FORMATS = ['วิชา', 'หน่วยการเรียนรู้', 'โครงงาน', 'กิจกรรม'];

export default function Login() {
    useDocumentTitle('เข้าสู่ระบบ');
    const [citizenId, setCitizenId] = useState('');
    const [dob, setDob] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { loginUser } = useAuth();
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!isCitizenIdFormat(citizenId)) {
            toast.error('กรุณากรอกเลขประจำตัวให้ครบ: ตัวเลข 13 หลัก หรือ G ตามด้วยตัวเลข 12 หลัก');
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
                navigate(defaultRouteFor(res.user));
            } else {
                toast.error(res.message);
            }
        } catch (err) {
            toast.error('เข้าสู่ระบบไม่สำเร็จ: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const idComplete = isCitizenIdFormat(citizenId);
    // นักเรียนที่ไม่มีเลขประจำตัวประชาชนใช้เลข G แป้นตัวเลขบนมือถือพิมพ์ G ไม่ได้ จึงมีปุ่มเติมให้
    const usesG = citizenId.startsWith('G');
    const dobComplete = dob.length === 8;

    return (
        <div className="relative flex min-h-screen flex-col items-center justify-center bg-paper p-4 font-sans text-slate-800 sm:p-6 lg:p-8">
            <main className="w-full max-w-5xl overflow-hidden rounded-2xl border border-line bg-white shadow-md lg:grid lg:grid-cols-[1.1fr_1fr]">
                
                {/* ═══ Left Side: Brand Hero & Quick Demo Accounts ═══ */}
                <aside className="relative flex flex-col justify-between border-b border-indigo-900 bg-indigo-800 p-8 text-white sm:p-10 lg:border-b-0 lg:border-r lg:p-12">
                    <div className="space-y-6">
                        {/* Brand Logo */}
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-white">
                                <BookOpen className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold tracking-tight text-white">
                                        CBE <span className="text-indigo-100">Track</span>
                                    </span>
                                    <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-xs font-bold text-indigo-50">
                                        v2026
                                    </span>
                                </div>
                                <p className="text-xs text-indigo-100">ระบบประเมินและติดตามผลลัพธ์การเรียนรู้ฐานสมรรถนะ</p>
                            </div>
                        </div>

                        {/* Tagline */}
                        <div className="space-y-3 pt-2">
                            <p className="text-xl font-bold text-white sm:text-2xl leading-snug">
                                ประเมินอย่างมีความหมาย <br />
                                <span className="text-amber-200">
                                    ตัดสินผลด้วยหลักฐานเชิงประจักษ์
                                </span>
                            </p>
                            <p className="text-xs leading-relaxed text-indigo-100">
                                เชื่อมโยงผลลัพธ์การเรียนรู้ (LO) จาก 4 รูปแบบการจัดการเรียนรู้ เพื่อการรับรองผลลัพธ์การเรียนรู้ระดับสถานศึกษาที่โปร่งใสและตรวจสอบได้
                            </p>
                        </div>

                        {/* Learning Formats Pills */}
                        <div className="space-y-2 pt-2">
                            <p className="text-xs font-bold text-indigo-50 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-amber-300" /> รูปแบบการจัดการเรียนรู้ที่รองรับ:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {LEARNING_FORMATS.map(format => (
                                    <span
                                        key={format}
                                        className="rounded-lg border border-white/25 bg-white/10 px-3 py-1 text-xs font-bold text-indigo-50"
                                    >
                                        {format}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Security Feature Notice */}
                        <div className="rounded-lg border border-white/25 bg-white/10 p-4 text-xs text-indigo-100 space-y-1">
                            <div className="font-bold text-white flex items-center gap-1.5">
                                <ShieldCheck className="h-4 w-4 text-emerald-400" /> มาตรฐานความปลอดภัยข้อมูลสถานศึกษา
                            </div>
                            <p className="text-xs leading-relaxed text-indigo-100">
                                ใช้ข้อมูลเข้าสู่ระบบเฉพาะของตนเอง และออกจากระบบทุกครั้งเมื่อใช้อุปกรณ์ร่วมกัน การรับรองผลจะถูกบันทึกประวัติเพื่อตรวจสอบย้อนหลัง
                            </p>
                        </div>
                    </div>

                </aside>

                {/* ═══ Right Side: Clean Login Form ═══ */}
                <div className="flex flex-col justify-between bg-white p-8 sm:p-10 lg:p-12 text-slate-900">
                    <div className="space-y-6">
                        <div>
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-100 mb-2">
                                <Lock className="h-3.5 w-3.5" /> เข้าสู่ระบบสถานศึกษา
                            </div>
                            <h1 className="text-2xl font-bold text-slate-950 sm:text-3xl">เข้าสู่ระบบ</h1>
                            <p className="mt-1 text-xs font-medium text-slate-500">
                                กรอกเลขประจำตัวประชาชน 13 หลัก และรหัสผ่านเพื่อเริ่มใช้งาน
                            </p>
                        </div>

                        <form onSubmit={handleLogin} className="space-y-5" noValidate>
                            
                            {/* Input 1: Citizen ID */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="citizen-id" className="text-xs font-bold text-slate-800">
                                        เลขประจำตัวประชาชน 13 หลัก <span className="text-rose-600">*</span>
                                    </label>
                                    <span className={`text-xs font-mono font-bold ${idComplete ? 'text-emerald-700' : 'text-slate-500'}`}>
                                        {citizenId.length}/13
                                    </span>
                                </div>

                                <div className="relative">
                                    <User className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
                                    <input
                                        id="citizen-id"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="username"
                                        maxLength={13}
                                        required
                                        value={citizenId}
                                        onChange={(e) => setCitizenId(normalizeCitizenInput(e.target.value))}
                                        placeholder="เช่น 1111111111111"
                                        className="min-h-12 w-full rounded-2xl border border-field bg-slate-50/50 pl-10 pr-10 py-3 text-sm font-bold tracking-wider text-slate-900 placeholder:text-slate-600 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
                                    />
                                    {idComplete && (
                                        <CheckCircle2 className="pointer-events-none absolute right-3.5 top-3.5 h-4 w-4 text-emerald-500" />
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setCitizenId(previous => (previous.startsWith('G') ? previous.slice(1) : normalizeCitizenInput(`G${previous}`)));
                                        document.getElementById('citizen-id')?.focus();
                                    }}
                                    aria-pressed={usesG}
                                    className="inline-flex min-h-11 items-center text-xs font-semibold text-indigo-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
                                >
                                    {usesG ? 'เลขประจำตัวไม่ได้ขึ้นต้นด้วย G กดเพื่อเอา G ออก' : 'นักเรียนที่ใช้เลข G กดที่นี่เพื่อเติม G'}
                                </button>
                            </div>

                            {/* Input 2: Password (DOB) */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="dob-password" className="text-xs font-bold text-slate-800">
                                        รหัสผ่าน (วันเดือนปีเกิด 8 หลัก) <span className="text-rose-600">*</span>
                                    </label>
                                    <span className={`text-xs font-mono font-bold ${dobComplete ? 'text-emerald-700' : 'text-slate-500'}`}>
                                        {dob.length}/8
                                    </span>
                                </div>

                                <div className="relative">
                                    <Lock className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
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
                                        className="min-h-12 w-full rounded-2xl border border-field bg-slate-50/50 pl-10 pr-14 py-3 text-sm font-bold tracking-widest text-slate-900 placeholder:text-slate-600 transition focus:border-indigo-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
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

                                <p className="text-xs leading-relaxed text-slate-500 flex items-center gap-1 pt-1">
                                    <HelpCircle className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                    รหัสผ่านเริ่มต้นใช้วันเดือนปีเกิด พ.ศ. 8 หลัก เช่น 5 ม.ค. 2540 กรอก <strong className="text-slate-800 font-mono">05012540</strong>
                                </p>
                            </div>

                            {/* Submit Button */}
                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-primary w-full"
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
                    <div className="mt-8 border-t border-line pt-4 text-center text-xs text-slate-500">
                        <p>หากพบปัญหาการเข้าสู่ระบบ กรุณาติดต่อฝ่ายวิชาการประจำสถานศึกษา</p>
                    </div>
                </div>
            </main>

            {/* Bottom Global Footer */}
            <footer className="mt-6 text-center text-xs font-semibold text-slate-600">
                CBE Track · ระบบติดตามผลลัพธ์การเรียนรู้ พ.ศ. {new Date().getFullYear() + 543}
            </footer>
        </div>
    );
}
