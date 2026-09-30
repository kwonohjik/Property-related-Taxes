/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 3 (mixed)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「mixed: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `transfer-tax-validate-mixed-use-asset.ts` · `-mixed-area.ts` · `-mixed-use-inheritance.ts`.
 */
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 통과하는 겸용주택(매매 실거래가, PHD 없음) — `e2e/mixed-use-amendment.spec.ts`의 정본 시드와 같다 */
const mixedAsset = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2010-03-15",
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "100",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedIsMetropolitanArea: true,
  fixedAcquisitionPrice: "700000000",
};
const mixed = (patch: Record<string, unknown>) => () =>
  withPrimary({ ...mixedAsset, ...patch }, { contractTotalPrice: "1500000000" });
/** 환산취득가 모드 */
const est = (patch: Record<string, unknown>) => mixed({ useEstimatedAcquisition: true, ...patch });
/** 3-시점(§164⑦) — 취득일 < 최초고시일 */
const phd = (patch: Record<string, unknown>) =>
  est({
    acquisitionDate: "2000-01-01",
    usePreHousingDisclosure: true,
    phdFirstDisclosureDate: "2005-04-30",
    phdFirstDisclosureHousingPrice: "200000000",
    phdLandPricePerSqmAtFirst: "1500000",
    phdLandPricePerSqmAtAcq: "1000000",
    phdBuildingStdPriceAtAcq: "40000000",
    phdBuildingStdPriceAtFirst: "45000000",
    ...patch,
  });
/** Case A — 주택→상가 일부 용도변경 + 최초공시일 < 용도변경일 */
const caseA = (patch: Record<string, unknown>) =>
  phd({
    hasPartialUsageChange: true,
    partialChangeDirection: "house_to_commercial",
    partialChangeDate: "2012-01-01",
    phdCommercialBuildingStdPriceAtFirst: "30000000",
    ...patch,
  });

