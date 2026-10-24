/**
 * #17 검증자 지적 보정 — 분리 경로 범위 밖 조합은 «막지 않고 비과세 유지 + 초과분 미분리 고지».
 *
 * 1) 2005-04-30 전 취득 주택은 «취득 당시 개별주택가격»(최초 공시 2005-04-30)이 없어 기준시가 안분 입력을 줄 수 없다 —
 *    분리 경로(⑤ 카드 · ⑧ 필수 · 엔진 차단)에 들이면 존재하지 않는 값을 요구하며 계산을 막는 막다른 길이다.
 * 2) 함께 양도 주택 카드(컴패니언)는 ④가 정착면적·소재지 구분을 자기 item에 싣지 않아 고지조차 나오지 않았다 —
 *    초과분이 조용히 비과세됐다(같은 날 산 주택 500㎡ · 정착면적 100㎡ · 초과 200㎡ → 경고 0건).
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 2000-03-01 취득 + 초과 200㎡ (기준시가 5칸 없음) | ⑧이 취득시 개별주택가격 요구 · API는 기준시가 부재로 throw | 통과·비과세(총세액 0) + «초과분 미분리» 고지 |
 * | 함께 양도 주택 카드 + 초과 200㎡ | 경고 0건 · 총세액 0 | 총세액 0(불변) + «초과분 미분리» 고지 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { baseTransferInput, makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

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
import { housingExcessNeedsLandSplit, housingExcessZonePending } from "@/lib/calc/housing-excess-split";
import { isBeforeHousePriceFirstDisclosure, isBeforeLandPriceFirstDisclosure } from "@/lib/tax-engine/housing-excess-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "500000000",
  actualSalePrice: "1000000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "500",
  transferArea: "500",
};
const asset = (over: Record<string, unknown> = {}) =>
  ({ ...makeDefaultAsset(1), ...HOUSE, ...over }) as unknown as AssetForm;

const baseForm = () => ({
  ...createDefaultTransferFormData(),
  transferDate: TD,
  isOneHousehold: true,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  residencePeriodMonths: "120",
});
const single = (over: Record<string, unknown> = {}) =>
  ({ ...baseForm(), contractTotalPrice: "1000000000", assets: [asset(over)] }) as never;

const warningsOf = (r: Awaited<ReturnType<typeof runCalc>>): string[] =>
  (r.result?.warnings ?? r.json?.data?.aggregated?.warnings ?? []) as string[];

describe("#17 보정 1 · #17-5 ① — 1990-08-30 전 취득은 분리 경로 밖 (막지 않고 비과세 + 고지) · 그 이후 2005-04-30 전 취득은 영 §164⑦ 환산 개별주택가격으로 5칸 경로", () => {
  it("경계 — 개별공시지가 최초 고시일(1990-08-30) 전이면 true, 당일·이후·미입력은 false", () => {
    expect(isBeforeLandPriceFirstDisclosure("1990-08-29")).toBe(true);
    expect(isBeforeLandPriceFirstDisclosure("1990-08-30")).toBe(false);
    expect(isBeforeLandPriceFirstDisclosure("2000-03-01")).toBe(false);
    expect(isBeforeLandPriceFirstDisclosure(undefined)).toBe(false);
    expect(isBeforeLandPriceFirstDisclosure(new Date("1990-08-29T00:00:00.000Z"))).toBe(true);
    expect(isBeforeLandPriceFirstDisclosure(new Date("1990-08-30T00:00:00.000Z"))).toBe(false);
  });

  it("경계 — 개별주택가격 최초 공시일(2005-04-30)은 화면 힌트(§164⑦ 환산 개별주택가격) 분기에만 쓴다", () => {
    expect(isBeforeHousePriceFirstDisclosure("2005-04-29")).toBe(true);
    expect(isBeforeHousePriceFirstDisclosure("2005-04-30")).toBe(false);
    expect(isBeforeHousePriceFirstDisclosure("2012-01-02")).toBe(false);
    expect(isBeforeHousePriceFirstDisclosure(undefined)).toBe(false);
    expect(isBeforeHousePriceFirstDisclosure(new Date("2005-04-29T00:00:00.000Z"))).toBe(true);
    expect(isBeforeHousePriceFirstDisclosure(new Date("2005-04-30T00:00:00.000Z"))).toBe(false);
  });

  it("④⑤⑧ 술어 — 1989 취득은 분리 대상 아님 · 소재지 구분 요구도 없음 / 1990-08-30 이후(2000-03-01 · 2005-04-29 · 2005-04-30)는 대상", () => {
    expect(housingExcessNeedsLandSplit(asset({ acquisitionDate: "1989-06-01" }), TD)).toBe(false);
    expect(housingExcessZonePending(asset({ acquisitionDate: "1989-06-01", appurtenantLandZone: undefined }))).toBe(false);
    expect(housingExcessNeedsLandSplit(asset({ acquisitionDate: "1990-08-29" }), TD)).toBe(false);
    expect(housingExcessNeedsLandSplit(asset({ acquisitionDate: "1990-08-30" }), TD)).toBe(true);
    expect(housingExcessNeedsLandSplit(asset({ acquisitionDate: "2000-03-01" }), TD)).toBe(true);
    expect(housingExcessNeedsLandSplit(asset({ acquisitionDate: "2005-04-29" }), TD)).toBe(true);
    expect(housingExcessNeedsLandSplit(asset({ acquisitionDate: "2005-04-30" }), TD)).toBe(true);
    expect(housingExcessZonePending(asset({ acquisitionDate: "2000-03-01", appurtenantLandZone: undefined }))).toBe(true);
  });

  it("폼→④→⑧→⑫→⑭→엔진 — 1989-06-01 취득 + 초과 200㎡(기준시가 칸 없음)는 ⑧이 막지 않고 비과세·총세액 0 + «초과분 미분리» 고지", async () => {
    const r = await runCalc(single({ acquisitionDate: "1989-06-01" }));
    expect(r.issues.some((i) => i.message.includes("배율 한도를"))).toBe(false);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    expect(r.result.splitDetail?.nonBusinessLandPart).toBeUndefined();
    const w = warningsOf(r).find((x) => x.includes("초과분 미분리"));
    expect(w, JSON.stringify(warningsOf(r))).toBeDefined();
    expect(w).toContain("200.00㎡");
    expect(w).toContain("1990-08-30");
    expect(w).toContain("확인이 필요합니다");
  });

  it("#17-5 ① 같은 시료가 2000-03-01 취득이면 분리 경로라 ⑧이 영 §164⑦ 추정 기준시가(취득시 개별주택가격 칸)를 요구한다", async () => {
    const r = await runCalc(single({ acquisitionDate: "2000-03-01" }));
    const hit = r.issues.find((i) => i.field === "standardPriceAtAcq" && i.message.includes("배율 한도를"));
    expect(hit, JSON.stringify(r.issues)).toBeDefined();
    expect(hit?.message).toContain("영 §164⑦");
  });

  it("긍정 짝 — 2005-04-30 취득은 공시된 개별주택가격을 요구한다(§164⑦ 문구 없음)", async () => {
    const r = await runCalc(single({ acquisitionDate: "2005-04-30" }));
    const hit = r.issues.find((i) => i.field === "standardPriceAtAcq" && i.message.includes("배율 한도를"));
    expect(hit).toBeDefined();
    expect(hit?.message).not.toContain("영 §164⑦");
  });

  it("엔진 직접 호출 — 1990-08-30 전 취득은 기준시가 없이도 throw 하지 않고 비과세 + 고지 / 1990-08-30 이후 취득은 기준시가 없으면 차단", () => {
    const rates = makeMockRates();
    const base = {
      propertyType: "housing" as const, transferPrice: 1_000_000_000, transferDate: new Date(TD),
      acquisitionPrice: 500_000_000, expenses: 0, useEstimatedAcquisition: false,
      isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
      buildingFootprintArea: 100, acquisitionArea: 500, appurtenantLandZone: "metropolitan_residential" as const,
    };
    const old = calculateTransferTax(baseTransferInput({ ...base, acquisitionDate: new Date("1989-06-01") }), rates);
    expect(old.isExempt).toBe(true);
    expect(old.totalTax).toBe(0);
    expect((old.warnings ?? []).some((w) => w.includes("초과분 미분리") && w.includes("1990-08-30"))).toBe(true);
    expect(() => calculateTransferTax(baseTransferInput({ ...base, acquisitionDate: new Date("2000-03-01") }), rates)).toThrow(/기준시가/);
    expect(() => calculateTransferTax(baseTransferInput({ ...base, acquisitionDate: new Date("2005-04-30") }), rates)).toThrow(/기준시가/);
  });
});

describe("#17 보정 2 · #17-1 — 함께 양도 주택 카드(컴패니언): 범위 밖 조합은 «미분리» 고지, 범위 안은 분리(별도 anchor)", () => {
  const bundle = (companionOver: Record<string, unknown> = {}, primaryOver: Record<string, unknown> = {}) => {
    const a = { ...asset({ actualSalePrice: "500000000", standardPriceAtTransfer: "500000000", acquisitionArea: "250", transferArea: "250", ...primaryOver }) };
    const b = {
      ...makeDefaultAsset(2), ...HOUSE, addressJibun: "서울 테스트동 2",
      actualSalePrice: "500000000", standardPriceAtTransfer: "500000000", ...companionOver,
    } as unknown as AssetForm;
    return { ...baseForm(), contractTotalPrice: "1000000000", assets: [a, b] } as never;
  };
  const companionBody = (r: Awaited<ReturnType<typeof runCalc>>) =>
    (r.body.companionAssets as { companionHousingLand?: { landAreaM2: number; footprintM2: number; zone?: string } }[])[0];
  // 같은 날 함께양도에 주택 2채가 묶이면 ⑧이 §154⑨ 순서 입력 불가로 따로 막는다(결정 #40 하위 1 가) — 그 차단 외의 오류만 본다.
  const issuesExceptSameDay = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.filter((i) => !i.message.includes("함께양도로 묶여 있습니다"));
  // 1990-08-30 전 취득 — 분리 경로 밖(취득 당시 ㎡당 개별공시지가가 없다)이라 막지 않고 «미분리» 고지만 남는다
  const OUT_OF_SCOPE = { acquisitionDate: "1989-06-01" };

  it("🔑 컴패니언 주택 500㎡ · 정착면적 100㎡ + 범위 밖(1990-08-30 전 취득) → ④가 면적 사실을 싣고 «초과분 미분리» 고지가 난다 · 총세액 0", async () => {
    const r = await runCalc(bundle(OUT_OF_SCOPE));
    expect(issuesExceptSameDay(r)).toEqual([]);
    expect(r.status).toBe(200);
    expect(companionBody(r).companionHousingLand).toEqual({ landAreaM2: 500, footprintM2: 100, zone: "metropolitan_residential" });
    expect(r.json.data.aggregated.totalTax).toBe(0);
    const w = warningsOf(r).find((x) => x.includes("초과분 미분리"));
    expect(w, JSON.stringify(warningsOf(r))).toBeDefined();
    expect(w).toContain("[자산 2]");
    expect(w).toContain("200.00㎡");
    expect(w).toContain("확인이 필요합니다");
  });

  it("부정 짝 — 컴패니언 면적이 한도 이내(250㎡ ≤ 300㎡)면 고지 없음", async () => {
    const r = await runCalc(bundle({ ...OUT_OF_SCOPE, acquisitionArea: "250", transferArea: "250" }));
    expect(warningsOf(r).some((x) => x.includes("초과분 미분리"))).toBe(false);
    expect(r.json.data.aggregated.totalTax).toBe(0);
  });

  it("소재지 구분 없음 + 면적 > 정착면적 3배 → ⑧이 소재지 구분 칸으로 막고(자산 2), API 직접 호출은 배율 한도를 판정하지 않았다는 고지 (미입력 fallback 금지)", async () => {
    const r = await runCalc(bundle({ appurtenantLandZone: undefined }));
    const hit = r.issues.find((i) => i.field === "appurtenantLandZone" && i.message.includes("자산 2"));
    expect(hit, JSON.stringify(r.issues)).toBeDefined();
    const w = warningsOf(r).find((x) => x.includes("초과분 미분리") || x.includes("소재지 구분이 없어 배율 한도"));
    expect(w, JSON.stringify(warningsOf(r))).toContain("소재지 구분이 없어 배율 한도");
  });

  it("정착면적이 없으면 사실을 싣지 않는다 → 고지 없음(판정할 입력이 없다)", async () => {
    const r = await runCalc(bundle({ ...OUT_OF_SCOPE, buildingFootprintArea: "" }));
    expect(companionBody(r).companionHousingLand).toBeUndefined();
    expect(warningsOf(r).some((x) => x.includes("초과분 미분리"))).toBe(false);
  });

  it("엔진 직접 호출 — companionHousingLand만으로 범위 밖 고지가 난다 / 비과세가 아니면(과세 계산) 말하지 않는다", () => {
    const rates = makeMockRates();
    const base = {
      propertyType: "housing" as const, transferPrice: 500_000_000, transferDate: new Date(TD),
      acquisitionDate: new Date("1989-06-01"), acquisitionPrice: 400_000_000, expenses: 0, useEstimatedAcquisition: false,
      isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
      companionHousingLand: { landAreaM2: 500, footprintM2: 100, zone: "metropolitan_residential" as const },
    };
    const exempt = calculateTransferTax(baseTransferInput(base), rates);
    expect(exempt.isExempt).toBe(true);
    expect((exempt.warnings ?? []).some((w) => w.includes("초과분 미분리") && w.includes("200.00㎡"))).toBe(true);
    const taxed = calculateTransferTax(baseTransferInput({ ...base, isOneHousehold: false, householdHousingCount: 2 }), rates);
    expect(taxed.isExempt).toBe(false);
    expect((taxed.warnings ?? []).some((w) => w.includes("초과분 미분리"))).toBe(false);
  });
});
