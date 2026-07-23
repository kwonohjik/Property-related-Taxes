/**
 * 다주택 중과 한시배제 경과조치 상수 — §167의3①12의2 나·다목 · §167의10①12의2 나·다목.
 *
 * 근거(KoreanLaw 실측 2026-07-23, 소득세법 시행령 MST 286211 · 국세청 해설서 2026-07-24):
 *   가목: 2026-05-09까지 양도 (SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end — transfer.ts).
 *   나목(토지거래허가 대상): 2026-05-09까지 허가 신청·허가 수령·계약금 증빙 + 계약일부터 4개월
 *     (표 지역 6개월) 이내 양도. 단 2026-05-10 이후 계약 시 절대기한 2026-09-09(6개월 지역 2026-11-09).
 *   다목(허가 대상 아님): 2026-05-09까지 계약·계약금 증빙 + 계약일부터 4개월(표 지역 6개월) 이내 양도.
 *
 * transfer.ts 800줄 정책으로 분리. barrel(../legal-codes.ts)이 재수출.
 */

/** 나목1)·다목1) 공통 기준일 — 허가 신청(나)/매매계약 체결(다) 마감. transfer.ts WINDOW.end와 동일 값. */
export const SURCHARGE_TRANSITION = {
  DEADLINE: "2026-05-09",
  /** 계약일부터 양도 기한(개월) — 기본 4, 나목4) 표 지역 6 */
  MONTHS_DEFAULT: 4,
  MONTHS_TABLE_REGION: 6,
  /** 나목4) 단서 — 2026-05-10 이후 계약 체결 시 절대 양도기한 */
  ABSOLUTE_DEADLINE_4M: "2026-09-09",
  ABSOLUTE_DEADLINE_6M: "2026-11-09",
  BASIS: "소득세법 시행령 §167의3①12의2 나·다목 · §167의10①12의2 나·다목",
} as const;

/**
 * 나목4) 표 = 소재 지역별 양도 기한 (국세청 해설서 이미지45, 2026-07-24 확정).
 * 4개월 = 강남·서초·송파·용산 4구. 6개월 = 2025-10-16 추가 지정 조정대상지역.
 * 6개월 명단은 REGULATED_REGIONS(data/regulated-areas.ts) designatedDate==="2025-10-16" 파생
 * (transitionExemptionMonths in multi-house-surcharge-exclusion.ts) — 이 상수는 4개월 지역·기준일만 보유.
 */
export const SURCHARGE_TRANSITION_FOUR_MONTH_SGG: ReadonlySet<string> = new Set([
  "11680", // 강남구
  "11650", // 서초구
  "11710", // 송파구
  "11170", // 용산구
]);

/** 6개월 지역 판별 기준일 — 이 날짜에 조정대상지역으로 지정된 지역이 표 지역(6개월) */
export const SURCHARGE_TRANSITION_DESIGNATION_DATE = "2025-10-16" as const;
