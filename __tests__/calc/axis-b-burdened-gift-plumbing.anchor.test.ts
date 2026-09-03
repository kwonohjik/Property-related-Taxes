/**
 * anchor — 축 B × 부담부증여 **배관(④⑧⑩⑫⑬⑭)** 과 증여세 1회 산정.
 *
 * 계획서: `docs/02-design/features/transfer-axis-b-burdened-gift.plan.md`
 *
 * ## 이 anchor가 지키는 것
 *
 * 엔진 레벨 정합은 `__tests__/tax-engine/transfer/axis-b-burdened-gift.anchor.test.ts`(T)가
 * 지킨다. 여기서는 **route를 태워** 그 값이 실제로 도달하는지를 본다 — 배관은 여섯 층이고
 * 하나만 빠져도 **침묵 strip**이 되어 그 지분만 §159를 타지 않는다(실측 이력):
 *
 * | 층 | 빠졌을 때 관측된 값 |
 * |---|---|
 * | ⑩ companion refine에 부담부증여 예외 없음 | 400 「매매(실가) 시 취득가액 필수」 |
 * | ⑫ `companionAssetSchema.burdenedGiftInfo` 없음 | 컴패니언 차익 400,000,000 |
 * | ⑫⑬⑭ `transferType` 없음 | 〃 (엔진 §159 게이트가 발동 안 함) |
 * | ⑭ `bundled-split-helpers` 매핑 없음 | 〃 |
 *
 * ⚠️ 수치는 mock 세율표 실측값이지 「정본 세액」이 아니다.
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
    ...makeDefaultAsset(id),
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

describe("축 B × 부담부증여 — 배관", () => {
  it("P-1 ④⑬: 채무가 **자산별 지분율로 안분**돼 실린다", async () => {
    const { body } = await run(form([asset(1, "60"), asset(2, "40")]));
    const primary = body.burdenedGiftInfo as Record<string, number>;
    expect(primary.lendingDepositTotal).toBe(180_000_000); // 3억 × 0.6
    expect(primary.mortgageDebtAmount).toBe(180_000_000);

    const comps = body.companionAssets as Record<string, unknown>[];
    const comp = comps[0].burdenedGiftInfo as Record<string, number>;
    expect(comp.lendingDepositTotal).toBe(120_000_000); // 3억 × 0.4
    expect(comps[0].transferType).toBe("burdened_gift"); // 엔진 §159 게이트
  });

  it("P-2 ⑬: **물건 전체 info**가 별도로 실린다 (증여세 1회용)", async () => {
    const { body } = await run(form([asset(1, "60"), asset(2, "40")]));
    const whole = body.burdenedGiftWholeInfo as Record<string, number>;
    expect(whole.lendingDepositTotal).toBe(300_000_000); // 미안분
    expect(whole.mortgageDebtAmount).toBe(300_000_000);
  });

  it("P-3 축 B 합계 결정세액 = 단건 100%와 **완전 일치**", async () => {
    const single = await run(form([asset(1, "100")]));
    expect(single.status).toBe(200);
    expect(single.data?.result?.totalTax).toBe(64_600_360);

    const axisB = await run(form([asset(1, "60"), asset(2, "40")]));
    expect(axisB.status).toBe(200);
    expect(axisB.data?.mode).toBe("bundled");
    expect(axisB.data?.aggregated?.properties?.map((p) => p.transferGain)).toEqual([
      174_600_000, 116_400_000,
    ]);
    expect(axisB.data?.aggregated?.totalTax).toBe(64_600_360);
  });

  it("P-4 🔴 증여세는 **물건 단위 1회** — 카드별로 쪼개지지 않는다", async () => {
    const { data } = await run(form([asset(1, "60"), asset(2, "40")]));
    const bg = data?.aggregated?.burdenedGift;
    expect(bg?.assumedDebtAmount).toBe(600_000_000); // 물건 전체 채무
    expect(bg?.giftTax?.taxBase).toBe(350_000_001);
    // 카드별로 계산하면 190,000,000 + 110,000,000 = 300,000,000 과표 → 38,800,000
    expect(bg?.giftTax?.finalTax).toBe(58_200_000);
  });

  it("P-5 ⑧ Gate-B: 부담부증여 × 축 B가 통과한다", () => {
    // 🔄 종전에는 이 자리에서 「공익수용은 여전히 차단」도 함께 단언했다.
    //    공익수용도 같은 날 해제됐다(사유가 똑같이 틀렸다) — 그 축은
    //    `axis-b-expropriation.anchor.test.ts`가 6케이스 정합으로 지킨다.
    const msgs = collectStepIssues(0, form([asset(1, "60"), asset(2, "40")]) as never).map(
      (i) => i.message,
    );
    expect(msgs).toEqual([]);
  });

  it("P-6 🔄 컴패니언(다른 물건) 함께양도도 **열렸다** (2026-09-03)", () => {
    // 종전에는 이 자리에서 「여전히 차단」을 단언하며 「그 경로는 §159 안분을 타지 않는다」고
    // 적었다. 그 진단이 틀렸다 — 안분을 **타지 않은** 게 아니라 ④가 카드마다 채무 전액을
    // 실어 자산 수만큼 곱해지고 있었다(실측 2배). 신고 단위 채무 재배분으로 해소했고
    // 그 축은 `companion-burdened-gift-plumbing.anchor.test.ts`(C)가 지킨다.
    const mixed = [asset(1, "100"), asset(2, "100", { assetId: 2 })];
    const msgs = collectStepIssues(0, form(mixed) as never).map((i) => i.message);
    expect(msgs.some((m) => /부담부증여\(소령 §159\)은\(는\) 함께 양도와 같이 계산할 수 없습니다/.test(m))).toBe(false);
  });
});
