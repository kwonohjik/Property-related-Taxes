/**
 * 구주택 멸실·신축 통산(해석 (5)) — ⑤ 입력 블록 · ⑦ 결과 4뷰 (UI 설계 §4·§6)
 *
 * ⑤: 노출 술어(`landRebuildApplicable`)·위젯 값 축·⑧ 앵커가 모두 화면에 있다.
 * ⑦: 입력은 화면 폼(AssetForm) → ④ body → 실제 route(⑫⑭) → 엔진 결과다(손으로 만든 echo 아님). 4뷰는 뷰마다 따로 잠근다 —
 *     `appliedRateBasisDate`는 합산 개월을 만드는 환산 기산일이라 실제 취득일처럼 보이면 안 된다.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { checkedRadioValue, radioValues } from "./_helpers/radio-values";

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
import { RebuiltHouseLandBlock } from "@/components/calc/transfer/RebuiltHouseLandBlock";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import { rebuildAsset, rebuildForm, purchaseRebuildAsset } from "../calc/_helpers/land-rebuild-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const TRANSFER_DATE = "2025-09-01";
// 스위치의 접근 가능한 이름은 라벨 전체(제목 + 설명)라 정규식으로 찾는다
const TITLE = /같은 토지 위 구주택을 멸실하고 신축했다/;

function mount(a: AssetForm, onChange: (p: Partial<AssetForm>) => void = () => {}, extra: { isNonPrimaryAsset?: boolean } = {}) {
  return render(
    <CompanionAcquisitionCauseSection asset={a} onChange={onChange} transferDate={TRANSFER_DATE} isNewConstruction={a.acquisitionCause === "newConstruction"} {...extra} />,
  );
}
const block = () => screen.queryByTestId("land-rebuild-block");
const dataFields = (el: HTMLElement) => new Set(Array.from(el.querySelectorAll("[data-field]")).map((e) => e.getAttribute("data-field")!));

describe("⑤ 노출 — 주택 · 신축 · 「토지는 다른 원인으로 취득」 유효 · 소유자 같음 · 첫 자산 (④⑧과 같은 술어)", () => {
  it("호스트 열림 → 블록(토글 한 줄) · 토글 OFF면 입력 칸은 접혀 있다", () => {
    mount(rebuildAsset({ landRebuildEnabled: false }));
    expect(block()).not.toBeNull();
    expect(screen.getByRole("switch", { name: TITLE })).toBeTruthy();
    expect(screen.queryByTestId("land-rebuild-start-mode")).toBeNull();
    expect(screen.queryByTestId("land-rebuild-demolition-date")).toBeNull();
  });

  it("부정형 짝 — 토지 원인 OFF · 취득원인 상속(건물) · 소유자 분리 · 부담부증여 · 겸용 · 컴패니언 → 블록 없음(저장값이 켜져 있어도)", () => {
    for (const over of [
      { landCauseHost: "" },
      { acquisitionCause: "inheritance" },
      { selfOwns: "building_only" },
      { transferType: "burdened_gift" },
      { isMixedUseHouse: true },
      { assetKind: "building" },
    ] as Record<string, unknown>[]) {
      mount(rebuildAsset(over));
      expect(block(), JSON.stringify(over)).toBeNull();
      cleanup();
    }
    mount(rebuildAsset(), () => {}, { isNonPrimaryAsset: true });
    expect(block(), "컴패니언").toBeNull();
  });

  it("토글 클릭 → landRebuildEnabled 한 키만 쓴다(다른 입력은 보존)", () => {
    const calls: Partial<AssetForm>[] = [];
    mount(rebuildAsset({ landRebuildEnabled: false }), (p) => calls.push(p));
    fireEvent.click(screen.getByRole("switch", { name: TITLE }));
    expect(calls.at(-1)).toEqual({ landRebuildEnabled: true });
  });
});

describe("⑤ 노출 — 매매 호스트: 취득원인 매매 + 「토지·건물 취득일 다름」 + 토지 상속·증여 overlay 없음", () => {
  it("호스트 열림 → 블록이 토지·건물 날짜 2열 직후·양도가액 구분(축 A) 앞에 한 번만 나온다", () => {
    const { container } = mount(purchaseRebuildAsset({ landRebuildEnabled: false }));
    expect(screen.getAllByTestId("land-rebuild-block")).toHaveLength(1);
    expect(screen.getByRole("switch", { name: TITLE })).toBeTruthy();
    const grid = container.querySelector('[data-testid="acq-date-split-grid"]')!;
    const blk = block()!;
    expect(grid.compareDocumentPosition(blk) & Node.DOCUMENT_POSITION_FOLLOWING, "날짜 2열 뒤").toBeTruthy();
    const axisA = container.querySelector('[data-testid="sale-split-mode"]');
    expect(axisA, "양도가액 구분(축 A)이 같은 화면에 있다").not.toBeNull();
    expect(blk.compareDocumentPosition(axisA!) & Node.DOCUMENT_POSITION_FOLLOWING, "축 A 앞").toBeTruthy();
  });

  it("신축 호스트도 블록은 한 번만 — 두 마운트 자리가 같은 자산에서 겹치지 않는다", () => {
    mount(rebuildAsset());
    expect(screen.getAllByTestId("land-rebuild-block")).toHaveLength(1);
  });

  it("매매 호스트 안내 — 「건물 취득일」 칸에 신축 주택의 취득일을 넣는다(사용승인서 교부일 · 사실상 사용일·임시사용승인일 중 빠른 날 · 영 §162①4호) · 신축 호스트에는 이 문단이 없다", () => {
    mount(purchaseRebuildAsset());
    const p = screen.getByTestId("land-rebuild-purchase-notice").textContent!;
    expect(p).toContain("건물 취득일 칸에는 신축 주택의 취득일을 넣으세요");
    expect(p).toContain("사용승인서 교부일");
    expect(p).toContain("사실상 사용일 또는 임시사용승인일 중 빠른 날");
    expect(p).toContain("소득세법 시행령 §162 ① 4호");
    cleanup();
    mount(rebuildAsset());
    expect(screen.queryByTestId("land-rebuild-purchase-notice")).toBeNull();
  });

  it("부정형 짝 — 토지 상속·증여 overlay · D2 · 취득일 다름 OFF · 소유자 분리 · 부담부증여 · 겸용 · 건물 · 컴패니언 → 블록 없음(저장값이 켜져 있어도)", () => {
    for (const over of [
      { landAcquisitionCause: "inheritance", landCauseHost: "purchase", landDecedentAcquisitionDate: "2010-01-01" },
      { landAcquisitionCause: "gift", landCauseHost: "purchase" },
      { acquisitionCause: "inheritance", landAcquisitionCause: "purchase", landCauseHost: "inheritance" },
      { hasSeperateLandAcquisitionDate: false },
      { selfOwns: "land_only" },
      { transferType: "burdened_gift" },
      { isMixedUseHouse: true },
      { assetKind: "building" },
    ] as Record<string, unknown>[]) {
      mount(purchaseRebuildAsset(over));
      expect(block(), JSON.stringify(over)).toBeNull();
      cleanup();
    }
    mount(purchaseRebuildAsset(), () => {}, { isNonPrimaryAsset: true });
    expect(block(), "컴패니언").toBeNull();
  });

  it("블록은 자기 호스트일 때만 렌더한다 — host prop과 자산의 호스트가 다르면 null(두 마운트 자리가 겹치지 않는다)", () => {
    render(<RebuiltHouseLandBlock host="newConstruction" asset={purchaseRebuildAsset()} onChange={() => {}} />);
    expect(block()).toBeNull();
    cleanup();
    render(<RebuiltHouseLandBlock host="purchase" asset={rebuildAsset()} onChange={() => {}} />);
    expect(block()).toBeNull();
    cleanup();
    render(<RebuiltHouseLandBlock host="purchase" asset={purchaseRebuildAsset()} onChange={() => {}} />);
    expect(block()).not.toBeNull();
  });

  it("토글 클릭 → landRebuildEnabled 한 키만 쓴다 · 구주택 취득일 칸은 later일 때만 · ⑧ 앵커 5칸이 모두 화면에 있다", () => {
    const calls: Partial<AssetForm>[] = [];
    mount(purchaseRebuildAsset({ landRebuildEnabled: false }), (p) => calls.push(p));
    fireEvent.click(screen.getByRole("switch", { name: TITLE }));
    expect(calls.at(-1)).toEqual({ landRebuildEnabled: true });
    cleanup();
    const { container } = mount(purchaseRebuildAsset({ landRebuildStartMode: "later" }));
    const found = dataFields(container);
    for (const f of ["landRebuildEnabled", "landRebuildStartMode", "landRebuildPriorHouseStartDate", "landRebuildDemolitionDate", "landRebuildFootprintUnchanged"]) {
      expect(found.has(f), f).toBe(true);
    }
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });
});

describe("⑤ 위젯 — 값 축 · ⑧ 앵커 · 입력 규약", () => {
  it("시작 구분 라디오 값 = since_land · later, 미선택이면 아무것도 체크되지 않는다(자동 채움 없음)", () => {
    const { container } = mount(rebuildAsset({ landRebuildStartMode: "" }));
    expect(radioValues(container, "landRebuildStartMode")).toEqual(["since_land", "later"]);
    expect(checkedRadioValue(container, "landRebuildStartMode")).toBeUndefined();
  });

  it("라디오 클릭 → landRebuildStartMode patch(값 축)", () => {
    const calls: Partial<AssetForm>[] = [];
    mount(rebuildAsset({ landRebuildStartMode: "" }), (p) => calls.push(p));
    fireEvent.click(screen.getByTestId("land-rebuild-start-later"));
    expect(calls.at(-1)).toEqual({ landRebuildStartMode: "later" });
    fireEvent.click(screen.getByTestId("land-rebuild-start-since-land"));
    expect(calls.at(-1)).toEqual({ landRebuildStartMode: "since_land" });
  });

  it("구주택 취득일 칸은 「아니오(later)」일 때만 열린다", () => {
    mount(rebuildAsset({ landRebuildStartMode: "since_land" }));
    expect(screen.queryByTestId("land-rebuild-prior-start-date")).toBeNull();
    cleanup();
    mount(rebuildAsset({ landRebuildStartMode: "later" }));
    expect(screen.getByTestId("land-rebuild-prior-start-date")).toBeTruthy();
  });

  it("정착면적 확인 토글 클릭 → landRebuildFootprintUnchanged patch", () => {
    const calls: Partial<AssetForm>[] = [];
    mount(rebuildAsset({ landRebuildFootprintUnchanged: false }), (p) => calls.push(p));
    fireEvent.click(screen.getByRole("switch", { name: /신축주택의 정착면적이 구주택보다 늘지 않았다/ }));
    expect(calls.at(-1)).toEqual({ landRebuildFootprintUnchanged: true });
  });

  it("⑧이 막을 수 있는 모든 칸의 data-field 앵커가 화면에 있다 — 칸 없는 차단 0", () => {
    const { container } = mount(rebuildAsset({ landRebuildStartMode: "later" }));
    const found = dataFields(container);
    for (const f of ["landRebuildEnabled", "landRebuildStartMode", "landRebuildPriorHouseStartDate", "landRebuildDemolitionDate", "landRebuildFootprintUnchanged"]) {
      expect(found.has(f), f).toBe(true);
    }
  });

  it("숫자 placeholder가 없고 안내문이 근거·한계를 밝힌다", () => {
    const { container } = mount(rebuildAsset({ landRebuildStartMode: "later" }));
    within(block()!).getAllByRole("textbox").forEach((el) => expect(el.getAttribute("placeholder") ?? "").not.toMatch(/\d{2,}/));
    const notice = screen.getByTestId("land-rebuild-notice").textContent!;
    expect(notice).toContain("본인 소유였던 구주택");
    expect(notice).toContain("정착면적");
    expect(notice).toContain("비과세 보유·거주기간");
    // native checkbox 신규 금지 — Switch가 접근성용으로 두는 숨김(aria-hidden) 입력은 제외
    expect(container.querySelector('input[type="checkbox"]:not([aria-hidden="true"])')).toBeNull();
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 결과 4뷰 — 통산 echo
// ─────────────────────────────────────────────────────────────────────────────

async function run(a: AssetForm): Promise<TransferTaxResult> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(rebuildForm({}, a));
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
      residencePeriodMonths: 0, ...cap.body,
    }),
  }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { result: TransferTaxResult } }).data.result;
}

const FORM = {
  transferDate: TRANSFER_DATE, contractTotalPrice: "1000000000",
  assets: [{ acquisitionDate: "2025-01-01", landAcquisitionDate: "2022-01-01", residencePeriodMonthsAsset: "0" }],
} as unknown as TransferFormData;

/** 시드: 토지 2010-01-01(피상속인 취득일, since_land) ~ 멸실 2023-05-31 = 161개월 + 신축 2025-01-01 ~ 양도 2025-09-01 = 8개월 → 169개월. 환산 기산일 2011-08-02 */
const LINES = {
  prior: "구주택 부수토지 기간 2010-01-01~2023-05-31 (161개월 · 토지 법정 기산일부터)",
  built: "신축주택 부수토지 기간 2025-01-01~2025-09-01 (8개월)",
  sum: "세율 판정 보유기간 161개월 + 8개월 = 169개월",
  equiv: "세율 판정용 환산 기산일 2011-08-02",
};

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
  collect((el.props as { children?: unknown } | undefined)?.children, out);
  return out;
}

