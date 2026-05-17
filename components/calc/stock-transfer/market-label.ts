/**
 * 주식 양도세 시장 라벨 — 입력·결과 공유
 * F-5: 비상장(unlisted) 추가. 기타자산(other_asset)은 §94①4 별도 트랙 — echo 없음.
 */
export const MARKET_LABEL = {
  kospi: "코스피",
  kosdaq: "코스닥",
  konex: "코넥스",
  unlisted: "비상장",
} as const;

export type MarketLabelKey = keyof typeof MARKET_LABEL;
