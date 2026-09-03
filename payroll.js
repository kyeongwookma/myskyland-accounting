(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Payroll = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const money = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : 0;
  };

  const nonNegative = (value) => Math.max(0, money(value));
  const ceil10 = (value) => Math.ceil(Number(value || 0) / 10) * 10;
  const floor10 = (value) => Math.floor(Number(value || 0) / 10) * 10;

  function overtimePay(employee, month) {
    const hours = Number(month.overtimeHours || 0);
    const monthlyHours = Number(employee.monthlyHours || 0);
    if (!hours || monthlyHours <= 0) return 0;
    return ceil10(((money(employee.baseSalary) + money(employee.seniorityPay)) / monthlyHours) * 1.5 * hours);
  }

  const hasValue = (value) => value !== null && value !== undefined && value !== "";
  const pickOverride = (value, automatic) => (hasValue(value) ? nonNegative(value) : automatic);

  // 원본 수식: 국민연금 = 결정보험료/2 - 두루누리 지원/2, 건강·요양 = 고지보험료, 고용 = 보험료합계 - 근로자 두루누리 지원
  function insuranceAuto(month) {
    return {
      pension: nonNegative(Math.floor(Number(month.pensionDecided || 0) / 2 - Number(month.pensionSupport || 0) / 2)),
      health: nonNegative(month.healthNotice),
      care: nonNegative(month.careNotice),
      employment: nonNegative(Number(month.employmentTotal || 0) - Number(month.employmentSupport || 0))
    };
  }

  // 붙여넣기 행 검증: 필수 열은 비어 있으면 안 되고, 입력된 선택 열 포함 모두 0 이상 유한 숫자여야 한다(선택 열 미입력은 0).
  function parseBulkNumbers(cells, required, optional) {
    const values = [];
    for (let i = 1; i <= required + optional; i++) {
      const raw = cells[i];
      const empty = raw === undefined || raw === "";
      if (empty && i > required) { values.push(0); continue; }
      const number = Number(raw);
      if (empty || !Number.isFinite(number) || number < 0) return null;
      values.push(number);
    }
    return values;
  }

  // 엑셀 클립보드 TSV: 큰따옴표로 감싼 셀은 탭·줄바꿈을 포함할 수 있고 ""는 따옴표 하나다.
  function parseTsv(text) {
    const rows = [[]]; let cell = "", quoted = false;
    const src = String(text || "").replace(/^﻿/, "");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (quoted) {
        if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += ch;
      } else if (ch === '"' && cell === "") quoted = true;
      else if (ch === "\t") { rows[rows.length - 1].push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; rows[rows.length - 1].push(cell); cell = ""; rows.push([]); }
      else cell += ch;
    }
    rows[rows.length - 1].push(cell);
    return rows.filter((r) => r.some((c) => c.trim() !== ""));
  }

  // 포털 다운로드 엑셀을 통째로 붙였을 때 헤더로 종류와 열을 찾는다. 헤더 비교는 공백·줄바꿈을 모두 지운 값으로 한다.
  // 반환 rows의 values 순서는 PORTAL_KINDS[kind].fields 순서다.
  const PORTAL_KINDS = {
    pension:           { label:"국민연금 산출내역(징수포털)",      fields:["pensionDecided"] },
    healthcare:        { label:"건강·요양 산출내역(징수포털)",     fields:["healthNotice", "careNotice"] },
    employment:        { label:"고용보험 부과내역(토탈서비스)",    fields:["employmentTotal"] },
    employmentSupport: { label:"고용 두루누리 지원금(토탈서비스)", fields:["employmentSupport"] },
    pensionSupport:    { label:"연금 두루누리 지원금(국민연금 EDI)", fields:["pensionSupport"] }
  };
  const SKIP_NAMES = new Set(["", "합계", "계", "총계", "소계", "순번"]);
  function detectPortalHeader(rows) {
    const norm = (c) => String(c || "").replace(/\s+/g, "");
    for (let i = 0; i < Math.min(rows.length, 6); i++) {
      const h = rows[i].map(norm), at = (t) => h.findIndex((c) => c === t), has = (t) => h.some((c) => c.includes(t));
      if (at("가입자명") >= 0 && at("결정보험료") >= 0) return { kind:"pension", name:at("가입자명"), cols:[at("결정보험료")], start:i + 1 };
      if (at("성명") >= 0 && h.filter((c) => c === "고지보험료").length >= 2) {
        const cols = h.map((c, idx) => c === "고지보험료" && idx > at("성명") ? idx : -1).filter((idx) => idx >= 0);
        if (cols.length >= 2) return { kind:"healthcare", name:at("성명"), cols:cols.slice(0, 2), start:i + 1 };
      }
      const group = h.findIndex((c) => c.startsWith("보험료합계")), next = rows[i + 1] ? rows[i + 1].map(norm) : [];
      if (group >= 0 && at("근로자명") >= 0 && next[group] === "근로자실업급여보험료") return { kind:"employment", name:at("근로자명"), cols:[group], start:i + 2 };
      if (at("근로자명") >= 0 && has("지원금(근로자)")) return { kind:"employmentSupport", name:at("근로자명"), cols:[h.findIndex((c) => c.includes("지원금(근로자)"))], start:i + 1 };
      if (at("성명") >= 0 && has("연금보험료") && has("보험료지원금")) return { kind:"pensionSupport", name:at("성명"), cols:[h.findIndex((c) => c.includes("보험료지원금"))], start:i + 1 };
    }
    return null;
  }
  function parsePortalPaste(text) {
    const rows = parseTsv(text), header = detectPortalHeader(rows);
    if (!header) return null;
    const out = [], invalid = [], seen = new Map();
    for (const cells of rows.slice(header.start)) {
      const name = String(cells[header.name] || "").trim();
      if (SKIP_NAMES.has(name) || /^[\d.,-]+$/.test(name)) continue; // 합계행은 이름 칸이 비거나 숫자다
      // 빈 셀은 0(지원금 없음 등), 열이 잘려 셀 자체가 없으면 잘못된 행으로 본다.
      const values = header.cols.map((c) => { if (c >= cells.length) return NaN; const raw = cells[c].replace(/[,\s₩원]/g, ""); return raw === "" ? 0 : Number(raw); });
      seen.set(name, (seen.get(name) || 0) + 1);
      if (values.some((v) => !Number.isFinite(v) || v < 0)) { invalid.push(name); continue; }
      out.push({ name, values });
    }
    const duplicates = [...seen].filter(([, n]) => n > 1).map(([name]) => name);
    return { kind:header.kind, label:PORTAL_KINDS[header.kind].label, fields:PORTAL_KINDS[header.kind].fields, rows:out, invalid, duplicates };
  }

  function lookupIncomeTax(taxablePay, dependents, table) {
    const pay = nonNegative(taxablePay);
    if (!Array.isArray(table) || table.length === 0) return 0;
    let row = table[0];
    for (const candidate of table) {
      if (pay >= candidate[0]) row = candidate;
      else break;
    }
    const people = Math.min(11, Math.max(1, money(dependents) || 1));
    return nonNegative(row[people + 1]);
  }

  function childTaxCredit(children) {
    const count = Math.max(0, money(children));
    if (count === 0) return 0;
    if (count === 1) return 20830;
    return 45830 + Math.max(0, count - 2) * 33330;
  }

  function calculateEmployee(employee, month, taxTable) {
    const overtime = hasValue(month.overtimePayOverride) ? nonNegative(month.overtimePayOverride) : overtimePay(employee, month);
    const earnings = {
      // 시간외 단가는 월 기본급 전액 기준이므로 일할계산 직접수정은 지급액에만 적용한다.
      baseSalary: pickOverride(month.baseSalaryOverride, nonNegative(employee.baseSalary)),
      seniorityPay: nonNegative(employee.seniorityPay),
      positionPay: nonNegative(employee.positionPay),
      overtimePay: overtime,
      activityPay: nonNegative(month.activityPay),
      annualLeavePay: nonNegative(month.annualLeavePay),
      holidayPay: nonNegative(month.holidayPay),
      workSupportPay: nonNegative(employee.workSupportPay) + nonNegative(month.extraAllowance),
      unpaidWages: nonNegative(month.unpaidWages)
    };
    const grossPay = Object.values(earnings).reduce((sum, value) => sum + value, 0);
    const requestedNonTax = nonNegative(employee.nonTaxMeal) + nonNegative(employee.nonTaxVehicle) + nonNegative(month.extraNonTax);
    const nonTaxPay = Math.min(grossPay, requestedNonTax);
    const taxablePay = grossPay - nonTaxPay;
    const automaticTax = Math.max(0, lookupIncomeTax(taxablePay, employee.dependents, taxTable) - childTaxCredit(employee.childDependents));
    const incomeTax = hasValue(month.incomeTaxOverride) ? nonNegative(month.incomeTaxOverride) : automaticTax;
    const localIncomeTax = floor10(incomeTax * 0.1);
    const autoInsurance = insuranceAuto(month);
    const deductions = {
      pension: pickOverride(month.pension, autoInsurance.pension),
      health: pickOverride(month.health, autoInsurance.health),
      care: pickOverride(month.care, autoInsurance.care),
      employment: pickOverride(month.employment, autoInsurance.employment),
      incomeTax,
      localIncomeTax,
      yearEndTax: money(month.yearEndTax),
      otherDeduction: money(month.otherDeduction)
    };
    const deductionTotal = floor10(Object.values(deductions).reduce((sum, value) => sum + value, 0));
    const netPay = ceil10(grossPay - deductionTotal);
    return { employeeId: employee.id, earnings, grossPay, requestedNonTax, nonTaxPay, taxablePay, automaticTax, autoInsurance, deductions, deductionTotal, netPay };
  }

  function annualLeavePay(employee, days) {
    const monthlyHours = Number(employee.monthlyHours || 0);
    if (monthlyHours <= 0) return 0;
    return ceil10(((money(employee.baseSalary) + money(employee.seniorityPay)) / monthlyHours) * Number(employee.dailyHours || 8) * Number(days || 0));
  }

  function validateEmployee(employee, month, result) {
    const errors = [];
    const warnings = [];
    if (!String(employee.name || "").trim()) errors.push("성명이 비어 있습니다.");
    if (Number(employee.monthlyHours) <= 0) errors.push("월 기준시간이 0 이하입니다.");
    if (Number(employee.baseSalary) < 0) errors.push("기본급이 음수입니다.");
    if (hasValue(month.baseSalaryOverride) && Number(month.baseSalaryOverride) < 0) errors.push("이번 달 기본급 직접수정이 음수입니다.");
    for (const key of ["pensionDecided", "pensionSupport", "healthNotice", "careNotice", "employmentTotal", "employmentSupport"]) {
      if (Number(month[key]) < 0) errors.push(`보험 원자료(${key})가 음수입니다.`);
    }
    if (result.requestedNonTax > result.grossPay) errors.push("비과세 합계가 지급계보다 큽니다.");
    for (const key of ["pension", "health", "care", "employment"]) {
      if (Number(month[key]) < 0) errors.push(`${key} 공제액이 음수입니다.`);
    }
    if (!month.insuranceChecked && result.grossPay > 0) warnings.push("4대보험 확인 완료 표시가 없습니다.");
    if (result.netPay < 0) errors.push("실지급액이 음수입니다.");
    if (hasValue(month.incomeTaxOverride) && result.automaticTax !== Number(month.incomeTaxOverride)) {
      warnings.push("소득세를 자동 계산값과 다르게 직접 지정했습니다.");
    }
    for (const key of ["pension", "health", "care", "employment"]) {
      // 구버전 마감 스냅샷의 result에는 autoInsurance가 없다.
      if (hasValue(month[key]) && result.autoInsurance && result.autoInsurance[key] > 0 && Number(month[key]) !== result.autoInsurance[key]) {
        warnings.push(`${key} 공제액을 원자료 자동 계산값과 다르게 직접 지정했습니다.`);
      }
    }
    return { errors, warnings };
  }

  return { money, nonNegative, ceil10, floor10, hasValue, insuranceAuto, parseBulkNumbers, parseTsv, parsePortalPaste, PORTAL_KINDS, overtimePay, lookupIncomeTax, childTaxCredit, calculateEmployee, annualLeavePay, validateEmployee };
});
