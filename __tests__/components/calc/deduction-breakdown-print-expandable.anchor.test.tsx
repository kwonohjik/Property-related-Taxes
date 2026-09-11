/**
 * anchor: 상속공제 상세 **카드 8개**가 접혀 있어도 인쇄물에는 나온다 (별건 정리 2026-09-11).
 *
 * ## 무엇이 결함이었나
 *
 * 조건부 렌더(`{open && …}`)는 DOM 자체를 만들지 않으므로 `print:` 유틸리티가 붙을 대상이
 * 없다. 접힌 카드는 **종이에서 통째로 사라졌다**.
 *
 * 바깥 섹션(`DeductionBreakdownSection`)은 IG-148 에서 이미 같은 이유로 CSS 토글로 바꿨지만,
 * **그 안의 카드 8개(9곳)는 남아 있었다** — 그래서 섹션이 인쇄에서 펼쳐져도 개별 카드는
 * 헤더 행만 나왔다. 「어느 층을 고쳤다」가 「그 층이 소비된다」와 다른 사례다
 * ([[feedback_fixed_layer_vs_consumed_layer]]).
 *
 * ## 무엇을 재는가
 *
 * 소스 문자열이 아니라 **DOM**을 잰다 — 접힌 상태에서 상세 행의 텍스트가 존재하고, 그 조상이
 * `hidden print:block`을 달고 있는지. 래퍼를 지우면(조건부 렌더로 되돌리면) 텍스트가 아예
 * 없어져 실패한다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { calcInheritanceTax } from "@/lib/tax-engine/inheritance-tax";
import { DeductionBreakdownSection } from "@/components/calc/results/deduction-breakdown/DeductionBreakdownSection";
import { PrintExpandable } from "@/components/calc/results/deduction-breakdown/shared";
import { PersonalDeductionDetailCard } from "@/components/calc/results/deduction-breakdown/PersonalDeductionDetailCard";
import {
  EXAMPLE_INPUT,
  EXAMPLE_HEIRS,
  EXAMPLE_ESTATE_ITEMS,
  EXAMPLE_DEBT_ITEMS,
  DEATH_DATE,
} from "../../tax-engine/inheritance/fixtures/comprehensive-case-pdf.fixture";

afterEach(cleanup);

const PRINT_CLS = "hidden print:block";

/** 요소부터 조상으로 올라가며 인쇄 래퍼를 찾는다. */
function hasPrintWrapperAncestor(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.className && typeof cur.className === "string") {
      const c = cur.className;
      if (c.includes("hidden") && c.includes("print:block")) return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

describe("[PE-A] PrintExpandable — 접혀도 DOM 에 남는다", () => {
  it("A-1: open=false 면 hidden print:block 이 붙되 자식은 살아 있다", () => {
    const { container } = render(
      <PrintExpandable open={false}>
        <span>공제 상세 본문</span>
      </PrintExpandable>,
    );
    expect(screen.getByText("공제 상세 본문")).toBeTruthy();
    expect(container.firstElementChild?.className).toBe(PRINT_CLS);
  });

  it("A-2: open=true 면 클래스가 비고 자식은 그대로", () => {
    const { container } = render(
      <PrintExpandable open>
        <span>공제 상세 본문</span>
      </PrintExpandable>,
    );
    expect(container.firstElementChild?.className).toBe("");
  });
});

describe("[PE-B] 카드 8개 — 전부 접힌 초기 상태에서 상세가 DOM 에 있다", () => {
  const result = calcInheritanceTax(EXAMPLE_INPUT);

  function renderSection() {
    return render(
      <DeductionBreakdownSection
        result={result}
        estateItems={EXAMPLE_ESTATE_ITEMS}
        debtItems={EXAMPLE_DEBT_ITEMS}
        heirs={EXAMPLE_HEIRS}
        deathDate={DEATH_DATE}
      />,
    );
  }

  /**
   * 카드별 상세 본문에만 나오는 문자열 — 헤더(trigger) 행에는 없는 것을 골랐다.
   * 하나라도 트리거 행과 겹치면 래퍼를 지워도 통과해 **구별력이 0이 된다**.
   */
  const DETAIL_MARKERS: Array<[string, RegExp]> = [
    ["일괄공제", /기초공제 \(§18①\)/],
    ["배우자공제", /법정상속분 산정/],
    ["가업상속공제", /가업상속공제 직접 입력 모드/],
    ["영농상속공제", /요건 미평가/],
    ["금융재산공제", /순금융재산/],
    ["동거주택공제", /동거주택 공시가격/],
    ["공제한도(§24)", /§24 한도 산정/],
  ];

  /**
   * ⚠️ 커버리지 한계를 **명시한다** — 이 격자는 일괄공제가 선택돼(`chosenMethod === "lump_sum"`)
   *    `PersonalDeductionDetailCard`가 애초에 렌더되지 않는다(섹션의 3항 분기). 그 카드는
   *    아래 [PE-C]에서 **직접 렌더**해 따로 덮는다. 조용히 빼면 「8개 다 덮었다」가 된다.
   */

  it("B-0: 대조군 — 섹션 자체는 렌더되고 카드 헤더가 보인다", () => {
    renderSection();
    expect(screen.getByTestId("deduction-breakdown-section")).toBeTruthy();
    expect(screen.getAllByText(/일괄공제/).length).toBeGreaterThan(0);
  });

  for (const [name, marker] of DETAIL_MARKERS) {
    it(`B-${name}: 접힌 채로도 상세 문구가 DOM 에 있고 인쇄 래퍼 안에 있다`, () => {
      const { container } = renderSection();
      const hit = [...container.querySelectorAll("*")].find(
        (el) => el.children.length === 0 && marker.test(el.textContent ?? ""),
      );
      expect(hit, `${name}: 상세 문구가 DOM 에 없다 — 조건부 렌더로 되돌아갔다`).toBeTruthy();
      expect(
        hasPrintWrapperAncestor(hit!),
        `${name}: 상세가 인쇄 래퍼(${PRINT_CLS}) 안에 있지 않다`,
      ).toBe(true);
    });
  }
});

// ════════════════════════════════════════════════════
// C. 인적공제 카드 — 위 격자에서 렌더되지 않아 직접 덮는다
// ════════════════════════════════════════════════════

describe("[PE-C] PersonalDeductionDetailCard — 접혀도 DOM 에 남는다", () => {
  const detail = {
    childCount: 2,
    childDeduction: 100_000_000,
    minorPerHeir: [],
    minorDeduction: 0,
    elderCount: 0,
    elderDeduction: 0,
    disabledPerHeir: [],
    disabledDeduction: 0,
    total: 100_000_000,
  };

  it("C-1: 접힌 초기 상태에서 자녀공제 행이 인쇄 래퍼 안에 있다", () => {
    const { container } = render(
      <PersonalDeductionDetailCard
        detail={detail}
        triggerLabel="그 밖의 인적공제 (§20)"
        triggerValue="100,000,000"
        deathDate="2023-03-05"
      />,
    );
    const hit = [...container.querySelectorAll("*")].find(
      (el) => el.children.length === 0 && /자녀공제/.test(el.textContent ?? ""),
    );
    expect(hit, "자녀공제 행이 DOM 에 없다 — 조건부 렌더로 되돌아갔다").toBeTruthy();
    expect(hasPrintWrapperAncestor(hit!)).toBe(true);
  });
});

// ════════════════════════════════════════════════════
// D. divide-y 겹선 가드 — CSS 로 접으면 마지막 헤더가 :last-child 를 잃는다
// ════════════════════════════════════════════════════

describe("[PE-D] 접힘 상태의 마지막 1px 선을 만들지 않는다", () => {
  const result = calcInheritanceTax(EXAMPLE_INPUT);

  /**
   * Tailwind v4 의 `divide-y` 는 `:where(.divide-y > :not(:last-child))` 라
   * **`display:none` 을 건너뛰지 않는다**(v4.3.3 생성 CSS 실측). 상세를 언마운트하지 않게
   * 바꾸면 마지막 헤더 뒤에 숨은 래퍼가 붙어 헤더가 `:last-child`를 잃고, 박스 자체 테두리
   * 바로 위에 겹선이 생긴다.
   *
   * jsdom 은 Tailwind CSS 를 계산하지 않으므로 **그 선을 직접 잴 수 없다.** 대신 겹선이
   * 성립하는 **구조 조건**(D-1)과 그것을 막는 **가드의 존재**(D-2)를 함께 단언한다 —
   * 구조가 바뀌어 조건이 사라지면 D-1 이 먼저 알려 준다.
   */
  it("D-1: 구조 전제 — divide-y 의 마지막 자식이 «숨겨진» 래퍼다", () => {
    const { container } = render(
      <DeductionBreakdownSection
        result={result}
        estateItems={EXAMPLE_ESTATE_ITEMS}
        debtItems={EXAMPLE_DEBT_ITEMS}
        heirs={EXAMPLE_HEIRS}
        deathDate={DEATH_DATE}
      />,
    );
    const dv = container.querySelector(".divide-y");
    const last = dv?.lastElementChild;
    expect(last?.className).toContain(PRINT_CLS);
  });

  it("D-2: 그래서 컨테이너가 「마지막 앞 자식 + 뒤가 숨김」 규칙을 달고 있다", () => {
    const { container } = render(
      <DeductionBreakdownSection
        result={result}
        estateItems={EXAMPLE_ESTATE_ITEMS}
        debtItems={EXAMPLE_DEBT_ITEMS}
        heirs={EXAMPLE_HEIRS}
        deathDate={DEATH_DATE}
      />,
    );
    const dv = container.querySelector(".divide-y");
    expect(
      dv?.className,
      "divide-y 컨테이너에서 겹선 가드가 사라졌다 — 접힘 상태 마지막 헤더에 1px 선이 생긴다",
    ).toContain("[&>*:nth-last-child(2):has(+.hidden)]:border-b-0");
  });
});
