/**
 * §154⑩ 단독 경로(직전거주주택보유주택 · 공동보유 장기임대주택 0호) × §154① 단서 — 엔진 anchor
 * (사용자 결정 2026-10-26 V-R3 (a) · 계획서 `docs/00-pm/rental-residence-holding-proviso.plan.md` §10).
 *
 * §154⑩은 「1주택을 보유한 것으로 보아 제1항을 적용」하므로 §154① 단서가 문언대로 걸린다 — 1호~3호는 보유 2년과
 * 2019.2.12 전 취득분의 §154① 원칙 거주 2년을, 5호·삭제 전 4호는 그 거주만 푼다. 신규정 거주(§155⑳1호 괄호 준용)는 풀지 않는다.
 *
 * 시료: 8억(취득가 6억) · 세대 1주택 · 2018-06-01 취득·임대 등록 · 직전거주주택 2019-03-01 양도 · 2020-03-01 양도(보유 1년 9개월) ·
 * 거주 13개월 · §161 기준시가 3억/3.5억/4억. 「종전」 = 이 수정 전 엔진 실측(master 8553971ff, mock 세율).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { judgeRentalHousingEligibility } from "@/lib/tax-engine/transfer-tax-rental-housing-step";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TAXED = 55_110_000; // 전액 과세(종전 — 단서가 있어도 보유 2년 미충족)
const APPORTIONED = 18_685_000; // §161① 안분 — 보유 2년 이상 대조 시료와 같은 값

type Proviso = NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>;
const UNAVOIDABLE: Proviso = { reason: "unavoidable" };
const EXPROPRIATION: Proviso = { reason: "expropriation", businessApprovalDate: D("2019-10-01"), expropriationDate: D("2020-03-01") };
const PRE_DESIGNATION: Proviso = { reason: "pre_designation_contract" };

function input(o: Partial<TransferTaxInput> = {}, rh: Record<string, unknown> = {}): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 800_000_000,
    acquisitionPrice: 600_000_000,
    acquisitionDate: D("2018-06-01"),
    transferDate: D("2020-03-01"),
    residencePeriodMonths: 13,
    householdHousingCount: 1,
    isOneHousehold: true,
    rentalHousingException: {
      applyException: true,
      scenario: "B",
      rentalUnits: [],
      priorResidenceTransferDate: D("2019-03-01"),
      wasRegisteredRentalOrChildcare: true,
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtPriorTransfer: 350_000_000,
      standardPriceAtTransfer: 400_000_000,
      priorRentalExemptionHistory: "none",
      ...rh,
    } as TransferTaxInput["rentalHousingException"],
    ...o,
  });
}

const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(o), rates);
const runRh = (o: Partial<TransferTaxInput>, rh: Record<string, unknown>) => calculateTransferTax(input(o, rh), rates);
const NOTICE = "§154⑩ 경로에 §154① 단서를 적용한 정면 해석례가 없어 확인이 필요합니다";
const formulaOf = (r: ReturnType<typeof run>) => r.steps.find((s) => s.label === "장기임대주택 보유자 거주주택 비과세 특례")?.formula ?? "";

describe("§154⑩ 단독 경로 × §154① 단서 — 보유 2년(V-R3 (a))", () => {
  it("PP-1 ★ 3호 부득이 → 보유 2년을 단서가 풀어 §161 안분(종전 55,110,000 전액 과세)", () => {
    const r = run({ oneHouseExemptionProviso: UNAVOIDABLE });
    expect(r.determinedTax).toBe(APPORTIONED);
    expect(formulaOf(r)).toBe("§154⑩ + §161 — RH-B1 시나리오 적용 · §154① 단서 3호 부득이");
    expect(r.warnings?.some((w) => w.startsWith("거주주택 보유기간이 2년 미만이지만 §154① 단서 3호 부득이 사유로") && w.includes(NOTICE))).toBe(true);
  });

  it("PP-2 2호가목 수용 → 같은 안분 · 근거 「2호가 수용」", () => {
    const r = run({ oneHouseExemptionProviso: EXPROPRIATION });
    expect(r.determinedTax).toBe(APPORTIONED);
    expect(formulaOf(r)).toContain("§154① 단서 2호가 수용");
  });

  it("PP-3 부정 짝 — 단서 없음·5호(거주만 면제)는 보유 2년 미충족 전액 과세 그대로", () => {
    for (const p of [undefined, PRE_DESIGNATION]) {
      const r = run({ oneHouseExemptionProviso: p });
      expect(r.determinedTax).toBe(TAXED);
      expect(r.steps.some((s) => s.formula.includes("거주주택 보유기간 2년 미충족 (현재: 1년, 소령 §154⑤·법 §95④)"))).toBe(true);
    }
  });

  it("PP-4 단서 불성립(3호인데 거주 1년 미만) → 전액 과세", () => {
    expect(run({ oneHouseExemptionProviso: UNAVOIDABLE, residencePeriodMonths: 11 }).determinedTax).toBe(TAXED);
  });

  it("PP-5 대조 — 보유 2년 이상이면 단서가 결론을 가르지 않아 근거 표기·고지가 없다", () => {
    const r = run({ oneHouseExemptionProviso: UNAVOIDABLE, transferDate: D("2020-07-01") });
    expect(r.determinedTax).toBe(APPORTIONED);
    expect(formulaOf(r)).toBe("§154⑩ + §161 — RH-B1 시나리오 적용");
    expect(r.warnings?.some((w) => w.includes(NOTICE)) ?? false).toBe(false);
  });
});

describe("§154⑩ 단독 경로 × §154① 단서 — 종전규정 거주 2년(조정대상지역 취득)", () => {
  const regulated = { wasRegulatedAtAcquisition: true };

  it("PP-6 ★ 3호 → 보유·거주 둘 다 풀어 안분 · 고지는 「보유기간·거주기간」(종전 55,110,000)", () => {
    const r = run({ ...regulated, oneHouseExemptionProviso: UNAVOIDABLE });
    expect(r.determinedTax).toBe(APPORTIONED);
    expect(r.warnings?.some((w) => w.startsWith("거주주택 보유기간·거주기간이 2년 미만이지만 §154① 단서 3호 부득이"))).toBe(true);
  });

  it("PP-7 5호 — 보유 2년 이상이면 거주만 풀어 안분(종전 거주 2년 미충족 과세)", () => {
    const o = { ...regulated, transferDate: D("2020-07-01") };
    expect(run(o).determinedTax).not.toBe(APPORTIONED);
    const r = run({ ...o, oneHouseExemptionProviso: PRE_DESIGNATION });
    expect(r.determinedTax).toBe(APPORTIONED);
    expect(formulaOf(r)).toContain("§154① 단서 5호 공고전계약");
    expect(r.warnings?.some((w) => w.startsWith("거주주택 거주기간이 2년 미만이지만"))).toBe(true);
  });

  it("PP-8 5호 + 보유 2년 미만 → 보유는 못 풀어 과세 · 남은 사유는 보유뿐", () => {
    const r = run({ ...regulated, oneHouseExemptionProviso: PRE_DESIGNATION });
    expect(r.determinedTax).toBe(TAXED);
    const unmet = r.steps.find((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가")?.formula ?? "";
    expect(unmet).toBe("거주주택 보유기간 2년 미충족 (현재: 1년, 소령 §154⑤·법 §95④)");
    // 결론을 가르지 못한 단서는 고지하지 않는다
    expect(r.steps.some((s) => s.formula.includes(NOTICE))).toBe(false);
  });

  it("PP-12 경과조치 선언(사유 미입력) 고지 — 종전규정이면 단서가 조정대상지역 거주를 풀어 통과하므로 고지한다", () => {
    const o = {
      ...regulated,
      acquisitionDate: D("2019-06-01"),
      transferDate: D("2021-07-01"),
      residencePeriodMonths: 13,
    };
    const rhOver = { priorResidenceTransferDate: D("2020-01-01"), postRegistrationResidenceMonths: 13, residenceTransitionUnderAddendum: true, residenceTransitionBasis: "" };
    const confirm = (r: ReturnType<typeof run>) =>
      r.steps.find((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 확인 필요")?.formula ?? "";
    expect(confirm(runRh({ ...o, oneHouseExemptionProviso: UNAVOIDABLE }, rhOver))).toContain("2019.2.12 부칙 경과조치");
    expect(confirm(runRh(o, rhOver))).not.toContain("2019.2.12 부칙 경과조치");
  });
});

describe("§154⑩ 단독 경로 × §154① 단서 — 범위 밖", () => {
  it("PP-9 신규정(2019.2.12 이후 취득) — 등록 이후 거주 2년(⑳1호 괄호 준용)은 단서로 풀지 않는다", () => {
    const r = runRh(
      { acquisitionDate: D("2019-06-01"), transferDate: D("2021-03-01"), residencePeriodMonths: 14, oneHouseExemptionProviso: UNAVOIDABLE },
      { priorResidenceTransferDate: D("2020-01-01"), postRegistrationResidenceMonths: 14 },
    );
    expect(r.determinedTax).toBe(TAXED);
    const unmet = r.steps.find((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가")?.formula ?? "";
    expect(unmet).toBe("거주주택 거주기간(등록일 이후) 2년 미충족 (현재: 1년 2개월, 소령 §155⑳1호 괄호 준용)");
  });

  it("PP-10 ⑳ 경로(임대주택 1호 이상 B)는 이 맥락을 쓰지 않는다 — 판정 맥락 provisoWaiver 없음", () => {
    const unit = {
      businessRegistrationDate: D("2018-06-01"), rentalRegistrationDate: D("2018-06-01"), rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const, isApartment: false, region: "non-metro" as const, isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000, hasMinimum2Units: false, rentalMonths: 96, rentalAutoTermination: false, requirementsConfirmed: true,
    };
    const j = judgeRentalHousingEligibility(input({ householdHousingCount: 2, oneHouseExemptionProviso: UNAVOIDABLE }, { rentalUnits: [unit], postRegistrationResidenceMonths: 13 }));
    expect(j?.provisoLabel).toBeUndefined();
  });
});

describe("§154⑩ 단독 경로 × §154① 단서 — 판정 메뉴(같은 판정 맥락)", () => {
  it("PP-11 판정이 통과하고 근거 표기·확인 필요 고지를 싣는다 · 단서 없음은 불통과", () => {
    const j = judgeRentalHousingEligibility(input({ oneHouseExemptionProviso: UNAVOIDABLE }));
    expect(j?.passed).toBe(true);
    expect(j?.provisoLabel).toBe("§154① 단서 3호 부득이");
    expect(j?.notices?.some((n) => n.includes(NOTICE))).toBe(true);
    expect(judgeRentalHousingEligibility(input())?.passed).toBe(false);
  });
});
