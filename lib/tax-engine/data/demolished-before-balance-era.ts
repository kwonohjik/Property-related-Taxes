/**
 * 매매특약에 따른 잔금 전 주택 멸실 — 양도물건 판정 기준일 연혁 (결정 #46).
 *
 * 기획재정부 재산세제과-1543(2022.12.20.): 주택 매매계약을 체결하고 그 매매특약에 따라 잔금청산 전에 멸실한 경우
 * 1세대1주택 비과세·장기보유특별공제·다주택자 중과 판정 시 양도물건의 판정 기준일은 양도일(잔금청산일)이며,
 * 「회신일 이후 매매계약 체결하는 경우부터 적용」한다. 회신일(2022-12-20) 당일 체결분부터로 본다(사용자 결정 #46).
 * 종전에는 소득세법 기본통칙 89-154-12(2024.3.15. 삭제)가 매매계약일을 기준으로 했다.
 *
 * ⚠️ 이 파일은 엔진 모듈을 import하지 않는다 — 판정·⑧이 같은 상수를 읽는다.
 */
export const DEMOLISHED_BEFORE_BALANCE_CONTRACT_START = new Date("2022-12-20");

/** 매매계약일이 잔금청산일 현황 판정(양도일 기준) 대상인가 — 2022-12-20 이후(당일 포함) 체결분. */
export function isBalanceDateStatusContract(contractDate: Date): boolean {
  return contractDate.getTime() >= DEMOLISHED_BEFORE_BALANCE_CONTRACT_START.getTime();
}

/** 판정 결과의 「적용되지 않은 특례」·「확인 필요」 id — 결과 화면(클라이언트)도 읽는다. */
export const DEMOLISHED_BEFORE_BALANCE_UNMET_ID = "154-1-demolished-before-balance";
export const DEMOLISHED_BEFORE_BALANCE_UNVERIFIED_ID = "154-1-demolished-before-balance-unverified";
