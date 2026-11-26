/**
 * 가업상속공제 자산 — §95④ 후단 장기보유특별공제의 「부분별 양도차익」 분할 (순수 함수 leaf)
 *
 * 계획서: docs/02-design/features/transfer-fb-lthd-portion-gain.engine.plan.md §3
 *
 * 「소득세법」 §95④ 후단은 가업상속공제가 적용된 **비율에 해당하는 자산**의 보유기간을 피상속인 취득일부터 기산한다.
 * 두 부분(적용분 · 비적용분)의 취득가액 base가 다르다(§97의2④ — 1호 피상속인 취득가액 · 2호 상속개시일 평가액).
 * 그래서 전체 양도차익을 r로 비례 안분하지 않고 **양도가액·필요경비는 r로, 취득가액은 문언 두 항 그대로** 나눠
 * 부분별 양도차익을 구한다(교재 사례 방식 — 해석례·심판례 0건, 계획서 §1.5).
 *
 * 기호: P 양도가액 · E 필요경비 · X = P − E = G + (tD + tH) − dep · n/d 적용률 분수 · dep §97③ 감가상각비
 *   tD = ⌊A_d·n/d⌋ (1호) · tH = ⌊V·(d−n)/d⌋ (2호)
 *   gD = ⌊X·n/d⌋ − (tD − depD) · depD = ⌊dep·tD/(tD+tH)⌋ (Q-3 (1) — 취득가액 두 항 비율)
 *   gH = G − gD (잔액 흡수 — 같은 base X의 안분이라 Σ = G 불변식이 성립)
 *
 * 일반 §97 재귀(두 부분 base 동일 = 상속개시일 평가액)에는 쓰지 않는다 — 현행 비례 안분이 법리상 맞다(Q-4).
 * `Math.round`·부동소수 곱 금지 — `applyRateFraction`(BigInt 가드)만 쓴다.
 */

import { applyRateFraction } from "./tax-utils";
import { resolveFamilyBusinessRateFraction } from "./family-business-applied-rate";
import type { TransferTaxInput } from "./types/transfer.types";

/** §97의2④ 의제 취득가액의 두 항 — 1호(적용분) · 2호(비적용분) */
export interface FbImputedTerms {
  decedentTerm: number;
  heirTerm: number;
}

/** 가업상속공제적용률 정수 분수 (0 ≤ numerator ≤ denominator, denominator > 0) */
export interface FbRateFraction {
  numerator: number;
  denominator: number;
}

/** 부분별 양도차익 (12억 초과 안분 전) */
export interface FbSliceGains {
  /** 적용분 양도차익 gD (차손이면 음수) */
  decedent: number;
  /** 비적용분 양도차익 gH = G − gD (차손이면 음수) */
  heir: number;
  /** 적용분 양도가액 − 필요경비 몫 ⌊X·n/d⌋ (표시용) */
  decedentNetShare: number;
  /** 비적용분 몫 X − ⌊X·n/d⌋ (표시용) */
  heirNetShare: number;
}

/**
 * 부분별 양도차익.
 *
 * @param transferGain 안분 전 양도차익 G (= 의제 취득가액 기준 · 감가상각비 반영 후)
 * @param depreciationAmount §97③ 감가상각비(엔진이 취득가액 한도로 절삭한 값 — 없으면 0)
 * @returns 슬라이스를 만들 수 없으면(G ≤ 0 · X < 0) undefined — 호출부는 현행 비례 경로로 후퇴한다
 */
export function splitFbSliceGains(args: {
  transferGain: number;
  depreciationAmount: number;
  terms: FbImputedTerms;
  fraction: FbRateFraction;
}): FbSliceGains | undefined {
  const { transferGain, depreciationAmount, terms, fraction } = args;
  if (transferGain <= 0) return undefined;
  const acquisition = terms.decedentTerm + terms.heirTerm;
  const net = transferGain + acquisition - depreciationAmount; // X = 양도가액 − 필요경비
  if (net < 0) return undefined;
  const decedentNetShare = applyRateFraction(net, fraction.numerator, fraction.denominator);
  const depreciationOfDecedent =
    acquisition > 0 ? applyRateFraction(depreciationAmount, terms.decedentTerm, acquisition) : 0;
  const decedent = decedentNetShare - (terms.decedentTerm - depreciationOfDecedent);
  return { decedent, heir: transferGain - decedent, decedentNetShare, heirNetShare: net - decedentNetShare };
}

