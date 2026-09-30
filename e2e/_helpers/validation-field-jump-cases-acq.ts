/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 2 취득 검증**(`transfer-tax-validate-acquisition.ts`).
 *
 * 한 메시지 = 한 케이스. 같은 키라도 분기가 다르면 화면의 다른 칸이므로 따로 둔다
 * (예: `standardPriceAtAcq` — 매매사례·감정가액·환산 3곳).
 * 규약은 Phase 1 케이스와 같다(`validation-field-jump-cases.ts` 헤더).
 */
import { CARRYOVER_DEFAULTS } from "../../lib/stores/calc-wizard-asset-carryover";
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0; // 단건 — 자산 카드 0

/** 다필지 1건 — 실거래가·일반 면적으로 통과하는 필지에서 한 칸씩 비운다 */
const parcel = (patch: Record<string, unknown> = {}) => ({
  id: "parcel-e2e-0",
  acquisitionDate: "2015-03-01",
  acquisitionMethod: "actual",
  acquisitionPrice: "100000000",
  acquisitionArea: "100",
  transferArea: "100",
  standardPricePerSqmAtAcq: "",
  standardPricePerSqmAtTransfer: "",
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
const parcels = (list: unknown[]) => () => withPrimary({ assetKind: "land", parcelMode: true, parcels: list });

/** 이월과세 — 통과하는 증여 정보에서 한 칸씩 바꾼다 */
const carry = (c: Record<string, unknown>, asset: Record<string, unknown> = {}) => () =>
  withPrimary({
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2020-01-01",
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "spouse",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "200000000",
      ...c,
    },
    ...asset,
  });
/** 이월과세 3-시점(개별주택가격 미공시) — 증여자 취득일이 최초 고시 전 */
const carryPhd = (mode: "phd" | "apd", asset: Record<string, unknown>) =>
  carry(
    { donorAcquisitionDate: "2000-01-01", useEstimatedAcquisition: true, estimationMode: mode },
    { phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: "100000000", phdTransferHousingPrice: "300000000", ...asset },
  );

/** 일반 환산 3-시점(§164⑤) — 첫 자산·주택·취득일 < 2005-04-29 */
const phd = (asset: Record<string, unknown>) => () =>
  withPrimary({
    acquisitionDate: "2000-01-01",
    useEstimatedAcquisition: true,
    usePreHousingDisclosure: true,
    acquisitionArea: "100",
    transferArea: "100",
    phdFirstDisclosureDate: "2005-04-30",
    phdFirstDisclosureHousingPrice: "100000000",
    phdLandPricePerSqmAtAcq: "500000",
    phdBuildingStdPriceAtAcq: "20000000",
    phdLandPricePerSqmAtFirst: "600000",
    phdBuildingStdPriceAtFirst: "25000000",
    phdTransferHousingPrice: "300000000",
    phdLandPricePerSqmAtTransfer: "1500000",
    phdBuildingStdPriceAtTransfer: "30000000",
    ...asset,
  });

/** 1990.8.30. 이전 취득 토지 — 환산 + 등급 환산 */
const pre1990 = (asset: Record<string, unknown>) => () =>
  withPrimary({
    assetKind: "land",
    acquisitionDate: "1985-06-01",
    useEstimatedAcquisition: true,
    pre1990Enabled: true,
    acquisitionArea: "100",
    transferArea: "100",
    pre1990PricePerSqm_1990: "100000",
    standardPriceAtTransfer: "200000000",
    pre1990Grade_current: "150",
    pre1990Grade_prev: "140",
    pre1990Grade_atAcq: "130",
    ...asset,
  });

const land = (asset: Record<string, unknown>) => () => withPrimary({ assetKind: "land", ...asset });
const selfBuilt = (asset: Record<string, unknown>) => () =>
  withPrimary({ isSelfBuilt: true, buildingType: "new", constructionDate: "2016-01-01", ...asset });

const NEGATIVE =
  "금액 칸(`CurrencyInput`)은 `allowNegative` 없이 쓰여 「-」를 지운다 — 사용자가 음수를 넣을 수 없다";

export const ACQ_FIELD_JUMP_CASES: FieldJumpCase[] = [
  // ── 다필지 ──
  { field: "parcels", step: 0, assetIndex: A, message: /^필지를 최소 1개 추가하세요/, form: parcels([]) },
  { field: "parcels.0.acquisitionDate", step: 0, assetIndex: A, message: /^필지 1: 취득일을 선택하세요/, form: parcels([parcel({ acquisitionDate: "" })]) },
  { field: "parcels.0.replottingConfirmDate", step: 0, assetIndex: A, message: /^필지 1: 환지처분확정일을 선택하세요/, form: parcels([parcel({ useDayAfterReplotting: true })]) },
  { field: "parcels.0.entitlementArea", step: 0, assetIndex: A, message: /^필지 1: 권리면적을 입력하세요/, form: parcels([parcel({ areaScenario: "reduction", allocatedArea: "80", priorLandArea: "100" })]) },
  { field: "parcels.0.allocatedArea", step: 0, assetIndex: A, message: /^필지 1: 교부면적을 입력하세요/, form: parcels([parcel({ areaScenario: "reduction", entitlementArea: "100", priorLandArea: "100" })]) },
  { field: "parcels.0.priorLandArea", step: 0, assetIndex: A, message: /^필지 1: 종전토지면적을 입력하세요/, form: parcels([parcel({ areaScenario: "reduction", entitlementArea: "100", allocatedArea: "80" })]) },
  {
    name: "parcels.0.entitlementArea (감환지 대소)", field: "parcels.0.entitlementArea", step: 0, assetIndex: A, message: /^필지 1: 감환지는 권리면적이/,
    form: parcels([parcel({ areaScenario: "reduction", entitlementArea: "80", allocatedArea: "100", priorLandArea: "100" })]),
  },
  { field: "parcels.0.transferArea", step: 0, assetIndex: A, message: /^필지 1: 양도면적을 입력하세요/, form: parcels([parcel({ transferArea: "", acquisitionArea: "" })]) },
  { field: "parcels.0.acquisitionArea", step: 0, assetIndex: A, message: /^필지 1: 총 취득면적을 입력하세요/, form: parcels([parcel({ areaScenario: "partial", acquisitionArea: "", transferArea: "50" })]) },
  {
    name: "parcels.0.acquisitionArea (양도면적 이상)", field: "parcels.0.acquisitionArea", step: 0, assetIndex: A, message: /^필지 1: 취득면적은 양도면적 이상/,
    form: parcels([parcel({ areaScenario: "partial", acquisitionArea: "30", transferArea: "50" })]),
  },
  { field: "parcels.0.standardPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^필지 1: 취득시 ㎡당 기준시가/, form: parcels([parcel({ acquisitionMethod: "estimated" })]) },
  {
    field: "parcels.0.standardPricePerSqmAtTransfer", step: 0, assetIndex: A, message: /^필지 1: 양도시 ㎡당 기준시가/,
    form: parcels([parcel({ acquisitionMethod: "estimated", standardPricePerSqmAtAcq: "100000" })]),
  },
  { field: "parcels.0.acquisitionPrice", step: 0, assetIndex: A, message: /^필지 1: 취득가액을 입력하세요/, form: parcels([parcel({ acquisitionPrice: "" })]) },

  // ── 이월과세(증여) ──
  { field: "carryover.giftRegistryDate", step: 0, assetIndex: A, message: /^자산: 증여 등기접수일을 입력하세요/, form: carry({ giftRegistryDate: "" }) },
  { field: "carryover.donorAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 증여자 취득일을 입력하세요/, form: carry({ donorAcquisitionDate: "" }) },
  {
    name: "carryover.donorAcquisitionDate (순서)", field: "carryover.donorAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 증여자 취득일은 증여 등기접수일보다/,
    form: carry({ donorAcquisitionDate: "2021-01-01" }),
  },
  {
    name: "carryover.giftRegistryDate (양도일 이후)", field: "carryover.giftRegistryDate", step: 0, assetIndex: A, message: /^자산: 증여 등기접수일은 양도일보다/,
    form: carry({ giftRegistryDate: "2024-06-01" }),
  },
  { field: "acquisitionCause", step: 0, assetIndex: A, message: /^자산: 이월과세는 배우자 또는 직계존비속/, form: carry({ donorRelation: "other" }) },
  { field: "carryover.donorRelation", step: 0, assetIndex: A, message: /^자산: 증여자와의 관계를 선택하세요/, form: carry({ donorRelation: "", donorDeceased: true }) },
  { field: "carryover.giftDateValuation", step: 0, assetIndex: A, message: /^자산: 증여 당시 평가액을 입력하세요/, form: carry({ giftDateValuation: "" }) },
  { field: "carryover.donorAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 증여자 취득가액을 입력하세요/, form: carry({ donorAcquisitionPrice: "" }) },
  { field: "carryover.estimationMode", step: 0, assetIndex: A, message: /^자산: 환산 방식\(/, form: carry({ useEstimatedAcquisition: true }) },
  {
    field: "carryover.donorStandardPriceAtAcquisition", step: 0, assetIndex: A, message: /^자산: 취득시 기준시가를 입력하세요/,
    form: carry({ useEstimatedAcquisition: true, estimationMode: "general" }),
  },
  {
    field: "carryover.donorStandardPriceAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 기준시가를 입력하세요/,
    form: carry({ useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "100000000" }),
  },
  { name: "phdFirstDisclosureDate (이월과세)", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 최초 고시일을 입력하세요/, form: carryPhd("phd", { phdFirstDisclosureDate: "" }) },
  {
    name: "phdFirstDisclosureDate (이월과세 §164⑦ 대상 아님)", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 증여자 취득일\(의제취득일/,
    form: carryPhd("phd", { phdFirstDisclosureDate: "1999-01-01" }),
  },
  {
    name: "phdFirstDisclosureHousingPrice (이월과세)", field: "phdFirstDisclosureHousingPrice", step: 0, assetIndex: A, message: /^자산: 최초 고시 개별주택가격/,
    form: carryPhd("phd", { phdFirstDisclosureHousingPrice: "" }),
  },
  {
    name: "phdTransferHousingPrice (이월과세)", field: "phdTransferHousingPrice", step: 0, assetIndex: A, message: /^자산: 양도시 개별주택가격/,
    form: carryPhd("phd", { phdTransferHousingPrice: "", standardPriceAtTransfer: "" }),
  },
  {
    name: "phdFirstDisclosureDate (이월과세 공동주택)", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 최초 고시일\(공동주택 최초공시일\)/,
    form: carryPhd("apd", { phdFirstDisclosureDate: "" }),
  },
  {
    name: "phdFirstDisclosureDate (이월과세 공동주택 §164⑦ 대상 아님)", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 증여자 취득일\(의제취득일/,
    form: carryPhd("apd", { phdFirstDisclosureDate: "1999-01-01" }),
  },
  {
    name: "phdFirstDisclosureHousingPrice (이월과세 공동주택)", field: "phdFirstDisclosureHousingPrice", step: 0, assetIndex: A, message: /^자산: 최초공시 공동주택가격/,
    form: carryPhd("apd", { phdFirstDisclosureHousingPrice: "" }),
  },
  {
    name: "phdTransferHousingPrice (이월과세 공동주택)", field: "phdTransferHousingPrice", step: 0, assetIndex: A, message: /^자산: 양도시 공동주택가격/,
    form: carryPhd("apd", { phdTransferHousingPrice: "", standardPriceAtTransfer: "" }),
  },
  {
    field: "carryover.donorCapitalExpenditure", step: 0, assetIndex: A, message: /^자산: 증여자 자본적지출은 음수/,
    form: carry({ donorCapitalExpenditure: "-1" }), unreachableInUi: NEGATIVE,
  },
  { field: "carryover.giftTaxAmount", step: 0, assetIndex: A, message: /^자산: 증여세 상당액은 음수/, form: carry({ giftTaxAmount: "-1" }), unreachableInUi: NEGATIVE },

  // ── 신축(자가건축) 취득원인 ──
  { field: "occupancyApprovalDate", step: 0, assetIndex: A, message: /^자산: 신축 주택의 사용승인일/, form: () => withPrimary({ acquisitionCause: "newConstruction" }) },
  {
    name: "fixedAcquisitionPrice (신축 비용)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 신축 비용\(취득가액\)/,
    form: () => withPrimary({ acquisitionCause: "newConstruction", occupancyApprovalDate: "2015-03-01", fixedAcquisitionPrice: "" }),
  },

  // ── 취득일 (취득원인별 입력칸이 다르다) ──
  { name: "acquisitionDate (매매)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 취득일을 입력하세요/, form: () => withPrimary({ acquisitionDate: "" }) },
  {
    name: "acquisitionDate (증여)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 취득일을 입력하세요/,
    form: () => withPrimary({ acquisitionCause: "gift", acquisitionDate: "" }),
  },

  // ── 매매사례가액 ──
  { field: "similarSalesValue", step: 0, assetIndex: A, message: /^자산: 매매사례가액을 입력하세요/, form: () => withPrimary({ isSalesCaseAcquisition: true, similarSalesValue: "" }) },
  {
    name: "standardPriceAtAcq (매매사례 개산공제)", field: "standardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 취득 당시 기준시가를 입력하세요/,
    form: () => withPrimary({ isSalesCaseAcquisition: true, similarSalesValue: "400000000", standardPriceAtAcq: "" }),
  },

  // ── 면적 시나리오 ──
  {
    name: "acquisitionArea (일부 양도 대소)", field: "acquisitionArea", step: 0, assetIndex: A, message: /^자산: 취득 당시 면적은 양도 당시 면적 이상/,
    form: land({ areaScenario: "partial", acquisitionArea: "50", transferArea: "100" }),
  },
  {
    field: "partialAcqDistinct", step: 0, assetIndex: A, message: /^자산: 일부 양도 — 「양도분 취득가액이 구분되는가」/,
    form: land({ areaScenario: "partial", acquisitionArea: "100", transferArea: "50" }),
  },
  { field: "replottingConfirmDate", step: 0, assetIndex: A, message: /^자산: 환지처분확정일을 입력하세요/, form: land({ areaScenario: "reduction" }) },
  { field: "entitlementArea", step: 0, assetIndex: A, message: /^자산: 환지 권리면적/, form: land({ areaScenario: "reduction", replottingConfirmDate: "2016-01-01" }) },
  {
    field: "allocatedArea", step: 0, assetIndex: A, message: /^자산: 환지 교부면적/,
    form: land({ areaScenario: "reduction", replottingConfirmDate: "2016-01-01", entitlementArea: "100" }),
  },
  {
    field: "priorLandArea", step: 0, assetIndex: A, message: /^자산: 환지 이전 종전면적/,
    form: land({ areaScenario: "reduction", replottingConfirmDate: "2016-01-01", entitlementArea: "100", allocatedArea: "80" }),
  },
  {
    name: "entitlementArea (감환지 대소)", field: "entitlementArea", step: 0, assetIndex: A, message: /^자산: 감환지는 권리면적이/,
    form: land({ areaScenario: "reduction", replottingConfirmDate: "2016-01-01", entitlementArea: "80", allocatedArea: "100", priorLandArea: "100" }),
  },
  { name: "replottingConfirmDate (증환지)", field: "replottingConfirmDate", step: 0, assetIndex: A, message: /^자산: 환지처분확정일을 입력하세요/, form: land({ areaScenario: "increase" }) },
  {
    name: "acquisitionArea (증환지 종전토지)", field: "acquisitionArea", step: 0, assetIndex: A, message: /^자산: 종전토지 면적/,
    // 실거래가 모드 — ① 증환지 칸의 「종전토지 면적」(A1 해소 전에는 환산 모드 ③에만 있었다)
    form: land({ areaScenario: "increase", replottingConfirmDate: "2016-01-01", acquisitionArea: "", transferArea: "100" }),
  },
  {
    name: "transferArea (증환지 권리면적)", field: "transferArea", step: 0, assetIndex: A, message: /^자산: 권리면적\(양도 당시 면적\)/,
    form: land({ areaScenario: "increase", replottingConfirmDate: "2016-01-01", acquisitionArea: "100", transferArea: "" }),
  },

  // ── 1990.8.30. 이전 토지 ──
  { name: "acquisitionArea (1990 이전 토지)", field: "acquisitionArea", step: 0, assetIndex: A, message: /^자산: 취득 당시 면적\(㎡\)을 입력하세요/, form: pre1990({ acquisitionArea: "", transferArea: "" }) },
  { field: "pre1990PricePerSqm_1990", step: 0, assetIndex: A, message: /^자산: 1990\.1\.1\. 개별공시지가/, form: pre1990({ pre1990PricePerSqm_1990: "" }) },
  { name: "standardPriceAtTransfer (1990 이전 토지)", field: "standardPriceAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도 당시 기준시가를 입력하세요/, form: pre1990({ standardPriceAtTransfer: "" }) },
  { field: "pre1990Grade_current", step: 0, assetIndex: A, message: /^자산: 1990\.8\.30\. 현재 토지등급/, form: pre1990({ pre1990Grade_current: "" }) },
  { field: "pre1990Grade_prev", step: 0, assetIndex: A, message: /^자산: 1990\.8\.30\. 직전 토지등급/, form: pre1990({ pre1990Grade_prev: "" }) },
  { field: "pre1990Grade_atAcq", step: 0, assetIndex: A, message: /^자산: 취득시 유효 토지등급/, form: pre1990({ pre1990Grade_atAcq: "" }) },

  // ── 환산취득가 ──
  {
    name: "standardPriceAtAcq (환산)", field: "standardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 취득 당시 기준시가를 입력하세요/,
    form: () => withPrimary({ useEstimatedAcquisition: true, standardPriceAtAcq: "", standardPriceAtTransfer: "300000000" }),
  },
  {
    name: "standardPriceAtTransfer (환산)", field: "standardPriceAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도 당시 기준시가를 입력하세요/,
    form: () => withPrimary({ useEstimatedAcquisition: true, standardPriceAtAcq: "100000000", standardPriceAtTransfer: "" }),
  },

  // ── 환산 3-시점(§164⑤) ──
  { field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 최초 고시일을 입력하세요/, form: phd({ phdFirstDisclosureDate: "" }) },
  {
    name: "phdFirstDisclosureDate (유효하지 않은 날)", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 최초 고시일이 유효하지 않습니다/,
    form: phd({ phdFirstDisclosureDate: "2005-02-30" }),
    unreachableInUi: "날짜 칸(`DateInput`)이 그 달의 마지막 날로 일(day)을 자른다(`clampDay`) — 존재하지 않는 날을 넣을 수 없다",
  },
  { name: "phdFirstDisclosureDate (§164⑦ 대상 아님)", field: "phdFirstDisclosureDate", step: 0, assetIndex: A, message: /^자산: 취득일\(의제취득일/, form: phd({ phdFirstDisclosureDate: "1999-01-01" }) },
  { field: "phdFirstDisclosureHousingPrice", step: 0, assetIndex: A, message: /^자산: 최초 고시 개별주택가격/, form: phd({ phdFirstDisclosureHousingPrice: "" }) },
  { name: "acquisitionArea (3-시점 토지 면적)", field: "acquisitionArea", step: 0, assetIndex: A, message: /^자산: 토지 면적\(㎡\)을 입력하세요/, form: phd({ acquisitionArea: "", transferArea: "" }) },
  { field: "phdLandPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 취득시 토지 단위 공시지가/, form: phd({ phdLandPricePerSqmAtAcq: "" }) },
  { field: "phdBuildingStdPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 취득시 건물 기준시가/, form: phd({ phdBuildingStdPriceAtAcq: "" }) },
  { field: "phdLandPricePerSqmAtFirst", step: 0, assetIndex: A, message: /^자산: 최초공시일 토지 단위 공시지가/, form: phd({ phdLandPricePerSqmAtFirst: "" }) },
  { field: "phdBuildingStdPriceAtFirst", step: 0, assetIndex: A, message: /^자산: 최초공시일 건물 기준시가/, form: phd({ phdBuildingStdPriceAtFirst: "" }) },
  { field: "phdTransferHousingPrice", step: 0, assetIndex: A, message: /^자산: 양도시 개별주택가격/, form: phd({ phdTransferHousingPrice: "" }) },
  { field: "phdLandPricePerSqmAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 토지 단위 공시지가/, form: phd({ phdLandPricePerSqmAtTransfer: "" }) },
  { field: "phdBuildingStdPriceAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 건물 기준시가/, form: phd({ phdBuildingStdPriceAtTransfer: "" }) },

  // ── 취득가액 (취득원인별) ──
  { name: "fixedAcquisitionPrice (매매)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 취득가액을 입력하세요/, form: () => withPrimary({ fixedAcquisitionPrice: "" }) },
  {
    name: "fixedAcquisitionPrice (감정가액)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 감정가액을 입력하세요/,
    form: () => withPrimary({ isAppraisalAcquisition: true, fixedAcquisitionPrice: "", standardPriceAtAcq: "100000000" }),
  },
  {
    name: "standardPriceAtAcq (감정가액 개산공제)", field: "standardPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 취득 당시 기준시가를 입력하세요/,
    form: () => withPrimary({ isAppraisalAcquisition: true, standardPriceAtAcq: "" }),
  },
  {
    name: "fixedAcquisitionPrice (증여)", field: "fixedAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 증여 신고가액을 입력하세요/,
    form: () => withPrimary({ acquisitionCause: "gift", fixedAcquisitionPrice: "" }),
  },
  {
    field: "decedentAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 피상속인 취득일을 입력하세요/,
    form: () => withPrimary({ acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", decedentAcquisitionDate: "" }),
  },
  {
    field: "decedentCohabitationHoldingStartDate", step: 0, assetIndex: A, message: /^자산: 동일세대 상속이면/,
    form: () => withPrimary({ acquisitionCause: "inheritance", publishedValueAtInheritance: "300000000", decedentAcquisitionDate: "2005-01-01", decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "" }),
  },

  // ── 신축·증축 특례(매매) ──
  { field: "buildingType", step: 0, assetIndex: A, message: /^자산: 신축·증축 구분을 선택하세요/, form: selfBuilt({ buildingType: "" }) },
  { field: "constructionDate", step: 0, assetIndex: A, message: /^자산: 신축·증축 완공일을 입력하세요/, form: selfBuilt({ constructionDate: "" }) },
  { name: "constructionDate (양도일 이후)", field: "constructionDate", step: 0, assetIndex: A, message: /^자산: 신축·증축 완공일이 양도일/, form: selfBuilt({ constructionDate: "2024-06-01" }) },
  { field: "extensionFloorArea", step: 0, assetIndex: A, message: /^자산: 증축 부분 바닥면적/, form: selfBuilt({ buildingType: "extension", extensionFloorArea: "" }) },
  {
    field: "extensionStdPriceAtAcquisition", step: 0, assetIndex: A, message: /^자산: 증축부분 취득\(완공\)당시 기준시가/,
    form: selfBuilt({ buildingType: "extension", extensionFloorArea: "30", extensionStdPriceAtAcquisition: "" }),
  },
];
