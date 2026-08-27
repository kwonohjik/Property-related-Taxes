/**
 * anchor — 사례 43: 토지출자 · 완공APT 양도 · 청산금 **수령** · **환산**취득가
 *
 * ## 이 조합은 「미구현」이 아니었다
 *
 * 설계문서 행 #8이 `☐ HOLD`(「xlsx 시트 미존재 — anchor 보류」)였고 ⑧ validate가
 * 「후속 PR 지원 예정」으로 **차단**하고 있었다. 그 주석의 진단은
 * 「`runLandContribEstimated()`가 pay 방향만 가정」이었는데 — **그 함수는 이 경로에 없다.**
 * 라우팅(`redevelopment.ts:188-194`)이 `subject === "right"` 전용이라 완공APT는
 * `runOriginalMember`로 가고, 거기서 §166③ 환산과 방향별 산식이 정상 적용된다.
 * **인접 함수의 한계를 이 조합의 한계로 옮겨 적은 것**이다.
 *
 * ## 조문 (법제처 DRF 실독 · 시행령 MST 286211)
 *
 * > **§166③** **제1항 및 제2항을 적용할 때** 기존건물과 그 부수토지의 취득가액을 확인할 수
 * > 없는 경우에는 … 평가액 × (취득일 현재 기준시가 ÷ 관리처분계획등 인가일 현재 기준시가)
 *
 * 「제1항 **및** 제2항」이라 납부·수령 어느 쪽에도 같은 산식이 걸린다 —
 * **수령 전용 환산 산식은 조문상 존재하지 않는다.**
 *
 * > **§163⑥1호** 토지　취득당시의 개별공시지가 × **3/100**
 *
 * ## 🔑 개산공제는 세 열에 **모두** 안분된다 (2026-08-27 정정 — 세액 변경)
 *
 * §166①2호 나목은 필요경비를 산식 **안**에서 빼고 안분하므로 개산공제의 `(평가액−청산금)÷평가액`
 * 몫만 나목이 부담한다. 나머지 몫은 **청산금 분할양도**(§88·§95① · 법규재산2012-358)의
 * 필요경비인데 **종전에는 어디에도 차감되지 않아** 그만큼 과대과세였다.
 * §166은 나목에서만 필요경비를 말하고 분할양도분 계산은 §166 밖이라 **명문이 없다** ⇒
 * 법 근거 없이 불리하게 적용하지 않는다(memory `feedback_no_unfavorable_application_without_legal_basis`).
 *
 * ⚠️ **잔액 흡수**로 나눈다(별도 floor 금지 · memory `feedback_floor_residual_absorption`).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

const RIGHTS_VALUE = 500_000_000;      // 평가액 (관리처분계획 가격 · §166④1호)
const SETTLEMENT = 114_000_000;        // 청산금 수령
const TRANSFER_PRICE = 525_000_000;
const STD_AT_ACQ = 60_000_000;         // 취득당시 개별공시지가 (§166③ 분자)
const STD_AT_APPROVAL = 200_000_000;   // 인가당시 개별공시지가 (§166③ 분모)

/** §166③ = 5억 × 6,000만 ÷ 2억 */
const CONVERTED_ACQ = 150_000_000;
/** §163⑥1호 = 6,000만 × 3% */
const LUMP_DEDUCTION = 1_800_000;
/** 분양가 = 평가액 − 청산금 */
const SALE_PRICE_TOTAL = RIGHTS_VALUE - SETTLEMENT; // 386,000,000

function run(
  direction: "receive" | "pay" = "receive",
  subject: "apt" | "right" = "apt",
) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: subject === "apt" ? "redevelopment_apt" : "right_to_move_in",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false, // 비과세 마스킹 배제 — 산식만 관측
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: {
      subject,
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2009-10-23"),
      rightsValue: RIGHTS_VALUE,
      settlementDirection: direction,
      settlementAmount: SETTLEMENT,
      settlementSaleDate: new Date("2023-03-02"),
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "land",
      landStdPriceAtAcq: STD_AT_ACQ,
      landStdPriceAtApproval: STD_AT_APPROVAL,
    } as RedevelopmentInfo,
  });
  const result = calculateTransferTax(input, mockRates);
  return { result, detail: result.redevelopmentDetail! };
}

