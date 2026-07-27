/**
 * anchor: 상세 명세서(DetailedStatement)에 §99의3 소득금액차감(§90②) 반영.
 * 계획서: docs/02-design/features/detailed-statement-993-income-deduction.plan.md
 *
 * 버그: DetailedStatement가 §99의3 감면(new993Detail.reducibleTransferIncome)을 반영 못 해
 *   - "소득금액 감면대상" 행 부재
 *   - "감면후 소득금액" = 양도소득금액 그대로(no-op `- (reductionAmount>0?0:0)`)
 * FilingFormTable은 올바르게 처리 → 두 뷰 divergence. 본 anchor는 정합을 고정.
 *
 * 이미지 실측값(§99의3 케이스): 양도소득금액 415,118,683 / 소득금액 감면대상 179,917,278
 *   → 감면후 소득금액 235,201,405, 세액감면대상금액 0(§90② ≠ §90①).
 */
import { describe, it, expect, afterEach } from "vitest";
import { createElement, Fragment } from "react";
import { render, cleanup } from "@testing-library/react";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const TAXABLE_GAIN = 593_026_690;
const LTHD = 177_908_007;
const SINGLE_INCOME = TAXABLE_GAIN - LTHD; // 415,118,683 = 양도소득금액
const REDUCIBLE = 179_917_278; // §99의3 5년 안분 감면대상 양도소득금액

function makeResult(overrides: Partial<TransferTaxResult> = {}): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: TAXABLE_GAIN,
    taxableGain: TAXABLE_GAIN,
    usedEstimatedAcquisition: false,
    longTermHoldingDeduction: LTHD,
    longTermHoldingRate: 0.3,
    basicDeduction: 2_500_000,
    taxBase: 232_701_405,
    appliedRate: 0.38,
    progressiveDeduction: 19_940_000,
    calculatedTax: 68_486_533,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: 68_486_533,
    penaltyTax: 0,
    penaltyBase: 0,
    localIncomeTax: 6_848_653,
    totalTax: 68_486_533,
    steps: [{ label: "양도차익 계산", formula: "x", amount: TAXABLE_GAIN, legalBasis: "§95①" }],
    ...overrides,
  } as TransferTaxResult;
}

function makeAsset(): AssetForm {
  return {
    assetId: "primary",
    assetKind: "house",
    acquisitionDate: "2003-11-28",
    residenceInputMode: "months",
    residencePeriods: [],
    residencePeriodMonthsAsset: "",
  } as unknown as AssetForm;
}

function makeForm(asset: AssetForm): TransferFormData {
  return { transferDate: "2026-02-16", contractTotalPrice: "1200000000", assets: [asset] } as unknown as TransferFormData;
}

const build = (r: TransferTaxResult) =>
  buildStatementItems(r, makeForm(makeAsset()), makeAsset(), undefined, undefined);

afterEach(cleanup);

const ACQ = 200_000_000;
const Y5 = 400_000_000;
const TR = 660_000_000;

function make993Detail(over: Record<string, unknown> = {}): TransferTaxResult["new993Detail"] {
  return {
    reducibleTransferIncome: REDUCIBLE,
    isWithin5Years: false,
    transferIncomeApplied: SINGLE_INCOME,
    standardPriceAtAcquisition: ACQ,
    standardPriceAt5Years: Y5,
    standardPriceAtTransfer: TR,
    ...over,
  } as TransferTaxResult["new993Detail"];
}

describe("상세 명세서 — §99의3 소득금액차감 반영", () => {
  it("§99의3 적용: 소득금액 감면대상 = reducible, 감면후 소득금액 = 양도소득금액 − reducible, 세액감면대상금액 = 0", () => {
    const r = makeResult({ new993Detail: make993Detail() });
    const items = build(r);

    // 소득금액 감면대상 = §99의3 감면대상 양도소득금액 (신설 행)
    expect(items.get("reductionTargetIncome2")!.value).toBe(REDUCIBLE); // 179,917,278
    // 감면후 소득금액 = 양도소득금액 − 소득금액 감면대상 (no-op 제거 확인)
    expect(items.get("incomeAmountAfter")!.value).toBe(SINGLE_INCOME - REDUCIBLE); // 235,201,405
    // 세액감면대상금액(§90①)은 §99의3와 무관 → 0 유지 (정확)
    expect(items.get("reductionTargetIncome")!.value).toBe(0);
    // 과세표준 정합: 감면후 소득금액 − 기본공제 = result.taxBase
    expect((items.get("incomeAmountAfter")!.value as number) - r.basicDeduction).toBe(r.taxBase);
  });

  it("소득금액 감면대상 산식: 실제 변수값 인라인 + 분수(Frac) 표기 (라벨만 아님)", () => {
    const items = build(makeResult({ new993Detail: make993Detail() }));
    const formula = items.get("reductionTargetIncome2")!.formula;
    const { container } = render(createElement(Fragment, null, formula));
    const text = container.textContent ?? "";
    // 실제 변수값 노출
    expect(text).toContain("415,118,683"); // 양도소득금액
    expect(text).toContain("200,000,000"); // 취득시 기준시가
    expect(text).toContain("400,000,000"); // 5년시점 기준시가
    expect(text).toContain("660,000,000"); // 양도시 기준시가
    expect(text).toContain("179,917,278"); // 감면대상 결과
    // 분수(Frac) 렌더 — 분자/분모 실계산값
    expect(text).toContain("200,000,000"); // 분자 (400,000,000 − 200,000,000 = 200,000,000)
    expect(text).toContain("460,000,000"); // 분모 (660,000,000 − 200,000,000 = 460,000,000)
  });

  it("§99의3 미적용(new993Detail undefined): 소득금액 감면대상 0, 감면후 소득금액 = 양도소득금액(무영향)", () => {
    const items = build(makeResult());
    expect(items.get("reductionTargetIncome2")!.value).toBe(0);
    expect(items.get("incomeAmountAfter")!.value).toBe(SINGLE_INCOME); // 차감 없음
    expect(items.get("reductionTargetIncome")!.value).toBe(0);
  });
});

