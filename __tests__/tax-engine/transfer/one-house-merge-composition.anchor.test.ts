/**
 * anchor — §155④⑤ 합가 의제의 **합가 전 보유 구성** (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-merge-house-link.plan.md` §4-3 · 케이스 매트릭스 M-1~M-9.
 *
 * 법문(소득세법 시행령 §155⑤, MST 286211): 「1주택을 보유하는 자가 1주택을 보유하는 자와 혼인함으로써
 * 1세대가 2주택을 보유하게 되는 경우」. 기획재정부 조세정책과-1199(2024.6.25.): 혼인합가 요건은
 * 「양도일 현재가 아닌 **혼인합가 당시** 주택수로」 판정한다.
 *
 * 종전 술어는 세대 주택 수와 **양도 주택**의 취득일만 봤다 — 다른 주택을 혼인 **후**에 취득했어도
 * 비과세였다(probe 실측: 혼인 2020-01-01 · 다른 주택 2022-06-01 → `isExempt: true`).
 *
 * 3주택 성립 구성의 근거:
 * - (1, 2, 0) 상대가 일시적 2주택 — 사전-2026-법규재산-0643(2026.6.8.)
 * - (2, 1, 0) 양도자가 일시적 2주택 — 기본통칙 89-155…2①
 * - (1, 1, 1) 합가 후 신규 주택 — 서면-2022-법규재산-5124(2025.6.18.)
 */
import { describe, it, expect } from "vitest";
import { checkExemption } from "@/lib/tax-engine/transfer-tax-exemption";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import {
  classifyMergeHouse,
  resolveMergeComposition,
} from "@/lib/tax-engine/one-house/merge-composition";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import type { HouseInfo, MergeOrigin } from "@/lib/tax-engine/types/multi-house-surcharge.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rules = parseRatesFromMap(makeMockRates()).oneHouseSpecialRules;
const D = (s: string) => new Date(s);
const MERGE = "2020-01-01";

const row = (id: string, acq: string, mergeOrigin?: MergeOrigin): HouseInfo =>
  ({
    id,
    region: "capital",
    acquisitionDate: D(acq),
    officialPrice: 300_000_000,
    isInherited: false,
    isLongTermRental: false,
    ...(mergeOrigin ? { mergeOrigin } : {}),
  }) as HouseInfo;

/** 양도 주택 2015-01-01 · 혼인 2020-01-01 · 양도 2026-03-01(10년 이내) · 8억 · 비조정 · 먼저 양도 선언. */
function input(others: HouseInfo[], over: Partial<TransferTaxInput> = {}): OneHouseJudgeInput {
  const houses = [row("selling", "2015-01-01"), ...others];
  return baseTransferInput({
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-03-01"),
    transferPrice: 800_000_000,
    householdHousingCount: houses.length,
    isFirstTransferredInMerge: true,
    marriageMerge: { marriageDate: D(MERGE) },
    houses,
    sellingHouseId: "selling",
    ...over,
  } as Partial<TransferTaxInput>) as OneHouseJudgeInput;
}

const judge = (i: OneHouseJudgeInput, base = "2026-09-29") =>
  checkExemption(i, rules, D("2021-01-01"), { judgmentBaseDate: D(base) });
const ids = (r: ReturnType<typeof judge>) => r.appliedExceptions.map((e) => e.id);

describe("MC-0 행 분류 — 날짜가 먼저다", () => {
  it("합가일보다 나중 취득이면 입력값과 무관하게 합가 후 취득", () => {
    expect(classifyMergeHouse(D("2022-06-01"), D(MERGE), "counterpart_side")).toBe("after_merge");
  });
  it("같은 날 취득이면 입력값을 따른다(순서는 납세자가 고름 — 부동산거래관리과-410 취지)", () => {
    expect(classifyMergeHouse(D(MERGE), D(MERGE), "counterpart_side")).toBe("counterpart_side");
    expect(classifyMergeHouse(D(MERGE), D(MERGE), undefined)).toBeUndefined();
  });
});

