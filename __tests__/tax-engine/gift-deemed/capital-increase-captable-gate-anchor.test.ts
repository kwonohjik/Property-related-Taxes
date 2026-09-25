import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapShareholder, CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 2-C — cap-table 게이트 2종 (리뷰 #15·#17)
 *
 * **#15 3억 기준금액을 「수증자 delta 총액」이 아니라 「특수관계 증여자분 합계」로**
 *   「상증령」§29②2호 다목·4호는 기준금액 판정 대상을 **특수관계인 몫으로 가중한 뒤의 금액**으로
 *   정한다. 코드는 분할 **전** `b.delta`로 판정해, 비특수관계 증여자 몫까지 합산된 금액이
 *   3억을 넘으면 게이트가 열렸다. `b.delta ≥ 특수관계 가중액`이 항상 성립하므로 오차는
 *   **게이트가 헐거워지는 한 방향**으로만 난다 ⇒ 과다과세.
 *
 * **#17 나목 전용 게이트가 가·다·라목 몫까지 덮는다**
 *   「상증법」§39①1호 가목(실권주 배정)·다목(제3자 직접배정)·라목(초과배정)은 **특수관계 문언이
 *   없고**, 「상증령」§29②1호에는 **기준금액 규정 자체가 없다**. 기준금액은 §29②2호(나목)·4호에만 있다.
 *   그런데 코드의 `hasForfeitProcessing`은 증자 **전체 스칼라**라, 실권처리분이 하나라도 섞이면
 *   같은 수증자의 재배정분(가·다·라목)까지 나목 게이트를 뒤집어썼다 ⇒ 과소과세.
 *   국세청 재산세과-60(2010.2.1.) — 「일부 재배정 + 나머지 실권처리」는 **각각 산정하여 합산**한다.
 *
 * 분리 기준은 이미 입력에 있다 — 수증자의 `reallocatedShares`(가·다·라목분)와 나머지(나목분).
 * 가·다·라목분 = (㉯ − 인수가) × 배정받은 실권주수 = §29②1호 가목 산식 그 자체다.
 */

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
const totals = (r: ReturnType<typeof calcCapitalIncreaseAllocation>) =>
  new Map(r.perBeneficiary.map((b) => [b.beneficiaryId, b.total]));

describe("[CT-S39-GATE-SPLIT] #15 3억 판정을 특수관계 증여자 분할 후 값으로", () => {
  // 저가 — 갑(비특수관계)·병(특수관계) 둘 다 전량 실권, 을이 자기분만 인수.
  //   ㉯(실제) 11,333 · 을 delta 333,000,000 ≥ 3억 ⇒ 종전에는 게이트가 열렸다.
  //   30% 축은 균등 기준선 11,000·차액 1,000 < 3,300이라 미충족(2-B 반영).
  //   특수관계 증여자(병) 귀속분만 보면 66,600,000 < 3억 ⇒ 법정 0.
  it("[CT-S39-GATE-SPLIT-LOW] 저가: 비특수관계 증여자 몫이 3억을 밀어올리던 것 → 0", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 12_000,
      newSharePrice: 10_000,
      shareholders: [
        sh("갑", 400_000, 400_000, 0, 0, []), // 전량 실권 · 을과 비특수관계
        sh("병", 100_000, 100_000, 0, 0, ["을"]), // 전량 실권 · 을과 특수관계
        sh("을", 500_000, 500_000, 500_000, 0, ["병"]), // 자기분만 인수 (수증자)
      ],
    });
    expect(r.perShareAfter).toBe(11_333);
    expect(r.byShareholder.find((b) => b.id === "을")!.delta).toBe(333_000_000);
    expect(totals(r).get("을")).toBe(0);
  });

  // 고가 — 병(포기자)이 수증자. 갑(특수관계 인수자) 250,000,000 + 을(비특수관계) 50,000,000.
  //   병 delta는 정확히 300,000,000이라 종전 게이트는 `< 3억`이 거짓이 되어 열렸다.
  //   특수관계 증여자(갑) 귀속분 250,000,000 < 3억 ⇒ 법정 0.
  it("[CT-S39-GATE-SPLIT-HIGH] 고가: 특수관계 증여자분 250,000,000만으로 판정 → 0", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "high",
      preIssuePrice: 10_000,
      newSharePrice: 12_000,
      shareholders: [
        sh("갑", 500_000, 500_000, 500_000, 0, ["병"]),
        sh("을", 100_000, 100_000, 100_000, 0, []), // 비특수관계 인수자
        sh("병", 400_000, 400_000, 0, 0, ["갑"]), // 전량 실권 (수증자)
      ],
    });
    expect(r.perShareAfter).toBe(10_750);
    expect(r.byShareholder.find((b) => b.id === "병")!.delta).toBe(300_000_000);
    expect(totals(r).get("병")).toBe(0);
  });

  // 긍정 짝 — 특수관계 증여자분만으로 3억 이상이면 그대로 과세된다(게이트를 조이기만 하는 것이 아님).
  it("[CT-S39-GATE-SPLIT-KEEP] 긍정 짝: 특수관계 증여자분이 3억 이상이면 과세 유지", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "high",
      preIssuePrice: 10_000,
      newSharePrice: 12_000,
      shareholders: [
        sh("갑", 500_000, 500_000, 500_000, 0, ["병"]),
        sh("을", 100_000, 100_000, 100_000, 0, ["병"]), // 이번엔 을도 특수관계
        sh("병", 400_000, 400_000, 0, 0, ["갑", "을"]),
      ],
    });
    expect(totals(r).get("병")).toBe(300_000_000);
  });
});

