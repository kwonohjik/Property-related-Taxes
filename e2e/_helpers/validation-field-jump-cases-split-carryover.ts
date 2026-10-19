/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **파트 이월과세 C**(주택 통째 이월과세 + 증여자 토지·건물 취득일 상이). 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「c: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `transfer-tax-validate-split-carryover.ts` · `transfer-tax-validate-step1.ts`(S9) · `transfer-tax-validate-split.ts`(C 분기).
 * 이동 앵커는 화면에 각 1개씩 있다(`SplitPartCarryoverCard`·`SplitCarryoverParts`·`CarryoverDonorSplitToggle`).
 */
import { CARRYOVER_DEFAULTS } from "../../lib/stores/calc-wizard-asset-carryover";
import { bundle, withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 통과하는 C — 양도 5억(토지 3억 + 건물 2억) · 증여 2021-03-01 · 토지 증여자 2005-02-01 · 건물 증여자 2012-06-01 */
const cAsset = (over: Record<string, unknown> = {}, carry: Record<string, unknown> = {}, land: Record<string, unknown> = {}) => ({
  acquisitionCause: "carryover_gift",
  carryoverDonorSplit: true,
  acquisitionDate: "",
  fixedAcquisitionPrice: "",
  carryover: {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: "2021-03-01",
    donorAcquisitionDate: "2012-06-01",
    donorAcquisitionPrice: "40000000",
    giftTaxCalculated: "10000000",
    giftTaxBase: "300000000",
    donorRelation: "lineal",
    ...carry,
  },
  landCarryover: { ...CARRYOVER_DEFAULTS, donorAcquisitionDate: "2005-02-01", donorAcquisitionPrice: "30000000", ...land },
  landAcquisitionPrice: "100000000",
  buildingAcquisitionPrice: "200000000",
  saleSplitMode: "actual",
  landTransferPrice: "300000000",
  buildingTransferPrice: "200000000",
  landStandardPriceAtTransfer: "300000000",
  buildingStandardPriceAtTransfer: "200000000",
  ...over,
});
const c = (over: Record<string, unknown> = {}, carry: Record<string, unknown> = {}, land: Record<string, unknown> = {}, formPatch: Record<string, unknown> = {}) => () =>
  withPrimary(cAsset(over, carry, land), formPatch);

export const SPLIT_CARRYOVER_FIELD_JUMP_CASES: FieldJumpCase[] = [
  { name: "c: carryover.giftRegistryDate (비움)", field: "carryover.giftRegistryDate", step: 0, assetIndex: A, message: /^자산: 증여 등기접수일을 입력하세요/, form: c({}, { giftRegistryDate: "" }) },
  { name: "c: carryover.giftRegistryDate (양도일 이후)", field: "carryover.giftRegistryDate", step: 0, assetIndex: A, message: /^자산: 증여 등기접수일은 양도일보다/, form: c({}, { giftRegistryDate: "2024-03-01" }) },
  { name: "c: acquisitionCause (관계 그 외)", field: "acquisitionCause", step: 0, assetIndex: A, message: /^자산: 이월과세는 배우자 또는 직계존비속/, form: c({}, { donorRelation: "other" }) },
  { name: "c: carryover.donorRelation (사망 선언 + 관계 미선택)", field: "carryover.donorRelation", step: 0, assetIndex: A, message: /^자산: 증여자와의 관계를 선택하세요/, form: c({}, { donorDeceased: true, donorRelation: "" }) },
  // ── 토지 파트 ──
  { name: "c: landCarryover.donorAcquisitionDate (비움)", field: "landCarryover.donorAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 토지 증여자 취득일을 입력하세요/, form: c({}, {}, { donorAcquisitionDate: "" }) },
  { name: "c: landCarryover.donorAcquisitionDate (증여일 이후)", field: "landCarryover.donorAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 토지 증여자 취득일은 증여 등기접수일보다/, form: c({}, {}, { donorAcquisitionDate: "2021-03-02" }) },
  { name: "c: landCarryover.donorAcquisitionPrice", field: "landCarryover.donorAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 토지 증여자 취득가액을 입력하세요/, form: c({}, {}, { donorAcquisitionPrice: "" }) },
  { name: "c: landAcquisitionPrice (토지 증여 신고가액)", field: "landAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 토지 증여 신고가액/, form: c({ landAcquisitionPrice: "" }) },
  // ── 건물 파트 ──
  { name: "c: carryover.donorAcquisitionDate (건물 비움)", field: "carryover.donorAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 건물 증여자 취득일을 입력하세요/, form: c({}, { donorAcquisitionDate: "" }) },
  { name: "c: carryover.donorAcquisitionPrice (건물)", field: "carryover.donorAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 건물 증여자 취득가액을 입력하세요/, form: c({}, { donorAcquisitionPrice: "" }) },
  { name: "c: buildingAcquisitionPrice (건물 증여 신고가액)", field: "buildingAcquisitionPrice", step: 0, assetIndex: A, message: /^자산: 건물 증여 신고가액/, form: c({ buildingAcquisitionPrice: "" }) },
  // ── 증여세 ──
  { name: "c: carryover.giftTaxBase (비움)", field: "carryover.giftTaxBase", step: 0, assetIndex: A, message: /^자산: 증여세 과세가액을 입력하세요/, form: c({}, { giftTaxBase: "" }) },
  { name: "c: carryover.giftTaxBase (파트 평가액 합 초과)", field: "carryover.giftTaxBase", step: 0, assetIndex: A, message: /^자산: 토지·건물 증여 신고가액의 합이 증여세 과세가액을 초과/, form: c({}, { giftTaxBase: "250000000" }) },
  // ── 양도 정보(축 A · 파트 자본적지출) ──
  { name: "c: landDirectExpenses (자산 전체 자본적지출만 입력)", field: "landDirectExpenses", step: 0, assetIndex: A, message: /^자산: 토지·건물을 나눠 계산하는 자산은 자본적지출도/, form: c({ capitalExpenditure: "5000000" }) },
  { name: "c: landTransferPrice (구분양도인데 근거 없음)", field: "landTransferPrice", step: 0, assetIndex: A, message: /^자산: 구분양도를 선택했으면/, form: c({ landTransferPrice: "", buildingTransferPrice: "", landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" }) },
  { name: "c: directExpenses (보이는 이전 입력 형식 필요경비)", field: "directExpenses", step: 0, assetIndex: A, message: /^자산: 이전 입력 형식의 «직접 귀속 필요경비»/, form: c({ directExpenses: "5000000" }) },
  // ── 함께 양도 자산 · 1세대1주택 겹침 ──
  {
    name: "c: carryoverDonorSplit (함께 양도 자산이 있음)",
    field: "carryoverDonorSplit",
    step: 0,
    assetIndex: A,
    message: /^자산 1: 함께 양도\(일괄양도\)하는 자산이 있으면 첫 자산의 토지·건물 파트 이월과세를 지원하지 않습니다/,
    form: () => {
      const base = bundle({}, { bundledSaleMode: "actual" }) as { assets: Record<string, unknown>[] };
      const first = { ...base.assets[0], ...cAsset(), actualSalePrice: "500000000" };
      return { ...base, contractTotalPrice: "600000000", assets: [first, { ...base.assets[1], actualSalePrice: "100000000" }] };
    },
  },
  {
    name: "c: isOneHousehold (1세대1주택 비과세와 겹침)",
    field: "isOneHousehold",
    step: 1,
    message: /^1세대1주택 비과세\(소득세법 §89①3호\)와 겹치는 토지·건물 파트 이월과세는 아직 지원하지 않습니다/,
    form: c({}, {}, {}, { isOneHousehold: true, householdHousingCount: "1" }),
  },
];
