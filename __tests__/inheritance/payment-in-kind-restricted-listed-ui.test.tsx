/**
 * UI anchor — 물납 「최초상장 + 처분제한」 토글 (상증령 §74①2호가목 단서)
 *
 * ## 🔑 엔진 anchor로는 이 층을 못 잡는다
 *
 * `payment-in-kind-restricted-listed.anchor.test.ts`는 `isNewlyListedDisposalRestricted`가
 * **이미 켜진 EstateItem**을 직접 만들어 넣는다. 그러니 **입력 경로가 없어도 통과**한다 —
 * 「API 트리거만 열고 입력 UI가 없으면 세액 변화 0」의 전형
 * ([[feedback_api_trigger_without_input_path_is_noop]]).
 *
 * 그래서 여기서 **토글이 실제로 렌더되고 그 값을 쓰는지**를 본다.
 *
 * ## 노출 조건
 *
 * · 상속(`mode: "inheritance"`) — 물납은 상속세 제도다
 * · **상장주식**(`listed_stock`) 한정 — 비상장은 §74①2호**나목**(5순위)이라 축이 다르다
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { EstateCommonAttributesSection } from "@/components/calc/inheritance/EstateCommonAttributesSection";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

afterEach(() => cleanup());

function makeItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "stock-1",
    category: "listed_stock",
    name: "보호예수 주식",
    marketValue: 500_000_000,
    ...overrides,
  } as EstateItem;
}

const TITLE = /최초상장 \+ 처분제한/;

function renderSection(item: EstateItem, onUpdate: (i: EstateItem) => void = () => {}) {
  return render(
    <EstateCommonAttributesSection
      item={item}
      onUpdate={onUpdate}
      mode="inheritance"
      deathDate="2024-06-10"
      effectiveValuation={500_000_000}
    />,
  );
}

describe("물납 처분제한 상장 토글 — 노출·동작", () => {
  it("상속 + 상장주식 → 토글이 보인다", () => {
    renderSection(makeItem());
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it("🔑 켜면 isNewlyListedDisposalRestricted가 실제로 쓰인다", () => {
    let captured: EstateItem | undefined;
    renderSection(makeItem(), (i) => {
      captured = i;
    });
    fireEvent.click(screen.getByRole("switch", { name: TITLE }));
    expect(captured?.isNewlyListedDisposalRestricted).toBe(true);
  });

  it("증여 모드에는 없다 — 물납은 상속세 제도다 (양성 대조군)", () => {
    render(
      <EstateCommonAttributesSection
        item={makeItem()}
        onUpdate={() => {}}
        mode="gift"
        deathDate="2024-06-10"
        effectiveValuation={500_000_000}
      />,
    );
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it("비상장주식에는 없다 — §74①2호나목(5순위)으로 축이 다르다 (양성 대조군)", () => {
    renderSection(makeItem({ category: "unlisted_stock" }));
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });
});
