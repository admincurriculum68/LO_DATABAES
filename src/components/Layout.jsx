import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useAcademic } from '../AcademicContext';
import { LogOut, UserCircle, BookOpen, Calendar, ChevronDown } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { defaultRouteFor, hasRole, roleLabelsFor } from '../lib/roles';
import useDocumentTitle from '../lib/useDocumentTitle';
import { useDialog } from '../lib/dialogContext';

export default function Layout({ children, title, onActionClick, actionText, actionIcon: ActionIcon }) {
    const { currentUser, logoutUser } = useAuth();
    const dialog = useDialog();
    const { academicYear, semester, setAcademicYear, setSemester, updateAcademicSettings } = useAcademic();
    const navigate = useNavigate();
    const location = useLocation();
    const [showTermPicker, setShowTermPicker] = useState(false);
    const termToggleRef = useRef(null);
    useDocumentTitle(title);

    // กด Esc แล้วปิดตัวเลือกภาคเรียน และคืนโฟกัสให้ปุ่มที่เปิด ผู้ใช้คีย์บอร์ดจะได้ไม่หลงตำแหน่ง
    useEffect(() => {
        if (!showTermPicker) return undefined;
        const closeOnEscape = event => {
            if (event.key !== 'Escape') return;
            setShowTermPicker(false);
            termToggleRef.current?.focus();
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [showTermPicker]);

    // เมนูเลื่อนแนวนอนได้บนจอเล็ก ขอบจางบอกว่ายังมีเมนูต่อ และเมนูของหน้าปัจจุบันต้องอยู่ในจอเสมอ
    const navScrollRef = useRef(null);
    const [navFade, setNavFade] = useState({ left: false, right: false });
    const updateNavFade = useCallback(() => {
        const element = navScrollRef.current;
        if (!element) return;
        const left = element.scrollLeft > 4;
        const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 4;
        setNavFade(previous => (previous.left === left && previous.right === right ? previous : { left, right }));
    }, []);
    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            navScrollRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            updateNavFade();
        });
        return () => window.cancelAnimationFrame(frame);
    }, [location.pathname, location.search, updateNavFade]);
    useEffect(() => {
        window.addEventListener('resize', updateNavFade);
        return () => window.removeEventListener('resize', updateNavFade);
    }, [updateNavFade]);

    const handleLogout = async () => {
        const confirmed = await dialog.confirm({
            title: 'ออกจากระบบ CBE Track?',
            message: 'ข้อความที่ยังไม่ได้บันทึกในหน้านี้จะหายไป',
            confirmLabel: 'ออกจากระบบ',
        });
        if (!confirmed) return;
        logoutUser();
        navigate('/login');
    };

    // ครู 1 คนมีได้หลายบทบาท ป้ายจึงแสดงทุกบทบาทที่ปฏิบัติจริง
    const roleLabels = roleLabelsFor(currentUser);

    // เมนูของทุกบทบาทถูกนำมารวมกัน แล้วแยกเป็นหัวข้อ เพื่อให้ครูที่เป็นฝ่ายวิชาการด้วย
    // ทำงานต่อเนื่องได้โดยไม่ต้องสลับโหมด
    const navigationGroups = [
        {
            key: 'teacher',
            heading: 'งานสอนของฉัน',
            visible: hasRole(currentUser, 'teacher'),
            items: [
                { label: 'งานของฉัน', path: '/', exact: true },
                // ครูประจำชั้นทำงานทั้งห้อง ครูรายวิชาเข้าหน้าเดียวกันเพื่อสรุปเฉพาะด้านของวิชาตัวเอง
                { label: currentUser?.homeroom ? 'งานประจำชั้น' : 'สรุปความสามารถรายด้าน', path: '/homeroom' },
            ],
        },
        {
            key: 'admin',
            heading: 'งานวิชาการ',
            visible: hasRole(currentUser, 'admin'),
            items: [
                { label: 'หน้าหลัก', path: '/admin', exact: true },
                {
                    label: 'ตั้งค่าข้อมูล',
                    path: '/admin/setup',
                    tabs: ['data', 'import', 'mapping', 'enrollment', 'promotion'],
                    relatedPaths: ['/admin/people', '/admin/learning-contexts', '/admin/subject-teachers', '/admin/curriculum-equivalency'],
                },
                { label: 'กลุ่มเรียน', path: '/admin/learning-groups' },
                { label: 'ติดตามการรายงานผล', path: '/admin?tab=progress', tab: 'progress' },
                { label: 'ตรวจผลรายด้าน', path: '/admin/approval' },
            ],
        },
        {
            key: 'executive',
            heading: 'ภาพรวมสถานศึกษา',
            visible: hasRole(currentUser, 'executive'),
            items: [
                { label: 'ภาพรวม', path: '/executive', exact: true },
                { label: 'ผลรายด้าน', path: '/admin/report-competency' },
            ],
        },
        {
            key: 'student',
            heading: '',
            visible: hasRole(currentUser, 'student'),
            items: [{ label: 'ผลการเรียนของฉัน', path: '/student', exact: true }],
        },
    ].filter(group => group.visible && group.items.length > 0);

    // แสดงหัวข้อคั่นเฉพาะเมื่อผู้ใช้มีมากกว่า 1 กลุ่มงาน
    const showGroupHeadings = navigationGroups.length > 1;
    const isActive = item => {
        const activeAdminTab = location.pathname === '/admin' ? new URLSearchParams(location.search).get('tab') : null;
        if (item.tab) return location.pathname === '/admin' && new URLSearchParams(location.search).get('tab') === item.tab;
        if (item.tabs?.includes(activeAdminTab)) return true;
        if (item.relatedPaths?.some(path => location.pathname.startsWith(path))) return true;
        if (item.exact) return location.pathname === item.path && !location.search;
        return location.pathname.startsWith(item.path);
    };

    const isAdmin = hasRole(currentUser, 'admin');

    const handleTermChange = async (year, sem) => {
        if (isAdmin) {
            // ฝ่ายวิชาการเปลี่ยนแล้วมีผลกับผู้ใช้ทุกคนในโรงเรียนทันที เลือกพลาดครั้งเดียว
            // ครูทั้งโรงเรียนจะบันทึกผลผิดภาค จึงต้องถามก่อน ไม่เปลี่ยนทันทีที่เลือก (WCAG 3.2.2)
            if (!(await dialog.confirm({
                title: `เปลี่ยนเป็นภาคเรียนที่ ${sem}/${year}?`,
                message: 'ครู นักเรียน และผู้บริหารทุกคนในโรงเรียนจะเห็นและบันทึกผลในภาคเรียนนี้ทันที',
                confirmLabel: 'เปลี่ยนภาคเรียน',
            }))) return;
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
        <div className="flex min-h-screen flex-col bg-paper font-sans text-slate-800">
            {/* ลิงก์แบบ #anchor ใช้ไม่ได้เพราะแอปใช้ HashRouter จึงย้ายโฟกัสด้วยปุ่มแทน */}
            <button
                type="button"
                onClick={() => document.getElementById('main-content')?.focus()}
                className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-indigo-700 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg print:hidden"
            >
                ข้ามไปยังเนื้อหาหลัก
            </button>

            <header className="sticky top-0 z-40 print:hidden">
                {/* แถบตัวตน: ชื่อระบบ ชื่อโรงเรียน ภาคเรียนที่ใช้อยู่ และผู้ใช้ */}
                <div className="bg-indigo-800 text-white">
                    <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                        <button
                            onClick={() => navigate(defaultRouteFor(currentUser))}
                            aria-label="กลับหน้าหลัก CBE Track"
                            className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white/10" aria-hidden="true">
                                <BookOpen className="h-4 w-4" />
                            </span>
                            <span className="flex min-w-0 flex-col text-left leading-tight">
                                <span className="font-display text-sm font-semibold tracking-wide">CBE Track</span>
                                <span className="truncate text-xs text-indigo-100" title={currentUser?.school_name || undefined}>
                                    {currentUser?.school_name || 'ระบบติดตามผลลัพธ์การเรียนรู้'}
                                </span>
                            </span>
                        </button>

                        <div className="flex items-center gap-2">
                            {!hasRole(currentUser, 'student') && academicYear && (
                                <div className="relative">
                                    <button
                                        ref={termToggleRef}
                                        onClick={() => setShowTermPicker(!showTermPicker)}
                                        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                                        aria-expanded={showTermPicker}
                                        aria-label="เลือกปีการศึกษาและภาคเรียน"
                                    >
                                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                                        <span className="hidden sm:inline">ภาคเรียนที่</span> {semester}/{academicYear}
                                        <ChevronDown className={`h-3 w-3 transition-transform ${showTermPicker ? 'rotate-180' : ''}`} aria-hidden="true" />
                                    </button>

                                    {showTermPicker && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={() => setShowTermPicker(false)} />
                                            <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-line bg-white p-4 text-slate-800 shadow-xl">
                                                <p className="mb-3 text-xs font-semibold text-slate-600">
                                                    {isAdmin ? 'กำหนดปีการศึกษาและภาคเรียนของระบบ' : 'เลือกปีการศึกษาและภาคเรียน'}
                                                </p>
                                                <div className="space-y-3">
                                                    <div>
                                                        <label htmlFor="term-year" className="mb-1 block text-xs font-semibold text-slate-600">ปีการศึกษา</label>
                                                        <select
                                                            id="term-year"
                                                            value={academicYear}
                                                            onChange={(e) => handleTermChange(parseInt(e.target.value), semester)}
                                                            className="min-h-11 w-full rounded-lg border border-field px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                                        >
                                                            {yearOptions.map(y => (
                                                                <option key={y} value={y}>{y}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <p id="term-semester-label" className="mb-1 block text-xs font-semibold text-slate-600">ภาคเรียน</p>
                                                        <div className="flex gap-2" role="group" aria-labelledby="term-semester-label">
                                                            {[1, 2].map(s => (
                                                                <button
                                                                    key={s}
                                                                    onClick={() => handleTermChange(academicYear, s)}
                                                                    aria-pressed={semester === s}
                                                                    className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold transition-colors ${
                                                                        semester === s
                                                                            ? 'border-indigo-700 bg-indigo-700 text-white'
                                                                            : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'
                                                                    }`}
                                                                >
                                                                    ภาคเรียนที่ {s}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    {isAdmin && (
                                                        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                                            การเปลี่ยนค่านี้มีผลต่อปีการศึกษาและภาคเรียนเริ่มต้นของผู้ใช้ทุกบทบาท
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {onActionClick && (
                                <button
                                    onClick={onActionClick}
                                    className="hidden min-h-11 items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:flex"
                                >
                                    {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
                                    {actionText}
                                </button>
                            )}

                            <div className="hidden items-center gap-2 border-l border-white/20 pl-3 sm:flex">
                                <UserCircle className="h-6 w-6 shrink-0 text-indigo-100" aria-hidden="true" />
                                <span className="flex flex-col leading-tight">
                                    <span className="max-w-[160px] truncate text-xs font-semibold">{currentUser?.full_name}</span>
                                    <span className="truncate text-xs text-indigo-100">{roleLabels.join(' · ')}</span>
                                </span>
                            </div>

                            <button
                                onClick={handleLogout}
                                title="ออกจากระบบ"
                                aria-label="ออกจากระบบ"
                                className="flex h-11 w-11 items-center justify-center rounded-lg text-indigo-100 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                            >
                                <LogOut className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* แถบเมนู: ขีดเส้นใต้รายการที่เปิดอยู่ แบบเดียวกับเว็บหน่วยงาน */}
                {navigationGroups.length > 0 && (
                    <nav className="relative border-b border-line bg-white" aria-label="เมนูหลัก">
                        <div ref={navScrollRef} onScroll={updateNavFade} className="mx-auto flex max-w-7xl snap-x items-stretch gap-1 overflow-x-auto scroll-px-4 px-4 sm:px-6 lg:px-8">
                            {navigationGroups.map((group, groupIndex) => (
                                <div key={group.key} className="flex shrink-0 items-stretch gap-1">
                                    {showGroupHeadings && group.heading && (
                                        <span className={`flex shrink-0 items-center whitespace-nowrap px-2 text-xs font-semibold uppercase tracking-[0.06em] text-slate-500 ${groupIndex > 0 ? 'ml-2 border-l border-line pl-4' : ''}`}>
                                            {group.heading}
                                        </span>
                                    )}
                                    {group.items.map(item => (
                                        <button
                                            key={item.path}
                                            type="button"
                                            onClick={() => navigate(item.path)}
                                            aria-current={isActive(item) ? 'page' : undefined}
                                            className={`min-h-12 shrink-0 snap-start border-b-2 px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 ${
                                                isActive(item)
                                                    ? 'border-indigo-700 text-indigo-800'
                                                    : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-indigo-800'
                                            }`}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                        {navFade.left && <span className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent" aria-hidden="true" />}
                        {navFade.right && <span className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white to-transparent" aria-hidden="true" />}
                    </nav>
                )}
            </header>

            {/* ปุ่มงานหลักของหน้า สำหรับจอเล็กที่ซ่อนปุ่มบนแถบตัวตน */}
            {onActionClick && (
                <div className="px-4 pt-4 sm:hidden print:hidden">
                    <button onClick={onActionClick} className="btn-secondary w-full">
                        {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden="true" />}
                        {actionText}
                    </button>
                </div>
            )}

            <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-grow px-4 py-8 focus:outline-none sm:px-6 lg:px-8 print:max-w-none print:p-0">
                {children}
            </main>
        </div>
    );
}
