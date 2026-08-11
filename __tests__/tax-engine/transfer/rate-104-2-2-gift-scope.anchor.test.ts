/**
 * anchor: §104②2호 「제97조의2제1항에 **해당하는 자산**」의 적용 범위 — 부동산 (D-1 · D-2 · D-3)
 *
 * 계획서: docs/02-design/features/transfer-104-2-2-gift-carryover-scope.plan.md
 *   §1 D-1(단순 증여 통산 — 근거 없음) · D-2(②배제 미통산 — 현행이 맞다) · D-3(소비 계층 7곳)
 *
 * ── 법령 ──────────────────────────────────────────────────────────────
 * 「소득세법」 제104조 제2항 (MST 확인 2026-08-11 · 법제처 DRF)
 *   "② 제1항제2호ㆍ제3호 및 제11호가목의 보유기간은 **해당 자산의 취득일부터 양도일까지로 한다.**
 *      다만, 다음 각 호의 어느 하나에 해당하는 경우에는 각각 그 정한 날을 그 자산의 취득일로 본다.
 *      1. 상속받은 자산은 피상속인이 그 자산을 취득한 날
 *      2. **제97조의2제1항에 해당하는 자산**은 증여자가 그 자산을 취득한 날
 *      3. 법인의 합병ㆍ분할 … 주식등을 취득한 날"
 *
 * 예외는 **3개 호 한정 열거**이고 단순 증여는 어디에도 없다.
 * 원칙은 법 §98 + 「소득세법 시행령」 §162①5호 —
 *   "5. 상속 또는 증여에 의하여 취득한 자산에 대하여는 그 상속이 개시된 날 또는 **증여를 받은 날**"
 *
 * ── D-2는 「현행이 맞다」로 종결됐다 (계획서 §2 ⑧ · §3.2) ──────────────────
 * 구법(~2013.12.31) §104②2호는 「**제97조제4항**에 해당하는 자산」이었고, 구 §97④는
 * 배제사유(수용)를 **본문 안 「~한 경우 외에는」**으로 품고 있었다 ⇒ 배제 자산은 문언상
 * 「④에 해당하는 자산」이 아니었다. 2014.1.1.(법률 제12169호) 개정이유에는 §97의2 관련으로
 * **「가업상속재산 취득가액 특례 신설(④)」 하나뿐**이고 ①②③ 이관·§104②2호 인용 변경은
 * 언급이 없다 ⇒ **조문 정비**. 따라서 §97의2②로 배제된 자산은 통산하지 않는 현행이 정답이며,
 * 아래 C-1~C-3은 D-1 수정이 그 경로로 번지지 않게 막는 **잠금장치**다.
 *
 * ── 실행 상태 ─────────────────────────────────────────────────────────
 * Pre-Do anchor: **N-1 · N-2 · G-1 · G-2 는 현재 실패해야 한다.**
 * 나머지는 회귀 감지선으로 현재 통과해야 한다.
 * 실측 기준일 2026-08-11 (mock rates).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 토지 10억 양도 / 5억 취득 / 2026-01-01 양도 — 전 케이스 공통 */
function land(o: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    transferDate: D("2026-01-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    ...o,
  });
}

const calc = (o: Partial<TransferTaxInput>) => calculateTransferTax(land(o), rates);

/** 이월과세 공통 입력 — 증여자 취득 2010-01-01 */
const CT = {
  donorAcquisitionDate: D("2010-01-01"),
  giftRegistryDate: D("2025-01-01"),
  giftDateValuation: 500_000_000,
  donorAcquisitionPrice: 500_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 0,
  donorRelation: "spouse" as const,
};

// ============================================================
// D-1 — 단순 증여(`gift`)에 §104②2호를 적용하면 안 된다
// ============================================================

describe("D-1 단순 증여 — 세율 보유기간은 증여받은 날부터 (영 §162①5호)", () => {
  /**
   * N-1: 증여 2025-01-01 → 양도 2026-01-01. 증여자는 2010년 취득.
   *
   * 현행은 증여자 취득일을 통산해 누진(최고구간 40%)으로 떨어뜨린다 → 173,060,000.
   * 조문대로면 증여받은 날 기산이므로 §104①3호 단기 50% → 248,750,000.
   * **차이 75,690,000원 · 과소과세.**
   */
  it("N-1 증여 1년 — 매매와 같은 단기 50%여야 한다", () => {
    const r = calc({
      acquisitionCause: "gift",
      acquisitionDate: D("2025-01-01"),
      donorAcquisitionDate: D("2010-01-01"),
    });
    expect(r.appliedRate).toBe(0.5);
    expect(r.calculatedTax).toBe(248_750_000);
  });

  it("N-2 증여 6개월 — 단기 50%여야 한다", () => {
    const r = calc({
      acquisitionCause: "gift",
      acquisitionDate: D("2025-07-01"),
      donorAcquisitionDate: D("2010-01-01"),
    });
    expect(r.appliedRate).toBe(0.5);
    expect(r.calculatedTax).toBe(248_750_000);
  });

  /** N-5 대조군 — 같은 보유기간을 매매로 취득하면 50%. N-1·N-2의 기대값 근거. */
  it("N-5 매매 1년 (대조군) — 50%", () => {
    const r = calc({ acquisitionCause: "purchase", acquisitionDate: D("2025-01-01") });
    expect(r.appliedRate).toBe(0.5);
    expect(r.calculatedTax).toBe(248_750_000);
  });
});

