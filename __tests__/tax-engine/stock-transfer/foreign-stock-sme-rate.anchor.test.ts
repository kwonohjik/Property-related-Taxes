/**
 * anchor: 국외주식 중소기업 10% 세율 (§104①12호가목 · 영 §157의3 2호)
 *
 * ## 무엇을 잡는가
 *
 * `STOCK_FOREIGN_RATE = 0.2` 고정이고, 주석은 「외국법인에는 「중소기업기본법」을 적용하지
 * 않으므로 §104①12호**가목**(중소기업 10%)은 도달 불가」라고 적혀 있었다. **1호만 보고
 * 2호를 놓쳤다.**
 *
 * 시행령 **§157의3(국외주식 등의 범위)** [본조신설 2024.12.31]:
 *   1. **외국법인**이 발행한 주식등(증권시장 상장분·§178의2④ 제외)
 *   2. **내국법인**이 발행한 주식등으로서 **해외 증권시장에 상장된 것**
 *
 * 2호가 내국법인을 명시하고, §157의2①의 「중소기업」은 「중소기업기본법」 §2 기준이라
 * **내국 중소기업의 해외상장 주식**은 §104①12호가목 **10%**다. 코드는 20% 고정 ⇒ **2배 과대**.
 *
 * 판정 시점은 §157의2③ — 「양도일이 속하는 사업연도의 **직전 사업연도 종료일** 현재」
 * (신설법인은 양도일 현재). 사용자 입력 축이다.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calculateForeignStockTax } from "@/lib/tax-engine/stock-transfer/foreign-stock";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { foreignStockInputSchema } from "@/lib/api/stock-transfer-foreign-schema";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { ForeignStockInput } from "@/lib/tax-engine/stock-transfer/types/foreign-stock.types";

function fx(gain: number, o: Partial<ForeignStockInput> = {}): ForeignStockInput {
  return {
    marketType: "foreign_stock",
    yearsResidentInKorea: 10,
    isListedForeignCorp: true,
    stockName: "Corp",
    countryCode: "US",
    shareCount: 1,
    transferDate: new Date("2025-03-01"),
    transferPriceMode: "total",
    totalTransferPriceForeign: gain + 1_000_000,
    transferCurrencyCode: "USD",
    transferExchangeRate: 1,
    acquisitionDate: new Date("2021-01-02"),
    acquisitionMode: "actual",
    perShareAcquisitionPriceForeign: 1_000_000,
    acquisitionCurrencyCode: "USD",
    acquisitionExchangeRate: 1,
    capitalExpenditureForeign: 0,
    transferCostForeign: 0,
    hasForeignTax: false,
    foreignTaxMethod: "credit",
    isElectronicFiling: false,
    ...o,
  } as ForeignStockInput;
}

describe("FS-SME — 국외주식 중소기업 10% (§104①12호가목 · 영 §157의3 2호)", () => {
  it("FS-SME-1: 중소기업이면 10%", () => {
    const r = calculateForeignStockTax(
      fx(50_000_000, { isSmallMediumEnterprise: true }),
    );
    expect(r.appliedRate).toBe(0.1);
    // 과세표준 47,500,000 × 10%
    expect(r.incomeTax).toBe(4_750_000);
  });

  it("FS-SME-2: 그 밖이면 20% (종전 동작 유지)", () => {
    const r = calculateForeignStockTax(fx(50_000_000));
    expect(r.appliedRate).toBe(0.2);
    expect(r.incomeTax).toBe(9_500_000);
  });

  it("FS-SME-3: 미입력이면 20% — 중소기업 여부는 납세자만 아는 사실이다", () => {
    const r = calculateForeignStockTax(
      fx(50_000_000, { isSmallMediumEnterprise: undefined }),
    );
    expect(r.appliedRate).toBe(0.2);
  });

  it("FS-SME-4: 다종목 합산에서도 종목별로 갈린다", () => {
    const r = calculateStockTransferTaxAggregate([
      fx(50_000_000, { isSmallMediumEnterprise: true }),
      fx(50_000_000, { transferDate: new Date("2025-09-01") }),
    ]);
    // 첫 종목 기본공제 250만 → 과표 47,500,000 × 10% = 4,750,000
    expect(r.items[0].calculatedTax).toBe(4_750_000);
    // 둘째 종목 과표 50,000,000 × 20% = 10,000,000
    expect(r.items[1].calculatedTax).toBe(10_000_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ④⑫ 배선 — leaf 직접호출 anchor는 이 계층을 안 태운다
// ─────────────────────────────────────────────────────────────────────────────

describe("FS-SME-PL — ④ body·⑫ Zod가 중소기업 플래그를 나른다", () => {
  const form = (patch: Partial<StockTransferFormData>): StockTransferFormData =>
    ({
      ...createInitialStockFormData(),
      marketType: "foreign_stock",
      securityName: "Corp",
      shareCount: "1",
      transferDate: "2025-03-01",
      acquisitionDate: "2021-01-02",
      fgTransferPriceMode: "total",
      totalTransferPriceForeign: "51000000",
      transferExchangeRate: "1",
      perShareAcquisitionPriceForeign: "1000000",
      acquisitionExchangeRate: "1",
      ...patch,
    }) as StockTransferFormData;

  it("FS-SME-PL-1: 2호(내국법인 해외상장) + 중소기업 → body에 실린다", () => {
    const body = buildStockTransferApiBody(
      form({ isListedForeignCorp: false, isSmallMediumEnterprise: true }),
    );
    expect(body.isSmallMediumEnterprise).toBe(true);
  });

  it("FS-SME-PL-2: 1호(외국법인 발행)면 ④가 눌러 보낸다 (stale 10% 차단 — 3중 패턴)", () => {
    const body = buildStockTransferApiBody(
      form({ isListedForeignCorp: true, isSmallMediumEnterprise: true }),
    );
    expect(body.isSmallMediumEnterprise).toBe(false);
  });

  it("FS-SME-PL-3: ⑫ Zod가 필드를 통과시킨다 (침묵 strip 차단)", () => {
    const body = buildStockTransferApiBody(
      form({ isListedForeignCorp: false, isSmallMediumEnterprise: true }),
    );
    const parsed = foreignStockInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" / "));
    }
    expect((parsed.data as Record<string, unknown>).isSmallMediumEnterprise).toBe(true);
  });
});
