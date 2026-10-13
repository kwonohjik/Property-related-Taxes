/**
 * #17-1 — 함께 양도 주택 카드(컴패니언)도 주 자산과 **같은 판정**으로 배율 초과 부수토지를 비과세에서 빼 비사업용 토지로 분리 과세한다.
 *
 * 종전: 컴패니언은 ④가 정착면적·소재지 구분을 형제 토지 카드의 주택 컨텍스트 키로 싣지 않아 초과분을 판정·분리하지 않았다
 * (1세대1주택이면 초과분이 비과세로 남고 «미분리» 고지만 — 과세 계산이면 고지도 없었다).
 * 지금: ④가 같은 사실을 `companionHousingLand`로 싣고 엔진 `appurtenantLandFactsOfInput`이 주 자산과 같은 값으로 읽는다 —
 * 노출(⑤)·필수(⑧)·전송(④)·엔진이 한 술어(`housingExcessNeedsLandSplit`)를 공유한다.
 *
 * 시료: 매매 2012-01-02 취득(3억) · 2026-02-16 양도 · 양도가 5억 · 토지 500㎡ · 정착면적 100㎡ · 수도권 주거(한도 300㎡ · 초과 200㎡) · 거주 120개월.
 *   기준시가(취득시): 개별주택가격 3억 · ㎡당 40만원(토지 2억) · 건물 1.5억 / (양도시): ㎡당 80만원(토지 4억) · 건물 4억
 * 같은 날 함께양도에 주택 2채가 묶이면 결정 #40이 ⑧에서 따로 막는다 — 그 차단 외의 오류만 본다(계산은 API가 그대로 낸다).
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
import { postTransfer, runCalc } from "../_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { housingExcessNeedsLandSplit, housingExcessZonePending } from "@/lib/calc/housing-excess-split";
import { appurtenantLandFactsOfInput, housingExcessAreaOfInput } from "@/lib/tax-engine/housing-excess-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-02-16";
const HOUSE: Record<string, unknown> = {
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2012-01-02",
  fixedAcquisitionPrice: "300000000",
  actualSalePrice: "500000000",
  standardPriceAtTransfer: "500000000",
  addressJibun: "서울 테스트동 1",
  residenceInputMode: "direct",
  residencePeriodMonthsAsset: "120",
  buildingFootprintArea: "100",
  appurtenantLandZone: "metropolitan_residential",
  isUrbanArea: true,
  areaScenario: "same",
  acquisitionArea: "250",
  transferArea: "250",
};
const OVER = { acquisitionArea: "500", transferArea: "500" };
const FIVE: Record<string, unknown> = {
  standardPriceAtAcq: "300000000",
  standardPricePerSqmAtAcq: "400000",
  buildingStandardPriceAtAcq: "150000000",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
};
const SEP: Record<string, unknown> = {
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2011-01-02",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "100000000",
  buildingAcquisitionPrice: "200000000",
  saleSplitMode: "apportioned",
  standardPricePerSqmAtTransfer: "800000",
  buildingStandardPriceAtTransfer: "400000000",
  buildingStandardPriceAtAcq: "150000000",
};

const mk = (n: number, over: Record<string, unknown> = {}) =>
  ({ ...makeDefaultAsset(n), ...HOUSE, addressJibun: `서울 테스트동 ${n}`, ...over }) as unknown as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  ({
    ...createDefaultTransferFormData(),
    transferDate: TD,
    contractTotalPrice: "1000000000",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    residencePeriodMonths: "120",
    assets,
    ...over,
  }) as never;
const exceptSameDay = (r: Awaited<ReturnType<typeof runCalc>>) => r.issues.filter((i) => !i.message.includes("함께양도로 묶여 있습니다"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const propsOf = (r: Awaited<ReturnType<typeof runCalc>>): any[] => r.json?.data?.aggregated?.properties ?? [];
const nblOf = (p: { splitDetail?: { nonBusinessLandPart?: { gain: number } } }) => p.splitDetail?.nonBusinessLandPart;
const warningsOf = (r: Awaited<ReturnType<typeof runCalc>>): string[] => r.json?.data?.aggregated?.warnings ?? [];
// 같은 주택을 주 자산 단건으로 계산한 기준값 — 컴패니언 판정은 이 값과 같아야 한다.
const single = (over: Record<string, unknown>) => runCalc(form([mk(1, over)], { contractTotalPrice: "500000000" }));

describe("#17-1 같은 날 취득 컴패니언 주택 — 배율 초과분 분리", () => {
  it("🔑 컴패니언 500㎡(초과 200㎡) + 기준시가 5칸 → 초과분이 비사업용 토지로 분리 과세 — 주 자산 단건과 같은 분리값 (수정 전: 분리 없음 · 총세액 0 + «미분리» 고지)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...FIVE })]));
    expect(exceptSameDay(r)).toEqual([]);
    expect(r.status).toBe(200);
    const comp = propsOf(r)[1];
    const nbl = nblOf(comp);
    expect(nbl).toMatchObject({ limitArea: 300, excessArea: 200, appliedMultiplier: 3 });
    // 같은 주택을 주 자산 단건으로 넣은 값과 같다
    const one = await single({ ...OVER, ...FIVE });
    expect(nbl?.gain).toBe(one.result.splitDetail.nonBusinessLandPart.gain);
    expect(nbl?.gain).toBe(31_428_571);
    expect(comp.isExempt).toBe(false);
    expect(comp.determinedTax).toBeGreaterThan(0);
    // 한도 이내인 주 자산 주택은 그대로 비과세 · 컴패니언의 분리는 고지로 새지 않는다
    expect(propsOf(r)[0].isExempt).toBe(true);
    expect(warningsOf(r).some((w) => w.includes("초과분 미분리"))).toBe(false);
  });

  it("④ — 컴패니언 body가 분리 축(토지 취득일·건물 기준시가·양도시 기준시가)과 면적 사실을 싣는다 · 별개취득 아님", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...FIVE })]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (r.body.companionAssets as any[])[0];
    expect(body.companionHousingLand).toEqual({ landAreaM2: 500, footprintM2: 100, zone: "metropolitan_residential" });
    expect(body.landAcquisitionDate).toBe("2012-01-02");
    expect(body.isSeparateAcquisition).toBe(false);
    expect(body.buildingStandardPriceAtAcquisition).toBe(150_000_000);
    expect(body.standardPricePerSqmAtAcquisition).toBe(400_000);
    expect(body.acquisitionArea).toBe(500);
    expect(body.landStandardPriceAtTransfer).toBe(400_000_000);
    expect(body.buildingStandardPriceAtTransfer).toBe(400_000_000);
  });

  it("대조 — 컴패니언 면적이 한도 이내(250㎡ ≤ 300㎡)면 분리 없이 종전과 같다 (분리 축을 싣지 않는다)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...FIVE })]));
    expect(exceptSameDay(r)).toEqual([]);
    expect(nblOf(propsOf(r)[1])).toBeUndefined();
    expect(propsOf(r)[1].isExempt).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((r.body.companionAssets as any[])[0].landAcquisitionDate).toBeUndefined();
  });

  it.each([
    ["standardPriceAtAcq", "취득 당시 개별주택가격"],
    ["standardPricePerSqmAtAcq", "취득 당시 ㎡당 개별공시지가"],
    ["buildingStandardPriceAtAcq", "취득 당시 건물 기준시가"],
    ["standardPricePerSqmAtTransfer", "양도 당시 ㎡당 개별공시지가"],
    ["buildingStandardPriceAtTransfer", "양도 당시 건물 기준시가"],
  ])("⑧ — 컴패니언의 5칸 중 %s 미입력 → 「자산 2」 그 입력칸으로 차단", async (field, text) => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...FIVE, [field]: "" })]));
    const hit = exceptSameDay(r).find((i) => i.message.includes("배율 한도를") && i.message.includes(text));
    expect(hit, JSON.stringify(r.issues)).toBeDefined();
    expect(hit!.field).toBe(field);
    expect(hit!.message).toContain("자산 2");
  });

  it("⑧ — 컴패니언 소재지 구분이 비었고 면적 > 정착면적 3배 → 「자산 2」 소재지 구분 칸으로 차단 (미입력 fallback 금지)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...FIVE, appurtenantLandZone: undefined })]));
    const hit = exceptSameDay(r).find((i) => i.field === "appurtenantLandZone");
    expect(hit, JSON.stringify(r.issues)).toBeDefined();
    expect(hit!.message).toContain("자산 2");
  });

  it("⑫⑭ 마지막 방어선 — 기준시가 5칸 없이 API 직접 호출하면 컴패니언도 막는다(초과분을 비과세로 끝내지 않는다)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...FIVE })]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companion = { ...(r.body.companionAssets as any[])[0] };
    for (const k of ["buildingStandardPriceAtAcquisition", "landStandardPriceAtTransfer", "buildingStandardPriceAtTransfer", "standardPricePerSqmAtAcquisition"]) delete companion[k];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await postTransfer({ ...r.body, companionAssets: [companion] } as any);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json), "기준시가 부재로 막혀야 한다").toContain("기준시가");
  });

  it("술어 — ⑤⑧④가 주 자산·컴패니언을 가리지 않고 같은 값을 낸다 (주택 카드가 둘째 자산이어도 대상)", () => {
    expect(housingExcessNeedsLandSplit(mk(2, OVER), TD)).toBe(true);
    expect(housingExcessZonePending(mk(2, { ...OVER, appurtenantLandZone: undefined }))).toBe(true);
    expect(housingExcessNeedsLandSplit(mk(2), TD)).toBe(false);
  });

  it("엔진 — 면적 사실은 주 자산 입력 키와 컴패니언 `companionHousingLand`를 같은 값으로 읽는다", () => {
    const base = { propertyType: "housing" as const, transferDate: new Date(TD), acquisitionDate: new Date("2012-01-02") };
    const primary = { ...base, appurtenantLandZone: "metropolitan_residential" as const, buildingFootprintArea: 100, acquisitionArea: 500 };
    const companion = { ...base, companionHousingLand: { landAreaM2: 500, footprintM2: 100, zone: "metropolitan_residential" as const } };
    expect(appurtenantLandFactsOfInput(companion)).toEqual(appurtenantLandFactsOfInput(primary));
    expect(housingExcessAreaOfInput(baseTransferInput(companion))).toBe(200);
    expect(housingExcessAreaOfInput(baseTransferInput(primary))).toBe(200);
    // 주 자산 키가 있으면 그 값이 이긴다
    expect(appurtenantLandFactsOfInput({ ...companion, acquisitionArea: 400 }).landAreaM2).toBe(400);
  });
});

describe("#17-1 별개취득 컴패니언 주택 — 배율 초과분(G-2)도 주 자산과 같다", () => {
  it("🔑 컴패니언 별개취득 + 500㎡ → 초과분 분리, 주 자산 단건과 같은 분리값·같은 세액 (수정 전: 분리 없음 · 총세액 0 + «미분리» 고지)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...OVER, ...SEP })]));
    expect(exceptSameDay(r)).toEqual([]);
    const comp = propsOf(r)[1];
    const nbl = nblOf(comp);
    expect(nbl).toMatchObject({ limitArea: 300, excessArea: 200 });
    const one = await runCalc(form([mk(1, { ...OVER, ...SEP })], { contractTotalPrice: "500000000" }));
    expect(nbl?.gain).toBe(one.result.splitDetail.nonBusinessLandPart.gain);
    expect(nbl?.gain).toBe(60_000_000);
    expect(r.json.data.aggregated.totalTax).toBe(one.result.totalTax);
    expect(warningsOf(r).some((w) => w.includes("초과분 미분리"))).toBe(false);
  });

  it("대조 — 한도 이내면 분리 없음(비과세)", async () => {
    const r = await runCalc(form([mk(1), mk(2, { ...SEP })]));
    expect(nblOf(propsOf(r)[1])).toBeUndefined();
    expect(propsOf(r)[1].isExempt).toBe(true);
  });
});

describe("#17-1 엔진 직접 — 컴패니언 사실만으로 분리가 돈다", () => {
  const rates = makeMockRates();
  const run = (over: Record<string, unknown>) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "housing", transferPrice: 500_000_000, transferDate: new Date(TD), acquisitionDate: new Date("2012-01-02"),
        acquisitionPrice: 300_000_000, expenses: 0, useEstimatedAcquisition: false, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 120,
        landAcquisitionDate: new Date("2012-01-02"), standardPriceAtAcquisition: 300_000_000, standardPricePerSqmAtAcquisition: 400_000, acquisitionArea: 500,
        buildingStandardPriceAtAcquisition: 150_000_000, landStandardPriceAtTransfer: 400_000_000, buildingStandardPriceAtTransfer: 400_000_000,
        ...over,
      }),
      rates,
    );
  it("companionHousingLand ⇔ 주 자산 키 — 분리값 동일", () => {
    const viaPrimary = run({ appurtenantLandZone: "metropolitan_residential", buildingFootprintArea: 100 });
    const viaCompanion = run({ companionHousingLand: { landAreaM2: 500, footprintM2: 100, zone: "metropolitan_residential" } });
    expect(viaCompanion.splitDetail?.nonBusinessLandPart).toEqual(viaPrimary.splitDetail?.nonBusinessLandPart);
    expect(viaCompanion.totalTax).toBe(viaPrimary.totalTax);
    expect(viaCompanion.totalTax).toBeGreaterThan(0);
  });
});
