/**
 * 일체 주택 본인 신축 × §114조의2 가산세(건물분) — 결과 4뷰(카드·상세명세서·신고서·PDF) + 함께 양도·다건 (Q-12 PR-3 ⑦, 표시 전용 · 세액 불변)
 * 계획서: docs/00-pm/self-built-housing-building-base-114-2.plan.md §7.9 · Q-7(고지 초안 B) · Q-8(산정방식별 라벨) · Q-13(`selfBuiltPenaltyView`)
 *
 * 실제 폼 → ④ → route(POST) → 결과를 4뷰가 같은 문장 정본(`selfBuiltPenaltyView`)으로 읽는지 잠근다.
 *  · echo 가 있으면(건물분 base) 산식·5년 기산·고지(「적용했다 + 정면 해석례 미확보 — 확인 필요」)가 한 번씩 뜬다
 *  · echo 가 없으면(비주택·증축·분리·실가·5년 경과·이월과세 등) 어느 뷰에도 흔적이 없고 종전 문구 그대로다(회귀 0)
 *  · 영 §164⑨ 공익수용·공매 특례(PR-A): 환산이면 특례 줄·고지 변형·각주 접미가 4뷰에 같은 문장으로 뜬다 — 계획서 docs/00-pm/self-built-housing-164-9-plan.md §5.4
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));

import { NextRequest } from "next/server";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { BundledAllocationCard, aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSection, TransferMultiSection } from "@/lib/pdf/ResultPdfTransferSections";
import { selfBuiltPenaltyView } from "@/lib/tax-engine/transfer-tax-self-built-display";
import { buildMultiBody } from "../calc/_helpers/single-multi-route-parity";
import { bundledForm, calc, sbForm, SB_APPRAISAL } from "../calc/_self-built-housing-fixture";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

afterEach(() => cleanup());
beforeAll(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const CONFIRM = "일체 주택의 건물분만 기준으로 하는 정면 해석례는 확인하지 못했습니다 — 확인 필요.";
const FORM = { transferDate: "2026-03-01", contractTotalPrice: "1000000000", assets: [{ acquisitionDate: "", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;

const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
const pdfText = (r: TransferTaxResult) => collect(TransferSection({ r: r as unknown as Record<string, unknown> })).join("\n");
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

async function single(over: Partial<AssetForm> = {}): Promise<{ r: TransferTaxResult; f: TransferFormData }> {
  const f = sbForm(over);
  const out = await calc(f);
  expect(out.status, JSON.stringify(out.json)).toBe(200);
  return { r: out.result as unknown as TransferTaxResult, f };
}

type Cell = { r: TransferTaxResult; f: TransferFormData };
let EST: Cell; // 환산 · 대표 셀
let AP_DIRECT: Cell; // 감정 · 건물 감정가액 직접
let AP_NOSPLIT: Cell; // 감정 · 구분 표시 없음 → 기준시가 비례
let OFF_BUILDING: Cell; // 비주택 건물 신축 환산 — 가산세는 있으나 echo 없음(자산 전체 base)
let OFF_EXT: Cell; // 증축 — echo 없음
let OFF_SEP: Cell; // 토지·건물 취득일 분리 — 건물 파트 축, echo 없음
let OFF_ACTUAL: Cell; // 실거래가 — 가산세 없음

beforeAll(async () => {
  EST = await single();
  AP_DIRECT = await single({ ...SB_APPRAISAL, selfBuiltBuildingAppraisal: "110000000" });
  AP_NOSPLIT = await single({ ...SB_APPRAISAL, selfBuiltAppraisalNoSplit: true });
  OFF_BUILDING = await single({ assetKind: "building" } as Partial<AssetForm>);
  OFF_EXT = await single({ buildingType: "extension", extensionFloorArea: "100", extensionStdPriceAtAcquisition: "15000000" } as Partial<AssetForm>);
  OFF_SEP = await single({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2015-05-01" } as Partial<AssetForm>);
  OFF_ACTUAL = await single({ useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" });
});

const renderView = (c: Cell) => render(<TransferTaxResultView result={c.r} onReset={() => {}} onBack={() => {}} formData={c.f} />);
const stmtPenalty = (r: TransferTaxResult) => text(buildStatementItems(r, FORM, undefined, undefined, 1_000_000_000).get("penaltyTax")!.formula);
const penaltyRow = (r: TransferTaxResult) => buildRows(r, deriveColumns(r).mode, FORM, undefined, 1_000_000_000).find((x) => x.label.includes("가산세"))!;

describe("엔진 echo 전제 (④ → route 실경로)", () => {
  it("환산: 건물분 base 187,500,000 · 가산세 9,375,000 · 토지분 제외 내역", () => {
    expect(EST.r.penaltyBase).toBe(187_500_000);
    expect(EST.r.selfBuiltHousingPenalty).toMatchObject({
      method: "estimated",
      base: 187_500_000,
      penalty: 9_375_000,
      formula: { multiplicand: 400_000_000, numerator: 75_000_000, denominator: 160_000_000 },
      housingSplit: { acquisitionHousing: 200_000_000, acquisitionLand: 125_000_000, acquisitionBuilding: 75_000_000, transferHousing: 400_000_000, transferLand: 240_000_000, transferBuilding: 160_000_000 },
    });
  });
  it("감정: 직접 1.1억 / 구분 표시 없음 → 기준시가 비례 112,500,000", () => {
    expect(AP_DIRECT.r.selfBuiltHousingPenalty).toMatchObject({ method: "appraisal", base: 110_000_000, penalty: 5_500_000, appraisal: { mode: "direct" } });
    expect(AP_NOSPLIT.r.selfBuiltHousingPenalty).toMatchObject({ method: "appraisal", base: 112_500_000, penalty: 5_625_000, appraisal: { mode: "apportioned", totalAppraisal: 300_000_000 } });
  });
  it("범위 밖(비주택·증축·분리·실가)은 echo 가 없다", () => {
    for (const c of [OFF_BUILDING, OFF_EXT, OFF_SEP, OFF_ACTUAL]) expect(c.r.selfBuiltHousingPenalty).toBeUndefined();
    expect(OFF_BUILDING.r.penaltyTax).toBe(25_000_000);
    expect(OFF_EXT.r.penaltyTax).toBe(1_875_000);
    expect(OFF_ACTUAL.r.penaltyTax).toBe(0);
  });
});

describe("① 결과 카드 (단건 TransferTaxResultView)", () => {
  it("환산: 5년 기산 + 건물분 산식(분수) + 주택공시가격 토지·건물 분해 + 가산세 산식 + 고지(1회)", () => {
    const { container } = renderView(EST);
    const card = screen.getByTestId("self-built-penalty-card");
    expect(screen.getByText("본인 신축 건물 환산취득가액 가산세 (소득세법 §114조의2)")).toBeInTheDocument();
    expect(screen.getByTestId("self-built-window").textContent).toBe("신축 취득일 2022-01-10부터 5년이 되는 날(2027-01-10)까지 양도하는 경우입니다.");
    const t = card.textContent!;
    expect(t).toContain("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 ×");
    const frac = card.querySelector("span.inline-flex.flex-col")!;
    expect(frac.children[0].textContent).toBe("취득 당시 건물분 기준시가 75,000,000");
    expect(frac.children[1].textContent).toBe("양도 당시 건물분 기준시가 160,000,000");
    expect(t).toContain("취득 당시 주택공시가격 200,000,000 = 토지분 125,000,000 + 건물분 75,000,000");
    expect(t).toContain("양도 당시 주택공시가격 400,000,000 = 토지분 240,000,000 + 건물분 160,000,000");
    expect(t).toContain("토지분은 가산세 대상에서 제외합니다");
    expect(screen.getByTestId("self-built-penalty-line").textContent).toBe("가산세 9,375,000 = 187,500,000 × 5%");
    expect(screen.getByTestId("self-built-notice").textContent).toContain(CONFIRM);
    expect(screen.getByTestId("self-built-notice").textContent).toContain("환산취득가액을 가산세 기준으로 보아 건물분만 적용했습니다(토지분 제외)");
    // 고지는 이 화면 전체(신고서·명세서·카드)에서 정확히 한 번
    expect(count(container.textContent!, CONFIRM)).toBe(1);
  });

  it("감정 직접 입력: 건물 감정가액 그대로(안분 없음) · 제목이 감정가액", () => {
    renderView(AP_DIRECT);
    const card = screen.getByTestId("self-built-penalty-card");
    expect(screen.getByText("본인 신축 건물 감정가액 가산세 (소득세법 §114조의2)")).toBeInTheDocument();
    expect(card.textContent).toContain("건물 감정가액 110,000,000 (감정평가서에 구분 표시된 건물 감정가액 — 토지분을 안분하지 않습니다)");
    expect(screen.getByTestId("self-built-penalty-line").textContent).toBe("가산세 5,500,000 = 110,000,000 × 5%");
    expect(screen.getByTestId("self-built-notice").textContent).toContain("감정평가서에 구분 표시된 건물 감정가액만 적용했습니다(토지분 제외)");
    expect(screen.getByTestId("self-built-notice").textContent).toContain(CONFIRM);
  });

  it("감정 구분 표시 없음: 감정가액 총액 × 건물 ÷ (토지 + 건물) 기준시가 비례", () => {
    renderView(AP_NOSPLIT);
    const card = screen.getByTestId("self-built-penalty-card");
    expect(card.textContent).toContain("건물분 감정가액 112,500,000 = 감정가액 총액 300,000,000 ×");
    const frac = card.querySelector("span.inline-flex.flex-col")!;
    expect(frac.children[0].textContent).toBe("취득 당시 건물 기준시가 60,000,000");
    expect(frac.children[1].textContent).toBe("(취득 당시 토지 기준시가 100,000,000 + 건물 기준시가 60,000,000)");
    expect(screen.getByTestId("self-built-penalty-line").textContent).toBe("가산세 5,625,000 = 112,500,000 × 5%");
    expect(screen.getByTestId("self-built-notice").textContent).toContain("취득 당시 토지 기준시가와 건물 기준시가의 비율로 나누어 구했습니다");
  });

  it("echo 없음(비주택·증축·분리·실가): 카드 없음 · 고지 없음", () => {
    for (const c of [OFF_BUILDING, OFF_EXT, OFF_SEP, OFF_ACTUAL]) {
      const { container } = renderView(c);
      expect(screen.queryByTestId("self-built-penalty-card")).toBeNull();
      expect(container.textContent).not.toContain("본인 신축 건물");
      expect(container.textContent).not.toContain(CONFIRM);
      cleanup();
    }
  });

  it("표시 문구에 유불리·절감·변수 약어·「원」 접미사·절사 표기가 없다", () => {
    for (const c of [EST, AP_DIRECT, AP_NOSPLIT]) {
      const v = selfBuiltPenaltyView(c.r.selfBuiltHousingPenalty)!;
      const all = [v.title, v.windowLine, ...v.formulaLines, v.notice].join("\n");
      expect(all).not.toMatch(/유리|불리|절감|floor|B_acq|B_tr|S_b|\d원/);
    }
  });
});

describe("② 상세명세서", () => {
  it("환산: 본인 신축 건물 가산세 + 건물분 산식 · 종전의 «(= 전체 base × 5%)» 꼬리는 없다", () => {
    const f = stmtPenalty(EST.r);
    expect(f).toContain("§114조의2 본인 신축 건물 환산취득가액 가산세 9,375,000");
    expect(f).toContain("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 × (취득 당시 건물분 기준시가 75,000,000) ÷ (양도 당시 건물분 기준시가 160,000,000)");
    expect(f).toContain("취득 당시 주택공시가격 200,000,000 = 토지분 125,000,000 + 건물분 75,000,000");
    expect(f).toContain("가산세 9,375,000 = 187,500,000 × 5%");
  });
  it("감정 — 라벨이 감정가액 (Q-8)", () => {
    expect(stmtPenalty(AP_DIRECT.r)).toContain("§114조의2 본인 신축 건물 감정가액 가산세 5,500,000 — 건물 감정가액 110,000,000");
    expect(stmtPenalty(AP_NOSPLIT.r)).toContain("§114조의2 본인 신축 건물 감정가액 가산세 5,625,000 — 건물분 감정가액 112,500,000 = 감정가액 총액 300,000,000");
  });
  it("echo 없음 — 종전 문구 그대로(자산 전체 base)", () => {
    expect(stmtPenalty(OFF_BUILDING.r)).toBe("§114조의2 환산취득가액 가산세 25,000,000 (= 500,000,000 × 5%)");
    expect(stmtPenalty(OFF_EXT.r)).toBe("§114조의2 환산취득가액 가산세 1,875,000 (= 37,500,000 × 5%)");
    expect(stmtPenalty(OFF_ACTUAL.r)).toBe("가산세 없음");
  });
});

describe("③ 신고서", () => {
  it("가산세액 칸 값은 엔진 합계 그대로 + 각주가 건물분 base 를 설명한다", () => {
    const row = penaltyRow(EST.r);
    expect(row.values.total).toBe(9_375_000);
    expect(row.roseNotes!.total).toContain("소득세법 §114조의2 본인 신축 건물 가산세 9,375,000 (= 건물분 환산취득가액 187,500,000 × 5%)");
    expect(row.roseNotes!.total).toContain("건물분 양도가액 400,000,000 × (취득 당시 건물분 기준시가 75,000,000) ÷ (양도 당시 건물분 기준시가 160,000,000)");
    expect(penaltyRow(AP_DIRECT.r).roseNotes!.total).toContain("(= 건물 감정가액 110,000,000 × 5%)");
    expect(penaltyRow(AP_NOSPLIT.r).roseNotes!.total).toContain("(= 건물분 감정가액 112,500,000 × 5%)");
  });
  it("echo 없음은 각주가 없다", () => {
    for (const c of [OFF_BUILDING, OFF_EXT, OFF_SEP, OFF_ACTUAL]) expect(penaltyRow(c.r)?.roseNotes?.total).toBeUndefined();
  });
});

describe("④ PDF", () => {
  it("환산: 산식 줄 + 고지(1회) / 감정 / echo 없음은 문구 없음", () => {
    const a = pdfText(EST.r);
    expect(a).toContain("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 × (취득 당시 건물분 기준시가 75,000,000) ÷ (양도 당시 건물분 기준시가 160,000,000)");
    expect(a).toContain("가산세 9,375,000 = 187,500,000 × 5%");
    expect(count(a, CONFIRM)).toBe(1);
    expect(pdfText(AP_DIRECT.r)).toContain("건물 감정가액 110,000,000 (감정평가서에 구분 표시된 건물 감정가액");
    expect(pdfText(AP_NOSPLIT.r)).toContain("건물분 감정가액 112,500,000 = 감정가액 총액 300,000,000");
    for (const c of [OFF_BUILDING, OFF_EXT, OFF_SEP, OFF_ACTUAL]) {
      expect(pdfText(c.r)).not.toContain("건물분 환산취득가액");
      expect(pdfText(c.r)).not.toContain(CONFIRM);
    }
  });
});

describe("함께 양도(BundledAllocationCard) — 자산별 카드·집계 어댑터", () => {
  type Agg = { aggregated: never; apportionment: never };
  async function bundled(f: TransferFormData): Promise<Agg & { form: TransferFormData }> {
    const out = await calc(f);
    expect(out.status, JSON.stringify(out.json)).toBe(200);
    const d = (out.json as { data: Agg }).data;
    return { aggregated: d.aggregated, apportionment: d.apportionment, form: f };
  }
  const renderBundled = (b: Agg & { form: TransferFormData }) =>
    render(<BundledAllocationCard apportionment={b.apportionment} aggregated={b.aggregated} formData={b.form} />);
  const adapted = (b: Agg) => aggregateToFilingResult(b.aggregated);

  it("환산: 자산 2 의 카드에 건물분 산식 · 어댑터가 카드별 echo 를 싣는다(라벨) · 가산세 줄이 건물분 base", async () => {
    const b = await bundled(bundledForm());
    const { container } = renderBundled(b);
    const card = screen.getByTestId("self-built-penalty-card");
    expect(card.textContent).toContain("건물분 환산취득가액 37,499,999 = 건물분 양도가액 200,000,000 ×");
    expect(screen.getByTestId("self-built-penalty-line").textContent).toBe("가산세 1,874,999 = 37,499,999 × 5%");
    expect(count(container.textContent!, CONFIRM)).toBe(1);
    const a = adapted(b);
    expect(a.selfBuiltPenaltyEchoes).toHaveLength(1);
    expect(a.selfBuiltPenaltyEchoes![0].echo.base).toBe(37_499_999);
    // 상세명세서 — 집계 줄 + 자산별 줄
    const item = buildStatementItems(a, FORM, undefined, undefined, 1_000_000_000).get("penaltyTax")!;
    const label = a.selfBuiltPenaltyEchoes![0].label;
    expect(text(item.formula)).toContain(`§114조의2 본인 신축 건물 환산취득가액 가산세 1,874,999 [${label}] — 건물분 환산취득가액 37,499,999 =`);
    // 카드가 낸 가산세 전액을 echo 줄이 설명한다 — 남은 금액으로 같은 가산세를 한 번 더 적지 않는다
    expect(count(text(item.formula), "§114조의2")).toBe(1);
    // 상세명세서 자산별 줄(화면) · 합계 신고서 칸 각주 — 둘 다 건물분 base
    const t = container.textContent!;
    expect(t).toContain("소득세법 §114조의2 1,874,999 (건물분 환산취득가액 37,499,999 × 5%)");
    expect(t).toContain(`[${label}] 소득세법 §114조의2 본인 신축 건물 가산세 1,874,999 (= 건물분 환산취득가액 37,499,999 × 5%)`);
    expect(count(t, "본인 신축 건물 가산세 1,874,999")).toBe(1);
    // PDF — 어댑터 result 로 단건 섹션이 그린다
    expect(count(pdfText(a), CONFIRM)).toBe(1);
    expect(pdfText(a)).toContain(`[${a.selfBuiltPenaltyEchoes![0].label}] 가산세 1,874,999 = 37,499,999 × 5%`);
  });

  const AP_BUNDLED = { ...SB_APPRAISAL, useEstimatedAcquisition: false, selfBuiltBuildingAppraisal: "110000000" } as Partial<AssetForm>;

  // Q-8 — 결과 카드 §114조의2 행의 라벨은 산정방식별이다. PR-5b(`penaltyMethodSums`)가 이미 정정했고 본인 신축 감정도 그 경로를 탄다는 것을 고정한다.
  it("Q-8 결과 카드 가산세 행: 감정은 «감정가액 가산세 = 건물 감정가액 × 5%» · 환산은 «환산취득가액 가산세 = 건물 환산취득가 × 5%»", async () => {
    const ap = renderBundled(await bundled(bundledForm(AP_BUNDLED)));
    expect(ap.container.textContent).toContain("· 감정가액 가산세 (소득세법 §114조의2 ①) = 건물 감정가액 110,000,000 × 5%");
    expect(ap.container.textContent).not.toContain("· 환산취득가액 가산세 (소득세법 §114조의2 ①)");
    cleanup();
    const est = renderBundled(await bundled(bundledForm()));
    expect(est.container.textContent).toContain("· 환산취득가액 가산세 (소득세법 §114조의2 ①) = 건물 환산취득가 37,499,999 × 5%");
    expect(est.container.textContent).not.toContain("· 감정가액 가산세 (소득세법 §114조의2 ①)");
  });

  it("감정 직접: 자산 카드 제목·상세명세서 라벨이 감정가액", async () => {
    const b = await bundled(bundledForm(AP_BUNDLED));
    renderBundled(b);
    expect(screen.getByText("본인 신축 건물 감정가액 가산세 (소득세법 §114조의2)")).toBeInTheDocument();
    const a = adapted(b);
    expect(text(buildStatementItems(a, FORM, undefined, undefined, 1_000_000_000).get("penaltyTax")!.formula)).toContain("§114조의2 본인 신축 건물 감정가액 가산세 5,500,000");
  });

  it("echo 없음(본인 신축 아님·실가·5년 경과): 카드·어댑터 목록·문구 없음", async () => {
    for (const f of [
      bundledForm({ isSelfBuilt: false }),
      bundledForm({ useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" }),
      { ...bundledForm(), transferDate: "2026-06-02" } as TransferFormData,
    ]) {
      const b = await bundled(f);
      const { container } = renderBundled(b);
      expect(screen.queryByTestId("self-built-penalty-card")).toBeNull();
      expect(container.textContent).not.toContain(CONFIRM);
      expect(adapted(b).selfBuiltPenaltyEchoes).toBeUndefined();
      cleanup();
    }
  });
});

describe("다건 합산(MultiTransferTaxResultView) — 건별 카드·합산 PDF", () => {
  async function multi(over: Partial<AssetForm> = {}) {
    const f = sbForm(over);
    const body = await buildMultiBody([f]);
    const res = await MULTI(new NextRequest("http://l/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    const data = ((await res.json()) as { data: unknown }).data;
    const properties = [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }] as unknown as PropertyItem[];
    return { data, properties };
  }

  it("환산: 건별 상세에 건물분 카드 · 합산 PDF 에 산식과 고지(1회)", async () => {
    const m = await multi();
    const { container } = render(<MultiTransferTaxResultView result={m.data as never} properties={m.properties} taxYear={2026} />);
    expect(within(container).getAllByTestId("self-built-penalty-card").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 ×");
    // 신고서 각주 — 합산 신고서(자산 라벨 접두)와 건별 신고서(접두 없음) 둘 다
    expect(count(container.textContent!, "소득세법 §114조의2 본인 신축 건물 가산세 9,375,000 (= 건물분 환산취득가액 187,500,000 × 5%)")).toBe(2);
    expect(count(container.textContent!, "[p1] 소득세법 §114조의2 본인 신축 건물 가산세 9,375,000")).toBe(1);
    const pdf = collect(TransferMultiSection({ r: m.data as Record<string, unknown> })).join("\n");
    expect(pdf).toContain("[p1] 건물분 환산취득가액 187,500,000 = 건물분 양도가액 400,000,000 × (취득 당시 건물분 기준시가 75,000,000) ÷ (양도 당시 건물분 기준시가 160,000,000)");
    expect(count(pdf, CONFIRM)).toBe(1);
  });

  it("echo 없음(실가)은 카드·PDF 문구가 없다", async () => {
    const m = await multi({ useEstimatedAcquisition: false, fixedAcquisitionPrice: "300000000" });
    const { container } = render(<MultiTransferTaxResultView result={m.data as never} properties={m.properties} taxYear={2026} />);
    expect(screen.queryByTestId("self-built-penalty-card")).toBeNull();
    expect(container.textContent).not.toContain(CONFIRM);
    expect(collect(TransferMultiSection({ r: m.data as Record<string, unknown> })).join("\n")).not.toContain(CONFIRM);
  });
});

describe("영 §164⑨ 공익수용·공매 특례 × 환산 (PR-A) — 4뷰·함께 양도·다건이 같은 정본을 읽는다", () => {
  const CONFIRM_SEC = "특례 적용 금액을 토지·건물로 나누는 정면 해석례는 확인하지 못했습니다 — 확인 필요.";
  const X3 = { transferCause: "public_expropriation", housingCompensationTotal: "300000000", housingCompensationBasisTotal: "350000000", actualSalePrice: "300000000" } as Partial<AssetForm>;
  const A3 = { isAuctionTransfer: true, auctionPrice: "300000000", actualSalePrice: "300000000" } as Partial<AssetForm>;
  const NOT_FIRED = { transferCause: "public_expropriation", housingCompensationTotal: "500000000", housingCompensationBasisTotal: "500000000" } as Partial<AssetForm>;
  let EXPR: Cell;
  let AUC: Cell;
  let NF: Cell;
  const s3 = async (over: Partial<AssetForm>): Promise<Cell> => {
    const f = sbForm(over, { contractTotalPrice: String(over.actualSalePrice ?? "1000000000") });
    const out = await calc(f);
    expect(out.status, JSON.stringify(out.json)).toBe(200);
    return { r: out.result as unknown as TransferTaxResult, f };
  };
  beforeAll(async () => {
    EXPR = await s3(X3);
    AUC = await s3(A3);
    NF = await s3(NOT_FIRED);
  });

  it("echo 전제 — 분모 H_T′ 가 양도차익 분모(특례 카드의 적용 양도당시 기준시가)와 같은 숫자 · 불발도 echo 를 싣는다(Q-7)", () => {
    expect(EXPR.r.selfBuiltHousingPenalty).toMatchObject({
      base: 75_000_000,
      penalty: 3_750_000,
      housingSplit: { transferHousing: 300_000_000, transferLand: 180_000_000, transferBuilding: 120_000_000, sec164_9: { kind: "expropriation", standardHousing: 400_000_000, candidates: { compensation: 300_000_000, basis: 350_000_000 } } },
    });
    expect(EXPR.r.housingExpropriationValuationDetail?.denominator).toBe(300_000_000);
    expect(AUC.r.selfBuiltHousingPenalty?.housingSplit?.sec164_9).toEqual({ kind: "auction", standardHousing: 400_000_000, candidates: { auction: 300_000_000 } });
    expect(AUC.r.auctionValuationDetail?.denominator).toBe(300_000_000);
    expect(NF.r.selfBuiltHousingPenalty?.housingSplit).toMatchObject({ transferHousing: 400_000_000, sec164_9: { kind: "expropriation", standardHousing: 400_000_000 } });
    expect(NF.r.housingExpropriationValuationDetail?.denominator).toBe(400_000_000);
  });

  it("① 카드 — 특례 줄(후보 3값 중 최솟값) → 주택공시가격 분해 → 설명줄 · 고지 변형(확인 필요 1회) · 특례 카드와 같은 숫자", () => {
    const { container } = renderView(EXPR);
    const t = screen.getByTestId("self-built-penalty-card").textContent!;
    expect(t).toContain("양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라 개별주택가격 400,000,000·보상액 300,000,000·보상산정 기초 기준시가 350,000,000 중 가장 작은 금액입니다.");
    expect(t).toContain("양도 당시 주택공시가격 300,000,000 = 토지분 180,000,000 + 건물분 120,000,000");
    expect(t).toContain("건물분 기준시가는 주택공시가격(특례 적용 금액)을 토지 기준시가와 건물 기준시가의 비율로 나눈 값입니다");
    const notice = screen.getByTestId("self-built-notice").textContent!;
    expect(notice).toContain(CONFIRM_SEC);
    expect(notice.split("확인 필요").length - 1).toBe(1);
    expect(notice).toContain("양도 당시 주택공시가격은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따른 금액을 같은 비율로 나누었습니다");
    expect(count(container.textContent!, CONFIRM_SEC)).toBe(1);
    // 기존 특례 카드의 «적용 양도당시 기준시가» 와 같은 숫자로 이어진다
    expect(container.textContent).toContain("주택 수용 양도당시 기준시가 특례");
    expect(container.textContent).toMatch(/적용 양도당시 기준시가\s*300,000,000/);
    expect(t).not.toMatch(/유리|불리|절감|floor|B_acq|B_tr|S_b|\d원/);
  });
  it("① 카드 — 공매·경락(2호) 줄 · 특례 불발(H_T′ = H_T)도 줄이 뜬다", () => {
    renderView(AUC);
    expect(screen.getByTestId("self-built-penalty-card").textContent).toContain(
      "양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 2호 공매·경락 특례에 따라 개별주택가격 400,000,000·공매·경락가액 300,000,000 중 작은 금액입니다.",
    );
    expect(screen.getByTestId("self-built-notice").textContent).toContain("소득세법 시행령 §164⑨ 2호 공매·경락 특례");
    cleanup();
    renderView(NF);
    expect(screen.getByTestId("self-built-penalty-card").textContent).toContain("양도 당시 주택공시가격 400,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라");
  });
  it("특례가 없는 환산은 종전 문구 그대로 — 특례 줄·고지 변형·각주 접미 없음(회귀 0)", () => {
    const v = selfBuiltPenaltyView(EST.r.selfBuiltHousingPenalty)!;
    expect(v.formulaLines.join("\n")).not.toContain("§164⑨");
    expect(v.notice).not.toContain("§164⑨");
    expect(v.notice).toContain(CONFIRM);
    expect(penaltyRow(EST.r).roseNotes!.total).not.toContain("§164⑨");
    expect(stmtPenalty(EST.r)).not.toContain("§164⑨");
    // 감정은 §164⑨ 와 무관
    expect(AP_DIRECT.r.selfBuiltHousingPenalty?.housingSplit).toBeUndefined();
  });

  it("② 상세명세서 · ③ 신고서 각주 · ④ PDF — 환산식 뒤 «특례 적용» 한 마디 · 특례 줄 · 고지 1회", () => {
    expect(stmtPenalty(EXPR.r)).toContain("양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라");
    const row = penaltyRow(EXPR.r);
    expect(row.values.total).toBe(3_750_000);
    expect(row.roseNotes!.total).toContain("(양도 당시 건물분 기준시가 120,000,000) · 소득세법 시행령 §164⑨ 1호 공익수용 특례 적용");
    const pdf = pdfText(EXPR.r);
    expect(pdf).toContain("양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라");
    expect(count(pdf, CONFIRM_SEC)).toBe(1);
    expect(penaltyRow(AUC.r).roseNotes!.total).toContain("소득세법 시행령 §164⑨ 2호 공매·경락 특례 적용");
  });
  it("③ 상세명세서 자산별 줄 — 집계 산식 괄호 안에도 특례 접미", async () => {
    const b = await (async () => {
      const f = { ...bundledForm({ transferCause: "public_expropriation", housingCompensationTotal: "300000000", housingCompensationBasisTotal: "350000000" }) } as TransferFormData;
      const out = await calc(f);
      expect(out.status, JSON.stringify(out.json)).toBe(200);
      return { aggregated: (out.json as { data: { aggregated: never } }).data.aggregated, apportionment: (out.json as { data: { apportionment: never } }).data.apportionment, form: f };
    })();
    const { container } = render(<BundledAllocationCard apportionment={b.apportionment} aggregated={b.aggregated} formData={b.form} />);
    const card = screen.getByTestId("self-built-penalty-card");
    expect(card.textContent).toContain("건물분 환산취득가액 125,000,000 = 건물분 양도가액 200,000,000 ×");
    expect(card.textContent).toContain("양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라");
    expect(container.textContent).toContain("소득세법 §114조의2 6,250,000 (건물분 환산취득가액 125,000,000 × 5% · 소득세법 시행령 §164⑨ 1호 공익수용 특례 적용)");
    expect(count(container.textContent!, CONFIRM_SEC)).toBe(1);
  });
});
