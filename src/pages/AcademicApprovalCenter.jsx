import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    BookOpen,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ClipboardCheck,
    Filter,
    FolderKanban,
    History,
    Layers,
    RotateCcw,
    Save,
    Search,
    ShieldCheck,
    UserRound,
    XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAcademic } from '../AcademicContext';
import { useAuth } from '../AuthContext';
import { supabase } from '../lib/supabase';
import { formalLevelLabel, learningFormatLabel } from '../lib/terminology';
import { APPROVAL_COMPETENCY_GROUPS } from '../constants/curriculum2568';

const LEVELS = ['เริ่มต้น', 'พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ', 'N/A'];
const LEVEL_ORDER = { เริ่มต้น: 1, พัฒนา: 2, ชำนาญ: 3, เชี่ยวชาญ: 4, 'N/A': 0 };

const statusMeta = {
    pending: { label: 'รอรับรอง', className: 'bg-amber-50 text-amber-800 border-amber-200' },
    approved: { label: 'รับรองแล้ว', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
    returned: { label: 'ส่งกลับแก้ไข', className: 'bg-rose-50 text-rose-800 border-rose-200' },
};

function fullName(student) {
    if (!student) return 'ไม่พบข้อมูลผู้เรียน';
    return `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim();
}

function recommendedLevel(sources) {
    const valid = sources
        .map(source => source.competency_level)
        .filter(level => level && level !== 'N/A');
    if (valid.length === 0) return '';
    const counts = valid.reduce((acc, level) => ({ ...acc, [level]: (acc[level] || 0) + 1 }), {});
    return [...valid].sort((a, b) => {
        const frequency = counts[b] - counts[a];
        return frequency !== 0 ? frequency : LEVEL_ORDER[b] - LEVEL_ORDER[a];
    })[0];
}

// สถานะของแต่ละแหล่งประเมิน ต้องสะท้อนว่าครูส่งตรวจแล้วจริงหรือยังเป็นฉบับร่าง
function sourceStatusMeta(source) {
    if (!source.competency_level) return { label: 'รอข้อมูล', className: 'bg-amber-50 text-amber-800' };
    switch (source.workflow_status) {
        case 'submitted': return { label: 'พร้อมตรวจ', className: 'bg-emerald-50 text-emerald-800' };
        case 'approved': return { label: 'รับรองแล้ว', className: 'bg-indigo-50 text-indigo-800' };
        case 'returned': return { label: 'ส่งกลับแก้ไข', className: 'bg-rose-50 text-rose-800' };
        default: return { label: 'ฉบับร่าง ยังไม่ส่งตรวจ', className: 'bg-slate-100 text-slate-700' };
    }
}

function sourceLabel(source) {
    if (source.source_type === 'subject') return source.source_name || 'รายวิชา';
    const type = learningFormatLabel(source.context_type);
    return `${type}: ${source.source_name || '-'}`;
}

function LoadingState() {
    return (
        <div className="space-y-4" aria-label="กำลังโหลดข้อมูล">
            {[1, 2, 3, 4].map(item => (
                <div key={item} className="h-24 rounded-2xl bg-slate-200/70 animate-pulse" />
            ))}
        </div>
    );
}

// จัดกลุ่ม LO ตาม competency area groups ของแต่ละ level_group
function groupLosByCompetency(loEntries, levelGroup) {
    const groups = APPROVAL_COMPETENCY_GROUPS[levelGroup];
    if (!groups) {
        // Fallback: ไม่มี mapping สำหรับ level_group นี้ → จัดกลุ่มตาม competency_area ตรง ๆ
        const byArea = new Map();
        loEntries.forEach(entry => {
            const area = entry.lo.competency_area || 'ไม่ระบุด้านความสามารถ';
            if (!byArea.has(area)) byArea.set(area, []);
            byArea.get(area).push(entry);
        });
        return [{ groupName: 'ผลลัพธ์การเรียนรู้ทั้งหมด', areas: [...byArea.entries()].map(([name, entries]) => ({ areaName: name, entries })) }];
    }

    const result = [];
    const placed = new Set();

    groups.forEach(group => {
        const areas = [];
        group.competencyAreas.forEach(areaName => {
            const matching = loEntries.filter(entry => entry.lo.competency_area === areaName);
            if (matching.length > 0) {
                areas.push({ areaName, entries: matching });
                matching.forEach(entry => placed.add(entry.key));
            }
        });
        if (areas.length > 0) {
            result.push({ groupName: group.groupName, areas });
        }
    });

    // LO ที่ไม่ตรงกับกลุ่มไหนเลย
    const remaining = loEntries.filter(entry => !placed.has(entry.key));
    if (remaining.length > 0) {
        const byArea = new Map();
        remaining.forEach(entry => {
            const area = entry.lo.competency_area || 'อื่น ๆ';
            if (!byArea.has(area)) byArea.set(area, []);
            byArea.get(area).push(entry);
        });
        result.push({ groupName: 'ด้านอื่น ๆ', areas: [...byArea.entries()].map(([name, entries]) => ({ areaName: name, entries })) });
    }

    return result;
}


export default function AcademicApprovalCenter() {
    const { currentUser } = useAuth();
    const { academicYear, semester } = useAcademic();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState('');

    // ข้อมูลทั้งหมด: grouped by student → LO entries
    const [allLoEntries, setAllLoEntries] = useState([]); // flat list of { key, student, lo, sources, decision, recommended_level }
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // ผลการตัดสินรายข้อ (local state ก่อนบันทึก)
    // key = student_id:lo_id → { level, reason }
    const [localDecisions, setLocalDecisions] = useState({});

    // track which LO cards are expanded to show source detail
    const [expandedLOs, setExpandedLOs] = useState(new Set());

    // track which LOs are currently saving
    const [savingLOs, setSavingLOs] = useState(new Set());

    const loadApprovalData = useCallback(async () => {
        if (!currentUser?.school_id || !academicYear || !semester) return;
        setLoading(true);
        setLoadError('');

        try {
            const [{ data: students, error: studentError }, { data: subjects, error: subjectError }, { data: los, error: loError }] = await Promise.all([
                supabase.from('users_students').select('student_id, student_code, prefix, first_name, last_name, current_grade_level, current_room').eq('school_id', currentUser.school_id),
                supabase.from('subjects').select('subject_id, subject_name, academic_year, semester').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
                supabase.from('learning_outcomes').select('lo_id, lo_code, ability_no, competency_area, lo_description, level_group').eq('school_id', currentUser.school_id),
            ]);
            if (studentError) throw studentError;
            if (subjectError) throw subjectError;
            if (loError) throw loError;

            const subjectIds = (subjects || []).map(subject => subject.subject_id);
            const [{ data: enrollments, error: enrollmentError }, { data: contexts, error: contextError }] = await Promise.all([
                subjectIds.length
                    ? supabase.from('student_enrollments').select('enrollment_id, student_id, subject_id, room').in('subject_id', subjectIds)
                    : Promise.resolve({ data: [], error: null }),
                supabase.from('learning_contexts').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
            ]);
            if (enrollmentError) throw enrollmentError;
            if (contextError) throw contextError;

            const enrollmentIds = (enrollments || []).map(enrollment => enrollment.enrollment_id);
            const contextIds = (contexts || []).map(context => context.context_id);
            const [{ data: subjectEvaluations, error: subjectEvaluationError }, { data: contextEvaluations, error: contextEvaluationError }, { data: decisions, error: decisionError }] = await Promise.all([
                enrollmentIds.length
                    ? supabase.from('lo_evaluations').select('*').in('enrollment_id', enrollmentIds)
                    : Promise.resolve({ data: [], error: null }),
                contextIds.length
                    ? supabase.from('learning_context_evaluations').select('*').in('context_id', contextIds)
                    : Promise.resolve({ data: [], error: null }),
                supabase.from('lo_final_decisions').select('*').eq('school_id', currentUser.school_id).eq('academic_year', academicYear).eq('semester', semester),
            ]);
            if (subjectEvaluationError) throw subjectEvaluationError;
            if (contextEvaluationError) throw contextEvaluationError;
            if (decisionError) throw decisionError;

            const studentMap = new Map((students || []).map(student => [student.student_id, student]));
            const subjectMap = new Map((subjects || []).map(subject => [subject.subject_id, subject]));
            const enrollmentMap = new Map((enrollments || []).map(enrollment => [enrollment.enrollment_id, enrollment]));
            const contextMap = new Map((contexts || []).map(context => [context.context_id, context]));
            const loMap = new Map((los || []).map(lo => [lo.lo_id, lo]));
            const decisionMap = new Map((decisions || []).map(decision => [`${decision.student_id}:${decision.lo_id}`, decision]));
            const grouped = new Map();

            const addSource = (studentId, loId, source) => {
                const student = studentMap.get(studentId);
                const lo = loMap.get(loId);
                if (!student || !lo) return;
                const key = `${studentId}:${loId}`;
                if (!grouped.has(key)) {
                    grouped.set(key, {
                        key,
                        student,
                        lo,
                        sources: [],
                        decision: decisionMap.get(key) || null,
                    });
                }
                grouped.get(key).sources.push(source);
            };

            (subjectEvaluations || []).forEach(evaluation => {
                const enrollment = enrollmentMap.get(evaluation.enrollment_id);
                if (!enrollment) return;
                const subject = subjectMap.get(enrollment.subject_id);
                addSource(enrollment.student_id, evaluation.lo_id, {
                    source_type: 'subject',
                    source_id: subject?.subject_id,
                    source_name: subject?.subject_name,
                    competency_level: evaluation.competency_level,
                    evidence_note: evaluation.evidence_note,
                    workflow_status: evaluation.workflow_status || 'draft',
                    evaluation_id: evaluation.evaluation_id,
                });
            });

            (contextEvaluations || []).forEach(evaluation => {
                const context = contextMap.get(evaluation.context_id);
                addSource(evaluation.student_id, evaluation.lo_id, {
                    source_type: 'context',
                    source_id: evaluation.context_id,
                    source_name: context?.context_name,
                    context_type: context?.context_type,
                    competency_level: evaluation.competency_level,
                    evidence_note: evaluation.evidence_note,
                    workflow_status: evaluation.workflow_status || 'draft',
                    context_evaluation_id: evaluation.context_evaluation_id,
                });
            });

            const result = [...grouped.values()]
                .map(group => ({ ...group, recommended_level: recommendedLevel(group.sources) }))
                .sort((a, b) => {
                    const roomCompare = (a.student.current_room || '').localeCompare(b.student.current_room || '', 'th');
                    if (roomCompare !== 0) return roomCompare;
                    const studentCompare = (a.student.student_code || '').localeCompare(b.student.student_code || '', 'th');
                    return studentCompare !== 0 ? studentCompare : (a.lo.ability_no || 0) - (b.lo.ability_no || 0);
                });
            setAllLoEntries(result);

            // ตั้งค่า local decisions จากผลที่บันทึกไว้แล้ว
            const initDecisions = {};
            result.forEach(entry => {
                if (entry.decision) {
                    initDecisions[entry.key] = {
                        level: entry.decision.final_level || '',
                        reason: entry.decision.decision_reason || '',
                    };
                }
            });
            setLocalDecisions(initDecisions);

            // เลือกนักเรียนคนแรกถ้ายังไม่ได้เลือก
            if (!selectedStudentId || !result.some(e => e.student.student_id === selectedStudentId)) {
                const firstStudent = result[0]?.student?.student_id || '';
                setSelectedStudentId(firstStudent);
            }
        } catch (error) {
            const message = error.message || 'ไม่สามารถโหลดข้อมูลได้';
            setLoadError(message.includes('does not exist') || message.includes('schema cache')
                ? 'ยังไม่ได้ติดตั้งโครงสร้างฐานข้อมูล CBE Track รุ่นรับรองผล กรุณารันไฟล์ cbe_track_demo_upgrade.sql ใน Supabase SQL Editor'
                : message);
        } finally {
            setLoading(false);
        }
    }, [academicYear, currentUser?.school_id, semester]);

    useEffect(() => {
        loadApprovalData();
    }, [loadApprovalData]);

    // ─── สร้างรายชื่อนักเรียน (deduplicated) ────────────────────────────────
    const studentList = useMemo(() => {
        const map = new Map();
        allLoEntries.forEach(entry => {
            const sid = entry.student.student_id;
            if (!map.has(sid)) {
                map.set(sid, { student: entry.student, entries: [] });
            }
            map.get(sid).entries.push(entry);
        });

        return [...map.values()]
            .map(({ student, entries }) => {
                const total = entries.length;
                const approved = entries.filter(e => e.decision?.decision_status === 'approved').length;
                const returned = entries.filter(e => e.decision?.decision_status === 'returned').length;
                const pending = total - approved - returned;
                return { student, total, approved, returned, pending };
            })
            .sort((a, b) => {
                const roomCmp = (a.student.current_room || '').localeCompare(b.student.current_room || '', 'th');
                return roomCmp !== 0 ? roomCmp : (a.student.student_code || '').localeCompare(b.student.student_code || '', 'th');
            });
    }, [allLoEntries]);

    // กรองรายชื่อนักเรียน
    const filteredStudentList = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return studentList.filter(item => {
            // status filter
            if (statusFilter === 'pending' && item.pending === 0) return false;
            if (statusFilter === 'approved' && item.approved === 0) return false;
            if (statusFilter === 'returned' && item.returned === 0) return false;
            // text search
            if (normalized) {
                const haystack = `${item.student.student_code || ''} ${fullName(item.student)} ${item.student.current_room || ''}`.toLowerCase();
                if (!haystack.includes(normalized)) return false;
            }
            return true;
        });
    }, [studentList, query, statusFilter]);

    // สถิติรวม
    const stats = useMemo(() => {
        const s = { pending: 0, approved: 0, returned: 0 };
        allLoEntries.forEach(entry => {
            const status = entry.decision?.decision_status || 'pending';
            s[status] = (s[status] || 0) + 1;
        });
        return s;
    }, [allLoEntries]);

    // ─── LO entries ของนักเรียนที่เลือก จัดกลุ่มตามด้านความสามารถ ─────────
    const selectedStudentData = useMemo(() => {
        if (!selectedStudentId) return null;
        const entries = allLoEntries.filter(e => e.student.student_id === selectedStudentId);
        if (entries.length === 0) return null;

        const student = entries[0].student;
        // หา level_group จาก LO ตัวแรก (LO ทั้งหมดของนักเรียนคนเดียวควรเป็น level_group เดียวกัน)
        const levelGroup = entries[0].lo.level_group || 'ป.ต้น';
        const competencyGroups = groupLosByCompetency(entries, levelGroup);

        // สรุปผล
        const total = entries.length;
        const approved = entries.filter(e => e.decision?.decision_status === 'approved').length;
        const returned = entries.filter(e => e.decision?.decision_status === 'returned').length;
        const pending = total - approved - returned;

        return { student, levelGroup, competencyGroups, total, approved, returned, pending, entries };
    }, [allLoEntries, selectedStudentId]);

    // ─── อัปเดต local decision ────────────────────────────────────────────────
    const updateLocalDecision = useCallback((key, field, value) => {
        setLocalDecisions(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value },
        }));
    }, []);

    // ─── Toggle expanded LO card ──────────────────────────────────────────────
    const toggleExpanded = useCallback((key) => {
        setExpandedLOs(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // ─── บันทึกผลรายข้อ ───────────────────────────────────────────────────────
    const saveDecisionForEntry = useCallback(async (entry, decisionStatus) => {
        const local = localDecisions[entry.key] || {};
        const decisionLevel = local.level || '';
        const decisionReason = local.reason || '';

        if (!decisionLevel) {
            toast.error('กรุณาเลือกระดับความสามารถสุดท้าย');
            return false;
        }
        if (!decisionReason.trim()) {
            toast.error(decisionStatus === 'returned' ? 'กรุณาระบุสิ่งที่ต้องการให้ครูแก้ไข' : 'กรุณาบันทึกเหตุผลหรือหลักฐานประกอบการรับรอง');
            return false;
        }

        if (decisionStatus === 'approved') {
            const draftSources = entry.sources.filter(source => source.competency_level && !['submitted', 'approved'].includes(source.workflow_status));
            if (draftSources.length > 0 && !window.confirm(`มี ${draftSources.length} แหล่งประเมินที่ครูยังไม่ได้ส่งตรวจ (ฉบับร่าง) ต้องการรับรองผลต่อหรือไม่?`)) return false;
        }

        setSavingLOs(prev => new Set(prev).add(entry.key));
        try {
            const passed = ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(decisionLevel);
            const payload = {
                school_id: currentUser.school_id,
                student_id: entry.student.student_id,
                lo_id: entry.lo.lo_id,
                academic_year: academicYear,
                semester,
                final_level: decisionLevel,
                pass_status: decisionLevel === 'N/A' ? 'pending' : passed ? 'passed' : 'not_passed',
                decision_status: decisionStatus,
                decision_reason: decisionReason.trim(),
                decided_by: currentUser.teacher_id || currentUser.id,
                decided_at: new Date().toISOString(),
                is_locked: decisionStatus === 'approved',
                updated_at: new Date().toISOString(),
            };
            const { error: decisionError } = await supabase
                .from('lo_final_decisions')
                .upsert(payload, { onConflict: 'student_id,lo_id,academic_year,semester' });
            if (decisionError) throw decisionError;

            const subjectEvaluationIds = entry.sources.filter(source => source.evaluation_id).map(source => source.evaluation_id);
            const contextEvaluationIds = entry.sources.filter(source => source.context_evaluation_id).map(source => source.context_evaluation_id);
            const nextWorkflowStatus = decisionStatus === 'approved' ? 'approved' : 'returned';
            const updates = [];
            if (subjectEvaluationIds.length) {
                updates.push(supabase.from('lo_evaluations').update({ workflow_status: nextWorkflowStatus, updated_at: new Date().toISOString() }).in('evaluation_id', subjectEvaluationIds));
            }
            if (contextEvaluationIds.length) {
                updates.push(supabase.from('learning_context_evaluations').update({ workflow_status: nextWorkflowStatus, updated_at: new Date().toISOString() }).in('context_evaluation_id', contextEvaluationIds));
            }
            const updateResults = await Promise.all(updates);
            const updateError = updateResults.find(result => result.error)?.error;
            if (updateError) throw updateError;

            await supabase.from('audit_logs').insert({
                school_id: currentUser.school_id,
                actor_id: currentUser.teacher_id || currentUser.id,
                actor_role: currentUser.role,
                action: decisionStatus === 'approved' ? 'approve_lo_result' : 'return_lo_result',
                entity_type: 'lo_final_decision',
                detail: {
                    student_id: entry.student.student_id,
                    lo_id: entry.lo.lo_id,
                    final_level: decisionLevel,
                    reason: decisionReason.trim(),
                    source_count: entry.sources.length,
                },
            });

            return true;
        } catch (error) {
            toast.error('บันทึกการรับรองไม่สำเร็จ: ' + error.message);
            return false;
        } finally {
            setSavingLOs(prev => {
                const next = new Set(prev);
                next.delete(entry.key);
                return next;
            });
        }
    }, [academicYear, currentUser, localDecisions, semester]);

    // ─── บันทึกผลรายข้อเดี่ยว ─────────────────────────────────────────────────
    const handleSingleDecision = useCallback(async (entry, decisionStatus) => {
        const success = await saveDecisionForEntry(entry, decisionStatus);
        if (success) {
            toast.success(decisionStatus === 'approved' ? `รับรองผล ${entry.lo.lo_code || 'LO'} เรียบร้อย` : `ส่งผล ${entry.lo.lo_code || 'LO'} กลับให้ครูแก้ไขแล้ว`);
            await loadApprovalData();
        }
    }, [loadApprovalData, saveDecisionForEntry]);

    // ─── Batch approve ────────────────────────────────────────────────────────
    const handleBatchApprove = useCallback(async () => {
        if (!selectedStudentData) return;

        // หารายการที่กรอกครบ + ยังไม่ approved
        const readyEntries = selectedStudentData.entries.filter(entry => {
            if (entry.decision?.decision_status === 'approved') return false;
            const local = localDecisions[entry.key];
            return local?.level && local?.reason?.trim();
        });

        if (readyEntries.length === 0) {
            toast.error('ไม่มีรายการที่กรอกข้อมูลครบพร้อมรับรอง');
            return;
        }

        if (!window.confirm(`ต้องการรับรองผล ${readyEntries.length} รายการพร้อมกันหรือไม่?`)) return;

        setSaving(true);
        let successCount = 0;
        for (const entry of readyEntries) {
            const success = await saveDecisionForEntry(entry, 'approved');
            if (success) successCount++;
        }
        setSaving(false);

        if (successCount > 0) {
            toast.success(`รับรองผลสำเร็จ ${successCount} รายการ`);
            await loadApprovalData();
        }
    }, [loadApprovalData, localDecisions, saveDecisionForEntry, selectedStudentData]);

    // ─── Auto-select first student when filter changes ─────────────────────────
    useEffect(() => {
        if (loading) return;
        if (filteredStudentList.length === 0) {
            if (selectedStudentId) setSelectedStudentId('');
            return;
        }
        if (!filteredStudentList.some(item => item.student.student_id === selectedStudentId)) {
            setSelectedStudentId(filteredStudentList[0].student.student_id);
        }
    }, [filteredStudentList, loading, selectedStudentId]);

    return (
        <Layout title="การตรวจสอบและรับรองผลลัพธ์การเรียนรู้">
            <div className="mx-auto w-full max-w-[1600px]">
                <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <button onClick={() => history.back()} className="mb-2 inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-sm font-bold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <ArrowLeft className="h-4 w-4" /> กลับ Dashboard
                        </button>
                        <h2 className="text-2xl font-extrabold text-slate-950">ตรวจสอบและรับรองผลลัพธ์การเรียนรู้</h2>
                        <p className="mt-1 max-w-[72ch] text-sm leading-6 text-slate-600">
                            เลือกผู้เรียน ตรวจสอบผลจากทุกรูปแบบการจัดการเรียนรู้ แล้วบันทึกผลสรุปของ LO แต่ละข้อ โดยจัดกลุ่มตามด้านความสามารถ
                        </p>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
                        <ShieldCheck className="h-5 w-5 text-indigo-700" />
                        <div><span className="block text-xs font-semibold text-slate-500">รอบการรับรอง</span><strong className="text-slate-900">ภาคเรียนที่ {semester}/{academicYear}</strong></div>
                    </div>
                </header>

                <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="ขั้นตอนการรับรองผล">
                    <ol className="grid divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0">
                        {[
                            ['1', 'เลือกผู้เรียน', 'ค้นหาและเลือกผู้เรียนที่ต้องการตรวจสอบ'],
                            ['2', 'ตรวจหลักฐานรายข้อ', 'ดูหลักฐานจากทุกแหล่ง แล้วตัดสินผลทีละ LO'],
                            ['3', 'สรุปและรับรอง', 'ตรวจสอบผลรวมรายกลุ่ม แล้วยืนยันการรับรอง'],
                        ].map(([number, title, description]) => (
                            <li key={number} className="flex items-start gap-3 px-4 py-3.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-extrabold text-indigo-800">{number}</span>
                                <span><strong className="block text-sm text-slate-900">{title}</strong><span className="mt-0.5 block text-xs leading-5 text-slate-600">{description}</span></span>
                            </li>
                        ))}
                    </ol>
                </section>

            {loadError ? (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" />
                        <div>
                            <h3 className="font-extrabold text-rose-950">ยังเปิดศูนย์รับรองผลไม่ได้</h3>
                            <p className="mt-1 leading-6 text-rose-800">{loadError}</p>
                            <button onClick={loadApprovalData} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 font-bold text-white hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-700 focus:ring-offset-2">
                                <RotateCcw className="h-4 w-4" /> ลองโหลดอีกครั้ง
                            </button>
                        </div>
                    </div>
                </section>
            ) : (
                <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[380px_minmax(0,1fr)]">
                        {/* ═══ Sidebar: รายชื่อนักเรียน ═══ */}
                        <aside className="border-b border-slate-200 bg-slate-50/70 xl:border-b-0 xl:border-r" aria-label="รายชื่อผู้เรียน">
                            <div className="border-b border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div><h3 className="font-extrabold text-slate-950">รายชื่อผู้เรียน</h3><p className="mt-0.5 text-xs text-slate-600">พบ {filteredStudentList.length} จาก {studentList.length} คน</p></div>
                                    <UserRound className="h-5 w-5 text-indigo-700" />
                                </div>
                                <div className="mt-4 grid grid-cols-4 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="กรองตามสถานะ">
                                    {[
                                        { key: 'pending', label: 'รอตรวจ', value: stats.pending },
                                        { key: 'returned', label: 'ส่งกลับ', value: stats.returned },
                                        { key: 'approved', label: 'รับรอง', value: stats.approved },
                                        { key: 'all', label: 'ทั้งหมด', value: allLoEntries.length },
                                    ].map(item => (
                                        <button key={item.key} role="tab" aria-selected={statusFilter === item.key} onClick={() => setStatusFilter(item.key)} className={`min-h-11 rounded-lg px-1 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 ${statusFilter === item.key ? 'bg-white text-indigo-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                                            <span className="block text-sm font-extrabold">{item.value}</span>{item.label}
                                        </button>
                                    ))}
                                </div>
                                <label className="relative mt-3 block">
                                    <span className="sr-only">ค้นหาผู้เรียน</span>
                                    <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" />
                                    <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหาชื่อ รหัสนักเรียน หรือห้อง" className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                                </label>
                            </div>

                            <div className="max-h-[720px] overflow-y-auto p-2">
                                {loading ? <LoadingState /> : filteredStudentList.length === 0 ? (
                                    <div className="px-5 py-14 text-center">
                                        <UserRound className="mx-auto h-10 w-10 text-slate-300" />
                                        <h4 className="mt-3 font-extrabold text-slate-800">ไม่พบผู้เรียน</h4>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">ลองเปลี่ยนสถานะหรือคำค้นหา</p>
                                        <button onClick={() => { setQuery(''); setStatusFilter('all'); }} className="mt-3 min-h-10 rounded-lg px-3 text-sm font-bold text-indigo-700 hover:bg-indigo-50">ล้างตัวกรอง</button>
                                    </div>
                                ) : filteredStudentList.map(item => {
                                    const isSelected = selectedStudentId === item.student.student_id;
                                    const allDone = item.approved === item.total && item.total > 0;
                                    return (
                                        <button key={item.student.student_id} onClick={() => setSelectedStudentId(item.student.student_id)} className={`mb-1 w-full rounded-xl border px-3.5 py-3 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isSelected ? 'border-indigo-300 bg-indigo-50 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-white'}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-extrabold text-slate-950">{fullName(item.student)}</p>
                                                    <p className="mt-0.5 text-xs text-slate-600">{item.student.student_code} · ห้อง {item.student.current_room || item.student.current_grade_level || '-'}</p>
                                                </div>
                                                <ChevronRight className={`mt-1 h-4 w-4 shrink-0 ${isSelected ? 'text-indigo-700' : 'text-slate-400'}`} />
                                            </div>
                                            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                                                {allDone ? (
                                                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">รับรองครบแล้ว</span>
                                                ) : (
                                                    <>
                                                        {item.pending > 0 && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">รอ {item.pending}</span>}
                                                        {item.returned > 0 && <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-800">ส่งกลับ {item.returned}</span>}
                                                        {item.approved > 0 && <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800">รับรอง {item.approved}</span>}
                                                    </>
                                                )}
                                                <span className="ml-auto text-xs font-semibold text-slate-500">{item.approved}/{item.total}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>

                        {/* ═══ Main panel: LO ของนักเรียนที่เลือก จัดกลุ่มตามด้านความสามารถ ═══ */}
                        <main className="min-h-[650px] min-w-0 overflow-y-auto" aria-label="รายละเอียดการรับรองผล" style={{ maxHeight: 'calc(100vh - 180px)' }}>
                            {!selectedStudentData ? (
                                <div className="flex min-h-[650px] items-center justify-center p-8 text-center">
                                    <div><ClipboardCheck className="mx-auto h-12 w-12 text-slate-300" /><h3 className="mt-4 font-extrabold text-slate-800">เลือกผู้เรียนที่ต้องการตรวจสอบ</h3><p className="mt-1 text-sm text-slate-600">ข้อมูล LO จัดกลุ่มตามด้านความสามารถจะแสดงในพื้นที่นี้</p></div>
                                </div>
                            ) : (
                                <div>
                                    {/* Header: ข้อมูลนักเรียน */}
                                    <header className="border-b border-slate-200 px-5 py-5 lg:px-7">
                                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 text-xs font-bold text-indigo-700"><UserRound className="h-4 w-4" /> ผู้เรียนที่กำลังตรวจสอบ</div>
                                                <h3 className="mt-1 text-xl font-extrabold text-slate-950">{fullName(selectedStudentData.student)}</h3>
                                                <p className="mt-1 text-sm text-slate-600">รหัสนักเรียน {selectedStudentData.student.student_code} · ห้อง {selectedStudentData.student.current_room || selectedStudentData.student.current_grade_level || '-'} · ช่วงชั้น {selectedStudentData.levelGroup}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-extrabold text-indigo-800">
                                                    {selectedStudentData.approved}/{selectedStudentData.total} รับรองแล้ว
                                                </span>
                                            </div>
                                        </div>
                                    </header>

                                    {/* LO แต่ละกลุ่ม */}
                                    <div className="px-5 py-5 lg:px-7 space-y-6">
                                        {selectedStudentData.competencyGroups.map((group, groupIndex) => (
                                            <section key={groupIndex} className="rounded-2xl border border-slate-200 overflow-hidden">
                                                {/* Group header */}
                                                <div className="bg-gradient-to-r from-indigo-50 to-slate-50 px-5 py-4 border-b border-slate-200">
                                                    <div className="flex items-center gap-3">
                                                        <Layers className="h-5 w-5 text-indigo-700" />
                                                        <div>
                                                            <h4 className="font-extrabold text-slate-950">{group.groupName}</h4>
                                                            <p className="mt-0.5 text-xs text-slate-600">
                                                                {(() => {
                                                                    const allEntries = group.areas.flatMap(a => a.entries);
                                                                    const approvedCount = allEntries.filter(e => e.decision?.decision_status === 'approved').length;
                                                                    const passedCount = allEntries.filter(e => {
                                                                        const level = e.decision?.final_level;
                                                                        return level && ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(level);
                                                                    }).length;
                                                                    return `${approvedCount}/${allEntries.length} รับรองแล้ว · ${passedCount} ผ่าน`;
                                                                })()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Areas within group */}
                                                <div className="divide-y divide-slate-100">
                                                    {group.areas.map((area, areaIndex) => (
                                                        <div key={areaIndex}>
                                                            {/* Area sub-header (if more than one area in the group) */}
                                                            {group.areas.length > 1 && (
                                                                <div className="bg-slate-50/50 px-5 py-2.5 border-b border-slate-100">
                                                                    <span className="text-xs font-extrabold text-slate-700">{area.areaName}</span>
                                                                </div>
                                                            )}

                                                            {/* LO entries */}
                                                            <div className="divide-y divide-slate-100">
                                                                {area.entries.map(entry => {
                                                                    const decisionStatus = entry.decision?.decision_status || 'pending';
                                                                    const meta = statusMeta[decisionStatus] || statusMeta.pending;
                                                                    const isExpanded = expandedLOs.has(entry.key);
                                                                    const isSaving = savingLOs.has(entry.key);
                                                                    const local = localDecisions[entry.key] || {};
                                                                    const recommended = entry.recommended_level;

                                                                    return (
                                                                        <div key={entry.key} className={`px-5 py-4 ${decisionStatus === 'approved' ? 'bg-emerald-50/30' : ''}`}>
                                                                            {/* LO row: code + description + status + toggle */}
                                                                            <div className="flex items-start gap-3">
                                                                                <div className="flex-1 min-w-0">
                                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                                        <span className="rounded-md bg-indigo-700 px-2 py-0.5 text-xs font-extrabold text-white">{entry.lo.lo_code || `LO ${entry.lo.ability_no}`}</span>
                                                                                        <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${meta.className}`}>{meta.label}</span>
                                                                                        {recommended && <span className="text-xs text-slate-500">แนะนำ: <strong className="text-indigo-800">{formalLevelLabel(recommended)}</strong></span>}
                                                                                    </div>
                                                                                    <p className="mt-1.5 text-sm leading-6 text-slate-700 max-w-[75ch]">{entry.lo.lo_description}</p>
                                                                                </div>
                                                                                <button onClick={() => toggleExpanded(entry.key)} className="mt-1 shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label={isExpanded ? 'ซ่อนรายละเอียด' : 'ดูหลักฐานจากครู'}>
                                                                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                                                </button>
                                                                            </div>

                                                                            {/* Expanded: sources table */}
                                                                            {isExpanded && (
                                                                                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                                                                                    <table className="w-full min-w-[600px] text-left text-sm">
                                                                                        <thead className="bg-slate-100 text-xs font-bold text-slate-700"><tr><th className="px-3 py-2.5">แหล่งประเมิน</th><th className="w-32 px-3 py-2.5">ระดับ</th><th className="px-3 py-2.5">หลักฐาน</th><th className="w-28 px-3 py-2.5">สถานะ</th></tr></thead>
                                                                                        <tbody className="divide-y divide-slate-200">
                                                                                            {entry.sources.map((source, si) => (
                                                                                                <tr key={si} className="align-top">
                                                                                                    <td className="px-3 py-2.5"><div className="flex gap-2">{source.source_type === 'subject' ? <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" /> : <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-indigo-700" />}<strong className="text-slate-900">{sourceLabel(source)}</strong></div></td>
                                                                                                    <td className="px-3 py-2.5"><span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 font-extrabold text-slate-800">{source.competency_level ? formalLevelLabel(source.competency_level) : 'ยังไม่ประเมิน'}</span></td>
                                                                                                    <td className="px-3 py-2.5 leading-6 text-slate-700">{source.evidence_note || <span className="font-semibold text-amber-800">ยังไม่บันทึก</span>}</td>
                                                                                                    <td className="px-3 py-2.5">{(() => { const s = sourceStatusMeta(source); return <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${s.className}`}>{s.label}</span>; })()}</td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            )}

                                                                            {/* Decision form for this LO */}
                                                                            <div className="mt-3 flex flex-col gap-3 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-end sm:gap-4">
                                                                                <div className="flex-1 min-w-0">
                                                                                    <label className="block">
                                                                                        <span className="mb-1.5 block text-xs font-extrabold text-slate-700">ระดับสุดท้าย</span>
                                                                                        <div className="flex flex-wrap gap-1.5">
                                                                                            {LEVELS.map(level => (
                                                                                                <label key={level} className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs font-bold focus-within:ring-2 focus-within:ring-indigo-500 ${(local.level || '') === level ? 'border-indigo-600 bg-indigo-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}>
                                                                                                    <input type="radio" name={`level-${entry.key}`} value={level} checked={(local.level || '') === level} onChange={e => updateLocalDecision(entry.key, 'level', e.target.value)} className="sr-only" />
                                                                                                    {formalLevelLabel(level)}
                                                                                                </label>
                                                                                            ))}
                                                                                        </div>
                                                                                    </label>
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <label className="block">
                                                                                        <span className="mb-1.5 block text-xs font-extrabold text-slate-700">เหตุผล / ข้อเสนอแนะ</span>
                                                                                        <input type="text" value={local.reason || ''} onChange={e => updateLocalDecision(entry.key, 'reason', e.target.value)} placeholder="เช่น หลักฐานสอดคล้อง มีพัฒนาการชัดเจน" className="min-h-9 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                                                                                    </label>
                                                                                </div>
                                                                                <div className="flex shrink-0 gap-2">
                                                                                    <button onClick={() => handleSingleDecision(entry, 'returned')} disabled={isSaving || decisionStatus === 'approved'} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 text-xs font-extrabold text-rose-800 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-600 disabled:opacity-50" title="ส่งกลับให้ครูแก้ไข">
                                                                                        <RotateCcw className="h-3.5 w-3.5" /> ส่งกลับ
                                                                                    </button>
                                                                                    <button onClick={() => handleSingleDecision(entry, 'approved')} disabled={isSaving || decisionStatus === 'approved'} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-indigo-700 px-3 text-xs font-extrabold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50">
                                                                                        {isSaving ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <CheckCircle2 className="h-3.5 w-3.5" />} รับรอง
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </section>
                                        ))}

                                        {/* ─── สรุปผลรวมรายกลุ่ม + Batch approve ─── */}
                                        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                                            <div className="bg-gradient-to-r from-emerald-50 to-slate-50 px-5 py-4 border-b border-slate-200">
                                                <h4 className="font-extrabold text-slate-950 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-700" /> สรุปผลรวมรายกลุ่มด้านความสามารถ</h4>
                                                <p className="mt-0.5 text-xs text-slate-600">คำนวณจากผลที่รับรองแล้ว ของ {fullName(selectedStudentData.student)}</p>
                                            </div>
                                            <div className="p-5">
                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    {selectedStudentData.competencyGroups.map((group, gi) => {
                                                        const allEntries = group.areas.flatMap(a => a.entries);
                                                        const approvedEntries = allEntries.filter(e => e.decision?.decision_status === 'approved');
                                                        const passedEntries = approvedEntries.filter(e => ['พัฒนา', 'ชำนาญ', 'เชี่ยวชาญ'].includes(e.decision?.final_level));
                                                        const allApproved = approvedEntries.length === allEntries.length && allEntries.length > 0;
                                                        const allPassed = passedEntries.length === allEntries.length && allEntries.length > 0;

                                                        return (
                                                            <div key={gi} className={`rounded-xl border p-4 ${allApproved ? (allPassed ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50') : 'border-slate-200 bg-slate-50/50'}`}>
                                                                <h5 className="font-extrabold text-slate-900 text-sm">{group.groupName}</h5>
                                                                <div className="mt-2 space-y-1">
                                                                    {group.areas.map((area, ai) => {
                                                                        // สรุประดับของแต่ละด้าน
                                                                        const areaEntries = area.entries;
                                                                        const areaDecisions = areaEntries.map(e => e.decision).filter(Boolean).filter(d => d.decision_status === 'approved');
                                                                        const levels = areaDecisions.map(d => d.final_level).filter(l => l && l !== 'N/A');
                                                                        // ใช้ระดับต่ำสุดเป็นตัวแทนของด้านนี้ (conservative)
                                                                        const representativeLevel = levels.length > 0 ? levels.sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b])[0] : null;

                                                                        return (
                                                                            <div key={ai} className="flex items-center justify-between gap-2 text-sm">
                                                                                <span className="text-slate-700">{area.areaName.replace('ความสามารถด้าน', '')}</span>
                                                                                {representativeLevel ? (
                                                                                    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${['ชำนาญ', 'เชี่ยวชาญ'].includes(representativeLevel) ? 'bg-emerald-100 text-emerald-800' : representativeLevel === 'พัฒนา' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                                                                                        {formalLevelLabel(representativeLevel)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">รอรับรอง</span>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="mt-3 border-t border-slate-200 pt-2 text-xs font-semibold text-slate-500">
                                                                    รับรองแล้ว {approvedEntries.length}/{allEntries.length} · ผ่าน {passedEntries.length}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Batch approve button */}
                                                <div className="mt-5 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                                                    <p className="flex items-center gap-2 text-xs text-slate-500"><History className="h-4 w-4" /> ระบบบันทึกผู้ดำเนินการ วันเวลา และเหตุผลทุกครั้ง</p>
                                                    <button
                                                        onClick={handleBatchApprove}
                                                        disabled={saving || selectedStudentData.pending === 0}
                                                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 text-sm font-extrabold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-50"
                                                    >
                                                        {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-4 w-4" />}
                                                        รับรองทั้งหมดที่กรอกข้อมูลครบ
                                                    </button>
                                                </div>
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            )}
                        </main>
                    </div>
            )}
            </div>
        </Layout>
    );
}
