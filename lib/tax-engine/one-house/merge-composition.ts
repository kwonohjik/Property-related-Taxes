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
 * ## 혼인(⑤) — 양쪽이 각각 2주택 이상이면 불성립 (조세정책과-1199)
 *
 * 기획재정부 조세정책과-1199(2024.6.25.) — 「각각 2주택 이상 소유한 배우자간 혼인하여 1세대가 소유하게 된 주택수가
 * 4주택 이상인 경우」 혼인합가 특례 적용 불가. 서면-2022-법규재산-4283(E132 — 장기임대 2채+거주주택 보유자와 장기임대
 * 1채+일반주택 보유자의 혼인)이 이를 따른다. 위 구성 표는 §155⑳ 장기임대주택을 뺀 행으로 세므로, 그렇게 성립한 혼인
 * 구성에 **장기임대주택을 다시 넣어** 양쪽 주택 수를 센다 — 둘 다 2채 이상이면 `both_sides_multi_house`. 한쪽이 1채면
 * 그대로 성립한다(사전-2025-법규재산-1062 — 1주택자와 거주주택+장기임대 1채 보유자의 혼인에 ⑳·⑤ 적용). 동거봉양(④)은
 * 이 회신의 대상이 아니라 적용하지 않는다(기준-2024-법규재산-0061 — 동거봉양은 1채 + 거주주택+장기임대 1채로 허용).
 * 장기임대주택의 혼인 전 보유자는 계산기는 명부의 장기임대주택 행(`isLongTermRental` · `mergeOrigin`)에서, 판정 메뉴는
 * 명부 밖 임대주택 입력(`rentalUnits[].mergeOrigin`)에서 읽는다(`marriageRentalSidesOf`).
 *
 * ## 🔑 「모름」은 불리하게 — 단, 제외로 설명되는 행 수 불일치만 예외 (2026-10-05 개정)
 *
 * 계획서 `docs/00-pm/merge-composition-unknown-unfavorable.plan.md` §3-1. 원칙은 memory
 * `feedback_unknown_fact_applies_unfavorably`(모름 → 혜택 불성립 + 결론을 가를 때만 「확인 필요」).
 *
 * - **명부 없음 · 양도 주택 행 없음**(`roster_missing`) — 불성립 + 확인 필요.
 * - **명부 행 수 ≠ 판정 주택 수** — 먼저 알려진 제외(상속주택·조특법 감면주택·장기임대주택 등) 중
 *   **행으로 특정된 몫**(`knownHouseExclusionHouseIds` — §155②③ `excludedHouses[].houseId` ·
 *   조특법 `houseCountExclusionDetails[].houseId`·`specialHouseExclusionDetail.entries[].houseId` ·
 *   §155⑳ `isLongTermRental` 행)을 명부에서 **빼고** 다시 행 수를 센다(PR-3, 사용자 결정 Q-4 —
 *   상속주택·조특법 감면주택은 합가 당시 주택 수에서 뺀다 · 2026-10-05 「가」 — §155⑳ 장기임대주택
 *   행도 같이 뺀다, 이 행은 애초에 「그 밖의 주택」 산정에서 빠지는 별도 사실이지 상속주택·조특법
 *   감면주택 같은 「합가 당시 주택 수 제외」가 아니지만, 명부에서 빼는 **결과**는 같다). 이 필드를
 *   넘기는 호출부(STEP 0.9/0.95·중과 15호·겸용·§155⑳ 세대 구성)는 그래도 행 수가 맞지 않으면
 *   어느 행인지 특정되지 않은 것(API 직접 호출의 `houseId` 미연결 선언 등)이므로 `roster_missing`
 *   (불성립)이다 — 「모름」을 더는 보류하지 않는다. 이 필드 자체를 넘기지 않는 **레거시 호출부**
 *   (현재 없음 — 모든 소비처가 행 단위로 추적한다)만 `knownHouseExclusionCount`(건수)만으로
 *   가른다 — 건수가 0이면 `roster_missing`, 0보다 크면 종전처럼 `count_mismatch`(판정 보류)다.
 * - **합가 전 행의 소유 쪽(`mergeOrigin`)이 비어 있다**(`origin_missing`) — 불성립 + 확인 필요.
 *   날짜만으로 결론이 나는 경우(아래 3-a)만 소유 쪽 없이도 판정한다.
 *
 * **3-a 날짜 검증**은 소유 쪽 입력 없이도 결론이 난다: 2주택인데 다른 주택이 합가 후 취득이면
 * 합가로 2주택이 된 것이 아니다. 3주택에서 합가 후 취득이 2채 이상이어도 같다. 계산기도 명부를
 * 보내므로 이 층은 두 메뉴 모두에 적용된다(계획서 Q-5).
 *
 * ## 🔑 예외 — 명부 입력 경로가 없는 화면 (사용자 결정 2026-10-05)
 *
 * 부담부증여 양도분(`transferType === "burdened_gift"`)은 증여세 계산기 화면이라 세대 보유
 * 주택 명부 입력 자체가 없다(`buildGiftBurdenedTransferBody`는 `houses`/`sellingHouseId`를
 * 싣지 않는다). 입력 경로가 없는 화면에서 「모름」을 불리하게 적용하면 사용자가 고칠 수 없는
 * 항목으로 불이익을 주게 된다(memory `feedback_required_field_needs_an_input_path`와 같은
 * 층위) ⇒ **이 호출부만** `noRosterInputPath: true`로 알려 종전 동작(판정 보류 → 합가 허용)을
 * 유지한다. 증여세 화면에 명부 입력을 추가하는 것은 별건이다. 계산기·판정 메뉴·API 직접
 * 호출·겸용주택은 이 플래그를 세우지 않으므로 PR-2의 「모름 → 불리」 동작 그대로다.
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
  | "composition_mismatch"
  /** 명부가 없거나 양도 주택 행이 없거나, 알려진 제외 없이 행 수가 모자란다 — 입력하지 않은 주택이 있다. */
  | "roster_missing"
  /** 합가 전 취득 행의 소유 쪽(`mergeOrigin`)을 입력하지 않았다. */
  | "origin_missing"
  /** 혼인 — 장기임대주택까지 세면 혼인 전 양쪽이 각각 2주택 이상(기획재정부 조세정책과-1199). */
  | "both_sides_multi_house"
  /** 혼인 — 장기임대주택의 혼인 전 보유자를 몰라 1199(양쪽 2주택 이상)를 가를 수 없다(모름 → 불성립 + 확인 필요). */
  | "rental_origin_missing";

