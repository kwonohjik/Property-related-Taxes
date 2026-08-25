/**
 * anchor — 신고서 §166 분기 열의 **필요경비 자기정합** 4분기 전수 (E1-05 · E1-06)
 *
 * ## 무엇이 어긋나 있었나
 *
 * 엔진은 필요경비를 **1회만** 차감한다(세액은 옳다). 어긋나는 것은 **표시용 열**이다 —
 * 안분된 양도가액·취득가액·양도차익 옆에 **안분 전 원액** 필요경비가 붙어
 * 「양도가액 − 취득가액 − 필요경비 ≠ 양도차익」이 된다.
 *
 * 2026-08-26 실측(수정 전):
 *
 * | 분기 | 열 | 실측 |
 * |---|---|---|
 * | 완공APT + 수령 | 인가전 분 | 600,000,000 − 75,000,000 − **20,000,000** = 505,000,000 ≠ 차익 510,000,000 (**Δ5,000,000**) |
 * | 완공APT + 납부 | 인가후 기존주택분 | Δ2,842,105 · 청산금분 Δ6,157,896 · **필요경비 합 18,000,000**(실제 9,000,000) |
 * | 완공APT + 수령 | 청산금분 | 차감되지 않은 9,000,000이 붙어 Δ**9,000,000** · 합계도 18,000,000 |
 * | 입주권 (납부·수령) | 전부 | 이미 정합 — 손대지 않는다 |
 *
 * ⚠️ **리뷰(E1-06)는 「완공APT + 납부 전용」이라 적었으나 실측은 「수령」에도 같은 결함**을 보였다.
 *    수령 분기의 인가후 필요경비는 `computeAptReceive`가 **인가후 기존주택분에서만** 차감하는데
 *    (`postApprovalGain = 양도가액 − 분양가 − 인가후필요경비`) 청산금분 열에도 원액이 붙어 있었다.
 *    ⇒ 처방 범위를 실측으로 넓혔다(memory `feedback_enumerate_all_write_sites_before_fixing`).
 *
 * ## 조문
 *
 * · 「소득세법 시행령」 §166①2호 **나목** — 인가전양도차익 × (평가액 − 청산금) ÷ 평가액.
 *   `computeAptReceive`가 완공APT 수령 분기에도 이 안분을 그대로 적용한다
 *   (§166②2호가 ①2호를 준용) ⇒ 필요경비도 같은 비율이어야 열이 맞는다. **(E1-05)**
 * · 「소득세법 시행령」 §166②**1호** — 인가후양도차익(= 양도가액 − 분양가 − 인가후 필요경비)을
 *   평가액:청산금 비율로 나눈다. 필요경비는 **나누기 전에 한 번** 빠지므로 실효 부담은 이미
 *   그 비율로 갈려 있다 ⇒ 표시도 같은 비율로 갈라야 한다. **(E1-06)**
 *
 * ## 🟠 남는 ≤2원은 이 결함이 아니다
 *
 * 완공APT+납부의 **양도가액 열**은 두 몫을 각각 floor해 합이 총액보다 1원 적다
 * (1,026,315,789 + 473,684,210 = 1,499,999,999). 그래서 필요경비를 정확히 안분해도
 * 행 잔차 ≤2원이 남는다. 이는 **별건**이며 이 anchor는 그 크기를 상한으로 고정한다 —
 * 백만 단위 어긋남으로 되돌아가면 즉시 실패한다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { RedevelopmentBranchDetail } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const mockRates = makeMockRates();

type Branch = { subject: "right" | "apt"; direction: "pay" | "receive" };

function run(
  b: Branch,
  over: Partial<RedevelopmentInfo>,
  inputOver: Partial<TransferTaxInput> = {},
) {
  const redevelopment = {
    subject: b.subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2018-10-23"),
    rightsValue: 800_000_000,
    settlementDirection: b.direction,
    settlementAmount: 200_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    acquisitionRounding: "floor",
    exemptionEligibleAtApproval: false, // 비과세 마스킹을 배제해 표시 열만 관측한다
    ...over,
  } as RedevelopmentInfo;

  const input: TransferTaxInput = baseTransferInput({
    propertyType: b.subject === "right" ? "right_to_move_in" : "redevelopment_apt",
    transferPrice: 2_000_000_000,
    transferDate: new Date("2023-03-02"),
    acquisitionDate: new Date("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment,
    ...inputOver,
  });
  return calculateTransferTax(input, mockRates).redevelopmentDetail!;
}

/** 신고서 한 열의 잔차 — 양도가액 − 취득가액 − 필요경비 − 양도차익. */
function rowResidual(b: RedevelopmentBranchDetail): number {
  return b.apportionedTransfer - b.apportionedAcquisition - (b.expenses ?? 0) - b.gain;
}

function expenseTotal(d: ReturnType<typeof run>): number {
  return (
    (d.preApproval.expenses ?? 0) +
    (d.postApprovalExistingHouse.expenses ?? 0) +
    (d.settlement.expenses ?? 0)
  );
}

