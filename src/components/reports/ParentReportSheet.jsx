import SchoolReportHeader from '../SchoolReportHeader';
import SignatureRow from './SignatureRow';
import { HOMEROOM_ROLE } from '../../lib/reportSigners';
import { toThaiDigits } from '../../lib/parentReport';

// แผ่นรายงานผลการพัฒนาความสามารถสำหรับผู้ปกครอง ขนาด A4
// หน้าแรก: ผลรายด้านพร้อมคำบรรยายของครูประจำชั้น กิจกรรม และช่องลงชื่อรับทราบของผู้ปกครอง
// หน้าแนบ (เลือกได้): ข้อความพฤติกรรมราย LO จากครูผู้สอนแต่ละวิชา

const fullName = student => `${student?.prefix || ''}${student?.first_name || ''} ${student?.last_name || ''}`.trim();

function CheckBox({ checked, label }) {
    return (
        <span className="mr-6 inline-flex items-center gap-1.5">
            <span className="inline-flex h-4 w-4 items-center justify-center border border-black text-[11pt] leading-none">{checked ? '✓' : ''}</span>{label}
        </span>
    );
}

export default function ParentReportSheet({ school, report, academicYear, semester, includeEvidence = false, isLast = true }) {
    const { student, rows, activities } = report;
    const termLabel = `ภาคเรียนที่ ${toThaiDigits(semester)} ปีการศึกษา ${toThaiDigits(academicYear)}`;
    const homeroomName = report.homeroomTeachers.join(', ');

    return (
        <div className={isLast ? '' : 'break-after-page'}>
            <article className="mx-auto mb-8 flex min-h-[297mm] max-w-[210mm] flex-col bg-white p-10 font-sarabun-new text-[15pt] leading-[1.35] text-black shadow-2xl print:mb-0 print:min-h-0 print:p-0 print:shadow-none sm:p-12">
                <SchoolReportHeader school={school} title="รายงานผลการพัฒนาความสามารถของผู้เรียน" subtitle={termLabel} compact />

                {!report.allPublished && (
                    <p className="mt-3 border-2 border-dashed border-black px-3 py-1 text-center text-[13pt] font-bold">ฉบับร่าง · ครูประจำชั้นยังไม่ได้ส่งผลบางด้าน</p>
                )}

                <dl className="mt-4 grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1">
                    <dt className="font-bold">ชื่อ-สกุล</dt><dd>{fullName(student) || '-'}</dd>
                    <dt className="font-bold">เลขประจำตัว</dt><dd>{toThaiDigits(student?.student_code || '-')}</dd>
                    <dt className="font-bold">ชั้น/ห้อง</dt><dd>{toThaiDigits(report.room || report.grade || '-')}</dd>
                    <dt className="font-bold">ครูประจำชั้น</dt><dd className="col-span-3">{homeroomName || '-'}</dd>
                </dl>

                <table className="mt-4 w-full border-collapse text-[14pt] leading-[1.35]">
                    <thead>
                        <tr>
                            <th className="w-10 border border-black px-2 py-1.5">ที่</th>
                            <th className="w-[26%] border border-black px-2 py-1.5">ด้านความสามารถ</th>
                            {report.hasExpected && <th className="w-[12%] border border-black px-2 py-1.5">ระดับที่คาดหวัง</th>}
                            <th className="w-[12%] border border-black px-2 py-1.5">ระดับที่ได้</th>
                            <th className="border border-black px-2 py-1.5">คำบรรยายจากครูประจำชั้น</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={report.hasExpected ? 5 : 4} className="border border-black px-3 py-6 text-center">ยังไม่มีผลการประเมินในภาคเรียนนี้</td></tr>
                        ) : rows.map((row, index) => (
                            <tr key={row.area} className="break-inside-avoid align-top">
                                <td className="border border-black px-2 py-1.5 text-center">{toThaiDigits(index + 1)}</td>
                                <td className="border border-black px-2 py-1.5">{row.area.replace(/^ความสามารถด้าน/, 'ด้าน')}</td>
                                {report.hasExpected && <td className="border border-black px-2 py-1.5 text-center">{row.expected || '-'}</td>}
                                <td className="border border-black px-2 py-1.5 text-center font-bold">{row.level || '-'}</td>
                                <td className="border border-black px-2 py-1.5 text-justify">{row.summary || '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <table className="mt-3 w-full border-collapse text-[14pt]">
                    <tbody>
                        <tr><td className="w-1/2 border border-black px-2 py-1.5 font-bold">กิจกรรมพัฒนาผู้เรียน</td><td className="border border-black px-2 py-1.5"><CheckBox checked={activities?.activity_status === 'ผ่าน'} label="ผ่าน" /><CheckBox checked={activities?.activity_status === 'ไม่ผ่าน'} label="ไม่ผ่าน" /></td></tr>
                        <tr><td className="border border-black px-2 py-1.5 font-bold">คุณลักษณะอันพึงประสงค์</td><td className="border border-black px-2 py-1.5"><CheckBox checked={activities?.character_status === 'ผ่าน'} label="ผ่าน" /><CheckBox checked={activities?.character_status === 'ไม่ผ่าน'} label="ไม่ผ่าน" /></td></tr>
                    </tbody>
                </table>
                <SignatureRow className="mt-auto pt-10" school={school} teacherName={homeroomName} teacherRole={HOMEROOM_ROLE} size="small" />
                <section className="mt-6 border-t-2 border-black pt-3 text-[14pt]" aria-label="ส่วนของผู้ปกครอง">
                    <p className="font-bold">ส่วนของผู้ปกครอง</p>
                    <p className="mt-1">ข้าพเจ้าได้รับทราบผลการพัฒนาความสามารถของ {fullName(student) || 'นักเรียน'} แล้ว</p>
                    <p className="mt-1">ความคิดเห็นเพิ่มเติม ...........................................................................................................................</p>
                    <div className="mt-4 flex flex-wrap justify-between gap-4">
                        <p>ลงชื่อ .................................................. ผู้ปกครอง</p>
                        <p>วันที่ ........ เดือน .............................. พ.ศ. ..............</p>
                    </div>
                </section>
            </article>

            {includeEvidence && report.evidence.length > 0 && (
                <article className="break-before-page mx-auto mb-8 max-w-[210mm] bg-white p-10 font-sarabun-new text-[14pt] leading-[1.35] text-black shadow-2xl print:mb-0 print:p-0 print:shadow-none sm:p-12">
                    <h2 className="text-[17pt] font-bold">ข้อความพฤติกรรมจากครูผู้สอนรายวิชา</h2>
                    <p>{fullName(student)} · {toThaiDigits(report.room)} · {termLabel}</p>
                    <table className="mt-3 w-full border-collapse">
                        <thead><tr><th className="w-[22%] border border-black px-2 py-1.5">รายวิชา</th><th className="w-[20%] border border-black px-2 py-1.5">ด้าน / LO</th><th className="border border-black px-2 py-1.5">ข้อความพฤติกรรม</th></tr></thead>
                        <tbody>
                            {report.evidence.map((item, index) => (
                                <tr key={`${item.area}-${item.subject}-${item.loCode}-${index}`} className="break-inside-avoid align-top">
                                    <td className="border border-black px-2 py-1.5">{item.subject}</td>
                                    <td className="border border-black px-2 py-1.5">{item.area.replace(/^ความสามารถด้าน/, '')}<br />{item.loCode}</td>
                                    <td className="border border-black px-2 py-1.5 text-justify">{item.text}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </article>
            )}
        </div>
    );
}
