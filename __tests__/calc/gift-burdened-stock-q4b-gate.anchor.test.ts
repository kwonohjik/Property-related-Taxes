/**
 * 증여 부담부 주식(비상장·환산) ⑧ — Q-4b 양도기준시가(1주당 보충평가액) 0 이하 차단
 * (계획서 stock-165-4-valuation-followups §15 «남은 한계»).
 *
 * 결함: 결손·자본잠식 입력으로 양도기준시가가 0 이하가 되면 ⑫만 400을 냈다. ⑧은 «존재»만 봐서 통과시켰고,
 * 합산 호출이 전체 실패하며 배너에 JSON이 그대로 나왔다(세액 오류는 없음 — ⑫ fail-closed).
 * 규칙: ⑧이 막는 조건 = ⑫가 막는 조건 (3중 패턴).
 */
import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { burdenedTransferStdNonPositiveError } from "@/lib/calc/gift-burdened-stock-unlisted";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import { validateStep } from "@/components/calc/gift-tax-form-validate";

const MSG = UNLISTED_MESSAGES.TRANSFER_STD_NON_POSITIVE;

function item(over: Record<string, unknown>, marketType = "unlisted"): EstateItem {
  return {
    id: "u1",
    name: "비상장",
    category: "unlisted_stock",
    marketValue: 5_000_000_000,
    assumedDebtForGift: 1_000_000_000,
    unlistedStockData: { totalShares: 100_000, ownedShares: 10_000 },
    burdenedGiftStockTransferTax: {
      marketType,
      acquisitionDate: "2015-03-02",
      acquisitionMode: "estimated",
      transferYearNetIncomePerShare: 500_000,
      transferYearNetAssetPerShare: 400_000,
      acquisitionYearNetIncomePerShare: 400_000,
      acquisitionYearNetAssetPerShare: 200_000,
      ...over,
    },
  } as unknown as EstateItem;
}
const formOf = (giftDate: string, it: EstateItem) => ({ ...INITIAL_FORM, giftDate, stockItems: [it] }) as unknown as FormState;
const gate8 = (giftDate: string, over: Record<string, unknown>) => validateStep(1, formOf(giftDate, item(over)));
function gate12Blocks(giftDate: string, over: Record<string, unknown>) {
  const it = item(over);
  const body = buildGiftStockBurdenedTransferBody(it, formOf(giftDate, it));
  const r = addStockRefines(stockTransferInputSchema).safeParse(body);
  return !r.success && r.error.issues.some((i) => i.message === MSG);
}

