/**
 * @vitest-environment jsdom
 *
 * ⑦ 「현재 미지원 항목」 고지 카드 — 개발용 PR 로드맵 카드를 대체한다
 *
 * 계획서: docs/00-pm/stock-transfer-pr3-followup-closeout.plan.md (Phase F · A-4 · Q-2)
 *
 * ## 왜 로드맵 카드를 없애는가
 *
 * `PrRoadmapCard` 의 「PR-3 현재 / 후속 대기」는 **구현 현황과 아무 연결이 없는 하드코딩**이었다.
 * PR-3 본체와 후속 3축이 전부 머지된 뒤에도 화면은 「PR-3 진행 중」이라고 말하고 있었다.
 * 애초에 **내부 PR 번호는 사용자에게 의미가 없다** — 사용자가 알아야 할 것은
 * 「이 계산기가 지금 무엇을 못 하는가」다.
 *
 * ## 이 카드의 규율
 *
 * · 항목은 **실측 근거가 있는 것만** — 「아마 안 될 것」은 넣지 않는다.
 * · 항목이 해소되면 **같은 PR 에서 문구를 지운다** — 안 그러면 이 카드가 다음 stale 표시가 된다
 *   (`PrRoadmapCard` 가 그렇게 됐다).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UnsupportedItemsCard } from "@/components/calc/results/StockTransferTaxResultViewHelpers";
import { STX_CUTOFF_DATE } from "@/lib/tax-engine/data/securities-transaction-tax-rates";

afterEach(cleanup);

describe("UN-1 미지원 항목 고지", () => {
  it("UN-1-1: 증권거래세 커버 시작일을 **STX_CUTOFF_DATE 와 같은 날짜로** 알린다", () => {
    render(<UnsupportedItemsCard />);
    expect(screen.getByText(new RegExp(`${STX_CUTOFF_DATE} 이전`))).toBeTruthy();
  });

  /**
   * 🔴 UN-1-1 의 짝 — 종전 문구(`2021-01-01`)가 **되살아나지 않는지** 본다.
   *
   * UN-1-1 만으로는 부족하다: 상수를 쓰지 않고 두 날짜를 **함께** 적어도 통과한다.
   * 실제로 이 카드는 커버가 2020-04-01 로 확대된 뒤에도 `2021-01-01` 을 그대로 들고 있었다.
   */
  it("UN-1-1b: 확대 전 커버 시작일(2021-01-01)을 더 이상 말하지 않는다", () => {
    const { container } = render(<UnsupportedItemsCard />);
    expect(container.textContent).not.toMatch(/2021-01-01/);
  });

  it("UN-1-2: 국외전출세 기준환율을 알린다", () => {
    render(<UnsupportedItemsCard />);
    // 제목·본문 양쪽에 나오므로 개수로 본다
    expect(screen.getAllByText(/기준환율/).length).toBeGreaterThan(0);
  });

  /**
   * 🔴 종전 UN-1-2 는 기준환율과 보유현황 신고서를 **한 항목에서 함께** 단언했다.
   * 보유현황 서식이 구현돼 고지를 지울 때 그 단언을 통째로 지웠다면 **기준환율 안전망까지
   * 사라졌을 것**이다(메모리 `feedback_shared_assertion_reversal_erases_sibling_net`).
   * ⇒ 둘을 갈라 두고, 지워진 쪽은 **반전 anchor** 로 남긴다.
   *
   * 짝(「실제로 구현됐다」): `__tests__/components/exit-tax-holding-report-form.test.tsx`
   * — `ExitTaxHoldingReportForm`(별지 제104호서식) 렌더를 단언한다.
   */
  it("UN-1-3: 구현된 보유현황 신고서(별지 제104호서식)는 **고지 목록에 없다**", () => {
    const { container } = render(<UnsupportedItemsCard />);
    expect(container.textContent).not.toMatch(/보유현황 신고서/);
  });

  /**
   * 짝(「실제로 계산된다」): `__tests__/tax-engine/stock-transfer/foreign-penalty-axis.anchor.test.ts`
   * FP-2-2 — 전부 국외인 신고에서 39,500,000 × 40% = 15,800,000 을 고정한다.
   */
  it("UN-1-3b: 국외 종목만인 신고의 가산세는 계산되므로 **고지 목록에 없다**", () => {
    const { container } = render(<UnsupportedItemsCard />);
    expect(container.textContent).not.toMatch(/국외 종목만/);
  });

  it("UN-1-4: **내부 PR 번호를 노출하지 않는다** — 사용자에게 의미가 없다", () => {
    const { container } = render(<UnsupportedItemsCard />);
    expect(container.textContent).not.toMatch(/PR-\d/);
    expect(container.textContent).not.toMatch(/Phase [A-Z]/);
  });

  it("UN-1-5: 이미 구현된 §47조의4 납부지연가산세는 **고지 목록에 없다**", () => {
    const { container } = render(<UnsupportedItemsCard />);
    expect(container.textContent).not.toMatch(/납부지연/);
  });
});
