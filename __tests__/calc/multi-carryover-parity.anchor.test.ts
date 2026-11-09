/**
 * anchor(④·⑧·⑫·⑭ 다건) — 배우자등 이월과세(소득세법 §97의2) 자산을 연간 합산에 넣을 수 있다
 * (계획서 `docs/00-pm/multi-carryover-bg-gb-shares.plan.md` 트랙 CO · Q-1 a).
 *
 * 합산 엔진은 이월과세를 이미 계산한다 — 단건 route가 만든 엔진 입력을 그대로 넣으면 단건과 같았다(계획서 §2:
 * 155,166,000 · 시나리오 A). 막던 것은 ⑧·⑫와 ④·⑭의 `carryoverTaxation` 배관뿐이었다.
 *
 * 연간 합산은 확정신고 1건이라 §97의2②3호 비교가 **그 해 전체 결정세액**으로 한다(§92③2호 — memory
 * `project_transfer_carryover_filing_unit_scope`). 그래서 다른 자산과 함께면 단건과 채택 시나리오가 **갈릴 수 있고
 * 그것이 정상이다** — CO-3이 그 시료(엔진 N1-01과 같은 물건)를 고정한다.
 *
 * 계속 막는 하위 모드(CO-4): 파트 이월과세(토지만·건물만·증여자 분리) · 당초 증여 때 인수한 채무 부분(매입분).
 * 일반건물 이월과세는 트랙 G 펼침이 단건과 같은 카드로 옮겨 막지 않는다(CO-5).
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
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import {
  MULTI_CARRYOVER_DEBT_UNSUPPORTED_MESSAGE,
  MULTI_CARRYOVER_PART_UNSUPPORTED_MESSAGE,
} from "@/lib/calc/multi-transfer-support-messages";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { runSingle, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;

function form(asset: Partial<AssetForm>, over: Obj = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2024-06-01", isOneHousehold: false, residencePeriodMonths: "0", contractTotalPrice: "1000000000",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true, ...over,
  });
  f.assets = [{ ...makeDefaultAsset(1), ...asset } as AssetForm];
  return f;
}

const carryover = (over: Partial<CarryoverTaxationForm> = {}): CarryoverTaxationForm => ({
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  donorAcquisitionPrice: "300000000",
  useEstimatedAcquisition: false,
  giftTaxAmount: "60000000",
  donorCapitalExpenditure: "40000000",
  giftDateValuation: "600000000",
  donorRelation: "spouse",
  donorSameHousehold: "no",
  ...over,
});

/** 배우자 증여 주택(계획서 §2 시료) — 단건 155,166,000 · 시나리오 A. */
const CO_HOUSE: Partial<AssetForm> = {
  assetKind: "housing", acquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01", actualSalePrice: "1000000000",
  standardPriceAtTransfer: "800000000", addressJibun: "테스트 3", regionCode: "2826010100", carryover: carryover(),
};

