import { safeMultiply } from "../tax-utils";

/** 「상증령」§29②2호·4호 비율 요건 — 「100분의 30 이상」 */
const RATIO_NUMER = 30;
const RATIO_DENOM = 100;

/**
 * 「상증령」§29②2호·4호의 「100분의 30 이상」 판정 — **임계를 절사하지 않는다**.
 *
 *   2호(저가 나목): 차액이 「가목의 규정에 의하여 계산한 가액」의 100분의 30 이상
 *   4호(고가 나목): 차액이 「제3호 나목의 가액」의 100분의 30 이상
 *   두 기준가액 모두 **증자 후 1주당 가액**이다.
 *
 * ⚠️ `safeMultiplyThenDivide(기준가액, 30, 100)`으로 임계를 만들면 `Math.floor`가 임계를
 *    **낮춘다**(`tax-utils.ts`). 비교가 `>=`(이상)이라 절사는 게이트를 **통과시키는 쪽으로만**
 *    작동하고, 따라서 오차 방향이 항상 **과다과세**다.
 *    기준가액이 10의 배수가 아니면 `기준가액 × 0.3`에 소수부가 남아 **기준가액마다 경계점이
 *    1점씩** 생긴다. 게이트가 all-or-nothing이라 그 1점에서 어긋나는 금액은 1원이 아니라
 *    **증여재산가액 전액**이다(실측: 저가·고가 각 150,000,000 · cap-table 282,600,000).
 *
 * ⇒ 양변에 분모를 곱한 교차곱으로 비교한다. 부호와 무관하게 원식과 동치다(분모 > 0).
 */
export function meetsRatioThreshold(diffPerShare: number, basePerShare: number): boolean {
  return safeMultiply(diffPerShare, RATIO_DENOM) >= safeMultiply(basePerShare, RATIO_NUMER);
}

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
 * 주권상장법인등 1주당 가액 단서 — 시행령 §29②1가 단서(min) · §29②3나 단서(max).
 *
 *   §29②1가: 「… 다만, **주권상장법인등**의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여
 *             계산한 1주당 가액보다 **적은** 경우에는 당해 가액」                    ⇒ min
 *   §29②3나: 「… 다만, 주권상장법인등의 경우로서 … 산식 가액보다 **큰** 경우에는 당해 가액」 ⇒ max
 *
 * ⚠️ 방향을 뒤집으면 **과다과세**다. 비대칭인 이유는 그 값이 놓인 자리가 다르기 때문이다:
 *   저가 = **가목**(평가) − 나목(인수가) → 평가가 **피감수** → 적은 쪽이 이익 ↓
 *   고가 = 가목(인수가) − **나목**(평가) → 평가가 **감수**   → 큰 쪽이  이익 ↓
 * ⇒ 두 방향 모두 **이익을 줄이는 쪽**이다.
 *
 * 준용 관계: §29의3①(현물출자 — 「"증자"는 "현물출자"로 본다」) · §30⑤1(전환사채) ·
 *            §29②6(전환주식은 §29②1~5를 통해 상속).
 *
 * 상장이라도 평균액 미입력이면 **이론값 유지**(자동 추정 금지) — 입력 차단은 validate/Zod 담당.
 */
export function applyListedPerShareBound(
  theoretical: number,
  opts: { isListed?: boolean; listedMarketAvg?: number },
  pick: "min" | "max",
): number {
  const avg = opts.listedMarketAvg ?? 0;
  if (!opts.isListed || avg <= 0) return theoretical;
  return pick === "min" ? Math.min(avg, theoretical) : Math.max(avg, theoretical);
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
