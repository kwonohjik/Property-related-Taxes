/**
 * `offsetLosses` characterization — §102② · 시행령 §167의2① 통산 정본의 **현재 거동 고정**
 *
 * 계획서: docs/02-design/features/stock-102-2-loss-offset-and-103-deduction-order.plan.md §9.1
 *
 * ## 왜 필요한가
 *
 * 주식 aggregate에 §102② 통산을 붙이려면 이 부동산 정본을 무의존 코어로 **추출**해야 한다
 * (설계 A — dual truth 방지). 그런데 이 함수를 덮는 기존 테스트는
 * `transfer-tax-aggregate.test.ts` 20건 + `multi-parcel-loss-offset.test.ts` 3건뿐이고,
 * 통산 단언이 **`toBeGreaterThan(0)`·`some(scope==="same_group")` 수준**이다.
 * 그 강도로는 추출 과정에서 배분액이 바뀌어도 **전부 통과한다** — 안전망이 아니다.
 *
 * ⇒ 여기서는 **정확한 배분액과 불변식**을 고정한다. 리팩터 전후로 이 파일이 통째로 통과해야 한다.
 * 값의 「법령상 옳음」을 새로 주장하지 않는다 — **현재 거동의 사진**이다(characterization).
 * 법령 정합 자체는 `transfer-tax-aggregate.test.ts` T-M02·T-M03·T-M07·T-M15가 다룬다.
 *
 * ## 대상 함수가 실제로 읽는 것
 *
 * `offsetLosses`는 `AssetRecord`에서 **4개만** 읽는다 —
 * `result.isExempt` · `rateGroup` · `income` · `item.propertyId`.
 * 그래서 엔진을 돌리지 않고 최소 레코드로 순수 검증할 수 있다(그게 이 파일이 빠른 이유다).
 *
 * ## 알고리즘 요약 (영 §167의2①)
 *
 *   1호 — 같은 세율군 안에서 먼저 통산. 그룹별 `pool = min(Σ이익, Σ차손)`.
 *         이익 쪽 배분은 이익 비례 floor, **마지막 이익 자산이 잔액 흡수**.
 *         차손 쪽 귀속도 차손 비례 floor, **마지막 차손 자산이 잔액 흡수**.
 *   2호 — 그룹별 잔여 차손을 남은 이익에 **pro-rata 안분**. 같은 잔액 흡수 규약.
 *   잔여 차손은 **소멸**(이월 불인정).
 */

import { describe, it, expect } from "vitest";
import { offsetLosses, type AssetRecord } from "@/lib/tax-engine/transfer-tax-aggregate-helpers";
import type { RateGroup } from "@/lib/tax-engine/types/transfer-aggregate.types";

/**
 * 최소 AssetRecord — `offsetLosses`가 읽는 4개 필드만 채운다.
 * 나머지는 이 함수가 건드리지 않으므로 캐스팅한다(픽스처를 크게 만들면 무엇이 load-bearing인지 흐려진다).
 */
function rec(propertyId: string, rateGroup: RateGroup, income: number, isExempt = false): AssetRecord {
  return {
    item: { propertyId },
    result: { isExempt },
    rateGroup,
    income,
  } as unknown as AssetRecord;
}

