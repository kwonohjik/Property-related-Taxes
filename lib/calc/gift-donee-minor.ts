/**
 * gift-donee-minor.ts — 수증자 미성년 자동판정 (클라이언트 전용)
 *
 * 수증자 주민등록번호 앞 7자리에서 생년월일을 도출(parseResidentNumber)하고,
 * 증여일(giftDate) 기준 만 19세 미만이면 미성년으로 자동판정한다.
 *
 * 단일 진실(single-source): resolveIsMinorDonee 를 UI 표시·API 변환(④·④'·④'')에서
 * 동일 호출하여 fallback 일치(3중 패턴). 자동판정은 항상 derive — store 미러링 금지.
 *
 * 주민번호 자체는 엔진에 전송하지 않는다(클라이언트 derive 전용 → ⑨~⑭ 무변경).
 * 체크섬 검증은 생략(요구사항) — 앞 7자리만 사용.
 *
 * 관련 법령: 민법 §4(성년 19세) · 상증법 §57①(미성년+증여재산가액 20억 초과 40% 할증).
 */

import { differenceInYears, parseISO } from "date-fns";
import { parseResidentNumber } from "./resident-number";

/**
 * 주민번호+기준일(증여일)에서 미성년(만 19세 미만) 자동판정.
 * 파싱 불가·기준일 부재·잘못된 날짜면 null(판정 불가 → 호출부에서 수동 fallback).
 */
export function computeAutoMinor(
  residentNumber: string | undefined,
  baseDate: string | undefined,
): boolean | null {
  const parsed = parseResidentNumber(residentNumber ?? "");
  if (!parsed || !baseDate) return null;
  // parseISO로 통일 — base·birth 모두 로컬 자정 기준(타임존 일관성). 잘못된 형식은 Invalid Date.
  const base = parseISO(baseDate);
  const birth = parseISO(parsed.birthDate);
  if (isNaN(base.getTime()) || isNaN(birth.getTime())) return null;
  return differenceInYears(base, birth) < 19; // 민법 §4 성년 19세 (생일 당일=성년)
}

/**
 * 미성년 단일 진실: 주민번호 자동판정 우선, 불가 시 수동 토글 fallback (D-1).
 * form 파라미터는 인라인 타입(FormState 순환 의존 회피).
 */
export function resolveIsMinorDonee(form: {
  doneeResidentNumber?: string;
  giftDate?: string;
  isMinorDonee: boolean;
}): boolean {
  const auto = computeAutoMinor(form.doneeResidentNumber, form.giftDate);
  return auto ?? form.isMinorDonee;
}
