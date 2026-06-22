import { describe, it, expect } from "vitest";
import { evaluateEstateItem } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 상업용 건물 부수토지 보충평가 합산 anchor — 상증법 §61①.
 * 설계: docs/00-pm/gift-commercial-building-appurtenant-land.plan.md (v2) ·
 *       docs/02-design/features/gift-commercial-building-appurtenant-land.{engine,ui}.design.md
 * 법령(KoreanLaw MST 276123 §61 실측):
 *   - §61①3호(오피스텔·일괄고시 상업용 건물): 토지+건물 일괄고시 1개 = 경로 A(현행 유지)
 *   - §61①2호+1호(일괄고시 대상 아닌 일반 상업용 건물): 건물 기준시가 + 부수토지 개별공시지가 합산 = 경로 B(신규)
 * 핵심: method==="standard_price"(보충평가)일 때만 appurtenantLandStandardPrice를 standardPrice(건물분)에 가산.
 *       시가·감정·매매사례 평가 시엔 통합액에 부수토지가 이미 포함되므로 무시.
 */

const building = (p: Partial<EstateItem>): EstateItem => ({
  id: "cb1",
  name: "테스트 상가",
  category: "real_estate_building",
  ...p,
});

describe("§61① 상업용 건물 부수토지 보충평가 합산", () => {
  it("[AL-B1] 경로 B 분리: 건물 기준시가 5억 + 부수토지 개별공시지가 2억 → 7억", () => {
    const r = evaluateEstateItem(
      building({ standardPrice: 500_000_000, appurtenantLandStandardPrice: 200_000_000 }),
    );
    expect(r.method).toBe("standard_price");
    expect(r.valuatedAmount).toBe(700_000_000);
  });

  it("[AL-A1] 경로 A 일괄고시: 부수토지 미입력 → standardPrice 그대로(이중계상 없음)", () => {
    const r = evaluateEstateItem(building({ standardPrice: 700_000_000 }));
    expect(r.valuatedAmount).toBe(700_000_000);
  });

  it("[AL-B2] 부수토지만(건물 0): 0 + 2억 → 2억", () => {
    const r = evaluateEstateItem(building({ appurtenantLandStandardPrice: 200_000_000 }));
    expect(r.valuatedAmount).toBe(200_000_000);
  });

  it("[AL-M1] 시가 우선: marketValue 6억 + 부수토지 2억 → 6억(부수토지 무시)", () => {
    const r = evaluateEstateItem(
      building({ marketValue: 600_000_000, standardPrice: 500_000_000, appurtenantLandStandardPrice: 200_000_000 }),
    );
    expect(r.method).toBe("market_value");
    expect(r.valuatedAmount).toBe(600_000_000);
  });

  it("[AL-R1] §61⑤ 임대료환산 MAX는 합산액 기준: 건물5억+토지2억=7억 vs 임대료환산 6.5억 → 7억", () => {
    // 월세 600만×12=7,200만 ÷0.12 = 6억 + 보증금 5천만 = 6.5억 < 합산 7억
    const r = evaluateEstateItem(
      building({
        standardPrice: 500_000_000,
        appurtenantLandStandardPrice: 200_000_000,
        monthlyRent: 6_000_000,
        leaseDeposit: 50_000_000,
      }),
    );
    expect(r.valuatedAmount).toBe(700_000_000);
  });

  it("[AL-C1] §66 담보채권 하한도 합산액 기준: 합산 7억 vs 저당 8억 → 8억", () => {
    const r = evaluateEstateItem(
      building({
        standardPrice: 500_000_000,
        appurtenantLandStandardPrice: 200_000_000,
        mortgageAmount: 800_000_000,
      }),
    );
    expect(r.valuatedAmount).toBe(800_000_000);
  });
});
