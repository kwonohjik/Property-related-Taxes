/**
 * 일반건물 공유지분 — 100% 기준 입력 금액의 지분 축소 · 구분 기재 × 지분 · 함께 양도 주 자산 일반건물 (2026-10-22)
 *
 * 폼 → ⑧ → ④ → ⑫ Zod → ⑭ Route 전 구간. mock 세율.
 *
 * 종전 결함(전부 ⑧ 통과):
 *  - 축 A(단건 공유)·함께 양도 공유 컴패니언 — 일반건물 평가 객체가 지분 축소를 거치지 않아 파트 취득가액·상속 평가액·
 *    파트 경비가 100% 그대로 갔다(양도가액만 지분 몫). 1988 상속 50%: 72,114,953 vs 134,060,000.
 *  - 축 B(지분 분할) — 축소 목록에 상속 평가액 2필드(`inheritedLandValue`·`inheritedBuildingValue`)가 없어 C1 실가 분기가
 *    100% 값을 썼다. 168,859,901 vs 301,110,000.
 *  - 지분 × 계약서 구분 기재 — 100% 기준 구분 가액 합 ≠ 지분 양도가액 → 엔진 400(막다른 길).
 *  - 함께 양도에서 일반건물이 첫 번째 자산 — 파트 카드로 펼쳐지지 않아 취득가액 0. 507,135,000 vs 322,530,000.
 *
 * 기대값은 「같은 몫을 100% 소유로 입력한 계산」(금액·면적·기준시가를 지분율만큼 줄여 입력)과의 일치로 고정한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { applyShareScale } from "@/lib/calc/transfer-tax-api-gb-shares";
import { scaleDeclaredSaleSplitToShare } from "@/lib/tax-engine/general-building-entry";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = 1_600_000_000;

/** 물건 단위 값 — `s`는 「100% 소유로 반값 입력」 기준선용 축소 배율. */
const BASE = (s: number): Partial<AssetForm> => ({
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: String(150_000_000 * s),
  gbLandArea: String(205 * s),
  gbBuildingArea: String(300 * s),
  gbBuildingFootprintArea: String(135 * s),
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: String(259_072_400 * s),
  actualSalePrice: String(T * s),
  ownershipNumerator: "100",
  ownershipDenominator: "100",
});
/** 1988 상속 · 토지·건물 모두 상속(C1) · 분리 OFF. */
const INH = (s: number): Partial<AssetForm> => ({
  ...BASE(s),
  acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance",
  hasSeperateLandAcquisitionDate: false,
  landAcquisitionDate: "1988-05-01",
  acquisitionDate: "1988-05-01",
  decedentAcquisitionDate: "1970-01-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  publishedValueAtInheritance: String(300_000_000 * s),
  gbBuildingInheritedValue: String(100_000_000 * s),
});
/** 매매 · 분리 ON · 파트 실가 + 파트 직접경비. */
const BUY = (s: number): Partial<AssetForm> => ({
  ...BASE(s),
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01",
  acquisitionDate: "2010-05-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: String(400_000_000 * s),
  buildingAcquisitionPrice: String(200_000_000 * s),
  landDirectExpenses: String(10_000_000 * s),
  buildingDirectExpenses: String(4_000_000 * s),
});
/** 계약서 구분 기재 — §100③ 판정에서 채택되는 값(안분값과 30% 이내). */
const SPLIT = (s: number) =>
  ({ saleSplitMode: "actual", landTransferPrice: String(1_302_000_000 * s), buildingTransferPrice: String(298_000_000 * s) }) as Partial<AssetForm>;
const LAND: Partial<AssetForm> = {
  assetKind: "land",
  addressJibun: "강원 홍천군 테스트리 1",
  acquisitionArea: "300",
  transferArea: "300",
  acquisitionCause: "purchase",
  acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000",
  standardPriceAtTransfer: "150000000",
  actualSalePrice: "300000000",
};

const HALF_A = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" } as Partial<AssetForm>;
const HALF_B = { ownershipNumerator: "50", ownershipDenominator: "100" } as Partial<AssetForm>;
const COMPANION = { assetSplitMode: "companion", bundledSaleMode: "actual" } as Partial<TransferFormData>;
const FRACTIONAL = { assetSplitMode: "fractional" } as Partial<TransferFormData>;

