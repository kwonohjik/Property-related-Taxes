/**
 * §155④⑤ 합가 의제 — **합가 전 보유 구성** 판정 (2026-09-29)
 *
 * 계획서 `docs/00-pm/one-house-judgment-merge-house-link.plan.md` 3단계.
 *
 * ## 왜 필요한가
 *
 * 법문(소득세법 시행령 §155⑤, MST 286211)은 「**1주택을 보유하는 자가 1주택을 보유하는 자와**
 * 혼인함으로써 1세대가 2주택을 보유하게 되는 경우」다(④ 동거봉양도 같은 구조). 기획재정부
 * 조세정책과-1199(2024.6.25.)는 이 요건을 「양도일 현재가 아닌 **혼인합가 당시** 주택수로」
 * 판정한다고 회신했다. 종전 술어는 세대 주택 수와 **양도 주택**의 취득일만 봤다 — 다른 주택이
 * 합가 **후**에 취득됐거나 합가 전 한쪽이 2채였어도 비과세가 나왔다(probe 실측).
 *
 * ## 구성 규칙 (양도 주택은 항상 양도자 쪽 — 합가 전 취득은 `matchMergeApartFromWindow`가 요구)
 *
 * | 주택 수 | 성립 구성 (양도자 쪽 s · 상대 쪽 c · 합가 후 취득 p) | 근거 |
 * |---|---|---|
 * | 2 | (1, 1, 0) | 법문 |
 * | 3 | (1, 2, 0) · (2, 1, 0) — 한쪽이 일시적 2주택 | 사전-2026-법규재산-0643 · 기본통칙 89-155…2① |
 * | 3 | (1, 1, 1) — 합가 후 신규 주택 | 서면-2022-법규재산-5124 |
 *
 * 3주택의 **기간** 요건(§155①)은 여기서 보지 않는다 — `resolveMergeOverlapDeeming`이 본다.
 *
 * ## 🔑 판정할 수 없으면 판정하지 않는다 (`unknown` → 종전 동작)
 *
 * - 명부가 없거나 양도 주택 행이 없다(계산기 스칼라 입력 · 구 이력).
 * - 명부 행 수 ≠ 판정 주택 수 — 감면주택·상속주택 등이 주택 수에서 빠졌는데 **어느 행인지**는
 *   남지 않는다(`runHouseCountExclusionStep`은 건수만 뺀다). 행으로 세면 빠진 주택을 넣어 세게 된다.
 * - 합가 전 행의 소유 쪽(`mergeOrigin`)이 비어 있다 — 날짜만으로 결론이 나는 경우(아래 3-a)만 판정한다.
 *
 * **3-a 날짜 검증**은 소유 쪽 입력 없이도 결론이 난다: 2주택인데 다른 주택이 합가 후 취득이면
 * 합가로 2주택이 된 것이 아니다. 3주택에서 합가 후 취득이 2채 이상이어도 같다. 계산기도 명부를
 * 보내므로 이 층은 두 메뉴 모두에 적용된다(계획서 Q-5).
 */
import type { HouseInfo, MergeOrigin } from "../types/multi-house-surcharge.types";

/** 명부 행 하나의 합가 전 위치. `undefined` = 합가 전 취득인데 소유 쪽을 입력하지 않았다. */
export type MergeHouseSide = MergeOrigin | "after_merge";

/**
 * 명부 행 분류 — **날짜가 먼저**다. 합가일보다 나중에 취득했으면 입력값과 무관하게 합가 후 취득이다
 * (저장된 선택이 날짜와 어긋나는 dual truth를 막는다). 같은 날 취득은 순서를 납세자가 고른다
 * (부동산거래관리과-410 취지) ⇒ 입력값을 따른다.
 *
 * UI(편집 창·명부 배지)도 이 함수를 쓴다 — 화면이 따로 계산하면 판정과 표시가 갈린다.
 */
export function classifyMergeHouse(
  acquisitionDate: Date,
  mergeDate: Date,
  origin: MergeOrigin | undefined,
): MergeHouseSide | undefined {
  if (acquisitionDate.getTime() > mergeDate.getTime()) return "after_merge";
  return origin;
}

export type MergeCompositionFailure =
  /** 2주택인데 다른 주택이 합가 후 취득 — 합가가 아니라 취득으로 2주택이 됐다. */
  | "acquired_after_merge"
  /** 합가 전 양도자 쪽만 2채 이상, 상대 쪽 무주택. */
  | "seller_side_only"
  /** 그 밖에 성립 구성 표에 없는 조합(예: 3주택인데 합가 전 한쪽 3채). */
  | "composition_mismatch";

export type MergeComposition =
  | { status: "holds" }
  | { status: "unknown" }
  | {
      status: "fails";
      reason: MergeCompositionFailure;
      /** 합가 후 취득으로 분류된 명부 행의 취득일(안내 문구용). */
      afterMergeDates: Date[];
      sellerSide: number;
      counterpartSide: number;
    };

export interface MergeCompositionInput {
  householdHousingCount: number;
  houses?: HouseInfo[];
  sellingHouseId?: string;
  mergeDate: Date;
}

export function resolveMergeComposition(input: MergeCompositionInput): MergeComposition {
  const { houses, sellingHouseId, householdHousingCount: count } = input;
  if (count !== 2 && count !== 3) return { status: "unknown" };
  if (!houses || !sellingHouseId || !houses.some((h) => h.id === sellingHouseId)) {
    return { status: "unknown" };
  }
  if (houses.length !== count) return { status: "unknown" };

  const others = houses.filter((h) => h.id !== sellingHouseId);
  const sides = others.map((h) => classifyMergeHouse(h.acquisitionDate, input.mergeDate, h.mergeOrigin));
  const afterMergeDates = others
    .filter((_, i) => sides[i] === "after_merge")
    .map((h) => h.acquisitionDate);
  const p = afterMergeDates.length;
  const s = 1 + sides.filter((x) => x === "seller_side").length;
  const c = sides.filter((x) => x === "counterpart_side").length;
  const fail = (reason: MergeCompositionFailure): MergeComposition => ({
    status: "fails",
    reason,
    afterMergeDates,
    sellerSide: s,
    counterpartSide: c,
  });

  // 3-a — 날짜만으로 결론이 나는 경우(소유 쪽 입력이 없어도 판정)
  if ((count === 2 && p >= 1) || (count === 3 && p >= 2)) return fail("acquired_after_merge");

  // 3-b — 합가 전 행마다 소유 쪽이 있어야 판정할 수 있다
  if (sides.some((x) => x === undefined)) return { status: "unknown" };

  const holds =
    count === 2
      ? s === 1 && c === 1
      : (s === 1 && c === 2 && p === 0) || (s === 2 && c === 1 && p === 0) || (s === 1 && c === 1 && p === 1);
  if (holds) return { status: "holds" };
  return fail(c === 0 ? "seller_side_only" : "composition_mismatch");
}
