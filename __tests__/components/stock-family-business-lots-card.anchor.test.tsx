/**
 * @vitest-environment jsdom
 *
 * anchor: 주식 §97의2④ 가업상속 — **취득 lot 카드**(⑤) · 결과 표시(⑦) — PR-1d′
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.3·§7.7
 * L-1 lot 카드 노출·같은 컴포넌트 재사용(단건 카드와 복제 아님) · L-2 era 쌍(매도일) · L-3 시대 걸침 · L-4 단건 카드 안내 전환
 * L-5 입력 → lot patch(onUpdate) · R-1 미리보기 buyCost · R-2 로트별 매칭 상세 취득원가 열 · R-3 비교 카드 lots[]·pooled
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { AcquisitionLotCard } from "@/components/calc/stock-transfer/AcquisitionLotCard";
import { StockFamilyBusinessCard } from "@/components/calc/stock-transfer/StockFamilyBusinessCard";
import { SplitAllocationPreviewCard } from "@/components/calc/stock-transfer/SplitAllocationPreviewCard";
import { LotMatchingDetailCard } from "@/components/calc/results/LotMatchingDetailCard";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { createInitialStockFormData, createEmptyAcquisitionLot, useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import type { AcquisitionLotForm, StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { buildStockTransferApiBody } from "@/lib/calc/stock-transfer-tax-api";
import { stockTransferInputSchema, addStockRefines } from "@/lib/api/stock-transfer-tax-schema";
import { coerceDates } from "@/lib/api/date-coerce";
import { STOCK_DATE_FIELDS } from "@/lib/api/stock-transfer-date-fields";
import { buildEngineInput } from "@/lib/api/stock-transfer-engine-input";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";

afterEach(cleanup);

function lot(id: string, date: string, shares: string, perShare: string, o: Partial<AcquisitionLotForm> = {}): AcquisitionLotForm {
  return { ...createEmptyAcquisitionLot(), id, acquisitionDate: date, shareCount: shares, perShareAcquisitionPrice: perShare, ...o };
}

const FB = {
  familyBusinessInheritance: true,
  fbDecedentPerSharePrice: "5000",
  fbDecedentCapitalExpenditure: "12000000",
  fbCorpTotalAssets: "5000000000",
  fbCorpNonBusinessAssets: "1000000000",
} as const;

function lotsForm(o: Partial<StockTransferFormData> = {}): StockTransferFormData {
  return {
    ...createInitialStockFormData(),
    securityName: "예제법인",
    marketType: "unlisted",
    isMajorShareholder: true,
    selfShareRatio: "60",
    selfMarketCap: "2000000000",
    totalIssuedShares: "1000000",
    priorYearEndDate: "2025-12-31",
    acquisitionDate: "2023-01-10",
    transferDate: "2026-06-01",
    shareCount: "5000",
    transferActualInputMode: "per_share",
    perShareTransferPrice: "80000",
    acquisitionMode: "actual",
    acquisitionActualInputMode: "lots",
    costAllocationMethod: "fifo",
    acquisitionLots: [
      lot("a", "2023-01-10", "2000", "30000"),
      lot("c", "2024-01-15", "1000", "40000", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-01-01" }),
      lot("b", "2024-03-01", "6000", "50000", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-01-01", ...FB }),
    ],
    filingType: "preliminary",
    filingDate: "2026-08-31",
    ...o,
  };
}

/** lot 카드를 실제 상태로 구동 — onUpdate가 form.acquisitionLots[idx]를 갱신한다(Matrix·SplitLotsBlock과 같은 배선) */
function Harness({ initial, idx }: { initial: StockTransferFormData; idx: number }) {
  const [f, setF] = useState(initial);
  return (
    <AcquisitionLotCard
      lot={f.acquisitionLots[idx]}
      idx={idx}
      onUpdate={(patch) => setF((prev) => ({ ...prev, acquisitionLots: prev.acquisitionLots.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }))}
      onDelete={() => {}}
      radioNamePrefix="t"
      fbForm={f}
    />
  );
}

