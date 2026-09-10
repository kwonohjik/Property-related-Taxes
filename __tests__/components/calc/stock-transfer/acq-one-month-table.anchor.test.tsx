/**
 * @vitest-environment jsdom
 *
 * ACQ1M — 「취득일 이전 1개월 종가평균」 화면이 분모 축과 **같은 형태**를 갖는다.
 *
 * 제보(2026-09-10, 이미지 2·3): 양도일 축에는 입력 방식 라디오 + 32칸 일자별 표 +
 * 자동 평균 요약이 있는데, 취득일 축에는 **단일 숫자 칸 하나뿐**이라 두 화면이 크게 달랐다.
 *
 * 표 컴포넌트는 복제하지 않고 `axis` prop으로 공용화했다 — 기간 산식
 * (`buildOneMonthBeforeSlots`)·평균 산식·비거래일 처리가 두 축에서 완전히 동일하다.
 * 이 저장소는 「같은 산식이 두 벌」로 반복해서 데었다.
 *
 * 🔑 **축이 새는지**를 함께 본다(ACQ1M-2·4). 공용 컴포넌트에서 가장 위험한 회귀는
 *    취득 축 입력이 분모 필드(`transferPrice*`)에 쓰이는 것이다 — 타입은 둘 다 통과시킨다.
 */

import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { TransferDate1MonthClosingPriceTable } from "@/components/calc/stock-transfer/TransferDate1MonthClosingPriceTable";
import { KiwoomAutoFetchButton } from "@/components/calc/stock-transfer/KiwoomAutoFetchButton";
import { AcquisitionInfoBlock } from "@/components/calc/stock-transfer/AcquisitionInfoBlock";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { validateStep2Domestic } from "@/lib/calc/stock-transfer-tax-validate-step2";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import { buildOneMonthBeforeSlots } from "@/lib/kiwoom/calendar";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

const ACQ_DATE = "2026-02-26";
const DATES = buildOneMonthBeforeSlots(ACQ_DATE);

function renderAcqTable(o: Partial<StockTransferFormData> = {}, onChange = vi.fn()) {
  const form = { ...createInitialStockFormData(), acquisitionDate: ACQ_DATE, ...o };
  const r = render(
    <TransferDate1MonthClosingPriceTable form={form} onChange={onChange} axis="acquisition" />,
  );
  return { ...r, onChange };
}

/** 거래일(입력칸이 있는) 슬롯의 데이터 인덱스 */
function firstTradingIdx(container: HTMLElement): number {
  const slot = Array.from(container.querySelectorAll("[data-slot-idx]")).find((el) =>
    el.querySelector("input"),
  )!;
  return Number(slot.getAttribute("data-slot-idx"));
}

describe("ACQ1M — 취득 축 일자별 표", () => {
  it("ACQ1M-1 제목·요약이 «취득일·분자»를 가리킨다 (분모 축 문구가 새지 않는다)", () => {
    const { container } = renderAcqTable();
    const text = container.textContent ?? "";
    expect(text).toContain("취득일 이전 1개월 종가");
    expect(text).toContain("§99①3 분자");
    expect(text).not.toContain("양도일 이전 1개월 종가");
    expect(text).not.toContain("§99①3 분모");
  });

  it("ACQ1M-2 🔴 셀 편집이 «취득 축 필드»에만 쓰인다 + 평균이 자동 산정된다", () => {
    const { container, onChange } = renderAcqTable();
    const idx = firstTradingIdx(container);
    const input = container.querySelector(`[data-slot-idx="${idx}"] input`) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "50000" } });

    const patch = onChange.mock.calls[0][0] as Partial<StockTransferFormData>;
    expect(patch.acquisitionPriceClosing?.[idx]).toBe("50000");
    expect(patch.acquisitionPriceDates).toEqual(DATES);
    expect(patch.acquisitionDatePriceAvg1Month).toBe("50000"); // 거래일 1건 → 평균 = 그 값
    // 분모 축은 건드리지 않는다 — 공용 컴포넌트의 가장 위험한 회귀
    expect(patch).not.toHaveProperty("transferPriceClosing");
    expect(patch).not.toHaveProperty("transferDatePriceAvg1Month");
  });

  it("ACQ1M-3 기준일(취득일)이 첫 칸이다 (분모 축과 같은 규칙)", () => {
    const { container } = renderAcqTable();
    const slots = Array.from(container.querySelectorAll("[data-slot-idx]"));
    expect(slots[0].textContent).toContain(`1. ${ACQ_DATE}`);
  });

  it("ACQ1M-4 🔴 자동조회(취득 축)가 «취득 축 배열»을 채운다 — 표가 빈 채로 남지 않는다", async () => {
    const SLOTS = ["2026-02-25", "2026-02-26"];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          slotDates: SLOTS,
          closingPrices: [16_320, 16_500],
          weekendLabels: ["", ""],
          tradingDays: 2,
          sum: 32_820,
          average: 16_410,
          tradingHalt: false,
        }),
      })) as unknown as typeof fetch,
    );
    const onFill = vi.fn();
    render(
      <KiwoomAutoFetchButton
        securityCode="005930"
        transferDate={ACQ_DATE}
        marketType="kospi"
        tradingHalt={false}
        axis="acquisition"
        onFill={onFill}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /키움 자동조회/ }));
    await waitFor(() => expect(onFill).toHaveBeenCalled());

    const patch = onFill.mock.calls[0][0] as Partial<StockTransferFormData>;
    expect(patch.acquisitionPriceDates).toEqual(SLOTS);
    expect(patch.acquisitionPriceClosing).toEqual(["16320", "16500"]);
    expect(patch.acquisitionDatePriceAvg1Month).toBe("16410");
    // F-5 회귀 가드 — 취득 축은 폼 전역 정지 플래그·분모 배열을 건드리지 않는다
    expect(patch).not.toHaveProperty("kiwoomTradingHalt");
    expect(patch).not.toHaveProperty("transferPriceClosing");
  });
});

