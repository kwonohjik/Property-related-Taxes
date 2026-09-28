/**
 * 「상증법」§41의2 — 초과배당은 **특수관계인 1인 단위**로 계산한다.
 *
 * 원문:
 *   법 §41의2① 「그 최대주주등의 특수관계인이 **본인이** 보유한 주식등에 비하여 높은 금액의 배당등을
 *     받은 경우 … **그 최대주주등의 특수관계인의** 증여재산가액으로 한다」
 *   영 §31의2②1호 「최대주주등의 특수관계인이 배당등을 받은 금액에서 **본인이** 보유한 주식등에 비례하여
 *     배당등을 받을 경우의 그 배당등의 금액을 차감한 가액」(현행 MST 288887)
 *   영 §31의2②2호 「보유한 주식등에 비하여 낮은 금액의 배당등을 받은 **주주등**이 … 적게 배당등을 받은
 *     금액(과소배당금액) 중 최대주주등의 과소배당금액이 차지하는 비율」
 *   「상증칙」 별지 제10호의5서식 — 수증자 1명 단위 신고서. 소득세 상당액 율표가 그 1명의 초과배당금액에 걸린다.
 *
 * 종전 엔진은 `related_party` 행 전원을 **합산**했다:
 *   (1) 과다수령 특수관계인 2명 → 한 사람으로 보아 누진 율표·증여세가 합계에 걸렸다.
 *   (2) 과소수령 특수관계인의 과소분을 ①에서 **상계**하면서 ② 분모에서는 **뺐다**.
 *
 * ⚠️ 비특수관계 과다수령자가 없으면 합계 초과배당금액은 두 방식이 **대수적으로 같다**(배당은 제로섬) —
 *    그래서 특수관계인 1명 픽스처만 가진 기존 anchor(A3·A3-b)는 이 결함을 볼 수 없었다.
 */
import { describe, it, expect } from "vitest";
import { calcExcessDividendGift } from "@/lib/tax-engine/gift-deemed/excess-dividend";
import type { ExcessDividendInput, ShareholderDividend } from "@/lib/tax-engine/gift-deemed/types";

type Row = [id: string, role: ShareholderDividend["role"], pct: number, amt: number, corp?: boolean];
const input = (rows: Row[], extra: Partial<ExcessDividendInput> = {}): ExcessDividendInput => ({
  shareholders: rows.map(([id, role, pct, amt, corp]) => ({
    id, name: id, role, ownershipRatio: { numer: pct, denom: 100 }, actualDividend: amt,
    ...(corp && { isForProfitCorp: true }),
  })),
  dividendDate: new Date("2025-06-30"),
  incomeTaxMode: "undetermined",
  ...extra,
});
const REASON = /영리법인 수증자/;

/** 총배당 10억 · A(최대주주) 50% 0원 · B 25% 7억 · C 25% 3억 → B 4.5억 초과 · C 5천만 초과 */
const BOTH_OVER: Row[] = [["A", "major_shareholder", 50, 0], ["B", "related_party", 25, 700_000_000], ["C", "related_party", 25, 300_000_000]];
/** 총배당 10억 · A 50% 0 · B 20% 5억(3억 초과) · C 20% 1억(1억 과소) · D(비특수관계) 10% 4억(3억 초과) */
const OTHER_OVER: Row[] = [["A", "major_shareholder", 50, 0], ["B", "related_party", 20, 500_000_000], ["C", "related_party", 20, 100_000_000], ["D", "other", 10, 400_000_000]];

describe("§41의2 1인 단위 — 과다수령 특수관계인 2명", () => {
  it("[EDP-1] 기본 대상(첫 수증자 B) — 4.5억 · 소득세 상당액 154,060,000 · 증여재산가액 295,940,000", () => {
    const r = calcExcessDividendGift(input(BOTH_OVER));
    expect(r.excessDividendDetail!.excessDividendAmount).toBe(450_000_000);
    expect(r.excessDividendDetail!.incomeTaxEquivalent).toBe(154_060_000);
    expect(r.deemedGiftValue).toBe(295_940_000); // 종전 합산: 5억 → 325,940,000
    expect(r.excessDividendDetail!.targetDoneeId).toBe("B");
  });

  it("[EDP-2] C를 고르면 C 1인분 — 5천만 · 7,000,000 · 43,000,000", () => {
    const r = calcExcessDividendGift(input(BOTH_OVER, { targetDoneeId: "C" }));
    expect(r.excessDividendDetail!.excessDividendAmount).toBe(50_000_000);
    expect(r.excessDividendDetail!.incomeTaxEquivalent).toBe(7_000_000);
    expect(r.deemedGiftValue).toBe(43_000_000);
    expect(r.excessDividendDetail!.targetDoneeId).toBe("C");
  });

  it("[EDP-3] 수증자별 표 — 전원의 초과배당금액을 담는다(선택과 무관)", () => {
    const d = calcExcessDividendGift(input(BOTH_OVER, { targetDoneeId: "C" })).excessDividendDetail!.donees!;
    expect(d.map((x) => [x.id, x.excessBeforeRatio, x.excessDividendAmount])).toEqual([
      ["B", 450_000_000, 450_000_000],
      ["C", 50_000_000, 50_000_000],
    ]);
  });

  it("[EDP-4] 없는 대상 id(stale)는 첫 수증자 — 합산으로 되돌아가지 않는다", () => {
    const r = calcExcessDividendGift(input(BOTH_OVER, { targetDoneeId: "Z" }));
    expect(r.excessDividendDetail!.excessDividendAmount).toBe(450_000_000);
  });
});

