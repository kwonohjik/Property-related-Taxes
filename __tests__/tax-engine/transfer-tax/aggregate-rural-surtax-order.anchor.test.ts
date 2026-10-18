/**
 * anchor: 다건 세액감면형 농어촌특별세 — 입력 순서만 바꿔 총 부담이 갈리지 않는다.
 * 계획서: docs/02-design/features/transfer-split-basic-deduction-units-and-order-rounding.plan.md §5 (②-1)
 *
 * 종전: 자산별 감면 안분의 잔액을 **입력 순서상 마지막** 자산이 흡수하고, 농특세를 그 자산별 몫마다 절사해 더했다.
 *   ⇒ 같은 신고를 순서만 바꿔 넣으면 농특세가 1원 갈렸다(§133 격자 644/11,232그룹 · 자경 혼합 34/288그룹).
 * 수정: 잔액은 propertyId 순 마지막 자산이 흡수하고, 농특세는 과세 대상 감면세액 합계에 한 번 곱한다
 *   (「농어촌특별세법」 §5①1호 — 과세표준은 감면세액 · 별지 제84호서식 「농어촌특별세 납부계산서」 한 줄).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTaxAggregate, type TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const T = "2024-06-01";

function expropriated(id: string, price: number, opts: { bond?: boolean; selfCultivated?: boolean } = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: D(T),
    transferPrice: price,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2010-06-01"),
    isNonBusinessLand: false,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    expenses: 0,
    reductions: [
      {
        type: "public_expropriation",
        cashCompensation: opts.bond ? 0 : price,
        bondCompensation: opts.bond ? price : 0,
        businessApprovalDate: D("2018-01-01"),
      },
    ],
    ...(opts.selfCultivated ? { isSelfCultivatedExpropriatedLand: true } : {}),
  } as TransferTaxItemInput;
}

const run = (properties: TransferTaxItemInput[]) =>
  calculateTransferTaxAggregate({ taxYear: 2024, annualBasicDeductionUsed: 0, properties } as never, rates);
const allocOf = (r: ReturnType<typeof run>) =>
  Object.fromEntries(r.properties.map((p) => [p.propertyId, p.reductionAggregated]));

describe("다건 세액감면형 농특세 — 입력 순서 무관 (②-1)", () => {
  it("R-1: 수용 현금 + 수용 채권 — 두 입력 순서 모두 농특세 = 감면 합계 2,054,448 × 20% = 410,889", () => {
    const A = expropriated("A", 320_000_000);
    const B = expropriated("B", 400_000_000, { bond: true });
    for (const order of [[A, B], [B, A]]) {
      const r = run(order);
      expect(r.reductionAmount).toBe(2_054_448);
      // 종전: A·B 순서면 48,339 + 362,549 = 410,888(자산별 절사 합), B·A 순서면 410,889
      expect(r.ruralSurtax).toBe(410_889);
      expect(r.totalTax).toBe(13_964_596);
    }
  });

  it("R-2: 직접 경작(비과세) A + 일반 수용 B — 잔액이 propertyId 순 마지막(B)에 붙어 두 순서가 같다", () => {
    const A = expropriated("A", 320_000_000, { selfCultivated: true });
    const B = expropriated("B", 500_000_000);
    for (const order of [[A, B], [B, A]]) {
      const r = run(order);
      expect(r.reductionAmount).toBe(3_930_200);
      expect(allocOf(r)).toEqual({ A: 357_290, B: 3_572_910 });
      // 과세 대상은 B 몫만 — floor(3,572,910 × 20%)
      expect(r.ruralSurtax).toBe(714_582);
      expect(r.totalTax).toBe(39_623_562);
    }
  });

  it("R-3: 산식 문구는 과세 대상 감면세액 합계를 보인다", () => {
    const r = run([expropriated("A", 320_000_000, { selfCultivated: true }), expropriated("B", 500_000_000)]);
    const step = r.steps.find((s) => s.label === "농어촌특별세 (감면세액 × 20%)");
    expect(step?.formula).toContain("과세 대상 감면세액 3,572,910 × 20% = 714,582");
  });
});