const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
function form(contract: number, assets: AssetForm[], extra: Partial<TransferFormData> = {}): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(contract);
  f.assets = assets;
  return Object.assign(f, extra);
}

type Prop = { propertyId: string; acquisitionPrice: number; transferPrice: number; necessaryExpense: number };
async function run(f: TransferFormData) {
  const issues = allIssues(f);
  const body = await captureBody(f);
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = (await res.json()) as any;
  const agg = json.data?.aggregated;
  return {
    status: res.status,
    error: res.status !== 200 ? JSON.stringify(json.error) : undefined,
    issues,
    tax: (agg?.calculatedTax ?? json.data?.result?.calculatedTax) as number | undefined,
    props: (agg?.properties ?? []) as Prop[],
  };
}
const ok = (r: Awaited<ReturnType<typeof run>>) => {
  expect(r.issues).toEqual([]);
  expect(r.status, r.error).toBe(200);
  return r;
};
/** 파트 카드 취득가액을 id 접두(land·building)로 모은다 — 접미사(지분 인덱스·자산 id)는 경로마다 다르다. */
const acqOf = (r: Awaited<ReturnType<typeof run>>, part: "land" | "building") =>
  r.props.filter((p) => p.propertyId.startsWith(part)).map((p) => p.acquisitionPrice);

describe("축 A — 단건 공유 50%: 평가 객체 금액이 지분 몫으로 준다", () => {
  it("🔴 C1 상속 — 상속 평가액 = 100% × 50% (종전 72,114,953)", async () => {
    const share = ok(await run(form(T, [asset(1, INH(1), HALF_A)])));
    const ref = ok(await run(form(T / 2, [asset(1, INH(0.5))])));
    // 건물은 영 §163⑨ 단서 2호 max(평가액 1억, 취득시 기준시가 1.5억) → 지분 7,500만
    expect(acqOf(share, "land")).toEqual([150_000_000]);
    expect(acqOf(share, "building")).toEqual([75_000_000]);
    expect(share.tax).toBe(ref.tax);
    expect(share.tax).toBe(134_060_000);
  });

  it("🔴 매매 분리 ON — 파트 취득가액·파트 경비 = 100% × 50% (종전 23,497,456)", async () => {
    const share = ok(await run(form(T, [asset(1, BUY(1), HALF_A)])));
    const ref = ok(await run(form(T / 2, [asset(1, BUY(0.5))])));
    expect(acqOf(share, "land")).toEqual([200_000_000]);
    expect(acqOf(share, "building")).toEqual([100_000_000]);
    expect(share.props.map((p) => p.necessaryExpense)).toEqual(ref.props.map((p) => p.necessaryExpense));
    expect(share.tax).toBe(ref.tax);
    expect(share.tax).toBe(111_100_000);
  });
});

describe("축 B — 지분 분할 50/50: 상속 평가액도 지분 몫", () => {
  it("🔴 C1 두 지분 합 = 100% 단건 (종전 168,859,901)", async () => {
    const both = ok(
      await run(form(T, [asset(1, INH(1), HALF_B), asset(2, INH(1), HALF_B)], FRACTIONAL)),
    );
    const whole = ok(await run(form(T, [asset(1, INH(1))])));
    expect(acqOf(both, "land")).toEqual([150_000_000, 150_000_000]);
    expect(acqOf(both, "building")).toEqual([75_000_000, 75_000_000]);
    expect(both.tax).toBe(whole.tax);
    expect(both.tax).toBe(301_110_000);
  });
});

describe("함께 양도 — 공유 컴패니언 50%", () => {
  it("🔴 토지(매매) + 일반건물 50% C1 = 반값 입력 (종전 133,359,950)", async () => {
    const share = ok(await run(form(T / 2 + 300_000_000, [asset(1, LAND), asset(2, INH(1), HALF_A)], COMPANION)));
    const ref = ok(await run(form(T / 2 + 300_000_000, [asset(1, LAND), asset(2, INH(0.5))], COMPANION)));
    expect(acqOf(share, "land")).toEqual([150_000_000]);
    expect(acqOf(share, "building")).toEqual([75_000_000]);
    expect(share.tax).toBe(ref.tax);
    expect(share.tax).toBe(197_580_000);
  });
});

