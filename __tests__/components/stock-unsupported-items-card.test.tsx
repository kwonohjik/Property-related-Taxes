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

afterEach(cleanup);

describe("UN-1 미지원 항목 고지", () => {
  it("UN-1-1: 증권거래세 2021-01-01 이전 세율 미지원을 알린다", () => {
    render(<UnsupportedItemsCard />);
    expect(screen.getByText(/2021-01-01 이전/)).toBeTruthy();
  });

  it("UN-1-2: 국외전출세 기준환율·보유현황 신고서를 알린다", () => {
    render(<UnsupportedItemsCard />);
    // 제목·본문 양쪽에 나오므로 개수로 본다
    expect(screen.getAllByText(/기준환율/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/보유현황 신고서/).length).toBeGreaterThan(0);
  });

  it("UN-1-3: 국외 종목만인 신고의 가산세 한계를 알린다 (Phase A′ 잔여)", () => {
    render(<UnsupportedItemsCard />);
    expect(screen.getByText(/국외 종목만/)).toBeTruthy();
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
