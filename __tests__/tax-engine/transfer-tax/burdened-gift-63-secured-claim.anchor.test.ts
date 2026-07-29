/**
 * anchor — 상증령 §63 담보평가 + §66 채무액 하한 구조 (R2 조사 결론).
 *
 * ## 조사 배경
 *
 * `docs/00-pm/transfer-open-items.plan.md` R2는 "초과부담부 가드가 구조적으로 발동하지
 * 않는다"를 결함 후보로 올리면서, **법령상 정상일 수 있으니 §66·§63을 먼저 확인**하라고
 * 적어 두었다. KoreanLaw 실측 결과:
 *
 * - **상증법 §66**: 담보 기준 평가액과 §60 평가액 중 **큰 금액**을 재산가액으로 한다.
 * - **상증령 §63①3호**: 근저당 설정 재산 = "평가기준일 현재 당해 재산이 담보하는 **채권액**".
 * - **상증령 §63② 전단**: 채권최고액이 담보채권액보다 **적은** 경우에만 채권최고액.
 * - **상증령 §63② 후단**: 동일 재산이 다수 채권(전세금·임차보증금 포함)의 담보이면 **합계액**.
 *
 * ⇒ 담보평가 = 임대보증금 + min(채권최고액, 담보채권액) = **인수채무액 이하**이고,
 *   설정액 ≥ 채무액인 통상의 경우 **정확히 인수채무액과 같다**.
 *   §66의 max가 이를 하한으로 삼으므로 `증여가액 C ≥ 채무액 B`가 구조적으로 성립한다.
 *   **가드가 걸리지 않는 것이 법령상 정상**이며 R2는 수정 대상이 아니다.
 *   가드가 유효한 창은 §63② 전단(설정액 < 채무액)뿐이다.
 *
 * ## 함께 발견된 실제 결함 (수정함)
 *
 * 종전 구현은 `mortgageSetAmount ?? mortgageDebtAmount`로 **설정액을 무조건 우선**했다.
 * 이는 구 상속세법 시행령 §5의2 3호(근저당 = **채권최고액**)의 규칙이며, 그 시기의
 * 조세심판례(국심1997부0752 등 1989~1997년)가 다수 검색되어 오인하기 쉽다.
 * 현행 §63①3호는 **채권액**으로 개정돼 있다. 설정액은 통상 채권액의 120%라
 * 구법 규칙을 쓰면 증여가액 C가 과대 → §159의 채무비율 B/C 과소 → 취득가액 과소 →
 * **양도차익 과대**(납세자 불리)로 이어졌다.
 * (memory `feedback_no_unfavorable_application_without_legal_basis`)
 */
import { describe, it, expect } from "vitest";
import {
  computeSangjeungbeopValuation,
  computeMortgageValuation,
  assertBurdenedGiftEligible,
} from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 기준시가 합계(보충적평가)를 담보평가보다 낮게 깔아 mortgage 항이 max가 되도록 한 fixture. */
function makeInfo(overrides: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 100_000_000,
    mortgageDebtAmount: 500_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 100_000_000,
    buildingStdPriceAtTransfer: 50_000_000, // supplementary = 150M (낮게)
    landStdPriceAtAcquisition: 40_000_000,
    buildingStdPriceAtAcquisition: 20_000_000,
    ...overrides,
  };
}

describe("상증령 §63 담보평가 = 보증금 + min(채권최고액, 담보채권액)", () => {
  it("§63①3호 — 설정액 > 채무액이면 **채권액** 채택 (설정액 아님)", () => {
    // 실무 통상값: 채무 500M에 설정액 600M(120%).
    const v = computeMortgageValuation(makeInfo({ mortgageSetAmount: 600_000_000 }));
    // 구법 규칙이면 100M + 600M = 700M. 현행은 100M + 500M = 600M.
    expect(v).toBe(600_000_000);
  });

  it("§63② 전단 — 설정액 < 채무액이면 **채권최고액**으로 내려앉는다", () => {
    const v = computeMortgageValuation(makeInfo({ mortgageSetAmount: 300_000_000 }));
    expect(v).toBe(400_000_000); // 보증금 100M + 설정액 300M
  });

  it("설정액 미입력 → 채권액 (§63①3호 원칙 그대로)", () => {
    const v = computeMortgageValuation(makeInfo({ mortgageSetAmount: undefined }));
    expect(v).toBe(600_000_000); // 100M + 500M
  });

  it("§63② 후단 — 보증금과 담보채권액은 **합계**로 평가된다", () => {
    // 보증금만 있는 경우와의 차이로 합산 구조를 고정.
    const both = computeMortgageValuation(makeInfo({ mortgageSetAmount: 600_000_000 }));
    const depositOnly = computeMortgageValuation(
      makeInfo({ mortgageSetAmount: 600_000_000, mortgageDebtAmount: 0 }),
    );
    expect(depositOnly).toBe(100_000_000);
    expect(both).toBe(depositOnly + 500_000_000);
  });

  it("Max 산정에 반영 — selectedMode=mortgage, max = 담보평가", () => {
    const info = makeInfo({ mortgageSetAmount: 600_000_000 });
    const sg = computeSangjeungbeopValuation(100_000_000, 50_000_000, info);
    expect(sg.supplementary).toBe(150_000_000);
    expect(sg.mortgage).toBe(600_000_000);
    expect(sg.selectedMode).toBe("mortgage");
    expect(sg.max).toBe(600_000_000);
  });
});

describe("R2 결론 — §66 max가 채무액을 하한으로 만든다 (가드 미발동이 정상)", () => {
  /** 초과부담부 가드가 던지는지 여부만 뽑는다. */
  function guardThrows(info: BurdenedGiftInfo): boolean {
    try {
      assertBurdenedGiftEligible({ propertyType: "housing", isOneHousehold: false, info });
      return false;
    } catch {
      return true;
    }
  }

  it("설정액 ≥ 채무액 — 담보평가 = 채무액이라 C ≥ B, 가드 미발동이 법령상 정상", () => {
    // 보충적평가 150M < 채무 600M 인데도 §66 max가 담보평가 600M을 집어 올린다.
    const info = makeInfo({ mortgageSetAmount: 600_000_000 });
    const assumedDebt = info.lendingDepositTotal + info.mortgageDebtAmount; // 600M
    expect(computeMortgageValuation(info)).toBe(assumedDebt); // C == B
    expect(guardThrows(info)).toBe(false);
  });

  it("설정액 미입력이어도 동일 — fallback이 아니라 §63①3호 자체의 귀결", () => {
    const info = makeInfo({ mortgageSetAmount: undefined });
    expect(computeMortgageValuation(info)).toBe(600_000_000);
    expect(guardThrows(info)).toBe(false);
  });

  it("§63② 전단 구간(설정액 < 채무액)에서만 가드가 발동한다", () => {
    // 담보평가 400M · 보충적 150M · 임대평가 100M → C = 400M < B = 600M
    const info = makeInfo({ mortgageSetAmount: 300_000_000 });
    expect(guardThrows(info)).toBe(true);
  });

  it("담보평가는 어떤 입력에서도 인수채무액을 초과할 수 없다 (min 구조의 불변식)", () => {
    for (const set of [0, 1, 300_000_000, 500_000_000, 600_000_000, 9_999_999_999]) {
      const info = makeInfo({ mortgageSetAmount: set });
      const assumedDebt = info.lendingDepositTotal + info.mortgageDebtAmount;
      expect(computeMortgageValuation(info)).toBeLessThanOrEqual(assumedDebt);
    }
  });
});
