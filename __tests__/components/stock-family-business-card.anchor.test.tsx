/**
 * @vitest-environment jsdom
 *
 * anchor: 주식 §97의2④ 가업상속 카드(⑤) · 사이드바(⑥) · 결과 카드(⑦) — PR-1d 단건 취득
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3
 * K-1 노출·disabled · K-2 era 쌍 전환(양도일에서 파생) · K-3 잔존값 미노출 · S 사이드바 · R 결과 카드
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { StockFamilyBusinessCard } from "@/components/calc/stock-transfer/StockFamilyBusinessCard";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { createInitialStockFormData, useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";

afterEach(cleanup);

function form(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "예제법인",
    marketType: "unlisted",
    acquisitionCause: "inheritance",
    acquisitionDate: "2024-03-01",
    transferDate: "2026-06-01",
    shareCount: "10000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "per_share",
    perShareAcquisitionPrice: "50000",
    familyBusinessInheritance: true,
    fbDecedentPerSharePrice: "5000",
    fbCorpTotalAssets: "5000000000",
    fbCorpNonBusinessAssets: "1000000000",
    ...o,
  };
}

/** 카드를 실제 상태로 구동하는 래퍼 — onChange가 폼을 갱신한다 */
function Harness({ initial }: { initial: StockTransferFormData }) {
  const [f, setF] = useState(initial);
  return <StockFamilyBusinessCard form={f} onChange={(p) => setF((prev) => ({ ...prev, ...p }))} />;
}

