/**
 * anchor — 1세대1주택 리뷰 G 레인 화면 계약 (OH-43 · OH-54 · OH-62)
 *
 *  - OH-43 단건 결과: 「초과분에 대해서만 과세」 카드는 `isPartialExempt`일 때만, 기준금액은 엔진 STEP 라벨(9억)
 *  - OH-54 판정 결과: 양도일을 받으면 부분 비과세 배지 설명에 그 시대 기준금액(9억)
 *  - OH-62 다건 아코디언: 안분 후 과세대상 행이 서고, 양도소득금액 산식이 그 값에서 출발한다
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { OneHouseJudgmentResultView } from "@/components/calc/results/OneHouseJudgmentResultView";
import { PropertyBreakdownAccordion } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

afterEach(() => cleanup());

const rates = makeMockRates();

/** 9억 시대 부분 비과세 — 1주택, 양도 2021-11-30 10억, 취득 2016-01-01 5억, 거주 60개월 */
function nineEokPartial() {
  return calculateTransferTax(
    baseTransferInput({
      transferPrice: 1_000_000_000,
      acquisitionPrice: 500_000_000,
      transferDate: new Date("2021-11-30"),
      acquisitionDate: new Date("2016-01-01"),
      residencePeriodMonths: 60,
      isRegulatedArea: false,
      isOneHousehold: true,
      householdHousingCount: 1,
    }),
    rates,
  );
}

function renderResult(result: ReturnType<typeof nineEokPartial>) {
  return render(
    <TransferTaxResultView
      result={result}
      formData={{ ...createDefaultTransferFormData(), transferDate: "2021-11-30" }}
      onReset={() => {}}
      onBack={() => {}}
    />,
  ).container;
}

describe("OH-43 단건 결과 — 부분 비과세 근거 카드", () => {
  it("부분 비과세면 엔진 기준금액(9억)으로 「초과분에 대해서만 과세」", () => {
    const result = nineEokPartial();
    expect(result.isPartialExempt).toBe(true);
    const text = renderResult(result).textContent ?? "";
    expect(text).toContain("1세대1주택 특례 적용");
    expect(text).toContain("양도가액 9억원 초과분에 대해서만 과세됩니다");
    expect(text).not.toContain("12억원 초과분에 대해서만");
  });

  it("안분 없이 과세된 결과(isPartialExempt=false)는 판정 사유가 남아 있어도 카드를 그리지 않는다", () => {
    // §155⑳ 요건 미충족·G-3처럼 일반 경로가 판정의 exemptReason을 그대로 실은 결과 형태
    const result = { ...nineEokPartial(), isPartialExempt: false, exemptReason: "1세대1주택 비과세" };
    const text = renderResult(result).textContent ?? "";
    expect(text).not.toContain("초과분에 대해서만 과세됩니다");
    expect(text).not.toContain("1세대1주택 특례 적용");
  });
});

describe("OH-54 판정 결과 배지", () => {
  const partial = {
    judgment: {
      isExempt: false,
      isPartialExempt: true,
      pending: [],
      undetermined: [],
      unmetExceptions: [],
      appliedExceptions: [],
      legalBasis: [],
    },
    houseCount: { total: 1, countedForExemption: 1, excluded: [] },
  } as unknown as OneHouseExemptionResponse;

  it("2021-12-07 양도 → 9억", () => {
    const { container } = render(<OneHouseJudgmentResultView result={partial} transferDate="2021-12-07" />);
    expect(container.textContent).toContain("9억 초과분에 해당하는 양도차익만 과세됩니다");
  });
  it("2021-12-08 양도 → 12억", () => {
    const { container } = render(<OneHouseJudgmentResultView result={partial} transferDate="2021-12-08" />);
    expect(container.textContent).toContain("12억 초과분에 해당하는 양도차익만 과세됩니다");
  });
});

describe("OH-62 다건 아코디언 — 안분 후 과세대상 행", () => {
  function breakdown(over: Partial<PerPropertyBreakdown> = {}): PerPropertyBreakdown {
    return {
      propertyId: "h1",
      propertyLabel: "주택 A",
      rateGroup: "progressive",
      transferPrice: 1_400_000_000,
      acquisitionPrice: 500_000_000,
      necessaryExpense: 0,
      capitalExpenditureForDisplay: 0,
      transferGain: 900_000_000,
      longTermHoldingDeduction: 102_857_142,
      income: 25_714_286,
      lossOffsetFromSameGroup: 0,
      lossOffsetFromOtherGroup: 0,
      incomeAfterOffset: 25_714_286,
      incomeDeductionReducible: 0,
      allocatedBasicDeduction: 0,
      taxBaseShare: 25_714_286,
      appliedRate: 0.15,
      progressiveDeduction: 0,
      determinedTax: 0,
      steps: [
        { label: "양도차익", formula: "1,400,000,000 − 500,000,000", amount: 900_000_000 },
        {
          label: "과세 양도차익 (12억 초과분)",
          formula: "900,000,000 × (1,400,000,000 − 1,200,000,000) / 1,400,000,000",
          amount: 128_571_428,
        },
      ],
      isExempt: false,
      ...over,
    } as unknown as PerPropertyBreakdown;
  }

  it("과세대상 행(128,571,428)이 서고 양도소득금액 산식이 그 값에서 출발한다", () => {
    const { container } = render(<PropertyBreakdownAccordion breakdown={breakdown()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("과세 양도차익 (12억 초과분)");
    expect(text).toContain("128,571,428");
    // 128,571,428 − 102,857,142 = 25,714,286 — 화면 산식이 자기 값을 만든다
    expect(text).not.toMatch(/900,000,000\s*-\s*102,857,142/);
  });

  it("안분이 없으면(과세대상 = 양도차익) 행을 내지 않는다", () => {
    const b = breakdown({ transferPrice: 1_000_000_000, transferGain: 500_000_000, longTermHoldingDeduction: 0, income: 500_000_000, steps: [] });
    const { container } = render(<PropertyBreakdownAccordion breakdown={b} />);
    // 아코디언: 양도차익 행 바로 다음이 양도소득금액 행이다(같은 화면의 신고서 표에는 과세대상 행이 늘 있다)
    expect(container.textContent).toContain("양도차익500,000,000양도소득금액500,000,000");
  });
});