describe("GB-Q4B ⑧ — 증여 부담부 비상장 양도기준시가 0 이하", () => {
  it("GB-Q4B-1: 2025 · 순자산 −100(0 하한 → 0) · 순손익 −500(0 하한 → 0) → ⑧ 차단 · 문구는 ⑫와 같다", () => {
    expect(gate8("2025-06-02", { transferYearNetIncomePerShare: -500, transferYearNetAssetPerShare: -100 })).toContain(MSG);
  });
  it("GB-Q4B-2: 2008(순자산 0 하한 시행 2009.2.4. 전) · 순손익 100,000 · 순자산 −1,000,000 → 가중평균 음수 → 차단", () => {
    expect(gate8("2008-06-02", { transferYearNetIncomePerShare: 100_000, transferYearNetAssetPerShare: -1_000_000 })).toContain(MSG);
  });
  it("GB-Q4B-3: 같은 입력도 2025(0 하한 시행 후)면 순자산이 0으로 잘려 평가액이 양수라 통과한다 (긍정 짝)", () => {
    expect(gate8("2025-06-02", { transferYearNetIncomePerShare: 100_000, transferYearNetAssetPerShare: -1_000_000 })).toBeNull();
  });
  it("GB-Q4B-4: 양수 평가액 · 취득측이 0 이하여도(양도측만 분모) 통과한다", () => {
    expect(gate8("2025-06-02", {})).toBeNull();
    expect(gate8("2025-06-02", { acquisitionYearNetIncomePerShare: -500, acquisitionYearNetAssetPerShare: -100 })).toBeNull();
  });
  it("GB-Q4B-5: 입력 누락이 먼저다 — 순손익이 비었으면 누락 메시지(Q-4b 아님)", () => {
    const msg = gate8("2025-06-02", { transferYearNetIncomePerShare: undefined, transferYearNetAssetPerShare: -100 });
    expect(msg).toContain("순손익가치");
    expect(msg).not.toContain(MSG);
  });
  it("GB-Q4B-6: 순자산 단독 사유가 있으면 순손익 없이 순자산만으로 잰다", () => {
    const base = { netAssetOnlyReason: "liquidation_or_owner_death", transferYearNetIncomePerShare: undefined };
    expect(gate8("2025-06-02", { ...base, transferYearNetAssetPerShare: -100 })).toContain(MSG);
    expect(gate8("2025-06-02", { ...base, transferYearNetAssetPerShare: 100 })).toBeNull();
  });
  it("GB-Q4B-7: 2000.4.2. 이전은 연혁 오류가 먼저다 — Q-4b는 값을 재지 않는다", () => {
    const over = { transferYearNetIncomePerShare: -500, transferYearNetAssetPerShare: -100 };
    expect(burdenedTransferStdNonPositiveError(over, "2000-04-02")).toBeNull();
    expect(gate8("2000-04-02", over)).not.toContain(MSG);
  });
  it("GB-Q4B-5a: 다른 칸(취득측)이 비어 있으면 그 누락이 먼저다 — Q-4b는 입력이 다 있을 때만 잰다", () => {
    const msg = gate8("2025-06-02", {
      transferYearNetIncomePerShare: -500,
      transferYearNetAssetPerShare: -100,
      acquisitionYearNetAssetPerShare: undefined,
    });
    expect(msg).toContain("취득일 직전 사업연도 1주당 순자산가치");
    expect(msg).not.toContain(MSG);
  });
  it("GB-Q4B-5b: 헬퍼는 순손익 누락(사유 없음)을 0으로 읽지 않는다 — 필수 오류가 따로 뜬다", () => {
    expect(burdenedTransferStdNonPositiveError({ transferYearNetAssetPerShare: -100 }, "2025-06-02")).toBeNull();
    expect(burdenedTransferStdNonPositiveError({ transferYearNetIncomePerShare: 1, transferYearNetAssetPerShare: undefined }, "2025-06-02")).toBeNull();
  });
  it("GB-Q4B-8: 증여일이 비었으면 막지 않는다", () => {
    expect(burdenedTransferStdNonPositiveError({ transferYearNetIncomePerShare: -500, transferYearNetAssetPerShare: -100 }, "")).toBeNull();
  });
  it("GB-Q4B-9: 2:3 대상 법인 신고가 가중치를 바꾼다 — 같은 입력이 3:2면 통과 · 2:3이면 차단 (2008)", () => {
    // 순손익 100,000 · 순자산 −100,000: 3:2 → (300,000−200,000)/5 = 20,000 양수 / 2:3 → (200,000−300,000)/5 = −20,000 → 차단
    const over = { transferYearNetIncomePerShare: 100_000, transferYearNetAssetPerShare: -100_000 };
    expect(gate8("2008-06-02", over)).toBeNull();
    expect(gate8("2008-06-02", { ...over, isHeavyRealEstateForValuation: true })).toContain(MSG);
  });
  it("GB-Q4B-10: 상장 종목·실지 취득은 이 검사를 타지 않는다", () => {
    const bad = { transferYearNetIncomePerShare: -500, transferYearNetAssetPerShare: -100 };
    expect(validateStep(1, formOf("2025-06-02", item({ ...bad, transferDatePriceAvg1Month: 1000, acquisitionDatePriceAvg1Month: 500 }, "kospi"))) ?? "").not.toContain(MSG);
    expect(gate8("2025-06-02", { ...bad, acquisitionMode: "actual", actualAcquisitionPrice: 100_000_000 }) ?? "").not.toContain(MSG);
  });
  it("GB-Q4B-11: ⑧ 차단 ⇔ ⑫ 차단 — 날짜 × 순손익 × 순자산 × 사유 × 2:3 격자 1,568조합 전수 일치", () => {
    const dates = ["2000-04-02", "2000-04-03", "2007-02-27", "2007-02-28", "2008-06-02", "2009-02-03", "2009-02-04", "2025-06-02"];
    const vals = [-1_000_000, -100_000, -100, 0, 50_000, 100_000, 500_000];
    let n = 0;
    let blockedCount = 0;
    for (const d of dates)
      for (const ni of vals)
        for (const na of vals)
          for (const reason of [undefined, "liquidation_or_owner_death"] as const)
            for (const heavy of [false, true]) {
              const over = {
                transferYearNetIncomePerShare: ni,
                transferYearNetAssetPerShare: na,
                netAssetOnlyReason: reason,
                acquisitionNetAssetOnlyReason: null,
                isHeavyRealEstateForValuation: heavy,
              };
              const blocked8 = burdenedTransferStdNonPositiveError(over as never, d) !== null;
              expect(blocked8, `${d} ni=${ni} na=${na} r=${reason} h=${heavy}`).toBe(gate12Blocks(d, over));
              if (blocked8) blockedCount++;
              n++;
            }
    expect(n).toBe(8 * 7 * 7 * 2 * 2);
    expect(blockedCount).toBeGreaterThan(50); // 비공허 — 차단되는 조합이 실제로 많다
  });
});
