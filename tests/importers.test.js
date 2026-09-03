"use strict";

const assert = require("node:assert/strict");
const Importers = require("../importers.js");

function zipStored(files) {
  const local = [], central = []; let offset = 0;
  for (const [name, contents] of Object.entries(files)) {
    const filename = Buffer.from(name), data = Buffer.from(contents);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename); offset += header.length + filename.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

const workbook = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="202609 급여" sheetId="1" r:id="rId1"/></sheets></workbook>`;
const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`;
const shared = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>교사</t></si><si><t>별칭</t></si><si><t>근무시간</t></si><si><t>기본급</t></si><si><t>시간외</t></si><si><t>지급 계</t></si><si><t>홍길동</t></si><si><t>구름</t></si></sst>`;
const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c><c r="F1" t="s"><v>5</v></c></row><row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2"><v>8</v></c><c r="D2"><v>2200000</v></c><c r="E2"><v>5.5</v></c><c r="F2"><f>SUM(D2:E2)</f><v>2200005.5</v></c></row><row r="3"><c r="C3" t="inlineStr"><is><t>합계</t></is></c></row></sheetData></worksheet>`;
const zip = zipStored({"xl/workbook.xml":workbook,"xl/_rels/workbook.xml.rels":rels,"xl/sharedStrings.xml":shared,"xl/worksheets/sheet1.xml":sheet});

(async () => {
  const sheets = await Importers.readXlsx(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength));
  assert.equal(sheets[0].name, "202609 급여", "XLSX 시트명");
  assert.deepEqual(sheets[0].rows[1].slice(0, 6), ["홍길동", "구름", 8, 2200000, 5.5, 2200005.5], "공유문자열·숫자·수식 캐시 읽기");

  const analyzed = Importers.analyzeSheets(sheets, "통합산출_202609.xlsx");
  assert.equal(analyzed.month, "2026-09", "파일명에서 급여월 인식");
  assert.equal(analyzed.groups.length, 1, "급여표 한 종류 인식");
  assert.equal(analyzed.groups[0].kind, "payroll");
  assert.deepEqual(analyzed.groups[0].items[0].identity, {name:"홍길동",nickname:"구름"}, "직원 식별값");
  assert.equal(analyzed.groups[0].items[0].employee.baseSalary, 2200000);
  assert.equal(analyzed.groups[0].items[0].record.overtimeHours, 5.5);

  const csv = '\ufeff성명,별칭,지급주체,월 기준시간,기본급,시간외시간,메모\r\n"홍,길동",구름,사협,170,"1,800,000",2,"쉼표, 포함"';
  const rows = Importers.parseDelimited(csv);
  assert.equal(rows[1][0], "홍,길동", "CSV 따옴표와 쉼표");
  const generic = Importers.analyzeSheets([{name:"표",rows}], "2026-09_입력.csv").groups[0];
  assert.equal(generic.kind, "generic", "표준 입력표 인식");
  assert.equal(generic.items[0].employee.payer, "cooperative");
  assert.equal(generic.items[0].employee.baseSalary, 1800000);
  assert.equal(generic.items[0].record.memo, "쉼표, 포함");

  const combined = [
    ["국민연금"],["순번","가입자명","결정보험료"],[1,"홍길동",200000],
    ["건강보험"],["순번","성명","고지보험료","고지보험료"],[1,"홍길동",70000,9000],
    ["고용보험"],["근로자명","보험료합계(①+②+③)"],["근로자명","근로자실업급여보험료"],["홍길동",18000],
    ["근로자명","실업급여 지원금(근로자)"],["홍길동",14000],
    ["성명","연금보험료","전월분 보험료지원금"],["홍길동",200000,100000]
  ];
  const portal = Importers.analyzeSheets([{name:"202609-4대보험",rows:combined}], "202609 보험.xlsx");
  assert.deepEqual(portal.groups.map((group) => group.kind), ["pension","healthcare","employment","employmentSupport","pensionSupport"], "한 시트의 보험 5종 구역별 인식");
  assert.equal(portal.groups[1].items[0].record.careNotice, 9000);
  assert.equal(portal.groups[4].items[0].record.pensionSupport, 100000);

  const timeRows=[["2026년 09월 시간외"],["주","구름","햇살","합"],["긴회의",3,2,5],["방모임",2,1,3],["총 합",5,3,8],[],["연차 사용 현황"],["","구름","햇살"],["총연차",15,16],["잔여연차",12,14]];
  const time=Importers.analyzeSheets([{name:"202609 시간외",rows:timeRows}],"202609 시간외.xlsx");
  assert.deepEqual(time.groups.map((group)=>group.kind),["overtime","leave"],"시간외와 연차 동시 인식");
  assert.deepEqual(time.groups[0].items[0].record.overtimeDetails,{"긴회의":3,"방모임":2},"시간외 세부 근거 보존");
  assert.deepEqual(time.groups[1].items[0].leave,{granted:15,used:3,balance:12},"누적 연차 계산");

  const allowanceRows=[["교사","별칭","근로지원금","4-5시 근무","제수당","처우개선비보전(사협)"],["홍길동","구름",40000,10000,50000,620000],["합계","",40000,10000,50000,620000]];
  const allowance=Importers.analyzeSheets([{name:"제수당",rows:allowanceRows}],"수당.xlsx").groups[0];
  assert.equal(allowance.kind,"allowance");assert.equal(allowance.items[0].record.extraAllowance,10000);assert.equal(allowance.items[0].record.cooperativePay,620000);

  const oldSheet={name:"202608 급여",rows:sheets[0].rows},currentSheet={name:"202609 급여",rows:sheets[0].rows};
  const currentOnly=Importers.analyzeSheets([oldSheet,currentSheet],"통합산출_202609.xlsx");
  assert.equal(currentOnly.groups.length,1,"과거 급여월 시트 제외");
  assert.match(currentOnly.groups[0].items[0].source,/202609 급여/);

  // 월 인식: 원장 파일의 "26년 08월" 시트, 파일명 속 관리번호는 월이 아님
  assert.equal(Importers.monthOf("26년 08월"),"2026-08","두 자리 연도 시트명");
  assert.equal(Importers.monthOf(" 2026년 8월 시간외 수당 "),"2026-08","네 자리 연도 제목 셀");
  assert.equal(Importers.monthOf("당월보험료부과내역조회(고용)_20180275407.xlsx"),null,"관리번호는 월이 아님");
  assert.equal(Importers.monthOf("통합산출_202609.xlsx"),"2026-09","파일명 6자리");
  assert.equal(Importers.monthOf("2025.04.01"),null,"취득일 같은 날짜는 월이 아님");
  assert.equal(Importers.monthOf("nhisGungangList_20260903.csv"),null,"8자리 날짜는 월이 아님");
  const overtimeRows=(label)=>[[` 2026년 ${label} 시간외 수당 `],["주","예시1","예시4"],["긴회의",3,0],["총 합",3,0]];
  const multi=Importers.analyzeSheets([{name:"26년 07월",rows:overtimeRows("07월")},{name:"26년 08월",rows:overtimeRows("08월")}],"시간외 정리자료.xlsx","2026-08");
  assert.equal(multi.month,"2026-08","현재 급여월 시트를 선택");
  assert.deepEqual(multi.groups.map((g)=>g.items[0].source),["시간외 정리자료 · 26년 08월"],"다른 달 시트는 제외");
  // 포털 CSV의 EUC-KR 디코딩
  const eucKr=Buffer.from([0xbc,0xba,0xb8,0xed]); // "성명"
  assert.equal(Importers.decodeText(eucKr.buffer.slice(eucKr.byteOffset,eucKr.byteOffset+4)),"성명","EUC-KR 자동 인식");
  assert.equal(Importers.decodeText(new TextEncoder().encode("성명").buffer),"성명","UTF-8 그대로");

  console.log("자료 가져오기 테스트 통과: XLSX/CSV 판독, 급여표·보험 자동 분류, 월 인식, EUC-KR");
})().catch((error) => { console.error(error); process.exitCode = 1; });
