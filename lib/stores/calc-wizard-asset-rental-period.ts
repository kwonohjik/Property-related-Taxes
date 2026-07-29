/**
 * 임대주택 호별 실제 임대기간 — §155⑳ 의무임대기간 판정용.
 *
 * 비연속 임대(공실 구간 제외) 사례를 정확히 반영하기 위해 시작일·종료일 페어를
 * 다중 입력하거나, 합산 개월수를 직접 입력하는 두 모드(interval/direct)를 지원.
 * 엔진은 단일 정수(rentalMonths)만 사용하므로 API 변환 단계에서 합산값을 주입한다.
 *
 * 개월 계산은 거주기간과 동일한 whole-month 방식(`diffMonthsClamped`) 재사용 — method 단일 소스.
 */

import { diffMonthsClamped } from "./calc-wizard-asset-residence";

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

/**
 * 실제 임대개월 도출 — API 변환·validation·UI 총합 공용(단일 소스, residence deriveResidencePeriodMonths 대칭).
 * interval 모드 + 구간 있으면 합산, 아니면 direct 개월(rentalMonths) 파싱.
 */
export function deriveRentalMonths(unit: {
  rentalInputMode?: "interval" | "direct";
  rentalPeriods?: RentalPeriod[];
  rentalMonths?: string;
}): number {
  if (unit.rentalInputMode === "interval" && (unit.rentalPeriods?.length ?? 0) > 0) {
    return sumRentalMonths(unit.rentalPeriods);
  }
  return parseFloat(unit.rentalMonths ?? "") || 0;
}
