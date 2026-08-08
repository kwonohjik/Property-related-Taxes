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

/**
 * 「소득세법」 제95조 제5항 제2호 — **주택으로 보유한 기간 중** 거주한 기간만 산입.
 *
 * 비주택으로 취득해 주택으로 용도변경한 경우, 주거용 사용 개시일 이전의 거주는 §95⑤2호의
 * 거주기간이 아니다. 입주일·퇴거일 구간으로 입력됐다면 각 구간의 시작을 주거용 사용 개시일로
 * 당겨 다시 합산한다.
 *
 * ## ⭐ 이 값은 §154① 비과세 거주요건에도 쓰인다 — 그쪽 근거는 별개다 (2026-08-09)
 *
 * 반환값은 엔진 input `residencePeriodMonths` 하나로 들어가 **두 곳**이 소비한다:
 * §95⑤2호 표2 거주분 공제율(위)과, **「소득세법 시행령」 §154① 비과세 거주요건**이다.
 * 후자의 근거는 §95⑥이 아니라 §154① 자신에 있다:
 *
 *   - **§154① 괄호** — 취득 당시 조정대상지역 주택은 "보유기간이 2년 … 이상이고
 *     **그 보유기간 중 거주기간이 2년 이상**인 것"
 *   - **§154⑤ 단서** — "**제1항에 따른 보유기간**"을 용도변경 시 **주거용 사용한 날**부터로 재정의
 *
 *   ⇒ ①이 요구하는 것은 **「그 보유기간 중」의 거주**이고, ⑤이 그 보유기간을 주거용 사용일부터로
 *     정했으므로 그 이전 거주는 정의상 산입 대상이 아니다. **문언 그대로다.**
 *
 * ❌ 종전 기록(계획서 R-G)은 이를 「명문 없는 불리 적용」으로 봤고 근거를 **§154⑥**
 *    ("거주기간은 전입일부터 전출일까지")에 뒀다. ⑥은 **개별 거주 구간의 시종**을 정할 뿐
 *    **어느 구간을 산입하는가**를 정하지 않는다 — ①의 「그 보유기간 중」을 놓친 독법이었다.
 *    이 논거로 클램프를 제거하지 말 것.
 *
 * ⚠️ 사정거리는 **취득 당시 조정대상지역**뿐이다 — 비조정이면 거주요건 자체가 없어 세액이
 *    바뀌지 않는다(`meetsOneHouseResidenceRequirement`의 `!wasRegulated` 단락).
 * ⚠️ 예규·심판례 **0건**(§154⑤ 단서가 2024-03-01 신설). 조문 해석이지 유권해석이 아니다.
 * 세액 anchor: `non-housing-to-housing-conversion.engine.test.ts` **R-G-1~R-G-3**.
 *
 * ⚠️ **`direct` 모드는 클램프할 수 없다** — 개월 수 스칼라에는 시점 정보가 없다.
 *    자동 안분 fallback은 금지이므로(비율로 깎지 않는다) 원값을 그대로 두고,
 *    "주거용 사용 개시일 이후만 입력하라"는 안내를 Step4가 띄운다(계획 C-10b).
 *
 * `deriveResidencePeriodMonths`와 **같은 소스에 둔다** — 두 함수가 같은 입력 형태를 읽어야
 * 클램프 전후 값이 어긋나지 않는다.
 *
 * @returns months 산입 개월 수 · trimmed 잘려나간 개월 수(0이면 절사 없음 — 결과 화면 안내용)
 */
export function clampResidenceToHousingPeriod(
  primary: {
    residenceInputMode: "interval" | "direct";
    residencePeriods: ResidencePeriod[];
    residencePeriodMonthsAsset: string;
  },
  transferDate: string,
  formFallbackMonths: string,
  residentialUseStartDate: string | undefined,
): { months: number; trimmed: number } {
  const raw = deriveResidencePeriodMonths(primary, transferDate, formFallbackMonths);

  // 용도변경이 아니거나 direct 모드면 클램프 대상이 아니다.
  if (
    !residentialUseStartDate ||
    primary.residenceInputMode !== "interval" ||
    primary.residencePeriods.length === 0
  ) {
    return { months: raw, trimmed: 0 };
  }

  const clamped = primary.residencePeriods.reduce((sum, p) => {
    if (!p.moveInDate || !p.moveOutDate) return sum;
    // 구간 전체가 주거용 사용일 이전이면 0이 된다(diffMonthsClamped가 음수를 0으로 막는다).
    const start = p.moveInDate < residentialUseStartDate ? residentialUseStartDate : p.moveInDate;
    return sum + diffMonthsClamped(start, p.moveOutDate);
  }, 0);

  return { months: clamped, trimmed: Math.max(0, raw - clamped) };
}
