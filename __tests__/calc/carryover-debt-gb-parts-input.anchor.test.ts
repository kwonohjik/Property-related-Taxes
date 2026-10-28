/**
 * anchor ④⑧ — 이월과세 × 당초 증여 채무 부분(매입분) PR-2 UI: 일반건물(E2) 입력 쪽.
 * 설계서 `docs/02-design/features/carryover-gift-debt-purchased-part-parts.ui.design.md` §2·§3.3·§3.4·§7(Q-UI-2 b · Q-UI-6 a K-2).
 *
 *  · G-1 K-2 — 토글 ON이면 증여세 두 칸이 차 있을 때(산출세액 0 포함) part 모양으로 채무가 와이어에 실린다. 토글 OFF 와이어는 불변.
 *  · G-2 ⑧ M-E2-4 — 토글 ON이면 두 칸 필수(산출세액 0 허용). ④의 모양 선택과 같은 조건이다(3중 패턴).
 *  · G-3 ⑧ M-E2-2 — 지원하지 않는 자산(감면·용도변경)에서 토글 ON이면 «끄세요»로 막고, 채무 칸 필수 오류보다 앞선다(그 상태의 UI는 채무 칸을 숨긴다).
 *  · G-4 건물 파트 채무 + 증여자 신축 — 토글 앵커 / 토지 파트만 채무면 통과.
 *  · G-5 술어(⑤) = 전송(④) = 차단(⑧) 격자.
 */
import { describe, it, expect } from "vitest";
import { buildGbCarryoverPayload, gbCarryoverUsesPartShape } from "@/lib/calc/transfer-tax-api-gb-carryover";
import { carryoverPurchasedPartScope, carryoverGiftEventForm, gbCarryoverBuildingDebt } from "@/lib/calc/carryover-gift-assumed-debt";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const gbBase = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "general_building",
    acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2021-03-01",
    useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated",
    gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50",
    gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000", gbZoneType: "general_residential",
    gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", ...over,
  }) as AssetForm;
const co = (o: Record<string, unknown> = {}) =>
  ({ ...CARRYOVER_DEFAULTS, giftRegistryDate: "2021-03-01", donorAcquisitionDate: "2005-06-15", donorAcquisitionPrice: "150,000,000", giftDateValuation: "400,000,000",
    giftTaxCalculated: "30,000,000", giftTaxBase: "1,000,000,000", donorRelation: "lineal", donorSameHousehold: "no", giftDebtAssumed: true, giftAssumedDebt: "100,000,000", ...o }) as never;
const landOnly = (o: Record<string, unknown> = {}, a: Partial<AssetForm> = {}) => gbBase({ acquisitionCause: "carryover_gift", carryover: co(o), ...a });
const buildingOnly = (o: Record<string, unknown> = {}, a: Partial<AssetForm> = {}) =>
  gbBase({ gbBuildingAcquisitionCause: "carryover_gift", carryover: { ...CARRYOVER_DEFAULTS }, buildingCarryover: co(o), ...a });
const formOf = (assets: AssetForm[], over: Partial<TransferFormData> = {}): TransferFormData =>
  ({ ...createDefaultTransferFormData(), assets, transferDate: "2026-03-01", filingDate: "2026-05-31", contractTotalPrice: "1,000,000,000", householdHousingCount: "2", isOneHousehold: false, ...over }) as TransferFormData;
const issuesOf = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)) as Array<{ field?: string; message?: string }>;
const fieldsOf = (f: TransferFormData) => issuesOf(f).map((i) => i.field);

