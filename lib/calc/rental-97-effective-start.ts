import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  resolveShortTermConversion,
  toIsoDay,
} from "@/lib/tax-engine/transfer-reductions/rental-97-short-term-conversion";

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

/**
 * §97의3 — 의제 임대개시일(YYYY-MM-DD). 2020.7.10 이전 단기→장기 변경신고 주택이면 단기 임대기간 산입을 반영한
 * 날(조특령 §97의3④ 후단 — PR-C), 아니면 `rental97EffectiveStartString`.
 *
 * 계산은 엔진 leaf `resolveShortTermConversion`을 그대로 쓴다(단일 소스) — ⑤ 자동 산출 박스·⑧ 안분 필요 판정이
 * 엔진과 같은 날짜를 보게 한다. 날짜가 덜 채워졌거나 2020.7.11 이후 신고(적용 제외)면 ④ 전단 기준으로 되돌아간다.
 */
export function rental973DeemedStartString(r: {
  rentalStartDate?: string;
  registrationDate?: string;
  isTaxRegistered?: boolean;
  taxRegistrationDate?: string;
  shortTermConversionMode?: "none" | "before" | "after";
  conversionReportedDate?: string;
  conversionAcceptedDate?: string;
}): string {
  const plain = rental97EffectiveStartString(r);
  if (r.shortTermConversionMode !== "before") return plain;
  const registrationDate = toOptionalDate(r.registrationDate);
  const rentalStartDate = toOptionalDate(r.rentalStartDate);
  const reportedDate = toOptionalDate(r.conversionReportedDate);
  const acceptedDate = toOptionalDate(r.conversionAcceptedDate);
  if (!registrationDate || !rentalStartDate || !reportedDate || !acceptedDate) return plain;
  const res = resolveShortTermConversion({
    registrationDate,
    rentalStartDate,
    taxRegistrationDate: r.isTaxRegistered ? toOptionalDate(r.taxRegistrationDate) : undefined,
    reportedDate,
    acceptedDate,
  });
  return res.deemedStartDate ? toIsoDay(res.deemedStartDate) : plain;
}

/**
 * §97의4 임대기간 구간 미리보기(YYYY-MM-DD) — ⑤ 자동 산출 박스 전용. 엔진 `evaluateRental974`의 구간과 같은 축이다:
 * - 본인(상속이면 상속인) 분 시작 = 조특령 §97의4② 의제 개시일(`rental97EffectiveStartString`) — 상속이면 상속개시일 전으로 가지 않는다
 * - 종점 = 자동말소일(민특법 §6⑤ — 양도일 전일 때) 또는 양도일
 * - 피상속인 분(조특령 §97⑤3호) = [max(피상속인 임대개시일, 피상속인 사업자등록등일), min(상속개시일, 종점)]
 * 공실 차감·연수 환산은 하지 않는다(엔진 단일 진실). 날짜가 비면 해당 구간은 undefined.
 */
export function rental974PeriodSegmentsString(
  r: {
    rentalStartDate?: string;
    registrationDate?: string;
    isTaxRegistered?: boolean;
    taxRegistrationDate?: string;
    isInherited974?: boolean;
    inheritanceDate974?: string;
    decedentRegistrationDate974?: string;
    decedentRentalStartDate974?: string;
    isAutoCancelled974?: boolean;
    autoCancelledDate974?: string;
  },
  transferDate: string,
): { own?: { start: string; end: string }; decedent?: { start: string; end: string } } {
  if (!transferDate) return {};
  const max = (a: string, b: string) => (b > a ? b : a);
  const min = (a: string, b: string) => (b < a ? b : a);
  const end =
    r.isAutoCancelled974 && r.autoCancelledDate974 && r.autoCancelledDate974 < transferDate
      ? r.autoCancelledDate974
      : transferDate;
  const inherited = !!(r.isInherited974 && r.inheritanceDate974);
  const ownStart = rental97EffectiveStartString(r);
  const own = ownStart
    ? { start: inherited ? max(ownStart, r.inheritanceDate974!) : ownStart, end }
    : undefined;
  const decedent =
    inherited && r.decedentRegistrationDate974 && r.decedentRentalStartDate974
      ? { start: max(r.decedentRentalStartDate974, r.decedentRegistrationDate974), end: min(r.inheritanceDate974!, end) }
      : undefined;
  return { own, decedent };
}
