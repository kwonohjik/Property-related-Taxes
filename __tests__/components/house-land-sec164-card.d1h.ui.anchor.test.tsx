/**
 * D1-H — 1990.8.30.~2005.4.29. 상속·증여 주택 부수토지 + 건물 매매: ⑤ 입력 카드 · ⑥ 사이드바 · ⑦ 결과 4뷰 (2026-10-19)
 *
 * 계획서: docs/00-pm/transfer-house-land-163-9-2.plan.md (Q-1~Q-5 권고안) · D2-4b `building-sec164-card.d2-4b.ui.anchor.test.tsx`의 거울
 *
 * 입력은 화면 폼(AssetForm) → ④ body → 실제 route(⑫⑭) → 엔진 결과다(손으로 만든 echo 아님). 4뷰는 뷰마다 따로 잠근다.
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(cleanup);

const TRANSFER_DATE = "2026-06-30";
const SEC = "115,384,615";

/** 건물 매매 2018 + 토지 증여 1995-05-01 · ① 100,000,000 · ② = 300M × (500,000 × 200) ÷ (1,000,000 × 200 + 60M) = 115,384,615 */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-03-02",
    landAcquisitionCause: "gift", landCauseHost: "purchase", landAcquisitionDate: "1995-05-01",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual",
    landAcquisitionPrice: "100,000,000", buildingAcquisitionPrice: "350,000,000", fixedAcquisitionPrice: "450,000,000",
    actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    acquisitionArea: "200", transferArea: "200",
    landHouseExisted: "yes", inheritanceAssetKind: "house_individual",
    inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1000000",
    inhHouseValBuildingStdPriceAtFirst: "60,000,000", inhHouseValLandPricePerSqmAtInheritance: "500000",
    ...over,
  } as AssetForm;
}

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
const card = () => screen.queryByTestId("house-land-sec164-card");

describe("⑤ 카드 노출 — 구간의 주택 · 건물 매매만 (④⑥⑧과 같은 술어)", () => {
  it("1995 증여 → 카드 · 1990-08-30 → 카드 · 2005-04-29 → 카드", () => {
    for (const d of ["1995-05-01", "1990-08-30", "2005-04-29"]) {
      mount(asset({ landAcquisitionDate: d }));
      expect(card(), d).not.toBeNull();
      cleanup();
    }
  });
  it("부정형 짝 — 2005-04-30·1990-08-29·비주택 building·토글 OFF → 카드 없음", () => {
    for (const over of [
      { landAcquisitionDate: "2005-04-30" },
      { landAcquisitionDate: "1990-08-29" },
      { assetKind: "building" },
      { hasSeperateLandAcquisitionDate: false },
    ] as Partial<AssetForm>[]) {
      mount(asset(over));
      expect(card(), JSON.stringify(over)).toBeNull();
      cleanup();
    }
  });
  it("숫자 placeholder가 카드에 없다", () => {
    mount(asset());
    card()!.querySelectorAll("input").forEach((el) => expect(el.getAttribute("placeholder") ?? "").not.toMatch(/\d/));
  });
});

describe("⑤ Q-1 받을 당시 주택 — 명시 선택", () => {
  it("미선택 → 아무것도 체크되지 않고 구분·입력 칸 없음 · 「있었음」 클릭 → landHouseExisted patch", () => {
    const calls: Partial<AssetForm>[] = [];
    mount(asset({ landHouseExisted: "" }), (p) => calls.push(p));
    const q = card()!.querySelector('[data-field="landHouseExisted"]') as HTMLElement;
    within(q).getAllByRole("radio").forEach((r) => expect(r).not.toBeChecked());
    expect(card()!.querySelector('[data-field="inheritanceAssetKind"]')).toBeNull();
    fireEvent.click(within(q).getByRole("radio", { name: /있었음/ }));
    expect(calls.at(-1)).toEqual({ landHouseExisted: "yes" });
  });
  it("모름 → 평가액만 안내 · 입력 칸 없음 / 없었음 → 입력 칸 없음", () => {
    mount(asset({ landHouseExisted: "unknown" }));
    expect(screen.getByTestId("house-land-sec164-unknown-note").textContent).toContain("평가액만으로 계산합니다");
    expect(card()!.querySelector('[data-field="inhHouseValHousePriceAtFirst"]')).toBeNull();
    cleanup();
    mount(asset({ landHouseExisted: "no" }));
    expect(card()!.querySelector('[data-field="inhHouseValHousePriceAtFirst"]')).toBeNull();
  });
});

