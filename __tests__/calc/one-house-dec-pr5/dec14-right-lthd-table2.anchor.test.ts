/**
 * #14 (G3-7) — 조합원입주권 장기보유특별공제 **표2 대상 = §89①4호 가·나목 성립 + 거주 2년** (종전: 입주권 외 다른 주택 정확히 1채).
 *
 * 근거: 소득세법 §95② 단서(양도하는 그 자산이 1세대1주택일 때 표2) · 영 §159의4 · 입주권은 가·나목 요건을 갖춰야 1세대1주택으로 본다
 * (국세청 회신·심판례의 일관된 독법). 거주분 공제율은 취득일~관리처분계획인가일 거주만 센다(사전-2023-법규재산-0141 — 요지 원문 확인).
 * 모르는 사실(인가일 요건 미선언·나목 취득일 미입력·분양권 미확인)은 혜택 불성립 + 확인 필요.
 *
 * 시료: 입주권 20억 양도(2024-06-01) · 취득 2010-04-09 · 인가 2018-10-23(보유 8년 6개월) · 거주 60개월 (모의 세율)
 *
 * | 시료 | 수정 전 총세액 | 수정 후 총세액 | 공제율(인가전분) |
 * |---|---:|---:|---|
 * | A 가목(다른 주택 0) | 258,317,400 | 245,011,800 | 0.16 → 0.52 |
 * | B 나목 충족(주택 1 · 2022-08 취득) | 245,011,800 | 245,011,800 | 0.52 (불변) |
 * | C 나목 기한 경과(주택 1) | 691,498,500 | 727,138,500 | 0.52 → 0.16 |
 * | D 주택 1 · 취득일 미입력 | 691,498,500 | 727,138,500 | 0.52 → 0.16 + 확인 필요 |
 * | I 가목 · 거주 180개월(인가 후 철거 전 거주 포함) | 258,317,400 | 240,576,600 | 0.16 → 0.64(거주분 8년) |
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../tax-engine/_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";

const rates = makeMockRates();

function redevInfo(extra: Partial<RedevelopmentInfo> = {}): RedevelopmentInfo {
  return {
    subject: "right", approvalLawBasis: "urban_renovation_art_74", approvalDate: new Date("2018-10-23"),
    rightsValue: 500_000_000, settlementDirection: "pay", settlementAmount: 50_000_000,
    preApprovalExpenses: 0, postApprovalExpenses: 0, originalAssetType: "housing",
    exemptionEligibleAtApproval: true, ...extra,
  };
}
function input(o: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "right_to_move_in", transferPrice: 2_000_000_000, transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2010-04-09"), acquisitionPrice: 300_000_000, expenses: 0, useEstimatedAcquisition: false,
    isOneHousehold: true, householdHousingCount: 0, householdRightCount: 1, residencePeriodMonths: 60,
    householdNoPresaleRightsConfirmed: true, redevelopment: redevInfo(), ...o,
  });
}
const NA_OK = { householdHousingCount: 1, redevelopment: redevInfo({ otherHouseAcquisitionDate: new Date("2022-08-01") }) };
const NA_LATE = { householdHousingCount: 1, redevelopment: redevInfo({ otherHouseAcquisitionDate: new Date("2020-01-01") }) };
const run = (o: Partial<TransferTaxInput> = {}) => calculateTransferTax(input(o), rates);
const rate = (r: ReturnType<typeof run>) => r.redevelopmentDetail?.preApproval.lthdRate;
const noticeOf = (r: ReturnType<typeof run>, re: RegExp) => (r.warnings ?? []).some((w) => re.test(w));
const APPLIED = /표2\(1세대1주택\)를 적용했습니다.*인가 후 철거 전 거주.*확인이 필요합니다/;
const BLOCKED = /표2를 적용하지 않았습니다.*확인이 필요합니다/;
const NO_RESIDENCE = /거주기간이 입력되지 않았거나 0개월/;

describe("#14 표2 대상 판정 — 가·나목 성립", () => {
  it("A 가목(다른 주택 0) 고가 입주권 + 거주 60개월 → 표2 0.52 · 총세액 245,011,800 (수정 전 표1 258,317,400)", () => {
    const r = run();
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("ga");
    expect(rate(r)).toBe(0.52);
    expect(r.totalTax).toBe(245_011_800);
    expect(noticeOf(r, APPLIED)).toBe(true);
  });
  it("B 나목 충족(주택 1 · 기한 안) + 거주 60개월 → 표2 0.52 (종전과 같음)", () => {
    const r = run(NA_OK);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(rate(r)).toBe(0.52);
    expect(r.totalTax).toBe(245_011_800);
  });
  it("C 나목 기한 경과(주택 1) → 표1 0.16 · 총세액 727,138,500 (수정 전 표2 691,498,500) — 확인 필요 없음(알 수 있는 불성립)", () => {
    const r = run(NA_LATE);
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
    expect(rate(r)).toBe(0.16);
    expect(r.totalTax).toBe(727_138_500);
    expect(noticeOf(r, BLOCKED)).toBe(false);
  });
  it("K 인가일 요건을 «충족하지 않음»으로 선언한 입주권은 주택 1채 나목 날짜가 맞아도 표1 · 확인 필요 없음", () => {
    const r = run({
      ...NA_OK,
      redevelopment: redevInfo({ exemptionEligibleAtApproval: false, otherHouseAcquisitionDate: new Date("2022-08-01") }),
    });
    expect(rate(r)).toBe(0.16);
    expect(noticeOf(r, BLOCKED)).toBe(false);
  });
  it("긍정 짝 — 가목 + 거주 12개월(2년 미만)이면 표1 0.16 · 표2 적용 고지 없음 (거주 2년 요건은 그대로)", () => {
    const r = run({ residencePeriodMonths: 12 });
    expect(rate(r)).toBe(0.16);
    expect(r.totalTax).toBe(258_317_400);
    expect(noticeOf(r, APPLIED)).toBe(false);
  });
});

describe("#14 모름 = 혜택 불성립 + 확인 필요 (표2가 막힐 때만)", () => {
  it("D 주택 1 + 나목 다른 주택 취득일 미입력 → 표1 + 확인 필요(취득일)", () => {
    const r = run({ householdHousingCount: 1 });
    expect(rate(r)).toBe(0.16);
    expect(r.totalTax).toBe(727_138_500);
    expect(noticeOf(r, /나목 다른 주택의 취득일이 입력되지 않았습니다.*확인이 필요합니다/)).toBe(true);
  });
  it("E 인가일 요건 미선언(가목) → 표1 + 확인 필요(미선언)", () => {
    const r = run({ redevelopment: redevInfo({ exemptionEligibleAtApproval: undefined }) });
    expect(rate(r)).toBe(0.16);
    expect(noticeOf(r, /인가일 현재 기존주택 비과세 요건.*선언하지 않았습니다.*확인이 필요합니다/)).toBe(true);
  });
  it("G 분양권 미확인(가목) → 표1 + 확인 필요(분양권)", () => {
    const r = run({ householdNoPresaleRightsConfirmed: false });
    expect(rate(r)).toBe(0.16);
    expect(noticeOf(r, /분양권이 없는지 확인하지 않았습니다.*확인이 필요합니다/)).toBe(true);
  });
  it("대조 — 모르는 사실이 있어도 거주 2년 미만이면 표2가 어차피 안 열려 확인 필요를 내지 않는다", () => {
    const r = run({ residencePeriodMonths: 12, redevelopment: redevInfo({ exemptionEligibleAtApproval: undefined }) });
    expect(noticeOf(r, BLOCKED)).toBe(false);
  });
});

describe("#14 거주분 공제율 — 취득일~인가일 안의 거주만 (사전-2023-법규재산-0141 · 하위 나)", () => {
  it("I 가목 + 거주 180개월(인가 후 철거 전 거주 포함) → 표2 대상이되 거주분은 인가일까지 8년 = 0.64 · 총세액 240,576,600", () => {
    const r = run({ residencePeriodMonths: 180 });
    expect(rate(r)).toBe(0.64);
    expect(r.redevelopmentDetail?.preApproval.lthdResidencePart).toBe(25_600_000);
    expect(r.totalTax).toBe(240_576_600);
  });
  it("긍정 짝 — 거주가 인가일 안이면(60개월) 거주분 그대로 0.52", () => {
    expect(rate(run({ residencePeriodMonths: 60 }))).toBe(0.52);
  });
  it("cap 경계 — 거주 102개월(= 취득~인가 8년 6개월 전체)은 거주분 8년(0.64), 그 위로는 늘지 않는다", () => {
    expect(rate(run({ residencePeriodMonths: 102 }))).toBe(0.64);
    expect(rate(run({ residencePeriodMonths: 300 }))).toBe(0.64);
  });
});

describe("#14 거주기간 미입력 고지 — 가·나목 + 12억 초과 + 보유 3년 이상", () => {
  it("J 가목 20억 + 거주 0 → 표1 + 거주 미입력 확인 필요", () => {
    const r = run({ residencePeriodMonths: 0 });
    expect(rate(r)).toBe(0.16);
    expect(noticeOf(r, NO_RESIDENCE)).toBe(true);
  });
  it("대조 — 12억 이하(과세되는 초과분 없음)면 거주 0이어도 고지하지 않는다", () => {
    const r = run({ residencePeriodMonths: 0, transferPrice: 1_000_000_000 });
    expect(noticeOf(r, NO_RESIDENCE)).toBe(false);
  });
  it("대조 — 거주가 있으면 고지하지 않는다", () => {
    expect(noticeOf(run({ residencePeriodMonths: 60 }), NO_RESIDENCE)).toBe(false);
  });
});
