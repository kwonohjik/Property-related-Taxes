/**
 * 임대주택 호별 실제 임대기간 — §155⑳ 의무임대기간 판정용.
 *
 * 비연속 임대 사례를 반영하기 위해 시작일·종료일 페어를 다중 입력하거나, 합산 개월수를 직접 입력하는
 * 두 모드(interval/direct)를 지원. 엔진은 단일 정수(rentalMonths)만 사용하므로 API 변환 단계에서 합산값을 주입한다.
 * interval 모드의 구간 사이 공백은 3개월 이내면 임대기간에 넣고, 넘으면 뺀다(조특칙 §44 — `recognizedRentalMonths`).
 *
 * 개월 계산은 거주기간과 동일한 whole-month 방식(`diffMonthsClamped`) 재사용 — method 단일 소스.
 */

import { diffMonthsClamped } from "./calc-wizard-asset-residence";
import { addMonths } from "@/lib/tax-engine/utc-date";
import { format } from "@/lib/tax-engine/utc-date";
import { parseISO } from "@/lib/tax-engine/utc-date";

/** 임대 구간 (시작일~종료일) */
export interface RentalPeriod {
  /** 임대 시작일 YYYY-MM-DD */
  start: string;
  /** 임대 종료일 YYYY-MM-DD */
  end: string;
}

export const RENTAL_PERIOD_DEFAULTS = {
  rentalInputMode: "direct" as "interval" | "direct",
  rentalPeriods: [] as RentalPeriod[],
};

/** sessionStorage 마이그레이션: rentalUnit에 기간 필드가 없으면 기본값 주입 */
export function migrateRentalPeriodFields(u: Record<string, unknown>): void {
  if (u.rentalInputMode !== "interval" && u.rentalInputMode !== "direct") {
    u.rentalInputMode = "direct";
  }
  if (!Array.isArray(u.rentalPeriods)) {
    u.rentalPeriods = [];
  } else {
    u.rentalPeriods = (u.rentalPeriods as unknown[]).map((p) => {
      const obj = (p ?? {}) as Record<string, unknown>;
      return {
        start: typeof obj.start === "string" ? obj.start : "",
        end: typeof obj.end === "string" ? obj.end : "",
      };
    });
  }
  if (typeof u.isInheritedRental !== "boolean") {
    u.isInheritedRental = false;
  }
  if (typeof u.decedentRentalMonths !== "string") {
    u.decedentRentalMonths = "";
  }
  if (typeof u.rentalAddressJibun !== "string") {
    u.rentalAddressJibun = "";
  }
  if (typeof u.rentalDong !== "string") {
    u.rentalDong = "";
  }
  if (typeof u.rentalHo !== "string") {
    u.rentalHo = "";
  }
}

/**
 * 임대 구간 합산 개월수 — whole-month(diffMonthsClamped) 재사용.
 * 시작·종료 모두 명시 필요(한쪽 비면 0). 자동 간주 없음(no_silent_apportion_fallback).
 */
export function sumRentalMonths(periods: RentalPeriod[] | undefined): number {
  if (!periods?.length) return 0;
  return periods.reduce((sum, p) => sum + diffMonthsClamped(p.start, p.end), 0);
}

/** 조특칙 §44 — 기존 임차인 퇴거일부터 다음 임차인 입주일까지 「3월이내」의 기간은 임대기간에 산입한다. */
export const RENTAL_TENANT_GAP_GRACE_MONTHS = 3;

