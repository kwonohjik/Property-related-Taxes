/**
 * §98 시리즈 리뷰 1단계 그룹 E — 하이브리드 5년 후 안분 순서(US-12)와 표시(US-63·76·77·78·79·81) anchor.
 *
 * 법령 근거: 조특법 §98의6① 후단 «공제하는 금액이 과세대상소득금액을 초과하는 경우 그 초과금액은 없는 것» —
 *   5년간 발생분 × 감면율 = 공제액에 양도소득금액 한도를 건다(국세청 서면-2021-법규재산-8218, 법규과-1181).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import {
  buildIncomeDeductionReducibleFormula,
  type IncomeDeductionFormulaSource,
} from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { shouldShowFalseContractPriceNotice } from "@/lib/calc/false-contract-price-notice";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

function text(node: unknown): string {
  if (typeof node === "string") return node.replace(/\s+/g, " ");
  return renderToStaticMarkup(node as React.ReactElement)
    .replace(/<[^>]*>/g, " ")
    .replace(/&minus;/g, "−")
    .replace(/\s+/g, " ")
    .trim();
}

const HO_986 = {
  type: "unsold_98_6" as const,
  hoType986: "seller_rented" as const,
  stdPriceSumAtBase986: 550_000_000,
  floorAreaSqm986: 84.5,
  isUnsoldAfterCompletion986: true,
  isFirstContract986: true,
  isNotOccupiedAfterCompletion986: true,
  isNotRecontract986: true,
  sellerRented2Years986: true,
};

/** 법규과-1181 사실관계 — 취득 2011-07-01, 양도 2021-09-01, 기준시가 124/(5년시점)/144백만원 */
function calc986(stdAt5Years: number) {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 400_000_000,
      acquisitionPrice: 250_000_000,
      acquisitionDate: new Date("2011-07-01"),
      transferDate: new Date("2021-09-01"),
      householdHousingCount: 2,
      reductions: [{
        ...HO_986,
        standardPriceAtAcquisition986: 124_000_000,
        standardPriceAt5Years986: stdAt5Years,
        standardPriceAtTransfer986: 144_000_000,
      }],
    }),
    makeMockRates(),
  );
}

describe("US-12 — 5년간 발생분 × 감면율 → 양도소득금액 한도 순서", () => {
  it("법규과-1181 사례(비율 2.5): 발생분 300,000,000 × 50% = 150,000,000 → 양도소득금액 120,000,000까지 공제", () => {
    const r = calc986(174_000_000);
    const d = r.unsold986Detail!;
    expect(d.reducibleTransferIncome).toBe(120_000_000); // 수정 전 60,000,000
    expect(d.formulaSteps[0].value).toBe(300_000_000);
    expect(d.formulaSteps[1].formula).toContain("150,000,000");
    expect(d.formulaSteps[1].formula).toContain("초과금액은 없는 것");
    expect(r.totalTax).toBe(5_137_000); // 수정 전 12,373,000
  });

  it("비율 1.25: 150,000,000 × 50% = 75,000,000 (수정 전 클램프가 먼저 걸려 60,000,000)", () => {
    const r = calc986(149_000_000);
    expect(r.unsold986Detail!.reducibleTransferIncome).toBe(75_000_000);
  });

  it("비율 0.5: 한도에 걸리지 않아 30,000,000 그대로", () => {
    const r = calc986(134_000_000);
    expect(r.unsold986Detail!.reducibleTransferIncome).toBe(30_000_000);
  });
});

describe("US-79 — 1단계 산식이 부호 케이스를 구분한다", () => {
  it("분모 음수(pos_neg): 전액 + 부동산거래관리과-525", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 400_000_000,
        acquisitionPrice: 250_000_000,
        acquisitionDate: new Date("2011-07-01"),
        transferDate: new Date("2021-09-01"),
        householdHousingCount: 2,
        reductions: [{
          ...HO_986,
          standardPriceAtAcquisition986: 300_000_000,
          standardPriceAt5Years986: 350_000_000,
          standardPriceAtTransfer986: 250_000_000,
        }],
      }),
      makeMockRates(),
    );
    const f = r.unsold986Detail!.formulaSteps[0].formula!;
    expect(r.unsold986Detail!.signCase).toBe("pos_neg");
    expect(f).toContain("분모가 음수");
    expect(f).toContain("부동산거래관리과-525");
  });

  it("분자 음수(neg_pos): 0원 + 부동산거래관리과-136", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 400_000_000,
        acquisitionPrice: 250_000_000,
        acquisitionDate: new Date("2011-07-01"),
        transferDate: new Date("2021-09-01"),
        householdHousingCount: 2,
        reductions: [{
          ...HO_986,
          standardPriceAtAcquisition986: 300_000_000,
          standardPriceAt5Years986: 250_000_000,
          standardPriceAtTransfer986: 400_000_000,
        }],
      }),
      makeMockRates(),
    );
    const f = r.unsold986Detail!.formulaSteps[0].formula!;
    expect(r.unsold986Detail!.signCase).toBe("neg_pos");
    expect(f).toContain("분자가 음수");
    expect(f).toContain("부동산거래관리과-136");
  });
});

describe("US-63·US-76 — STEP 4.6 감면율 문구와 §98의6 5년 이내 세액감면", () => {
  it("§98의6 1호 5년 이내: STEP 4.6 문구가 50%(100% 아님)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2011-09-01"),
        transferDate: new Date("2014-01-01"),
        householdHousingCount: 2,
        reductions: [{
          ...HO_986,
          standardPriceAtAcquisition986: 200_000_000,
          standardPriceAt5Years986: 300_000_000,
          standardPriceAtTransfer986: 400_000_000,
        }],
      }),
      makeMockRates(),
    );
    const step = r.steps.find((s) => s.label.includes("세액감면 경로"));
    expect(step).toBeDefined();
    expect(step!.formula).toContain("양도소득세 50% 세액감면 적용");
    expect(step!.formula).not.toContain("100%");
    expect(r.reductionAmount).toBe(46_555_000);
  });
});

