/**
 * 국내 상장 3시장(유가증권·코스닥·코넥스) — Step 2 「환산 — 상장」 블록의 표시 조건 단일 소스
 *
 * 그 블록 안의 「기준시가 산정 방식」 라디오(`AcquisitionStdModeRadio`)가 「취득 후 상장」
 * (영 §165⑤ — 코스닥·코넥스 / §165⑥ — 유가증권시장 준용)을 고르는 유일한 칸이다.
 * 두 조문 모두 「양도일 현재 상장 주식등」이 전제라 비상장·기타자산에는 그 환산이 없다.
 *
 * 시장을 상장 → 비상장으로 바꿔도 `acquisitionStdMode === "post_listing"`이 폼에 남는다
 * (라디오가 사라져 고칠 칸도 없다). 그 값은 «읽는 쪽»이 이 술어로 무시한다 —
 * ⑤ Step 2 표시 · ④ `acquiredBeforeListing`·결산서 어댑터 · ⑫ 직접 API 차단이 같은 함수를 부른다.
 * (U-15 — 실측: 비상장 간이 입력에서 취득가액 0 · 세액 1,484,375,000 → 282,352,941 · 1,413,626,760)
 */
export function isListedStockMarket(marketType: string | undefined): boolean {
  return marketType === "kospi" || marketType === "kosdaq" || marketType === "konex";
}

/** ⑫ 직접 API 차단 문구 — 비상장·기타자산에 `acquiredBeforeListing = true` */
export const POST_LISTING_UNLISTED_MARKET_MESSAGE =
  "취득 후 상장 환산(소득세법 시행령 §165⑤·⑥)은 양도일 현재 상장된 주식(유가증권·코스닥·코넥스)에만 적용됩니다. 비상장·기타자산은 시행령 §165④ 보충적 평가로 환산합니다.";
