/**
 * 임대 **세액감면 계열**(§97 본문·§97 단서·§97의2·§97의5) 안 쌍 단일 소스 — ⑧(`transfer-tax-validate-rental-97.ts` D2-05)과
 * ⑫(`refineReductionTrack127_7`)가 공유한다 (계획서 `rental-97-v6-proviso-pairs.plan.md` Q-2 b · Q-3 b).
 *
 * 왜 막는가: `evaluateRental97TaxAmount`(`rental-97-router.ts`)는 이 4개 id 중 **첫 항목에서 return**한다 —
 * 같은 입력에 순서만 바꿔도 총세액이 달랐고(`[단서, 본문]` 33,812,000 · `[본문, 단서]` 109,889,000), 앞 항목이 부적격이면
 * 적격인 뒤 항목이 버려졌다(185,966,000). 임대 계열과 §77 등 **다른** 계열 사이에서만 `calcReductions` max가 돈다.
 * 조특법 §127⑦은 «거주자가 선택하는 하나»를 정하므로 엔진이 고르지 않고 막는다(V-6과 같은 방침 — 자동 선택 금지).
 *
 * 근거 조문: 본문×단서는 같은 항(조특법 §97①)의 원칙과 예외(법제처 해석례 24-0009 이유란) — §97① 문구.
 * 나머지 쌍은 §127⑦ 일반 규정. §97의3·§97의4 쌍은 이 파일이 아니라 `rental-97-statutory-overlap.ts`(명문 배제)와
 * `income-deduction-router.ts`(§127⑦ 트랙 교차)가 맡는다 — 호출 쪽이 그 판정을 먼저 한다.
 */
export type Rental97TaxAmountId = "rental_97_main" | "rental_97_proviso" | "rental_97_2" | "rental_97_5";
export type Rental97TaxAmountBasis = "§97①" | "§127⑦";

export interface Rental97TaxAmountOverlap {
  /** 먼저 고른 계열(⑧이 이 항목에서 메시지를 낸다) */
  subject: Rental97TaxAmountId;
  /** 그와 겹치는 다음 계열(⑫ 오류 경로) */
  other: Rental97TaxAmountId;
  basis: Rental97TaxAmountBasis;
}

/** 엔진 `TAX_AMOUNT_IDS`(`rental-97-router.ts`)와 같은 집합 — 하나만 평가하는 4개 id. */
export const RENTAL_TAX_AMOUNT_IDS: ReadonlyArray<string> = ["rental_97_main", "rental_97_proviso", "rental_97_2", "rental_97_5"];

const LABEL: Record<Rental97TaxAmountId, string> = {
  rental_97_main: "§97 본문", rental_97_proviso: "§97 단서", rental_97_2: "§97의2", rental_97_5: "§97의5",
};

const isTaxAmountId = (t: string): t is Rental97TaxAmountId => RENTAL_TAX_AMOUNT_IDS.includes(t);

/** 같은 카드에 담긴 조문 id 목록(선택 순서)에서 세액감면 계열 쌍을 찾는다. 같은 id가 둘인 경우는 대상이 아니다. */
export function findRental97TaxAmountOverlap(types: ReadonlyArray<string>): Rental97TaxAmountOverlap | null {
  const subject = types.find(isTaxAmountId);
  if (!subject) return null;
  const other = types.find((t): t is Rental97TaxAmountId => isTaxAmountId(t) && t !== subject);
  if (!other) return null;
  const mainProviso = [subject, other].every((t) => t === "rental_97_main" || t === "rental_97_proviso");
  return { subject, other, basis: mainProviso ? "§97①" : "§127⑦" };
}

export function rental97TaxAmountOverlapMessage(o: Rental97TaxAmountOverlap): string {
  const subject = LABEL[o.subject];
  if (o.basis === "§97①") {
    return `${subject} 적용: §97 본문(세액 50% 감면)과 §97 단서(세액 면제)는 같은 항의 원칙과 예외라 함께 적용할 수 없습니다 (조특법 §97①). 하나만 선택하세요.`;
  }
  return `${subject} 적용: ${LABEL[o.other]} 세액감면과 중복하여 적용할 수 없습니다 (조특법 §127⑦). 하나만 선택하세요.`;
}
