/**
 * U-18 (비상장주식 리뷰 2026-11-28) — 실제 세액 경로(evaluateAllEstateItems)가 평가기준일을 받는다.
 * + U-03 간편평가(V1) — §54④ 단서(3·5호)는 평가기준일 2026.2.27. 이후만.
 *
 * 종전: evaluateAllEstateItems(items) → resolveEstateItemValue(item) → computeStockValuation(item) 날짜 없음.
 *   - 상장주식 §53⑧2호(평가기준일 전후 6개월 전부매각) 할증 배제가 missing_input으로 꺼져 20% 할증.
 *   - 간편평가 3·5호는 평가기준일과 상관없이 단서 적용.
 * 법령: 상증법 §63③ · 상증령 §53⑧2호 · 상증령 §54④ 단서 + 부칙 <제36131호> 제11조(재산세제과-955).
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as INH } from "@/app/api/calc/inheritance/route";
import { POST as GIFT } from "@/app/api/calc/gift/route";
import { evaluateAllEstateItems } from "@/lib/tax-engine/property-valuation";

type Handler = (req: NextRequest) => Promise<Response>;
async function post(h: Handler, body: unknown) {
  const res = await h(
    new NextRequest("http://localhost/api/calc/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

const H = { id: "h1", relation: "child", name: "자녀", birthDate: "1980-01-01" };

/** 상장 · 1주 평균 100,000 × 10,000주 · 최대주주 · 대기업 · §53⑧2호 전부매각(상속개시 2개월 뒤) */
const listedAllSold = {
  id: "s1",
  category: "listed_stock",
  name: "상장주식",
  listedStockAvgPrice: 100_000,
  listedStockShares: 10_000,
  isMaxShareholder: true,
  companySize: "large",
  premiumExclusionReason: "all_sold_within_6m",
  section53_8_2: {
    allSharesSold: true,
    meetsArticle49_1_1: true,
    saleContractDate: "2024-07-01",
    transferType: "inheritance",
  },
};

describe("U-18 — 상속세 세액 경로가 평가기준일로 §53⑧2호를 판정한다", () => {
  it("평가액 1,000,000,000 · 산출세액 89,000,000 (종전 1,200,000,000 · 148,500,000)", async () => {
    const r = await post(INH, {
      decedentType: "resident",
      deathDate: "2024-05-01",
      estateItems: [listedAllSold],
      preGiftsWithin10Years: [],
      heirs: [H],
      deductionInput: { heirs: [H] },
      creditInput: { isFiledOnTime: true },
    });
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    expect(r.json.result.grossEstateValue).toBe(1_000_000_000);
    expect(r.json.result.computedTax).toBe(89_000_000);
  });

  it("엔진 단위: 날짜 없으면 할증(종전 동작 그대로) · 날짜 있으면 배제", () => {
    const item = { ...listedAllSold, section53_8_2: { ...listedAllSold.section53_8_2, saleContractDate: new Date("2024-07-01") } } as never;
    expect(evaluateAllEstateItems([item])[0].valuatedAmount).toBe(1_200_000_000);
    expect(evaluateAllEstateItems([item], "2024-05-01")[0].valuatedAmount).toBe(1_000_000_000);
  });
});

/** 간편평가(V1) · 부동산 80%(3호) · 순손익가치 100,000 · 순자산 5억/10,000주=50,000 */
const v1RealEstate80 = {
  id: "u1",
  category: "unlisted_stock",
  name: "비상장(간편)",
  unlistedValuationMode: "simple",
  unlistedStockData: {
    totalShares: 10_000,
    ownedShares: 10_000,
    weightedNetIncome: 100_000_000,
    netAssetValue: 500_000_000,
    capitalizationRate: 0.1,
    assetValueOnlyReason: "real_estate_80",
  },
};

describe("U-03 V1 — 간편평가 3호도 평가기준일로 단서를 가른다 (세액 경로)", () => {
  it("증여일 2025-12-01: 단서 신설 전 → 순자산 50,000 × 10,000 = 500,000,000", () => {
    expect(evaluateAllEstateItems([v1RealEstate80 as never], "2025-12-01")[0].valuatedAmount).toBe(500_000_000);
  });

  it("증여일 2026-06-01: 단서 → 가중평균 ≥ 순자산이면 본문 평가(500,000,000 초과)", () => {
    expect(evaluateAllEstateItems([v1RealEstate80 as never], "2026-06-01")[0].valuatedAmount).toBeGreaterThan(500_000_000);
  });

  it("증여세 route 2025-12-01: 증여재산가액 500,000,000", async () => {
    const r = await post(GIFT, {
      giftDate: "2025-12-01",
      donorRelation: "lineal_descendant",
      donor: "mother",
      giftItems: [v1RealEstate80],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    });
    expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
    expect(r.json.result.grossGiftValue).toBe(500_000_000);
  });
});
