/**
 * D2-4b — 2005.4.30. 전 상속·증여 주택 건물 + 토지 매매: ⑤ 입력 카드 · ⑥ 사이드바 · ⑦ 결과 4뷰 (2026-10-10)
 *
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §13 · UI 설계 transfer-acq-cause-mixed-d2-4.ui.design.md §3·§7·§8
 *
 * 입력은 화면 폼(AssetForm) → ④ body → 실제 route(⑫⑭) → 엔진 결과다(손으로 만든 echo 아님). 4뷰는 뷰마다 따로 잠근다
 * (memory 「양도세 결과뷰는 4개」). 토지 ②(단서 1호) 문구 불변은 `split-acq-basis-d1-4b.ui.anchor.test.tsx`가 부정형 짝이다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const TRANSFER_DATE = "2026-06-30";

/** D2 ON + 단독·다가구 + 건물 상속 2003-05-01 + 토지 매매 2020-01-10 · ① 30,000,000 · ② = 300M × 30M ÷ (200M + 50M) = 36,000,000 */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01",
    decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    inheritanceAssetKind: "house_individual", acquisitionArea: "200", transferArea: "200",
    inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
    inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
    ...over,
  } as AssetForm;
}
/** 증여 2002-09-15 · ② = 280M × 20M ÷ (750,000 × 200 + 40M) = 29,473,684 (D2-4a anchor와 같은 시드) */
const gift = (over: Partial<AssetForm> = {}) =>
  asset({
    acquisitionCause: "gift", landCauseHost: "gift", acquisitionDate: "2002-09-15", inheritanceStartDate: "", inheritanceDate: "", decedentAcquisitionDate: "",
    inhHouseValHousePriceAtFirst: "280,000,000", inhHouseValLandPricePerSqmAtFirst: "750,000",
    inhHouseValBuildingStdPriceAtFirst: "40,000,000", inhHouseValBuildingStdPriceAtInheritance: "20,000,000", ...over,
  });

const TF = (a: AssetForm) =>
  ({ transferDate: TRANSFER_DATE, filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1200000000",
    totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false }) as unknown as TransferFormData;

async function run(a: AssetForm): Promise<TransferTaxResult> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(TF(a));
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
      ...cap.body, isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0,
    }),
  }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { result: TransferTaxResult } }).data.result;
}

function mount(a: AssetForm, onChange: (p: Partial<AssetForm>) => void = () => {}) {
  return render(<CompanionAcquisitionCauseSection asset={a} onChange={onChange} transferDate={TRANSFER_DATE} isNewConstruction={false} />);
}
const card = () => screen.queryByTestId("building-sec164-card");

describe("⑤ 카드 노출 — 단서 2호 구간의 주택만 (④⑥⑧과 같은 술어)", () => {
  it("2003 주택 → 카드 · 1984 주택(의제취득 전) → 카드", () => {
    mount(asset());
    expect(card()).not.toBeNull();
    cleanup();
    mount(asset({ acquisitionDate: "1984-06-01", inheritanceStartDate: "1984-06-01", inheritanceDate: "1984-06-01", decedentAcquisitionDate: "1960-01-01", landAcquisitionDate: "1983-01-10" }));
    expect(card()).not.toBeNull();
  });
  it("부정형 짝 — 2005-04-30 당일·2020·비주택 building·D2 OFF → 카드 없음 (값은 지우지 않는다)", () => {
    for (const over of [
      { acquisitionDate: "2005-04-30", inheritanceStartDate: "2005-04-30", inheritanceDate: "2005-04-30", landAcquisitionDate: "2005-01-10" },
      { acquisitionDate: "2020-05-01", inheritanceStartDate: "2020-05-01", inheritanceDate: "2020-05-01" },
      { assetKind: "building" },
      { hasSeperateLandAcquisitionDate: false },
    ] as Partial<AssetForm>[]) {
      mount(asset(over));
      expect(card(), JSON.stringify(over)).toBeNull();
      cleanup();
    }
  });
  it("PHD 토글 제목·숫자 placeholder가 카드에 없다(기존 E2E 단언·placeholder 규칙)", () => {
    mount(asset());
    const c = card()!;
    expect(c.textContent).not.toContain("취득 당시 개별주택가격 미공시");
    c.querySelectorAll("input").forEach((el) => expect(el.getAttribute("placeholder") ?? "").not.toMatch(/\d/));
  });
});

