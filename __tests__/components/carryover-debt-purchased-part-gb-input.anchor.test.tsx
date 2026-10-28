/**
 * anchor ⑤ — 이월과세 × 당초 증여 채무 부분(매입분) PR-2: 일반건물(E2) 입력 위젯 (UI 설계서 §3.2 · Q-UI-2 b · Q-UI-5 a).
 *
 * 토지 블록은 `asset` 그대로, 건물 블록은 부모(`GeneralBuildingAcquisitionCards`)가 `carryover` 자리에 건물 서브폼을 끼운 사본을 받는다 — 그래서 토글 값은 사건 출처(`carryoverGiftEventForm`)에서 읽는다.
 *  · GB-1 apply — 토글 설명이 분자 전용 노트가 아니라 조각 설명 · 파트 채무 칸 hint · 증여분에만 안내
 *  · GB-2 ★ 건물 블록 — 건물 서브폼의 토글이 꺼져 있어도 사건 토글이 켜졌으면 «증여분에만» 안내 (c.giftDebtAssumed를 읽으면 거짓)
 *  · GB-3 unsupported(감면·용도변경) — 토글 ON이 켜진 채 보이고 «끄세요» · 채무 칸은 숨긴다
 *  · GB-4 건물 파트 채무 + 증여자 신축 — 칸은 남기고 경고
 *  · GB-5 E4 부담부증여 일반건물 — 분자 전용 노트 유지
 *  · GB-6 본인 필요경비 안내 — 건물만 이월과세에서도 뜬다(출처 함수) · 환산 모드는 문구를 확정하지 않는다
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { AssetSectionExpense } from "@/components/calc/transfer/asset-sections/AssetSectionExpense";
import { capexHint } from "@/components/calc/transfer/capexHint";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { gbCarryoverEventSource } from "@/lib/calc/transfer-tax-api-gb-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150000000", giftDateValuation: "400000000", giftTaxCalculated: "30000000", giftTaxBase: "1000000000" };
const gb = (over: Record<string, unknown> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", useEstimatedAcquisition: true, ...over }) as unknown as AssetForm;
const landC = (co: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  gb({ acquisitionCause: "carryover_gift", carryover: { ...CO, giftDebtAssumed: true, giftAssumedDebt: "100000000", ...co }, ...over });
const buildingC = (co: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  gb({ gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: { ...CO, giftDebtAssumed: true, giftAssumedDebt: "100000000", ...co }, ...over });
const bothC = (landCo: Record<string, unknown> = {}, bldCo: Record<string, unknown> = {}, over: Record<string, unknown> = {}) =>
  gb({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: { ...CO, giftDebtAssumed: true, giftAssumedDebt: "100000000", ...landCo }, buildingCarryover: { ...CO, giftDebtAssumed: false, giftAssumedDebt: "50000000", ...bldCo }, ...over });

const drawLand = (a: AssetForm) => render(<CarryoverGiftBlock asset={a} transferDate="2026-03-01" onChange={vi.fn()} />);
/** 부모 `GeneralBuildingAcquisitionCards`/`GbBuildingCarryoverCard`와 같은 사본·prop. */
const drawBuilding = (a: AssetForm) =>
  render(<CarryoverGiftBlock part="building" asset={{ ...a, carryover: a.buildingCarryover ?? a.carryover }} eventGiftDebtAssumed={gbCarryoverEventSource(a)?.giftDebtAssumed} transferDate="2026-03-01" onChange={vi.fn()} />);
const field = (name: string) => document.querySelector(`[data-field='${name}']`);
const toggle = () => screen.queryByTestId("carryover-gift-debt-assumed");

