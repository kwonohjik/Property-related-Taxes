/**
 * 일체 주택 본인 신축 × §114조의2 가산세 base 건물분 — ④⑤⑧ 파이프라인 anchor 공용 픽스처 (Q-12 PR-2).
 *
 * 단건 대표 셀(PR-1 엔진 anchor 와 같은 숫자): 신축 2022-01-10 · 양도 2026-03-01 · 양도가 10억 · 주택공시가격 취득 2억/양도 4억
 * · 취득 당시 토지 1억(㎡당 100만 × 100㎡)·건물 6천만 · 양도 당시 토지 2.4억(㎡당 240만 × 100㎡)·건물 1.6억 → 건물분 base 187,500,000 · 가산세 9,375,000.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

export const SB_TRANSFER_DATE = "2026-03-01";

/** 취득 5칸 + 양도 3칸(㎡당 단가·면적·건물) — 환산 일체 주택의 «건물분» 입력 전부 */
export const SB_INPUTS: Partial<AssetForm> = {
  standardPricePerSqmAtAcq: "1000000",
  acquisitionArea: "100",
  transferArea: "100",
  buildingStandardPriceAtAcq: "60000000",
  standardPricePerSqmAtTransfer: "2400000",
  buildingStandardPriceAtTransfer: "160000000",
  saleSplitMode: "apportioned",
};

/** 환산 · 신축 · 5년 이내 · 일체 주택 자산(첫 자산) */
export const SB_ASSET: Partial<AssetForm> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2022-01-10",
  actualSalePrice: "1000000000",
  addressJibun: "서울특별시 테스트구 1",
  useEstimatedAcquisition: true,
  standardPriceAtAcq: "200000000",
  standardPriceAtTransfer: "400000000",
  isSelfBuilt: true,
  buildingType: "new",
  constructionDate: "2022-01-10",
  ...SB_INPUTS,
};

export const SB_APPRAISAL: Partial<AssetForm> = {
  useEstimatedAcquisition: false,
  isAppraisalAcquisition: true,
  fixedAcquisitionPrice: "300000000",
};

export function sbForm(assetOver: Partial<AssetForm> = {}, formOver: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = SB_TRANSFER_DATE;
  f.contractTotalPrice = "1000000000";
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.householdNoOtherHousesConfirmed = true;
  f.householdNoPresaleRightsConfirmed = true;
  Object.assign(f.assets[0], SB_ASSET, assetOver);
  Object.assign(f, formOver);
  return f;
}

export function allIssues(form: TransferFormData) {
  const out: { step: number; field?: string; message: string; assetIndex?: number }[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, form)) out.push({ step: s, field: i.field, message: i.message, assetIndex: i.assetIndex });
  return out;
}

export async function captureBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* 본문만 본다 */
  }
  vi.unstubAllGlobals();
  return cap.body!;
}

export interface CalcOut {
  issues: ReturnType<typeof allIssues>;
  body: Record<string, unknown>;
  status: number;
  result?: { penaltyBase: number; penaltyTax: number; totalTax: number; determinedTax: number; selfBuiltHousingPenalty?: Record<string, unknown> };
  json: unknown;
}

/** 폼 → ⑧ 전 단계 이슈 + ④ 본문 → route POST(⑫⑭ + 엔진) */
export async function calc(form: TransferFormData): Promise<CalcOut> {
  const issues = allIssues(form);
  const body = await captureBody(form);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      // 컴패니언(함께 양도) 본문은 폼-전역 기본(등기·비조정 등)을 route 가 요구한다 — companion 테스트 헬퍼와 같은 기본값(본문이 이기는 쪽)
      body: JSON.stringify({ isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, ...body }),
    }),
  );
  const json = (await res.json()) as { data?: { result?: CalcOut["result"] } };
  return { issues, body, status: res.status, result: json?.data?.result, json };
}

// ─── 함께 양도(컴패니언) · 다건 ────────────────────────────────────────────────

/** 컴패니언 대표 셀 — companion-self-built-penalty.anchor 의 `plain()` 과 같은 골격: 양도 2024-03-01 · 두 자산 양도시 주택공시가격이 같아 계약총액 10억이 50/50 안분 */
export const SB_BUNDLE_DATE = "2024-03-01";
export const SB_BUNDLE_INPUTS: Partial<AssetForm> = {
  standardPricePerSqmAtAcq: "1000000",
  acquisitionArea: "100",
  transferArea: "100",
  buildingStandardPriceAtAcq: "60000000",
  standardPricePerSqmAtTransfer: "6000000",
  buildingStandardPriceAtTransfer: "400000000",
  saleSplitMode: "apportioned",
};


export function bundledAsset(id: number, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(id),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2021-06-01",
    ownershipNumerator: "100",
    ownershipDenominator: "100",
    useEstimatedAcquisition: true,
    standardPriceAtAcq: "200000000",
    standardPriceAtTransfer: "1000000001",
    ...over,
  } as AssetForm;
}

/** 두 번째 자산이 본인 신축 일체 주택(환산) — `secondOver` 로 변주 */
export function bundledForm(secondOver: Partial<AssetForm> = {}, firstOver: Partial<AssetForm> = {}): TransferFormData {
  return {
    transferDate: SB_BUNDLE_DATE,
    filingDate: "2024-05-31",
    assets: [
      bundledAsset(1, firstOver),
      bundledAsset(2, { isSelfBuilt: true, buildingType: "new", constructionDate: "2021-06-01", ...SB_BUNDLE_INPUTS, ...secondOver }),
    ],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
  } as unknown as TransferFormData;
}

export interface BundledProp {
  penaltyBase: number;
  penaltyTax: number;
  selfBuiltHousingPenalty?: { base: number; penalty: number };
}
export const bundledProps = (json: unknown): BundledProp[] =>
  ((json as { data?: { aggregated?: { properties?: BundledProp[] } } })?.data?.aggregated?.properties) ?? [];
