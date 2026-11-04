/**
 * §155⑳ 거주주택 특례 + **다른 보유 주택 목록 없음** + 조특법 주택 수 제외 선언 — 계산 API가 거절하는 가드
 * (사용자 결정 2026-11-04 V-9 「1 — 목록 입력 요구」 · 「API도 차단」, `docs/00-pm/rental-155-20-review-fixes.plan.md` V-9).
 *
 * 계산기 화면은 목록 행에 연결되지 않은 조특법 선언을 ⑧(`UNLINKED_COUNT_EXCLUSION_MESSAGE`)이 막는다. 목록이 비면 선언은
 * 늘 어느 행에도 연결되지 않으므로 화면에서는 이 입력이 나오지 않는다. API를 직접 부르면 그 검증을 거치지 않는데, 엔진은
 * 선언으로 ⑳ 소유주택 구성은 성립시키면서 다주택 중과는 「세대 보유 주택 수」 숫자만으로 매겨(중과 배제 사유를 볼 목록이 없다)
 * 중과 + 장기보유특별공제가 함께 붙은 세액을 냈다(UX-A4·A5·A8 199,997,600 — 목록을 입력하면 102,086,600).
 *
 * 판정 메뉴 route는 같은 스키마를 쓰지만 중과를 계산하지 않는다 — 그래서 스키마가 아니라 **계산 route에서만** 건다
 * (`rental-phrp-price-guard.ts`와 같은 위치).
 */
import { TRANSFER_RENTAL_HOUSING } from "@/lib/tax-engine/legal-codes/transfer";

export const RENTAL_RESIDENCE_NO_ROSTER_SPECIAL_MESSAGE =
  `조특법 주택 수 제외 선언이 있는데 다른 보유 주택 목록이 비어 있어 어느 주택을 뺐는지 알 수 없습니다 — ` +
  `${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20} 거주주택 특례를 계산하려면 다른 보유 주택 목록에 그 주택을 입력하고 주택 수 제외를 지정하세요.`;

/** 거절할 입력이면 `fieldErrors` 모양(경로 → 메시지 배열)을, 아니면 `undefined`를 돌려준다. */
export function rentalResidenceNoRosterFieldErrors(
  rhe: { applyException: boolean } | undefined,
  houses: readonly unknown[] | undefined,
  specialHouseExclusions: readonly unknown[] | undefined,
  path = "specialHouseExclusions",
): Record<string, string[]> | undefined {
  if (!rhe?.applyException || (houses?.length ?? 0) > 0 || (specialHouseExclusions?.length ?? 0) === 0) return undefined;
  return { [path]: [RENTAL_RESIDENCE_NO_ROSTER_SPECIAL_MESSAGE] };
}
