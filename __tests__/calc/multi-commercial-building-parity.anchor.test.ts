/**
 * anchor(④·⑧·⑫·⑭ 다건) — 상업용건물·오피스텔을 다건 합산에 넣어도 단건과 같은 세액이 나온다
 * (계획서 `docs/00-pm/multi-building-valuation-support.plan.md` 트랙 C · Q-1 a).
 *
 * 상업용건물은 단건 route에 전용 분기가 없고 단건 엔진이 서브객체를 직접 읽는다
 * (STEP 0.35 §164⑥ 환산 `commercialBuildingValuation` · STEP 0.62 부수토지 `commercialAppurtenantLand` ·
 * §163⑨2호 상속 상가 `commercialInheritanceValuation`). 합산 엔진도 자산마다 단건 엔진을 부르므로,
 * 다건 ④가 같은 서브객체를 만들고 ⑫가 받아 ⑭가 옮기기만 하면 세액이 같다.
 * 서브객체가 빠지면 환산이 사라져 양도차익이 양도가액 전액이 된다(계획서 §2.2 probe) — 그래서 종전에는 막았다.
 *
 * 기대값은 단건 route 결과와의 동일성이다(`single-multi-route-parity` 규약).
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
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runSingle, runMulti, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 공시 후(2005~) 취득 오피스텔 — 환산 입력 일체. */
const POST_DISCLOSURE: Partial<AssetForm> = {
  useEstimatedAcquisition: true,
  acquisitionDate: "2015-06-03",
  cbEra: "",
  cbExclusiveArea: "36",
  cbSharedArea: "33.52",
  cbLandArea: "12.57",
  cbUnitPriceAtTransfer: "5000000",
  cbUnitPriceAtFirstOrAcq: "3000000",
  cbLandPricePerSqmAtAcq: "3978096",
  cbLandPricePerSqmAtTransfer: "15000000",
};

/** 공시 전(2005 전) 취득 — §164⑥ 최초고시 환산 입력 추가. */
const PRE_DISCLOSURE: Partial<AssetForm> = {
  ...POST_DISCLOSURE,
  acquisitionDate: "2000-12-07",
  cbBuildingStdPriceAtAcq: "69602660",
  cbBuildingStdPriceAtFirst: "69527856",
  cbBuildingStdPriceAtTransfer: "80000000",
  cbLandPricePerSqmAtFirst: "11060632",
};

function cbForm(over: Partial<AssetForm> = {}, td = "2026-03-10", price = "400000000"): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: td, isOneHousehold: false, contractTotalPrice: price, residencePeriodMonths: "0" });
  f.assets = [
    {
      ...makeDefaultAsset(1),
      assetKind: "commercial_building",
      acquisitionCause: "purchase",
      addressJibun: "서울특별시 종로구 청운동 1-1",
      actualSalePrice: price,
      ...over,
    } as AssetForm,
  ];
  return f;
}

/** 같은 해 나중에 양도한 아파트(사용자 사례의 두 번째 자산). */
function aptForm(td = "2026-08-20"): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: td, isOneHousehold: false, contractTotalPrice: "900000000", residencePeriodMonths: "0",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-02-01", actualSalePrice: "900000000",
    fixedAcquisitionPrice: "600000000", addressJibun: "테스트 2", regionCode: "4113510300",
  });
  return f;
}

async function expectParity(form: TransferFormData) {
  const single = await runSingle(form);
  expect(single.status, JSON.stringify(single.json).slice(0, 400)).toBe(200);
  const multi = await runMulti([form]);
  expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
  expect(multi.totalTax).toBe(single.totalTax);
  return { single, multi };
}

