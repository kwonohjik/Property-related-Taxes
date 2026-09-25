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

/**
 * [CI-S39-GATE-AGGREGATE] — 설계서 B2(`gift-capital-increase-section39.engine.design.md:33`·`:43`)가
 * anchor명까지 1:1 지정했으나 **저장소에 없던** 항목의 이행이다(신규 제안 아님).
 *
 * 「상증령」§29②2호 verbatim: "…차감한 가액이 가목의 규정에 의하여 계산한 가액의 100분의 30 이상**이거나**
 *  그 가액에 다목의 규정에 의한 실권주수를 곱하여 계산한 가액이 **3억원 이상**인 경우의 당해 금액"
 *  ⇒ 30%·3억은 독립 OR 2항이고, 3억 판정 단위는 **수증자 집계**다(증여자별로 쪼개 탈락시키지 않는다).
 *
 * ⚠️ 이 anchor 이전에는 3억 arm의 구별력이 **0**이었다 — 유일한 게이트 픽스처
 *    [CI-S39-GATE-EXCLUDED]의 이익이 25,000원이라 생존 밴드가 [25,001, ∞)로 열려 있어
 *    `ABSOLUTE_THRESHOLD`를 100억으로 바꿔도 전건 초록이었다(2026-09-21 리뷰 뮤테이션 실측).
 */
describe("[CI-S39-GATE-AGGREGATE] ② 실권처리·30% 미충족 — 3억 게이트는 «집계» 기준", () => {
  const mk = (preShares: number) =>
    calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 1_000_000,
      newSharePrice: 800_000,
      shareholders: [
        // A·B 신주인수권 전부 포기(재배정 없음 = 실권처리) → 증여자 2명
        sh("A", preShares, preShares / 2, 0, 0, ["C"]),
        sh("B", preShares, preShares / 2, 0, 0, ["C"]),
        // C 자기 몫만 인수 → 수증자
        sh("C", preShares, preShares / 2, preShares / 2, 0, ["A", "B"]),
      ],
    });

  it("집계 302,852,600 ≥ 3억 · 증여자별 151,426,300 < 3억 → 집계 기준으로 «과세»", () => {
    const r = mk(5_300);
    // ㉯ 971,428 · 차액 171,428 < 30%(291,428) ⇒ 비율 arm 미충족 — 3억 arm이 «유일한» 통과 사유
    expect(r.perShareAfter).toBe(971_428);
    expect(totals(r).get("C")).toBe(302_852_600);
    // 증여자별로는 둘 다 3억 «미만»인데도 탈락하지 않는다(설계서 B2 「증여자별 탈락 금지」)
    expect(donorVal(r, "C", "A")).toBe(151_426_300);
    expect(donorVal(r, "C", "B")).toBe(151_426_300);
  });

  it("집계 297,138,400 < 3억 → 미과세 (경계 짝)", () => {
    const r = mk(5_200);
    expect(r.perShareAfter).toBe(971_428);
    expect(totals(r).get("C")).toBe(0);
    expect(r.splits.find((s) => s.beneficiaryId === "C")?.excludedReason).toContain("기준금액");
  });
});

/**
 * [CI-S39-HIGH-RELATION-GATE] — cap-table 특수관계 게이트의 `direction === "high"` 항.
 *
 * 「상증법」§39①2호는 가~라목 **전부** 이익을 얻는 자가 인수자의 「특수관계인」일 것을 요구한다
 * (가목 "…그의 특수관계인에 해당하는 신주 인수 포기자가 얻은 이익").
 * 저가 1호는 가·다·라목에 특수관계 요건이 없으므로, 고가에서만 켜지는 이 항이 법문의 분기점이다.
 *
 * ⚠️ 이 anchor 이전에는 해당 항의 구별력이 **0**이었다 — 「고가 × 실권처리 없음 × 비특수관계 수증자」
 *    교차점 픽스처가 0건이라 항을 삭제해도 3,361건 전건 통과했다(2026-09-21 리뷰 뮤테이션 실측).
 *    삭제 시 이 케이스는 relationGateApplies=false가 되어 333,330,000원이 «과다과세»된다.
 */
