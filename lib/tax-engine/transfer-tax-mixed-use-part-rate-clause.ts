/**
 * 겸용주택 파트별 적용 호 echo — 신고서 ③ 세율구분 코드 표시 전용(세액 무영향).
 *
 * 겸용 엔진은 `calcTax`를 쓰지 않는 자체 세율 로직(§104⑤ 1호·2호 비교)이라 `rateClause`가 없어 신고서 ③이 「-」였다
 * (2026-11-23 실측). 별지 제84호서식은 자산(열)마다 그 자산에 적용되는 세율의 코드를 적으므로, §104⑤2호 계산이 이미 만든
 * 파트별 항(`clause2Terms` — 누진 · 단기 · 중과 중 채택된 것)에서 **재판정 없이** 호를 읽는다.
 *
 * - 미등기(§104①10호) — 전 파트 `104-1-10`.
 * - 2호 계산이 없으면(전 파트 2년 이상 · 중과·비사업용 없음) — 전 파트 §104①1호.
 * - 과세표준 0 — 싣지 않는다(비교할 세액이 없다 · 빈 칸 유지).
 */
import type { RateClause, SurchargeRateClause } from "./transfer-tax-rate-clause";
import type { MixedUseRatePart } from "./transfer-tax-mixed-use-totals";
import type { MixedUsePartRateClause, MixedUseTotalTax } from "./types/transfer-mixed-use.types";

export function mixedPartRateClauses(
  rateParts: MixedUseRatePart[] | undefined,
  terms: NonNullable<MixedUseTotalTax["clause2Terms"]> | undefined,
  taxBase: number,
  isUnregistered: boolean,
): MixedUsePartRateClause[] | undefined {
  if (!rateParts || rateParts.length === 0 || taxBase <= 0) return undefined;
  return rateParts.map((p) => {
    if (isUnregistered) return { kind: p.kind, rateClause: "104-1-10" as RateClause };
    const t = terms?.find((x) => x.kinds.includes(p.kind));
    if (!t || t.applied === "progressive") return { kind: p.kind, rateClause: "104-1-1" as RateClause };
    const isNbl = p.kind === "non_business_land";
    if (t.applied === "surcharge") {
      // 주택 파트 §104⑦ — 호는 중과 판정(주택 수)이 정한다(가산율만으로는 시기에 따라 2주택·3주택을 가를 수 없다).
      return isNbl ? { kind: p.kind, rateClause: "104-1-8" as RateClause } : { kind: p.kind, rateClause: p.surchargeClause };
    }
    // 단기세율 채택 — 중과·비사업용 후보가 졌으면 그 표지를 함께 싣는다(일반 경로 `surchargeShortTermClause`·`nonBusinessLandShortTerm`과 같은 뜻).
    return {
      kind: p.kind,
      rateClause: t.shortTermClause,
      ...(isNbl ? { nonBusinessLandShortTerm: true as const } : {}),
      ...(!isNbl && (p.surchargeAddon ?? 0) > 0 && p.surchargeClause ? { surchargeShortTermClause: p.surchargeClause as SurchargeRateClause } : {}),
    };
  });
}
