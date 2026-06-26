/**
 * 공익법인 출연 특수관계법인 주식 한도 자동계산 (상증법 §16②)
 *
 * §16②2호: 출연 주식등 + §16②1호 합산분이 발행주식총수등 × 유형별 비율 초과 시
 *   초과분 가액을 상속세 과세가액에 산입.
 *   비율 — 본문 10% / 가목 20%(의결권 미행사+자선·장학·사회복지) / 나목·다목 5%.
 * (KoreanLaw §16② 원문 직접 확인 2026-06-19)
 *
 * 정수 연산: 한도주식수 = floor(발행총수 × 정수퍼센트 / 100) (float 누적 회피).
 *   초과액 = safeMultiply(초과주식수, 주당평가액) — overflow BigInt fallback.
 */

import { EXEMPTION } from "./legal-codes";
import { safeMultiply } from "./tax-utils";

export type PublicInterestType =
  | "general"
  | "charity_no_voting"
  | "mutual_investment_restricted"
  | "art48_11_unmet";

export interface RelatedStockExcessInput {
  /** 출연 주식수 */
  donatedShares: number;
  /** 발행주식총수등 (자기주식 제외) */
  totalShares: number;
  /** §16②1호 합산 기보유분 주식수 */
  priorHeld: number;
  /** 공익법인 유형 */
  type: PublicInterestType;
  /** 1주당 평가액 (원) */
  valuePerShare: number;
}

export interface RelatedStockExcessResult {
  /** 적용 비율 (0.1 / 0.2 / 0.05) */
  ratio: number;
  /** 한도 주식수 = floor(발행총수 × 비율) − 기보유분 (음수 0 가드) */
  limitShares: number;
  /** 초과 주식수 = max(0, 출연 − 한도) */
  excessShares: number;
  /** 과세가액 산입액 = 초과주식수 × 주당평가액 */
  excessStockAmount: number;
}

/**
 * §16② 특수관계법인 주식 한도 초과분 자동계산.
 * 입력 음수는 0으로 가드. 한도가 음수(기보유분 > 발행×비율)면 0(전량 초과 가능).
 */
export function computeRelatedStockExcess(
  input: RelatedStockExcessInput,
): RelatedStockExcessResult {
  const ratio = EXEMPTION.INH_RELATED_STOCK_RATIO[input.type];
  const donated = Math.max(0, input.donatedShares);
  const total = Math.max(0, input.totalShares);
  const prior = Math.max(0, input.priorHeld);
  const valuePerShare = Math.max(0, input.valuePerShare);

  // 정수 퍼센트로 환산해 floor — float 누적(0.1 등) 회피
  const pct = Math.round(ratio * 100);
  const limitShares = Math.max(0, Math.floor((total * pct) / 100) - prior);
  const excessShares = Math.max(0, donated - limitShares);
  const excessStockAmount =
    excessShares > 0 ? safeMultiply(excessShares, valuePerShare) : 0;

  return { ratio, limitShares, excessShares, excessStockAmount };
}

/**
 * ExemptionCheckedItem이 §16② 자동계산 입력을 갖췄는지 판정.
 * 유형 + 출연주식수 + 발행총수 + 주당평가액 모두 유효해야 자동계산 적용.
 */
export function hasAutoRelatedStockInput(item: {
  publicInterestType?: PublicInterestType;
  relatedStockDonatedShares?: number;
  relatedStockTotalShares?: number;
  relatedStockValuePerShare?: number;
}): boolean {
  return (
    item.publicInterestType != null &&
    (item.relatedStockDonatedShares ?? 0) > 0 &&
    (item.relatedStockTotalShares ?? 0) > 0 &&
    (item.relatedStockValuePerShare ?? 0) > 0
  );
}
