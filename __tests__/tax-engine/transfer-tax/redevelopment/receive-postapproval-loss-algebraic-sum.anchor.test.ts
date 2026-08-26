/**
 * anchor — §166①2호는 **「합한 가액」**이다: 가목 음수를 자르지 않는다 (T1-05 종결)
 *
 * ## 조문 (법제처 DRF 실독 · 시행령 MST 286211 · 시행 2026-07-01)
 *
 * > **§166①2호** 청산금을 지급받은 경우 다음 각 목의 금액을 **합한 가액**
 * >   가. [양도가액 − (기존건물과 그 부수토지의 평가액 − **지급받은 청산금**) − 법 §97①2·3호 필요경비]
 * >   나. [(평가액 − 취득가액 − 필요경비)] × [(평가액 − 지급받은 청산금) ÷ 평가액]
 *
 * **「합한 가액」이 유일한 지시다.** 「음수인 경우 0으로 본다」류의 단서가 §166 ①~⑧ 어디에도
 * 없다(전문 대조). 같은 조 **1호(납부)** 도 「인가후양도차익 ＋ 인가전양도차익」으로 동일하다.
 *
 * > 🔑 **§166②2호는 「제1항제2호에 따른 가액」이라고만 한다** — 완공APT+수령과 입주권+수령이
 * >    **같은 산식**을 쓴다. 그래서 이 anchor는 두 분기를 항상 쌍으로 본다.
 *
 * ## 🔴 종전 결함 — 양도가액이 달라도 세액이 같았다
 *
 * `Math.max(0, …)` clamp 두 개(`redevelopment-split.ts` `computeAptReceive` ·
 * `redevelopment-settlement.ts` `splitReceive`)가 가목을 0에 고정해, **분양가 아래로는
 * 아무리 싸게 팔아도 세액이 움직이지 않았다** — 완공APT 양도 3.0억과 3.5억이 둘 다
 * 64,801,000원. 방향은 항상 **과대(불리)** 다.
 *
 * ## ⭐ 일관성은 clamp 제거 쪽에 있었다
 *
 * 1호(납부) 분기 `splitAptPay`는 **2026-08-25 E1-03(`96ed87b4`)에서 같은 clamp를 이미
 * 제거**했다(「§166②1호는 clamp 없는 대수적 합 · 음수 처리는 양도소득금액 단계 담당」).
 * 대체된 종전 anchor는 「apt+pay도 같은 가드로 0 처리하니 일관된다」고 적었으나 그것은
 * **하루 전에 이미 사실이 아니었다**(종전 anchor 최초 커밋 2026-08-26).
 *
 * ## 🔑 음수는 「분기」가 아니라 하류에서 처리된다
 *
 * | 지점 | 역할 |
 * |---|---|
 * | `transfer-tax.ts` `skipLossFloor ? raw : Math.max(0, raw)` | **단건**은 0 바닥 |
 * | `transfer-tax-aggregate.ts` `skipLossFloor: true` | **집계**는 음수를 §102② 통산에 실어보냄 |
 * | `redevelopment.ts` `splitLthdAmount` `gainAmt <= 0` | 음수 분기 LTHD 0 |
 *
 * 종전에는 분기 clamp가 차손을 파괴해 **§102② 통산이 이 자산에 대해서만 공전**했다.
 *
 * ## 🔑 §102②은 이 판정의 근거가 아니다 (층이 다르다)
 *
 * 법 §102②은 「양도차손이 발생한 **자산**이 있는 경우 … **해당 자산 외의 다른 자산**에서
 * 발생한 양도소득금액에서 공제」 — **자산 간** 규정이다. 한 자산 **안에서** 인가전·인가후가
 * 어떻게 합쳐지는지는 §166이 정한다. 두 조문은 충돌하지 않는다.
 *
 * ## 예규·심판례 부존재 (2026-08-27 조회)
 *
 * 조세심판원 「관리처분계획인가후양도차익」 3건은 **전부 LTHD 축**(조심2020서0236 ·
 * 조심2021인2879 · 국심1998서1004), 국세청 해석 1건(2012-11-09)은 **청산금분 산식**이다.
 * 「가목이 음수면 0으로 본다」는 해석은 **찾지 못했다**.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const RIGHTS_VALUE = 500_000_000;
const SETTLEMENT_RECEIVED = 100_000_000;
/** 분양가 = 평가액 − 지급받은 청산금 (가목 괄호) */
const SALE_PRICE_TOTAL = RIGHTS_VALUE - SETTLEMENT_RECEIVED; // 400,000,000

function redevInfo(subject: "apt" | "right"): RedevelopmentInfo {
  return {
    subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2015-06-01"),
    rightsValue: RIGHTS_VALUE,
    settlementDirection: "receive",
    settlementAmount: SETTLEMENT_RECEIVED,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    receiveOnlyMode: false,
    exemptionEligibleAtApproval: false, // 비과세 마스킹을 배제해 산식만 관측한다
  } as RedevelopmentInfo;
}

