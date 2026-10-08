/**
 * 양도세 계산·1세대1주택 판정이 **지원하는 가장 이른 양도일** — 세율 seed(`transfer-rate-seed-historical.ts`)의
 * 가장 이른 시행일(1990-01-01)이다. 그 전 양도는 누진세율·1세대1주택 규칙 행이 없어 route가
 * `TAX_RATE_NOT_FOUND`(500)로 끝났다 ⇒ ⑧(계산기·판정 메뉴)과 ⑫(Zod — 세 route 공용)가 같은 경계로 막는다.
 * 2005년 이전 양도 계산 수요는 없다(사용자 결정 2026-10-07) — 세율 연혁을 더 늘리지 않고 입력 단계에서 막는다.
 */
export const EARLIEST_SUPPORTED_TRANSFER_DATE = "1990-01-01";

/** `YYYY-MM-DD` 양도일이 지원 범위 밖(1990-01-01 전)인가. 빈 값·형식 오류는 다른 검증의 몫이라 false. */
export function isTransferDateBeforeSupported(transferDate: string | undefined): boolean {
  return !!transferDate && /^\d{4}-\d{2}-\d{2}$/.test(transferDate) && transferDate < EARLIEST_SUPPORTED_TRANSFER_DATE;
}

/** ⑧·⑫ 공용 문구 — 계산기·판정 메뉴가 같은 말을 한다. */
export const TRANSFER_DATE_BEFORE_SUPPORTED_MESSAGE = "1990.1.1. 이후 양도분만 계산·판정합니다.";