describe("MC-1 2주택 매트릭스 (M-1 ~ M-4 · M-9)", () => {
  it("[M-1] 다른 주택이 혼인 전 배우자 쪽 → 혼인 합가 비과세", () => {
    const r = judge(input([row("h1", "2018-01-01", "counterpart_side")]));
    expect(r.isExempt).toBe(true);
    expect(ids(r)).toEqual(["155-5-marriage-merge"]);
  });

  it("[M-2] 다른 주택도 혼인 전 양도자 쪽 → 합가로 2주택이 된 것이 아니다 → 불성립", () => {
    const r = judge(input([row("h1", "2018-01-01", "seller_side")]));
    expect(r.isExempt).toBe(false);
    expect(ids(r)).not.toContain("155-5-marriage-merge");
  });

  it("[M-3] 다른 주택을 혼인 후(2022-06-01) 취득 → 소유 쪽 입력 없이도 불성립(3-a)", () => {
    const r = judge(input([row("h1", "2022-06-01")]));
    expect(r.isExempt).toBe(false);
    // 입력값이 「배우자 쪽」이어도 날짜가 이긴다
    expect(judge(input([row("h1", "2022-06-01", "counterpart_side")])).isExempt).toBe(false);
  });

  it("[M-3b] 그 사례는 §155① 경로로 판정된다 — 처분기한(2025-06-01) 안이면 일시적 2주택 비과세", () => {
    const tth = {
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2015-01-01"),
        newAcquisitionDate: D("2022-06-01"),
      } as TransferTaxInput["temporaryTwoHouse"],
    };
    const within = judge(input([row("h1", "2022-06-01")], { ...tth, transferDate: D("2025-03-01") }), "2025-01-01");
    expect(within.isExempt).toBe(true);
    expect(ids(within)).toEqual(["155-1-temporary-two-house"]);
    // 기한 뒤(2026-03-01)면 과세 — 종전에는 합가 10년으로 비과세였다
    expect(judge(input([row("h1", "2022-06-01")], tth)).isExempt).toBe(false);
  });

  it("[M-4] 혼인 전 취득인데 소유 쪽 미입력 → 불성립(2026-10-05 정책: 「모름」은 불리)", () => {
    const r = judge(input([row("h1", "2018-01-01")]));
    expect(r.isExempt).toBe(false);
    expect(ids(r)).not.toContain("155-5-marriage-merge");
  });

  it("[M-9] 다른 주택을 혼인일 당일 취득 · 배우자 쪽 선택 → 성립", () => {
    expect(judge(input([row("h1", MERGE, "counterpart_side")])).isExempt).toBe(true);
  });
});

describe("MC-2 3주택 매트릭스 (M-5 ~ M-8) — 구성만 본다(§155① 기간은 중첩 술어가 본다)", () => {
  const composition = (others: HouseInfo[]) =>
    resolveMergeComposition({
      householdHousingCount: others.length + 1,
      houses: [row("selling", "2015-01-01"), ...others],
      sellingHouseId: "selling",
      mergeDate: D(MERGE),
    }).status;

  it("[M-5] 양쪽 1채 + 혼인 후 신규 1채 → 성립 구성(서면-2022-법규재산-5124)", () => {
    expect(composition([row("h1", "2018-01-01", "counterpart_side"), row("h2", "2024-06-01")])).toBe("holds");
  });
  it("[M-6] 양도자 쪽 2채(일시적 2주택) + 상대 1채 → 성립 구성(기본통칙 89-155…2①)", () => {
    expect(composition([row("h1", "2019-06-01", "seller_side"), row("h2", "2018-01-01", "counterpart_side")])).toBe(
      "holds",
    );
  });
  it("[M-7] 상대 쪽 2채(일시적 2주택) + 양도자 1채 → 성립 구성(사전-2026-법규재산-0643)", () => {
    expect(
      composition([row("h1", "2017-01-01", "counterpart_side"), row("h2", "2019-06-01", "counterpart_side")]),
    ).toBe("holds");
  });
  it("[M-8] 혼인 후 취득 2채 → 불성립(3-a)", () => {
    expect(composition([row("h1", "2022-06-01"), row("h2", "2024-06-01")])).toBe("fails");
  });
  it("[M-8b] 양도자 쪽 3채 · 상대 무주택 → 불성립", () => {
    expect(composition([row("h1", "2017-01-01", "seller_side"), row("h2", "2018-01-01", "seller_side")])).toBe(
      "fails",
    );
  });

  it("[M-5e] 엔진 경유 — M-5 구성 + §155① 기간 충족이면 중첩 비과세, 혼인 후 2채면 불성립", () => {
    const tth = {
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2015-01-01"),
        newAcquisitionDate: D("2024-06-01"),
      } as TransferTaxInput["temporaryTwoHouse"],
    };
    const ok = judge(input([row("h1", "2018-01-01", "counterpart_side"), row("h2", "2024-06-01")], tth));
    expect(ok.isExempt).toBe(true);
    expect(ids(ok)).toEqual(["155-1-temporary-two-house", "155-5-marriage-merge"]);
    const bad = judge(input([row("h1", "2022-06-01"), row("h2", "2024-06-01")], tth));
    expect(ids(bad)).not.toContain("155-5-marriage-merge");
  });
});

describe("MC-3 판정할 수 없으면 판정하지 않는다 (unknown → 종전 동작, 알려진 제외로 설명될 때만)", () => {
  it("명부 행 수 ≠ 판정 주택 수 — 알려진 제외가 있으면(knownHouseExclusionCount) 종전 동작", () => {
    const i = input([row("h1", "2018-01-01", "counterpart_side"), row("h2", "2022-06-01")], {
      householdHousingCount: 2,
      knownHouseExclusionCount: 1,
    });
    expect(
      resolveMergeComposition({
        householdHousingCount: 2,
        houses: i.houses,
        sellingHouseId: "selling",
        mergeDate: D(MERGE),
        knownHouseExclusionCount: 1,
      }).status,
    ).toBe("unknown");
    expect(judge(i).isExempt).toBe(true);
  });

  it("같은 행 수 불일치인데 알려진 제외가 0이면 — 입력 누락으로 보아 불성립(2026-10-05 정책)", () => {
    const i = input([row("h1", "2018-01-01", "counterpart_side"), row("h2", "2022-06-01")], {
      householdHousingCount: 2,
    });
    expect(
      resolveMergeComposition({
        householdHousingCount: 2,
        houses: i.houses,
        sellingHouseId: "selling",
        mergeDate: D(MERGE),
      }).status,
    ).toBe("fails");
    expect(judge(i).isExempt).toBe(false);
  });

  it("명부가 없는 입력(계산기 스칼라 · 구 이력) → 불성립(2026-10-05 정책: 「모름」은 불리)", () => {
    const i = input([], { householdHousingCount: 2, houses: undefined, sellingHouseId: undefined });
    expect(judge(i).isExempt).toBe(false);
  });
});