describe("L-1 lot 카드 노출 — 상속 lot에만, 같은 카드 컴포넌트", () => {
  it("L-1-1 가업 상속 lot(B): 토글·입력칸이 보이고 testid는 lot 행 접두", () => {
    render(<Harness initial={lotsForm()} idx={2} />);
    expect(screen.getByTestId("stock-fb-lot-2-toggle")).toBeTruthy();
    expect(screen.getByTestId("stock-fb-lot-2-body")).toBeTruthy();
    expect(screen.getByTestId("stock-fb-lot-2-decedent-per-share")).toBeTruthy();
    expect(screen.getByTestId("stock-fb-lot-2-pair-corporate")).toBeTruthy();
    expect(screen.queryByTestId("stock-fb-lot-2-pair-deduction")).toBeNull();
    // lot 맥락 문구
    const text = document.body.textContent ?? "";
    expect(text).toContain("이 lot 전체 주식수에 대한 총액");
    expect(text).toContain("이 매수 건의 취득일");
  });

  it("L-1-2 매매 lot(A)에는 카드가 없다(대조군) · 일반 상속 lot(C)에는 토글만(OFF)", () => {
    render(<Harness initial={lotsForm()} idx={0} />);
    expect(screen.queryByTestId("stock-fb-lot-0-toggle")).toBeNull();
    cleanup();
    render(<Harness initial={lotsForm()} idx={1} />);
    expect(screen.getByTestId("stock-fb-lot-1-toggle")).toBeTruthy();
    expect(screen.queryByTestId("stock-fb-lot-1-body")).toBeNull();
    expect(within(screen.getByTestId("stock-fb-lot-1-toggle")).getByRole("switch").getAttribute("aria-checked")).toBe("false");
  });

  it("L-1-3 단건 카드와 같은 컴포넌트 — fbForm이 없으면(맥락 없음) lot 카드를 그리지 않는다", () => {
    const f = lotsForm();
    render(
      <AcquisitionLotCard lot={f.acquisitionLots[2]} idx={2} onUpdate={() => {}} onDelete={() => {}} radioNamePrefix="t" />,
    );
    expect(screen.queryByTestId("stock-fb-lot-2-toggle")).toBeNull();
  });

  it("L-1-4 국외주식·단건 취득(lots 모드 아님)이면 lot 카드가 없다", () => {
    render(<Harness initial={lotsForm({ marketType: "foreign_stock" })} idx={2} />);
    expect(screen.queryByTestId("stock-fb-lot-2-toggle")).toBeNull();
    cleanup();
    render(<Harness initial={lotsForm({ acquisitionActualInputMode: "per_share" })} idx={2} />);
    expect(screen.queryByTestId("stock-fb-lot-2-toggle")).toBeNull();
  });

  it("L-1-5 환산 모드면 카드는 보이되 disabled + 사유(split에서만 도달 가능한 상태)", () => {
    render(<Harness initial={lotsForm({ lotsMode: "split", transferLots: [{ id: "t1", transferDate: "2026-06-01", shareCount: "5000", perShareTransferPrice: "80000" }], acquisitionMode: "estimated" })} idx={2} />);
    const toggle = screen.getByTestId("stock-fb-lot-2-toggle");
    expect(toggle.textContent).toContain("실지거래가액");
    expect(screen.queryByTestId("stock-fb-lot-2-body")).toBeNull();
  });
});

describe("L-2 적용률 쌍 — 매도일 시대로 갈린다 · 미리보기·이력 불러오기는 없다", () => {
  it("L-2-1 lots-only 양도일 2026-02-26 → 구 ③ 쌍", () => {
    render(<Harness initial={lotsForm({ transferDate: "2026-02-26" })} idx={2} />);
    expect(screen.getByTestId("stock-fb-lot-2-pair-deduction")).toBeTruthy();
    expect(screen.queryByTestId("stock-fb-lot-2-pair-corporate")).toBeNull();
  });

  it("L-2-2 이력 불러오기·단건 미리보기는 lot에 두지 않는다(미리보기는 취득가액 카드가 엔진 배정값으로)", () => {
    render(<Harness initial={lotsForm()} idx={2} />);
    expect(screen.queryByTestId("stock-fb-lookup-open")).toBeNull();
    expect(screen.queryByTestId("stock-fb-lot-2-preview")).toBeNull();
  });

  it("L-2-3 이동평균법이면 구분 관리 확인 필요 고지가 카드에 보인다", () => {
    render(<Harness initial={lotsForm({ costAllocationMethod: "moving_avg" })} idx={2} />);
    expect(screen.getByTestId("stock-fb-lot-2-moving-avg-notice").textContent).toContain("구분 관리 여부 확인 필요");
  });
});

