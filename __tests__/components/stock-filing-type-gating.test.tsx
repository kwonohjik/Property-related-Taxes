/**
 * @vitest-environment jsdom
 *
 * ④ 신고 유형 — §105① 예정신고 대상 게이팅 (Step3 진입점)
 *
 * 🔴 종전 Step3은 `marketType` 분기 없이 **모든 종목에** 「예정신고 — 반기 말일 +2개월
 *    (§105①2호)」을 제시하고 기한까지 계산해 줬다. 법문은 §105① 본문 괄호로
 *    **§94①3호다목(국외주식)을 제외**하고, 기타자산(§94①4호)에는 **1호(달의 말일 +2개월)**를
 *    적용한다.
 *
 * 🔑 순수 함수(`stock-filing-type.ts`)가 아니라 **Step3을 렌더**한다 — 헬퍼만 테스트하면
 *    「배선됐는가」를 검증하지 못한다(`feedback_leaf_anchor_skips_zod_layer`의 UI 판).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    transferDate: "2025-03-15",
    filingType: "preliminary",
    ...o,
  };
}

describe("FG-1 국외주식만인 신고 — 예정신고 선택지를 만들지 않는다", () => {
  it("FG-1-1: 예정신고 라디오가 없다", () => {
    render(<Step3 form={form({ marketType: "foreign_stock" })} onChange={() => {}} />);
    expect(screen.queryByText("예정신고")).toBeNull();
  });

  it("FG-1-2: 제외 사유(§105① 본문 괄호·다목)를 말한다", () => {
    render(<Step3 form={form({ marketType: "foreign_stock" })} onChange={() => {}} />);
    expect(screen.getByText(/국외주식은 예정신고 대상이 아닙니다/)).toBeTruthy();
    expect(screen.getByText(/제94조제1항제3호다목/)).toBeTruthy();
  });

  it("FG-1-3: 확정신고·수정신고는 그대로 있다 — 섹션을 통째로 숨기지 않는다", () => {
    render(<Step3 form={form({ marketType: "foreign_stock" })} onChange={() => {}} />);
    expect(screen.getByText("확정신고")).toBeTruthy();
    expect(screen.getByText("수정신고")).toBeTruthy();
  });

  it("FG-1-4: 저장값이 preliminary여도 예정신고 기한 상자를 띄우지 않는다", () => {
    render(<Step3 form={form({ marketType: "foreign_stock" })} onChange={() => {}} />);
    expect(screen.queryByText(/예정신고 기한 자동 계산/)).toBeNull();
  });
});

describe("FG-2 🔑 양성 대조군 — 국내 종목이 있으면 예정신고가 살아 있다", () => {
  it("FG-2-1: 국내주식 단독이면 예정신고가 보인다", () => {
    render(<Step3 form={form({ marketType: "kospi" })} onChange={() => {}} />);
    expect(screen.getByText("예정신고")).toBeTruthy();
    expect(screen.queryByText(/국외주식은 예정신고 대상이 아닙니다/)).toBeNull();
  });

  it("FG-2-2: ⭐ 혼합 신고 — 편집 중인 종목이 국외여도 **저장된 국내 종목** 때문에 예정신고가 남는다", () => {
    render(
      <Step3
        form={form({ marketType: "foreign_stock" })}
        savedItems={[form({ marketType: "kospi" })]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("예정신고")).toBeTruthy();
    expect(screen.queryByText(/국외주식은 예정신고 대상이 아닙니다/)).toBeNull();
  });

  it("FG-2-3: 그 혼합 신고에서는 기한 상자 대신 사유를 적는다 (이 종목은 국외라 기한이 없다)", () => {
    render(
      <Step3
        form={form({ marketType: "foreign_stock" })}
        savedItems={[form({ marketType: "kospi" })]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/지금 편집 중인 종목은 국외주식이라/)).toBeTruthy();
  });

  it("FG-2-4: 저장 종목도 전부 국외면 다시 제외된다", () => {
    render(
      <Step3
        form={form({ marketType: "foreign_stock" })}
        savedItems={[form({ marketType: "foreign_stock" })]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText("예정신고")).toBeNull();
  });
});

describe("FG-3 §105① 호가 갈린다 — 기타자산은 1호(달), 국내주식은 2호(반기)", () => {
  /**
   * 🔴 G-25 이후 기한 날짜는 **한 화면에 두 곳**에 나온다 — §4 「예정신고 기한 자동 계산」
   * 상자와 §5 「법정납부기한」 hint. 둘은 같은 leaf(`calcPreliminaryDeadline`)를 쓰므로
   * **반드시 같은 날짜**여야 한다. 종전에는 hint가 규칙을 따로 서술해 주식에도
   * §105①1호(달의 말일)를 제시했고, 그래서 같은 화면이 서로 다른 기한을 말했다.
   *
   * ⇒ 「1개만 있다」가 아니라 **「전부 같은 날짜다」**를 단언한다.
   */
  function expectDeadlineEverywhere(date: RegExp) {
    const hits = screen.getAllByText(date);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    return hits;
  }

  it("FG-3-1: 국내주식 2025-03-15 → 반기 말일 +2개월 = 2025-08-31 (§105①2호)", () => {
    render(<Step3 form={form({ marketType: "kospi" })} onChange={() => {}} />);
    expect(screen.getByText(/§105①2호/)).toBeTruthy();
    expectDeadlineEverywhere(/2025-08-31/);
    // §5 hint가 1호(달의 말일 = 2025-05-31)를 제시하던 종전 결함의 직접 반증
    expect(screen.queryByText(/2025-05-31/)).toBeNull();
  });

  it("FG-3-2: ⭐ 기타자산 같은 날짜 → 달의 말일 +2개월 = 2025-05-31 (§105①1호)", () => {
    render(<Step3 form={form({ marketType: "other_asset" })} onChange={() => {}} />);
    expect(screen.getByText(/§105①1호/)).toBeTruthy();
    expectDeadlineEverywhere(/2025-05-31/);
    expect(screen.queryByText(/2025-08-31/)).toBeNull();
  });

  it("FG-3-3: 🔴 G-25 — 국외주식은 §5 hint도 예정신고 기한을 제시하지 않는다", () => {
    render(<Step3 form={form({ marketType: "foreign_stock" })} onChange={() => {}} />);
    expect(screen.queryByText(/예정신고 기한 2025-/)).toBeNull();
    expect(screen.getByText(/확정신고 기한은 다음 해 5월 31일/)).toBeTruthy();
  });
});