describe("⑤ 주택 구분 칸 — 명시 선택만 (Check F1: 미선택을 단독으로 보지 않는다)", () => {
  it("미선택(기본값 land) → 아무것도 체크되지 않고 입력 칸 없음 · 단독 클릭 → inheritanceAssetKind patch", () => {
    const calls: Partial<AssetForm>[] = [];
    mount(asset({ inheritanceAssetKind: "land" }), (p) => calls.push(p));
    const kind = within(card()!).getByText("주택 구분").parentElement!;
    within(kind).getAllByRole("radio").forEach((r) => expect(r).not.toBeChecked());
    expect(card()!.querySelector('[data-field="inhHouseValHousePriceAtFirst"]')).toBeNull();
    fireEvent.click(within(kind).getByRole("radio", { name: /단독·다가구주택/ }));
    expect(calls.at(-1)).toMatchObject({ inheritanceAssetKind: "house_individual" });
  });
  it("공동주택 → 지원하지 않는 이유 안내 · 입력 칸 없음", () => {
    mount(asset({ inheritanceAssetKind: "house_apart" }));
    expect(screen.getByTestId("building-sec164-apart-note").textContent).toContain("단독·다가구주택으로 확인된 주택만 지원합니다");
    expect(card()!.querySelector('[data-field="inhHouseValHousePriceAtFirst"]')).toBeNull();
  });
});

describe("⑤ 단독·다가구 — 입력 칸·파생 박스", () => {
  it("② 표시 = ④가 보내는 브리지 값(36,000,000) · 산식 한국어 · 채택값(max) 미표시", () => {
    mount(asset());
    expect(screen.getByTestId("building-sec164-total").textContent).toBe("36,000,000");
    const box = screen.getByTestId("building-sec164-derived").textContent!;
    expect(box).toContain("최초 공시된 개별주택가격 300,000,000");
    expect(box).toContain("최초공시 토지 기준시가 200,000,000");
    expect(box).toContain("영 §164⑦ 가액의 건물 몫");
    expect(box).toContain("계산 결과에서 확인");
  });
  it("지분 50% → 18,000,000 · 지분 표기", () => {
    mount(asset({ ownershipNumerator: "1", ownershipDenominator: "2" }));
    expect(screen.getByTestId("building-sec164-total").textContent).toBe("18,000,000");
    expect(screen.getByTestId("building-sec164-derived").textContent).toContain("× 지분 50%");
  });
  it("미완 → 「입력할 칸」 목록 · 일부 양도 → 지원하지 않음 안내", () => {
    mount(asset({ inhHouseValBuildingStdPriceAtFirst: "" }));
    expect(screen.getByTestId("building-sec164-derived").textContent).toContain("입력할 칸: 최초공시 시점 건물 기준시가");
    cleanup();
    mount(asset({ areaScenario: "partial", transferArea: "100" }));
    expect(screen.getByTestId("building-sec164-partial-note")).toBeTruthy();
  });
  it("라벨: 상속 = 상속개시일 · 증여 = 증여일 · 1984 상속 = 1985.1.1. 의제 시점", () => {
    mount(asset());
    expect(card()!.querySelector('[data-field="inhHouseValBuildingStdPriceAtInheritance"]')!.textContent).toContain("상속개시일 시점 건물 기준시가");
    cleanup();
    mount(gift());
    expect(card()!.querySelector('[data-field="inhHouseValBuildingStdPriceAtInheritance"]')!.textContent).toContain("증여일 시점 건물 기준시가");
    cleanup();
    mount(asset({ acquisitionDate: "1984-06-01", inheritanceStartDate: "1984-06-01", inheritanceDate: "1984-06-01", decedentAcquisitionDate: "1960-01-01", landAcquisitionDate: "1983-01-10" }));
    expect(card()!.textContent).toContain("1985.1.1.");
  });
  it("⑧이 막을 수 있는 모든 칸이 화면 앵커로 존재한다 — 칸 없는 차단 0", () => {
    const fields = new Set<string>();
    const v8 = (a: AssetForm) => {
      const r = collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));
      return r.result ? r.fieldOf(r.result) : undefined;
    };
    const cases: Partial<AssetForm>[] = [
      { acquisitionArea: "" }, { inhHouseValHousePriceAtFirst: "" }, { inhHouseValLandPricePerSqmAtFirst: "" },
      { inhHouseValBuildingStdPriceAtFirst: "" }, { inhHouseValBuildingStdPriceAtInheritance: "" },
      { inhHouseValHousePriceAtFirst: "1", inhHouseValBuildingStdPriceAtInheritance: "1" },
      { inheritanceAssetKind: "land" }, { inheritanceAssetKind: "house_apart" }, { areaScenario: "partial", transferArea: "100" },
    ];
    for (const over of cases) {
      const f = v8(asset(over));
      expect(f, JSON.stringify(over)).toBeDefined();
      fields.add(f as string);
    }
    // 렌더 합집합 — 면적 칸·면적 방식은 기본 정보(AssetAreaSection) 소관이라 이 섹션 밖이다(D1-4b와 같은 전제, E2E가 화면 전체로 확인)
    const found = new Set<string>();
    for (const over of [{}, { inhHouseValBuildingStdPriceAtFirst: "" }, { inheritanceAssetKind: "land" }] as Partial<AssetForm>[]) {
      const { container, unmount } = mount(asset(over));
      container.querySelectorAll("[data-field]").forEach((el) => found.add(el.getAttribute("data-field")!));
      unmount();
    }
    const outside = new Set(["acquisitionArea", "areaScenario"]);
    const missing = [...fields].filter((f) => !outside.has(f) && !found.has(f));
    expect(missing, `화면에 없는 앵커: ${missing.join(", ")}`).toEqual([]);
    expect([...fields].sort()).toEqual(
      ["acquisitionArea", "areaScenario", "inhHouseValBuildingStdPriceAtFirst", "inhHouseValBuildingStdPriceAtInheritance", "inhHouseValHousePriceAtFirst", "inhHouseValLandPricePerSqmAtFirst", "inheritanceAssetKind"].sort(),
    );
  });
});

