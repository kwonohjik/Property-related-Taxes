/**
 * anchor — 통상(비-부담부) 경로 감정가액 × 증축 5년 이내: 「증축한 부분의 감정가액」 입력의 클라이언트 5단 배선 (④⑤술어⑧⑫⑭).
 *
 * 엔진 anchor(`transfer-tax/general-extension-appraisal-penalty.anchor.test.ts`)는 input을 손으로 조립하므로 폼 값이 엔진에 닿는지는
 * 증명하지 않는다(`feedback_api_trigger_without_input_path_is_noop`). 여기서는 **폼 → ④ body → ⑫ Zod → ⑭ route → 엔진 → 결과**를 한 줄로 잰다.
 *
 * 시나리오: housing · 양도가 800M · 감정가액 300M · 증축부분 감정가액 60M · 증축 120㎡ · 증축일 2021-01-01 · 양도일 2024-03-01
 *   → 가산세 base 60M · 3,000,000 (종전 건물 전체 300M → 15,000,000)
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { generalExtensionAppraisalApplies } from "@/lib/calc/extension-appraisal-penalty";
import { defaultMultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2024-03-01";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2021-01-01",
    actualSalePrice: "800,000,000",
    isAppraisalAcquisition: true,
    fixedAcquisitionPrice: "300,000,000",
    standardPriceAtAcq: "200,000,000",
    standardPriceAtTransfer: "250,000,000",
    isSelfBuilt: true,
    buildingType: "extension",
    constructionDate: "2021-01-01",
    extensionFloorArea: "120",
    extensionStdPriceAtAcquisition: "40,000,000",
    extensionAppraisalValue: "60,000,000",
    ...over,
  } as AssetForm;
}

function form(over: Partial<AssetForm> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: TRANSFER_DATE,
    filingDate: "2024-05-31",
    contractTotalPrice: "800,000,000",
    householdHousingCount: "2",
    isOneHousehold: false,
    assets: [asset(over)],
  } as unknown as TransferFormData;
}

async function singleBody(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => {});
  vi.unstubAllGlobals();
  return cap.body!;
}

async function multiBody(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ result: {} }) } as unknown as Response;
    }),
  );
  await callMultiTransferTaxAPI(
    { ...defaultMultiTransferFormData, transferDate: TRANSFER_DATE, properties: [] } as never,
    [{ propertyId: "p1", propertyLabel: "자산 1", form: f } as never],
  ).catch(() => {});
  vi.unstubAllGlobals();
  return (cap.body?.properties as Record<string, unknown>[] | undefined)?.[0];
}

const msgsOf = (f: TransferFormData) => collectStepIssues(0, f as never).map((i) => i.message);

describe("술어 generalExtensionAppraisalApplies — ⑤ 칸·⑧·④가 같은 것을 본다", () => {
  const A = (o: Partial<AssetForm> = {}) => asset(o);
  it("감정가액 × 증축 × 85㎡ 초과 × 5년 이내 × 통상 → 참", () => {
    expect(generalExtensionAppraisalApplies(A(), TRANSFER_DATE)).toBe(true);
  });
  it.each([
    ["신축", { buildingType: "new" as const }],
    ["85㎡ 이하", { extensionFloorArea: "85" }],
    ["환산", { isAppraisalAcquisition: false, useEstimatedAcquisition: true }],
    ["매매사례", { isAppraisalAcquisition: false, isSalesCaseAcquisition: true }],
    ["부담부증여(전용 칸이 따로 있다)", { transferType: "burdened_gift" as const }],
    ["본인 신축·증축 아님", { isSelfBuilt: false }],
  ])("%s → 거짓", (_n, o) => {
    expect(generalExtensionAppraisalApplies(A(o as Partial<AssetForm>), TRANSFER_DATE)).toBe(false);
  });
  it("5년 초과 → 거짓", () => {
    expect(generalExtensionAppraisalApplies(A(), "2026-03-01")).toBe(false);
  });
});

describe("⑧ validate — 건물 전체로 대신할 수 없다", () => {
  it("[V-1] 비어 있으면 그 칸에서 막는다", () => {
    const issues = collectStepIssues(0, form({ extensionAppraisalValue: "" }) as never);
    const hit = issues.find((i) => /증축한 부분의 감정가액을 입력하세요/.test(i.message));
    expect(hit).toBeTruthy();
  });
  it("[V-2] 감정가액(건물 전체)보다 크면 막는다 · 같으면 통과", () => {
    expect(msgsOf(form({ extensionAppraisalValue: "300,000,001" })).some((m) => /보다 클 수 없습니다/.test(m))).toBe(true);
    expect(msgsOf(form({ extensionAppraisalValue: "300,000,000" })).some((m) => /증축한 부분의 감정가액/.test(m))).toBe(false);
  });
  it("[V-3] 채우면 통과", () => {
    expect(msgsOf(form()).some((m) => /증축한 부분의 감정가액/.test(m))).toBe(false);
  });
  it("[V-4] 🔴 칸이 안 뜨는 조합은 요구하지 않는다 (신축·85㎡ 이하·환산)", () => {
    for (const o of [
      { buildingType: "new" as const, extensionAppraisalValue: "" },
      { extensionFloorArea: "85", extensionAppraisalValue: "" },
      { isAppraisalAcquisition: false, useEstimatedAcquisition: true, extensionAppraisalValue: "" },
    ]) {
      expect(msgsOf(form(o as Partial<AssetForm>)).some((m) => /증축한 부분의 감정가액/.test(m)), JSON.stringify(o)).toBe(false);
    }
  });
});

describe("④ → ⑫ → ⑭ → 엔진", () => {
  it("[W-1] 단건 ④: 감정가액 × 증축이면 body에 실린다 · 아니면 안 실린다", async () => {
    expect((await singleBody(form())).extensionAppraisalValue).toBe(60_000_000);
    expect((await singleBody(form({ buildingType: "new" }))).extensionAppraisalValue).toBeUndefined();
    expect(
      (await singleBody(form({ isAppraisalAcquisition: false, useEstimatedAcquisition: true }))).extensionAppraisalValue,
    ).toBeUndefined();
  });

  it("[W-2] 다건 ④도 같은 키를 만든다", async () => {
    expect((await multiBody(form()))?.extensionAppraisalValue).toBe(60_000_000);
    expect((await multiBody(form({ buildingType: "new" })))?.extensionAppraisalValue).toBeUndefined();
  });

  it("[W-2b] 🔴 공유지분이면 감정가액과 같은 스케일로 줄인다 — 한쪽만 줄이면 상한(부분 ≤ 전체)이 깨진다", async () => {
    const body = await singleBody(form({ ownershipNumerator: "50", ownershipDenominator: "100" }));
    expect(body.appraisalValue).toBe(150_000_000);
    expect(body.extensionAppraisalValue).toBe(30_000_000);
  });

  it("[W-2c] ③ 이전 세션(이 칸이 없던 저장본)을 복원해도 빈 문자열로 채워진다", () => {
    const legacy: Record<string, unknown> = { ...asset() };
    delete legacy.extensionAppraisalValue;
    expect(migrateAsset(legacy).extensionAppraisalValue).toBe("");
  });

  it("[W-3] 폼 → route → 엔진: base 60M · 가산세 3,000,000 (종전 15,000,000)", async () => {
    const body = await singleBody(form());
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          isUnregistered: false,
          isNonBusinessLand: false,
          annualBasicDeductionUsed: 0,
          ...body,
          isOneHousehold: false,
          householdHousingCount: 2,
          residencePeriodMonths: 0,
        }),
      }),
    );
    const json = (await res.json()) as { data?: { result?: { penaltyBase?: number; penaltyTax?: number } }; error?: unknown };
    expect(res.status, JSON.stringify(json.error ?? "")).toBe(200);
    expect(json.data?.result?.penaltyBase).toBe(60_000_000);
    expect(json.data?.result?.penaltyTax).toBe(3_000_000);
  });
});
