/**
 * 조특법 §133 감면 종합한도 — 단건 경로 공용 헬퍼
 *
 * `finalizeTransferTax`(STEP 8.5)와 §155⑳ 특례 경로가 **같은 규칙을 써야 하므로** 추출했다.
 * 두 곳에 같은 로직을 복사하면 한쪽만 고쳐져 조용히 갈린다(dual-truth).
 *
 * ⚠️ **다건(aggregate) 경로는 여기를 쓰지 않는다** — `transfer-tax-aggregate.ts` M-8이
 *    유형별로 합산한 뒤 같은 모듈(`aggregate-reduction-limits`)로 한도를 적용한다.
 *    per-asset 입력에는 이력이 없어 이중 차감이 발생하지 않는다.
 */
import { applyAnnualLimits, applyFiveYearLimits, buildLimitGroups } from "./aggregate-reduction-limits";
import type { CalculationStep } from "./types/transfer.types";

export interface ReductionCapArgs {
  /** calcReductions가 낸 감면세액 */
  reductionAmount: number;
  /** 적용된 감면 유형(§133 그룹 판정 키). undefined면 한도 판정 대상이 아니다. */
  reductionTypeApplied: string | undefined;
  /** 양도연도 — §133 한도 그룹이 연도별로 갈린다(2025+ §77 그룹 2억/3억, 이전 1억/2억) */
  transferYear: number;
  /** 과거 4개 과세연도 감면 사용 이력. 비어 있으면 5년 누적 한도는 발동하지 않는다. */
  priorUsage: readonly { year: number; type: string; amount: number }[];
}

/**
 * §133 연간·5년 누적 한도를 적용한다.
 *
 * @returns 한도 적용 후 감면세액과, 실제로 깎였을 때만 붙는 표시 step.
 */
export function applyReductionStatutoryCap(args: ReductionCapArgs): {
  cappedAmount: number;
  step?: CalculationStep;
} {
  const { reductionAmount, reductionTypeApplied, transferYear, priorUsage } = args;
  if (!(reductionAmount > 0 && reductionTypeApplied && priorUsage.length > 0)) {
    return { cappedAmount: reductionAmount };
  }

  // 연간 한도 선처리 — applyFiveYearLimits 인자 계약("연간 캡 적용 후 값") 준수.
  // 현행 자경·공익수용은 calcReductions 내부에서 이미 연간 캡이 적용되어 등가(no-op)이나,
  // 내부 캡 없는 감면 유형이 향후 추가될 때 silent 과감면을 방지한다.
  const limitGroups = buildLimitGroups(transferYear);
  const { cappedByType: annuallyCappedByType, capInfoByType } = applyAnnualLimits(
    new Map([[reductionTypeApplied, reductionAmount]]),
    limitGroups,
  );
  const { fiveYearCappedByType, fiveYearCapInfoByType } = applyFiveYearLimits(
    annuallyCappedByType,
    priorUsage as { year: number; type: string; amount: number }[],
    transferYear,
    limitGroups,
  );
  const fiveInfo = fiveYearCapInfoByType.get(reductionTypeApplied);
  const annualInfo = capInfoByType.get(reductionTypeApplied);
  const capped = fiveYearCappedByType.get(reductionTypeApplied) ?? reductionAmount;
  if (capped >= reductionAmount) return { cappedAmount: reductionAmount };

  return {
    cappedAmount: capped,
    step: {
      label: "§133 종합한도",
      formula: fiveInfo?.cappedByFiveYear
        ? `감면세액 ${reductionAmount.toLocaleString()} → ${capped.toLocaleString()} (5년 한도 ${fiveInfo.fiveYearLimit.toLocaleString()} − 과거 4개 연도 누적 ${fiveInfo.priorGroupSum.toLocaleString()} = 잔여 ${fiveInfo.remaining.toLocaleString()})`
        : `감면세액 ${reductionAmount.toLocaleString()} → ${capped.toLocaleString()} (연간 한도 ${Number.isFinite(annualInfo?.annualLimit) ? annualInfo!.annualLimit.toLocaleString() : ""})`,
      amount: capped,
      legalBasis: fiveInfo?.cappedByFiveYear ? fiveInfo.legalBasis : (annualInfo?.legalBasis ?? ""),
    },
  };
}
