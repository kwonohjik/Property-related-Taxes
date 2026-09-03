/**
 * anchor — 소령 §159①의 **B는 신고(증여계약) 단위**임을 엔진에서 고정한다.
 *
 * 컴패니언(다른 물건) 함께 부담부증여에서 ④가 `assumedDebtOverride`로 재배분한 채무를
 * 실으면 `computeDebtRatio`가 그것을 B로 써야 한다. 이 필드를 무시하면 카드마다 자기
 * 채무 전액이 B가 되어 **자산 수만큼 곱해진다**(라우트 실측 2배 — 배관 anchor 참조).
 *
 * 🔑 **평가(A)는 override에 영향받지 않는다**는 것이 이 설계의 존재 이유다.
 *    채무를 스케일해서 Bᵢ를 만들면 담보평가(§66)·임대평가(§61⑤) 성분이 함께 움직여
 *    Aᵢ가 바뀌는 자기참조가 된다. O-3가 그 분리를 고정한다.
 *
 * 계획서: `docs/02-design/features/transfer-companion-burdened-gift.plan.md`
 */
import { describe, it, expect } from "vitest";
import {
  computeDebtRatio,
  computeSangjeungbeopValuation,
} from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 물건 평가 10억 · 입력 채무 4억(보증금 2억 + 근저당 2억). */
const info = (over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo =>
  ({
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 200_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_000,
    ...over,
  }) as BurdenedGiftInfo;

describe("§159① B는 신고 단위 — assumedDebtOverride", () => {
  it("O-1 override가 없으면 종전대로 보증금+근저당이 B다", () => {
    const { assumedDebtAmount, debtRatio } = computeDebtRatio(info(), 1_000_000_000);
    expect(assumedDebtAmount).toBe(400_000_000);
    expect(debtRatio).toBeCloseTo(0.4, 10);
  });

  it("O-2 override가 있으면 그것이 B다 — 재배분된 Bᵢ", () => {
    // ΣA = 16억, 총채무 4억, 이 자산 A = 10억 → Bᵢ = 4억 × 10/16 = 2.5억
    const { assumedDebtAmount, debtRatio } = computeDebtRatio(
      info({ assumedDebtOverride: 250_000_000 }),
      1_000_000_000,
    );
    expect(assumedDebtAmount).toBe(250_000_000);
    // 신고 단위 비율 B/ΣA = 4/16 = 0.25가 복원된다.
    expect(debtRatio).toBeCloseTo(0.25, 10);
  });

  it("O-3 🔑 override는 **평가액 A를 바꾸지 않는다** (자기참조 차단)", () => {
    const base = computeSangjeungbeopValuation(0, 1_000_000_000, info());
    const withOverride = computeSangjeungbeopValuation(
      0,
      1_000_000_000,
      info({ assumedDebtOverride: 250_000_000 }),
    );
    expect(withOverride).toEqual(base);
    expect(base.max).toBe(1_000_000_000);
    expect(base.selectedMode).toBe("supplementary");
  });

  it("O-4 override 0 — 채무가 그 물건에 없어도 B는 0으로 확정된다", () => {
    // 「입력 채무 × 비율」로는 만들 수 없는 값이 아니라, 반대로 **입력 채무가 0인 자산에
    // 몫을 줄 수 있는** 것이 override의 두 번째 존재 이유다. 0 자체도 명시값이어야 한다
    // (`?? `가 아니라 `!== undefined` 판정 — 0이 미입력으로 둔갑하면 안 된다).
    const { assumedDebtAmount, debtRatio } = computeDebtRatio(
      info({ lendingDepositTotal: 0, mortgageDebtAmount: 0, assumedDebtOverride: 0 }),
      1_000_000_000,
    );
    expect(assumedDebtAmount).toBe(0);
    expect(debtRatio).toBe(0);
  });

  it("O-5 입력 채무 0인 자산도 override로 몫을 받는다", () => {
    const { assumedDebtAmount, debtRatio } = computeDebtRatio(
      info({
        lendingDepositTotal: 0,
        mortgageDebtAmount: 0,
        buildingStdPriceAtTransfer: 600_000_000,
        assumedDebtOverride: 150_000_000,
      }),
      600_000_000,
    );
    expect(assumedDebtAmount).toBe(150_000_000);
    expect(debtRatio).toBeCloseTo(0.25, 10);
  });
});
