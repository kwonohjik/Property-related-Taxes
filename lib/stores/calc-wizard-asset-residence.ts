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
 * moveOutDate가 빈값인 구간은 transferDate로 fallback.
 */
export function sumResidenceMonths(
  periods: ResidencePeriod[],
  transferDate: string,
): number {
  return periods.reduce((sum, p) => {
    const end = p.moveOutDate || transferDate;
    return sum + diffMonthsClamped(p.moveInDate, end);
  }, 0);
}
