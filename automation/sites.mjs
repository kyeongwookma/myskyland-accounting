// 포털별 절차. 로그인은 항상 담당자가 한다. 나머지 단계는 자동 클릭을 시도하고, 확실하지 않으면 안내문을 띄워 담당자에게 넘긴다.
// 단계 종류
//   goto     : url로 이동
//   login    : 로그인 안내 후 Enter 대기
//   click    : find 후보(메뉴 글자 또는 {css}) 중 화면에 보이는 것이 정확히 하나면 자동 클릭, 아니면 안내 후 Enter 대기
//   download : 안내를 띄우고 다운로드 1건을 기다린다. kind는 importers.js가 인식하는 파일 종류와 같다. find가 있으면 자동 클릭도 시도한다.
// 선택자 보강: 담당자 PC에서 `npx playwright codegen --channel chrome <url>`로 기록한 선택자를 find에 {css:"..."}로 추가한다.

export const KIND_LABELS = {
  pension: "국민연금_산출내역",
  healthcare: "건강요양_산출내역",
  employment: "고용보험_부과내역",
  employmentSupport: "고용_두루누리지원금",
  pensionSupport: "연금_두루누리지원금",
};

export const SITES = {
  jingsu: {
    name: "사회보험 통합징수포털",
    steps: [
      { goto: "https://si4n.nhis.or.kr/" },
      { login: "사업장로그인 → 사업자등록번호 입력 → 공동인증서(또는 간편인증)로 로그인하세요." },
      { click: "보험료 산출내역 조회 메뉴를 여세요.", find: ["보험료 산출내역 조회", "보험료산출내역조회"] },
      { manual: "건강보험을 체크하고 {month} 당월로 검색하세요." },
      { download: "healthcare", text: "개인별 산출내역의 Excel 다운로드를 누르세요.", find: ["Excel 다운로드", "엑셀 다운로드", "엑셀저장"] },
      { manual: "국민연금을 체크하고 {month} 당월로 검색하세요." },
      { download: "pension", text: "개인별 산출내역의 Excel 다운로드를 누르세요.", find: ["Excel 다운로드", "엑셀 다운로드", "엑셀저장"] },
    ],
  },
  total: {
    name: "고용산재보험 토탈서비스",
    steps: [
      { goto: "https://total.comwel.or.kr/" },
      { login: "로그인 → 사업자 로그인으로 들어가세요." },
      { click: "부과고지 보험료 조회 메뉴를 여세요.", find: ["부과고지 보험료 조회", "부과고지보험료조회"] },
      { manual: "관리번호, 부과년도, 부과월({month})을 선택하고 조회하세요. 사업장산정내역의 고용 탭 → 당월보험료 부과내역(간편조회)을 여세요." },
      { download: "employment", text: "엑셀저장을 누르세요. 비적용 체크는 확인만 하면 됩니다.", find: ["엑셀저장", "엑셀 저장", "Excel 다운로드"] },
      { manual: "고용 탭 옆의 사회보험료지원금 조회(두루누리)를 열고 {month}로 조회하세요." },
      { download: "employmentSupport", text: "엑셀저장을 누르세요.", find: ["엑셀저장", "엑셀 저장", "Excel 다운로드"] },
    ],
  },
  edi: {
    name: "국민연금 EDI",
    steps: [
      { goto: "https://edi.nps.or.kr/" },
      { login: "사업장 관리번호 입력 → 로그인 → 전체 동의 → 공동인증서로 로그인하세요." },
      { click: "연금보험료 결정내역 메뉴를 여세요.", find: ["연금보험료 결정내역", "연금보험료결정내역"] },
      { manual: "국민연금보험료 결정내역 통보서(2차)를 열고 국고지원내역 탭으로 이동하세요. 2차는 1차 확인 후에 열립니다." },
      { download: "pensionSupport", text: "연금보험료 지원 대상자 표 아래의 엑셀저장을 누르세요.", find: ["엑셀저장", "엑셀 저장", "Excel 다운로드"] },
    ],
  },
};

export const SITE_ORDER = ["jingsu", "total", "edi"];
