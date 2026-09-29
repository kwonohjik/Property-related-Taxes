import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder, CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * #17 고가 — 혼합 증자(실권주 일부 재배정 + 나머지 실권처리)의 목별 분해 (사용자 결정 2026-09-29: 법문대로 분해).
 *
 * 착수 전 실측(2026-09-29): 증자 전 1주당 10,000 · 인수가 13,000(고가) · 갑 60,000주 전량 포기 ·
 *   을(갑의 특수관계인) 자기분 40,000 + 재배정 30,000 인수 · 나머지 30,000 실권처리.
 *   ㉯ 11,235 · 차액 1,765 ÷ 11,235 = 15.7% < 30% · 갑 delta 74,100,000 < 3억.
 *   ⇒ cap-table이 **나목 게이트(「상증령」§29②4호 30%·3억)를 이익 전체에 걸어 0원**이었다.
 *   같은 사실에서 실권주를 **전부** 재배정하면 90,000,000 — 일부만 재배정하면 0이 되는 절벽이다.
 *
 * 근거:
 *   · 「상증법」§39①2호 가목 — 「해당 법인이 실권주를 배정하는 경우에는 그 실권주를 배정받은 자가 그 실권주를
 *     인수함으로써 그의 특수관계인에 해당하는 신주 인수 포기자가 얻은 이익」. 재배정분은 문언 그대로 가목이다.
 *   · 「상증령」§29②3호 — (인수가 − ㉯) × 포기자의 실권주수 × (포기자의 특수관계인이 인수한 실권주수 ÷ 실권주 총수).
 *     **기준금액 규정이 없다**(30%·3억은 4호 — 나목에만). 집행기준 39-29-7 「이익규모 요건：해당없음」.
 *   · 국세청 재산세과-60(2010.2.1.) — 「실권주 일부는 재배정하고 나머지는 실권처리한 경우 증여이익은 **각각
 *     산정하여 합산**」(저가 사안). 고가 혼합을 직접 다룬 해석례·집행기준 사례는 찾지 못했다(집행기준 전문 ·
 *     taxlaw 「고가 실권주 일부 재배정」 검색 — 재삼46014-559·362는 특수관계 요건만).
 *   ⇒ 재배정분 = §29②3호 산식 그대로(인수자별 = 그 인수자의 재배정 실권주수 비례, 게이트 없음, 특수관계 필요),
 *      나머지(수증자 delta − 가목분)만 나목 게이트를 받는다 — 저가 #17(`[CT-S39-MOK-*]`)과 같은 방식.
 */

function sh(id: string, pre: number, entitled: number, subscribed: number, realloc: number, relatedTo: string[]): CapShareholder {
  return { id, name: id, preShares: pre, entitledShares: entitled, subscribedShares: subscribed, reallocatedShares: realloc, relatedTo };
}
const run = (price: number, shareholders: CapShareholder[]) =>
  calcCapitalIncreaseAllocation({ preIssuePrice: 10_000, newSharePrice: price, direction: "high", shareholders } as CapitalIncreaseAllocationInput);
const total = (r: ReturnType<typeof run>, id: string) => r.perBeneficiary.find((b) => b.beneficiaryId === id)?.total ?? 0;
const split = (r: ReturnType<typeof run>, b: string, d: string) => r.splits.find((s) => s.beneficiaryId === b && s.donorId === d);

