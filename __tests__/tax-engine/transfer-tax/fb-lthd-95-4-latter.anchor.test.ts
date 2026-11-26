/**
 * Pre-Do anchor — 가업상속공제 자산 양도 계산 정합성
 *
 * 계획서: docs/02-design/features/transfer-fb-lthd-95-4-latter.plan.md
 *
 * 대상 결함:
 *   D-1 §95④ 후단 미구현 (LTHD 보유기간 = 적용률분 피상속인 취득일 기산)
 *   D-2 피상속인 자본적지출 미반영 (Q7 = 안 B: 1호 취득가액에 포함 → × r)
 *   D-4 의제취득가 2항 잔액흡수로 문언보다 1원 큼
 *   D-5 게이트 부재 (G-1 상속개시일 ≥ 2014-01-01)
 *
 * 법령:
 *   「소득세법」 §95④ 후단 (법률 제12169호, 2014.1.1 시행 — 연혁 대조 실측)
 *   「소득세법」 §97의2④1호·2호
 *   「소득세법 시행령」 §163의2③
 *   부칙 법률 제12169호 §12 — "이 법 시행 후 상속받아 양도하는 분부터 적용"
 *
 * 판정 (계획서 §3):
 *   Q1 = 안 (a) 비율 분할  — LTHD = r×rate(피상속인 기산) + (1−r)×rate(상속개시일 기산)
 *   Q2 = 두 재귀 모두 적용 (imputedResult·regularResult)
 *   Q3 = 표2도 적용하되 보유분만 이동, 거주분은 상속개시일 기산
 *   Q7 = 안 B (피상속인 자본적지출을 1호 base에 가산)
 *
 * ⚠️ Pre-Do 상태 기대 (2026-08-11 실측: 7 failed / 5 passed — 예상과 일치):
 *   통과해야 하는 회귀 감지선 → C-1 · C-5 · C-7 · M-2 · F-2
 *   실패해야 하는 미구현 항목 → C-2 · C-3 · C-4 · M-4 · F-1 · G-1a · G-1b
 *   (G-1a도 실패다 — 게이트가 없어 2013년 상속분에도 의제 산식이 돈다.)
 *
 * 🔄 2026-11-26 정정 (transfer-fb-lthd-portion-gain.engine.plan.md — 사용자 결정 Q-1~Q-4):
 *   종전 C-3·C-4·G-1b·C-6 기대값은 의제 재귀가 **전체 양도차익을 r로 비례 안분**한다는 전제로 고정한 값이다.
 *   교재(이월과세5 — 사용자 확인)는 양도가액·양도비를 r로 나눠 **부분별 양도차익**(적용분 = 피상속인 취득가액 base ·
 *   비적용분 = 상속개시일 평가액 base)을 구하고 부분마다 제 공제율을 곱한다. 아래 4건을 손계산으로 재도출해 반전했다
 *   (엔진 출력 복사 금지). 회귀선 C-1·C-2·C-5·C-7과 일반 §97 재귀 세액은 그대로다.
 *   손계산 공통: tD = ⌊A_d·r⌋ = 1.6억 · tH = ⌊V·(1−r)⌋ = 1억 · X = P = 10억 · gD = X·0.8 − tD = 6.4억 · gH = G − gD = 1.0억(G = 7.4억)
 *
 * 📏 보유기간 규칙: 소득세법 §95④ 「취득일부터 양도일까지」 — **초일 산입**
 *   (`__tests__/tax-engine/holding-period-first-day-inclusion.anchor.test.ts`). N년은 취득일
 *   응당일의 전날 만료이므로 응당일 양도는 만 N년이다.
 *   2014-01-01 → 2026-01-01 = 12년 → 표1 24%
 *   2021-01-01 → 2026-01-01 =  5년 → 표1 10% (표2 보유분 20%)
 *   2005-01-01 → 2026-01-01 = 21년 → 상한 30%
 *   기대 공제율은 이 규칙으로 산정한다(mock rates는 연 2%·상한 30% 방식).
 *   (종전 구현은 초일·말일을 모두 빼 11년11개월 22% · 4년11개월 8% · 20년11개월로 셌다.)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calcFamilyBusinessImputedAcquisitionPrice } from "@/lib/tax-engine/transfer-tax-family-business";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput, TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

const MOCK_RATES = makeMockRates();

/** 상속개시일 평가액 5억 / 피상속인 취득가액 2억 / 적용률 0.8 */
const FB = (over: Record<string, unknown> = {}) => ({
  decedentAcquisitionPrice: 200_000_000,
  inheritanceMarketValue: 500_000_000,
  fbDeductionAppliedRate: 0.8,
  inheritanceDate: "2024-01-01",
  ...over,
});

