/**
 * businessKey 재계산 마이그레이션 (Dexie v8).
 *
 * 키 규칙이 두 방향으로 바뀌었다 — 둘 다 **기존 record의 키를 낡게 만든다**:
 *   ① 키가 집합건물 **동·호**를 본다 (같은 지번 두 세대를 가른다)
 *   ② **식별자가 없으면 키를 만들지 않는다** (`addr:|양도일` 폐지)
 *
 * 재계산하지 않으면 기존 record가 새 키에 매칭되지 않아, 다음 저장 때 **이력에 비슷한
 * 항목이 하나 더** 생긴다(설계서 §6.1 배포 전환 동작).
 *
 * 🔴 **record를 지우거나 늘리지 않는다.** 재계산하면 §1 충돌로 이미 합쳐진 이력에서
 *    두 record가 같은 키가 될 수 있다. 그때도 그냥 둔다(중복 키 허용) —
 *    `saveOrUpdateByBusinessKey`가 `find`로 첫 건만 잡을 뿐 소실은 없다.
 *    (덮어쓰기로 **이미 사라진** 신고서는 이 마이그레이션으로 복구되지 않는다.)
 *
 * 선례: `nbl-sigungu-code-recovery` — upgrade 본체가 아니라 **순수 코어**를 테스트한다.
 *
 * 계획서: docs/00-pm/business-key-property-identity.plan.md §6 (Q-1 (b))
 */
import type { Transaction } from "dexie";
import { extractBusinessKey } from "../business-key";
import type { LocalTaxType } from "../types";

interface CalcRecordPartial {
  taxType?: unknown;
  businessKey?: string;
  inputData?: Record<string, unknown>;
}

/**
 * record 하나의 `businessKey`를 현행 규칙으로 다시 계산한다.
 *
 * @returns 바뀌었으면 true (불필요한 쓰기를 피하기 위해 동일하면 false)
 */
export function recomputeRecordBusinessKey(r: CalcRecordPartial): boolean {
  const taxType = r.taxType as LocalTaxType | undefined;
  if (!taxType) return false;
  const next = extractBusinessKey(taxType, r.inputData ?? {}) ?? undefined;
  if (next === r.businessKey) return false;
  // 키를 못 뽑게 된 record(주소 미입력 등)는 필드를 지워 content 폴백으로 돌린다
  if (next === undefined) delete r.businessKey;
  else r.businessKey = next;
  return true;
}

/** Dexie upgrade 트랜잭션에서 호출. @returns 키를 바꾼 record 수 */
export async function migrateBusinessKeyRecompute(tx: Transaction): Promise<number> {
  let transformed = 0;
  await tx
    .table("calculations")
    .toCollection()
    .modify((r: CalcRecordPartial) => {
      if (recomputeRecordBusinessKey(r)) transformed++;
    });
  return transformed;
}