describe("G-1 ④ K-2 — 모양 선택 완화 (토글 ON ∧ 과세가액 > 0 ∧ 산출세액 입력됨)", () => {
  const wire = (a: AssetForm) => buildGbCarryoverPayload(a);
  it("산출세액 3천만 · 과세가액 10억 → part 모양 + 채무 (종전 그대로)", () => {
    const w = wire(landOnly());
    expect(w.landCarryoverPart).toMatchObject({ giftAssumedDebt: 100_000_000, giftDateAssetValue: 400_000_000 });
    expect(w.carryoverGiftEvent).toMatchObject({ giftTaxCalculated: 30_000_000, giftTaxBase: 1_000_000_000 });
    expect(w.landCarryoverTaxation).toBeUndefined();
  });
  it("★ 산출세액 0 · 과세가액 10억 + 토글 ON → part 모양 · giftTaxCalculated 0 · 채무가 와이어에 실린다 (종전: engine 모양이라 채무가 침묵 누락)", () => {
    const w = wire(landOnly({ giftTaxCalculated: "0" }));
    expect(w.carryoverGiftEvent).toMatchObject({ giftTaxCalculated: 0, giftTaxBase: 1_000_000_000 });
    expect(w.landCarryoverPart?.giftAssumedDebt).toBe(100_000_000);
    expect(w.landCarryoverTaxation).toBeUndefined();
  });
  it("건물만 이월과세 — 사건 출처가 건물 서브폼이어도 같다", () => {
    const w = wire(buildingOnly({ giftTaxCalculated: "0" }));
    expect(w.buildingCarryoverPart?.giftAssumedDebt).toBe(100_000_000);
    expect(w.buildingCarryoverTaxation).toBeUndefined();
  });
  it("산출세액 빈칸 · 과세가액 빈칸 + 토글 ON → engine 모양 (⑧이 막는 입력 — G-2)", () => {
    expect(wire(landOnly({ giftTaxCalculated: "" })).landCarryoverTaxation).toBeTruthy();
    expect(wire(landOnly({ giftTaxCalculated: "0", giftTaxBase: "" })).landCarryoverTaxation).toBeTruthy();
  });
  it("★ 토글 OFF → 와이어 불변 (회귀 0): 산출세액 0이면 engine 모양, 3천만이면 part 모양에 채무 키 없음", () => {
    expect(wire(landOnly({ giftDebtAssumed: false, giftTaxCalculated: "0" })).landCarryoverTaxation).toBeTruthy();
    const w = wire(landOnly({ giftDebtAssumed: false }));
    expect(w.landCarryoverPart).toBeTruthy();
    expect(w.landCarryoverPart && "giftAssumedDebt" in w.landCarryoverPart).toBe(false);
  });
  it("gbCarryoverUsesPartShape 직접 — 3상태 × 토글", () => {
    const f = (calc: string, base: string, on: boolean) => ({ ...CARRYOVER_DEFAULTS, giftTaxCalculated: calc, giftTaxBase: base, giftDebtAssumed: on });
    expect(gbCarryoverUsesPartShape(f("30000000", "1000000000", false))).toBe(true);
    expect(gbCarryoverUsesPartShape(f("0", "1000000000", false))).toBe(false);
    expect(gbCarryoverUsesPartShape(f("0", "1000000000", true))).toBe(true);
    expect(gbCarryoverUsesPartShape(f("", "1000000000", true))).toBe(false);
    expect(gbCarryoverUsesPartShape(f("0", "", true))).toBe(false);
    expect(gbCarryoverUsesPartShape(undefined)).toBe(false);
  });
});

