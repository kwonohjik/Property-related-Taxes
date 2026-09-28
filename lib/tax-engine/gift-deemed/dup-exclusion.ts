/** (Phase 3) 증여세 과세특례 — 중복배제 §43① */
import type { DeemedGiftResult, DeemedGiftType } from "./types";

/**
 * §43①: 하나의 증여에 아래 조문이 **둘 이상 동시 적용**되는 경우 이익이 가장 많게
 * 계산되는 것 하나만 적용한다. (조특법 §127⑦의 '합산'과 방향 반대)
 *
 * 법 §43① 열거 verbatim — 「제33조부터 제39조까지, 제39조의2, 제39조의3, 제40조,
 * 제41조의2부터 제41조의5까지, 제42조, 제42조의2, 제42조의3, 제44조, 제45조 및
 * 제45조의3부터 제45조의5까지」.
 * ⚠️ 「§33~§45의5」로 뭉뚱그리면 틀린다 — **§45의2(명의신탁)는 열거에 없고**,
 *    §41·§41의2 앞 구간도 빠져 있다(§41의2부터). §44는 들어 있다.
 *
 * 후보 결과 배열에서 적용(applied) 중 deemedGiftValue가 최대인 1건을 선택.
 *
 * ⚠️ **프로덕션 호출처 0건**(테스트만 참조) — `router.ts`가 유형 단건만 계산하므로
 *    동시 적용 자체가 발생하지 않는다. 배선 전까지는 미사용 구현이다.
 */
export function selectPrimaryDeemedGift(results: DeemedGiftResult[]): DeemedGiftResult | null {
  const applied = results.filter((r) => r.applied);
  if (applied.length === 0) return results[0] ?? null;
  return applied.reduce((best, cur) => (cur.deemedGiftValue > best.deemedGiftValue ? cur : best));
}

/**
 * §43① 열거 해당 여부 — **유형만으로** 결정된다(입력 축 0개). 결과뷰의 공통 고지 표지(`dupExclusionApplies`)가
 * 이 표에서만 파생된다(#112 · 전 유형 일괄 — 사용자 확정 범위). 세액에는 접촉하지 않는다.
 *
 * 🔴 §4의2⑥ 유형표(`taxpayer-gate.ts`)를 복사하지 말 것 — §33 신탁이익·§34 보험금은 ⑥ 단서 열거
 *    **밖**이지만 §43①은 「제33조부터」라 **안**이다. 양쪽 모두 밖인 것은 §45의2 명의신탁뿐이다.
 * ⚠️ 새 유형을 추가하면 tsc가 키를 요구한다 — 위 열거 verbatim을 다시 읽고 판단할 것.
 */
const DUP_EXCLUSION_APPLIES_BY_TYPE: Record<DeemedGiftType, boolean> = {
  // ── 「제33조부터 제39조까지」 ──
  trust_benefit: true, // §33
  insurance: true, // §34
  bargain_transfer: true, // §35
  debt_forgiveness: true, // §36
  free_realestate: true, // §37
  merger: true, // §38
  capital_increase: true, // §39
  capital_increase_allocation: true, // §39 — cap-table(라우터를 거치지 않는 별도 진입점)
  convertible_stock: true, // §39①3호

  // ── 개별 열거 ──
  capital_decrease: true, // §39의2
  contribution: true, // §39의3
  convertible_bond: true, // §40

  // ── 「제41조의2부터 제41조의5까지」 ──
  excess_dividend: true, // §41의2
  listing_gain: true, // §41의3·§41의5
  free_loan: true, // §41의4
  free_loan_aggregated: true, // §41의4

  // ── §42·§42의2·§42의3 ──
  property_service_use: true, // §42
  org_change: true, // §42의2
  value_increase: true, // §42의3

  // ── §45 및 「제45조의3부터 제45조의5까지」 ──
  acquisition_fund_presumption: true, // §45
  nominee_trust: false, // §45의2 — 열거 밖(§45 다음이 §45의3)
  related_corp: true, // §45의3
  specific_corp: true, // §45의5
};

export function dupExclusionAppliesToDeemedType(type: DeemedGiftType): boolean {
  return DUP_EXCLUSION_APPLIES_BY_TYPE[type];
}