describe("⑥ 사이드바 — 입력 단계 pending · 결과 도착 후 엔진 합(Check M2)", () => {
  it("단건: 결과 전 「계산 후 표시」(pending) → 결과 후 336,000,000(토지 300M + 건물 ② 36M)", async () => {
    const a = asset();
    const pre = computeTransferPerAssetSummary(TF(a), null).rows[0];
    expect(pre.acqPending).toBe(true);
    const result = await run(a);
    const res = { mode: "single", result } as never;
    const post = computeTransferPerAssetSummary(TF(a), res).rows[0];
    expect(post.acqPending).toBe(false);
    expect(post.acqPrice).toBe(336_000_000);
    // `computeTransferSummary().totalAcqPrice`는 화면 소비처가 없다(grep 0 — 렌더는 자산별 행) · 결과 전 pending 규약(0)만 확인
    expect(computeTransferSummary(TF(a), null).totalAcqPrice).toBe(0);
  });
  it("부정형 짝 — 구간 밖(2020 상속)은 입력 단계에서 바로 확정(① + 토지)", () => {
    const a = asset({ acquisitionDate: "2020-05-01", inheritanceStartDate: "2020-05-01", inheritanceDate: "2020-05-01" });
    const pre = computeTransferPerAssetSummary(TF(a), null).rows[0];
    expect(pre.acqPending).toBe(false);
    expect(pre.acqPrice).toBe(330_000_000);
  });
});

