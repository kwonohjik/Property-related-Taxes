/**
 * 증여 부담부 주식(비상장·환산) ⑧ — §165④ 증여일 연혁 차단 (계획서 stock-165-4-valuation-followups §13.5).
 *
 * 결함: 사유를 고른 뒤 증여일을 다른 연혁 구간으로 고치면 ⑧은 통과하고 ⑫만 400을 냈다.
 * 합산 호출이라 부담부 주식 전체가 실패하고 배너에는 JSON이 그대로 나왔다(증여세 자체는 계산됨).
 * 규칙: ⑧이 막는 조건 = ⑫가 막는 조건 (3중 패턴).
 */
import { describe, it, expect } from "vitest";
import { buildGiftStockBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { burdenedUnlistedEraError } from "@/lib/calc/gift-burdened-stock-unlisted";
import { addStockRefines, stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import { INITIAL_FORM } from "@/components/calc/gift-tax-form-shared";
import { validateStep } from "@/components/calc/gift-tax-form-validate";

type Reason = "consecutive_loss_3y" | "stock_holding_company" | "remaining_term_under_3y" | "liquidation_or_owner_death" | "no_business_or_short_or_closed" | null | undefined;

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
      acquisitionYearNetIncomePerShare: 100_000,
      acquisitionYearNetAssetPerShare: 80_000,
      ...over,
    },
  } as unknown as EstateItem;
}
const formOf = (giftDate: string, it: EstateItem) =>
  ({ ...INITIAL_FORM, giftDate, stockItems: [it] }) as unknown as FormState;

function gate8(giftDate: string, over: Record<string, unknown>) {
  return validateStep(1, formOf(giftDate, item(over)));
}
function gate12Blocks(giftDate: string, over: Record<string, unknown>) {
  const it = item(over);
  const body = buildGiftStockBurdenedTransferBody(it, formOf(giftDate, it));
  const r = addStockRefines(stockTransferInputSchema).safeParse(body);
  return !r.success && r.error.issues.some((i) => ["netAssetOnlyReason", "acquisitionNetAssetOnlyReason", "acquisitionMode"].includes(String(i.path[0])));
}

