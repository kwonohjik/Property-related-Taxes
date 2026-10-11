/**
 * @vitest-environment jsdom
 *
 * 1h-G1-10 anchor — 평가방식 라디오·결과 카드가 「소득세법 시행령」 §159①1호의 본문과 괄호를 바르게 표기한다.
 *
 * §159①1호: 취득가액 = A × B/C. A = 「법 제97조제1항제1호에 따른 가액(양도가액을 상증법 §61①②⑤·§66에 따라 기준시가로 산정한 경우에는
 * 취득가액도 기준시가로 산정한다)」, C = 증여가액(MST 290841 원문 확인). 즉 본문 = 실지·환산(시가 평가 K-4/K-5),
 * 괄호 = 기준시가 안분(K-1~K-3), 분모 = C. 종전에는 기준시가를 「원칙」, 시가를 「A괄호 요건 시·A괄호 분모」로 거꾸로 적었다
 * (엔진 `burdened-gift-apportionment.ts`·계산기 `BurdenedGiftBlock`·승인 UI 설계서는 바른 쪽). 계산값은 무영향 — 표기만.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ValuationModeSection } from "@/components/calc/inheritance/estate-card/variants/BurdenedGiftValuationModeSection";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import { BURDENED_GIFT_TRANSFER } from "@/lib/tax-engine/legal-codes/burdened-gift";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const section = (bgt: object): string => {
  const item = {
    id: "apt-1", category: "real_estate_apartment", name: "아파트", standardPrice: 300_000_000, leaseDeposit: 100_000_000,
    mortgageAmount: 0, assumedDebtForGift: 100_000_000,
    burdenedGiftTransferTax: { acquisitionDate: new Date("2015-01-01"), standardPriceAtAcquisition: 150_000_000, ...bgt },
  } as unknown as EstateItem;
  return render(
    <ValuationModeSection bgt={item.burdenedGiftTransferTax!} set={() => {}} item={item} isLandType={false} />,
  ).container.textContent ?? "";
};

describe("G1-10 라디오 — 본문 = 시가(실지·환산), 괄호 = 기준시가 안분", () => {
  it("G1-10-A: 기준시가 안분은 「괄호」, 시가 평가는 「본문」이다 — 「원칙」·「A괄호 요건 시」가 아니다", () => {
    const t = section({});
    expect(t).toContain(`기준시가로 산정하므로 취득가액도 상증법 기준시가로 산정 (${BURDENED_GIFT_TRANSFER.LABEL_159_1_PAREN})`);
    expect(t).toContain(`실지취득가액 또는 환산취득가액으로 산정 (${BURDENED_GIFT_TRANSFER.LABEL_159_1_BODY})`);
    expect(t).not.toContain("§159①1호 원칙");
    expect(t).not.toContain("A괄호");
  });
  it("G1-10-B: 시가 + 실지 모드의 분모·분자 힌트도 거꾸로 적지 않는다(분모는 증여가액 C)", () => {
    const t = section({ valuationMode: "sangjeungbeop_market", acquisitionMethod: "actual", marketValueAtTransfer: 400_000_000 });
    expect(t).not.toContain("A괄호");
    expect(t).toContain("증여가액 C");
    expect(t).toContain("소령 §159①1호 본문의 안분 분자");
  });
});

describe("G1-10 결과 카드", () => {
  const result = (method: "actual" | "standard_price") =>
    ({
      isExempt: false, transferGain: 1, taxableGain: 1, longTermHoldingDeduction: 0, longTermHoldingRate: 0, basicDeduction: 0, taxBase: 1,
      calculatedTax: 0, appliedRate: 0.06, reductionAmount: 0, determinedTax: 0, penaltyTax: 0, localIncomeTax: 0, totalTax: 0, progressiveDeduction: 0,
      transferBurdenedGiftBreakdown: { acquisitionMethodUsed: method, perAsset: { land: null, building: { transferPrice: 1, acquisitionPrice: 1, estimatedDeduction: 0 } } },
    }) as unknown as TransferTaxResult;
  const txt = (r: TransferTaxResult) => render(<BurdenedTransferTaxResultCard transferTaxResults={[r]} />).container.textContent ?? "";

  it("G1-10-C: 실지(K-4) 경로는 §159①1호 본문, 기준시가(K-1~K-3) 경로는 괄호로 표기한다", () => {
    expect(txt(result("actual"))).toContain("소령 §159①1호 본문 — K-4");
    expect(txt(result("actual"))).not.toContain("A괄호");
    cleanup();
    expect(txt(result("standard_price"))).toContain("소령 §159①1호 괄호 — K-1~K-3");
  });
});