/** 나목 = (평가액 − 환산취득가 − 개산공제) × (평가액−청산금) ÷ 평가액 */
const CLAUSE_B = 268_810_400;
/** 가목 = 양도가액 − 분양가 − 인가후필요경비 */
const CLAUSE_A = 139_000_000;
/** 개산공제 나목 몫 = 1,800,000 × 386 ÷ 500 */
const LUMP_PRE_SHARE = 1_389_600;
/** 개산공제 청산금분 몫 = 잔액 흡수 */
const LUMP_SETTLEMENT_SHARE = LUMP_DEDUCTION - LUMP_PRE_SHARE; // 410,400
/** 분할양도 = 청산금 − 환산취득가×청산금÷평가액 − 개산공제 청산금분 몫 */
const SETTLEMENT_GAIN = 114_000_000 - 34_200_000 - LUMP_SETTLEMENT_SHARE; // 79,389,600

describe("§166③ 환산 — 방향에 중립이다", () => {
  it("★ 환산취득가 = 평가액 × (취득일 기준시가 ÷ 인가일 기준시가)", () => {
    const meta = run().detail.valuationMeta!;
    expect(meta.method).toBe("estimated_post_disclosure_decree_166_3");
    expect(meta.numerator).toBe(STD_AT_ACQ);
    expect(meta.denominator).toBe(STD_AT_APPROVAL);
    expect(meta.rationale).toContain("§166③");
  });

  it("🔑 나목 취득가액 열이 환산취득가의 안분분이다", () => {
    // 150,000,000 × 386 ÷ 500
    expect(run().detail.preApproval.apportionedAcquisition).toBe(
      Math.floor((CONVERTED_ACQ * SALE_PRICE_TOTAL) / RIGHTS_VALUE),
    );
  });
});

describe("세 분기 — 조문 산식과 일치한다", () => {
  it("★ 나목(인가전) · 가목(인가후) · 청산금분", () => {
    const { detail } = run();
    expect(detail.preApproval.gain).toBe(CLAUSE_B);
    expect(detail.postApprovalExistingHouse.gain).toBe(CLAUSE_A);
    expect(detail.settlement.gain).toBe(SETTLEMENT_GAIN);
  });

  it("🔑 신고서 행 자기정합 — 세 열 모두 잔차 0", () => {
    const { detail } = run();
    for (const k of ["preApproval", "postApprovalExistingHouse", "settlement"] as const) {
      const b = detail[k];
      expect(
        b.apportionedTransfer - b.apportionedAcquisition - (b.expenses ?? 0) - b.gain,
        k,
      ).toBe(0);
    }
  });
});

describe("⭐ 개산공제 — 전액이 세 열에 나뉘어 실린다", () => {
  it("★ 열 합계 = §163⑥ 개산공제 전액 (종전에는 410,400이 사라졌다)", () => {
    const { detail } = run();
    const sum =
      (detail.preApproval.expenses ?? 0) +
      (detail.postApprovalExistingHouse.expenses ?? 0) +
      (detail.settlement.expenses ?? 0);
    expect(sum).toBe(LUMP_DEDUCTION);
  });

  it("★ 나목 몫은 §166①2호 나목 비율, 청산금분은 잔액 흡수", () => {
    const { detail } = run();
    expect(detail.preApproval.expenses).toBe(LUMP_PRE_SHARE);
    expect(detail.settlement.expenses).toBe(LUMP_SETTLEMENT_SHARE);
  });

  it("🔑 항등식 — 나목 + 청산금분 = 평가액 − 환산취득가 − 개산공제", () => {
    const { detail } = run();
    expect(detail.preApproval.gain + detail.settlement.gain).toBe(
      RIGHTS_VALUE - CONVERTED_ACQ - LUMP_DEDUCTION, // 348,200,000
    );
  });
});

describe("🔑 대조군 — 축이 섞이지 않는다", () => {
  it("납부 방향은 다른 값을 낸다 (수령이 무시되면 즉시 실패)", () => {
    const pay = run("pay").detail;
    expect(pay.preApproval.gain).not.toBe(CLAUSE_B);
    // 납부는 안분이 없어 개산공제 전액이 나목에 실린다
    expect(pay.preApproval.expenses).toBe(LUMP_DEDUCTION);
  });

  it("★ 입주권(right)은 여전히 납부 답을 낸다 — 게이트를 함께 열면 안 된다", () => {
    // `runLandContribEstimated`(2분기·`settlementPaid` 전용)가 수령을 표현하지 못한다.
    // ⑧ `transfer-tax-validate-redev.ts:93` 게이트가 이 경로를 계속 막아야 한다.
    const right = run("receive", "right").detail;
    const rightPay = run("pay", "right").detail;
    expect(right.preApproval.gain).toBe(rightPay.preApproval.gain);
    expect(right.settlement.gain).toBe(0);
  });
});