/** 같은 해 나중에 양도한 아파트(단건 87,373,000). */
const APT = form(
  { assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-02-01", actualSalePrice: "900000000", fixedAcquisitionPrice: "600000000", addressJibun: "테스트 2", regionCode: "2826010100" },
  { contractTotalPrice: "900000000", transferDate: "2024-09-01" },
);

async function single(f: TransferFormData) {
  const s = await runSingle(f);
  expect(s.status, JSON.stringify(s.json).slice(0, 400)).toBe(200);
  return s;
}
async function multi(forms: TransferFormData[]) {
  const m = await postMulti(await buildMultiBody(forms));
  expect(m.status, JSON.stringify(m.json).slice(0, 400)).toBe(200);
  return m;
}
const adopted = (p: Obj | undefined) => (p?.carryoverTaxationDetail as { adoptedScenario?: string } | undefined)?.adoptedScenario;

describe("다건 — 배우자등 이월과세(§97의2)", () => {
  it("[CO-0] ⑧ — 자산 단위 이월과세는 막지 않는다", () => {
    expect(validateMultiSupportedMode(form(CO_HOUSE))).toBeNull();
  });

  it("[CO-0b] ④ — 다건 페이로드의 `carryoverTaxation`이 단건 ④와 같다", async () => {
    const f = form(CO_HOUSE);
    const s = await single(f);
    expect((buildPropertyPayload(f) as Obj).carryoverTaxation).toEqual(s.body.carryoverTaxation);
  });

  it("[CO-1] 🔴 1건 — 단건과 같은 세액 · 같은 채택 시나리오(155,166,000 · A)", async () => {
    const f = form(CO_HOUSE);
    const s = await single(f);
    const m = await multi([f]);
    expect(s.totalTax).toBe(155_166_000);
    expect(m.totalTax).toBe(s.totalTax);
    expect(adopted(m.props[0])).toBe("A");
    expect(adopted(m.props[0])).toBe(adopted(s.r as Obj));
  }, 60_000);

  it("[CO-2] 🔴 아파트와 함께 — 이월과세 자산 양도차익 그대로 · 신고단위 비교 근거가 실린다", async () => {
    const m = await multi([form(CO_HOUSE), APT]);
    expect(m.props[0].transferGain).toBe(600_000_000);
    expect(adopted(m.props[0])).toBe("A");
    expect((m.props[0].carryoverTaxationDetail as Obj).filingUnitComparison).toEqual({
      determinedTaxWithCarryover: 250_290_000,
      determinedTaxWithout: 231_810_000,
    });
    expect(m.totalTax).toBe(275_319_000);
  }, 60_000);

  it("[CO-3] 신고단위 비교는 단건과 갈릴 수 있다 — 토지 이월과세(증여 9개월 전) + 장기 보유 토지: 단건 B · 합산 A", async () => {
    const coLand = form(
      {
        assetKind: "land", acquisitionCause: "carryover_gift", acquisitionDate: "2025-09-01", actualSalePrice: "1000000000",
        addressJibun: "테스트 5", regionCode: "2826010100",
        carryover: carryover({ giftRegistryDate: "2025-09-01", donorAcquisitionDate: "2010-01-01", donorAcquisitionPrice: "100000000", giftTaxAmount: "0", donorCapitalExpenditure: "", giftDateValuation: "500000000" }),
      },
      { transferDate: "2026-06-01" },
    );
    const longLand = form(
      { assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2012-03-01", actualSalePrice: "1000000000", fixedAcquisitionPrice: "500000000", addressJibun: "테스트 6", regionCode: "2826010100" },
      { transferDate: "2026-06-01" },
    );
    const s = await single(coLand);
    const m = await multi([coLand, longLand]);
    expect(adopted(s.r as Obj)).toBe("B");
    expect(adopted(m.props[0])).toBe("A");
  }, 60_000);

  /**
   * 일반건물 이월과세 — 값은 `generalBuildingValuation` 안(`landCarryoverTaxation`·`buildingCarryoverTaxation`)에 실리고 트랙 G 펼침
   * (`multi-gb-expansion.ts`)이 단건과 같은 카드로 옮긴다. 「건물만」은 트랙 G 머지 뒤부터 이미 열려 있었다(실측 단건 = 다건).
   * 증여자 취득가액(1천만)을 매매 건물 취득가액(1억)과 다르게 둬야 이월과세가 세액을 움직인다(같으면 A가 매매와 같아 판별력 0).
   */
  it("[CO-5] 일반건물 — 전체 이월과세 276,243,000 · 건물만 247,137,000(매매 218,031,000) · 단건과 같다", async () => {
    const gbCo = carryover({ donorAcquisitionPrice: "10000000", giftTaxAmount: "0", donorCapitalExpenditure: "", giftDateValuation: "300000000" });
    const GB: Partial<AssetForm> = {
      assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "purchase", acquisitionDate: "2009-03-01",
      useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual", gbLandArea: "100", gbBuildingArea: "200",
      gbBuildingFootprintArea: "50", gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
      gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential", actualSalePrice: "1000000000",
      addressJibun: "테스트 7", regionCode: "2826010100", fixedAcquisitionPrice: "200000000", landAcquisitionPrice: "100000000", buildingAcquisitionPrice: "100000000",
    } as Partial<AssetForm>;
    const cases: [Partial<AssetForm>, number][] = [
      [{ ...GB, acquisitionCause: "carryover_gift", gbBuildingAcquisitionCause: "carryover_gift", acquisitionDate: "2021-06-01", carryover: gbCo } as Partial<AssetForm>, 276_243_000],
      [{ ...GB, gbBuildingAcquisitionCause: "carryover_gift", buildingCarryover: gbCo, gbBuildingAcquisitionDate: "2021-06-01" } as Partial<AssetForm>, 247_137_000],
      [GB, 218_031_000],
    ];
    for (const [asset, tax] of cases) {
      const f = form(asset);
      expect(validateMultiSupportedMode(f)).toBeNull();
      const s = await runSingle(f);
      expect(s.status).toBe(200);
      const m = await multi([f]);
      expect(((s.json.data as Obj).aggregated as Obj).totalTax).toBe(tax);
      expect(m.totalTax).toBe(tax);
    }
  }, 60_000);
});

describe("다건 — 계속 막는 이월과세 하위 모드(⑧·⑫ 같은 문구)", () => {
  it("[CO-4a] 채무 인수분(매입분) — ⑧ · ⑫", async () => {
    const f = form({ ...CO_HOUSE, carryover: carryover({ giftDebtAssumed: true, giftAssumedDebt: "100000000" }) });
    const body = await buildMultiBody([f]);
    const ct = (body.properties as Obj[])[0].carryoverTaxation as Obj | undefined;
    // 화면이 채무를 실었는지부터 — 실리지 않으면 이 시료는 채무 경우가 아니다.
    expect(ct?.giftAssumedDebt).toBe(100_000_000);
    expect(validateMultiSupportedMode(f)).toBe(MULTI_CARRYOVER_DEBT_UNSUPPORTED_MESSAGE);
    const m = await postMulti(body);
    expect(m.status).toBe(400);
    expect(JSON.stringify(m.json)).toContain(MULTI_CARRYOVER_DEBT_UNSUPPORTED_MESSAGE);
  }, 60_000);

  it("[CO-4c] 파트 이월과세 키 — ⑫(API 직접)", async () => {
    const body = await buildMultiBody([form(CO_HOUSE)]);
    const p = (body.properties as Obj[])[0];
    const m = await postMulti({ ...body, properties: [{ ...p, landCarryoverPart: p.carryoverTaxation }] });
    expect(m.status).toBe(400);
    expect(JSON.stringify(m.json)).toContain(MULTI_CARRYOVER_PART_UNSUPPORTED_MESSAGE);
  }, 60_000);
});
