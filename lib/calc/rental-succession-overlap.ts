/**
 * §155⑳ 임대사업 승계(증여·상속) — 전 임대사업자 개월과 본인 기간의 **이중 계산** 차단 술어(V-9).
 * ⑧ `transfer-tax-validate-rental-exception.ts`와 ⑫ `transfer-tax-schema-rental-exception.ts`가 같은 함수를 쓴다(UI 통과 ↔ API 400 모순 금지).
 *
 * 전 임대사업자(증여자·피상속인) 임대개월은 그가 등록한 뒤 승계일(증여일·상속개시일) 전까지의 기간이고, 본인은 승계 뒤에 그 주택을
 * 등록한다. 그래서 「전 사업자의 이른 등록일(세무서 사업자등록일·지자체 신청일 중 이른 날) + 전 사업자 개월」 ≤ 승계일 ≤ 본인 등록이다.
 * 본인 기산일(사업자등록일·지자체 등록일 중 늦은 날 — `deriveRentalMonths`가 구간을 자르는 날)이 그 경계보다 이르면 두 기간이 겹쳐
 * 같은 달을 두 번 센다. 증여일 칸이 없어도 이 부등식만으로 겹침이 확정되는 경우만 막는다(경계는 가장 이른 등록일로 잡아 관대하게).
 * 포괄양수는 전 사업자 날짜 칸이 없어(Q-5) 판정하지 않는다.
 */
import { addMonths } from "@/lib/tax-engine/utc-date";
import { format } from "@/lib/tax-engine/utc-date";
import { parseISO } from "@/lib/tax-engine/utc-date";

type RegDates = { businessRegistrationDate?: string; rentalRegistrationDate?: string; rentalRegisteredDate?: string };

const day = (s: string | undefined) => (s ?? "").slice(0, 10);

/** 겹치면 `{ predecessorEnd, ownStart }`(YYYY-MM-DD), 아니면 null. 날짜·개월이 비면 판정하지 않는다(null). */
export function successionPeriodOverlap(
  own: RegDates,
  predecessor: RegDates,
  predecessorMonths: number,
): { predecessorEnd: string; ownStart: string } | null {
  const months = Math.floor(predecessorMonths);
  const starts = [day(predecessor.businessRegistrationDate), day(predecessor.rentalRegistrationDate)].filter(Boolean).sort();
  const ownBusiness = day(own.businessRegistrationDate);
  const ownRegistered = day(own.rentalRegisteredDate) || day(own.rentalRegistrationDate);
  const ownStart = ownBusiness > ownRegistered ? ownBusiness : ownRegistered;
  if (!(months > 0) || starts.length === 0 || !ownStart) return null;
  const predecessorEnd = format(addMonths(parseISO(starts[0]), months), "yyyy-MM-dd");
  return ownStart < predecessorEnd ? { predecessorEnd, ownStart } : null;
}

/** ⑧·⑫ 공용 문구 — `who` = 증여자·피상속인 */
export function successionOverlapMessage(who: string, months: number, o: { predecessorEnd: string; ownStart: string }): string {
  return (
    `${who} 임대기간 ${Math.floor(months)}개월을 ${who}의 등록일부터 세면 ${o.predecessorEnd}에야 끝나는데, 본인 임대기간 기산일(${o.ownStart} — ` +
    `세무서 사업자등록일·지자체 등록일 중 늦은 날)이 그보다 빨라 두 기간이 겹칩니다(같은 기간을 두 번 셉니다). 본인 등록일은 승계(증여·상속) 뒤 이 주택을 ` +
    `등록한 날인지, ${who} 개월에 본인 기간이 들어가지 않았는지 확인하세요.`
  );
}