describe("GB-1 apply — 토지만 이월과세 · 토지 파트", () => {
  it("토글 설명은 조각 설명 — 분자 전용 노트 없음 · 법령 인용 형식", () => {
    drawLand(landC());
    expect(screen.queryByTestId("carryover-debt-numerator-only-note")).toBeNull();
    const t = toggle()!.textContent ?? "";
    expect(t).toContain("「소득세법」 제88조 제1호 후단");
    expect(t).toContain("산출세액과 과세가액을 모두 입력");
    expect(toggle()?.getAttribute("data-field")).toBe("carryover.giftDebtAssumed");
  });
  it("토글 ON → 채무 칸(앵커 carryover.giftAssumedDebt) hint가 조각 규칙을 말한다 (이 계산기가 정한 방법 · 시나리오 B 취득가액 그대로)", () => {
    drawLand(landC());
    const t = field("carryover.giftAssumedDebt")?.textContent ?? "";
    expect(t).toContain("채무 인수 부분");
    expect(t).toContain("이 계산기가 정한 방법");
    expect(t).toContain("비교과세 시나리오 B의 취득가액은 평가액 그대로");
  });
  it("토글 ON ∧ apply → 증여자 취득가액·증여자 자본적지출·산출세액 hint에 «증여분에만» / OFF면 없음", () => {
    drawLand(landC());
    for (const f of ["carryover.donorAcquisitionPrice", "carryover.donorCapitalExpenditure", "carryover.giftTaxCalculated"])
      expect(field(f)?.textContent, f).toContain("증여분");
    expect(field("carryover.giftTaxCalculated")?.textContent).toContain("제97조의2 제1항 제3호");
    cleanup();
    drawLand(landC({ giftDebtAssumed: false }));
    for (const f of ["carryover.donorAcquisitionPrice", "carryover.donorCapitalExpenditure", "carryover.giftTaxCalculated"])
      expect(field(f)?.textContent ?? "", f).not.toContain("증여분");
    expect(field("carryover.giftAssumedDebt")).toBeNull();
  });
});

describe("GB-2 ★ 건물 블록 — 토글 값은 사건 출처에서 읽는다", () => {
  it("건물만 이월과세: 건물 블록이 사건 블록이다 — 토글(앵커) · 건물 파트 채무 칸(buildingCarryover.giftAssumedDebt)", () => {
    drawBuilding(buildingC());
    expect(toggle()?.getAttribute("data-field")).toBe("carryover.giftDebtAssumed");
    expect(field("buildingCarryover.giftAssumedDebt")?.textContent).toContain("채무 인수 부분");
    expect(screen.queryByTestId("carryover-debt-numerator-only-note")).toBeNull();
  });
  it("둘 다 이월과세: 건물 서브폼 토글이 꺼져 있어도 사건(토지) 토글이 켜졌으면 건물 블록 hint에 «증여분»이 붙는다 · 토글은 토지 블록에만", () => {
    const a = bothC();
    expect(a.buildingCarryover?.giftDebtAssumed).toBe(false); // ← 건물 서브폼 값을 직접 읽으면 거짓
    drawBuilding(a);
    expect(toggle()).toBeNull(); // 건물 블록은 사건 블록이 아니다
    expect(field("buildingCarryover.donorAcquisitionPrice")?.textContent).toContain("증여분");
    expect(field("buildingCarryover.giftAssumedDebt")?.textContent).toContain("건물에 담보된 채무");
  });
  it("둘 다 이월과세: 사건 토글 OFF → 건물 블록에 채무 칸·«증여분» 안내 없음", () => {
    const a = bothC({ giftDebtAssumed: false });
    drawBuilding(a);
    expect(field("buildingCarryover.giftAssumedDebt")).toBeNull();
    expect(field("buildingCarryover.donorAcquisitionPrice")?.textContent ?? "").not.toContain("증여분");
  });
});

describe("GB-3 unsupported — 감면·용도변경 (Q-UI-2 b)", () => {
  const EXPR = { type: "public_expropriation", expropriationCash: "600000000" } as never;
  it.each([
    ["감면", { reductions: [EXPR] }, "감면"],
    ["주택→상가 용도변경", { gbHouseToCommercialConversion: true }, "취득 시점"],
  ])("%s + 토글 ON → 켜진 채 보이고 «끄세요» 설명(사유 포함) · 채무 칸은 숨긴다", (_n, over, hint) => {
    drawLand(landC({}, over));
    expect(toggle()).toBeTruthy();
    const note = screen.getByTestId("carryover-debt-unsupported-toggle-note").textContent ?? "";
    expect(note).toContain(hint);
    expect(note).toContain("이 토글을 끄세요");
    expect(field("carryover.giftAssumedDebt")).toBeNull();
    // 안내 문구가 «증여분에만» 안내를 켜지 않는다 — 실제로 나누지 않는다
    expect(field("carryover.donorAcquisitionPrice")?.textContent ?? "").not.toContain("증여분");
  });
  it("토글 OFF + 감면 → 같은 사유 설명이 토글 아래에 보인다(켜기 전에 안다)", () => {
    drawLand(landC({ giftDebtAssumed: false }, { reductions: [EXPR] }));
    expect(screen.getByTestId("carryover-debt-unsupported-toggle-note").textContent).toContain("감면");
  });
});

