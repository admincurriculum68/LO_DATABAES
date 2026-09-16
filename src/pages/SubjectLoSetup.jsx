import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Info, Loader2, RefreshCw, Save, Send, Sparkles, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import LoAreaPicker from '../components/lo/LoAreaPicker';
import { fetchAllRows, supabase } from '../lib/supabase';
import { useAuth } from '../AuthContext';
import { useDialog } from '../lib/dialogContext';
import { groupLearningOutcomesByArea, learningOutcomesForGrade, sameSelection, suggestAreasForSubject } from '../lib/loMapping';
import { PROPOSAL_STATUS, lastEditedText, selectionOfProposal, statusOf, teacherCanEdit } from '../lib/loProposals';
import { LO_PROPOSAL_SQL_HINT, loProposalsSupported, saveProposal } from '../lib/loProposalsApi';

// ครูผู้สอนเลือก LO ของวิชาตัวเอง แล้วส่งให้ฝ่ายวิชาการอนุมัติ
// วิชาหนึ่งใช้ LO ชุดเดียวกันทุกห้อง ครูที่สอนวิชานี้คนไหนก็แก้และส่งได้ หน้าจอจึงบอกว่าใครแก้ล่าสุด
// อนุมัติแล้วครูแก้เองไม่ได้ ต้องให้ฝ่ายวิชาการปลดล็อกก่อน

const fullName = person => `${person?.prefix || ''}${person?.first_name || ''} ${person?.last_name || ''}`.trim();
const draftKey = subjectId => `loProposalDraft:${subjectId}`;