/**
 * 부분별 공제 기준액 — 12억 초과 안분 후 과세 양도차익 T를 부분 양도차익 비율로 나눈다.
 *
 * Q-2 (a): **차손 부분은 0, 양수 부분은 자기 몫 전액**(`⌊T·g/G⌋`, G = gD + gH). 한 부분이 차손이면 양수 부분의
 * 몫이 T보다 클 수 있다(그 부분 공제액이 자산 양도차익의 법정 상한을 넘을 수 있다 — 사용자 결정, 해석례 미확보).
 * 두 부분이 모두 양수이면 `Σ = T`(비적용분은 잔액 흡수).
 *
 * @param taxableGain T (> 0)
 * @param decedentGain gD · @param heirGain gH — 합 G가 0보다 커야 한다
 */
export function splitFbTaxableGains(
  taxableGain: number,
  decedentGain: number,
  heirGain: number,
): { decedent: number; heir: number } {
  const total = decedentGain + heirGain;
  const positiveD = Math.max(decedentGain, 0);
  const positiveH = Math.max(heirGain, 0);
  const decedent = positiveD > 0 ? applyRateFraction(taxableGain, positiveD, total) : 0;
  if (positiveD > 0 && positiveH > 0) return { decedent, heir: taxableGain - decedent };
  return { decedent, heir: positiveH > 0 ? applyRateFraction(taxableGain, positiveH, total) : 0 };
}

/**
 * 슬라이스 전제 — `splitFbSliceGains`의 `X = G + tD + tH − dep`는 **계산에 실제로 쓰인 취득가액이 의제 취득가액 `tD + tH`**이고
 * **양도가액이 물건 전체(100%) 값**이라는 전제 위에서만 `X = 양도가액 − 필요경비`다. 둘 중 하나라도 깨지면 가짜 차손 부분이 생긴다.
 *   · 부담부증여(STEP 0.48)가 취득가액을 채무비율로 다시 정한다 → 취득가액 ≠ tD + tH
 *   · 지분 양도는 STEP 0.42가 가업상속 입력도 지분분으로 줄이므로 전제가 성립한다(transfer-fb-share Q-4) — 지분이 아닌데 총 물건가 ≠ 양도가액이면 후퇴
 * 전제가 깨지면 부분별 양도차익을 만들지 않고 종전 비례 안분 경로로 후퇴한다(PR 전과 비트 동일, echo 없음).
 */
export interface FbSlicePremise {
  /** 양도차익 계산에 실제로 쓰인 취득가액 — 환산·감정·매매사례 등 추계 모드이면 undefined (`transfer-tax.ts` STEP 2 직후 값) */
  acquisitionUsed: number | undefined;
  /** 지분 양도 사실 — 지분율 < 1 이거나 12억 안분 분모(총 물건가)가 양도가액과 다르면 양도가액은 물건 전체가 아니다 */
  ownershipRatio?: number;
  transferPrice: number;
  totalPropertyTransferPrice?: number;
}

function fbSlicePremiseHolds(premise: FbSlicePremise, terms: FbImputedTerms): boolean {
  if (premise.acquisitionUsed !== terms.decedentTerm + terms.heirTerm) return false;
  // 지분: STEP 0.42가 의제 두 항을 같은 ownershipRatio로 줄였고 양도가액·필요경비도 지분분이다 → X = 양도가액 − 필요경비가 성립한다
  //   (계획서 transfer-fb-share Q-4 — #3678의 지분 후퇴 가드 해제).
  if (premise.ownershipRatio !== undefined && premise.ownershipRatio < 1) return true;
  // 지분이 아닌데 총 물건가 ≠ 양도가액이면 원인을 모른다 — 종전대로 후퇴
  return premise.totalPropertyTransferPrice === undefined || premise.totalPropertyTransferPrice === premise.transferPrice;
}

/**
 * STEP 4 호출부용 — 의제 재귀(`imputedTerms`가 실린 입력)에만 부분별 양도차익을 싣는다.
 * 그 밖의 입력(일반 §97 재귀 · 가업상속 아님)은 같은 객체를 돌려준다. 만들 수 없으면(G ≤ 0 · 전제 불성립) 그대로 둔다.
 */
export function withFbSliceGains<T extends TransferTaxInput>(
  input: T,
  transferGain: number,
  depreciationAmount: number | undefined,
  premise: FbSlicePremise,
): T {
  const latter = input.fbLthdLatter;
  if (!latter?.imputedTerms || !fbSlicePremiseHolds(premise, latter.imputedTerms)) return input;
  const fraction = latter.appliedRateFraction ?? resolveFamilyBusinessRateFraction(latter.appliedRate);
  const sliceGains = splitFbSliceGains({
    transferGain,
    depreciationAmount: depreciationAmount ?? 0,
    terms: latter.imputedTerms,
    fraction,
  });
  return sliceGains ? { ...input, fbLthdLatter: { ...latter, sliceGains } } : input;
}
