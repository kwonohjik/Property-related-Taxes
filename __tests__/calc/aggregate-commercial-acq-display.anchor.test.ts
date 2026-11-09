/**
 * anchor(표시 전용) — 상업용건물·오피스텔 환산 자산의 자산별 「취득가액·필요경비」 echo가 엔진 환산값과 같다.
 *
 * ## 결함 (2026-11-09 브라우저 실측 · 오피스텔 먼저 + 아파트 나중 합산)
 *
 * 상가 §164⑥ 환산은 엔진이 STEP 0.35에서 환산취득가를 **실가처럼** 주입한다(`transfer-tax-commercial-step.ts` —
 * `useEstimatedAcquisition: false`). 그래서 합산 echo(`resolveDisplayAcquisitionAndExpense`)의 환산 분기
 * (`usedEstimatedAcquisition`)를 타지 않고 `singleInput.acquisitionPrice`(화면에 없는 칸 · 0)로 떨어졌다. 필요경비는
 * 그 값에서 역산되므로 환산취득가 전액이 필요경비로 들어갔다:
 *
 * | 화면 | 취득가액 | 필요경비 |
 * |---|---|---|
 * | 신고서 양식(합산) — `filingDisplay.commercialEstimatedAcquisition`을 읽는다 | 240,000,000 | 6,256,800 |
 * | 합산 결과 카드·상세명세서 — echo를 읽는다(수정 전) | **0** | **246,256,800** |
 *
 * 항등식(양도가액 − 취득가액 − 필요경비 = 양도차익)은 역산이라 양쪽 다 성립한다 — 자기검산이 가린다. 세액 불변.
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
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { runSingle, runMulti, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Obj = Record<string, unknown>;

/** `multi-commercial-building-parity.anchor.test.ts`와 같은 오피스텔(공시 후 취득). */
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
const PRE_DISCLOSURE: Partial<AssetForm> = {
  ...POST_DISCLOSURE,
  acquisitionDate: "2000-12-07",
  cbBuildingStdPriceAtAcq: "69602660",
  cbBuildingStdPriceAtFirst: "69527856",
  cbBuildingStdPriceAtTransfer: "80000000",
  cbLandPricePerSqmAtFirst: "11060632",
};
const OFFICETEL_ASSET = {
  assetKind: "commercial_building",
  acquisitionCause: "purchase",
  addressJibun: "서울특별시 종로구 청운동 1-1",
  actualSalePrice: "400000000",
};

function cbForm(over: Partial<AssetForm> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, { transferDate: "2026-03-10", isOneHousehold: false, contractTotalPrice: "400000000", residencePeriodMonths: "0" });
  f.assets = [{ ...makeDefaultAsset(1), ...OFFICETEL_ASSET, ...POST_DISCLOSURE, ...over } as AssetForm];
  return f;
}

function aptForm(): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: "2026-08-20", isOneHousehold: false, contractTotalPrice: "900000000", residencePeriodMonths: "0",
    householdNoPresaleRightsConfirmed: true, householdNoOtherHousesConfirmed: true,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-02-01", actualSalePrice: "900000000",
    fixedAcquisitionPrice: "600000000", addressJibun: "테스트 2", regionCode: "4113510300",
  });
  return f;
}

/** 다건 합산 — 오피스텔 1건 + 아파트. 오피스텔 자산 echo와 단건 엔진 환산 상세를 함께 돌려준다. */
async function multiOfficetel(over: Partial<AssetForm> = {}) {
  const officetel = cbForm(over);
  const single = await runSingle(officetel);
  expect(single.status, JSON.stringify(single.json).slice(0, 400)).toBe(200);
  const multi = await postMulti(await buildMultiBody([officetel, aptForm()]));
  expect(multi.status, JSON.stringify(multi.json).slice(0, 400)).toBe(200);
  return { p: multi.props[0], detail: single.r.commercialBuildingValuationDetail as Obj | undefined, single };
}

function expectIdentity(p: Obj) {
  expect((p.transferPrice as number) - (p.acquisitionPrice as number) - (p.necessaryExpense as number)).toBe(p.transferGain);
}

