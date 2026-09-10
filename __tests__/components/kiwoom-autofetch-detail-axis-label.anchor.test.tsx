/**
 * @vitest-environment jsdom
 *
 * KAL — 자동조회 「일자별 종가 (검증용)」 상세 표의 **제목이 축을 따라간다**.
 *
 * 종전 결함: 카드 제목·버튼·요약줄은 `dateLabel`/`isAcquisition`으로 축에 따라 갈리는데
 * 상세 표 제목 한 줄만 「양도일 이전 1개월 … 분모 산입」으로 하드코딩돼 있어
 * **취득일 축에서도 「양도일」·「분모」로 표시**됐다.
 *
 * §99①3에서 두 축은 환산비율의 서로 다른 자리다 — 취득일 = **분자**, 양도일 = **분모**.
 * 화면이 축을 잘못 부르면 사용자가 지금 채우는 값이 어느 자리인지 오독한다.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { KiwoomAutoFetchButton } from "@/components/calc/stock-transfer/KiwoomAutoFetchButton";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

const SLOTS = ["2026-02-25", "2026-02-26"];

function mockRoute() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      stockCode: "005930",
      slotDates: SLOTS,
      closingPrices: [16_320, 16_500],
      weekendLabels: ["", ""],
      tradingDays: 2,
      sum: 32_820,
      average: 16_410,
      tradingHalt: false,
    }),
  }) as unknown as Response);
}

async function openDetail(axis: "transfer" | "acquisition") {
  vi.stubGlobal("fetch", mockRoute());
  const { container } = render(
    <KiwoomAutoFetchButton
      securityCode="005930"
      transferDate="2026-02-26"
      marketType="kospi"
      tradingHalt={false}
      axis={axis}
      onFill={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /키움 자동조회/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: /일자별 종가/ })).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: /일자별 종가/ }));
  return container;
}

/** 상세 표 제목 — 「… 이전 1개월 일자별 종가 …」 문단 */
function detailHeading(container: HTMLElement) {
  const p = Array.from(container.querySelectorAll("p")).find((el) =>
    /이전 1개월 일자별 종가/.test(el.textContent ?? ""),
  );
  expect(p).toBeTruthy();
  return (p as HTMLElement).textContent!.replace(/\s+/g, " ");
}

describe("KAL — 상세 표 제목이 축을 따라간다", () => {
  it("KAL-1 🔴 취득일 축 — 「취득일」·「분자」로 표시된다 (「양도일」·「분모」가 아니다)", async () => {
    const container = await openDetail("acquisition");
    const heading = detailHeading(container);
    expect(heading).toContain("취득일 이전 1개월 일자별 종가");
    expect(heading).toContain("분자 산입");
    expect(heading).not.toContain("양도일");
    expect(heading).not.toContain("분모");
  });

  it("KAL-2 양도일 축 — 「양도일」·「분모」 그대로 (회귀 가드)", async () => {
    const container = await openDetail("transfer");
    const heading = detailHeading(container);
    expect(heading).toContain("양도일 이전 1개월 일자별 종가");
    expect(heading).toContain("분모 산입");
    expect(heading).not.toContain("취득일");
  });

  it("KAL-3 요약줄과 어긋나지 않는다 — 취득 축은 두 곳 모두 「분자」다", async () => {
    const container = await openDetail("acquisition");
    // 요약줄: 「→ §99①3 환산 분자에 자동 입력됩니다」
    const summary = Array.from(container.querySelectorAll("p")).find((el) =>
      /환산 (분자|분모)에 자동 입력/.test(el.textContent ?? ""),
    );
    expect(summary?.textContent).toContain("분자");
    expect(detailHeading(container)).toContain("분자");
  });
});
