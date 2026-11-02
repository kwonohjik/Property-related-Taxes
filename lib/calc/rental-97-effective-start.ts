/**
 * §97의3·§97의5 임대개시 기산일 — 클라이언트(⑤ UI·⑧ validate) 공용 leaf (YYYY-MM-DD 문자열).
 *
 * 조특령 §97의3④·§97의5③ 「「소득세법」 제168조에 따른 사업자등록과 … 임대사업자등록을 하고
 * 장기일반민간임대주택등으로 등록하여 임대하는 날부터 임대를 개시한 것으로 본다」
 * ⇒ 실제 임대일·임대사업자 등록일·세무서 사업자등록일 중 **가장 늦은 날**.
 *
 * 엔진 `rental97EffectiveStart`(`lib/tax-engine/transfer-reductions/rental-97-shared-helpers.ts`)와
 * 같은 축이다. 세무서 사업자등록일은 ④ API 변환이 `isTaxRegistered`일 때만 싣으므로
 * (`transfer-tax-api-reductions.ts` rental_97_3·rental_97_5) 여기서도 같은 조건으로 본다 — 3중 패턴.
 *
 * 날짜 하나도 없으면 `""`.
 */
export function rental97EffectiveStartString(r: {
  rentalStartDate?: string;
  registrationDate?: string;
  isTaxRegistered?: boolean;
  taxRegistrationDate?: string;
}): string {
  return [r.rentalStartDate, r.registrationDate, r.isTaxRegistered ? r.taxRegistrationDate : ""]
    .filter((d): d is string => !!d)
    .reduce((a, b) => (b > a ? b : a), "");
}