/** 1·2번(roster_missing·origin_missing)만 — 입력하면 판정한다는 확인 필요 문구. */
const CONFIRM_NOTICE: Record<"roster_missing" | "origin_missing", string> = {
  roster_missing: "세대 보유 주택을 모두 목록에 입력하면 판정합니다.",
  origin_missing: "합가 전 보유자(양도자 쪽 / 배우자·합친 가족 쪽)를 고르면 판정합니다.",
};
/** 혼인 양쪽 2주택 이상 불성립의 근거 회신(안내 문구용). */
export const MARRIAGE_BOTH_SIDES_MULTI_HOUSE_BASIS = "기획재정부 조세정책과-1199";
/** 1199 — 장기임대주택의 혼인 전 보유자를 몰라 양쪽 2주택 이상 여부를 가를 수 없을 때. */
const RENTAL_ORIGIN_CONFIRM_NOTICE =
  "1세대1주택 판정 메뉴에서 장기임대주택마다 혼인 전 보유자(양도자 쪽 / 배우자 쪽 / 혼인 후 취득)를 고르면 판정합니다.";

export type MergeComposition =
  | { status: "holds" }
  | {
      status: "unknown";
      /**
       * `count_mismatch` — **행 단위 추적 없는 레거시 호출부**에서 명부 행 수가 알려진 제외
       * 건수(`knownHouseExclusionCount`)로 설명될 때만(2026-10-05 「가」 이후 모든 소비처가
       * `knownHouseExclusionHouseIds`를 넘겨 이 경로로 오는 현재 호출부는 없다 — 타입은
       * 호환을 위해 남긴다). `knownHouseExclusionHouseIds`를 넘기는 호출부는 이 경로로
       * 오지 않는다(행으로 특정되지 않으면 `roster_missing`).
       */
      reason: "count_mismatch" | "no_roster_input_path";
    }
  | {
      status: "fails";
      reason: MergeCompositionFailure;
      /** 합가 후 취득으로 분류된 명부 행의 취득일(안내 문구용). */
      afterMergeDates: Date[];
      sellerSide: number;
      counterpartSide: number;
      /** 사실을 몰라 불성립으로 계산했음을 알리는 문구 — roster_missing·origin_missing·rental_origin_missing만. */
      confirmNotice?: string;
    };

