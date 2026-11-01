/**
 * 1세대1주택 AI 사실 추출 — 필드 사전 ① **폼 최상위** 필드.
 *
 * 라벨·안내는 판정 메뉴 화면(`app/calc/one-house-exemption/steps/*`)과 그 화면이 재사용하는
 * 계산기 섹션(`components/calc/transfer/**`·`app/calc/transfer-tax/steps/step4-sections/**`)의 원문이다.
 * 위젯을 찾지 못한 칸은 타입 주석에서 가져오고 hint 끝에 「(UI 라벨 미확인)」을 적었다.
 * 합치는 곳은 `field-catalog.ts`.
 */
import type { FieldSpec } from "./field-catalog.types";

export const ONE_HOUSE_FIELD_CATALOG_TOP = [
  // ── ① 세대 ─────────────────────────────────────────────
  {
    path: "isOneHousehold",
    kind: "boolean",
    label: "1세대에 해당합니다",
    hint: "양도일 현재 거주자와 배우자가 생계를 같이 하는 가족과 이루는 1세대인가. 프로그램은 1세대 성립을 판정하지 않으므로 사실관계(배우자 유무·30세 이상·독립 생계 등)로 사용자가 판단한 결론을 넣는다.",
  },
  {
    path: "transferorNonResident",
    kind: "boolean",
    label: "양도일 현재 비거주자입니다",
    hint: "양도일 현재 국내에 주소나 183일 이상 거소가 없으면 켠다(소득세법 §121② 단서). 비거주자는 1세대1주택 비과세를 받지 못한다 — 해외이주·국외거주로 세대전원 출국 후 2년 이내 양도는 예외.",
  },
  {
    path: "nonResidentPeriod",
    kind: "boolean",
    label: "양도하는 주택을 보유하는 중에 비거주자였던 기간이 있습니다",
    hint: "양도일에는 거주자이지만 보유 중 비거주자였던 기간이 있으면 켠다. 보유기간은 거주자로서 보유한 기간만 통산한다.",
    when: "transferorNonResident = false",
  },
  {
    path: "nonResidentStartDate",
    kind: "date",
    label: "비거주자가 된 날",
    hint: "보유 중 비거주자가 된 날(출국 등). 취득 당시 이미 비거주자였으면 비워 둔다.",
    when: "nonResidentPeriod = true",
  },
  {
    path: "residentFromDate",
    kind: "date",
    label: "거주자가 된 날",
    hint: "입국해 국내에 주소를 둔 날 등 다시 거주자가 된 날. 비거주 기간이 있으면 필수.",
    when: "nonResidentPeriod = true",
  },

  // ── ② 양도 대상 — 양도일·가액·현황 ───────────────────────
  {
    path: "transferDate",
    kind: "date",
    label: "양도 예정일",
    hint: "양도 대상(asset)의 양도일(잔금청산일 등 양도시기). 모든 「양도일 현재」 판정과 연혁(고가주택 기준금액·기한 연수)의 기준일이다.",
  },
  {
    path: "contractTotalPrice",
    kind: "amount",
    label: "예상 양도가액",
    hint: "양도 대상의 양도가액(원). 양도일 연혁의 고가주택 기준금액(9억·6억·12억 등) 초과 여부를 판정하는 데 쓰인다 — 판정 메뉴에는 이 칸이 유일한 양도가액 입력이다.",
  },
  {
    path: "demolishedBeforeBalance",
    kind: "boolean",
    label: "매매특약에 따라 잔금청산 전에 주택을 멸실(철거)합니다",
    hint: "매매계약 특약으로 잔금청산 전에 주택을 철거했으면 켠다. 2022.12.20. 이후 체결한 계약은 원칙적으로 주택이 아닌 토지의 양도로 본다(UI 안내 — 기획재정부 재산세제과-1543).",
    when: "asset.assetKind = housing",
  },
  {
    path: "demolishedBeforeBalanceContractDate",
    kind: "date",
    label: "매매계약일",
    hint: "멸실 특약이 있는 매매계약의 체결일. 재작성한 계약이 있으면 어느 계약의 체결일인지 확인이 필요하다.",
    when: "demolishedBeforeBalance = true",
  },
  {
    path: "isUnregistered",
    kind: "boolean",
    label: "미등기 양도자산입니다",
    hint: "양도 대상이 미등기이면 켠다. 미등기 양도는 비과세(소득세법 §91①)와 감면이 모두 배제된다.",
  },

  // ── ② 조정대상지역 ───────────────────────────────────────
  {
    path: "wasRegulatedAtAcquisition",
    kind: "boolean",
    label: "취득 당시 조정대상지역이었습니다",
    hint: "양도 대상이 취득 당시 조정대상지역에 있었으면 켠다 — 보유 2년에 더해 거주 2년이 필요해진다. 동일세대 상속 통산이면 「동일세대 보유 개시 당시」, 용도변경이면 「주거용 사용 개시 당시」가 기준일이다(라벨이 그에 맞게 바뀐다). asset.regionCode가 있으면 자동 판정되어 이 값은 쓰이지 않는다.",
  },
  {
    path: "isRegulatedArea",
    kind: "boolean",
    label: "양도 당시 조정대상지역입니다",
    hint: "양도일 현재 양도 대상이 조정대상지역이면 켠다. 거주요건과는 무관하고 일시적 2주택 처분기한 등에 쓰인다. asset.regionCode가 있으면 자동 판정되어 이 값은 쓰이지 않는다.",
  },

  // ── 거주기간(옛 필드) ────────────────────────────────────
  {
    path: "residencePeriodMonths",
    kind: "intString",
    label: "거주기간 (개월)",
    hint: "폼-전역 옛 거주개월 칸 — 판정 메뉴 위젯이 이 칸을 쓰지 않는다. 거주 개월 판정은 asset.residencePeriods[](구간) 또는 asset.residencePeriodMonthsAsset(총 개월)을 읽고, 이 칸은 직접 입력 모드에서 자산 칸이 빈 문자열일 때만 대신 읽힌다. 거주기간은 자산 칸에 넣는다. (UI 라벨 미확인)",
  },

  // ── §155의3 상생임대주택 ─────────────────────────────────
  {
    path: "winWinRentalSpecial",
    kind: "boolean",
    label: "상생임대주택 특례",
    hint: "양도 대상 주택을 직전 임대차 대비 임대료를 5% 이하로 올린 상생임대차계약으로 임대했으면 켠다 — 거주기간 요건이 면제된다(영 §155의3).",
    when: "asset.assetKind = housing",
  },
  {
    path: "winWinRentalContractDate",
    kind: "date",
    label: "상생임대차계약 체결일",
    hint: "상생임대차계약을 체결한 날 — 체결 기간은 2021.12.20.~2026.12.31.(§155의3①1호 · 엔진 `WIN_WIN_CONTRACT_START`·`END`). 직전 임대차는 주택을 취득한 후 체결한 계약이어야 하고(취득으로 임대인 지위를 이어받은 계약 제외), 체결일이 취득일과 같거나 이전이면 적용되지 않는다.",
    when: "winWinRentalSpecial = true",
  },
  {
    path: "winWinRentalIncreaseRatePct",
    kind: "decimalString",
    label: "직전임대차 대비 임대료 인상률",
    hint: "직전임대차 대비 보증금·임대료 증가율(%). 내렸거나 그대로면 0을 넣는다(인하를 음수로 넣어도 판정은 같다).",
    when: "winWinRentalSpecial = true",
  },
  {
    path: "winWinRentalPriorLeaseMonths",
    kind: "intString",
    label: "직전임대차 임대기간",
    hint: "직전임대차계약에 따라 실제 임대한 기간(개월). 1개월 미만은 1개월로 보고, 월력 계산·임차인 사정 합산은 반영한 값이어야 한다.",
    when: "winWinRentalSpecial = true",
  },
  {
    path: "winWinRentalLeaseMonths",
    kind: "intString",
    label: "상생임대차 임대기간",
    hint: "상생임대차계약에 따라 임대한 기간(개월).",
    when: "winWinRentalSpecial = true",
  },
  {
    path: "winWinRentalLeaseEndDate",
    kind: "date",
    label: "상생임대차 임대기간이 종료된 날",
    hint: "상생임대차계약의 임대기간이 끝난 날 — 2026.9.30. 개정 양도기한(종료일부터 1년과 2029.12.31. 중 빠른 날, 종료일이 2026.12.31. 이전이면 2027.12.31.) 판정용. 계약 기간에 따라 달라지므로 원문에 종료일이 적혀 있을 때만 넣는다(체결일 + 기간으로 계산해 넣지 말 것 — 중도 종료가 있을 수 있다). 결론을 가르는 것은 2028.1.1. 이후 양도분뿐이라 그 전 양도는 비워 둔다.",
    when: "winWinRentalSpecial = true",
  },

  // ── §155① 일시적 2주택 ───────────────────────────────────
  {
    path: "temporaryTwoHouseSpecial",
    kind: "boolean",
    label: "일시적 2주택 특례 (§155①) — 직접 선언",
    hint: "신규 주택을 보유 주택 명부(houses[])에 넣지 않고 일시적 2주택을 직접 선언하는 폴백 경로. 판정 메뉴는 신규 주택을 명부의 「양도 주택보다 나중에 취득한 행」에서 도출하므로, 신규 주택이 있으면 이 칸 대신 houses[] 행을 넣는다. 명부에서 도출되지 않을 때만 newHouseAcquisitionDate와 함께 읽힌다. (UI 라벨 미확인)",
  },
  {
    path: "newHouseAcquisitionDate",
    kind: "date",
    label: "신규 주택 취득일",
    hint: "직접 선언 경로(temporaryTwoHouseSpecial)의 신규 주택 취득일. 화면의 「신규 주택 취득일」은 명부에서 도출한 값을 읽기 전용으로 보여 줄 뿐 이 칸에 바인딩되지 않는다 — 신규 주택은 houses[].acquisitionDate로 넣는 것이 정본이다. (UI 라벨 미확인)",
    when: "temporaryTwoHouseSpecial = true",
  },
  {
    path: "newHouseRegulatedAtAcquisition",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "조정대상지역" },
      { value: "no", label: "조정대상지역 아님" },
    ],
    label: "신규 주택 — 취득일 현재",
    hint: "신규 주택 취득일 현재 신규 주택이 조정대상지역이었는가(§155①2호 처분기한). 명부 행 주소(houses[].regionCode)로 자동 판정되면 쓰지 않는다. 공고일 이전 매매계약·계약금 지급이 증빙되면 「조정대상지역 아님」. 모르면 비움.",
  },
  {
    path: "prevHouseRegulatedAtNewAcquisition",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "조정대상지역" },
      { value: "no", label: "조정대상지역 아님" },
    ],
    label: "종전 주택(양도 주택) — 신규 주택 취득일 현재",
    hint: "신규 주택을 취득한 날 현재 종전(양도) 주택이 조정대상지역이었는가. 양도 주택 주소(asset.regionCode)가 있으면 자동 판정되어 쓰지 않는다. 모르면 비움.",
  },
  {
    path: "newHouseContractDate",
    kind: "date",
    label: "신규 주택 매매계약 체결·계약금 지급일 (해당 시)",
    hint: "신규 주택을 취득일보다 먼저 계약하고 계약금을 지급했다면 그 날(증빙되는 경우). 부칙 경과조치(종전 규정 적용)와 공고 전 계약 판정에 쓰인다. 신규 주택을 분양권·입주권으로 취득한 행이면 행의 권리 취득일을 대신 쓰고 이 칸은 받지 않는다.",
  },
  {
    path: "newHouseMoveInDate",
    kind: "date",
    label: "신규 주택으로 세대전원 이사·전입신고한 날",
    hint: "§155①2호 가목 — 신규 주택 취득일부터 1년 이내 세대전원이 이사·전입신고를 마친 날. 부득이한 사유로 일부 세대원이 이사하지 못한 경우도 포함한다.",
  },
  {
    path: "newHouseExistingTenant",
    kind: "boolean",
    label: "신규 주택 취득일 현재 기존 임차인이 거주 (§155①2호 단서)",
    hint: "신규 주택 취득일 현재 전 소유자와 계약한 임차인이 살고 있었으면 켠다 — 그 임대차기간이 취득일부터 1년 후에 끝나면 전입·양도 기한이 임대차 종료일까지(최대 2년) 늘어난다.",
  },
  {
    path: "newHouseTenantLeaseEndDate",
    kind: "date",
    label: "전 소유자와 임차인 간 임대차계약 종료일",
    hint: "기존 임차인의 임대차계약 종료일. 신규 주택 취득일 이후 갱신한 계약은 인정되지 않는다.",
    when: "newHouseExistingTenant = true",
  },
  {
    path: "publicInstitutionRelocation",
    kind: "boolean",
    label: "공공기관·법인 지방이전 특례 (§155⑯)",
    hint: "수도권 1주택 보유 중 소속 법인·공공기관이 수도권 밖으로 이전해 이전한 시·군 또는 연접 시·군의 주택을 취득한 경우 켠다 — 처분기한 3년이 5년으로 늘고 1년 경과 요건이 면제된다.",
  },
  {
    path: "relocatedSigunguCode",
    kind: "string",
    label: "이전한 기관·법인 소재지",
    hint: "이전한 기관·법인 소재지의 시·군 코드(행안부 10자리). 화면의 주소 검색 결과에서 자동으로 만들어진다 — 넣지 않는다(서버가 추출 값을 지우고 질문으로 바꾼다).",
    when: "publicInstitutionRelocation = true",
  },
  {
    path: "newHouseSigunguCode",
    kind: "string",
    label: "신규 주택 소재지",
    hint: "신규 주택 소재지의 시·군 코드(행안부 10자리) — 이전 기관 소재지와의 연접 판정용. 주소 검색 결과에서 자동으로 만들어진다 — 넣지 않는다(서버가 추출 값을 지우고 질문으로 바꾼다).",
    when: "publicInstitutionRelocation = true",
  },

  // ── §155④⑤ 합가 ─────────────────────────────────────────
  {
    path: "marriageDate",
    kind: "date",
    label: "혼인합가일",
    hint: "혼인으로 1주택자끼리 세대를 합친 날(혼인일). 혼인합가 후 기한 내 먼저 양도하는 주택이 비과세 대상(§155⑤). 이 날이 있으면 명부 각 행에 혼인 전 보유자(houses[].mergeOrigin)를 묻는다.",
  },
  {
    path: "parentalCareMergeDate",
    kind: "date",
    label: "동거봉양 합가일",
    hint: "직계존속을 동거봉양하려고 세대를 합친 날(§155④). 이 날이 있으면 직계존속 연령(parentalCareParentAge)과 명부 각 행의 합가 전 보유자를 묻는다.",
  },
  {
    path: "parentalCareParentAge",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "over_60", label: "직계존속 중 1명 이상이 합가일 현재 만 60세 이상" },
      { value: "care_benefit", label: "요양급여를 받는 만 60세 미만 직계존속" },
      { value: "none", label: "해당 없음" },
    ],
    label: "합가일 현재 직계존속의 연령",
    hint: "합가일 현재 만 나이. 직계존속(배우자의 직계존속 포함) 중 1명이라도 만 60세 이상이면 된다. 모르면 비움 — 불성립 + 확인 필요로 막힌다.",
    when: "parentalCareMergeDate ≠ \"\"",
  },
  {
    path: "isFirstTransferredInMerge",
    kind: "boolean",
    label: "세대 내 먼저 양도하는 주택",
    hint: "이 양도가 합가·혼인 후 세대 내 첫 양도이면 켠다(§155④⑤는 먼저 양도하는 주택에만 적용, 양도 주택은 합가일 이전 또는 당일 취득분). 장기저당담보주택 동거봉양 합가 칩도 같은 칸을 쓴다.",
    when: "marriageDate 또는 parentalCareMergeDate 입력",
  },
  {
    path: "mergedHouseholdFirstHouseKind",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "house_only", label: "주택 1채만 갖고 있었다" },
      { value: "initial_right", label: "주택 + 조합원입주권 — 그 입주권이 인가로 최초 취득된 것이다" },
      { value: "succeeded_right", label: "주택 + 조합원입주권 — 그 입주권을 매매 등으로 승계취득했다" },
      { value: "presale_right", label: "주택 + 분양권을 갖고 있었다" },
      { value: "right_only", label: "조합원입주권·분양권만 갖고 있었다" },
      { value: "none", label: "어느 것에도 해당하지 않는다" },
    ],
    label: "합가 전 보유 구성 — 이 주택을 소유하던 사람 기준",
    hint: "세대가 입주권·분양권을 보유한 합가 세대(시행령 §156의2⑧·⑨)에서, 합친 날 이전에 최초양도주택 소유자가 무엇을 갖고 있었는가. 「미선택」은 판정 불가로 남고 「none」을 골라야 배제가 확정된다.",
    when: "presaleRights[] 1행 이상 + marriageDate 또는 parentalCareMergeDate",
  },

  // ── §155② 상속주택 특례의 일반주택 ───────────────────────
  {
    path: "generalHouseRightAtInheritance",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "redevelopment_right", label: "상속개시 당시 보유한 조합원입주권으로 취득한 신축주택" },
      { value: "presale_right", label: "상속개시 당시 보유한 분양권(2021.1.1. 이후 취득)으로 취득한 신축주택" },
      { value: "none", label: "해당 없음 — 상속개시 후 새로 취득한 주택" },
    ],
    label: "상속개시 후 취득한 양도 주택 — 취득 경위",
    hint: "양도 주택을 명부 상속주택의 상속개시일 뒤에 취득했을 때, 그 주택이 상속개시 당시 보유한 입주권·분양권으로 사업시행 완료 후 취득한 신축주택인가(§155② 괄호). 칸이 열리면 선택이 필수다.",
    when: "houses[].isInherited = true 이고 asset.acquisitionDate가 그 행의 inheritedDate보다 늦음",
  },

  // ── §89② 배제의 3년 초과 예외 ────────────────────────────
  {
    path: "rightThreeYearExceptionKind",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "new_house", label: "신축주택이 완성된 뒤 양도했다" },
      { value: "before_completion", label: "신축주택이 완성되기 전에 양도했다" },
      { value: "delay", label: "경매·공매 등으로 기한 내 양도하지 못했다" },
      { value: "none", label: "어느 것에도 해당하지 않는다" },
    ],
    label: "권리 취득 후 기한이 지나 양도 — 비과세 예외 선언",
    hint: "세대가 입주권·분양권을 보유한 채 주택을 양도하면서 권리 취득일부터 기한(양도일 연혁 1·2·3년)을 넘긴 경우의 예외(시행령 §156의2④·§156의3③ / 시행규칙 §75①). 「미선택」은 판정 불가, 「none」이 배제 확정이다.",
    when: "presaleRights[] 중 가장 먼저 취득한 권리가 기한을 넘김",
  },
  {
    path: "rightNewHouseCompletionDate",
    kind: "date",
    label: "신축주택 완성일",
    hint: "관리처분계획등(분양권은 그 계약)에 따라 취득하는 주택이 완성된 날 — 이 날부터 기한 내 이사·양도해야 한다.",
    when: "rightThreeYearExceptionKind = new_house",
  },
  {
    path: "rightMovedInWithin3Years",
    kind: "boolean",
    label: "완성 후 기한 내에 세대전원이 이사했다",
    hint: "신축주택 완성 후 기한 내 세대전원이 이사했는가(완성 전 양도면 이사할 예정인가). 부득이한 사유로 일부가 이사하지 못한 경우 포함.",
    when: "rightThreeYearExceptionKind = new_house 또는 before_completion",
  },
  {
    path: "rightResidedOneYearOrMore",
    kind: "boolean",
    label: "그 주택에 1년 이상 계속하여 거주했다",
    hint: "신축주택에 1년 이상 계속 거주했는가(완성 전 양도면 거주할 예정인가).",
    when: "rightThreeYearExceptionKind = new_house 또는 before_completion",
  },

  // ── §156의2⑤ 대체주택 ────────────────────────────────────
  {
    path: "replacementHouseSpecial",
    kind: "boolean",
    label: "대체주택 비과세 특례 해당 (§156의2⑤)",
    hint: "재개발·재건축 사업시행기간 중 거주하기 위해 취득한 대체주택을 양도하면 켠다(1세대1주택 의제).",
    when: "asset.assetKind = housing + 세대가 조합원입주권 보유 또는 주택 2채 이상",
  },
  {
    path: "replBusinessApprovalDate",
    kind: "date",
    label: "사업시행계획인가일",
    hint: "재개발·재건축 조합이 사업시행인가를 받은 날.",
    when: "replacementHouseSpecial = true",
  },
  {
    path: "replCompletionDate",
    kind: "date",
    label: "신축주택 준공일",
    hint: "재개발·재건축으로 완성된 신축주택의 사용승인일. 신축주택이 완성되기 전에 양도했으면 넣지 않는다.",
    when: "replacementHouseSpecial = true (완성 후 양도)",
  },
  {
    path: "replResidenceMonths",
    kind: "intString",
    label: "대체주택 거주개월수",
    hint: "대체주택에서 거주한 개월 수(정수).",
    when: "replacementHouseSpecial = true",
  },
  {
    path: "replWillResideNewHouse",
    kind: "boolean",
    label: "신축주택 1년 이상 거주 예정 (자기선언)",
    hint: "신축주택 완성 후 기한 내 세대전원 이사 및 1년 이상 거주할 것을 확인(§156의2⑤2호).",
    when: "replacementHouseSpecial = true",
  },

  // ── §154① 단서 — 보유·거주 요건 면제 사유 ────────────────
  {
    path: "provisoReason",
    kind: "enum",
    values: [
      { value: "", label: "해당 없음" },
      { value: "rental_5yr_residence", label: "임대주택 거주 5년 (1호)" },
      { value: "expropriation", label: "공익사업 수용 (2호 가목)" },
      { value: "overseas_migration", label: "해외이주 (2호 나목)" },
      { value: "overseas_residence", label: "국외거주·취학·근무 (2호 다목)" },
      { value: "unavoidable", label: "부득이한 사유 (3호)" },
      { value: "pre_designation_contract", label: "조정 공고 전 계약 (5호)" },
      { value: "rental_registration_4ho", label: "임대사업자 등록 (4호 — 2020.2.11. 삭제 전)" },
    ],
    label: "§154① 단서 — 보유·거주 요건 면제 사유 (선택)",
    hint: "보유 2년(조정취득 시 거주 2년)에 못 미쳐도 비과세되는 사유. 일시적 2주택 종전주택이면 1호·2호가목·3호와 5호·삭제 전 4호(거주요건만 면제)를 적용한다. 사유가 없으면 비움.",
  },
  {
    path: "provisoDepartureDate",
    kind: "date",
    label: "출국일",
    hint: "해외이주·국외거주로 세대전원이 출국한 날 — 출국일부터 2년 내 양도해야 한다.",
    when: "provisoReason = overseas_migration 또는 overseas_residence",
  },
  {
    path: "provisoDepartureOnlyHouse",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "예 (1채만)" },
      { value: "no", label: "아니오 (2채 이상)" },
    ],
    label: "출국일 현재 이 주택 1채만 보유했나요?",
    hint: "출국일 현재 세대가 보유한 주택을 센다(장기임대주택 등 특례 주택 포함). 2008.2.22. 이후 양도분은 답해야 한다. 모르면 비움.",
    when: "provisoReason = overseas_migration 또는 overseas_residence",
  },
  {
    path: "provisoExpropriationDate",
    kind: "date",
    label: "수용일",
    hint: "공익사업으로 수용된 날. 수용된 주택 자체를 양도하면 양도일과 같은 날, 잔존주택이면 수용일부터 5년(2013.2.15. 전 양도는 2년) 내 양도해야 한다.",
    when: "provisoReason = expropriation",
  },
  {
    path: "provisoBusinessApprovalDate",
    kind: "date",
    label: "사업인정 고시일",
    hint: "공익사업 사업인정 고시일 — 고시일 전 취득한 주택만 해당. 비우면 이 단서를 적용하지 않고 확인 필요로 안내한다.",
    when: "provisoReason = expropriation",
  },
  {
    path: "provisoRentalLeaseResidenceMonths",
    kind: "intString",
    label: "임차일부터 세대전원 거주 개월",
    hint: "건설·공공매입임대주택에 임차해 입주한 날부터 양도일까지 세대전원이 거주한 개월(분양전환·취득 전 임차 기간 포함). 60개월 이상이어야 한다. 비우면 본문 거주기간으로 판정한다.",
    when: "provisoReason = rental_5yr_residence",
  },
  {
    path: "provisoPreContractNoHouse",
    kind: "boolean",
    label: "계약금 지급일 현재 1세대 무주택",
    hint: "조정대상지역 공고일 이전 매매계약 + 계약금 지급일 현재 1세대 무주택이면 켠다(거주요건만 면제, 보유 2년은 필요).",
    when: "provisoReason = pre_designation_contract",
  },
  {
    path: "proviso4hoBusinessRegDate",
    kind: "date",
    label: "사업자등록 신청일",
    hint: "세무서 사업자등록 신청일(소득세법 §168①). 삭제 전 4호는 2019.12.16. 이전 등록 신청이 요건이다.",
    when: "provisoReason = rental_registration_4ho",
  },
  {
    path: "proviso4hoRentalRegDate",
    kind: "date",
    label: "임대사업자 등록 신청일",
    hint: "시·군·구 임대사업자 등록 신청일(민간임대주택법 §5①). 분양권 상태에서 신청한 경우 포함, 지위를 포괄승계했다면 최초 신청일(2019.12.17. 이후 매매로 넘겨받은 경우는 해석례가 없어 확인 필요).",
    when: "provisoReason = rental_registration_4ho",
  },
  {
    path: "proviso4hoRegulatedOneHouse",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "예" },
      { value: "no", label: "아니오" },
    ],
    label: "신청 당시 세대가 조정대상지역에 이 주택(분양권 상태였다면 그 분양권) 1채만 보유했나요?",
    hint: "양도일 현재가 아니라 등록 신청 당시의 세대 보유 상황 — 합가·혼인 전 신청이면 그때의 세대(기준-2024-법규재산-0061). 모르면 비움 — 미선택은 판정 보류·검증 오류가 된다.",
    when: "provisoReason = rental_registration_4ho (양도일이 4호 삭제 이후 구간일 때 화면에 뜬다)",
  },
  {
    path: "proviso4hoStatus",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "maintained", label: "등록 유지" },
      { value: "auto_cancelled", label: "자동말소 (민간임대주택법 §6⑤)" },
      { value: "voluntary_cancelled", label: "자진말소 (민간임대주택법 §6①11호)" },
      { value: "demolition_cancelled", label: "재개발·재건축 멸실로 말소" },
      { value: "other", label: "그 밖의 사유로 말소" },
    ],
    label: "양도일 현재 임대사업자 등록 상태",
    hint: "양도일 현재 임대사업자 등록이 유지 중인지, 말소됐다면 어떤 사유인지. 모르면 비움.",
    when: "provisoReason = rental_registration_4ho",
  },
  {
    path: "proviso4hoDuringMandatory",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "예" },
      { value: "no", label: "아니오" },
    ],
    label: "임대의무기간(민간임대주택법 §43) 중에 양도하나요?",
    hint: "등록이 유지 중일 때 임대의무기간 안의 양도인가. 모르면 비움.",
    when: "proviso4hoStatus = maintained",
  },
  {
    path: "proviso4hoRentOver5",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "예" },
      { value: "no", label: "아니오" },
    ],
    label: "임대보증금·임대료를 연 5% 넘게 올린 적이 있나요?",
    hint: "등록이 유지 중일 때 연 5% 초과 증액 이력. 「예」면 그 계약의 체결·갱신일을 추가로 묻는다. 모르면 비움.",
    when: "proviso4hoStatus = maintained",
  },

  // ── §154⑤ 단서 최종 1주택 재기산 ─────────────────────────
  {
    path: "finalHouseRestartHistory",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "있음" },
      { value: "no", label: "없음" },
    ],
    label: "이 주택을 보유하는 동안 세대가 다른 주택(조합원입주권 포함)을 처분한 적이 있나요?",
    hint: "2021.1.1.~2022.5.9. 양도분 — 2주택 이상을 보유하다 다른 주택을 모두 처분했으면 1주택이 된 날부터 보유기간을 다시 센다. 「있음」이면 finalHouseRestartDisposals[]에 처분을 적는다. 답하지 않으면 재기산으로 보거나 판정 보류가 된다.",
    when: "transferDate가 2021-01-01~2022-05-09 + 명부 파생 1주택",
  },
] as const satisfies readonly FieldSpec[];
