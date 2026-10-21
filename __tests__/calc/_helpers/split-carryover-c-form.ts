/**
 * 주택 split 파트 이월과세 P2 C — 테스트 공용 시드(폼 → ④ body → ⑫ route).
 * 시드 수치는 엔진 anchor(`transfer.route.split-part-carryover.p1.test.ts` C_NEW)와 같다 — 토지 증여자 1995-03-01 5천만 · 건물 2015-06-01 5천만 ·
 * 증여세 산출 3천만 / 과세가액 9억(토지 2.4억 + 건물 6.6억) · 양도 12억(토지 7억 + 건물 5억) · 양도일 2025-06-30.
 */
import { vi } from "vitest";
import { NextRequest } from "next/server";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

export function cAsset(over: Record<string, unknown> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    carryoverDonorSplit: true,
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2023-03-01",
      donorAcquisitionDate: "2015-06-01",
      donorAcquisitionPrice: "50,000,000",
      giftTaxCalculated: "30,000,000",
      giftTaxBase: "900,000,000",
      donorRelation: "lineal",
      donorSameHousehold: "no", // P5 — 건물(주택)을 증여받은 B·C는 세대 사실이 필수 질문이다
    },
    landCarryover: {
      ...CARRYOVER_DEFAULTS,
      donorAcquisitionDate: "1995-03-01",
      donorAcquisitionPrice: "50,000,000",
    },
    landAcquisitionPrice: "240,000,000",
    buildingAcquisitionPrice: "660,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as unknown as AssetForm;
}

export function cForm(over: Partial<TransferFormData> = {}, asset: AssetForm = cAsset()): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2025-06-30",
    filingDate: "2025-08-31",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1200000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    isOneHousehold: false,
    ...over,
  } as unknown as TransferFormData;
}

/** ④ — `callTransferTaxAPI`가 fetch로 보내는 body를 캡처한다(서버 호출 없음). */
export async function bodyOf(form: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  try {
    await callTransferTaxAPI(form);
  } finally {
    vi.unstubAllGlobals();
  }
  return cap.body!;
}

/** ⑫ — body를 실제 route(⑫ Zod + ⑭ + 엔진)에 태운다. 화면 밖 필수 불리언은 호출자가 채운다. */
export async function routeOf(
  post: (req: NextRequest) => Promise<Response>,
  body: Record<string, unknown>,
): Promise<{ status: number; json: any; fieldErrors: Record<string, string[]> }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await post(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, residencePeriodMonths: 0,
        ...body,
      }),
    }),
  );
  const json = await res.json();
  return { status: res.status, json, fieldErrors: json?.error?.fieldErrors ?? {} };
}

/** ⑧ — 마법사가 계산 전에 거치는 단계(자산 목록 0 · 보유 상황 1)의 차단 사유 전부. */
export function issuesOf(form: TransferFormData) {
  return [...collectStepIssues(0, form), ...collectStepIssues(1, form)];
}
