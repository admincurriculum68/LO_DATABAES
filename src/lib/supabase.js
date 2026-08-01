import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * fetchAllRows — ดึงข้อมูลทุกแถวโดยไม่ติด Supabase 1,000 row default limit
 *
 * @param {(from: number, to: number) => PromiseLike<{data, error}>} queryFn
 *   ฟังก์ชันที่รับ (from, to) แล้ว return Supabase query พร้อม .range() เช่น:
 *   (from, to) => supabase.from('users_students').select('*').eq('school_id', id).range(from, to)
 * @param {number} [pageSize=1000]
 * @returns {Promise<any[]>}
 */
export async function fetchAllRows(queryFn, pageSize = 1000) {
    let all = [];
    let from = 0;
    while (true) {
        const { data, error } = await queryFn(from, from + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < pageSize) break; // หน้าสุดท้ายแล้ว
        from += pageSize;
    }
    return all;
}

/**
 * fetchAllByIn — แบ่งรายการ id ก่อนใช้ .in() เพื่อไม่ให้ URL ยาวเกินไป และ
 * ใช้ fetchAllRows ภายในแต่ละชุดเพื่อไม่ให้ข้อมูลหยุดที่ 1,000 แถว
 *
 * @param {unknown[]} values ค่าที่จะใช้กับ .in()
 * @param {(batch: unknown[], from: number, to: number) => PromiseLike<{data, error}>} queryFn
 * @param {number} [batchSize=200]
 * @returns {Promise<any[]>}
 */
export async function fetchAllByIn(values, queryFn, batchSize = 200) {
    const uniqueValues = [...new Set((values || []).filter(value => value !== null && value !== undefined && value !== ''))];
    if (uniqueValues.length === 0) return [];

    const all = [];
    for (let index = 0; index < uniqueValues.length; index += batchSize) {
        const batch = uniqueValues.slice(index, index + batchSize);
        const rows = await fetchAllRows((from, to) => queryFn(batch, from, to));
        all.push(...rows);
    }
    return all;
}