describe("GB-ERA ⑧ — 증여 부담부 비상장 §165④ 연혁", () => {
  it("GB-ERA-1: 증여일 2025 + 구 다목(양측) → ⑧ 차단 · 문구는 ⑫와 같다", () => {
    const msg = gate8("2025-06-02", { netAssetOnlyReason: "consecutive_loss_3y", acquisitionNetAssetOnlyReason: "consecutive_loss_3y" });
    expect(msg).toContain(UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA);
  });
  it("GB-ERA-2: 증여일 2022 + 신 다목(양도측) → 차단", () => {
    expect(gate8("2022-06-02", { netAssetOnlyReason: "stock_holding_company", acquisitionNetAssetOnlyReason: null })).toContain(
      UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA,
    );
  });
  it("GB-ERA-3: 취득측만 구 다목이어도 차단 (양도측 «없음»)", () => {
    expect(gate8("2025-06-02", { netAssetOnlyReason: undefined, acquisitionNetAssetOnlyReason: "consecutive_loss_3y" })).toContain(
      UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA,
    );
  });
  it("GB-ERA-4: 키 없는 종전 레코드는 양도 사유를 취득측이 따른다 → 양도측 구 다목이면 차단", () => {
    expect(gate8("2025-06-02", { netAssetOnlyReason: "consecutive_loss_3y" })).toContain(UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA);
  });
  it("GB-ERA-5: 증여일 2000.4.2. 이전 → 산식 미지원 문구 (2000.4.3.부터 지원)", () => {
    expect(gate8("2000-04-02", {})).toContain(UNLISTED_MESSAGES.SECTION_165_4_ERA_UNSUPPORTED);
    expect(gate8("2000-04-03", {})).toBeNull();
  });
  it("GB-ERA-6: 연혁에 맞는 사유 · «없음» · 가목/나목은 통과 (긍정 짝)", () => {
    expect(gate8("2025-06-02", { netAssetOnlyReason: "stock_holding_company", acquisitionNetAssetOnlyReason: "stock_holding_company" })).toBeNull();
    expect(gate8("2022-06-02", { netAssetOnlyReason: "consecutive_loss_3y", acquisitionNetAssetOnlyReason: "consecutive_loss_3y" })).toBeNull();
    expect(gate8("2025-06-02", { netAssetOnlyReason: undefined, acquisitionNetAssetOnlyReason: null })).toBeNull();
    expect(gate8("2025-06-02", { netAssetOnlyReason: "liquidation_or_owner_death", acquisitionNetAssetOnlyReason: "no_business_or_short_or_closed" })).toBeNull();
  });
  it("GB-ERA-7: 경계 — 2023.2.27.은 구 다목만 · 2.28.은 신 다목만", () => {
    const old = { netAssetOnlyReason: "consecutive_loss_3y", acquisitionNetAssetOnlyReason: "consecutive_loss_3y" };
    const nw = { netAssetOnlyReason: "remaining_term_under_3y", acquisitionNetAssetOnlyReason: "remaining_term_under_3y" };
    expect(gate8("2023-02-27", old)).toBeNull();
    expect(gate8("2023-02-28", old)).not.toBeNull();
    expect(gate8("2023-02-27", nw)).not.toBeNull();
    expect(gate8("2023-02-28", nw)).toBeNull();
  });
  it("GB-ERA-8: 증여일이 비었거나 해석 불가면 막지 않는다 (증여일 필수는 1단계가 잡는다)", () => {
    expect(burdenedUnlistedEraError({ netAssetOnlyReason: "consecutive_loss_3y" }, undefined)).toBeNull();
    expect(burdenedUnlistedEraError({ netAssetOnlyReason: "consecutive_loss_3y" }, "")).toBeNull();
    expect(burdenedUnlistedEraError({ netAssetOnlyReason: "consecutive_loss_3y" }, "not-a-date")).toBeNull();
  });
  it("GB-ERA-9: 상장 종목·실지 취득은 사유를 읽지 않아 남은 값이 막지 않는다", () => {
    const stale = { netAssetOnlyReason: "consecutive_loss_3y" };
    expect(validateStep(1, formOf("2025-06-02", item({ ...stale, transferDatePriceAvg1Month: 1000, acquisitionDatePriceAvg1Month: 500 }, "kospi"))) ?? "").not.toContain(
      UNLISTED_MESSAGES.NET_ASSET_ONLY_REASON_ERA,
    );
    expect(gate8("2025-06-02", { ...stale, acquisitionMode: "actual", actualAcquisitionPrice: 100_000_000 })).toBeNull();
  });
  it("GB-ERA-10: ⑧ 차단 ⇔ ⑫ 차단 — 사유 × 증여일 격자 전수 일치", () => {
    const reasons: Reason[] = [undefined, "liquidation_or_owner_death", "no_business_or_short_or_closed", "consecutive_loss_3y", "stock_holding_company", "remaining_term_under_3y"];
    const dates = ["1999-12-31", "2000-04-02", "2000-04-03", "2007-02-27", "2007-02-28", "2023-02-27", "2023-02-28", "2025-06-02"];
    let n = 0;
    for (const d of dates)
      for (const t of reasons)
        for (const a of [...reasons, null] as Reason[]) {
          const over = { netAssetOnlyReason: t, acquisitionNetAssetOnlyReason: a };
          const blocked8 = burdenedUnlistedEraError(over as never, d) !== null;
          expect(blocked8, `${d} t=${t} a=${a}`).toBe(gate12Blocks(d, over));
          n++;
        }
    expect(n).toBe(8 * 6 * 7);
  });
});
