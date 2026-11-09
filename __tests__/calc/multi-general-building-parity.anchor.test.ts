/**
 * anchor(④·⑧·⑫·⑭ 다건) — 일반건물 폼을 다건 합산에 넣어도 단건과 같은 세액이다
 * (계획서 `docs/00-pm/multi-building-valuation-support.plan.md` 트랙 G PR-3).
 *
 * 같은 폼을 단건 ④→단건 route(`dispatchGeneralBuilding`)와 다건 ④→다건 route(`multi-gb-expansion.ts`)로 돌려
 * 결정세액을 대조한다. route 수준 대조는 `__tests__/api/transfer.route.multi-general-building.anchor.test.ts`(PR-2)가 한다 —
 * 여기는 **다건 ④가 단건 ④와 같은 본문을 만드는지**(일반건물 서브객체·공유 지분 축소·최상위 키)를 잡는다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runSingle, runMulti } from "./_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const GB: Partial<AssetForm> = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  addressJibun: "서울특별시 종로구 청운동 1-1",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  fixedAcquisitionPrice: "200000000",
  actualSalePrice: "1000000000",
  gbLandArea: "100",
  gbBuildingArea: "200",
  gbBuildingFootprintArea: "50",
  gbTransferLandPricePerSqm: "2,000,000",
  gbTransferBuildingValue: "200,000,000",
  gbAcqLandPricePerSqm: "1,000,000",
  gbAcqBuildingValue: "100,000,000",
  gbZoneType: "general_residential",
};
const EST: Partial<AssetForm> = { useEstimatedAcquisition: true, landAcqMode: "estimated", buildingAcqMode: "estimated" };

function gbForm(over: Partial<AssetForm> = {}, td = "2024-03-01"): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: td, isOneHousehold: false, contractTotalPrice: "1000000000", residencePeriodMonths: "0" });
  f.assets = [{ ...makeDefaultAsset(1), ...GB, ...over } as AssetForm];
  return f;
}

/** 단건 GB route는 `data.aggregated`로 답한다(`runSingle`의 `r`은 단건 경로 전용). */
const singleTax = (s: Awaited<ReturnType<typeof runSingle>>) => ((s.json.data as Obj)?.aggregated as Obj)?.determinedTax as number | undefined;

async function expectParity(form: TransferFormData) {
  expect([0, 1, 2].map((st) => validateStep(st, form)).find((m) => m !== null) ?? null).toBeNull();
  expect(validateMultiSupportedMode(form)).toBeNull();
  const s = await runSingle(form);
  expect(s.status, JSON.stringify(s.json).slice(0, 400)).toBe(200);
  const m = await runMulti([form]);
  expect(m.status, JSON.stringify(m.json).slice(0, 400)).toBe(200);
  expect((m.json.data as Obj).determinedTax).toBe(singleTax(s));
  return { single: singleTax(s)!, multi: m };
}

describe("다건 — 일반건물 폼이 단건과 같은 세액이다(④ 포함)", () => {
  it("[GF-1] 실가", async () => {
    const { multi } = await expectParity(gbForm());
    expect(multi.props.map((p) => p.propertyId)).toEqual(["land#p1", "building#p1"]);
  }, 60_000);

  it("[GF-2] 환산", async () => {
    await expectParity(gbForm(EST));
  }, 60_000);

  it("[GF-3] 토지·건물 취득일 분리 — 실가·환산", async () => {
    const split = { acquisitionDate: "2023-06-01", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2009-03-01" } as Partial<AssetForm>;
    await expectParity(gbForm({ ...split, landAcquisitionPrice: "100000000", buildingAcquisitionPrice: "150000000" } as Partial<AssetForm>));
    await expectParity(gbForm({ ...EST, ...split }));
  }, 60_000);

  it("[GF-4] 공유 지분 50%(축 A) — 100% 입력 금액을 지분 몫으로 줄인다", async () => {
    const half = { ownershipNumerator: "1", ownershipDenominator: "2", ownershipRemainderThirdParty: "yes" } as Partial<AssetForm>;
    const { single } = await expectParity(gbForm(half));
    const full = await runSingle(gbForm());
    expect(single).toBeLessThan(singleTax(full)!);
    // 파트 취득가액(100% 기준 입력)을 읽는 분리 취득 — 지분 축소(`applyShareScale`)가 빠지면 취득가액이 100%로 새어 과소과세된다.
    await expectParity(
      gbForm({
        ...half, acquisitionDate: "2023-06-01", hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2009-03-01",
        landAcquisitionPrice: "100000000", buildingAcquisitionPrice: "150000000",
      } as Partial<AssetForm>),
    );
  }, 60_000);

  it("[GF-5] 일반건물 + 같은 해 다른 날 양도한 아파트 — 합산 200", async () => {
    const apt = createDefaultTransferFormData();
    Object.assign(apt, {
      transferDate: "2024-08-20", isOneHousehold: false, contractTotalPrice: "900000000", residencePeriodMonths: "0",
      householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true,
    });
    Object.assign(apt.assets[0], {
      assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-02-01", actualSalePrice: "900000000",
      fixedAcquisitionPrice: "600000000", addressJibun: "테스트 2", regionCode: "4113510300",
    });
    const m = await runMulti([gbForm(), apt]);
    expect(m.status, JSON.stringify(m.json).slice(0, 400)).toBe(200);
    expect(m.props.map((p) => p.propertyId)).toEqual(["land#p1", "building#p1", "p2"]);
    expect((m.json.data as Obj).generalBuildingDetailsByAsset?.p1).toBeDefined();
  }, 60_000);
});
