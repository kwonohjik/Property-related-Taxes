/**
 * NBL2611 Q-13 (고지 먼저) — 증여세 마법사 부담부증여 양도분의 «비사업용 토지» 체크박스는 전량 on/off라
 * 부분 비사업용·건물 부수토지 초과분을 반영하지 않는다는 «확인 필요» 고지(리뷰 §5.2).
 */
import { describe, expect, it, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BurdenedGiftTransferSection } from "@/components/calc/inheritance/estate-card/variants/BurdenedGiftTransferSection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

function landItem(isNonBusinessLand: boolean): EstateItem {
  return {
    id: "x-1",
    category: "real_estate_land",
    name: "테스트",
    standardPrice: 1_243_350_000,
    areaSqm: 184.2,
    leaseDeposit: 0,
    mortgageAmount: 460_000_000,
    assumedDebtForGift: 460_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2015-07-26"),
      standardPriceAtAcquisition: 202_620_000,
      acquisitionCause: "purchase",
      ...(isNonBusinessLand ? { isNonBusinessLand: true } : {}),
    },
  } as unknown as EstateItem;
}

describe("Q-13 부담부증여 양도분 비사업용 토지 — 반영 범위 고지", () => {
  for (const on of [false, true]) {
    it(`체크박스 ${on ? "ON" : "OFF"}: 체크박스 바로 아래에 «부분 비사업용·건물 부수토지 초과분 미반영 — 확인 필요» 고지가 있다`, () => {
      const { container } = render(
        <BurdenedGiftTransferSection item={landItem(on)} onChange={() => {}} hasOtherBurdenedGiftTransfer={false} transferDate="2023-02-16" />,
      );
      const toggle = container.querySelector('[data-testid="bg-transfer-nonbiz-land"]');
      const notice = container.querySelector('[data-testid="bg-transfer-nonbiz-scope-notice"]');
      expect(toggle).not.toBeNull();
      expect(notice).not.toBeNull();
      expect(notice!.textContent).toContain("일부만 비사업용");
      expect(notice!.textContent).toContain("배율 초과분은 반영하지 않습니다");
      expect(notice!.textContent).toContain("확인 필요");
    });
  }
});
