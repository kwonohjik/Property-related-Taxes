/**
 * @vitest-environment jsdom
 *
 * 분할·다건 lot 의제취득일 전 매수 ① 비교 — ⑤ 입력 카드 · ⑥ 미리보기 · ⑦ 결과 카드 (영 §176의2④1호)
 *
 *   PU-1  노출 격자 — 엔진·④·⑧·⑫와 같은 leaf(`isLotsModeForm` ∧ `preDeemedLotIndexesForm ≥ 1`) · Step2 소비 지점
 *   PU-2  라디오 value·disabled — 상장=환산만 · 비상장·기타=매매사례만 · 자본조정 동반 환산 차단 (라벨이 아니라 value 로 단언)
 *   PU-3  입력 — 환산: 의제취득일 분자 + 매도 건별 분모(엔진 매칭 단일 소스) · 매매사례: 사례가 + 개산공제 기준
 *   PU-4  매도 건 양도일 변경 → 그 건의 분모 값만 비운다(stale)
 *   PU-5  ⑥ 분할 미리보기 산정 열·요약
 *   PU-6  ⑦ 결과 카드 — 엔진 echo 그대로 · ① 미산정 · swap · 귀속 근거 · 「원」 미표기
 *   PU-7  Step3 안내 — ① 가 켜진 lot 모드에만
 *   PU-9  신고서 11행 라벨 — 매수 건별 ①·② 혼합은 결과 카드를 가리키고 ① 미산정은 ② 라벨 (단일 분자·분모 불가)
 *   PU-8  사이드바(결과 전) — lots-only 취득가액이 엔진 미리보기(②·①)와 같고, ① 가 켜지면 필요경비 행을 숨긴다
 */

import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { PreDeemedLotsClause1Card } from "@/components/calc/stock-transfer/PreDeemedLotsClause1Card";
import { PreDeemedLotsResultCard } from "@/components/calc/results/PreDeemedLotsResultCard";
import { LotMatchingDetailCard } from "@/components/calc/results/LotMatchingDetailCard";
import { SplitAllocationPreviewCard } from "@/components/calc/stock-transfer/SplitAllocationPreviewCard";
import { SplitLotsBlock } from "@/components/calc/stock-transfer/SplitLotsBlock";
import { Step2 } from "@/app/calc/stock-transfer-tax/steps/Step2";
import { Step3 } from "@/app/calc/stock-transfer-tax/steps/Step3";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { createInitialStockFormData, useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { buildRows, deriveColumns } from "@/components/calc/stock-transfer/StockFilingFormTableHelpers";
import {
  PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE,
  PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE,
  PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE,
} from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-lot-clause1";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

afterEach(cleanup);

const BASE = {
  ...createInitialStockFormData(),
  securityName: "테스트",
  securityCode: "005930",
  isMajorShareholder: true,
  selfShareRatio: "20",
  selfMarketCap: "6000000000",
  totalIssuedShares: "100000",
  priorYearEndDate: "2024-12-31",
  transferPriceMode: "actual",
  transferActualInputMode: "per_share",
  acquisitionMode: "actual",
  filingType: "preliminary",
  filingDate: "2026-07-31",
} as StockTransferFormData;

/** 분할 · 코스피 · 1980-06 매수 1,000주 × 10,000 · 2025-12-01 매도 1,000주 × 200,000 · ① 환산(의제일 20,000 · 양도 100,000) */
function splitForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...BASE,
    marketType: "kospi",
    lotsMode: "split",
    costAllocationMethod: "fifo",
    preDeemedLotClause1Mode: "estimated",
    acquisitionDatePriceAvg1Month: "20000",
    acquisitionLots: [{ id: "a1", acquisitionDate: "1980-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }],
    transferLots: [{ id: "t1", transferDate: "2025-12-01", shareCount: "1000", perShareTransferPrice: "200000", transferStdPricePerShare: "100000" }],
    ...o,
  } as StockTransferFormData;
}
function lotsOnlyForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...BASE,
    marketType: "kospi",
    lotsMode: "single",
    transferDate: "2025-12-01",
    shareCount: "1000",
    perShareTransferPrice: "200000",
    acquisitionActualInputMode: "lots",
    costAllocationMethod: "fifo",
    preDeemedLotClause1Mode: "estimated",
    acquisitionDatePriceAvg1Month: "20000",
    transferDatePriceAvg1Month: "100000",
    acquisitionLots: [{ id: "a1", acquisitionDate: "1980-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }],
    ...o,
  } as StockTransferFormData;
}
/** 매수 2건(1980 의제 · 2025) · 매도 2건 — FIFO 로 매도 #1 만 의제 lot 을 소진한다 */
function twoSaleForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return splitForm({
    acquisitionLots: [
      { id: "a1", acquisitionDate: "1980-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" },
      { id: "a2", acquisitionDate: "2025-02-10", acquisitionCause: "purchase", shareCount: "500", perShareAcquisitionPrice: "150000" },
    ],
    transferLots: [
      { id: "t1", transferDate: "2025-12-01", shareCount: "1000", perShareTransferPrice: "200000", transferStdPricePerShare: "100000" },
      { id: "t2", transferDate: "2025-12-02", shareCount: "500", perShareTransferPrice: "210000" },
    ],
    ...o,
  });
}

