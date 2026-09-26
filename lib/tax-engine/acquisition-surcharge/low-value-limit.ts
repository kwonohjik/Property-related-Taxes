/**
 * 저가주택 시가표준액 한도 — 연혁 leaf (지방세법 시행령 §28의2 1호 · §28의4⑥1호가목)
 *
 * 부칙(대통령령 제35477호, 2025.4.29.) 제2조:
 *   「제28조의2제1호 및 제28조의4제6항제1호가목의 개정규정은 2025년 1월 2일 이후 취득하는
 *    주택부터 적용한다.」
 *   - 2025.1.2. 이후 취득: 수도권 1억 / 수도권 외 2억 (현행 §28의2 1호 가목·나목)
 *   - 그 전 취득: 전국 1억 (2025.2.18. 시행본 MST 269119 §28의2 1호)
 *
 * 기준일은 **과세대상 주택(취득하는 주택)의 취득일**이다 — 보유주택의 취득일이 아니다.
 * 같은 부칙 조항을 공유하는 두 경로(취득 주택 중과 배제 · 보유주택 수 제외)가 이 함수 하나를 쓴다.
 */

import { ACQUISITION_CONST } from "../legal-codes";

export function getLowValueHouseLimit(
  isMetropolitan: boolean,
  taxableHouseAcquisitionDate: string,
): number {
  if (taxableHouseAcquisitionDate < ACQUISITION_CONST.LOW_VALUE_REGIONAL_LIMIT_FROM) {
    return ACQUISITION_CONST.LOW_VALUE_NATIONWIDE_LIMIT_PRE_2025;
  }
  return isMetropolitan
    ? ACQUISITION_CONST.LOW_VALUE_METRO_LIMIT
    : ACQUISITION_CONST.LOW_VALUE_NON_METRO_LIMIT;
}

/** 결과 화면용 한도 설명 — 「수도권」·「수도권 외」·「2025.1.2. 전 취득 — 전국」 */
export function describeLowValueHouseLimit(
  isMetropolitan: boolean,
  taxableHouseAcquisitionDate: string,
): string {
  if (taxableHouseAcquisitionDate < ACQUISITION_CONST.LOW_VALUE_REGIONAL_LIMIT_FROM) {
    return "2025.1.2. 전 취득 — 전국 1억";
  }
  return isMetropolitan ? "수도권 1억" : "수도권 외 2억";
}