function run(subject: "apt" | "right", transferPrice: number, skipLossFloor = false) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: subject === "apt" ? "redevelopment_apt" : "right_to_move_in",
    transferPrice,
    transferDate: new Date("2023-09-01"),
    acquisitionDate: new Date("2005-03-10"),
    acquisitionPrice: 200_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: redevInfo(subject),
    skipLossFloor,
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

/**
 * 가목이 음수가 되는 유일한 구간: 양도가액 < 분양가(400,000,000).
 * 가목 = 양도가액 − 400,000,000 이므로 3.5억 → −50,000,000 · 3.0억 → −100,000,000.
 */
const BELOW_A = 350_000_000;
const BELOW_B = 300_000_000;
/** 대조군 — 분양가 초과. clamp 유무와 무관하게 동일해야 한다. */
const ABOVE = 600_000_000;
/** 자산 **총차익**까지 음수로 내리는 극단값 — 단건 바닥이 어디서 작동하는지 가른다. */
const DEEP_LOSS = 50_000_000;

/** 나목 = (500,000,000 − 200,000,000) × 400,000,000 / 500,000,000 */
const PRE_APPROVAL_ADJUSTED = 240_000_000;
/** 완공APT 청산금분(책 산식) = 100,000,000 − 200,000,000 × 100,000,000/500,000,000 */
const APT_SETTLEMENT_GAIN = 60_000_000;

/** 관측 대상 분기 — 두 자산에서 가목이 실리는 자리가 서로 다르다. */
const clauseA = {
  apt: (d: ReturnType<typeof run>["detail"]) => d.postApprovalExistingHouse,
  right: (d: ReturnType<typeof run>["detail"]) => d.settlement,
} as const;

describe("§166①2호 가목 — 음수가 살아남는다", () => {
  it("★ 완공APT: 양도가액 − 분양가가 그대로 실린다 (clamp 없음)", () => {
    expect(clauseA.apt(run("apt", BELOW_A).detail).gain).toBe(-50_000_000);
    expect(clauseA.apt(run("apt", BELOW_B).detail).gain).toBe(-100_000_000);
  });

  it("★ 입주권: 같은 산식이므로 같은 값이다 (§166②2호 → ①2호 인용)", () => {
    expect(clauseA.right(run("right", BELOW_A).detail).gain).toBe(-50_000_000);
    expect(clauseA.right(run("right", BELOW_B).detail).gain).toBe(-100_000_000);
  });

  it("🔑 경계: 양도가액 = 분양가면 정확히 0이다 (음수도 양수도 아니다)", () => {
    expect(clauseA.apt(run("apt", SALE_PRICE_TOTAL).detail).gain).toBe(0);
    expect(clauseA.right(run("right", SALE_PRICE_TOTAL).detail).gain).toBe(0);
  });

  it("🔑 나목은 가목과 무관하다 — 안분비율만 본다", () => {
    for (const p of [BELOW_A, BELOW_B, ABOVE, DEEP_LOSS]) {
      expect(run("apt", p).detail.preApproval.gain, `apt ${p}`).toBe(PRE_APPROVAL_ADJUSTED);
      expect(run("right", p).detail.preApproval.gain, `right ${p}`).toBe(PRE_APPROVAL_ADJUSTED);
    }
  });
});

describe("⭐ 「합한 가액」 — 양도가액에 선형으로 반응한다", () => {
  it("★ 3.0억과 3.5억의 총차익이 5천만원 차이난다 (종전에는 0이었다)", () => {
    const aptDelta = run("apt", BELOW_A).result.transferGain - run("apt", BELOW_B).result.transferGain;
    const rightDelta =
      run("right", BELOW_A).result.transferGain - run("right", BELOW_B).result.transferGain;
    expect(aptDelta).toBe(50_000_000);
    expect(rightDelta).toBe(50_000_000);
  });

  it("★ 세액도 함께 움직인다 — 싸게 팔면 덜 낸다", () => {
    expect(run("apt", BELOW_A).result.totalTax).toBeLessThan(run("apt", ABOVE).result.totalTax);
    expect(run("apt", BELOW_B).result.totalTax).toBeLessThan(run("apt", BELOW_A).result.totalTax);
    expect(run("right", BELOW_B).result.totalTax).toBeLessThan(run("right", BELOW_A).result.totalTax);
  });

  it("🔑 합계 항등식: 총차익 = 인가전 + 인가후기존 + 청산", () => {
    for (const p of [BELOW_A, BELOW_B, ABOVE]) {
      const { result, detail } = run("apt", p);
      const sum =
        detail.preApproval.gain + detail.postApprovalExistingHouse.gain + detail.settlement.gain;
      expect(sum, `apt ${p}`).toBe(result.transferGain);
    }
  });

  it("🔑 완공APT 총차익 = 240,000,000 + (양도가액 − 400,000,000) + 60,000,000", () => {
    for (const p of [BELOW_A, BELOW_B, ABOVE]) {
      expect(run("apt", p).result.transferGain, `${p}`).toBe(
        PRE_APPROVAL_ADJUSTED + (p - SALE_PRICE_TOTAL) + APT_SETTLEMENT_GAIN,
      );
    }
  });
});

