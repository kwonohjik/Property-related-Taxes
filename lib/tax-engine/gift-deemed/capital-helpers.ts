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

/**
 * 시행령 §29⑤ 소액주주 = 발행주식총수등의 100분의 1 미만 소유 AND 주식등 액면가액 합계 3억원 미만.
 * (§39②·§39의3②의 "이익을 증여한 소액주주 2명 이상 → 1인 의제" 판정에 공통 사용)
 */
export function isSmallShareholder(params: { ownedShares: number; totalShares: number; faceValueSum: number }): boolean {
  const { ownedShares, totalShares, faceValueSum } = params;
  const underOnePercent = totalShares > 0 && ownedShares * 100 < totalShares; // 100분의 1 미만(strict)
  const underThreshold = faceValueSum < 300_000_000; // 액면 합계 3억원 미만(strict)
  return underOnePercent && underThreshold;
}

/**
 * §39②·§39의3②: 저가발행(§39①1호)·현물출자 저가인수(§39의3①1)에서 이익을 증여한 자가
 * 소액주주(§29⑤)로서 2명 이상이면 1명이 증여한 것으로 보고 이익을 계산한다.
 * 단일-수증자 집계 모델에서는 증여재산가액 총액은 불변(이미 1건으로 합산)이며,
 * 본 함수는 의제 적용 여부(동일인 합산·근거 표시)를 판정한다.
 */
export function appliesSmallShareholderImputation(
  donors: Array<{ ownedShares: number; faceValueSum: number }>,
  totalShares: number,
): boolean {
  return donors.filter((d) => isSmallShareholder({ ownedShares: d.ownedShares, totalShares, faceValueSum: d.faceValueSum })).length >= 2;
}

/**
 * §28⑤2 합병후 1주당 단순평균액 =
 *   (과대평가법인 합병전 주식가액 + 과소평가법인 합병전 주식가액) ÷ 합병후 존속법인 주식수.
 * 분모(postShares)는 합병비율 반영값 — preShares 합과 다르므로 별도 주입(computeWeightedPerShare 부적합).
 * BigInt로 분자 오버플로 방지, floor.
 */
export function computeMergerSimpleAvg(
  overPrice: number,
  overShares: number,
  underPrice: number,
  underShares: number,
  postShares: number,
): number {
  if (postShares <= 0) return 0;
  const numer =
    BigInt(Math.floor(overPrice)) * BigInt(Math.floor(overShares)) +
    BigInt(Math.floor(underPrice)) * BigInt(Math.floor(underShares));
  return Number(numer / BigInt(Math.floor(postShares)));
}

/**
 * 합병 양 당사법인 주주의 동일인 판정 (재산세과-799 자기증여 차감 대상).
 * 식별자(id) 일치로 판정 — UI에서 같은 주주는 같은 id 부여.
 */
export function isSameMergerShareholder(overId: string, underId: string): boolean {
  return overId.trim().length > 0 && overId.trim() === underId.trim();
}
