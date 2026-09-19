/**
 * Pre-Do anchor — 다건 합산 「5단계 세액 산정」의 **산출세액 산식이 값을 재현하지 못한다**
 *
 * ## 제보 (사용자 화면, 2026-09-16)
 *
 *   과세표준    399,400,000
 *   산출세액    133,820,000   ← 근거: 「과세표준 × 세율(38%) − 누진공제 0」
 *
 * 그 산식대로면 `399,400,000 × 38% − 0 = 151,772,000`이다. **표시된 값과 17,952,000 어긋난다.**
 * 등식을 스스로 부정하는 근거를 보여 주고 있었다.
 *
 * ## 왜 이렇게 되나
 *
 * 집계 어댑터(`aggregateToFilingResult`)는 **세율군이 하나뿐이면** 그 군의 값을 싣는다.
 * 그런데 그 군 안에서도 **적용 호가 갈리면**(§104⑤2호 본문) 산출세액은 **버킷별 합계**이고,
 * 엔진은 그 사실을 이렇게 표시한다:
 *   - `appliedRate` = **표시용 최고세율**(`transfer-tax-aggregate-helpers.ts`)
 *   - `progressiveDeduction` = **0** — 「호마다 누진공제가 달라 그룹 단위로 합산 표시할 수 없다」
 * ⇒ 두 값으로 만든 닫힌 산식은 **구조적으로 거짓**이다.
 *
 * 기존 가드는 `appliedRate === 0`(= 세율군 2개 이상)일 때만 발동했다. **세율군이 하나면
 * 그 가드를 통과**해 거짓 산식이 그대로 인쇄됐다 — 가드가 「단일 세율이 없다」의 **대리 지표**를
 * 썼고, 그 대리가 이 경우를 못 덮었다.
 */
import { describe, it, expect } from "vitest";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";
import type { AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { aggregateReductions } from "@/lib/tax-engine/transfer-tax-aggregate-reduction-step";
import type { CalculationStep } from "@/lib/tax-engine/types/transfer.types";

/** 제보 화면의 수치 그대로 — 세율군 1개, 내부 호 2개(누진공제 합산 불가) */
function reportedResult(over: Partial<TransferTaxResult> = {}): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: 500_000_000,
    taxableGain: 500_000_000,
    longTermHoldingDeduction: 0,
    longTermHoldingRate: 0,
    basicDeduction: 2_500_000,
    taxBase: 399_400_000,
    appliedRate: 0.38,
    progressiveDeduction: 0,
    calculatedTax: 133_820_000,
    reductionAmount: 0,
    determinedTax: 133_820_000,
    penaltyTax: 0,
    localIncomeTax: 13_382_000,
    ruralSurtax: 0,
    totalTax: 147_202_000,
    steps: [],
    ...over,
  } as unknown as TransferTaxResult;
}

const meta = (): AggregateMeta =>
  ({
    properties: [
      { propertyId: "p1", label: "양도 1번" },
      { propertyId: "p2", label: "양도 2번" },
    ],
    // 명세서 7단계(농특세·지방세)가 집계 원본을 직접 읽는다
    aggregated: { ruralSurtax: 0, localIncomeTax: 13_382_000, properties: [] },
  }) as unknown as AggregateMeta;

function calcFormula(result: TransferTaxResult): string {
  const items = buildStatementItems(result, undefined, undefined, meta(), undefined);
  return String(items.get("calculatedTax")?.formula ?? "");
}