describe("[CI-S39-HIGH-RELATION-GATE] 고가 × 실권주 전량 재배정(실권처리 없음) × 특수관계 유무", () => {
  const mk = (relatedTo: string[]) =>
    calcCapitalIncreaseAllocation({
      direction: "high",
      preIssuePrice: 100_000,
      newSharePrice: 200_000, // 시가 초과 인수 → 포기자가 이익
      shareholders: [
        sh("A", 10_000, 5_000, 0, 0, relatedTo), // 포기자 = 수증자
        sh("B", 10_000, 5_000, 10_000, 5_000, []), // 자기 몫 + A 실권주 전량 재배정 ⇒ 실권처리 «없음»
      ],
    });

  it("비특수관계 → 과세 0 (§39①2호 특수관계 요건 불충족)", () => {
    const r = mk([]);
    expect(r.perShareAfter).toBe(133_333);
    expect(totals(r).get("A")).toBe(0);
    expect(r.splits.find((s) => s.beneficiaryId === "A")?.excludedReason).toBe("특수관계 부재(§39①2호)");
  });

  it("특수관계 → 333,330,000 전액 과세 (긍정 짝)", () => {
    const r = mk(["B"]);
    expect(totals(r).get("A")).toBe(333_330_000);
    expect(donorVal(r, "A", "B")).toBe(333_330_000);
  });
});

/**
 * [CI-S39-RATIO-ARM] — 「상증령」§29②2호의 **100분의 30 arm**(3억 arm과 독립된 OR 항).
 *
 * 위 [CI-S39-GATE-AGGREGATE]는 전부 비율 미충족 케이스라 30%가 몇이든 결과가 같다.
 * 여기서는 **비율 arm만이 유일한 통과 사유**인 구간을 고정한다 — 이익이 3억에 한참 못 미치므로
 * 금액 arm은 절대 켜지지 않는다. 값(30)과 등호(>=) 두 축을 각각 죽인다.
 *
 * ⚠️ 이 anchor 이전에는 값·등호 어느 쪽으로도 구별력이 **0**이었다 —
 *    `RATIO_NUMER`를 40으로 바꿔도, `>=`를 `>`로 바꿔도 3,361건 전건 초록이었다
 *    (2026-09-21 리뷰 뮤테이션 실측).
 */
describe("[CI-S39-RATIO-ARM] ② 실권처리 — 30% 비율 arm 단독 통과 구간", () => {
  const mk = (newSharePrice: number) =>
    calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 10_000,
      newSharePrice,
      shareholders: [
        sh("A", 100, 50, 0, 0, ["B"]), // 포기 → 재배정 없음 ⇒ 실권처리
        sh("B", 100, 50, 50, 0, ["A"]),
      ],
    });

  it("차액 3,200 = ㉯ 9,200의 34.78% → 비율 arm으로 과세 (이익 80,000 ≪ 3억)", () => {
    const r = mk(6_000);
    expect(r.perShareAfter).toBe(9_200);
    // 30% 기준 2,760 ≤ 차액 3,200 < 40% 기준 3,680 ⇒ 기준을 40으로 올리면 미과세로 뒤집힌다
    expect(totals(r).get("B")).toBe(80_000);
  });

  it("차액 2,790 == ㉯ 9,302의 30% 기준과 «정확히 같음» → 「이상」이므로 과세 (등호 축)", () => {
    const r = mk(6_512);
    expect(r.perShareAfter).toBe(9_302);
    expect(totals(r).get("B")).toBe(69_700); // >= 를 > 로 바꾸면 0
  });

  it("차액 2,788 < 30% 기준 2,790 → 미과세 (경계 짝)", () => {
    const r = mk(6_514);
    expect(totals(r).get("B")).toBe(0);
    expect(r.splits.find((s) => s.beneficiaryId === "B")?.excludedReason).toContain("기준금액");
  });
});
