import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder, CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";

// §39 증자에 따른 이익의 증여 — cap-table 6 계산사례 (교재 27장) 원단위 anchor.
// equity-delta 방식: 주주별 지분 증감 = 증여재산가액, 증여자별 = 손해비례 배분 + 특수관계 필터.

function sh(
  id: string,
  preShares: number,
  entitledShares: number,
  subscribedShares: number,
  reallocatedShares: number,
  relatedTo: string[],
): CapShareholder {
  return { id, name: id, preShares, entitledShares, subscribedShares, reallocatedShares, relatedTo };
}

/** 수증자별 총액 맵 */
function totals(r: ReturnType<typeof calcCapitalIncreaseAllocation>) {
  return new Map(r.perBeneficiary.map((b) => [b.beneficiaryId, b.total]));
}
/** 증여자별 분할 맵 (beneficiary → donor → value) */
function donorVal(r: ReturnType<typeof calcCapitalIncreaseAllocation>, b: string, d: string) {
  return r.splits.find((s) => s.beneficiaryId === b && s.donorId === d)?.value;
}

describe("[CI-S39-C1] 사례1 저가 재배정(①)", () => {
  const input: CapitalIncreaseAllocationInput = {
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 25_000, 25_000, 0, 0, ["을"]),
      sh("을", 15_000, 15_000, 40_000, 25_000, ["갑"]),
      sh("소액주주", 10_000, 10_000, 10_000, 0, []),
    ],
  };
  const r = calcCapitalIncreaseAllocation(input);
  it("㉯ 20,000 · 을 증여재산가액 250,000,000", () => {
    expect(r.perShareAfter).toBe(20_000);
    expect(totals(r).get("을")).toBe(250_000_000);
  });
  it("검증내역 zero-sum (갑 −250,000,000)", () => {
    const 갑 = r.byShareholder.find((b) => b.id === "갑")!;
    expect(갑.delta).toBe(-250_000_000);
    expect(r.reconciliation.balanced).toBe(true);
  });
});

describe("[CI-S39-C2] 사례2 저가 재배정+실권처리(①+②)", () => {
  const r = calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 30_000, 30_000, 0, 0, ["을", "병"]),
      sh("을", 10_000, 10_000, 20_000, 10_000, ["갑"]),
      sh("병", 5_000, 5_000, 5_000, 0, ["갑"]),
      sh("소액주주", 5_000, 5_000, 5_000, 0, []), // 갑과 특수관계 없음
    ],
  });
  it("㉯ 22,500 · 을 175,000,000 · 병 25,000,000", () => {
    expect(r.perShareAfter).toBe(22_500);
    expect(totals(r).get("을")).toBe(175_000_000);
    expect(totals(r).get("병")).toBe(25_000_000);
  });
  it("소액주주 특수관계 부재 → 과세 0", () => {
    expect(totals(r).get("소액주주")).toBe(0);
  });
  it("검증내역 zero-sum (갑 −225,000,000)", () => {
    expect(r.byShareholder.find((b) => b.id === "갑")!.delta).toBe(-225_000_000);
    expect(r.reconciliation.balanced).toBe(true);
  });
});

describe("[CI-S39-C3] 사례3 저가 제3자직접배정+초과배정(③)", () => {
  const r = calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 60_000, 60_000, 0, 0, ["을", "병"]),
      sh("을", 30_000, 30_000, 50_000, 20_000, ["갑"]), // 초과배정 20,000
      sh("병", 0, 0, 40_000, 40_000, ["갑"]), // 제3자 직접배정 40,000
      sh("소액주주", 10_000, 10_000, 10_000, 0, []),
    ],
  });
  it("㉯ 20,000 · 을(초과) 200,000,000 · 병(제3자) 400,000,000", () => {
    expect(r.perShareAfter).toBe(20_000);
    expect(totals(r).get("을")).toBe(200_000_000);
    expect(totals(r).get("병")).toBe(400_000_000);
  });
  it("검증내역 zero-sum (갑 −600,000,000)", () => {
    expect(r.byShareholder.find((b) => b.id === "갑")!.delta).toBe(-600_000_000);
    expect(r.reconciliation.balanced).toBe(true);
  });
});

describe("[CI-S39-C4] 사례4 고가 재배정(④) 2증여자 분할", () => {
  const r = calcCapitalIncreaseAllocation({
    direction: "high",
    preIssuePrice: 10_000,
    newSharePrice: 30_000,
    shareholders: [
      sh("갑", 50_000, 50_000, 80_000, 30_000, []), // 父 인수자(증여자)
      sh("을", 10_000, 10_000, 20_000, 10_000, []), // 母 인수자(증여자)
      sh("병", 30_000, 30_000, 0, 0, ["갑", "을"]), // 子 포기자(수증자)
      sh("정", 10_000, 10_000, 0, 0, ["갑", "을"]),
    ],
  });
  it("㉯ 20,000 · 병 300,000,000(부225M+모75M) · 정 100,000,000", () => {
    expect(r.perShareAfter).toBe(20_000);
    expect(totals(r).get("병")).toBe(300_000_000);
    expect(donorVal(r, "병", "갑")).toBe(225_000_000);
    expect(donorVal(r, "병", "을")).toBe(75_000_000);
    expect(totals(r).get("정")).toBe(100_000_000);
    expect(donorVal(r, "정", "갑")).toBe(75_000_000);
    expect(donorVal(r, "정", "을")).toBe(25_000_000);
  });
  it("검증내역 zero-sum", () => {
    expect(r.reconciliation.balanced).toBe(true);
    expect(r.reconciliation.totalGain).toBe(400_000_000);
  });
});