function runFullStack(form: StockTransferFormData) {
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(buildStockTransferApiBody(form));
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" | "));
  return calculateStockTransferTax(buildEngineInput(coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS])));
}

const card = () => screen.queryByTestId("pre-deemed-lots-clause1-card");
const radios = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"][name="preDeemedLotClause1Mode"]'));
const radioOf = (v: string) => radios().find((r) => r.value === v)!;

describe("PU-1: 노출 격자", () => {
  it("분할 + 의제 매수 lot → 표시 · 대상 lot 칩", () => {
    render(<PreDeemedLotsClause1Card form={splitForm()} onChange={vi.fn()} />);
    expect(card()).not.toBeNull();
    expect(screen.getByTestId("pre-deemed-lots-targets").textContent).toContain("매수 #1(1980-06-10)");
  });
  it("lots-only(일자별 다건) → 표시", () => {
    render(<PreDeemedLotsClause1Card form={lotsOnlyForm()} onChange={vi.fn()} />);
    expect(card()).not.toBeNull();
  });
  it("의제 lot 없음(2025 매수만) · 단건 · 증여 lot · 국외전출세·국외주식 → 숨김", () => {
    const cases: Partial<StockTransferFormData>[] = [
      { acquisitionLots: [{ id: "a1", acquisitionDate: "2025-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }] },
      { lotsMode: "single", acquisitionActualInputMode: "per_share" },
      { acquisitionLots: [{ id: "a1", acquisitionDate: "1980-06-10", acquisitionCause: "gift", shareCount: "1000", perShareAcquisitionPrice: "10000" }] },
      { marketType: "exit_tax" },
      { marketType: "foreign_stock" },
    ];
    for (const o of cases) {
      const { unmount } = render(<PreDeemedLotsClause1Card form={splitForm(o)} onChange={vi.fn()} />);
      expect(card()).toBeNull();
      unmount();
    }
  });
  it("기타자산은 의제취득일이 1985.1.1. — 1984-06 매수면 표시 · 1985-06 매수면 숨김", () => {
    const other = { marketType: "other_asset" as const, isHeavyRealEstateForRate: true, preDeemedLotClause1Mode: "none" as const };
    const lot = (d: string) => [{ id: "a1", acquisitionDate: d, acquisitionCause: "purchase" as const, shareCount: "1000", perShareAcquisitionPrice: "10000" }];
    const { unmount } = render(<PreDeemedLotsClause1Card form={splitForm({ ...other, acquisitionLots: lot("1984-06-10") })} onChange={vi.fn()} />);
    expect(card()!.textContent).toContain("1985.1.1.");
    unmount();
    render(<PreDeemedLotsClause1Card form={splitForm({ ...other, acquisitionLots: lot("1985-06-10") })} onChange={vi.fn()} />);
    expect(card()).toBeNull();
  });
  it("Step2 가 분할·lots-only 에서 이 카드를 실제로 렌더한다 (소비 지점) · 의제 lot 이 없으면 렌더하지 않는다", () => {
    render(<Step2 form={splitForm()} onChange={vi.fn()} />);
    expect(card()).not.toBeNull();
    cleanup();
    render(<Step2 form={lotsOnlyForm()} onChange={vi.fn()} />);
    expect(card()).not.toBeNull();
    cleanup();
    render(<Step2 form={splitForm({ acquisitionLots: [{ id: "a1", acquisitionDate: "2025-06-10", acquisitionCause: "purchase", shareCount: "1000", perShareAcquisitionPrice: "10000" }] })} onChange={vi.fn()} />);
    expect(card()).toBeNull();
  });
});

describe("PU-2: 라디오 — value · disabled", () => {
  it("옵션 value 는 none · estimated · sale_case 이고 선택값은 폼 값 그대로다", () => {
    render(<PreDeemedLotsClause1Card form={splitForm({ preDeemedLotClause1Mode: "none" })} onChange={vi.fn()} />);
    expect(radios().map((r) => r.value)).toEqual(["none", "estimated", "sale_case"]);
    expect(radioOf("none").checked).toBe(true);
    expect(radioOf("estimated").checked).toBe(false);
  });
  it("상장 → 매매사례 disabled · 환산 선택 가능 · 클릭하면 onChange 가 모드를 보낸다", () => {
    const onChange = vi.fn();
    render(<PreDeemedLotsClause1Card form={splitForm({ preDeemedLotClause1Mode: "none" })} onChange={onChange} />);
    expect(radioOf("sale_case").disabled).toBe(true);
    expect(radioOf("estimated").disabled).toBe(false);
    fireEvent.click(radioOf("estimated"));
    expect(onChange).toHaveBeenCalledWith({ preDeemedLotClause1Mode: "estimated" });
  });
  it("비상장 → 환산 disabled · 매매사례 선택 가능", () => {
    render(<PreDeemedLotsClause1Card form={splitForm({ marketType: "unlisted", preDeemedLotClause1Mode: "none" })} onChange={vi.fn()} />);
    expect(radioOf("estimated").disabled).toBe(true);
    expect(radioOf("sale_case").disabled).toBe(false);
  });
  it("자본조정(무상증자·감자)이 있으면 환산 disabled", () => {
    render(
      <PreDeemedLotsClause1Card
        form={splitForm({
          preDeemedLotClause1Mode: "none",
          capitalAdjustments: [{ id: "c1", type: "bonus_capital_reserve", eventDate: "2020-01-01", ratio: "10" } as unknown as StockTransferFormData["capitalAdjustments"][number]],
        })}
        onChange={vi.fn()}
      />,
    );
    expect(radioOf("estimated").disabled).toBe(true);
  });
  it("선택돼 있는데 지금 조합이 막히면(시장 변경 등) 사유를 ⑧·⑫ 와 같은 문구로 보인다", () => {
    render(<PreDeemedLotsClause1Card form={splitForm({ marketType: "unlisted", preDeemedLotClause1Mode: "estimated" })} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-lots-blocked").textContent).toBe(PRE_DEEMED_LOT_UNLISTED_ESTIMATED_MESSAGE);
    expect(screen.queryByTestId("pre-deemed-lots-deemed-std")).toBeNull();
    cleanup();
    render(<PreDeemedLotsClause1Card form={splitForm({ preDeemedLotClause1Mode: "sale_case" })} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-lots-blocked").textContent).toBe(PRE_DEEMED_LOT_LISTED_SALE_CASE_MESSAGE);
    cleanup();
    render(
      <PreDeemedLotsClause1Card
        form={splitForm({ capitalAdjustments: [{ id: "c1" } as unknown as StockTransferFormData["capitalAdjustments"][number]] })}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pre-deemed-lots-blocked").textContent).toBe(PRE_DEEMED_LOT_CAPITAL_ADJUSTMENT_MESSAGE);
  });
  it("none → 입력칸 없이 «① 미산정» 안내", () => {
    render(<PreDeemedLotsClause1Card form={splitForm({ preDeemedLotClause1Mode: "none" })} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-lots-none-note").textContent).toContain("① 미산정");
    expect(screen.queryByTestId("pre-deemed-lots-deemed-std")).toBeNull();
  });
});

describe("PU-3: 입력", () => {
  it("환산(분할): 분자 입력 + 의제 lot 을 소진하는 매도 건 행만(매도 #2 는 행 없음) · 입력은 해당 lot 으로", () => {
    const onChange = vi.fn();
    const form = twoSaleForm();
    render(<PreDeemedLotsClause1Card form={form} onChange={onChange} />);
    expect(screen.getByTestId("pre-deemed-lots-deemed-std")).toBeTruthy();
    expect(screen.getByTestId("pre-deemed-lots-sale-row-0")).toBeTruthy();
    expect(screen.queryByTestId("pre-deemed-lots-sale-row-1")).toBeNull();
    fireEvent.change(screen.getByTestId("pre-deemed-lots-sale-std-0"), { target: { value: "120000" } });
    const patch = onChange.mock.calls.at(-1)![0] as { transferLots: { id: string; transferStdPricePerShare?: string }[] };
    expect(patch.transferLots.map((l) => [l.id, l.transferStdPricePerShare])).toEqual([
      ["t1", "120000"],
      ["t2", undefined],
    ]);
  });
  it("환산(분할): 분자 입력은 acquisitionDatePriceAvg1Month 로 전달", () => {
    const onChange = vi.fn();
    render(<PreDeemedLotsClause1Card form={splitForm()} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("pre-deemed-lots-deemed-std"), { target: { value: "25000" } });
    expect(onChange).toHaveBeenCalledWith({ acquisitionDatePriceAvg1Month: "25000" });
  });
  it("환산(분할): 매칭이 확정되지 않으면(날짜 미입력) 행 대신 안내", () => {
    const form = splitForm({ transferLots: [{ id: "t1", transferDate: "", shareCount: "1000", perShareTransferPrice: "200000" }] });
    render(<PreDeemedLotsClause1Card form={form} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-lots-no-sale-rows")).toBeTruthy();
    expect(screen.queryByTestId("pre-deemed-lots-sale-row-0")).toBeNull();
  });
  it("환산(lots-only): 매도 건 행 없이 폼 전역 분모 칸 하나 — transferDatePriceAvg1Month", () => {
    const onChange = vi.fn();
    render(<PreDeemedLotsClause1Card form={lotsOnlyForm()} onChange={onChange} />);
    expect(screen.queryByTestId("pre-deemed-lots-sale-row-0")).toBeNull();
    fireEvent.change(screen.getByTestId("pre-deemed-lots-transfer-std"), { target: { value: "90000" } });
    expect(onChange).toHaveBeenCalledWith({ transferDatePriceAvg1Month: "90000" });
  });
  it("매매사례(비상장): 의제취득일 기준 사례 블록 + 개산공제 기준 순손익·순자산 · 환산 입력칸은 없다", () => {
    const onChange = vi.fn();
    render(<PreDeemedLotsClause1Card form={splitForm({ marketType: "unlisted", preDeemedLotClause1Mode: "sale_case" })} onChange={onChange} />);
    expect(card()!.textContent).toContain("의제취득일 현재 매매사례가액 (영§176의2③1호·④1호)"); // 사례 블록 제목(기준일 라벨)
    expect(card()!.textContent).toContain("의제취득일 전후 3개월");
    expect(screen.queryByTestId("pre-deemed-lots-deemed-std")).toBeNull();
    const na = card()!.querySelector('[data-field="acquisitionYearNetAssetPerShare"] input') as HTMLInputElement;
    fireEvent.change(na, { target: { value: "100000" } });
    expect(onChange).toHaveBeenCalledWith({ acquisitionYearNetAssetPerShare: "100000" });
    const ni = card()!.querySelector('[data-field="acquisitionYearNetIncomePerShare"] input') as HTMLInputElement;
    fireEvent.change(ni, { target: { value: "50000" } });
    expect(onChange).toHaveBeenCalledWith({ acquisitionYearNetIncomePerShare: "50000" });
  });
  it("placeholder 에 숫자 예시가 없다", () => {
    render(<PreDeemedLotsClause1Card form={splitForm()} onChange={vi.fn()} />);
    for (const el of Array.from(card()!.querySelectorAll("[placeholder]"))) {
      expect(el.getAttribute("placeholder")).not.toMatch(/\d/);
    }
  });
});

describe("PU-4: 매도 건 양도일 변경 → 그 건의 분모만 비운다", () => {
  const dateInputs = (scope: HTMLElement) => ({
    y: scope.querySelector('input[aria-label="연도"]') as HTMLInputElement,
  });
  it("양도일을 바꾸면 해당 매도 건의 transferStdPricePerShare 가 \"\" 로, 다른 건은 그대로", () => {
    const onChange = vi.fn();
    const form = twoSaleForm({
      transferLots: [
        { id: "t1", transferDate: "2025-12-01", shareCount: "1000", perShareTransferPrice: "200000", transferStdPricePerShare: "100000" },
        { id: "t2", transferDate: "2025-12-02", shareCount: "500", perShareTransferPrice: "210000", transferStdPricePerShare: "90000" },
      ],
    });
    render(<SplitLotsBlock form={form} onChange={onChange} />);
    const card1 = screen.getByText("매도 #1").closest("div.border-emerald-300") as HTMLElement;
    fireEvent.change(dateInputs(card1).y, { target: { value: "2024" } });
    const patch = onChange.mock.calls.at(-1)![0] as { transferLots: { id: string; transferDate: string; transferStdPricePerShare?: string }[] };
    expect(patch.transferLots[0].transferStdPricePerShare).toBe("");
    expect(patch.transferLots[0].transferDate).not.toBe("2025-12-01");
    expect(patch.transferLots[1].transferStdPricePerShare).toBe("90000");
  });
  it("양도일이 아닌 칸(주식수)을 바꾸면 분모는 유지된다", () => {
    const onChange = vi.fn();
    render(<SplitLotsBlock form={splitForm()} onChange={onChange} />);
    const card1 = screen.getByText("매도 #1").closest("div.border-emerald-300") as HTMLElement;
    const sharesInput = within(card1).getAllByRole("textbox").find((el) => (el as HTMLInputElement).value === "1,000")!;
    fireEvent.change(sharesInput, { target: { value: "900" } });
    const patch = onChange.mock.calls.at(-1)![0] as { transferLots: { transferStdPricePerShare?: string }[] };
    expect(patch.transferLots[0].transferStdPricePerShare).toBe("100000");
  });
});

describe("PU-5: ⑥ 분할 미리보기 — 산정 열·요약", () => {
  it("① 환산 채택 → 「① 환산」 열 · 요약에 채택 주식수/매도 주식수", () => {
    render(<SplitAllocationPreviewCard form={splitForm()} side="acquisition" />);
    expect(screen.getByTestId("split-preview-basis").textContent).toBe("① 환산");
    expect(screen.getByTestId("split-preview-clause1-summary").textContent).toContain("① 채택 1,000주 / 매도 1,000주");
    expect(screen.getByTestId("split-preview-acquisition-total").textContent).toBe("40,000,000");
  });
  it("② 가 더 큰 경우(분모가 커 ① 이 작다) → 「② 물가상승」 열", () => {
    render(<SplitAllocationPreviewCard form={splitForm({ acquisitionDatePriceAvg1Month: "1000" })} side="acquisition" />);
    expect(screen.getByTestId("split-preview-basis").textContent).toBe("② 물가상승");
  });
  it("① none → 산정 열·요약이 없다(② 만 적용된 값은 그대로 보인다)", () => {
    render(<SplitAllocationPreviewCard form={splitForm({ preDeemedLotClause1Mode: "none" })} side="acquisition" />);
    expect(screen.queryByTestId("split-preview-basis")).toBeNull();
    expect(screen.queryByTestId("split-preview-clause1-summary")).toBeNull();
  });
});

describe("PU-6: ⑦ 결과 카드", () => {
  const resultOf = (f: StockTransferFormData) => runFullStack(f);
  const renderResult = (f: StockTransferFormData) => {
    const r = resultOf(f);
    render(<PreDeemedLotsResultCard detail={r.preDeemedLotsDetail!} matched={r.lotMatchingDetail?.matched} />);
    return r;
  };
  it("① 환산 채택 — ② 표(지수비) · 건별 채택 · 귀속 근거 · 법령상 명문 없음 고지 · 「원」 미표기", () => {
    const r = renderResult(splitForm());
    const root = screen.getByTestId("pre-deemed-lots-result-card");
    expect(within(root).getByTestId("pre-deemed-lots-clause2-table").textContent).toContain("매수 #1");
    expect(within(root).getByTestId("pre-deemed-lots-selected").textContent).toBe("① 채택");
    const settlement = within(root).getByTestId("pre-deemed-lots-settlement");
    expect(settlement.textContent).toContain((r.expenses).toLocaleString("ko-KR"));
    expect(settlement.textContent).toContain("양도 주식수 비례");
    expect(within(root).getByTestId("pre-deemed-lots-no-statute").textContent).toContain("법령상 명문은 없어");
    expect(root.textContent).not.toMatch(/\d원/);
  });
  it("② 채택 건 — 「② 채택」 · 개산공제 행이 없다(① 채택분 없음)", () => {
    renderResult(splitForm({ acquisitionDatePriceAvg1Month: "1000" }));
    expect(screen.getByTestId("pre-deemed-lots-selected").textContent).toBe("② 채택");
    expect(screen.queryByTestId("pre-deemed-lots-settlement")).toBeNull();
  });
  it("① none → «① 미산정» 고지 · 건별 표 없음", () => {
    renderResult(splitForm({ preDeemedLotClause1Mode: "none" }));
    expect(screen.getByTestId("pre-deemed-lots-clause1-none").textContent).toContain("① 미산정");
    expect(screen.queryByTestId("pre-deemed-lots-sublot-table")).toBeNull();
  });
  it("두 매도 건 — 매수 건×매도 건 행이 엔진 matched 개수와 같다", () => {
    const r = resultOf(twoSaleForm());
    render(<PreDeemedLotsResultCard detail={r.preDeemedLotsDetail!} matched={r.lotMatchingDetail?.matched} />);
    const rows = screen.getByTestId("pre-deemed-lots-sublot-table").querySelectorAll("tbody tr");
    expect(rows.length).toBe((r.lotMatchingDetail!.matched).filter((m) => m.preDeemedSelected !== undefined).length);
  });
  it("§97②2호 단서(swap) — 카드가 제거분을 밝히고, 매칭 카드가 총액≠결과 취득가액을 설명한다", () => {
    const f = splitForm({ acquisitionDatePriceAvg1Month: "6500", actualExpenses: "30000000" });
    const r = resultOf(f);
    const st = r.preDeemedLotsDetail!.clause1!.settlement!;
    expect(st.swapApplied).toBe(true);
    render(
      <>
        <PreDeemedLotsResultCard detail={r.preDeemedLotsDetail!} matched={r.lotMatchingDetail?.matched} />
        <LotMatchingDetailCard detail={r.lotMatchingDetail!} swapRemovedAcquisition={st.swapRemovedAcquisition} />
      </>,
    );
    expect(screen.getByTestId("pre-deemed-lots-swap").textContent).toContain(st.swapRemovedAcquisition.toLocaleString("ko-KR"));
    expect(screen.getByTestId("lot-swap-removed-note").textContent).toContain(st.swapRemovedAcquisition.toLocaleString());
  });
  it("swap 이 아니면 매칭 카드에 단서 안내가 없다", () => {
    const r = resultOf(splitForm());
    render(<LotMatchingDetailCard detail={r.lotMatchingDetail!} swapRemovedAcquisition={r.preDeemedLotsDetail?.clause1?.settlement?.swapRemovedAcquisition} />);
    expect(screen.queryByTestId("lot-swap-removed-note")).toBeNull();
  });
  it("이동평균법 — 풀 평균 문구로 대체(건별 표 없음)", () => {
    renderResult(splitForm({ costAllocationMethod: "moving_avg" }));
    expect(screen.getByTestId("pre-deemed-lots-pooled")).toBeTruthy();
    expect(screen.queryByTestId("pre-deemed-lots-sublot-table")).toBeNull();
  });
});

describe("PU-7: Step3 안내", () => {
  it("① 가 켜진 lot 모드에서만 개산공제·귀속 안내가 뜬다", () => {
    render(<Step3 form={splitForm()} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-lots-expense-note").textContent).toContain("개산공제");
    cleanup();
    render(<Step3 form={splitForm({ preDeemedLotClause1Mode: "none" })} onChange={vi.fn()} />);
    expect(screen.queryByTestId("pre-deemed-lots-expense-note")).toBeNull();
    cleanup();
    render(<Step3 form={lotsOnlyForm()} onChange={vi.fn()} />);
    expect(screen.getByTestId("pre-deemed-lots-expense-note")).toBeTruthy();
  });
});

describe("PU-8: 사이드바 (결과 도착 전)", () => {
  const withForm = (f: StockTransferFormData) =>
    useStockTransferStore.setState({ formData: f, savedItems: [], result: null, aggregateResult: null });

  it("lots-only ① 환산 — 취득가액 40,000,000(엔진 미리보기) · 입력 실비 행은 숨긴다(개산공제·귀속 후 확정)", () => {
    withForm(lotsOnlyForm({ actualExpenses: "5000" }));
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    expect(screen.getByText("40,000,000")).toBeTruthy();
    expect(screen.queryByText("필요경비")).toBeNull();
  });
  it("lots-only ① none — ② 만 적용한 취득가액 12,910,000(가중평균 근사 아님) · 입력 실비 행은 그대로", () => {
    withForm(lotsOnlyForm({ preDeemedLotClause1Mode: "none", actualExpenses: "5000" }));
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    expect(screen.getByText("12,910,000")).toBeTruthy();
    expect(screen.getByText("필요경비")).toBeTruthy();
    expect(screen.getByText("5,000")).toBeTruthy();
  });
  it("분할 ① 환산 — 취득가액 40,000,000 · 필요경비 행 숨김", () => {
    withForm(splitForm({ actualExpenses: "5000" }));
    render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
    expect(screen.getByText("40,000,000")).toBeTruthy();
    expect(screen.queryByText("필요경비")).toBeNull();
  });
});

describe("PU-9: 신고서 11행 라벨", () => {
  const label11 = (f: StockTransferFormData) => {
    const r = runFullStack(f);
    const { columns } = deriveColumns(r);
    return buildRows(r, columns).find((x) => x.label.startsWith("11."))!.label;
  };
  it("① 비교가 켜지면 «많은 것 — 매수 건별 ①·② 채택은 결과 카드»", () => {
    expect(label11(splitForm())).toBe("11. 취득가액 (영 §176의2④ 많은 것 — 매수 건별 ①·② 채택은 결과 카드)");
  });
  it("① none 이면 ② 만 적용한 라벨", () => {
    expect(label11(splitForm({ preDeemedLotClause1Mode: "none" }))).toBe("11. 취득가액 (② = 실가 + 생산자물가상승분 · 영 §176의2④2호)");
  });
});