export interface MergeCompositionInput {
  householdHousingCount: number;
  houses?: HouseInfo[];
  sellingHouseId?: string;
  mergeDate: Date;
  /**
   * 상속주택·조특법 감면주택 등 **이미 알려진** 주택수 제외 건수(`runHouseCountExclusionStep`의
   * 합계). `knownHouseExclusionHouseIds`를 **넘기지 않는 레거시 호출부**에서만 쓰인다 —
   * 그 차이가 이 건수로 설명되면 `count_mismatch`(판정 보류)로 두고, 0이면 `roster_missing`
   * 이다. 2026-10-05 「가」 이후 §155⑳ 장기임대주택 축도 행 id를 넘기므로 현재 모든 소비처가
   * `knownHouseExclusionHouseIds`를 넘긴다(아래 필드).
   */
  knownHouseExclusionCount?: number;
  /**
   * 알려진 제외 중 **어느 명부 행인지 특정된** 몫(PR-3). 이 집합에 든 `houseId`는 행 수
   * 비교·구성 판정 전에 명부에서 제외한다.
   *
   * 🔑 이 필드를 **넘기는 것 자체**가 신호다 — 빈 배열(`[]`)이어도 「이 호출부는 제외를 행
   * 단위로 추적한다」는 뜻이고, 제외 후에도 행 수가 맞지 않으면 더는 판정을 보류하지 않고
   * `roster_missing`(불성립)이다. 필드를 **넘기지 않으면**(`undefined`) `knownHouseExclusionCount`
   * (건수)만으로 판정 보류 여부를 가르는 레거시 동작(PR-2)이 유지된다.
   */
  knownHouseExclusionHouseIds?: ReadonlyArray<string>;
  /**
   * 이 호출부에 명부 입력 경로가 **없다**(사용자 결정 2026-10-05 — 부담부증여 양도분 전용).
   * true면 명부·양도 주택 행이 없을 때 `roster_missing`(불성립) 대신 `unknown`(판정 보류 →
   * 종전 동작)으로 둔다. 입력 경로가 있는 화면(계산기·판정 메뉴·겸용)은 세우지 않는다.
   */
  noRosterInputPath?: boolean;
  /**
   * 혼인(⑤)일 때만 — 조세정책과-1199 판정용 장기임대주택의 혼인 전 위치. `rentalUnitSides`는 명부 밖 임대주택
   * 입력(`rentalUnits[].mergeOrigin`, 판정 메뉴)이고, 명부에 장기임대주택 행이 있으면(계산기) 그 행이 우선한다.
   */
  marriageRentals?: { rentalUnitSides: ReadonlyArray<MergeHouseSide | undefined> };
}

/** 혼인합가 판정에 넘길 장기임대주택 위치 — 혼인이 아니면 `undefined`(1199 판정 없음). 세 호출부 공용. */
export function marriageRentalSidesOf(
  input: { rentalHousingException?: { applyException?: boolean; rentalUnits?: ReadonlyArray<{ mergeOrigin?: MergeHouseSide }> } },
  isMarriage: boolean,
): MergeCompositionInput["marriageRentals"] {
  if (!isMarriage) return undefined;
  const r = input.rentalHousingException;
  return { rentalUnitSides: r?.applyException ? (r.rentalUnits ?? []).map((u) => u.mergeOrigin) : [] };
}

const failWithoutFacts = (
  reason: "roster_missing" | "origin_missing",
): MergeComposition => ({
  status: "fails",
  reason,
  afterMergeDates: [],
  sellerSide: 0,
  counterpartSide: 0,
  confirmNotice: CONFIRM_NOTICE[reason],
});

