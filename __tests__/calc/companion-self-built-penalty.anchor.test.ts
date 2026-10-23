/**
 * anchor — 컴패니언(함께양도·지분 카드)의 신축·증축 특례(소득세법 §114조의2) 5단 배선 (④⑫⑭ + ⑧).
 *
 * 컴패니언 카드에도 「본인이 신축 또는 증축한 건물입니까?」 입력 칸이 있고 ⑧은 그 칸을 검증하는데, ⑫ 컴패니언 스키마에 필드가 없고
 * ④가 싣지 않아 **입력한 신축·증축이 엔진에 닿지 않았다**(침묵 strip → 그 자산만 가산세 0). 첫 자산(본체)만 계산됐다.
 *   · 환산(K-5) 컴패니언 × 신축 → 이제 가산세가 붙는다(산정방식 게이트용 `acquisitionMethod: "estimated"`를 함께 싣는다)
 *   · 부담부증여 지분 카드(축 B) × 신축 × 감정가액 → 지분 카드마다 자기 가산세(BG step이 `rawInput.isSelfBuilt`를 읽는다)
 *   · 일반 컴패니언 × 감정가액 × 신축·증축 → 컴패니언 경로가 산정방식·base를 못 실어 ⑧이 막는다(계산 못 하는 값을 조용히 0으로 두지 않는다)
 * 시나리오 골격은 `axis-b-burdened-gift-presumed.anchor.test.ts`와 같다(시가 10억 · 채무 6억 · 지분 60%/40%).
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


const SB = { isSelfBuilt: true, buildingType: "new", constructionDate: "2021-06-01" } as Record<string, unknown>;
/**
 * 일체 주택 본인 신축의 «건물분» 입력(Q-12 PR-2) — 가산세 base 가 토지 포함 전체가 아니라 건물분이 되므로, 환산 신축 컴패니언은 이 칸이 있어야 계산된다.
 * 취득 당시 토지 1억(㎡당 100만 × 100㎡)·건물 6천만, 양도 당시 토지 6억(㎡당 600만 × 100㎡)·건물 4억(양도시 주택공시가격 1,000,000,001 ≈ 토지+건물).
 */
const SB_BLDG = {
  standardPricePerSqmAtAcq: "1000000",
  acquisitionArea: "100",
  transferArea: "100",
  buildingStandardPriceAtAcq: "60000000",
  standardPricePerSqmAtTransfer: "6000000",
  buildingStandardPriceAtTransfer: "400000000",
  saleSplitMode: "apportioned",
} as Record<string, unknown>;
const EXT = {
  isSelfBuilt: true,
  buildingType: "extension",
  constructionDate: "2021-06-01",
  extensionFloorArea: "120",
  extensionStdPriceAtAcquisition: "40000000",
} as Record<string, unknown>;

/** 함께 양도(다른 물건 2건) — 일반 양도 · 두 자산 모두 양도시 기준시가 같아 계약총액이 50/50으로 안분된다 */
const plain = (id: number, extra: Record<string, unknown>) =>
  asset(id, "100", {
    transferType: "regular",
    bgValuationMode: undefined,
    bgMarketValueAtTransfer: "",
    bgAcquisitionMethod: undefined,
    acquisitionDate: "2021-06-01",
    standardPriceAtAcq: "200000000",
    standardPriceAtTransfer: "1000000001",
    ...extra,
  }) as AssetForm;
const ESTIMATED = { useEstimatedAcquisition: true };
const APPRAISAL = { isAppraisalAcquisition: true, fixedAcquisitionPrice: "300000000" };

type Props = { penaltyTax: number; penaltyBase: number }[];
const propsOf = (d: BundledData | undefined) => (d?.aggregated as unknown as { properties?: Props })?.properties ?? [];