describe("다건 — 상업용건물·오피스텔이 단건과 같은 세액이다", () => {
  it("[MC-0] ⑧ — 상업용건물은 막지 않는다(일반건물도 트랙 G에서 풀렸다 — `multi-general-building-parity`)", () => {
    expect(validateMultiSupportedMode(cbForm(POST_DISCLOSURE))).toBeNull();
  });

  it("[MC-0b] ⑧ V-C1 — 건별 validateStep이 환산 필수값 공란을 막는다(④가 undefined를 돌려 환산 없이 계산되지 않게)", () => {
    const m = [0, 1, 2].map((s) => validateStep(s, cbForm({ ...POST_DISCLOSURE, cbExclusiveArea: "" }))).find((x) => x !== null);
    expect(m).toContain("전용면적");
  });

  it("[MC-0c] ④ — 다건 페이로드가 환산·부수토지 서브객체를 싣는다", () => {
    const p = buildPropertyPayload(
      cbForm({ ...POST_DISCLOSURE, cbTotalLandArea: "500", cbTotalBuildingFootprintArea: "200", cbZoneType: "general_residential" }),
    ) as Record<string, unknown>;
    expect(p.commercialBuildingValuation).toMatchObject({ isPreDisclosure: false, exclusiveArea: 36 });
    expect(p.commercialAppurtenantLand).toMatchObject({ totalLandArea: 500, totalBuildingFootprintArea: 200 });
  });

  it("[MC-1] 환산 — 공시 후 취득", async () => {
    const { single } = await expectParity(cbForm(POST_DISCLOSURE));
    expect(single.r.commercialBuildingValuationDetail).toBeDefined();
  }, 60_000);

  it("[MC-2] 환산 — 공시 전 취득(§164⑥ 최초고시)", async () => {
    await expectParity(cbForm(PRE_DISCLOSURE));
  }, 60_000);

  it("[MC-3] 실거래가 — 서브객체 없음", async () => {
    await expectParity(cbForm({ acquisitionDate: "2015-06-03", fixedAcquisitionPrice: "250000000" }));
  }, 60_000);

  it("[MC-4] 부수토지 초과분(§101①2호) — 비사업용 비율 중과", async () => {
    const { single } = await expectParity(
      cbForm({
        acquisitionDate: "2015-06-03", fixedAcquisitionPrice: "250000000",
        cbTotalLandArea: "4000", cbTotalBuildingFootprintArea: "200", cbZoneType: "general_residential",
      }),
    );
    expect(single.r.surchargeType).toBe("non_business_land");
  }, 60_000);

  it("[MC-5] 상속 취득(공시 전 상속개시) — §163⑨2호 상가 보조 입력", async () => {
    const form = cbForm({
      ...PRE_DISCLOSURE,
      useEstimatedAcquisition: false,
      acquisitionCause: "inheritance",
      acquisitionDate: "2003-05-01",
      cbInheritanceStdPriceAtAcq: "150000000",
      decedentAcquisitionDate: "1995-03-01",
    } as Partial<AssetForm>);
    const body = await buildMultiBody([form]);
    expect((body.properties as Record<string, unknown>[])[0].commercialInheritanceValuation).toBeDefined();
    await expectParity(form);

    // 매매 → 상속으로 바꾼 뒤 남은 환산 토글(화면에 없음) — 단건 ④처럼 환산 플래그를 끄고 보낸다(⑫ 기준시가 필수 400 방지).
    const stale = { ...form, assets: [{ ...form.assets[0], useEstimatedAcquisition: true }] } as TransferFormData;
    const staleBody = await buildMultiBody([stale]);
    expect((staleBody.properties as Record<string, unknown>[])[0].useEstimatedAcquisition).toBe(false);
    await expectParity(stale);
  }, 60_000);

  it("[MC-6] 공익수용 §164⑨1호 + 환산", async () => {
    await expectParity(
      cbForm({ ...POST_DISCLOSURE, transferCause: "public_expropriation", compensationPerSqm: "4000000", compensationBasisStdPrice: "4500000" } as Partial<AssetForm>),
    );
  }, 60_000);

  it("[MC-7] 사용자 사례 — 오피스텔(먼저 양도) + 아파트(나중 양도) 합산: 오피스텔 양도차익이 단건과 같다", async () => {
    const officetel = cbForm(POST_DISCLOSURE);
    const single = await runSingle(officetel);
    const multi = await postMulti(await buildMultiBody([officetel, aptForm()]));
    expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
    expect(multi.props[0].transferGain).toBe(single.r.transferGain);
    expect(single.r.transferGain).toBeLessThan(400_000_000); // 환산이 살아 있다(양도가액 전액이 아니다)
  }, 60_000);
});
