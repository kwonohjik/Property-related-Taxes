/**
 * 역방향 12억 단위 재배분 값 고정(계획서 `docs/02-design/features/bundled-appurtenant-card-unit-share-and-rate-display.plan.md` O-8 · Q-1 a).
 *
 * 이전 세 계획서는 짝 주택 카드(`h1`) 값을 «독립 재도출 불가 — 순·역 등가/측정 일치만»으로 남겼다. 재산세제과-915(2011.10.27.) 방식과 몫 규약으로 정수까지 도출된다.
 *   · 법 근거(몫 규약과 무관한 단위 합): 조각 과세분 합 = 안분(조각 합 + X) − X.
 *   · 구현 규약(`allocateUnitExcessShares`): 조각 몫 = floor(X × 조각 / 조각 합), 잔액은 마지막 양수 조각, 조각 과세 = floor((조각 + 몫) × 안분율) − 몫.
 * 시료: 첫 자산 부수토지 4억(200㎡ · 취득 2억) · 짝 주택 `h1` 토지 8억(취득 2억 · 토지만 본인 · 같은 세대 · 합가) · 총 양도가 20억 · 정착면적 100㎡(한도 300㎡) → 안분율 (20억 − 12억)/20억 = 40%,
 * 한도 내 조각 = `h1` 토지분 600,000,000 + `primary__appurtenant` 100,000,000, 초과분 X = `primary__excess` 100,000,000. 기대값은 아래 BigInt 정수 산식으로 구한다(엔진 출력 복사 아님).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ZONE = { buildingFootprintArea: 100, isUrbanArea: true, appurtenantLandZone: "metropolitan_residential" };

/** 역방향 — 첫 자산이 부수토지(400,000,000 · 200㎡), 함께 양도 주택이 컴패니언(토지만 본인이면 분리취득 사실을 함께 넣는다) */
const reverse = (own: Loose) => ({
  transferDate: "2026-02-16", acquisitionDate: "2014-01-01", acquisitionCause: "purchase", expenses: 0, useEstimatedAcquisition: false,
  residencePeriodMonths: 60, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
  reductions: [], annualBasicDeductionUsed: 0, isOneHousehold: true, householdHousingCount: 1,
  propertyType: "land", landNature: "appurtenant_to_housing", transferPrice: 400_000_000, acquisitionPrice: 200_000_000, acquisitionArea: 200, transferArea: 200,
  totalSalePrice: 2_000_000_000, standardPriceAtTransferForApportion: 400_000,
  companionAssets: [{
    assetId: "h1", assetLabel: "주택", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2014-01-01", fixedAcquisitionPrice: 800_000_000,
    standardPriceAtTransfer: 1_600_000, directExpenses: 0, isOneHousehold: true, reductions: [], ...ZONE,
    companionHousingLand: { landAreaM2: 200, footprintM2: 100, zone: "metropolitan_residential" },
    ...own,
  }],
});
/** 역방향 컴패니언 주택이 토지만 본인일 때 ⑫가 요구하는 분리취득 사실 */
const REVERSE_LAND_ONLY = {
  landAcquisitionDate: "2014-01-01", standardPricePerSqmAtAcquisition: 500_000, acquisitionArea: 200, standardPriceAtAcquisition: 300_000_000,
  landStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtTransfer: 800_000_000, buildingStandardPriceAtAcquisition: 300_000_000,
};


const MERGE = (d?: string) => ({ selfOwns: "land_only", buildingOwnerSameHousehold: true, ...(d ? { buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: d } : { buildingOwnerHouseholdMerged: false }) });
const SAM_REV = (d?: string) => ({ ...MERGE(d), ...REVERSE_LAND_ONLY });

type Card = { propertyId: string; transferGain: number; income: number; longTermHoldingDeduction: number; isPartialExempt?: boolean };
type Agg = { totalTax: number; properties: Card[] };
async function agg(body: Loose): Promise<Agg> {
  const res = await postTransfer(body);
  expect(res.status, JSON.stringify((res.json as Loose).error)).toBe(200);
  return (res.json as Loose).data.aggregated as Agg;
}
const card = (a: Agg, id: string) => a.properties.find((c) => c.propertyId === id)!;
/** 카드의 과세 양도차익 = 장특 + 소득(합가일이 바꾸는 것은 장특·소득의 분할뿐이라 이 합은 단위 몫이 정한다) */
const taxable = (c: Card) => c.longTermHoldingDeduction + c.income;

