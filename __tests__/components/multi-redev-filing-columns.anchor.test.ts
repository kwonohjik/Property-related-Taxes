/**
 * anchor: 다건 「건별 상세」의 자산별 신고서가 **재개발 §166 분할 열을 낸다**
 * (결과탭 코드리뷰 Lane 5 — #080 ③).
 *
 * ## dead branch였다
 *
 * `MultiTransferPropertyBreakdown.tsx`의
 *   `const hasRedev = !!filingResult.redevelopmentDetail;`
 * 가 **항상 false**였다. `PerPropertyBreakdown`에 그 필드가 없어 어댑터
 * (`breakdownToFilingResult`)가 채울 소스가 없었기 때문이다. 그리고 열 구성을 만드는
 * `deriveColumns`는 `result.redevelopmentDetail` **하나로** 재개발 분기 전체를 게이트한다.
 *
 * 실측(같은 입주권, 사례 36 형태):
 *
 * | | 열 | mode |
 * |---|---|---|
 * | 단건 | 합계 · ① 인가전 분 · ② 인가후 분 (청산금 납부) | `redev-right-pay` |
 * | 다건 자산별 | **합계 하나뿐** | **`single`** |
 *
 * ⇒ 엔진이 만든 §166 분할 내역이 다건에서만 통째로 사라졌다.
 *
 * ⚠️ `TransferValuationDetailSource`가 `redevelopmentDetail`을 제외한 것은 **일괄(bundled)**
 *   축이다(그 경로는 재개발 자산을 차단한다 — PR #854). **다건(multi)** 은 차단하지 않아
 *   엔진이 정상으로 detail을 만든다 — 두 축을 섞으면 안 된다.
 *
 * 법령: 소득세법 시행령 §166 (재개발·재건축 단계별 양도차익 안분)
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

/** 사례 36 형태 — 입주권 양도(청산금 납부), 실가. */
function redevInput(): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in",
    transferPrice: 520_000_000,
    transferDate: D("2023-03-02"),
    acquisitionDate: D("2002-04-09"),
    acquisitionPrice: 100_000_000,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: false,
    householdHousingCount: 2,
    householdRightCount: 1,
    residencePeriodMonths: 0,
    redevelopment: {
      subject: "right",
      approvalLawBasis: "urban_renovation_art_74",
      approvalDate: D("2018-10-23"),
      rightsValue: 300_000_000,
      settlementDirection: "pay",
      settlementAmount: 90_000_000,
      preApprovalExpenses: 0,
      postApprovalExpenses: 0,
      originalAssetType: "housing",
    },
  } as Partial<TransferTaxInput>);
}

function agg() {
  const input: AggregateTransferInput = {
    taxYear: 2023,
    annualBasicDeductionUsed: 0,
    properties: [
      {
        ...(redevInput() as unknown as TransferTaxItemInput),
        propertyId: "r1",
        propertyLabel: "입주권",
      },
      {
        ...(baseTransferInput({
          propertyType: "land",
          acquisitionDate: D("2010-01-01"),
          transferDate: D("2023-06-01"),
          transferPrice: 500_000_000,
          acquisitionPrice: 200_000_000,
          expenses: 0,
          isOneHousehold: false,
          householdHousingCount: 0,
        } as Partial<TransferTaxInput>) as unknown as TransferTaxItemInput),
        propertyId: "p2",
        propertyLabel: "토지",
      },
    ],
  };
  return calculateTransferTaxAggregate(input, rates);
}

const colKeys = (cols: { key: string }[]) => cols.map((c) => c.key);

// ── H-0 구별력 ──────────────────────────────────────────────────────
describe("H-0 격자 — 단건은 §166 분할 열을 낸다", () => {
  it("단건 열이 1개보다 많다 (같으면 비교의 의미가 없다)", () => {
    const single = calculateTransferTax(redevInput(), rates);
    expect(single.redevelopmentDetail, "엔진이 detail을 안 만들면 이 anchor는 재지 못한다").toBeDefined();
    const { columns, mode } = deriveColumns(single as never, undefined, "right", "pay");
    expect(mode).toBe("redev-right-pay");
    expect(colKeys(columns)).toEqual(["total", "preApproval", "postApproval"]);
  });

  it("다건 엔진도 같은 자산에 detail을 만든다", () => {
    expect(agg().properties[0].redevelopmentDetail).toBeDefined();
  });
});

// ── H-1 다건 자산별 열 ──────────────────────────────────────────────
describe("H-1 다건 자산별 신고서가 단건과 같은 열을 낸다 (#080 ③)", () => {
  it("🔴 어댑터가 detail을 싣는다", () => {
    expect(breakdownToFilingResult(agg().properties[0]).redevelopmentDetail).toBeDefined();
  });

  it("🔴 열 구성·mode가 단건과 일치한다", () => {
    const single = calculateTransferTax(redevInput(), rates);
    const expected = deriveColumns(single as never, undefined, "right", "pay");
    const actual = deriveColumns(
      breakdownToFilingResult(agg().properties[0]),
      undefined,
      "right",
      "pay",
    );
    expect(actual.mode).toBe(expected.mode);
    expect(colKeys(actual.columns)).toEqual(colKeys(expected.columns));
  });

  it("대조군 — 재개발이 아닌 자산은 합계 열 하나다", () => {
    const { columns, mode } = deriveColumns(
      breakdownToFilingResult(agg().properties[1]),
      undefined,
      undefined,
      undefined,
    );
    expect(mode).toBe("single");
    expect(colKeys(columns)).toEqual(["total"]);
  });
});