describe("⑦ 결과 4뷰 — 환산 기산일이 실제 취득일로 읽히지 않고 두 구간·합산 개월이 보인다", () => {
  it("① 카드 — 세율 기산일 칸은 「환산 …」, 구간 블록에 두 구간·합산 개월·환산 기산일·실제 취득일이 아님", async () => {
    const r = await run(rebuildAsset());
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain("환산 2011-08-02");
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).toContain("169개월 통산");
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).not.toContain("주택 취득일부터");
    // 건물 칸은 실제 취득일(신축)이라 「환산」이 붙지 않는다
    expect(screen.getByTestId("split-card-rate-basis-building").textContent).not.toContain("환산");
    const lines = screen.getByTestId("split-card-rate-holding").textContent!;
    expect(lines).toContain(LINES.prior);
    expect(lines).toContain(LINES.built);
    expect(lines).toContain(LINES.sum);
    expect(lines).toContain(LINES.equiv);
    expect(lines).toContain("실제 취득일이 아님");
  });

  it("① 카드 부정형 짝 — 입력 없음이면 구간 블록·「환산」이 없다(기존 화면 불변)", async () => {
    const r = await run(rebuildAsset({ landRebuildEnabled: false }));
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-card-rate-holding")).toBeNull();
    expect(screen.getByTestId("split-card-rate-basis-land").textContent).not.toContain("환산");
  });

  it("② 상세명세서 — 산출세액 행 note에 「세율 판정용 환산 기산일」 + 두 구간·합산 개월(summarizeSplitGain 파트 요약이 echo를 싣는다)", async () => {
    const r = await run(rebuildAsset());
    const note = buildStatementItems(r, FORM, undefined, undefined, 1_000_000_000).get("calculatedTax")!.note ?? "";
    expect(note).toContain("세율 판정용 환산 기산일 2011-08-02");
    expect(note).toContain("구주택 부수토지 161개월(2010-01-01~2023-05-31)");
    expect(note).toContain("신축주택 부수토지 8개월(2025-01-01~2025-09-01)");
    expect(note).toContain("169개월 통산");
    // 건물 파트는 실제 취득일 — 「환산」 라벨이 붙지 않는다
    expect(note).toContain("건물 신축(자가건축) 2025-01-01 · 세율 기산일 2025-01-01");
    expect(note).not.toContain("주택 취득일이 늦어");
  });

  it("③ 신고서 split-2col — 토지 열 취득일 각주에 「세율 판정용 환산 기산일」 · 구간 · 합산 개월", async () => {
    const r = await run(rebuildAsset());
    expect(deriveColumns(r).mode).toBe("split-2col");
    const row = buildRows(r, "split-2col", FORM, undefined, 1_000_000_000).find((x) => x.roseNotes && /환산 기산일/.test(JSON.stringify(x.roseNotes)))!;
    expect(row, "신고서에 통산 각주 행이 있다").toBeTruthy();
    expect(row.roseNotes!.land).toContain("세율 판정용 환산 기산일 2011-08-02");
    expect(row.roseNotes!.land).toContain("169개월 통산");
    expect(row.roseNotes!.building ?? "").not.toContain("환산");
  });

  it("④ PDF — 날짜 칸 「환산 …」 + 구간 줄(두 구간·합산 개월·환산 기산일)", async () => {
    const r = await run(rebuildAsset());
    const tokens = collect(TransferSplitSection({ r: r as unknown as Record<string, unknown> }));
    expect(tokens).toContain("환산 2011-08-02");
    for (const line of Object.values(LINES)) expect(tokens.some((t) => t.includes(line)), line).toBe(true);
  });

  it("④ PDF 부정형 짝 — 입력 없음이면 「환산」·구간 줄이 없다", async () => {
    const r = await run(rebuildAsset({ landRebuildEnabled: false }));
    const tokens = collect(TransferSplitSection({ r: r as unknown as Record<string, unknown> }));
    expect(tokens.some((t) => t.includes("환산 "))).toBe(false);
    expect(tokens.some((t) => t.includes("구주택 멸실·신축 통산"))).toBe(false);
  });

  it("엔진 고지가 결과에 실린다 — 0097 직접 판단 한계·비과세·장특 미반영(확인 필요) · 합산 24개월 미만이 아니므로 2년 미만 확장 문구는 없다", async () => {
    const r = await run(rebuildAsset());
    const w = (r.warnings ?? []).join(" | ");
    expect(w).toContain("서면법규과-1222");
    expect(w).toContain("확인 필요");
    expect(w).toContain("장기보유특별공제 보유기간의 통산");
    expect(w).not.toContain("2년 미만 구간");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 매매 호스트 — 토지·건물 취득원인이 같아(`mixedCause` = false) 세율 기산일 행이 없는 경우에도 구간이 4뷰에 나온다 (UI 설계 R-4)
// ─────────────────────────────────────────────────────────────────────────────

/** 시드: 토지 매수 2022-01-01 ~ 멸실 2023-05-31 = 17개월 + 신축 2025-01-01 ~ 양도 2025-09-01 = 8개월 → 25개월. 환산 기산일 2023-08-02 */
const P_LINES = {
  prior: "구주택 부수토지 기간 2022-01-01~2023-05-31 (17개월 · 토지 법정 기산일부터)",
  built: "신축주택 부수토지 기간 2025-01-01~2025-09-01 (8개월)",
  sum: "세율 판정 보유기간 17개월 + 8개월 = 25개월",
  equiv: "세율 판정용 환산 기산일 2023-08-02",
};

describe("⑦ 매매 호스트 4뷰 — 취득원인이 같아도(mixedCause=false) 구간·합산 개월·환산 기산일이 나온다", () => {
  it("전제: 매매 호스트 결과는 토지·건물 취득원인이 같은 purchase다(mixedCause=false)", async () => {
    const r = await run(purchaseRebuildAsset());
    expect(r.splitDetail!.land.acquisitionCause).toBe("purchase");
    expect(r.splitDetail!.building.acquisitionCause).toBe("purchase");
    expect(r.splitDetail!.land.rateHoldingAggregation?.totalMonths).toBe(25);
  });

  it("① 카드 — 세율 기산일 행은 없고(원인 동일) 구간 블록에 두 구간·합산 개월·환산 기산일·실제 취득일이 아님", async () => {
    const r = await run(purchaseRebuildAsset());
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-card-rate-basis-land")).toBeNull();
    const lines = screen.getByTestId("split-card-rate-holding").textContent!;
    for (const l of Object.values(P_LINES)) expect(lines, l).toContain(l);
    expect(lines).toContain("실제 취득일이 아님");
  });

  it("① 카드 부정형 짝 — 입력 없음이면 구간 블록이 없다", async () => {
    const r = await run(purchaseRebuildAsset({ landRebuildEnabled: false }));
    render(<SplitGainDetailSection splitDetail={r.splitDetail!} assetKind="housing" />);
    expect(screen.queryByTestId("split-card-rate-holding")).toBeNull();
  });

  it("② 상세명세서 — 산출세액 행 note에 두 구간·합산 개월·환산 기산일", async () => {
    const r = await run(purchaseRebuildAsset());
    const note = buildStatementItems(r, FORM, undefined, undefined, 1_000_000_000).get("calculatedTax")!.note ?? "";
    expect(note).toContain("토지 세율 보유기간 통산");
    expect(note).toContain(P_LINES.equiv);
    expect(note).toContain("25개월");
    expect(note).toContain("2022-01-01~2023-05-31");
    expect(note).toContain("2025-01-01~2025-09-01");
  });

  it("③ 신고서 split-2col — 토지 열 취득일 각주에 두 구간·합산 개월·환산 기산일", async () => {
    const r = await run(purchaseRebuildAsset());
    const row = buildRows(r, "split-2col", FORM, undefined, 1_000_000_000).find((x) => x.roseNotes && /환산 기산일/.test(JSON.stringify(x.roseNotes)))!;
    expect(row, "신고서에 통산 각주 행이 있다").toBeTruthy();
    expect(row.roseNotes!.land).toContain(P_LINES.equiv);
    expect(row.roseNotes!.land).toContain("25개월");
    expect(row.roseNotes!.building ?? "").not.toContain("환산");
  });

  it("④ PDF — 구간 줄(두 구간·합산 개월·환산 기산일) · 부정형 짝은 구간 줄 없음", async () => {
    const tokens = collect(TransferSplitSection({ r: (await run(purchaseRebuildAsset())) as unknown as Record<string, unknown> }));
    for (const line of Object.values(P_LINES)) expect(tokens.some((t) => t.includes(line)), line).toBe(true);
    const off = collect(TransferSplitSection({ r: (await run(purchaseRebuildAsset({ landRebuildEnabled: false }))) as unknown as Record<string, unknown> }));
    expect(off.some((t) => t.includes("구주택 멸실·신축 통산"))).toBe(false);
  });
});