describe("[CI-S39-C5] 사례5 고가 실권처리(⑤) + 특수관계 없는 자 미과세", () => {
  const r = calcCapitalIncreaseAllocation({
    direction: "high",
    preIssuePrice: 10_000,
    newSharePrice: 30_000,
    shareholders: [
      sh("갑", 50_000, 50_000, 50_000, 0, ["병"]), // 父 인수자
      sh("을", 10_000, 10_000, 10_000, 0, ["병"]), // 母 인수자
      sh("병", 30_000, 30_000, 0, 0, ["갑", "을"]), // 子 포기자(수증자)
      sh("소액주주", 10_000, 10_000, 0, 0, []), // 포기자이나 갑·을과 특수관계 없음
    ],
  });
  it("㉯ 17,500(실제 증가 60,000) · 병 225,000,000(부187.5M+모37.5M)", () => {
    expect(r.perShareAfter).toBe(17_500);
    expect(totals(r).get("병")).toBe(225_000_000);
    expect(donorVal(r, "병", "갑")).toBe(187_500_000);
    expect(donorVal(r, "병", "을")).toBe(37_500_000);
  });
  it("소액주주 특수관계 부재 → 과세 0(산식상 75M)", () => {
    expect(totals(r).get("소액주주")).toBe(0);
    // 산식상 경제적 이익 75M은 byShareholder delta로 노출
    expect(r.byShareholder.find((b) => b.id === "소액주주")!.delta).toBe(75_000_000);
  });
});

describe("[CI-S39-C6] 사례6 고가 제3자직접배정+초과배정(⑥) 2증여자 분할", () => {
  const r = calcCapitalIncreaseAllocation({
    direction: "high",
    preIssuePrice: 10_000,
    newSharePrice: 20_000,
    shareholders: [
      sh("갑", 50_000, 50_000, 70_000, 20_000, []), // 父 초과배정 20,000(증여자)
      sh("을", 0, 0, 30_000, 30_000, []), // 母 제3자 직접배정 30,000(증여자)
      sh("병", 40_000, 40_000, 0, 0, ["갑", "을"]), // 子 미달(수증자)
      sh("정", 10_000, 10_000, 0, 0, ["갑", "을"]),
    ],
  });
  it("㉯ 15,000 · 병 200,000,000(갑80M+을120M) · 정 50,000,000(갑20M+을30M)", () => {
    expect(r.perShareAfter).toBe(15_000);
    expect(totals(r).get("병")).toBe(200_000_000);
    expect(donorVal(r, "병", "갑")).toBe(80_000_000);
    expect(donorVal(r, "병", "을")).toBe(120_000_000);
    expect(totals(r).get("정")).toBe(50_000_000);
    expect(donorVal(r, "정", "갑")).toBe(20_000_000);
    expect(donorVal(r, "정", "을")).toBe(30_000_000);
  });
  it("검증내역 zero-sum (totalGain 250,000,000)", () => {
    expect(r.reconciliation.balanced).toBe(true);
    expect(r.reconciliation.totalGain).toBe(250_000_000);
  });
});

describe("[CI-S39-FLOOR-RESIDUAL] 비정수 가중 floor 잔액 흡수", () => {
  // 정 이익 1,000,000을 갑(손해 1/3)·을(손해 2/3) 분할 → 333,333 + 666,667 = 1,000,000 (999,999 아님)
  const r = calcCapitalIncreaseAllocation({
    direction: "high",
    preIssuePrice: 10_000,
    newSharePrice: 30_000,
    shareholders: [
      sh("정", 100, 100, 0, 0, ["갑", "을"]), // 이익 1,000,000
      sh("무", 200, 200, 0, 0, ["갑", "을"]), // 이익 2,000,000
      sh("갑", 0, 0, 100, 100, []), // 손해 1,000,000
      sh("을", 0, 0, 200, 200, []), // 손해 2,000,000
    ],
  });
  it("정 333,333 + 666,667 = 1,000,000 (잔액 흡수, drift 0)", () => {
    expect(donorVal(r, "정", "갑")).toBe(333_333);
    expect(donorVal(r, "정", "을")).toBe(666_667);
    expect(totals(r).get("정")).toBe(1_000_000);
    expect(r.reconciliation.balanced).toBe(true);
  });
});

describe("[CI-S39-GATE-EXCLUDED] ② 실권처리 30%·3억 미충족 배제", () => {
  // 차액(1,000)/㉯(11,000)=9.1% < 30%, 이익 25,000 < 3억, 실권처리 발생 → 미과세
  const r = calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 11_500,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 50, 50, 0, 0, ["을"]), // 실권 50(재배정 없음=실권처리)
      sh("을", 50, 50, 50, 0, ["갑"]),
    ],
  });
  it("을 과세 0 (기준금액 미만 배제)", () => {
    expect(r.perShareAfter).toBe(11_000);
    expect(totals(r).get("을")).toBe(0);
    expect(r.splits.find((s) => s.beneficiaryId === "을")?.excludedReason).toContain("기준금액");
  });
});