describe("K-1 카드 노출·disabled", () => {
  it("K-1-1 상속 + 실가 단건 — 토글과 입력칸이 보인다", () => {
    render(<Harness initial={form()} />);
    expect(screen.getByTestId("stock-fb-toggle")).toBeTruthy();
    expect(screen.getByTestId("stock-fb-decedent-per-share")).toBeTruthy();
    expect(screen.getByTestId("stock-fb-decedent-capex")).toBeTruthy();
  });

  it("K-1-2 취득원인이 매매면 카드가 없다(대조군)", () => {
    render(<Harness initial={form({ acquisitionCause: "purchase" })} />);
    expect(screen.queryByTestId("stock-fb-toggle")).toBeNull();
  });

  it("K-1-3 국외주식·분할 모드면 카드가 없다", () => {
    const { rerender } = render(<Harness initial={form({ marketType: "foreign_stock" })} />);
    expect(screen.queryByTestId("stock-fb-toggle")).toBeNull();
    rerender(<Harness initial={form({ lotsMode: "split" })} />);
    expect(screen.queryByTestId("stock-fb-toggle")).toBeNull();
  });

  it("K-1-4 환산 모드면 카드는 보이되 disabled + 사유 — 입력칸은 없다(OFF도 tone 유지)", () => {
    render(<Harness initial={form({ acquisitionMode: "estimated" })} />);
    const toggle = screen.getByTestId("stock-fb-toggle");
    expect(toggle.textContent).toContain("실지거래가액");
    expect(screen.queryByTestId("stock-fb-body")).toBeNull();
    expect(within(toggle).getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("K-1-5 일자별 다건(lots) 취득이면 disabled + lot 미지원 사유", () => {
    render(<Harness initial={form({ acquisitionActualInputMode: "lots" })} />);
    expect(screen.getByTestId("stock-fb-toggle").textContent).toContain("취득 lot 단위");
    expect(screen.queryByTestId("stock-fb-body")).toBeNull();
  });

  it("K-1-6 토글을 켜면 입력칸이 열린다 — 켠 직후 값은 모두 빈칸(자동 채움 없음)", () => {
    render(<Harness initial={form({ familyBusinessInheritance: false, fbDecedentPerSharePrice: "", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" })} />);
    expect(screen.queryByTestId("stock-fb-body")).toBeNull();
    fireEvent.click(within(screen.getByTestId("stock-fb-toggle")).getByRole("switch"));
    expect(screen.getByTestId("stock-fb-body")).toBeTruthy();
    expect((screen.getByTestId("stock-fb-decedent-per-share") as HTMLInputElement).value).toBe("");
    expect((screen.getByTestId("stock-fb-corp-total-assets") as HTMLInputElement).value).toBe("");
  });
});

describe("K-2 적용률 쌍은 양도일에서 파생된다 (% 직접 입력 없음)", () => {
  it("K-2-1 양도일 2026-06-01 — 법인 총자산·사업무관자산 쌍", () => {
    render(<Harness initial={form()} />);
    expect(screen.getByTestId("stock-fb-pair-corporate")).toBeTruthy();
    expect(screen.queryByTestId("stock-fb-pair-deduction")).toBeNull();
    expect(screen.queryByText(/직접 입력/)).toBeNull();
  });

  it("K-2-2 양도일 2026-02-26 — 공제금액·가업상속 재산가액 쌍, 반대편 쌍 값은 화면에 없다", () => {
    render(<Harness initial={form({ transferDate: "2026-02-26" })} />);
    expect(screen.getByTestId("stock-fb-pair-deduction")).toBeTruthy();
    expect(screen.queryByTestId("stock-fb-pair-corporate")).toBeNull();
    // 새 쌍이 빈칸이다 — 조용한 전환(자동 채움) 없음
    expect((screen.getByTestId("stock-fb-deduction-amount") as HTMLInputElement).value).toBe("");
  });

  it("K-2-3 양도일이 비면 쌍 대신 안내", () => {
    render(<Harness initial={form({ transferDate: "" })} />);
    expect(screen.getByTestId("stock-fb-era-pending")).toBeTruthy();
    expect(screen.queryByTestId("stock-fb-pair-corporate")).toBeNull();
    expect(screen.queryByTestId("stock-fb-pair-deduction")).toBeNull();
  });

  it("K-2-4 입력을 바꾸면 폼이 갱신된다(onChange 직접 — 미러링 없음) · 미리보기가 의제값 140,000,000", () => {
    render(<Harness initial={form()} />);
    expect(screen.getByTestId("stock-fb-preview").textContent).toContain("140,000,000");
    fireEvent.change(screen.getByTestId("stock-fb-corp-non-business"), { target: { value: "0" } });
    // 적용률 100% → 의제 = 피상속인 5,000 × 10,000 = 50,000,000
    expect(screen.getByTestId("stock-fb-preview").textContent).toContain("50,000,000");
  });

  it("K-2-5 입력이 미완결이면 미리보기가 없다", () => {
    render(<Harness initial={form({ fbCorpTotalAssets: "" })} />);
    expect(screen.queryByTestId("stock-fb-preview")).toBeNull();
  });

  it("K-2-6 §18의2⑩ 공제액은 이 양도세에서 빼지 않는다는 문구", () => {
    render(<Harness initial={form()} />);
    expect(screen.getByTestId("stock-fb-body").textContent).toContain("이 양도소득세에서 빼지 않으며");
  });

  it("K-2-7 상속개시일 2014.1.1. 전이면 특례 미적용 안내 · 미리보기 없음", () => {
    render(<Harness initial={form({ acquisitionDate: "2013-12-31" })} />);
    expect(screen.getByTestId("stock-fb-body").textContent).toContain("특례 미적용");
    expect(screen.queryByTestId("stock-fb-preview")).toBeNull();
  });
});

describe("S ⑥ 사이드바 — 결과 전 취득가액", () => {
  beforeEach(() => {
    useStockTransferStore.setState({ savedItems: [], result: null, aggregateResult: null });
  });
  const sidebar = (f: StockTransferFormData) => {
    useStockTransferStore.setState({ formData: f });
    return render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
  };

  it("S-1 입력 완결 — 의제 취득가액 140,000,000 (상속평가 500,000,000이 아니다)", () => {
    sidebar(form());
    expect(screen.getByText("취득가액 (§97의2④ 의제)")).toBeTruthy();
    expect(screen.getByText("140,000,000")).toBeTruthy();
    expect(screen.queryByText("500,000,000")).toBeNull();
  });

  it("S-2 미완결 — 행을 생략한다(상속평가 그대로 떨어뜨리지 않는다)", () => {
    sidebar(form({ fbCorpTotalAssets: "" }));
    expect(screen.queryByText("취득가액")).toBeNull();
    expect(screen.queryByText("취득가액 (§97의2④ 의제)")).toBeNull();
    expect(screen.queryByText("500,000,000")).toBeNull();
  });

  it("S-4 상속개시일 2014.1.1. 전(G-1) — 엔진처럼 상속평가 그대로이고 「의제」라 부르지 않는다(14지점 점검 L-1)", () => {
    sidebar(form({ acquisitionDate: "2013-12-31" }));
    expect(screen.getByText("취득가액")).toBeTruthy();
    expect(screen.queryByText("취득가액 (§97의2④ 의제)")).toBeNull();
    expect(screen.getByText("500,000,000")).toBeTruthy();
  });

  it("S-3 토글 OFF — 종전대로 상속평가 × 주식수", () => {
    sidebar(form({ familyBusinessInheritance: false }));
    expect(screen.getByText("취득가액")).toBeTruthy();
    expect(screen.getByText("500,000,000")).toBeTruthy();
  });
});

describe("R ⑦ 결과 카드 — 주식 상세", () => {
  const detailOf = (f: StockTransferFormData) => {
    const parsed = stockTransferInputSchema.parse(buildStockTransferApiBody(f));
    return calculateStockTransferTax(buildEngineInput(coerceDates(parsed as Record<string, unknown>, [...STOCK_DATE_FIELDS]))).familyBusinessDetail!;
  };
  const baseForm = () =>
    form({
      isMajorShareholder: true,
      selfShareRatio: "60",
      selfMarketCap: "2000000000",
      totalIssuedShares: "1000000",
      priorYearEndDate: "2025-12-31",
      transferPriceMode: "actual",
      transferActualInputMode: "per_share",
      perShareTransferPrice: "80000",
      filingDate: "2026-08-31",
    });

  it("R-1 1주당 × 주식수 행 · 법정량(총자산·사업무관자산) 분수 · 의제 140,000,000 · 공제 89,875,000", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detailOf(baseForm())} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("가업상속공제 주식 양도세 특례");
    expect(text).toContain("1주당 5,000 × 주식수 10,000");
    expect(text).toContain("법인 총자산가액 5,000,000,000");
    expect(text).toContain("사업무관자산가액 1,000,000,000");
    expect(text).toContain("140,000,000");
    expect(text).toContain("89,875,000");
    expect(text).not.toContain("÷");
    expect(screen.queryByTestId("fb-item-count-note")).toBeNull();
  });

  it("R-2 구 ③ 법정량(공제금액·가업상속 재산가액) 행", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detailOf({ ...baseForm(), transferDate: "2026-02-26", fbDeductionAmount: "8", fbBusinessEstateValue: "10" })} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("가업상속공제금액 8");
    expect(text).toContain("가업상속 재산가액 10");
  });

  it("R-3 가업 종목 2건 이상이면 신고 단위 결정세액 안내 — 종목끼리 더하지 말 것", () => {
    render(<FamilyBusinessImputedComparisonCard detail={{ ...detailOf(baseForm()), fbItemCount: 2 }} />);
    const note = screen.getByTestId("fb-item-count-note").textContent ?? "";
    expect(note).toContain("신고 단위 결정세액");
    expect(note).toContain("가업상속 종목 2건");
  });

  it("R-4 가업 종목 1건이라도 다종목 신고면 안내(비가업 종목 세액 포함) — 14지점 점검 M-1", () => {
    render(<FamilyBusinessImputedComparisonCard detail={detailOf(baseForm())} filingItemCount={2} />);
    const note = screen.getByTestId("fb-item-count-note").textContent ?? "";
    expect(note).toContain("종목 2건(가업상속 종목 1건 포함)");
  });

  it("R-5 사후관리 추징 연동 링크는 첫 카드에만 — showPostMgmtLink=false면 숨김", () => {
    const { unmount } = render(<FamilyBusinessImputedComparisonCard detail={detailOf(baseForm())} />);
    expect(screen.getByText(/사후관리 시뮬레이터/)).toBeTruthy();
    unmount();
    render(<FamilyBusinessImputedComparisonCard detail={detailOf(baseForm())} showPostMgmtLink={false} />);
    expect(screen.queryByText(/사후관리 시뮬레이터/)).toBeNull();
  });
});
