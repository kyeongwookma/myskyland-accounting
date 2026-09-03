"use strict";

const assert = require("node:assert/strict");
const Payroll = require("../payroll.js");
const taxTable = require("../data/tax-table-2026.js");

const record = (overrides = {}) => ({ overtimeHours:0, overtimePayOverride:null, activityPay:0, annualLeavePay:0, holidayPay:0, extraAllowance:0, unpaidWages:0, extraNonTax:0, pension:0, health:0, care:0, employment:0, incomeTaxOverride:null, yearEndTax:0, otherDeduction:0, insuranceChecked:true, ...overrides });
const employee = (overrides = {}) => ({ id:"test", name:"테스트", dailyHours:8, monthlyHours:209, baseSalary:0, seniorityPay:0, positionPay:0, workSupportPay:0, nonTaxMeal:0, nonTaxVehicle:0, dependents:1, ...overrides });

assert.equal(Payroll.ceil10(144360.1), 144370, "10원 단위 올림");
assert.equal(Payroll.floor10(90138), 90130, "10원 미만 버림");

const july = [
  [employee({id:"e1",baseSalary:2160000,seniorityPay:75000,positionPay:200000,workSupportPay:40000,nonTaxMeal:200000}),record({overtimeHours:9,pension:112430,health:86280,care:11330,employment:21600}),{overtime:144370,gross:2619370,tax:32700,deduction:267610,net:2351760}],
  [employee({id:"e2",baseSalary:2160000,seniorityPay:75000,workSupportPay:40000,nonTaxMeal:200000,nonTaxVehicle:200000}),record({overtimeHours:6,pension:94190,health:72300,care:9500,employment:18100}),{overtime:96250,gross:2371250,tax:18630,deduction:214580,net:2156670}],
  [employee({id:"e3",dailyHours:4,monthlyHours:105,baseSalary:1139000,nonTaxMeal:200000}),record({health:40750,care:5350,employment:8660}),{overtime:0,gross:1139000,tax:0,deduction:54760,net:1084240}],
  [employee({id:"e4",dailyHours:5,monthlyHours:131,baseSalary:1421350,nonTaxMeal:200000}),record({pension:4320,health:35560,care:4670,employment:1780}),{overtime:0,gross:1421350,tax:3270,deduction:49920,net:1371430}],
  [employee({id:"e5",dailyHours:6.5,monthlyHours:170,baseSalary:1800000,workSupportPay:49300,nonTaxMeal:200000}),record({health:65550,care:8610,employment:2988}),{overtime:0,gross:1849300,tax:11810,deduction:90130,net:1759170}],
  [employee({id:"e7",baseSalary:2160000,seniorityPay:20000,nonTaxMeal:200000,nonTaxVehicle:200000}),record({overtimeHours:6,pension:98800,health:74780,care:9820,employment:18720}),{overtime:93880,gross:2273880,tax:16560,deduction:220330,net:2053550}]
];

let sums = {gross:0,deduction:0,net:0};
for (const [person, month, expected] of july) {
  const result = Payroll.calculateEmployee(person, month, taxTable);
  assert.equal(result.earnings.overtimePay, expected.overtime, `${person.id} 시간외수당`);
  assert.equal(result.grossPay, expected.gross, `${person.id} 지급계`);
  assert.equal(result.deductions.incomeTax, expected.tax, `${person.id} 소득세`);
  assert.equal(result.deductionTotal, expected.deduction, `${person.id} 공제계`);
  assert.equal(result.netPay, expected.net, `${person.id} 실지급액`);
  sums.gross += result.grossPay; sums.deduction += result.deductionTotal; sums.net += result.netPay;
}

assert.deepEqual(sums, {gross:11674150,deduction:897330,net:10776820}, "어린이집 지급 6명 합계");
assert.equal(Payroll.annualLeavePay(employee({baseSalary:2160000,seniorityPay:75000}), 2), 171110, "잔여연차 예상수당");
assert.equal(Payroll.lookupIncomeTax(2419370, 1, taxTable), 32700, "간이세액표 조회");
assert.equal(Payroll.childTaxCredit(1), 20830, "8~20세 자녀 1명 세액 차감");
assert.equal(Payroll.childTaxCredit(3), 79160, "8~20세 자녀 3명 세액 차감");
assert.equal(Payroll.calculateEmployee(employee({baseSalary:2619370,nonTaxMeal:200000,childDependents:1}), record(), taxTable).deductions.incomeTax, 11870, "자녀 세액 차감 적용");