/**
 * 기준 픽스처 — 토지, 양도가 10억.
 * 상속개시일 2024-01-01(= acquisitionDate, 소령 §162①5호)
 * 피상속인 취득일 2005-01-01 → 양도일 2026-01-01 기준 21년
 * 상속개시일 기산은 2년 미만 → 표1 0%
 */
const input = (over: Partial<TransferTaxInput> = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "land",
    transferPrice: 1_000_000_000,
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2024-01-01"),
    transferDate: new Date("2026-01-01"),
    acquisitionCause: "inheritance",
    decedentAcquisitionDate: new Date("2005-01-01"),
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    expenses: 0,
    reductions: [],
    annualBasicDeductionUsed: 0,
    familyBusinessInheritance: FB(),
    ...over,
  } as Partial<TransferTaxInput>);

const lthdAmount = (r: TransferTaxResult): number =>
  r.steps.find((s) => s.label.includes("장기보유"))?.amount ?? -1;

// ─────────────────────────────────────────────────────────────
// D-1 — §95④ 후단 LTHD 기산 (Q1 = 비율 분할)
// ─────────────────────────────────────────────────────────────

describe("FB-LTHD D-1 — §95④ 후단 (적용률분 피상속인 취득일 기산)", () => {
  /** C-1 회귀 감지선: 적용률 0 → 전부 상속개시일 기산 → 현행과 동일 */
  it("C-1: r=0 → LTHD 0 (현행 불변)", () => {
    const r = calculateTransferTax(input({ familyBusinessInheritance: FB({ fbDeductionAppliedRate: 0 }) } as Partial<TransferTaxInput>), MOCK_RATES);
    // 의제취득가 = 0 + 5억 = 5억 → 양도차익 5억
    expect(r.transferGain).toBe(500_000_000);
    expect(lthdAmount(r)).toBe(0);
  });

  /** C-2: 적용률 1 → 전부 피상속인 기산 21년 → 표1 상한 30% */
  it("C-2: r=1 → 공제율 30%", () => {
    const r = calculateTransferTax(input({ familyBusinessInheritance: FB({ fbDeductionAppliedRate: 1 }) } as Partial<TransferTaxInput>), MOCK_RATES);
    // 의제취득가 = 2억 → 양도차익 8억
    expect(r.transferGain).toBe(800_000_000);
    expect(lthdAmount(r)).toBe(240_000_000); // 8억 × 30%
  });

  /** C-3: r=0.8 → 0.8×30% + 0.2×0% = 24% (계획서 §1 D-1 실측 케이스) */
  it("C-3: r=0.8 → 공제율 24%", () => {
    const r = calculateTransferTax(input(), MOCK_RATES);
    expect(r.transferGain).toBe(740_000_000); // 10억 − 2.6억
    // 부분별: 적용분 양도차익 6.4억(= 10억 × 0.8 − 1.6억) × 30%(피상속인 21년) + 비적용분 1.0억 × 0%(상속인 2년 미만)
    //   (종전 7.4억 × 24% = 177,600,000 — 전체 차익 비례 안분)
    expect(lthdAmount(r)).toBe(192_000_000);
  });

  /** C-4: 양쪽 다 3년 이상 — 0.8×30%(21년) + 0.2×10%(5년) = 26% */
  it("C-4: 상속개시일 기산도 3년 이상 → 공제율 26%", () => {
    const r = calculateTransferTax(
      input({
        acquisitionDate: new Date("2021-01-01"),
        familyBusinessInheritance: FB({ inheritanceDate: "2021-01-01" }),
      } as Partial<TransferTaxInput>),
      MOCK_RATES,
    );
    expect(r.transferGain).toBe(740_000_000);
    // 부분별: 6.4억 × 30% + 1.0억 × 10%(상속개시일 5년) = 192,000,000 + 10,000,000 (종전 7.4억 × 26% = 192,400,000)
    expect(lthdAmount(r)).toBe(202_000_000);
  });

  /** C-5 경계: 피상속인도 3년 미만 → 양쪽 0% (구현 전후 불변) */
  it("C-5: 피상속인 보유도 단기 → 0%", () => {
    const r = calculateTransferTax(
      input({
        acquisitionDate: new Date("2025-06-01"),
        decedentAcquisitionDate: new Date("2025-01-01"),
        familyBusinessInheritance: FB({ inheritanceDate: "2025-06-01" }),
      } as Partial<TransferTaxInput>),
      MOCK_RATES,
    );
    expect(lthdAmount(r)).toBe(0);
  });

  /** C-7 회귀 감지선: 가업상속 입력 없음 → 특례 전부 미발동 */
  it("C-7: familyBusinessInheritance 미제공 → 현행 불변", () => {
    const r = calculateTransferTax(
      input({ familyBusinessInheritance: undefined } as Partial<TransferTaxInput>),
      MOCK_RATES,
    );
    expect(r.familyBusinessDetail).toBeUndefined();
    // 취득가액 5억 그대로 → 양도차익 5억, 보유 2년 미만 → LTHD 0
    expect(r.transferGain).toBe(500_000_000);
    expect(lthdAmount(r)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Q3 — 표2(1세대1주택): 보유분만 이동, 거주분은 상속개시일 기산 유지
// ─────────────────────────────────────────────────────────────

describe("FB-LTHD Q3 — 표2 보유분만 가중", () => {
  /**
   * C-6: 고가주택 1세대1주택, 거주 5년.
   *   12억 초과 안분: T = 17.4억 × 40% = 6.96억 → 슬라이스 몫 tD' = ⌊T × 6.4/7.4⌋ = 5.76억 · tH' = 1.2억
   *   보유분 = 5.76억 × 40%(피상속인 21년 → 표2 상한) + 1.2억 × 20%(상속개시 5년) = 230,400,000 + 24,000,000
   *   거주분 = 6.96억 × 20%(5년 × 4%) = 139,200,000  ← **슬라이스 가중 없음 — 전체 T**(계획서 Q3)
   *   합계   = 393,600,000  (종전 6.96억 × 56% = 389,760,000)
   * ⚠️ 거주분까지 슬라이스 가중하면 이 anchor가 깨진다.
   */
  it("C-6: 표2 — 보유분만 가중되고 거주분 20%는 온전히 남는다", () => {
    const r = calculateTransferTax(
      input({
        propertyType: "housing",
        transferPrice: 2_000_000_000,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 60,
        acquisitionDate: new Date("2021-01-01"),
        familyBusinessInheritance: FB({ inheritanceDate: "2021-01-01" }),
      } as Partial<TransferTaxInput>),
      MOCK_RATES,
    );
    // 12억 초과 안분: (20억 − 12억) / 20억 = 40%
    expect(r.taxableGain).toBe(696_000_000); // (20억 − 2.6억) × 40%
    expect(lthdAmount(r)).toBe(393_600_000);
    // 산식 문구에 두 기산일이 분해되어 보여야 한다
    const step = r.steps.find((s) => s.label.includes("장기보유"));
    expect(step?.formula).toContain("피상속인 취득일부터");
    expect(step?.formula).toContain("거주분");
    expect(step?.formula).toContain("§95④ 후단");
  });
});

// ─────────────────────────────────────────────────────────────
// D-2 — 자본적지출 (Q7 = 안 B)
// ─────────────────────────────────────────────────────────────

describe("FB-LTHD D-2 — 자본적지출", () => {
  /** M-2 회귀 감지선: 자산-수준 필요경비는 지금도 정상 반영된다 */
  it("M-2: 자산-수준 expenses 1억 → 양도차익 1억 감소", () => {
    const r = calculateTransferTax(input({ expenses: 100_000_000 }), MOCK_RATES);
    expect(r.transferGain).toBe(640_000_000); // 10억 − 2.6억 − 1억
  });

  /**
   * M-4: 피상속인 자본적지출 → §97의2④1호 base에 가산 후 × r (안 B)
   *   의제취득가 = (2억 + 1억) × 0.8 + 5억 × 0.2 = 2.4억 + 1억 = 3.4억
   * ⚠️ 안 C(§97①2호 전액 산입)로 뒤집히면 기대값이 달라진다 — 계획서 §3.2
   */
  it("M-4: decedentCapitalExpenditure 1억 → 의제취득가 3.4억", () => {
    const r = calculateTransferTax(
      input({ familyBusinessInheritance: FB({ decedentCapitalExpenditure: 100_000_000 }) } as Partial<TransferTaxInput>),
      MOCK_RATES,
    );
    expect(r.familyBusinessDetail?.imputedAcquisitionPrice).toBe(340_000_000);
    expect(r.transferGain).toBe(660_000_000); // 10억 − 3.4억
  });
});

// ─────────────────────────────────────────────────────────────
// D-4 — 의제취득가 2항 절사 (문언 = floor(평가액 × (1−r)))
// ─────────────────────────────────────────────────────────────

describe("FB-LTHD D-4 — 절사 방향", () => {
  /** F-1: 잔액흡수(833,400,005)가 아니라 문언(833,400,004) */
  it("F-1: r=0.333 → 833,400,004", () => {
    expect(
      calcFamilyBusinessImputedAcquisitionPrice(700_000_003, 900_000_007, 0.333),
    ).toBe(833_400_004);
  });

  /** F-2 회귀 감지선: 기존 family-business-cgt.test.ts 기대값 불변 */
  it("F-2: r=0.8, 1억/3억 → 140,000,000 (기존값 불변)", () => {
    expect(
      calcFamilyBusinessImputedAcquisitionPrice(100_000_000, 300_000_000, 0.8),
    ).toBe(140_000_000);
  });
});

// ─────────────────────────────────────────────────────────────
// D-5 — G-1 게이트 (부칙 법률 제12169호 §12 — 기준일 = 상속개시일)
// ─────────────────────────────────────────────────────────────

describe("FB-LTHD D-5 — G-1 시점 게이트 (상속개시일 축)", () => {
  /** G-1a: 2013-12-31 상속 → §97의2④·§95④ 후단 둘 다 미적용 */
  it("G-1a: 상속개시일 2013-12-31 → 특례 미적용 (일반 §97)", () => {
    const r = calculateTransferTax(
      input({
        acquisitionDate: new Date("2013-12-31"),
        familyBusinessInheritance: FB({ inheritanceDate: "2013-12-31" }),
      } as Partial<TransferTaxInput>),
      MOCK_RATES,
    );
    // 의제취득가 미적용 → §163⑨ 상속개시일 평가액 5억이 취득가액
    expect(r.transferGain).toBe(500_000_000);
    // 상속개시일 기산 12년 → 표1 24%
    expect(lthdAmount(r)).toBe(120_000_000);
  });

  /** G-1b: 2014-01-01 상속 → 둘 다 적용 */
  it("G-1b: 상속개시일 2014-01-01 → 특례 적용", () => {
    const r = calculateTransferTax(
      input({
        acquisitionDate: new Date("2014-01-01"),
        familyBusinessInheritance: FB({ inheritanceDate: "2014-01-01" }),
      } as Partial<TransferTaxInput>),
      MOCK_RATES,
    );
    expect(r.familyBusinessDetail?.imputedAcquisitionPrice).toBe(260_000_000);
    expect(r.transferGain).toBe(740_000_000);
    // 부분별: 6.4억 × 30%(피상속인 21년) + 1.0억 × 24%(상속개시일 12년) = 192,000,000 + 24,000,000
    //   (종전 7.4억 × 28.8% = 213,120,000)
    expect(lthdAmount(r)).toBe(216_000_000);
  });
});
