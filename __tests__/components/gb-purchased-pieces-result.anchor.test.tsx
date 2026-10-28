/**
 * anchor ⑦ — 이월과세 × 당초 증여 채무 부분(매입분) PR-2: 결과 면 (UI 설계서 §3.6.2 · §5).
 *
 *  · R-1 꼬리 카드 id 처리 leaf — 찾는 곳은 부모로 풀고(`purchasedPartParentIdOf`) 합계를 보이는 곳은 부모에 합친다(`foldPurchasedPieces`)
 *  · R-2 ★ 3-자산 요약 표 — 증축 케이스에 꼬리가 붙어 카드가 4장이어도 표가 남고 꼬리 값이 부모 열에 합쳐진다 (침묵 소실 방지)
 *  · R-3 결과 고지 T0/T1/T2 — 엔진 echo 하나로 가른다: A 채택일 때만 «나누어 계산했다» · B 채택이면 없다
 *  · R-4 E3 T2 — 주택 분리 파트는 나누지 않고 분자에서만 뺀다: 카드·상세명세서·PDF가 같은 문장, 「확인 필요」 목록과 섞지 않는다 · 세액 불변
 *  · R-5 PDF(E2·E1) 한 줄 — 어댑터 echo를 읽는다
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import { SplitCarryoverComparisonCard } from "@/components/calc/results/transfer/SplitCarryoverComparisonCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { TransferSplitSection, TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { foldPurchasedPieces, withoutPurchasedPieces, cardAcquisitionPriceWithPieces } from "@/lib/tax-engine/general-building-purchased-pieces";
import { purchasedPartIdOf } from "@/lib/tax-engine/general-building-share-id";
import { purchasedPartResultEchoes } from "@/lib/tax-engine/result-purchased-part-echoes";
import { carryoverDebtTreatment, carryoverPurchasedPartLine, carryoverNumeratorOnlyLine, purchasedPartPieceFormula } from "@/lib/tax-engine/transfer-tax-carryover-purchased-part-display";
import { splitCarryoverView, splitCarryoverDebtNotices, splitCarryoverNotices } from "@/lib/tax-engine/transfer-tax-split-carryover-display";
import type { CarryoverPurchasedPartSplit } from "@/lib/tax-engine/types/transfer-carryover.types";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { bodyOf, routeOf } from "../calc/_helpers/split-carryover-c-form";
import { aForm, aAsset, A_LAND_CARRYOVER } from "../calc/_helpers/split-carryover-a-form";

afterEach(cleanup);

type Card = Record<string, unknown> & { propertyId: string };
const card = (propertyId: string, label: string, v: Partial<Record<string, number>> = {}): Card => ({
  propertyId, propertyLabel: label, transferPrice: 0, acquisitionPrice: 0, necessaryExpense: 0, transferGain: 0, longTermHoldingDeduction: 0, income: 0,
  lossOffsetFromSameGroup: 0, lossOffsetFromOtherGroup: 0, incomeAfterOffset: 0, ...v,
});

describe("R-1 꼬리 카드 id 처리 leaf", () => {
  const rows = [
    card("land", "토지(1001)(증여분)", { transferPrice: 375, acquisitionPrice: 112 }),
    card("building1", "건물(3001)", { transferPrice: 500, acquisitionPrice: 250 }),
    card(purchasedPartIdOf("land"), "토지(1001)(매입분)", { transferPrice: 125, acquisitionPrice: 100 }),
  ];
  it("withoutPurchasedPieces — 꼬리만 뺀다(지분·컴패니언 꼬리 모양 포함)", () => {
    expect(withoutPurchasedPieces(rows).map((r) => r.propertyId)).toEqual(["land", "building1"]);
    expect(withoutPurchasedPieces([card("land#1", "a"), card("land__purchased#1", "b"), card("land__purchased#gb2", "c")]).map((r) => r.propertyId)).toEqual(["land#1"]);
  });
  it("foldPurchasedPieces — 꼬리의 지정 수치를 부모에 더하고 꼬리를 뺀다 · 입력 불변 · 순서 보존", () => {
    const out = foldPurchasedPieces(rows, ["transferPrice", "acquisitionPrice"]);
    expect(out.map((r) => [r.propertyId, r.transferPrice, r.acquisitionPrice])).toEqual([["land", 500, 212], ["building1", 500, 250]]);
    expect(rows[0].transferPrice).toBe(375);
  });
  it("지분·컴패니언 꼬리는 같은 지분의 부모에만 합쳐진다 · 부모를 못 찾는 꼬리는 값을 버리지 않고 남긴다", () => {
    const sh = [card("land#0", "a", { transferPrice: 10 }), card("land#1", "b", { transferPrice: 20 }), card("land__purchased#1", "c", { transferPrice: 5 })];
    expect(foldPurchasedPieces(sh, ["transferPrice"]).map((r) => [r.propertyId, r.transferPrice])).toEqual([["land#0", 10], ["land#1", 25]]);
    const orphan = [card("land#0", "a", { transferPrice: 10 }), card("land__purchased#9", "z", { transferPrice: 5 })];
    expect(foldPurchasedPieces(orphan, ["transferPrice"]).map((r) => r.propertyId)).toEqual(["land#0", "land__purchased#9"]);
  });
  it("cardAcquisitionPriceWithPieces — 부모 + 꼬리 · 꼬리 없음은 그대로 · 카드 없음은 undefined", () => {
    expect(cardAcquisitionPriceWithPieces(rows as never, "land")).toBe(212);
    expect(cardAcquisitionPriceWithPieces(rows as never, "building1")).toBe(250);
    expect(cardAcquisitionPriceWithPieces(rows as never, "nope")).toBeUndefined();
  });
});

describe("R-2 ★ 3-자산 요약 표 — 증축 케이스 + 꼬리 카드", () => {
  const three = [
    card("land", "토지(1001)(증여분)", { transferPrice: 375_000_000, acquisitionPrice: 112_500_000, income: 100, incomeAfterOffset: 100 }),
    card("building1", "건물(3001)", { transferPrice: 300_000_000, acquisitionPrice: 150_000_000 }),
    card("building2", "증축건물2(3002)", { transferPrice: 200_000_000, acquisitionPrice: 100_000_000 }),
  ];
  const tail = card("land__purchased", "토지(1001)(매입분)", { transferPrice: 125_000_000, acquisitionPrice: 100_000_000, income: 50, incomeAfterOffset: 50 });
  const agg = (props: Card[]) => ({ properties: props }) as unknown as AggregateTransferResult;
  it("카드 3장 → 표가 보인다(회귀 0)", () => {
    render(<GeneralBuilding3WayTable aggregated={agg(three)} />);
    expect(screen.getByText(/일반건물 3-자산 요약/)).toBeTruthy();
  });
  it("★ 카드 4장(꼬리 1장) → 표가 사라지지 않고 토지 열에 꼬리가 합쳐진다 (양도가액 5억 = 3.75억 + 1.25억 · 취득가액 2.125억)", () => {
    render(<GeneralBuilding3WayTable aggregated={agg([...three, tail])} />);
    expect(screen.getByText(/일반건물 3-자산 요약/)).toBeTruthy();
    expect(screen.getAllByText("500,000,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("212,500,000").length).toBeGreaterThan(0);
    // 합계 열: 5억 + 3억 + 2억 = 10억
    expect(screen.getAllByText("1,000,000,000").length).toBeGreaterThan(0);
  });
  it("꼬리가 아닌 4장은 종전대로 표를 그리지 않는다", () => {
    const extra = card("land_nbl", "비사업용 토지(1001)");
    render(<GeneralBuilding3WayTable aggregated={agg([...three, extra])} />);
    expect(screen.queryByText(/일반건물 3-자산 요약/)).toBeNull();
  });
});

describe("R-3 결과 고지 T0/T1/T2 — 엔진 echo 하나", () => {
  const split: CarryoverPurchasedPartSplit = {
    debtAmount: 100_000_000, giftValuation: 400_000_000, transferPrice: 500_000_000, donorAcquisitionPrice: 150_000_000,
    gift: { propertyId: "land", transferPrice: 375_000_000, acquisitionPrice: 112_500_000, acquisitionDate: "2005-06-15", holdingPeriodYears: 20, transferGain: 253_500_000, appliedRate: 0.4 },
    purchased: { propertyId: "land__purchased", transferPrice: 125_000_000, acquisitionPrice: 100_000_000, acquisitionDate: "2021-03-01", holdingPeriodYears: 5, transferGain: 24_250_000, appliedRate: 0.4 },
    determinedTaxA: 141_690_000, determinedTaxB: 156_620_000,
  };
  it("T1 — A 채택 + echo → 한 줄 · B 채택이면 T0 (조각은 세액에 반영되지 않았다)", () => {
    const t = carryoverDebtTreatment({ adoptedScenario: "A", scenarioA: { purchasedPartSplit: split } });
    expect(t.kind).toBe("split");
    expect(t.kind === "split" && t.line).toBe(carryoverPurchasedPartLine(split));
    expect(carryoverPurchasedPartLine(split)).toContain("당초 증여 때 인수한 채무(100,000,000)는 양도로 보는 부분(매입분)으로 나누어 계산했습니다");
    expect(carryoverDebtTreatment({ adoptedScenario: "B", scenarioA: { purchasedPartSplit: split } }).kind).toBe("none");
    expect(carryoverDebtTreatment({ adoptedScenario: "A", scenarioA: {} }).kind).toBe("none");
    expect(carryoverDebtTreatment(undefined).kind).toBe("none");
  });
  it("수집기 — A 채택 카드만 모은다(라벨 = 부모 카드 라벨)", () => {
    const props = [
      { propertyId: "land", propertyLabel: "토지(1001)(증여분)", carryoverTaxationDetail: { adoptedScenario: "A" as const, scenarioA: { purchasedPartSplit: split } } },
      { propertyId: "building", propertyLabel: "건물(3001)", carryoverTaxationDetail: { adoptedScenario: "B" as const, scenarioA: { purchasedPartSplit: split } } },
      { propertyId: "x", propertyLabel: "x" },
    ];
    expect(purchasedPartResultEchoes(props).map((e) => e.label)).toEqual(["토지(1001)(증여분)"]);
  });
  it("T2 문장 — 분자에서만 뺐다 · 나누지 않았다 · 유불리 표현 없음", () => {
    const t = carryoverNumeratorOnlyLine(100_000_000, "토지");
    expect(t).toBe("토지: 당초 증여 때 인수한 채무(100,000,000)는 증여세 상당액 안분의 분자(증여 당시 평가액 − 인수한 채무)에서만 뺐습니다. 채무 인수 부분을 증여분과 나누어 계산하지는 않았습니다.");
    expect(t).not.toMatch(/유리|불리|절감/);
  });
  it("상세명세서 산식 — 증여분·매입분 행 / 다른 카드는 undefined / B 채택이면 undefined", () => {
    const props = [{ propertyId: "land", carryoverTaxationDetail: { adoptedScenario: "A" as const, scenarioA: { purchasedPartSplit: split } } }];
    expect(purchasedPartPieceFormula(props, "land", "transfer")).toBe("증여분 양도가액 = 양도가액 500,000,000 × (증여 당시 평가액 400,000,000 − 인수한 채무 100,000,000) ÷ (증여 당시 평가액 400,000,000) = 375,000,000");
    expect(purchasedPartPieceFormula(props, "land__purchased", "acquisition")).toBe("매입분 취득가액 = 당초 증여 때 인수한 채무 100,000,000 (취득일 = 증여 등기접수일 2021-03-01)");
    expect(purchasedPartPieceFormula(props, "building", "transfer")).toBeUndefined();
    expect(purchasedPartPieceFormula([{ ...props[0], carryoverTaxationDetail: { adoptedScenario: "B" as const, scenarioA: { purchasedPartSplit: split } } }], "land", "transfer")).toBeUndefined();
    // r = 1 — 증여분 없음: 매입분이 원 id를 쓴다
    const r1: CarryoverPurchasedPartSplit = { ...split, gift: undefined, purchased: { ...split.purchased, propertyId: "land", transferPrice: 500_000_000 }, debtAmount: 400_000_000 };
    expect(purchasedPartPieceFormula([{ propertyId: "land", carryoverTaxationDetail: { adoptedScenario: "A" as const, scenarioA: { purchasedPartSplit: r1 } } }], "land", "transfer")).toContain("증여분 없음");
  });
});

describe("R-4 E3 T2 — 주택 분리 계산(A) · 토지 평가액 3억 · 채무 1억 (비지원 · 현행 유지 + 고지)", () => {
  const CARRY = { ...A_LAND_CARRYOVER, giftTaxBase: "400,000,000", giftDebtAssumed: true, giftAssumedDebt: "100,000,000" };
  let result: TransferTaxResult;
  let off: TransferTaxResult;
  let form: TransferFormData;
  beforeAll(async () => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
    form = aForm("purchase", {}, aAsset("purchase", { landCarryover: CARRY }));
    result = (await routeOf(POST, await bodyOf(form))).json.data.result as TransferTaxResult;
    off = (await routeOf(POST, await bodyOf(aForm("purchase", {}, aAsset("purchase", { landCarryover: { ...CARRY, giftDebtAssumed: false } }))))).json.data.result as TransferTaxResult;
  });

  it("세액 불변 — 175,110,000 (Q-UI-1 b: 계산은 그대로, 알림만)", () => {
    expect(result.determinedTax).toBe(175_110_000);
    expect(result.splitDetail!.land.carryover!.giftAssumedDebt).toBe(100_000_000);
  });
  it("T2 문장 — 토글 OFF면 없다(T0)", () => {
    const v = splitCarryoverView(result.splitDetail)!;
    expect(splitCarryoverDebtNotices(v)).toEqual(["토지: 당초 증여 때 인수한 채무(100,000,000)는 증여세 상당액 안분의 분자(증여 당시 평가액 − 인수한 채무)에서만 뺐습니다. 채무 인수 부분을 증여분과 나누어 계산하지는 않았습니다."]);
    expect(splitCarryoverDebtNotices(splitCarryoverView(off.splitDetail)!)).toEqual([]);
  });
  it("「확인 필요」 목록에는 섞이지 않는다 (사실 고지 ≠ 해석례 미확인)", () => {
    const v = splitCarryoverView(result.splitDetail)!;
    expect(splitCarryoverNotices(v).join(" ")).not.toContain("에서만 뺐습니다");
  });
  it("카드 — 별도 문단(testid) · 확인 필요 박스 위", () => {
    render(<SplitCarryoverComparisonCard splitDetail={result.splitDetail!} />);
    expect(screen.getByTestId("split-carryover-debt-notice-0").textContent).toContain("에서만 뺐습니다");
    expect(screen.getByTestId("split-carryover-notice-0").textContent).not.toContain("에서만 뺐습니다");
    cleanup();
    render(<SplitCarryoverComparisonCard splitDetail={off.splitDetail!} />);
    expect(screen.queryByTestId("split-carryover-debt-notice-0")).toBeNull();
  });
  it("상세명세서 — 취득가액 항목 note · PDF — 같은 문장(접두 「확인 필요」 없음) · 토글 OFF면 둘 다 없음", () => {
    const asset = form.assets[0];
    const items = buildStatementItems(result, form, asset, undefined, undefined);
    expect(items.get("acquisitionPrice")!.note).toContain("에서만 뺐습니다");
    expect(buildStatementItems(off, form, asset, undefined, undefined).get("acquisitionPrice")!.note).toBeUndefined();
    const out = collect(TransferSplitSection({ r: result as unknown as Record<string, unknown> })).join("\n");
    expect(out).toContain("에서만 뺐습니다");
    expect(out).not.toContain("확인 필요 — 토지: 당초");
    expect(collect(TransferSplitSection({ r: off as unknown as Record<string, unknown> })).join("\n")).not.toContain("에서만 뺐습니다");
  });
});

describe("R-5 PDF(E1·E2 집계 어댑터) — 한 줄", () => {
  const split: CarryoverPurchasedPartSplit = {
    debtAmount: 100_000_000, giftValuation: 400_000_000, transferPrice: 500_000_000, donorAcquisitionPrice: 150_000_000,
    purchased: { propertyId: "land", transferPrice: 500_000_000, acquisitionPrice: 100_000_000, acquisitionDate: "2021-03-01", holdingPeriodYears: 5, transferGain: 1, appliedRate: 0.4 },
    determinedTaxA: 1, determinedTaxB: 2,
  };
  it("어댑터 result에 purchasedPartEchoes가 있으면 한 줄(여러 카드면 [라벨] 접두), 없으면 없다", () => {
    const base = { transferGain: 1, taxableGain: 1 } as Record<string, unknown>;
    const withEcho = collect(TransferSection({ r: { ...base, purchasedPartEchoes: [{ label: "토지(1001)(증여분)", split }] } })).join("\n");
    expect(withEcho).toContain("양도로 보는 부분(매입분)으로 나누어 계산했습니다");
    expect(withEcho).not.toContain("[토지(1001)(증여분)]");
    const two = collect(TransferSection({ r: { ...base, purchasedPartEchoes: [{ label: "A", split }, { label: "B", split }] } })).join("\n");
    expect(two).toContain("[A] 당초 증여 때 인수한 채무(100,000,000)");
    expect(collect(TransferSection({ r: base })).join("\n")).not.toContain("매입분");
  });
});

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}
