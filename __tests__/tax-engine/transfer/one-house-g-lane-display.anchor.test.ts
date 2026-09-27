/**
 * anchor — 1세대1주택 리뷰 G 레인: 고가주택 기준금액 연혁 문구 · §154① 단서 적용 근거
 *
 * 입력: `docs/reviews/one-house-exemption-review-2026-09.md` OH-54 · OH-60 · OH-64 · OH-65
 *
 * 고정하는 계약
 *  - OH-54 판정 배지 설명이 양도일 기준금액(9억)을 적는다. 양도일을 모르면 금액을 적지 않는다.
 *  - OH-65 입력 화면 안내용 기준금액이 양도일로 갈린다(2021-12-07 9억 / 2021-12-08 12억).
 *  - OH-64 상세명세서가 9억 시대 안분 STEP을 찾아 과세대상 산식을 분수로 싣고, 비과세 산식이 9억을 인용한다.
 *  - OH-60 요건 미충족 §154① 단서(3호 거주 1년 미만)는 비과세 사유·적용 특례에 찍히지 않는다.
 *    요건을 충족한 단서(A1 수용)는 종전대로 찍힌다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { oneHouseVerdictOf } from "@/lib/calc/one-house-judgment-verdict";
import { highValueThresholdForDisplay } from "@/lib/calc/high-value-threshold-display";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

describe("OH-54 판정 배지 — 부분 비과세 기준금액", () => {
  it("9억 기준이면 「9억 초과분」", () => {
    const v = oneHouseVerdictOf({ isExempt: false, isPartialExempt: true }, 900_000_000);
    expect(v.label).toBe("부분 비과세");
    expect(v.detail).toContain("9억 초과분");
    expect(v.detail).not.toContain("12억");
  });
  it("기준금액을 모르면(이력 목록) 금액을 적지 않는다", () => {
    const v = oneHouseVerdictOf({ isExempt: false, isPartialExempt: true });
    expect(v.detail).toContain("고가주택 기준금액 초과분");
    expect(v.detail).not.toMatch(/\d+억/);
  });
});

describe("OH-65 입력 화면 안내용 기준금액", () => {
  it.each([
    ["2021-12-07", 900_000_000, "9억"],
    ["2021-12-08", 1_200_000_000, "12억"],
    ["2008-10-06", 600_000_000, "6억"],
    ["", 1_200_000_000, "12억"],
    ["not-a-date", 1_200_000_000, "12억"],
  ])("양도일 %s → %s", (date, amount, label) => {
    expect(highValueThresholdForDisplay(date || undefined)).toEqual({ amount, label });
  });
});

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

describe("OH-64 상세명세서 — 9억 시대 안분 STEP", () => {
  it("엔진 라벨이 9억이고, 과세대상 산식이 STEP을 재사용한다(순환 정의 아님)", () => {
    const result = nineEokPartial();
    expect(result.isPartialExempt).toBe(true);
    expect(result.steps.some((s) => s.label === "과세 양도차익 (9억 초과분)")).toBe(true);

    const items = buildStatementItems(result, undefined, undefined, undefined, undefined);
    const exempt = items.get("exemptGain")!;
    expect(String(exempt.formula)).toContain("§95 9억 초과 안분");
    expect(String(exempt.formula)).not.toContain("12억");
    const taxable = items.get("taxableGain")!;
    // 대체 산식 「전체 양도차익 − 비과세 양도차익」으로 떨어지지 않는다
    expect(typeof taxable.formula === "string" && taxable.formula.includes("− 비과세 양도차익")).toBe(false);
  });
});

describe("OH-60 §154① 단서 적용 근거 — 요건 판정 결과로 가드", () => {
  const base = {
    transferPrice: 500_000_000,
    acquisitionPrice: 300_000_000,
    transferDate: new Date("2023-06-01"),
    acquisitionDate: new Date("2015-01-01"),
    residencePeriodMonths: 6,
    isRegulatedArea: false,
    isOneHousehold: true,
    householdHousingCount: 1,
  };

  it("3호 부득이 선택 + 거주 6개월 → 본칙으로 비과세, 단서는 근거에 없다", () => {
    const r = calculateTransferTax(
      baseTransferInput({ ...base, oneHouseExemptionProviso: { reason: "unavoidable" } }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toBe("1세대1주택 비과세");
    // appliedExceptions 행도 같은 provisoReason에서 만든다(transfer-tax-exemption.ts E-4)
  });

  it("해외이주 출국 후 2년 초과 → 단서 근거 없음", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...base,
        oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: new Date("2019-01-01") },
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).not.toContain("단서");
  });

  it("3호 부득이 + 거주 12개월(요건 충족) → 단서가 근거로 찍힌다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        ...base,
        residencePeriodMonths: 12,
        oneHouseExemptionProviso: { reason: "unavoidable" },
      }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.exemptReason).toContain("§154① 단서");
  });
});
