/**
 * 1세대1주택 AI 사실 추출 — 필드 사전 ② **양도 대상 자산**(`assets[0]` = 경로 `asset.*`).
 *
 * 판정 메뉴 ② 양도 대상 주택 화면(`Step3.tsx`)이 `assets[0]`만 편집한다. 라벨 출처는 `field-catalog-top.ts` 머리 주석과 같다.
 * `asset.residenceInputMode`는 추출기가 고정하므로 사전에 두지 않는다 — 거주 칸 두 갈래의 관계는 각 hint에 적었다.
 */
import type { FieldSpec } from "./field-catalog.types";

export const ONE_HOUSE_FIELD_CATALOG_ASSET = [
  // ── 양도 대상 종류·소재지·취득일 ─────────────────────────
  {
    path: "asset.assetKind",
    kind: "enum",
    values: [
      { value: "housing", label: "주택" },
      { value: "right_to_move_in", label: "조합원입주권" },
    ],
    label: "양도 대상",
    hint: "주택이면 §89①3호(보유·거주요건·§155 특례), 조합원입주권이면 §89①4호로 판정한다. 판정 메뉴 화면이 고르는 값은 이 둘뿐이다.",
  },
  {
    path: "asset.redevSubject",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "right", label: "입주권 양도" },
      { value: "apt", label: "완공 APT 양도" },
    ],
    label: "양도 대상",
    hint: "재개발·재건축 양도 대상 구분. 판정 메뉴는 양도 대상으로 조합원입주권을 고르면 함께 right로 세운다(§89①4호 카드 노출 게이트) — 입주권 양도면 right.",
    when: "asset.assetKind = right_to_move_in",
  },
  {
    path: "asset.regionCode",
    kind: "string",
    label: "소재지",
    hint: "양도 대상 소재지 법정동코드 10자리(PNU 앞 10자리). 선택 입력 — 있으면 조정대상지역을 자동 판정하고 wasRegulatedAtAcquisition·isRegulatedArea 토글은 쓰이지 않는다. 넣지 않는다 — 화면의 주소 검색으로만 채운다(서버가 추출 값을 지우고 질문으로 바꾼다).",
  },
  {
    path: "asset.acquisitionDate",
    kind: "date",
    label: "취득일",
    hint: "양도 대상의 취득일. 상속이면 상속개시일, 증여면 증여일(증여 등기접수일), 재개발로 받은 신축주택이면 사용승인일(임시사용승인·사실상 사용이 먼저면 그날 — 시행령 §162①4호). 상속받은 조합원입주권·분양권이 완공된 주택을 양도하면 상속개시일을 넣는다(양도 자산 쪽에는 상속개시일 칸이 따로 없다 — 완공일은 notes에).",
  },

  // ── 취득 원인 — 상속(§154⑧3호) ───────────────────────────
  {
    path: "asset.acquisitionCause",
    kind: "enum",
    values: [
      { value: "purchase", label: "매매" },
      { value: "inheritance", label: "상속" },
      { value: "gift", label: "증여" },
    ],
    label: "상속받은 주택입니다 / 증여받은 주택입니다",
    hint: "양도 대상의 취득 원인. 판정 메뉴는 「상속받은 주택입니다」(inheritance)·「증여받은 주택입니다」(gift) 토글로만 정하고, 둘 다 끄면 purchase다.",
    when: "asset.assetKind = housing",
  },
  {
    path: "asset.decedentAcquisitionDate",
    kind: "date",
    label: "피상속인 취득일",
    hint: "피상속인이 이 주택을 취득한 날.",
    when: "asset.acquisitionCause = inheritance",
  },
  {
    path: "asset.decedentSameHouseholdBeforeInheritance",
    kind: "boolean",
    label: "상속개시 당시 피상속인과 동일세대였습니다",
    hint: "상속개시 당시 상속인과 피상속인이 동일세대였으면 켠다 — 상속개시 전 동일세대로서 거주·보유한 기간을 보유·거주기간에 통산한다(소령 §154⑧3호).",
    when: "asset.acquisitionCause = inheritance",
  },
  {
    path: "asset.decedentCohabitationHoldingStartDate",
    kind: "date",
    label: "동일세대 거주·보유 개시일",
    hint: "상속개시 전 피상속인과 동일세대로서 이 주택에 거주·보유하기 시작한 날 — 보유기간을 이 날부터 센다. 「취득 당시 조정대상지역」의 기준일도 이 날이 된다.",
    when: "asset.decedentSameHouseholdBeforeInheritance = true",
  },
  {
    path: "asset.decedentCohabitationResidenceMonths",
    kind: "intString",
    label: "상속개시 전 동일세대 거주기간",
    hint: "상속개시 전 피상속인과 동일세대로 이 주택에 거주한 개월. 상속개시일 이후 본인 거주는 거주기간 칸(asset.residencePeriods[] 또는 asset.residencePeriodMonthsAsset)에 따로 넣는다 — 같은 기간을 두 칸에 넣지 않는다.",
    when: "asset.decedentSameHouseholdBeforeInheritance = true",
  },

  // ── 취득 원인 — 증여(증여자와 같은 세대) ──────────────────
  {
    path: "asset.giftDonorRelation",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "spouse", label: "배우자" },
      { value: "lineal", label: "직계존비속" },
      { value: "other", label: "그 밖의 친족" },
    ],
    label: "증여자와의 관계",
    hint: "증여자가 양도자에게 누구인가. 관계에 따라 「계속 같은 세대」 질문의 뜻이 달라진다(배우자는 혼인 유지, 그 밖은 같은 주소·생계 계속).",
    when: "asset.acquisitionCause = gift",
  },
  {
    path: "asset.donorAcquisitionDate",
    kind: "date",
    label: "증여자 취득일",
    hint: "증여자가 이 주택을 취득한 날.",
    when: "asset.acquisitionCause = gift",
  },
  {
    path: "asset.giftSameHousehold",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "yes", label: "예 — 계속 같은 세대" },
      { value: "no", label: "아니오 — 세대가 달랐거나 중간에 분리" },
      { value: "rejoined", label: "아니오 — 증여 뒤 이혼했다가 같은 사람과 재결합" },
    ],
    label: "증여자와 계속 같은 세대였습니까",
    hint: "증여일부터 양도일까지 증여자와 계속 같은 세대(배우자는 혼인 유지)였는가 — 「예」면 증여자 세대의 보유기간을 통산하고, 아니면 증여일부터 센다. rejoined는 배우자 증여에서만 고를 수 있다. 증여자가 양도 전에 사망했으면 묻지 않는다. 모르면 비움(검증이 막는다).",
    when: "asset.acquisitionCause = gift",
  },
  {
    path: "asset.giftHouseholdHoldingStartDate",
    kind: "date",
    label: "세대가 이 주택 보유를 시작한 날",
    hint: "증여자 세대가 이 주택 보유를 시작한 날 — 증여자 취득일 이후 혼인·합가했다면 그 날. 보유기간을 이 날부터 센다(증여자 취득일 이후, 증여일 전의 날짜).",
    when: "asset.giftSameHousehold = yes",
  },

  // ── §154⑤ 단서 용도변경 ──────────────────────────────────
  {
    path: "asset.hasNonHousingConversion",
    kind: "boolean",
    label: "건물 전체를 주택으로 용도변경",
    hint: "오피스텔·근린생활시설 등 건물 전부를 주거용으로 바꾼 경우 켠다 — 2024.2.29. 이후 양도분은 보유기간을 주거용 사용일부터 세고, 거주요건의 조정대상지역 여부와 2017.8.2. 이전 취득 경과규정도 그 날 기준으로 본다(영 §154⑤).",
    when: "asset.assetKind = housing",
  },
  {
    path: "asset.residentialUseStartDate",
    kind: "date",
    label: "사실상 주거용 사용 개시일",
    hint: "사실상 주거용으로 사용한 날. 불분명하면 건축물대장상 용도변경일. 취득일 이후, 양도일 이전이어야 한다.",
    when: "asset.hasNonHousingConversion = true",
  },

  // ── §89①4호 1세대1입주권 (입주권 양도) ────────────────────
  {
    path: "asset.redevExemptionEligibleAtApproval",
    kind: "enum",
    values: [
      { value: "", label: "선언하지 않음(자동 판정)" },
      { value: "yes", label: "인가일 현재 §89①3호 가목 요건 충족 (자기선언)" },
      { value: "no", label: "인가일 기준 요건 미충족(명시)" },
    ],
    label: "인가일 현재 §89①3호 가목 요건 충족 (자기선언)",
    hint: "관리처분계획인가일 현재 종전주택(철거 대상 건물)을 본인·같은 세대원이 소유하고 보유 2년 이상(조정대상지역 취득 시 거주 2년 이상)이었는가. 판정 메뉴 토글은 yes와 \"\"(선언 안 함)만 쓴다 — no는 계산기 라디오 값이고 장기보유특별공제를 강등하므로, 요건 미충족이 명백할 때만 넣고 모르면 비움.",
    when: "asset.assetKind = right_to_move_in",
  },
  {
    path: "asset.redevApprovalDate",
    kind: "date",
    label: "양도하는 입주권의 관리처분계획인가일",
    hint: "양도하는 입주권의 관리처분계획인가일(소규모정비는 사업시행계획인가일). 2022.1.1. 이후 취득한 분양권이 있을 때 분양권 요건 연혁에 쓰인다.",
    when: "asset.redevExemptionEligibleAtApproval = yes",
  },
  {
    path: "asset.redevOtherHouseAcquisitionDate",
    kind: "date",
    label: "세대 보유 1주택의 취득일 (나목)",
    hint: "입주권 외에 주택 1채를 보유한 경우(§89①4호 나목)만 그 1주택의 취득일 — 그 날부터 3년(양도일 연혁 2년·1년) 이내 양도해야 한다. 다른 주택이 0채(가목)면 비운다. 그 1주택은 명부(houses[])에도 넣는다.",
    when: "asset.redevExemptionEligibleAtApproval = yes",
  },

  // ── 거주기간 (주택 양도) ─────────────────────────────────
  {
    path: "asset.residencePeriods[].moveInDate",
    kind: "date",
    label: "입주일",
    hint: "거주 구간 하나의 입주(전입)일. 비연속 거주는 구간을 여러 행으로 나눈다. 구간 입력이 정본이며, 구간을 넣으면 asset.residencePeriodMonthsAsset은 읽히지 않는다.",
    when: "asset.assetKind = housing",
  },
  {
    path: "asset.residencePeriods[].moveOutDate",
    kind: "date",
    label: "퇴거일",
    hint: "거주 구간의 퇴거(전출)일. 양도일까지 거주했으면 양도일을 넣는다(비우지 않는다).",
    when: "asset.assetKind = housing",
  },
  {
    path: "asset.residencePeriodMonthsAsset",
    kind: "decimalString",
    label: "거주기간 (개월)",
    hint: "거주 구간(asset.residencePeriods[])을 모르고 총 개월만 알 때 이 주택에 실제 거주한 총 개월. 구간 입력 모드에서는 읽히지 않으므로 둘 중 하나만 쓴다. 상속개시 전 동일세대 거주분은 넣지 않는다.",
    when: "asset.assetKind = housing",
  },

  // ── §155⑳ 장기임대주택 보유자 거주주택 특례 ──────────────
  {
    path: "asset.rentalHousingException.applyException",
    kind: "boolean",
    label: "장기임대주택 보유자 거주주택 비과세 특례 적용",
    hint: "장기임대주택을 보유한 채 거주주택을 양도하는 특례(소령 §155⑳) 선언. 여기 선언한 임대주택은 rentalUnits[]에 넣고 명부(houses[])에 다시 넣지 않는다 — 특례가 주택 수에서 빼 주는 대상이다. 입주권 양도에는 적용되지 않는다.",
    when: "asset.assetKind = housing",
  },
  {
    path: "asset.rentalHousingException.scenario",
    kind: "enum",
    values: [
      { value: "A", label: "거주주택 양도 (장기임대주택 보유 중)" },
      { value: "B", label: "임대주택을 거주주택으로 전환 후 양도 (시행령 제161조 제1항 안분 적용)" },
    ],
    label: "거주주택 양도 / 임대주택을 거주주택으로 전환 후 양도",
    hint: "A — 장기임대주택을 보유하며 거주주택을 양도. B — 임대하던 주택(직전거주주택보유주택)을 거주주택으로 바꿔 양도(직전거주주택 양도일 이후 양도소득금액만 비과세). B에서 함께 보유한 임대주택이 없으면(rentalUnits 0호) §154⑩ 표준 경로다.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].businessRegistrationDate",
    kind: "date",
    label: "세무서 사업자등록일",
    hint: "이 임대주택의 세무서 사업자등록일(§168). 지자체 등록일과 함께 임대 구분(목)·의무기간·가액 상한을 정한다.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].rentalRegistrationDate",
    kind: "date",
    label: "지자체 임대사업자등록신청일",
    hint: "지자체 임대사업자 등록 신청일(민특법 §5).",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].rentalAcquisitionType",
    kind: "enum",
    values: [
      { value: "purchase", label: "매입" },
      { value: "construction", label: "건설(신축)" },
    ],
    label: "취득 방법",
    hint: "매입임대인가 건설임대인가. 기존사업자(나목)·미분양(라목)은 매입 고정.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].rentalCategory",
    kind: "enum",
    values: [
      { value: "long_general", label: "장기일반" },
      { value: "short_6y", label: "단기 6년" },
      { value: "existing_business", label: "기존사업자(나목)" },
      { value: "unsold_08_09", label: "미분양(라목)" },
      { value: "pre_2018", label: "구 임대주택법" },
    ],
    label: "임대 구분",
    hint: "등록 임대 유형. 등록일·취득 방법과 합쳐 §167의3①2호 목(가~자·구법)이 도출된다. 등록일과 맞지 않는 유형은 장기일반으로 되돌려진다.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].region",
    kind: "enum",
    values: [
      { value: "seoul-metro", label: "수도권" },
      { value: "non-metro", label: "비수도권" },
    ],
    label: "소재 지역",
    hint: "임대주택 소재지가 수도권인가 — 기준시가 상한 산정용. 주소를 검색하면 자동 판별된다.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].isApartment",
    kind: "boolean",
    label: "아파트 여부",
    hint: "임대주택이 아파트인가. 2020.7.11 이후 등록 아파트는 장기일반 특례에서 제외된다.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].isNationalSizeHousing",
    kind: "boolean",
    label: "국민주택규모(전용 85㎡·수도권 도시지역 60㎡ 이하)를 충족합니다.",
    hint: "나목(기존사업자 매입임대)의 국민주택규모 요건 자기확인.",
    when: "asset.rentalHousingException.rentalUnits[].rentalCategory = existing_business",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].hasMinimum2Units",
    kind: "boolean",
    label: "2호 이상 임대 요건을 충족합니다.",
    hint: "2호 이상 임대 요건 자기확인 — 건설임대와 나목에서 묻는다.",
    when: "rentalAcquisitionType = construction 또는 rentalCategory = existing_business (같은 rentalUnits[] 행)",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].rentalMonths",
    kind: "intString",
    label: "실제 임대 개월 수",
    hint: "실제 임대한 총 개월. 화면은 임대 시작일~종료일 구간(rentalPeriods — 사전 밖)으로 받고, 구간이 없을 때(직접 입력 모드·기본값) 이 개월 수가 쓰인다. 의무임대기간을 채우기 전 양도도 적용되나 이후 미충족 시 추징된다. (UI 라벨 미확인)",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].standardPriceAtRentalStart",
    kind: "amount",
    label: "임대개시일 기준시가",
    hint: "임대개시일 현재 이 임대주택의 기준시가(원) — 목별 가액 상한(소령 §155⑳) 판정용. 나·라목은 이 칸 대신 취득 당시 기준시가를 쓴다.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].acquisitionOfficialPrice",
    kind: "amount",
    label: "취득 당시 기준시가",
    hint: "나목·라목 임대주택의 취득 당시 기준시가(원) — 3억 이하 요건.",
    when: "asset.rentalHousingException.rentalUnits[].rentalCategory = existing_business 또는 unsold_08_09",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].rentalAutoTermination",
    kind: "boolean",
    label: "자진말소 또는 자동말소로 임대사업자 등록이 말소된 임대주택입니다.",
    hint: "등록이 자진·자동말소됐으면 켠다 — 말소일(2호 이상이면 최초 말소일)부터 5년 이내 거주주택을 양도하면 임대기간요건을 충족한 것으로 본다(소령 §155㉓). 자진말소는 임대의무기간 1/2 이상 임대한 경우에 한한다. 가·다·라·마목에서 묻는다. 자진말소(민특법 §6①11호 신청)·자동말소(§6⑤ 임대의무기간 종료)만 해당한다 — 재건축 멸실 등 그 밖의 사유로 말소됐으면 false로 두고 requirementsConfirmed를 false로 넣는다.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].registrationCancellationDate",
    kind: "date",
    label: "등록 말소일",
    hint: "등록이 말소된 날 — 말소 이후 5년 이내 양도 판정의 기산일.",
    when: "asset.rentalHousingException.rentalUnits[].rentalAutoTermination = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].terminatedRegistrationType",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "short_term", label: "단기민간임대(4년)" },
      { value: "long_term_general", label: "장기일반민간임대(8년)" },
    ],
    label: "말소 전 민간임대주택 등록 유형",
    hint: "자진말소 1/2 판정 기준이 되는 말소 전 등록 유형(1/2 = 24개월·48개월, 소령 §155㉓1호). 모르면 비움.",
    when: "asset.rentalHousingException.rentalUnits[].rentalAutoTermination = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].requirementsConfirmed",
    kind: "boolean",
    label: "임대료 5% 상한, 임대사업자 등록 유지(양도일 현재 등록·임대 중), 임대료 증액 후 1년 이내 재증액 금지 요건을 모두 충족합니다.",
    hint: "§155⑳2호 요건 자기확인 — 전 목 공통. 자진·자동말소된 호는 「말소 전까지」 충족했으면 켠다. 그 밖의 사유(재건축 멸실 등)로 양도일 현재 등록이 말소된 호는 false.",
    when: "asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.rentalUnits[].mergeOrigin",
    kind: "enum",
    values: [
      { value: "seller_side", label: "양도자 쪽" },
      { value: "counterpart_side", label: "배우자 쪽" },
      { value: "after_merge", label: "혼인 후 취득" },
    ],
    label: "장기임대주택의 혼인 전 보유자",
    hint: "혼인합가(§155⑤) 세대에서 이 임대주택을 혼인 전에 누가 보유했는가 — 각각 2주택 이상인 사람끼리 혼인해 4주택 이상이면 혼인합가 특례가 적용되지 않으므로 임대주택도 센다(기획재정부 조세정책과-1199). 모르면 비움.",
    when: "marriageDate ≠ \"\" + asset.rentalHousingException.applyException = true",
  },
  {
    path: "asset.rentalHousingException.priorRentalExemptionHistory",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "none", label: "없음 — 이번이 최초의 거주주택 양도입니다" },
      { value: "used", label: "있음 — 이미 거주주택을 양도해 이 특례를 적용받았습니다" },
    ],
    label: "장기임대주택 보유 중 거주주택 양도 이력",
    hint: "2019.2.12 이후 취득 · 2025.2.27 이전 양도 구간의 생애 한 차례 제한 — 이미 이 특례로 거주주택을 양도한 적이 있는가. 경과조치(residenceTransitionUnderAddendum)가 성립하면 묻지 않는다. 모르면 비움.",
    when: "asset.rentalHousingException.scenario = A + 2019.2.12 이후 취득 · 2025.2.27 이전 양도",
  },
  {
    path: "asset.rentalHousingException.residenceTransitionUnderAddendum",
    kind: "boolean",
    label: "2019.2.12 당시 이 주택에 거주하고 있었거나, 그 전에 매매계약을 체결하고 계약금을 지급했습니다.",
    hint: "대통령령 제29523호 부칙 제7조② 경과조치 — 증빙되면 종전 규정을 따른다(생애 1회 제한 미적용 · §154⑩ 경로는 소령 §154① 원칙 거주요건). 켜면 사유(residenceTransitionBasis)를 함께 넣는다.",
    when: "asset.rentalHousingException.applyException = true + 2019.2.12 이후 취득(⑳ 본문 경로는 2025.2.27 이전 양도에서만, §154⑩ 경로는 양도일 무관)",
  },
  {
    path: "asset.rentalHousingException.residenceTransitionBasis",
    kind: "enum",
    values: [
      { value: "", label: "미선택" },
      { value: "residing", label: "2019.2.12 당시 이 주택에 거주하고 있었습니다" },
      { value: "contract_with_prior_rental", label: "그 전에 계약금을 지급했고, 2019.2.12 전에 지자체·세무서에 등록한 임대주택을 소유하고 있었습니다" },
      { value: "contract_without_prior_rental", label: "그 전에 계약금을 지급했지만, 2019.2.12 전에 등록한 임대주택은 없었습니다" },
    ],
    label: "경과조치 사유",
    hint: "경과조치의 사유. contract_without_prior_rental이면 종전 규정을 적용받지 못한다(UI 안내 — 서면-2020-법령해석재산-1464 등). 체크를 켰으면 필수.",
    when: "asset.rentalHousingException.residenceTransitionUnderAddendum = true",
  },
  {
    path: "asset.rentalHousingException.postRegistrationResidenceMonths",
    kind: "intString",
    label: "사업자등록·임대사업자 등록 이후 거주기간",
    hint: "B(직전거주주택보유주택) — 이 주택의 세무서 사업자등록과 지자체 임대사업자 등록을 모두 마친 날 이후 이 주택에서 거주한 개월(소령 §155⑳1호 괄호). 전체 거주기간(asset.residencePeriods[])과 따로 받는다.",
    when: "asset.rentalHousingException.scenario = B",
  },
  {
    path: "asset.rentalHousingException.priorResidenceTransferDate",
    kind: "date",
    label: "직전거주주택 양도일",
    hint: "B — 먼저 양도한 직전거주주택의 양도일(§161① 비과세 기산점). 함께 보유한 임대주택이 없는 §154⑩ 경로에서는 이 주택이 직전거주주택보유주택임을 확인하는 판정 사실이다.",
    when: "asset.rentalHousingException.scenario = B",
  },
  {
    path: "asset.rentalHousingException.wasRegisteredRentalOrChildcare",
    kind: "boolean",
    label: "임대주택 등록·어린이집 운영 사실 (소령 §154⑩1호)",
    hint: "이 주택을 민특법 §5에 따라 임대주택으로 등록했거나 영유아보육법에 따라 어린이집으로 운영한 사실이 있는가.",
    when: "asset.rentalHousingException.scenario = B + rentalUnits 0호",
  },
] as const satisfies readonly FieldSpec[];
