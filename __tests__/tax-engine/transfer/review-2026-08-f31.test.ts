/**
 * F31 — 단건 신고서 양식 표의 「가산세액」이 신고불성실·납부지연 가산세를 통째로 누락했다.
 *
 * 근거: 「소득세법」 제92조 제3항 제3호 — 「양도소득 총결정세액: … 양도소득 결정세액에
 * 제114조의2, 제115조 및 「국세기본법」 제47조의2부터 제47조의4까지에 따른 가산세를 더하여 계산」.
 *
 * 종전 `FilingFormTableHelpers.buildRows`는 §114조의2분(`result.penaltyTax`)만 싣고
 * `result.penaltyDetail.totalPenalty`(국기법 §47의2~§47의4)를 어느 행에도 반영하지 않았다.
 * 같은 화면의 상세명세서·다건 신고서 표·상단 총납부세액 카드는 두 축을 합산하므로
 * **단건 표만 outlier**였고, 「신고서 양식」은 단독 print leaf라 이 표만 인쇄하면
 * 국기법 가산세가 빠진 서식이 나왔다.
 *
 * ⛔ 지방소득세 산출세액 base는 함께 바꾸지 않는다 — 엔진 `transfer-tax-finalize.ts` STEP 10과
 *    집계 `transfer-tax-aggregate.ts`가 §114조의2분만 base로 쓴다(신고불성실·납부지연 제외).
 *    함께 바꾸면 「지방세 산출세액 ≠ result.localIncomeTax」 새 불일치가 생긴다.
 *
 * 기대값은 전부 엔진(`calculateTransferTax`)을 실제로 호출해 관측한 값이다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { buildRows } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

/** 토지 10억/4억 · 2010-01-01 → 2026-06-01 · 무신고 + 미납 1억(기한 2026-08-31 · 납부 2026-12-31) */
function calc() {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "land",
      isOneHousehold: false,
      householdHousingCount: 0,
      transferPrice: 1_000_000_000,
      acquisitionPrice: 400_000_000,
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date("2026-06-01"),
      filingPenaltyDetails: {
        determinedTax: 141_060_000,
        reductionAmount: 0,
        priorPaidTax: 0,
        originalFiledTax: 0,
        excessRefundAmount: 0,
        interestSurcharge: 0,
        filingType: "none" as const,
        penaltyReason: "normal" as const,
      },
      delayedPaymentDetails: {
        unpaidTax: 100_000_000,
        paymentDeadline: new Date("2026-08-31"),
        actualPaymentDate: new Date("2026-12-31"),
      },
    }),
    mockRates,
  );
}

function rowTotal(rows: ReturnType<typeof buildRows>, label: string) {
  const row = rows.find((r) => r.label === label);
  expect(row, `행 「${label}」이 없다`).toBeDefined();
  return row!.values.total;
}

describe("F31 — 단건 신고서 양식의 가산세액 = §114조의2 + 국기법 §47의2~§47의4", () => {
  it("엔진 관측값 고정 (§114조의2분 0 · 국기법분 30,874,000)", () => {
    const r = calc();
    expect(r.determinedTax).toBe(141_060_000);
    expect(r.penaltyTax).toBe(0); // §114조의2 환산가액적용가산세 — 이 케이스는 미발동
    expect(r.penaltyDetail?.filingPenalty?.filingPenalty).toBe(28_212_000); // 무신고 20%
    expect(r.penaltyDetail?.delayedPaymentPenalty?.delayedPaymentPenalty).toBe(2_662_000);
    expect(r.penaltyDetail?.totalPenalty).toBe(30_874_000);
    expect(r.localIncomeTax).toBe(14_106_000);
    expect(r.totalTax).toBe(186_040_000);
  });

  it("신고서 표의 가산세액·총결정세액이 두 축을 합산한다", () => {
    const rows = buildRows(calc(), "single");
    // 종전: 가산세액 0 · 총결정세액 141,060,000 (국기법 가산세 30,874,000 누락)
    expect(rowTotal(rows, "가산세액")).toBe(30_874_000);
    expect(rowTotal(rows, "총결정세액")).toBe(171_934_000);
    expect(rowTotal(rows, "결정세액")).toBe(141_060_000);
  });

  it("표의 가산세액이 엔진 두 필드의 합과 자기일관 (하드코딩 아님)", () => {
    const r = calc();
    const rows = buildRows(r, "single");
    expect(rowTotal(rows, "가산세액")).toBe(r.penaltyTax + (r.penaltyDetail?.totalPenalty ?? 0));
    expect(rowTotal(rows, "총결정세액")).toBe(
      r.determinedTax + r.penaltyTax + (r.penaltyDetail?.totalPenalty ?? 0),
    );
  });

  it("⛔ 지방소득세 산출세액 base는 §114조의2분만 유지된다 (result.localIncomeTax와 일치)", () => {
    const r = calc();
    const rows = buildRows(r, "single");
    expect(rowTotal(rows, "지방소득세 산출세액")).toBe(14_106_000);
    expect(rowTotal(rows, "지방소득세 산출세액")).toBe(r.localIncomeTax);
    expect(rowTotal(rows, "지방세 결정세액")).toBe(r.localIncomeTax);
  });

  it("가산세 미입력 케이스는 종전과 동일 (회귀 0)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        isOneHousehold: false,
        householdHousingCount: 0,
        transferPrice: 1_000_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date("2010-01-01"),
        transferDate: new Date("2026-06-01"),
      }),
      mockRates,
    );
    expect(r.penaltyDetail).toBeUndefined();
    const rows = buildRows(r, "single");
    expect(rowTotal(rows, "가산세액")).toBe(0);
    expect(rowTotal(rows, "총결정세액")).toBe(r.determinedTax);
  });
});