// ── 독립 정수 산식(BigInt — 7억 × 8억 = 5.6e17은 2^53을 넘는다) ──
const SALE = 2_000_000_000n;
const HIGH = 1_200_000_000n;
const prorate = (g: bigint) => (g * (SALE - HIGH)) / SALE; // 영 §160① 안분 — 양수 절사
/** `allocateUnitExcessShares` 규약: floor(X × g / Σg), 잔액은 마지막 양수 조각 */
function shares(pieces: bigint[], x: bigint): bigint[] {
  const sum = pieces.reduce((a, b) => a + b, 0n);
  const s = pieces.map((g) => (x * g) / sum);
  s[s.length - 1] += x - s.reduce((a, b) => a + b, 0n);
  return s;
}
/** 조각 과세 = 안분(조각 + 몫) − 몫 */
const pieceTaxable = (pieces: bigint[], x: bigint) => {
  const sh = shares(pieces, x);
  return pieces.map((g, i) => Number(prorate(g + sh[i]) - sh[i]));
};

const X = 100_000_000n;
const H1 = 600_000_000n;
const APP = 100_000_000n;
const rate = (g: number, pct: number) => Math.floor((g * pct) / 100);

describe("역방향 12억 단위 — h1 · primary__appurtenant 과세 양도차익이 독립 산식과 정수까지 같다", () => {
  it("🔑 산식 자체 검증 — 몫 85,714,285 · 14,285,715(잔액 1원 마지막 조각) → h1 188,571,429 · 부수토지 31,428,571 · 합 220,000,000(= 안분 8억 − X)", () => {
    expect(shares([H1, APP], X).map(Number)).toEqual([85_714_285, 14_285_715]);
    expect(pieceTaxable([H1, APP], X)).toEqual([188_571_429, 31_428_571]);
    // 법 근거 오라클 — 몫 규약과 무관: 조각 합에 안분을 한 번 하고 X를 뺀다
    expect(Number(prorate(H1 + APP + X) - X)).toBe(220_000_000);
  });

  it.each([
    ["합가 없음(처음부터 같은 세대)", undefined, 60],
    ["합가 2012-01-01(짝 주택보다 이른 날)", "2012-01-01", 60],
    ["합가 2020-01-01(합가 후 6년 1개월 · 표2 보유 24% + 거주 20%)", "2020-01-01", 44],
    ["합가 2023-06-01(합가 후 2년 8개월 · 표2 보유분 0 → 표1 24%)", "2023-06-01", 24],
  ])("🔑 %s: h1 188,571,429 · primary__appurtenant 31,428,571 · 합 220,000,000 · 장특 = floor(과세 × %i%%)", async (_n, d, pct) => {
    const a = await agg(reverse(SAM_REV(d)));
    const h1 = card(a, "h1");
    const ap = card(a, "primary__appurtenant");
    const [eh, ea] = pieceTaxable([H1, APP], X);
    expect([taxable(h1), taxable(ap)]).toEqual([eh, ea]);
    expect(taxable(h1) + taxable(ap)).toBe(220_000_000);
    expect([h1.longTermHoldingDeduction, ap.longTermHoldingDeduction]).toEqual([rate(eh, pct), rate(ea, pct)]);
    expect([h1.isPartialExempt, ap.isPartialExempt]).toEqual([true, true]);
  });

  it("🔑 합가 2025-01-01(합가 후 2년 미만): 부수토지 조각이 단위 밖(전액 과세 100,000,000) → h1이 X 전부를 받아 180,000,000 = 안분(7억) − 1억", async () => {
    const a = await agg(reverse(SAM_REV("2025-01-01")));
    const h1 = card(a, "h1");
    const ap = card(a, "primary__appurtenant");
    const [only] = pieceTaxable([H1], X);
    expect(only).toBe(180_000_000);
    expect(taxable(h1)).toBe(only);
    expect(h1.longTermHoldingDeduction).toBe(rate(only, 24));
    expect([ap.isPartialExempt, taxable(ap), ap.transferGain]).toEqual([false, 100_000_000, 100_000_000]);
  });

  it("초과분 카드는 단위 몫과 무관 — 합가일에 따라 값이 변하지 않는다(24,000,000 · 76,000,000)", async () => {
    for (const d of [undefined, "2020-01-01", "2023-06-01", "2025-01-01"]) {
      const c = card(await agg(reverse(SAM_REV(d))), "primary__excess");
      expect([c.longTermHoldingDeduction, c.income], String(d)).toEqual([24_000_000, 76_000_000]);
    }
  });
});