describe("⑦ 결과 4뷰 — 건물 echo(sec163_9_2)는 건물·단서 2호·「영 §164⑦ 가액의 건물 몫」", () => {
  const FORM = {
    transferDate: TRANSFER_DATE, contractTotalPrice: "1200000000",
    assets: [{ acquisitionDate: "2003-05-01", landAcquisitionDate: "2020-01-10", residencePeriodMonthsAsset: "0" }],
  } as unknown as TransferFormData;

  it("엔진 echo 전제 — ② 채택(36M > 30M) / ① 채택(40M > 36M)", async () => {
    const sec = await run(asset());
    expect(sec.splitDetail!.building.acquisitionBasis).toEqual({ rule: "sec163_9_2", reported: 30_000_000, sec164: 36_000_000, adopted: "sec164" });
    expect(sec.splitDetail!.land.acquisitionBasis).toBeUndefined();
    const rep = await run(asset({ buildingAcquisitionPrice: "40,000,000" }));
    expect(rep.splitDetail!.building.acquisitionBasis!.adopted).toBe("reported");
  });
  it("① 카드 — 제목 「건물 취득가액 비교 (…단서 2호」 · ② 이름 · data-part · 건물 취득가액 칸 = 채택값", async () => {
    const r = await run(asset());
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    const box = screen.getByTestId("split-card-acq-basis");
    expect(box.getAttribute("data-part")).toBe("건물");
    expect(box.textContent).toContain("건물 취득가액 비교 (소득세법 시행령 §163조 제9항 단서 2호 — 많은 금액)");
    expect(box.textContent).not.toContain("단서 1호");
    expect(box.textContent).not.toContain("영 §164④");
    expect(screen.getByTestId("split-card-acq-basis-sec164").textContent).toBe("36,000,000");
    expect(screen.getByTestId("split-card-acq-basis-adopted").textContent).toBe("영 §164⑦ 가액의 건물 몫");
    expect(screen.getByTestId("split-card-acq-building").textContent).toBe("36,000,000");
  });
  it("② 상세명세서 — 「건물(영 §164⑦ 가액의 건물 몫) 36,000,000」 + 산식 한 줄(단서 2호) · ① 채택은 「건물(상속개시일 평가액)」", async () => {
    const textOf = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
    const f = textOf(buildStatementItems(await run(asset()), FORM, undefined, undefined, 1_200_000_000).get("acquisitionPrice")!.formula);
    expect(f).toContain("건물(영 §164⑦ 가액의 건물 몫) 36,000,000");
    expect(f).toContain("건물 취득가액 = 많은 금액(상속개시일 평가액 30,000,000, 영 §164⑦ 가액의 건물 몫 36,000,000) = 36,000,000 (소득세법 시행령 §163조 제9항 단서 2호)");
    expect(f).not.toContain("토지 취득가액 = 많은 금액");
    const g = textOf(buildStatementItems(await run(asset({ buildingAcquisitionPrice: "40,000,000" })), FORM, undefined, undefined, 1_200_000_000).get("acquisitionPrice")!.formula);
    expect(g).toContain("건물(상속개시일 평가액) 40,000,000");
  });
  it("③ 신고서 split-2col — 건물 열 각주(단서 2호), 토지 열 각주 없음", async () => {
    const r = await run(asset());
    expect(deriveColumns(r).mode).toBe("split-2col");
    const row = buildRows(r, "split-2col", FORM, undefined, 1_200_000_000).find((x) => x.roseNotes && /많은 금액/.test(JSON.stringify(x.roseNotes)))!;
    expect(row.roseNotes!.building).toContain("건물 취득가액 = 많은 금액(상속개시일 평가액 30,000,000, 영 §164⑦ 가액의 건물 몫 36,000,000) = 36,000,000 (소득세법 시행령 §163조 제9항 단서 2호)");
    expect(row.roseNotes!.land ?? "").not.toContain("많은 금액");
  });
  it("④ PDF — 건물 비교 문장 행(단서 2호)", async () => {
    function collect(node: unknown, out: string[] = []): string[] {
      if (node === null || node === undefined || typeof node === "boolean") return out;
      if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
      if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
      const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
      if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
      collect((el.props as { children?: unknown } | undefined)?.children, out);
      return out;
    }
    const tokens = collect(TransferSplitSection({ r: (await run(asset())) as unknown as Record<string, unknown> }));
    expect(tokens.some((x) => x.includes("건물 취득가액 = 많은 금액(상속개시일 평가액 30,000,000, 영 §164⑦ 가액의 건물 몫 36,000,000) = 36,000,000 — 소득세법 시행령 §163조 제9항 단서 2호"))).toBe(true);
    expect(tokens.some((x) => x.includes("단서 1호"))).toBe(false);
  });
  it("증여 — 「증여 신고가액」 · ② 29,473,684 채택", async () => {
    const r = await run(gift({ buildingAcquisitionPrice: "25,000,000" }));
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.getByTestId("split-card-acq-basis").textContent).toContain("증여 신고가액");
    expect(screen.getByTestId("split-card-acq-basis-sec164").textContent).toBe("29,473,684");
  });
});
