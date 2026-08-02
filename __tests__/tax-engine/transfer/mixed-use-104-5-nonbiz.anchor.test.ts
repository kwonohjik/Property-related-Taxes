/**
 * anchor: 겸용주택 배율초과 비사업용토지 — §104⑤ 비교과세 적용 (P6 / D-8)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md
 *   §D-8(모델 A 재판정) · §4.5(P6 설계) · §5 매트릭스 #14~#16 · §6 B-22~B-24
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 종전 겸용 엔진은 배율초과 비사업용토지가 있으면 **모델 A**를 썼다:
 *     누진(합산 과세표준) + 10%p × 비사토 귀속 과세표준
 * 이 산식은 「소득세법」 §104⑤ 어느 호도 아니다(1호는 가산 없는 합산 누진, 2호는 **호별**
 * 산출세액 합). 그리고 항상 MAX(1호, 2호) **이상**을 과세한다 — 법정 상한 초과다.
 *
 * [법령 — §104⑤ 본문 **후단**, MST 280405 · 시행 2026-07-01 · 2026-08-02 법제처 실측]
 *   "이 경우 제2호의 금액을 계산할 때 … **한 필지의 토지가 제104조의3에 따른 비사업용 토지와
 *    그 외의 토지로 구분되는 경우에는 각각을 별개의 자산으로 보아** 양도소득 산출세액을
 *    계산한다."
 *   ⇒ 배율 이내 부수토지(비사토 아님)와 초과분(비사토)은 **별개 자산**이므로 2호에서 호를
 *      달리하여 각각 계산한다. 2018.4.1. 이후 양도분(대법원 2014.10.30. 2012두15371 취지).
 *
 * 진입요건("둘 이상 양도")도 겸용주택에서는 **토지 + 건물**로 이미 충족된다(§94①1호).
 * 선행 계획서 G-1이 split 경로에서 채택한 논거와 같다 — 겸용만 달리 볼 근거가 없었다.
 *
 * ── 비사토 파트가 §104①8호 + 후단을 그대로 타는 이유 ──────────────────
 * `buildTotalTax`의 `surchargeAddon` 분기는 「누진(base) + addon×base」를 만들고, 2년 미만이면
 * 단기세율 세액과 MAX를 취한다. 비사토 파트에 `surchargeAddon: 0.10`을 주면 그것이 곧
 *   §104①8호(기본세율 + 10%p) + §104① 후단(단기와 비교해 큰 것)
 * 이다. 단기율은 `kind !== "housing"`이라 토지 기준 50%/40%가 뽑힌다(§104①3·2호 본문).
 */
import { describe, it, expect } from "vitest";
import {
  buildTotalTax,
  type MixedUseRatePart,
} from "@/lib/tax-engine/transfer-tax-mixed-use-totals";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { makeMockRates } from "../_helpers/mock-rates";

const { brackets, basicDeductionRules } = parseRatesFromMap(makeMockRates());
const LIMIT = basicDeductionRules.annualLimit; // 2,500,000

/** 2년 이상 보유 — 단기세율(§104①2·3호) 미적용 구간 */
const LONG = 10;

/** 주택 + 상가(토지·건물) + 배율초과 비사토 4파트 */
function parts(
  housing: number,
  cLand: number,
  cBuilding: number,
  nonBiz: number,
): MixedUseRatePart[] {
  return [
    { kind: "housing", income: housing, holdingYears: LONG },
    { kind: "commercial_land", income: cLand, holdingYears: LONG },
    { kind: "commercial_building", income: cBuilding, holdingYears: LONG },
    // §104①8호 — 자기 과세표준에만 +10%p
    { kind: "non_business_land", income: nonBiz, holdingYears: LONG, surchargeAddon: 0.1 },
  ];
}

