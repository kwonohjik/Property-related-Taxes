/**
 * anchor (G-7′) — 조합원입주권(`subject="right"`) 양도에 조특법 §97의3① 특례가 닿으면 **인가전 분에만** 적용한다.
 *
 * 법령: 소득세법 §95② 괄호 「… 조합원입주권(조합원으로부터 취득한 것은 제외한다)에 대하여 그 자산의 양도차익
 * (조합원입주권을 양도하는 경우에는 「도시 및 주거환경정비법」 제74조에 따른 관리처분계획 인가 … 전 토지분 또는
 * 건물분의 양도차익으로 한정한다)에 …」 — 특례도 장기보유특별공제액 계산 규정이라 이 괄호 안에서 돈다.
 * 입주권의 청산금 분기는 §166①2호 가목 인가후 분(프리미엄)이다.
 *
 * 계획서 docs/01-plan/features/rental-97-3-textbook-gaps.plan.md §5 R-6·R-7 · §6 PR-2.
 * 화면은 아직 입주권에 §97의3을 막는다(⑧·⑫ — PR-3에서 연다) — 이 파일은 엔진 직접 호출이다.
 *
 * 시료(§3 G-7): 원조합원 · 취득 2013-06-30 1.5억 · 장기 등록·임대 2014-01-01 · 자동말소 2022-01-01(8년 → 50%)
 * · 관리처분 인가 2023-03-01 · 권리가액 3.5억 · 양도 2024-06-01 7억 · 임대분 비율 (2.5억 − 1.5억)/(3억 − 1억) = 1/2.
 *   인가전 차익 2억 = 임대분 1억 × 50% + 비임대분 1억 × 18%(보유 9년) = 68,000,000
 *   인가후 분 3.5억 = 공제 대상 아님 → 0 (종전 87,500,000 → 합계 155,500,000)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { applyRental97LthdSpecial } from "@/lib/tax-engine/transfer-tax-redevelopment-lthd";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (v: string) => new Date(v);

const RED_973 = {
  type: "rental_97_3",
  registrationDate: D("2014-01-01"), rentalStartDate: D("2014-01-01"),
  isTaxRegistered: true, taxRegistrationDate: D("2014-01-01"),
  officialPriceAtStart: 200_000_000, isNationalHousingScale: true, region: "capital", rentIncreaseViolated: false,
  rentalContinuesToTransfer: false, rentalEndDate: D("2022-01-01"), autoCancelled973: true,
  stdPriceAtAcquisition: 100_000_000, stdPriceAtRentalStart: 150_000_000, stdPriceAtRentalEnd: 250_000_000, stdPriceAtTransfer: 300_000_000,
};

function run(reductions: unknown[]) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "right_to_move_in",
      transferPrice: 700_000_000, transferDate: D("2024-06-01"),
      acquisitionPrice: 150_000_000, acquisitionDate: D("2013-06-30"), expenses: 0,
      isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0,
      redevelopment: {
        subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: D("2023-03-01"),
        rightsValue: 350_000_000, settlementDirection: "pay", settlementAmount: 0,
        preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing", isSuccessorMember: false,
      },
      standardPriceAtAcquisition: 100_000_000, standardPriceAtTransfer: 300_000_000,
      reductions: reductions as TransferTaxInput["reductions"],
    } as never),
    rates,
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const detail = (r: ReturnType<typeof run>) => r.redevelopmentDetail as any;

describe("G-7′ 입주권 × §97의3 — 인가전 분에만 특례", () => {
  const none = run([]);
  const with973 = run([RED_973]);

  it("대조군 — 특례 없이 인가전 2억 × 18% = 36,000,000 · 인가후 분 0", () => {
    expect(none.transferGain).toBe(550_000_000);
    expect(none.longTermHoldingDeduction).toBe(36_000_000);
    expect(detail(none).settlement.lthd).toBe(0);
  });

  it("R-7 🔴 장특 68,000,000 — 인가후 분(청산금 분기 3.5억)에 특례율을 씌우지 않는다 (종전 155,500,000)", () => {
    expect(with973.rental97LthdDetail?.isEligible).toBe(true);
    expect((with973.rental97LthdDetail as { rentalGainRatio?: number } | undefined)?.rentalGainRatio).toBe(0.5);
    expect(detail(with973).preApproval.lthd).toBe(68_000_000);
    expect(detail(with973).settlement.gain).toBe(350_000_000);
    expect(detail(with973).settlement.lthd).toBe(0);
    expect(detail(with973).settlement.lthdRate).toBe(0);
    expect(detail(with973).postApprovalExistingHouse.lthd).toBe(0);
    expect(with973.longTermHoldingDeduction).toBe(68_000_000);
  });

  it("계산 근거 step — 입주권은 인가 전 양도차익에만 적용한다고 적는다", () => {
    const step = with973.steps.find((s) => s.label === "장기보유특별공제 특례 — 장기일반민간임대주택 (조특법 §97의3①)");
    expect(step?.formula).toContain("관리처분계획 인가 전 양도차익에만 적용");
    expect(step?.formula).not.toContain("3분기에 각각 적용");
  });
});

describe("applyRental97LthdSpecial — subject 축 (단위)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branch = (gain: number, lthdRate: number) => ({ gain, lthdRate, lthd: 0 }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = (): any => ({
    preApproval: branch(1_000, 0.2), postApprovalExistingHouse: branch(0, 0), settlement: branch(2_000, 0),
    total: { gain: 3_000, lthd: 0, taxableIncome: 3_000 },
  });
  const special = { overrideRate: 0.7, rentalGainRatio: 1, rentalGainFraction: { num: 1, den: 1 } };

  it("right — 청산금 분기 그대로(0) · 인가전 1,000 × 70% = 700", () => {
    const r = applyRental97LthdSpecial(result(), special, "right");
    expect(r.preApproval.lthd).toBe(700);
    expect(r.settlement.lthd).toBe(0);
    expect(r.total.lthd).toBe(700);
  });
  it("apt — 세 분기 모두(완공 아파트 청산금납부분은 공제 대상) · 700 + 1,400", () => {
    const r = applyRental97LthdSpecial(result(), special, "apt");
    expect(r.settlement.lthd).toBe(1_400);
    expect(r.total.lthd).toBe(2_100);
  });
});