describe("컴패니언 신축·증축 — ④⑫⑭ 배선", () => {
  it("[C-1] 환산 컴패니언의 신축이 엔진에 닿는다 — 건물분 base 37,499,999 · 가산세 1,874,999 (종전 전체 base 99,999,999 · 4,999,999 — Q-12 값 변경)", async () => {
    const r = await run(form([plain(1, ESTIMATED), plain(2, { ...ESTIMATED, ...SB, ...SB_BLDG })]));
    expect(r.status).toBe(200);
    const p = propsOf(r.data);
    expect(p[0].penaltyTax).toBe(0);
    // 건물 양도가액 S_b = 5억 × 4억/(6억+4억) = 2억 · 건물분 B_acq = 2억 × 6천만/(1억+6천만) = 7,500만 ·
    // B_tr = 1,000,000,001 − 토지분 floor(1,000,000,001 × 6/10 = 600,000,000.6) = 400,000,001 (건물 = 총액 − 토지) → 2억 × 7,500만 ÷ 400,000,001 = 37,499,999
    expect(p[1].penaltyBase).toBe(37_499_999);
    expect(p[1].penaltyTax).toBe(1_874_999);
  });

  it("[C-2] 🔴 구별력 — 신축을 첫 자산에만 켜면 컴패니언은 0이다(서로 번지지 않는다)", async () => {
    const r = await run(form([plain(1, { ...ESTIMATED, ...SB, ...SB_BLDG }), plain(2, ESTIMATED)]));
    const p = propsOf(r.data);
    expect(p[0].penaltyTax).toBe(1_874_999);
    expect(p[1].penaltyTax).toBe(0);
  });

  it("[C-3] 환산 컴패니언의 증축 — base는 증축부분 기준시가 비율(건물 전체가 아니다)", async () => {
    const r = await run(form([plain(1, ESTIMATED), plain(2, { ...ESTIMATED, ...EXT })]));
    const p = propsOf(r.data);
    // 양도가 500,000,000 × (증축부분 취득시 기준시가 40,000,000 ÷ 양도시 기준시가 1,000,000,001)
    expect(p[1].penaltyBase).toBe(19_999_999);
    expect(p[1].penaltyTax).toBe(999_999);
  });

  it("[C-4] ④: 신축·증축 축이 살아 있을 때만 싣는다 — 토지로 바꾸면 stale 플래그가 새지 않는다", async () => {
    const on = await run(form([plain(1, ESTIMATED), plain(2, { ...ESTIMATED, ...SB, ...SB_BLDG })]));
    const c = (on.body.companionAssets as Record<string, unknown>[])[0];
    expect(c.isSelfBuilt).toBe(true);
    expect(c.buildingType).toBe("new");
    expect(c.constructionDate).toBe("2021-06-01");
    const land = await run(form([plain(1, ESTIMATED), plain(2, { ...ESTIMATED, ...SB, ...SB_BLDG, assetKind: "land" })]));
    const cl = (land.body.companionAssets as Record<string, unknown>[])[0];
    expect(cl.isSelfBuilt).toBeUndefined();
    expect(cl.selfBuiltHousing).toBeUndefined();
    expect(cl.constructionDate).toBeUndefined();
  });
});

describe("컴패니언 신축·증축 — 겸용주택은 파트 카드 경로라 싣지 않는다", () => {
  it("[C-5] 겸용주택 컴패니언은 신축·증축 필드를 싣지 않는다(단건 ④와 같은 게이트)", async () => {
    const r = await run(form([plain(1, ESTIMATED), plain(2, { ...ESTIMATED, ...SB, isMixedUseHouse: true })]));
    const c = (r.body.companionAssets as Record<string, unknown>[])[0];
    expect(c.isSelfBuilt).toBeUndefined();
    expect(c.constructionDate).toBeUndefined();
  });
});

describe("축 B(부담부증여 지분 카드) × 신축 × 감정가액 — 지분 카드마다 자기 가산세", () => {
  const sb = (a: AssetForm, on: boolean) => ({ ...a, ...(on ? SB : {}) }) as AssetForm;

  it("[B-1] 두 번째 지분 카드의 신축이 가산세로 잡힌다 — 6,000,000(= 감정가액 5억 × 40% × 채무비율 0.6 = 1.2억의 5%)", async () => {
    const [a, b] = bundle();
    const r = await run(form([sb(a, false), sb(b, true)]));
    expect(r.status).toBe(200);
    const p = propsOf(r.data);
    expect(p[0].penaltyTax).toBe(0);
    expect(p[1].penaltyBase).toBe(120_000_000);
    expect(p[1].penaltyTax).toBe(6_000_000);
  });

  it("[B-2] 두 카드가 모두 신축이면 각자의 가산세가 따로 붙는다(7,200,000 + 6,000,000)", async () => {
    const [a, b] = bundle();
    const p = propsOf((await run(form([sb(a, true), sb(b, true)]))).data);
    expect(p.map((x) => x.penaltyTax)).toEqual([7_200_000, 6_000_000]);
  });
});

