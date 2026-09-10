/**
 * @vitest-environment jsdom
 *
 * KAO — 키움 자동조회 「일자별 종가 (검증용)」 상세 표는 **기준일을 맨 위**에 둔다.
 *
 * 제보(2026-09-10): 취득일 자동조회 결과를 펼쳐 보면 정작 기준이 되는 취득일이
 * 마지막 줄에 있어 가장 늦게 찾게 된다. 일자별 입력 표
 * (`TransferDate1MonthClosingPriceTable` — PR #1568)와 같은 규칙으로 뒤집는다.
 *
 * 🔑 **표시만 뒤집는다** — route 응답 배열(`slotDates`/`closingPrices`/`weekendLabels`)의
 *    인덱스 매핑은 그대로여야 한다. KAO-2가 그것을 못박는다: 뒤집힌 첫 줄의 «종가»가
 *    배열 마지막 값이어야 한다. 인덱스까지 뒤집으면 날짜와 종가가 어긋나 붙는다.
 *
 * ※ 형제 축 `KiwoomPostListingAutoFetchButton`(§165⑤ 상장일 «이후» 1개월)은
 *   기준일(상장일)이 이미 첫 칸이라 대상이 아니다.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { KiwoomAutoFetchButton } from "@/components/calc/stock-transfer/KiwoomAutoFetchButton";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

/** 기준일 = 마지막 슬롯(2026-02-26). 중간에 주말 라벨 슬롯을 섞어 매핑 어긋남을 드러낸다. */
const SLOTS = ["2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26"];
const CLOSES: (number | null)[] = [16_000, null, 16_320, 16_500];
const LABELS = ["", "토요일 · 거래일 제외", "", ""];

function mockRoute() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      stockCode: "005930",
      slotDates: SLOTS,
      closingPrices: CLOSES,
      weekendLabels: LABELS,
      tradingDays: 3,
      sum: 48_820,
      average: 16_273,
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

/** 상세 표의 각 줄 — 「n. YYYY-MM-DD」 텍스트를 가진 span의 부모 */
function detailRows(container: HTMLElement) {
  return Array.from(container.querySelectorAll("span.tabular-nums"))
    .filter((el) => /^\d+\.\s\d{4}-\d{2}-\d{2}$/.test(el.textContent?.trim() ?? ""))
    .map((el) => el.parentElement as HTMLElement);
}

describe("KAO — 자동조회 상세 표는 기준일부터 내림차순으로 보인다", () => {
  it("KAO-1 취득일 축 — 첫 줄이 기준일(취득일), 마지막 줄이 기간 시작일", async () => {
    const container = await openDetail("acquisition");
    const rows = detailRows(container);
    expect(rows.length).toBe(SLOTS.length);

    expect(rows[0].textContent).toContain(`1. ${SLOTS[SLOTS.length - 1]}`);
    expect(rows[rows.length - 1].textContent).toContain(`${SLOTS.length}. ${SLOTS[0]}`);

    const shown = rows.map((r) => r.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "");
    expect(shown).toEqual([...SLOTS].reverse());
  });

  it("KAO-2 🔴 날짜↔종가 매핑이 유지된다 — 첫 줄 종가가 배열 «마지막» 값이다", async () => {
    const container = await openDetail("acquisition");
    const rows = detailRows(container);

    expect(rows[0].textContent).toContain((16_500).toLocaleString()); // SLOTS 마지막의 종가
    expect(rows[rows.length - 1].textContent).toContain((16_000).toLocaleString()); // SLOTS 첫의 종가
    // 비거래일 슬롯(2026-02-24)의 라벨도 그 날짜 줄에 붙어 있어야 한다
    const satRow = rows.find((r) => r.textContent?.includes("2026-02-24"))!;
    expect(satRow.textContent).toContain("토요일 · 거래일 제외");
  });

  it("KAO-3 양도일 축도 같은 규칙이다 (같은 표 — 축에 따라 갈리지 않는다)", async () => {
    const container = await openDetail("transfer");
    const rows = detailRows(container);
    expect(rows[0].textContent).toContain(`1. ${SLOTS[SLOTS.length - 1]}`);
  });
});
