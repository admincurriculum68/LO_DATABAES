// จับคู่หัวคอลัมน์ในไฟล์ของโรงเรียนกับช่องข้อมูลของระบบโดยอัตโนมัติ
// ผู้ใช้ยังแก้การจับคู่เองได้ในขั้นที่ 2 ของตัวช่วยนำเข้า แต่ส่วนใหญ่ไม่ได้ตรวจ
// จึงต้องเดาให้ถูกตั้งแต่แรก โดยเฉพาะไม่เดาผิดแบบเงียบ ๆ

// ตัดช่องว่าง วงเล็บ และเครื่องหมายก่อนเทียบ "ชื่อ (first_name)" จึงเท่ากับ "ชื่อfirstname"
export const normalizeHeader = value => String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s._/\\()\-[\]]+/g, '')
    .replace(/ปีการศึกษา/g, 'ปี')
    .replace(/หมายเลข/g, 'เลข');

// คำเทียบที่สั้นกว่านี้กว้างเกินไปสำหรับการจับคู่บางส่วน ใช้ได้เฉพาะการตรงพอดี
const MIN_PARTIAL_ALIAS = 3;
// หัวคอลัมน์ที่สั้นกว่าครึ่งหนึ่งของคำเทียบบอกอะไรได้น้อยเกินไป เช่น "ชื่อ" ที่อยู่ใน
// "คำนำหน้าชื่อ" หรือ "ที่" ที่อยู่ใน "ห้องที่ครูคนนี้รับผิดชอบ" แต่ "เลขประจำตัว" ที่อยู่ใน
// "เลขประจำตัวประชาชน" ยังยาวพอจะเชื่อได้
const MIN_REVERSE_RATIO = 0.5;

// ลำดับการจับคู่ ทำให้ครบทุกช่องทีละขั้น ไม่ใช่ทีละช่อง
// 1) หัวคอลัมน์ที่ตรงกับคำเทียบพอดี ได้ก่อนเสมอ ไม่ว่าช่องนั้นจะอยู่ลำดับไหน
//    ไฟล์ที่ไม่มีคอลัมน์คำนำหน้า คอลัมน์ "ชื่อ" จึงเป็นของช่องชื่อ ไม่ถูกช่องคำนำหน้าแย่งไป
// 2) หัวคอลัมน์ที่ตรงบางส่วนกับคอลัมน์ที่ยังว่าง หัวคอลัมน์ที่มีคำเทียบอยู่ข้างในมาก่อน
//    หัวคอลัมน์สั้นที่อยู่ในคำเทียบ ไฟล์ที่มี "เลขประจำตัว" สองคอลัมน์จึงได้เลขบัตรกับ
//    รหัสนักเรียนคนละคอลัมน์
// 3) ไม่มีคอลัมน์ว่างเหลือ จึงยอมใช้คอลัมน์ร่วมกับช่องอื่น เช่น "ชั้น/ห้อง" คอลัมน์เดียวที่เป็น
//    ทั้งระดับชั้นและห้อง แต่ใช้ร่วมได้เฉพาะหัวคอลัมน์ที่มีคำเทียบอยู่ข้างใน ไม่ยืมหัวคอลัมน์สั้น ๆ
export function suggestMapping(headers, fields) {
    const normalizedHeaders = (headers || []).map(normalizeHeader);
    const aliasesByField = fields.map(field => field.aliases.map(normalizeHeader));
    const mapping = Object.fromEntries(fields.map(field => [field.key, '']));
    const used = new Set();

    const exact = (fieldIndex, header) => aliasesByField[fieldIndex].includes(header);
    const contains = (fieldIndex, header) => aliasesByField[fieldIndex]
        .some(alias => alias.length >= MIN_PARTIAL_ALIAS && header.includes(alias));
    // หัวคอลัมน์ที่ตรงพอดีกับคำเทียบของช่องอื่นเป็นของช่องนั้น ช่องนี้ห้ามยืมไปจับแบบบางส่วน
    const belongsToOther = (fieldIndex, header) => aliasesByField
        .some((aliases, index) => index !== fieldIndex && aliases.includes(header));
    const containedIn = (fieldIndex, header) => !belongsToOther(fieldIndex, header)
        && aliasesByField[fieldIndex].some(alias => alias.length >= MIN_PARTIAL_ALIAS
            && alias.includes(header)
            && header.length >= alias.length * MIN_REVERSE_RATIO);

    const find = (fieldIndex, matches, unusedOnly) => normalizedHeaders.findIndex((header, column) =>
        header && (!unusedOnly || !used.has(column)) && matches(fieldIndex, header));
    const firstFound = (...columns) => columns.find(column => column >= 0) ?? -1;

    const assign = pick => fields.forEach((field, fieldIndex) => {
        if (mapping[field.key] !== '') return;
        const column = pick(fieldIndex);
        if (column < 0) return;
        mapping[field.key] = String(column);
        used.add(column);
    });

    assign(fieldIndex => find(fieldIndex, exact, true));
    assign(fieldIndex => firstFound(find(fieldIndex, contains, true), find(fieldIndex, containedIn, true)));
    assign(fieldIndex => firstFound(find(fieldIndex, exact, false), find(fieldIndex, contains, false)));

    return mapping;
}

// ไฟล์ของโรงเรียนมักมีหัวรายงานหรือชื่อโรงเรียนอยู่บนสุด จึงลองทุกแถวใน 20 แถวแรก
// แล้วเลือกแถวที่จับคู่ช่องบังคับได้มากที่สุดเป็นแถวหัวคอลัมน์
export function detectHeaderRow(rows, fields) {
    let best = { index: 0, score: -1 };
    (rows || []).slice(0, 20).forEach((row, index) => {
        const mapping = suggestMapping(row || [], fields);
        const matched = Object.values(mapping).filter(value => value !== '').length;
        const requiredMatched = fields.filter(field => field.required && mapping[field.key] !== '').length;
        const nonEmpty = (row || []).filter(value => String(value ?? '').trim()).length;
        const score = requiredMatched * 20 + matched * 5 + Math.min(nonEmpty, 10);
        if (score > best.score) best = { index, score };
    });
    return best.index;
}
