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
 *
 * ## 🔴 위 결론은 2026-09-15에 뒤집혔다 — 왜 (기록은 지우지 않는다)
 *
 * 계획서: `docs/00-pm/transfer-swap-97-2-display.plan.md`
 *
 * 그 판단은 **`capEx = 0` fixture로만** 검증됐다 — 이 파일의 전건이 `buildAcquisitionPriceFormula`
 * 의 `capEx` 인자에 **0**을 넘긴다. `capEx > 0`이면 행의 **값 자체**가 `estimatedBase + capEx`로
 * 부풀어(`DetailedStatementHelpers` 종전 :284) 고지로 설명되지 않는 **제3의 수**가 된다 —
 * 실측(양도 400,000,000 · 환산 200,000,000 · 개산공제 4,500,000 · 자본적지출 230,000,000):
 * 취득가액 **430,000,000**, 400,000,000 − 430,000,000 − 0 = −30,000,000 ≠ 양도차익 170,000,000.
 * 같은 화면 신고서는 230,000,000이라 **200,000,000 어긋났다**(사용자 제보).
 *
 * ⇒ 산식을 **나목 축**(자본적지출 + 양도비)으로 내리고, 가목(환산취득가액 + 개산공제)은
 *   **비교 근거**로만 남긴다. 「차감하지 않습니다」 고지는 **대상을 환산취득가액으로 특정**해
 *   유지한다 — 종전 문구는 자본적지출까지 가리키는 것처럼 읽혔고, 그것은 **차감된다**.
 *
 * 항등식 축은 형제 anchor가 지킨다:
 *   `__tests__/components/swap-97-2-display-identity.anchor.test.ts`
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

  it("N5-02: 🔴 swap 발동이면 산식이 **나목**이고, 환산취득가액은 비교 근거로만 남는다", () => {
    const f = flatten(
      buildAcquisitionPriceFormula(
        result({
          swapApplied: true,
          expenses: 400_000_000,
          swapComparison: { estimatedSide: 103_000_000, directSide: 400_000_000, chosen: "direct" },
        }),
        false,
        1_000_000_000,
        0,
        400_000_000,
      ),
    );
    expect(f).toContain(NOTE);
    // 값 축 — 취득가액 칸은 나목(자본적지출 + 양도비)이다.
    expect(f).toContain("자본적지출 400,000,000");
    // 🔑 「차감하지 않는다」의 **대상이 환산취득가액으로 특정**된다 (종전 문구는 대상이 모호했다).
    expect(f).toContain("환산취득가액은 차감하지 않습니다");
    // 환산취득가액은 사라지지 않는다 — 가목 비교 근거로 남는다.
    expect(f).toContain("환산취득가액 100,000,000");
    expect(f).toContain("103,000,000");
    // 🔴 그러나 **환산 비율식**은 그리지 않는다 — 값과 어긋나 거짓 등식이 된다.
    expect(f).not.toContain("환산취득가 100,000,000 =");
  });

  it("N5-03: 비교 echo가 없는 경로에서는 없는 수를 지어내지 않는다", () => {
    const f = flatten(
      buildAcquisitionPriceFormula(
        result({
          swapApplied: true,
          expenses: 400_000_000,
          swapComparison: undefined,
          estimatedStdPriceAtAcquisition: undefined,
          estimatedStdPriceAtTransfer: undefined,
        }),
        false,
        1_000_000_000,
        0,
        400_000_000,
      ),
    );
    expect(f).toContain(NOTE);
    expect(f).toContain("자본적지출 400,000,000");
    expect(f).toContain("환산취득가액은 차감하지 않습니다");
    // 비교 수치는 **없으므로 적지 않는다**.
    expect(f).not.toContain("환산취득가액 100,000,000");
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
