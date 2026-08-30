/**
 * @vitest-environment jsdom
 *
 * anchor: 해외주식 ⑤ — 중소기업 토글 (§104①12호가목 10%)
 *
 * ## 무엇을 잡는가
 *
 * 엔진에 10% 분기를 넣어도 **입력 경로가 없으면 no-op**이다
 * (memory `feedback_api_trigger_without_input_path_is_noop`).
 * 해외주식을 고르면 Step1이 `CompanyTypeBlock`(국내 중소기업 선택)을 건너뛰고 early return하므로,
 * 이 토글이 유일한 입력 경로다.
 *
 * ## 노출 범위가 정확해야 한다
 *
 * 영 §157의3은 국외주식을 두 호로 나눈다 — 1호 **외국법인** 발행 / 2호 **내국법인** 발행으로서
 * 해외 증권시장 상장. 「중소기업」은 영 §157의2①이 「중소기업기본법」 §2로 위임받으므로
 * **2호에만** 닿는다. 1호에 토글을 노출하면 근거 없는 10%가 붙는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { ForeignStockBlock } from "@/components/calc/stock-transfer/ForeignStockBlock";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

function block(patch: Partial<StockTransferFormData>, onChange = () => {}) {
  const form = {
    ...createInitialStockFormData(),
    marketType: "foreign_stock",
    ...patch,
  } as StockTransferFormData;
  return render(<ForeignStockBlock form={form} onChange={onChange} />);
}

const smeToggle = () => screen.queryByText(/중소기업 \(§104①12호가목/);

describe("FG-SME-UI — 중소기업 토글 노출 범위", () => {
  it("FG-SME-UI-1: 2호(내국법인 해외상장)면 토글이 보인다", () => {
    block({ isListedForeignCorp: false });
    expect(smeToggle()).not.toBeNull();
  });

  it("FG-SME-UI-2: 1호(외국법인 발행)면 토글이 없다 — 중소기업기본법 §2 미적용", () => {
    block({ isListedForeignCorp: true });
    expect(smeToggle()).toBeNull();
  });

  it("FG-SME-UI-3: 1호로 되돌리면 중소기업 선택을 함께 지운다 (stale 10% 차단)", () => {
    const onChange = vi.fn();
    block({ isListedForeignCorp: false, isSmallMediumEnterprise: true }, onChange);
    // ToggleCard는 Switch를 쓴다 — 카드 제목에서 올라가 그 카드의 스위치를 찾는다.
    const label = screen.getByText("외국법인 발행 주식");
    let node: HTMLElement | null = label;
    let sw: Element | null = null;
    while (node && !sw) {
      sw = node.querySelector('[role="switch"]');
      node = node.parentElement;
    }
    expect(sw).not.toBeNull();
    fireEvent.click(sw!);
    const patch = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(patch.isListedForeignCorp).toBe(true);
    expect(patch.isSmallMediumEnterprise).toBe(false);
  });
});
