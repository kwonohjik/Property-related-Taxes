/**
 * 13호(무주택 1세대 1필지 나지) 「세대 주택 소유 기간」 행 수 상한 — ⑤(「+ 추가」 버튼)·⑧(validate)·⑫(Zod `max`)의 단일 소스 (E3-④ R-7).
 *
 * ⑫가 받는 개수와 화면이 만들 수 있는 개수가 어긋나면 사용자는 행을 다 입력한 뒤 계산 단계에서야 400을 만난다(`asset-card-count-cap.ts`와 같은 이유 · 같은 방식).
 *
 * **값의 근거**: 행 1건 = 세대가 주택을 «소유한 기간 1회»(취득 → 처분 1사이클)다. 엔진은 겹침을 병합하고 일 단위로 세므로 개수는 판정 정확도와 무관하다 — 상한은 비정상 입력(DoS)만 막는다.
 * 같은 «1회 사건 = 1행» 배열의 선례 상한이 `GB_SHARES_MAX`·`COMPANION_ASSETS_MAX` = 10(`asset-card-count-cap.ts`)이라 그 값에 맞췄다 — 한 토지 소유기간(통상 수년~십수 년) 중 세대가 주택을 사고판 횟수가 10회를 넘는 경우는
 * 현실적 상한 밖이라 판단한다(그 이상이면 인접한 기간을 하나로 합쳐 입력할 수 있다). 근거가 임의값이 아니라 «기존 선례 + 병합 가능성»임을 계획서 §10에도 기록했다.
 *
 * 이 파일은 import가 없다 — `lib/api` 스키마가 읽어도 순환이 생기지 않는다.
 */

/** ⑫ `nblOtherHouseholdHousePeriods` 배열 상한. */
export const NBL_HOUSEHOLD_HOUSE_PERIODS_MAX = 10;

/** ⑧ 차단 문구 · ⑤ 한도 안내 문구 · ⑫ Zod 오류 문구(같은 문장). */
export function nblHouseholdHousePeriodsCapMessage(): string {
  return `세대 주택 소유 기간은 ${NBL_HOUSEHOLD_HOUSE_PERIODS_MAX}건까지 입력할 수 있습니다. 이어지는 기간은 하나로 합쳐 입력하세요.`;
}