export const MIXED_FIELD_JUMP_CASES: FieldJumpCase[] = [
  // ── 취득일 ──
  { name: "mixed: acquisitionDate (건물 취득일)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 건물 취득일을 입력하세요/, form: mixed({ acquisitionDate: "" }) },
  {
    name: "mixed: landAcquisitionDate", field: "landAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 토지 취득일을 입력하세요/,
    form: mixed({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "" }),
  },

  // ── 면적 정보 ──
  { name: "mixed: residentialFloorArea", field: "residentialFloorArea", step: 0, assetIndex: A, message: /^자산: 주택 연면적\(㎡\)을 입력하세요/, form: mixed({ residentialFloorArea: "" }) },
  { name: "mixed: nonResidentialFloorArea", field: "nonResidentialFloorArea", step: 0, assetIndex: A, message: /^자산: 상가 연면적\(㎡\)을 입력하세요/, form: mixed({ nonResidentialFloorArea: "" }) },
  { name: "mixed: mixedUseTotalLandArea", field: "mixedUseTotalLandArea", step: 0, assetIndex: A, message: /^자산: 전체 토지 면적/, form: mixed({ mixedUseTotalLandArea: "" }) },
  { name: "mixed: buildingFootprintArea", field: "buildingFootprintArea", step: 0, assetIndex: A, message: /^자산: 건물 정착면적/, form: mixed({ buildingFootprintArea: "" }) },
  {
    name: "mixed: mixedResidentialLandAreaOverride (범위)", field: "mixedResidentialLandAreaOverride", step: 0, assetIndex: A, message: /^자산: 주택 부수토지 면적은 0 이상/,
    form: mixed({ mixedResidentialLandAreaOverride: "999" }),
  },
  {
    name: "mixed: mixedCommercialLandAreaOverride (범위)", field: "mixedCommercialLandAreaOverride", step: 0, assetIndex: A, message: /^자산: 상가 부수토지 면적은 0 이상/,
    form: mixed({ mixedCommercialLandAreaOverride: "999" }),
  },
  {
    name: "mixed: mixedResidentialFootprintOverride (범위)", field: "mixedResidentialFootprintOverride", step: 0, assetIndex: A, message: /^자산: 주택 정착면적 면적은 0 이상/,
    form: mixed({ mixedResidentialFootprintOverride: "999" }),
  },
  {
    // 주택 부수토지 1000㎡ > 주택 정착 50㎡ × 3배 → 배율이 세액을 가른다
    name: "mixed: mixedZoneType", field: "mixedZoneType", step: 0, assetIndex: A, message: /^자산: 부수토지가 정착면적의/,
    form: mixed({ mixedUseTotalLandArea: "2000", mixedZoneType: "" }),
  },

  // ── 양도시 기준시가 ──
  { name: "mixed: mixedTransferHousingPrice", field: "mixedTransferHousingPrice", step: 0, assetIndex: A, message: /^자산: 양도시 개별주택공시가격을 입력하세요/, form: mixed({ mixedTransferHousingPrice: "" }) },
  { name: "mixed: mixedTransferLandPricePerSqm", field: "mixedTransferLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 양도시 개별공시지가/, form: mixed({ mixedTransferLandPricePerSqm: "" }) },

  // ── 매매 실거래가·매매사례 총액 + 취득시 안분 기준시가 ──
  { name: "mixed: fixedAcquisitionPrice (실거래가 총액)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 겸용주택 취득 실거래가액을 입력하세요/, form: mixed({ fixedAcquisitionPrice: "" }) },
  {
    name: "mixed: similarSalesValue (매매사례 총액)", field: "similarSalesValue", step: 0, assetIndex: A, message: /^자산: 겸용주택 매매사례가액을 입력하세요/,
    form: mixed({ isSalesCaseAcquisition: true, similarSalesValue: "" }),
  },
  {
    name: "mixed: mixedAcqHousingPrice (실거래가 안분)", field: "mixedAcqHousingPrice", step: 0, assetIndex: A, message: /^자산: 취득시 개별주택공시가격을 입력하세요\. \(주택분\/상가분/,
    form: mixed({ mixedAcqHousingPrice: "" }),
  },
  {
    name: "mixed: mixedAcqCommercialBuildingPrice (실거래가 안분)", field: "mixedAcqCommercialBuildingPrice", step: 0, assetIndex: A, message: /^자산: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요\. \(주택분\/상가분/,
    form: mixed({ mixedAcqCommercialBuildingPrice: "" }),
  },
  {
    name: "mixed: mixedAcqLandPricePerSqm (실거래가 안분)", field: "mixedAcqLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요\. \(주택분\/상가분/,
    form: mixed({ mixedAcqLandPricePerSqm: "" }),
  },

  // ── 환산취득가 ──
  {
    name: "mixed: mixedAcqHousingPrice (환산 분자)", field: "mixedAcqHousingPrice", step: 0, assetIndex: A, message: /^자산: 취득시 개별주택공시가격을 입력하세요\. \(주택분 환산취득가/,
    form: est({ mixedAcqHousingPrice: "" }),
  },
  {
    name: "mixed: mixedAcqCommercialBuildingPrice (환산 상가분)", field: "mixedAcqCommercialBuildingPrice", step: 0, assetIndex: A, message: /^자산: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요\. \(상가분 취득가액/,
    form: est({ mixedAcqCommercialBuildingPrice: "" }),
  },
  {
    name: "mixed: mixedAcqLandPricePerSqm (환산 상가분)", field: "mixedAcqLandPricePerSqm", step: 0, assetIndex: A, message: /^자산: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요\. \(상가분 취득가액/,
    form: est({ mixedAcqLandPricePerSqm: "" }),
  },

  // ── 3-시점(§164⑦) ──
  { name: "mixed: phdFirstDisclosureDate", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 최초 고시일을 입력하세요/, form: phd({ phdFirstDisclosureDate: "" }) },
  {
    name: "mixed: phdFirstDisclosureDate (§164⑦ 대상 아님)", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 취득일\(의제취득일/,
    form: phd({ phdFirstDisclosureDate: "1999-01-01" }),
  },
  { name: "mixed: phdFirstDisclosureHousingPrice", field: "phdFirstDisclosureHousingPrice", step: 0, assetIndex: A, message: /^자산: 최초 고시 개별주택가격/, form: phd({ phdFirstDisclosureHousingPrice: "" }) },
  { name: "mixed: phdLandPricePerSqmAtFirst", field: "phdLandPricePerSqmAtFirst", step: 0, assetIndex: A, message: /^자산: 최초공시일 토지 단위 공시지가/, form: phd({ phdLandPricePerSqmAtFirst: "" }) },

  // ── Case A(주택→상가 일부 용도변경, 최초공시 < 용도변경) ──
  {
    // Case A에서만 도달한다 — 비-Case A는 앞 「상가분 취득가액 산정」이 같은 값을 먼저 묻는다
    name: "mixed: phdLandPricePerSqmAtAcq (Case A)", field: "phdLandPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 취득시 토지 단위 공시지가/,
    form: caseA({ phdLandPricePerSqmAtAcq: "", mixedAcqLandPricePerSqm: "" }),
  },
  {
    name: "mixed: mixedAcqCommercialBuildingPrice (Case A 취득시 상가건물)", field: "mixedAcqCommercialBuildingPrice", step: 0, assetIndex: A, message: /^자산: Case A 4부분 안분 — 취득시 상가건물/,
    form: caseA({ mixedAcqCommercialBuildingPrice: "" }),
  },
  {
    name: "mixed: phdCommercialBuildingStdPriceAtFirst (Case A)", field: "phdCommercialBuildingStdPriceAtFirst", step: 0, assetIndex: A, message: /^자산: Case A 4부분 안분 — 최초고시 상가건물/,
    form: caseA({ phdCommercialBuildingStdPriceAtFirst: "" }),
  },

  // ── 보유 중 일부 용도변경 ──
  {
    name: "mixed: partialChangeDirection", field: "partialChangeDirection", step: 0, assetIndex: A, message: /^자산: 보유 중 일부 용도변경 — 취득시 자산 구성/,
    form: est({ hasPartialUsageChange: true, partialChangeDirection: "" }),
  },
  {
    name: "mixed: partialChangeAcqResidentialArea (형식)", field: "partialChangeAcqResidentialArea", step: 0, assetIndex: A, message: /^자산: 취득시 주택 연면적이 잘못되었습니다/,
    form: est({ hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house", partialChangeAcqResidentialArea: "-1" }),
    unreachableInUi: "면적 칸(`DecimalInput`)이 숫자·소수점 외 문자를 지운다(「-」 포함) — 음수·비숫자를 넣을 수 없다",
  },
  {
    name: "mixed: partialChangeAcqCommercialArea (형식)", field: "partialChangeAcqCommercialArea", step: 0, assetIndex: A, message: /^자산: 취득시 상가 연면적이 잘못되었습니다/,
    form: est({ hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house", partialChangeAcqCommercialArea: "-1" }),
    unreachableInUi: "면적 칸(`DecimalInput`)이 숫자·소수점 외 문자를 지운다(「-」 포함) — 음수·비숫자를 넣을 수 없다",
  },
  {
    // 화면에는 phdCommercialBuildingStdPriceAtAcq 입력칸이 없다(폐지 — 같은 값을 mixedAcqCommercialBuildingPrice가 받는다).
    // 그 값이 stale로 남아야만 앞 Case A 검증을 지나 여기에 닿는다.
    name: "mixed: mixedAcqCommercialBuildingPrice (주택→상가 용도변경)", field: "mixedAcqCommercialBuildingPrice", step: 0, assetIndex: A,
    message: /^자산: 보유 중 일부 용도변경\(주택→상가\) — 취득시 상가건물/,
    form: caseA({ mixedAcqCommercialBuildingPrice: "", phdCommercialBuildingStdPriceAtAcq: "30000000", phdBuildingStdPriceAtAcq: "" }),
    unreachableInUi:
      "`phdCommercialBuildingStdPriceAtAcq`는 입력칸이 없는 폐지 필드다 — 화면의 Case A 취득시 상가건물 칸은 `mixedAcqCommercialBuildingPrice`를 쓰고, 그 값이 비면 앞 「Case A 4부분 안분 — 취득시 상가건물」이 먼저 막는다",
  },
  {
    name: "mixed: partialChangeDate (3-시점 동시 사용)", field: "partialChangeDate", step: 0, assetIndex: A, message: /^자산: 보유 중 일부 용도변경 \+ 개별주택가격 미공시 환산 동시 사용 시/,
    form: phd({ hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house", partialChangeDate: "" }),
  },
  {
    name: "mixed: partialChangeDate (형식)", field: "partialChangeDate", step: 0, assetIndex: A, message: /^자산: 용도변경일 형식이 잘못되었습니다/,
    form: phd({ hasPartialUsageChange: true, partialChangeDirection: "commercial_to_house", partialChangeDate: "2012-13-45" }),
    unreachableInUi: "날짜 칸(`DateInput`)이 월·일을 범위 안으로 자른다(`clampDay`) — 형식이 잘못된 날짜를 넣을 수 없다",
  },

  // ── 상속·증여 취득 겸용 ──
  {
    name: "mixed: mixedHousingInheritedValueOverride (상속 주택분)", field: "mixedHousingInheritedValueOverride", step: 0, assetIndex: A, message: /^자산: 상속개시일 주택분 평가액/,
    form: mixed({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", publishedValueAtInheritance: "700000000", mixedAcqHousingPrice: "" }),
  },
  {
    name: "mixed: mixedCommercialInheritedValueOverride (상속 상가분)", field: "mixedCommercialInheritedValueOverride", step: 0, assetIndex: A, message: /^자산: 상속개시일 상가분 평가액/,
    form: mixed({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2000-01-01", publishedValueAtInheritance: "700000000", mixedAcqCommercialBuildingPrice: "" }),
  },
  {
    name: "mixed: mixedHousingGiftValueOverride (증여 주택분)", field: "mixedHousingGiftValueOverride", step: 0, assetIndex: A, message: /^자산: 증여일 주택분 평가액/,
    form: mixed({ acquisitionCause: "gift", mixedAcqHousingPrice: "" }),
  },
  {
    name: "mixed: mixedCommercialGiftValueOverride (증여 상가분)", field: "mixedCommercialGiftValueOverride", step: 0, assetIndex: A, message: /^자산: 증여일 상가분 평가액/,
    form: mixed({ acquisitionCause: "gift", mixedAcqCommercialBuildingPrice: "" }),
  },
];