describe("US-77·US-78 — 3단계 「소득금액 감면대상」 산식", () => {
  const base: IncomeDeductionFormulaSource = {
    articleLabel: "§98의3",
    isWithin5Years: false,
    reducibleTransferIncome: 72_000_000,
    transferIncomeApplied: 240_000_000,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAt5Years: 300_000_000,
    standardPriceAtTransfer: 400_000_000,
    signCase: "all_positive",
  };

  it("US-78: 감면율 60% — 「5년간 발생분 120,000,000 × 60% = 72,000,000」 등식이 성립한다", () => {
    const t = text(buildIncomeDeductionReducibleFormula(
      { ...base, effectCategory: "income_deduction", isEligible: true, taxReductionRate: 0.6 },
      240_000_000,
    ));
    expect(t).toContain("5년간 발생분 120,000,000 × 60%");
    expect(t).toContain("72,000,000");
  });

  it("US-78: 감면율 100%는 종전 표기를 유지한다(율 항 없음)", () => {
    const t = text(buildIncomeDeductionReducibleFormula(
      { ...base, reducibleTransferIncome: 120_000_000, taxReductionRate: 1 },
      240_000_000,
    ));
    expect(t).not.toContain("%");
  });

  it("US-77: 5년 이내 세액감면(tax_amount) — 「전액 차감」이 아니라 세액감면 방식 안내", () => {
    const t = text(buildIncomeDeductionReducibleFormula(
      { ...base, isWithin5Years: true, reducibleTransferIncome: 0, effectCategory: "tax_amount", isEligible: true, taxReductionRate: 0.6 },
      282_000_000,
    ));
    expect(t).not.toContain("전액 차감");
    expect(t).toContain("세액감면 방식");
  });

  it("US-77: 특칙형·부적격 — 「5년 안분 결과 0」이 아니다", () => {
    const special = text(buildIncomeDeductionReducibleFormula(
      { articleLabel: "§98", isWithin5Years: false, reducibleTransferIncome: 0, effectCategory: "flat_rate_20", isEligible: true },
      100_000_000,
    ));
    expect(special).not.toContain("5년 안분 결과 0");
    expect(special).toContain("특칙");
    const inel = text(buildIncomeDeductionReducibleFormula(
      { articleLabel: "§98의3", isWithin5Years: false, reducibleTransferIncome: 0, effectCategory: "income_deduction", isEligible: false },
      100_000_000,
    ));
    expect(inel).not.toContain("5년 안분 결과 0");
    expect(inel).toContain("해당 없음");
  });
});

describe("US-81 — 단기보유 세율 배제 특칙을 산출세액 단계에 밝힌다", () => {
  it("§98의3 5년 이내·보유 1년 6개월: 산출세액 단계에 §104①1호 세율 적용 사유", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2023-01-15"),
        transferDate: new Date("2024-07-15"),
        householdHousingCount: 2,
        reductions: [{
          type: "unsold_98_3" as const,
          residencyType983: "resident" as const,
          houseType983: "purchased" as const,
          contractDate983: new Date("2009-06-15"),
          // 취득일이 2010.2.11. 이후라 계약금 전액 완납일이 필요하다(#3029 US-21)
          downPaymentCompletedDate983: new Date("2009-06-15"),
          isOutsideSeoulNotDesignated983: true,
          isOverconcentration983: false,
          isUnsoldConfirmed983: true,
          isFirstContract983: true,
          isNotOccupiedAtContract983: true,
          isNotRecontract983: true,
          standardPriceAtAcquisition983: 200_000_000,
          standardPriceAt5Years983: 300_000_000,
          standardPriceAtTransfer983: 400_000_000,
        }],
      }),
      makeMockRates(),
    );
    expect(r.calculatedTax).toBe(93_110_000);
    const step = r.steps.find((s) => s.label.includes("산출세액"));
    expect(step?.formula).toContain("단기보유 세율 대신 기본세율 적용 (소득세법 §104 ①)");
  });
});

describe("US-68 — §91② 범위 밖 고지: 5년 후 소득금액 차감형 감면도 감면으로 본다(소득세법 §90②)", () => {
  it("reductionAmount 0이어도 차감 양도소득금액이 있으면 고지한다", () => {
    expect(shouldShowFalseContractPriceNotice({ transferDate: "2020-03-11", reductionAmount: 0, incomeDeductionReducible: 175_000_000 })).toBe(true);
  });
  it("감면 없음(대조군)·시행일(2011-07-01) 이전은 고지하지 않는다", () => {
    expect(shouldShowFalseContractPriceNotice({ transferDate: "2020-03-11", reductionAmount: 0, incomeDeductionReducible: 0 })).toBe(false);
    expect(shouldShowFalseContractPriceNotice({ transferDate: "2011-06-30", incomeDeductionReducible: 1 })).toBe(false);
  });
  it("실제 엔진: §98의6 5년 후 결과에서 차감 양도소득금액이 감면세액 0과 함께 나온다", () => {
    const r = calc986(174_000_000);
    expect(r.reductionAmount).toBe(0);
    expect(shouldShowFalseContractPriceNotice({
      transferDate: "2021-09-01",
      reductionAmount: r.reductionAmount,
      incomeDeductionReducible: r.unsold986Detail!.reducibleTransferIncome,
    })).toBe(true);
  });
});
