/**
 * 증여 부담부 주식(비상장·환산) — 영 §165④1호 괄호 2:3 대상 법인 입력 (계획서 stock-165-4-valuation-followups §3.2·§9).
 *
 * 결함: ④가 `isHeavyRealEstateForValuation: false`를 고정으로 보내 입력 경로가 없었다.
 * 부동산등 비율 50% 이상 법인(법 §94①4 다목 법인 요건)이면 증여 부담부 환산도 순손익 2 : 순자산 3이다.
 * 이 경로는 입력 칸이 없는 채 «토글 OFF»로만 계산되고 있었다.
 *
 * ④ → ⑫ → ⑭ → 엔진 전 계층을 태운다(leaf 직접호출 금지).
 *
 * 손계산 — 양도 순손익 500,000 · 순자산 400,000 / 취득 순손익 400,000 · 순자산 200,000 · 채무 10억 · 2025-06-02
 *   3:2  양도 (1,500,000+800,000)/5 = 460,000 · 취득 (1,200,000+400,000)/5 = 320,000 → 10억 × 320 / 460 = 695,652,173
 *   2:3  양도 (1,000,000+1,200,000)/5 = 440,000 · 취득 (800,000+600,000)/5 = 280,000 → 10억 × 280 / 440 = 636,363,636
 */
import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { coerceDates } from "@/lib/api/date-coerce";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftStockTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

const DATE_FIELDS = ["transferDate", "acquisitionDate", "filingDate", "priorYearEndDate", "listingDate"];
const GIFT_DATE = "2025-06-02";

const FILLED = {
  transferYearNetIncomePerShare: 500_000,
  transferYearNetAssetPerShare: 400_000,
  acquisitionYearNetIncomePerShare: 400_000,
  acquisitionYearNetAssetPerShare: 200_000,
} satisfies Partial<BurdenedGiftStockTransferTaxInput>;

function itemOf(over: Partial<BurdenedGiftStockTransferTaxInput>, marketType = "unlisted"): EstateItem {
  return {
    id: "u1",
    name: "비상장",
    category: "unlisted_stock",
    marketValue: 5_000_000_000,
    assumedDebtForGift: 1_000_000_000,
    unlistedStockData: { totalShares: 100_000, ownedShares: 10_000 },
    burdenedGiftStockTransferTax: { marketType, acquisitionDate: "2015-03-02", acquisitionMode: "estimated", ...FILLED, ...over },
  } as unknown as EstateItem;
}

function runFullStack(item: EstateItem) {
  const body = buildGiftStockBurdenedTransferBody(item, { giftDate: GIFT_DATE } as unknown as FormState);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) return { body, blocked: parsed.error.issues.map((i) => i.path.join(".")) };
  const result = calculateStockTransferTax(buildEngineInput(coerceDates(parsed.data as Record<string, unknown>, DATE_FIELDS)));
  return { body, result };
}

describe("GB-REV ④ — 증여 부담부 2:3 대상 법인 입력", () => {
  it("GB-REV-1: 입력 없음(종전 레코드) → body는 false · 3:2 — 환산취득가 695,652,173 (불변)", () => {
    const out = runFullStack(itemOf({}));
    expect(out.body.isHeavyRealEstateForValuation).toBe(false);
    expect(out.result?.acquisitionPrice).toBe(695_652_173);
  });
  it("GB-REV-2: 🟢 2:3 대상 법인 → body는 true · 환산취득가 636,363,636", () => {
    const out = runFullStack(itemOf({ isHeavyRealEstateForValuation: true }));
    expect(out.body.isHeavyRealEstateForValuation).toBe(true);
    expect(out.result?.acquisitionPrice).toBe(636_363_636);
  });
  it("GB-REV-3: 명시 false도 3:2 (긍정 짝)", () => {
    expect(runFullStack(itemOf({ isHeavyRealEstateForValuation: false })).result?.acquisitionPrice).toBe(695_652_173);
  });
  it("GB-REV-4: 상장 종목·실지 취득에 남은 true는 싣지 않는다", () => {
    const listed = itemOf(
      { isHeavyRealEstateForValuation: true, transferDatePriceAvg1Month: 1000, acquisitionDatePriceAvg1Month: 500 },
      "kospi",
    );
    expect(buildGiftStockBurdenedTransferBody(listed, { giftDate: GIFT_DATE } as unknown as FormState).isHeavyRealEstateForValuation).toBe(false);
    const actual = itemOf({ isHeavyRealEstateForValuation: true, acquisitionMode: "actual", actualAcquisitionPrice: 100_000_000 });
    expect(buildGiftStockBurdenedTransferBody(actual, { giftDate: GIFT_DATE } as unknown as FormState).isHeavyRealEstateForValuation).toBe(false);
  });
  it("GB-REV-5: 순자산 단독 사유가 양측이면 2:3 신고가 있어도 평가에 쓰이지 않는다 (가중평균 자체가 없다)", () => {
    const base = { netAssetOnlyReason: "liquidation_or_owner_death", acquisitionNetAssetOnlyReason: "liquidation_or_owner_death" } as const;
    const off = runFullStack(itemOf({ ...base })).result?.acquisitionPrice;
    const on = runFullStack(itemOf({ ...base, isHeavyRealEstateForValuation: true })).result?.acquisitionPrice;
    expect(on).toBe(off);
    expect(off).toBe(500_000_000); // 10억 × 순자산 200,000 / 400,000
  });
  it("GB-REV-6: 2:3은 양도·취득 양 시점에 같이 걸린다 (한쪽 값만 바뀌지 않는다)", () => {
    const d = runFullStack(itemOf({ isHeavyRealEstateForValuation: true })).result?.valuationDetail;
    expect(d?.isHeavyRE).toBe(true);
    expect(d?.weightedAvgPerShare).toBe(440_000); // 양도 당시
    expect(d?.finalPerShareValue).toBe(280_000); // 취득 당시
  });
});