/** 일반 §163⑨ 환산 경로 — 분모는 정상 입력, 분자만 축을 바꿔 본다 */
function conversionForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    marketType: "kospi",
    securityCode: "005930",
    acquisitionDate: "2015-04-20",
    transferDate: "2025-06-10",
    shareCount: "1000",
    transferTotalPrice: "60000000",
    acquisitionMode: "estimated",
    acquisitionStdMode: "monthly_avg",
    transferDatePriceAvg1Month: "56590",
    acquisitionDatePriceAvg1Month: "51000",
    ...o,
  };
}

const acqErrors = (form: StockTransferFormData, field: string) =>
  validateStep2Domestic(form).filter((e) => e.field === field);

describe("ACQ1M ⑧ — validate가 두 입력 방식을 «모두» 인정한다", () => {
  it("ACQ1M-5 🔴 daily에서 표만 채워도 통과한다 (단일 칸을 요구하면 막다른 길)", () => {
    const form = conversionForm({
      acquisitionStdInputMode: "daily",
      acquisitionDatePriceAvg1Month: "51000", // 표에서 파생돼 저장된 평균
      acquisitionPriceClosing: ["", "51000"],
    });
    expect(acqErrors(form, "acquisitionPriceClosing")).toHaveLength(0);
    expect(acqErrors(form, "acquisitionDatePriceAvg1Month")).toHaveLength(0);
  });

  it("ACQ1M-6 daily인데 표가 비면 차단한다 (과소 차단 방지)", () => {
    const form = conversionForm({
      acquisitionStdInputMode: "daily",
      acquisitionDatePriceAvg1Month: "",
      acquisitionPriceClosing: [],
    });
    expect(acqErrors(form, "acquisitionPriceClosing").length).toBeGreaterThan(0);
  });

  it("ACQ1M-7 direct에서 단일 칸이 비면 종전대로 차단한다 (회귀 가드)", () => {
    const form = conversionForm({
      acquisitionStdInputMode: "direct",
      acquisitionDatePriceAvg1Month: "",
    });
    expect(acqErrors(form, "acquisitionDatePriceAvg1Month").length).toBeGreaterThan(0);
  });
});

describe("ACQ1M ③ — normalize가 축을 게이팅한다", () => {
  it("ACQ1M-8 monthly_avg가 아니면 daily 잔재가 direct로 되돌아간다 (F-10 dead-end 예방)", () => {
    const n = normalizeStockFormData({
      acquisitionStdMode: "post_listing",
      acquisitionStdInputMode: "daily",
    });
    expect(n.acquisitionStdInputMode).toBe("direct");
  });

  it("ACQ1M-9 monthly_avg에서는 daily가 보존된다", () => {
    const n = normalizeStockFormData({
      acquisitionStdMode: "monthly_avg",
      acquisitionStdInputMode: "daily",
      acquisitionPriceClosing: ["1000"],
    });
    expect(n.acquisitionStdInputMode).toBe("daily");
    expect(n.acquisitionPriceClosing).toEqual(["1000"]);
  });
});