describe("회귀 — 대조군은 한 원도 움직이지 않는다", () => {
  it("분양가 초과 양도는 종전 값 그대로다", () => {
    const apt = run("apt", ABOVE);
    expect(apt.detail.postApprovalExistingHouse.gain).toBe(200_000_000);
    expect(apt.result.transferGain).toBe(500_000_000);
    expect(apt.result.totalTax).toBe(124_366_000);

    const right = run("right", ABOVE);
    expect(right.detail.settlement.gain).toBe(200_000_000);
    expect(right.result.transferGain).toBe(440_000_000);
    expect(right.result.totalTax).toBe(142_846_000);
  });
});

describe("🔑 음수의 최종 처리는 하류가 담당한다 — 분기가 아니다", () => {
  /**
   * ⭐ **실측이 계획 전제를 뒤집었다 (2026-08-27).**
   *
   * 계획서는 「단건은 `transfer-tax.ts`의 `Math.max(0, ownerRawGain)`이 총차익을 0으로
   * 바닥친다」고 적었으나, **재개발 경로는 그 줄에 도달하지 않는다** — 자기 파이프라인으로
   * 조기 분기하기 때문이다(memory `feedback_early_return_branch_skips_pipeline_stages`).
   *
   * 실측 결과 자산 총차익은 **음수 그대로 노출**되고, **과세표준·산출세액이 0**으로 처리된다.
   * §92 구조상 이것이 정상이다 — 양도차손이 있는 자산의 과세표준은 0이고, 그 차손은
   * §102②이 **다른 자산**에서 공제하도록 정한다. 총차익을 0으로 지우면 그 차손 자체가 사라진다.
   *
   * 🔑 **그래서 이 테스트가 고정하는 것은 「0 바닥」이 아니라 「세액 0 + 차손 보존」이다.**
   */
  it("★ 단건: 총차익은 음수로 남고, 과세표준·세액이 0으로 처리된다", () => {
    // 가목 = 50,000,000 − 400,000,000 = −350,000,000
    //   apt   총합 = 240,000,000 − 350,000,000 + 60,000,000 = −50,000,000
    //   right 총합 = 240,000,000 − 350,000,000              = −110,000,000
    expect(clauseA.apt(run("apt", DEEP_LOSS).detail).gain).toBe(-350_000_000);
    expect(clauseA.right(run("right", DEEP_LOSS).detail).gain).toBe(-350_000_000);

    expect(run("apt", DEEP_LOSS).result.transferGain).toBe(-50_000_000);
    expect(run("right", DEEP_LOSS).result.transferGain).toBe(-110_000_000);

    // 차손이 남아도 과세되지 않는다 — 하류가 실제로 담당하는 지점.
    for (const s of ["apt", "right"] as const) {
      expect(run(s, DEEP_LOSS).result.taxBase, `${s} 과표`).toBe(0);
      expect(run(s, DEEP_LOSS).result.calculatedTax, `${s} 산출`).toBe(0);
      expect(run(s, DEEP_LOSS).result.totalTax, `${s} 총세액`).toBe(0);
    }
  });

  it("🔑 `skipLossFloor`는 재개발 경로에서 **no-op**이다 — 차손은 항상 흐른다", () => {
    // 종전에는 clamp가 게이트였고 이 플래그가 아니었다. 플래그만 보고
    // 「집계에서만 차손이 산다」고 읽으면 오진한다(구별력 0인 축).
    for (const s of ["apt", "right"] as const) {
      for (const p of [BELOW_A, DEEP_LOSS]) {
        expect(run(s, p, true).result.transferGain, `${s} ${p}`).toBe(
          run(s, p, false).result.transferGain,
        );
      }
    }
  });

  it("★ 집계(§102②): skipLossFloor=true면 차손이 살아서 통산에 도달한다", () => {
    // 종전에는 clamp가 차손을 파괴해 이 값이 300,000,000 / 240,000,000으로 고정됐다.
    expect(run("apt", BELOW_A, true).result.transferGain).toBe(250_000_000);
    expect(run("right", BELOW_A, true).result.transferGain).toBe(190_000_000);
    expect(run("apt", DEEP_LOSS, true).result.transferGain).toBe(-50_000_000);
    expect(run("right", DEEP_LOSS, true).result.transferGain).toBe(-110_000_000);
  });

  it("🔑 음수 분기의 LTHD는 0이다 (§95② — 공제 대상 양도차익이 없다)", () => {
    for (const p of [BELOW_A, BELOW_B, DEEP_LOSS]) {
      expect(clauseA.apt(run("apt", p).detail).lthd, `apt ${p}`).toBe(0);
      expect(clauseA.right(run("right", p).detail).lthd, `right ${p}`).toBe(0);
    }
    // 대조군 — 양수 분기에는 LTHD가 실제로 붙는다(구별력 확보).
    expect(clauseA.apt(run("apt", ABOVE).detail).lthd).toBeGreaterThan(0);
  });
});
