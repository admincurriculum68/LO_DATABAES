import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { areaSelectionState, groupLearningOutcomesByArea, shortAreaName, toggleArea } from '../../lib/loMapping';

// รายการ LO ของชั้นหนึ่ง จัดกลุ่มตามด้านความสามารถ เลือกทั้งด้านหรือทีละข้อก็ได้
// ใช้ร่วมกันสองที่: ครูผู้สอนเลือก LO ของวิชาตัวเอง และฝ่ายวิชาการเลือกรายข้อในหน้ากำหนด LO
export default function LoAreaPicker({ learningOutcomes, selection, onChange, disabled = false, emptyText = 'ยังไม่มี LO ของชั้นนี้' }) {
    const [query, setQuery] = useState('');

    const groups = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return groupLearningOutcomesByArea(learningOutcomes)
            .map(group => ({
                ...group,
                visible: normalized
                    ? group.los.filter(lo => `${lo.lo_code || ''} ${lo.lo_description || ''} ${group.area}`.toLowerCase().includes(normalized))
                    : group.los,
            }))
            .filter(group => group.visible.length);
    }, [learningOutcomes, query]);

    const toggleOne = (loId, checked) => {
        const next = new Set(selection);
        if (checked) next.delete(loId); else next.add(loId);
        onChange(next);
    };

    return (
        <div className="space-y-4">
            <label className="relative block sm:max-w-sm">
                <span className="sr-only">ค้นหา LO</span>
                <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-500" aria-hidden="true" />
                <input value={query} onChange={event => setQuery(event.target.value)} placeholder="ค้นหารหัสหรือข้อความ LO" className="min-h-11 w-full rounded-xl border border-field bg-white pl-10 pr-3 text-sm placeholder:text-slate-500 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </label>

            {groups.length === 0 && <p className="py-8 text-center text-sm text-slate-600">{query ? 'ไม่พบ LO ที่ตรงกับที่ค้นหา' : emptyText}</p>}

            {groups.map(group => {
                const loIds = group.los.map(lo => lo.lo_id);
                const groupState = areaSelectionState(loIds, selection);
                return (
                    <fieldset key={group.area} className="overflow-hidden rounded-xl border border-line">
                        <legend className="sr-only">{group.area}</legend>
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2">
                            <p className="text-sm font-bold text-slate-900">{shortAreaName(group.area)} <span className="font-semibold text-slate-600 tabular-nums">· เลือก {groupState.count}/{groupState.total}</span></p>
                            <button type="button" disabled={disabled} onClick={() => onChange(toggleArea(selection, loIds))} className="inline-flex min-h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-700 disabled:opacity-40">
                                {groupState.state === 'all' ? 'เอาออกทั้งด้าน' : 'เลือกทั้งด้าน'}
                            </button>
                        </div>
                        <ul className="divide-y divide-line">
                            {group.visible.map(lo => {
                                const checked = selection.has(lo.lo_id);
                                return (
                                    <li key={lo.lo_id}>
                                        <label className={`flex items-start gap-3 px-4 py-3 ${disabled ? '' : 'cursor-pointer'} ${checked ? 'surface-selected' : disabled ? '' : 'hover:bg-slate-50'}`}>
                                            <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleOne(lo.lo_id, checked)} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-indigo-700 disabled:cursor-default" />
                                            <span className="min-w-0">
                                                <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-slate-900">
                                                    {lo.lo_code || 'ไม่มีรหัส'}
                                                    {lo.ability_no != null && <span className="chip chip-neutral">ข้อที่ {lo.ability_no}</span>}
                                                    {lo.is_custom_competency && <span className="chip chip-warning">เพิ่มเติมจากหลักสูตร</span>}
                                                </span>
                                                <span className="mt-1 block text-sm leading-6 text-slate-700">{lo.lo_description}</span>
                                            </span>
                                        </label>
                                    </li>
                                );
                            })}
                        </ul>
                    </fieldset>
                );
            })}
        </div>
    );
}
