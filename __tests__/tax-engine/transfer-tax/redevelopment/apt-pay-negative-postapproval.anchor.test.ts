/**
 * anchor — E1-03 : §166②1호 인가후양도차익이 **음수**일 때 0으로 clamp되어 인가전 이익과
 * 상계되지 않는다.
 *
 * ## 조문 (법제처 실독 — 소득세법 시행령 [시행 2026-07-01] §166②1호)
 *
 * > 1. 청산금을 납부한 경우
 * >   [관리처분계획등인가후양도차익 × 납부한 청산금 ÷ (기존건물과 그 부수토지의 평가액 + 납부한
 * >   청산금)](이하 "청산금납부분양도차익")
 * >   + {[관리처분계획등인가후양도차익 × 기존건물과 그 부수토지의 평가액 ÷ (평가액 + 납부한
 * >   청산금)] + 관리처분계획등인가전양도차익}(이하 "기존건물분양도차익")
 *
 * **대수적 합이고 clamp가 없다.** 두 안분분을 더하면 분모가 약분되므로
 * **합계 = 인가후양도차익 + 인가전양도차익**이다 — 즉 §166①1호(입주권)의 합계와 같은 값이어야
 * 한다. 인가후가 음수면 그만큼 기존건물분이 줄어야 한다.
 *
 * ## 결함
 *
 * `splitAptPay`가 `postApprovalGain <= 0`이면 청산금납부분·기존건물분을 **둘 다 0**으로 반환해
 * 음수분이 사라지고 인가전 이익만 남았다. 같은 사실관계를 자산 종류만 「입주권」으로 바꾸면
 * (§166①1호 `computeRightPay`) 음수가 그대로 흘러 정상 합계가 나온다 ⇒ **같은 경제적 사실이
 * 자산 종류에 따라 다른 양도차익**을 만들었다. 법 근거 없이 납세자에게 불리한 방향이다.
 *
 * ## 실측 시나리오
 *
 * 종전주택 2007-04-09 취득(실가 400,000,000) → 2013-10-23 인가(권리가액 650,000,000)
 * → 청산금 300,000,000 **납부** → 2023-02-16 신축APT를 **800,000,000**에 양도.
 *
 *   분양가        = 650,000,000 + 300,000,000 = 950,000,000
 *   인가후양도차익 = 800,000,000 − 950,000,000 = **−150,000,000**
 *   인가전양도차익 = 650,000,000 − 400,000,000 = **+250,000,000**
 *   실제 양도차익  = 800,000,000 − (400,000,000 + 300,000,000) = **100,000,000**
 *
 * 종전 엔진은 인가후 −150,000,000을 버리고 **250,000,000**을 만들었다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { splitAptPay } from "@/lib/tax-engine/redevelopment-settlement";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

function redevInfo(subject: "apt" | "right"): RedevelopmentInfo {
  return {
    subject,
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2013-10-23"),
    rightsValue: 650_000_000,
    settlementDirection: "pay",
    settlementAmount: 300_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
  };
}

function input(subject: "apt" | "right"): TransferTaxInput {
  return baseTransferInput({
    propertyType: subject === "apt" ? "redevelopment_apt" : "right_to_move_in",
    transferPrice: 800_000_000,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2007-04-09"),
    acquisitionPrice: 400_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: redevInfo(subject),
  });
}

describe("E1-03 anchor — splitAptPay leaf (음수 인가후양도차익)", () => {
  it("🔑 음수가 안분되어 흐른다 — 합계 불변식 유지 (청산금분 + 기존건물분 = 인가후)", () => {
    const s = splitAptPay(-150_000_000, 650_000_000, 300_000_000);
    expect(s.salePriceTotal).toBe(950_000_000);
    expect(s.settlementGain + s.postApprovalExistingHouseGain).toBe(-150_000_000);
    expect(s.postApprovalExistingHouseGain).toBeLessThan(0);
    expect(s.settlementGain).toBeLessThan(0);
  });

  it("분모 0 방어는 남긴다 — 평가액·청산금이 모두 0이면 0 반환", () => {
    const s = splitAptPay(-150_000_000, 0, 0);
    expect(s.settlementGain).toBe(0);
    expect(s.postApprovalExistingHouseGain).toBe(0);
  });

  it("양수 경로는 종전과 동일 (회귀 가드)", () => {
    const s = splitAptPay(100_000_000, 650_000_000, 300_000_000);
    expect(s.settlementGain + s.postApprovalExistingHouseGain).toBe(100_000_000);
    expect(s.postApprovalExistingHouseGain).toBe(68_421_052);
  });
});

describe("E1-03 anchor — 자산 종류가 양도차익을 가르지 않는다", () => {
  const apt = calculateTransferTax(input("apt"), rates);
  const right = calculateTransferTax(input("right"), rates);

  it("🔑 완공APT 총 양도차익 = 100,000,000 (종전 250,000,000)", () => {
    expect(apt.transferGain).toBe(100_000_000);
  });

  it("§166②1호 합계 = 인가후(−150,000,000) + 인가전(+250,000,000)", () => {
    const d = apt.redevelopmentDetail!;
    expect(d.preApproval.gain).toBe(250_000_000);
    expect(d.settlement.gain + d.postApprovalExistingHouse.gain).toBe(-150_000_000);
  });

  it("🔑 같은 사실을 입주권(§166①1호)으로 태워도 같은 총 양도차익", () => {
    expect(right.transferGain).toBe(apt.transferGain);
  });

  it("음수 차익의 최종 처리는 양도소득금액 단계가 담당한다 — 분기에서 자르지 않는다", () => {
    // total.taxableIncome은 Math.max(0, …)로 이미 보호된다(redevelopment.ts).
    expect(apt.redevelopmentDetail!.total.taxableIncome).toBeGreaterThanOrEqual(0);
  });
});
