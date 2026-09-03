(function () {
  "use strict";

  const STORAGE_KEY = "myskyland-payroll-v1";
  const SCHEMA_VERSION = 3;
  // v2 추가 필드. 보험 4종(pension/health/care/employment)은 null이면 원자료 자동 계산에 위임한다.
  const RECORD_V2_FIELDS = { baseSalaryOverride:null, pensionDecided:0, pensionSupport:0, healthNotice:0, careNotice:0, employmentTotal:0, employmentSupport:0 };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const won = (value) => `${Payroll.money(value).toLocaleString("ko-KR")}원`;
  const numberValue = (value) => value === null || value === undefined ? "" : String(value);
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const employees = [
    { id:"e1", active:true, name:"예시교사1", nickname:"예시1", payer:"childcare", dailyHours:8, monthlyHours:209, baseSalary:2160000, seniorityPay:75000, positionPay:200000, workSupportPay:40000, nonTaxMeal:200000, nonTaxVehicle:0, dependents:1, childDependents:0, birthDate:"" },
    { id:"e2", active:true, name:"예시교사2", nickname:"예시2", payer:"childcare", dailyHours:8, monthlyHours:209, baseSalary:2160000, seniorityPay:75000, positionPay:0, workSupportPay:40000, nonTaxMeal:200000, nonTaxVehicle:200000, dependents:1, childDependents:0, birthDate:"" },
    { id:"e3", active:true, name:"예시교사3", nickname:"예시3", payer:"childcare", dailyHours:4, monthlyHours:105, baseSalary:1139000, seniorityPay:0, positionPay:0, workSupportPay:0, nonTaxMeal:200000, nonTaxVehicle:0, dependents:1, childDependents:0, birthDate:"" },
    { id:"e4", active:true, name:"예시교사4", nickname:"예시4", payer:"childcare", dailyHours:5, monthlyHours:131, baseSalary:1421350, seniorityPay:0, positionPay:0, workSupportPay:0, nonTaxMeal:200000, nonTaxVehicle:0, dependents:1, childDependents:0, birthDate:"" },
    { id:"e5", active:true, name:"예시교사5", nickname:"예시5", payer:"childcare", dailyHours:6.5, monthlyHours:170, baseSalary:1800000, seniorityPay:0, positionPay:0, workSupportPay:49300, nonTaxMeal:200000, nonTaxVehicle:0, dependents:1, childDependents:0, birthDate:"" },
    { id:"e6", active:true, name:"예시교사6", nickname:"예시6", payer:"cooperative", dailyHours:1, monthlyHours:26, baseSalary:500000, seniorityPay:0, positionPay:0, workSupportPay:0, nonTaxMeal:0, nonTaxVehicle:0, dependents:1, childDependents:0, birthDate:"" },
    { id:"e7", active:true, name:"예시교사7", nickname:"예시7", payer:"childcare", dailyHours:8, monthlyHours:209, baseSalary:2160000, seniorityPay:20000, positionPay:0, workSupportPay:0, nonTaxMeal:200000, nonTaxVehicle:200000, dependents:1, childDependents:0, birthDate:"" }
  ];

  const defaultRecord = (overrides = {}) => ({ overtimeHours:0, overtimeDetails:{}, overtimePayOverride:null, activityPay:0, annualLeavePay:0, holidayPay:0, extraAllowance:0, unpaidWages:0, extraNonTax:0, cooperativePay:0, pension:null, health:null, care:null, employment:null, incomeTaxOverride:null, yearEndTax:0, otherDeduction:0, insuranceChecked:false, memo:"-", ...RECORD_V2_FIELDS, ...overrides });
  const records = {
    e1:defaultRecord({overtimeHours:9,cooperativePay:620000,pension:112430,health:86280,care:11330,employment:21600,insuranceChecked:true}),
    e2:defaultRecord({overtimeHours:6,pension:94190,health:72300,care:9500,employment:18100,insuranceChecked:true}),
    e3:defaultRecord({pension:0,health:40750,care:5350,employment:8660,insuranceChecked:true}),
    e4:defaultRecord({pension:4320,health:35560,care:4670,employment:1780,insuranceChecked:true}),
    e5:defaultRecord({pension:0,health:65550,care:8610,employment:2988,insuranceChecked:true}),
    e6:defaultRecord({insuranceChecked:true}),
    e7:defaultRecord({overtimeHours:6,pension:98800,health:74780,care:9820,employment:18720,insuranceChecked:true})
  };

  const DEFAULT_STATE = {
    schemaVersion:SCHEMA_VERSION,
    settings:{ organizationName:"하늘땅", facilityName:"하늘땅 어린이집", currentMonth:"2026-07", taxTableVersion:"2026-02-27" },
    employees,
    months:{ "2026-07":{ payDate:"2026-07-25", records, importHistory:[], managerReviewed:false, directorReviewed:false, retirementUpdated:false, closedAt:null, closedSnapshot:null } },
    leaveYears:{ "2026":{
      allocations:{ e1:{granted:16,adjustment:0}, e2:{granted:16,adjustment:0}, e3:{granted:17,adjustment:0}, e4:{granted:15,adjustment:0}, e5:{granted:15,adjustment:0}, e6:{granted:9,adjustment:0}, e7:{granted:9,adjustment:0} },
      events:[
        {id:"l1",employeeId:"e1",date:"2026-01-01",days:2.5,note:"엑셀 이관 누적 사용"},
        {id:"l2",employeeId:"e2",date:"2026-01-01",days:2.5,note:"엑셀 이관 누적 사용"},
        {id:"l3",employeeId:"e3",date:"2026-01-01",days:4,note:"엑셀 이관 누적 사용"},
        {id:"l4",employeeId:"e4",date:"2026-01-01",days:4,note:"엑셀 이관 누적 사용"},
        {id:"l5",employeeId:"e5",date:"2026-01-01",days:6,note:"엑셀 이관 누적 사용"}
      ]
    }}
  };

  // 배포 주소(Cloudflare Pages)에서만 공유 서버(/api/state)를 쓴다. 로컬 파일·localhost는 기존처럼 브라우저 저장만.
  const REMOTE = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  let revision = null;
  let saving = Promise.resolve();
  let state = loadState();
  let activeView = "dashboard";
  let selectedLeaveYear = state.settings.currentMonth.slice(0, 4);
  let saveTimer;
  let importBatch = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.schemaVersion >= 1 && saved.schemaVersion <= SCHEMA_VERSION && Array.isArray(saved.employees)) return migrateState(saved);
    } catch (error) { console.warn("저장 데이터 읽기 실패", error); }
    return clone(DEFAULT_STATE);
  }
  function migrateState(data) {
    for(const employee of data.employees) if(employee.childDependents === undefined) employee.childDependents=0;
    if(data.settings.taxTableVersion === "2024") data.settings.taxTableVersion="2026-02-27";
    for(const month of Object.values(data.months||{})) {
      if(month.closedSnapshot === undefined) month.closedSnapshot=null;
      if(!Array.isArray(month.importHistory))month.importHistory=[];
      for(const item of month.closedSnapshot||[]) if(item.employee.childDependents === undefined) item.employee.childDependents=0;
      // v1→v2: 기존 보험 최종액(0 포함)은 명시값으로 그대로 두어 과거 월 결과를 바꾸지 않는다.
      for(const record of Object.values(month.records||{})) {
        for(const [key,value] of Object.entries(RECORD_V2_FIELDS)) if(record[key] === undefined) record[key]=value;
        if(!record.overtimeDetails||typeof record.overtimeDetails!=="object")record.overtimeDetails={};
      }
    }
    data.schemaVersion = SCHEMA_VERSION;
    return data;
  }
  function saveState() {
    clearTimeout(saveTimer);
    $("#save-status").textContent = "저장 중…";
    saveTimer = setTimeout(() => {
      const body = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY, body);
      if (!REMOTE) { $("#save-status").textContent = "이 브라우저에 저장됨"; return; }
      saving = saving.then(() => pushRemote(body));
    }, 180);
  }
  async function pushRemote(body) {
    try {
      const response = await fetch("/api/state", { method:"PUT", headers:{ "content-type":"application/json", "if-match":revision || "" }, body });
      if (response.ok) { revision = (await response.json()).revision; $("#save-status").textContent = "공유 서버에 저장됨"; return; }
      if (response.status === 409) { $("#save-status").textContent = "저장 안 됨: 다른 담당자가 먼저 저장함"; alert("다른 담당자가 먼저 저장했습니다. 이 화면의 변경은 서버에 저장되지 않았습니다.\n필요하면 JSON 백업을 받은 뒤 새로고침해 최신 자료를 불러오세요."); return; }
      $("#save-status").textContent = `서버 저장 실패 (${response.status})`;
    } catch (error) { $("#save-status").textContent = "서버 저장 실패: 네트워크"; }
  }
  async function loadRemote() {
    if (!REMOTE) return;
    try {
      const response = await fetch("/api/state", { cache:"no-store" });
      if (response.status === 404) { $("#save-status").textContent = "공유 서버 비어 있음 (첫 저장 시 올라감)"; return; }
      if (response.status === 401) { $("#save-status").textContent = "접속 제한(Access)이 아직 안 켜짐: 저장 불가"; alert("Cloudflare Access가 아직 켜져 있지 않아 공유 서버가 잠겨 있습니다. Access를 켜고 담당자 이메일로 로그인한 뒤 다시 열어 주세요."); return; }
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json();
      revision = body.revision;
      state = migrateState(body.state);
      selectedLeaveYear = state.settings.currentMonth.slice(0, 4);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $("#save-status").textContent = `공유 서버 자료 (${body.savedBy || ""} ${new Date(body.savedAt).toLocaleString("ko-KR")})`;
    } catch (error) {
      $("#save-status").textContent = "공유 서버 연결 실패: 이 브라우저 사본을 보여 줌";
      alert("공유 서버에서 자료를 못 받았습니다. 지금 보이는 것은 이 브라우저의 사본이며 저장은 거부될 수 있습니다.");
    }
  }
  function currentMonth() { return state.months[state.settings.currentMonth]; }
  function activeEmployees() { return state.employees.filter((employee) => employee.active); }
  function ensureRecords() {
    const month = currentMonth();
    for (const employee of state.employees) if (!month.records[employee.id]) month.records[employee.id] = defaultRecord();
  }
  function resultFor(employee) {
    const frozen = currentMonth().closedAt && currentMonth().closedSnapshot?.find((item) => item.employee.id === employee.id);
    return frozen ? frozen.result : Payroll.calculateEmployee(employee, currentMonth().records[employee.id] || defaultRecord(), TAX_TABLE_2026);
  }
  function allResults() {
    if (currentMonth().closedAt && Array.isArray(currentMonth().closedSnapshot)) return currentMonth().closedSnapshot;
    return activeEmployees().map((employee) => ({ employee, record:currentMonth().records[employee.id], result:resultFor(employee) }));
  }
  function totals(items = allResults()) { return items.reduce((sum, item) => ({ gross:sum.gross + item.result.grossPay, deduction:sum.deduction + item.result.deductionTotal, net:sum.net + item.result.netPay }), {gross:0,deduction:0,net:0}); }
  function payerName(payer) { return payer === "cooperative" ? "사협" : "어린이집"; }
  function leaveData(year = selectedLeaveYear) {
    if (!state.leaveYears[year]) state.leaveYears[year] = { allocations:{}, events:[] };
    return state.leaveYears[year];
  }
  function leaveBalance(employeeId, year = selectedLeaveYear) {
    const data = leaveData(year);
    const allocation = data.allocations[employeeId] || {granted:0,adjustment:0};
    const used = data.events.filter((event) => event.employeeId === employeeId).reduce((sum, event) => sum + Number(event.days || 0), 0);
    return { granted:Number(allocation.granted || 0), adjustment:Number(allocation.adjustment || 0), used, balance:Number(allocation.granted || 0) + Number(allocation.adjustment || 0) - used };
  }
  function toast(message) { const element=$("#toast"); element.textContent=message; element.classList.add("show"); setTimeout(()=>element.classList.remove("show"),2200); }
  function ensureMonthEditable() {
    const month=currentMonth();
    if(!month.closedAt)return true;
    if(!confirm("마감된 급여월입니다. 마감을 해제하고 수정할까요?"))return false;
    month.closedAt=null; month.closedSnapshot=null; saveState(); return true;
  }

  function switchView(view) {
    activeView = view;
    $$(".tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${view}`));
    render();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function render() {
    ensureRecords();
    renderDashboard();
    if (activeView === "employees") renderEmployees();
    if (activeView === "imports") renderImports();
    if (activeView === "payroll") renderPayroll();
    if (activeView === "deductions") renderDeductions();
    if (activeView === "review") renderReview();
    if (activeView === "outputs") renderOutputs();
    if (activeView === "leave") renderLeave();
  }

  function renderDashboard() {
    const [year, monthNumber] = state.settings.currentMonth.split("-");
    const month = currentMonth();
    const total = totals();
    $("#dashboard-title").textContent = `${year}년 ${Number(monthNumber)}월 급여`;
    $("#payroll-month").value = state.settings.currentMonth;
    $("#pay-date").value = month.payDate;
    $("#organization-name").value = state.settings.organizationName;
    $("#facility-name").value = state.settings.facilityName;
    $("#dash-gross").textContent = won(total.gross);
    $("#dash-deduction").textContent = won(total.deduction);
    $("#dash-net").textContent = won(total.net);
    const validations = buildReviewItems();
    const steps = [
      {view:"imports",label:"받은 자료 자동 가져오기",done:(month.importHistory||[]).length>0},
      {view:"employees",label:"직원·고정급여 확인",done:activeEmployees().length > 0},
      {view:"payroll",label:"시간외·월 수당 입력",done:Object.keys(month.records).length >= activeEmployees().length},
      {view:"deductions",label:"4대보험·공제 확인",done:activeEmployees().every((e)=>month.records[e.id]?.insuranceChecked)},
      {view:"review",label:"오류 확인과 승인",done:validations.errors === 0 && month.managerReviewed && month.directorReviewed},
      {view:"outputs",label:"출력·백업 후 마감",done:Boolean(month.closedAt)}
    ];
    $("#workflow-list").innerHTML = steps.map((step) => `<li><span class="step-icon ${step.done?"done":""}">${step.done?"✓":""}</span><button data-go="${step.view}">${esc(step.label)}</button></li>`).join("");
    const done = steps.filter((step)=>step.done).length;
    $("#progress-label").textContent = `${done} / ${steps.length} 완료`;
    const banner = $("#closed-banner");
    banner.classList.toggle("hidden", !month.closedAt);
    banner.textContent = month.closedAt ? `이 급여월은 ${new Date(month.closedAt).toLocaleString("ko-KR")}에 마감되었습니다.` : "";
  }

  const input = (type, field, value, attrs="") => `<input type="${type}" data-field="${field}" value="${esc(numberValue(value))}" ${attrs}>`;
  function renderEmployees() {
    $("#employees-table tbody").innerHTML = state.employees.map((e) => `<tr data-id="${e.id}">
      <td><input type="checkbox" data-field="active" ${e.active?"checked":""} aria-label="재직"></td><td>${input("text","name",e.name)}</td><td>${input("text","nickname",e.nickname)}</td>
      <td><select data-field="payer"><option value="childcare" ${e.payer==="childcare"?"selected":""}>어린이집</option><option value="cooperative" ${e.payer==="cooperative"?"selected":""}>사협</option></select></td>
      <td>${input("number","dailyHours",e.dailyHours,'min="0" step="0.5"')}</td><td>${input("number","monthlyHours",e.monthlyHours,'min="1" step="1"')}</td><td>${input("number","baseSalary",e.baseSalary,'min="0" step="10"')}</td>
      <td>${input("number","seniorityPay",e.seniorityPay,'min="0" step="10"')}</td><td>${input("number","positionPay",e.positionPay,'min="0" step="10"')}</td><td>${input("number","workSupportPay",e.workSupportPay,'min="0" step="10"')}</td>
      <td>${input("number","nonTaxMeal",e.nonTaxMeal,'min="0" step="10"')}</td><td>${input("number","nonTaxVehicle",e.nonTaxVehicle,'min="0" step="10"')}</td><td>${input("number","dependents",e.dependents,'min="1" max="11" step="1"')}</td><td>${input("number","childDependents",e.childDependents||0,'min="0" step="1"')}</td><td>${input("text","birthDate",e.birthDate,'placeholder="YY-MM-DD"')}</td>
      <td><button class="button ghost remove-employee" type="button">삭제</button></td></tr>`).join("");
  }

  function renderPayroll() {
    const month = currentMonth();
    $("#payroll-month-label").textContent = state.settings.currentMonth;
    const rows = allResults();
    $("#payroll-table tbody").innerHTML = rows.map(({employee:e,record:r,result:x}) => {const detail=Object.entries(r.overtimeDetails||{}).filter(([,hours])=>Number(hours)!==0).map(([label,hours])=>`${label} ${hours}`).join(" · ");return `<tr data-id="${e.id}"><td><strong>${esc(e.name)}</strong><br><span class="muted">${esc(e.nickname)}</span></td>
      <td>${input("number","baseSalaryOverride",r.baseSalaryOverride,`min="0" step="10" placeholder="${Payroll.money(e.baseSalary).toLocaleString("ko-KR")}"`)}</td>
      <td>${input("number","overtimeHours",r.overtimeHours,'min="0" step="0.5"')}${detail?`<div class="muted">${esc(detail)}</div>`:""}</td><td>${input("number","overtimePayOverride",r.overtimePayOverride,'min="0" step="10" placeholder="자동"')}</td>
      <td>${input("number","activityPay",r.activityPay,'min="0" step="10"')}</td><td>${input("number","annualLeavePay",r.annualLeavePay,'min="0" step="10"')}</td><td>${input("number","holidayPay",r.holidayPay,'min="0" step="10"')}</td>
      <td>${input("number","extraAllowance",r.extraAllowance,'min="0" step="10"')}</td><td>${input("number","unpaidWages",r.unpaidWages,'min="0" step="10"')}</td><td>${input("number","extraNonTax",r.extraNonTax,'min="0" step="10"')}</td>
      <td>${input("number","cooperativePay",r.cooperativePay,'min="0" step="10"')}</td><td>${input("text","memo",r.memo)}</td><td class="money calculated-cell">${won(x.grossPay)}</td><td class="money calculated-cell">${won(x.taxablePay)}</td></tr>`;}).join("");
    const total=totals(rows); $("#payroll-table tfoot").innerHTML=`<tr><th colspan="12">합계</th><th class="money">${won(total.gross)}</th><th></th></tr>`;
  }

  function renderDeductions() {
    const rows=allResults();
    const insuranceCell=(r,x,field)=>{const auto=x.autoInsurance?x.autoInsurance[field]:0;return `<td>${input("number",field,r[field],'min="0" step="1" placeholder="자동"')}${auto?`<div class="muted">자동 ${won(auto)}</div>`:""}</td>`;};
    $("#deductions-table tbody").innerHTML=rows.map(({employee:e,record:r,result:x})=>`<tr data-id="${e.id}"><td><strong>${esc(e.name)}</strong></td>
      ${insuranceCell(r,x,"pension")}${insuranceCell(r,x,"health")}${insuranceCell(r,x,"care")}${insuranceCell(r,x,"employment")}
      <td class="money calculated-cell">${won(x.automaticTax)}</td><td>${input("number","incomeTaxOverride",r.incomeTaxOverride,'min="0" step="10" placeholder="자동"')}</td><td class="money calculated-cell">${won(x.deductions.localIncomeTax)}</td>
      <td>${input("number","yearEndTax",r.yearEndTax,'step="10"')}</td><td>${input("number","otherDeduction",r.otherDeduction,'step="10"')}</td><td><input type="checkbox" data-field="insuranceChecked" ${r.insuranceChecked?"checked":""} aria-label="보험 확인"></td>
      <td class="money calculated-cell">${won(x.deductionTotal)}</td><td class="money calculated-cell">${won(x.netPay)}</td></tr>`).join("");
    const total=totals(rows); $("#deductions-table tfoot").innerHTML=`<tr><th colspan="11">합계</th><th class="money">${won(total.deduction)}</th><th class="money">${won(total.net)}</th></tr>`;
  }

  function buildReviewItems() {
    const items=[];
    const names=new Map();
    for(const {employee,record,result} of allResults()){
      names.set(employee.name,(names.get(employee.name)||0)+1);
      const check=Payroll.validateEmployee(employee,record,result);
      check.errors.forEach((message)=>items.push({type:"error",employee:employee.name,message}));
      check.warnings.forEach((message)=>items.push({type:"warning",employee:employee.name,message}));
    }
    for(const [name,count] of names) if(count>1) items.push({type:"error",employee:name,message:"같은 성명의 재직자가 둘 이상입니다. 직원을 구분해 주세요."});
    if(state.settings.taxTableVersion === "2024") items.push({type:"warning",employee:"전체",message:"이 백업은 2024년 간이세액표 설정입니다. 2026년 2월 27일 개정표 기준인지 확인하세요."});
    for(const {employee,result} of allResults()) if(result.taxablePay >= TAX_TABLE_2026[TAX_TABLE_2026.length-1][1]) items.push({type:"error",employee:employee.name,message:"과세급여가 내장 간이세액표 자동 조회 범위를 넘습니다. 소득세 직접수정액을 입력하세요."});
    const errors=items.filter((item)=>item.type==="error").length;
    const warnings=items.filter((item)=>item.type==="warning").length;
    return {items,errors,warnings};
  }
  function renderReview() {
    const review=buildReviewItems(), month=currentMonth(), total=totals();
    $("#error-count").textContent=review.errors; $("#warning-count").textContent=review.warnings; $("#employee-count").textContent=activeEmployees().length; $("#review-net").textContent=won(total.net);
    $("#review-list").innerHTML = review.items.length ? review.items.map((item)=>`<div class="review-item ${item.type}"><strong>${esc(item.employee)}</strong> — ${esc(item.message)}</div>`).join("") : '<div class="review-item ok"><strong>검산 완료</strong> — 발견된 오류나 주의사항이 없습니다.</div>';
    $("#manager-reviewed").checked=month.managerReviewed; $("#director-reviewed").checked=month.directorReviewed; $("#retirement-updated").checked=month.retirementUpdated;
    $("#close-month").textContent=month.closedAt?"마감 해제":"이 급여월 마감";
  }
  function renderOutputs() { $("#payslip-employee").innerHTML=allResults().map(({employee:e})=>`<option value="${e.id}">${esc(e.name)} (${esc(e.nickname)})</option>`).join(""); }

  function renderLeave() {
    const years=new Set([...Object.keys(state.leaveYears),state.settings.currentMonth.slice(0,4)]);
    $("#leave-year").innerHTML=[...years].sort().reverse().map((year)=>`<option ${year===selectedLeaveYear?"selected":""}>${year}</option>`).join("");
    const data=leaveData();
    $("#leave-table tbody").innerHTML=activeEmployees().map((e)=>{ const a=data.allocations[e.id]||{granted:0,adjustment:0}; const b=leaveBalance(e.id); return `<tr data-id="${e.id}"><td><strong>${esc(e.name)}</strong> (${esc(e.nickname)})</td><td>${input("number","granted",a.granted,'step="0.5" min="0"')}</td><td>${input("number","adjustment",a.adjustment,'step="0.5"')}</td><td class="calculated-cell">${b.used}</td><td class="calculated-cell ${b.balance<0?"danger-text":""}">${b.balance}</td><td class="money calculated-cell">${won(Payroll.annualLeavePay(e,b.balance))}</td></tr>`; }).join("");
    const byId=Object.fromEntries(state.employees.map((e)=>[e.id,e]));
    $("#leave-events-table tbody").innerHTML=data.events.slice().sort((a,b)=>b.date.localeCompare(a.date)).map((event)=>`<tr data-event-id="${event.id}"><td>${esc(event.date)}</td><td>${esc(byId[event.employeeId]?.name||"퇴사자")}</td><td>${event.days}</td><td>${esc(event.note)}</td><td><button class="button ghost remove-leave-event">삭제</button></td></tr>`).join("") || '<tr><td colspan="5" class="muted">사용 기록이 없습니다.</td></tr>';
  }

  function importMatches(item) {
    const name=String(item.identity.name||"").trim(),nickname=String(item.identity.nickname||"").trim();
    return state.employees.filter((employee)=>(name&&employee.name===name)||(nickname&&employee.nickname===nickname));
  }
  function defaultImportAssignment(item) {
    const matches=importMatches(item);
    if(matches.length===1)return matches[0].id;
    if(matches.length===0&&item.allowCreate&&item.identity.name)return "__new__";
    return "__skip__";
  }
  function importIdentity(item){return item.identity.name||item.identity.nickname||"이름 없음";}
  function importOptions(item,selected){
    const options=[`<option value="__skip__" ${selected==="__skip__"?"selected":""}>적용하지 않음</option>`];
    if(item.allowCreate&&item.identity.name)options.push(`<option value="__new__" ${selected==="__new__"?"selected":""}>새 직원으로 추가</option>`);
    for(const employee of state.employees)options.push(`<option value="${esc(employee.id)}" ${selected===employee.id?"selected":""}>${esc(employee.name)} (${esc(employee.nickname||"별칭 없음")}) · ${esc(employee.id.slice(0,8))}</option>`);
    return options.join("");
  }
  function renderImportHistory(){
    const history=currentMonth().importHistory||[];
    $("#import-history").innerHTML=`<h3>이 급여월 가져오기 기록</h3>${history.length?`<div class="import-history-list">${history.slice().reverse().map((entry)=>`<div class="import-history-item"><span><strong>${esc(entry.files.join(", "))}</strong><br><span class="muted">${esc(entry.kinds.join(", "))} · ${entry.applied}건 적용${entry.created?` · 직원 ${entry.created}명 추가`:""}</span></span><time class="muted">${new Date(entry.at).toLocaleString("ko-KR")}</time></div>`).join("")}</div>`:'<div class="muted">아직 적용 기록이 없습니다.</div>'}`;
  }
  function renderImports(){
    $("#import-month-label").textContent=`적용 대상 ${state.settings.currentMonth}`;
    renderImportHistory();
    const hasBatch=Boolean(importBatch);
    $("#clear-import").classList.toggle("hidden",!hasBatch);$("#apply-import").classList.toggle("hidden",!hasBatch);$("#import-preview-wrap").classList.toggle("hidden",!hasBatch);
    if(!hasBatch){$("#import-summary").innerHTML="";$("#import-status").className="notice info";$("#import-status").textContent="아직 선택한 파일이 없습니다.";return;}
    const recognized=importBatch.documents.reduce((sum,document)=>sum+document.groups.length,0), selected=importBatch.selected.filter(Boolean).length;
    const mismatches=[...new Set(importBatch.documents.map((document)=>document.month).filter((month)=>month&&month!==state.settings.currentMonth))];
    $("#import-summary").innerHTML=`<div class="card"><span class="muted">선택 파일</span><strong>${importBatch.fileCount}개</strong></div><div class="card"><span class="muted">인식 자료</span><strong>${recognized}종</strong></div><div class="card"><span class="muted">적용 예정</span><strong>${selected}행</strong></div><div class="card"><span class="muted">읽기 실패</span><strong>${importBatch.errors.length}개</strong></div>`;
    const notices=[];
    if(mismatches.length)notices.push(`현재 급여월과 다른 월이 발견됨: ${mismatches.join(", ")}`);
    if(importBatch.errors.length)notices.push(...importBatch.errors.map((error)=>`${error.file}: ${error.message}`));
    if(importBatch.dataIssues.length)notices.push(...importBatch.dataIssues);
    const emptyFiles=importBatch.documents.filter((document)=>!document.groups.length).map((document)=>document.fileName);if(emptyFiles.length)notices.push(`인식할 표가 없는 파일: ${emptyFiles.join(", ")}`);
    $("#import-status").className=`notice ${notices.length?"warning":"success"}`;
    $("#import-status").textContent=notices.length?notices.join(" / "):`${importBatch.fileCount}개 파일을 읽었습니다. 직원 연결과 변경 내용을 확인한 뒤 적용하세요.`;
    $("#import-preview tbody").innerHTML=importBatch.items.map((item,index)=>{
      const assignment=importBatch.assignments[index],matches=importMatches(item),warnings=[...item.warnings];
      if(matches.length>1)warnings.unshift("이름 또는 별칭이 여러 직원과 겹칩니다. 연결 대상을 선택하세요.");
      else if(!matches.length&&!item.allowCreate)warnings.unshift("기존 직원과 연결되지 않아 기본적으로 제외했습니다.");
      const details=PayrollImporters.describeItem(item).map(esc).join(" · ")||"변경값 없음";
      return `<tr data-import-index="${index}"><td><input class="import-selected" type="checkbox" ${importBatch.selected[index]?"checked":""} ${assignment==="__skip__"?"disabled":""} aria-label="적용 선택"></td><td><strong>${esc(item.groupLabel)}</strong><br><span class="muted">${esc(item.source)}</span></td><td>${esc(importIdentity(item))}</td><td><select class="import-preview-select import-assignment">${importOptions(item,assignment)}</select></td><td>${details}</td><td class="${warnings.length?"import-warning":"muted"}">${warnings.length?warnings.map(esc).join(" / "):"자동 연결됨"}</td></tr>`;
    }).join("");
    $("#apply-import").disabled=!importBatch.selected.some(Boolean);
  }
  function flagImportConflicts(items){
    const seen=new Map();
    items.forEach((item)=>{
      const identity=`${item.identity.name}|${item.identity.nickname}`;
      for(const scope of ["employee","record"]){for(const [field,value] of Object.entries(item[scope]||{})){
        const key=`${identity}|${scope}|${field}`;
        if(seen.has(key)&&seen.get(key)!==String(value))item.warnings.push(`${PayrollImporters.FIELD_LABELS[field]||field} 값이 다른 파일과 다릅니다. 아래쪽 자료가 최종 적용됩니다.`);
        seen.set(key,String(value));
      }}
    });
  }
  async function prepareImport(files){
    const list=[...files];if(!list.length)return;
    $("#import-status").className="notice info";$("#import-status").textContent=`${list.length}개 파일을 읽는 중입니다…`;
    const results=await Promise.allSettled(list.map((file)=>PayrollImporters.readFile(file,state.settings.currentMonth)));
    const documents=[],errors=[];
    results.forEach((result,index)=>{if(result.status==="fulfilled")documents.push(result.value);else errors.push({file:list[index].name,message:result.reason?.message||"읽기 실패"});});
    const items=[],dataIssues=[];for(const document of documents)for(const group of document.groups){
      if(group.invalid?.length)dataIssues.push(`${group.label}의 금액 오류: ${group.invalid.join(", ")}`);
      if(group.duplicates?.length)dataIssues.push(`${group.label}의 중복 성명: ${group.duplicates.join(", ")}`);
      for(const item of group.items)items.push({...item,groupLabel:group.label});
    }
    flagImportConflicts(items);
    const assignments=items.map(defaultImportAssignment),selected=assignments.map((assignment,index)=>assignment!=="__skip__"&&!items[index].warnings.some((warning)=>warning.includes("같은 성명")));
    importBatch={documents,errors,dataIssues,items,assignments,selected,fileCount:list.length};renderImports();
  }
  function inferredMonthlyHours(dailyHours){return ({"1":26,"4":105,"5":131,"6.5":170,"8":209})[String(dailyHours)]||209;}
  function newImportedEmployee(item){
    const employee={id:uid(),active:true,name:item.identity.name,nickname:item.identity.nickname||"",payer:"childcare",dailyHours:8,monthlyHours:209,baseSalary:0,seniorityPay:0,positionPay:0,workSupportPay:0,nonTaxMeal:200000,nonTaxVehicle:0,dependents:1,childDependents:0,birthDate:""};
    Object.assign(employee,item.employee||{});if(!item.employee?.monthlyHours)employee.monthlyHours=inferredMonthlyHours(employee.dailyHours);return employee;
  }
  function resetImportedInsurance(kinds){
    const rules={pension:[["pensionDecided",0],["pension",null]],pensionSupport:[["pensionSupport",0],["pension",null]],healthcare:[["healthNotice",0],["careNotice",0],["health",null],["care",null]],employment:[["employmentTotal",0],["employment",null]],employmentSupport:[["employmentSupport",0],["employment",null]]};
    for(const kind of kinds)for(const employee of activeEmployees())for(const [field,value] of rules[kind]||[])currentMonth().records[employee.id][field]=value;
  }
  function applyImportBatch(){
    if(!importBatch||!ensureMonthEditable())return;
    const mismatches=[...new Set(importBatch.documents.map((document)=>document.month).filter((month)=>month&&month!==state.settings.currentMonth))];
    if(mismatches.length&&!confirm(`파일에서 ${mismatches.join(", ")} 자료가 발견됐지만 현재 ${state.settings.currentMonth}에 적용됩니다. 계속할까요?`))return;
    const selectedItems=importBatch.items.filter((_,index)=>importBatch.selected[index]&&importBatch.assignments[index]!=="__skip__");
    const kinds=new Set(selectedItems.map((item)=>item.kind));
    const completeKinds=new Set([...kinds].filter((kind)=>importBatch.items.every((item,index)=>item.kind!==kind||(!importMatches(item).length&&importBatch.assignments[index]==="__skip__")||(importBatch.selected[index]&&importBatch.assignments[index]!=="__skip__"))));
    resetImportedInsurance(completeKinds);
    const createdByIdentity=new Map(),specials=[],leaveItems=[];let applied=0,created=0;
    selectedItems.forEach((item)=>{
      const index=importBatch.items.indexOf(item),assignment=importBatch.assignments[index],identityKey=`${item.identity.name}|${item.identity.nickname}`;
      let employee;
      if(assignment==="__new__"){
        employee=createdByIdentity.get(identityKey);
        if(!employee){employee=newImportedEmployee(item);state.employees.push(employee);currentMonth().records[employee.id]=defaultRecord();createdByIdentity.set(identityKey,employee);created++;}
      }else employee=state.employees.find((candidate)=>candidate.id===assignment);
      if(!employee)return;
      if(item.identity.nickname&&(item.kind==="payroll"||item.kind==="generic"))employee.nickname=item.identity.nickname;
      for(const [field,value] of Object.entries(item.employee||{}))employee[field]=value;
      const record=currentMonth().records[employee.id]||(currentMonth().records[employee.id]=defaultRecord());
      for(const [field,value] of Object.entries(item.record||{})){
        if(field==="allowanceTotal"||field==="nonTaxTotal"){specials.push({employee,record,field,value});continue;}
        record[field]=value;const final=PayrollImporters.PORTAL_RESET[field];if(final)record[final]=null;
      }
      if(item.leave)leaveItems.push({employee,item});applied++;
    });
    for(const {employee,record,field,value} of specials){
      if(field==="allowanceTotal")record.extraAllowance=Math.max(0,Number(value)-Number(employee.workSupportPay||0));
      if(field==="nonTaxTotal")record.extraNonTax=Math.max(0,Number(value)-Number(employee.nonTaxMeal||0)-Number(employee.nonTaxVehicle||0));
    }
    const year=state.settings.currentMonth.slice(0,4),leave=leaveData(year);
    for(const {employee,item} of leaveItems){
      leave.allocations[employee.id]={...(leave.allocations[employee.id]||{adjustment:0}),granted:item.leave.granted};
      leave.events=leave.events.filter((event)=>!(event.employeeId===employee.id&&event.source==="file-import"&&event.importMonth===state.settings.currentMonth));
      const manualUsed=leave.events.filter((event)=>event.employeeId===employee.id).reduce((sum,event)=>sum+Number(event.days||0),0),importedUsed=Math.max(0,item.leave.used-manualUsed);
      if(importedUsed>0)leave.events.push({id:uid(),employeeId:employee.id,date:currentMonth().payDate||`${state.settings.currentMonth}-01`,days:importedUsed,note:"파일에서 가져온 누적 사용",source:"file-import",importMonth:state.settings.currentMonth});
    }
    if(["pension","healthcare","employment"].every((kind)=>completeKinds.has(kind)))for(const employee of activeEmployees())currentMonth().records[employee.id].insuranceChecked=true;
    const entry={at:new Date().toISOString(),files:importBatch.documents.map((document)=>document.fileName),kinds:[...new Set(selectedItems.map((item)=>item.groupLabel))],applied,created};
    currentMonth().importHistory.push(entry);importBatch=null;saveState();render();toast(`${applied}건을 적용했습니다${created?` · 직원 ${created}명 추가`:""}.`);
  }
  function downloadImportTemplate(){
    const header=["성명","별칭","지급주체","재직","1일 근로시간","월 기준시간","기본급","근속수당","직책수당","근로지원금","식대 비과세","차량 비과세","공제대상가족","8~20세 자녀","시간외시간","시간외수당 확정액","활동/들살이수당","연차수당","명절수당","추가 제수당","미지급급여","추가 비과세","사협 별도지급","국민연금 결정보험료","국민연금 지원금","건강보험 고지액","장기요양 고지액","고용보험료 합계","고용보험 지원금","연말정산","기타공제","메모"];
    const rows=state.employees.map((employee)=>[employee.name,employee.nickname,payerName(employee.payer),employee.active?"예":"아니오",employee.dailyHours,employee.monthlyHours,employee.baseSalary,employee.seniorityPay,employee.positionPay,employee.workSupportPay,employee.nonTaxMeal,employee.nonTaxVehicle,employee.dependents,employee.childDependents,...Array(header.length-14).fill("")]);
    download(`${state.settings.currentMonth}_급여입력양식.csv`,makeCsv([header,...rows]));
  }

  function updateEmployee(target) {
    if(!ensureMonthEditable()){render();return;}
    const row=target.closest("tr[data-id]"), employee=state.employees.find((e)=>e.id===row?.dataset.id); if(!employee)return;
    const field=target.dataset.field; employee[field]=target.type==="checkbox"?target.checked:(target.type==="number"?Number(target.value||0):target.value);
    saveState(); render();
  }
  function updateRecord(target) {
    if(!ensureMonthEditable()){render();return;}
    const id=target.closest("tr[data-id]")?.dataset.id, record=currentMonth().records[id]; if(!record)return;
    const field=target.dataset.field;
    record[field]=target.type==="checkbox"?target.checked:(target.type==="number"?(target.value===""?null:Number(target.value)):target.value);
    saveState(); render();
  }

  function createNewMonth() {
    const suggested=nextMonth(state.settings.currentMonth); const value=prompt("새 급여월을 입력하세요 (YYYY-MM)",suggested); if(!/^\d{4}-\d{2}$/.test(value||""))return;
    if(!state.months[value]){
      const newRecords={}; for(const e of state.employees)newRecords[e.id]=defaultRecord();
      state.months[value]={payDate:`${value}-25`,records:newRecords,importHistory:[],managerReviewed:false,directorReviewed:false,retirementUpdated:false,closedAt:null,closedSnapshot:null};
    }
    state.settings.currentMonth=value; selectedLeaveYear=value.slice(0,4); importBatch=null; saveState(); render(); toast(`${value} 급여월을 열었습니다.`);
  }
  function nextMonth(value){const [y,m]=value.split("-").map(Number);return m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,"0")}`;}

  // 원자료 모드는 포털 다운로드 값을 그대로 받아 공제액을 자동 계산한다(최종액 칸은 자동 위임으로 초기화).
  const BULK_MODES = {
    auto:{ columns:"포털에서 내려받은 엑셀 시트를 헤더 줄까지 통째로 복사해 붙이세요(국민연금·건강·고용 산출내역, 두루누리 지원금 2종)." },
    final:{ required:4, optional:0, columns:"성명　국민연금　건강보험　장기요양　고용보험", apply:(r,v)=>{[r.pension,r.health,r.care,r.employment]=v;r.insuranceChecked=true;} },
    pension:{ required:1, optional:1, columns:"성명　결정보험료　두루누리지원(없으면 생략)", apply:(r,v)=>{r.pensionDecided=v[0];r.pensionSupport=v[1];r.pension=null;} },
    healthcare:{ required:2, optional:0, columns:"성명　건강 고지보험료　장기요양 고지보험료", apply:(r,v)=>{r.healthNotice=v[0];r.careNotice=v[1];r.health=null;r.care=null;} },
    employment:{ required:1, optional:1, columns:"성명　보험료합계(산정+재산정+정산)　두루누리지원(없으면 생략)", apply:(r,v)=>{r.employmentTotal=v[0];r.employmentSupport=v[1];r.employment=null;} }
  };
  // 자동 모드: 포털 엑셀을 통째로 붙이면 헤더로 종류를 찾아 해당 원자료 칸만 갱신하고 최종액 칸은 자동 위임으로 초기화한다.
  const PORTAL_RESET = { pensionDecided:["pension"], pensionSupport:["pension"], healthNotice:["health"], careNotice:["care"], employmentTotal:["employment"], employmentSupport:["employment"] };
  function applyPortalPaste(text) {
    const parsed=Payroll.parsePortalPaste(text);
    if(!parsed){$("#bulk-result").textContent="포털 파일 형식을 인식하지 못했습니다. 다운로드한 엑셀 시트를 헤더 줄까지 포함해 통째로 복사했는지 확인하거나, 아래에서 자료 종류를 직접 선택하세요.";return;}
    let applied=0;const missing=[],unseen=[];
    if(parsed.duplicates.length){$("#bulk-result").textContent=`같은 이름이 여러 행에 있습니다: ${parsed.duplicates.join(", ")}. 대상 월만 조회해 다시 붙여 주세요.`;return;}
    const ambiguous=parsed.rows.map((r)=>r.name).filter((name)=>activeEmployees().filter((e)=>e.name===name).length>1);
    if(ambiguous.length){$("#bulk-result").textContent=`재직자 중 동명이인이 있어 자동 적용할 수 없습니다: ${[...new Set(ambiguous)].join(", ")}. 보험·공제 표에 직접 입력해 주세요.`;return;}
    for(const {name,values} of parsed.rows){
      const employee=activeEmployees().find((e)=>e.name===name);
      if(!employee){missing.push(name);continue;}
      const record=currentMonth().records[employee.id];
      parsed.fields.forEach((field,i)=>{if(record[field]!==values[i])record.insuranceChecked=false;record[field]=values[i];for(const final of PORTAL_RESET[field])record[final]=null;});
      applied++;
    }
    for(const e of activeEmployees())if(!parsed.rows.some((r)=>r.name===e.name))unseen.push(e.name);
    $("#bulk-result").textContent=`${parsed.label} 인식, ${applied}명 적용${missing.length?`, 직원 목록에 없는 이름: ${missing.join(", ")}`:""}${parsed.invalid.length?`, 금액이 잘못된 행: ${parsed.invalid.join(", ")}`:""}${unseen.length?`, 파일에 없는 재직자: ${unseen.join(", ")}`:""}`;
    saveState();render();if(applied&&!missing.length&&!parsed.invalid.length&&!unseen.length)setTimeout(()=>$("#bulk-dialog").close(),700);
  }
  function applyBulk() {
    if(!ensureMonthEditable()){render();return;}
    if($("#bulk-mode").value==="auto")return applyPortalPaste($("#bulk-text").value);
    const mode=BULK_MODES[$("#bulk-mode").value];
    const lines=$("#bulk-text").value.trim().split(/\r?\n/).filter(Boolean); let applied=0,missing=[],invalid=[];
    for(const line of lines){
      const cells=line.split("\t").map((v)=>v.trim().replace(/,/g,""));
      const employee=state.employees.find((e)=>e.name===cells[0]);
      if(!employee){if(cells[1]!==undefined&&cells[1]!==""&&Number.isFinite(Number(cells[1])))missing.push(cells[0]);continue;}
      const values=Payroll.parseBulkNumbers(cells,mode.required,mode.optional);
      if(!values){invalid.push(cells[0]);continue;}
      mode.apply(currentMonth().records[employee.id],values);applied++;
    }
    $("#bulk-result").textContent=`${applied}명 적용${missing.length?`, 찾지 못한 성명: ${missing.join(", ")}`:""}${invalid.length?`, 금액이 잘못된 행: ${invalid.join(", ")}`:""}`;
    saveState();render();if(applied&&!missing.length&&!invalid.length)setTimeout(()=>$("#bulk-dialog").close(),500);
  }

  function csvCell(value){const text=String(value??"");return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;}
  function download(name,text,type="text/csv;charset=utf-8") {const blob=new Blob([type.startsWith("text/csv")?"\ufeff":"",text],{type});const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
  function makeCsv(rows){return rows.map((row)=>row.map(csvCell).join(",")).join("\r\n");}
  function sumRows(rows,skip){const total=rows[0].map((_,i)=>rows.reduce((sum,row)=>typeof row[i]==="number"?sum+row[i]:sum,0));skip.forEach((i)=>total[i]="");return total;}
  function monthTitle(){const [year,monthNumber]=state.settings.currentMonth.split("-");return {year,monthNumber};}
  function laborCsv(){
    const {year,monthNumber}=monthTitle();
    const rows=[[`보육시설 종사자 인건비 지급내역(${year}.${monthNumber}월)`],[`시설명 : ${state.settings.facilityName}`],
      ["연번","성명","별칭","기본급","근속수당(경력수당)","직책수당","시간외수당","제수당","지급계","국민연금","건강보험","장기요양","고용보험","기타","소득세","주민세","연말정산","산재보험","공제계","통장입금액","퇴직연금 적립금","확인"]];
    let i=0;const body=[];
    for(const {employee:e,result:x} of allResults().filter((v)=>v.employee.payer==="childcare")){i++;body.push([i,e.name,e.nickname,x.earnings.baseSalary,x.earnings.seniorityPay,x.earnings.positionPay,x.earnings.overtimePay,x.earnings.activityPay+x.earnings.annualLeavePay+x.earnings.holidayPay+x.earnings.workSupportPay+x.earnings.unpaidWages,x.grossPay,x.deductions.pension,x.deductions.health,x.deductions.care,x.deductions.employment,x.deductions.otherDeduction,x.deductions.incomeTax,x.deductions.localIncomeTax,x.deductions.yearEndTax,"시설부담",x.deductionTotal,x.netPay,"",""]);}
    if(!body.length)return makeCsv(rows);
    const total=sumRows(body,[0,1,2,17,20,21]);total[0]="합계";
    return makeCsv([...rows,...body,total]);
  }
  function taxCsv(){
    const header=["구분","성명","기본급","근속수당(경력수당)","원장수당+직책수당","근로지원금","처우개선비","시간외수당","활동수당","명절수당","연차수당","미지급급여","급여및수당","식대/차량유지비","국민연금","건강보험","장기요양","고용보험","소득세","주민세","원천세","연말정산","기타공제","실지급액"];
    const mainRow=(label,e,x)=>[label,e.name,x.earnings.baseSalary,x.earnings.seniorityPay,x.earnings.positionPay,x.earnings.workSupportPay,0,x.earnings.overtimePay,x.earnings.activityPay,x.earnings.holidayPay,x.earnings.annualLeavePay,x.earnings.unpaidWages,x.grossPay,x.nonTaxPay,x.deductions.pension,x.deductions.health,x.deductions.care,x.deductions.employment,x.deductions.incomeTax,x.deductions.localIncomeTax,"",x.deductions.yearEndTax,x.deductions.otherDeduction,x.netPay];
    const subtotal=(rows)=>{const row=Array(header.length).fill("");row[header.length-2]="합계";row[header.length-1]=rows.reduce((sum,r)=>sum+Number(r[header.length-1]||0),0);return row;};
    const items=allResults();
    const childcare=items.filter((v)=>v.employee.payer==="childcare").map(({employee:e,result:x},index)=>mainRow(index===0?"어린이집":"",e,x));
    const coop=[];
    for(const {employee:e,record:r,result:x} of items){
      if(e.payer==="cooperative")coop.push(mainRow("",e,x));
      if(Number(r.cooperativePay)>0){const row=Array(header.length).fill("");row[1]=e.name;row[6]=Number(r.cooperativePay);row[12]=Number(r.cooperativePay);row[header.length-1]=Number(r.cooperativePay);coop.push(row);}
    }
    if(coop.length)coop[0][0]="사협";
    const {year,monthNumber}=monthTitle();
    return makeCsv([[state.settings.facilityName],[`${year}년 ${Number(monthNumber)}월 급여`],header,...childcare,subtotal(childcare),...coop,subtotal(coop)]);
  }

  function payslipHtml(employee) {
    const r=currentMonth().records[employee.id], x=resultFor(employee), year=state.settings.currentMonth.slice(0,4), leave=leaveBalance(employee.id,year);
    const earningLabels={baseSalary:"기본급",seniorityPay:"근속수당",positionPay:"직책수당",overtimePay:`시간외수당 (${r.overtimeHours||0}시간)`,activityPay:"활동/들살이수당",annualLeavePay:"연차수당",holidayPay:"명절수당",workSupportPay:"근로지원금·제수당",unpaidWages:"미지급급여"};
    const deductionLabels={pension:"국민연금",health:"건강보험",care:"장기요양",employment:"고용보험",incomeTax:"소득세",localIncomeTax:"지방소득세",yearEndTax:"연말정산",otherDeduction:"기타공제"};
    const rows=Math.max(Object.keys(x.earnings).length,Object.keys(x.deductions).length); let body="";const es=Object.entries(x.earnings),ds=Object.entries(x.deductions);
    for(let i=0;i<rows;i++){const e=es[i],d=ds[i];body+=`<tr><td>${e?esc(earningLabels[e[0]]):""}</td><td class="money">${e?won(e[1]):""}</td><td>${d?esc(deductionLabels[d[0]]):""}</td><td class="money">${d?won(d[1]):""}</td></tr>`;}
    return `<article class="payslip"><h1 class="payslip-title">급여 명세서</h1><div class="payslip-meta"><span><strong>급여일</strong> ${esc(currentMonth().payDate)}</span><span><strong>성명</strong> ${esc(employee.name)} (${esc(employee.nickname)})${employee.birthDate?` · ${esc(employee.birthDate)}`:""}</span><span><strong>1일 근로시간</strong> ${employee.dailyHours}시간</span><span><strong>월 기준시간</strong> ${employee.monthlyHours}시간</span></div><table><thead><tr><th>지급 항목</th><th>금액</th><th>공제 항목</th><th>금액</th></tr></thead><tbody>${body}<tr><th>지급계</th><th class="money">${won(x.grossPay)}</th><th>공제계</th><th class="money">${won(x.deductionTotal)}</th></tr><tr class="net-row"><th colspan="2">실 지급액</th><td colspan="2" class="money">${won(x.netPay)}</td></tr></tbody></table><p class="payslip-note"><strong>비고</strong> ${esc(r.memo||"-")}<br><strong>${year}년 잔여연차</strong> ${leave.balance}일</p><div class="payslip-footer"><p>귀하의 노고에 감사드립니다.</p><strong>${esc(state.settings.facilityName)}</strong></div></article>`;
  }
  function printPayslips(ids){const people=Object.fromEntries(allResults().map(({employee})=>[employee.id,employee]));$("#print-root").innerHTML=ids.map((id)=>payslipHtml(people[id])).join("");window.print();}

  function bindEvents() {
    $$(".tabs button").forEach((button)=>button.addEventListener("click",()=>switchView(button.dataset.view)));
    document.addEventListener("click",(event)=>{const go=event.target.closest("[data-go]");if(go)switchView(go.dataset.go);});
    $("#help-button").addEventListener("click",()=>$("#help-dialog").showModal());
    $("#new-month").addEventListener("click",createNewMonth);
    $("#import-files").addEventListener("change",(event)=>{prepareImport(event.target.files);event.target.value="";});
    const dropZone=$("#import-drop-zone");
    for(const type of ["dragenter","dragover"])dropZone.addEventListener(type,(event)=>{event.preventDefault();dropZone.classList.add("dragover");});
    for(const type of ["dragleave","drop"])dropZone.addEventListener(type,(event)=>{event.preventDefault();dropZone.classList.remove("dragover");});
    dropZone.addEventListener("drop",(event)=>prepareImport(event.dataTransfer.files));
    $("#clear-import").addEventListener("click",()=>{importBatch=null;renderImports();});
    $("#apply-import").addEventListener("click",applyImportBatch);
    $("#download-import-template").addEventListener("click",downloadImportTemplate);
    $("#import-preview").addEventListener("change",(event)=>{
      const index=Number(event.target.closest("tr")?.dataset.importIndex);if(!Number.isInteger(index)||!importBatch)return;
      if(event.target.classList.contains("import-assignment")){importBatch.assignments[index]=event.target.value;importBatch.selected[index]=event.target.value!=="__skip__";renderImports();}
      if(event.target.classList.contains("import-selected")){importBatch.selected[index]=event.target.checked;renderImports();}
    });
    $("#payroll-month").addEventListener("change",(e)=>{if(state.months[e.target.value]){state.settings.currentMonth=e.target.value;selectedLeaveYear=e.target.value.slice(0,4);importBatch=null;saveState();render();}else{e.target.value=state.settings.currentMonth;createNewMonth();}});
    $("#pay-date").addEventListener("change",(e)=>{if(!ensureMonthEditable()){render();return;}currentMonth().payDate=e.target.value;saveState();});
    $("#organization-name").addEventListener("change",(e)=>{state.settings.organizationName=e.target.value;saveState();});
    $("#facility-name").addEventListener("change",(e)=>{state.settings.facilityName=e.target.value;saveState();});
    $("#employees-table").addEventListener("change",(e)=>{if(e.target.dataset.field)updateEmployee(e.target);});
    $("#employees-table").addEventListener("click",(e)=>{if(!e.target.classList.contains("remove-employee"))return;if(!ensureMonthEditable())return;const id=e.target.closest("tr").dataset.id;if(confirm("이 직원을 삭제할까요? 과거 마감 자료는 보존되지만 미마감 자료의 연결은 사라질 수 있습니다.")){state.employees=state.employees.filter((x)=>x.id!==id);saveState();render();}});
    $("#add-employee").addEventListener("click",()=>{if(!ensureMonthEditable())return;const id=uid();state.employees.push({id,active:true,name:"새 직원",nickname:"",payer:"childcare",dailyHours:8,monthlyHours:209,baseSalary:0,seniorityPay:0,positionPay:0,workSupportPay:0,nonTaxMeal:200000,nonTaxVehicle:0,dependents:1,childDependents:0,birthDate:""});currentMonth().records[id]=defaultRecord();saveState();render();});
    for(const table of [$("#payroll-table"),$("#deductions-table")])table.addEventListener("change",(e)=>{if(e.target.dataset.field)updateRecord(e.target);});
    $("#bulk-deductions").addEventListener("click",()=>{$("#bulk-result").textContent="";$("#bulk-dialog").showModal();}); $("#apply-bulk").addEventListener("click",applyBulk);
    $("#bulk-mode").addEventListener("change",()=>{$("#bulk-format").textContent=BULK_MODES[$("#bulk-mode").value].columns;});
    for(const [id,field] of [["manager-reviewed","managerReviewed"],["director-reviewed","directorReviewed"],["retirement-updated","retirementUpdated"]])$("#"+id).addEventListener("change",(e)=>{currentMonth()[field]=e.target.checked;saveState();renderReview();});
    $("#close-month").addEventListener("click",()=>{const month=currentMonth();if(month.closedAt){if(confirm("마감을 해제하고 다시 수정할까요?")){month.closedAt=null;month.closedSnapshot=null;}}else{const review=buildReviewItems();if(review.errors){toast("오류를 먼저 수정해 주세요.");return;}if(!month.managerReviewed||!month.directorReviewed){toast("원장과 재정이사 검토를 확인해 주세요.");return;}month.closedSnapshot=clone(allResults());month.closedAt=new Date().toISOString();}saveState();render();});
    $("#print-one").addEventListener("click",()=>printPayslips([$("#payslip-employee").value])); $("#print-all").addEventListener("click",()=>printPayslips(allResults().map(({employee})=>employee.id)));
    $("#download-labor").addEventListener("click",()=>download(`${state.settings.currentMonth}_인건비지급내역.csv`,laborCsv())); $("#download-tax").addEventListener("click",()=>download(`${state.settings.currentMonth}_세무사급여정산.csv`,taxCsv()));
    $("#export-json").addEventListener("click",()=>download(`${state.settings.currentMonth}_급여연차_백업.json`,JSON.stringify(state,null,2),"application/json;charset=utf-8"));
    $("#import-json").addEventListener("change",async(e)=>{const file=e.target.files[0];if(!file)return;try{const incoming=JSON.parse(await file.text());if(!(incoming.schemaVersion>=1&&incoming.schemaVersion<=SCHEMA_VERSION)||!Array.isArray(incoming.employees)||!incoming.months)throw new Error("지원하지 않는 백업 형식");if(confirm("현재 브라우저 데이터를 백업 파일로 바꿀까요?")){state=migrateState(incoming);selectedLeaveYear=state.settings.currentMonth.slice(0,4);saveState();render();toast("백업을 복원했습니다.");}}catch(error){alert(`복원 실패: ${error.message}`);}e.target.value="";});
    $("#leave-year").addEventListener("change",(e)=>{selectedLeaveYear=e.target.value;renderLeave();});
    $("#leave-table").addEventListener("change",(e)=>{if(!e.target.dataset.field)return;const id=e.target.closest("tr").dataset.id,data=leaveData();if(!data.allocations[id])data.allocations[id]={granted:0,adjustment:0};data.allocations[id][e.target.dataset.field]=Number(e.target.value||0);saveState();renderLeave();});
    $("#add-leave-event").addEventListener("click",()=>{const choices=activeEmployees().map((e,i)=>`${i+1}. ${e.name}`).join("\n");const selected=Number(prompt(`직원 번호를 입력하세요.\n${choices}`));const employee=activeEmployees()[selected-1];if(!employee)return;const date=prompt("사용일 (YYYY-MM-DD)",`${selectedLeaveYear}-01-01`);if(!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return;const days=Number(prompt("사용일수 (반차는 0.5)","1"));if(!(days>0))return;const note=prompt("사유 또는 메모","")||"";leaveData().events.push({id:uid(),employeeId:employee.id,date,days,note});saveState();renderLeave();});
    $("#leave-events-table").addEventListener("click",(e)=>{if(!e.target.classList.contains("remove-leave-event"))return;const id=e.target.closest("tr").dataset.eventId;leaveData().events=leaveData().events.filter((x)=>x.id!==id);saveState();renderLeave();});
  }

  bindEvents();
  render();
  loadRemote().then(() => { if (REMOTE) render(); });
})();
