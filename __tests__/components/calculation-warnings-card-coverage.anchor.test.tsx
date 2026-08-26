/**
 * @vitest-environment jsdom
 *
 * anchor — 「확인이 필요한 사항」이 **집계 결과뷰 둘에서 통째로 사라졌다** (R-5 파생)
 *
 * ## 🔴 두 층이 함께 비어 있었다 (2026-08-26 실측)
 *
 * 1. **엔진** — `transfer-tax-aggregate.ts`의 `computeAggregateOnce`가 `warnings` 배열을
 *    선언만 하고 **한 번도 채우지 않았다**(`warnings.push` 0건). 단건 엔진이 낸 §89② 판정
 *    불가 안내·§155⑦3호 귀농 사후관리·§156의2⑬ 추징 경고가 전부 버려졌다.
 * 2. **표시** — `MultiTransferTaxResultView`·`BundledAllocationCard` 어느 쪽도 `warnings`를
 *    참조하지 않았다(각 0건). 단건 뷰에만 카드가 있었다.
 *
 * ⇒ 한쪽만 고치면 no-op이다(memory `feedback_api_trigger_without_input_path_is_noop`).
 *
 * ## ⛔ 뷰마다 카드를 따로 만들지 말 것
 *
 * F42가 같은 실패를 기록했다 — 다건 전용 렌더러를 새로 두면 공용 컴포넌트만 검사하는
 * 동기화 가드를 빠져나가 같은 침묵 누락이 재발한다. **공용 leaf 재사용이 정답**이다.
 * 그래서 이 anchor는 세 소비자가 모두 `CalculationWarningsCard`를 **참조하는지** 검사한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { CalculationWarningsCard } from "@/components/calc/results/shared/CalculationWarningsCard";

afterEach(cleanup);

describe("공용 leaf 동작", () => {
  it("경고가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(<CalculationWarningsCard warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("undefined도 안전하다 (집계 결과가 아직 이 필드를 안 실을 수 있다)", () => {
    const { container } = render(<CalculationWarningsCard />);
    expect(container.firstChild).toBeNull();
  });

  it("★ 경고를 항목별로 그린다", () => {
    render(<CalculationWarningsCard warnings={["[주 자산] 첫째", "[컴패니언] 둘째"]} />);
    expect(screen.getByText("확인이 필요한 사항")).toBeTruthy();
    expect(screen.getByText("[주 자산] 첫째")).toBeTruthy();
    expect(screen.getByText("[컴패니언] 둘째")).toBeTruthy();
  });
});

/**
 * 소스 참조 검사 — 렌더 픽스처가 무거운 뷰라 F42 전례대로 소스를 직접 본다.
 * 뷰가 자체 카드를 인라인으로 다시 만들면 이 검사는 통과하지만, 그 경우를 막는 것이
 * 아래 「인라인 재작성 금지」 검사다.
 */
describe("★ 세 소비자가 모두 공용 leaf를 쓴다", () => {
  const VIEWS = [
    "components/calc/results/TransferTaxResultView.tsx",
    "components/calc/results/MultiTransferTaxResultView.tsx",
    "components/calc/results/BundledAllocationCard.tsx",
  ];

  it("`CalculationWarningsCard`를 import하고 렌더한다", () => {
    for (const v of VIEWS) {
      const src = readFileSync(v, "utf8");
      expect(src, `${v} import`).toContain("CalculationWarningsCard");
      expect(src, `${v} 렌더`).toContain("<CalculationWarningsCard");
    }
  });

  /**
   * ⚠️ 이 규칙은 **주석에도 걸린다** — 실제로 처음에 `BundledAllocationCard`의 배치 주석이
   *    그 문구를 인용해 스스로 위반했다(memory: 감사 파일 자신이 규칙을 위반하는 전형).
   *    소비자 쪽 주석은 문구를 인용하지 말고 「경고 카드」처럼 풀어 쓸 것.
   */
  it("⛔ 문구를 인라인으로 다시 쓰지 않는다 — 단일 소스", () => {
    for (const v of VIEWS) {
      expect(readFileSync(v, "utf8"), v).not.toContain("확인이 필요한 사항");
    }
  });
});

/** 엔진이 실제로 채우는지는 route anchor가 본다 — 여기서는 그 지점을 가리키기만 한다. */
describe("엔진 쪽 안전망", () => {
  it("집계 엔진이 단건 warnings를 모은다", () => {
    const src = readFileSync("lib/tax-engine/transfer-tax-aggregate.ts", "utf8");
    expect(src).toContain("result.warnings");
    expect(src).toContain("warnings.push");
  });
});