export default function SubjectLoSetup() {
    const { subjectId } = useParams();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const dialog = useDialog();
    const [state, setState] = useState({ loading: true, error: '', subject: null, learningOutcomes: [], proposal: null, savedIds: [], teachers: [], supported: true });
    const [selection, setSelection] = useState(new Set());
    const [saving, setSaving] = useState(false);
    const restoredRef = useRef(false);

    const load = useCallback(async () => {
        setState(previous => ({ ...previous, loading: true, error: '' }));
        try {
            const { data: subject, error: subjectError } = await supabase.from('subjects')
                .select('subject_id, subject_name, grade_level, teacher_id, academic_year, semester')
                .eq('subject_id', subjectId).eq('school_id', currentUser.school_id).single();
            if (subjectError || !subject) throw new Error('ไม่พบรายวิชานี้ในโรงเรียนของคุณ');

            const { data: assignments, error: assignmentError } = await supabase.from('subject_teachers')
                .select('teacher_id').eq('subject_id', subjectId);
            if (assignmentError) throw assignmentError;
            const teacherIds = [...new Set([subject.teacher_id, ...(assignments || []).map(item => item.teacher_id)].filter(Boolean))];
            if (!teacherIds.includes(currentUser.teacher_id)) throw new Error('คุณไม่ได้รับมอบหมายให้สอนรายวิชานี้');

            const supported = await loProposalsSupported();
            const [learningOutcomes, mappingResult, proposalResult, teacherResult] = await Promise.all([
                fetchAllRows((from, to) => supabase.from('learning_outcomes')
                    .select('lo_id, lo_code, ability_no, competency_area, is_custom_competency, lo_description, grade_level')
                    .eq('school_id', currentUser.school_id).range(from, to)),
                supabase.from('subject_lo_mapping').select('lo_id').eq('subject_id', subjectId),
                supported
                    ? supabase.from('subject_lo_proposals').select('*').eq('subject_id', subjectId).maybeSingle()
                    : Promise.resolve({ data: null }),
                supabase.from('users_teachers').select('teacher_id, prefix, first_name, last_name').in('teacher_id', teacherIds),
            ]);
            if (mappingResult.error) throw mappingResult.error;
            if (proposalResult.error) throw proposalResult.error;

            const savedIds = (mappingResult.data || []).map(row => row.lo_id);
            const proposal = proposalResult.data || null;
            setState({
                loading: false, error: '', subject, proposal, savedIds, supported,
                learningOutcomes: learningOutcomesForGrade(learningOutcomes, subject.grade_level),
                teachers: teacherResult.data || [],
            });

            const stored = (() => {
                if (restoredRef.current) return null;
                restoredRef.current = true;
                try { return JSON.parse(sessionStorage.getItem(draftKey(subjectId)) || 'null'); } catch { return null; }
            })();
            const base = selectionOfProposal(proposal, savedIds);
            if (stored?.loIds && teacherCanEdit(statusOf(proposal, savedIds)) && !sameSelection(stored.loIds, base)) {
                setSelection(new Set(stored.loIds));
                toast('กู้รายการที่ยังไม่ได้บันทึกกลับมา', { icon: '↩️' });
            } else {
                setSelection(base);
            }
        } catch (error) {
            setState(previous => ({ ...previous, loading: false, error: error.message || 'โหลดข้อมูลไม่สำเร็จ' }));
        }
    }, [currentUser.school_id, currentUser.teacher_id, subjectId]);

    useEffect(() => { load(); }, [load]);

    const status = statusOf(state.proposal, state.savedIds);
    const editable = teacherCanEdit(status);
    const baseline = useMemo(() => selectionOfProposal(state.proposal, state.savedIds), [state.proposal, state.savedIds]);
    const dirty = editable && !sameSelection(selection, baseline);

    useEffect(() => {
        if (state.loading) return;
        try {
            if (dirty) sessionStorage.setItem(draftKey(subjectId), JSON.stringify({ loIds: [...selection] }));
            else sessionStorage.removeItem(draftKey(subjectId));
        } catch { /* เบราว์เซอร์ไม่ให้ใช้ sessionStorage ก็ทำงานต่อได้ */ }
    }, [dirty, selection, state.loading, subjectId]);

    useEffect(() => {
        if (!dirty) return undefined;
        const warn = event => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const groups = useMemo(() => groupLearningOutcomesByArea(state.learningOutcomes), [state.learningOutcomes]);

    const applySuggestion = () => {
        const areas = suggestAreasForSubject(state.subject?.subject_name, groups.map(group => group.area));
        if (!areas.length) {
            toast('ระบบเดาด้านจากชื่อวิชานี้ไม่ได้ เลือกเองได้เลย', { icon: 'ℹ️' });
            return;
        }
        const next = new Set(selection);
        groups.filter(group => areas.includes(group.area)).forEach(group => group.los.forEach(lo => next.add(lo.lo_id)));
        setSelection(next);
        toast.success(`เลือกให้แล้ว ${areas.length} ด้าน ตรวจให้ตรงกับที่สอนจริงก่อนส่ง`);
    };

    const persist = async nextStatus => {
        if (saving) return false;
        setSaving(true);
        try {
            const result = await saveProposal({
                schoolId: currentUser.school_id, subjectId, loIds: selection, actor: currentUser, proposal: state.proposal, status: nextStatus,
            });
            if (result.conflict) {
                const theirs = result.current;
                const adopt = await dialog.confirm({
                    title: 'ครูอีกคนของวิชานี้เพิ่งแก้ LO',
                    message: `${lastEditedText(theirs, new Map(state.teachers.map(teacher => [teacher.teacher_id, fullName(teacher)])))}\nจะใช้รายการล่าสุดของเขา หรือเก็บรายการของคุณไว้แล้วบันทึกทับ`,
                    confirmLabel: 'ใช้รายการล่าสุด',
                    cancelLabel: 'เก็บรายการของฉันไว้',
                });
                setState(previous => ({ ...previous, proposal: theirs }));
                if (adopt) setSelection(new Set(theirs?.lo_ids || []));
                else toast('กดบันทึกอีกครั้งเพื่อใช้รายการของคุณ', { icon: '⚠️' });
                return false;
            }
            setState(previous => ({ ...previous, proposal: result.row }));
            setSelection(new Set(result.row.lo_ids || []));
            return true;
        } catch (error) {
            toast.error('บันทึกไม่สำเร็จ: ' + error.message);
            return false;
        } finally {
            setSaving(false);
        }
    };

    const saveDraft = async () => { if (await persist('draft')) toast.success('บันทึกร่างแล้ว ยังไม่ส่งให้ฝ่ายวิชาการ'); };

    const submit = async () => {
        if (!selection.size) {
            toast.error('เลือก LO อย่างน้อย 1 ข้อก่อนส่ง');
            return;
        }
        const confirmed = await dialog.confirm({
            title: 'ส่งให้ฝ่ายวิชาการอนุมัติ',
            message: `วิชา ${state.subject.subject_name} จะส่ง LO ${selection.size} ข้อให้ฝ่ายวิชาการตรวจ ระหว่างรออนุมัติจะแก้ไม่ได้ และจะเริ่มบันทึกข้อความ LO ได้หลังอนุมัติ`,
            confirmLabel: 'ส่งให้อนุมัติ',
        });
        if (!confirmed) return;
        if (await persist('submitted')) toast.success('ส่งให้ฝ่ายวิชาการแล้ว รอการอนุมัติ');
    };

    if (state.loading) {
        return (
            <Layout title="เลือก LO ของวิชา">
                <div className="flex min-h-72 items-center justify-center" role="status">
                    <Loader2 className="h-8 w-8 animate-spin text-indigo-700" aria-hidden="true" /><span className="sr-only">กำลังโหลด</span>
                </div>
            </Layout>
        );
    }

    if (state.error) {
        return (
            <Layout title="เลือก LO ของวิชา">
                <div className="mx-auto max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6" role="alert">
                    <p className="font-bold text-rose-900">เปิดหน้านี้ไม่ได้</p>
                    <p className="mt-1 text-sm text-rose-800">{state.error}</p>
                    <button type="button" onClick={() => navigate('/')} className="btn-secondary mt-4"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับหน้างานของฉัน</button>
                </div>
            </Layout>
        );
    }

    const coTeachers = state.teachers.filter(teacher => teacher.teacher_id !== currentUser.teacher_id);
    const nameById = new Map(state.teachers.map(teacher => [teacher.teacher_id, fullName(teacher)]));

    return (
        <Layout title={`เลือก LO · ${state.subject.subject_name}`}>
            <div className="mx-auto w-full max-w-4xl space-y-5 pb-28">
                <button type="button" onClick={() => navigate('/')} className="btn-ghost"><ArrowLeft className="h-4 w-4" aria-hidden="true" />กลับหน้างานของฉัน</button>

                <section className="rounded-2xl border border-line bg-white p-5 sm:p-6" aria-labelledby="lo-setup-title">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <h1 id="lo-setup-title" className="text-xl font-bold text-slate-950">{state.subject.subject_name} <span className="chip chip-info align-middle">{state.subject.grade_level}</span></h1>
                            <p className="mt-1 text-sm text-slate-700">เลือกว่าวิชานี้ประเมิน LO ข้อไหน ใช้กับทุกห้องที่เรียนวิชานี้ เลือกเสร็จแล้วส่งให้ฝ่ายวิชาการอนุมัติ</p>
                        </div>
                        <span className={`chip ${PROPOSAL_STATUS[status].chip}`}>{PROPOSAL_STATUS[status].label}</span>
                    </div>

                    {!state.supported && (
                        <p className="mt-4 flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />{LO_PROPOSAL_SQL_HINT}
                        </p>
                    )}

                    {status === 'returned' && (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">
                            <p className="font-bold">เหตุผลที่ส่งกลับ</p>
                            <p className="mt-1">{state.proposal?.review_note || 'ไม่ได้ระบุเหตุผล'}</p>
                        </div>
                    )}

                    {status === 'submitted' && (
                        <p className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />ส่งให้ฝ่ายวิชาการแล้ว ระหว่างรออนุมัติแก้ไม่ได้ ถ้าต้องแก้ ให้ฝ่ายวิชาการส่งกลับมาก่อน
                        </p>
                    )}

                    {status === 'approved' && (
                        <p className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />อนุมัติแล้ว บันทึกข้อความ LO ได้เลย ถ้าต้องแก้ LO ให้แจ้งฝ่ายวิชาการปลดล็อกก่อน
                        </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span className="font-bold text-slate-900 tabular-nums">เลือกแล้ว {selection.size} ข้อ</span>
                        {state.proposal?.updated_at && <span>{lastEditedText(state.proposal, nameById)}</span>}
                        {coTeachers.length > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                                <Users className="h-4 w-4 text-slate-500" aria-hidden="true" />
                                สอนร่วมกับ {coTeachers.map(fullName).join(', ')} · ใช้ LO ชุดเดียวกัน
                            </span>
                        )}
                    </div>

                    {editable && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            <button type="button" onClick={applySuggestion} className="btn-secondary"><Sparkles className="h-4 w-4" aria-hidden="true" />เลือกด้านตามชื่อวิชา</button>
                            <button type="button" onClick={load} className="btn-ghost"><RefreshCw className="h-4 w-4" aria-hidden="true" />โหลดรายการล่าสุด</button>
                        </div>
                    )}
                </section>

                <section className="rounded-2xl border border-line bg-white p-4 sm:p-6" aria-label="รายการ LO ของชั้นนี้">
                    <LoAreaPicker
                        learningOutcomes={state.learningOutcomes}
                        selection={selection}
                        onChange={setSelection}
                        disabled={!editable}
                        emptyText={`ยังไม่มี LO ของ ${state.subject.grade_level} ในระบบ แจ้งฝ่ายวิชาการให้นำเข้า LO ของชั้นนี้ก่อน`}
                    />
                </section>
            </div>

            {editable && (
                <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-line bg-white/95 p-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
                    <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-bold text-slate-800" aria-live="polite">
                            {dirty ? 'ยังไม่ได้บันทึก' : 'บันทึกล่าสุดแล้ว'} · เลือกไว้ {selection.size} ข้อ
                        </p>
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <button type="button" onClick={saveDraft} disabled={saving} className="btn-secondary"><Save className="h-4 w-4" aria-hidden="true" />{saving ? 'กำลังบันทึก...' : 'บันทึกร่าง'}</button>
                            <button type="button" onClick={submit} disabled={saving || !selection.size} className="btn-primary"><Send className="h-4 w-4" aria-hidden="true" />ส่งให้ฝ่ายวิชาการอนุมัติ</button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
