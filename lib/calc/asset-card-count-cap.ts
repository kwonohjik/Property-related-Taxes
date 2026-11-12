/**
 * 양도세 자산 카드 수 상한 — ⑤(「+ 추가」 버튼)·⑧(validate)·⑫(Zod)의 단일 소스.
 *
 * ⑫가 받는 개수와 화면이 만들 수 있는 개수가 어긋나면 사용자는 카드를 다 입력한 뒤 계산 단계에서야 400을 만난다.
 * - 일반건물 × 지분 분할(축 B): ④가 **주 자산을 포함한 전 카드**를 `generalBuildingShares[]`로 보낸다 → 카드 10장.
 * - 그 밖(함께 양도·다른 자산 지분 분할): 주 자산 1장 + `companionAssets[]` → 카드 11장.
 *
 * 이 파일은 import가 없다 — `lib/api` 스키마가 읽어도 순환이 생기지 않게 한다.
 */

/** ⑫ `generalBuildingShares` 배열 상한(주 자산 포함 지분 수). */
export const GB_SHARES_MAX = 10;

/** ⑫ `companionAssets` 배열 상한(주 자산 제외). */
export const COMPANION_ASSETS_MAX = 10;

/** 화면 카드 상한 — 일반건물 지분 묶음이면 지분 배열 상한, 아니면 주 자산 1장 + 컴패니언 상한. */
export function maxAssetCards(gbFractionalBundle: boolean): number {
  return gbFractionalBundle ? GB_SHARES_MAX : COMPANION_ASSETS_MAX + 1;
}

/** ⑧ 차단 문구 · ⑤ 한도 안내 문구(같은 문장). */
export function assetCardCapMessage(gbFractionalBundle: boolean): string {
  return gbFractionalBundle
    ? `일반건물 지분 분할 취득은 지분 카드 ${GB_SHARES_MAX}건까지 계산할 수 있습니다.`
    : `자산은 주 자산을 포함해 ${COMPANION_ASSETS_MAX + 1}건까지 함께 계산할 수 있습니다.`;
}
