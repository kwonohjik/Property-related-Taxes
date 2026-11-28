/**
 * @vitest-environment jsdom
 *
 * 국외주식 단건 결과 카드 「환율 환산」 표 — 외화 원금 표시 (⑦)
 *
 * 종전에는 외화 금액 자리가 「— × 1,250 = 50,000,000」처럼 대시였다 — 결과에 외화 echo가 없었다.
 *
 * FX-1 FC-1 이월과세 적용: 양도 USD 200,000 × 1,500 · 취득 USD 40,000(증여자 단가 400 × 100주) × 1,250
 * FX-2 미선언: 취득 USD 80,000(수증자 단가 800 × 100주) × 1,250
 * FX-3 이월과세 적용 시 통화는 증여자 취득 통화
 * FX-4 총액 입력(total) 모드: 양도 외화 = 입력 총액
 * FX-5 소수 단가 × 주식 수의 부동소수 잔여가 화면에 새지 않는다 (12.34 × 100 = 1,234)
 * FX-6 분할 수령: 양도 외화 echo 없음(회차 표가 대신) · 통화 OTHER는 접두 없음
 * FX-7 echo가 없는 결과(이 필드 전 저장 이력)는 종전처럼 「—」
 * FX-8 분할 수령 + 양도일 환율 없음(계획서 F-1): 필요경비 적용 환율 echo가 비어도 카드가 렌더된다(종전 `fmtRate(undefined)` 크래시)
 */
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ForeignStockResultCard } from "@/components/calc/results/ForeignStockResultCard";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { ForeignStockInput, ForeignStockResult } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";
import { FOREIGN_BASE, FOREIGN_CARRYOVER } from "../../../tax-engine/stock-transfer/foreign-carryover-97-2-fixtures";

afterEach(cleanup);

const run = (i: ForeignStockInput) => calculateStockTransferTax(i) as ForeignStockResult;
const text = (r: ForeignStockResult) =>
  render(<ForeignStockResultCard result={r} stockName="Example Corp" />).container.textContent ?? "";

describe("FX — 환율 환산 표의 외화 원금", () => {
  it("FX-1 FC-1 이월과세 적용: 양도·취득 외화 원금", () => {
    const r = run(FOREIGN_CARRYOVER);
    expect(r.carryoverOutcome).toBe("applied");
    expect(r.transferPriceForeign).toBe(200_000);
    expect(r.acquisitionPriceForeign).toBe(40_000);
    const t = text(r);
    expect(t).toContain("USD 200,000 × 1,500 = 300,000,000");
    expect(t).toContain("USD 40,000 × 1,250 = 50,000,000");
    expect(t).not.toContain("— ×");
  });

  it("FX-2 미선언: 수증자 단가 기준 취득 외화", () => {
    const t = text(run(FOREIGN_BASE));
    expect(t).toContain("USD 200,000 × 1,500 = 300,000,000");
    expect(t).toContain("USD 80,000 × 1,250 = 100,000,000");
  });

  it("FX-3 이월과세 적용 시 취득 통화는 증여자 취득 통화", () => {
    const t = text(run({ ...FOREIGN_CARRYOVER, donorAcquisitionCurrencyCode: "EUR" }));
    expect(t).toContain("EUR 40,000 × 1,250 = 50,000,000");
    expect(t).toContain("USD 200,000 × 1,500");
  });

  it("FX-4 총액 입력 모드: 양도 외화 = 입력 총액", () => {
    const r = run({
      ...FOREIGN_BASE,
      transferPriceMode: "total",
      perShareTransferPriceForeign: undefined,
      totalTransferPriceForeign: 150_000,
    });
    expect(r.transferPriceForeign).toBe(150_000);
    expect(text(r)).toContain("USD 150,000 × 1,500 = 225,000,000");
  });

  it("FX-5 소수 단가 × 주식 수의 부동소수 잔여가 새지 않는다", () => {
    // 12.34 × 100 = 1233.9999999999998 (double)
    const t = text(run({ ...FOREIGN_BASE, perShareAcquisitionPriceForeign: 12.34 }));
    expect(t).toContain("USD 1,234 × 1,250");
    expect(t).not.toContain("1,233.99");
  });

  it("FX-6 분할 수령: 양도 외화 echo 없음 · 통화 OTHER는 접두 없음", () => {
    const r = run({
      ...FOREIGN_BASE,
      acquisitionCurrencyCode: "OTHER",
      transferReceiptMode: "installments",
      transferInstallmentReceipts: [
        { receiptDate: new Date("2026-06-01"), amountForeign: 100_000, exchangeRate: 1_400 },
        { receiptDate: new Date("2026-12-02"), amountForeign: 100_000, exchangeRate: 1_500 },
      ],
    });
    expect(r.transferPriceForeign).toBeUndefined();
    const t = text(r);
    expect(t).toContain("100,000 × 1,400 = 140,000,000");
    expect(t).toContain("80,000 × 1,250 = 100,000,000");
    expect(t).not.toContain("OTHER");
  });

  it("FX-7 echo 없는 결과(종전 저장 이력)는 「—」", () => {
    const r = run(FOREIGN_BASE);
    const legacy: ForeignStockResult = {
      ...r,
      transferPriceForeign: undefined,
      acquisitionPriceForeign: undefined,
      transferCurrencyCode: undefined,
      acquisitionCurrencyCode: undefined,
    };
    const t = text(legacy);
    expect(t).toContain("— × 1,500 = 300,000,000");
    expect(t).toContain("— × 1,250 = 100,000,000");
  });

  it("FX-8 분할 수령 + 양도일 환율 없음: 필요경비 적용 환율 「—」 · 카드 렌더", () => {
    const r = run({
      ...FOREIGN_BASE,
      transferExchangeRate: undefined,
      transferReceiptMode: "installments",
      transferInstallmentReceipts: [
        { receiptDate: new Date("2026-06-01"), amountForeign: 100_000, exchangeRate: 1_400 },
        { receiptDate: new Date("2026-12-02"), amountForeign: 100_000, exchangeRate: 1_500 },
      ],
    });
    expect(r.transferExchangeRate).toBeUndefined();
    expect(r.capitalExpenditureExchangeRateApplied).toBeUndefined();
    expect(r.transferPriceKrw).toBe(290_000_000);
    const t = text(r);
    expect(t).toContain("100,000 × 1,500 = 150,000,000");
    expect(t).toContain("지출일 기준환율 — (영 §178의5①)");
  });
});