/**
 * §155⑳ 의무임대기간 판정에 쓰는 **인정 임대개월** — 입력 구간에 법정 계산 규칙 두 가지를 적용한다.
 *
 * 1. 기산일: 소득세법 시행령 §167의3③ 후단 「사업자등록등을 하고 임대주택으로 등록하여 임대하는 날부터 임대를
 *    개시한 것으로 본다」 → 각 구간 시작을 `registrationBasisDate`(세무서 사업자등록일·지자체 등록신청일 중 늦은 날)
 *    이후로 자른다. 지자체 날짜는 화면의 「등록신청일」 칸을 쓴다(계획서 Q-1 a — 신청일·등록일 구분 해석 미확보, V-3).
 * 2. 공실: 조특령 §97⑤5호 → 조특칙 §44 — 앞 구간 종료일(퇴거일)부터 다음 구간 시작일(입주일)까지가 달력 3개월
 *    이내(경계 포함)면 공백까지 이어서 센다. 3개월을 넘으면 공백 전체를 뺀다(§97 감면 헬퍼
 *    `calculateEffectiveRentalDays`와 같은 기준).
 *
 * 순서는 자르기 → 이어 붙이기. 개월은 이어 붙인 구간마다 `diffMonthsClamped`(현행 method). 시작·종료 한쪽이라도 비거나
 * 종료 ≤ 시작이면 그 구간은 버린다.
 */
export function recognizedRentalMonths(
  periods: RentalPeriod[] | undefined,
  registrationBasisDate: string,
): number {
  const clipped = (periods ?? [])
    .filter((p) => p.start && p.end)
    .map((p) => ({
      start: registrationBasisDate && registrationBasisDate > p.start ? registrationBasisDate : p.start,
      end: p.end,
    }))
    .filter((p) => p.end > p.start)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  if (clipped.length === 0) return 0;

  const merged: RentalPeriod[] = [{ ...clipped[0] }];
  for (const p of clipped.slice(1)) {
    const cur = merged[merged.length - 1];
    const graceEnd = format(addMonths(parseISO(cur.end), RENTAL_TENANT_GAP_GRACE_MONTHS), "yyyy-MM-dd");
    if (p.start <= graceEnd) {
      if (p.end > cur.end) cur.end = p.end;
    } else {
      merged.push({ ...p });
    }
  }
  return merged.reduce((sum, p) => sum + diffMonthsClamped(p.start, p.end), 0);
}

/** 기산 기준일 — 세무서 사업자등록일·지자체 등록신청일 중 늦은 날(빈 값은 무시). 둘 다 비면 "". */
export function rentalRegistrationBasisDate(unit: {
  businessRegistrationDate?: string;
  rentalRegistrationDate?: string;
}): string {
  const a = unit.businessRegistrationDate ?? "";
  const b = unit.rentalRegistrationDate ?? "";
  return a > b ? a : b;
}

/**
 * 실제 임대개월 도출 — API 변환·validation·UI 총합 공용(단일 소스, residence deriveResidencePeriodMonths 대칭).
 * interval 모드 + 구간 있으면 인정 개월(`recognizedRentalMonths`), 아니면 direct 개월(rentalMonths) 파싱 —
 * direct는 사용자가 계산한 값이라 자르지 않는다(옛 기록·AI 필드 경로).
 * 상속받은 임대주택이면 피상속인 임대개월을 더한다(조특령 §97⑤3호 — 계획서 Q-2). 피상속인 기간은 상속인
 * 등록일로 자르지 않는다.
 */
export function deriveRentalMonths(unit: {
  rentalInputMode?: "interval" | "direct";
  rentalPeriods?: RentalPeriod[];
  rentalMonths?: string;
  businessRegistrationDate?: string;
  rentalRegistrationDate?: string;
  isInheritedRental?: boolean;
  decedentRentalMonths?: string;
}): number {
  const decedent = unit.isInheritedRental ? parseFloat(unit.decedentRentalMonths ?? "") || 0 : 0;
  if (unit.rentalInputMode === "interval" && (unit.rentalPeriods?.length ?? 0) > 0) {
    return recognizedRentalMonths(unit.rentalPeriods, rentalRegistrationBasisDate(unit)) + decedent;
  }
  return (parseFloat(unit.rentalMonths ?? "") || 0) + decedent;
}
