import { useState } from 'react';
import { ArrowUpCircle, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../AuthContext';
import { useDialog } from '../../lib/dialogContext';

// แท็บเลื่อนชั้นและจัดห้อง แยกออกจาก AdminDashboard ให้โหลดเฉพาะตอนเปิดแท็บ
// allStudents ส่งมาจากหน้าแม่ ใช้เติมตัวเลือกห้องและชั้นที่มีอยู่แล้วในโรงเรียน
export default function PromotionTab({ allStudents }) {
    const { currentUser } = useAuth();
    const dialog = useDialog();
    const [promoFromRoom, setPromoFromRoom] = useState('');
    const [promoToGrade, setPromoToGrade] = useState('');
    const [promoToRoom, setPromoToRoom] = useState('');
    const [loadingPromo, setLoadingPromo] = useState(false);
    const [promoStudents, setPromoStudents] = useState([]);
    const [promoSelectedStudents, setPromoSelectedStudents] = useState([]);

    const searchRoom = async () => {
        if (!promoFromRoom.trim()) return toast.error('กรุณาระบุห้อง');
        setLoadingPromo(true);
        try {
            const { data, error } = await supabase
                .from('users_students')
                .select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room, student_status')
                .eq('school_id', currentUser.school_id)
                .eq('current_room', promoFromRoom.trim())
                .order('student_code');
            if (error) throw error;
            if (data.length === 0) toast.error('ไม่พบนักเรียนในห้องนี้');
            else toast.success(`พบนักเรียน ${data.length} คน`);
            setPromoStudents(data || []);
            setPromoSelectedStudents((data || []).map(s => s.student_id));
        } catch (err) {
            toast.error('ข้อผิดพลาด: ' + err.message);
        } finally {
            setLoadingPromo(false);
        }
    };

    const promoteSelectedStudents = async () => {
        const count = promoSelectedStudents.length;
        const toGrade = promoToGrade.trim();
        const toRoom = promoToRoom.trim();
        const confirmed = await dialog.confirm({
            title: `ย้ายนักเรียน ${count} คนไปชั้น ${toGrade} ห้อง ${toRoom}?`,
            message: 'ชั้นและห้องประจำชั้นของนักเรียนที่เลือกจะเปลี่ยนทันที เลิกทำได้ภายใน 8 วินาทีหลังบันทึก',
            confirmLabel: `ย้าย ${count} คน`,
        });
        if (!confirmed) return;
        const previous = promoStudents
            .filter(student => promoSelectedStudents.includes(student.student_id))
            .map(student => ({ student_id: student.student_id, current_grade_level: student.current_grade_level, current_room: student.current_room }));
        try {
            for (let index = 0; index < promoSelectedStudents.length; index += 200) {
                const { error } = await supabase.from('users_students')
                    .update({ current_grade_level: toGrade, current_room: toRoom })
                    .eq('school_id', currentUser.school_id)
                    .in('student_id', promoSelectedStudents.slice(index, index + 200));
                if (error) throw error;
            }
            setPromoStudents([]);
            setPromoSelectedStudents([]);
            setPromoFromRoom('');
            setPromoToGrade('');
            setPromoToRoom('');
            dialog.undo(`ย้ายนักเรียน ${count} คนไป ${toGrade} ห้อง ${toRoom} แล้ว`, async () => {
                const groups = new Map();
                previous.forEach(row => {
                    const key = `${row.current_grade_level ?? ''}|${row.current_room ?? ''}`;
                    if (!groups.has(key)) groups.set(key, { grade: row.current_grade_level, room: row.current_room, ids: [] });
                    groups.get(key).ids.push(row.student_id);
                });
                for (const group of groups.values()) {
                    const { error } = await supabase.from('users_students')
                        .update({ current_grade_level: group.grade, current_room: group.room })
                        .eq('school_id', currentUser.school_id)
                        .in('student_id', group.ids);
                    if (error) return toast.error('เลิกทำไม่สำเร็จ: ' + error.message);
                }
                toast.success(`คืนชั้นและห้องเดิมให้นักเรียน ${count} คนแล้ว`);
            });
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        }
    };

    const rooms = [...new Set(allStudents.map(s => s.current_room).filter(Boolean))].sort();
    const grades = [...new Set(allStudents.map(s => s.current_grade_level).filter(Boolean))].sort();

    return (
        <div className="min-h-[500px] rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-6 border-b border-line pb-6">
                <h2 className="mb-2 flex items-center text-lg font-bold text-slate-900"><ArrowUpCircle className="mr-2 h-5 w-5 text-indigo-700" aria-hidden="true" />เลือกนักเรียนและกำหนดห้องใหม่</h2>
                <p className="text-sm font-medium text-slate-600">จัดการทั้งห้องหรือเลือกเฉพาะนักเรียนที่ย้ายห้องและต้องดูแลรายบุคคล</p>
            </div>

            <div className="mb-6 grid grid-cols-1 gap-8 md:grid-cols-2">
                <div className="rounded-2xl border border-line bg-slate-50 p-5">
                    <h3 className="mb-4 flex items-center font-bold text-slate-700"><Search className="mr-2 h-4 w-4" aria-hidden="true" /> 1. ค้นหานักเรียนจากห้องปัจจุบัน</h3>
                    <div className="flex gap-2">
                        <input
                            aria-label="ห้องปัจจุบันที่จะค้นหานักเรียน"
                            type="text"
                            placeholder="เช่น ป.1/1 (พิมพ์หรือเลือกจากรายการ)"
                            list="promo-rooms-list"
                            className="min-h-11 flex-1 rounded-xl border border-field px-4 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={promoFromRoom}
                            onChange={(e) => setPromoFromRoom(e.target.value)}
                        />
                        <datalist id="promo-rooms-list">
                            {rooms.map(room => <option key={room} value={room} />)}
                        </datalist>
                        <button
                            type="button"
                            onClick={searchRoom}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-800 px-4 font-bold text-white transition-colors hover:bg-slate-900"
                        >
                            {loadingPromo ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
                            ค้นหา
                        </button>
                    </div>
                </div>

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                    <h3 className="mb-4 flex items-center font-bold text-indigo-800"><ArrowUpCircle className="mr-2 h-4 w-4" aria-hidden="true" /> 2. กำหนดระดับชั้นและห้องเรียนใหม่</h3>
                    <div className="flex flex-col gap-3">
                        <input
                            aria-label="ระดับชั้นใหม่"
                            type="text"
                            placeholder="ชั้นใหม่ (เช่น ป.2) พิมพ์หรือเลือก"
                            list="promo-grades-list"
                            className="min-h-11 w-full rounded-xl border border-field px-4 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={promoToGrade}
                            onChange={(e) => setPromoToGrade(e.target.value)}
                        />
                        <datalist id="promo-grades-list">
                            {grades.map(grade => <option key={grade} value={grade} />)}
                        </datalist>
                        <input
                            aria-label="ห้องเรียนใหม่"
                            type="text"
                            placeholder="ห้องใหม่ (เช่น ป.2/1) พิมพ์หรือเลือก"
                            list="promo-rooms-list"
                            className="min-h-11 w-full rounded-xl border border-field px-4 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={promoToRoom}
                            onChange={(e) => setPromoToRoom(e.target.value)}
                        />
                        <button
                            type="button"
                            disabled={promoSelectedStudents.length === 0 || !promoToGrade || !promoToRoom}
                            onClick={promoteSelectedStudents}
                            className="btn-primary mt-2 w-full"
                        >
                            บันทึกการเลื่อนชั้น ({promoSelectedStudents.length} คน)
                        </button>
                    </div>
                </div>
            </div>

            {promoStudents.length > 0 && (
                <div className="mt-6 overflow-hidden rounded-2xl border border-line">
                    <div className="flex items-center justify-between border-b border-line bg-slate-50 px-4 py-3 font-bold text-slate-700">
                        <span>รายชื่อนักเรียนในห้อง</span>
                        <span className="rounded-lg bg-indigo-100 px-2 py-1 text-xs text-indigo-700">เลือก {promoSelectedStudents.length}/{promoStudents.length} คน</span>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                        <table className="w-full whitespace-nowrap text-left text-sm">
                            <thead className="sticky top-0 z-10 border-b border-line bg-white shadow-sm">
                                <tr className="text-slate-600">
                                    <th scope="col" className="w-16 px-4 py-3 text-center font-medium">
                                        <input
                                            type="checkbox"
                                            aria-label="เลือกนักเรียนทั้งหมดในห้อง"
                                            className="h-5 w-5 cursor-pointer rounded border-field text-indigo-700 focus:ring-indigo-600"
                                            checked={promoSelectedStudents.length === promoStudents.length && promoStudents.length > 0}
                                            onChange={(e) => setPromoSelectedStudents(e.target.checked ? promoStudents.map(s => s.student_id) : [])}
                                        />
                                    </th>
                                    <th scope="col" className="w-16 px-4 py-3 text-center font-medium">ลำดับ</th>
                                    <th scope="col" className="w-32 px-4 py-3 font-medium">รหัสนักเรียน</th>
                                    <th scope="col" className="px-4 py-3 font-medium">ชื่อ-นามสกุล</th>
                                    <th scope="col" className="px-4 py-3 font-medium">ชั้นปัจจุบัน</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line bg-white">
                                {promoStudents.map((s, i) => (
                                    <tr key={s.student_id} className="hover:bg-slate-50">
                                        <td className="px-4 py-2 text-center">
                                            <input
                                                type="checkbox"
                                                aria-label={`เลือก ${s.first_name} ${s.last_name}`}
                                                className="h-5 w-5 cursor-pointer rounded border-field text-indigo-700 focus:ring-indigo-600"
                                                checked={promoSelectedStudents.includes(s.student_id)}
                                                onChange={(e) => setPromoSelectedStudents(e.target.checked
                                                    ? [...promoSelectedStudents, s.student_id]
                                                    : promoSelectedStudents.filter(id => id !== s.student_id))}
                                            />
                                        </td>
                                        <td className="px-4 py-2 text-center font-semibold text-slate-600">{i + 1}</td>
                                        <td className="px-4 py-2 font-mono text-slate-600">{s.student_code}</td>
                                        <td className="px-4 py-2 font-bold text-slate-800">{s.prefix || ''}{s.first_name} {s.last_name}</td>
                                        <td className="px-4 py-2 text-slate-600">{s.current_grade_level} ({s.current_room})</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
