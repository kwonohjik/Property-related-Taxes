/**
 * 명부 행 → 세대 단위 비과세 사실 도출 (D-6 · 계획서 §5.10)
 *
 * ## 원칙: 사실은 한 번, 규칙은 조문별로
 *
 * §155 특례의 「주택별 사실」은 **명부 행**이 정본이다. 엔진 입력은 세대 단위 그대로 두고
 * (계획서 §5.10 결정 1 — 엔진을 바꾸면 세액 불변 증명이 흐려진다) **어댑터가 행에서 도출**한다.
 *
 * ## 🔑 레거시는 지우지 않고 **폴백**으로 둔다 (OH-21·OH-30)
 *
 * 기존 record의 세대 단위 값(`culturalHeritageHouseSpecial` 등)은 **어느 행인지 알 수 없다**.
 * 자동 배정하면 틀린 주택에 사실을 붙이게 된다. ⇒ 「행에 표시가 있으면 행, 없으면 레거시」다.
 * 둘 다 있으면 **행이 이긴다**(행이 더 구체적인 선언이다).
 *
 * 그래서 **저장 당시와 같은 세액**이 나온다 — 행 표시가 없는 옛 record는 레거시 값을 그대로 쓴다.
 *
 * ## ⚠️ 이 모듈은 비과세 축 전용이다
 *
 * 같은 사실이 중과 축(영 §167의3·§167의10)에도 쓰이지만 **요건이 다르다**. 한 값으로 합치면
 * 조용히 틀린다([[feedback_one_field_serving_two_legal_axes]]). 중과 쪽 행 속성은
 * `HouseEntry`에 이미 따로 있고(`isCulturalHeritage`계열·`isUnavoidableReason`계열),
 * 이 모듈은 그것들을 **읽지 않는다**.
 */
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset";

/** 도출에 필요한 행 속성만 — 테스트가 전체 `HouseEntry`를 만들지 않아도 되게 좁힌다. */
export type OneHouseFactRow = Pick<HouseEntry, "oneHouseCulturalHeritage">;

/** 세대 단위 레거시 값(폼 스칼라) — 행에 표시가 없을 때만 쓴다. */
export interface OneHouseLegacyFacts {
  /** §155⑥1호 — 종전 세대 단위 토글(`form.culturalHeritageHouseSpecial`). */
  culturalHeritageHouseSpecial?: boolean;
}

export interface DerivedOneHouseRowFacts {
  /** ④⑬ 엔진 입력 `culturalHeritageHouse` — true일 때만 전송한다(false는 미전송 규약 유지). */
  culturalHeritageHouse: boolean;
  /**
   * 레거시 값만으로 성립했는가 — 화면이 「어느 주택인지 지정하세요」를 띄울 신호(OH-30).
   * 행 표시가 하나라도 있으면 false다.
   */
  fromLegacyOnly: boolean;
}

/** 행 중 §155⑥1호 국가유산주택으로 표시된 것이 있는가. */
export function hasCulturalHeritageRow(
  houses: readonly OneHouseFactRow[] | undefined,
): boolean {
  return (houses ?? []).some((h) => h.oneHouseCulturalHeritage === true);
}

/**
 * 명부 행에서 세대 단위 §155 사실을 도출한다 — **행 우선, 레거시 폴백**.
 *
 * @param houses  ④ 다른 보유 주택 목록
 * @param legacy  세대 단위 레거시 값(폼 스칼라). 행 표시가 없을 때만 쓰인다.
 */
export function deriveOneHouseFactsFromHouses(
  houses: readonly OneHouseFactRow[] | undefined,
  legacy: OneHouseLegacyFacts = {},
): DerivedOneHouseRowFacts {
  const rowHeritage = hasCulturalHeritageRow(houses);
  const legacyHeritage = legacy.culturalHeritageHouseSpecial === true;
  return {
    culturalHeritageHouse: rowHeritage || legacyHeritage,
    fromLegacyOnly: !rowHeritage && legacyHeritage,
  };
}