describe("산출세액 근거는 표시된 값을 재현해야 한다", () => {
  it("🔴 닫힌 산식이 값을 재현하지 못하면 그 산식을 쓰지 않는다", () => {
    const f = calcFormula(reportedResult());
    // 종전: "과세표준 × 세율(38%) − 누진공제 0" → 151,772,000 ≠ 133,820,000
    expect(f).not.toMatch(/과세표준 × 세율/);
  });

  /**
   * ⚠️ 처음엔 `/세율|호/`로 썼는데 **닫힌 산식에도 「세율」이 들어 있어** 구별력이 낮았다
   *    (뮤테이션 M1에서 이 단언만 통과). 새 문구에만 있는 표현으로 조인다.
   */
  it("대신 왜 단일 산식으로 못 쓰는지 말한다", () => {
    const f = calcFormula(reportedResult());
    expect(f).toContain("단일 산식으로 표시할 수 없습니다");
    expect(f).toContain("호별 산출세액의 합계");
  });

  it("✅ 닫힌 산식이 값을 재현하면 그대로 쓴다 — 멀쩡한 경우까지 지우지 않는다", () => {
    // 399,400,000 × 38% − 19,940,000 = 131,832,000 (§55 누진공제 정상 반영)
    const ok = reportedResult({
      progressiveDeduction: 19_940_000,
      calculatedTax: 131_832_000,
      determinedTax: 131_832_000,
    });
    const f = calcFormula(ok);
    expect(f).toContain("과세표준 × 세율(38%)");
    expect(f).toContain("19,940,000");
  });

  it("세율군이 2개 이상이면 종전 안내를 유지한다 (appliedRate 0)", () => {
    const f = calcFormula(reportedResult({ appliedRate: 0 }));
    expect(f).toContain("자산별 세율이 서로 달라");
  });

  /**
   * ⚠️ **원인을 추측해 적으면 거짓이 된다.** §104⑤ 비교과세가 **전체 누진**(방법 A)으로
   *    결정된 경우에도 닫힌 산식은 실패한다(그룹 누진공제가 규약상 0이라서). 그때
   *    「적용 호가 둘 이상이라」고 말하면 사실과 다르다 — 엔진 echo(`comparedTaxApplied`)를
   *    읽어 갈라야 한다.
   */
  it("비교과세가 전체 누진으로 결정됐으면 그 사실을 말한다", () => {
    const items = buildStatementItems(
      reportedResult(),
      undefined,
      undefined,
      {
        properties: [{ propertyId: "p1" }, { propertyId: "p2" }],
        aggregated: {
          ruralSurtax: 0,
          localIncomeTax: 0,
          properties: [],
          comparedTaxApplied: "general",
        },
      } as unknown as AggregateMeta,
      undefined,
    );
    const f = String(items.get("calculatedTax")?.formula ?? "");
    expect(f).toContain("전체 과세표준에 누진세율을 적용한 금액");
    expect(f).not.toContain("적용 호가 둘 이상");
  });
});

/**
 * ── 인접 결함 — 감면이 **하나도 없는데** 「유형 미지정 감면만 존재」라고 말했다 ──
 *
 * 같은 카드의 제보 화면: 감면세액 `0`, 근거 「건별 단순합 0 (유형 미지정 감면만 존재)」.
 * 존재하지 않는 것을 존재한다고 서술하는 거짓 문장이다.
 */
describe("감면세액 근거 — 없는 것을 있다고 말하지 않는다", () => {
  function reductionFormula(reductionAmount: number): string {
    const steps: CalculationStep[] = [];
    aggregateReductions({
      assetRecords: [
        {
          result: { isExempt: false, reductionAmount, reductionTypeApplied: undefined },
        },
      ] as never,
      calculatedTax: 133_820_000,
      taxableAfterReduction: [0],
      totalBasicDeduction: 2_500_000,
      taxYear: 2026,
      priorReductionUsage: [],
      steps,
      warnings: [],
    });
    return steps.find((x) => x.label.startsWith("감면세액"))?.formula ?? "";
  }

  it("🔴 감면이 0이면 「유형 미지정 감면만 존재」라고 말하지 않는다", () => {
    expect(reductionFormula(0)).not.toContain("유형 미지정 감면만 존재");
  });

  it("감면이 0이면 없다고 말한다", () => {
    expect(reductionFormula(0)).toContain("감면 없음");
  });

  it("✅ 실제로 유형 미지정 감면이 있으면 종전 문구를 유지한다 — 멀쩡한 경우를 지우지 않는다", () => {
    const f = reductionFormula(5_000_000);
    expect(f).toContain("유형 미지정 감면만 존재");
    expect(f).toContain("5,000,000");
  });
});
