/**
 * 「소득세법 시행령」 §167의2② 감면소득 안분의 **순수 식** — 의존이 `tax-utils`뿐인 leaf.
 *
 * 다건 합산(`transfer-tax-aggregate-reducible-loss-share.ts`)과 겸용(`transfer-tax-mixed-use-income-deduction.ts`, NH-33)이 같은 식을 쓴다.
 * 겸용은 클라이언트 컴포넌트(결과 카드)가 import하는 체인에 있어 합산 모듈(→ `db/tax-rates` → 서버 전용 supabase)을 끌어오면 빌드가 깨진다 —
 * 그래서 식만 이 파일로 분리하고 합산 파일이 re-export한다.
 */
import { safeMultiplyThenDivide } from "./tax-utils";

/**
 * 감면소득금액이 떠안는 차손 — `floor(받은 차손 × 감면소득금액 / 통산 전 양도소득금액)`, 감면소득금액을 넘지 않는다.
 * 통산 전 양도소득금액이 0 이하면 안분할 수 없어 0이다. 소득공제형·세액감면형이 **이 한 식**을 쓴다.
 */
export function lossShareOnReducible(lossReceived: number, reducible: number, incomeBeforeOffset: number): number {
  if (lossReceived <= 0 || reducible <= 0 || incomeBeforeOffset <= 0) return 0;
  return Math.min(reducible, safeMultiplyThenDivide(lossReceived, reducible, incomeBeforeOffset));
}

/**
 * 감면소득에서 뺄 몫(음수면 더할 몫) — 순차손이 양수면 `lossShareOnReducible`(종전 식 그대로), 음수(넘긴 차손이 더 크다)면
 * 같은 비율 `floor(넘긴 순차손 × 감면소득 / 기준 소득)`만큼 늘린다. 기준 소득이 0 이하면 0.
 */
export function reducibleShiftOf(unit: { loss: number; base: number }, reducible: number): number {
  if (unit.loss >= 0) return lossShareOnReducible(unit.loss, reducible, unit.base);
  if (reducible <= 0 || unit.base <= 0) return 0;
  return -safeMultiplyThenDivide(-unit.loss, reducible, unit.base);
}