describe("합산 echo — 상업용건물 환산 자산의 취득가액·필요경비", () => {
  it("[CD-1] 🔴 사용자 사례(다건) — 취득가액 = 환산취득가 240,000,000 · 필요경비 = 개산공제 6,256,800", async () => {
    const { p, detail } = await multiOfficetel();
    expect(detail?.estimatedAcquisitionTotal).toBe(240_000_000);
    expect(p.acquisitionPrice).toBe(240_000_000);
    expect(p.necessaryExpense).toBe(6_256_800);
    expect(p.necessaryExpense).toBe(detail?.estimatedDeductionTotal);
    expectIdentity(p);
  }, 60_000);

  it("[CD-2] 🔴 공시 전 취득(§164⑥ 최초고시) — 같은 규칙", async () => {
    const { p, detail } = await multiOfficetel(PRE_DISCLOSURE);
    expect(p.acquisitionPrice).toBe(detail?.estimatedAcquisitionTotal);
    expect(p.necessaryExpense).toBe(detail?.estimatedDeductionTotal);
    expectIdentity(p);
  }, 60_000);

  it("[CD-3] §97②2호 단서(swap) — 환산취득가를 차감하지 않으므로 취득가액 0 · 필요경비 = 나목(종전 그대로)", async () => {
    const { p, single } = await multiOfficetel({ capitalExpenditure: "300000000" } as Partial<AssetForm>);
    expect(single.r.swapApplied).toBe(true);
    expect(p.acquisitionPrice).toBe(0);
    expect(p.necessaryExpense).toBe(300_000_000);
    expectIdentity(p);
  }, 60_000);

  it("[CD-3b] §97③ 감가상각비 — 취득가액 = 환산취득가 − 감가상각비(신고서 표 `aggregateEstimatedDisplay`와 같은 값)", async () => {
    const { p, detail, single } = await multiOfficetel({ depreciationAmount: "10000000" } as Partial<AssetForm>);
    expect(single.r.depreciationAmount).toBe(10_000_000);
    expect(p.acquisitionPrice).toBe((detail?.estimatedAcquisitionTotal as number) - 10_000_000);
    expect(p.necessaryExpense).toBe(detail?.estimatedDeductionTotal);
    expectIdentity(p);
  }, 60_000);

  it("[CD-4] 실거래가 상가(환산 아님) — 입력 취득가액 그대로(종전 그대로)", async () => {
    const multi = await runMulti([cbForm({ useEstimatedAcquisition: false, fixedAcquisitionPrice: "250000000" } as Partial<AssetForm>)]);
    expect(multi.status).toBe(200);
    expect(multi.props[0].acquisitionPrice).toBe(250_000_000);
    expect(multi.props[0].necessaryExpense).toBe(0);
  }, 60_000);

  it("[CD-5] 🔴 함께 양도(주택 + 오피스텔 컴패니언) — 같은 echo라 같은 값", async () => {
    const officetel = cbForm();
    const single = await runSingle(officetel);
    const detail = single.r.commercialBuildingValuationDetail as Obj;
    const f = aptForm();
    Object.assign(f, { transferDate: "2026-03-10", contractTotalPrice: "1300000000", bundledSaleMode: "actual" });
    f.assets = [
      { ...f.assets[0], actualSalePrice: "900000000" } as AssetForm,
      // ⚠️ 컴패니언 ⑩ refine은 상가 서브객체가 있어도 일반 기준시가 2칸을 요구한다(주 자산 ⑫는 면제 — 별건 dead-end).
      //    echo만 재려고 2칸을 채운다 — 상가 STEP 0.35가 서브객체로 환산을 덮으므로 값은 세액에 쓰이지 않는다.
      { ...makeDefaultAsset(2), ...OFFICETEL_ASSET, ...POST_DISCLOSURE, standardPriceAtAcq: "100000000", standardPriceAtTransfer: "200000000" } as AssetForm,
    ];
    const bundled = await runSingle(f);
    expect(bundled.status, JSON.stringify(bundled.json).slice(0, 400)).toBe(200);
    const props = (((bundled.json.data as Obj).aggregated as Obj).properties ?? []) as Obj[];
    const cb = props.find((p) => p.transferPrice === 400_000_000);
    expect(cb, JSON.stringify(props.map((p) => [p.propertyId, p.transferPrice]))).toBeDefined();
    expect(cb!.transferGain).toBe(single.r.transferGain); // 세액 축은 단건과 같다(환산이 서브객체로 이뤄진다)
    expect(cb!.acquisitionPrice).toBe(detail.estimatedAcquisitionTotal);
    expect(cb!.necessaryExpense).toBe(detail.estimatedDeductionTotal);
    expectIdentity(cb!);
  }, 60_000);
});
