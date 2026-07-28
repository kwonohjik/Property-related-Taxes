/**
 * A2 ⑧ — 부담부증여 × 지분: validate가 엔진과 **같은 스케일**로 B/C를 비교한다.
 *
 * ## 결함
 *
 * `transfer-tax-validate-bg.ts`의 시가 모드 B/C>1 검사가 `bgMarketValueAtTransfer`를
 * **물건 전체(100%)** 로 비교했다. 엔진은 §159의 C를 지분분으로 축소하므로
 * (`scaleBurdenedGiftInfo`), 지분 모드에서 **UI는 통과하는데 엔진이 죽는** 모순이 생긴다.
 *
 * 채무는 사용자가 **해당 지분 인수분**을 입력하므로 스케일하지 않는다 —
 * 스케일 대상은 평가액뿐이다.
 *
 * CLAUDE.md ⑧: "API/UI fallback 있는 필드는 validate도 동일 fallback.
 * UI 통과 ↔ validate 차단 모순 금지" 의 역방향(validate 통과 ↔ 엔진 차단)도 같은 원칙이다.
 */
import { describe, it, expect } from "vitest";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";

const asset = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "actual",
    bgActualAcquisitionTotal: "300,000,000",
    // 물건 전체 시가 12억 / 인수채무 7억
    bgMarketValueAtTransfer: "1,200,000,000",
    bgLendingDepositTotal: "0",
    bgMortgageDebtAmount: "700,000,000",
    ...over,
  }) as never;

describe("⑧ 부담부증여 지분 — B/C 검사 스케일 정합", () => {
  it("단독 소유: 채무 7억 < 시가 12억 → 통과 (회귀 가드)", () => {
    expect(validateBurdenedGiftAsset(asset({}), "자산1")).toBeNull();
  });

  it("🔴 지분 1/2: 지분분 시가 6억 < 채무 7억 → 차단된다", () => {
    const msg = validateBurdenedGiftAsset(
      asset({ ownershipNumerator: "1", ownershipDenominator: "2" }),
      "자산1",
    );
    expect(msg).toMatch(/채무액/);
    expect(msg).toMatch(/초과/);
  });

  it("차단 메시지에 지분분·물건 전체 금액이 함께 노출된다", () => {
    const msg = validateBurdenedGiftAsset(
      asset({ ownershipNumerator: "1", ownershipDenominator: "2" }),
      "자산1",
    );
    expect(msg).toContain("600,000,000"); // 지분분 C
    expect(msg).toContain("1,200,000,000"); // 물건 전체 (사용자 혼란 방지)
    expect(msg).toContain("1/2");
  });

  it("지분 1/2 + 채무 5억: 지분분 6억 이내 → 통과 (판별력)", () => {
    expect(
      validateBurdenedGiftAsset(
        asset({
          ownershipNumerator: "1",
          ownershipDenominator: "2",
          bgMortgageDebtAmount: "500,000,000",
        }),
        "자산1",
      ),
    ).toBeNull();
  });
});
