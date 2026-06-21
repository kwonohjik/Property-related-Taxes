/**
 * 증여세 — 담보채무 §14 부채명세 안내 제외 회귀
 *
 * §14(부채 명세 공제)는 상속세 전용 개념. 증여세에는 §14 부채명세 공제가 없으므로
 * (채무는 부담부증여 §47① 인수채무로만 차감) 증여 결과 warnings에서 제외해야 한다.
 * 공유 재산평가(property-valuation)는 상속세용으로 이 안내를 계속 emit하므로,
 * 증여 엔진(gift-tax.ts)이 필터링한다.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { evaluateLand, COLLATERAL_DEBT_NOTICE } from "@/lib/tax-engine/property-valuation";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const COLLATERAL_LAND: EstateItem = {
  id: "g1",
  category: "real_estate_land",
  name: "담보 토지",
  marketValue: 1_000_000_000,
  leaseDeposit: 300_000_000, // 담보채권액 > 0 → §66 평가특례 트리거
};

const GIFT_INPUT: GiftTaxInput = {
  giftDate: "2025-01-01",
  donorRelation: "lineal_descendant",
  donor: "father",
  giftItems: [COLLATERAL_LAND],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_descendant" },
  creditInput: { isFiledOnTime: true },
};

describe("증여세 담보채무 §14 안내 제외", () => {
  it("재산평가(상속세용)는 §14 담보채무 안내를 emit한다 (상속세 경로 보존)", () => {
    const vr = evaluateLand(COLLATERAL_LAND);
    expect(vr.warnings).toContain(COLLATERAL_DEBT_NOTICE);
  });

  it("증여세 결과 warnings에는 §14 담보채무 안내가 없다", () => {
    const result = calcGiftTax(GIFT_INPUT);
    expect(result.warnings).not.toContain(COLLATERAL_DEBT_NOTICE);
  });
});