/**
 * 명부 정합 전처리 — 알려진 제외 행을 빼고 행 수를 판정 주택 수와 대조한 뒤 **양도 주택 외 행**을 돌려준다.
 * 결론이 나면(명부 없음·행 수 불일치) 그 `MergeComposition`을 돌려준다. 단일 합가(`resolveMergeComposition`)와
 * 혼인 → 동거봉양 이중 합가(`resolveDoubleMergeComposition`)가 같은 규약을 쓴다.
 */
function mergeRosterOthers(input: MergeCompositionInput): MergeComposition | { others: HouseInfo[] } {
  const {
    houses,
    sellingHouseId,
    householdHousingCount: count,
    knownHouseExclusionCount = 0,
    knownHouseExclusionHouseIds,
  } = input;
  if (!houses || !sellingHouseId || !houses.some((h) => h.id === sellingHouseId)) {
    if (input.noRosterInputPath) return { status: "unknown", reason: "no_roster_input_path" };
    return failWithoutFacts("roster_missing");
  }

  // PR-3 — 알려진 제외 중 행으로 특정된 몫을 먼저 빼고 남은 행으로 구성을 센다(사용자 결정 Q-4).
  // `knownHouseExclusionHouseIds`가 **정의돼 있으면**(빈 배열이어도) 그 호출부는 제외를 행
  // 단위로 추적한다 — STEP 0.9/0.95·중과 15호·겸용·§155⑳ 세대 구성(2026-10-05 「가」)이 이렇다.
  // 그 경우 행으로 특정되지 않는 나머지(API 직접 호출의 `houseId` 미연결 선언 등)는 더는
  // 판정을 보류하지 않고 불성립이다(모름 → 불리를 끝까지 적용). 필드 자체를 넘기지 않는
  // 레거시 호출부(현재 없음 — 타입 호환을 위해 분기만 남긴다)는 `knownHouseExclusionCount`
  // 만으로 판정 보류 여부를 가른다.
  const tracksExclusionRows = knownHouseExclusionHouseIds !== undefined;
  const excludedIds = new Set(knownHouseExclusionHouseIds ?? []);
  const effectiveHouses = excludedIds.size > 0 ? houses.filter((h) => !excludedIds.has(h.id)) : houses;

  if (effectiveHouses.length !== count) {
    if (tracksExclusionRows) return failWithoutFacts("roster_missing");
    // 레거시 호출부 — 알려진 제외가 하나도 없는데 행 수가 어긋나면 입력 누락으로 본다.
    if (knownHouseExclusionCount === 0) return failWithoutFacts("roster_missing");
    // 알려진 제외(건수만)로 설명되면 종전 동작(판정 보류).
    return { status: "unknown", reason: "count_mismatch" };
  }

  return { others: effectiveHouses.filter((h) => h.id !== sellingHouseId) };
}

export function resolveMergeComposition(input: MergeCompositionInput): MergeComposition {
  const { householdHousingCount: count } = input;
  if (count !== 2 && count !== 3) return { status: "unknown", reason: "count_mismatch" };
  const roster = mergeRosterOthers(input);
  if ("status" in roster) return roster;
  const { others } = roster;
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

  // 3-b — 합가 전 행마다 소유 쪽이 있어야 판정할 수 있다 — 비어 있으면 불성립 + 확인 필요.
  if (sides.some((x) => x === undefined)) return failWithoutFacts("origin_missing");

  const holds =
    count === 2
      ? s === 1 && c === 1
      : (s === 1 && c === 2 && p === 0) || (s === 2 && c === 1 && p === 0) || (s === 1 && c === 1 && p === 1);
  if (!holds) return fail(c === 0 ? "seller_side_only" : "composition_mismatch");
  return input.marriageRentals ? judgeMarriageRentals(input, s, c, afterMergeDates) : { status: "holds" };
}

