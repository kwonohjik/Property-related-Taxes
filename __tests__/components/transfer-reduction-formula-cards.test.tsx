/**
 * 감면 결과 카드 — 산출근거 산식 표시 anchor (PR-1 · D-9·D-10·D-11)
 *
 * 배경: §99의2 등 소득금액차감 조문은 값이 대입된 산식을 이미 보여주는데,
 *   §97 계열(`Rental97DetailCard`)은 **결과값만 나열**하고 산식이 없었다.
 *   §97 구 방식·§99 구 방식도 값이 대입되지 않았다.
 *
 * ⚠️ 이 표시 경로에는 착수 시점 기준 **안전망이 0건**이었다(`Rental97DetailCard`를
 *   참조하는 테스트 전무 — grep 실측). 그래서 신규 anchor를 필수로 둔다.
 *
 * 배선까지 함께 고정하기 위해 카드를 직접 렌더하지 않고 `ReductionDetailCards`를 경유한다
 * — `calculatedTax` prop 전달 누락이 곧 산식 오류이기 때문이다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";

afterEach(cleanup);

/** 산식 문자열은 공백/줄바꿈이 섞여 렌더되므로 정규화 후 비교한다. */
function bodyText(): string {
  return document.body.textContent?.replace(/\s+/g, " ") ?? "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCards(result: any, calculatedTax = 10_000_000) {
  return render(
    <ReductionDetailCards
      result={result}
      calculatedTax={calculatedTax}
      taxBase={50_000_000}
      longTermHoldingDeduction={7_000_000}
    />,
  );
}

describe("D-9 §97 계열 — 세액감면형 산출근거", () => {
  const base = {
    id: "rental_97_main" as const,
    isEligible: true as const,
    legalBasis: "조특법 §97",
    effectCategory: "tax_amount" as const,
    reductionRate: 0.5,
    isFullExemption: false,
  };

  it("안분 없음(비율 1) — 「산출세액 × 감면율」에 값이 대입된다", () => {
    renderCards({
      rental97TaxDetail: { ...base, rentalGainRatio: 1, reductionAmount: 5_000_000 },
    });
    expect(screen.getByText("감면세액 산출근거")).toBeTruthy();
    expect(bodyText()).toContain("감면세액 = 산출세액 × 감면율");
    expect(bodyText()).toContain("10,000,000 × 50% = 5,000,000");
  });

  it("임대기간 안분(비율 <1) — 비율 항이 산식에 들어간다", () => {
    renderCards({
      rental97TaxDetail: { ...base, rentalGainRatio: 0.8, reductionAmount: 4_000_000 },
    });
    expect(bodyText()).toContain("감면세액 = 산출세액 × 임대기간 분 비율 × 감면율");
    expect(bodyText()).toContain("10,000,000 × 80% × 50% = 4,000,000");
  });

  it("🔴 구별력 — 산출세액이 다르면 산식 값도 달라진다 (prop 배선 고정)", () => {
    renderCards(
      { rental97TaxDetail: { ...base, rentalGainRatio: 1, reductionAmount: 1_000_000 } },
      2_000_000,
    );
    expect(bodyText()).toContain("2,000,000 × 50% = 1,000,000");
  });
});

