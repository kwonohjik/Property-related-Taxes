/**
 * anchor — §98의2 장특 표2 연혁(US-02) · §97의3 병용 시 큰 쪽 택일(US-16 · Q-2 (a)) ·
 * STEP 4.05 `>= 3` 경계·상한(US-54) · 매매계약일 현재 입주 사실 3-state(US-15 · Q-1 (A)) · 1세대1주택 표2 유지 문구(US-55)
 *
 * 법령: 조특법 §98의2①1호 「양도차익에 소득세법 제95조제2항 표2에 따른 보유기간별 공제율을 곱하여 계산한 금액」.
 * 소득세법 §95② 표2는 ~2020.12.31. 양도분이 보유 3년 24% ~ 10년 이상 80%(연 8%) 단일 열이고,
 * 2021.1.1. 양도분부터 보유 열 연 4%·40%다(시행본 MST 109450·115237·177202·212777 / 224837).
 * 수치는 수정 전 실측 → 수정 후 실측(mock 2024 누진표, 양도가 8억·취득가 5억, 2주택, 취득 2009-06-15).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { evaluateUnsold982 } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p4";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const D = (s: string) => new Date(s);
const R982 = {
  type: "unsold_98_2" as const,
  isNonCapitalUnsold982: true,
  isFirstOrFcfsContract982: true,
  occupiedAtContract982: "no" as const,
};
const R973 = {
  type: "rental_97_3",
  registrationDate: D("2014-01-01"),
  rentalStartDate: D("2014-01-01"),
  isTaxRegistered: true,
  taxRegistrationDate: D("2014-01-01"),
  isNationalHousingScale: true,
  officialPriceAtStart: 200_000_000,
  region: "non_capital",
  isPrivateConstructionRental: false,
  rentalContinuesToTransfer: true,
  rentIncreaseViolated: false,
};

function run(transferDate: string, over: Record<string, unknown> = {}): Any {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: D("2009-06-15"),
      transferDate: D(transferDate),
      householdHousingCount: 2,
      reductions: [R982],
      ...over,
    } as Any),
    makeMockRates(),
  );
}

describe("US-02 — 양도일 시행 표2 (전: 항상 연 4%·40%)", () => {
  it("2016-08-01 보유 7년: 56%·장특 168,000,000·총부담 32,873,500 (전 28%·84,000,000·67,309,000)", () => {
    const r = run("2016-08-01");
    expect(r.longTermHoldingRate).toBeCloseTo(0.56, 10);
    expect(r.longTermHoldingDeduction).toBe(168_000_000);
    expect(r.totalTax).toBe(32_873_500);
  });
  it("경계 2020-12-31(보유 11년 80%) vs 2021-01-01(40%)", () => {
    const a = run("2020-12-31");
    expect(a.longTermHoldingRate).toBeCloseTo(0.8, 10);
    expect(a.longTermHoldingDeduction).toBe(240_000_000);
    expect(a.totalTax).toBe(8_844_000); // 전 52,261,000
    const b = run("2021-01-01");
    expect(b.longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(b.longTermHoldingDeduction).toBe(120_000_000);
    expect(b.totalTax).toBe(52_261_000);
  });
  it("US-54 `>= 3` 경계 — 보유 3년 직전 0% / 3년 도달 24%(취득 2008-11-03, 엔진 보유기간 기산 기준 양도 2011-11-01 / 2011-11-02)", () => {
    const under = run("2011-11-01", { acquisitionDate: D("2008-11-03") });
    expect(under.longTermHoldingDeduction).toBe(0);
    const exact = run("2011-11-02", { acquisitionDate: D("2008-11-03") });
    expect(exact.longTermHoldingRate).toBeCloseTo(0.24, 10);
    expect(exact.longTermHoldingDeduction).toBe(72_000_000);
  });
  it("US-54 상한 — 보유 13년: 2020 이전 80%(연 8% 상한) / 2021 이후 40%(연 4% 상한)", () => {
    expect(run("2022-08-01").longTermHoldingRate).toBeCloseTo(0.4, 10);
    expect(run("2020-06-01", { acquisitionDate: D("2008-11-03") }).longTermHoldingRate).toBeCloseTo(0.8, 10);
  });
});

describe("US-55 — 1세대1주택 표2(보유+거주) 유지 시 문구", () => {
  it("거주 10년·양도가 20억·2024-07-15: 공제율 80% 유지 · STEP 4.6·카드가 「특칙 적용」을 단정하지 않는다", () => {
    const r = run("2024-07-15", {
      transferPrice: 2_000_000_000,
      acquisitionPrice: 500_000_000,
      householdHousingCount: 1,
      isOneHousehold: true,
      residencePeriodMonths: 120,
    });
    expect(r.longTermHoldingRate).toBeCloseTo(0.8, 10);
    expect(r.unsold982Detail?.lthd982Echo?.outcome).toBe("one_house_table2_kept");
    const step = r.steps.find((s: Any) => String(s.label).includes("§98의2"));
    expect(step.label).toContain("1세대1주택 표2(보유+거주) 유지");
    expect(step.label).not.toContain("특칙 적용");
    expect(r.unsold982Detail.formulaSteps[0].formula).not.toContain("연 4%, 최대 40%");
  });
  it("2주택 특칙 적용 문구는 엔진 공제율을 따른다 (2016: 56%)", () => {
    const r = run("2016-08-01");
    expect(r.unsold982Detail.lthd982Echo.outcome).toBe("table2_holding");
    expect(r.unsold982Detail.formulaSteps[0].formula).toContain("56%");
  });
});

describe("US-16 · Q-2 (a) — §97의3과 §98의2 병용: 큰 쪽 하나", () => {
  const base = {
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: D("2010-06-01"),
    standardPriceAtAcquisition: 150_000_000,
    standardPriceAtTransfer: 400_000_000,
  };
  it("둘 다 적격: 장특 308,000,000·총부담 57,277,000 (전 200,000,000·102,421,000) — §97의3만 선택과 같다", () => {
    const both = run("2024-06-03", { ...base, reductions: [R982, R973] });
    const only = run("2024-06-03", { ...base, reductions: [R973] });
    expect(both.longTermHoldingDeduction).toBe(308_000_000);
    expect(both.totalTax).toBe(57_277_000);
    expect(both.totalTax).toBe(only.totalTax);
    // 결과 카드(§97의3 echo)와 엔진 공제액이 같다
    expect(both.rental97LthdDetail.deductionApplied).toBe(both.longTermHoldingDeduction);
    expect(both.unsold982Detail.lthd982Echo.outcome).toBe("rental97_kept");
    // 적용하지 않은 조문의 장특액 고지 (유리·불리 표현 없음)
    const notice = (both.warnings as string[]).find((w) => w.includes("§98의2 표2 보유기간별 공제율 장기보유특별공제"));
    expect(notice).toContain("200,000,000원");
    expect(notice).toContain("308,000,000원");
    expect(notice).not.toMatch(/유리|불리|절감/);
  });
  it("§98의2 단독은 기본세율·표2 40% 그대로 (총부담 102,421,000)", () => {
    const only = run("2024-06-03", { ...base });
    expect(only.longTermHoldingDeduction).toBe(200_000_000);
    expect(only.totalTax).toBe(102_421_000);
  });
  it("임대분 비율이 낮아 §98의2 표2가 더 크면 §98의2를 쓰고 §97의3 카드는 엔진 값과 맞춘다", () => {
    const low = run("2024-06-03", {
      ...base,
      reductions: [R982, { ...R973, officialPriceAtStart: 380_000_000 }],
    });
    const only973 = run("2024-06-03", { ...base, reductions: [{ ...R973, officialPriceAtStart: 380_000_000 }] });
    const d973 = only973.longTermHoldingDeduction;
    expect(low.longTermHoldingDeduction).toBe(Math.max(d973, 200_000_000));
    if (d973 < 200_000_000) {
      expect(low.rental97LthdDetail.specialApplied).toBe(false);
      expect(low.rental97LthdDetail.replacedBy982Deduction).toBe(200_000_000);
    }
  });
});

describe("US-15 · Q-1 (A) — 매매계약일 현재 입주 사실 3-state", () => {
  const base = {
    transferDate: D("2024-06-03"),
    acquisitionDate: D("2010-06-01"),
    isNonCapitalUnsold: true,
    isFirstOrFcfsContract: true,
  };
  it("없음만 적격 · 있음·모름·미입력은 불성립 (코드 OCCUPIED_AT_CONTRACT)", () => {
    expect(evaluateUnsold982({ ...base, occupiedAtContract: "no" }).isEligible).toBe(true);
    for (const v of ["yes", "unknown", undefined] as const) {
      const r = evaluateUnsold982({ ...base, occupiedAtContract: v });
      expect(r.isEligible).toBe(false);
      expect(r.ineligibleReasons.map((x) => x.code)).toContain("OCCUPIED_AT_CONTRACT");
    }
  });
  it("엔진 세액: 없음 52,261,000 / 있음 67,309,000 (+15,048,000)", () => {
    const over = { transferPrice: 800_000_000, acquisitionPrice: 500_000_000, acquisitionDate: D("2010-06-01") };
    expect(run("2024-06-03", over).totalTax).toBe(52_261_000);
    const yes = run("2024-06-03", { ...over, reductions: [{ ...R982, occupiedAtContract982: "yes" }] });
    expect(yes.totalTax).toBe(67_309_000);
    expect(yes.unsold982Detail.isEligible).toBe(false);
  });
  it("⑫ Zod가 필드를 보존하고(침묵 strip 없음) 잘못된 값을 거부한다", () => {
    const ok = reductionSchema.safeParse({ ...R982, occupiedAtContract982: "unknown" });
    expect(ok.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((ok as any).data.occupiedAtContract982).toBe("unknown");
    expect(reductionSchema.safeParse({ ...R982, occupiedAtContract982: "maybe" }).success).toBe(false);
  });
  it("령 ①2호 괄호·분양전환 안내가 부적격 메시지에 있다", () => {
    const r = evaluateUnsold982({ ...base, isFirstOrFcfsContract: true, isNonCapitalUnsold: false, occupiedAtContract: "no" });
    const m = r.ineligibleReasons.map((x) => x.message).join(" ");
    expect(m).toContain("입주자모집공고에 따른 입주자의 계약일이 지나지 아니한 주택에 한정");
    expect(m).toContain("분양전환");
  });
});
