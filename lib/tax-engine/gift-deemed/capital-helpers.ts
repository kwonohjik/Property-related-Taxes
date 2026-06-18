/**
 * 자본거래 공용 헬퍼 — 증자·현물출자·전환 후 가중평균 1주당 가액.
 * 시행령 §29②1가목 산식: [(전 1주평가 × 전 주식총수) + (신주인수가 × 증가주식수)] ÷ (전 주식총수 + 증가주식수)
 * BigInt로 분자 오버플로(평가×주식수 = 조 단위) 방지, floor.
 */
export function computeWeightedPerShare(
  prePrice: number,
  preShares: number,
  newPrice: number,
  newShares: number,
): number {
  const denom = preShares + newShares;
  if (denom <= 0) return 0;
  const numer =
    BigInt(Math.floor(prePrice)) * BigInt(Math.floor(preShares)) +
    BigInt(Math.floor(newPrice)) * BigInt(Math.floor(newShares));
  return Number(numer / BigInt(Math.floor(denom)));
}
