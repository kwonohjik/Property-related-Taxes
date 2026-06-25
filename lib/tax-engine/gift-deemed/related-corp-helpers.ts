/**
 * §45의3 일감몰아주기 — 엔진 헬퍼.
 * 분수 정수연산 유틸 + 2모드 간접보유 + §⑩ 과세제외매출.
 * 정책: Math.round 금지(CLAUDE.md 정수연산) · 분수 곱은 BigInt(2^53 초과 방지).
 */
import type { RcIntermediaryCorpItem, RcSalesPartner } from "./types";

export type Frac = { numer: number; denom: number };

/** 분수 → 부동소수 (정렬·비교 보조용만. 정확성 직결 연산엔 사용 금지) */
export function toDecimal(f: Frac): number {
  return f.denom === 0 ? 0 : f.numer / f.denom;
}

/** 분수 min — 교차곱 비교 (부동소수 불사용, 양수 분모 가정) */
export function fracMin(a: Frac, b: Frac): Frac {
  return a.numer * b.denom <= b.numer * a.denom ? a : b;
}

/**
 * 분수 max(0, a − b) — 공통분모 정수 뺄셈 (음수 방지, Math.round 없음).
 * 교차곱 분자가 2^53을 넘을 수 있으므로 BigInt로 계산 후 Number 복원.
 */
export function fracMaxZeroSub(a: Frac, b: Frac): Frac {
  const diff = BigInt(a.numer) * BigInt(b.denom) - BigInt(b.numer) * BigInt(a.denom);
  const commonDenom = BigInt(a.denom) * BigInt(b.denom);
  const numer = diff > 0n ? diff : 0n;
  return { numer: Number(numer), denom: Number(commonDenom) };
}

/**
 * profit × f1 × f2 — 단일 분수 합성 후 floor 1회 (중첩 floor 금지 — P-3).
 * f1.numer·f2.numer 곱이 2^53 초과 가능 → 전 구간 BigInt.
 */
export function applyTwoFractions(profit: number, f1: Frac, f2: Frac): number {
  const num = BigInt(profit) * BigInt(f1.numer) * BigInt(f2.numer);
  const den = BigInt(f1.denom) * BigInt(f2.denom);
  if (den === 0n) return 0;
  return Number(num / den); // BigInt 나눗셈 = floor
}

/**
 * §⑱1호 간접출자법인 판정: owners 중 지배주주등(rulingGroupIds) 합산 보유비율 ≥ 30%.
 * 사례: B(갑30+을20=50%≥30 ✓) 포함 / C(갑10%<30 ✗) 제외.
 */
function isIntermediarySec18(corp: RcIntermediaryCorpItem, rulingGroupIds: string[]): boolean {
  // 지배주주등 보유비율 분수 누적 (BigInt — 분모 곱 누적 안전)
  let accNumer = 0n;
  let accDenom = 1n;
  for (const o of corp.owners) {
    if (!rulingGroupIds.includes(o.individualId)) continue;
    accNumer = accNumer * BigInt(o.ratio.denom) + BigInt(o.ratio.numer) * accDenom;
    accDenom = accDenom * BigInt(o.ratio.denom);
  }
  // accNumer/accDenom ≥ 30/100 ↔ accNumer×100 ≥ 30×accDenom
  return accNumer * 100n >= 30n * accDenom;
}

/**
 * 간접보유비율 2모드.
 * - ruling: 모든 간접출자법인 경유 합산 (§⑱ 제한 없음) — 지배주주 판정용.
 * - recipient: §⑱1호 충족 법인 경유만 — 수증자 판정·증여이익용.
 */
export function computeIndirectRatio(
  shareholderId: string,
  intermediaryCorps: RcIntermediaryCorpItem[],
  mode: "ruling" | "recipient",
  rulingGroupIds: string[] = [],
): Frac {
  let accNumer = 0n;
  let accDenom = 1n;
  for (const corp of intermediaryCorps) {
    if (mode === "recipient" && !isIntermediarySec18(corp, rulingGroupIds)) continue;
    const owner = corp.owners.find((o) => o.individualId === shareholderId);
    if (!owner) continue;
    // 이 경유 간접 = owner.ratio × corp.stakeInBeneficiary
    const pathNumer = BigInt(owner.ratio.numer) * BigInt(corp.stakeInBeneficiary.numer);
    const pathDenom = BigInt(owner.ratio.denom) * BigInt(corp.stakeInBeneficiary.denom);
    // acc += path (분수 합)
    accNumer = accNumer * pathDenom + pathNumer * accDenom;
    accDenom = accDenom * pathDenom;
  }
  return { numer: Number(accNumer), denom: Number(accDenom === 0n ? 1n : accDenom) };
}

/**
 * §⑩ 공통 과세제외매출액.
 * 규칙1: 동일 법인이 ⑩호 복수 동시해당 → max 금액만 (§⑩ 후단).
 * 규칙2: 서로 다른 법인 간 합산.
 * 사례: B(⑩1호 3,000M) + E(⑩5호 2,000M) = 5,000M (다른 법인 → 합산).
 */
export function computeCommonExclusion(salesPartners: RcSalesPartner[]): number {
  const byPartner = new Map<string, number>();
  for (const p of salesPartners) {
    if (p.exclusionType == null) continue;
    byPartner.set(p.id, Math.max(byPartner.get(p.id) ?? 0, p.salesAmount));
  }
  let total = 0;
  for (const amount of byPartner.values()) total += amount;
  return total;
}