describe("E1-05 · 인가전 분 필요경비 안분 — 완공APT 수령에도 적용된다", () => {
  const PRE_EXPENSES = 20_000_000;
  // 비율 = (평가액 800,000,000 − 청산금 200,000,000) / 800,000,000 = 0.75

  it("E1-05-01: 🔑 완공APT + 수령 — 인가전 분 필요경비가 §166①2호 나목 비율로 안분된다", () => {
    const d = run({ subject: "apt", direction: "receive" }, { preApprovalExpenses: PRE_EXPENSES });
    // 수정 전: 원액 20,000,000이 그대로 붙어 열이 5,000,000 어긋났다.
    expect(d.preApproval.expenses).toBe(15_000_000);
    expect(rowResidual(d.preApproval)).toBe(0);
  });

  it("E1-05-02: 입주권 + 수령 — 종전부터 정합이었다 (회귀 감시)", () => {
    const d = run({ subject: "right", direction: "receive" }, { preApprovalExpenses: PRE_EXPENSES });
    expect(d.preApproval.expenses).toBe(15_000_000);
    expect(rowResidual(d.preApproval)).toBe(0);
  });

  it("E1-05-03: 납부 분기는 안분이 없다 — 원액 그대로가 정합이다", () => {
    for (const subject of ["apt", "right"] as const) {
      const d = run({ subject, direction: "pay" }, { preApprovalExpenses: PRE_EXPENSES });
      expect(d.preApproval.expenses, subject).toBe(PRE_EXPENSES);
      expect(rowResidual(d.preApproval), subject).toBe(0);
    }
  });
});

describe("E1-06 · 인가후 필요경비 — 두 열에 원액이 각각 붙지 않는다", () => {
  const POST_EXPENSES = 9_000_000;

  describe("완공APT + 납부 (§166②1호 안분)", () => {
    // 평가액 650,000,000 · 납부청산금 300,000,000 → 분양가 950,000,000
    const d = run(
      { subject: "apt", direction: "pay" },
      { rightsValue: 650_000_000, settlementAmount: 300_000_000, postApprovalExpenses: POST_EXPENSES },
      { transferPrice: 1_500_000_000 },
    );

    it("E1-06-01: 🔑 필요경비 합이 원액과 같다 (종전 18,000,000 = 정확히 2배)", () => {
      expect(expenseTotal(d)).toBe(POST_EXPENSES);
    });

    it("E1-06-02: 기존주택분이 평가액 몫, 청산금분이 잔차를 갖는다 (§166②1호 비율)", () => {
      // floor(9,000,000 × 650,000,000 / 950,000,000) = 6,157,894 · 잔차 2,842,106
      expect(d.postApprovalExistingHouse.expenses).toBe(6_157_894);
      expect(d.settlement.expenses).toBe(2_842_106);
    });

    it("E1-06-03: 두 열의 잔차가 ≤2원이다 (종전 2,842,105 · 6,157,896)", () => {
      expect(Math.abs(rowResidual(d.postApprovalExistingHouse))).toBeLessThanOrEqual(2);
      expect(Math.abs(rowResidual(d.settlement))).toBeLessThanOrEqual(2);
    });
  });

  describe("완공APT + 수령 (인가후 기존주택분에서만 차감)", () => {
    const d = run(
      { subject: "apt", direction: "receive" },
      { postApprovalExpenses: POST_EXPENSES },
    );

    it("E1-06-04: 🔑 청산금분에는 붙지 않는다 — 그 분기가 차감하지 않기 때문", () => {
      // 수정 전: 청산금분에 9,000,000이 붙어 열이 그만큼 어긋났다.
      expect(d.settlement.expenses).toBe(0);
      expect(rowResidual(d.settlement)).toBe(0);
    });

    it("E1-06-05: 인가후 기존주택분은 전액을 갖는다 (거기서 전액 차감된다)", () => {
      expect(d.postApprovalExistingHouse.expenses).toBe(POST_EXPENSES);
      expect(rowResidual(d.postApprovalExistingHouse)).toBe(0);
      expect(expenseTotal(d)).toBe(POST_EXPENSES);
    });
  });

  describe("입주권 (§166①1호·①2호 가목) — 손대지 않는다", () => {
    it("E1-06-06: 납부·수령 모두 청산금 열이 전액을 갖고 열이 정합이다", () => {
      for (const direction of ["pay", "receive"] as const) {
        const d = run({ subject: "right", direction }, { postApprovalExpenses: POST_EXPENSES });
        expect(d.settlement.expenses, direction).toBe(POST_EXPENSES);
        expect(d.postApprovalExistingHouse.expenses, direction).toBe(0);
        expect(rowResidual(d.settlement), direction).toBe(0);
        expect(expenseTotal(d), direction).toBe(POST_EXPENSES);
      }
    });
  });
});