describe("MC-4 결과 화면 — 선언했으나 적용되지 않은 사유 · 요건 순차 검토", () => {
  it("[MC-R1] 성립 → 합가 요건 7행이 법정 순서로 전부 통과", () => {
    const r = judge(input([row("h1", "2018-01-01", "counterpart_side")]));
    expect(r.requirementReview?.scheme).toBe("155-4-5-merge");
    expect(r.requirementReview?.items.map((i) => [i.id, i.status])).toEqual([
      ["merge-composition", "met"],
      ["merge-selling-before", "met"],
      ["merge-first-transfer", "met"],
      ["merge-window", "met"],
      ["holding", "met"],
      ["residence", "not_required"],
      ["high-value", "met"],
    ]);
  });

  it("[MC-R2] 혼인 후 취득(M-3) → 구성 행 미충족 · 사유 카드가 §155①을 가리킨다", () => {
    const r = judge(input([row("h1", "2022-06-01")]));
    const comp = r.requirementReview?.items.find((i) => i.id === "merge-composition");
    expect(r.requirementReview?.scheme).toBe("155-4-5-merge");
    expect(comp?.status).toBe("unmet");
    expect(comp?.note).toContain("혼인일 이후에 취득");
    const unmet = r.unmetExceptions.find((u) => u.id === "155-5-marriage-merge");
    expect(unmet?.reasons.join(" ")).toContain("2022-06-01");
    expect(unmet?.reasons.join(" ")).toContain("§155①");
  });

  it("[MC-R3] 소유 쪽 미입력(M-4) → 구성 행은 「불성립」, 결론은 과세(2026-10-05 정책)", () => {
    const r = judge(input([row("h1", "2018-01-01")]));
    expect(r.isExempt).toBe(false);
    const comp = r.requirementReview?.items.find((i) => i.id === "merge-composition");
    expect(comp?.status).toBe("unmet");
    expect(comp?.note).toContain("혼인 전 보유자를 고르면");
  });

  it("[MC-R4] 양도자 쪽만 2채(M-2) → 사유 카드에 「무주택」 · 구성 행 미충족", () => {
    const r = judge(input([row("h1", "2018-01-01", "seller_side")]));
    expect(r.requirementReview?.items.find((i) => i.id === "merge-composition")?.status).toBe("unmet");
    expect(r.unmetExceptions.find((u) => u.id === "155-5-marriage-merge")?.reasons.join(" ")).toContain(
      "무주택",
    );
  });
});

/**
 * 🔴 드리프트 가드 — 합가 요건 행의 결론 ⇔ 정본 판정.
 * 합가 비과세로 결론이 났으면 모든 행이 통과여야 하고, 행 중 하나라도 미충족이면 합가 특례가
 * 붙어서는 안 된다(「과세」 배지 아래 「전 요건 충족」 dual truth 방지).
 */
describe("MC-5 합가 요건 행 ⇔ 정본 판정 (행렬 전수)", () => {
  const PASS = new Set(["met", "waived", "not_required", "partial", "unchecked"]);
  const others: Array<[string, HouseInfo[]]> = [
    ["C", [row("h1", "2018-01-01", "counterpart_side")]],
    ["S", [row("h1", "2018-01-01", "seller_side")]],
    ["P", [row("h1", "2022-06-01")]],
    ["U", [row("h1", "2018-01-01")]],
    ["same-day C", [row("h1", MERGE, "counterpart_side")]],
  ];
  const transfers = ["2019-06-01", "2026-03-01", "2031-06-01"];
  const firsts = [true, false];
  const sellingAcqs = ["2015-01-01", "2021-01-01"];

  for (const [name, o] of others)
    for (const t of transfers)
      for (const first of firsts)
        for (const acq of sellingAcqs) {
          it(`${name} · 양도 ${t} · 먼저 양도 ${first} · 양도주택 취득 ${acq}`, () => {
            const r = judge(
              input(o, {
                transferDate: D(t),
                isFirstTransferredInMerge: first,
                acquisitionDate: D(acq),
                houses: [row("selling", acq), ...o],
              }),
            );
            const merged = ids(r).includes("155-5-marriage-merge");
            if (r.requirementReview?.scheme !== "155-4-5-merge") {
              expect(merged).toBe(false);
              return;
            }
            const allPass = r.requirementReview.items.every((i) => PASS.has(i.status));
            expect(allPass).toBe(merged);
          });
        }
});
