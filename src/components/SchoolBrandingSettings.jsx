import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Save, School, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../AuthContext';
import { loadSchoolProfile, resizeSchoolLogo, saveSchoolProfile } from '../lib/schoolProfile';

export default function SchoolBrandingSettings() {
    const { currentUser, updateCurrentUser } = useAuth();
    const fileRef = useRef(null);
    const [profile, setProfile] = useState({ school_name: '', logo_data_url: '', logoReady: true });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let active = true;
        loadSchoolProfile(currentUser?.school_id)
            .then(data => { if (active) setProfile(data); })
            .catch(error => toast.error('โหลดข้อมูลโรงเรียนไม่สำเร็จ: ' + error.message))
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [currentUser?.school_id]);

    const chooseLogo = async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
            const logo = await resizeSchoolLogo(file);
            setProfile(previous => ({ ...previous, logo_data_url: logo }));
        } catch (error) {
            toast.error(error.message);
        }
    };

    const save = async () => {
        if (!profile.school_name.trim()) return toast.error('กรุณาระบุชื่อโรงเรียน');
        if (!profile.logoReady) return toast.error('กรุณารัน update_schema_school_reports.sql ก่อนบันทึกตราโรงเรียน');
        setSaving(true);
        try {
            await saveSchoolProfile(currentUser.school_id, profile);
            updateCurrentUser({ school_name: profile.school_name.trim() });
            toast.success('บันทึกชื่อและตราโรงเรียนสำหรับแบบรายงานแล้ว');
        } catch (error) {
            toast.error('บันทึกข้อมูลโรงเรียนไม่สำเร็จ: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="school-report-settings-title">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-slate-50">
                        {profile.logo_data_url ? <img src={profile.logo_data_url} alt="ตัวอย่างตราโรงเรียน" className="h-full w-full object-contain p-2" /> : <School className="h-9 w-9 text-slate-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 id="school-report-settings-title" className="font-extrabold text-slate-950">ชื่อและตราโรงเรียนบนแบบรายงาน</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">ใช้กับปกรายวิชา รายงานข้อความ LO และแบบรายงานผลด้านความสามารถ</p>
                        {!profile.logoReady && <p className="surface-warning mt-2 rounded-lg px-3 py-2 text-xs font-bold text-amber-900">ฐานข้อมูลยังไม่มีช่องตราโรงเรียน กรุณารันไฟล์ update_schema_school_reports.sql ใน Supabase SQL Editor</p>}
                    </div>
                </div>
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_auto]">
                    <label className="sm:col-span-2"><span className="mb-1 block text-xs font-bold text-slate-700">ชื่อโรงเรียนที่แสดงบนรายงาน</span><input value={profile.school_name} onChange={event => setProfile(previous => ({ ...previous, school_name: event.target.value }))} disabled={loading} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-900 disabled:bg-slate-100" /></label>
                    <div className="flex flex-wrap gap-2">
                        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} className="sr-only" />
                        <button type="button" onClick={() => fileRef.current?.click()} disabled={loading || !profile.logoReady} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><ImagePlus className="h-4 w-4" />เลือกตราโรงเรียน</button>
                        {profile.logo_data_url && <button type="button" onClick={() => setProfile(previous => ({ ...previous, logo_data_url: '' }))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-sm font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="h-4 w-4" />นำออก</button>}
                    </div>
                    <button type="button" onClick={save} disabled={loading || saving || !profile.logoReady} className="action-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'กำลังบันทึก' : 'บันทึกข้อมูลรายงาน'}</button>
                </div>
            </div>
        </section>
    );
}