/** table의 amount 총합 — 배분된 차손 총액 */
function tableSum(rows: ReturnType<typeof offsetLosses>["lossOffsetTable"]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

// ============================================================
// 불변식 — 어떤 입력에서도 성립해야 한다 (리팩터 안전망의 핵심)
// ============================================================

function assertInvariants(records: AssetRecord[], out: ReturnType<typeof offsetLosses>) {
  const n = records.length;

  // I-1: 배열 길이가 입력과 1:1
  expect(out.lossOffsetFromSame).toHaveLength(n);
  expect(out.lossOffsetFromOther).toHaveLength(n);
  expect(out.incomeAfterOffset).toHaveLength(n);

  // I-2: 자산이 받은 차손 총액 == table amount 총액 (이중계상·누락 없음)
  const received = out.lossOffsetFromSame.reduce((s, v) => s + v, 0)
    + out.lossOffsetFromOther.reduce((s, v) => s + v, 0);
  expect(tableSum(out.lossOffsetTable)).toBe(received);

  // I-3: 배분 + 소멸 == 총 차손 (차손이 증발하거나 늘어나지 않는다)
  const totalLoss = records
    .filter((r) => !r.result.isExempt && r.income < 0)
    .reduce((s, r) => s + Math.abs(r.income), 0);
  expect(received + out.unusedLoss).toBe(totalLoss);

  // I-4: incomeAfterOffset은 음수가 될 수 없고, 차손·비과세 자산은 0
  records.forEach((r, i) => {
    expect(out.incomeAfterOffset[i]).toBeGreaterThanOrEqual(0);
    if (r.result.isExempt || r.income < 0) expect(out.incomeAfterOffset[i]).toBe(0);
  });

  // I-5: 통산 후 총소득 == 통산 전 총이익 − 배분된 차손
  const totalGain = records
    .filter((r) => !r.result.isExempt && r.income > 0)
    .reduce((s, r) => s + r.income, 0);
  expect(out.incomeAfterOffset.reduce((s, v) => s + v, 0)).toBe(totalGain - received);

  // I-6: 배분액은 음수가 아니다
  out.lossOffsetTable.forEach((row) => expect(row.amount).toBeGreaterThan(0));
}

describe("C-1: 같은 세율군 1:1 통산 (영 §167의2①1호)", () => {
  const records = [
    rec("A", "progressive", 500_000_000),
    rec("B", "progressive", -200_000_000),
  ];
  const out = offsetLosses(records);

  it("C-1-1: 차손 전액이 같은 군 이익에 귀속", () => {
    expect(out.lossOffsetFromSame).toEqual([200_000_000, 0]);
    expect(out.lossOffsetFromOther).toEqual([0, 0]);
  });

  it("C-1-2: 통산 후 소득 3억 · 차손 자산은 0", () => {
    expect(out.incomeAfterOffset).toEqual([300_000_000, 0]);
  });

  it("C-1-3: table 1행 · scope=same_group · 잔여 차손 0", () => {
    expect(out.lossOffsetTable).toEqual([
      { fromPropertyId: "B", toPropertyId: "A", amount: 200_000_000, scope: "same_group" },
    ]);
    expect(out.unusedLoss).toBe(0);
  });

  it("C-1-inv", () => assertInvariants(records, out));
});

describe("C-2: 같은 군 이익 2 · 차손 1 — 이익 비례 floor + 마지막 잔액 흡수", () => {
  // 이익 100 · 200 (합 300), 차손 100 → pool 100
  // A: floor(100 × 100 / 300) = 33 ... 마지막(B)이 100 − 33 = 67 흡수
  const records = [
    rec("A", "progressive", 100),
    rec("B", "progressive", 200),
    rec("C", "progressive", -100),
  ];
  const out = offsetLosses(records);

  it("C-2-1: 잔액 흡수로 배분 합이 pool과 정확히 일치", () => {
    expect(out.lossOffsetFromSame).toEqual([33, 67, 0]);
    expect(out.lossOffsetFromSame.reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("C-2-2: 통산 후 소득", () => {
    expect(out.incomeAfterOffset).toEqual([67, 133, 0]);
  });

  it("C-2-inv", () => assertInvariants(records, out));
});

describe("C-3: 같은 군 이익 1 · 차손 2 — 차손 측 귀속 비례 + 잔액 흡수", () => {
  // 이익 300, 차손 100 + 200 (합 300) → pool 300
  // 차손 귀속: C floor(100 × 300 / 300) = 100, 마지막 D가 300 − 100 = 200
  const records = [
    rec("A", "progressive", 300),
    rec("C", "progressive", -100),
    rec("D", "progressive", -200),
  ];
  const out = offsetLosses(records);

  it("C-3-1: 이익 자산이 차손 전액 수령", () => {
    expect(out.lossOffsetFromSame).toEqual([300, 0, 0]);
    expect(out.incomeAfterOffset).toEqual([0, 0, 0]);
  });

  it("C-3-2: table이 차손 자산별로 쪼개져 기록된다", () => {
    expect(out.lossOffsetTable).toEqual([
      { fromPropertyId: "C", toPropertyId: "A", amount: 100, scope: "same_group" },
      { fromPropertyId: "D", toPropertyId: "A", amount: 200, scope: "same_group" },
    ]);
  });

  it("C-3-inv", () => assertInvariants(records, out));
});

describe("C-4: 타군 안분 (영 §167의2①2호)", () => {
  // 누진 이익 500, 단기군 차손 200 → 같은 군엔 상대가 없으므로 전액 타군 안분
  const records = [
    rec("A", "progressive", 500),
    rec("B", "short_term", -200),
  ];
  const out = offsetLosses(records);

  it("C-4-1: fromSame이 아니라 fromOther로 잡힌다", () => {
    expect(out.lossOffsetFromSame).toEqual([0, 0]);
    expect(out.lossOffsetFromOther).toEqual([200, 0]);
  });

  it("C-4-2: scope=other_group", () => {
    expect(out.lossOffsetTable).toEqual([
      { fromPropertyId: "B", toPropertyId: "A", amount: 200, scope: "other_group" },
    ]);
    expect(out.incomeAfterOffset).toEqual([300, 0]);
  });

  it("C-4-inv", () => assertInvariants(records, out));
});

describe("C-5: 1호 우선 — 같은 군을 먼저 쓰고 남은 것만 타군으로", () => {
  // 누진: 이익 100 · 차손 60 → 같은 군에서 60 통산
  // 단기: 이익 200
  // 비사업용: 차손 100 → 타군 안분 (남은 이익: 누진 40 + 단기 200 = 240)
  //   누진 A 몫 = floor(40 × 100 / 240) = 16, 마지막 단기 C가 100 − 16 = 84
  const records = [
    rec("A", "progressive", 100),
    rec("B", "progressive", -60),
    rec("C", "short_term", 200),
    rec("D", "non_business_land", -100),
  ];
  const out = offsetLosses(records);

  it("C-5-1: 같은 군 통산이 먼저", () => {
    expect(out.lossOffsetFromSame).toEqual([60, 0, 0, 0]);
  });

  it("C-5-2: 잔여 차손이 남은 이익에 pro-rata", () => {
    expect(out.lossOffsetFromOther).toEqual([16, 0, 84, 0]);
  });

  it("C-5-3: 통산 후 소득 · 잔여 차손 0", () => {
    expect(out.incomeAfterOffset).toEqual([24, 0, 116, 0]);
    expect(out.unusedLoss).toBe(0);
  });

  it("C-5-inv", () => assertInvariants(records, out));
});

describe("C-6: 차손이 이익을 초과 — 잔여 소멸(이월 불인정)", () => {
  const records = [
    rec("A", "progressive", 100_000_000),
    rec("B", "progressive", -300_000_000),
  ];
  const out = offsetLosses(records);

  it("C-6-1: 이익만큼만 통산되고 나머지는 unusedLoss", () => {
    expect(out.lossOffsetFromSame).toEqual([100_000_000, 0]);
    expect(out.unusedLoss).toBe(200_000_000);
  });

  it("C-6-2: 통산 후 소득 전부 0", () => {
    expect(out.incomeAfterOffset).toEqual([0, 0]);
  });

  it("C-6-inv", () => assertInvariants(records, out));
});

describe("C-7: 비과세 자산은 통산에서 제외 (상속증여세과-209)", () => {
  // 비과세 차손은 과세분과 통산하지 못한다.
  const records = [
    rec("A", "progressive", 500),
    rec("EX", "progressive", -400, true),
  ];
  const out = offsetLosses(records);

  it("C-7-1: 비과세 차손은 배분되지 않는다", () => {
    expect(out.lossOffsetFromSame).toEqual([0, 0]);
    expect(out.lossOffsetFromOther).toEqual([0, 0]);
    expect(out.lossOffsetTable).toEqual([]);
  });

  it("C-7-2: 이익은 그대로 · 비과세 자산은 0", () => {
    expect(out.incomeAfterOffset).toEqual([500, 0]);
  });

  it("C-7-3: 비과세 차손은 unusedLoss에도 잡히지 않는다", () => {
    expect(out.unusedLoss).toBe(0);
  });

  it("C-7-inv", () => assertInvariants(records, out));
});

describe("C-8: 비과세 **이익** 자산도 통산 대상에서 빠진다", () => {
  // 비과세 이익이 차손을 흡수해버리면 과세분이 부당하게 커진다 — 제외가 맞다.
  const records = [
    rec("EX", "progressive", 1_000, true),
    rec("A", "progressive", 100),
    rec("B", "progressive", -100),
  ];
  const out = offsetLosses(records);

  it("C-8-1: 차손은 과세 이익에만 귀속", () => {
    expect(out.lossOffsetFromSame).toEqual([0, 100, 0]);
    expect(out.incomeAfterOffset).toEqual([0, 0, 0]);
  });

  it("C-8-inv", () => assertInvariants(records, out));
});

describe("C-9: 통산할 상대가 없는 경우 — no-op", () => {
  it("C-9-1: 이익만 있으면 아무것도 배분되지 않는다", () => {
    const records = [rec("A", "progressive", 100), rec("B", "short_term", 200)];
    const out = offsetLosses(records);
    expect(out.lossOffsetTable).toEqual([]);
    expect(out.unusedLoss).toBe(0);
    expect(out.incomeAfterOffset).toEqual([100, 200]);
    assertInvariants(records, out);
  });

  it("C-9-2: 차손만 있으면 전액 소멸", () => {
    const records = [rec("A", "progressive", -100), rec("B", "short_term", -200)];
    const out = offsetLosses(records);
    expect(out.lossOffsetTable).toEqual([]);
    expect(out.unusedLoss).toBe(300);
    expect(out.incomeAfterOffset).toEqual([0, 0]);
    assertInvariants(records, out);
  });

  it("C-9-3: 빈 입력", () => {
    const out = offsetLosses([]);
    expect(out).toEqual({
      lossOffsetTable: [],
      lossOffsetFromSame: [],
      lossOffsetFromOther: [],
      incomeAfterOffset: [],
      unusedLoss: 0,
    });
  });
});

describe("C-10: 나눠떨어지지 않는 3분할 — floor 잔차가 마지막에 몰린다", () => {
  // 이익 1·1·1 (합 3), 차손 2 → pool 2
  // A: floor(1 × 2 / 3) = 0, B: floor(1 × 2 / 3) = 0, 마지막 C가 2 − 0 = 2
  const records = [
    rec("A", "progressive", 1),
    rec("B", "progressive", 1),
    rec("C", "progressive", 1),
    rec("D", "progressive", -2),
  ];
  const out = offsetLosses(records);

  it("C-10-1: 잔차가 마지막 이익 자산에 흡수된다", () => {
    expect(out.lossOffsetFromSame).toEqual([0, 0, 2, 0]);
  });

  it("C-10-2: 마지막 자산 소득이 음수로 내려가지 않는다 (clamp)", () => {
    // C의 이익은 1인데 2를 배정받는다 → Math.max(0, …)로 0에 멈춘다.
    // 🔴 이 순간 I-5(총소득 = 총이익 − 배분액)가 깨진다: 3 − 2 = 1 이어야 하는데 실제는 2.
    //    현재 거동을 그대로 고정한다 — 추출 리팩터에서 조용히 달라지면 안 되기 때문이다.
    expect(out.incomeAfterOffset).toEqual([1, 1, 0, 0]);
    expect(out.incomeAfterOffset.reduce((s, v) => s + v, 0)).toBe(2);
  });

  it("C-10-3: 배분 총액과 unusedLoss는 정합", () => {
    expect(tableSum(out.lossOffsetTable)).toBe(2);
    expect(out.unusedLoss).toBe(0);
  });
});

describe("C-11: 타군 안분에서 차손 그룹이 둘 — 그룹별 잔액 흡수", () => {
  // 이익: 누진 1000
  // 차손: 단기 -300, 비사업용 -200 (합 500) → 전액 타군 안분
  const records = [
    rec("A", "progressive", 1_000),
    rec("B", "short_term", -300),
    rec("C", "non_business_land", -200),
  ];
  const out = offsetLosses(records);

  it("C-11-1: 이익 자산이 500 수령", () => {
    expect(out.lossOffsetFromOther).toEqual([500, 0, 0]);
    expect(out.incomeAfterOffset).toEqual([500, 0, 0]);
  });

  it("C-11-2: table이 차손 그룹별로 쪼개진다", () => {
    const byFrom = Object.fromEntries(
      out.lossOffsetTable.map((r) => [r.fromPropertyId, r.amount]),
    );
    expect(byFrom).toEqual({ B: 300, C: 200 });
    expect(out.lossOffsetTable.every((r) => r.scope === "other_group")).toBe(true);
  });

  it("C-11-inv", () => assertInvariants(records, out));
});

describe("C-13: 🐛 2호 안분에서 **비과세 차손이 table에 끼어든다** (현행 거동 고정)", () => {
  // progressive: 과세 차손 −100 + **비과세** 차손 −50, 이익 없음 → 1호 통산 0, 잔여 차손 100
  // short_term:  이익 1000 → 2호 안분으로 100 흡수
  //
  // 🔴 2호의 차손 귀속 루프(`lossIdxInGroup`)는 `rateGroup === lossGroup && income < 0`만 보고
  //    **`isExempt`를 걸러내지 않는다**. 그래서 분모 `groupLossTotal`이 비과세 차손 50까지
  //    포함한 150이 되고, 마지막 항목(비과세 자산)이 잔액 34를 흡수해 **table에 등장한다**.
  //
  // 영향 범위: `fromSame`·`fromOther`·`incomeAfterOffset`·`unusedLoss`는 **영향 없다**
  //   (그 값들은 `remainingLossByGroup` 기준이고 그쪽은 비과세를 이미 제외했다).
  //   달라지는 것은 **table의 귀속 표시**뿐이다 — 즉 세액이 아니라 내역 표시 결함이다.
  //
  // ⚠️ 여기서 고치지 않는다. Phase 3은 **순수 추출**이고, 추출 중에 거동을 바꾸면
  //    「전후 동일」이라는 검증 전제가 무너진다. 별건으로 기록만 한다.
  const records = [
    rec("L", "progressive", -100),
    rec("EXL", "progressive", -50, true),
    rec("G", "short_term", 1_000),
  ];
  const out = offsetLosses(records);

  it("C-13-1: 세액에 쓰이는 값들은 비과세를 제외한다", () => {
    expect(out.lossOffsetFromOther).toEqual([0, 0, 100]);
    expect(out.incomeAfterOffset).toEqual([0, 0, 900]);
    expect(out.unusedLoss).toBe(0);
  });

  it("C-13-2: 🐛 그런데 table에는 비과세 자산이 34로 등장한다", () => {
    expect(out.lossOffsetTable).toEqual([
      { fromPropertyId: "L", toPropertyId: "G", amount: 66, scope: "other_group" },
      { fromPropertyId: "EXL", toPropertyId: "G", amount: 34, scope: "other_group" },
    ]);
  });

  it("C-13-3: 그 결과 I-2(자산 수령액 == table 합) 불변식이 깨진다", () => {
    const received =
      out.lossOffsetFromSame.reduce((s, v) => s + v, 0) +
      out.lossOffsetFromOther.reduce((s, v) => s + v, 0);
    // 우연히 일치한다 — 마지막 잔액 흡수가 합계는 맞춰주기 때문. 귀속처만 틀렸다.
    expect(tableSum(out.lossOffsetTable)).toBe(received);
  });
});

describe("C-12: 5개 세율군 전부 등장 — 그룹 분리가 유지되는가", () => {
  const records = [
    rec("P", "progressive", 1_000),
    rec("S", "short_term", -400),
    rec("M", "multi_house_surcharge", 800),
    rec("N", "non_business_land", -300),
    rec("U", "unregistered", 600),
  ];
  const out = offsetLosses(records);

  it("C-12-1: 같은 군 상대가 없어 전부 타군 안분", () => {
    expect(out.lossOffsetFromSame).toEqual([0, 0, 0, 0, 0]);
    expect(out.lossOffsetFromOther.reduce((s, v) => s + v, 0)).toBe(700);
  });

  it("C-12-2: 이익 3건에 pro-rata (1000 : 800 : 600 = 합 2400)", () => {
    // P floor(1000 × 700 / 2400) = 291, M floor(800 × 700 / 2400) = 233,
    // 마지막 U가 700 − 291 − 233 = 176
    expect(out.lossOffsetFromOther).toEqual([291, 0, 233, 0, 176]);
  });

  it("C-12-inv", () => assertInvariants(records, out));
});
