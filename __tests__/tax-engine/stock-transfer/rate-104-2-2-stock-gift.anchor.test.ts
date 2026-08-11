/**
 * anchor: §104②2호 주식 확장 — 2025.1.1. 이후 증여받은 주식등 (D-5)
 *
 * 계획서: docs/02-design/features/transfer-104-2-2-gift-carryover-scope.plan.md §1 D-5 · §2 ②⑥
 *
 * ── 개정 ──────────────────────────────────────────────────────────────
 * 「소득세법」 §97의2① 대상 자산에 **§94①3호(주식등)**가 추가됐다(기간은 **1년**).
 *   · 2024-01-01 시행본: "10년 이내에 … 증여받은 **제94조제1항제1호**에 따른 자산…"
 *   · 2025-01-01 시행본: "10년(**제94조제1항제3호에 따른 자산의 경우에는 1년**) 이내에 …
 *      증여받은 **제94조제1항제1호 및 제3호**에 따른 자산…" <개정 2024.12.31>
 *
 * **부칙 — 법률 제20615호(2024.12.31. 공포)**
 *   제1조(시행일) 이 법은 **2025년 1월 1일**부터 시행한다.
 *   제8조(적용례) 제97조의2제1항 각 호 외의 부분의 개정규정은
 *     **이 법 시행 이후 증여받는 자산부터** 적용한다.
 *   ⇒ 게이트 축은 **증여일**이지 양도일이 아니다 (S-2가 이를 지킨다).
 *
 * §104②은 본문에서 **「제1항제2호ㆍ제3호 및 제11호가목」**의 보유기간을 정의하므로
 * 주식(§104①11호가목)도 처음부터 그 적용 대상이다:
 *   11. 제94조제1항제3호 가목 및 나목에 따른 자산
 *     **가.** 대주주가 양도하는 주식등
 *       1) **1년 미만 보유**한 주식등으로서 중소기업 외의 법인의 주식등: **100분의 30**
 *       2) 1)에 해당하지 아니하는 주식등 〔3억 이하 20% · 초과 25%〕
 *     나. 대주주가 아닌 자가 양도하는 주식등  ← §104② 대상 아님 (S-7)
 *
 * ── 실행 상태 ─────────────────────────────────────────────────────────
 * Pre-Do anchor: **S-1 은 현재 실패해야 한다.** 나머지는 회귀 감지선.
 * 실측 기준일 2026-08-11.
 */
import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

const D = (s: string) => new Date(s);

