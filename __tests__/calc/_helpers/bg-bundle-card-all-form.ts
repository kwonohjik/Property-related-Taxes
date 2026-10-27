/**
 * 부담부증여 묶음 결과 명세 = 카드 합 anchor 공용 픽스처 (계획서 `bg-bundle-card-acquisition-all.plan.md` §5).
 *
 * 일반건물 지분 분할(`shares`)은 `transfer.route.gb-burdened-gift-shares.anchor.test.ts`, 함께 양도(`companionForm`)는
 * `companion-burdened-gift-plumbing.anchor.test.ts`의 픽스처와 같은 구조다. 호출하는 테스트 파일이 `@/lib/db/tax-rates`를 mock하고
 * `preloadTaxRates`에 `makeMockRates()`를 넣어야 한다(수치는 mock 세율표 실측값).
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferBurdenedGiftBreakdown } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { vi } from "vitest";

// ── 일반건물 지분 분할 ────────────────────────────────────────────────
function gb(id: number, over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(id),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "general_building",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbZoneType: "general_residential",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000",
    gbBuildingAcquisitionCause: "purchase",
    ...over,
  } as AssetForm;
}
const MARKET = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1,000,000,000", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "0", bgMortgageDebtAmount: "500,000,000", bgMortgageSetAmount: "500,000,000",
};
export const SH_K5 = { ...MARKET, bgAcquisitionMethod: "converted" };
export const SH_K4 = { ...MARKET, bgAcquisitionMethod: "actual", bgActualAcquisitionLand: "150,000,000", bgActualAcquisitionBuilding: "150,000,000" };
export const SH_K6 = { ...MARKET, bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionLand: "200,000,000", bgPresumedAcquisitionBuilding: "300,000,000" };
export const SH_K7 = { ...SH_K6, bgAcquisitionMethod: "appraisal" };
export const SH_STD = {
  transferType: "burdened_gift", transferCause: "general", bgValuationMode: "sangjeungbeop_standard",
  bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0", bgMortgageDebtAmount: "200,000,000",
};
/** 지분 2의 취득시 기준시가가 지분 1과 다르다(토지 1,500,000/㎡ · 건물 1.5억). */
export const SH_S2_STD_DIFF = { gbAcqLandPricePerSqm: "1,500,000", gbAcqBuildingValue: "150,000,000" };

/** 축 B — 자산 1 = 입력 전부(60%) · 자산 2 = 지분 카드(취득 정보만) */
export function shares(bg: object, o: { d2?: string; s2?: object } = {}): TransferFormData {
  const a1 = gb(1, { ...bg, ownershipNumerator: "60", ownershipDenominator: "100", acquisitionDate: "2015-03-01" });
  const a2 = {
    ...makeDefaultAsset(2), assetKind: "general_building", acquisitionCause: "purchase", acquisitionDate: o.d2 ?? "2015-03-01",
    ownershipNumerator: "40", ownershipDenominator: "100", gbBuildingAcquisitionCause: "purchase",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", ...o.s2,
  } as AssetForm;
  return {
    transferDate: "2026-03-01", filingDate: "2026-05-31", assets: [a1, a2], houses: [], presaleRights: [],
    contractTotalPrice: "1,000,000,000", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
    assetSplitMode: "fractional",
  } as unknown as TransferFormData;
}

// ── 함께 양도(다른 물건) ──────────────────────────────────────────────
const BG_STD = (stdTransfer: string, stdAcq: string, deposit: string, mortgage: string): Record<string, unknown> => ({
  transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: deposit, bgMortgageDebtAmount: mortgage, standardPriceAtTransfer: stdTransfer, standardPriceAtAcq: stdAcq,
});
/** 시가 평가 — 평가·채무·방식을 직접 준다. */
const BG_MK = (mv: string, debt: string, over: Record<string, unknown>): Record<string, unknown> => ({
  ...BG_STD("0", "0", "0", debt), standardPriceAtTransfer: "", standardPriceAtAcq: "", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: mv, ...over,
});
const housing = (id: number, over: Record<string, unknown>): AssetForm =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2009-03-01",
    ownershipNumerator: "100", ownershipDenominator: "100", ...over,
  }) as AssetForm;