describe("L-3 매도일이 2026-02-27을 사이에 두면 차단 문구 · 쌍 입력칸 없음", () => {
  it("L-3-1 split 매도 2건(02-26 · 02-27)", () => {
    render(
      <Harness
        initial={lotsForm({
          lotsMode: "split",
          transferLots: [
            { id: "t1", transferDate: "2026-02-26", shareCount: "2500", perShareTransferPrice: "80000" },
            { id: "t2", transferDate: "2026-02-27", shareCount: "2500", perShareTransferPrice: "80000" },
          ],
        })}
        idx={2}
      />,
    );
    expect(screen.getByTestId("stock-fb-lot-2-straddle").textContent).toContain("2026.2.26. 이전과 2026.2.27. 이후에 걸쳐");
    expect(screen.queryByTestId("stock-fb-lot-2-pair-corporate")).toBeNull();
    expect(screen.queryByTestId("stock-fb-lot-2-pair-deduction")).toBeNull();
    expect(screen.queryByTestId("stock-fb-lot-2-era-pending")).toBeNull();
  });

  it("L-3-2 매도일이 비면 era-pending 안내", () => {
    render(<Harness initial={lotsForm({ transferDate: "" })} idx={2} />);
    expect(screen.getByTestId("stock-fb-lot-2-era-pending").textContent).toContain("매도일");
  });
});

describe("L-4 단건 카드 — lot 모드에서는 「각 상속 lot 카드」 안내로 전환", () => {
  it("L-4-1 lots-only + 단건 취득원인 상속이면 disabled + 사유", () => {
    render(<StockFamilyBusinessCard form={lotsForm({ acquisitionCause: "inheritance" })} onChange={() => {}} />);
    const toggle = screen.getByTestId("stock-fb-toggle");
    expect(toggle.textContent).toContain("각 상속 lot 카드");
    expect(screen.queryByTestId("stock-fb-body")).toBeNull();
  });
});

describe("L-5 입력은 lot의 같은 이름 필드로 쓰인다", () => {
  it("L-5-1 토글 → familyBusinessInheritance, 입력 → fbDecedentPerSharePrice (lot patch)", () => {
    const initial = lotsForm({
      acquisitionLots: lotsForm().acquisitionLots.map((l) =>
        l.id === "b" ? { ...l, familyBusinessInheritance: false, fbDecedentPerSharePrice: "", fbCorpTotalAssets: "", fbCorpNonBusinessAssets: "" } : l,
      ),
    });
    render(<Harness initial={initial} idx={2} />);
    expect(screen.queryByTestId("stock-fb-lot-2-body")).toBeNull();
    fireEvent.click(within(screen.getByTestId("stock-fb-lot-2-toggle")).getByRole("switch"));
    expect(screen.getByTestId("stock-fb-lot-2-body")).toBeTruthy();
    // 켠 직후 값은 모두 빈칸(자동 채움 없음)
    expect((screen.getByTestId("stock-fb-lot-2-decedent-per-share") as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByTestId("stock-fb-lot-2-decedent-per-share"), { target: { value: "5000" } });
    expect((screen.getByTestId("stock-fb-lot-2-decedent-per-share") as HTMLInputElement).value).toBe("5,000");
  });

  it("L-5-2 data-field는 ⑧ 오류 경로(acquisitionLots[i].fb…)와 같다", () => {
    render(<Harness initial={lotsForm()} idx={2} />);
    // data-field는 CurrencyInput 래퍼에 붙는다(내부 input의 조상)
    expect(screen.getByTestId("stock-fb-lot-2-decedent-per-share").closest("[data-field]")?.getAttribute("data-field")).toBe("acquisitionLots[2].fbDecedentPerSharePrice");
    expect(screen.getByTestId("stock-fb-lot-2-corp-total-assets").closest("[data-field]")?.getAttribute("data-field")).toBe("acquisitionLots[2].fbCorpTotalAssets");
  });
});

// ── 결과 표시 ────────────────────────────────────────────────

function runLots(f: StockTransferFormData) {
  const body = buildStockTransferApiBody(f);
  const parsed = addStockRefines(stockTransferInputSchema).safeParse(body);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues.slice(0, 3)));
  return calculateStockTransferTax(buildEngineInput(coerceDates(parsed.data as Record<string, unknown>, [...STOCK_DATE_FIELDS])));
}