describe("지분 × 계약서 구분 기재 — 토지 × 지분율, 건물 = 지분 양도가액 − 토지", () => {
  it("🔴 축 A 50% — 200 · 구분 가액 채택 · 반값 입력과 같다 (종전 400)", async () => {
    const share = ok(await run(form(T, [asset(1, BUY(1), SPLIT(1), HALF_A)])));
    const ref = ok(await run(form(T / 2, [asset(1, BUY(0.5), SPLIT(0.5))])));
    expect(share.props.map((p) => p.transferPrice)).toEqual([651_000_000, 149_000_000]);
    expect(share.tax).toBe(ref.tax);
  });

  it("🔴 축 B 1/3 × 3 — 200 · 토지 434,000,000 · 건물 잔액(마지막 지분이 1원 흡수) (종전 400)", async () => {
    const third = { ownershipNumerator: "1", ownershipDenominator: "3" } as Partial<AssetForm>;
    const r = ok(
      await run(
        form(T, [asset(1, BUY(1), SPLIT(1), third), asset(2, BUY(1), SPLIT(1), third), asset(3, BUY(1), SPLIT(1), third)], FRACTIONAL),
      ),
    );
    const land = r.props.filter((p) => p.propertyId.startsWith("land")).map((p) => p.transferPrice);
    const bld = r.props.filter((p) => p.propertyId.startsWith("building")).map((p) => p.transferPrice);
    expect(land).toEqual([434_000_000, 434_000_000, 434_000_000]);
    expect(bld).toEqual([99_333_333, 99_333_333, 99_333_334]);
    expect([...land, ...bld].reduce((a, b) => a + b, 0)).toBe(T);
  });
});

describe("함께 양도 — 일반건물이 첫 번째 자산", () => {
  it("🔴 파트 카드로 펼쳐지고 순서를 바꾼 계산과 같다 (종전 취득가액 0 · 507,135,000)", async () => {
    const gbFirst = ok(await run(form(T + 300_000_000, [asset(1, BUY(1)), asset(2, LAND)], COMPANION)));
    const landFirst = ok(await run(form(T + 300_000_000, [asset(1, LAND), asset(2, BUY(1))], COMPANION)));
    expect(acqOf(gbFirst, "land")).toEqual([400_000_000]);
    expect(acqOf(gbFirst, "building")).toEqual([200_000_000]);
    expect(gbFirst.tax).toBe(landFirst.tax);
  });
});

describe("leaf", () => {
  it("applyShareScale — 상속 평가액 2필드도 × 지분율", () => {
    const out = applyShareScale({ inheritedLandValue: 300_000_000, inheritedBuildingValue: 150_000_001, landArea: 205 }, 0.5);
    expect(out).toMatchObject({ inheritedLandValue: 150_000_000, inheritedBuildingValue: 75_000_000, landArea: 205 });
  });

  it("scaleDeclaredSaleSplitToShare — 토지만 줄이고 건물은 비운다 · 건물만 기재면 건물 · 단독 소유는 그대로", () => {
    const both = { landTransferPrice: 1_302_000_000, buildingTransferPrice: 298_000_000, landArea: 205 };
    // 판정용 계약서 금액(100%)은 따로 싣는다(`sale-split-100-3-share-scale-judgment.plan.md` Q-1 a).
    expect(scaleDeclaredSaleSplitToShare(both, 1 / 3)).toEqual({
      landTransferPrice: 434_000_000,
      landArea: 205,
      saleSplitContract: { land: 1_302_000_000, building: 298_000_000, ownershipRatio: 1 / 3 },
    });
    // 한쪽만 기재 — 계약 총액을 모르면 계약서 금액을 만들 수 없다(종전 지분 판정), 알면 반대쪽을 정한다.
    expect(scaleDeclaredSaleSplitToShare({ buildingTransferPrice: 298_000_000 }, 0.5)).toEqual({ buildingTransferPrice: 149_000_000 });
    expect(scaleDeclaredSaleSplitToShare({ buildingTransferPrice: 298_000_000 }, 0.5, T)).toEqual({
      buildingTransferPrice: 149_000_000,
      saleSplitContract: { land: T - 298_000_000, building: 298_000_000, ownershipRatio: 0.5 },
    });
    expect(scaleDeclaredSaleSplitToShare(both, undefined)).toBe(both);
    expect(scaleDeclaredSaleSplitToShare(both, 1)).toBe(both);
    expect(scaleDeclaredSaleSplitToShare({ landArea: 205 }, 0.5)).toEqual({ landArea: 205 });
  });
});
