// ตรวจว่าทุก import แบบ relative ในไฟล์ที่ git ติดตาม ชี้ไปหาไฟล์ที่ git ติดตามด้วย
// build ในเครื่องผ่านได้แม้ลืม commit ไฟล์ใหม่ เพราะไฟล์อยู่ในเครื่อง แต่บน Vercel ไม่มี
// สคริปต์นี้จับกรณีนั้นก่อน push (เคยทำให้ deploy วันที่ 11 ก.ย. 2569 ล้ม)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const tracked = new Set(execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8' }).split('\n').filter(Boolean));
const pattern = /(?:import|export)[^'"]*?from\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
const extensions = ['', '.js', '.jsx', '.css', '/index.js', '/index.jsx'];
const problems = [];

for (const file of tracked) {
    if (!/\.(js|jsx)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(pattern)) {
        const specifier = match[1] || match[2];
        const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
        if (!extensions.some(extension => tracked.has(base + extension))) problems.push(`${file} → ${specifier}`);
    }
}

if (problems.length) {
    console.error('import เหล่านี้ชี้ไปไฟล์ที่ยังไม่ได้ git add:\n' + problems.map(item => `  ${item}`).join('\n'));
    process.exit(1);
}
console.log(`ตรวจ import ใน ${tracked.size} ไฟล์ ทุกไฟล์อยู่ใน git แล้ว`);
