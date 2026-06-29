/**
 * 자산-수준 거주 정보 — 1세대1주택 표2 장기보유공제 계산용.
 *
 * 비연속 거주(중간 임대·일시 거주이탈) 사례를 정확히 반영하기 위해 입주일·퇴거일 페어를
 * 다중 입력. 엔진은 단일 정수(residencePeriodMonths)만 사용하므로 API 변환 단계에서
 * 합산값을 주입한다.
 */

export interface ResidencePeriod {
  /** 입주일 YYYY-MM-DD */
  moveInDate: string;
  /** 퇴거일 YYYY-MM-DD (현재 거주 중이면 빈 문자열 = 양도일까지) */
  moveOutDate: string;
}

export const RESIDENCE_DEFAULTS = {
  residenceInputMode: "direct" as "interval" | "direct",
  residencePeriods: [] as ResidencePeriod[],
  residencePeriodMonthsAsset: "0",
};

/** sessionStorage 마이그레이션: legacy AssetForm에 거주 필드가 없으면 기본값 주입 */
export function migrateResidenceFields(a: Record<string, unknown>): void {
  if (a.residenceInputMode !== "interval" && a.residenceInputMode !== "direct") {
    a.residenceInputMode = "direct";
  }
  if (!Array.isArray(a.residencePeriods)) {
    a.residencePeriods = [];
  } else {
    a.residencePeriods = (a.residencePeriods as unknown[]).map((p) => {
      const obj = (p ?? {}) as Record<string, unknown>;
      return {
        moveInDate: typeof obj.moveInDate === "string" ? obj.moveInDate : "",
        moveOutDate: typeof obj.moveOutDate === "string" ? obj.moveOutDate : "",
      };
    });
  }
  if (typeof a.residencePeriodMonthsAsset !== "string") {
    a.residencePeriodMonthsAsset = "0";
  }
}

/**
 * 두 날짜 사이 개월수 (양도일 클램프). 윤년·월 경계 안전.
 * end가 빈값이면 0 반환 (호출자가 양도일 fallback 처리).
 */
export function diffMonthsClamped(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  let m = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * 거주 구간 합산 개월수 — interval 모드 진입 함수.
 *
 * 정책: 자동 fallback 금지 (feedback_no_silent_apportion_fallback.md).
 * 입주일·퇴거일 모두 명시 입력 필요. 한쪽이라도 비면 0으로 처리되어
 * validation에서 차단됨. transferDate 자동 간주 로직은 제거됨.
 *
 * @param periods 거주 구간 배열
 * @param _transferDate 인터페이스 호환을 위해 유지 (사용 안 함)
 */
export function sumResidenceMonths(
  periods: ResidencePeriod[],
  _transferDate: string,
): number {
  void _transferDate;
  return periods.reduce((sum, p) => {
    return sum + diffMonthsClamped(p.moveInDate, p.moveOutDate);
  }, 0);
}

/**
 * 거주기간 개월수 도출 — API 변환(transfer-tax-api)·UI 거주요건 안내 메시지(Step4) 공용(단일 진실).
 * interval 모드 + 구간 입력 있으면 합산, 아니면 자산 직접입력 또는 form-global fallback.
 */
export function deriveResidencePeriodMonths(
  primary: {
    residenceInputMode: "interval" | "direct";
    residencePeriods: ResidencePeriod[];
    residencePeriodMonthsAsset: string;
  },
  transferDate: string,
  formFallbackMonths: string,
): number {
  return primary.residenceInputMode === "interval" && primary.residencePeriods.length > 0
    ? sumResidenceMonths(primary.residencePeriods, transferDate)
    : parseInt(primary.residencePeriodMonthsAsset || formFallbackMonths) || 0;
}
