/**
 * anchor: 국외전출세 외국납부세액 — **외화 + 기준환율 입력** (§118의13 · 소령 §178의5)
 *
 * 계획서: docs/00-pm/stock-transfer-exit-tax-foreign-stock.plan.md (v1 「사용자 직접 입력 + hint」)
 *
 * ## 무엇이 없었나
 *
 * §118의13 외국납부세액은 **외국에서 납부한 세액**이라 본래 외화다. 그런데 폼은 「원화 환산」
 * 금액만 받아 **사용자가 스스로 곱해 넣어야** 했다 — 환율을 어디서 가져왔는지 화면에 남지
 * 않으니 검산도 안 된다.
 *
 * 해외주식(PR-4A)은 이미 같은 축을 갖고 있다(`foreignTaxPaidForeign` × `foreignTaxExchangeRate`).
 * 국외전출세도 **같은 이름·같은 구조**로 맞춘다(sibling 정본 재사용).
 *
 * ⚠️ **원화 직접 입력도 계속 받는다** — 외화·환율 미입력이면 종전대로 `foreignTaxPaid` 를 쓴다.
 *    저장된 이력과 기존 입력 흐름이 그대로 동작해야 한다.
 */

import { describe, it, expect } from "vitest";
import { calculateExitTax } from "@/lib/tax-engine/stock-transfer/exit-tax";
import type { ExitTaxInput } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

/**
 * 대주주 · 거주 8년 · 1종목 — `exit-tax.test.ts` 의 ET-anchor-01 픽스처를 그대로 따른다.
 *
 * ⚠️ 필드명을 임의로 지어내면 `isLiable: false` 로 조용히 빠진다(실측: `yearsResidentInKorea`·
 *    `hasFiledHoldingReport` 로 썼다가 납세의무 요건을 못 넘어 전 케이스가 0이 됐다).
 *    양도차익 100,000 × (50,000 − 20,000) = 3,000,000,000 이 나오는 격자다.
 */
function base(o: Partial<ExitTaxInput> = {}): ExitTaxInput {
  return {
    marketType: "exit_tax",
    yearsResidentLast10: 8,
    departureDate: new Date("2026-06-01"),
    isMajorShareholder: true,
    holdings: [
      {
        id: "holding-1",
        stockName: "테스트주식",
        marketType: "kospi",
        shareCount: 100_000,
        acquisitionDate: new Date("2015-01-01"),
        perShareAcquisitionPrice: 20_000,
        departureDayValuationMode: "market_price",
        departureDayMarketPrice: 50_000,
      },
    ],
    deferralRequested: false,
    deferralReason: "none",
    foreignTaxExclusionReason: "none",
    hasFiledHoldingsReport: true,
    reenteredWithin5Years: false,
    ...o,
  } as ExitTaxInput;
}

describe("EX-1 외화 + 기준환율", () => {
  it("EX-1-1: 외화 1,000 × 환율 1,350 = 1,350,000 원화 환산", () => {
    const r = calculateExitTax(
      base({
        foreignTaxPaidForeign: 1_000,
        foreignTaxCurrencyCode: "USD",
        foreignTaxExchangeRate: 1_350,
      }),
    );
    expect(r.foreignTaxPaidKrw).toBe(1_350_000);
  });

  it("EX-1-2: 환산액이 §118의13 공제에 실제로 쓰인다", () => {
    const withFx = calculateExitTax(
      base({
        foreignTaxPaidForeign: 1_000,
        foreignTaxCurrencyCode: "USD",
        foreignTaxExchangeRate: 1_350,
      }),
    );
    const withKrw = calculateExitTax(base({ foreignTaxPaid: 1_350_000 }));
    expect(withFx.foreignTaxCreditApplied).toBe(withKrw.foreignTaxCreditApplied);
  });

  it("EX-1-3: 원 미만은 절사한다 (1,000 × 1,350.7 = 1,350,700)", () => {
    const r = calculateExitTax(
      base({
        foreignTaxPaidForeign: 1_000,
        foreignTaxCurrencyCode: "USD",
        foreignTaxExchangeRate: 1_350.7,
      }),
    );
    expect(r.foreignTaxPaidKrw).toBe(1_350_700);
  });
});

describe("EX-2 하위 호환 — 원화 직접 입력", () => {
  it("EX-2-1: 외화·환율 미입력이면 종전대로 `foreignTaxPaid` 를 쓴다", () => {
    const r = calculateExitTax(base({ foreignTaxPaid: 2_000_000 }));
    expect(r.foreignTaxPaidKrw).toBe(2_000_000);
  });

  it("EX-2-2: 둘 다 없으면 0 — 공제도 없다", () => {
    const r = calculateExitTax(base());
    expect(r.foreignTaxPaidKrw ?? 0).toBe(0);
    expect(r.foreignTaxCreditApplied ?? 0).toBe(0);
  });

  it("EX-2-3: 환율만 있고 외화가 없으면 환산하지 않는다 — 조용히 0을 만들지 않는다", () => {
    const r = calculateExitTax(base({ foreignTaxPaid: 500_000, foreignTaxExchangeRate: 1_350 }));
    expect(r.foreignTaxPaidKrw).toBe(500_000);
  });
});

// ============================================================
// EX-3 배선 — 폼 → ④ → ⑫ → 엔진
//
// 국외전출세는 스키마·매핑이 **국내주식·해외주식과 또 다른 파일**이다
// (`stock-transfer-exit-tax-schema.ts` · route 의 exit 분기). 한쪽만 고치면 조용히 strip 된다.
// ============================================================

describe("EX-3 배선", () => {
  it("EX-3-1: 폼 3칸이 ④ body 를 지나 ⑫ zod 를 통과한다", async () => {
    const { buildStockTransferApiBody } = await import("@/lib/calc/stock-transfer-tax-api");
    const { exitTaxInputSchema } = await import("@/lib/api/stock-transfer-exit-tax-schema");
    const { createInitialStockFormData } = await import("@/lib/stores/calc-wizard-stock-store");

    const body = buildStockTransferApiBody({
      ...createInitialStockFormData(),
      marketType: "exit_tax",
      securityName: "테스트",
      etYearsResidentLast10: "8",
      etDepartureDate: "2026-06-01",
      etIsMajorShareholder: true,
      etHoldings: [
        {
          id: "h1",
          stockName: "테스트주식",
          marketType: "kospi",
          shareCount: "100000",
          acquisitionDate: "2015-01-01",
          perShareAcquisitionPrice: "20000",
          departureDayValuationMode: "market_price",
          departureDayMarketPrice: "50000",
          priorYearEndMonthAvg: "",
          unlistedSamplePrice: "",
          unlistedStdPricePerShare: "",
          faceValuePerShare: "",
        },
      ],
      etForeignTaxPaidForeign: "1000",
      etForeignTaxCurrencyCode: "USD",
      etForeignTaxExchangeRate: "1350",
    } as never);

    // ⑬ body spread
    expect(body.foreignTaxPaidForeign).toBe(1_000);
    expect(body.foreignTaxExchangeRate).toBe(1_350);
    expect(body.foreignTaxCurrencyCode).toBe("USD");

    // ⑫ zod 가 모르는 키를 버리지 않는다
    const parsed = exitTaxInputSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const d = parsed.data as Record<string, unknown>;
      expect(d.foreignTaxPaidForeign).toBe(1_000);
      expect(d.foreignTaxExchangeRate).toBe(1_350);
    }
  });
});
