/**
 * anchor — **§97②2호 단서 swap 시 취득가액 행에 「미차감」 고지** N-5(좁힌 잔여).
 *
 * 계획서: `docs/00-pm/transfer-f16-spinoff-items.plan.md` §N-5
 *
 * ## 🔴 원 주장은 기각됐다 (2026-08-23 실측)
 *
 * 「환산취득가액이 양도차익에서 차감되지 않는데 **표시 열은 환산 재산식을 그린다**」가
 * 원 기재였는데, **양도차익 산식은 정확했다**. 엔진 step이 swap 시
 * `양도가(1,000,000,000 - 필요경비(자본적지출+양도비 400,000,000`로 적어
 * 취득가액을 빼지 않음을 **명시**한다(대조군은 `- 취득가(환산 … - 경비(개산공제 …`).
 * 메인 결과뷰에도 swap 고지 카드가 이미 있다(`TransferTaxResultView.tsx`).
 *
 * ## 남은 좁은 갭 — 이것만 고쳤다
 *
 * 상세명세서(신고서 서식) **취득가액 행**은 `usedEstimatedAcquisition`이면 swap 여부와
 * 무관하게 환산 산식을 인쇄했다. 세 행이 나란히 놓이면 산술이 안 맞아 보인다:
 *
 *   취득가액 100,000,000 · 필요경비 400,000,000 · 양도차익 600,000,000
 *   → 10억 − 1억 − 4억 = 5억 ≠ 6억
 *
 * ⇒ 취득가액 행에 **차감 제외 사실만** 덧붙인다. 산식 자체는 건드리지 않는다
 *   (환산취득가액은 실재하는 값이고, 나목 채택 여부와 별개로 §97②2호 가목의 구성요소다).
 */
import { describe, it, expect } from "vitest";
import { buildAcquisitionPriceFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";

/** 환산 모드 결과의 최소 형태 — 산식 빌더가 읽는 필드만. */
const result = (over: Partial<TransferTaxResult> = {}) =>
  ({
    usedEstimatedAcquisition: true,
    estimatedBase: 100_000_000,
    estimatedStdPriceAtAcquisition: 50_000_000,
    estimatedStdPriceAtTransfer: 500_000_000,
    swapApplied: false,
    ...over,
  }) as TransferTaxResult;

/** ReactNode(Frac 포함)를 문자열로 눌러 담는다 — 문구 존재만 본다. */
function flatten(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? flatten(props.children) : "";
}

const NOTE = "§97②2호 단서 적용";

describe("N5 — swap 시 취득가액 행 미차감 고지", () => {
  it("N5-01: swap 미발동이면 고지가 없다 (대조군 — 노이즈 방지)", () => {
    const f = flatten(buildAcquisitionPriceFormula(result(), false, 1_000_000_000, 0, 0));
    expect(f).toContain("환산취득가");
    expect(f).not.toContain(NOTE);
  });

  it("N5-02: 🔴 swap 발동이면 「차감되지 않습니다」를 명시한다", () => {
    const f = flatten(
      buildAcquisitionPriceFormula(result({ swapApplied: true }), false, 1_000_000_000, 0, 0),
    );
    expect(f).toContain(NOTE);
    expect(f).toContain("차감되지 않습니다");
    // 환산 산식 자체는 그대로 남는다 — 값이 사라지면 신고서 칸이 비어 보인다.
    expect(f).toContain("환산취득가");
  });

  it("N5-03: 기준시가가 없어 산식을 못 그리는 경로에도 고지가 붙는다", () => {
    const f = flatten(
      buildAcquisitionPriceFormula(
        result({
          swapApplied: true,
          estimatedStdPriceAtAcquisition: undefined,
          estimatedStdPriceAtTransfer: undefined,
        }),
        false,
        1_000_000_000,
        0,
        0,
      ),
    );
    expect(f).toContain("취득가액(추계)");
    expect(f).toContain(NOTE);
  });

  it("N5-04: 실가 모드는 swap과 무관하게 고지가 없다", () => {
    const f = flatten(
      buildAcquisitionPriceFormula(
        result({ usedEstimatedAcquisition: false, swapApplied: true }),
        false,
        1_000_000_000,
        300_000_000,
        0,
      ),
    );
    expect(f).toContain("실제 거래가액");
    expect(f).not.toContain(NOTE);
  });
});
