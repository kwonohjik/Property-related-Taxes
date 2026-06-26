/**
 * 자기주식 일시보유 — 자기참조 평가 (treasury stock self-referential valuation)
 *
 * 근거: 상증령 §54②·§55① + 해석례 재재산-1494(2004.11.10)·자본거래-2616(2020.7.06)·
 *      재재산-616(2023.4.26) (교재 이미지 4~8, p.1453~1456)
 *
 * 일시보유목적 자기주식은 "자산으로 보아" 1주당 평가액(X)으로 재평가하므로 X가 양변에 등장하는
 * 자기참조 방정식이 된다. 폐형 해를 정수연산(BigInt, floor 절사)으로 산출한다.
 *
 *   일반법인:      X = [ (A+t·X)/N × 2 + p × 3 ] ÷ 5  →  X = floor( (2A + 3pN) / (5N − 2t) )
 *   부동산과다보유: X = [ (A+t·X)/N × 3 + p × 2 ] ÷ 5  →  X = floor( (3A + 2pN) / (5N − 3t) )
 *   순자산가치만:   X = (A + t·X)/N                    →  X = floor( A / (N − t) )
 *   80% 하한 재계산: NA80 = floor( A / (N − 0.8t) ) = floor( 10A / (10N − 8t) ), 최종 = floor(NA80 × 0.8)
 *
 * 기호: A=자기주식 제외 순자산가액(영업권 포함 후 ③), t=자기주식수, N=발행주식총수, p=1주당 순손익가치(⑤).
 *
 * Design: docs/02-design/features/inheritance-unlisted-stock-treasury-stock.engine.design.md §3
 */

export interface SelfRefInput {
  /** A — 영업권 포함 후 순자산가액 (③) */
  netAssetTotal: number;
  /** t — 자기주식수 */
  treasuryShares: number;
  /** N — 발행주식총수 */
  totalShares: number;
  /** p — 1주당 순손익가치 (⑤) */
  netIncomeValuePerShare: number;
  /** §54① 본문 괄호 부동산과다보유법인 여부 */
  isRealEstateHeavy: boolean;
  /** §54④ 순자산 단독 평가 (무조건 사유만 true) */
  netAssetOnly: boolean;
}

export interface SelfRefResult {
  /** ⑥ 최종 1주당 평가액 (X) */
  finalPerShareValue: number;
  /** 일시보유 ④ = floor((A + t·X_w)/N) — 자기주식을 가중평균값으로 재평가한 순자산가치 */
  selfRefNetAssetPerShare: number;
  /** ㉠ 가중평균(자기참조) X_w */
  weightedSelfRef: number;
  /** 80% 자기참조 재계산 발동 여부 */
  floor80Applied: boolean;
  /** NA80 = floor(A/(N−0.8t)) — floor80Applied 시에만 */
  floor80NetAssetValue?: number;
}

/** floor 정수해 — 양수 BigInt 나눗셈은 0 방향 절단 = floor */
function floorDiv(numerator: bigint, denominator: bigint): number {
  return Number(numerator / denominator);
}

/** floor(value × 0.8) — 정수연산 (×4 ÷5) */
function eightyPercent(value: number): number {
  return Number((BigInt(value) * 4n) / 5n);
}

export function solveSelfReferentialValuation(input: SelfRefInput): SelfRefResult {
  const A = BigInt(Math.trunc(input.netAssetTotal));
  const t = BigInt(Math.trunc(input.treasuryShares));
  const N = BigInt(Math.trunc(input.totalShares));
  const p = BigInt(Math.trunc(input.netIncomeValuePerShare));

  // 분모 방어: 자기주식수가 발행주식총수 이상이면 평가 불가 (validation이 선차단하나 defensive)
  if (N - t <= 0n) {
    return {
      finalPerShareValue: 0,
      selfRefNetAssetPerShare: 0,
      weightedSelfRef: 0,
      floor80Applied: false,
    };
  }

  // ① 순자산단독 (무조건 사유): X = floor(A/(N−t))  — 이미지 ㉰
  if (input.netAssetOnly) {
    const x = floorDiv(A, N - t);
    return {
      finalPerShareValue: x,
      selfRefNetAssetPerShare: x,
      weightedSelfRef: x,
      floor80Applied: false,
    };
  }

  // ② 가중평균 자기참조 (일반 na=2·ni=3 / 부동산과다 na=3·ni=2)
  const na = input.isRealEstateHeavy ? 3n : 2n;
  const ni = input.isRealEstateHeavy ? 2n : 3n;
  const weightedSelfRef = floorDiv(na * A + ni * p * N, 5n * N - na * t);

  // ③ 일시보유 ④ = floor((A + t·X_w)/N)
  const selfRefNetAssetPerShare = floorDiv(A + t * BigInt(weightedSelfRef), N);

  // ④ 80% 하한 판정·재계산
  const threshold = eightyPercent(selfRefNetAssetPerShare); // ④ × 0.8
  if (weightedSelfRef < threshold) {
    const floor80NetAssetValue = floorDiv(10n * A, 10n * N - 8n * t); // NA80
    return {
      finalPerShareValue: eightyPercent(floor80NetAssetValue), // floor(NA80 × 0.8)
      selfRefNetAssetPerShare,
      weightedSelfRef,
      floor80Applied: true,
      floor80NetAssetValue,
    };
  }

  return {
    finalPerShareValue: Math.max(weightedSelfRef, threshold),
    selfRefNetAssetPerShare,
    weightedSelfRef,
    floor80Applied: false,
  };
}
