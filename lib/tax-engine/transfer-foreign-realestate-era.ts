/**
 * 국외자산 부동산 양도소득세(소득세법 §118의2~§118의8) 지원 개시 양도일 — 단일 소스.
 *
 * 값 2020-01-01(양도일 포함)은 계획서 엔진 Q-9 **권고안**이며 사용자 확정이 아니다(바꿀 때는 이 상수 한 곳만).
 * 근거(KoreanLaw MCP 2026-11-27 실독):
 *  - 시행 2020.01.01. 소득세법(법률 제16834호) §118의5①은 「제55조제1항에 따른 세율」 단일 문언이고,
 *    그 직전 시행본(2019.01.01.)은 1호 §55①과 2호 주식 구조라 문언이 다르다.
 *  - 같은 개정 부칙 제2조② 「이 법 중 양도소득세에 관한 개정규정은 이 법 시행 이후 양도하는 분부터 적용한다」.
 * 그 이전 양도분과 중간 시행본 대조는 계획서 엔진 V-9로 범위 밖(확인 필요).
 */
export const FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS = Date.UTC(2020, 0, 1);

/** 양도일이 지원 범위(2020-01-01 이후, 당일 포함)인지 — UTC 달력일 기준. 잘못된 날짜는 false. */
export function isForeignRealEstateSupportedTransferDate(transferDate: Date): boolean {
  const t = transferDate.getTime();
  if (Number.isNaN(t)) return false;
  const utcMidnight = Date.UTC(
    transferDate.getUTCFullYear(),
    transferDate.getUTCMonth(),
    transferDate.getUTCDate(),
  );
  return utcMidnight >= FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS;
}