function companionForm(assets: AssetForm[]): TransferFormData {
  return {
    transferDate: "2024-03-01", filingDate: "2024-05-31", assets, houses: [], presaleRights: [], contractTotalPrice: "1600000000",
    totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData;
}
/** 물건1 평가 10억(취득 5억) · 채무 4억 / 물건2 평가 6억(취득 3억) · 채무 0 → 채무비율 25%. */
const p1 = (over: Record<string, unknown>) => housing(1, BG_MK("1000000000", "400000000", { standardPriceAtAcq: "300000000", ...over }));
const p2 = (over: Record<string, unknown>) => housing(2, BG_MK("600000000", "0", { standardPriceAtAcq: "200000000", ...over }));
export const COMPANION = {
  STD: () => companionForm([housing(1, BG_STD("1000000000", "500000000", "200000000", "200000000")), housing(2, BG_STD("600000000", "300000000", "0", "0"))]),
  K4: () => companionForm([p1({ bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "500000000" }), p2({ bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "300000000" })]),
  K7: () => companionForm([p1({ bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionTotal: "500000000" }), p2({ bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionTotal: "300000000" })]),
  K6: () => companionForm([p1({ bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionTotal: "500000000" }), p2({ bgAcquisitionMethod: "salesCase", bgPresumedAcquisitionTotal: "300000000" })]),
  K5: () => companionForm([p1({ bgAcquisitionMethod: "converted", standardPriceAtTransfer: "800000000" }), p2({ bgAcquisitionMethod: "converted", standardPriceAtTransfer: "500000000" })]),
  mixed: () => companionForm([p1({ bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "500000000" }), p2({ bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionTotal: "300000000" })]),
};

// ── route 호출 ────────────────────────────────────────────────────────
export interface BundleRoute {
  status: number;
  /** `aggregated.totalTax` */
  tax: number;
  whole: TransferBurdenedGiftBreakdown;
  /** 결과 화면에 그대로 넘기는 응답 조각 */
  data: { apportionment: never; aggregated: never; transferBurdenedGiftBreakdown: TransferBurdenedGiftBreakdown };
  /** 명세 취득가액(토지 + 건물 슬롯) */
  shown: number;
  /** 명세 개산공제(토지 + 건물 슬롯) */
  shownDeduction: number;
  /** 자산별 취득가액(`aggregated.properties[]`) 합 — 세액에 쓰인 값 */
  cardSum: number;
  /** 자산별 필요경비 합 */
  cardExpense: number;
}
export async function bundleRoute(f: TransferFormData): Promise<BundleRoute> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } finally { vi.unstubAllGlobals(); }
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0, ...cap.body, isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
    }),
  }));
  const json = (await res.json()) as { data: BundleRoute["data"] & { aggregated: { totalTax: number; properties: { acquisitionPrice: number; necessaryExpense: number }[] } } };
  const d = json.data;
  const w = d.transferBurdenedGiftBreakdown;
  const props = (d.aggregated as unknown as { properties: { acquisitionPrice: number; necessaryExpense: number }[] }).properties;
  return {
    status: res.status,
    tax: (d.aggregated as unknown as { totalTax: number }).totalTax,
    whole: w,
    data: d,
    shown: w.perAsset.land.acquisitionPrice + w.perAsset.building.acquisitionPrice,
    shownDeduction: w.perAsset.land.estimatedDeduction + w.perAsset.building.estimatedDeduction,
    cardSum: props.reduce((s, p) => s + p.acquisitionPrice, 0),
    cardExpense: props.reduce((s, p) => s + p.necessaryExpense, 0),
  };
}
