/**
 * anchor — 청산금분은 **분할양도**다: 손실을 자르지 않는다
 *
 * ## 1. §166②2호의 인용 범위 (법제처 DRF 실독 · 시행령 MST 286211)
 *
 * > **§166②2호** 청산금을 지급받는 경우　**제1항제2호에 따른 가액**
 *
 * 조문 전문이 이것뿐이다. 「준용한다」도 아니고 한정·수정 어구도 없이 ①2호의 가액을
 * 그대로 가리킨다 ⇒ §166②2호가 정하는 것은 **가목 + 나목 = 신축주택 양도분**뿐이다.
 *
 * 그리고 **나목이 청산금 상당분을 스스로 배제한다** — `×(평가액 − 지급받은 청산금) ÷ 평가액`.
 * 즉 §166은 청산금에 대응하는 종전 부동산 부분을 **의도적으로 계산 밖에 둔다**.
 *
 * ## 2. 배제분의 정체 — 국세청 **법규재산2012-358** (2012.11.09, 등록 2013.04.25)
 *
 * > 재개발조합원이 지급받는 청산금은 종전 주택(부수토지 포함)의 **분할양도**에 해당하므로
 * > 원칙적으로 양도소득세 과세대상이며 … 그 대가로 … **청산금을 교부받은 경우 그 청산금은
 * > 종전 부동산의 유상이전에 해당하여 양도소득세가 과세되는 것입니다.**
 * > (평가액은 「소득세법 시행령」 제166조 제4항 제1호의 관리처분계획 가격에 따른다)
 *
 * ⇒ 청산금분은 **별개의 양도 사건**이다. 근거는 §166이 아니라 **법 §88·§95①·§100**이고,
 *   평가액만 §166④1호를 빌린다. 사례 46(청산금분 **단독 신고**)이 그 별개성의 증거다.
 *
 * ⇒ 그래서 3분기 모형(가목 + 나목 + 청산금분)은 **두 개의 양도를 한 신고에 담은 것**이며 옳다.
 *   ⚠️ 다만 이 분기를 「§166①2호 가목」이라 부르면 **틀린 인용**이다 — 가목은 신축주택분이다.
 *
 * ## 3. 🔴 clamp가 엔진을 자기모순으로 만들었다
 *
 * 종전 부동산의 손익 `평가액 − 취득가액`은 두 조각으로 갈린다 (대수적으로 정확히):
 *
 * ```
 *   나목      = (평가액 − 취득가액) × (평가액 − 청산금) ÷ 평가액
 *   청산금분  =  청산금 − 취득가액 × 청산금 ÷ 평가액
 *             = (평가액 − 취득가액) × 청산금 ÷ 평가액
 *   ────────────────────────────────────────────
 *   합계      =  평가액 − 취득가액                      ← 안분비율이 약분된다
 * ```
 *
 * **나목에는 clamp가 없고 청산금분에만 있었다.** 취득가액 10억 > 평가액 8억 실측:
 *
 * | 조각 | 값 | 종전 처리 |
 * |---|---|---|
 * | 나목 | −150,000,000 | 그대로 반영 |
 * | 청산금분 | −50,000,000 | **0으로 파괴** |
 *
 * 같은 손실(−2억)의 75%는 인정하고 25%는 버렸다. 성질이 같은 두 조각인데 취급이 갈렸다.
 * 근거 조문 **§95①에도 「음수면 0으로 본다」 문언이 없다** — 양도차손은 §102②이 처리한다.
 *
 * 🔑 이 anchor의 중심은 **항등식**이다: `나목 + 청산금분 = 평가액 − 취득가액`.
 *    개별 값만 고정하면 한쪽이 조용히 잘려도 통과할 수 있다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

/** 평가액(관리처분계획 가격) — §166④1호 */
const RIGHTS_VALUE = 800_000_000;
const SETTLEMENT_RECEIVED = 200_000_000;

/**
 * 양도가액을 분양가(평가액 − 청산금 = 6억)보다 **높게** 잡아, 가목이 항상 양수로 남게 한다.
 * 그래야 이 anchor가 보는 것이 **청산금분 clamp 하나**로 좁혀진다(T1-05 축과 분리).
 */
const TRANSFER_PRICE = 2_000_000_000;

function run(acquisitionPrice: number, originalAssetType: "housing" | "land" = "housing") {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2022-03-01"),
    acquisitionDate: new Date("2001-01-01"),
    acquisitionPrice,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false, // 비과세 마스킹을 배제해 산식만 관측한다
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2014-02-01"),
      rightsValue: RIGHTS_VALUE,
      settlementDirection: "receive",
      settlementAmount: SETTLEMENT_RECEIVED,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType,
      receiveOnlyMode: false,
      exemptionEligibleAtApproval: false,
    } as RedevelopmentInfo,
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

