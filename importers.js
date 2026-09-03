(function (root, factory) {
  const api = factory(typeof require === "function" ? require("./payroll.js") : root.Payroll);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PayrollImporters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Payroll) {
  "use strict";

  const decoder = new TextDecoder("utf-8");
  const normalize = (value) => String(value ?? "").replace(/\s+/g, "").trim();
  const cleanName = (value) => String(value ?? "").trim();
  const number = (value) => {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const cleaned = String(value ?? "").replace(/[,\s₩원]/g, "");
    if (cleaned === "") return 0;
    const result = Number(cleaned);
    return Number.isFinite(result) ? result : null;
  };
  const xmlText = (value) => String(value || "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  const colIndex = (ref) => {
    const letters = String(ref || "").match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "A";
    let out = 0;
    for (const letter of letters) out = out * 26 + letter.charCodeAt(0) - 64;
    return out - 1;
  };
  const tsvCell = (value) => {
    const text = String(value ?? "");
    return /["\t\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const tableToTsv = (rows) => rows.map((row) => row.map(tsvCell).join("\t")).join("\n");

  function parseDelimited(text, delimiter) {
    const source = String(text || "").replace(/^\ufeff/, "");
    const separator = delimiter || ((source.split(/\r?\n/, 1)[0].match(/\t/g) || []).length >= (source.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? "\t" : ",");
    const rows = [[]]; let cell = "", quoted = false;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (char === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += char;
      } else if (char === '"' && cell === "") quoted = true;
      else if (char === separator) { rows.at(-1).push(cell); cell = ""; }
      else if (char === "\n" || char === "\r") {
        if (char === "\r" && source[i + 1] === "\n") i++;
        rows.at(-1).push(cell); cell = ""; rows.push([]);
      } else cell += char;
    }
    rows.at(-1).push(cell);
    return rows.filter((row) => row.some((value) => String(value).trim() !== ""));
  }

  async function unzipEntries(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = bytes.length - 22;
    while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
    if (end < 0) throw new Error("올바른 XLSX ZIP 파일이 아닙니다.");
    const count = view.getUint16(end + 10, true), entries = new Map();
    let offset = view.getUint32(end + 16, true);
    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("XLSX 파일 목록을 읽을 수 없습니다.");
      const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true), name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      const localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength, compressed = bytes.slice(start, start + size);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) {
        try {
          const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          data = new Uint8Array(await new Response(stream).arrayBuffer());
        } catch (_) { throw new Error("이 브라우저는 XLSX 압축 해제를 지원하지 않습니다. 최신 Chrome·Edge·Firefox에서 다시 시도하세요."); }
      } else throw new Error(`지원하지 않는 XLSX 압축 방식입니다(${method}).`);
      entries.set(name.replace(/^\//, ""), data);
      offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  }

  const entryText = (entries, name) => {
    const value = entries.get(name.replace(/^\//, ""));
    return value ? decoder.decode(value) : "";
  };
  function parseSharedStrings(xml) {
    const values = [];
    for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
      values.push(xmlText([...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("")));
    }
    return values;
  }
  function parseSheetXml(xml, shared) {
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const row = [], body = rowMatch[2];
      for (const cellMatch of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cellMatch[1], bodyText = cellMatch[2] || "";
        const ref = attrs.match(/\br="([^"]+)"/)?.[1], type = attrs.match(/\bt="([^"]+)"/)?.[1];
        const raw = bodyText.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
        const inline = [...bodyText.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("");
        let value = raw === undefined ? (inline ? xmlText(inline) : "") : xmlText(raw);
        if (type === "s") value = shared[Number(value)] ?? "";
        else if (type === "inlineStr" || type === "str") value = xmlText(inline || value);
        else if (value !== "" && Number.isFinite(Number(value))) value = Number(value);
        row[colIndex(ref)] = value;
      }
      rows.push(row);
    }
    return rows;
  }
  async function readXlsx(buffer) {
    const entries = await unzipEntries(buffer);
    const workbook = entryText(entries, "xl/workbook.xml"), rels = entryText(entries, "xl/_rels/workbook.xml.rels");
    if (!workbook || !rels) throw new Error("XLSX 통합문서 정보를 찾지 못했습니다.");
    const relationships = {};
    for (const match of rels.matchAll(/<Relationship\b([^>]*?)\/?>(?:<\/Relationship>)?/g)) {
      const id = match[1].match(/\bId="([^"]+)"/)?.[1], target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
      if (id && target) relationships[id] = target;
    }
    const shared = parseSharedStrings(entryText(entries, "xl/sharedStrings.xml")), sheets = [];
    for (const match of workbook.matchAll(/<sheet\b([^>]*?)\/?>(?:<\/sheet>)?/g)) {
      const attrs = match[1], name = xmlText(attrs.match(/\bname="([^"]+)"/)?.[1] || "시트");
      const id = attrs.match(/(?:r:id|id)="([^"]+)"/)?.[1], target = relationships[id];
      if (!target) continue;
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`.replace(/\/[^/]+\/\.\.\//g, "/");
      const xml = entryText(entries, path);
      if (xml) sheets.push({ name, rows:parseSheetXml(xml, shared) });
    }
    if (!sheets.length) throw new Error("읽을 수 있는 XLSX 시트가 없습니다.");
    return sheets;
  }

  const FIELD_LABELS = {
    active:"재직", nickname:"별칭", payer:"지급주체", dailyHours:"1일 근로시간", monthlyHours:"월 기준시간", baseSalary:"기본급",
    seniorityPay:"근속수당", positionPay:"직책수당", workSupportPay:"근로지원금", nonTaxMeal:"식대 비과세", nonTaxVehicle:"차량 비과세",
    dependents:"공제대상가족", childDependents:"8~20세 자녀", overtimeHours:"시간외시간", overtimeDetails:"시간외 세부내역", overtimePayOverride:"시간외수당 확정액",
    activityPay:"활동/들살이수당", annualLeavePay:"연차수당", holidayPay:"명절수당", extraAllowance:"추가 제수당",
    unpaidWages:"미지급급여", extraNonTax:"추가 비과세", cooperativePay:"사협 별도지급", yearEndTax:"연말정산", otherDeduction:"기타공제", memo:"메모",
    pensionDecided:"국민연금 결정보험료", pensionSupport:"국민연금 지원금", healthNotice:"건강보험 고지액", careNotice:"장기요양 고지액",
    employmentTotal:"고용보험료 합계", employmentSupport:"고용보험 지원금", allowanceTotal:"제수당 합계", nonTaxTotal:"비과세 합계"
  };
  const EMPLOYEE_FIELDS = new Set(["active","nickname","payer","dailyHours","monthlyHours","baseSalary","seniorityPay","positionPay","workSupportPay","nonTaxMeal","nonTaxVehicle","dependents","childDependents"]);
  const PORTAL_RESET = { pensionDecided:"pension", pensionSupport:"pension", healthNotice:"health", careNotice:"care", employmentTotal:"employment", employmentSupport:"employment" };

  function rowIdentity(row, nameIndex, nicknameIndex) {
    return { name:cleanName(row[nameIndex]), nickname:nicknameIndex >= 0 ? cleanName(row[nicknameIndex]) : "" };
  }
  function makeItem(source, kind, identity, values, options = {}) {
    return { source, kind, identity, employee:{}, record:{}, leave:null, warnings:[], ...options, ...values };
  }
  function headerMap(row) {
    const map = {};
    row.forEach((value, index) => { const key = normalize(value); if (key && map[key] === undefined) map[key] = index; });
    return map;
  }
  function valueAt(row, map, aliases) {
    for (const alias of aliases) if (map[normalize(alias)] !== undefined) return row[map[normalize(alias)]];
    return undefined;
  }
  function setNumeric(target, field, raw, warnings, required = false) {
    if (raw === undefined || raw === "") { if (required) warnings.push(`${FIELD_LABELS[field]} 값이 없습니다.`); return; }
    const parsed = number(raw);
    if (parsed === null || parsed < 0) warnings.push(`${FIELD_LABELS[field]} 금액이 올바르지 않습니다.`);
    else target[field] = parsed;
  }

  function parsePortalSections(rows, source) {
    const starts = [], detected = new Set();
    for (let start = 0; start < rows.length; start++) {
      const header=rows[start].map(normalize),at=(text)=>header.indexOf(text),has=(text)=>header.some((value)=>value.includes(text));
      let kind=null;
      if(at("가입자명")>=0&&at("결정보험료")>=0)kind="pension";
      else if(at("성명")>=0&&header.filter((value)=>value==="고지보험료").length>=2)kind="healthcare";
      else if(at("근로자명")>=0&&header.some((value)=>value.startsWith("보험료합계")))kind="employment";
      else if(at("근로자명")>=0&&has("지원금(근로자)"))kind="employmentSupport";
      else if(at("성명")>=0&&has("연금보험료")&&has("보험료지원금"))kind="pensionSupport";
      if(!kind||detected.has(kind))continue;
      detected.add(kind);starts.push({start,kind});
    }
    const found = [];
    for(let section=0;section<starts.length;section++){
      const {start}=starts[section], end=starts[section+1]?.start ?? rows.length;
      const parsed=Payroll.parsePortalPaste(tableToTsv(rows.slice(start,end)));
      if(!parsed)continue;
      const items = parsed.rows.map(({name, values}) => {
        const record = {};
        parsed.fields.forEach((field, index) => { record[field] = values[index]; });
        return makeItem(source, parsed.kind, {name, nickname:""}, {record}, { allowCreate:false, warnings:parsed.duplicates.includes(name) ? ["파일에 같은 성명이 여러 번 있습니다."] : [] });
      });
      found.push({ kind:parsed.kind, label:parsed.label, items, invalid:parsed.invalid, duplicates:parsed.duplicates });
    }
    return found;
  }

  function parsePayrollTable(rows, source) {
    const headerIndex = rows.findIndex((row) => {
      const keys = row.map(normalize);
      return keys.includes("교사") && keys.includes("기본급") && keys.some((v) => v.includes("지급계")) && keys.some((v) => v.includes("시간외"));
    });
    if (headerIndex < 0) return null;
    const map = headerMap(rows[headerIndex]), nameIndex = map["교사"], nicknameIndex = map["별칭"] ?? -1, items = [];
    for (const row of rows.slice(headerIndex + 1)) {
      const identity = rowIdentity(row, nameIndex, nicknameIndex);
      if (!identity.name) { if(items.length) break; continue; }
      if (["합계","계","총계"].includes(normalize(identity.name))) break;
      const item = makeItem(source, "payroll", identity, {}, {allowCreate:true});
      setNumeric(item.employee,"dailyHours",valueAt(row,map,["근무시간","1일근로시간"]),item.warnings);
      setNumeric(item.employee,"baseSalary",valueAt(row,map,["기본급"]),item.warnings,true);
      setNumeric(item.employee,"seniorityPay",valueAt(row,map,["근속수당(경력수당)","근속수당","경력수당"]),item.warnings);
      setNumeric(item.employee,"positionPay",valueAt(row,map,["원장+직책급","원장수당+직책수당","직책수당"]),item.warnings);
      setNumeric(item.record,"overtimeHours",valueAt(row,map,["시간외","시간외시간"]),item.warnings);
      setNumeric(item.record,"activityPay",valueAt(row,map,["터살이수당","활동수당","들살이수당"]),item.warnings);
      setNumeric(item.record,"annualLeavePay",valueAt(row,map,["연차수당"]),item.warnings);
      setNumeric(item.record,"holidayPay",valueAt(row,map,["명절수당"]),item.warnings);
      setNumeric(item.record,"allowanceTotal",valueAt(row,map,["제수당"]),item.warnings);
      setNumeric(item.record,"unpaidWages",valueAt(row,map,["미지급급여"]),item.warnings);
      setNumeric(item.record,"nonTaxTotal",valueAt(row,map,["비과세항목","비과세합계"]),item.warnings);
      setNumeric(item.record,"yearEndTax",valueAt(row,map,["연말정산"]),item.warnings);
      setNumeric(item.record,"otherDeduction",valueAt(row,map,["기타공제"]),item.warnings);
      items.push(item);
    }
    return items.length ? {kind:"payroll",label:"통합 급여표",items} : null;
  }

  function parseAllowanceTable(rows, source) {
    const headerIndex = rows.findIndex((row) => row.map(normalize).includes("교사") && row.map(normalize).includes("근로지원금") && row.map(normalize).includes("제수당"));
    if (headerIndex < 0) return null;
    const map = headerMap(rows[headerIndex]), items=[];
    for (const row of rows.slice(headerIndex + 1)) {
      const identity=rowIdentity(row,map["교사"],map["별칭"] ?? -1);
      if(!identity.name || ["합계","계","총계"].includes(normalize(identity.name))) continue;
      const item=makeItem(source,"allowance",identity,{}, {allowCreate:false});
      setNumeric(item.employee,"workSupportPay",valueAt(row,map,["근로지원금"]),item.warnings);
      setNumeric(item.record,"extraAllowance",valueAt(row,map,["4-5시근무","추가제수당"]),item.warnings);
      setNumeric(item.record,"cooperativePay",valueAt(row,map,["처우개선비보전(사협)","사협별도지급"]),item.warnings);
      items.push(item);
    }
    return items.length ? {kind:"allowance",label:"제수당",items} : null;
  }

  function parseOvertimeAndLeave(rows, source) {
    const results=[];
    for(let h=0;h<Math.min(rows.length,12);h++){
      const aliases=rows[h].map(cleanName), totalIndex=rows.findIndex((row,index)=>index>h && index<h+12 && ["총합","총 합"].includes(cleanName(row[0])));
      if(aliases.length<2 || !aliases.some(Boolean) || totalIndex<0) continue;
      const items=[];
      for(let column=1;column<aliases.length;column++){
        if(!aliases[column] || normalize(aliases[column])==="합") continue;
        const value=number(rows[totalIndex][column]); if(value===null) continue;
        const overtimeDetails={};
        for(let rowIndex=h+1;rowIndex<totalIndex;rowIndex++){
          const label=cleanName(rows[rowIndex][0]),hours=number(rows[rowIndex][column]);
          if(label&&hours!==null)overtimeDetails[label]=hours;
        }
        items.push(makeItem(source,"overtime",{name:"",nickname:aliases[column]},{record:{overtimeHours:value,overtimeDetails}}, {allowCreate:false}));
      }
      if(items.length){results.push({kind:"overtime",label:"시간외 합계",items});break;}
    }
    const marker=rows.findIndex((row)=>row.some((value)=>normalize(value)==="연차사용현황"));
    if(marker>=0){
      const aliasRow=rows.slice(marker+1).findIndex((row)=>row.filter((v)=>cleanName(v)).length>=2)+marker+1;
      const totalRow=rows.findIndex((row,index)=>index>aliasRow && normalize(row[0])==="총연차");
      const balanceRow=rows.findIndex((row,index)=>index>aliasRow && normalize(row[0])==="잔여연차");
      if(aliasRow>marker&&totalRow>aliasRow&&balanceRow>totalRow){
        const items=[];
        for(let column=1;column<rows[aliasRow].length;column++){
          const nickname=cleanName(rows[aliasRow][column]),granted=number(rows[totalRow][column]),balance=number(rows[balanceRow][column]);
          if(!nickname||granted===null||balance===null) continue;
          items.push(makeItem(source,"leave",{name:"",nickname},{leave:{granted,used:Math.max(0,granted-balance),balance}}, {allowCreate:false}));
        }
        if(items.length)results.push({kind:"leave",label:"연차 현황",items});
      }
    }
    return results;
  }

  const GENERIC_FIELDS = {
    "별칭":["employee","nickname","text"], "지급주체":["employee","payer","payer"], "재직":["employee","active","boolean"],
    "1일근로시간":["employee","dailyHours"], "월기준시간":["employee","monthlyHours"], "기본급":["employee","baseSalary"],
    "근속수당":["employee","seniorityPay"], "직책수당":["employee","positionPay"], "근로지원금":["employee","workSupportPay"],
    "식대비과세":["employee","nonTaxMeal"], "차량비과세":["employee","nonTaxVehicle"], "공제대상가족":["employee","dependents"], "8~20세자녀":["employee","childDependents"],
    "시간외시간":["record","overtimeHours"], "시간외수당확정액":["record","overtimePayOverride"], "활동/들살이수당":["record","activityPay"],
    "연차수당":["record","annualLeavePay"], "명절수당":["record","holidayPay"], "추가제수당":["record","extraAllowance"], "미지급급여":["record","unpaidWages"],
    "추가비과세":["record","extraNonTax"], "사협별도지급":["record","cooperativePay"], "연말정산":["record","yearEndTax"], "기타공제":["record","otherDeduction"], "메모":["record","memo","text"],
    "국민연금결정보험료":["record","pensionDecided"], "국민연금지원금":["record","pensionSupport"], "건강보험고지액":["record","healthNotice"],
    "장기요양고지액":["record","careNotice"], "고용보험료합계":["record","employmentTotal"], "고용보험지원금":["record","employmentSupport"]
  };
  function parseGenericTable(rows,source){
    const headerIndex=rows.findIndex((row)=>{
      const keys=row.map(normalize), recognized=keys.filter((key)=>GENERIC_FIELDS[key]).length;
      return keys.includes("성명")&&recognized>=2;
    });
    if(headerIndex<0)return null;
    const headers=rows[headerIndex].map(normalize),nameIndex=headers.indexOf("성명"),nicknameIndex=headers.indexOf("별칭"),items=[];
    for(const row of rows.slice(headerIndex+1)){
      const identity=rowIdentity(row,nameIndex,nicknameIndex);if(!identity.name||["합계","계","총계"].includes(normalize(identity.name)))continue;
      const item=makeItem(source,"generic",identity,{}, {allowCreate:true});
      headers.forEach((header,index)=>{
        const spec=GENERIC_FIELDS[header];if(!spec||row[index]===undefined||row[index]==="")return;
        const [scope,field,type]=spec;let value=row[index];
        if(type==="payer")value=normalize(value).includes("사협")?"cooperative":"childcare";
        else if(type==="boolean")value=!/^(0|아니오|퇴사|false)$/i.test(normalize(value));
        else if(type!=="text"){value=number(value);if(value===null||value<0){item.warnings.push(`${FIELD_LABELS[field]} 값이 올바르지 않습니다.`);return;}}
        item[scope][field]=value;
      });
      items.push(item);
    }
    return items.length?{kind:"generic",label:"표준 급여 입력표",items}:null;
  }

  // "2026-08", "202608", "2026년 8월", "26년 08월" 을 YYYY-MM으로. 관리번호처럼 더 긴 숫자열 안의 6자리는 월로 보지 않는다.
  function monthOf(text){
    const value=String(text??"");
    let m=value.match(/(?<!\d)(?:20)?(\d{2})년\s*(0?[1-9]|1[0-2])월?(?!\d)/);
    if(m)return `20${m[1]}-${m[2].padStart(2,"0")}`;
    m=value.match(/(?<!\d)(20\d{2})[-_. ]?(0[1-9]|1[0-2])(?![-_. ]?\d)/); // 2025.04.01 같은 날짜는 월로 보지 않는다
    if(m)return `${m[1]}-${m[2]}`;
    return null;
  }
  const sheetMonth=(sheet)=>monthOf(sheet.name)||monthOf(sheet.rows[0]?.[0]); // 시트명, 없으면 제목 셀만 본다(데이터 셀의 취득일 등은 제외)
  function detectedMonth(fileName,sheets,targetMonth){
    const found=[monthOf(fileName),...sheets.map(sheetMonth)].filter(Boolean);
    if(targetMonth&&found.includes(targetMonth))return targetMonth;
    if(found.length)return found[0];
    for(const {rows} of sheets){
      const first=rows.slice(0,3).flat();
      for(let i=0;i<first.length-3;i++)if(Number(first[i])>=2020&&Number(first[i])<=2100&&Number(first[i+2])>=1&&Number(first[i+2])<=12)return `${first[i]}-${String(first[i+2]).padStart(2,"0")}`;
    }
    return null;
  }
  // targetMonth(앱의 현재 급여월)를 주면 여러 달 시트가 든 파일에서 그 달 시트만 읽는다.
  function analyzeSheets(sheets,fileName="가져온 파일",targetMonth=null){
    const groups=[],sourceBase=String(fileName).replace(/\.(xlsx|csv|tsv)$/i,"");
    const month=detectedMonth(fileName,sheets,targetMonth), compact=month?.replace("-","");
    const names=sheets.map((sheet)=>normalize(sheet.name));
    const exactPayroll=compact&&names.some((name)=>name.includes(compact)&&name.includes("급여"));
    const exactPortal=compact&&names.some((name)=>name.includes(compact)&&name.includes("4대보험"));
    const exactOvertime=compact&&names.some((name)=>name.includes(compact)&&name.includes("시간외"));
    for(const sheet of sheets){
      const source=`${sourceBase} · ${sheet.name}`;
      const sheetName=normalize(sheet.name), dated=sheetMonth(sheet);
      if(dated&&month&&dated!==month)continue;
      const scanPortal=!exactPortal||(sheetName.includes(compact)&&sheetName.includes("4대보험"));
      const scanPayroll=!exactPayroll||(sheetName.includes(compact)&&sheetName.includes("급여"));
      const scanOvertime=!exactOvertime||(sheetName.includes(compact)&&sheetName.includes("시간외"));
      const before=groups.length;
      if(scanPortal)groups.push(...parsePortalSections(sheet.rows,source));
      if(scanPayroll){const payroll=parsePayrollTable(sheet.rows,source);if(payroll)groups.push(payroll);}
      const allowance=parseAllowanceTable(sheet.rows,source);if(allowance)groups.push(allowance);
      if(scanOvertime)groups.push(...parseOvertimeAndLeave(sheet.rows,source));
      if(!exactPayroll&&groups.length===before){const generic=parseGenericTable(sheet.rows,source);if(generic)groups.push(generic);}
    }
    const unique=[],seen=new Set();
    for(const group of groups){
      const key=`${group.kind}|${group.source||group.items[0]?.source}`;
      if(seen.has(key))continue;seen.add(key);unique.push(group);
    }
    return {fileName,month,groups:unique};
  }
  // 포털 CSV는 EUC-KR(CP949)로 내려오는 경우가 있다. UTF-8로 해석되지 않으면 EUC-KR로 읽는다.
  function decodeText(buffer){
    try{return new TextDecoder("utf-8",{fatal:true}).decode(buffer);}
    catch{return new TextDecoder("euc-kr").decode(buffer);}
  }
  async function readFile(file,targetMonth=null){
    const lower=file.name.toLowerCase();let sheets;
    if(lower.endsWith(".xlsx"))sheets=await readXlsx(await file.arrayBuffer());
    else if(lower.endsWith(".csv")||lower.endsWith(".tsv")||lower.endsWith(".txt"))sheets=[{name:"표",rows:parseDelimited(decodeText(await file.arrayBuffer()),lower.endsWith(".tsv")?"\t":undefined)}];
    else throw new Error("XLSX, CSV 또는 TSV 파일만 가져올 수 있습니다.");
    return analyzeSheets(sheets,file.name,targetMonth);
  }
  function describeItem(item){
    const values=[];
    for(const [field,value] of Object.entries(item.employee||{}))values.push(`${FIELD_LABELS[field]||field}: ${value}`);
    for(const [field,value] of Object.entries(item.record||{})){
      const display=field==="overtimeDetails"?Object.entries(value).filter(([,hours])=>Number(hours)!==0).map(([label,hours])=>`${label} ${hours}시간`).join(", ")||"없음":typeof value==="number"?value.toLocaleString("ko-KR"):value;
      values.push(`${FIELD_LABELS[field]||field}: ${display}`);
    }
    if(item.leave)values.push(`연차: ${item.leave.granted}일 부여 / ${item.leave.used}일 사용`);
    return values;
  }

  return { parseDelimited, readXlsx, analyzeSheets, readFile, monthOf, decodeText, describeItem, FIELD_LABELS, EMPLOYEE_FIELDS, PORTAL_RESET };
});
