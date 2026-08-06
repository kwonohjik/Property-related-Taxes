/**
 * §163⑨ 「상속 또는 증여」 공통 파생 — **UI 노출 게이트와 API payload 빌더의 단일 소스**.
 *
 * 「소득세법 시행령」 §163⑨ 본문: "**상속 또는 증여**(…)받은 자산에 대하여 법 §97①1호가목을
 * 적용할 때에는 **상속개시일 또는 증여일 현재** 「상속세 및 증여세법」 §60~66에 따라 평가한
 * 가액을 취득당시의 실지거래가액으로 본다."
 *
 * ⇒ 상속·증여가 **같은 규정**이므로 대상 판정과 기준일 파생을 한 곳에 둔다.
 *
 * ⚠️ **각자 파생하면 어긋난다.** 취득원인을 상속에서 증여로 바꾼 자산에는 `inheritanceStartDate`가
 *    stale로 남는다. 한쪽이 그 값을, 다른 쪽이 `acquisitionDate`를 보면 그 순간 "입력 칸은 보이는데
 *    payload는 생기지 않는" 침묵 실패가 된다 — 술어를 공유해도 **인자가 다르면 단일 소스가 아니다**
 *    (memory `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ **이월과세(`carryover_gift`)는 대상이 아니다** — 「소득세법」 §97의2 증여자 취득가액 승계 경로다.
 * ⚠️ 증여의제(「상속세 및 증여세법」 §34~§42의3)는 §163⑨ 본문 괄호가 제외하나, 현행 취득원인
 *    선택지에 해당 항목이 없어(`CompanionAcquisitionCauseSection`) `gift`는 순수 수증만이다.
 *
 * 계획서: docs/02-design/features/gift-163-9-clause-1-2-max.plan.md §5 · §7 U-3·U-4
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** §163⑨ 파생에 필요한 최소 필드 — 폼 전체를 요구하지 않아 엔진·테스트에서도 그대로 쓴다. */
export type Sec163_9Asset = Pick<
  AssetForm,
  "acquisitionCause" | "inheritanceStartDate" | "acquisitionDate"
>;

/** §163⑨ 본문의 「상속 또는 증여」 — 이월과세·매매·신축은 대상이 아니다. */
export function isSec163_9Cause(cause: AssetForm["acquisitionCause"] | undefined): boolean {
  return cause === "inheritance" || cause === "gift";
}

/**
 * §163⑨ 기준일 — 「상속개시일 **또는 증여일** 현재」.
 *
 * · 상속: `inheritanceStartDate`(상속개시일). 미입력 시 `acquisitionDate`로 fallback한다
 *         — `CompanionAssetCard`가 동기화하지만 기존 세션 데이터 호환을 위해 유지.
 * · 증여: **`acquisitionDate`(증여일)만** 본다. stale `inheritanceStartDate`를 타면 안 된다.
 *
 * 대상이 아닌 취득원인이면 빈 문자열 — 호출부는 falsy로 게이트한다.
 */
export function deriveSec163_9BaseDate(asset: Sec163_9Asset): string {
  if (!isSec163_9Cause(asset.acquisitionCause)) return "";
  if (asset.acquisitionCause === "gift") return asset.acquisitionDate || "";
  return asset.inheritanceStartDate || asset.acquisitionDate || "";
}

/**
 * 의제취득일 — 「소득세법」 부칙(1985.1.1. 개정). 이 날 **前** 취득은 §176조의2④(나목)도
 * 적용 영역이라 ③(환산)이 존재한다. 그래서 「가목 확인 불가」 선언이 갈 곳이 있다.
 */
export const DEEMED_ACQUISITION_DATE = "1985-01-01";

/** §163⑨ 대상이면서 기준일이 의제취득일 **前**인가 — pre-deemed 분기의 단일 술어. */
export function isSec163_9PreDeemed(asset: Sec163_9Asset): boolean {
  const baseDate = deriveSec163_9BaseDate(asset);
  return !!baseDate && baseDate < DEEMED_ACQUISITION_DATE;
}

/**
 * 취득원인별 기준일 명칭 — 「상속개시일」 / 「증여일」.
 *
 * 화면 문구가 "상속개시일"로 고정돼 있으면 증여 사용자에게는 **틀린 안내**가 된다.
 * 라벨·안내문은 이 함수를 거친다.
 */
export function sec163_9BaseDateLabel(asset: Sec163_9Asset): string {
  return asset.acquisitionCause === "gift" ? "증여일" : "상속개시일";
}

/** 취득 행위 명칭 — 「상속」 / 「증여」. 안내문 본문용. */
export function sec163_9CauseLabel(asset: Sec163_9Asset): string {
  return asset.acquisitionCause === "gift" ? "증여" : "상속";
}

/**
 * 개별주택가격 최초공시일 — 이 날 **前** 상속·증여받은 주택이 §163⑨**2호**의 §164⑤~⑦ max 대상.
 * 엔진 `inheritance-house-valuation.ts`의 `HOUSE_FIRST_DISCLOSURE_DATE`와 같은 경계다.
 */
export const HOUSE_FIRST_DISCLOSURE = "2005-04-30";

/** §163⑨2호 §164⑤~⑦ 대상 주택 자산 — 엔진 `buildInheritedHouseValuationPayload`의 `isHouse`와 동일. */
export function isSec163_9House(assetKind: AssetForm["assetKind"] | undefined): boolean {
  return assetKind === "housing" || assetKind === "redevelopment_apt";
}
