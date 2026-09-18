/**
 * §45의3 일감몰아주기 — 엔진 헬퍼.
 * 분수 정수연산 유틸 + 2모드 간접보유 + §⑩ 과세제외매출.
 * 정책: Math.round 금지(CLAUDE.md 정수연산) · 분수 곱은 BigInt(2^53 초과 방지).
 */
import { safeMultiplyThenDivide } from "../tax-utils";
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

/** BigInt 최대공약수 (유클리드). 0 입력 시 1을 돌려 약분을 무해하게 만든다. */
function bigGcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y > 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0n ? 1n : x;
}

/**
 * BigInt 분수 → `Frac`(number) — **약분 후** 내린다.
 *
 * 🔴 이 파일 헤더는 「분수 곱은 BigInt(2^53 초과 방지)」라고 선언하는데, 종전에는 **복원 지점이
 *    곧 손실 지점**이었다. ④ 변환이 비율을 분모 10,000으로 만들어 경유 1개마다 분모가 1e8배씩
 *    커지므로, 경유 3개면 분모 1e24·분자 1.2e23으로 둘 다 안전정수 범위를 벗어난다.
 *    상대오차는 1e-16 수준이지만 최종 floor 경계를 넘겨 **증여의제이익이 1원 과소**가 됐다
 *    (실측: 경유 3개 414,719,999 / 경유 5개 64,799,999).
 *
 * 약분하면 1e24/1e24 같은 분수가 곧바로 작은 정수 쌍으로 줄어 안전범위 안에 들어온다.
 * ⚠️ 「약분하면 언제나 안전하다」는 보증은 아니다 — 서로소 분모가 여럿 겹치면 다시 커질 수
 *    있다. 그래서 `applyTwoFractions`·`computeIndirectRatioBig`처럼 **정확성이 직결되는
 *    연산은 BigInt 경로를 그대로 유지**하고, 이 함수는 경계에서만 쓴다.
 */
export function reduceFracBig(numer: bigint, denom: bigint): Frac {
  const g = bigGcd(numer, denom);
  return { numer: Number(numer / g), denom: Number(denom / g) };
}

/**
 * 분수 max(0, a − b) — 공통분모 정수 뺄셈 (음수 방지, Math.round 없음).
 * 교차곱 분자가 2^53을 넘을 수 있으므로 BigInt로 계산하고, 복원 시 **약분**한다.
 */