describe("일반 컴패니언 × 감정가액 × 신축·증축 — 이제 계산된다(종전 ⑧ 차단 해제)", () => {
  // 종전엔 컴패니언 ④⑫⑭가 산정방식(`acquisitionMethod: "appraisal"`)·`appraisalValue`·증축부분 감정가액을 싣지 못해 ⑧이 막았다.
  // 근거·실측: `companion-appraisal-lump-sum.anchor.test.ts` 헤더.
  const issues = (f: TransferFormData) => collectStepIssues(0, f as never);
  const OLD_BLOCK = /두 번째 이후 자산\(또는 지분 카드\).*감정가액으로 산정하면/;

  it("[V-1] 두 번째 자산 × 감정가액 × 신축 → 막지 않고 건물 감정가액 직접 입력 1.1억 × 5% = 5,500,000 (종전 감정가액 총액 3억 · 15,000,000 — Q-12 값 변경)", async () => {
    const f = form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, ...SB, selfBuiltBuildingAppraisal: "110000000" })]);
    expect(issues(f).some((i) => OLD_BLOCK.test(i.message))).toBe(false);
    const r = await run(f);
    expect(r.status).toBe(200);
    const p = propsOf(r.data);
    expect(p[0].penaltyTax).toBe(0);
    expect(p[1].penaltyBase).toBe(110_000_000);
    expect(p[1].penaltyTax).toBe(5_500_000);
  });

  it("[V-2] 두 번째 자산 × 감정가액 × 증축 → base는 증축한 부분의 감정가액(6천만 × 5% = 3,000,000)", async () => {
    const r = await run(form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, ...EXT, extensionAppraisalValue: "60000000" })]));
    expect(r.status).toBe(200);
    expect((r.body.companionAssets as Record<string, unknown>[])[0].extensionAppraisalValue).toBe(60_000_000);
    const p = propsOf(r.data);
    expect(p[1].penaltyBase).toBe(60_000_000);
    expect(p[1].penaltyTax).toBe(3_000_000);
  });

  it("[V-3] 증축부분 감정가액을 비우면 그 자산 카드의 칸에서 막는다(건물 전체로 대신하지 않는다)", () => {
    const hit = issues(form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, ...EXT })])).find(
      (i) => i.field === "extensionAppraisalValue",
    );
    expect(hit?.assetIndex).toBe(1);
  });

  it("[V-4] 함께 양도 묶음 안의 지분 50% 자산 × 증축 — 증축부분 감정가액도 감정가액과 같은 지분 스케일(3천만 × 5% = 1,500,000)", async () => {
    const r = await run(
      form([plain(1, APPRAISAL), plain(2, { ...APPRAISAL, ...EXT, extensionAppraisalValue: "60000000", ownershipNumerator: "50" })]),
    );
    expect(r.status).toBe(200);
    expect((r.body.companionAssets as Record<string, unknown>[])[0].extensionAppraisalValue).toBe(30_000_000);
    expect(propsOf(r.data)[1].penaltyTax).toBe(1_500_000);
  });

  it("[V-5] 🔴 대조군 — 부담부증여 지분 카드는 일반 증축부분 감정가액을 요구하지 않는다(숨겨진 일반 방식 플래그가 남아 있어도)", () => {
    const [a, b] = bundle();
    const stale = { ...b, ...EXT, isAppraisalAcquisition: true } as AssetForm;
    expect(issues(form([a, stale])).some((i) => i.field === "extensionAppraisalValue")).toBe(false);
  });
});
