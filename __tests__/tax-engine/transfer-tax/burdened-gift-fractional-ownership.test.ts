/**
 * A2 — 부담부증여(소령 §159) × 지분 모드.
 *
 * ## 결함
 *
 * 부담부증여 경로가 `ownershipRatio`를 **전혀 인지하지 못한다**. 엔진 STEP 0.48
 * (`transfer-tax-burdened-gift-step.ts:74-81`)이 `transferPrice`·`acquisitionPrice`·`expenses`를
 * §159 안분값으로 통째 덮어쓰므로, API가 지분 스케일한 금액 필드가 전부 폐기된다.
 *
 * ## 왜 대부분 맞았나 (결함이 숨어 있던 이유)
 *
 * §159① 산식은 **스케일 불변**이다 — `취득가액 = A × B/C`, `양도가액 = A × B/C`.
 * 자산별 양도가액의 합 = (ΣA) × B/C = C × B/C = **B**(채무액)로 지분과 무관하다.
 * 취득가액도 A와 C가 같은 스케일이면 약분된다.
 *
 * ## 상쇄가 깨지는 단 하나의 지점
 *
 * `C`는 **max(보충적평가, 담보평가, 임대평가)**(상증법 §61⑤·§66)이고, 담보·임대 평가는
 * **절대금액**이라 지분에 따라 줄지 않는다. `C`가 채무액으로 결정되는 순간 취득가액 산식의
 * A(취득시 기준시가)만 100% 스케일로 남아 약분되지 않는다 → **취득가액 과대 → 과소과세**.
 *
 * ## 법령 (KoreanLaw MCP 실측 — mst=286211, jo=제159조)
 *
 * A(§97①1호 가액 / 상증법 §60~66 평가액)와 C(증여가액)는 **모두 증여 대상 재산**의 값이다.
 * 증여 대상이 1/2 지분이면 A·C 모두 지분분. **B(채무액)만 절대금액**이다.
 *
 * ## 설계 (plan §3)
 *
 * - 스케일은 **엔진 내부**에서 (API 아님) — 12억 판정에 물건 전체 값이 필요하기 때문.
 * - 스케일 O: 기준시가 4 · 시가 2 · 실지취득가 3 · 증여용 건물기준시가 1 = **10필드**
 * - 스케일 X: 채무·보증금·임대료·저당설정액 — 사용자가 **해당 지분 인수분**을 입력
 *   (엔진이 ×ratio로 쪼개면 자동 안분 fallback 정책 위반)
 * - 12억 분모(`burdenedGiftDenominator`)는 **물건 전체 유지**(A4/#849 원칙)
 *
 * ⚠️ **판별력**: 모든 fixture는 지분 미적용 시 반드시 실패해야 한다. 라운드 넘버 금지
 *    (#845 E2 실패 원인 = 비판별 anchor — `feedback_pre_anchor_verification`).
 */
import { describe, it, expect } from "vitest";
import {
  buildBurdenedGiftBreakdown,
  assertBurdenedGiftEligible,
} from "@/lib/tax-engine/burdened-gift-apportionment";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const rates = makeMockRates();

// ── 물건 전체(100%) 값 — 끝자리 1로 floor 판별력 확보 ──
const WHOLE_STD_T = 1_000_000_001; // 양도시 기준시가(건물 자리, housing 단일 공시가격)
const WHOLE_STD_A = 500_000_001; // 취득시 기준시가
const DEBT_DEPOSIT = 300_000_000;
const DEBT_MORTGAGE = 300_000_000;
const DEBT_TOTAL = DEBT_DEPOSIT + DEBT_MORTGAGE; // 6억

const info = (over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo => ({
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: DEBT_DEPOSIT,
  mortgageDebtAmount: DEBT_MORTGAGE,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 0,
  buildingStdPriceAtTransfer: WHOLE_STD_T,
  landStdPriceAtAcquisition: 0,
  buildingStdPriceAtAcquisition: WHOLE_STD_A,
  ...over,
});

/** breakdown 직접 호출 — params와 info의 기준시가는 항상 동일 소스(step과 동일 배선). */
const build = (i: BurdenedGiftInfo, ownershipRatio?: number) =>
  buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: i.landStdPriceAtTransfer,
    buildingStdPriceAtTransfer: i.buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition: i.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition: i.buildingStdPriceAtAcquisition,
    info: i,
    giftDate: new Date("2024-03-01"),
    ownershipRatio,
  });

const totalAcq = (r: ReturnType<typeof build>) =>
  r.perAsset.land.acquisitionPrice + r.perAsset.building.acquisitionPrice;
