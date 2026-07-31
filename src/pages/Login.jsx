import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { loginWithCitizenId } from '../lib/auth';
import { BookOpen, Lock, User, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react';
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
            toast.error('กรุณากรอกเลขประจำตัวประชาชน 13 หลักให้ครบ');
            return;
        }
        if (dob.length !== 8) {
            toast.error('กรุณากรอกรหัสผ่าน 8 หลักในรูปแบบวันเดือนปีเกิด');
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
            toast.error('ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const idComplete = citizenId.length === 13;

    return (
        <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900">
            <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
                <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid lg:grid-cols-[1.05fr_1fr]">

                    {/* แผงข้อมูลระบบ อ่านได้ชัดแม้ฉายขึ้นจอในห้องประชุม */}
                    <aside className="border-b border-indigo-100 bg-indigo-50/70 px-7 py-8 sm:px-9 lg:border-b-0 lg:border-r lg:px-10 lg:py-12">
                        <div className="flex items-center gap-3">
                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm">
                                <BookOpen className="h-5 w-5" />
                            </span>
                            <span className="text-2xl font-black tracking-tight text-slate-900">
                                CBE <span className="text-indigo-700">Track</span>
                            </span>
                        </div>

                        <p className="mt-6 max-w-[34ch] text-lg font-bold leading-8 text-slate-800 sm:text-xl sm:leading-9">
                            ระบบติดตามผลลัพธ์การเรียนรู้เชิงสมรรถนะ สำหรับสถานศึกษา
                        </p>
                        <p className="mt-3 max-w-[46ch] text-sm leading-7 text-slate-700">
                            รวบรวมหลักฐานการเรียนรู้จากหลายบริบท เพื่อให้ฝ่ายวิชาการตัดสินและรับรองผลลัพธ์การเรียนรู้ของผู้เรียนได้อย่างตรวจสอบย้อนกลับได้
                        </p>

                        <div className="mt-8 hidden sm:block">
                            <p className="text-sm font-bold text-slate-700">รองรับรูปแบบการจัดการเรียนรู้</p>
                            <ul className="mt-3 flex flex-wrap gap-2">
                                {LEARNING_FORMATS.map(format => (
                                    <li
                                        key={format}
                                        className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-bold text-indigo-800"
                                    >
                                        {format}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <p className="mt-8 hidden items-start gap-2.5 text-sm leading-6 text-slate-700 lg:flex">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />
                            ผู้ใช้แต่ละบทบาทเห็นข้อมูลเฉพาะส่วนที่รับผิดชอบ และทุกการรับรองผลมีผู้รับผิดชอบกำกับไว้
                        </p>
                    </aside>

                    {/* แบบฟอร์มเข้าสู่ระบบ */}
                    <div className="px-7 py-8 sm:px-9 sm:py-10 lg:px-10 lg:py-12">
                        <h1 className="text-2xl font-black tracking-tight text-slate-950">เข้าสู่ระบบ</h1>
                        <p className="mt-1.5 text-sm text-slate-600">กรอกข้อมูลของท่านเพื่อเริ่มใช้งาน</p>

                        <form onSubmit={handleLogin} className="mt-8 space-y-6" noValidate>
                            <div>
                                <label htmlFor="citizen-id" className="block text-sm font-bold text-slate-800">
                                    เลขประจำตัวประชาชน 13 หลัก
                                </label>
                                <div className="relative mt-2">
                                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                                        <User className="h-4 w-4" />
                                    </span>
                                    <input
                                        id="citizen-id"
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="username"
                                        maxLength={13}
                                        required
                                        value={citizenId}
                                        onChange={(e) => setCitizenId(e.target.value.replace(/\D/g, ''))}
                                        placeholder="ไม่ต้องเว้นวรรค"
                                        className="block min-h-[3.25rem] w-full rounded-xl border border-slate-300 bg-white pl-11 pr-16 text-base font-semibold tracking-wide text-slate-900 outline-none transition-colors placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 hover:border-slate-400 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
                                    />
                                    {citizenId.length > 0 && (
                                        <span
                                            aria-hidden="true"
                                            className={`absolute inset-y-0 right-4 flex items-center text-sm font-bold tabular-nums ${idComplete ? 'text-emerald-700' : 'text-slate-500'}`}
                                        >
                                            {citizenId.length}/13
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label htmlFor="dob-password" className="block text-sm font-bold text-slate-800">
                                    รหัสผ่าน
                                </label>
                                <div className="relative mt-2">
                                    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                                        <Lock className="h-4 w-4" />
                                    </span>
                                    <input
                                        id="dob-password"
                                        type={showPassword ? 'text' : 'password'}
                                        inputMode="numeric"
                                        autoComplete="current-password"
                                        maxLength={8}
                                        required
                                        value={dob}
                                        onChange={(e) => setDob(e.target.value.replace(/\D/g, ''))}
                                        aria-describedby="dob-hint"
                                        placeholder="วันเดือนปีเกิด 8 หลัก"
                                        className="block min-h-[3.25rem] w-full rounded-xl border border-slate-300 bg-white pl-11 pr-14 text-base font-semibold tracking-widest text-slate-900 outline-none transition-colors placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 hover:border-slate-400 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(v => !v)}
                                        aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                        aria-pressed={showPassword}
                                        className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-4 text-slate-500 transition-colors hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-100"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                <p id="dob-hint" className="mt-2 text-sm leading-6 text-slate-600">
                                    บัญชีที่ยังไม่ได้เปลี่ยนรหัสผ่าน ใช้วันเดือนปีเกิด เช่น 5 มกราคม 2555 กรอก{' '}
                                    <span className="font-mono font-bold text-slate-900">05012555</span>
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 text-base font-bold text-white transition-colors hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 active:bg-indigo-900 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        กำลังตรวจสอบข้อมูล...
                                    </>
                                ) : 'เข้าสู่ระบบ'}
                            </button>
                        </form>

                        <p className="mt-8 border-t border-slate-200 pt-5 text-sm leading-6 text-slate-600">
                            หากเข้าสู่ระบบไม่ได้ กรุณาติดต่อฝ่ายวิชาการของสถานศึกษาเพื่อตรวจสอบข้อมูลบัญชีผู้ใช้
                        </p>
                    </div>
                </div>
            </main>

            <footer className="px-4 pb-8 text-center text-sm text-slate-600">
                <span className="font-bold text-slate-800">CBE Track</span> · สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.) © {new Date().getFullYear() + 543}
            </footer>
        </div>
    );
}
