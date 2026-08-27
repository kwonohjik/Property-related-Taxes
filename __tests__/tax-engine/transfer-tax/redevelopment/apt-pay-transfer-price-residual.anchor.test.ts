/**
 * anchor — 완공APT+납부 **양도가액 열**의 floor 잔차 흡수
 *
 * ## 🔴 결함
 *
 * `computeAptPay`가 양도가액을 두 몫으로 나누며 **각각 floor**해, 합이 총 양도가액보다
 * 1원 적었다:
 *
 * ```
 *   기존주택분 = floor(양도가액 × 평가액   ÷ 분양가)
 *   청산금분   = floor(양도가액 × 납부청산금 ÷ 분양가)   ← 여기도 floor
 * ```
 *
 * 실측(평가액 13억 · 납부청산금 6억 · 양도가액 15억 ⇒ 분양가 19억):
 * `1,026,315,789 + 473,684,210 = 1,499,999,999 ≠ 1,500,000,000`
 *
 * ## 🔑 같은 함수의 **양도차익**은 이미 규약을 지키고 있었다
 *
 * `splitAptPay`는 `settlementGain = postApprovalGain − existingGain`으로 **마지막 분기가
 * 잔액을 흡수**한다(사례 40·41에서 확립 · memory `feedback_floor_residual_absorption`).
 * **표시 열만 그 규약 밖에 있었다** ⇒ 같은 흡수 패턴으로 맞춘다.
 *
 * ## 조문·서식
 *
 * 「소득세법 시행령」 §166②1호는 인가후양도차익을 **평가액 : 납부청산금** 비율로 가른다.
 * 신고서는 열마다 「양도가액 − 취득가액 = 양도차익」이 성립해야 하고, **열의 합계가 총액과
 * 일치**해야 한다. 1원이라도 어긋나면 서식 합계란이 맞지 않는다
 * (memory `feedback_redev_filing_form_acquisition_inverse`).
 *
 * ## ⚠️ 취득가액 열은 잔차가 없다
 *
 * 취득가액은 `평가액`·`납부청산금`을 **그대로** 싣고 그 합이 정의상 분양가와 같다
 * (`salePriceTotal = rightsValue + settlementAmount`) — 나눗셈이 없어 floor도 없다.
 * 그래서 이 anchor는 **양도가액 열만** 본다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

function run(rightsValue: number, settlementAmount: number, transferPrice: number) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: {
      subject: "apt",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: new Date("2018-10-23"),
      rightsValue,
      settlementDirection: "pay",
      settlementAmount,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
      exemptionEligibleAtApproval: false, // 비과세 마스킹 배제 — 표시 열만 관측
    } as RedevelopmentInfo,
  });
  return calculateTransferTax(input, mockRates).redevelopmentDetail!;
}

/** 잔차를 만드는 조건 — 15억 × 13/19, 15억 × 6/19 둘 다 소수부가 남는다. */
const R = 1_300_000_000;
const S = 600_000_000;
const TP = 1_500_000_000;

describe("양도가액 열 — 두 몫의 합이 총액과 같다", () => {
  it("★ 잔차 조건에서 합이 정확히 총 양도가액이다", () => {
    const d = run(R, S, TP);
    expect(
      d.postApprovalExistingHouse.apportionedTransfer + d.settlement.apportionedTransfer,
    ).toBe(TP);
  });

  it("★ 기존주택분은 floor 그대로다 — 흡수자는 청산금분이다", () => {
    const d = run(R, S, TP);
    // floor(1,500,000,000 × 1,300,000,000 ÷ 1,900,000,000) = 1,026,315,789
    expect(d.postApprovalExistingHouse.apportionedTransfer).toBe(1_026_315_789);
    // 흡수 후 = 1,500,000,000 − 1,026,315,789
    expect(d.settlement.apportionedTransfer).toBe(473_684_211);
  });

  it("🔑 양도차익도 같은 흡수 규약을 쓴다 — 두 열이 같은 방향으로 맞는다", () => {
    const d = run(R, S, TP);
    expect(d.postApprovalExistingHouse.gain + d.settlement.gain).toBe(
      d.preApproval.gain === 0
        ? d.total.gain
        : d.total.gain - d.preApproval.gain,
    );
  });

  it("🔑 여러 조건에서 항상 성립한다 (잔차가 우연히 0인 조합에 기대지 않는다)", () => {
    const cases: Array<[number, number, number]> = [
      [1_300_000_000, 600_000_000, 1_500_000_000],
      [700_000_000, 300_000_000, 1_234_567_891],
      [333_333_333, 111_111_111, 987_654_321],
      [800_000_000, 200_000_000, 2_000_000_000], // 딱 떨어지는 조합 (회귀)
      [1_000_000_007, 3, 1_000_000_001],
    ];
    for (const [rv, sa, tp] of cases) {
      const d = run(rv, sa, tp);
      expect(
        d.postApprovalExistingHouse.apportionedTransfer + d.settlement.apportionedTransfer,
        `평가 ${rv} · 청산 ${sa} · 양도 ${tp}`,
      ).toBe(tp);
    }
  });
});

describe("회귀 — 딱 떨어지는 조합은 종전 값 그대로다", () => {
  it("평가 8억 · 청산 2억 · 양도 20억 → 16억 / 4억", () => {
    const d = run(800_000_000, 200_000_000, 2_000_000_000);
    expect(d.postApprovalExistingHouse.apportionedTransfer).toBe(1_600_000_000);
    expect(d.settlement.apportionedTransfer).toBe(400_000_000);
  });

  it("🔑 취득가액 열은 나눗셈이 없어 정의상 정확하다", () => {
    const d = run(R, S, TP);
    expect(d.postApprovalExistingHouse.apportionedAcquisition).toBe(R);
    expect(d.settlement.apportionedAcquisition).toBe(S);
    expect(
      d.postApprovalExistingHouse.apportionedAcquisition + d.settlement.apportionedAcquisition,
    ).toBe(R + S);
  });
});
