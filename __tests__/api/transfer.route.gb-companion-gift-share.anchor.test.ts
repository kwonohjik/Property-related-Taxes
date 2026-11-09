/**
 * 매매 함께 양도 × 일반건물 컴패니언 「토지·건물 모두 증여 · 분리 OFF」 × 지분 — 증여 신고가액 지분 축소 안전망.
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §10 (측정 28칸 · 값 결함 0 · 결정 Q-1 a).
 *
 * 분리 OFF 증여는 화면이 증여 신고가액 한 칸(`fixedAcquisitionPrice`)만 받고, 엔진이 그 값을 취득시 기준시가 비율로 토지·건물에 나눈다.
 * 이 경로의 지분 축소는 `transfer-tax-api-companion-payload.ts`의 `fixedAcquisitionPrice = applyRatio(fixedAcqRaw, ratio)` 한 줄이 정한다
 * — 일반건물 평가 객체 축소(`applyShareScale`)는 이 칸을 다루지 않는다. 그 줄을 일반건물에서 끄면 50% 세액이 105,860,000 → 9,000,000이 되는데
 * 이 파일 전에는 테스트 전체가 통과했다(MG3 SURVIVED).
 *
 * 화면 경로 그대로 — 폼 → ⑧(`allIssues`) → ④(`captureBody`) → ⑫~⑭(route POST). mock 세율.
 * 대조: 같은 묶음에서 컴패니언만 「같은 몫을 100% 소유로 입력」(금액·면적·기준시가를 지분율만큼 줄여 입력).
 */
import { describe, expect, it, vi } from "vitest";
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
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const S = (n: number, s: number) => String(Math.round(n * s));
const AREA = (n: number, s: number) => String(Math.round(n * s * 100) / 100);

/** 일반건물 · 토지·건물 모두 증여 2015 · 분리 OFF · 증여 신고가액 6억(물건 전체). `s` = 대조용 축소 배율. */
const GIFT_GB = (s: number): Partial<AssetForm> => ({
  assetKind: "general_building", addressJibun: "서울 강남구 테스트동 9", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
  gbLandArea: AREA(100, s), gbBuildingArea: AREA(200, s), gbBuildingFootprintArea: AREA(50, s), gbTransferLandPricePerSqm: "2000000", gbTransferBuildingValue: S(200_000_000, s),
  gbAcqLandPricePerSqm: "1000000", gbAcqBuildingValue: S(100_000_000, s), gbZoneType: "general_residential", actualSalePrice: S(1_000_000_000, s), standardPriceAtTransfer: S(400_000_000, s),
  ownershipNumerator: "100", ownershipDenominator: "100",
  acquisitionCause: "gift", gbBuildingAcquisitionCause: "gift", hasSeperateLandAcquisitionDate: false, acquisitionDate: "2015-06-01", landAcquisitionDate: "2015-06-01",
  fixedAcquisitionPrice: S(600_000_000, s), landAcquisitionPrice: "", buildingAcquisitionPrice: "",
});
const LAND: Partial<AssetForm> = {
  assetKind: "land", addressJibun: "강원 홍천군 테스트리 1", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  fixedAcquisitionPrice: "100000000", standardPriceAtTransfer: "150000000", actualSalePrice: "300000000", landNature: "standalone",
};
const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
function form(contract: number, assets: AssetForm[], mode: "actual" | "apportioned"): TransferFormData {
  const f = newForm();
  f.transferDate = "2024-03-01";
  f.filingDate = "2024-05-31";
  f.contractTotalPrice = String(contract);
  f.assets = assets;
  return Object.assign(f, { assetSplitMode: "companion", bundledSaleMode: mode } as Partial<TransferFormData>);
}
async function run(f: TransferFormData) {
  const issues = allIssues(f);
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  const agg = j.data?.aggregated as Loose | undefined;
  return {
    issues, status: res.status, err: res.status === 200 ? "" : JSON.stringify(j.error).slice(0, 200),
    tax: agg?.calculatedTax as number | undefined,
    parts: ((agg?.properties ?? []) as Loose[]).map((p) => [String(p.propertyId).split("#")[0], p.acquisitionPrice, p.transferPrice, p.transferGain] as const),
  };
}

/** [지분 %, 모드, 세액, 토지·건물 파트 취득가액(= 증여 신고가액 × 지분율을 취득시 기준시가 1억 : 1억으로 나눈 값)] */
const CELLS: [number, "actual" | "apportioned", number, number][] = [
  [50, "actual", 105_860_000, 150_000_000],
  [50, "apportioned", 105_517_143, 150_000_000],
  [30, "actual", 79_734_000, 90_000_000],
  [30, "apportioned", 79_480_667, 90_000_000],
];

describe("일반건물 컴패니언 · 둘 다 증여 · 분리 OFF × 지분 — 증여 신고가액 지분 축소", () => {
  it.each(CELLS)("지분 %i%% · %s — ⑧ 0건 · ⑫ 200 · 세액 %i = 같은 몫 100% 입력 · 파트 취득가액 %i", async (sh, mode, tax, partAcq) => {
    const contract = Math.round(1_000_000_000 * sh / 100) + 300_000_000;
    const SHARE = { ownershipNumerator: String(sh), ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" } as Partial<AssetForm>;
    const share = await run(form(contract, [asset(1, LAND), asset(2, GIFT_GB(1), SHARE)], mode));
    const ref = await run(form(contract, [asset(1, LAND), asset(2, GIFT_GB(sh / 100))], mode));

    expect(share.issues, "⑧").toEqual([]);
    expect(share.status, `⑫ ${share.err}`).toBe(200);
    expect(ref.status, `대조 ${ref.err}`).toBe(200);
    expect(share.tax, "세액 = 대조").toBe(ref.tax);
    expect(share.tax, "세액 고정값").toBe(tax);
    expect(share.parts, "파트 카드 = 대조").toEqual(ref.parts);
    const acq = Object.fromEntries(share.parts.map(([id, a]) => [id, a]));
    expect([acq.land, acq.building], "토지·건물 파트 취득가액").toEqual([partAcq, partAcq]);
  });
});