describe("R-1 취득가액 미리보기 — 가업 lot 행은 buyCost 총액", () => {
  it("R-1-1 행 취득가액 합 = 합계(131,200,000) · 가업 행은 의제 표지 + 31,200,000", () => {
    render(<SplitAllocationPreviewCard form={lotsForm({ lotsMode: "split", acquisitionActualInputMode: "per_share", acquisitionDate: "", transferDate: "", shareCount: "", transferLots: [{ id: "t1", transferDate: "2026-06-01", shareCount: "5000", perShareTransferPrice: "80000" }] })} side="acquisition" />);
    expect(screen.getByTestId("split-preview-acquisition-total").textContent).toBe("131,200,000");
    const rows = screen.getAllByTestId("split-preview-row-cost").map((e) => e.textContent);
    expect(rows).toEqual(["60,000,000", "40,000,000", "31,200,000"]);
    expect(screen.getAllByTestId("split-preview-fb-tag")).toHaveLength(1);
    expect(screen.getByTestId("split-preview-fb-summary").textContent).toContain("2,000주");
  });

  it("R-1-2 1주당 × 주식수로 다시 곱하면 어긋나는 사례 — 행은 총액을 쓴다(buyCost 무시 방지)", () => {
    // 피상속인 5,001 · 평가 50,001 · 적용률 5/7 → 의제 취득원가가 1주당 절사 × 주식수와 다르다
    const f = lotsForm({
      lotsMode: "split",
      acquisitionActualInputMode: "per_share",
      acquisitionDate: "",
      transferDate: "",
      shareCount: "",
      transferLots: [{ id: "t1", transferDate: "2026-06-01", shareCount: "5000", perShareTransferPrice: "80000" }],
      acquisitionLots: [
        lot("b", "2024-03-01", "6000", "50001", {
          acquisitionCause: "inheritance",
          decedentAcquisitionDate: "2015-01-01",
          ...FB,
          fbDecedentPerSharePrice: "5001",
          fbDecedentCapitalExpenditure: "",
          fbCorpTotalAssets: "7",
          fbCorpNonBusinessAssets: "2",
        }),
      ],
    });
    const m = runLots(f).lotMatchingDetail!.matched[0];
    expect(m.buyShares * m.perShareBuyPrice).not.toBe(m.buyCost);
    render(<SplitAllocationPreviewCard form={f} side="acquisition" />);
    expect(screen.getByTestId("split-preview-row-cost").textContent).toBe((m.buyCost as number).toLocaleString());
  });
});

describe("R-2 로트별 매칭 상세 — 취득원가 열", () => {
  it("R-2-1 가업 lot이 있으면 취득원가 열이 생기고 합계 행이 맞는다", () => {
    const r = runLots(lotsForm());
    render(<LotMatchingDetailCard detail={r.lotMatchingDetail!} />);
    const costs = screen.getAllByTestId("lot-detail-row-cost").map((e) => e.textContent);
    expect(costs).toEqual(["60,000,000", "40,000,000", "31,200,000"]);
    expect(screen.getAllByTestId("lot-detail-fb-tag")).toHaveLength(1);
  });

  it("R-2-1b 1주당(표시용 절사) × 주식수와 다른 사례 — 행 취득원가는 buyCost 총액이다(buyCost 무시 방지)", () => {
    const f = lotsForm({
      acquisitionLots: [
        lot("b", "2024-03-01", "6000", "50001", {
          acquisitionCause: "inheritance",
          decedentAcquisitionDate: "2015-01-01",
          ...FB,
          fbDecedentPerSharePrice: "5001",
          fbDecedentCapitalExpenditure: "",
          fbCorpTotalAssets: "7",
          fbCorpNonBusinessAssets: "2",
        }),
      ],
    });
    const r = runLots(f);
    const m = r.lotMatchingDetail!.matched[0];
    expect(m.buyShares * m.perShareBuyPrice).not.toBe(m.buyCost);
    render(<LotMatchingDetailCard detail={r.lotMatchingDetail!} />);
    expect(screen.getByTestId("lot-detail-row-cost").textContent).toBe((m.buyCost as number).toLocaleString());
  });

  it("R-2-2 가업 lot이 없으면(buyCost 없음) 열을 추가하지 않는다 — 종전 표와 같다", () => {
    const f = lotsForm({ acquisitionLots: lotsForm().acquisitionLots.map((l) => ({ ...l, familyBusinessInheritance: false })) });
    const r = runLots(f);
    render(<LotMatchingDetailCard detail={r.lotMatchingDetail!} />);
    expect(screen.queryByTestId("lot-detail-row-cost")).toBeNull();
  });

  it("R-2-3 이동평균 + 가업 lot — 확인 필요 고지가 매칭 상세에 보인다", () => {
    const r = runLots(lotsForm({ costAllocationMethod: "moving_avg" }));
    render(<LotMatchingDetailCard detail={r.lotMatchingDetail!} />);
    expect(document.body.textContent).toContain("구분 관리 여부 확인 필요");
  });
});