const totalTransfer = (r: ReturnType<typeof build>) =>
  r.perAsset.land.transferPrice + r.perAsset.building.transferPrice;

// ════════════════════════════════════════════════════════════
// B1 — 단독 소유 무변경 (회귀 가드)
// ════════════════════════════════════════════════════════════
describe("B1: 단독 소유 — ownershipRatio 미전달/1.0 완전 무변경", () => {
  it("미전달 · 1.0 · 명시 undefined 3자가 동일 결과", () => {
    const none = build(info());
    const one = build(info(), 1);
    expect(one.sangjeungbeopValuation.max).toBe(none.sangjeungbeopValuation.max);
    expect(totalAcq(one)).toBe(totalAcq(none));
    expect(totalTransfer(one)).toBe(totalTransfer(none));
    expect(one.gratuitousPortion).toBe(none.gratuitousPortion);
  });

  it("단독 C = 물건 전체 기준시가 (supplementary 채택)", () => {
    const r = build(info());
    expect(r.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(r.sangjeungbeopValuation.max).toBe(WHOLE_STD_T);
  });
});

// ════════════════════════════════════════════════════════════
// B2 — 지분 1/2 기준시가 모드: A·C 동시 축소
// ════════════════════════════════════════════════════════════
describe("B2: 지분 1/2 — 평가액·취득가액이 지분분으로 산정된다", () => {
  it("🔴 C(증여가액)가 지분분 기준시가로 축소된다", () => {
    const r = build(info({ annualRentTotal: 0 }), 0.5);
    // 지분분 보충적평가 = floor(1,000,000,001 × 0.5) = 500,000,000
    expect(r.sangjeungbeopValuation.supplementary).toBe(500_000_000);
  });

  it("🔴 취득가액 = 지분분 취득기준시가 × B/C", () => {
    const r = build(info(), 0.5);
    // C = max(500,000,000, mortgage 600,000,000) = 600,000,000 → B/C = 1.0
    // 취득가액 = floor(500,000,001 × 0.5) × 1.0 = 250,000,000
    expect(totalAcq(r)).toBe(250_000_000);
  });

  it("양도가액 합 = 채무액 B (§159 항등 — 지분 무관)", () => {
    expect(totalTransfer(build(info(), 0.5))).toBe(DEBT_TOTAL);
    expect(totalTransfer(build(info()))).toBe(DEBT_TOTAL);
  });
});

// ════════════════════════════════════════════════════════════
// B3 — 판별 핵심: 채무 > 지분분 공시 → 평가모드 전환
// ════════════════════════════════════════════════════════════
describe("B3: 🔴 채무가 지분분 평가액을 넘으면 mortgage 모드로 전환된다", () => {
  it("selectedMode가 supplementary → mortgage로 뒤집힌다", () => {
    expect(build(info()).sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(build(info(), 0.5).sangjeungbeopValuation.selectedMode).toBe("mortgage");
  });

  it("취득가액 과대분이 정확히 제거된다 (현행 3억 → 2.5억)", () => {
    // 현행(지분 미적용): floor(500,000,001 × 6억 / 1,000,000,001) = 300,000,000
    const before = totalAcq(build(info()));
    const after = totalAcq(build(info(), 0.5));
    expect(before).toBe(300_000_000);
    expect(after).toBe(250_000_000);
    expect(before - after).toBe(50_000_000); // 취득가액 과대분 = 과소과세의 원천
  });

  it("무상분(증여세 과세대상)도 지분분 기준이 된다", () => {
    // 지분분: C 6억 − B 6억 = 0 / 현행: 1,000,000,001 − 6억 = 400,000,001
    expect(build(info()).gratuitousPortion).toBe(400_000_001);
    expect(build(info(), 0.5).gratuitousPortion).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// B4 — 시가 모드 + K-4 실지취득가액 3필드
// ════════════════════════════════════════════════════════════
describe("B4: 시가 모드 K-4 — 실지취득가액도 지분분", () => {
  /** 채무 7억 > 지분분 시가 6억 → C가 담보평가로 clamp되어 상쇄가 깨지는 구간. */
  const mkt = info({
    valuationMode: "sangjeungbeop_market",
    marketValueAtTransfer: 1_200_000_003,
    marketValueAtAcquisition: 600_000_003,
    acquisitionMethod: "actual",
    actualAcquisitionTotal: 400_000_003,
    lendingDepositTotal: 0,
    mortgageDebtAmount: 700_000_000,
  });

  it("🔴 시가(양도)가 지분분으로 축소된다", () => {
    expect(build(mkt, 0.5).sangjeungbeopValuation.supplementary).toBe(600_000_001);
    expect(build(mkt).sangjeungbeopValuation.supplementary).toBe(1_200_000_003);
  });

  it("🔴 실지취득가액이 지분분 기준으로 안분된다", () => {
    const before = totalAcq(build(mkt));
    const after = totalAcq(build(mkt, 0.5));
    expect(after).toBeLessThan(before);
    // 지분분: C = max(600,000,001, 700,000,000) = 7억 → B/C = 1.0 → A 그대로
    expect(after).toBe(200_000_001); // floor(400,000,003 × 0.5)
  });
});

// ════════════════════════════════════════════════════════════
// B5 — 시가 모드 K-5(환산): **의도적으로 스케일 불변**
// ════════════════════════════════════════════════════════════
describe("B5: K-5 환산취득가액은 지분과 무관하다 (비율 상쇄 — 설계 확인)", () => {
  const mkt = info({
    valuationMode: "sangjeungbeop_market",
    marketValueAtTransfer: 1_200_000_003,
    marketValueAtAcquisition: 600_000_003,
    acquisitionMethod: "converted",
    lendingDepositTotal: 0,
    mortgageDebtAmount: 700_000_000,
  });

  it("환산취득가액 = 양도가액 × (취득기준시가 ÷ 양도기준시가) — 기준시가 비율이 상쇄된다", () => {
    // §176의2②2호. 양도가액은 채무액 B(절대), 기준시가는 분자·분모 동시 축소 → 불변.
    // 이 불변성은 결함이 아니라 산식의 성질이다. 지분을 곱하면 **이중 축소**가 된다.
    expect(totalAcq(build(mkt, 0.5))).toBe(totalAcq(build(mkt)));
  });

  it("반면 개산공제 base는 C가 clamp되므로 지분 영향을 받는다", () => {
    const d = (r: ReturnType<typeof build>) =>
      r.perAsset.land.estimatedDeduction + r.perAsset.building.estimatedDeduction;
    expect(d(build(mkt, 0.5))).toBeLessThan(d(build(mkt)));
  });
});

// ════════════════════════════════════════════════════════════
// B9 — 미등기(§104③) × 지분 2축 동시
// ════════════════════════════════════════════════════════════
describe("B9: 미등기 + 지분 — 두 축이 함께 적용된다", () => {
  it("개산공제가 지분분 base × 0.3%", () => {
    const reg = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: WHOLE_STD_T,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: WHOLE_STD_A,
      info: info(),
      ownershipRatio: 0.5,
    });
    const unreg = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: WHOLE_STD_T,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: WHOLE_STD_A,
      info: info(),
      ownershipRatio: 0.5,
      isUnregistered: true,
    });
    const d = (r: typeof reg) =>
      r.perAsset.land.estimatedDeduction + r.perAsset.building.estimatedDeduction;
    expect(d(reg)).toBeGreaterThan(0);
    // 등기 3% : 미등기 0.3% = 10배 (±1원 floor 오차 허용)
    expect(Math.abs(d(reg) - d(unreg) * 10)).toBeLessThanOrEqual(10);
  });
});

// ════════════════════════════════════════════════════════════
// B10 — 성분별 독립 floor (잔액 흡수 아님)
// ════════════════════════════════════════════════════════════
describe("B10: 지분 1/3 — 성분별 독립 floor", () => {
  it("각 기준시가에 floor(x × 1/3)가 독립 적용된다", () => {
    const r = build(
      info({
        buildingStdPriceAtTransfer: 1_000_000_000,
        buildingStdPriceAtAcquisition: 1_000_000_000,
        lendingDepositTotal: 0,
        mortgageDebtAmount: 100_000_000,
      }),
      1 / 3,
    );
    // floor(1,000,000,000 / 3) = 333,333,333 (333,333,333.33 절사)
    expect(r.sangjeungbeopValuation.supplementary).toBe(333_333_333);
  });
});

// ════════════════════════════════════════════════════════════
// B11 — 초과부담부 가드도 지분을 인지해야 한다
// ════════════════════════════════════════════════════════════
describe("B11: 🔴 초과부담부 fail-fast가 지분분 평가액 기준으로 동작한다", () => {
  // ⚠️ `mortgageSetAmount` 미입력 시 `mortgageDebtAmount`로 fallback되어 담보평가 = 채무액이
  //    되므로 `assumedDebt > giftValuation`이 **구조적으로 성립할 수 없다**.
  //    설정액 < 실제 잔액인 경우에만 가드가 의미를 갖는다 — 그 구간에서 판별한다.
  const over = info({
    lendingDepositTotal: 0,
    mortgageDebtAmount: 700_000_000,
    mortgageSetAmount: 100_000_000,
  });

  it("물건 전체 기준으론 통과하지만 지분분 기준으론 초과부담부", () => {
    // 물건 전체 C = 1,000,000,001 > 채무 7억 → 통과
    expect(() =>
      assertBurdenedGiftEligible({ propertyType: "housing", info: over }),
    ).not.toThrow();
    // 지분분 C = 500,000,000 < 채무 7억 → 차단되어야 한다
    expect(() =>
      assertBurdenedGiftEligible({ propertyType: "housing", info: over, ownershipRatio: 0.5 }),
    ).toThrow(/EXCESS_BURDENED_GIFT/);
  });
});

// ════════════════════════════════════════════════════════════
// B6·B7·B8 — 12억 고가주택 분모는 물건 전체 (A4/#849 원칙)
// ════════════════════════════════════════════════════════════
describe("B6·B7: 12억 판정 분모는 물건 전체를 유지한다", () => {
  /** 1세대1주택 + 고가 — 24억 물건의 1/2 지분. */
  const runOneHouse = (ownershipRatio?: number) => {
    const bg = info({
      buildingStdPriceAtTransfer: 2_400_000_000,
      buildingStdPriceAtAcquisition: 800_000_000,
      lendingDepositTotal: 0,
      mortgageDebtAmount: 500_000_000,
    });
    return calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferType: "burdened_gift",
        transferDate: new Date("2024-03-01"),
        acquisitionDate: new Date("2009-03-01"),
        transferPrice: 500_000_000,
        acquisitionPrice: 0,
        isOneHousehold: true,
        householdHousingCount: 1,
        residencePeriodMonths: 120,
        burdenedGiftInfo: bg,
        ownershipRatio,
      }) as never,
      rates,
    );
  };

  it("🔴 24억 물건의 1/2 지분이 비과세로 빠지지 않는다", () => {
    const r = runOneHouse(0.5);
    // 지분분 C(12억)를 분모로 쓰면 12억 이하 → 전액 비과세로 오판한다.
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("단독 소유 12억 판정은 현행과 동일 (회귀 가드)", () => {
    expect(runOneHouse(1).totalTax).toBe(runOneHouse().totalTax);
  });
});

// ════════════════════════════════════════════════════════════
// B12 — 개산공제 이중 적용 방지 (전체 파이프라인)
//   엔진 input의 `ownershipRatio`는 비-부담부 경로에서 개산공제 base 축소에도 쓰인다(#845).
//   부담부증여는 STEP 0.48이 `expenses`를 §159 안분값으로 덮어쓰므로 **재적용되면 안 된다**.
// ════════════════════════════════════════════════════════════
describe("B12: 부담부증여 개산공제가 지분율로 두 번 축소되지 않는다", () => {
  it("파이프라인 expenses = breakdown 개산공제 합계와 정확히 일치", () => {
    const bg = info();
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "housing",
        transferType: "burdened_gift",
        transferDate: new Date("2024-03-01"),
        acquisitionDate: new Date("2009-03-01"),
        transferPrice: 500_000_000,
        acquisitionPrice: 0,
        householdHousingCount: 2,
        burdenedGiftInfo: bg,
        ownershipRatio: 0.5,
      }) as never,
      rates,
    );
    const d = r.transferBurdenedGiftBreakdown!;
    const expected = d.perAsset.land.estimatedDeduction + d.perAsset.building.estimatedDeduction;
    // 지분분 취득기준시가 250,000,000 × 채무비율 1.0 × 3% = 7,500,000
    expect(expected).toBe(7_500_000);
    // 재적용됐다면 3,750,000이 된다.
    expect(expected).not.toBe(3_750_000);
  });
});

describe("B8: ownershipRatio 미전달 = 1 취급 (전체 파이프라인)", () => {
  it("엔진 전체 경로에서 미전달과 1.0이 동일 세액", () => {
    const run = (ownershipRatio?: number) =>
      calculateTransferTax(
        baseTransferInput({
          propertyType: "housing",
          transferType: "burdened_gift",
          transferDate: new Date("2024-03-01"),
          acquisitionDate: new Date("2009-03-01"),
          transferPrice: 500_000_000,
          acquisitionPrice: 0,
          householdHousingCount: 2,
          burdenedGiftInfo: info(),
          ownershipRatio,
        }) as never,
        rates,
      ).totalTax;
    expect(run(1)).toBe(run());
  });
});
