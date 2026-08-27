/**
 * anchor: 상장 비대주주 장외 분류 **통합** — `listed_otc_non_major` 폐기
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Track B · B-2)
 *
 * ## 왜 둘이 중복인가 (실측)
 *
 * · 세율: `stock-transfer-rate-calc.ts` 에서 **fall-through** — 둘 다 §104①11호나목(중소 10%/그 밖 20%)
 * · 분할 모드: `NON_MAJOR_SINGLE_RATE_CATEGORIES` 에 **둘 다** 들어 있다
 * · 조문: PR #1327 이 후자를 `①3가2)` 로 교정해 **완전히 겹친다**
 *
 * ⇒ 같은 사실(상장 비대주주가 증권시장 밖에서 양도)을 두 이름으로 부르고 있었다.
 *
 * ## 왜 K-OTC 쪽 이름을 버리는가
 *
 * 상장주식의 K-OTC 거래는 **법문상 성립하지 않는다** — 자본시장법 §286①5호가 협회 업무를
 * 「**상장되지 아니한 주권**의 장외매매거래」로 정의한다. 상장 종목에서 그 토글이 뜻하는 것은
 * 실제로는 **ATS**(§8조의2⑤ — 상장주권 대상)이고, 그것도 「증권시장 밖 거래」의 한 갈래다.
 * ⇒ 사실을 그대로 담는 이름은 `listed_off_market_non_major` 하나다.
 *
 * ⚠️ union·라벨은 **지우지 않는다** — 저장된 이력에 `listed_otc_non_major` 가 남아 있다.
 *    새로 만들지 않을 뿐이다.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function base(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 110_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  };
}

describe("LM-1 상장 비대주주 장외 — 한 이름으로 모인다", () => {
  it("LM-1-1: 장외(`isOnMarketTransaction: false`) → listed_off_market_non_major", () => {
    const r = calculateStockTransferTax(base({ isOnMarketTransaction: false }));
    expect(r.taxCategory).toBe("listed_off_market_non_major");
    expect(r.appliedSection94).toBe("①3가2)");
  });

  it("LM-1-2: ATS·K-OTC 선언(`isKOTCTrading`)도 **같은 카테고리** — 종전엔 listed_otc_non_major", () => {
    const r = calculateStockTransferTax(base({ isKOTCTrading: true }));
    expect(r.taxCategory).toBe("listed_off_market_non_major");
    expect(r.appliedSection94).toBe("①3가2)");
  });

  it("LM-1-3: 세액은 불변 — 두 이름의 세율·취급이 이미 같았다", () => {
    const off = calculateStockTransferTax(base({ isOnMarketTransaction: false }));
    const ats = calculateStockTransferTax(base({ isKOTCTrading: true }));
    expect(ats.finalTax).toBe(off.finalTax);
    expect(ats.calculatedTax).toBe(off.calculatedTax);
  });

  it("LM-1-4: 어떤 입력으로도 `listed_otc_non_major` 를 새로 만들지 않는다", () => {
    const combos: Partial<StockTransferInput>[] = [
      { isKOTCTrading: true },
      { isKOTCTrading: true, isOnMarketTransaction: false },
      { isKOTCTrading: true, isSmallMediumEnterprise: true },
      { marketType: "kosdaq", isKOTCTrading: true },
      { marketType: "konex", isKOTCTrading: true },
    ];
    for (const o of combos) {
      expect(calculateStockTransferTax(base(o)).taxCategory).not.toBe("listed_otc_non_major");
    }
  });

  it("LM-1-5: 장내 비대주주는 종전대로 비과세 — 통합이 그 축을 건드리지 않는다", () => {
    const r = calculateStockTransferTax(base());
    expect(r.isExempt).toBe(true);
  });
});