describe("D-9 §97의3·§97의4 — 장기보유특별공제 특례 산출근거", () => {
  const lthdBase = {
    id: "rental_97_3" as const,
    isEligible: true as const,
    legalBasis: "조특법 §97의3",
    effectCategory: "long_term_holding_special" as const,
    overrideRate: 0.7,
    eligibleRentalYears: 10,
  };

  it("전부 임대분(비율 1) — 「양도차익 × 특례 공제율」", () => {
    renderCards({
      rental97LthdDetail: {
        ...lthdBase,
        rentalGainRatio: 1,
        baseLthdRate: 0.24,
        gainApplied: 100_000_000,
        rentalGainApplied: 100_000_000,
        nonRentalGainApplied: 0,
        deductionApplied: 70_000_000,
      },
    });
    expect(screen.getByText("장기보유특별공제 산출근거")).toBeTruthy();
    expect(bodyText()).toContain("장기보유특별공제 = 양도차익 × 특례 공제율");
    expect(bodyText()).toContain("100,000,000 × 70% = 70,000,000");
  });

  it("일부 임대분(비율 <1) — 임대분·비임대분 2항 산식", () => {
    renderCards({
      rental97LthdDetail: {
        ...lthdBase,
        rentalGainRatio: 0.6,
        baseLthdRate: 0.24,
        gainApplied: 100_000_000,
        rentalGainApplied: 60_000_000,
        nonRentalGainApplied: 40_000_000,
        deductionApplied: 51_600_000,
      },
    });
    const t = bodyText();
    expect(t).toContain("임대기간 분 양도차익 × 특례 공제율 + 비임대 분 양도차익 × 일반 공제율");
    expect(t).toContain("100,000,000 × 안분비율 60% = 60,000,000");
    expect(t).toContain("60,000,000 × 70% + 40,000,000 × 24% = 51,600,000");
  });

  it("§97의4 추가공제 — 「양도차익 × (일반율 + 추가율)」", () => {
    renderCards({
      rental97LthdDetail: {
        id: "rental_97_4",
        isEligible: true,
        legalBasis: "조특법 §97의4",
        effectCategory: "long_term_holding_additional",
        additionalRate: 0.1,
        rentalGainRatio: 1,
        eligibleRentalYears: 8,
        baseLthdRate: 0.24,
        gainApplied: 100_000_000,
        deductionApplied: 34_000_000,
      },
    });
    expect(bodyText()).toContain("100,000,000 × (24% + 10%) = 34,000,000");
  });

  it("🔴 echo 없는 구 이력 — 산식 블록을 렌더하지 않는다 (graceful fallback)", () => {
    renderCards({
      rental97LthdDetail: { ...lthdBase, rentalGainRatio: 1 }, // echo 필드 전무
    });
    expect(screen.queryByText("장기보유특별공제 산출근거")).toBeNull();
    // 기존 값 나열은 그대로 남는다
    expect(bodyText()).toContain("특례 장기보유특별공제율");
  });
});

describe("D-10 §97 구 방식 — 감면세액 산출근거", () => {
  it("「산출세액 × 감면율」에 값이 대입된다", () => {
    renderCards({
      rentalReductionDetail: {
        isEligible: true,
        ineligibleReasons: [],
        reductionType: "public_construction",
        applicableLawVersion: "pre_2018_09_14",
        mandatoryPeriodYears: 5,
        effectiveRentalYears: 7,
        reductionRate: 0.5,
        reductionAmount: 5_000_000,
        specialLongTermDeductionRate: 0,
        isLimitApplied: false,
        annualLimit: 100_000_000,
        rentIncreaseValidation: { isAllValid: true, violations: [] },
        warnings: [],
      },
    });
    expect(screen.getByText("감면세액 산출근거")).toBeTruthy();
    expect(bodyText()).toContain("감면세액 = 산출세액 × 감면율");
    expect(bodyText()).toContain("10,000,000 × 50% = 5,000,000");
  });
});

describe("D-11 §99 구 방식 — 일수 안분 산출근거", () => {
  const base = {
    isEligible: true,
    ineligibleReasons: [],
    matchedArticleCode: "99-1",
    matchedArticle: "§99 ①",
    reductionScope: "capital_gain",
    reductionRate: 1,
    reductionAmount: 0,
    isWithinFiveYearWindow: false,
    isExcludedFromHouseCount: false,
    isExcludedFromMultiHouseSurcharge: false,
    warnings: [],
  };

  it("echo가 있으면 일수 산식에 값이 대입된다", () => {
    renderCards({
      newHousingReductionDetail: {
        ...base,
        reducibleGain: 50_000_000,
        fiveYearRatio: 0.5,
        totalCapitalGainApplied: 100_000_000,
        reductionDaysApplied: 1_826,
        totalDaysApplied: 3_652,
      },
    });
    const t = bodyText();
    expect(t).toContain("감면대상 양도차익 = 전체 양도차익 × 감면대상 보유일수 ÷ 전체 보유일수");
    expect(t).toContain("100,000,000 × 1,826일 ÷ 3,652일 = 50,000,000");
  });

  it("🔴 echo 없는 구 이력 — 종전 비율 표기로 fallback한다", () => {
    renderCards({
      newHousingReductionDetail: { ...base, reducibleGain: 50_000_000, fiveYearRatio: 0.5 },
    });
    const t = bodyText();
    expect(t).toContain("5년 이내 취득분 안분 비율");
    expect(t).not.toContain("일 ÷");
  });
});

