/**
 * 일반건물 × 지분(%) 분할 — **카드 id 접미사 규약**의 단일 정본. 무의존 leaf.
 *
 * 지분 분할에서 엔진은 지분마다 같은 카드를 만든다. 그래서 `propertyId`가 충돌하지 않도록
 * 지분 인덱스를 접미사로 붙인다 — `land`, `building1` → `land#0`, `building1#1`.
 * 태깅은 `app/api/calc/transfer/general-building-fractional.ts`의 `tagId`가 한다.
 *
 * ## 왜 leaf인가
 *
 * 소비자가 **엔진·라우트·결과 화면·신고서**에 걸쳐 있다. `use client` 컴포넌트도 직접
 * import하므로 의존이 하나라도 붙으면 안 된다(`area-utils.ts`와 같은 이유).
 *
 * ## 🔴 이 규약을 모르면 조용히 어긋난다
 *
 * `propertyId === "land_business"` 같은 **정확 비교**는 지분 카드에서 **항상 false**다.
 * 실제로 두 계층에서 났다:
 *
 * | 계층 | 증상 |
 * |---|---|
 * | 라우트 표시(`buildApportionment`) | 사업용 토지가 비사업용 비율로 — 기준시가 160,000,000이 40,000,000, 지분당 `displayRatio` 합 0.7 |
 * | 결과 화면·신고서 | 자산별 산식 **미표시** · 신고서 행 메타(취득일 등) **누락** |
 *
 * ⇒ id를 비교하기 전에 **반드시 `baseCardId()`를 통과**시킨다. 카드끼리 짝을 찾을 때는
 *   `isSameShare()`로 **같은 지분 안에서** 찾는다 — base id만 보면 다른 지분 카드를 집어
 *   지분 간 값이 섞인다.
 */

/** 지분 인덱스 접미사 구분자. 카드 id에 이 문자가 있으면 지분 분할 결과다. */
export const SHARE_ID_SEPARATOR = "#";

/** `land_business#0` → `land_business`. 접미사가 없으면 그대로 돌려준다(단건 회귀 0). */
export function baseCardId(propertyId: string): string {
  const i = propertyId.indexOf(SHARE_ID_SEPARATOR);
  return i < 0 ? propertyId : propertyId.slice(0, i);
}

/**
 * `land_business#0` → `0`. 단건(접미사 없음)은 `undefined`.
 *
 * 인덱스는 **`formData.assets`의 인덱스와 같다** — `buildGeneralBuildingShares`가
 * `assets`를 순회한 순서 그대로 태깅하기 때문이다(`transfer-tax-api-gb-shares.ts:168`).
 * 신고서가 지분별 취득일을 찾을 때 이 대응을 쓴다.
 */
export function shareIndexOf(propertyId: string): number | undefined {
  const i = propertyId.indexOf(SHARE_ID_SEPARATOR);
  if (i < 0) return undefined;
  const raw = propertyId.slice(i + SHARE_ID_SEPARATOR.length);
  // ⚠️ `Number("")`는 **0**이다 — 빈 문자열을 거르지 않으면 `land#`가 「지분 0」이 되어
  //    `assets[0]`을 집는다(2026-08-10 anchor가 잡음). 숫자만으로 이뤄졌는지 먼저 본다.
  if (!/^\d+$/.test(raw)) return undefined;
  return Number(raw);
}

/**
 * 두 카드가 **같은 지분**에 속하는지. 단건끼리(둘 다 접미사 없음)는 true.
 *
 * 🔴 카드 짝짓기(`assetCards.find(...)`)에 **반드시** 함께 쓴다. base id만 보면
 *    지분 0의 건물 카드가 지분 1의 토지 산식에 끌려 들어간다.
 */
export function isSameShare(a: string, b: string): boolean {
  return shareIndexOf(a) === shareIndexOf(b);
}

/**
 * `land#asset-1` → `asset-1` · `land#0` → `0`. 접미사가 없으면 `undefined`.
 * 지분 인덱스(숫자)와 함께 양도 자산 id를 가리지 않는다 — 함께 양도 결과 상세(`generalBuildingDetailsByAsset`)의 키가 이 값이다.
 */
export function cardSuffixOf(propertyId: string): string | undefined {
  const i = propertyId.indexOf(SHARE_ID_SEPARATOR);
  return i < 0 ? undefined : propertyId.slice(i + SHARE_ID_SEPARATOR.length);
}

/** 매입분 카드 id 접미사 — 한도 초과 분리 카드(`__appurtenant`/`__excess`)와 같은 `__` 규약. */
export const PURCHASED_PART_ID_SUFFIX = "__purchased";

/**
 * 이월과세 × 당초 증여 채무 부분(매입분) 꼬리 카드 id. 지분 접미사(`#`) **앞**에 둔다 —
 * `land#0` → `land__purchased#0` · `land#asset-1` → `land__purchased#asset-1` · `primary` → `primary__purchased`.
 *
 * 🔴 `#` 뒤에 두면(`land#0__purchased`) `shareIndexOf`가 숫자만 인정해 `undefined`를 돌려주고 `cardSuffixOf`는 `0__purchased`가 되어
 *    지분 짝 찾기(`isSameShare`)·함께 양도 상세 키·`endsWith('#0')` 지분 행 선택이 어긋난다(엔진 설계서 PR-2 §3.4 · Q-6 a).
 */
export function purchasedPartIdOf(propertyId: string): string {
  const i = propertyId.indexOf(SHARE_ID_SEPARATOR);
  return i < 0 ? `${propertyId}${PURCHASED_PART_ID_SUFFIX}` : `${propertyId.slice(0, i)}${PURCHASED_PART_ID_SUFFIX}${propertyId.slice(i)}`;
}

/** 매입분 꼬리 카드 id인가 — `purchasedPartIdOf`가 만든 모양(`__purchased`가 `#` 앞 마지막 조각)만 true다. 원 카드 id(r = 1이면 매입분이 원 id를 쓴다)는 false. */
export function isPurchasedPieceId(propertyId: string): boolean {
  return baseCardId(propertyId).endsWith(PURCHASED_PART_ID_SUFFIX);
}

/** 꼬리 카드 id → 증여분(부모) 카드 id. `land__purchased#0` → `land#0`. 꼬리가 아니면 그대로 돌려준다. */
export function purchasedPartParentIdOf(propertyId: string): string {
  if (!isPurchasedPieceId(propertyId)) return propertyId;
  const i = propertyId.indexOf(SHARE_ID_SEPARATOR);
  const base = i < 0 ? propertyId : propertyId.slice(0, i);
  return `${base.slice(0, -PURCHASED_PART_ID_SUFFIX.length)}${i < 0 ? "" : propertyId.slice(i)}`;
}
