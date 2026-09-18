// โหลดรายการด้านความสามารถที่ต้องสรุป จากคลัง LO ของโรงเรียน
//
// ห้องหนึ่งต้องสรุปครบทุกด้านของชั้นนั้น (ป.ปลายของเสนาฯ 7 ด้าน · ป.ต้น 10 ด้าน)
// โรงเรียนที่คลัง LO ไม่ได้ระบุชั้น ใช้ด้านทั้งหมดของโรงเรียนแทน
import { areasFromLoBank } from './competencyAreas';
import { fetchAllRows, supabase } from './supabase';

const selectAreas = build => fetchAllRows((from, to) => build(
    supabase.from('learning_outcomes').select('competency_area, ability_no'),
).range(from, to));

export async function loadCompetencyAreas({ schoolId, grades }) {
    if (!schoolId) return [];
    const wanted = [...new Set((grades || []).filter(Boolean))];
    if (wanted.length) {
        const rows = await selectAreas(query => query.eq('school_id', schoolId).in('grade_level', wanted));
        const areas = areasFromLoBank(rows);
        if (areas.length) return areas;
    }
    const allRows = await selectAreas(query => query.eq('school_id', schoolId));
    return areasFromLoBank(allRows);
}
