/**
 * anchor: 신고서 양식 표에 ⑨ 세율 행 — 실효세율(중과 포함)을 **한 번만** 계상한다
 *
 * ## 근거 — 신고서 정본
 *
 * 「소득세법 시행규칙」 [별지 제84호서식] 본지는 **⑧과세표준 → ⑨세율 → ⑩산출세액** 순으로
 * 세율 행을 둔다(사용자 제공 정본 실측). 앱의 신고서 표(`rowOrder`)에는 그 행이 없어
 * 비사업용 토지의 기본세율 +10%p가 서식에 숫자로 드러나지 않았다(COV-10).
 *
 * 같은 서식의 작성방법이 세율구분 코드로 비사업용 토지를 세분한다 —
 * 1-11(일반+10%p, 16~52%·’21 이후 16~55%) · 1-35/1-36(단기) · 1-31(지정지역 +20%) 등.
 * 이번 변경은 **⑨ 세율 행만** 넣는다(③ 세율구분 코드는 범위 밖).
 *
 * ## 🔴 함께 고친 이중 계상
 *
 * `appliedRate`는 **이미 중과를 포함한 실효세율**이다 —
 * `transfer-tax-rate-calc.ts`가 `baseRate + additionalRate × ratio`로 만든다.
 * 그런데 상세명세서는 `appliedRate + surchargeRate`로 찍어 중과분을 **두 번** 셌다.
 *
 * 실측(과세표준 1,245,500,000 비사업용 토지): 실효 **55%**(= floor(과표×0.55) − 누진공제가
 * 산출세액과 정확히 일치)인데 화면에는 **65%**로 나왔다.
 * `transfer-tax-aggregate.ts`의 `refCalculatedTax`가 같은 이유로 정정된 것과 같은 축이다.
 */
import { describe, it, expect } from "vitest";
import { buildRows, type AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { fmtRatePct } from "@/components/calc/results/transfer/FilingFormTableRowDefs";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";

const d = (s: string) => new Date(s);

function cell(rows: { label: string; values: Record<string, unknown> }[], label: string, col = "total") {
  return rows.find((r) => r.label === label)?.values[col] ?? null;
}

/** 비사업용 토지 — 취득일은 부칙 <제9270호> §14① 중과 배제창(’09.3.16.~’12.12.31.) 밖 */
function nblResult(): TransferTaxResult {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      isNonBusinessLand: true,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      acquisitionDate: d("2013-01-01"),
      transferDate: d("2024-06-01"),
      transferPrice: 2_000_000_000,
      acquisitionPrice: 400_000_000,
    }),
    makeMockRates(),
  );
}

describe("[정본 ⑨] fmtRatePct — 실효세율 한 번만", () => {
  it("🔴 중과 포함 실효세율을 그대로 쓴다 (surchargeRate를 더하지 않는다)", () => {
    const r = nblResult();
    expect(r.appliedRate).toBe(0.55);
    expect(r.surchargeRate).toBe(0.1);
    expect(fmtRatePct(r.appliedRate)).toBe("55%");
    // 이중 계상이면 65%가 된다.
    expect(fmtRatePct(r.appliedRate + (r.surchargeRate ?? 0))).toBe("65%");
  });

  it("실효세율이 산출세액과 자기일관 — 55%가 옳다는 독립 확인", () => {
    const r = nblResult();
    expect(Math.floor(r.taxBase * r.appliedRate) - r.progressiveDeduction).toBe(r.calculatedTax);
  });

  it("세율 0·미정의는 「-」로 비운다 (0%로 찍지 않는다)", () => {
    expect(fmtRatePct(0)).toBeNull();
    expect(fmtRatePct(undefined)).toBeNull();
    expect(fmtRatePct(null)).toBeNull();
  });

  it("소수점 세율도 표기 (6.6% 등)", () => {
    expect(fmtRatePct(0.066)).toBe("6.6%");
    expect(fmtRatePct(0.4)).toBe("40%");
  });
});