describe("D-1 회귀 감지선 — 고쳐도 움직이면 안 되는 경로", () => {
  /**
   * N-3: 증여 2018-01-01(8년 보유) — 세율은 통산 여부와 무관하게 누진이다.
   * LTHD는 증여일 기산 8년이 유지되어야 한다(§95④ 단서는 §97의2① 적용 시에만 증여자 취득일).
   * 통산이 LTHD로 새면 16년치 공제가 적용되어 113,060,000(=N-5c)으로 떨어진다.
   */
  it("N-3 증여 8년 — 누진 · LTHD는 증여일 기산 유지", () => {
    const r = calc({
      acquisitionCause: "gift",
      acquisitionDate: D("2018-01-01"),
      donorAcquisitionDate: D("2010-01-01"),
    });
    expect(r.calculatedTax).toBe(145_060_000);
  });

  /** N-4: §104②**1호** 상속은 정당한 통산 — 건드리면 안 된다. */
  it("N-4 상속 — 피상속인 취득일 통산 유지 (§104②1호)", () => {
    const r = calc({
      acquisitionCause: "inheritance",
      acquisitionDate: D("2025-01-01"),
      decedentAcquisitionDate: D("2010-01-01"),
    });
    expect(r.appliedRate).toBe(0.4);
    expect(r.calculatedTax).toBe(173_060_000);
  });

  /**
   * N-6: 이월과세가 **실제 적용**되는 경우(시나리오 A 채택) — §104②2호의 본래 대상이다.
   * 증여 2022-01-01 · 증여자 취득가 1억이라 A 세액 > B 세액 → A 채택.
   */
  it("N-6 이월과세 A채택 — 증여자 취득일 기산 유지 (§104②2호 정당)", () => {
    const r = calc({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2022-01-01"),
      acquisitionPrice: 500_000_000,
      carryoverTaxation: {
        ...CT,
        giftRegistryDate: D("2022-01-01"),
        donorAcquisitionPrice: 100_000_000,
      } as never,
    });
    const detail = (r as unknown as Record<string, Record<string, unknown>>).carryoverTaxationDetail;
    expect(detail?.adoptedScenario).toBe("A");
    expect(r.calculatedTax).toBe(227_610_000);
  });
});

// ============================================================
// D-2 — §97의2②로 배제되면 통산하지 않는다 (현행 확정 · 잠금장치)
// ============================================================

describe("D-2 §97의2② 배제 — 증여일 기산 유지 (계획서 §2 ⑧ 연혁)", () => {
  const excluded = (extra: Record<string, unknown>) =>
    calc({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2025-01-01"),
      acquisitionPrice: 500_000_000,
      carryoverTaxation: { ...CT, ...extra } as never,
    });

  it("C-1 ②1호 수용 배제 — 단기 50% 유지", () => {
    const r = excluded({ exclusionDeclared: { expropriationWithin2Years: true } });
    expect(r.appliedRate).toBe(0.5);
    expect(r.calculatedTax).toBe(248_750_000);
  });

  it("C-2 ②2호 1세대1주택 배제 — 단기 50% 유지", () => {
    const r = excluded({ exclusionDeclared: { oneHouseExemptionApplies: true } });
    expect(r.appliedRate).toBe(0.5);
    expect(r.calculatedTax).toBe(248_750_000);
  });

  /** C-3 ②3호 세액비교 배제 — α를 취하면 순환이 생기는 호(계획서 §3.2 근거 3). */
  it("C-3 ②3호 세액비교 배제 — 단기 50% 유지", () => {
    const r = calc({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2025-01-01"),
      acquisitionPrice: 900_000_000,
      carryoverTaxation: {
        ...CT,
        giftDateValuation: 900_000_000,
        donorAcquisitionPrice: 980_000_000,
      } as never,
    });
    expect(r.appliedRate).toBe(0.5);
    expect(r.calculatedTax).toBe(48_750_000);
  });
});

