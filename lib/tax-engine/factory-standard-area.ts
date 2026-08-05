/**
 * 공장입지기준면적 산식 — 「지방세법 시행규칙」 §50 [별표 6]
 *
 *   공장입지기준면적 = 공장건축물 **연면적** × 100 ÷ 업종별 기준공장면적률
 *
 * ## 왜 세목 중립 위치인가
 *
 * 같은 산식을 **두 세목이 쓴다**:
 *
 * | 세목 | 경로 |
 * |---|---|
 * | 재산세 | 「지방세법」 §106①3호가목 → 시행령 §102①1호 → 시행규칙 §50 [별표6] |
 * | 양도세 | 「소득세법」 §104의3①4호나목 → 위 재산세 분리과세 대상 여부를 그대로 참조 |
 *
 * 양도세 비사업용 판정이 재산세 분리과세 대상 여부를 인용하는 구조라 **분모가 같아야 한다**.
 * 한쪽에만 두면 다른 쪽이 사본을 만들게 되고, 고시가 재고시될 때 한 벌만 갱신되어 갈린다.
 *
 * ⇒ 산식·상수는 여기 한 벌만 둔다. 세목별 판정(경로 분기·비사업용 안분·과세구분)은
 *   각 세목 모듈이 이 결과를 소비해서 수행한다.
 *
 * 업종별 기준공장면적률 자체는 「공장입지 기준고시」 [별표1] — `data/factory-area-rates.ts`.
 */

/** 별표6 3호가1) — 「산집법」 §20① 본문 공장 신설 제한지역: 산출면적의 10% 이내. */
export const RESTRICTED_ZONE_ALLOWANCE_RATE = 0.1;
/** 별표6 3호가1) 단서 — 그 인정면적이 3,000㎡를 초과하지 않는 부분에 한정. */
export const RESTRICTED_ZONE_ALLOWANCE_CAP = 3000;
/** 별표6 3호가2) — 제한지역 외: 산출면적의 20% 이내. */
export const GENERAL_ALLOWANCE_RATE = 0.2;

/** 업종 1건 — 별표6 1호 입력 단위 */
export interface FactoryIndustrySegmentBase {
  /** 공장건축물 연면적 (㎡). 바닥면적이 아니다. */
  floorArea: number;
  /** 업종별 기준공장면적률 (%) — 「공장입지 기준고시」 별표1 */
  ratePercent: number;
  /** 표시용 업종명 (계산에 쓰이지 않는다) */
  industryLabel?: string;
}

/** 업종별 산출 내역 (별표6 1호·2호다 — 표시·검증용). */
export interface FactoryIndustrySegmentDetail extends FactoryIndustrySegmentBase {
  /** 해당 업종분 기준면적 = 연면적 × 100 ÷ 면적률 (㎡) */
  standardArea: number;
}

export interface FactoryStandardAreaResult {
  /** 별표6 1호·2호 산출면적 (다업종이면 업종별 합, ㎡) */
  baseArea: number;
  /** 업종별 산출 내역 */
  segments: FactoryIndustrySegmentDetail[];
  /** 별표6 3호가 추가 인정 한도 (㎡) */
  additionalAllowanceCap: number;
  /** 별표6 3호가 실제 인정분 = min(초과면적, 한도) (㎡) */
  additionalAllowanceApplied: number;
  /** 별표6 3호나·다·라·바 직접입력 인정면적 (㎡). **마목은 대상이 아니다** — 아래 주석 참조. */
  additionalRecognizedArea: number;
  /** 최종 공장입지기준면적 (㎡) */
  standardArea: number;
}

/**
 * 별표6 공장입지기준면적을 산출한다.
 *
 * 3호가목(10%/20% 추가 인정)은 "산출된 면적을 **초과하는 토지 중**" 일정 범위를 기준면적에
 * 포함시키는 규정이므로 실제 부속토지 면적(`landArea`)에 의존한다 — 초과분이 없으면 인정분도 0이다.
 *
 * 반올림하지 않는다. 별표6에 반올림 근거가 없고(근거 없는 불리 적용 금지), 자매 헬퍼
 * `judgeAppurtenantLandExcess`(바닥면적 × 배율)도 원시값을 유지한다. 표시 계층에서 2자리로 다룬다.
 */
export function computeFactoryStandardArea(
  segments: FactoryIndustrySegmentBase[],
  landArea: number,
  options?: { isRestrictedZone?: boolean; additionalRecognizedArea?: number },
): FactoryStandardAreaResult {
  // 별표6 1호 (다업종이면 2호다에 따라 업종별 산출 후 합산)
  const segmentDetails: FactoryIndustrySegmentDetail[] = segments.map((s) => ({
    ...s,
    standardArea: s.ratePercent > 0 ? (s.floorArea * 100) / s.ratePercent : 0,
  }));
  const baseArea = segmentDetails.reduce((sum, s) => sum + s.standardArea, 0);

  // 별표6 3호가 — 제한지역 10%(3,000㎡ 한도) / 그 밖 20%
  const additionalAllowanceCap = options?.isRestrictedZone
    ? Math.min(baseArea * RESTRICTED_ZONE_ALLOWANCE_RATE, RESTRICTED_ZONE_ALLOWANCE_CAP)
    : baseArea * GENERAL_ALLOWANCE_RATE;
  const excessOverBase = Math.max(0, landArea - baseArea);
  const additionalAllowanceApplied = Math.min(excessOverBase, additionalAllowanceCap);

  // 별표6 3호나·다·라·바 — 녹지·활주로·철로·6m 이상 도로·접도구역 / 저수지·침전지 /
  // 30도 사면용지 / 종업원 체육시설. 근거 판단은 사용자가 하고 면적 합계만 받는다.
  //
  // 🔴 **마목은 여기 들어오지 않는다.** 문언 구조가 나머지 목과 다르다(2026-08-06 실측):
  //   나·다·라·바 — "…는 공장입지기준면적에 **포함되는 것으로 한다**"  → 한도(분자)를 늘린다
  //   마          — "…합한 면적을 해당 공장의 **부속토지로 보아** 산정한다" → 부속토지(대상)를 넓힌다
  // 마목은 오염피해 인접토지를 공장 부속토지 **범위**에 편입시키는 규정이지 기준면적을 늘리는
  // 규정이 아니다. 여기 더하면 한도가 부당하게 커져 초과분이 과소해진다(유리한 방향 오류).
  // ⇒ 마목 해당분은 부속토지 면적(`landArea`) 쪽에 포함시켜야 한다.
  const additionalRecognizedArea = options?.additionalRecognizedArea ?? 0;

  return {
    baseArea,
    segments: segmentDetails,
    additionalAllowanceCap,
    additionalAllowanceApplied,
    additionalRecognizedArea,
    standardArea: baseArea + additionalAllowanceApplied + additionalRecognizedArea,
  };
}