describe("[CT-S39-HIGH-MOK] 고가 혼합 — 재배정분(가목)을 나목 게이트에서 분리", () => {
  it("[CT-S39-HIGH-MOK-1] 갑 = 1,765 × 60,000 × 30,000 ÷ 60,000 = 52,950,000(종전 0) · 나머지 21,150,000은 게이트로 0", () => {
    const r = run(13_000, [sh("갑", 60_000, 60_000, 0, 0, ["을"]), sh("을", 40_000, 40_000, 70_000, 30_000, ["갑"])]);
    expect(r.perShareAfter).toBe(11_235);
    expect(total(r, "갑")).toBe(52_950_000);
    expect(split(r, "갑", "을")?.value).toBe(52_950_000);
  });

  it("[CT-S39-HIGH-MOK-2] 증여자별 귀속 — 가목분은 **재배정을 인수한 을**에게만 붙는다(비특수관계 병은 자기분만 인수)", () => {
    // 1,765 × 50,000 × 20,000 ÷ 50,000 = 35,300,000. 손해비례로 나누면 병 몫이 생겨 특수관계 부재로 사라진다.
    const r = run(13_000, [
      sh("갑", 50_000, 50_000, 0, 0, ["을"]),
      sh("을", 25_000, 25_000, 45_000, 20_000, ["갑"]),
      sh("병", 25_000, 25_000, 25_000, 0, []),
    ]);
    expect(total(r, "갑")).toBe(35_300_000);
    expect(split(r, "갑", "을")?.value).toBe(35_300_000);
    expect(split(r, "갑", "병")?.value).toBe(0);
  });

  it("[CT-S39-HIGH-MOK-3] 포기자의 **실권주수**(보유주식수 아님)로 곱한다 — 갑 일부 인수: 1,667 × 40,000 × 20,000 ÷ 40,000 = 33,340,000", () => {
    // 갑 60,000주 중 20,000 인수(실권 40,000) · 을 자기분 40,000 + 재배정 20,000 · 나머지 20,000 실권처리.
    //   ㉯ 11,333 · 갑 delta 46,640,000 — 상한에 걸리지 않는 구성이라 보유주식수(60,000)로 곱하면 값이 달라진다.
    const r = run(13_000, [sh("갑", 60_000, 60_000, 20_000, 0, ["을"]), sh("을", 40_000, 40_000, 60_000, 20_000, ["갑"])]);
    expect(r.perShareAfter).toBe(11_333);
    expect(r.byShareholder.find((b) => b.id === "갑")?.delta).toBe(46_640_000);
    expect(total(r, "갑")).toBe(33_340_000);
  });

  it("[CT-S39-HIGH-MOK-4] 재배정 인수자가 둘이면 재배정 실권주수(10,000 : 20,000) 비례 — floor 잔액은 마지막 행이 흡수해 합계 35,300,000", () => {
    // 포기자 갑 40,000 · 경 20,000(실권주 총수 60,000) · 을 재배정 10,000 · 무 재배정 20,000 · 나머지 30,000 실권처리.
    //   갑 = 1,765 × 40,000 × 30,000 ÷ 60,000 = 35,300,000 → 11,766,666 : 23,533,334(흡수 없으면 1원 소실).
    const r = run(13_000, [
      sh("갑", 40_000, 40_000, 0, 0, ["을", "무"]),
      sh("경", 20_000, 20_000, 0, 0, []),
      sh("을", 20_000, 20_000, 30_000, 10_000, ["갑"]),
      sh("무", 20_000, 20_000, 40_000, 20_000, ["갑"]),
    ]);
    expect(total(r, "갑")).toBe(35_300_000);
    expect(split(r, "갑", "을")?.value).toBe(11_766_666);
    expect(split(r, "갑", "무")?.value).toBe(23_533_334);
  });

  it("[CT-S39-HIGH-MOK-CAP] 가목분은 수증자의 실제 지분 증가분을 넘지 않는다 — 정 원산식 8,031,355 → 495,000", () => {
    // 정은 실권 비율(9,000 ÷ 30,000)이 평균(59,000 ÷ 100,000)보다 낮아 원산식이 delta를 넘는다.
    //   상한이 없으면 나머지(나목분)가 음수가 되고, 그 음수가 게이트에 걸려 사라지면서 **게이트가 세액을 늘린다**.
    const r = run(13_000, [
      sh("갑", 50_000, 50_000, 0, 0, ["을"]),
      sh("정", 30_000, 30_000, 21_000, 0, ["을"]),
      sh("을", 20_000, 20_000, 50_000, 30_000, ["갑", "정"]),
    ]);
    expect(r.byShareholder.find((b) => b.id === "정")?.delta).toBe(495_000);
    expect(total(r, "정")).toBe(495_000);
  });
});

describe("[CT-S39-HIGH-MOK] 짝 — 바뀌면 안 되는 것", () => {
  it("[CT-S39-HIGH-MOK-REL] 가목도 특수관계는 요건이다 — 재배정 인수자가 남이면 0", () => {
    const r = run(13_000, [sh("갑", 60_000, 60_000, 0, 0, []), sh("을", 40_000, 40_000, 70_000, 30_000, [])]);
    expect(total(r, "갑")).toBe(0);
  });

  it("[CT-S39-HIGH-MOK-NOOP-REALLOC] 전량 재배정(실권처리 없음) — 1,500 × 60,000 = 90,000,000 불변", () => {
    const r = run(13_000, [sh("갑", 60_000, 60_000, 0, 0, ["을"]), sh("을", 40_000, 40_000, 100_000, 60_000, ["갑"])]);
    expect(total(r, "갑")).toBe(90_000_000);
  });

  it("[CT-S39-HIGH-MOK-NOOP-RATIO] 차액 30% 이상이면 게이트가 열려 합계 = delta 불변(분해는 귀속만 바꾼다)", () => {
    const r = run(20_000, [sh("갑", 60_000, 60_000, 0, 0, ["을"]), sh("을", 40_000, 40_000, 70_000, 30_000, ["갑"])]);
    expect(total(r, "갑")).toBe(r.byShareholder.find((b) => b.id === "갑")?.delta);
  });
});
