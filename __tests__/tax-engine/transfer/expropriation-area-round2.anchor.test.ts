/**
 * RU-2 anchor — 면적 반올림은 `round2()`다. 인라인 `parseFloat(x.toFixed(2))`가 아니다.
 *
 * 🔴 결함 (critic:rules, 2026-09-10):
 *   `transfer-tax-expropriation-valuation.ts:124`가 「면적 반올림 UI 일치」 주석을 달고
 *   정작 **규칙이 금지한 인라인 형태**를 썼다(`components/calc/CLAUDE.md:177` —
 *   「인라인 `parseFloat(x.toFixed(2))` 신규 작성 금지」).
 *
 * ## 두 형태는 실제로 다르다 — 스타일 문제가 아니다
 *
 * `round2(a) = Math.round(a * 100) / 100`은 **십진으로 스케일한 값**을 반올림한다.
 * `parseFloat(a.toFixed(2))`는 **이진 배정도 실제값**을 반올림한다. `8.045`는 double로
 * 저장될 때 `8.04499999…`이므로 `toFixed`는 `8.04`로 내리고, `8.045 * 100`은 정확히
 * `804.5`가 되어 `Math.round`는 `8.05`로 올린다.
 *
 * `x.xx5` 형태 10만 개 전수 실측: **43,412건(43.4%) 불일치**.
 * 그리고 이 값은 곧바로 **단가와 곱해져 환산 분모**가 된다 — 5,000,000원/㎡ 기준
 * 0.01㎡ 차이는 **50,000원대**다(실측 50,001 — RU2-2 주석 참조).
 *
 * 「소수 셋째 자리에서 반올림」이라는 법문·실무의 뜻은 `8.045 → 8.05`다.
 * ⇒ `round2`가 정본이고 인라인 형태가 드리프트다.
 */
import { describe, it, expect } from "vitest";
import { applyExpropriationValuation } from "@/lib/tax-engine/transfer-tax-expropriation-valuation";
import { round2 } from "@/lib/tax-engine/area-utils";

const PER_SQM = 5_000_000;

/** §164⑨1호 게이트 5조건을 모두 통과하는 최소 입력. */
const params = (transferArea: number) => ({
  propertyType: "land" as const,
  useEstimatedAcquisition: true,
  transferCause: "public_expropriation" as const,
  transferDate: new Date("2024-06-01"),
  standardPricePerSqmAtTransfer: PER_SQM,
  compensationPerSqm: PER_SQM * 2,
  compensationBasisStdPrice: PER_SQM * 3,
  transferArea,
});

describe("RU-2 — 두 반올림 형태의 실제 차이", () => {
  it("RU2-0: [전제] round2와 인라인은 x.xx5에서 갈린다", () => {
    expect(round2(8.045)).toBe(8.05);
    expect(parseFloat((8.045).toFixed(2))).toBe(8.04);

    let diff = 0;
    for (let i = 0; i < 100_000; i++) {
      const a = (i * 10 + 5) / 1000;
      if (round2(a) !== parseFloat(a.toFixed(2))) diff++;
    }
    // 「드물게 다르다」가 아니라 절반 가까이 다르다 — 실측 43,412.
    expect(diff).toBeGreaterThan(40_000);
  });
});

describe("RU-2 — §164⑨1호 환산 분모가 round2를 쓴다", () => {
  it("RU2-1: 8.045㎡ → 8.05㎡로 올림해 분모를 낸다", () => {
    const r = applyExpropriationValuation(params(8.045));
    expect(r).not.toBeNull();
    expect(r!.detail.area).toBe(8.05);
    expect(r!.denominator).toBe(Math.floor(PER_SQM * 8.05));
  });

  it("RU2-2: [영향] 인라인 형태였다면 분모가 50,001원 낮았다", () => {
    const r = applyExpropriationValuation(params(8.045))!;
    const inlineDenominator = Math.floor(PER_SQM * parseFloat((8.045).toFixed(2)));
    // 0.01㎡ × 5,000,000원/㎡ = 50,000원이 명목 차이지만 실측은 50,001이다 —
    // `5_000_000 * 8.04`가 이진 배정도로 `40199999.999999996`이라 floor가 1원을 더 깎는다.
    // ⚠️ 이 1원은 **이 PR의 대상이 아닌 별개 사안**이다(분모 곱셈이 safeMultiply를 쓰지
    //    않는다 — `feedback_safemul_decimal_apportion_precision` 축). 여기서는 실측값을
    //    그대로 고정해 두어, 그 축을 고칠 때 이 anchor가 함께 드러나게 한다.
    expect(r.denominator - inlineDenominator).toBe(50_001);
  });

  it("RU2-3: [대조군] 반올림이 갈리지 않는 면적은 면적값이 그대로다", () => {
    for (const a of [100, 76.51, 33.33, 8.04, 0.5]) {
      const r = applyExpropriationValuation(params(a))!;
      expect(r.detail.area).toBe(parseFloat(a.toFixed(2)));
    }
  });

  /**
   * 🔴 종전 이 대조군은 분모를 `Math.floor(PER_SQM * a)`로 기대했다 —
   *    **버그를 기대값으로 박아둔 것**이었다. `5,000,000 × 8.04`는 참값이 40,200,000인데
   *    부동소수 곱이 `40199999.999999996`이라 floor가 1원을 깎는다.
   *    분모를 «참값»으로 다시 세운다(`feedback_anchor_correction_legal_priority`).
   */
  it("RU2-3b: 분모는 참값이다 — 부동소수 곱의 1원 과소산정을 따라가지 않는다", () => {
    expect(applyExpropriationValuation(params(8.04))!.denominator).toBe(40_200_000);
    expect(Math.floor(PER_SQM * 8.04)).toBe(40_199_999); // 종전 값 — 되돌아가면 여기서 드러난다
    for (const [a, expected] of [[100, 500_000_000], [0.5, 2_500_000], [0.41, 2_050_000]] as const) {
      expect(applyExpropriationValuation(params(a))!.denominator).toBe(expected);
    }
  });

  it("RU2-4: [대조군] 3후보 min 선택 축은 그대로다", () => {
    const r = applyExpropriationValuation(params(100))!;
    // standard(5,000,000) < compensation(10,000,000) < basis(15,000,000)
    expect(r.detail.chosenPerSqm).toBe(PER_SQM);
  });

  it("RU2-5: [대조군] 게이트 미충족이면 여전히 null이다", () => {
    expect(applyExpropriationValuation({ ...params(100), transferArea: 0 })).toBeNull();
    expect(
      applyExpropriationValuation({ ...params(100), transferCause: "sale" as never }),
    ).toBeNull();
  });
});