describe("§41의2 ② 분모 — 과소수령 특수관계인도 「과소배당을 받은 주주등」이다", () => {
  it("[EDP-5] 비특수관계 과다수령자가 있으면 — B 3억 × 5억/(5억+1억) = 250,000,000 (종전 상계: 200,000,000)", () => {
    const r = calcExcessDividendGift(input(OTHER_OVER));
    const d = r.excessDividendDetail!;
    expect(d.excessBeforeRatio).toBe(300_000_000);
    expect(d.ratioNumer).toBe(500_000_000);
    expect(d.ratioDenom).toBe(600_000_000);
    expect(d.excessDividendAmount).toBe(250_000_000);
    expect(d.donees!.map((x) => x.id)).toEqual(["B"]); // 과소수령 C는 수증자가 아니다
  });

  it("[EDP-6] 긍정 짝: 비특수관계 과다수령자가 없으면 상계·분모 두 방식이 같다 — B 3억 (종전과 동일)", () => {
    const r = calcExcessDividendGift(input([["A", "major_shareholder", 50, 200_000_000], ["B", "related_party", 25, 700_000_000], ["C", "related_party", 25, 100_000_000]]));
    expect(r.excessDividendDetail!.excessDividendAmount).toBe(300_000_000);
  });

  it("[EDP-7] 긍정 짝: 특수관계인 1명(교재 A3) — 63,000,000 그대로", () => {
    const r = calcExcessDividendGift(input([["1", "major_shareholder", 60, 0], ["2", "related_party", 30, 100_000_000], ["3", "other", 10, 5_000_000]]));
    expect(r.excessDividendDetail!.excessDividendAmount).toBe(63_000_000);
  });
});

describe("§4의2①·③ — 영리법인 특수관계인 행", () => {
  it("[EDP-8] 대상이 영리법인이면 과세 제외 · 금액은 「제외 전」으로 보존", () => {
    const r = calcExcessDividendGift(input(BOTH_OVER.map((x) => (x[0] === "B" ? [...x.slice(0, 4), true] : x)) as Row[], { targetDoneeId: "B" }));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toMatch(REASON);
    expect(r.breakdown.some((b) => /증여재산가액/.test(b.label))).toBe(false);
    expect(r.breakdown.find((b) => b.label.includes("제외 전"))?.amount).toBe(295_940_000);
    expect(r.excessDividendDetail!.donees!.find((x) => x.id === "B")!.isForProfitCorp).toBe(true);
  });

  it("[EDP-9] 대상을 고르지 않으면 영리법인이 아닌 첫 수증자(C)를 계산한다", () => {
    const r = calcExcessDividendGift(input(BOTH_OVER.map((x) => (x[0] === "B" ? [...x.slice(0, 4), true] : x)) as Row[]));
    expect(r.excessDividendDetail!.targetDoneeId).toBe("C");
    expect(r.deemedGiftValue).toBe(43_000_000);
  });

  it("[EDP-10] 긍정 짝: 최대주주·기타 주주 행의 표지는 무효 — 결과 불변", () => {
    const base = calcExcessDividendGift(input(OTHER_OVER));
    const flagged = calcExcessDividendGift(input(OTHER_OVER.map((x) => (x[0] === "A" || x[0] === "D" ? [...x.slice(0, 4), true] : x)) as Row[]));
    expect(flagged.deemedGiftValue).toBe(base.deemedGiftValue);
    expect(flagged.applied).toBe(true);
    // 금액만 보면 못 잡는다 — 과다수령한 기타 주주 D가 수증자 목록에 끼어도 기본 대상은 B라 금액이 같다(ED8)
    expect(flagged.excessDividendDetail!.donees).toEqual(base.excessDividendDetail!.donees);
  });
});

describe("§41의2 대상 선택 — 고른 사람을 조용히 바꾸지 않는다", () => {
  it("[EDP-11] 초과수령이 없는 특수관계인(C)을 고르면 다른 사람(B)을 계산하지 않고 「초과배당 없음」", () => {
    const r = calcExcessDividendGift(input(OTHER_OVER, { targetDoneeId: "C" }));
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.excessDividendDetail!.targetDoneeId).toBe("C");
    expect(r.excessDividendDetail!.excessDividendAmount).toBe(0);
    expect(r.exclusionReason).toContain("선택한 특수관계인");
    expect(r.excessDividendDetail!.donees!.map((x) => x.id)).toEqual(["B"]); // 표는 그대로
  });
});