describe("D-8 적용 불가 — 사유 표시 (PR-2)", () => {
  it("§77 공익수용이 적용 불가여도 카드가 뜨고 사유가 보인다", () => {
    renderCards({
      publicExpropriationDetail: {
        isEligible: false,
        notEligibleReason:
          "사업인정고시일부터 소급하여 2년 이전에 취득한 토지등이 아닙니다 (조특법 §77①).",
        reductionAmount: 0,
        rateSetApplied: "current_2018",
        // breakdown은 적용 불가 분기에서 참조되지 않는다
      },
    });
    expect(bodyText()).toContain("공익사업 수용 감면 (조특법 §77) — 적용 불가");
    expect(bodyText()).toContain("소급하여 2년 이전에 취득한 토지등이 아닙니다");
  });

  it("🔴 구별력 — 감면 미입력(detail 부재)이면 카드가 뜨지 않는다", () => {
    const { container } = renderCards({});
    expect(container.innerHTML).toBe("");
  });

  it("적용 가능하면 종전대로 산출근거 카드가 뜬다 (회귀 방지)", () => {
    renderCards({
      publicExpropriationDetail: {
        isEligible: true,
        rateSetApplied: "current_2018",
        reductionAmount: 1_000_000,
        rawReductionAmount: 1_000_000,
        weightedRate: 0.1,
        useLegacyRates: false,
        cappedByAnnualLimit: false,
        appliedAnnualLimit: 100_000_000,
        legalBasis: "조세특례제한법 §77",
        warnings: [],
        breakdown: {
          cashRate: 0.1,
          bondRate: 0,
          cashAmount: 100_000_000,
          bondAmount: 0,
          cashIncome: 10_000_000,
          bondIncome: 0,
          basicDeductionOnCash: 2_500_000,
          basicDeductionOnBond: 0,
          cashReduction: 1_000_000,
          bondReduction: 0,
          reducibleIncome: 10_000_000,
        },
      },
    });
    expect(bodyText()).toContain("공익사업 수용 감면 상세 (조특법 §77)");
    expect(bodyText()).not.toContain("적용 불가");
  });
});

describe("D-5 5년 내 세액감면 경로 — 감면세액 산출근거", () => {
  const within5y = {
    id: "unsold_99_2" as const,
    isEligible: true,
    ineligibleReasons: [],
    isWithin5Years: true,
    effectCategory: "tax_amount" as const,
    taxReductionRate: 1,
    reductionAmount: 86_270_000,
    reducibleTransferIncome: 0,
    fiveYearRatio: 1,
    signCase: "within_5_years" as const,
    formulaSteps: [
      {
        label: "취득일부터 5년 이내 양도 — 양도소득세 100% 세액감면",
        value: 0,
        formula: "조특법 §99의2 — 양도소득세의 100분의 100에 상당하는 세액을 감면 (감면세액 단계 적용)",
      },
    ],
    taxReductionForRuralSurtax: 0,
    ruralSurtax: 0,
    ruralSurtaxExempt: false,
    legalBasis: "조특법 §99의2",
  };

  it("「산출세액 × 감면율 = 감면세액」에 값이 대입된다", () => {
    renderCards({ unsold992Detail: within5y }, 86_270_000);
    expect(screen.getByText("감면세액 산출근거")).toBeTruthy();
    expect(bodyText()).toContain("감면세액 = 산출세액 × 감면율");
    expect(bodyText()).toContain("86,270,000 × 100% = 86,270,000");
  });

  it("🔴 구별력 — 산출세액 prop이 산식에 실제로 쓰인다", () => {
    renderCards(
      { unsold992Detail: { ...within5y, taxReductionRate: 0.5, reductionAmount: 1_000_000 } },
      2_000_000,
    );
    expect(bodyText()).toContain("2,000,000 × 50% = 1,000,000");
  });

  it("🔴 소득금액차감 경로에는 이 블록이 없다 (경로 구분)", () => {
    renderCards({
      unsold992Detail: {
        ...within5y,
        isWithin5Years: false,
        effectCategory: "income_deduction",
        reductionAmount: 0,
        reducibleTransferIncome: 0,
        signCase: "neg_pos",
      },
    });
    expect(screen.queryByText("감면세액 산출근거")).toBeNull();
  });
});