describe("[정본 ⑨] 단건 신고서 표 — 세율 행", () => {
  const form = createDefaultTransferFormData();
  const rows = buildRows(nblResult(), "single", form);

  it("🔴 세율 행이 존재하고 실효세율을 싣는다", () => {
    expect(cell(rows, "세율")).toBe("55%");
  });

  it("🔴 정본 순서 — 과세표준 → 세율구분 코드 → 세율 → 산출세액", () => {
    const labels = rows.map((r) => r.label);
    expect(labels.indexOf("세율구분 코드")).toBe(labels.indexOf("과세표준") + 1);
    expect(labels.indexOf("세율")).toBe(labels.indexOf("세율구분 코드") + 1);
    expect(labels.indexOf("산출세액")).toBe(labels.indexOf("세율") + 1);
  });

  it("🔴 ③ 세율구분 코드도 함께 실린다 — 비사업용 토지 1-11", () => {
    expect(cell(rows, "세율구분 코드")).toBe("1-11");
  });

  it("사업용 토지는 기본세율만 (과대적용 방지)", () => {
    const bizRows = buildRows(
      calculateTransferTax(
        baseTransferInput({
          propertyType: "land",
          isNonBusinessLand: false,
          isOneHousehold: false,
          householdHousingCount: 0,
          residencePeriodMonths: 0,
          acquisitionDate: d("2013-01-01"),
          transferDate: d("2024-06-01"),
          transferPrice: 2_000_000_000,
          acquisitionPrice: 400_000_000,
        }),
        makeMockRates(),
      ),
      "single",
      form,
    );
    expect(cell(bizRows, "세율")).toBe("45%");
    expect(cell(bizRows, "세율구분 코드")).toBe("1-10");
  });
});

describe("[정본 ⑨] 다건 합산 — 세율군이 둘 이상이면 합계를 비운다", () => {
  const bd = (id: string, rate: number) =>
    ({
      propertyId: id,
      propertyLabel: id,
      transferPrice: 100_000_000,
      acquisitionPrice: 50_000_000,
      necessaryExpense: 0,
      capitalExpenditureForDisplay: 0,
      transferGain: 50_000_000,
      isExempt: false,
      income: 40_000_000,
      incomeAfterOffset: 40_000_000,
      longTermHoldingDeduction: 10_000_000,
      refCalculatedTax: 1_000_000,
      refDeterminedTax: 1_000_000,
      appliedRate: rate,
    }) as unknown as PerPropertyBreakdown;

  const meta = (props: PerPropertyBreakdown[]): AggregateMeta => ({
    properties: props,
    aggregated: {
      totalIncomeAfterOffset: 80_000_000,
      basicDeduction: 2_500_000,
      taxBase: 77_500_000,
      calculatedTax: 12_000_000,
      reductionAmount: 0,
      determinedTax: 12_000_000,
      penaltyTax: 0,
      localIncomeTax: 1_200_000,
      priorPaidTax: 0,
      settlementAdditionalPayable: 0,
      priorPaidLocalTax: 0,
      settlementLocalPayable: 0,
    } as unknown as AggregateMeta["aggregated"],
  });

  const form = createDefaultTransferFormData();

  it("🔴 자산별 세율은 각 열에 실린다", () => {
    const rows = buildAggregateRows({} as TransferTaxResult, meta([bd("a", 0.45), bd("b", 0.55)]), form);
    expect(cell(rows, "세율", "a")).toBe("45%");
    expect(cell(rows, "세율", "b")).toBe("55%");
  });

  it("🔴 세율군이 둘이면 합계 열은 비운다 (평균·0%로 찍지 않는다)", () => {
    const rows = buildAggregateRows({} as TransferTaxResult, meta([bd("a", 0.45), bd("b", 0.55)]), form);
    expect(cell(rows, "세율", "total")).toBeNull();
  });

  it("전 자산 세율이 같으면 합계 열에도 싣는다", () => {
    const rows = buildAggregateRows({} as TransferTaxResult, meta([bd("a", 0.45), bd("b", 0.45)]), form);
    expect(cell(rows, "세율", "total")).toBe("45%");
  });
});