describe("D-2 ①요건 미충족 — 애초에 「해당하는 자산」이 아니다", () => {
  it("C-4 기간 초과(§97의2③) — 증여일 기산", () => {
    const r = calc({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2010-06-01"),
      acquisitionPrice: 500_000_000,
      carryoverTaxation: {
        ...CT,
        giftRegistryDate: D("2010-06-01"),
        donorAcquisitionDate: D("2005-01-01"),
      } as never,
    });
    expect(r.calculatedTax).toBe(113_060_000);
  });

  it("C-5 증여자 사망(§97의2① 괄호) — 증여일 기산 · 단기 50%", () => {
    const r = calc({
      acquisitionCause: "carryover_gift",
      acquisitionDate: D("2025-01-01"),
      acquisitionPrice: 500_000_000,
      carryoverTaxation: { ...CT, donorDeceased: true } as never,
    });
    expect(r.appliedRate).toBe(0.5);
    expect(r.calculatedTax).toBe(248_750_000);
  });
});

// ============================================================
// D-3 — 소비 계층: 같은 결함이 흩어져 있다
// ============================================================

describe("D-3② 다자산 §104⑤ 그룹 버킷 (classifyRateGroup)", () => {
  const base = baseTransferInput({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    transferDate: D("2026-01-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
  }) as unknown as TransferTaxItemInput;

  const item = (id: string, o: Partial<TransferTaxItemInput>): TransferTaxItemInput => ({
    ...base,
    propertyId: id,
    propertyLabel: id,
    ...o,
  });

  const aggregate = (properties: TransferTaxItemInput[]) =>
    calculateTransferTaxAggregate(
      { taxYear: 2026, properties, annualBasicDeductionUsed: 0 } as AggregateTransferInput,
      rates,
    );

  /**
   * G-1: 증여 자산이 통산으로 `short_term` 버킷을 벗어나면 §104⑤ 합산 단위가 달라진다.
   * 세율뿐 아니라 **그룹 편성**이 바뀌므로 회귀 위험이 가장 크다.
   */
  it("G-1 gift + 매매 단기 — 두 자산 모두 단기 버킷이어야 한다", () => {
    const r = aggregate([
      item("A", {
        acquisitionCause: "gift",
        acquisitionDate: D("2025-01-01"),
        donorAcquisitionDate: D("2010-01-01"),
      }),
      item("B", { acquisitionCause: "purchase", acquisitionDate: D("2025-01-01") }),
    ]);
    expect((r as unknown as Record<string, number>).calculatedTax).toBe(498_750_000);
  });

  it("G-1b 매매 + 매매 (대조군) — G-1의 기대값 근거", () => {
    const r = aggregate([
      item("A", { acquisitionCause: "purchase", acquisitionDate: D("2025-01-01") }),
      item("B", { acquisitionCause: "purchase", acquisitionDate: D("2025-01-01") }),
    ]);
    expect((r as unknown as Record<string, number>).calculatedTax).toBe(498_750_000);
  });
});

describe("D-3④ 토지·건물 분리 — 토지 파트 기산 (resolveLandStatutoryAcquisitionDate)", () => {
  /** 건물 2010 취득 + 토지 2025 취득. 토지 파트만 단기 판정 대상. */
  const split = {
    propertyType: "housing" as const,
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionCause: "purchase" as const,
    acquisitionDate: D("2010-01-01"),
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: D("2025-01-01"),
    landTransferPrice: 600_000_000,
    buildingTransferPrice: 400_000_000,
    landAcquisitionPrice: 300_000_000,
    buildingAcquisitionPrice: 200_000_000,
    landStandardPriceAtTransfer: 400_000_000,
    buildingStandardPriceAtTransfer: 300_000_000,
    isOneHousehold: false,
    householdHousingCount: 2,
  } as unknown as Partial<TransferTaxInput>;

  it("G-2 토지 gift — 토지 파트는 증여일 기산(주택 단기 70%)이어야 한다", () => {
    const r = calc({
      ...split,
      landAcquisitionCause: "gift",
      landDonorAcquisitionDate: D("2010-01-01"),
    });
    expect(r.appliedRate).toBe(0.7);
    expect(r.calculatedTax).toBe(241_810_000);
  });

  it("G-2b 토지 매매 (대조군) — G-2의 기대값 근거", () => {
    const r = calc({ ...split, landAcquisitionCause: "purchase" });
    expect(r.appliedRate).toBe(0.7);
    expect(r.calculatedTax).toBe(241_810_000);
  });

  it("G-2c 토지 상속 — 피상속인 취득일 통산 유지 (§104②1호)", () => {
    const r = calc({
      ...split,
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: D("2010-01-01"),
    });
    expect(r.appliedRate).toBe(0.38);
    expect(r.calculatedTax).toBe(149_060_000);
  });
});
