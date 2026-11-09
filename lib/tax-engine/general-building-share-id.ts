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

/**
 * 연간 합산(다건) × 지분 분할 — 복합 접미사 `<자산id>.<지분번호>`의 구분자(계획서 `multi-carryover-bg-gb-shares.plan.md` Q-2 a).
 *
 * 다건 카드는 **자산 id**(결과 행 묶음·폼 조회)와 **지분 번호**(지분 짝·지분 echo 키)를 둘 다 가져야 한다 — `land#prop-…-1.0`.
 * `cardSuffixOf`는 앞부분(자산 id), `shareIndexOf`는 뒷부분(지분 번호)을 돌려준다. 단건 축 B(`land#0`)·함께 양도(`land#asset-…`)는
 * 점이 없어 종전 그대로다. 자산 id 형식(`prop-<시각>-<n>`·`asset-<시각>-<n>`)에는 점이 없다.
 */
export const SHARE_INDEX_SEPARATOR = ".";

/** 다건 지분 카드 접미사 — `shareCardSuffix("prop-1", 0)` → `prop-1.0`. */
export function shareCardSuffix(assetId: string, shareIndex: number): string {
  return `${assetId}${SHARE_INDEX_SEPARATOR}${shareIndex}`;
}

/**
 * 접미사 → [자산 부분, 지분 번호 부분]. 복합이 아니면 지분 번호 부분은 `undefined`.
 * 마지막 점 뒤가 숫자이고 **앞부분이 숫자만이 아닐 때만**(자산 id) 복합으로 읽는다 — `1.5` 같은 깨진 지분 접미사를
 * 「자산 1의 지분 5」로 읽어 `assets[5]`를 집지 않게 한다.
 */
function splitSuffix(suffix: string): [string, string | undefined] {
  const j = suffix.lastIndexOf(SHARE_INDEX_SEPARATOR);
  if (j <= 0) return [suffix, undefined];
  const head = suffix.slice(0, j);
  const tail = suffix.slice(j + SHARE_INDEX_SEPARATOR.length);
  return /^\d+$/.test(tail) && !/^\d+$/.test(head) ? [head, tail] : [suffix, undefined];
}

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
  const suffix = propertyId.slice(i + SHARE_ID_SEPARATOR.length);
  // 다건 복합 접미사(`prop-1.0`)는 뒷부분이 지분 번호다(Q-2 a).
  const raw = splitSuffix(suffix)[1] ?? suffix;
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
 * `land#asset-1` → `asset-1` · `land#0` → `0` · `land#prop-1.0` → `prop-1`(다건 지분 — 자산 부분). 접미사가 없으면 `undefined`.
 * 지분 인덱스(숫자)와 함께 양도 자산 id를 가리지 않는다 — 함께 양도·연간 합산 결과 상세(`generalBuildingDetailsByAsset`)의 키가 이 값이다.
 */
export function cardSuffixOf(propertyId: string): string | undefined {
  const i = propertyId.indexOf(SHARE_ID_SEPARATOR);
  return i < 0 ? undefined : splitSuffix(propertyId.slice(i + SHARE_ID_SEPARATOR.length))[0];
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