describe("P6 / D-8 — 겸용 배율초과 비사토는 §104⑤ MAX로 계산한다", () => {
  it("B-22: 주택3억·상가2억·비사토1억 — 1호(합산누진)가 이긴다", () => {
    const r = buildTotalTax(
      300_000_000,
      200_000_000,
      100_000_000,
      brackets,
      LIMIT,
      parts(300_000_000, 120_000_000, 80_000_000, 100_000_000),
    );

    // 과세표준 = 6억 − 250만. 기본공제는 최고세율 파트(비사토 0.45+0.10)에 전액 귀속.
    expect(r.taxBase).toBe(597_500_000);

    // 1호 = 누진(597,500,000) = 597,500,000×42% − 35,940,000
    //     ⇒ 가산 **없음**(§104⑤1호는 §55① 세율만)
    // 2호 = [비사토 97,500,000: 누진 18,685,000 + 10% 9,750,000 = 28,435,000]
    //      + [주택3억+상가2억 = 5억 누진 174,060,000]
    //     = 202,495,000
    // MAX = 1호 215,010,000
    expect(r.transferTax).toBe(215_010_000);
    expect(r.rateBasis).toBe("progressive");

    // 종전 모델 A = 215,010,000 + 9,750,000 = 224,760,000 (법정 상한 9,750,000원 초과)
    expect(r.transferTax).toBeLessThan(224_760_000);
  });

  it("B-23: 주택10억·상가5억·비사토8억 — 2호(호별 합)가 이긴다", () => {
    const r = buildTotalTax(
      1_000_000_000,
      500_000_000,
      800_000_000,
      brackets,
      LIMIT,
      parts(1_000_000_000, 300_000_000, 200_000_000, 800_000_000),
    );

    expect(r.taxBase).toBe(2_297_500_000);

    // 1호 = 누진(2,297,500,000) = 967,935,000
    // 2호 = [비사토 797,500,000: 누진 299,010,000 + 10% 79,750,000 = 378,760,000]
    //      + [주택10억+상가5억 = 15억 누진 609,060,000]
    //     = 987,820,000  ← 2호 승
    expect(r.transferTax).toBe(987_820_000);

    // 종전 모델 A = 1,047,685,000 (법정 상한 59,865,000원 초과)
    expect(r.transferTax).toBeLessThan(1_047_685_000);
  });

  it("B-24: 비사토 > 0 겸용이 §104⑤ 2호 경로에 **진입**한다 (B-16 반전)", () => {
    const r = buildTotalTax(
      1_000_000_000,
      500_000_000,
      800_000_000,
      brackets,
      LIMIT,
      parts(1_000_000_000, 300_000_000, 200_000_000, 800_000_000),
    );

    // 종전에는 `nonBizIncome > 0` 게이트로 clause2가 아예 만들어지지 않아
    // rateBasis가 항상 "progressive"였다.
    expect(r.rateBasis).toBe("clause2");
  });
});

describe("P6 회귀 — 바꾸지 않은 경로", () => {
  it("B-31: `rateParts` 미전달이면 종전 모델(합산 누진 + 가산)을 그대로 쓴다 (안전측 fallback)", () => {
    // 상가 파트 분해 실패(음수 차익 clamp 등)로 rateParts를 못 만드는 경로.
    // §104⑤를 적용할 파트 정보가 없으므로 후퇴하며, 이때는 가산이 살아 있어야 한다
    // — 여기서 가산까지 빼면 비사토 중과가 통째로 사라져 과소과세가 된다.
    const r = buildTotalTax(300_000_000, 200_000_000, 100_000_000, brackets, LIMIT);

    expect(r.nonBusinessSurcharge).toBe(9_750_000); // (1억 − 250만) × 10%
    expect(r.transferTax).toBe(224_760_000); // 215,010,000 + 9,750,000
    expect(r.rateBasis).toBe("progressive");
  });

  it("B-32: 비사토 = 0인 겸용은 P3b 경로 그대로 — 가산 0·§104⑤ 비교는 세율이 갈릴 때만", () => {
    const r = buildTotalTax(300_000_000, 200_000_000, 0, brackets, LIMIT, [
      { kind: "housing", income: 300_000_000, holdingYears: LONG },
      { kind: "commercial_land", income: 120_000_000, holdingYears: LONG },
      { kind: "commercial_building", income: 80_000_000, holdingYears: LONG },
    ]);

    expect(r.nonBusinessSurcharge).toBe(0);
    // 전 파트 장기·중과 없음 ⇒ 2호 = 1호라 진입 의미가 없어 clause2는 null.
    expect(r.rateBasis).toBe("progressive");
    expect(r.transferTax).toBe(r.taxByBasicRate);
  });

  it("B-33: 비사토의 +10%p(§104①8호)를 §104⑦ 중과 표시로 오표시하지 않는다", () => {
    // `surchargeAddon`은 결과 카드가 「다주택 중과 N%p」로 인용하는 **주택 전용** 필드다.
    // 비사토 파트도 addon(0.10)을 갖지만 근거 조문이 §104①8호로 달라 섞이면 안 된다.
    const r = buildTotalTax(
      1_000_000_000,
      500_000_000,
      800_000_000,
      brackets,
      LIMIT,
      parts(1_000_000_000, 300_000_000, 200_000_000, 800_000_000),
    );
    expect(r.surchargeAddon).toBeUndefined();

    // 주택 파트에 §104⑦ 중과가 실제로 있으면 그때는 노출된다.
    const withHousingSurcharge = buildTotalTax(
      1_000_000_000,
      500_000_000,
      800_000_000,
      brackets,
      LIMIT,
      parts(1_000_000_000, 300_000_000, 200_000_000, 800_000_000).map((p) =>
        p.kind === "housing" ? { ...p, surchargeAddon: 0.3 } : p,
      ),
    );
    expect(withHousingSurcharge.surchargeAddon).toBe(0.3);
  });
});
