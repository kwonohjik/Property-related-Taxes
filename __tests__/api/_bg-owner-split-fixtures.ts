/**
 * 부담부증여 × 소유자 분리 anchor 공용 시료 — 폼 → ④ `captureBody` → route POST(⑫⑭) + ⑧ 단계 이슈.
 * 호출 파일에서 `preloadTaxRates`를 mock한다(`vi.mock("@/lib/db/tax-rates", …)`).
 */
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

export const FORM = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", isOneHousehold: false, householdHousingCount: "2", householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
/** 채무 1억 = 보증금 5천만 + 차입 5천만(설정 5천만) — 계획서 §9.1 A1·A2 */
export const DEBT_A = { bgLendingDepositTotal: "50000000", bgMortgageDebtAmount: "50000000", bgMortgageSetAmount: "50000000" };
export const BASE = {
  acquisitionCause: "purchase", acquisitionDate: "2015-01-01", transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", bgDonorRelation: "lineal_descendant",
  assetKind: "building", ...DEBT_A, bgOwnerSplitDebtConfirmed: true,
};
/** 건물만 본인 — 증여한 건물분 양도시·취득시 기준시가(토글이 강제로 켜는 취득일 분리 플래그 포함) */
/** 증여일 건물 기준시가(상증법 §61①2호 · 기준시가 평가 필수)는 증여한 건물분 양도시 기준시가와 같은 값 — 종전 엔진 대체값과 같아 세액 불변. */
export const bldg = (t: string, a: string, o: Record<string, unknown> = {}) => ({ selfOwns: "building_only", hasSeperateLandAcquisitionDate: true, buildingStandardPriceAtTransfer: t, buildingStandardPriceAtAcq: a, bgGiftBuildingStdPriceAtTransfer: t, ...o });
/** 토지만 본인 — 증여한 토지분: ㎡당 공시지가 × 면적 */
export const land = (tPerSqm: string, tArea: string, aPerSqm: string, aArea: string, o: Record<string, unknown> = {}) => ({
  selfOwns: "land_only", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-01-01", standardPricePerSqmAtTransfer: tPerSqm, transferArea: tArea, standardPricePerSqmAtAcq: aPerSqm, acquisitionArea: aArea, ...o,
});

export const asset = (id: number, o: Record<string, unknown> = {}) =>
  Object.assign({ ...makeDefaultAsset(id) }, { ...BASE, assetId: `b${id}`, addressJibun: `서울 강남구 테스트동 ${id}-${id}`, ...o }) as unknown as AssetForm;

export function formOf(assets: AssetForm[]): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), FORM, {
    assets, contractTotalPrice: assets.length > 1 ? "" : "1,000,000,000", ...(assets.length > 1 ? { assetSplitMode: "companion", bundledSaleMode: "actual" } : {}),
  }) as TransferFormData;
}

export async function post(body: unknown) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return undefined; } })() };
}

export async function run(assets: AssetForm[]) {
  const f = formOf(assets);
  const issues = collectStepIssues(0, f);
  const body = await captureBody(f);
  const res = await post(body);
  return { issues, status: res.status, text: res.text, json: res.json, body, result: res.json?.data?.result };
}