describe("R-3 비교 카드 — detail.lots[] · pooled", () => {
  const twoFbLots = () =>
    lotsForm({
      acquisitionLots: [
        lot("b1", "2024-03-01", "3000", "50000", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-01-01", ...FB, fbDecedentCapitalExpenditure: "" }),
        lot("b2", "2024-05-01", "3000", "60000", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2015-01-01", ...FB, fbDecedentPerSharePrice: "6000", fbDecedentCapitalExpenditure: "" }),
      ],
    });

  it("R-3-1 가업 lot 2개 이상 — lot별 표(배정 주식수·피상속인 1주당·의제 취득원가)와 합계 행 문구", () => {
    const d = runLots(twoFbLots()).familyBusinessDetail!;
    render(<FamilyBusinessImputedComparisonCard detail={d} />);
    const rows = screen.getAllByTestId("fb-lots-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("3,000");
    expect(rows[1].textContent).toContain("2,000");
    expect(rows[1].textContent).toContain("6,000");
    // lot별 의제 취득원가 합 = 상단 의제 취득가액
    const costs = d.lots!.map((l) => l.buyCost);
    expect(costs.reduce((s, c) => s + c, 0)).toBe(d.imputedAcquisitionPrice);
    expect(document.body.textContent).toContain("lot별 1주당은 아래 표");
  });

  it("R-3-1b 가업 lot 적용률이 서로 다르면(80% · 75%) 상단에 첫 lot 적용률을 쓰지 않는다 — lot별 표만(14지점 점검 lot M-2)", () => {
    const f = twoFbLots();
    f.acquisitionLots[1] = { ...f.acquisitionLots[1], fbCorpNonBusinessAssets: "1250000000" };
    const d = runLots(f).familyBusinessDetail!;
    expect(d.lots!.map((l) => l.appliedRate)).toEqual([0.8, 0.75]);
    render(<FamilyBusinessImputedComparisonCard detail={d} />);
    const text = document.body.textContent ?? "";
    expect(screen.queryByTestId("fb-rate-basis-row")).toBeNull();
    expect(text).toContain("lot별 적용률은 아래 표");
    expect(text).not.toContain("원취득가 × 80.00%");
  });

  it("R-3-2 가업 lot 1개면 lot별 표 없음(단건과 같은 표기)", () => {
    const d = runLots(lotsForm()).familyBusinessDetail!;
    render(<FamilyBusinessImputedComparisonCard detail={d} />);
    expect(screen.queryByTestId("fb-lots-table")).toBeNull();
    expect(document.body.textContent).toContain("1주당 5,000 × 주식수 2,000");
  });

  it("R-3-3 이동평균(pooled) — 「가업 주식 구분이 없어 아래 요약은 FIFO 물량 기준 참고값」 + 확인 필요 고지", () => {
    const d = runLots(lotsForm({ costAllocationMethod: "moving_avg" })).familyBusinessDetail!;
    expect(d.pooled).toBe(true);
    render(<FamilyBusinessImputedComparisonCard detail={d} />);
    const note = screen.getByTestId("fb-pooled-note").textContent ?? "";
    expect(note).toContain("이동평균법에서는 가업 주식 구분이 없어 아래 요약은 FIFO 물량 기준 참고값");
    expect(note).toContain("구분 관리 여부 확인 필요");
  });
});

describe("S ⑥ 사이드바 — lot 모드 결과 전 취득가액은 엔진 배정값(의제 포함)", () => {
  const sidebar = (f: StockTransferFormData) => {
    useStockTransferStore.setState({ savedItems: [], result: null, aggregateResult: null, formData: f });
    return render(<StockSidebar currentStep={1} onStepClick={() => {}} />);
  };

  it("S-1 입력 완결 — 131,200,000(상속평가 × 배정 주식수 합 160,000,000이 아니다) · 라벨에 의제 표기", () => {
    sidebar(lotsForm());
    expect(screen.getByText("취득가액 (§97의2④ 의제 포함)")).toBeTruthy();
    expect(screen.getByText("131,200,000")).toBeTruthy();
    expect(screen.queryByText("160,000,000")).toBeNull();
  });

  it("S-2 가업 입력 미완결 — 행을 생략한다(엔진 throw 상태를 일반값으로 떨어뜨리지 않는다)", () => {
    sidebar(lotsForm({ acquisitionLots: lotsForm().acquisitionLots.map((l) => (l.id === "b" ? { ...l, fbCorpTotalAssets: "" } : l)) }));
    expect(screen.queryByText("취득가액")).toBeNull();
    expect(screen.queryByText("취득가액 (§97의2④ 의제 포함)")).toBeNull();
  });

  it("S-3 토글 OFF — 종전 일반값(200,000,000)과 「의제」 표기 없음", () => {
    sidebar(lotsForm({ acquisitionLots: lotsForm().acquisitionLots.map((l) => ({ ...l, familyBusinessInheritance: false })) }));
    expect(screen.getByText("취득가액")).toBeTruthy();
    expect(screen.getByText("200,000,000")).toBeTruthy();
  });
});