/**
 * 산식 값 인라인화 (A1~A5) — 라벨만 표시되던 산식에 실제 변수값 인라인.
 * 계획서: docs/02-design/features/detailed-statement-formula-inline-values.plan.md
 */
describe("상세 명세서 — 산식 값 인라인 (A1~A5)", () => {
  const renderText = (node: unknown) =>
    render(createElement(Fragment, null, node as never)).container.textContent ?? "";

  it("A1 감면후 소득금액: 양도소득금액 − 소득금액 감면대상 = 결과 값 인라인", () => {
    const items = build(makeResult({ new993Detail: make993Detail() }));
    const text = renderText(items.get("incomeAmountAfter")!.formula);
    expect(text).toContain("415,118,683"); // 양도소득금액
    expect(text).toContain("179,917,278"); // 소득금액 감면대상
    expect(text).toContain("235,201,405"); // 감면후 소득금액
  });

  it("A2 세액감면대상금액(단건): 감면 대상 양도소득금액 값 인라인", () => {
    const items = build(
      makeResult({ reductionTypeApplied: "self_farming", reducibleIncome: 50_000_000 }),
    );
    const text = renderText(items.get("reductionTargetIncome")!.formula);
    expect(text).toContain("50,000,000");
  });

  it("A3 총결정세액: 결정세액 + 가산세액 = 값 인라인", () => {
    const items = build(makeResult({ determinedTax: 68_486_533, penaltyTax: 0 }));
    const text = renderText(items.get("totalDeterminedTax")!.formula);
    expect(text).toContain("68,486,533");
  });

  it("A4 농어촌특별세: 값 인라인 + 소득금액차감 감면 일반화(§99의3 외 조문)", () => {
    const items = build(makeResult({ new993Detail: make993Detail({ ruralSurtax: 14_124_188 }) }));
    expect(items.get("ruralSurtax")!.value).toBe(14_124_188);
    expect(renderText(items.get("ruralSurtax")!.formula)).toContain("14,124,188");
    // §4 일반화: new99Detail(비-§99의3)의 농특세도 집계 (종전 new993Detail만 읽어 0 누락)
    const items2 = build(
      makeResult({
        new99Detail: {
          reducibleTransferIncome: 0,
          ruralSurtax: 3_500_000,
        } as unknown as TransferTaxResult["new99Detail"],
      }),
    );
    expect(items2.get("ruralSurtax")!.value).toBe(3_500_000);
  });

  it("A5 지방세 결정세액: 지방소득세 산출세액 − 감면 = 값 인라인", () => {
    const items = build(
      makeResult({ determinedTax: 68_486_533, penaltyTax: 0, localIncomeTax: 6_848_653 }),
    );
    const text = renderText(items.get("localDeterminedTax")!.formula);
    expect(text).toContain("6,848,653");
  });
});

/**
 * B군 — 날짜·기간 행 값 인라인.
 * 계획서: docs/02-design/features/detailed-statement-formula-inline-values-bc.plan.md
 */
describe("상세 명세서 — 날짜·기간 값 인라인 (B1·B2)", () => {
  const renderText = (node: unknown) =>
    render(createElement(Fragment, null, node as never)).container.textContent ?? "";

  it("B1 보유기간: 양도일 − 취득일 날짜 인라인", () => {
    const text = renderText(build(makeResult()).get("holdingPeriod")!.formula);
    expect(text).toContain("2026-02-16"); // 양도일
    expect(text).toContain("2003-11-28"); // 취득일
  });

  it("B2 거주기간(months 모드): 직접 입력 서술 + 기간값", () => {
    const text = renderText(build(makeResult()).get("residencePeriod")!.formula);
    expect(text).toContain("직접 입력");
  });

  it("B2 거주기간(interval 모드): 구간 날짜 인라인 + 합산", () => {
    const asset = {
      ...makeAsset(),
      residenceInputMode: "interval",
      residencePeriods: [{ moveInDate: "2010-01-01", moveOutDate: "2013-01-01" }],
    } as unknown as AssetForm;
    const items = buildStatementItems(makeResult(), makeForm(asset), asset, undefined, undefined);
    const text = renderText(items.get("residencePeriod")!.formula);
    expect(text).toContain("2010-01-01~2013-01-01"); // 거주 구간
    expect(text).toContain("3년 0월"); // 합산 기간
  });
});
