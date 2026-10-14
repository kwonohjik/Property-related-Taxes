/**
 * #17-5 ① — 2005-04-30 전 취득 주택(개별주택가격 미공시)의 배율 초과 부수토지 분리: §164⑦ 3시점 환산(PHD)을 쓰면 분리 경로를 탄다.
 *
 * 종전: 취득 당시 개별주택가격이 없어 기준시가 5칸 안분을 줄 수 없다는 이유로 «막지도 계산하지도 않고» 비과세 + «초과분 미분리» 고지였다.
 * 그러나 PHD(영 §164⑦)는 이미 토지·건물을 **자기 3시점 값**(최초 공시가 × 취득시 ÷ 최초 공시 시 기준시가 합)으로 안분해 양도가액·환산취득가액을
 * 나눈다(서면4팀-685 — 공시 전 취득분은 영 §164⑦ 취득당시 기준시가를 적용). 그 토지분 양도차익에 초과 면적 비율을 곱해 비사업용 토지로 떼면 된다.
 *
 * ## 시료 — Excel 검증 PHD fixture(토지 212㎡ · 양도 715,000,000 · 토지 양도차익 139,089,851 · 건물 8,490,962)
 * 취득 2000-03-01(PHD 최초 공시 2015-04-30 전) · 양도 2023-02-16 · 1세대1주택 · 거주 120개월 · 정착면적 53㎡ × 3배 = 한도 159㎡ → 초과 53㎡ = 토지의 정확히 1/4.
 *
 * | 값 | 산식 | 결과 |
 * |---|---|---|
 * | 초과분 양도차익 | floor(139,089,851 × 53/212) | 34,772,462 |
 * | 장특(표1 — 22년 × 2% = 44%, 상한 30%) | floor(34,772,462 × 0.3) | 10,431,738 |
 * | 과세표준 | 34,772,462 − 10,431,738 − 2,500,000 | 21,840,724 |
 * | 산출세액(비사업용 +10%p — 구성 요소별 floor) | floor(21,840,724 × 0.15) − 1,260,000 + floor(21,840,724 × 0.10) | 4,200,180 |
 * | 지방소득세 | floor(4,200,180 × 10%) | 420,018 |
 * | 총세액 | | 4,620,198 |
 *
 * 범위 밖으로 남기는 것(막지 않고 비과세 + «초과분 미분리» 고지): 1990-08-30 전 취득 + PHD가 아닌 것, PHD + 공익수용·공매·경락(§164⑨ 분모 특례),
 * 함께 양도 주택 카드(PHD가 첫 자산에만 닿는다). 1990-08-30 이후 2005-04-30 전 취득 + 환산이 아닌 취득가액은 영 §164⑦ 추정값을 취득시 개별주택가격 칸에 받는 5칸 경로다(#17-5 ① 후속).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { phdSplitPathTaken, housingExcessSplitAppliesToInput, housingExcessNeedsStdInputsOfInput } from "@/lib/tax-engine/housing-excess-split";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_LAND_GAIN,
  PHD_BLDG_GAIN,
} from "../../tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "../_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { housingExcessNeedsLandSplit, housingExcessUsesPhdSplit, housingExcessZonePending } from "@/lib/calc/housing-excess-split";
import { validateHousingExcessSplitInputs } from "@/lib/calc/transfer-tax-validate-housing-excess";
import { buildSplitPayload, isSplitPayloadActive } from "@/lib/calc/transfer-tax-api-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const rates = makeMockRates();
const TD = "2023-02-16";

// ── 독립 기대값 (Excel 검증 fixture 상수에서 직접 유도) ─────────────────────────────────────────
const NBL_GAIN = Math.floor((PHD_LAND_GAIN * 53) / 212); // 34,772,462 — 53/212 = 0.25 (이진 정확)
const LTD = Math.floor(NBL_GAIN * 0.3);
const TAX_BASE = NBL_GAIN - LTD - 2_500_000;
const INCOME_TAX = Math.floor(TAX_BASE * 0.15) - 1_260_000 + Math.floor(TAX_BASE * 0.1); // 5,000만 이하 25% 구간 — 기본 15% + 비사업용 10%p
const TOTAL_TAX = INCOME_TAX + Math.floor(INCOME_TAX * 0.1);

const phdHouse = (over: Record<string, unknown> = {}) =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: PHD_TRANSFER_PRICE,
    transferDate: new Date(TD),
    acquisitionDate: new Date("2000-03-01"),
    landAcquisitionDate: new Date("2000-03-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 120,
    landSplitMode: "apportioned",
    preHousingDisclosure: PHD_INPUT,
    buildingFootprintArea: 53,
    acquisitionArea: 212,
    appurtenantLandZone: "metropolitan_residential" as const,
    ...over,
  } as never);

const unseparated = (ws: string[] | undefined) => (ws ?? []).some((w) => w.includes("초과분 미분리"));

describe("#17-5 ① 엔진 — PHD(§164⑦) 환산 + 배율 초과 → 초과분이 비사업용 토지로 분리된다", () => {
  it("기대값 유도 sanity — 초과 53㎡는 토지 212㎡의 정확히 1/4 · 토지·건물 양도차익은 Excel fixture 그대로", () => {
    expect(NBL_GAIN).toBe(34_772_462);
    expect(TAX_BASE).toBe(21_840_724);
    expect(INCOME_TAX).toBe(4_200_180);
    expect(TOTAL_TAX).toBe(4_620_198);
  });

  it("🔑 초과분 양도차익 34,772,462 · 총세액 4,620,198 — 수정 전: 총세액 0 + «초과분 미분리» 고지", () => {
    const r = calculateTransferTax(phdHouse(), rates);
    expect(r.splitDetail?.land.gain).toBe(PHD_LAND_GAIN);
    expect(r.splitDetail?.building.gain).toBe(PHD_BLDG_GAIN);
    expect(r.splitDetail?.nonBusinessLandPart).toMatchObject({
      limitArea: 159,
      excessArea: 53,
      appliedMultiplier: 3,
      gain: NBL_GAIN,
      holdingYears: 22,
      longTermRate: 0.3,
      longTermDeduction: LTD,
    });
    expect(r.totalTax).toBe(TOTAL_TAX);
    expect(unseparated(r.warnings)).toBe(false);
  });

  it("대조 — 면적이 한도 이내(150㎡ ≤ 159㎡)면 분리하지 않고 비과세·총세액 0 (종전과 같다)", () => {
    const r = calculateTransferTax(phdHouse({ acquisitionArea: 150 }), rates);
    expect(r.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(unseparated(r.warnings)).toBe(false);
  });

  it("PHD 분리는 양도가액·환산취득가액을 3시점 값으로 이미 나눈다 — 기준시가 5칸을 실어도 값이 바뀌지 않는다(PHD가 우선)", () => {
    const withStd = calculateTransferTax(
      phdHouse({
        standardPriceAtAcquisition: 300_000_000,
        standardPricePerSqmAtAcquisition: 400_000,
        buildingStandardPriceAtAcquisition: 150_000_000,
        landStandardPriceAtTransfer: 400_000_000,
        buildingStandardPriceAtTransfer: 400_000_000,
      }),
      rates,
    );
    expect(withStd.splitDetail?.nonBusinessLandPart?.gain).toBe(NBL_GAIN);
    expect(withStd.totalTax).toBe(TOTAL_TAX);
  });

  it("자산 전체 자본적지출 — PHD 경로는 토지분 비율로 나눠 쓰므로 «반영하지 않았다» 고지가 없다 (5칸 경로의 고지와 구분)", () => {
    const r = calculateTransferTax(phdHouse({ capitalExpenditure: 10_000_000, expenses: 10_000_000 }), rates);
    expect((r.warnings ?? []).some((w) => w.includes("자산 전체 자본적지출"))).toBe(false);
    expect(r.splitDetail?.nonBusinessLandPart).toBeDefined();
  });

  it("고가주택(12억 초과) — 초과분은 12억 안분 밖에서 전액 과세 + 재산세제과-915 회신 방식 고지, 초과분 양도차익은 같은 규칙(floor(토지 양도차익 × 1/4))", () => {
    const r = calculateTransferTax(phdHouse({ transferPrice: 2_000_000_000 }), rates);
    expect(r.isPartialExempt).toBe(true);
    const nbl = r.splitDetail?.nonBusinessLandPart;
    expect(nbl?.gain).toBe(Math.floor((r.splitDetail!.land.gain * 53) / 212));
    expect((r.warnings ?? []).some((w) => w.includes("고가주택에 배율 초과 부수토지"))).toBe(true);
    expect(unseparated(r.warnings)).toBe(false);
  });

  it("직접 호출 방어 — PHD인데 토지 취득일이 없어 분리 결과가 없으면 5칸 안내로 막지 않는다(PHD는 5칸을 받지 않는다) — 비과세 유지 + «초과분 미분리» 고지", () => {
    const r = calculateTransferTax(phdHouse({ landAcquisitionDate: undefined }), rates);
    expect(r.splitDetail).toBeUndefined();
    expect(r.totalTax).toBe(0);
    expect(unseparated(r.warnings)).toBe(true);
    // 대조 — PHD가 아니면(실가 2012 취득 + 5칸 없음) 종전대로 5칸 안내로 막는다
    expect(() =>
      calculateTransferTax(
        phdHouse({ preHousingDisclosure: undefined, useEstimatedAcquisition: false, acquisitionMethod: undefined, acquisitionPrice: 500_000_000, landSplitMode: undefined, acquisitionDate: new Date("2012-01-02"), landAcquisitionDate: new Date("2012-01-02") }),
        rates,
      ),
    ).toThrow(/기준시가/);
  });

  it("범위 밖 — PHD + 공익수용(§164⑨1호 환산 분모 특례)은 분리하지 않고 비과세 + «초과분 미분리» 고지(종전과 같다)", () => {
    const r = calculateTransferTax(
      phdHouse({ transferCause: "public_expropriation", housingCompensationTotal: 500_000_000, housingCompensationBasisTotal: 550_000_000 }),
      rates,
    );
    expect(r.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(r.totalTax).toBe(0);
    expect(unseparated(r.warnings)).toBe(true);
  });

  it("범위 밖 — 1990-08-30 전 취득 + PHD가 아니면 취득 당시 ㎡당 개별공시지가가 없다 — 막지 않고 비과세 + «1990-08-30» 고지", () => {
    const r = calculateTransferTax(
      phdHouse({ preHousingDisclosure: undefined, useEstimatedAcquisition: false, acquisitionMethod: undefined, acquisitionPrice: 500_000_000, landSplitMode: undefined, acquisitionDate: new Date("1989-06-01"), landAcquisitionDate: new Date("1989-06-01") }),
      rates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect((r.warnings ?? []).some((w) => w.includes("초과분 미분리") && w.includes("1990-08-30"))).toBe(true);
  });
});

describe("#17-5 ① 엔진 술어 — `phdSplitPathTaken`은 `calcSplitGain` 게이트와 같은 사실이다", () => {
  const phd = PHD_INPUT;
  it.each([
    ["PHD + 환산(자산 단위)", { preHousingDisclosure: phd, useEstimatedAcquisition: true }, true],
    ["PHD + 파트별 모두 환산", { preHousingDisclosure: phd, landAcqMode: "estimated" as const, buildingAcqMode: "estimated" as const }, true],
    ["PHD + 실가", { preHousingDisclosure: phd, useEstimatedAcquisition: false }, false],
    ["PHD + 토지만 환산(혼합 모드 — PHD 알고리즘이 아니라 파트별 경로)", { preHousingDisclosure: phd, landAcqMode: "estimated" as const, buildingAcqMode: "actual" as const }, false],
    ["PHD 없음 + 환산", { useEstimatedAcquisition: true }, false],
  ])("%s → %s", (_n, input, expected) => {
    expect(phdSplitPathTaken(input as never)).toBe(expected);
  });

  it("분리 경로(applies)는 PHD를 포함하지만 5칸 입력(needsStd)은 PHD를 뺀다 — 같은 입력에서 둘이 갈린다", () => {
    const input = phdHouse() as never;
    expect(housingExcessSplitAppliesToInput(input)).toBe(true);
    expect(housingExcessNeedsStdInputsOfInput(input)).toBe(false);
    const noPhd = phdHouse({ preHousingDisclosure: undefined, acquisitionDate: new Date("2012-01-02") }) as never;
    expect(housingExcessSplitAppliesToInput(noPhd)).toBe(true);
    expect(housingExcessNeedsStdInputsOfInput(noPhd)).toBe(true);
  });
});

// ── 폼 → ④ → ⑧ → ⑫⑭ → 엔진 ───────────────────────────────────────────────────────────────────
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2000-03-01",
  useEstimatedAcquisition: true,
  actualSalePrice: "715000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "53",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "212",
  transferArea: "212",
  usePreHousingDisclosure: true,
  phdFirstDisclosureDate: "2015-04-30",
  phdFirstDisclosureHousingPrice: "486000000",
  phdLandPricePerSqmAtAcq: "2360000",
  phdBuildingStdPriceAtAcq: "220890540",
  phdLandPricePerSqmAtFirst: "2369000",
  phdBuildingStdPriceAtFirst: "220725560",
  phdTransferHousingPrice: "627000000",
  phdLandPricePerSqmAtTransfer: "3486000",
  phdBuildingStdPriceAtTransfer: "252871000",
};
const household = {
  transferDate: TD,
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
};
const asset = (over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(1), ...HOUSE, ...over }) as unknown as AssetForm;
const single = (over: Record<string, unknown> = {}) =>
  ({ ...createDefaultTransferFormData(), ...household, contractTotalPrice: "715000000", assets: [asset(over)] }) as never;

describe("#17-5 ① 폼→④→⑧→⑫⑭→엔진 — PHD 환산 주택은 5칸 없이 초과분이 분리된다", () => {
  it("🔑 PHD 11칸만 채우면 ⑧ 통과(5칸 요구 없음) · ④가 PHD를 싣고 5칸은 싣지 않음 · 초과분 34,772,462 · 총세액 4,620,198", async () => {
    const r = await runCalc(single());
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.preHousingDisclosure).toBeDefined();
    expect(r.body.standardPricePerSqmAtAcquisition).toBeUndefined();
    expect(r.body.buildingStandardPriceAtAcquisition).toBeUndefined();
    expect(r.result.splitDetail?.nonBusinessLandPart).toMatchObject({ gain: NBL_GAIN, excessArea: 53, limitArea: 159 });
    expect(r.result.totalTax).toBe(TOTAL_TAX);
    expect(((r.result.warnings ?? []) as string[]).some((w) => w.includes("초과분 미분리"))).toBe(false);
  });

  it("⑧ — 소재지 구분이 비어 있고 면적 > 정착면적 3배면 PHD여도 소재지 구분을 요구한다(초과 여부를 모르면 분리하지 못한다)", async () => {
    const r = await runCalc(single({ appurtenantLandZone: undefined }));
    expect(r.issues.some((i) => i.field === "appurtenantLandZone")).toBe(true);
  });

  it("대조 — 한도 이내(150㎡)면 요구도 분리도 없다: ⑧ 통과 · 총세액 0", async () => {
    const r = await runCalc(single({ acquisitionArea: "150", transferArea: "150" }));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
  });

  it("범위 밖 — PHD + 공익수용은 분리하지 않고 비과세 + «초과분 미분리» 고지", async () => {
    const r = await runCalc(single({ transferCause: "public_expropriation", housingCompensationTotal: "500000000", housingCompensationBasisTotal: "550000000" }));
    expect(r.result?.splitDetail?.nonBusinessLandPart).toBeUndefined();
    expect(r.result?.totalTax).toBe(0);
  });

  it("1990-08-30 전 취득 + 실가(환산 아님) → ⑧이 5칸을 요구하지 않고 막지 않는다 · 비과세 + «1990-08-30» 고지(PHD 토글이 꺼진 입력)", async () => {
    const r = await runCalc(single({ acquisitionDate: "1989-06-01", useEstimatedAcquisition: false, usePreHousingDisclosure: false, fixedAcquisitionPrice: "500000000" }));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(0);
    expect(((r.result.warnings ?? []) as string[]).some((w) => w.includes("초과분 미분리") && w.includes("1990-08-30"))).toBe(true);
  });
});

describe("#17-5 ① 클라이언트 술어 — ⑤ 카드 · ⑧ 요구 · ④ 전송 · 엔진 게이트가 같은 값", () => {
  it("PHD 환산 첫 자산 — 분리 경로(소재지 요구 대상)이되 5칸은 요구하지 않는다: needsLandSplit false · usesPhdSplit true", () => {
    const a = asset();
    expect(housingExcessNeedsLandSplit(a, TD)).toBe(false);
    expect(housingExcessUsesPhdSplit(a, TD)).toBe(true);
    expect(housingExcessZonePending(asset({ appurtenantLandZone: undefined }))).toBe(true);
  });

  it("함께 양도 카드(isNonPrimary) — PHD는 첫 자산에만 닿는다 → usesPhdSplit false · 소재지 요구는 PHD 사실을 쓰지 않는다", () => {
    const a = asset({ acquisitionDate: "2012-01-02" });
    expect(housingExcessUsesPhdSplit(a, TD, true)).toBe(false);
    // 2005-04-30 이후 취득 + PHD 플래그가 남아 있어도(함께 양도 카드의 잔재) 5칸 경로로 읽는다 — 엔진도 PHD 페이로드가 없어 같다
    expect(housingExcessNeedsLandSplit(a, TD, true)).toBe(true);
    expect(housingExcessNeedsLandSplit(a, TD, false)).toBe(false);
  });

  it("⑧ — 함께 양도 카드(index > 0)는 PHD 플래그가 남아 있어도 5칸을 요구한다 / 첫 자산은 요구하지 않는다 (같은 자산·같은 값)", () => {
    const a = asset({ acquisitionDate: "2012-01-02" });
    expect(validateHousingExcessSplitInputs(a, "자산", TD, false)).toBeNull();
    expect(validateHousingExcessSplitInputs(a, "자산", TD, true)).toContain("취득 당시 개별주택가격");
  });

  it("④ — PHD 첫 자산은 5칸·파트 방식을 싣지 않는다(PHD가 자기 3시점으로 분리) / 함께 양도 카드는 5칸 경로라 싣는다", () => {
    const a = asset({ acquisitionDate: "2012-01-02", standardPriceAtAcq: "300000000", standardPricePerSqmAtAcq: "400000", buildingStandardPriceAtAcq: "150000000" });
    const ratioed = (v: string | undefined) => (v ? Number(v) : undefined);
    const first = buildSplitPayload(a, { isBurdenedGift: false, usesPhd: true, ratioed, primaryCtx: { transferDate: TD } }) as Record<string, unknown>;
    expect(first.buildingStandardPriceAtAcquisition).toBeUndefined();
    expect(first.landAcqMode).toBeUndefined();
    expect(isSplitPayloadActive(a, false, { transferDate: TD })).toBe(false);
    const companion = buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed, primaryCtx: { transferDate: TD, isNonPrimary: true } }) as Record<string, unknown>;
    expect(companion.buildingStandardPriceAtAcquisition).toBe(150_000_000);
    expect(companion.landAcqMode).toBe("estimated");
    expect(isSplitPayloadActive(a, false, { transferDate: TD, isNonPrimary: true })).toBe(true);
  });

  it("PHD 환산이 아니면(실가) 1990-08-30 전 취득은 분리 경로 밖 — 두 술어 모두 false / 그 이후 2005 전 취득은 5칸 경로", () => {
    const a = asset({ acquisitionDate: "1989-06-01", useEstimatedAcquisition: false, usePreHousingDisclosure: false });
    expect(housingExcessNeedsLandSplit(a, TD)).toBe(false);
    expect(housingExcessUsesPhdSplit(a, TD)).toBe(false);
    const b = asset({ useEstimatedAcquisition: false, usePreHousingDisclosure: false });
    expect(housingExcessNeedsLandSplit(b, TD)).toBe(true);
    expect(housingExcessUsesPhdSplit(b, TD)).toBe(false);
  });

  it("PHD 플래그 + 환산이 아닌 취득가액(실가)이면 PHD 사실이 아니다 — 5칸 경로(취득일 1990-08-30 이후)", () => {
    const a = asset({ useEstimatedAcquisition: false });
    expect(housingExcessUsesPhdSplit(a, TD)).toBe(false);
    expect(housingExcessNeedsLandSplit(a, TD)).toBe(true);
  });
});
