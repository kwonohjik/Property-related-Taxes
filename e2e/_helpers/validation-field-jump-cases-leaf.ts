/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 4 (leaf)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「leaf: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: 취득 검증이 부르는 0단계 하위 모듈 —
 *   `transfer-tax-validate-expropriation.ts`(공익수용·공매) · `-gift-163-9.ts` · `-usage-conversion.ts` · `-clause-a.ts` ·
 *   `-sec164.ts` · `-split.ts` · `-rental-exception.ts`. 한 메시지 = 한 케이스.
 */
import { makeDefaultRentalUnit, RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "../../lib/stores/calc-wizard-asset-factory";
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

// ── 공익수용·공매 (expropriation) ────────────────────────────────────────────
/** 수용 + 환산 + 2009.02.04 이후 양도 — 보상 2필드가 필수가 되는 바탕 */
const EXPR = {
  transferCause: "public_expropriation",
  useEstimatedAcquisition: true,
  standardPriceAtAcq: "100000000",
  standardPriceAtTransfer: "300000000",
  acquisitionArea: "100",
  transferArea: "100",
};
const expr = (patch: Record<string, unknown>) => () => withPrimary({ assetKind: "land", ...EXPR, ...patch });

/** 다필지 1건 — 환산 필지(수용 보상 2필드 필수) */
const exprParcel = (patch: Record<string, unknown> = {}) => ({
  id: "parcel-e2e-0",
  acquisitionDate: "2015-03-01",
  acquisitionMethod: "estimated",
  acquisitionPrice: "",
  acquisitionArea: "100",
  transferArea: "100",
  standardPricePerSqmAtAcq: "100000",
  standardPricePerSqmAtTransfer: "300000",
  expenses: "0",
  capitalExpenditure: "0",
  transferExpense: "0",
  useDayAfterReplotting: false,
  replottingConfirmDate: "",
  useExchangeLandReduction: false,
  entitlementArea: "",
  allocatedArea: "",
  priorLandArea: "",
  compensationPerSqm: "",
  compensationBasisStdPrice: "",
  areaScenario: "same",
  ...patch,
});
const exprParcels = (list: unknown[]) => () =>
  withPrimary({ assetKind: "land", parcelMode: true, parcels: list, transferCause: "public_expropriation" });

/** 겸용주택 정본 시드(`validation-field-jump-cases-mixed.ts`와 같다) + 수용 */
const mixedExpr = (patch: Record<string, unknown> = {}) => () =>
  withPrimary(
    {
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
      useEstimatedAcquisition: true,
      transferCause: "public_expropriation",
      ...patch,
    },
    { contractTotalPrice: "1500000000" },
  );

const EXPR_CASES: FieldJumpCase[] = [
  { name: "leaf: 공익수용 보상가액(원/㎡)", field: "compensationPerSqm", step: 0, assetIndex: A, message: /^자산: 공익수용 환산 특례 — 보상가액\(원\/㎡\)/, form: expr({}) },
  {
    name: "leaf: 공익수용 보상산정 기초 기준시가(원/㎡)", field: "compensationBasisStdPrice", step: 0, assetIndex: A,
    message: /^자산: 공익수용 환산 특례 — 보상산정 기초 기준시가\(원\/㎡\)/, form: expr({ compensationPerSqm: "1000000" }),
  },
  {
    name: "leaf: 필지 공익수용 보상가액", field: "parcels.0.compensationPerSqm", step: 0, assetIndex: A,
    message: /^필지 1: 공익수용 환산 특례 — 보상가액\(원\/㎡\)/, form: exprParcels([exprParcel()]),
  },
  {
    name: "leaf: 필지 공익수용 보상산정 기초 기준시가", field: "parcels.0.compensationBasisStdPrice", step: 0, assetIndex: A,
    message: /^필지 1: 공익수용 환산 특례 — 보상산정 기초 기준시가\(원\/㎡\)/, form: exprParcels([exprParcel({ compensationPerSqm: "1000000" })]),
  },
  {
    name: "leaf: 공매·경락가액", field: "auctionPrice", step: 0, assetIndex: A, message: /^자산: 공매·경락 특례 — 공매·경락가액/,
    form: expr({ transferCause: "general", isAuctionTransfer: true }),
  },
  { name: "leaf: 주택 수용 보상액 총액", field: "housingCompensationTotal", step: 0, assetIndex: A, message: /^자산: 주택 수용 환산 특례 — 보상액 총액/, form: expr({ assetKind: "housing" }) },
  {
    name: "leaf: 주택 수용 보상산정 기초 기준시가 총액", field: "housingCompensationBasisTotal", step: 0, assetIndex: A,
    message: /^자산: 주택 수용 환산 특례 — 보상산정 기초 기준시가 총액/, form: expr({ assetKind: "housing", housingCompensationTotal: "150000000" }),
  },
  {
    name: "leaf: 건물 분리 양도 수용 토지분 보상액", field: "splitLandCompensationTotal", step: 0, assetIndex: A,
    message: /^자산: 건물 분리 양도 공익수용 환산 특례 — 토지분 보상액 총액/,
    form: expr({ assetKind: "building", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-03-01" }),
  },
  {
    name: "leaf: 건물 분리 양도 수용 토지분 보상산정 기초", field: "splitLandCompensationBasisTotal", step: 0, assetIndex: A,
    message: /^자산: 건물 분리 양도 공익수용 환산 특례 — 토지분 보상산정 기초 기준시가 총액/,
    form: expr({ assetKind: "building", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2012-03-01", splitLandCompensationTotal: "150000000" }),
  },
  { name: "leaf: 겸용 수용 주택분 보상액", field: "housingCompensationTotal", step: 0, assetIndex: A, message: /^자산: 겸용주택 수용 — 주택분 보상액 총액/, form: mixedExpr() },
  {
    name: "leaf: 겸용 수용 주택분 보상산정 기초", field: "housingCompensationBasisTotal", step: 0, assetIndex: A,
    message: /^자산: 겸용주택 수용 — 주택분 보상산정 기초 기준시가 총액/, form: mixedExpr({ housingCompensationTotal: "150000000" }),
  },
  {
    name: "leaf: 겸용 수용 상가분 토지 보상액", field: "mixedCommercialLandCompensationTotal", step: 0, assetIndex: A,
    message: /^자산: 겸용주택 수용 — 상가분 토지 보상액 총액/,
    form: mixedExpr({ housingCompensationTotal: "150000000", housingCompensationBasisTotal: "200000000" }),
  },
  {
    name: "leaf: 겸용 수용 상가분 토지 보상산정 기초", field: "mixedCommercialLandCompensationBasisTotal", step: 0, assetIndex: A,
    message: /^자산: 겸용주택 수용 — 상가분 토지 보상산정 기초 개별공시지가 총액/,
    form: mixedExpr({ housingCompensationTotal: "150000000", housingCompensationBasisTotal: "200000000", mixedCommercialLandCompensationTotal: "100000000" }),
  },
];

// ── 용도변경 · 가목 선언 (usage-conversion · clause-a) ──
// ※ `gift-163-9`(증여 환산 불가)는 field를 달지 않는다 — 증여로 바꾸면 모드 라디오가 사라져 고칠 칸이 없다(막다른 오류 — 보고서 참조).
const MISC_CASES: FieldJumpCase[] = [
  { name: "leaf: 주거용 사용 개시일", field: "residentialUseStartDate", step: 0, assetIndex: A, message: /^자산: 사실상 주거용 사용 개시일을 입력하세요/, form: () => withPrimary({ hasNonHousingConversion: true, residentialUseStartDate: "" }) },
  {
    name: "leaf: 주거용 사용 개시일 ≤ 취득일", field: "residentialUseStartDate", step: 0, assetIndex: A, message: /^자산: 주거용 사용 개시일은 취득일 이후여야 합니다/,
    form: () => withPrimary({ hasNonHousingConversion: true, residentialUseStartDate: "2014-01-01" }),
  },
  {
    name: "leaf: 주거용 사용 개시일 ≥ 양도일", field: "residentialUseStartDate", step: 0, assetIndex: A, message: /^자산: 주거용 사용 개시일은 양도일 이전이어야 합니다/,
    form: () => withPrimary({ hasNonHousingConversion: true, residentialUseStartDate: "2025-01-01" }),
  },
  // ── §97③ 감가상각비 (depreciation) — 취득가액 한도 · 받을 수 없는 구조의 stale 값 ──
  {
    name: "leaf: 감가상각비 > 취득가액", field: "depreciationAmount", step: 0, assetIndex: A, message: /^자산: 감가상각비\(.*\)가 취득가액\(.*\)보다 클 수 없습니다/,
    form: () => withPrimary({ assetKind: "building", acquisitionCause: "purchase", fixedAcquisitionPrice: "100000000", depreciationAmount: "200000000" }),
  },
  {
    // 칸이 사라진 구조의 stale 값 — 이동 대상은 안내 카드의 「지우기」 버튼(`data-field="depreciationAmount"`)이다.
    name: "leaf: 감가상각비 — 받을 수 없는 구조(일부 양도)의 stale 값", field: "depreciationAmount", step: 0, assetIndex: A, message: /^자산: 일부 양도·환지 등으로 면적이 달라지는 경우 .*감가상각비 입력값은 계산에 반영되지 않으므로 0으로 지우세요/,
    // `building`은 시나리오가 `same` 단일이라 복원 시 `partial`이 `same`으로 정규화된다(`calc-wizard-asset-migrate.ts`) —
    // 일부 양도를 실제로 유지하는 건물 보유 자산은 주택이다(`AREA_SCENARIOS_BY_ASSET_KIND`).
    form: () => withPrimary({ assetKind: "housing", areaScenario: "partial", depreciationAmount: "1000" }),
  },
];

/** 의제취득일(1985.1.1.) 전 상속 — 가목(§163⑨ 평가액) 확인 불가를 선언해 나목(환산)으로 가는 바탕 */
const preDeemed = (patch: Record<string, unknown>) => () =>
  withPrimary({
    acquisitionCause: "inheritance",
    acquisitionDate: "1984-06-01",
    decedentAcquisitionDate: "1980-01-01",
    useEstimatedAcquisition: true,
    preDeemedClauseAUnconfirmed: true,
    ...patch,
  });

const CLAUSE_A_CASES: FieldJumpCase[] = [
  {
    name: "leaf: 가목 확인 불가 선언", field: "preDeemedClauseAUnconfirmed", step: 0, assetIndex: A,
    message: /^자산: 「소득세법」 §97①1호 단서상 환산 등 추계는/,
    form: preDeemed({ preDeemedClauseAUnconfirmed: false, standardPriceAtAcq: "" }),
  },
  {
    name: "leaf: 상속개시일 평가액 (의제취득일 후 상속)", field: "publishedValueAtInheritance", step: 0, assetIndex: A,
    message: /^자산: 상속개시일 평가액\(상속세 신고가액\)을 입력하세요/,
    form: () => withPrimary({ acquisitionCause: "inheritance", acquisitionDate: "1990-06-01", decedentAcquisitionDate: "1988-01-01", publishedValueAtInheritance: "" }),
  },
  {
    name: "leaf: 의제취득일 현재 기준시가", field: "standardPriceAtAcq", step: 0, assetIndex: A,
    message: /^자산: 의제취득일\(1985\.1\.1\.\) 전 상속·증여 자산을 환산하려면 의제취득일 현재 기준시가/, form: preDeemed({ standardPriceAtAcq: "" }),
  },
  {
    name: "leaf: 의제취득일 전 환산 양도시 기준시가", field: "standardPriceAtTransfer", step: 0, assetIndex: A,
    message: /^자산: 의제취득일 전 상속·증여 자산의 환산에는 양도시 기준시가가 필요합니다/,
    form: preDeemed({ standardPriceAtAcq: "100000000", standardPriceAtTransfer: "" }),
  },
];

// ── §164 일부 입력(sec164) · 동일조정기간(SAP) ───────────────────────────────
const INH = { acquisitionCause: "inheritance", decedentAcquisitionDate: "1980-01-01", publishedValueAtInheritance: "100000000" };
const sec = (patch: Record<string, unknown>) => () =>
  withPrimary({ ...INH, acquisitionDate: "2000-01-01", decedentAcquisitionDate: "2000-01-01", ...patch });

const SAP = { useEstimatedAcquisition: true, standardPriceAtAcq: "100000000", standardPriceAtTransfer: "300000000", sapEnabled: true };
const sap = (patch: Record<string, unknown> = {}) => () => withPrimary({ ...SAP, ...patch });
const SEC_MSG = (clause: string) => new RegExp(`^자산: ${clause} 취득당시 기준시가는 \\d+개 항목을 \\*\\*모두\\*\\* 입력하거나`);

const SEC164_CASES: FieldJumpCase[] = [
  {
    // §163⑨1호 비교 맥락(의제취득일 이후 상속) — 칸이 항상 열려 있으므로 빈 칸으로 간다(별건 B3 — 종전엔 숨은 토글로 데려갔다)
    name: "leaf: §164④ 토지 일부 입력 — 빈 등급 칸 (§163⑨1호 비교, 칸 상시 노출)", field: "pre1990Grade_current", step: 0, assetIndex: A, message: SEC_MSG("§164④"),
    form: () => withPrimary({ ...INH, assetKind: "land", acquisitionDate: "1989-01-01", decedentAcquisitionDate: "1988-01-01", acquisitionArea: "100", pre1990Enabled: false, pre1990PricePerSqm_1990: "50000" }),
  },
  {
    // 의제취득일 前 상속 — 토글이 환산 모드를 정하므로 그대로 토글로 간다(칸은 토글 뒤)
    name: "leaf: §164④ 토지 일부 입력 — 환산 토글(의제취득일 前, 칸이 숨은 상태)", field: "pre1990Enabled", step: 0, assetIndex: A, message: SEC_MSG("§164④"),
    form: () => withPrimary({ ...INH, assetKind: "land", acquisitionDate: "1980-01-01", decedentAcquisitionDate: "1979-01-01", acquisitionArea: "100", pre1990Enabled: false, pre1990PricePerSqm_1990: "50000" }),
  },
  { name: "leaf: §164⑤~⑦ 주택 일부 입력 — 양도시 개별공시지가", field: "inhHouseValLandPricePerSqmAtTransfer", step: 0, assetIndex: A, message: SEC_MSG("§164⑤~⑦"), form: sec({ inhHouseValLandArea: "100" }) },
  {
    name: "leaf: §164⑤~⑦ 주택 일부 입력 — 취득당시 개별공시지가", field: "inhHouseValLandPricePerSqmAtInheritance", step: 0, assetIndex: A, message: SEC_MSG("§164⑤~⑦"),
    form: sec({ inhHouseValLandArea: "100", inhHouseValLandPricePerSqmAtTransfer: "1000000", inhHouseValLandPricePerSqmAtFirst: "900000", inhHouseValHousePriceAtFirst: "200000000" }),
  },
  {
    name: "leaf: §164⑥ 상가 일부 입력 — 취득시 개별공시지가", field: "cbLandPricePerSqmAtAcq", step: 0, assetIndex: A, message: SEC_MSG("§164⑥"),
    form: sec({ assetKind: "commercial_building", cbExclusiveArea: "50", cbSharedArea: "10", cbLandArea: "20", cbUnitPriceAtFirstOrAcq: "1000000" }),
  },
  {
    name: "leaf: 동일조정기간 최초고시 기준시가", field: "sapFirstNoticeStdPrice", step: 0, assetIndex: A, message: /^자산: 전기의 기준시가를 「최초고시 × 기준율」로 산정하려면/,
    form: sap({ sapPriorBasis: "first_notice_rate" }),
  },
  {
    name: "leaf: 동일조정기간 고시 기준율", field: "sapNoticeBaseRate", step: 0, assetIndex: A, message: /^자산: 전기의 기준시가를 「최초고시 × 기준율」로 산정하려면/,
    form: sap({ sapPriorBasis: "first_notice_rate", sapFirstNoticeStdPrice: "100000000" }),
  },
  {
    name: "leaf: 동일조정기간 합계액 비율환산 — 취득당시 기준시가", field: "standardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 전기의 기준시가를 「합계액 비율환산」으로 산정하려면/,
    form: sap({ standardPriceAtAcq: "", sapPriorBasis: "ratio_conversion" }),
  },
  {
    name: "leaf: 동일조정기간 합계액 비율환산 — 전기 합계액", field: "sapPriorLandBuildingSum", step: 0, assetIndex: A, message: /^자산: 전기의 기준시가를 「합계액 비율환산」으로 산정하려면/,
    form: sap({ sapPriorBasis: "ratio_conversion" }),
  },
  {
    name: "leaf: 동일조정기간 합계액 비율환산 — 취득당시 합계액", field: "sapAcqLandBuildingSum", step: 0, assetIndex: A, message: /^자산: 전기의 기준시가를 「합계액 비율환산」으로 산정하려면/,
    form: sap({ sapPriorBasis: "ratio_conversion", sapPriorLandBuildingSum: "100000000" }),
  },
  { name: "leaf: 동일조정기간 전기의 기준시가", field: "sapPriorStdPrice", step: 0, assetIndex: A, message: /^자산: 동일조정기간 환산\(소득세법 시행규칙 §80①1호가목\)에는 전기의 기준시가/, form: sap() },
  { name: "leaf: 동일조정기간 새로운 기준시가", field: "sapNewStdPrice", step: 0, assetIndex: A, message: /^자산: 동일조정기간 환산\(소득세법 시행규칙 §80①1호나목\)에는 새로운 기준시가/, form: sap({ sapFormula: "new" }) },
  {
    name: "leaf: 동일조정기간 보유월수 > 조정월수", field: "sapAdjustMonths", step: 0, assetIndex: A, message: /^자산: 보유기간 월수\(\d+\)가 기준시가 조정월수\(1\)보다 큽니다/,
    form: sap({ sapFormula: "new", sapNewStdPrice: "300000000", sapAdjustMonths: "1" }),
  },
  { name: "leaf: 동일조정기간 조정월수 0", field: "sapAdjustMonths", step: 0, assetIndex: A, message: /^자산: 기준시가 조정월수는 1개월 이상/, form: sap({ sapPriorStdPrice: "90000000", sapAdjustMonths: "0" }) },
];

// ── 토지·건물 분리(split) ────────────────────────────────────────────────────
/** 별개 취득(토지 2012 · 건물 2015) 주택 — 파트별 실거래가 */
const SPL = {
  assetKind: "housing",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2012-03-01",
  acquisitionDate: "2015-03-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "200000000",
  buildingAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "",
};
/** 일괄양도 안분에 필요한 양도시 기준시가 — 토지(단가 × 양도면적) + 건물 */
const SALE = { standardPricePerSqmAtTransfer: "1000000", transferArea: "100", buildingStandardPriceAtTransfer: "100000000" };
const spl = (patch: Record<string, unknown> = {}) => () => withPrimary({ ...SPL, ...patch });
/** 토지만 본인 소유(`selfOwns`) — 화면의 소유자 토글이 분리를 강제로 켠다(`CompanionAcquisitionCauseSection` onSelfOwnsChange). 취득일은 같다 */
const owner = (patch: Record<string, unknown>) => () =>
  withPrimary({ assetKind: "housing", selfOwns: "land_only", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-03-01", ...patch });
const splSale = (patch: Record<string, unknown> = {}) => () => withPrimary({ ...SPL, ...SALE, ...patch });

const SPLIT_CASES: FieldJumpCase[] = [
  { name: "leaf: split 토지 취득가액", field: "landAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 토지 취득가액을 입력하세요 — 토지·건물 취득시기가 다르면/, form: spl({ landAcquisitionPrice: "" }) },
  { name: "leaf: split 건물 취득가액", field: "buildingAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 건물 취득가액을 입력하세요 — 토지·건물 취득시기가 다르면/, form: spl({ buildingAcquisitionPrice: "" }) },
  { name: "leaf: split 토지 매매사례가액", field: "landSalesCaseValue", step: 0, assetIndex: A, message: /^자산: 토지 매매사례가액을 입력하세요/, form: spl({ landAcqMode: "salesCase", landSalesCaseValue: "" }) },
  { name: "leaf: split 건물 매매사례가액", field: "buildingSalesCaseValue", step: 0, assetIndex: A, message: /^자산: 건물 매매사례가액을 입력하세요/, form: spl({ buildingAcqMode: "salesCase", buildingSalesCaseValue: "" }) },
  {
    name: "leaf: split 부수토지 소재지 구분", field: "appurtenantLandZone", step: 0, assetIndex: A, message: /^자산: 토지 면적\(400㎡\)이 건물 정착면적의 3배를 초과합니다/,
    form: spl({ buildingFootprintArea: "100", acquisitionArea: "400", appurtenantLandZone: undefined }),
  },
  // 매매 취득 + 실거래가의 소유자 분리 — 취득시 기준시가 카드가 열리고(두 파트 비움 = 비율 안분) 주택에는 ㎡당 칸을 연다(별건 B2).
  // 본인 파트 취득가액을 입력하면 비율이 안 쓰여 요구하지 않는다(⑧ V8 ↔ ⑫·술어) — 그쪽은 `transfer-dead-end-defects.spec.ts`가 고정한다.
  {
    name: "leaf: split 소유자 분리 — ㎡당 개별공시지가 (매매 실거래가)", field: "standardPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세/,
    form: owner({ acquisitionCause: "purchase", ...SALE, acquisitionArea: "100" }),
  },
  {
    name: "leaf: split 소유자 분리 — ㎡당 개별공시지가 (상속)", field: "standardPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세/,
    form: owner({ acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-03-01", publishedValueAtInheritance: "300000000" }),
  },
  {
    // 건물(비주거)은 `StandardPriceInput` 단가×면적 모드 — ㎡당 단가 칸은 `fieldPricePerSqm` 앵커로 닿는다
    name: "leaf: split 소유자 분리 — ㎡당 개별공시지가 (건물·상속, 단가×면적 모드)", field: "standardPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세/,
    form: owner({ assetKind: "building", acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-03-01", publishedValueAtInheritance: "300000000" }),
  },
  { name: "leaf: split 소유자 분리 — 면적", field: "acquisitionArea", step: 0, assetIndex: A, message: /^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세/, form: owner({ standardPricePerSqmAtAcq: "1000000" }) },
  {
    name: "leaf: split 소유자 분리 — 기준시가 총액", field: "standardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세/,
    form: owner({ acquisitionArea: "100", standardPricePerSqmAtAcq: "1000000" }),
  },
  // S3-1 — 주택 소유자 분리는 개별주택가격(총액)을 가목:나목 비례로 안분하므로 단가·면적·총액 다음에 **취득시 건물 기준시가(나목)** 를 요구한다.
  // 칸은 토지 단가 바로 아래(`acq-building-std-card`)에 열려 있다 — 요구와 노출이 같은 술어다.
  {
    name: "leaf: split 소유자 분리 — 취득시 건물 기준시가 (매매 실거래가)", field: "buildingStandardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세/,
    form: owner({ acquisitionCause: "purchase", ...SALE, acquisitionArea: "100", standardPricePerSqmAtAcq: "1000000", standardPriceAtAcq: "250000000" }),
  },
  {
    name: "leaf: split 소유자 분리 — 취득시 건물 기준시가 (상속)", field: "buildingStandardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 토지·건물 소유자가 다르면 본인 소유분만 과세/,
    form: owner({
      acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-03-01", publishedValueAtInheritance: "300000000",
      acquisitionArea: "100", standardPricePerSqmAtAcq: "1000000", standardPriceAtAcq: "250000000",
    }),
  },
  {
    name: "leaf: split 건물분 기준시가 입력 시 토지분 단가", field: "standardPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 건물분 취득시 기준시가를 입력하면 토지분도/,
    form: spl({ landAcqMode: "estimated", buildingAcqMode: "estimated", buildingStandardPriceAtAcq: "50000000", standardPriceAtTransfer: "300000000" }),
  },
  {
    name: "leaf: split 건물분 취득시 기준시가", field: "buildingStandardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 건물분 취득시 기준시가를 입력하세요/,
    form: spl({ landAcqMode: "estimated", buildingAcqMode: "estimated", standardPricePerSqmAtAcq: "1000000", acquisitionArea: "100", standardPriceAtTransfer: "300000000" }),
  },
  { name: "leaf: split 구분양도 근거 없음", field: "landTransferPrice", step: 0, assetIndex: A, message: /^자산: 구분양도를 선택했으면 토지·건물 양도가액을 입력하거나/, form: spl({ saleSplitMode: "actual" }) },
  { name: "leaf: split 양도시 토지 기준시가 — 단가", field: "standardPricePerSqmAtTransfer", step: 0, assetIndex: A, message: /^자산: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 토지분/, form: spl({ saleSplitMode: "apportioned" }) },
  {
    name: "leaf: split 양도시 토지 기준시가 — 양도면적", field: "transferArea", step: 0, assetIndex: A, message: /^자산: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 토지분/,
    form: spl({ saleSplitMode: "apportioned", standardPricePerSqmAtTransfer: "1000000" }),
  },
  {
    name: "leaf: split 양도시 건물 기준시가", field: "buildingStandardPriceAtTransfer", step: 0, assetIndex: A, message: /^자산: 일괄양도 안분·환산취득가 계산에는 양도시 기준시가 중 건물분/,
    form: spl({ saleSplitMode: "apportioned", standardPricePerSqmAtTransfer: "1000000", transferArea: "100" }),
  },
  { name: "leaf: split 양도시 감정평가 한쪽만", field: "buildingAppraisalAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 감정평가가액은 토지·건물 양쪽 모두 필요합니다/, form: splSale({ landAppraisalAtTransfer: "300000000" }) },
  { name: "leaf: split 감정평가 선택 후 미입력", field: "landAppraisalAtTransfer", step: 0, assetIndex: A, message: /^자산: 「감정평가」를 선택했으면 토지·건물 감정평가가액을 입력하세요/, form: splSale({ saleSplitMode: "appraisal" }) },
  {
    name: "leaf: split §166⑧ 예외 근거", field: "saleSplitExemptionNote", step: 0, assetIndex: A, message: /^자산: 「소득세법 시행령」 제166조 제8항 예외를 선택했으면 그 근거/,
    form: splSale({ saleSplitMode: "actual", landTransferPrice: "300000000", buildingTransferPrice: "200000000", saleSplitExemption: true }),
  },
  { name: "leaf: split 토지 양도가액 > 총액", field: "landTransferPrice", step: 0, assetIndex: A, message: /^자산: 토지 양도가액이 양도가액\(500,000,000원\)을 초과합니다/, form: splSale({ saleSplitMode: "actual", landTransferPrice: "900000000" }) },
  {
    name: "leaf: split 토지·건물 양도가액 합 > 총액", field: "landTransferPrice", step: 0, assetIndex: A, message: /^자산: 토지·건물 양도가액의 합이 양도가액/,
    form: splSale({ saleSplitMode: "actual", landTransferPrice: "300000000", buildingTransferPrice: "300000000" }),
  },
  {
    name: "leaf: split 토지·건물 취득가액 합 > 총액", field: "landAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 토지·건물 취득가액의 합이 취득가액/,
    form: splSale({ landAcquisitionDate: "2015-03-01", fixedAcquisitionPrice: "100000000" }),
  },
  {
    name: "leaf: split 토지 취득가액 > 총액", field: "landAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 토지 취득가액이 취득가액\(100,000,000원\)을 초과합니다/,
    form: splSale({ landAcquisitionDate: "2015-03-01", fixedAcquisitionPrice: "100000000", buildingAcquisitionPrice: "" }),
  },
  { name: "leaf: split 자본적지출 불일치", field: "landDirectExpenses", step: 0, assetIndex: A, message: /^자산: 토지·건물 자본적지출이 총 자본적지출\(100원\)과 맞지 않습니다/, form: splSale({ directExpenses: "100", landDirectExpenses: "200" }) },
  { name: "leaf: split 자본적지출 파트별 입력", field: "landDirectExpenses", step: 0, assetIndex: A, message: /^자산: 토지·건물을 나눠 계산하는 자산은 자본적지출도 토지분·건물분 칸에/, form: splSale({ capitalExpenditure: "1000000" }) },
];

// ── 장기임대주택 거주주택 특례 (rental-exception — 소령 §155⑳) ─────────────────
// ※ 케이스가 없는 메시지 — 계산기에서 고칠 칸이 없다:
//   · 시나리오·임대주택 호별 정보(0호 · 사업자등록일 · 구간 · 나·라·건설 요건 · 기준시가 · 말소 · 자기확인) — 계산기 카드(`mode="calc"`)는
//     읽기 전용이고 「판정 메뉴로 돌아가 다시 판정하세요」라고 안내한다(E2E 실측: 20건 모두 입력칸 없음).
//   · 「2019.2.12 이후 취득… 이력이 있는지 선택하세요」(`priorRentalExemptionHistory`) — ⑧이 `facts` 모드로 부를 때만 나온다(판정 메뉴 전용).
const unit = (o: Record<string, unknown> = {}) => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2018-01-01",
  rentalRegistrationDate: "2018-01-01",
  standardPriceAtRentalStart: "300000000",
  requirementsConfirmed: true,
  ...o,
});
const rh = (o: Record<string, unknown> = {}, units: unknown[] = [unit()]) => ({
  ...RENTAL_HOUSING_EXCEPTION_DEFAULTS,
  applyException: true,
  rentalUnits: units,
  ...o,
});
/** 통과하는 장기임대 특례(거주 36개월) — 한 칸씩 비운다 */
const R = (o: Record<string, unknown> = {}, units?: unknown[], asset: Record<string, unknown> = {}, formPatch: Record<string, unknown> = {}) => () =>
  withPrimary({ residencePeriodMonthsAsset: "36", rentalHousingException: rh(o, units), ...asset }, formPatch);
const PHRP = { scenario: "B", priorResidenceTransferDate: "2020-01-01", standardPriceAtAcquisitionForPhrp: "100000000", standardPriceAtPriorTransfer: "150000000", standardPriceAtTransferForPhrp: "300000000" };

const RENTAL_CASES: FieldJumpCase[] = [
  { name: "leaf: rental §154⑩ 임대 등록·어린이집 사실", field: "rentalHousingException.wasRegisteredRentalOrChildcare", step: 0, assetIndex: A, message: /^자산: 장기임대주택 특례\(§154⑩\) — 이 주택이 임대주택으로 등록/, form: R({ scenario: "B" }, []) },
  { name: "leaf: rental PHRP 직전거주주택 양도일", field: "rentalHousingException.priorResidenceTransferDate", step: 0, assetIndex: A, message: /^자산: PHRP 시나리오 — 직전거주주택 양도일/, form: R({ scenario: "B", postRegistrationResidenceMonths: "30" }) },
  {
    name: "leaf: rental PHRP 취득 당시 기준시가", field: "rentalHousingException.standardPriceAtAcquisitionForPhrp", step: 0, assetIndex: A, message: /^자산: 임대→거주 전환 주택 시나리오 — 취득 당시 기준시가를 입력하세요/,
    form: R({ scenario: "B", priorResidenceTransferDate: "2020-01-01", postRegistrationResidenceMonths: "30" }),
  },
  {
    name: "leaf: rental PHRP 직전 양도 당시 기준시가", field: "rentalHousingException.standardPriceAtPriorTransfer", step: 0, assetIndex: A, message: /^자산: 임대→거주 전환 주택 시나리오 — 직전거주주택 양도 당시 기준시가/,
    form: R({ scenario: "B", priorResidenceTransferDate: "2020-01-01", standardPriceAtAcquisitionForPhrp: "100000000", postRegistrationResidenceMonths: "30" }),
  },
  {
    name: "leaf: rental PHRP 현 양도 당시 기준시가", field: "rentalHousingException.standardPriceAtTransferForPhrp", step: 0, assetIndex: A, message: /^자산: 임대→거주 전환 주택 시나리오 — 현 양도 당시 기준시가를 입력하세요/,
    form: R({ scenario: "B", priorResidenceTransferDate: "2020-01-01", standardPriceAtAcquisitionForPhrp: "100000000", standardPriceAtPriorTransfer: "150000000", postRegistrationResidenceMonths: "30" }),
  },
  {
    name: "leaf: rental PHRP 직전 < 취득 기준시가", field: "rentalHousingException.standardPriceAtPriorTransfer", step: 0, assetIndex: A, message: /^자산: PHRP 시나리오 — 직전 양도 당시 기준시가\(150,000,000\)가 취득 당시/,
    form: R({ ...PHRP, standardPriceAtAcquisitionForPhrp: "200000000", postRegistrationResidenceMonths: "30" }),
  },
  {
    name: "leaf: rental PHRP 현 < 직전 기준시가", field: "rentalHousingException.standardPriceAtTransferForPhrp", step: 0, assetIndex: A, message: /^자산: PHRP 시나리오 — 현 양도 당시 기준시가\(250,000,000\)가 직전 양도 당시/,
    form: R({ ...PHRP, standardPriceAtPriorTransfer: "300000000", standardPriceAtTransferForPhrp: "250000000", postRegistrationResidenceMonths: "30" }),
  },
  {
    name: "leaf: rental PHRP 취득 = 현 기준시가", field: "rentalHousingException.standardPriceAtTransferForPhrp", step: 0, assetIndex: A, message: /^자산: PHRP 시나리오 — 취득 당시와 현 양도 당시 기준시가가 동일/,
    form: R({ ...PHRP, standardPriceAtAcquisitionForPhrp: "100000000", standardPriceAtPriorTransfer: "100000000", standardPriceAtTransferForPhrp: "100000000", postRegistrationResidenceMonths: "30" }),
  },
  { name: "leaf: rental 등록 이후 거주기간 미입력", field: "rentalHousingException.postRegistrationResidenceMonths", step: 0, assetIndex: A, message: /^자산: 임대→거주 전환 주택 시나리오 — 사업자등록·임대사업자 등록 이후 거주기간\(개월\)을 입력/, form: R(PHRP) },
  { name: "leaf: rental 등록 이후 거주기간 > 전체", field: "rentalHousingException.postRegistrationResidenceMonths", step: 0, assetIndex: A, message: /^자산: 임대→거주 전환 주택 시나리오 — 등록 이후 거주기간\(40개월\)이 전체/, form: R({ ...PHRP, postRegistrationResidenceMonths: "40" }) },
  { name: "leaf: rental 등록 이후 거주기간 < 24", field: "rentalHousingException.postRegistrationResidenceMonths", step: 0, assetIndex: A, message: /^자산: 장기임대주택 특례 — 임대→거주 전환 주택은 사업자등록·임대사업자 등록 이후 거주기간이 2년/, form: R({ ...PHRP, postRegistrationResidenceMonths: "10" }) },
  { name: "leaf: rental 거주기간 < 24개월", field: "residencePeriods", step: 0, assetIndex: A, message: /^자산: 장기임대주택 특례 — 거주주택 거주기간 2년\(24개월\) 이상이 필요합니다/, form: R({}, undefined, { residencePeriodMonthsAsset: "10" }) },
  { name: "leaf: rental 보유기간 < 730일", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 장기임대주택 특례 — 거주주택 보유기간 2년\(730일\) 이상이 필요합니다/, form: R({}, undefined, { acquisitionDate: "2023-06-01" }) },
  {
    name: "leaf: rental §154⑩ 종전규정 거주 24개월", field: "residencePeriods", step: 0, assetIndex: A, message: /^자산: 장기임대주택 특례\(§154⑩\) — 2019\.2\.12 전 취득으로/,
    form: R({ ...PHRP, wasRegisteredRentalOrChildcare: true }, [], { acquisitionDate: "2015-03-01", residencePeriodMonthsAsset: "10" }, { wasRegulatedAtAcquisition: true }),
  },
];

export const LEAF_FIELD_JUMP_CASES: FieldJumpCase[] = [...EXPR_CASES, ...MISC_CASES, ...CLAUSE_A_CASES, ...SEC164_CASES, ...SPLIT_CASES, ...RENTAL_CASES];
