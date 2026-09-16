/**
 * 이력 합산 선택 모달의 **후보 1행** — 세목 중립 타입.
 *
 * 부동산(`transfer-aggregate-entry.ts`)과 주식(`stock-aggregate-entry.ts`)이 같은 화면
 * (`HistoryAggregateSelectShell`)을 쓰므로 타입을 한 곳에 둔다. 각 세목 entry 는 이 타입을
 * **re-export** 해 기존 import 경로를 깨지 않는다.
 */
import type { CalculationRecord } from "@/lib/storage/types";

export interface AggregateCandidate {
  record: CalculationRecord;
  /** 과세연도 — 기준과 다르면 `disabledReason`이 붙는다 */
  taxYear: number | null;
  /** 선택 불가 사유. null이면 선택 가능 */
  disabledReason: string | null;
  /** 버튼을 누른 기준 record인가 (항상 선택된 채 고정) */
  isBase: boolean;
}