export function fracMaxZeroSub(a: Frac, b: Frac): Frac {
  const diff = BigInt(a.numer) * BigInt(b.denom) - BigInt(b.numer) * BigInt(a.denom);
  const commonDenom = BigInt(a.denom) * BigInt(b.denom);
  const numer = diff > 0n ? diff : 0n;
  return reduceFracBig(numer, commonDenom);
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
 * §⑭1호 — 이 매출처가 「제18항에 따른 간접출자법인인 특수관계법인」인가.
 * 폼이 고른 법인주주 id로 간접출자법인 roster를 찾고, §⑱1호 요건을 다시 판정한다
 * (선택만으로 성립시키지 않는다 — 지배주주등 합산 30% 미만이면 §⑱ 간접출자법인이 아니다).
 */
export function isSec18SalesPartner(
  partner: RcSalesPartner,
  intermediaryCorps: RcIntermediaryCorpItem[],
  rulingGroupIds: string[],
): boolean {
  if (!partner.isRelated || !partner.intermediaryCorpShareholderId) return false;
  const corp = intermediaryCorps.find((c) => c.corpShareholderId === partner.intermediaryCorpShareholderId);
  return corp ? isIntermediarySec18(corp, rulingGroupIds) : false;
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
  const { numer, denom } = computeIndirectRatioBig(shareholderId, intermediaryCorps, mode, rulingGroupIds);
  return reduceFracBig(numer, denom);
}

/**
 * 위와 같은 산식의 **BigInt 원본**. 분수를 그대로 곱셈에 쓰는 호출자(§45의5)는 이쪽을 쓴다.
 *
 * 근거는 **분모의 크기**다 — 경유 경로가 2개면 분모 곱이 실측 1e18로 `MAX_SAFE_INTEGER`(≈9.0e15)를
 * 넘는다. 그 구간의 `Number`는 정수 간격이 1보다 커서 왕복이 **보장되지 않는다**.
 *
 * ⚠️ 다만 「지금 값이 틀린다」는 뜻은 아니다 — 2·3경유 × 지분·주식수를 바꿔 **6,534건을 돌려
 * BigInt와 Number 경로의 증여의제이익 차이는 0건**이었다(분자·분모가 같은 배율로 반올림돼
 * 몫이 살아남는다). 즉 이 함수는 **측정된 오차의 수정이 아니라, 안전범위 밖에서 추론하지 않기
 * 위한 예방**이다. `computeIndirectRatio`의 narrowing은 §45의3 기존 동작이라 그대로 둔다(W10 범위).
 */
export function computeIndirectRatioBig(
  shareholderId: string,
  intermediaryCorps: RcIntermediaryCorpItem[],
  mode: "ruling" | "recipient",
  rulingGroupIds: string[] = [],
): { numer: bigint; denom: bigint } {
  return sumIndirectPaths(computeIndirectPaths(shareholderId, intermediaryCorps, mode, rulingGroupIds));
}

/** 한 «출자관계»(경유 법인 1개)의 간접보유비율 */
export type IndirectPath = {
  /** 경유 법인인 법인주주의 id */
  corpShareholderId: string;
  numer: bigint;
  denom: bigint;
};

/**
 * 간접보유비율을 **출자관계별로** 분해한다 (합산 前).
 *
 * 상증령 §34의3⑬은 증여의제이익을 「**출자관계별로** 각각 구분하여 계산한 금액을 모두 합하여」
 * 계산하라면서 괄호로 「간접보유비율이 1천분의 1 미만인 경우의 해당 출자관계는 제외한다」고
 * 정한다 — 즉 **관계별 값이 남아 있어야** 그 판정을 할 수 있다.
 * 종전 구조는 경유들을 곧바로 한 분수로 합산해 버려 판정 자체가 불가능했다.
 */
export function computeIndirectPaths(
  shareholderId: string,
  intermediaryCorps: RcIntermediaryCorpItem[],
  mode: "ruling" | "recipient",
  rulingGroupIds: string[] = [],
): IndirectPath[] {
  const paths: IndirectPath[] = [];
  for (const corp of intermediaryCorps) {
    if (mode === "recipient" && !isIntermediarySec18(corp, rulingGroupIds)) continue;
    const owner = corp.owners.find((o) => o.individualId === shareholderId);
    if (!owner) continue;
    // 이 경유 간접 = owner.ratio × corp.stakeInBeneficiary  (상증령 §34의3② 「각 단계의 직접보유비율을 모두 곱하여」)
    paths.push({
      corpShareholderId: corp.corpShareholderId,
      numer: BigInt(owner.ratio.numer) * BigInt(corp.stakeInBeneficiary.numer),
      denom: BigInt(owner.ratio.denom) * BigInt(corp.stakeInBeneficiary.denom),
    });
  }
  return paths;
}

/** 출자관계들의 분수 합 (상증령 §34의3② 후단 「둘 이상의 간접출자관계 … 모두 합하여」) */
export function sumIndirectPaths(paths: IndirectPath[]): { numer: bigint; denom: bigint } {
  let accNumer = 0n;
  let accDenom = 1n;
  for (const p of paths) {
    accNumer = accNumer * p.denom + p.numer * accDenom;
    accDenom = accDenom * p.denom;
  }
  return { numer: accNumer, denom: accDenom === 0n ? 1n : accDenom };
}

/**
 * §34의3⑬ — 「간접보유비율이 **1천분의 1 미만**인 경우의 해당 출자관계는 제외한다」.
 *
 * 조문이 「미만」이므로 정확히 1천분의 1(0.1%)인 관계는 **제외되지 않는다**.
 * 이 제외는 **증여의제이익 계산**에만 걸린다 — §⑧의 수증자 판정(직접+간접 합계가 한계보유비율
 * 초과)에는 같은 카브아웃이 없으므로 그쪽은 합산값을 그대로 써야 한다. 두 축을 섞지 말 것.
 */
export function partitionSec13Paths(paths: IndirectPath[]): {
  kept: IndirectPath[];
  excluded: IndirectPath[];
} {
  const kept: IndirectPath[] = [];
  const excluded: IndirectPath[] = [];
  for (const p of paths) {
    // numer/denom < 1/1000  ↔  numer × 1000 < denom
    if (p.numer * 1000n < p.denom) excluded.push(p);
    else kept.push(p);
  }
  return { kept, excluded };
}

/**
 * §⑩ 각 호의 과세제외 **금액**.
 *
 * 10개 호 중 **3호만** 축소 산식이다 — 「…100분의 50 **미만**인 특수관계법인과 거래한 매출액에
 * **그 특수관계법인에 대한 수혜법인의 주식보유비율을 곱한 금액**」. 바로 위 2호가
 * 「…100분의 50 **이상**인 특수관계법인과 거래한 매출액」(전액)이라 두 호는 명시적으로 대비된다.
 *
 * 종전에는 호를 가리지 않고 전액을 뺐다 — 3호를 고르면 2호와 **한 원도 다르지 않았고**,
 * 곱할 보유비율의 입력칸 자체가 어느 층에도 없었다. 과세제외 과대 → 거래비율·세후영업이익
 * 동시 과소 → 세액 과소.
 *
 * ⚠️ 비율 미입력 시 0을 돌려준다(전액 제외가 아니다). 「자동 안분 fallback 금지」 정책상
 *    실제 관문은 ⑧validate이며, 여기서 전액으로 되돌리면 그 정책이 무력해진다.
 */
function exclusionAmount(p: RcSalesPartner): number {
  if (p.exclusionType !== "sec10_3") return p.salesAmount;
  const r = p.beneficiaryStakeInPartner;
  if (!r || r.denom <= 0) return 0;
  return safeMultiplyThenDivide(p.salesAmount, r.numer, r.denom);
}

/**
 * §⑩ 공통 과세제외매출액.
 * 규칙1: 동일 법인이 ⑩호 복수 동시해당 → max 금액만 (§⑩ 후단).
 * 규칙2: 서로 다른 법인 간 합산.
 * 사례: B(⑩1호 3,000M) + E(⑩5호 2,000M) = 5,000M (다른 법인 → 합산).
 *
 * ⚠️ **비특수관계 매출처는 과세제외매출액이 될 수 없다.**
 *    법 §45의3④의 제외는 「**제1항에 따른 매출액**에서 … 제외한다」이고, ①1호가목의 분자는
 *    「특수관계법인에 대한 매출액」이다. 영 §34의3⑩ 10개 호 중 8개(1·2·3·5·5의2·5의3·6·7호)는
 *    문언이 「특수관계법인과 거래한 매출액」이고, 4호는 「자회사·손자회사」, 8호는 「해당 법인」으로
 *    거래상대방을 **구조로** 지칭한다 — 어느 호도 비특수관계 매출처를 대상으로 삼지 않는다.
 *    비특수관계 매출액은 애초에 분자에 없으므로 「제외」할 대상 자체가 없다.
 *
 *    종전에는 `isRelated`를 보지 않아, UI에서 「특수관계법인 → 비특수관계」로 되돌릴 때 행에
 *    남은 stale `exclusionType`이 분자·분모를 동시에 깎았다(화면 어디에도 보이지 않는 값이다).
 *    같은 배열을 도는 형제 두 곳(`related-corp.ts`의 `relatedSales` 필터·§⑭3호 루프)은 전부
 *    `isRelated`를 보는데 이 함수만 빠져 있었다.
 */
export function computeCommonExclusion(salesPartners: RcSalesPartner[]): number {
  const byPartner = new Map<string, number>();
  for (const p of salesPartners) {
    if (!p.isRelated || p.exclusionType == null) continue;
    // ⚠️ 「더 큰 금액」 비교는 **축소한 뒤**의 금액으로 해야 한다 — 3호를 전액으로 넣으면
    //    max 비교 자체가 틀린다(3호가 2호를 이기는 일이 생긴다).
    byPartner.set(p.id, Math.max(byPartner.get(p.id) ?? 0, exclusionAmount(p)));
  }
  let total = 0;
  for (const amount of byPartner.values()) total += amount;
  return total;
}
