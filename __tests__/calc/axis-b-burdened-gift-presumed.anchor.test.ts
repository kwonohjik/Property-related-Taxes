/**
 * 축 B(지분 분할 취득) × 부담부증여 × 취득가액 「감정가액·매매사례가액」 anchor
 *
 * 매매사례가액·감정가액은 **취득일 전후 3개월** 값(소령 §176의2③)이라 지분마다 취득일이 다르면 값이 다르다.
 * 그래서 각 지분 카드가 **자기 취득일 기준의 물건 전체 값**을 입력하고 엔진이 지분율을 곱해 합산한다
 * (`scaleBurdenedGiftInfo`가 presumed를 지분율로 줄인다). 사용자 결정(2026-10-14): 「지분별로 각자의 값을 받아 합산」.
 * 계획서: docs/00-pm/burdened-gift-presumed-blocked-combos.plan.md §4
 *
 * 픽스처: 시가 10억 · 채무 6억(채무비율 0.6) · 지분 60%(2009-03-01 취득, 그때 물건 전체 감정가액 4억) +
 *   40%(2012-03-01 취득, 그때 5억). 취득시 기준시가(물건 전체) 2억 / 3억.
 *   지분1 취득가액 = 4억 × 0.6(지분) × 0.6 = 144,000,000 · 개산공제 = 2억 × 0.6 × 0.6 × 3% = 2,160,000
 *   지분2 취득가액 = 5억 × 0.4(지분) × 0.6 = 120,000,000 · 개산공제 = 3억 × 0.4 × 0.6 × 3% = 2,160,000
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 물건 전체 채무 6억 · 양도시 기준시가 10억 · 취득시 5억 */
const BG = {
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_standard",
  bgDonorRelation: "lineal_descendant",
  bgLendingDepositTotal: "300000000",
  bgMortgageDebtAmount: "300000000",
  standardPriceAtTransfer: "1000000001",
  standardPriceAtAcq: "500000001",
};

const asset = (id: number, numerator: string, over: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(id), addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    ownershipNumerator: numerator,
    ownershipDenominator: "100",
    ...BG,
    ...over,
  }) as AssetForm;

const form = (assets: AssetForm[]): TransferFormData =>
  ({
    transferDate: "2024-03-01",
    filingDate: "2024-05-31",
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

interface BundledData {
  mode?: string;
  aggregated?: {
    totalTax?: number;
    properties?: { transferGain: number }[];
    burdenedGift?: {
      debtRatio: number;
      assumedDebtAmount: number;
      giftTax?: { taxBase: number; finalTax: number };
    };
  };
  result?: { transferGain?: number; totalTax?: number };
}

async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
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
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as { data?: BundledData };
  return { status: res.status, body: cap.body!, data: json.data };
}


const PRESUMED = {
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "1000000000",
  bgAcquisitionMethod: "appraisal",
};

const tranche = (id: number, numerator: string, acqDate: string, wholeValue: string, stdAcq: string) =>
  asset(id, numerator, {
    ...PRESUMED,
    acquisitionDate: acqDate,
    bgPresumedAcquisitionTotal: wholeValue,
    standardPriceAtAcq: stdAcq,
  });

const bundle = () => [
  tranche(1, "60", "2009-03-01", "400000000", "200000000"),
  tranche(2, "40", "2012-03-01", "500000000", "300000000"),
];

describe("축 B × 부담부증여 × K-7 감정가액 — 지분별 값 합산", () => {
  it("[B-1] ④: 지분마다 **자기** 감정가액이 info에 실린다(primary 값이 복제되지 않는다)", async () => {
    const { body } = await run(form(bundle()));
    const primary = body.burdenedGiftInfo as Record<string, number>;
    const comp = (body.companionAssets as Record<string, unknown>[])[0].burdenedGiftInfo as Record<string, number>;
    expect(primary.presumedAcquisitionTotal).toBe(400_000_000);
    expect(comp.presumedAcquisitionTotal).toBe(500_000_000);
  });

  it("[B-2] 엔진: 지분별 양도차익 = 양도가 − (감정가액 × 지분 × 채무비율) − 개산공제", async () => {
    const { status, data } = await run(form(bundle()));
    expect(status).toBe(200);
    expect(data?.aggregated?.properties?.map((p) => p.transferGain)).toEqual([
      360_000_000 - 144_000_000 - 2_160_000, // 213,840,000
      240_000_000 - 120_000_000 - 2_160_000, // 117,840,000
    ]);
  });

  it("[B-3] 🔴 구별력 — 같은 값을 두 지분에 복제하면 결과가 달라진다(지분별 값이 실제로 쓰인다)", async () => {
    const same = await run(
      form([
        tranche(1, "60", "2009-03-01", "400000000", "200000000"),
        tranche(2, "40", "2012-03-01", "400000000", "300000000"),
      ]),
    );
    const diff = await run(form(bundle()));
    expect(same.data?.aggregated?.properties?.[1]?.transferGain).not.toBe(
      diff.data?.aggregated?.properties?.[1]?.transferGain,
    );
  });

  it("[B-4] ⑧: 모두 입력하면 통과 — 종전 「축 B 차단」은 풀렸다", () => {
    const msgs = collectStepIssues(0, form(bundle()) as never).map((i) => i.message);
    expect(msgs).toEqual([]);
  });

  it("[B-4b] 🔴 선행 결함 정정 — 축 B × 시가 모드는 채무·시가를 물건 전체로 비교한다(실지취득가액도 같다)", () => {
    // 종전에는 지분 40% 카드에서 물건 전체 채무 6억을 지분분 시가 4억과 비교해 「채무액이 증여가액을 초과」로 막혔다.
    const k4 = bundle().map((a) => ({ ...a, bgAcquisitionMethod: "actual" as const, bgActualAcquisitionTotal: "400000000" }));
    expect(collectStepIssues(0, form(k4) as never).map((i) => i.message)).toEqual([]);
    // 대조군 — 물건 전체 시가보다 채무가 크면 여전히 막힌다
    const over = bundle().map((a) => ({ ...a, bgMarketValueAtTransfer: "500000000" }));
    expect(collectStepIssues(0, form(over) as never).some((i) => /채무액.*초과/.test(i.message))).toBe(true);
  });

  it("[B-5] ⑧: 한 지분이라도 감정가액이 비면 그 지분 카드에서 막힌다", () => {
    const b = bundle();
    b[1] = { ...b[1], bgPresumedAcquisitionTotal: "" };
    const issues = collectStepIssues(0, form(b) as never);
    expect(issues.some((i) => /취득 당시 감정가액을 입력하세요/.test(i.message) && i.assetIndex === 1)).toBe(true);
  });

  it("[B-6] 매매사례가액도 같다", async () => {
    const b = bundle().map((a) => ({ ...a, bgAcquisitionMethod: "salesCase" as const }));
    const { status, data } = await run(form(b));
    expect(status).toBe(200);
    expect(data?.aggregated?.properties?.map((p) => p.transferGain)).toEqual([213_840_000, 117_840_000]);
  });
});
