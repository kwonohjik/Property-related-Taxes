/**
 * 「소득세법」 제100조 제3항 «구분 기장 가액 30% 이상 차이 → 불분명 의제» 의 **적용 시점** 연혁 (정적 상수).
 *
 * 적용 기준은 **취득일이 아니라 양도일**이다 — 부칙이 «양도하는 분부터»로 정한다(KoreanLaw 부칙 원문 실독, 2026-10-14).
 *
 * | 양도일 | 30% 판정 본문 | 단서(영 §166⑧ 제외 사유) | 근거 |
 * |---|---|---|---|
 * | ~ 2015-12-31 | 없음 | 없음 | 법률 제13558호(2015.12.15.) 부칙 제2조② — 2016.1.1. 이후 양도분부터 |
 * | 2016-01-01 ~ 2024-12-31 | 적용 | 없음(단서 신설 전) | 같은 부칙 |
 * | 2025-01-01 ~ | 적용 | 적용 | 법률 제20615호(2024.12.31.) 부칙 제9조 — 2025.1.1. 이후 양도분부터 |
 *
 * 영 §166⑧(제외 사유 2종)은 대통령령 제35349호(2025.2.28.) 신설·공포일 시행·별도 적용례 없음 — 단서 자체가 2025.1.1. 이후 양도분에 적용되므로
 * 양도일 기준은 법 부칙이 정한다. 경계일은 양쪽 모두 «이후»(당일 포함)로 읽었다.
 */
export type Sec100_3Era = "none" | "body" | "body_and_proviso";

/** 본문(30% 판정) 적용 시작 양도일 — 법률 제13558호 부칙 제2조② */
export const SEC100_3_BODY_FROM = "2016-01-01";
/** 단서(영 §166⑧ 제외 사유) 적용 시작 양도일 — 법률 제20615호 부칙 제9조 */
export const SEC100_3_PROVISO_FROM = "2025-01-01";

const dayKey = (d: string | Date): string => (d instanceof Date ? d.toISOString().slice(0, 10) : d.slice(0, 10));

/** 양도일로 본 §100③ 적용 구간. 양도일 미입력은 본문 구간으로 본다(판정은 하되 단서 질문은 열지 않는다 — 양도일 없이는 어차피 이 경로가 열리지 않는다). */
export function sec100_3Era(transferDate: string | Date | undefined): Sec100_3Era {
  if (!transferDate) return "body";
  const k = dayKey(transferDate);
  if (k < SEC100_3_BODY_FROM) return "none";
  return k < SEC100_3_PROVISO_FROM ? "body" : "body_and_proviso";
}
