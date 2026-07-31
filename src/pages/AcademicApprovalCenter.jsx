import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    ArrowLeft,
    ArrowLeftCircle,
    ArrowRightCircle,
    Award,
    BookOpen,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    ClipboardCheck,
    Compass,
    Filter,
    FolderKanban,
    GraduationCap,
    Grid,
    HelpCircle,
    History,
    Info,
    Layers,
    ListFilter,
    Maximize2,
    Minimize2,
    RotateCcw,
    Save,
    Search,
    ShieldCheck,
    Sparkles,
    Table,
    User,
    UserCheck,
    UserRound,
    Users,
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

const levelColorMap = {
    'เชี่ยวชาญ': { bg: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20', activeBg: 'bg-purple-600 text-white shadow-purple-200' },
    'ชำนาญ': { bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20', activeBg: 'bg-emerald-600 text-white shadow-emerald-200' },
    'พัฒนา': { bg: 'bg-sky-50 text-sky-700 border-sky-200 ring-sky-500/20', activeBg: 'bg-sky-600 text-white shadow-sky-200' },
    'เริ่มต้น': { bg: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20', activeBg: 'bg-amber-600 text-white shadow-amber-200' },
    'N/A': { bg: 'bg-slate-100 text-slate-600 border-slate-200 ring-slate-500/20', activeBg: 'bg-slate-700 text-white shadow-slate-200' },
};

const statusMeta = {
    pending: { label: 'รอตรวจรับรอง', className: 'bg-amber-500/10 text-amber-700 border-amber-200/80' },
    approved: { label: 'รับรองแล้ว', className: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/80' },
    returned: { label: 'ส่งกลับแก้ไข', className: 'bg-rose-500/10 text-rose-700 border-rose-200/80' },
};

// Preset reasons for quick single-click entry (Academic Officer UX)
const PRESET_REASONS_APPROVE = [
    'หลักฐานเชิงประจักษ์ครบถ้วนและสอดคล้อง',
    'ผลการประเมินจากทุกรูปแบบผ่านเกณฑ์เป้าหมาย',
    'มีพัฒนาการโดดเด่นและแสดงผลงานชัดเจน',
];

function fullName(student) {
    if (!student) return 'ไม่พบข้อมูลผู้เรียน';
    return `${student.prefix || ''}${student.first_name || ''} ${student.last_name || ''}`.trim();
}

function getInitials(student) {
    if (!student) return '?';
    const first = student.first_name?.[0] || '';
    const last = student.last_name?.[0] || '';
    return `${first}${last}` || student.student_code?.[0] || 'S';
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

function sourceStatusMeta(source) {
    if (!source.competency_level) return { label: 'รอประเมิน', className: 'bg-slate-100 text-slate-600 border-slate-200' };
    switch (source.workflow_status) {
        case 'submitted': return { label: 'ส่งตรวจแล้ว', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
        case 'approved': return { label: 'รับรองแล้ว', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
        case 'returned': return { label: 'ส่งกลับแก้ไข', className: 'bg-rose-50 text-rose-700 border-rose-200' };
        default: return { label: 'ฉบับร่าง', className: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
}

function sourceLabel(source) {
    if (source.source_type === 'subject') return source.source_name || 'รายวิชา';
    const type = learningFormatLabel(source.context_type);
    return `${type}: ${source.source_name || '-'}`;
}

function LoadingState() {
    return (
        <div className="space-y-3 p-3" aria-label="กำลังโหลดข้อมูล">
            {[1, 2, 3, 4, 5].map(item => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-slate-200/80 animate-pulse" />
                    <div className="flex-1 space-y-2">
                        <div className="h-4 w-32 rounded bg-slate-200/80 animate-pulse" />
                        <div className="h-3 w-20 rounded bg-slate-200/60 animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// Group LO entries by competency area according to current grade phase
function groupLosByCompetency(loEntries, levelGroup) {
    const groups = APPROVAL_COMPETENCY_GROUPS[levelGroup];
    if (!groups) {
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

    const [allLoEntries, setAllLoEntries] = useState([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    
    // Multi-level Filters for 500-2,000 students
    const [gradeFilter, setGradeFilter] = useState('all');
    const [roomFilter, setRoomFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    
    // View Mode Toggle: 'individual' (รายบุคคล) | 'matrix' (ตารางภาพรวมห้องเรียน)
    const [viewMode, setViewMode] = useState('individual');

    // Local decision state: key = student_id:lo_id → { level, reason }
    const [localDecisions, setLocalDecisions] = useState({});
    const [expandedLOs, setExpandedLOs] = useState(new Set());
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

            const initDecisions = {};
            result.forEach(entry => {
                if (entry.decision) {
                    initDecisions[entry.key] = {
                        level: entry.decision.final_level || '',
                        reason: entry.decision.decision_reason || '',
                    };
                } else if (entry.recommended_level) {
                    initDecisions[entry.key] = {
                        level: entry.recommended_level,
                        reason: '',
                    };
                }
            });
            setLocalDecisions(initDecisions);

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

    // Build deduplicated student list
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
                const percent = total > 0 ? Math.round((approved / total) * 100) : 0;
                return { student, total, approved, returned, pending, percent, entries };
            })
            .sort((a, b) => {
                const roomCmp = (a.student.current_room || '').localeCompare(b.student.current_room || '', 'th');
                return roomCmp !== 0 ? roomCmp : (a.student.student_code || '').localeCompare(b.student.student_code || '', 'th');
            });
    }, [allLoEntries]);

    // Extract available Grade Levels & Rooms dynamically for filtering 500-2,000 students
    const availableGrades = useMemo(() => {
        const set = new Set();
        studentList.forEach(item => {
            if (item.student.current_grade_level) set.add(item.student.current_grade_level);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'th'));
    }, [studentList]);

    const availableRooms = useMemo(() => {
        const set = new Set();
        studentList.forEach(item => {
            if (gradeFilter !== 'all' && item.student.current_grade_level !== gradeFilter) return;
            if (item.student.current_room) set.add(item.student.current_room);
        });
        return [...set].sort((a, b) => a.localeCompare(b, 'th'));
    }, [studentList, gradeFilter]);

    // Multi-level filtered Student List
    const filteredStudentList = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return studentList.filter(item => {
            // Grade level filter
            if (gradeFilter !== 'all' && item.student.current_grade_level !== gradeFilter) return false;
            // Room filter
            if (roomFilter !== 'all' && item.student.current_room !== roomFilter) return false;
            // Status filter
            if (statusFilter === 'pending' && item.pending === 0) return false;
            if (statusFilter === 'approved' && item.approved === 0) return false;
            if (statusFilter === 'returned' && item.returned === 0) return false;
            // Search text
            if (normalized) {
                const haystack = `${item.student.student_code || ''} ${fullName(item.student)} ${item.student.current_room || ''}`.toLowerCase();
                if (!haystack.includes(normalized)) return false;
            }
            return true;
        });
    }, [studentList, gradeFilter, roomFilter, statusFilter, query]);

    // Index of currently selected student in the filtered list (for Next/Prev student navigation)
    const currentStudentIndex = useMemo(() => {
        return filteredStudentList.findIndex(s => s.student.student_id === selectedStudentId);
    }, [filteredStudentList, selectedStudentId]);

    const overallStats = useMemo(() => {
        const totalStudents = studentList.length;
        const fullyApprovedStudents = studentList.filter(s => s.approved === s.total && s.total > 0).length;
        const totalLOs = allLoEntries.length;
        const approvedLOs = allLoEntries.filter(e => e.decision?.decision_status === 'approved').length;
        const pendingLOs = allLoEntries.filter(e => (!e.decision || e.decision.decision_status === 'pending')).length;
        const returnedLOs = allLoEntries.filter(e => e.decision?.decision_status === 'returned').length;
        const percentApproved = totalLOs > 0 ? Math.round((approvedLOs / totalLOs) * 100) : 0;

        return {
            totalStudents,
            fullyApprovedStudents,
            totalLOs,
            approvedLOs,
            pendingLOs,
            returnedLOs,
            percentApproved,
        };
    }, [allLoEntries, studentList]);

    // Extract list of all unique LOs in the dataset for Class Matrix view
    const allLOsList = useMemo(() => {
        const map = new Map();
        allLoEntries.forEach(entry => {
            if (!map.has(entry.lo.lo_id)) {
                map.set(entry.lo.lo_id, entry.lo);
            }
        });
        return [...map.values()].sort((a, b) => (a.ability_no || 0) - (b.ability_no || 0));
    }, [allLoEntries]);

    const selectedStudentData = useMemo(() => {
        if (!selectedStudentId) return null;
        const entries = allLoEntries.filter(e => e.student.student_id === selectedStudentId);
        if (entries.length === 0) return null;

        const student = entries[0].student;
        const levelGroup = entries[0].lo.level_group || 'ป.ต้น';
        const competencyGroups = groupLosByCompetency(entries, levelGroup);

        const total = entries.length;
        const approved = entries.filter(e => e.decision?.decision_status === 'approved').length;
        const returned = entries.filter(e => e.decision?.decision_status === 'returned').length;
        const pending = total - approved - returned;
        const percent = total > 0 ? Math.round((approved / total) * 100) : 0;

        return { student, levelGroup, competencyGroups, total, approved, returned, pending, percent, entries };
    }, [allLoEntries, selectedStudentId]);

    const updateLocalDecision = useCallback((key, field, value) => {
        setLocalDecisions(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value },
        }));
    }, []);

    const appendPresetReason = useCallback((key, text) => {
        setLocalDecisions(prev => {
            const currentReason = prev[key]?.reason || '';
            const newReason = currentReason ? `${currentReason} ${text}` : text;
            return {
                ...prev,
                [key]: { ...prev[key], reason: newReason },
            };
        });
    }, []);

    const toggleExpanded = useCallback((key) => {
        setExpandedLOs(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const toggleAllLOsForStudent = useCallback((expand) => {
        if (!selectedStudentData) return;
        setExpandedLOs(prev => {
            const next = new Set(prev);
            selectedStudentData.entries.forEach(e => {
                if (expand) next.add(e.key);
                else next.delete(e.key);
            });
            return next;
        });
    }, [selectedStudentData]);

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

    const handleSingleDecision = useCallback(async (entry, decisionStatus) => {
        const success = await saveDecisionForEntry(entry, decisionStatus);
        if (success) {
            toast.success(decisionStatus === 'approved' ? `รับรองผล ${entry.lo.lo_code || 'LO'} เรียบร้อย` : `ส่งผล ${entry.lo.lo_code || 'LO'} กลับให้ครูแก้ไขแล้ว`);
            await loadApprovalData();
        }
    }, [loadApprovalData, saveDecisionForEntry]);

    const handleBatchApprove = useCallback(async () => {
        if (!selectedStudentData) return;

        const readyEntries = selectedStudentData.entries.filter(entry => {
            if (entry.decision?.decision_status === 'approved') return false;
            const local = localDecisions[entry.key];
            return local?.level && local?.reason?.trim();
        });

        if (readyEntries.length === 0) {
            toast.error('ไม่มีรายการที่กรอกข้อมูลครบพร้อมรับรอง (ต้องเลือกระดับและระบุเหตุผล)');
            return;
        }

        if (!window.confirm(`ต้องการยืนยันรับรองผล ${readyEntries.length} รายการสำหรับ ${fullName(selectedStudentData.student)} พร้อมกันหรือไม่?`)) return;

        setSaving(true);
        let successCount = 0;
        for (const entry of readyEntries) {
            const success = await saveDecisionForEntry(entry, 'approved');
            if (success) successCount++;
        }
        setSaving(false);

        if (successCount > 0) {
            toast.success(`รับรองผลสำเร็จ ${successCount} รายการเรียบร้อยแล้ว`);
            await loadApprovalData();
        }
    }, [loadApprovalData, localDecisions, saveDecisionForEntry, selectedStudentData]);

    // Student Navigation Shortcuts
    const navigateStudent = useCallback((direction) => {
        if (currentStudentIndex === -1 || filteredStudentList.length === 0) return;
        const nextIndex = currentStudentIndex + direction;
        if (nextIndex >= 0 && nextIndex < filteredStudentList.length) {
            setSelectedStudentId(filteredStudentList[nextIndex].student.student_id);
        }
    }, [currentStudentIndex, filteredStudentList]);

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
        <Layout title="ศูนย์การรับรองผลลัพธ์การเรียนรู้">
            <div className="mx-auto w-full max-w-[1720px] space-y-6 pb-12">
                
                {/* Top Header Hero Banner */}
                <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 sm:p-8 text-white shadow-xl ring-1 ring-white/10">
                    <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
                    <div className="absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl" />

                    <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2 max-w-3xl">
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    onClick={() => history.back()}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-white/20 hover:text-white"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" /> กลับ Dashboard
                                </button>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200 border border-indigo-400/20 backdrop-blur-md">
                                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-300" /> ฝ่ายวิชาการ (Academic Decision)
                                </span>
                            </div>
                            <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-white">
                                ศูนย์การตรวจสอบและรับรองผลลัพธ์การเรียนรู้
                            </h1>
                            <p className="text-sm leading-relaxed text-indigo-100/80">
                                การพิจารณารับรองระดับความสามารถรายบุคคลโดยฝ่ายวิชาการ รองรับโรงเรียนขนาดใหญ่ 500-2,000 คน ด้วยระบบคัดกรองตามระดับชั้น/ห้องเรียน
                            </p>
                        </div>

                        {/* Overall Statistics Bar */}
                        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/5 p-3.5 border border-white/10 backdrop-blur-md sm:gap-4">
                            <div className="flex items-center gap-3 px-3 py-1">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
                                    <GraduationCap className="h-6 w-6" />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-indigo-200">นักเรียนในระบบ</div>
                                    <div className="text-lg font-black text-white">{overallStats.totalStudents} <span className="text-xs font-normal text-slate-300">คน</span></div>
                                </div>
                            </div>
                            <div className="h-9 w-px bg-white/10 hidden sm:block" />
                            <div className="flex items-center gap-3 px-3 py-1">
                                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30">
                                    <CheckCircle2 className="h-6 w-6" />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-indigo-200">รับรองครบแล้ว</div>
                                    <div className="text-lg font-black text-emerald-400">{overallStats.fullyApprovedStudents} <span className="text-xs font-normal text-slate-300">คน</span></div>
                                </div>
                            </div>
                            <div className="h-9 w-px bg-white/10 hidden sm:block" />
                            <div className="px-3 py-1">
                                <div className="text-xs font-medium text-indigo-200">ความคืบหน้ารวม</div>
                                <div className="mt-1 flex items-center gap-2">
                                    <div className="h-2.5 w-24 overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-all duration-500" style={{ width: `${overallStats.percentApproved}%` }} />
                                    </div>
                                    <span className="text-xs font-bold text-white">{overallStats.percentApproved}%</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {loadError ? (
                    <section className="rounded-3xl border border-rose-200 bg-rose-50/80 p-8 text-slate-900 shadow-sm" role="alert">
                        <div className="flex items-start gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                                <AlertCircle className="h-6 w-6" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-extrabold text-rose-950">ไม่สามารถเปิดศูนย์รับรองผลได้ในขณะนี้</h3>
                                <p className="text-sm leading-relaxed text-rose-800">{loadError}</p>
                                <button
                                    onClick={loadApprovalData}
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-600 focus:ring-offset-2"
                                >
                                    <RotateCcw className="h-4 w-4" /> ลองโหลดข้อมูลอีกครั้ง
                                </button>
                            </div>
                        </div>
                    </section>
                ) : (
                    <div className="space-y-4">
                        
                        {/* Scale-Ready Multi-Level Toolbar */}
                        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:justify-between">
                            
                            {/* Filter Selectors: Grade Level + Class Room */}
                            <div className="flex flex-wrap items-center gap-2.5">
                                <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-extrabold text-slate-700">
                                    <Filter className="h-4 w-4 text-indigo-600" /> คัดกรองกลุ่ม:
                                </div>

                                {/* Grade Level Selector */}
                                <select
                                    value={gradeFilter}
                                    onChange={e => {
                                        setGradeFilter(e.target.value);
                                        setRoomFilter('all'); // reset room when grade changes
                                    }}
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 shadow-2xs transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    <option value="all">ทุกระดับชั้น ({studentList.length} คน)</option>
                                    {availableGrades.map(g => (
                                        <option key={g} value={g}>ระดับชั้น {g}</option>
                                    ))}
                                </select>

                                {/* Room Selector */}
                                <select
                                    value={roomFilter}
                                    onChange={e => setRoomFilter(e.target.value)}
                                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-900 shadow-2xs transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                >
                                    <option value="all">ทุกห้องเรียน</option>
                                    {availableRooms.map(r => (
                                        <option key={r} value={r}>ห้องเรียน {r}</option>
                                    ))}
                                </select>
                            </div>

                            {/* View Mode Switcher: Individual vs Class Matrix */}
                            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                                <button
                                    onClick={() => setViewMode('individual')}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all ${
                                        viewMode === 'individual'
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <UserRound className="h-4 w-4" /> มุมมองรายบุคคล
                                </button>
                                <button
                                    onClick={() => setViewMode('matrix')}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all ${
                                        viewMode === 'matrix'
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    <Table className="h-4 w-4" /> มุมมองตารางภาพรวมห้องเรียน
                                </button>
                            </div>
                        </div>

                        {/* VIEW MODE 1: CLASS MATRIX VIEW (ตารางภาพรวมสำหรับห้องเรียน) */}
                        {viewMode === 'matrix' ? (
                            <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-lg space-y-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                                    <div>
                                        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                            <Table className="h-5 w-5 text-indigo-600" /> ตารางสรุปการรับรองผลรายห้องเรียน
                                        </h3>
                                        <p className="text-xs text-slate-500">
                                            กำลังแสดงผล {filteredStudentList.length} คน (ระดับชั้น: {gradeFilter === 'all' ? 'ทั้งหมด' : gradeFilter} · ห้อง: {roomFilter === 'all' ? 'ทั้งหมด' : roomFilter})
                                        </p>
                                    </div>
                                    <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl">
                                        คลิกที่ชื่อผู้เรียนเพื่อสลับไปตรวจอย่างละเอียด
                                    </span>
                                </div>

                                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                                    <table className="w-full min-w-[900px] text-left text-xs border-collapse">
                                        <thead className="bg-slate-100/80 text-slate-700 font-extrabold border-b border-slate-200">
                                            <tr>
                                                <th className="sticky left-0 bg-slate-100 px-4 py-3 border-r border-slate-200 z-10 w-48">ผู้เรียน</th>
                                                <th className="px-3 py-3 w-24">รหัส</th>
                                                <th className="px-3 py-3 w-20">ห้อง</th>
                                                {allLOsList.map(lo => (
                                                    <th key={lo.lo_id} className="px-2 py-3 text-center min-w-[90px] border-l border-slate-200">
                                                        <span className="block text-indigo-700 font-black">{lo.lo_code || `LO ${lo.ability_no}`}</span>
                                                    </th>
                                                ))}
                                                <th className="px-3 py-3 text-center border-l border-slate-200 w-28">ความคืบหน้า</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredStudentList.map((item, idx) => {
                                                const student = item.student;
                                                const entriesMap = new Map(item.entries.map(e => [e.lo.lo_id, e]));

                                                return (
                                                    <tr key={student.student_id} className="hover:bg-slate-50/80 transition">
                                                        <td className="sticky left-0 bg-white hover:bg-slate-50 px-4 py-3 font-bold text-slate-900 border-r border-slate-200 z-10">
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedStudentId(student.student_id);
                                                                    setViewMode('individual');
                                                                }}
                                                                className="text-left hover:text-indigo-600 hover:underline flex items-center gap-1.5"
                                                            >
                                                                <span>{fullName(student)}</span>
                                                            </button>
                                                        </td>
                                                        <td className="px-3 py-3 text-slate-500 font-mono">{student.student_code}</td>
                                                        <td className="px-3 py-3 text-slate-600 font-semibold">{student.current_room || '-'}</td>

                                                        {allLOsList.map(lo => {
                                                            const entry = entriesMap.get(lo.lo_id);
                                                            if (!entry) {
                                                                return (
                                                                    <td key={lo.lo_id} className="px-2 py-3 text-center border-l border-slate-100 text-slate-300">
                                                                        -
                                                                    </td>
                                                                );
                                                            }

                                                            const isApproved = entry.decision?.decision_status === 'approved';
                                                            const level = entry.decision?.final_level || entry.recommended_level;

                                                            return (
                                                                <td key={lo.lo_id} className="px-2 py-3 text-center border-l border-slate-100">
                                                                    {isApproved ? (
                                                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                                                            ['ชำนาญ', 'เชี่ยวชาญ'].includes(level) ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
                                                                        }`}>
                                                                            {formalLevelLabel(level)}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                                                            รอรับรอง
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            );
                                                        })}

                                                        <td className="px-3 py-3 text-center border-l border-slate-200">
                                                            <span className={`font-bold ${item.approved === item.total ? 'text-emerald-600' : 'text-slate-700'}`}>
                                                                {item.approved}/{item.total}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            /* VIEW MODE 2: INDIVIDUAL DEEP-DIVE VIEW */
                            <div className="grid overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/50 xl:grid-cols-[400px_minmax(0,1fr)]">
                                
                                {/* ═══ Left Sidebar: Student List ═══ */}
                                <aside className="flex flex-col border-b border-slate-200/80 bg-slate-50/50 xl:border-b-0 xl:border-r" aria-label="คิวตรวจสอบรายชื่อผู้เรียน">
                                    
                                    {/* Search and Tabs */}
                                    <div className="space-y-3.5 border-b border-slate-200/80 bg-white p-5">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                                                    <UserRound className="h-4 w-4 text-indigo-600" /> รายชื่อผู้เรียน
                                                </h3>
                                                <p className="mt-0.5 text-xs text-slate-500">แสดงผล {filteredStudentList.length} จาก {studentList.length} คน</p>
                                            </div>
                                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                                ภาค {semester}/{academicYear}
                                            </span>
                                        </div>

                                        {/* Status Filter Tabs */}
                                        <div className="grid grid-cols-4 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600">
                                            {[
                                                { key: 'all', label: 'ทั้งหมด', count: studentList.length },
                                                { key: 'pending', label: 'รอตรวจ', count: overallStats.pendingLOs },
                                                { key: 'returned', label: 'ส่งกลับ', count: overallStats.returnedLOs },
                                                { key: 'approved', label: 'รับรองแล้ว', count: overallStats.approvedLOs },
                                            ].map(tab => (
                                                <button
                                                    key={tab.key}
                                                    onClick={() => setStatusFilter(tab.key)}
                                                    className={`flex flex-col items-center justify-center rounded-lg py-2 transition-all ${
                                                        statusFilter === tab.key
                                                            ? 'bg-white text-indigo-700 shadow-sm font-extrabold'
                                                            : 'hover:text-slate-900 hover:bg-slate-200/50'
                                                    }`}
                                                >
                                                    <span className="text-xs">{tab.label}</span>
                                                </button>
                                            ))}
                                        </div>

                                        {/* Search Bar */}
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                                            <input
                                                type="text"
                                                value={query}
                                                onChange={e => setQuery(e.target.value)}
                                                placeholder="ค้นหาชื่อ, รหัสนักเรียน..."
                                                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-xs font-medium text-slate-900 placeholder-slate-400 transition focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                            />
                                            {query && (
                                                <button
                                                    onClick={() => setQuery('')}
                                                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                                                >
                                                    <XCircle className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Student Scroll List */}
                                    <div className="max-h-[760px] flex-1 overflow-y-auto p-3 space-y-2">
                                        {loading ? (
                                            <LoadingState />
                                        ) : filteredStudentList.length === 0 ? (
                                            <div className="px-4 py-16 text-center">
                                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                                    <UserRound className="h-6 w-6" />
                                                </div>
                                                <h4 className="mt-3 text-sm font-bold text-slate-800">ไม่พบรายชื่อผู้เรียน</h4>
                                                <p className="mt-1 text-xs text-slate-500">ลองปรับเปลี่ยนคำค้นหาหรือตัวกรองระดับชั้น/ห้องเรียน</p>
                                                <button
                                                    onClick={() => { setQuery(''); setStatusFilter('all'); setGradeFilter('all'); setRoomFilter('all'); }}
                                                    className="mt-3 rounded-lg text-xs font-extrabold text-indigo-600 hover:underline"
                                                >
                                                    ล้างการค้นหาและตัวกรองทั้งหมด
                                                </button>
                                            </div>
                                        ) : (
                                            filteredStudentList.map(item => {
                                                const isSelected = selectedStudentId === item.student.student_id;
                                                const isCompleted = item.approved === item.total && item.total > 0;

                                                return (
                                                    <button
                                                        key={item.student.student_id}
                                                        onClick={() => setSelectedStudentId(item.student.student_id)}
                                                        className={`group relative w-full rounded-2xl p-3.5 text-left transition-all duration-200 ${
                                                            isSelected
                                                                ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/20 ring-1 ring-indigo-600'
                                                                : 'bg-white hover:bg-slate-100/80 text-slate-900 border border-slate-200/70 shadow-sm'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs shadow-inner ${
                                                                isSelected
                                                                    ? 'bg-white/20 text-white'
                                                                    : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                                            }`}>
                                                                {getInitials(item.student)}
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center justify-between gap-1">
                                                                    <p className={`truncate text-sm font-extrabold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                                                        {fullName(item.student)}
                                                                    </p>
                                                                    <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${isSelected ? 'text-white translate-x-0.5' : 'text-slate-300 group-hover:text-slate-500'}`} />
                                                                </div>

                                                                <div className="mt-1 flex items-center justify-between text-xs">
                                                                    <span className={isSelected ? 'text-indigo-100' : 'text-slate-500'}>
                                                                        รหัส {item.student.student_code} · {item.student.current_room || item.student.current_grade_level || '-'}
                                                                    </span>
                                                                    <span className={`font-bold ${isSelected ? 'text-indigo-100' : 'text-slate-700'}`}>
                                                                        {item.approved}/{item.total} LO
                                                                    </span>
                                                                </div>

                                                                <div className="mt-2 flex items-center gap-2">
                                                                    <div className={`h-1.5 flex-1 overflow-hidden rounded-full ${isSelected ? 'bg-white/20' : 'bg-slate-100'}`}>
                                                                        <div
                                                                            className={`h-full rounded-full transition-all duration-300 ${
                                                                                isSelected ? 'bg-white' : isCompleted ? 'bg-emerald-500' : 'bg-indigo-600'
                                                                            }`}
                                                                            style={{ width: `${item.percent}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className={`text-[10px] font-bold ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>
                                                                        {item.percent}%
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </aside>

                                {/* ═══ Main Content: LO Evaluations grouped by Competency ═══ */}
                                <main className="flex flex-col min-w-0 bg-slate-50/30 overflow-y-auto" aria-label="รายละเอียดการรับรองผล" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                                    {!selectedStudentData ? (
                                        <div className="flex flex-1 items-center justify-center p-12 text-center">
                                            <div className="max-w-sm space-y-3">
                                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-indigo-50 text-indigo-600 shadow-sm border border-indigo-100">
                                                    <Compass className="h-8 w-8" />
                                                </div>
                                                <h3 className="text-base font-extrabold text-slate-900">เลือกผู้เรียนจากรายการเพื่อเริ่มตรวจรับรอง</h3>
                                                <p className="text-xs leading-relaxed text-slate-500">
                                                    ระบบจะแสดงผลการประเมิน LO รายข้อที่จัดกลุ่มตามโครงสร้างความสามารถของหลักสูตรฐานสมรรถนะ
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-6 p-6 lg:p-8">
                                            
                                            {/* Selected Student Header with Next/Prev Shortcuts */}
                                            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-lg font-black text-white shadow-md shadow-indigo-600/20">
                                                        {getInitials(selectedStudentData.student)}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h2 className="text-xl font-black text-slate-950">{fullName(selectedStudentData.student)}</h2>
                                                            <span className="rounded-md bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 border border-indigo-100">
                                                                ช่วงชั้น {selectedStudentData.levelGroup}
                                                            </span>
                                                        </div>
                                                        <p className="mt-0.5 text-xs font-medium text-slate-500">
                                                            รหัสนักเรียน <strong className="text-slate-800">{selectedStudentData.student.student_code}</strong> · ห้องเรียน <strong className="text-slate-800">{selectedStudentData.student.current_room || selectedStudentData.student.current_grade_level || '-'}</strong>
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Fast Next/Prev Navigation Buttons */}
                                                <div className="flex flex-wrap items-center gap-3">
                                                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                                                        <button
                                                            onClick={() => navigateStudent(-1)}
                                                            disabled={currentStudentIndex <= 0}
                                                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-white hover:shadow-2xs transition disabled:opacity-40"
                                                        >
                                                            <ArrowLeftCircle className="h-4 w-4 text-indigo-600" /> คนก่อนหน้า
                                                        </button>
                                                        <span className="text-[11px] font-bold text-slate-400 px-1">
                                                            {currentStudentIndex + 1} / {filteredStudentList.length}
                                                        </span>
                                                        <button
                                                            onClick={() => navigateStudent(1)}
                                                            disabled={currentStudentIndex >= filteredStudentList.length - 1}
                                                            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-white hover:shadow-2xs transition disabled:opacity-40"
                                                        >
                                                            คนถัดไป <ArrowRightCircle className="h-4 w-4 text-indigo-600" />
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                                                        <button
                                                            onClick={() => toggleAllLOsForStudent(true)}
                                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                                                            title="ขยายทุก LO"
                                                        >
                                                            <Maximize2 className="h-3.5 w-3.5 text-indigo-600" /> ขยาย
                                                        </button>
                                                        <div className="h-4 w-px bg-slate-200" />
                                                        <button
                                                            onClick={() => toggleAllLOsForStudent(false)}
                                                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                                                            title="ย่อทุก LO"
                                                        >
                                                            <Minimize2 className="h-3.5 w-3.5 text-slate-500" /> ย่อ
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Competency Groups Accordion / Cards */}
                                            <div className="space-y-6">
                                                {selectedStudentData.competencyGroups.map((group, groupIndex) => {
                                                    const allEntriesInGroup = group.areas.flatMap(a => a.entries);
                                                    const approvedInGroup = allEntriesInGroup.filter(e => e.decision?.decision_status === 'approved').length;
                                                    const isGroupDone = approvedInGroup === allEntriesInGroup.length && allEntriesInGroup.length > 0;

                                                    return (
                                                        <section
                                                            key={groupIndex}
                                                            className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:shadow-md"
                                                        >
                                                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-gradient-to-r from-indigo-50/80 via-slate-50 to-white px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                                                                        <Layers className="h-5 w-5" />
                                                                    </div>
                                                                    <div>
                                                                        <h3 className="text-base font-extrabold text-slate-900">{group.groupName}</h3>
                                                                        <p className="text-xs text-slate-500">
                                                                            ประกอบด้วย {group.areas.length} ด้านความสามารถ · รวม {allEntriesInGroup.length} LO
                                                                        </p>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold border ${
                                                                        isGroupDone
                                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                                    }`}>
                                                                        {isGroupDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                                                                        รับรองแล้ว {approvedInGroup} / {allEntriesInGroup.length} LO
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="divide-y divide-slate-100">
                                                                {group.areas.map((area, areaIndex) => (
                                                                    <div key={areaIndex} className="p-5 space-y-4">
                                                                        {group.areas.length > 1 && (
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="h-2 w-2 rounded-full bg-indigo-600" />
                                                                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">
                                                                                    {area.areaName}
                                                                                </h4>
                                                                                <div className="h-px flex-1 bg-slate-100" />
                                                                            </div>
                                                                        )}

                                                                        <div className="space-y-4">
                                                                            {area.entries.map(entry => {
                                                                                const decisionStatus = entry.decision?.decision_status || 'pending';
                                                                                const meta = statusMeta[decisionStatus] || statusMeta.pending;
                                                                                const isExpanded = expandedLOs.has(entry.key);
                                                                                const isSaving = savingLOs.has(entry.key);
                                                                                const local = localDecisions[entry.key] || {};
                                                                                const recommended = entry.recommended_level;
                                                                                const isApproved = decisionStatus === 'approved';

                                                                                return (
                                                                                    <div
                                                                                        key={entry.key}
                                                                                        className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
                                                                                            isApproved
                                                                                                ? 'border-emerald-200 bg-emerald-50/20 shadow-sm'
                                                                                                : decisionStatus === 'returned'
                                                                                                ? 'border-rose-200 bg-rose-50/20 shadow-sm'
                                                                                                : 'border-slate-200/90 bg-white hover:border-slate-300 shadow-sm'
                                                                                        }`}
                                                                                    >
                                                                                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                                                                                            isApproved ? 'bg-emerald-500' : decisionStatus === 'returned' ? 'bg-rose-500' : 'bg-amber-400'
                                                                                        }`} />

                                                                                        <div className="p-5 pl-6 space-y-4">
                                                                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                                                                <div className="space-y-1.5 flex-1 min-w-0">
                                                                                                    <div className="flex flex-wrap items-center gap-2">
                                                                                                        <span className="rounded-lg bg-indigo-700 px-3 py-1 text-xs font-black text-white shadow-sm">
                                                                                                            {entry.lo.lo_code || `LO ${entry.lo.ability_no}`}
                                                                                                        </span>
                                                                                                        <span className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-0.5 text-xs font-bold ${meta.className}`}>
                                                                                                            {meta.label}
                                                                                                        </span>

                                                                                                        {recommended && (
                                                                                                            <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                                                                                                                <Award className="h-3.5 w-3.5 text-indigo-600" />
                                                                                                                ข้อเสนอจากครู: <strong className="font-extrabold">{formalLevelLabel(recommended)}</strong>
                                                                                                            </span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                    <p className="text-sm font-semibold text-slate-800 leading-relaxed max-w-[80ch]">
                                                                                                        {entry.lo.lo_description}
                                                                                                    </p>
                                                                                                </div>

                                                                                                <button
                                                                                                    onClick={() => toggleExpanded(entry.key)}
                                                                                                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition shrink-0"
                                                                                                >
                                                                                                    {isExpanded ? (
                                                                                                        <>ซ่อนหลักฐาน <ChevronUp className="h-3.5 w-3.5" /></>
                                                                                                    ) : (
                                                                                                        <>ดูหลักฐานครู ({entry.sources.length}) <ChevronDown className="h-3.5 w-3.5" /></>
                                                                                                    )}
                                                                                                </button>
                                                                                            </div>

                                                                                            {isExpanded && (
                                                                                                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 animate-fadeIn">
                                                                                                    <div className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                                                                                                        <BookOpen className="h-3.5 w-3.5 text-indigo-600" /> หลักฐานการประเมินจากครูผู้สอน ({entry.sources.length} แหล่ง)
                                                                                                    </div>

                                                                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                                                                        {entry.sources.map((source, si) => {
                                                                                                            const statusInfo = sourceStatusMeta(source);
                                                                                                            return (
                                                                                                                <div key={si} className="rounded-xl border border-slate-200/90 bg-white p-3 space-y-1.5 shadow-2xs">
                                                                                                                    <div className="flex items-center justify-between text-xs">
                                                                                                                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                                                                                                                            {source.source_type === 'subject' ? (
                                                                                                                                <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
                                                                                                                            ) : (
                                                                                                                                <FolderKanban className="h-3.5 w-3.5 text-indigo-600" />
                                                                                                                            )}
                                                                                                                            {sourceLabel(source)}
                                                                                                                        </span>
                                                                                                                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${statusInfo.className}`}>
                                                                                                                            {statusInfo.label}
                                                                                                                        </span>
                                                                                                                    </div>
                                                                                                                    <div className="flex items-baseline justify-between text-xs">
                                                                                                                        <span className="text-slate-500">ระดับที่ครูประเมิน:</span>
                                                                                                                        <span className="font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                                                                                                            {source.competency_level ? formalLevelLabel(source.competency_level) : 'ยังไม่ประเมิน'}
                                                                                                                        </span>
                                                                                                                    </div>
                                                                                                                    {source.evidence_note && (
                                                                                                                        <p className="text-[11px] leading-relaxed text-slate-600 italic border-l-2 border-indigo-300 pl-2">
                                                                                                                            "{source.evidence_note}"
                                                                                                                        </p>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                            );
                                                                                                        })}
                                                                                                    </div>
                                                                                                </div>
                                                                                            )}

                                                                                            <div className="rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-indigo-50/20 p-4 space-y-3">
                                                                                                <div>
                                                                                                    <span className="block text-xs font-extrabold text-slate-700 mb-2">
                                                                                                        ระดับความสามารถสุดท้าย (ฝ่ายวิชาการพิจารณา) <span className="text-rose-500">*</span>
                                                                                                    </span>
                                                                                                    <div className="flex flex-wrap gap-2">
                                                                                                        {LEVELS.map(level => {
                                                                                                            const isSelectedLevel = (local.level || '') === level;
                                                                                                            const styling = levelColorMap[level] || levelColorMap['N/A'];

                                                                                                            return (
                                                                                                                <button
                                                                                                                    type="button"
                                                                                                                    key={level}
                                                                                                                    onClick={() => updateLocalDecision(entry.key, 'level', level)}
                                                                                                                    className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-extrabold transition-all duration-150 shadow-2xs ${
                                                                                                                        isSelectedLevel
                                                                                                                            ? `${styling.activeBg} ring-2 ${styling.bg.split(' ')[3]} shadow-md scale-[1.02]`
                                                                                                                            : `${styling.bg} hover:brightness-95`
                                                                                                                    }`}
                                                                                                                >
                                                                                                                    {formalLevelLabel(level)}
                                                                                                                </button>
                                                                                                            );
                                                                                                        })}
                                                                                                    </div>
                                                                                                </div>

                                                                                                <div className="space-y-2">
                                                                                                    <div className="flex items-center justify-between">
                                                                                                        <label className="text-xs font-extrabold text-slate-700">
                                                                                                            เหตุผลประกอบการตัดสิน / ข้อเสนอแนะ <span className="text-rose-500">*</span>
                                                                                                        </label>
                                                                                                        <span className="text-[11px] text-slate-400">คลิกข้อความสำเร็จรูปเพื่อกรอกรวดเร็ว</span>
                                                                                                    </div>

                                                                                                    <input
                                                                                                        type="text"
                                                                                                        value={local.reason || ''}
                                                                                                        onChange={e => updateLocalDecision(entry.key, 'reason', e.target.value)}
                                                                                                        placeholder="พิมพ์เหตุผล..."
                                                                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 shadow-2xs transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                                                                                    />

                                                                                                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                                                                        <span className="text-[10px] font-bold text-slate-400">ตัวเลือกด่วน:</span>
                                                                                                        {PRESET_REASONS_APPROVE.map((preset, pi) => (
                                                                                                            <button
                                                                                                                key={pi}
                                                                                                                type="button"
                                                                                                                onClick={() => appendPresetReason(entry.key, preset)}
                                                                                                                className="rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600 shadow-2xs hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition"
                                                                                                            >
                                                                                                                + {preset}
                                                                                                            </button>
                                                                                                        ))}
                                                                                                    </div>
                                                                                                </div>

                                                                                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200/60">
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => handleSingleDecision(entry, 'returned')}
                                                                                                        disabled={isSaving || isApproved}
                                                                                                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-50 transition focus:outline-none focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50"
                                                                                                    >
                                                                                                        <RotateCcw className="h-3.5 w-3.5" /> ส่งกลับแก้ไข
                                                                                                    </button>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => handleSingleDecision(entry, 'approved')}
                                                                                                        disabled={isSaving || isApproved}
                                                                                                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 px-5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:from-indigo-700 hover:to-indigo-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-50"
                                                                                                    >
                                                                                                        {isSaving ? (
                                                                                                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                                                                                        ) : (
                                                                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                                                                        )}
                                                                                                        {isApproved ? 'รับรองแล้ว' : 'บันทึกรับรองข้อนี้'}
                                                                                                    </button>
                                                                                                </div>
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
                                                    );
                                                })}

                                                {/* Competency Group Summary */}
                                                <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md space-y-4">
                                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                                                                <ShieldCheck className="h-5 w-5" />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-base font-extrabold text-slate-900">สรุปผลรวมรายด้านความสามารถ</h3>
                                                                <p className="text-xs text-slate-500">ผลการประเมินสรุปของ {fullName(selectedStudentData.student)} เมื่อพิจารณาครบรอบ</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid gap-4 sm:grid-cols-2">
                                                        {selectedStudentData.competencyGroups.map((group, gi) => {
                                                            const allEntries = group.areas.flatMap(a => a.entries);
                                                            const approvedEntries = allEntries.filter(e => e.decision?.decision_status === 'approved');

                                                            return (
                                                                <div key={gi} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                                                                    <div className="flex items-center justify-between">
                                                                        <h4 className="text-sm font-black text-slate-900">{group.groupName}</h4>
                                                                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                                                                            รับรองแล้ว {approvedEntries.length}/{allEntries.length} LO
                                                                        </span>
                                                                    </div>

                                                                    <div className="space-y-2">
                                                                        {group.areas.map((area, ai) => {
                                                                            const areaEntries = area.entries;
                                                                            const areaDecisions = areaEntries.map(e => e.decision).filter(Boolean).filter(d => d.decision_status === 'approved');
                                                                            const levels = areaDecisions.map(d => d.final_level).filter(l => l && l !== 'N/A');
                                                                            const representativeLevel = levels.length > 0 ? levels.sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b])[0] : null;

                                                                            return (
                                                                                <div key={ai} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-slate-200/70">
                                                                                    <span className="font-semibold text-slate-700">{area.areaName}</span>
                                                                                    {representativeLevel ? (
                                                                                        <span className={`font-extrabold px-2.5 py-0.5 rounded-md text-[11px] ${
                                                                                            ['ชำนาญ', 'เชี่ยวชาญ'].includes(representativeLevel)
                                                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                                                : representativeLevel === 'พัฒนา'
                                                                                                ? 'bg-sky-100 text-sky-800'
                                                                                                : 'bg-amber-100 text-amber-800'
                                                                                        }`}>
                                                                                            {formalLevelLabel(representativeLevel)}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                                                                                            รอพิจารณา
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                                            <History className="h-4 w-4 text-indigo-600 shrink-0" />
                                                            <span>ข้อมูลการตัดสินและการอนุมัติทั้งหมดจะถูกบันทึกใน Audit Log อย่างปลอดภัย</span>
                                                        </div>

                                                        <button
                                                            onClick={handleBatchApprove}
                                                            disabled={saving || selectedStudentData.pending === 0}
                                                            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/20 transition hover:from-emerald-700 hover:to-teal-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
                                                        >
                                                            {saving ? (
                                                                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                                            ) : (
                                                                <Save className="h-4 w-4" />
                                                            )}
                                                            ยืนยันรับรองผลทุก LO ที่พร้อมส่งตรวจ
                                                        </button>
                                                    </div>
                                                </section>

                                            </div>
                                        </div>
                                    )}
                                </main>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Layout>
    );
}