describe("⑤ 주택 구분 — 명시 선택만 (미선택을 단독으로 보지 않는다)", () => {
  it("미선택(기본 land) → 체크 없음 · 입력 칸 없음 · 단독 클릭 → inheritanceAssetKind patch", () => {
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
    expect(screen.getByTestId("house-land-sec164-apart-note").textContent).toContain("단독·다가구주택으로 확인된 주택만 지원합니다");
    expect(card()!.querySelector('[data-field="inhHouseValHousePriceAtFirst"]')).toBeNull();
  });
});

describe("⑤ 단독·다가구 — 입력 칸·파생 박스", () => {
  it("② 표시 = ④가 보내는 브리지 값(115,384,615) · 산식 한국어 · 채택값 미표시", () => {
    mount(asset());
    expect(screen.getByTestId("house-land-sec164-total").textContent).toBe(SEC);
    const box = screen.getByTestId("house-land-sec164-derived").textContent!;
    expect(box).toContain("최초 공시된 개별주택가격 300,000,000");
    expect(box).toContain("증여일 토지 기준시가 100,000,000");
    expect(box).toContain("최초공시 토지 기준시가 200,000,000");
    expect(box).toContain("최초공시 건물 기준시가 60,000,000");
    expect(box).toContain("영 §164⑦ 가액의 토지 몫");
    expect(box).toContain("계산 결과에서 확인");
  });
  it("지분 50% → 57,692,307 · 지분 표기", () => {
    mount(asset({ ownershipNumerator: "1", ownershipDenominator: "2" }));
    expect(screen.getByTestId("house-land-sec164-total").textContent).toBe("57,692,307");
    expect(screen.getByTestId("house-land-sec164-derived").textContent).toContain("× 지분 50%");
  });
  it("미완 → 「입력할 칸」 목록 · 일부 양도 → 지원하지 않음 안내", () => {
    mount(asset({ inhHouseValBuildingStdPriceAtFirst: "" }));
    expect(screen.getByTestId("house-land-sec164-derived").textContent).toContain("입력할 칸: 최초공시 시점 건물 기준시가");
    cleanup();
    mount(asset({ areaScenario: "partial", transferArea: "100" }));
    expect(screen.getByTestId("house-land-sec164-partial-note")).toBeTruthy();
  });
  it("라벨: 증여 = 증여일 · 상속 = 상속개시일", () => {
    mount(asset());
    expect(card()!.querySelector('[data-field="inhHouseValLandPricePerSqmAtInheritance"]')).not.toBeNull();
    expect(within(card()!).getByText("증여일 개별공시지가")).toBeTruthy();
    cleanup();
    mount(asset({ landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1980-01-01" }));
    expect(within(card()!).getByText("상속개시일 개별공시지가")).toBeTruthy();
  });
  it("⑧이 막을 수 있는 모든 칸이 화면 앵커로 존재한다 — 칸 없는 차단 0", () => {
    const fields = new Set<string>();
    const v8 = (a: AssetForm) => {
      const r = collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));
      return r.result ? r.fieldOf(r.result) : undefined;
    };
    const cases: Partial<AssetForm>[] = [
      { landHouseExisted: "" },
      { acquisitionArea: "", transferArea: "" }, { inhHouseValHousePriceAtFirst: "" }, { inhHouseValLandPricePerSqmAtFirst: "" },
      { inhHouseValBuildingStdPriceAtFirst: "" }, { inhHouseValLandPricePerSqmAtInheritance: "" },
      { inhHouseValHousePriceAtFirst: "1", inhHouseValLandPricePerSqmAtInheritance: "1" },
      { inheritanceAssetKind: "land" }, { inheritanceAssetKind: "house_apart" }, { areaScenario: "partial", transferArea: "100" },
    ];
    for (const over of cases) {
      const f = v8(asset(over));
      expect(f, JSON.stringify(over)).toBeDefined();
      fields.add(f as string);
    }
    const found = new Set<string>();
    for (const over of [{}, { landHouseExisted: "" }, { inhHouseValBuildingStdPriceAtFirst: "" }, { inheritanceAssetKind: "land" }] as Partial<AssetForm>[]) {
      const { container, unmount } = mount(asset(over));
      container.querySelectorAll("[data-field]").forEach((el) => found.add(el.getAttribute("data-field")!));
      unmount();
    }
    const outside = new Set(["acquisitionArea", "areaScenario"]); // 기본 정보(AssetAreaSection) 소관
    const missing = [...fields].filter((f) => !outside.has(f) && !found.has(f));
    expect(missing, `화면에 없는 앵커: ${missing.join(", ")}`).toEqual([]);
    expect([...fields].sort()).toEqual(
      ["acquisitionArea", "areaScenario", "inhHouseValBuildingStdPriceAtFirst", "inhHouseValHousePriceAtFirst", "inhHouseValLandPricePerSqmAtFirst",
        "inhHouseValLandPricePerSqmAtInheritance", "inheritanceAssetKind", "landHouseExisted"].sort(),
    );
  });
});

describe("⑥ 사이드바 — 입력 단계 pending · 결과 도착 후 엔진 합", () => {
  it("결과 전 pending → 결과 후 465,384,615(토지 ② 115,384,615 + 건물 350,000,000)", async () => {
    const a = asset();
    expect(computeTransferPerAssetSummary(TF(a), null).rows[0].acqPending).toBe(true);
    const res = { mode: "single", result: await run(a) } as never;
    const post = computeTransferPerAssetSummary(TF(a), res).rows[0];
    expect(post.acqPending).toBe(false);
    expect(post.acqPrice).toBe(465_384_615);
  });
  it("부정형 짝 — 모름은 입력 단계에서 바로 확정(① 1억 + 건물 3.5억)", () => {
    const pre = computeTransferPerAssetSummary(TF(asset({ landHouseExisted: "unknown" })), null).rows[0];
    expect(pre.acqPending).toBe(false);
    expect(pre.acqPrice).toBe(450_000_000);
  });
});

describe("⑦ 결과 4뷰 — 토지 echo(sec163_9_2_land)는 토지·단서 2호·「영 §164⑦ 가액의 토지 몫」", () => {
  const FORM = {
    transferDate: TRANSFER_DATE, contractTotalPrice: "1200000000",
    assets: [{ acquisitionDate: "2018-03-02", landAcquisitionDate: "1995-05-01", residencePeriodMonthsAsset: "0" }],
  } as unknown as TransferFormData;
  const LINE = `토지 취득가액 = 많은 금액(증여 신고가액 100,000,000, 영 §164⑦ 가액의 토지 몫 ${SEC}) = ${SEC}`;

  it("① 카드 — data-part 토지 · 「토지 취득가액 비교 (…단서 2호」 · ② 이름", async () => {
    const r = await run(asset());
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    const box = screen.getByTestId("split-card-acq-basis");
    expect(box.getAttribute("data-part")).toBe("토지");
    expect(box.textContent).toContain("토지 취득가액 비교 (소득세법 시행령 §163조 제9항 단서 2호 — 많은 금액)");
    expect(box.textContent).not.toContain("단서 1호");
    expect(box.textContent).not.toContain("영 §164④");
    expect(screen.getByTestId("split-card-acq-basis-sec164").textContent).toBe(SEC);
    expect(screen.getByTestId("split-card-acq-basis-adopted").textContent).toBe("영 §164⑦ 가액의 토지 몫");
  });
  it("② 상세명세서 — 산식 한 줄(단서 2호)", async () => {
    const textOf = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
    const f = textOf(buildStatementItems(await run(asset()), FORM, undefined, undefined, 1_200_000_000).get("acquisitionPrice")!.formula);
    expect(f).toContain(`${LINE} (소득세법 시행령 §163조 제9항 단서 2호)`);
    expect(f).not.toContain("건물 취득가액 = 많은 금액");
  });
  it("③ 신고서 split-2col — 토지 열 각주(단서 2호), 건물 열 각주 없음", async () => {
    const r = await run(asset());
    expect(deriveColumns(r).mode).toBe("split-2col");
    const row = buildRows(r, "split-2col", FORM, undefined, 1_200_000_000).find((x) => x.roseNotes && /많은 금액/.test(JSON.stringify(x.roseNotes)))!;
    expect(row.roseNotes!.land).toContain(`${LINE} (소득세법 시행령 §163조 제9항 단서 2호)`);
    expect(row.roseNotes!.building ?? "").not.toContain("많은 금액");
  });
  it("④ PDF — 토지 비교 문장 행(단서 2호)", async () => {
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
    expect(tokens.some((x) => x.includes(`${LINE} — 소득세법 시행령 §163조 제9항 단서 2호`))).toBe(true);
    expect(tokens.some((x) => x.includes("단서 1호"))).toBe(false);
  });
});