describe("G-2 ⑧ M-E2-4 — 토글 ON이면 증여세 두 칸 필수 (산출세액 0 허용)", () => {
  it.each([
    ["산출세액 빈칸", { giftTaxCalculated: "" }, "carryover.giftTaxCalculated"],
    ["과세가액 빈칸(산출세액 0)", { giftTaxCalculated: "0", giftTaxBase: "" }, "carryover.giftTaxBase"],
    ["둘 다 빈칸", { giftTaxCalculated: "", giftTaxBase: "" }, "carryover.giftTaxBase"],
  ])("토지 파트 · %s → %s 로 이동", (_n, o, field) => {
    const f = formOf([landOnly(o)]);
    expect(fieldsOf(f)).toContain(field);
    expect(issuesOf(f).find((i) => i.field === field)?.message).toContain("당초 증여 때 채무를 인수했으면");
  });
  it("건물만 이월과세 → 앵커가 buildingCarryover.* 다", () => {
    expect(fieldsOf(formOf([buildingOnly({ giftTaxCalculated: "" })]))).toContain("buildingCarryover.giftTaxCalculated");
    expect(fieldsOf(formOf([buildingOnly({ giftTaxBase: "" })]))).toContain("buildingCarryover.giftTaxBase");
  });
  it("산출세액 0 · 과세가액 10억 + 토글 ON → 통과 (증여재산공제로 세액이 없는 증여)", () => {
    expect(fieldsOf(formOf([landOnly({ giftTaxCalculated: "0" })]))).toEqual([]);
  });
  it("★ 토글 OFF · 두 칸 비움 → 종전대로 통과 (회귀 0)", () => {
    expect(fieldsOf(formOf([landOnly({ giftDebtAssumed: false, giftTaxCalculated: "", giftTaxBase: "" })]))).toEqual([]);
  });
  it("토글 ON ∧ 채무 칸 0 → 증여세 두 칸 규칙은 그대로 (채무 0이어도 토글이 켜졌으면 짝이 필요 — ④ 모양 선택과 같은 조건)", () => {
    expect(fieldsOf(formOf([landOnly({ giftAssumedDebt: "0", giftTaxCalculated: "" })]))).toContain("carryover.giftTaxCalculated");
  });
});

describe("G-3 ⑧ M-E2-2 — 지원하지 않는 자산에서 토글 ON → 끄게 막는다 (Q-UI-2 b)", () => {
  const EXPR = { type: "public_expropriation", expropriationCash: "600000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2023-01-01" };
  const CONV = { gbHouseToCommercialConversion: true, gbConversionDate: "2023-01-01", gbWasMultiHouseAtConversion: false } as never;
  it.each([
    ["감면", { reductions: [EXPR] as never }, "감면"],
    ["주택→상가 용도변경", CONV, "취득 시점"],
  ])("%s · 토지 파트 → carryover.giftDebtAssumed (사유 문구 포함 · «증여세 상당액» 입력 안내 없음)", (_n, a, hint) => {
    const f = formOf([landOnly({}, a)]);
    const m = issuesOf(f).find((i) => i.field === "carryover.giftDebtAssumed");
    expect(m?.message).toContain(hint);
    expect(m?.message).toContain("끄세요");
    expect(m?.message).not.toContain("«증여세 상당액»에 입력");
  });
  it("★ 채무 칸이 빈 칸이어도 토글 앵커로 간다 — 숨은 채무 칸 필수 오류로 막다른 길이 되지 않는다", () => {
    const f = formOf([landOnly({ giftAssumedDebt: "" }, { reductions: [EXPR] as never })]);
    const fields = fieldsOf(f);
    expect(fields).toContain("carryover.giftDebtAssumed");
    expect(fields).not.toContain("carryover.giftAssumedDebt");
  });
  it("건물만 이월과세도 같은 앵커(사건 블록 = 건물 블록의 토글)", () => {
    expect(fieldsOf(formOf([buildingOnly({}, CONV)]))).toContain("carryover.giftDebtAssumed");
  });
  it("토글 OFF → 이 차단 없음", () => {
    expect(fieldsOf(formOf([landOnly({ giftDebtAssumed: false }, { reductions: [EXPR] as never })]))).not.toContain("carryover.giftDebtAssumed");
  });
});

