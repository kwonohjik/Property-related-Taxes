/**
 * anchor: §104⑤ 본문 후단 «8호·9호 동일자산 의제»의 **시행일 게이트** — 2018.1.1. 양도분부터
 *
 * 계획서: `docs/02-design/features/transfer-104-5-latter-clause-start-date.plan.md` Phase 1 · Q-2 (사용자 결정 2026-10-16: 법문대로)
 *
 * [법령] 법률 제15225호(2017.12.19.) 부칙 제1조 본문(2018.1.1. 시행) + 제2조②(이 법 시행 이후 양도하는 자산부터).
 *   단서 1호가 4.1.로 미룬 것은 «제5항제2호»·⑦·⑧ 등뿐 — §104⑤ 각 호 외의 부분(후단 포함)은 열거에 없다.
 *   2017.7.1. 시행본(2017.12.31.까지 유효) §104⑤에는 후단이 없다.
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 1. 시기 판정 경계(2017-12-31 ↔ 2018-01-01) — «2018.4.1.»이 아니다.
 * 2. 크로스 엔진: 의제 미적용이면 2호는 8호·9호를 **따로** 계산한 값의 합을 쓴다.
 * 3. 어댑터가 `taxYear`로 그 플래그를 정한다.
 * 4. 주식 쪽 조정액 안내는 2018.1.1. 전 양도분에 생기지 않는다.
 *
 * ⚠️ 부동산 «한 필지 별개 자산» 분리는 이 게이트에 **넣지 않는다** — 2018.1.1. 전 양도분도 같은 계산을 하기로 결정했다(Q-1).
 */
import { describe, it, expect } from "vitest";
import {
  isSec104_5LatterClauseInForce,
  isSec104_5LatterClauseInForceForTaxYear,
} from "@/lib/tax-engine/data/sec104-5-latter-clause-era";
import { computeCross1045 } from "@/lib/tax-engine/comparative-104-5-cross";
import { BASIC_PROGRESSIVE_BRACKETS, NBL_HEAVY_CORP_BRACKETS } from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import { buildCross1045Input } from "@/lib/calc/cross-104-5-adapter";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { passingBlockShareholderGate } from "../stock-transfer/_block-shareholder-fixture";

describe("E-1: 시기 판정 경계", () => {
  it("2017-12-31은 미적용, 2018-01-01은 적용 — 4.1.이 아니다", () => {
    expect(isSec104_5LatterClauseInForce("2017-12-31")).toBe(false);
    expect(isSec104_5LatterClauseInForce("2018-01-01")).toBe(true);
    expect(isSec104_5LatterClauseInForce("2018-03-31")).toBe(true); // 4.1. 전 3개월도 적용
    expect(isSec104_5LatterClauseInForce("2018-04-01")).toBe(true);
  });
  it("Date 입력도 같다(로컬 달력 기준)", () => {
    expect(isSec104_5LatterClauseInForce(new Date(2017, 11, 31))).toBe(false);
    expect(isSec104_5LatterClauseInForce(new Date(2018, 0, 1))).toBe(true);
    expect(isSec104_5LatterClauseInForce(new Date("2018-01-01"))).toBe(true);
  });
  it("과세기간: 2017 미적용 · 2018 적용", () => {
    expect(isSec104_5LatterClauseInForceForTaxYear(2017)).toBe(false);
    expect(isSec104_5LatterClauseInForceForTaxYear(2018)).toBe(true);
  });
});

const base = {
  totalTaxBase: 243_500_000 + 300_000_000,
  clause8TaxBase: 243_500_000,
  clause9TaxBase: 300_000_000,
  realEstateClause1TaxBase: 0,
  otherAssetClause1TaxBase: 0,
  otherClausesTax: 0,
  basicBrackets: BASIC_PROGRESSIVE_BRACKETS,
  nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
};

describe("E-2: 크로스 엔진 — 의제 적용 여부", () => {
  it("적용(기본·2018.1.1.~): 2호 = 8호·9호 합산 → 246,680,000 (기존 A-1과 동일)", () => {
    const r = computeCross1045(base);
    expect(r.merge89Applied).toBe(true);
    expect(r.clause2Tax).toBe(246_680_000);
  });
  it("미적용(~2017): 2호 = 8호 + 9호 각각 = 96,940,000 + 124,060,000", () => {
    const r = computeCross1045({ ...base, merge89AsSameAsset: false });
    expect(r.merge89Applied).toBe(false);
    expect(r.clause2Tax).toBe(221_000_000);
    expect(r.separate89Tax).toBe(221_000_000);
    // 합산 참고값은 남아 있으나 2호에는 쓰이지 않는다
    expect(r.merged89Tax).toBe(246_680_000);
    expect(r.calculatedTax).toBe(r.applied === "clause1" ? r.clause1Tax : 221_000_000);
  });
});

describe("E-3: 어댑터가 taxYear로 플래그를 정한다", () => {
  const side = (n: number) => ({
    taxBase: n, clause1TaxBase: 0, clause1Tax: 0, nblClauseTaxBase: n, nblClauseTax: 0, clause2Tax: 0,
  });
  const args = {
    realEstate: side(243_500_000),
    otherAsset: side(300_000_000),
    basicBrackets: BASIC_PROGRESSIVE_BRACKETS,
    nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
  };
  it("2017 → false · 2018 → true", () => {
    expect(buildCross1045Input({ ...args, taxYear: 2017 }).merge89AsSameAsset).toBe(false);
    expect(buildCross1045Input({ ...args, taxYear: 2018 }).merge89AsSameAsset).toBe(true);
  });
});

function otherAsset(gain: number, o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "other_asset",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2016-12-31"),
    ...passingBlockShareholderGate(new Date("2018-06-01")),
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: new Date("2010-01-01"),
    transferDate: new Date("2018-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: gain / 100 + 10_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 10_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: new Date("2018-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  } as StockTransferInput;
}

describe("E-4: 주식 쪽 조정액 안내 — 양도일 게이트", () => {
  const o = { nblRatioOfCorpAssets: 0.6, crossClause8TaxBase: 243_500_000 };
  it("2018-01-01 양도: 조정액이 나온다", () => {
    const r = calculateStockTransferTax(otherAsset(300_000_000, { ...o, transferDate: new Date("2018-01-01") }));
    expect(r.cross1045Adjustment).toBeDefined();
    expect(r.cross1045Adjustment!.adjustment).toBeGreaterThan(0);
  });
  it("2017-12-31 양도: 조정액 없음 — 8호·9호는 별개의 자산", () => {
    const r = calculateStockTransferTax(otherAsset(300_000_000, { ...o, transferDate: new Date("2017-12-31") }));
    expect(r.cross1045Adjustment).toBeUndefined();
  });
  it("산출세액은 시기와 무관하게 같은 입력이면 같다(조정액은 세액에 미반영 — G-4)", () => {
    const a = calculateStockTransferTax(otherAsset(300_000_000, { ...o, transferDate: new Date("2018-01-01") }));
    const b = calculateStockTransferTax(otherAsset(300_000_000, { ...o, transferDate: new Date("2017-12-31") }));
    expect(a.calculatedTax).toBe(b.calculatedTax);
  });
});