/** 코스닥 대주주 · 중소기업 외 · 1,000주 · 양도 5억 / 취득 1억 */
function stock(o: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 6_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: D("2025-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,
    acquisitionDate: D("2025-07-01"),
    transferDate: D("2026-03-01"),
    shareCount: 1000,
    totalIssuedShares: 100_000,
    acquisitionCause: "purchase",
    cumulativeTransferRatio: undefined,
    transferPriceMode: "actual",
    perShareTransferPrice: 500_000,
    acquisitionMode: "actual",
    perShareAcquisitionPrice: 100_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "actual",
    actualExpenses: 0,
    filingType: "preliminary",
    filingDate: D("2026-05-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
    ...o,
  };
}

const calc = (o: Partial<StockTransferInput>) =>
  calculateStockTransferTax(stock(o)) as unknown as { appliedRate: number; calculatedTax: number };

// ============================================================
// D-5 — 2025.1.1. 이후 증여받은 주식은 §104②2호 대상이다
// ============================================================

describe("D-5 주식 증여 — 증여자 취득일 통산 (2025.1.1.~ 증여분)", () => {
  /**
   * S-1: 증여 2025-07-01 → 양도 2026-03-01(8개월). 증여자는 2015년 취득.
   *
   * 증여 후 1년 이내 양도이므로 §97의2① 대상(주식은 1년)이고,
   * §104②2호에 따라 세율 보유기간은 증여자 취득일부터다 ⇒ 가목**2)** 25%.
   * 종전에는 `donorAcquisitionDate`를 무시해 가목**1)** 30%를 매겼다.
   * **차이 34,875,000원 · 과대과세.**
   *
   * ⚠️ 취득원인은 **`carryover_gift`**다 — 부동산과 같은 축으로, 「§97의2①에 해당한다」는
   * 것은 사용자가 선언해야 한다. `gift`는 미해당 선언이므로 통산하지 않는다(S-1b).
   */
  it("S-1 이월과세 증여 8개월 — 가목2) 25%여야 한다", () => {
    const r = calc({ acquisitionCause: "carryover_gift", donorAcquisitionDate: D("2015-01-01") });
    expect(r.appliedRate).toBe(0.25);
    expect(r.calculatedTax).toBe(84_375_000);
  });

  /** S-1b 단순 증여는 §97의2① 미해당 선언 — 증여자 취득일이 있어도 수증일 기산. */
  it("S-1b 단순 증여(gift) + 증여자 취득일 — 30% 유지", () => {
    const r = calc({ acquisitionCause: "gift", donorAcquisitionDate: D("2015-01-01") });
    expect(r.appliedRate).toBe(0.3);
    expect(r.calculatedTax).toBe(119_250_000);
  });

  /** S-1의 기대값 근거 — 2015년 취득으로 보유하면 25%. */
  it("S-1exp 매매 2015 취득 (대조군) — 25%", () => {
    const r = calc({ acquisitionCause: "purchase", acquisitionDate: D("2015-01-01") });
    expect(r.appliedRate).toBe(0.25);
    expect(r.calculatedTax).toBe(84_375_000);
  });

  /** S-4: §104②**1호** 상속은 개정 전부터 정당하게 통산돼 왔다. 건드리면 안 된다. */
  it("S-4 상속 — 피상속인 취득일 통산 유지 (§104②1호)", () => {
    const r = calc({ acquisitionCause: "inheritance", decedentAcquisitionDate: D("2015-01-01") });
    expect(r.appliedRate).toBe(0.25);
    expect(r.calculatedTax).toBe(84_375_000);
  });
});

describe("D-5 게이트 — 넘어서면 안 되는 경계", () => {
  /**
   * S-2 **부칙 제8조 게이트**. 증여일이 2024-12-31이면 개정 전 증여분이라
   * §97의2① 대상이 아니고, 따라서 §104②2호도 적용되지 않는다.
   *
   * 시점 게이트를 **양도일**로 잘못 세우면(양도 2025-11-01 > 2025-01-01) 이 케이스가
   * 25%로 떨어져 개정 전 증여분까지 소급 통산하게 된다. **가장 중요한 회귀선.**
   */
  it("S-2 증여일 2024-12-31 — 개정 전 증여분이므로 30% 유지", () => {
    const r = calc({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2024-12-31"),
      transferDate: D("2025-11-01"),
      donorAcquisitionDate: D("2015-01-01"),
      priorYearEndDate: D("2024-12-31"),
      filingDate: D("2026-01-31"),
    });
    expect(r.appliedRate).toBe(0.3);
    expect(r.calculatedTax).toBe(119_250_000);
  });

  it("S-2b 매매 2024-12-31 (대조군) — 30%", () => {
    const r = calc({
      acquisitionCause: "purchase",
      acquisitionDate: D("2024-12-31"),
      transferDate: D("2025-11-01"),
      priorYearEndDate: D("2024-12-31"),
      filingDate: D("2026-01-31"),
    });
    expect(r.appliedRate).toBe(0.3);
    expect(r.calculatedTax).toBe(119_250_000);
  });

  /**
   * S-6 §97의2① **1년 요건**. 증여 2025-01-15 → 양도 2026-03-01은 1년을 넘겨
   * ①의 대상이 아니다.
   *
   * ⚠️ 이 케이스는 **세율로는 게이트를 검증하지 못한다** — 「증여 후 1년 초과」와
   * 「수증일 기산 1년 이상」이 같은 조건이라, 통산하든 안 하든 가목2) 25%다.
   * 게이트 누락이 **세율 축에서는 무해**함을 고정하는 회귀선으로만 둔다.
   * (§97의2① 본체(필요경비)에서는 이 요건이 실제로 갈린다 — 계획서 Phase 5.)
   */
  it("S-6 증여 후 1년 초과 — 25% (게이트 무해성 고정)", () => {
    const r = calc({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2025-01-15"),
      donorAcquisitionDate: D("2015-01-01"),
    });
    expect(r.appliedRate).toBe(0.25);
    expect(r.calculatedTax).toBe(84_375_000);
  });

  /** S-7 §104②은 11호**가목**만 대상으로 삼는다. 비대주주(나목)로 새면 안 된다. */
  it("S-7 비대주주 이월과세 증여 — 나목이므로 통산 대상 아님 (20%)", () => {
    const r = calc({
      acquisitionCause: "carryover_gift",
      donorAcquisitionDate: D("2015-01-01"),
      isMajorShareholder: false,
      selfShareRatio: 0.001,
      selfMarketCap: 100_000_000,
    });
    expect(r.appliedRate).toBe(0.2);
    expect(r.calculatedTax).toBe(79_500_000);
  });
});

describe("D-5 회귀 감지선", () => {
  it("S-3 증여자 취득일 미입력 — 수증일 기산 30%", () => {
    const r = calc({ acquisitionCause: "gift" });
    expect(r.appliedRate).toBe(0.3);
    expect(r.calculatedTax).toBe(119_250_000);
  });

  it("S-5 매매 8개월 — 30%", () => {
    const r = calc({ acquisitionCause: "purchase" });
    expect(r.appliedRate).toBe(0.3);
    expect(r.calculatedTax).toBe(119_250_000);
  });
});
