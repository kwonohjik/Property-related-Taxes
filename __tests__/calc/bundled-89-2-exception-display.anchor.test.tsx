/**
 * anchor — 함께 양도(일괄) 결과의 자산 카드(`PropertyCard`)가 §89② 예외(「소득세법 시행령」 §156의2·§156의3)로 받은 비과세의 근거를 보인다.
 *
 * 종전: 집계 엔진은 자산마다 §89② 예외 echo(`article89ExceptionApplied`)를 실어 왔지만(겸용은 파트 카드마다 — `mixed-use-part-cards.ts`),
 *   `PropertyCard`는 「1세대1주택 비과세 / 해당 없음」만 그렸다. 화면의 §156의2 ③은 「다주택 중과세 판정 상세」의 중과 배제 사유
 *   (§167의11①13호)뿐이었다(2026-11-23 실측). 단건 결과·다건 카드는 #3599부터 이 줄을 그린다.
 *
 * | # | 사안 | 주장 |
 * |---|---|---|
 * | B-1 | 겸용 10억(§154③ 본문 — 건물 전체 주택) + 나대지 · 승계 입주권 3년 이내(§156의2③) | 파트 카드 4장 echo · 줄 4개 · 나대지 줄 없음 |
 * | B-2 | 일반 주택 15억(고가 부분 비과세) + 나대지 · 같은 권리 | 주택 카드 echo · 줄 1개 |
 * | B-3 | 짝 — 겸용 10억 · 입주권 3년 초과 + 예외 없음 선언(§89② 배제 · 과세) | echo 없음 · 줄 없음 |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/calc/transfer-tax",
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, allIssues } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LABEL = "주택과 조합원입주권·분양권을 함께 보유한 세대의 §89② 예외";
const THREE = { label: LABEL, legalBasis: ["소득세법 시행령 §156의2 ③"] };
const TESTID = '[data-testid="calc-89-2-exception-basis"]';
const ACQ = "2019-02-01";
const TRANSFER = "2023-03-20";
const LAND_PRICE = 300_000_000;
/** `mixed-use-89-2-exception-display.anchor.test.tsx`의 겸용 시료(강남 · 거주 충족). */
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};

/** 주 자산(겸용 또는 일반 주택) + 나대지 — 구분 기재(`actual`) 함께 양도. */
function bundle(o: { mixed: boolean; price: string; rightAcq: string; f?: object }): TransferFormData {
  const base = redevAptForm({
    kind: "housing", price: o.price, count: "1", houses: [],
    assetOver: { ...(o.mixed ? MIXED : {}), acquisitionDate: ACQ, regionCode: "1168010100", residencePeriods: [{ moveInDate: ACQ, moveOutDate: TRANSFER }] },
    formOver: {
      transferDate: TRANSFER,
      filingDate: "2023-12-31",
      presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: o.rightAcq, region: "capital", memberOrigin: "successor" }],
      householdNoPresaleRightsConfirmed: false,
      ...(o.f ?? {}),
    } as never,
  });
  const land = {
    ...makeDefaultAsset(2), assetId: "land2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "100000000", actualSalePrice: String(LAND_PRICE), addressJibun: "경상북도 구미시 송정동 9", landArea: "300", landNature: "standalone",
  };
  return {
    ...base,
    contractTotalPrice: String(Number(o.price) + LAND_PRICE),
    assetSplitMode: "companion",
    bundledSaleMode: "actual",
    assets: [base.assets[0], land],
  } as unknown as TransferFormData;
}

async function calc(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await runCalc(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
  expect(r.json.data.mode).toBe("bundled");
  const props = r.json.data.aggregated.properties as PerPropertyBreakdown[];
  const c = render(
    <BundledAllocationCard apportionment={r.json.data.apportionment} aggregated={r.json.data.aggregated} formData={f} ownershipMap={new Map()} onBack={() => {}} onReset={() => {}} />,
  ).container;
  const lines = [...c.querySelectorAll(TESTID)].map((e) => e.textContent ?? "");
  return { props, lines, echo: (id: string) => props.find((p) => p.propertyId === id)?.article89ExceptionApplied };
}

describe("함께 양도 결과 자산 카드 — §89② 예외 근거 표시", () => {
  it("B-1 겸용 10억 + 나대지 · 입주권 3년 이내 → 파트 카드 4장 모두 §156의2 ③ 줄 · 나대지 줄 없음", async () => {
    const { props, lines, echo } = await calc(bundle({ mixed: true, price: "1000000000", rightAcq: "2021-06-01" }));
    const parts = props.filter((p) => p.propertyId.startsWith("mu-"));
    expect(parts).toHaveLength(4);
    for (const p of parts) {
      expect(p.isExempt, p.propertyId).toBe(true);
      expect(p.article89ExceptionApplied, p.propertyId).toEqual(THREE);
    }
    expect(echo("land2")).toBeUndefined();
    expect(lines).toHaveLength(4);
    for (const l of lines) {
      expect(l).toContain(LABEL);
      expect(l).toContain("§156의2");
    }
  });

  it("B-2 일반 주택 15억(고가 부분 비과세) + 나대지 → 주택 카드에 줄 1개", async () => {
    const { props, lines, echo } = await calc(bundle({ mixed: false, price: "1500000000", rightAcq: "2021-06-01" }));
    const house = props.find((p) => p.propertyId === "primary")!;
    expect(house.isExempt).toBe(false);
    expect(house.isPartialExempt).toBe(true);
    expect(echo("primary")).toEqual(THREE);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(LABEL);
  });

  it("B-3 짝 — 겸용 10억 · 입주권 3년 초과 + 예외 없음 선언(§89② 배제 · 과세) → echo·줄 없음", async () => {
    const { props, lines } = await calc(
      bundle({ mixed: true, price: "1000000000", rightAcq: "2019-06-01", f: { rightThreeYearExceptionKind: "none" } }),
    );
    expect(props.every((p) => p.article89ExceptionApplied === undefined)).toBe(true);
    expect(props.filter((p) => p.propertyId.startsWith("mu-house")).every((p) => !p.isExempt)).toBe(true);
    expect(lines).toEqual([]);
  });
});
