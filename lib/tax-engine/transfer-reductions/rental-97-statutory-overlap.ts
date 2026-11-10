/**
 * 임대 범주 안 **명문 배제 쌍** 단일 소스 — ⑧(`transfer-tax-validate-rental-97.ts` D2-05)과 ⑫(`refineReductionTrack127_7`)가 함께 쓴다.
 *
 * 조특법이 직접 «중복하여 적용하지 아니한다»고 정한 쌍은 세 쌍뿐이다:
 * - §97의3② — §97의3 과세특례는 §97의4 과세특례와 중복하여 적용하지 아니한다.
 * - §97의5② — §97의5 세액감면은 §97의3·§97의4 과세특례와 중복하여 적용하지 아니한다.
 * 어느 쪽을 적용할지는 조문이 정하지 않는다 → 엔진(`evaluateRental97Lthd`)은 배열 첫 항목을 쓰므로 순서로 승자가 갈렸다.
 * 자동으로 고르지 않고 막는다(계획서 `docs/00-pm/rental-97-overlap-v6.plan.md` Q-1 a · Q-2 a).
 *
 * §97 본문·단서·§97의2 × §97의3/4는 명문 배제가 없어 일반 규정 §127⑦ 분류 충돌(`findTrack127_7Conflict`)이 맡는다(Q-3 a).
 */

export type Rental97StatutoryBasis = "§97의3②" | "§97의5②";

export interface Rental97StatutoryOverlap {
  /** 먼저 고른 §97의3/§97의4 — 메시지의 주어 */
  subject: "rental_97_3" | "rental_97_4";
  /** 함께 담긴 상대 조문 */
  other: "rental_97_3" | "rental_97_4" | "rental_97_5";
  basis: Rental97StatutoryBasis;
}

/** 이 세 id끼리의 쌍은 §127⑦이 아니라 이 파일이 맡는다. */
export const RENTAL_STATUTORY_PAIR_IDS: ReadonlyArray<string> = ["rental_97_3", "rental_97_4", "rental_97_5"];

const LABEL = { rental_97_3: "§97의3", rental_97_4: "§97의4", rental_97_5: "§97의5" } as const;

/** 같은 카드에 담긴 조문 id 목록(선택 순서)에서 명문 배제 쌍을 찾는다. §97의5가 함께 있으면 §97의5②를 우선한다(⑧ 종전 문구 유지). */
export function findRental97StatutoryOverlap(types: ReadonlyArray<string>): Rental97StatutoryOverlap | null {
  const subject = types.find((t): t is "rental_97_3" | "rental_97_4" => t === "rental_97_3" || t === "rental_97_4");
  if (!subject) return null;
  if (types.includes("rental_97_5")) return { subject, other: "rental_97_5", basis: "§97의5②" };
  const other = subject === "rental_97_3" ? "rental_97_4" : "rental_97_3";
  return types.includes(other) ? { subject, other, basis: "§97의3②" } : null;
}

export function rental97StatutoryOverlapMessage(o: Rental97StatutoryOverlap): string {
  const subject = LABEL[o.subject];
  if (o.basis === "§97의5②") {
    return `${subject} 적용: §97의5 세액감면과 중복하여 적용할 수 없습니다 (조특법 §97의5②). 하나만 선택하세요.`;
  }
  return `${subject} 적용: ${LABEL[o.other]} 과세특례와 중복하여 적용할 수 없습니다 (조특법 §97의3②). 하나만 선택하세요.`;
}
