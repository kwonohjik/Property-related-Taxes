/**
 * 재개발 상속 종전자산의 「확인된 취득가액」 추출 — §166③ 환산 배제 판정
 *
 * 근거: 소득세법 시행령 §166③(취득가액을 확인할 수 없는 경우에만 환산) ·
 *       §163⑨ 본문(①) · §163⑨1호·2호(②) — **①②는 둘 다 법 §97①1호 가목**
 *       = 취득당시 실지거래가액 의제이므로 「확인된 취득가액」이다.
 *       ③ 환산(§163⑫ → §176조의2)만 추계라 §166③ "확인 불가" 영역.
 *
 * 계획서: docs/02-design/features/inheritance-pre-deemed-clause-a-b-separation.plan.md §8 결함 B
 */

import { describe, it, expect } from "vitest";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import {
  resolveInheritedRedevelopmentAcqPrice,
  type InheritedAcquisitionStepResult,
} from "@/lib/tax-engine/inheritance-acquisition-helpers";
import type { InheritanceAcquisitionInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";
import type { TransferTaxInput, CalculationStep } from "@/lib/tax-engine/types/transfer.types";

/** 함수는 `result`만 읽는다 — 나머지 필드는 형식 충족용. */
function makeStep(input: InheritanceAcquisitionInput, redevelopment166_3Price?: number | null): InheritedAcquisitionStepResult {
  return {
    updatedInput: {} as TransferTaxInput,
    result: calculateInheritanceAcquisitionPrice(input, redevelopment166_3Price),
    step: {} as CalculationStep,
  };
}

/** 의제취득일(1985.1.1.) 前 상속 — pre-deemed 분기 */
const PRE_DEEMED = {
  inheritanceDate: new Date("1984-12-31"),
  assetKind: "house_individual" as const,
};

/**
 * 재개발 종전자산의 ③ = §166③(계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12 · Q-8 a).
 * STEP 0.45가 §166③ 금액을 주입하므로 비교와 적용이 같은 산식이다 — ③ 채택이면 null(재개발 분기가 §166③ 계산).
 * PR-1에서는 ③을 §176조의2④로 비교해 놓고 여기서 ①②를 반환했다(카드와 계산 불일치 · 증여 회귀 G-R4).
 */
describe("§166③ — 재개발 3자 max: ③(§166③) 채택이면 null, ①② 채택이면 그 값", () => {
  it("Q3-1: §166③이 ①②보다 크면 converted → null(§166③ 경로) — §176조의2④ 입력은 쓰지 않는다", () => {
    const step = makeStep(
      {
        ...PRE_DEEMED,
        reportedValue: 100_000_000, // ①
        houseValuationStdPrice: 150_000_000, // ②
        transferPrice: 500_000_000,
        standardPriceAtDeemedDate: 10_000_000,
        standardPriceAtTransfer: 250_000_000, // §176조의2④라면 20M — 재개발에서는 무시
      },
      200_000_000, // ③ §166③
    );

    expect(step.result.preDeemedBreakdown?.selectedMethod).toBe("converted");
    expect(step.result.preDeemedBreakdown?.convertedAmount).toBe(200_000_000);
    expect(step.result.preDeemedBreakdown?.convertedBasis).toBe("redevelopment_166_3");
    expect(step.result.acquisitionPrice).toBe(200_000_000);
    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBeNull();
  });

  it("Q3-2: ①②가 §166③보다 크면 ①② 중 큰 값 — §176조의2④가 더 커도 비교에 들어가지 않는다", () => {
    const step = makeStep(
      {
        ...PRE_DEEMED,
        reportedValue: 100_000_000, // ①
        houseValuationStdPrice: 150_000_000, // ②
        transferPrice: 500_000_000,
        standardPriceAtDeemedDate: 100_000_000,
        standardPriceAtTransfer: 250_000_000, // §176조의2④라면 200M > ①② — 재개발에서는 무시
      },
      141_221_534, // ③ §166③
    );

    expect(step.result.preDeemedBreakdown?.selectedMethod).toBe("sec164");
    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBe(150_000_000);
  });

  it("Q3-3: 재개발인데 §166③을 쓸 수 없으면(null — ⑤ 실가 또는 칸 비움) ③ = 0", () => {
    const step = makeStep(
      { ...PRE_DEEMED, reportedValue: 100_000_000, transferPrice: 500_000_000, standardPriceAtDeemedDate: 100_000_000, standardPriceAtTransfer: 250_000_000 },
      null,
    );

    expect(step.result.preDeemedBreakdown?.convertedAmount).toBe(0);
    expect(step.result.preDeemedBreakdown?.selectedMethod).toBe("reported");
    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBe(100_000_000);
  });

  it("Q3-4: 동점이면 ①② 우선(Q-5) — 실가로 계산", () => {
    const step = makeStep({ ...PRE_DEEMED, reportedValue: 141_221_534 }, 141_221_534);
    expect(step.result.preDeemedBreakdown?.selectedMethod).toBe("reported");
    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBe(141_221_534);
  });
});

describe("§166③ 확인된 취득가액 — ②(§164④~⑦)도 가목이다", () => {
  it("B-1: ① 없고 ②만 있으면 → ②가 확인된 취득가액 (현행은 null을 반환해 §166③ 환산으로 빠진다)", () => {
    const step = makeStep({
      ...PRE_DEEMED,
      // ① 미입력(상속세 신고가액 없음)
      houseValuationStdPrice: 150_000_000, // ② §164⑦
      transferPrice: 500_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000, // ③ = 500M × 50M/250M = 100M
    });

    expect(step.result.preDeemedBreakdown?.sec164Amount).toBe(150_000_000);
    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBe(150_000_000);
  });

  it("B-2: ①②가 모두 있으면 → 큰 쪽(②)이 확인된 취득가액", () => {
    const step = makeStep({
      ...PRE_DEEMED,
      reportedValue: 100_000_000, // ①
      houseValuationStdPrice: 150_000_000, // ②
      transferPrice: 500_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000, // ③ = 100M
    });

    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBe(150_000_000);
  });

  it("B-3(회귀): ①만 있으면 종전과 동일하게 ① 반환", () => {
    const step = makeStep({
      ...PRE_DEEMED,
      reportedValue: 300_000_000, // ①
      transferPrice: 500_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000, // ③ = 100M
    });

    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBe(300_000_000);
  });

  it("B-4(회귀): ①② 모두 없으면 null — §166③ 환산 경로 유지", () => {
    const step = makeStep({
      ...PRE_DEEMED,
      transferPrice: 500_000_000,
      standardPriceAtDeemedDate: 50_000_000,
      standardPriceAtTransfer: 250_000_000, // ③만 존재
    });

    expect(step.result.preDeemedBreakdown?.convertedAmount).toBe(100_000_000);
    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBeNull();
  });

  it("B-5(회귀): post-deemed는 acquisitionPrice를 그대로 반환", () => {
    const step = makeStep({
      inheritanceDate: new Date("2010-05-01"),
      assetKind: "house_individual",
      reportedValue: 400_000_000,
      reportedMethod: "supplementary", // 없으면 legacyFallback으로 빠진다
    });

    expect(step.result.preDeemedBreakdown).toBeUndefined();
    expect(resolveInheritedRedevelopmentAcqPrice(step)).toBe(400_000_000);
  });

  it("B-6(회귀): step 자체가 없으면 null", () => {
    expect(resolveInheritedRedevelopmentAcqPrice(undefined)).toBeNull();
  });
});