/** 1199 — 성립한 혼인 구성에 장기임대주택을 다시 넣어 양쪽이 각각 2주택 이상인지 본다. */
function judgeMarriageRentals(
  input: MergeCompositionInput,
  rosterSeller: number,
  rosterCounterpart: number,
  afterMergeDates: Date[],
): MergeComposition {
  // 명부에 장기임대주택 행이 있으면 그 행이 정본이다 — 구성에서 이미 센 행(제외되지 않은 행)은 다시 세지 않고, 명부 밖
  // 임대주택 입력은 보지 않는다(같은 주택을 두 번 세지 않게 — 판정 메뉴는 이중 입력을 ⑧에서 경고한다).
  const excludedIds = new Set(input.knownHouseExclusionHouseIds ?? []);
  const rosterRentals = (input.houses ?? []).filter((h) => h.isLongTermRental === true);
  const sides =
    rosterRentals.length > 0
      ? rosterRentals
          .filter((h) => excludedIds.has(h.id))
          .map((h) => classifyMergeHouse(h.acquisitionDate, input.mergeDate, h.mergeOrigin))
      : input.marriageRentals!.rentalUnitSides;
  const s = rosterSeller + sides.filter((x) => x === "seller_side").length;
  const c = rosterCounterpart + sides.filter((x) => x === "counterpart_side").length;
  const unknown = sides.filter((x) => x === undefined).length;
  // 보유자를 모르는 임대주택을 모두 불리한 쪽에 넣어도 양쪽 2채 이상이 될 수 없으면 결론이 나 있다.
  if (unknown > 0 && Math.max(0, 2 - s) + Math.max(0, 2 - c) <= unknown) {
    return {
      status: "fails",
      reason: "rental_origin_missing",
      afterMergeDates: [],
      sellerSide: s,
      counterpartSide: c,
      confirmNotice: RENTAL_ORIGIN_CONFIRM_NOTICE,
    };
  }
  if (s >= 2 && c >= 2) {
    return { status: "fails", reason: "both_sides_multi_house", afterMergeDates, sellerSide: s, counterpartSide: c };
  }
  return { status: "holds" };
}

/**
 * D4 — **혼인 후 동거봉양 합가**로 3주택이 된 세대의 합가 전 보유 구성 (서면인터넷방문상담4팀-598).
 *
 * 성립 구성: 양도 주택(양도자 쪽 · 혼인 전 보유) 외에 **배우자 쪽 1**(`counterpart_side` · 혼인일 이전 취득)과
 * **동거봉양으로 합친 가족 쪽 1**(`second_merge_side` · 동거봉양 합가일 이전 취득). 동거봉양 합가일 이후 취득 행이
 * 있거나 쪽이 이와 다르면 불성립이다. 소유 쪽이 비면 불성립 + 확인 필요(단일 합가와 같은 규약).
 */
export function resolveDoubleMergeComposition(
  input: Omit<MergeCompositionInput, "mergeDate"> & { marriageDate: Date; parentalCareMergeDate: Date },
): MergeComposition {
  if (input.householdHousingCount !== 3) return { status: "unknown", reason: "count_mismatch" };
  const roster = mergeRosterOthers({ ...input, mergeDate: input.parentalCareMergeDate });
  if ("status" in roster) return roster;
  const { others } = roster;
  const afterMergeDates = others
    .filter((h) => h.acquisitionDate.getTime() > input.parentalCareMergeDate.getTime())
    .map((h) => h.acquisitionDate);
  const spouse = others.filter(
    (h) => h.mergeOrigin === "counterpart_side" && h.acquisitionDate.getTime() <= input.marriageDate.getTime(),
  ).length;
  const family = others.filter((h) => h.mergeOrigin === "second_merge_side").length;
  const fail = (reason: MergeCompositionFailure): MergeComposition => ({
    status: "fails",
    reason,
    afterMergeDates,
    sellerSide: 1 + others.filter((h) => h.mergeOrigin === "seller_side").length,
    counterpartSide: spouse + family,
  });
  if (afterMergeDates.length > 0) return fail("acquired_after_merge");
  if (others.some((h) => h.mergeOrigin === undefined)) return failWithoutFacts("origin_missing");
  if (spouse === 1 && family === 1) return { status: "holds" };
  return fail(spouse + family === 0 ? "seller_side_only" : "composition_mismatch");
}
