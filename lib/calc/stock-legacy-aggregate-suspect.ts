/**
 * 「합산 결과가 저장되지 않은」 주식 이력 판별 — **경고 배지 전용**.
 *
 * 계획서: `docs/00-pm/stock-history-aggregate-filing.plan.md` §4.5 · §3 M-3
 *
 * ## 무엇을 잡는가
 *
 * 2026-09-16 이전에는 다종목 합산 계산의 이력이 **마지막 종목 per-item 결과**로 저장됐다
 * (`StockTransferTaxCalculator.tsx`). 그 record를 그대로 믿고 신고하면 §102② 통산과 §103①
 * 기본공제 1회가 반영되지 않은 **틀린 세액**을 낸다.
 *
 * ## 🔴 전부를 잡지 못한다 — 그것이 설계다
 *
 * 착수 전 실측(계획서 §3 M-3)에서 단건 결과와 합산 per-item 결과를 전 필드 diff했다.
 * **저장된 종목이 기본공제를 온전히 받고 차손 통산도 없었다면 바이트 단위로 동일**하다
 * (키 53 = 53, diff `{}`). 그 경우 판별은 **원리적으로 불가능**하다.
 *
 * 그래서 오탐 0을 우선하고 확실한 두 신호만 본다:
 *   ① `lossOffset*` echo 키 존재 — 합산 경로에서만 실린다(값이 0이어도 키가 붙는다)
 *   ② 주식 그룹인데 소득이 있는데 기본공제가 0 — 단건에는 **주식 그룹 기소진 입력 축이 없어**
 *      소득이 양수면 반드시 공제가 붙는다(§103①2호). 0이면 다른 종목이 먼저 썼다는 뜻이다.
 *
 * ⚠️ 기타자산 그룹(§103①1호)은 제외한다 — `realEstateGroupBasicDeductionUsed` 선언만으로도
 *    0이 될 수 있어 단건에서도 정상적으로 발생한다.
 *
 * 복구는 하지 않는다. 원본 종목이 IndexedDB에 저장된 적이 없어 되살릴 소스가 없다.
 */
import type { CalculationRecord } from "@/lib/storage/types";

export function isLegacyStockAggregateSuspect(record: CalculationRecord): boolean {
  if (record.taxType !== "stock_transfer") return false;
  // 새 규약으로 저장된 합산 이력은 온전하다.
  if ((record.inputData as Record<string, unknown> | null)?.__multiStock === true) return false;

  const r = (record.resultData ?? null) as Record<string, unknown> | null;
  if (!r) return false;

  // ① 합산 경로에서만 실리는 §102② 통산 echo
  if ("lossOffsetFromSameGroup" in r || "lossOffsetFromOtherGroup" in r) return true;

  // ② 주식 그룹(§103①2호)인데 소득이 있는데 기본공제가 0
  return (
    r.basicDeductionGroup === "stock" &&
    r.isExempt !== true &&
    typeof r.transferIncome === "number" &&
    r.transferIncome > 0 &&
    r.basicDeduction === 0
  );
}
