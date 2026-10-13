/**
 * 상속 행의 「상속개시 당시 피상속인과 같은 세대였는가」 — 한 칸의 3상태 (결정 #42-2 합침).
 *
 * 이 답 하나가 두 규정에 쓰인다.
 *  - 소득세법 시행령 §155② 단서(동일세대 상속은 상속주택 특례 배제)·§167의3①7호·§155⑦1호
 *  - 조세특례제한법 §71의2① 인구감소지역주택(별도세대로부터 상속받은 경우만 적용 — 국세청 해석)
 *
 * 저장 모양: 종전 boolean(`decedentSameHouseholdAtInheritance` — true=동일세대)은 그대로 두고 「모름」(`decedentHouseholdUnknown`)과
 * 「별도세대를 직접 골랐다」(`decedentHouseholdSeparate`) 표시를 더했다. 종전 `true`는 사용자가 토글을 켠 답이라 그대로 동일세대로 읽는다.
 * 🔴 종전 **`false`는 답으로 읽지 않는다** — 「+ 주택 추가」 팩토리가 2026-07-19~10-11에 `false`를 미리 넣었고(642eef8b7이 걷어냄)
 * 토글 OFF 표시도 같은 `false`라서, 낡은 `false`는 사용자가 고른 별도세대와 구별되지 않는다. 별도세대는 이 표시가 함께 있을 때만 답이다.
 * 미답(표시 없음)은 「모름」과 같이 읽는다 — 종전엔 미답이 「별도세대」로 읽혀 특례가 조용히 적용됐다(원칙 1 위반).
 *
 * ⑤ 위젯·④ API 변환·⑧ validate가 모두 이 leaf를 쓴다(3중 패턴 — 술어 사본 금지).
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

export type DecedentHousehold = "separate" | "same" | "unknown";

type Row = Pick<HouseEntry, "decedentSameHouseholdAtInheritance" | "decedentHouseholdUnknown" | "decedentHouseholdSeparate">;

/** 사용자가 고른 답 — 아직 고르지 않았으면 `undefined`(위젯이 아무것도 선택하지 않은 상태로 그린다). */
export function decedentHouseholdAnswer(h: Row): DecedentHousehold | undefined {
  if (h.decedentSameHouseholdAtInheritance === true) return "same";
  // boolean `false`만으로는 별도세대가 아니다 — 낡은 기본값과 구별되지 않는다(위 주석)
  if (h.decedentHouseholdSeparate === true) return "separate";
  if (h.decedentHouseholdUnknown === true) return "unknown";
  return undefined;
}

/** 엔진·검증이 읽는 값 — 미답은 「모름」이다(모름 = 불성립 + 확인 필요). */
export function decedentHouseholdOf(h: Row): DecedentHousehold {
  return decedentHouseholdAnswer(h) ?? "unknown";
}

/** ④가 엔진에 싣는 boolean — 별도세대 false · 동일세대 true · 모름·미답은 싣지 않는다(미확인 표시가 대신 나간다). */
export function decedentHouseholdEngineBoolean(h: Row): boolean | undefined {
  const a = decedentHouseholdAnswer(h);
  return a === "same" ? true : a === "separate" ? false : undefined;
}

/** 한 답을 행에 쓰는 patch — boolean과 모름 표시가 서로 모순되지 않게 한 곳에서만 쓴다. */
export function decedentHouseholdPatch(
  v: DecedentHousehold,
  house: Pick<HouseEntry, "parentalCareMergeInheritedHouse" | "reInheritedFromSeparateHousehold">,
): Partial<HouseEntry> {
  return {
    decedentSameHouseholdAtInheritance: v === "same" ? true : v === "separate" ? false : undefined,
    decedentHouseholdUnknown: v === "unknown" ? true : undefined,
    decedentHouseholdSeparate: v === "separate" ? true : undefined,
    // 동거봉양·재상속 예외는 동일세대일 때만 의미가 있다
    parentalCareMergeInheritedHouse: v === "same" ? house.parentalCareMergeInheritedHouse : undefined,
    reInheritedFromSeparateHousehold: v === "same" ? house.reInheritedFromSeparateHousehold : undefined,
  };
}
