/**
 * @vitest-environment jsdom
 *
 * Phase 2 — 키움 자동조회 버튼은 route가 준 «창과 평균»을 그대로 쓴다
 *
 * 계획서: docs/00-pm/stock-listed-conversion-1month-kiwoom-autofetch.plan.md (Phase 2)
 *
 * ## 왜 이 anchor가 필요한가
 *
 * 종전 버튼은 응답의 `average`·`slotDates`를 **버리고**
 * `preTransferAutoFillDates(transferDate)`로 창을 다시 만들어 평균을 재계산했다
 * (`KiwoomAutoFetchButton.tsx` — 「★ API slotDates(양도일 미포함)와 UI displayDates … 차이 보정」).
 *
 * 그 주석은 **stale**이었다. route도 같은 `buildOneMonthBeforeSlots`를 쓰므로
 * (`app/api/kiwoom/transfer-1month/route.ts:88`) 두 창은 원래 동일했고, 재계산은 무의미했다.
 *
 * 🔴 **무의미한 데 그치지 않는다.** Phase 1이 route에 anchor 재결정(B′안)을 심으면
 *    route의 창은 «보정된» 창이 되는데, 버튼이 자기 창으로 다시 만들면
 *    **보정이 화면에 도달하지 못한다**. 실측 예:
 *
 *      route  [2015-01-18 ~ 2015-02-17] · 거래일 22 · 평균 1,371,500  (설날 anchor 보정)
 *      버튼   [2015-01-20 ~ 2015-02-19] 로 재구성
 *             → 01-18·19 종가를 «버리고» 02-18·19는 빈 칸 → 보정 전 값이 남는다
 *
 * ⇒ 이 파일은 **「route의 창이 그대로 폼에 실린다」**를 고정한다.
 *    fixture는 일부러 «buildOneMonthBeforeSlots가 만들 창과 다른» 창을 돌려준다 —
 *    그래야 재계산이 되살아났을 때 반드시 울린다.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { KiwoomAutoFetchButton } from "@/components/calc/stock-transfer/KiwoomAutoFetchButton";
import { buildOneMonthBeforeSlots } from "@/lib/kiwoom/calendar";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

/**
 * 2015-02-19(설날) — B′ 보정 후 route가 돌려줄 창 [2015-01-18 ~ 2015-02-17].
 *
 * 🔑 **2015-01-19를 일부러 넣는다.** 그 날은 보정된 창에는 있지만
 *    버튼이 스스로 만드는 창 [2015-01-20 ~ 2015-02-19]에는 **없다**.
 *    재계산이 살아 있으면 이 종가가 버려져 평균이 달라진다 ⇒ KRW-1이 울린다.
 *
 *    초판 fixture는 세 날짜가 모두 버튼 창 «안»이라 평균이 우연히 같아져
 *    **KRW-1이 구별력 0**이었다(실측으로 확인 후 교체).
 */
const CORRECTED_SLOTS = ["2015-01-19", "2015-02-16", "2015-02-17"];
const CORRECTED_CLOSES = [1_350_000, 1_371_500, 1_372_000];
const CORRECTED_SUM = 4_093_500;
const CORRECTED_AVERAGE = 1_364_500; // = floor(4_093_500 / 3)
/** 재계산이 살아 있을 때의 값 — 01-19를 버리고 2건만 쓴다 */
const RECOMPUTED_IF_BROKEN = 1_371_750; // = floor((1_371_500 + 1_372_000) / 2)

function mockRoute() {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      stockCode: "005930",
      stockName: "삼성전자",
      marketType: "KOSPI",
      transferDate: "2015-02-19",
      slotDates: CORRECTED_SLOTS,
      closingPrices: CORRECTED_CLOSES,
      weekendLabels: ["", "", ""],
      tradingDays: 3,
      sum: CORRECTED_SUM,
      average: CORRECTED_AVERAGE,
      tradingHalt: false,
      adminIssue: false,
    }),
  }) as unknown as Response);
}

function renderButton(onFill: (p: Partial<StockTransferFormData>) => void) {
  render(
    <KiwoomAutoFetchButton
      securityCode="005930"
      transferDate="2015-02-19"
      marketType="kospi"
      tradingHalt={false}
      onFill={onFill}
    />,
  );
}

describe("KRW — 자동조회는 route의 창·평균을 그대로 소비한다", () => {
  it("KRW-0: fixture 창은 buildOneMonthBeforeSlots의 창과 «다르다» (이 anchor의 구별력 전제)", () => {
    const own = buildOneMonthBeforeSlots("2015-02-19");
    expect(own[own.length - 1]).toBe("2015-02-19"); // fixture 밖이라 시프트 없음
    expect(own).not.toEqual(CORRECTED_SLOTS);
    expect(own.length).toBeGreaterThan(CORRECTED_SLOTS.length);
  });

  it("KRW-1: 평균은 route가 준 값 그대로다 (재계산 금지)", async () => {
    vi.stubGlobal("fetch", mockRoute());
    const onFill = vi.fn();
    renderButton(onFill);
    fireEvent.click(screen.getByRole("button", { name: /키움 자동조회/ }));

    await waitFor(() => expect(onFill).toHaveBeenCalled());
    const patch = onFill.mock.calls[0][0] as Partial<StockTransferFormData>;
    expect(patch.transferDatePriceAvg1Month).toBe(String(CORRECTED_AVERAGE));
    // 재계산이 살아 있으면 이 값이 온다 — 명시적으로 배제한다
    expect(patch.transferDatePriceAvg1Month).not.toBe(String(RECOMPUTED_IF_BROKEN));
  });

  it("KRW-2: 일자 배열도 route의 창 그대로다 (자기 창으로 다시 만들지 않는다)", async () => {
    vi.stubGlobal("fetch", mockRoute());
    const onFill = vi.fn();
    renderButton(onFill);
    fireEvent.click(screen.getByRole("button", { name: /키움 자동조회/ }));

    await waitFor(() => expect(onFill).toHaveBeenCalled());
    const patch = onFill.mock.calls[0][0] as Partial<StockTransferFormData>;
    expect(patch.transferPriceDates).toEqual(CORRECTED_SLOTS);
    expect(patch.transferPriceClosing).toEqual(CORRECTED_CLOSES.map(String));
  });

  it("KRW-3: 결과 카드도 route의 기간·거래일을 보여준다", async () => {
    vi.stubGlobal("fetch", mockRoute());
    renderButton(() => {});
    fireEvent.click(screen.getByRole("button", { name: /키움 자동조회/ }));

    await waitFor(() =>
      expect(screen.getByText(/2015-01-19 ~ 2015-02-17/)).toBeTruthy(),
    );
    expect(screen.getByText(/1,364,500/)).toBeTruthy();
  });

  /** 비거래일(null 종가)은 빈 문자로 실린다 — 일자별 표가 그렇게 읽는다. */
  it("KRW-4: null 종가는 빈 문자로 매핑된다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          slotDates: ["2015-02-14", "2015-02-16"],
          closingPrices: [null, 1_371_500],
          weekendLabels: ["토요일 · 거래일 제외", ""],
          tradingDays: 1,
          sum: 1_371_500,
          average: 1_371_500,
          tradingHalt: false,
        }),
      }) as unknown as Response),
    );
    const onFill = vi.fn();
    renderButton(onFill);
    fireEvent.click(screen.getByRole("button", { name: /키움 자동조회/ }));

    await waitFor(() => expect(onFill).toHaveBeenCalled());
    const patch = onFill.mock.calls[0][0] as Partial<StockTransferFormData>;
    expect(patch.transferPriceClosing).toEqual(["", "1371500"]);
  });
});
