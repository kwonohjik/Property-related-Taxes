/**
 * @vitest-environment jsdom
 *
 * Phase 5 — 두 자동조회 축이 «서로 다른 날짜»를 읽는다
 *
 * 계획서: docs/00-pm/stock-listed-conversion-1month-kiwoom-autofetch.plan.md (Phase 5)
 *
 * ## 왜 별도 anchor 인가
 *
 * 도달 게이트 anchor(`stock-listed-conversion-autofetch-gate.anchor.test.tsx`)는
 * **버튼이 있는가**만 본다. 실측(2026-08-31): 취득일 버튼의 날짜 소스를
 * `form.acquisitionDate` → `form.transferDate` 로 바꿔도 그 파일은 **10/10 통과**했다.
 *
 * ⇒ 두 축이 «같은 값»을 읽어도 조용히 지나간다. 그러면 분자·분모가 같아져
 *   환산비율이 1이 되고 환산취득가 = 양도가가 된다(세액 직결).
 *   이 파일은 **요청 본문의 기준일**을 직접 본다.
 *
 * 🔑 Step2 에서 시작한다 — 버튼을 직접 렌더하면 「어느 폼 필드가 연결됐는가」를 놓친다
 *    ([[feedback_leaf_anchor_skips_zod_layer]]의 UI 판).
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

const ACQUISITION_DATE = "2015-04-20";
const TRANSFER_DATE = "2025-06-10";

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    securityCode: "005930",
    securityName: "삼성전자",
    acquisitionDate: ACQUISITION_DATE,
    transferDate: TRANSFER_DATE,
    acquisitionMode: "estimated",
    tradingHaltAtTransfer: false,
    tradingHaltAtAcquisition: false,
    acquiredBeforeListing: false,
    ...o,
  };
}

/** 요청 본문을 붙잡는 fetch mock */
function captureFetch(bodies: Record<string, unknown>[]) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    return {
      ok: true,
      json: async () => ({
        slotDates: ["2015-04-20"],
        closingPrices: [1_400_000],
        weekendLabels: [""],
        tradingDays: 1,
        sum: 1_400_000,
        average: 1_400_000,
        tradingHalt: false,
      }),
    } as unknown as Response;
  });
}

describe("AX — 자동조회 축별 날짜 소스", () => {
  it("AX-1: «취득일» 버튼은 acquisitionDate 를 보낸다 (transferDate 가 아니다)", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", captureFetch(bodies));
    render(<Step2 form={form()} onChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /취득일 키움 자동조회/ }));
    await waitFor(() => expect(bodies.length).toBe(1));

    expect(bodies[0].baseDate).toBe(ACQUISITION_DATE);
    expect(bodies[0].baseDate).not.toBe(TRANSFER_DATE);
    expect(bodies[0].axis).toBe("acquisition");
  });

  it("AX-2: «양도일» 버튼은 transferDate 를 보낸다 (AX-1 의 대조군)", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", captureFetch(bodies));
    render(<Step2 form={form()} onChange={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /양도일 키움 자동조회/ }));
    await waitFor(() => expect(bodies.length).toBe(1));

    expect(bodies[0].baseDate).toBe(TRANSFER_DATE);
    expect(bodies[0].baseDate).not.toBe(ACQUISITION_DATE);
    expect(bodies[0].axis).toBe("transfer");
  });

  /**
   * 🔴 취득일 축은 **분자**만 채운다. 분모(`transferDatePriceAvg1Month`)나
   *    일자별 표 배열을 건드리면 두 축이 서로를 덮어쓴다.
   *
   * 그리고 `kiwoomTradingHalt`도 쓰지 않는다 — 그 값은 폼 전역이라
   * `Step2.tsx`의 배너가 그것을 보고 「**양도일** 거래정지 토글을 켜라」고 안내한다(자가검토 F-5).
   */
  it("AX-3: 취득일 축은 분자만 채운다 — 분모·일자표·kiwoomTradingHalt 미변경", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", captureFetch(bodies));
    const onChange = vi.fn();
    render(<Step2 form={form()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /취득일 키움 자동조회/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const patch = onChange.mock.calls.at(-1)![0] as Partial<StockTransferFormData>;
    expect(patch.acquisitionDatePriceAvg1Month).toBe("1400000");
    expect(patch).not.toHaveProperty("transferDatePriceAvg1Month");
    expect(patch).not.toHaveProperty("transferPriceDates");
    expect(patch).not.toHaveProperty("transferPriceClosing");
    expect(patch).not.toHaveProperty("kiwoomTradingHalt");
  });

  it("AX-4: 양도일 축은 종전대로 분모와 일자표를 채운다 (AX-3 의 대조군)", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", captureFetch(bodies));
    const onChange = vi.fn();
    render(<Step2 form={form()} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /양도일 키움 자동조회/ }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());

    const patch = onChange.mock.calls.at(-1)![0] as Partial<StockTransferFormData>;
    expect(patch.transferDatePriceAvg1Month).toBe("1400000");
    expect(patch.transferPriceDates).toEqual(["2015-04-20"]);
    expect(patch).toHaveProperty("kiwoomTradingHalt");
    expect(patch).not.toHaveProperty("acquisitionDatePriceAvg1Month");
  });
});
