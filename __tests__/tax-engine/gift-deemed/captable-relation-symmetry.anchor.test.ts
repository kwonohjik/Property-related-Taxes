import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder } from "@/lib/tax-engine/gift-deemed/types";

// #44·#53 — cap-table 특수관계는 **대칭**이다. 어느 행에 표시해도 같은 관계로 읽는다.
//   「상증법」§2제10호 후단 — 「이 경우 본인도 특수관계인의 특수관계인으로 본다.」
//   (2012~2015 「국세기본법」§2제20호 후단 · 구 「상증령」§29① 「인수하거나 인수하지 아니한 자와 … 관계에 있는 자」)
// 종전 엔진은 **수증자 행의 relatedTo만** 읽어, 같은 관계를 증여자 행에 표시하면
// 400,000,000원이 0원이 됐다(D-captable 리뷰 · 과소과세).

type Rel = Partial<Record<string, string[]>>;

function sh(id: string, pre: number, entitled: number, subscribed: number, realloc: number, rel: Rel): CapShareholder {
  return { id, name: id, preShares: pre, entitledShares: entitled, subscribedShares: subscribed, reallocatedShares: realloc, relatedTo: rel[id] };
}

/** 교재 사례4 — 고가 재배정(E2E `gift-deemed-capital-increase.spec.ts` 사례4와 같은 입력) */
function case4(rel: Rel) {
  return calcCapitalIncreaseAllocation({
    direction: "high",
    preIssuePrice: 10_000,
    newSharePrice: 30_000,
    shareholders: [
      sh("갑", 50_000, 50_000, 80_000, 30_000, rel),
      sh("을", 10_000, 10_000, 20_000, 10_000, rel),
      sh("병", 30_000, 30_000, 0, 0, rel),
      sh("정", 10_000, 10_000, 0, 0, rel),
    ],
  });
}

/** 교재 사례2 — 저가 재배정+실권처리(`capital-increase-case-anchor.test.ts` [CI-S39-C2]와 같은 주식수) */
function case2(rel: Rel) {
  return calcCapitalIncreaseAllocation({
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 30_000, 30_000, 0, 0, rel),
      sh("을", 10_000, 10_000, 20_000, 10_000, rel),
      sh("병", 5_000, 5_000, 5_000, 0, rel),
      sh("소액주주", 5_000, 5_000, 5_000, 0, rel),
    ],
  });
}

type R = ReturnType<typeof calcCapitalIncreaseAllocation>;
const total = (r: R, b: string) => r.perBeneficiary.find((p) => p.beneficiaryId === b)?.total;
const split = (r: R, b: string, d: string) => r.splits.find((s) => s.beneficiaryId === b && s.donorId === d);

describe("#44·#53 cap-table 특수관계 대칭 읽기", () => {
  it("[RS-1] 사례4 — 관계를 **증여자 행**(갑·을)에만 표시해도 병 300,000,000 · 정 100,000,000", () => {
    const r = case4({ 갑: ["병", "정"], 을: ["병", "정"] });
    expect(total(r, "병")).toBe(300_000_000);
    expect(split(r, "병", "갑")?.value).toBe(225_000_000);
    expect(split(r, "병", "을")?.value).toBe(75_000_000);
    expect(total(r, "정")).toBe(100_000_000);
    expect(split(r, "정", "갑")?.value).toBe(75_000_000);
    expect(split(r, "정", "을")?.value).toBe(25_000_000);
  });

  it("[RS-2] 긍정 짝 — **수증자 행**(병·정)에만 표시한 종전 입력은 같은 값", () => {
    const r = case4({ 병: ["갑", "을"], 정: ["갑", "을"] });
    expect(total(r, "병")).toBe(300_000_000);
    expect(total(r, "정")).toBe(100_000_000);
    expect(split(r, "정", "을")?.value).toBe(25_000_000);
  });

  it("[RS-3] 혼합 — 병→갑 · 을→병·정 ⇒ 병 300,000,000 · 정 25,000,000(을 몫만) · 정←갑은 특수관계 부재", () => {
    const r = case4({ 병: ["갑"], 을: ["병", "정"] });
    expect(total(r, "병")).toBe(300_000_000);
    expect(total(r, "정")).toBe(25_000_000);
    expect(split(r, "정", "을")?.value).toBe(25_000_000);
    expect(split(r, "정", "갑")?.value).toBe(0);
    expect(split(r, "정", "갑")?.excludedReason).toBe("특수관계 부재(§39①2호)");
  });

  it("[RS-4] 부정 짝 — 어느 행에도 표시가 없으면 0 · 전 분할 「특수관계 부재(§39①2호)」", () => {
    const r = case4({});
    expect(total(r, "병")).toBe(0);
    expect(total(r, "정")).toBe(0);
    expect(r.splits.every((s) => s.value === 0 && s.excludedReason === "특수관계 부재(§39①2호)")).toBe(true);
  });

  it("[RS-5] 저가+실권처리 사례2 — 증여자 행(갑)에만 표시해도 을 175,000,000 · 병 25,000,000 (수증자 행 표시와 동일)", () => {
    const donorSide = case2({ 갑: ["을", "병"] });
    const doneeSide = case2({ 을: ["갑"], 병: ["갑"] });
    expect(total(donorSide, "을")).toBe(175_000_000);
    expect(total(donorSide, "병")).toBe(25_000_000);
    expect(total(doneeSide, "을")).toBe(175_000_000);
    expect(total(doneeSide, "병")).toBe(25_000_000);
    expect(total(donorSide, "소액주주")).toBe(0); // 누구와도 표시 없음
  });

  it("[RS-6] 부정 짝 — 저가 사례2에서 표시가 없으면 을·병 모두 RS-5보다 작다(나목분 제외)", () => {
    const none = case2({});
    expect(total(none, "을")!).toBeLessThan(175_000_000);
    expect(total(none, "병")!).toBeLessThan(25_000_000);
  });
});
