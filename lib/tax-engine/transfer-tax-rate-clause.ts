/**
 * 「소득세법」 제104조 **각 호** 축 — 타입 · 판정 헬퍼 · §104⑤ 합산 단위 키.
 *
 * `transfer-tax-rate-calc.ts`에서 분리(800줄 정책 — 776줄 위험구간 도달).
 * 세액을 계산하지 않는 **순수 분류 축**이라 `calcTax` 본체와 응집도가 다르고,
 * §104⑤ 프로젝트(`transfer-rate-clause-candidates.plan.md` Q1~Q3)가 반복해서 여는 구역이다.
 *
 * ⚠️ 종전 import 경로(`./transfer-tax-rate-calc`)를 깨지 않도록 그쪽에서 **재수출**한다
 *   (memory `feedback_800line_split_export_preservation`).
 */

/**
 * 「소득세법」 제104조 중 **실제로 적용된 호**.
 *
 * §104⑤2호 **단서**("둘 이상의 자산에 대하여 동일한 호의 세율이 적용되고, 그 적용세율이
 * 둘 이상인 경우 … 과세표준을 합산한 것에 대하여 … 호별 세율을 적용")를 판정하려면
 * "호 동일성"이 필요한데, 출력 세율로는 역추론할 수 없다 — 단기 40%와 누진 40% 구간이
 * `appliedRate`로 구분되지 않고, 같은 호라도 브래킷이 다르면 `appliedRate`가 달라진다.
 * ⇒ `calcTax`가 **자기가 탄 분기를 직접 싣는다**(단일 소스).
 */
export type RateClause =
  | "104-1-1"   // 일반 누진(§55①)
  | "104-1-2"   // 1~2년 보유 40%(주택 등 60%)
  | "104-1-3"   // 1년 미만 50%(주택 등 70%)
  | "104-1-8"   // 비사업용 토지 누진 + 10%p
  | "104-1-10"  // 미등기 70%
  | "104-7-1"   // 조정지역 1세대 2주택 중과 +20%p
  | "104-7-3";  // 조정지역 1세대 3주택 이상 중과 +30%p

/**
 * 누진세율 호 — 과세표준을 합치면 세액이 달라지므로 §104⑤2호 단서의 합산 대상이다.
 * 단일세율 호(2·3·10호)는 세율이 같으면 합산·개별이 (floor 외) 동일하다.
 *
 * ⚠️ **`"104-1-1"`은 예외가 하나 있다 — 분양권은 1호인데 누진이 아니다.**
 *   §104①1호 본문이 「제55조제1항에 따른 세율(**분양권의 경우에는 양도소득 과세표준의 100분의 60**)」
 *   이라 분양권 2년 이상은 **호는 1호, 세율은 단일 60%**다(`transfer-tax-rate-calc.ts:440·452`).
 *   여기 1호가 들어 있으므로 `clauseBucketKey`가 세율을 키에서 빼고, 그 결과 **분양권 2년+와
 *   사업용 토지 2년+가 같은 버킷 키를 낸다**. 두 자산이 같은 `rateGroup`에 들어오면 합산
 *   과세표준 전체에 대표의 규칙이 적용돼 순서 의존 + 대형 오차가 된다.
 *   지금 막고 있는 것은 `classifyRateGroup`이 분양권을 `short_term`으로 보내 그룹을 분리해
 *   두는 것뿐이다 — 그 분류는 **load-bearing**이다(2026-07-29 #591 감사 R7이 고친 63,940,000).
 *   ⇒ 가드 anchor `presale-clause-1-bucket-guard.anchor.test.ts`.
 *   ❌ 여기서 1호를 「누진/단일」로 쪼개려면 **법령 검토가 선행**이다(가드 파일 헤더 참조) —
 *      현재 세액 영향은 0이므로 근거 없이 키 규약을 바꾸지 않는다.
 */
export const PROGRESSIVE_RATE_CLAUSES: ReadonlySet<RateClause> = new Set<RateClause>([
  "104-1-1",
  "104-1-8",
  "104-7-1",
  "104-7-3",
]);

/** 단기 단일세율 호 — 1년 미만은 3호, 1~2년은 2호(§104①). */
export const shortTermClause = (holdingMonths: number): RateClause =>
  holdingMonths < 12 ? "104-1-3" : "104-1-2";

/**
 * 부수토지 일체과세 단일세율 → 호. 주택 단기세율만 나오므로 70%=3호·60%=2호다.
 * 그 밖의 값은 호를 단정할 수 없어 undefined(묶지 않음 = 안전측).
 */
export const unifiedShortTermClause = (rate: number): RateClause | undefined =>
  rate === 0.70 ? "104-1-3" : rate === 0.60 ? "104-1-2" : undefined;

/** 다주택 중과 호 — §104⑦1호(2주택) / 3호(3주택 이상). 정본 R7 감사와 같은 구분. */
export const surchargeClause = (surchargeType: string): RateClause =>
  surchargeType === "multi_house_3plus" ? "104-7-3" : "104-7-1";

/**
 * 「해당 호 후보」 배열 — 중복 제거 + **문자열 오름차순 정렬**.
 * 정렬이 결정적이어야 그룹핑 키가 흔들리지 않는다(계획서 R-3).
 * 후보가 하나도 없으면 `undefined` — 「호 불명」은 묶지 않는 것이 안전측이다.
 */
export const clauseSet = (...cs: (RateClause | undefined)[]): RateClause[] | undefined => {
  const out = [...new Set(cs.filter((c): c is RateClause => c !== undefined))].sort();
  return out.length > 0 ? out : undefined;
};

/**
 * §104⑤2호 **합산 단위** 키 — 「해당 호 집합」이 같은 자산·파트를 한 버킷으로 묶는다.
 *
 * 예규가 본문의 「자산별」을 **「제104조 각 호별로 합산한 자산」**으로 확정했다
 * (「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」
 * [법령해석과-1715] 2018.6.21.) ⇒ **합산 단위는 「호」다.**
 *
 * 규약 3가지:
 *   · 후보 없음(호 불명) → `solo-{id}` — **묶지 않는다**(안전측). 조특법 특칙 등이 여기다.
 *   · **누진 호 포함**   → 후보 조인만. **세율을 키에 넣지 않는다** — 합산액에 각 해당 호별
 *     세율을 다시 적용해 큰 것을 취하는 것이 §104⑤2호 단서이므로, 개별 자산의 **승자 세율**은
 *     묶음 판정에 아무 의미가 없다(교재 사례2 = D-11의 핵심).
 *   · **단일세율 호만**  → `후보|세율`. 세율이 같아야 합산 1회가 성립하고, 그때 자산별 합과의
 *     차이는 floor 횟수뿐이다.
 *
 * ⚠️ 후보 배열은 `clauseSet`이 **정렬**해 둔 것이어야 한다 — 순서가 흔들리면 키가 갈려
 *   입력 순서 의존이 재발한다(계획서 R-3).
 */
export function clauseBucketKey(
  candidates: readonly RateClause[] | undefined,
  appliedRate: number,
  id: string | number,
): string {
  if (!candidates || candidates.length === 0) return `solo-${id}`;
  const joined = candidates.join("+");
  return candidates.some((c) => PROGRESSIVE_RATE_CLAUSES.has(c))
    ? joined
    : `${joined}|${appliedRate}`;
}
