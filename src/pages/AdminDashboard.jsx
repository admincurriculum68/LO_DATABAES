import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import Layout from '../components/Layout';
import { Settings, Users, BookMarked, Upload, Link as LinkIcon, Download, Trash2, Edit, Save, Plus, X, Search, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import Papa from 'papaparse';
import { hashPassword } from '../lib/auth';

export default function AdminDashboard() {
    const { currentUser } = useAuth();
    const [activeTab, setActiveTab] = useState('data'); // 'data', 'import', 'mapping'

    // Data Tab States
    const [selectedTable, setSelectedTable] = useState('');
    const [tableData, setTableData] = useState([]);
    const [loadingData, setLoadingData] = useState(false);
    const [editingRow, setEditingRow] = useState(null);

    // Mapping Tab States
    const [subjects, setSubjects] = useState([]);
    const [mappingSubject, setMappingSubject] = useState('');
    const [allLOs, setAllLOs] = useState([]);
    const [mappedLOs, setMappedLOs] = useState([]);
    const [loadingMapping, setLoadingMapping] = useState(false);
    const [savingMapping, setSavingMapping] = useState(false);

    // Enrollment UI States
    const [allStudents, setAllStudents] = useState([]);
    const [enrollSubject, setEnrollSubject] = useState('');
    const [enrollRoom, setEnrollRoom] = useState('ป.1/1');
    const [loadingEnrollments, setLoadingEnrollments] = useState(false);
    const [subjectEnrollments, setSubjectEnrollments] = useState([]);

    // Load common base data
    useEffect(() => {
        if (!currentUser) return;
        supabase.from('subjects').select('*').eq('school_id', currentUser.school_id)
            .then(({ data }) => setSubjects(data || []));
        supabase.from('users_students').select('*').eq('school_id', currentUser.school_id)
            .then(({ data }) => setAllStudents(data || []));
    }, [currentUser]);

    // --- DATA MANAGEMENT ---
    const loadTableData = async (table) => {
        setSelectedTable(table);
        if (!table) { setTableData([]); return; }

        setLoadingData(true);
        try {
            let query = supabase.from(table).select('*').order('created_at', { ascending: false });
            if (['users_students', 'users_teachers', 'subjects'].includes(table)) {
                query = query.eq('school_id', currentUser.school_id);
            }
            if (table === 'learning_outcomes') query.order('ability_no', { ascending: true });
            if (table === 'users_students') query.order('student_code', { ascending: true });

            const { data, error } = await query;
            if (error) throw error;
            setTableData(data || []);
        } catch (err) {
            toast.error('โหลดข้อมูลไม่สำเร็จ: ' + err.message);
        } finally {
            setLoadingData(false);
        }
    };

    const handleDelete = async (idValue, idCol) => {
        if (!window.confirm('ยืนยันระบบลบข้อมูลนี้ทิ้ง? (หากมีคะแนนประเมินผูกอยู่จะไม่สามารถลบได้)')) return;
        try {
            const { error } = await supabase.from(selectedTable).delete().eq(idCol, idValue);
            if (error) throw error;
            toast.success('ลบข้อมูลสำเร็จ');
            loadTableData(selectedTable);
        } catch (err) {
            toast.error('ลบไม่สำเร็จ: ' + err.message);
        }
    };

    const handleUpdate = async (idValue, idCol, updatedObj) => {
        try {
            const { error } = await supabase.from(selectedTable).update(updatedObj).eq(idCol, idValue);
            if (error) throw error;
            toast.success('อัปเดตข้อมูลสำเร็จ');
            setEditingRow(null);
            loadTableData(selectedTable);
        } catch (err) {
            toast.error('อัปเดตไม่สำเร็จ: ' + err.message);
        }
    };

    // --- CSV IMPORT ---
    const handleFileUpload = (e, importType) => {
        const file = e.target.files[0];
        if (!file) return;

        // Reset input
        e.target.value = null;
        toast.loading(`กำลังอ่านไฟล์ CSV สำหรับ: ${importType}...`, { id: 'csv' });

        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data;
                if (data.length === 0) { toast.error('ไฟล์ว่างเปล่า', { id: 'csv' }); return; }

                try {
                    let payload = [];

                    if (importType === 'students') {
                        if (!data[0].citizen_id || !data[0].dob) { toast.error('คอลัมน์ไม่ถูกต้อง', { id: 'csv' }); return; }
                        payload = await Promise.all(data.map(async s => ({
                            school_id: currentUser.school_id, citizen_id: s.citizen_id.trim(),
                            password_hash: await hashPassword(s.dob.trim()),
                            student_code: s.student_code?.trim(), prefix: s.prefix?.trim() || '',
                            first_name: s.first_name?.trim(), last_name: s.last_name?.trim(), student_status: 'active'
                        })));
                        await supabase.from('users_students').upsert(payload, { onConflict: 'citizen_id' });
                    }
                    else if (importType === 'teachers') {
                        payload = await Promise.all(data.map(async t => ({
                            school_id: currentUser.school_id, citizen_id: t.citizen_id.trim(),
                            password_hash: await hashPassword(t.dob.trim()),
                            prefix: t.prefix?.trim() || '', first_name: t.first_name?.trim(),
                            last_name: t.last_name?.trim(), role: t.role?.trim() || 'teacher', is_active: true
                        })));
                        await supabase.from('users_teachers').upsert(payload, { onConflict: 'citizen_id' });
                    }
                    else if (importType === 'subjects') {
                        payload = data.map(s => ({
                            school_id: currentUser.school_id, academic_year: parseInt(s.academic_year),
                            semester: parseInt(s.semester), subject_code: s.subject_code?.trim(),
                            subject_name: s.subject_name?.trim(), grade_level: s.grade_level?.trim(),
                            subject_group: s.subject_group?.trim() || null, teacher_id: s.teacher_id?.trim()
                        }));
                        await supabase.from('subjects').insert(payload);
                    }
                    else if (importType === 'enrollments') {
                        payload = data.map(e => ({ student_id: e.student_id?.trim(), subject_id: e.subject_id?.trim(), room: e.room?.trim() }));
                        await supabase.from('student_enrollments').insert(payload);
                    }
                    else if (importType === 'learning_outcomes') {
                        payload = data.map(l => ({
                            lo_code: l.lo_code?.trim(), ability_no: parseInt(l.ability_no), level_group: l.level_group?.trim(),
                            competency_area: l.competency_area?.trim(), lo_description: l.lo_description?.trim()
                        }));
                        await supabase.from('learning_outcomes').insert(payload);
                    }
                    else if (importType === 'behaviors') {
                        payload = data.map(b => ({
                            competency_area: b.competency_area?.trim(), competency_level: b.competency_level?.trim(), behavior_text: b.behavior_text?.trim()
                        }));
                        await supabase.from('behavior_templates').insert(payload);
                    }

                    toast.success(`นำเข้าสำเร็จ ${payload.length} รายการ`, { id: 'csv' });
                } catch (err) {
                    toast.error('ข้อผิดพลาดการนำเข้า: ' + err.message, { id: 'csv' });
                }
            }
        });
    };

    // --- LO MAPPING ---
    const loadMappingData = async (subjectId) => {
        setMappingSubject(subjectId);
        if (!subjectId) return;

        setLoadingMapping(true);
        try {
            const [{ data: los }, { data: mapped }] = await Promise.all([
                supabase.from('learning_outcomes').select('*').order('ability_no', { ascending: true }),
                supabase.from('subject_lo_mapping').select('lo_id').eq('subject_id', subjectId)
            ]);
            setAllLOs(los || []);
            setMappedLOs((mapped || []).map(m => m.lo_id));
        } catch (err) {
            toast.error('ดึงข้อมูล LO ไม่สำเร็จ: ' + err.message);
        } finally {
            setLoadingMapping(false);
        }
    };

    const toggleMapping = (loId) => {
        setMappedLOs(prev => prev.includes(loId) ? prev.filter(id => id !== loId) : [...prev, loId]);
    };

    const saveMapping = async () => {
        setSavingMapping(true);
        try {
            await supabase.from('subject_lo_mapping').delete().eq('subject_id', mappingSubject);
            if (mappedLOs.length > 0) {
                const payload = mappedLOs.map(loId => ({ subject_id: mappingSubject, lo_id: loId }));
                const { error } = await supabase.from('subject_lo_mapping').insert(payload);
                if (error) throw error;
            }
            toast.success('บันทึกการผูก LO สำเร็จ');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ: ' + err.message);
        } finally {
            setSavingMapping(false);
        }
    };

    return (
        <Layout title="ระบบจัดการฐานข้อมูล (Admin Dashboard)">
            <div className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-8 gap-4">
                <div className="flex items-center">
                    <div className="bg-slate-800 p-3 rounded-2xl shadow-inner border border-slate-700 mr-5 hidden sm:block">
                        <Settings className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">ศูนย์ควบคุมระบบ</h2>
                        <p className="text-slate-500 font-medium text-lg mt-1">นำเข้า ผูกข้อมูล และจัดการตารางในฐานข้อมูล</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex overflow-hidden mb-8">
                {[
                    { id: 'data', label: 'ตารางข้อมูล (Data)', icon: Search },
                    { id: 'import', label: 'นำเข้าข้อมูล (CSV)', icon: Upload },
                    { id: 'mapping', label: 'ผูกรายวิชา & LO', icon: LinkIcon },
                    { id: 'enrollment', label: 'จัดห้องเรียน', icon: Users }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-4 text-center text-sm font-bold flex flex-col items-center justify-center transition-all ${activeTab === tab.id ? 'bg-indigo-50 border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                            }`}
                    >
                        <tab.icon className="w-5 h-5 mb-1.5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* --- TAB 1: DATA TABLE --- */}
                {activeTab === 'data' && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <select
                                value={selectedTable}
                                onChange={(e) => loadTableData(e.target.value)}
                                className="flex-1 bg-slate-50 border border-slate-200 text-slate-700 py-3 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none"
                            >
                                <option value="" disabled>- เลือกตารางที่ต้องการจัดการ -</option>
                                <option value="users_students">ข้อมูลนักเรียน (Students)</option>
                                <option value="users_teachers">ข้อมูลครู/บุคลากร (Teachers)</option>
                                <option value="subjects">ข้อมูลรายวิชา (Subjects)</option>
                                <option value="learning_outcomes">คลังสมรรถนะ (Learning Outcomes)</option>
                                <option value="behavior_templates">คำอธิบายพฤติกรรม (Behaviors)</option>
                            </select>
                            <button onClick={() => loadTableData(selectedTable)} disabled={!selectedTable || loadingData} className="bg-slate-800 text-white px-6 py-3 rounded-xl font-bold shadow-sm hover:bg-slate-900 flex items-center justify-center min-w-[120px]">
                                {loadingData ? <div className="loader w-5 h-5 !border-2" /> : 'รีเฟรชโหลข้อมูล'}
                            </button>
                        </div>

                        {loadingData ? (
                            <div className="py-20 flex justify-center"><div className="loader"></div></div>
                        ) : !selectedTable ? (
                            <div className="text-center py-20 text-slate-400 font-medium">โปรดเลือกตารางจากเมนูด้านบน</div>
                        ) : tableData.length === 0 ? (
                            <div className="text-center py-20 text-slate-400 font-medium">ไม่มีข้อมูลในตารางนี้</div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 h-[600px] overflow-y-auto">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 font-bold w-12 text-center border-b">ที่</th>
                                            {Object.keys(tableData[0]).filter(k => !['password_hash', 'school_id'].includes(k)).map(key => (
                                                <th key={key} className="px-4 py-3 font-bold border-b">{key}</th>
                                            ))}
                                            <th className="px-4 py-3 font-bold w-40 text-center border-b sticky right-0 bg-slate-100">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        let idCol, idValue;
                                        if (selectedTable === 'users_students') {idCol = 'student_id'; idValue = row.student_id; }
                                        if (selectedTable === 'users_teachers') {idCol = 'teacher_id'; idValue = row.teacher_id; }
                                        if (selectedTable === 'subjects') {idCol = 'subject_id'; idValue = row.subject_id; }
                                        if (selectedTable === 'learning_outcomes') {idCol = 'lo_id'; idValue = row.lo_id; }
                                        if (selectedTable === 'behavior_templates') {idCol = 'id'; idValue = row.id; }

                                        const isEditing = editingRow?.id === idValue;

                                        return (
                                        <tr key={index => idx} className="hover:bg-slate-50/70 py-2 group">
                                            <td className="px-4 py-2 text-center text-slate-400">{idx + 1}</td>
                                            {Object.keys(row).filter(k => !['password_hash', 'school_id'].includes(k)).map(key => (
                                                <td key={key} className="px-4 py-2 text-slate-700 max-w-sm truncate whitespace-normal">
                                                    {isEditing ? (
                                                        <input
                                                            className="border border-indigo-300 rounded px-2 py-1 w-full bg-indigo-50/50"
                                                            value={editingRow.data[key] || ''}
                                                            onChange={(e) => setEditingRow({ ...editingRow, data: { ...editingRow.data, [key]: e.target.value } })}
                                                        />
                                                    ) : row[key]?.toString()}
                                                </td>
                                            ))}
                                            <td className="px-4 py-2 text-center sticky right-0 bg-white group-hover:bg-slate-50/70 border-l border-slate-100 flex justify-center gap-2">
                                                {isEditing ? (
                                                    <>
                                                        <button onClick={() => handleUpdate(idValue, idCol, editingRow.data)} className="text-green-600 bg-green-50 p-1.5 rounded-lg hover:bg-green-100"><Save className="w-5 h-5" /></button>
                                                        <button onClick={() => setEditingRow(null)} className="text-slate-400 bg-slate-50 p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button onClick={() => setEditingRow({ id: idValue, data: { ...row } })} className="text-indigo-600 bg-indigo-50 p-1.5 rounded-lg hover:bg-indigo-100 transition-colors"><Edit className="w-4 h-4" /></button>
                                                        <button onClick={() => handleDelete(idValue, idCol)} className="text-red-600 bg-red-50 p-1.5 rounded-lg hover:bg-red-100 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                        );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: ENROLLMENT MANAGEMENT --- */}
                {activeTab === 'enrollment' && (
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[500px]">
                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <select
                                value={enrollSubject}
                                onChange={async (e) => {
                                    setEnrollSubject(e.target.value);
                                    if (!e.target.value) return;
                                    setLoadingEnrollments(true);
                                    const { data } = await supabase.from('student_enrollments')
                                        .select('*, users_students(*)')
                                        .eq('subject_id', e.target.value);
                                    setSubjectEnrollments(data || []);
                                    setLoadingEnrollments(false);
                                }}
                                className="flex-1 bg-slate-50 border border-slate-200 text-slate-700 py-3 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none"
                            >
                                <option value="" disabled>- เลือกรายวิชาเพื่อจัดห้อง -</option>
                                {subjects.map(s => (
                                    <option key={s.subject_id} value={s.subject_id}>{s.subject_code} - {s.subject_name} ({s.grade_level})</option>
                                ))}
                            </select>

                            <select
                                onChange={async (e) => {
                                    if (!enrollSubject) return toast.error('กรุณาเลือกวิชาก่อน');
                                    const studentId = e.target.value;
                                    if (!studentId) return;
                                    // Check if already enrolled
                                    if (subjectEnrollments.some(en => en.student_id === studentId)) {
                                        toast.error('นักเรียนคนนี้อยู่ในวิชานี้แล้ว');
                                        e.target.value = '';
                                        return;
                                    }

                                    toast.loading('กำลังเพิ่มนักเรียน...', { id: 'add_en' });
                                    const { data, error } = await supabase.from('student_enrollments').insert([
                                        { student_id: studentId, subject_id: enrollSubject, room: enrollRoom }
                                    ]).select('*, users_students(*)');

                                    if (error) {
                                        toast.error('เพิ่มไม่สำเร็จ ' + error.message, { id: 'add_en' });
                                    } else {
                                        toast.success('เพิ่มนักเรียนสำเร็จ', { id: 'add_en' });
                                        setSubjectEnrollments(prev => [...prev, data[0]]);
                                    }
                                    e.target.value = "";
                                }}
                                className="flex-1 bg-slate-50 border border-slate-200 text-slate-700 py-3 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none"
                            >
                                <option value="">+ เพิ่มนักเรียนเข้าวิชา</option>
                                {allStudents.map(st => (
                                    <option key={st.student_id} value={st.student_id}>{st.student_code} : {st.prefix || ''}{st.first_name} {st.last_name}</option>
                                ))}
                            </select>

                            <input
                                type="text"
                                placeholder="ระบุห้อง เช่น ป.1/1"
                                value={enrollRoom}
                                onChange={(e) => setEnrollRoom(e.target.value)}
                                className="w-32 bg-slate-50 border border-slate-200 text-slate-700 py-3 px-4 rounded-xl font-bold focus:ring-2 focus:ring-indigo-400 outline-none"
                            />
                        </div>

                        {loadingEnrollments ? (
                            <div className="py-20 flex justify-center"><div className="loader"></div></div>
                        ) : enrollSubject ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 overflow-y-auto">
                                <table className="w-full text-sm text-left whitespace-nowrap">
                                    <thead className="bg-slate-100 text-slate-600 sticky top-0 z-10 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-3 font-bold text-center border-b">ลำดับ</th>
                                            <th className="px-4 py-3 font-bold border-b">รหัสนักเรียน</th>
                                            <th className="px-4 py-3 font-bold border-b">ชื่อ - นามสกุล</th>
                                            <th className="px-4 py-3 font-bold border-b text-center">ห้อง</th>
                                            <th className="px-4 py-3 font-bold w-32 justify-center border-b text-center">จัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {subjectEnrollments.length === 0 ? (
                                            <tr><td colSpan="5" className="text-center py-6 text-slate-400">ยังไม่มีนักเรียนในวิชานี้</td></tr>
                                        ) : subjectEnrollments.map((en, idx) => (
                                            <tr key={en.enrollment_id} className="hover:bg-slate-50/70 py-2">
                                                <td className="px-4 py-3 text-center text-slate-500">{idx + 1}</td>
                                                <td className="px-4 py-3 font-mono">{en.users_students?.student_code}</td>
                                                <td className="px-4 py-3 font-bold text-slate-800">{en.users_students?.prefix || ''}{en.users_students?.first_name} {en.users_students?.last_name}</td>
                                                <td className="px-4 py-3 text-center">{en.room}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <button onClick={async () => {
                                                        if (!window.confirm('ยืนยันระบบลบนักเรียนคนนี้ออกจากวิชา?')) return;
                                                        const { error } = await supabase.from('student_enrollments').delete().eq('enrollment_id', en.enrollment_id);
                                                        if (error) toast.error('ลบไม่สำเร็จ: ' + error.message);
                                                        else {
                                                            setSubjectEnrollments(prev => prev.filter(p => p.enrollment_id !== en.enrollment_id));
                                                            toast.success('ลบนักเรียนออกสำเร็จ');
                                                        }
                                                    }} className="text-red-600 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 font-bold transition-colors">เอาออก</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="text-center py-20 text-slate-400 font-medium">โปรดเลือกรายวิชาก่อน</div>
                        )}
                    </div>
                )}

                {/* --- TAB 3: CSV IMPORT --- */}
                {activeTab === 'import' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            { id: 'students', title: 'ข้อมูลนักเรียน', desc: 'ไฟล์ CSV ฐานข้อมูลนักเรียน (ต้องมี citizen_id, dob, student_code, first_name, last_name)', template: 'citizen_id,dob,student_code,prefix,first_name,last_name\n1234567890123,01012555,66001,ด.ช.,สมชาย,ใจดี' },
                            { id: 'teachers', title: 'ข้อมูลครูและบุคลากร', desc: 'ไฟล์ CSV ฐานข้อมูลครู (ต้องมี citizen_id, dob, role)', template: 'citizen_id,dob,prefix,first_name,last_name,role\n1234567890123,01012540,นาย,สมชาย,ใจดี,teacher' },
                            { id: 'subjects', title: 'ข้อมูลรายวิชา', desc: 'รายวิชาทั้งหมด (มี subject_group เพื่อจัดหมวดหมู่ ปพ.๖ เช่น ความสามารถพื้นฐานด้านการเรียนรู้, กิจกรรมพัฒนาผู้เรียน)', template: 'academic_year,semester,subject_code,subject_name,grade_level,subject_group,teacher_id\n2569,1,ค11101,คณิตศาสตร์พื้นฐาน,ป.1,ความสามารถพื้นฐานด้านการเรียนรู้,id-ครู' },
                            { id: 'enrollments', title: 'การลงทะเบียนเรียน', desc: 'ผูกนักเรียนเข้ากับรายวิชาต่างๆ (ต้องมี student_id, subject_id, room)', template: 'student_id,subject_id,room\nid-นักเรียน,id-วิชา,ป.1/1' },
                            { id: 'learning_outcomes', title: 'คลังสมรรถนะ LO', desc: 'คลังด้านความสามารถทั้งหมด (ต้องมี lo_code, ability_no, competency_area, lo_description)', template: 'lo_code,ability_no,level_group,competency_area,lo_description\nM1,1,ป.ต้น,การคิดคำนวณ,ผู้เรียนสามารถบวก ลบ เลขได้' },
                            { id: 'behaviors', title: 'คลังพฤติกรรม', desc: 'คำอธิบายพฤติกรรมแต่ละระดับ (ต้องมี competency_area, competency_level, behavior_text)', template: 'competency_area,competency_level,behavior_text\nการคิดคำนวณ,พัฒนา,เข้าใจตัวเลขได้บ้างต้องพยายามอีกนิด' }
                        ].map(card => (
                            <div key={card.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col items-center text-center">
                                <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mb-4 border border-slate-100 shadow-inner">
                                    <Upload className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className="font-bold text-lg text-slate-800 mb-2">{card.title}</h3>
                                <p className="text-xs text-slate-500 mb-6 flex-grow leading-relaxed">{card.desc}</p>
                                <div className="w-full space-y-2 mt-auto">
                                    <label className="w-full bg-slate-800 hover:bg-black text-white px-4 py-3 rounded-xl font-bold text-sm cursor-pointer shadow-sm transition-colors flex items-center justify-center gap-2">
                                        <Upload className="w-4 h-4" />
                                        <span>นำเข้าไฟล์ CSV</span>
                                        <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, card.id)} />
                                    </label>
                                    <button
                                        onClick={() => {
                                            const blob = new Blob(['\ufeff' + card.template], { type: 'text/csv;charset=utf-8;' });
                                            const url = URL.createObjectURL(blob);
                                            const link = document.createElement('a');
                                            link.href = url;
                                            link.setAttribute('download', `template_${card.id}.csv`);
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                        }}
                                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        <span>โหลดไฟล์ต้นแบบ (Template)</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* --- TAB 3: SUBJECT - LO MAPPING --- */}
                {activeTab === 'mapping' && (
                    <div className="grid lg:grid-cols-4 gap-6">
                        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm self-start sticky top-24">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center"><LinkIcon className="w-4 h-4 mr-2" /> เลือกลายวิชาเพื่อผูก LO</h3>
                            <select
                                value={mappingSubject}
                                onChange={(e) => loadMappingData(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 text-slate-800 p-3 rounded-xl focus:ring-2 focus:ring-indigo-400 font-medium outline-none text-sm"
                            >
                                <option value="" disabled>- เลือกวิชา -</option>
                                {subjects.map(s => <option key={s.subject_id} value={s.subject_id}>{s.subject_code} {s.subject_name}</option>)}
                            </select>
                        </div>

                        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm min-h-[500px]">
                            {loadingMapping ? (
                                <div className="py-20 flex justify-center"><div className="loader"></div></div>
                            ) : !mappingSubject ? (
                                <div className="text-center py-20 text-slate-400 font-medium flex flex-col items-center">
                                    <FileText className="w-16 h-16 text-slate-200 mb-4" />
                                    กรุณาเลือกรายวิชาด้านซ้ายเพื่อผูกสมรรถนะ
                                </div>
                            ) : allLOs.length === 0 ? (
                                <div className="text-center py-10 text-red-500 bg-red-50 rounded-xl font-bold">ไม่พบคลัง LO ในระบบ กรุณานำเข้าก่อน</div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="font-bold text-lg">คลังสมรรถนะ (LO) ทั้งหมด</h3>
                                        <button
                                            onClick={saveMapping}
                                            disabled={savingMapping}
                                            className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-bold shadow-sm shadow-indigo-600/30 hover:bg-indigo-700 disabled:opacity-50 flex items-center"
                                        >
                                            {savingMapping ? <div className="loader w-4 h-4 !border-2 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                            บันทึกการผูกวิชา
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {allLOs.map(lo => {
                                            const isChecked = mappedLOs.includes(lo.lo_id);
                                            return (
                                                <label key={lo.lo_id} className={`flex items-start p-4 rounded-xl border-2 transition-all cursor-pointer ${isChecked ? 'border-indigo-600 bg-indigo-50/50 shadow-sm' : 'border-slate-100 hover:border-slate-300 bg-white'}`}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleMapping(lo.lo_id)}
                                                        className="mt-1 w-5 h-5 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                                                    />
                                                    <div className="ml-3">
                                                        <span className={`block font-extrabold text-sm mb-1 ${isChecked ? 'text-indigo-900' : 'text-slate-700'}`}>ข้อที่ {lo.ability_no} {lo.lo_code ? `[${lo.lo_code}]` : ''} [{lo.competency_area || 'ทั่วไป'}]</span>
                                                        <span className={`block text-sm leading-relaxed ${isChecked ? 'text-indigo-800/80 font-medium' : 'text-slate-500'}`}>{lo.lo_description}</span>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )}

            </div>
        </Layout>
    );
}
