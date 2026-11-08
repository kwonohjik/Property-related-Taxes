/**
 * 기준시가 조회 입력(`HousingStdPriceLookupField`) — 검증 오류를 누르면 **금액 칸**에 커서가 간다.
 *
 * 종전에는 `data-field` 앵커가 「공시가격 연도 + 기준시가」 묶음 루트에 있어, 이동 로직(`validation-jump.ts`)이 앵커 안 첫 포커스 요소인
 * 「공시가격 연도」 선택으로 커서를 보냈다(2026-11-08 브라우저 확인 — §98의8 「취득시 기준시가를 입력하세요」를 눌렀을 때).
 * 앵커를 금액 칸에 다는 `LandPriceLookupField`와 같은 규약으로 맞췄다.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, it, expect } from "vitest";
import { HousingStdPriceLookupField } from "@/components/calc/inputs/HousingStdPriceLookupField";
import { jumpToIssueField } from "@/components/calc/transfer/validation-jump";
import { CompanionSaleModeBlock } from "@/components/calc/transfer/CompanionSaleModeBlock";

beforeAll(() => {
  // jsdom에는 레이아웃이 없다 — 보이는 후보로 치고 스크롤은 무시한다
  Object.defineProperty(HTMLElement.prototype, "checkVisibility", { configurable: true, value: () => true });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} });
});
afterEach(() => cleanup());

const KEY = "reduction.unsold_98_8.standardPriceAtAcquisition";

describe("HousingStdPriceLookupField — 입력칸 이동", () => {
  it("오류를 누르면 공시가격 연도 선택이 아니라 기준시가 금액 칸에 커서", () => {
    render(
      <HousingStdPriceLookupField
        label="취득시 기준시가"
        data-field={KEY}
        value=""
        onChange={() => {}}
        jibun="서울특별시 강남구 역삼동 1-1"
        referenceDate="2015-07-01"
        testidPrefix="t"
      />,
    );
    expect(jumpToIssueField({ field: KEY, message: "취득시 기준시가를 입력하세요" } as never)).toBe(true);
    const amount = screen.getByTestId("t-price-input").querySelector("input");
    expect(amount).not.toBeNull();
    expect(document.activeElement).toBe(amount);
    expect(screen.getByTestId("t-year-select").contains(document.activeElement)).toBe(false);
  });

  it("앵커는 화면에 하나뿐이다 — 묶음 루트와 금액 칸에 이중으로 달지 않는다", () => {
    const { container } = render(
      <HousingStdPriceLookupField label="양도시 기준시가" data-field={KEY} value="" onChange={() => {}} referenceDate="2026-07-01" testidPrefix="t" />,
    );
    expect(container.querySelectorAll(`[data-field="${KEY}"]`)).toHaveLength(1);
  });
});

/**
 * 자산 카드 ② 양도정보의 「양도시 기준시가」(`CompanionSaleModeBlock` — `StandardPriceInput`)도 같은 결함이었다:
 * 블록이 위젯 전체를 `<div data-field="standardPriceAtTransfer">`로 감싸 오류를 누르면 연도 선택(native select)으로 커서가 갔다
 * (2026-11-08 브라우저 확인). 앵커를 `StandardPriceInput`의 `data-field`(금액 칸)로 넘긴다.
 */
describe("CompanionSaleModeBlock 양도시 기준시가 — 입력칸 이동", () => {
  const noop = () => {};
  const renderBlock = (assetKind: "housing" | "land") =>
    render(
      <CompanionSaleModeBlock
        assetKind={assetKind}
        bundledSaleMode="apportioned"
        actualSalePrice="" onActualSalePriceChange={noop}
        standardPriceAtTransfer="" onStandardPriceAtTransferChange={noop}
        transferDate="2024-03-01" contractTotalPrice="1000000000"
        standardPricePerSqmAtTransfer="" onStandardPricePerSqmAtTransferChange={noop} transferArea="" onTransferAreaChange={noop}
      />,
    );
  const jump = () => jumpToIssueField({ field: "standardPriceAtTransfer", message: "양도시 기준시가를 입력하세요" } as never);
  const focusedLabel = () => (document.activeElement?.closest("[data-field]")?.querySelector("label")?.textContent ?? "").trim();

  it("주택(총액 입력): 연도 선택이 아니라 기준시가 총액 칸에 커서 · 앵커 1개", () => {
    const { container } = renderBlock("housing");
    expect(container.querySelectorAll('[data-field="standardPriceAtTransfer"]')).toHaveLength(1);
    expect(jump()).toBe(true);
    expect((document.activeElement as HTMLElement).tagName).toBe("INPUT");
    expect(container.querySelector("select")?.contains(document.activeElement) ?? false).toBe(false);
  });

  it("토지(단가 × 면적): 사용자가 넣는 ㎡당 단가 칸에 커서(총액은 자동 계산)", () => {
    const { container } = renderBlock("land");
    expect(jump()).toBe(true);
    expect((document.activeElement as HTMLElement).tagName).toBe("INPUT");
    expect(focusedLabel()).toMatch(/㎡당 단가/);
    expect(container.querySelector("select")?.contains(document.activeElement) ?? false).toBe(false);
  });
});