describe("ACQ1M — 취득일이 바뀌면 표 잔재와 저장 평균이 «모드와 무관하게» 리셋된다", () => {
  /**
   * 분모 축에서 겪은 stale 사고의 거울이다(제보 2026-09-01 — 16,560 vs 16,559).
   * 표 미리보기는 기준일 파생으로 매 렌더 재계산되는데 저장 평균은 셀 편집·자동조회
   * 때만 갱신되므로, 기준일만 바뀌면 둘이 갈린다. 저장 평균은 엔진에 가는 값이다.
   */
  function renderAcqInfo(o: Partial<StockTransferFormData> = {}, onChange = vi.fn()) {
    const form = { ...createInitialStockFormData(), acquisitionDate: "2026-02-26", ...o };
    render(<AcquisitionInfoBlock form={form} onChange={onChange} />);
    return onChange;
  }

  function fillAcqDate(y: string, m: string, d: string) {
    const card = screen.getByText("취득일").closest("[data-slot='field-card']") as HTMLElement;
    fireEvent.change(card.querySelector('input[aria-label="연도"]')!, { target: { value: y } });
    fireEvent.change(card.querySelector('input[aria-label="월"]')!, { target: { value: m } });
    fireEvent.change(card.querySelector('input[aria-label="일"]')!, { target: { value: d } });
  }

  const FETCHED: Partial<StockTransferFormData> = {
    acquisitionPriceDates: ["2026-01-26", "2026-01-27"],
    acquisitionPriceClosing: ["16000", "16320"],
    acquisitionDatePriceAvg1Month: "16160",
  };

  it("ACQ1M-10 🔴 direct 모드에서도 리셋된다 (모드로 좁히면 잔재가 살아남는다)", () => {
    const onChange = renderAcqInfo({ ...FETCHED, acquisitionStdInputMode: "direct" });
    fillAcqDate("2026", "03", "31");

    const patch = onChange.mock.calls
      .map((c) => c[0] as Partial<StockTransferFormData>)
      .find((p) => p.acquisitionDate === "2026-03-31");
    expect(patch).toBeTruthy();
    expect(patch!.acquisitionPriceDates).toEqual([]);
    expect(patch!.acquisitionPriceClosing).toEqual([]);
    expect(patch!.acquisitionDatePriceAvg1Month).toBe("");
  });

  it("ACQ1M-11 같은 값 재입력이면 잔재를 지우지 않는다 (불필요한 데이터 손실 방지)", () => {
    const onChange = renderAcqInfo({ ...FETCHED, acquisitionStdInputMode: "daily" });
    fillAcqDate("2026", "02", "26");

    const clearing = onChange.mock.calls
      .map((c) => c[0] as Partial<StockTransferFormData>)
      .find((p) => p.acquisitionPriceClosing?.length === 0);
    expect(clearing).toBeUndefined();
  });
});

describe("ACQ1M ⑤ — Step2가 그 표를 «실제로 렌더»한다", () => {
  /**
   * 표 컴포넌트만 고쳐 두고 소비 지점을 열지 않으면 화면은 그대로다
   * (memory `feedback_fixed_layer_vs_consumed_layer`). 라디오 ↔ 표의 연결을 여기서 못박는다.
   */
  function renderStep2(o: Partial<StockTransferFormData> = {}) {
    const form: StockTransferFormData = {
      ...createInitialStockFormData(),
      marketType: "kospi",
      securityCode: "005930",
      acquisitionDate: ACQ_DATE,
      transferDate: "2026-03-10",
      acquisitionMode: "estimated",
      acquisitionStdMode: "monthly_avg",
      ...o,
    };
    return render(<Step2 form={form} onChange={vi.fn()} />);
  }

  it("ACQ1M-12 🔴 daily를 고르면 취득 축 일자별 표가 화면에 나타난다", () => {
    const { container } = renderStep2({ acquisitionStdInputMode: "daily" });
    expect(container.textContent).toContain("취득일 이전 1개월 종가");
    expect(container.textContent).toContain("§99①3 분자");
    // 슬롯이 실제로 그려진다 (제목만 있고 칸이 없는 상태를 배제)
    expect(container.querySelectorAll("[data-slot-idx]").length).toBeGreaterThan(20);
  });

  it("ACQ1M-13 direct에서는 단일 칸만 있고 표는 없다 (회귀 가드)", () => {
    const { container } = renderStep2({ acquisitionStdInputMode: "direct" });
    expect(container.textContent).toContain("취득시 1주당 기준시가");
    expect(container.textContent).not.toContain("취득일 이전 1개월 종가 (소득세법");
  });

  it("ACQ1M-14 입력 방식 라디오가 취득 축 카드 안에 있다 (되돌릴 UI가 존재한다)", () => {
    renderStep2({ acquisitionStdInputMode: "daily" });
    const radios = screen.getAllByRole("radio", { name: /일자별 입력|직접 입력/ });
    expect(radios.length).toBeGreaterThanOrEqual(2);
  });
});