// 4대보험 원자료 자동 계산 — 2026년 7월 원본 값
assert.deepEqual(Payroll.insuranceAuto({pensionDecided:92240,pensionSupport:83600,healthNotice:35560,careNotice:4670,employmentTotal:8900,employmentSupport:7120}), {pension:4320,health:35560,care:4670,employment:1780}, "예시교사4 원자료 공제");
assert.deepEqual(Payroll.insuranceAuto({employmentTotal:14940,employmentSupport:11952}), {pension:0,health:0,care:0,employment:2988}, "예시교사5 고용 두루누리");
const rawOnly = Payroll.calculateEmployee(
  employee({id:"e4",dailyHours:5,monthlyHours:131,baseSalary:1421350,nonTaxMeal:200000}),
  record({pension:null,health:null,care:null,employment:null,pensionDecided:92240,pensionSupport:83600,healthNotice:35560,careNotice:4670,employmentTotal:8900,employmentSupport:7120}),
  taxTable
);
assert.equal(rawOnly.deductionTotal, 49920, "원자료만으로 예시교사4 공제계");
assert.equal(rawOnly.netPay, 1371430, "원자료만으로 예시교사4 실지급");
assert.equal(Payroll.calculateEmployee(employee(), record({pension:50000,pensionDecided:92240}), taxTable).deductions.pension, 50000, "최종액 직접입력이 원자료보다 우선");

// 붙여넣기 행 검증 — 필수 열은 빈 값·문자·음수 거부, 선택 열 미입력은 0
assert.deepEqual(Payroll.parseBulkNumbers(["예시교사4","92240","83600"], 1, 1), [92240, 83600], "원자료 필수+선택");
assert.deepEqual(Payroll.parseBulkNumbers(["예시교사4","92240"], 1, 1), [92240, 0], "선택 열 미입력은 0");
assert.equal(Payroll.parseBulkNumbers(["예시교사4",""], 1, 1), null, "빈 필수 셀 거부");
assert.equal(Payroll.parseBulkNumbers(["예시교사4","100","80","10"], 4, 0), null, "필수 열 부족 거부");
assert.equal(Payroll.parseBulkNumbers(["예시교사4","100","abc","10","20"], 4, 0), null, "문자 거부");
assert.equal(Payroll.parseBulkNumbers(["예시교사4","100","-80","10","20"], 4, 0), null, "음수 거부");

// 구버전 마감 스냅샷(autoInsurance 없는 result)에서도 검증이 죽지 않아야 한다
const legacyResult = Payroll.calculateEmployee(employee(), record({pension:100}), taxTable);
delete legacyResult.autoInsurance;
assert.doesNotThrow(() => Payroll.validateEmployee(employee(), record({pension:100}), legacyResult), "v1 스냅샷 검증 호환");

// 중도 입퇴사 일할계산 — 지급 기본급만 바뀌고 시간외 단가는 월 기본급 기준 유지
const prorated = Payroll.calculateEmployee(employee({baseSalary:2160000,seniorityPay:75000}), record({baseSalaryOverride:1000000,overtimeHours:9}), taxTable);
assert.equal(prorated.earnings.baseSalary, 1000000, "월 기본급 직접수정");
assert.equal(prorated.earnings.overtimePay, 144370, "시간외 단가는 직원 기본급 기준");
const negativeOverride = record({baseSalaryOverride:-1000, pensionSupport:-50});
const negativeCheck = Payroll.validateEmployee(employee(), negativeOverride, Payroll.calculateEmployee(employee(), negativeOverride, taxTable));
assert.ok(negativeCheck.errors.some((m)=>m.includes("기본급 직접수정")), "음수 기본급 직접수정 오류");
assert.ok(negativeCheck.errors.some((m)=>m.includes("원자료")), "음수 보험 원자료 오류");

console.log("급여 계산 테스트 통과: 2026년 7월 원본 6명 및 합계 일치");