describe("[CT-S39-MOK-SPLIT] #17 혼합 증자 — 가·다·라목 몫을 나목 게이트에서 분리", () => {
  // ⓐ 특수관계 게이트 누수 — 교재 사례2 구조에서 relatedTo를 전부 비운다.
  //   을의 재배정 10,000주분은 §39①1호 **가목**이라 특수관계가 요건이 아니다.
  //   법정 가목분 = (㉯ 22,500 − 10,000) × 10,000 = 125,000,000.
  //   병·소액주주는 재배정분이 없어 순수 나목분이므로 0이 법령상 정답이다(긍정 짝 겸용).
  it("[CT-S39-MOK-RELATION] 저가 가목분은 특수관계 부재에도 과세 — 125,000,000", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 30_000,
      newSharePrice: 10_000,
      shareholders: [
        sh("갑", 30_000, 30_000, 0, 0, []),
        sh("을", 10_000, 10_000, 20_000, 10_000, []), // 자기분 10,000 + 재배정 10,000
        sh("병", 5_000, 5_000, 5_000, 0, []),
        sh("소액주주", 5_000, 5_000, 5_000, 0, []),
      ],
    });
    expect(r.perShareAfter).toBe(22_500);
    expect(totals(r).get("을")).toBe(125_000_000);
    expect(totals(r).get("병")).toBe(0); // 순수 나목분 + 특수관계 부재 ⇒ 0이 정답
    expect(totals(r).get("소액주주")).toBe(0);
  });

  // ⓑ 기준금액 게이트 누수 — 전원 특수관계, 이익이 전부 3억 미만이라 나목분은 전액 배제되지만
  //   §29②1호에는 기준금액이 없으므로 가목분 93,700은 살아남아야 한다.
  it("[CT-S39-MOK-THRESHOLD] 저가 가목분은 3억 미만이어도 과세 — 93,700", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 11_500,
      newSharePrice: 10_000,
      shareholders: [
        sh("갑", 300, 300, 0, 0, ["을", "병"]),
        sh("을", 100, 100, 200, 100, ["갑"]),
        sh("병", 100, 100, 100, 0, ["갑"]),
      ],
    });
    expect(r.perShareAfter).toBe(10_937);
    expect(r.byShareholder.find((b) => b.id === "을")!.delta).toBe(131_100);
    expect(totals(r).get("을")).toBe(93_700); // 가목분만 — 나목분 37,400은 3억 미만으로 배제
    expect(totals(r).get("병")).toBe(0); // 순수 나목분 ⇒ 배제가 정답
  });
});

/**
 * 가목분 상한 — 「(㉯ − 인수가) × 배정받은 실권주수」가 수증자의 실제 지분 증가분(delta)을
 * **넘을 수 있다**. 증자 전 보유분이 큰 주주가 재배정분만 인수하면 보유분 희석손실이
 * 재배정 이익을 깎기 때문이다. 상한을 두지 않으면 나목분이 **음수**가 되고, 그 음수가
 * 기준금액 게이트에 걸려 사라지면서 **게이트가 세액을 늘리는** 뒤집힌 결과가 나온다.
 */
describe("[CT-S39-MOK-CAP] 가목분은 수증자의 실제 지분 증가분을 넘지 않는다", () => {
  // ㉮ 30,000 · 인수가 25,000 · 을은 자기 배정분을 포기하고 재배정분 10,000주만 인수.
  //   ㉯ 29,761 · 을 delta 23,710,000 · 미상한 가목분 47,610,000(= 4,761 × 10,000).
  //   30% 축은 균등 기준선 29,545 · 차액 4,545 < 8,863이라 미충족 ⇒ 나목분에 기준금액 게이트가 걸린다.
  it("상한이 없으면 게이트가 세액을 23,710,000 → 47,610,000으로 **늘린다**", () => {
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 30_000,
      newSharePrice: 25_000,
      shareholders: [
        sh("갑", 100_000, 10_000, 0, 0, ["을"]),
        sh("을", 100_000, 10_000, 10_000, 10_000, ["갑"]), // 자기분 포기 + 재배정 10,000 인수
      ],
    });
    expect(r.perShareAfter).toBe(29_761);
    expect(r.byShareholder.find((b) => b.id === "을")!.delta).toBe(23_710_000);
    expect(totals(r).get("을")).toBe(23_710_000);
  });
});

/** 전량 재배정·전량 실권처리(혼합 아님)에서는 현행과 같은 값이어야 한다 — C1·C3 구조 재확인. */
describe("[CT-S39-MOK-NOOP] 혼합이 아닌 구성은 목별 분해에 영향받지 않는다", () => {
  const c1: CapitalIncreaseAllocationInput = {
    direction: "low",
    preIssuePrice: 30_000,
    newSharePrice: 10_000,
    shareholders: [
      sh("갑", 25_000, 25_000, 0, 0, ["을"]),
      sh("을", 15_000, 15_000, 40_000, 25_000, ["갑"]),
      sh("소액주주", 10_000, 10_000, 10_000, 0, []),
    ],
  };
  it("[CT-S39-MOK-NOOP-REALLOC] 전량 재배정 — 을 250,000,000 불변", () => {
    expect(totals(calcCapitalIncreaseAllocation(c1)).get("을")).toBe(250_000_000);
  });
});