/** 취득가액 > 평가액 ⇒ 종전 부동산에서 손실. 청산금분 clamp가 발동하는 유일한 구간. */
const ACQ_ABOVE_VALUATION = 1_000_000_000;
/** 사례 47 조건 — 취득가액 ≪ 평가액. 대조군. */
const ACQ_CASE_47 = 100_000_000;

describe("⭐ 항등식 — 나목 + 청산금분 = 평가액 − 취득가액", () => {
  it("★ 손실 구간에서도 성립한다 (종전에는 청산금분이 잘려 깨졌다)", () => {
    const { detail } = run(ACQ_ABOVE_VALUATION);
    expect(detail.preApproval.gain + detail.settlement.gain).toBe(
      RIGHTS_VALUE - ACQ_ABOVE_VALUATION, // −200,000,000
    );
  });

  it("🔑 이익 구간에서도 성립한다 (회귀 — 종전에도 성립했다)", () => {
    const { detail } = run(ACQ_CASE_47);
    expect(detail.preApproval.gain + detail.settlement.gain).toBe(
      RIGHTS_VALUE - ACQ_CASE_47, // 700,000,000
    );
  });

  it("🔑 취득가액 = 평가액이면 두 조각 모두 0이다 (경계)", () => {
    const { detail } = run(RIGHTS_VALUE);
    expect(detail.preApproval.gain).toBe(0);
    expect(detail.settlement.gain).toBe(0);
  });
});

describe("청산금분 — 분할양도의 양도차익 (§88·§95① · 평가액은 §166④1호)", () => {
  it("★ 손실이 음수 그대로 실린다", () => {
    const { detail } = run(ACQ_ABOVE_VALUATION);
    // 안분취득가액 = 10억 × 2억 ÷ 8억 = 250,000,000
    expect(detail.settlement.apportionedAcquisition).toBe(250_000_000);
    expect(detail.settlement.apportionedTransfer).toBe(SETTLEMENT_RECEIVED);
    expect(detail.settlement.gain).toBe(-50_000_000);
  });

  it("🔑 나목은 종전에도 잘리지 않았다 — 두 조각의 취급이 같아야 한다", () => {
    expect(run(ACQ_ABOVE_VALUATION).detail.preApproval.gain).toBe(-150_000_000);
  });

  it("🔑 취득가액에 선형으로 반응한다", () => {
    // 취득가액 +1억 ⇒ 청산금분 −(1억 × 2/8) = −25,000,000
    const a = run(ACQ_ABOVE_VALUATION).detail.settlement.gain;
    const b = run(ACQ_ABOVE_VALUATION + 100_000_000).detail.settlement.gain;
    expect(a - b).toBe(25_000_000);
  });
});

describe("회귀 — 가목(신축주택분)과 사례 47 대조군은 불변", () => {
  it("가목은 이 축과 무관하다 — 양도가액 − 분양가", () => {
    for (const acq of [ACQ_CASE_47, ACQ_ABOVE_VALUATION]) {
      expect(run(acq).detail.postApprovalExistingHouse.gain, `취득 ${acq}`).toBe(
        TRANSFER_PRICE - (RIGHTS_VALUE - SETTLEMENT_RECEIVED), // 1,400,000,000
      );
    }
  });

  it("사례 47 조건의 3분기 값이 그대로다", () => {
    const { detail } = run(ACQ_CASE_47);
    expect(detail.preApproval.gain).toBe(525_000_000);
    expect(detail.postApprovalExistingHouse.gain).toBe(1_400_000_000);
    expect(detail.settlement.gain).toBe(175_000_000);
    expect(detail.settlement.apportionedAcquisition).toBe(25_000_000);
  });
});

describe("🟠 토지 출자 분기는 이 PR 범위 밖이다 — 현행을 고정만 한다", () => {
  /**
   * `originalAssetType: "land"`는 청산금분을 **통째로 0**으로 만든다(2026-05-17 사례 42 정정).
   * 그 근거 주석은 「청산금 자체는 인가시점에 받은 금액이라 **별도 양도 사건이 없음**」인데,
   * **법규재산2012-358이 정면으로 반대**한다(유상이전 = 양도).
   *
   * 다만 그 해석의 질의는 **주택** 사안이고 사례 42 원본을 확인하지 못했다 ⇒ **확인 필요**.
   * 방향은 **과소**(청산금 2억이 과세에서 이탈). 여기서는 현행을 고정해 조용한 변경만 막는다.
   */
  it("현행: land는 청산금분이 0이고 항등식이 깨진다 (판정 보류 상태를 고정)", () => {
    const { detail } = run(ACQ_CASE_47, "land");
    expect(detail.settlement.gain).toBe(0);
    expect(detail.preApproval.gain + detail.settlement.gain).not.toBe(RIGHTS_VALUE - ACQ_CASE_47);
  });
});