describe("G-4 건물 파트 채무 + 증여자 신축 — 토글 앵커 (채무가 건물에 있을 때만)", () => {
  const DONOR_BUILT = { useEstimatedAcquisition: true, estimationMode: "general", donorStandardPriceAtAcquisition: "100,000,000", donorAcquisitionPrice: "", donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2010-01-10" };
  it("건물 파트 채무 > 0 + 증여자 신축 ON → carryover.giftDebtAssumed", () => {
    expect(fieldsOf(formOf([buildingOnly(DONOR_BUILT)]))).toContain("carryover.giftDebtAssumed");
  });
  it("건물 파트 채무 0 → 통과 · 토지 파트에만 채무 → 통과", () => {
    expect(fieldsOf(formOf([buildingOnly({ ...DONOR_BUILT, giftAssumedDebt: "0" })]))).toEqual([]);
    const a = gbBase({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: co(), buildingCarryover: co({ ...DONOR_BUILT, giftAssumedDebt: "0" }) });
    expect(fieldsOf(formOf([a]))).toEqual([]);
  });
  it("gbCarryoverBuildingDebt — 건물 이월과세가 아니면 0 · 건물 서브폼이 없으면 사건 서브폼을 쓴다(④ buildPart 원천과 같다)", () => {
    expect(gbCarryoverBuildingDebt(landOnly())).toBe(0);
    expect(gbCarryoverBuildingDebt(buildingOnly())).toBe(100_000_000);
    expect(gbCarryoverBuildingDebt(gbBase({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: co() }))).toBe(100_000_000);
  });
});

describe("G-5 술어(⑤) = 전송(④) = 차단(⑧) 격자 — 토글 ON 일반건물", () => {
  const EXPR = { type: "public_expropriation", expropriationCash: "600000000", expropriationBond: "0", expropriationBondHoldingYears: "none", expropriationApprovalDate: "2023-01-01" };
  const cells: Array<[string, AssetForm, "apply" | "unsupported" | "numerator_only" | "none"]> = [
    ["토지만 이월과세", landOnly(), "apply"],
    ["건물만 이월과세", buildingOnly(), "apply"],
    ["둘 다 이월과세", gbBase({ acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", carryover: co(), buildingCarryover: co() }), "apply"],
    ["감면", landOnly({}, { reductions: [EXPR] as never }), "unsupported"],
    ["부담부증여 일반건물(E4)", landOnly({}, { transferType: "burdened_gift" } as Partial<AssetForm>), "numerator_only"],
    ["이월과세 아님", gbBase(), "none"],
  ];
  it.each(cells)("%s → scope=%s", (_n, a, kind) => {
    expect(carryoverPurchasedPartScope(a).kind).toBe(kind);
    const sent = buildGbCarryoverPayload(a);
    const sentDebt = [sent.landCarryoverPart, sent.buildingCarryoverPart].some((p) => (p?.giftAssumedDebt ?? 0) > 0);
    // ④ — 일반 양도(E2)는 scope가 apply·unsupported이면 토글 ON 파트 채무를 그대로 싣는다(unsupported는 ⑧이 앞서 막는다). E4는 BG라 payload가 비어 있다.
    expect(sentDebt).toBe(kind === "apply" || kind === "unsupported");
    // ⑧ — 토글 ON ∧ unsupported만 «끄세요»로 막는다
    const blocked = issuesOf(formOf([a])).some((i) => i.field === "carryover.giftDebtAssumed" && (i.message ?? "").includes("끄세요"));
    expect(blocked).toBe(kind === "unsupported");
  });
  it("carryoverGiftEventForm — 토지가 이월과세면 carryover, 건물만이면 buildingCarryover (asset.carryover 직접 읽기와 갈리는 지점)", () => {
    const b = buildingOnly({ giftDebtAssumed: true });
    expect(b.carryover?.giftDebtAssumed).toBe(false); // ← 직접 읽으면 거짓
    expect(carryoverGiftEventForm(b)?.giftDebtAssumed).toBe(true);
    expect(carryoverGiftEventForm(landOnly())?.giftDebtAssumed).toBe(true);
  });
});