describe("GB-4 건물 파트 채무 + 증여자 신축 — 칸은 남기고 경고", () => {
  const DONOR_BUILT = { useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "100000000", donorAcquisitionPrice: "", donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2010-01-10" };
  it("건물 블록 채무 칸 경고 · 토지 블록에는 없다 · 증여자 신축 OFF면 없다", () => {
    drawBuilding(buildingC(DONOR_BUILT));
    expect(screen.getByTestId("carryover-debt-building-donor-built-warning").textContent).toContain("신축·증축");
    expect(field("buildingCarryover.giftAssumedDebt")).toBeTruthy(); // 입력 중에 칸이 사라지지 않는다
    cleanup();
    drawBuilding(buildingC({ ...DONOR_BUILT, donorBuilt: false }));
    expect(screen.queryByTestId("carryover-debt-building-donor-built-warning")).toBeNull();
  });
});

describe("GB-5 E4 — 지금 양도하는 일반건물도 부담부증여: 분자 전용 노트 유지 (PR-3)", () => {
  it("토글 설명에 분자 전용 노트 · 조각 설명 없음", () => {
    drawLand(landC({}, { transferType: "burdened_gift" }));
    expect(screen.getByTestId("carryover-debt-numerator-only-note").textContent).toContain("분자에서만");
    expect(toggle()?.textContent ?? "").not.toContain("나누어 따로 계산합니다");
  });
});

describe("GB-6 본인 자본적지출·양도비 안내 (Q-2 a)", () => {
  const exp = (a: AssetForm) => render(<AssetSectionExpense asset={a} onChange={vi.fn()} />);
  const actual = { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false };
  it("★ 건물만 이월과세(실가) — 건물 서브폼의 토글을 읽어 안내가 뜬다 (asset.carryover는 기본값이라 직접 읽으면 거짓)", () => {
    const a = buildingC({}, actual);
    expect(a.carryover?.giftDebtAssumed ?? false).toBe(false);
    exp(a);
    expect(screen.getByTestId("carryover-debt-expense-split-notice").textContent).toContain("같은 몫");
  });
  it("토지만 이월과세(실가) → 안내 · 토글 OFF·감면(unsupported) → 없음", () => {
    exp(landC({}, actual));
    expect(screen.getByTestId("carryover-debt-expense-split-notice")).toBeTruthy();
    cleanup();
    exp(landC({ giftDebtAssumed: false }, actual));
    expect(screen.queryByTestId("carryover-debt-expense-split-notice")).toBeNull();
    cleanup();
    exp(landC({}, { ...actual, reductions: [{ type: "public_expropriation" }] }));
    expect(screen.queryByTestId("carryover-debt-expense-split-notice")).toBeNull();
  });
  it("★ 환산 모드는 문구를 확정하지 않는다 — 개산공제·§97②2호 swap이 미결(엔진 설계서 V-1·V-2)", () => {
    exp(landC());
    expect(screen.queryByTestId("carryover-debt-expense-split-notice")).toBeNull();
  });
  it("capexHint — 실가에서만 «같은 몫» 문장 · 환산·감정·매매사례는 불변", () => {
    expect(capexHint("토지", "actual", false, true)).toContain("같은 몫");
    expect(capexHint("토지", "actual", false, false)).not.toContain("같은 몫");
    for (const m of ["estimated", "appraisal", "salesCase"] as const) expect(capexHint("토지", m, false, true)).toBe(capexHint("토지", m, false, false));
  });
});
