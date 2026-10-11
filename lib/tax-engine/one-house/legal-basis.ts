import type { OneHouseAppliedException, OneHousePendingCondition } from "./types";

/**
 * 판정의 근거 조문 목록 — **적용된 특례·남은 조건에서 모은 파생값**이다(`OneHouseJudgment.legalBasis`).
 * 입력 순서를 유지한 채 중복만 제거한다(표시 순서가 곧 판정 순서다).
 *
 * `checkExemption`(판정을 만드는 곳)과 `revokeOneHouseExemption`(비과세를 거두는 곳)이 **같은 함수**로 모은다 —
 * 철회 뒤에 근거 조문이 남는 것은 두 곳이 따로 계산했기 때문이다(S07-7).
 */
export function deriveLegalBasis(
  appliedExceptions: readonly Pick<OneHouseAppliedException, "legalBasis">[],
  pending: readonly Pick<OneHousePendingCondition, "legalBasis">[],
): string[] {
  return [...new Set([...appliedExceptions.map((e) => e.legalBasis), ...pending.map((p) => p.legalBasis)])];
}
