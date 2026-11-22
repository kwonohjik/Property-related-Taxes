/**
 * anchor — 겸용주택 결과가 §89② 예외(「소득세법 시행령」 §156의2·§156의3)로 받은 비과세의 근거를 보인다.
 *
 * 종전: 겸용 엔진은 단건과 같은 leaf(`resolveArticle89Clause2`)로 §89②를 판정해 예외가 성립하면(2026-11-23 계측 — `exception_met` ·
 *   「소득세법 시행령 §156의2 ③」) 주택분 비과세를 유지했지만, 결과의 「근거:」 줄은 「1세대1주택」뿐이고 결과 어디에도 §156의2가 없었다.
 *   같은 사실의 단건 주택 결과는 #3599부터 §89② 예외 줄을 그린다.
 *
 * | # | 사안 | 주장 |
 * |---|---|---|
 * | MX-1 | 겸용 10억 + 승계 입주권(양도 전 3년 이내 취득 · §156의2③) | 주택분 비과세 · echo §156의2 ③ · 「근거:」 줄 아래 §89② 예외 줄 |
 * | MX-2 | 같은 사실 15억(12억 초과 안분) | 같은 echo · 같은 줄 |
 * | MX-3 | 짝 — 입주권 3년 초과 + 예외 없음 선언 → §89② 배제(과세) | echo 없음 · 줄 없음 |
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const LABEL = "주택과 조합원입주권·분양권을 함께 보유한 세대의 §89② 예외";
const THREE = { label: LABEL, legalBasis: ["소득세법 시행령 §156의2 ③"] };
const ACQ = "2019-02-01";
const TRANSFER = "2023-03-20";
/** `mixed-use-one-house-proviso-notice.anchor.test.tsx`의 겸용 시료(강남 · 거주 충족). */
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};

function mixed(o: { price?: string; rightAcq: string; f?: object }) {
  return redevAptForm({
    kind: "housing", price: o.price ?? "1000000000", count: "1", houses: [],
    assetOver: { ...MIXED, acquisitionDate: ACQ, regionCode: "1168010100", residencePeriods: [{ moveInDate: ACQ, moveOutDate: TRANSFER }] },
    formOver: {
      transferDate: TRANSFER,
      filingDate: "2023-12-31",
      presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: o.rightAcq, region: "capital", memberOrigin: "successor" }],
      householdNoPresaleRightsConfirmed: false,
      ...(o.f ?? {}),
    } as never,
  });
}

async function calc(f: ReturnType<typeof mixed>) {
  expect(allIssues(f)).toEqual([]);
  const r = await runCalc(f);
  expect(r.status, JSON.stringify(r.json).slice(0, 400)).toBe(200);
  const b = r.result as MixedUseGainBreakdown;
  expect(b.housingPart, "겸용 경로를 탔다").toBeDefined();
  const c = render(<MixedUseResultCard breakdown={b} formData={f} />).container;
  return { b, line: c.querySelector('[data-testid="calc-89-2-exception-basis"]')?.textContent ?? null, basisRow: c.querySelector('[data-testid="mixed-use-exempt-basis"]')?.textContent ?? null };
}

describe("겸용주택 결과 — §89② 예외 근거 표시", () => {
  it("MX-1 겸용 10억 + 승계 입주권 3년 이내 → 비과세 · 「근거:」 줄 아래 §156의2 ③", async () => {
    const { b, line, basisRow } = await calc(mixed({ rightAcq: "2021-06-01" }));
    expect(b.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    expect(b.housingPart.isExempt).toBe(true);
    expect(b.housingPart.exemptBasis).toBe("1세대1주택");
    expect(b.housingPart.article89ExceptionApplied).toEqual(THREE);
    expect(basisRow).toBe("근거: 1세대1주택");
    expect(line).toContain(LABEL);
    expect(line).toContain("§156의2");
  });

  it("MX-2 같은 사실 15억(12억 초과 안분) → 같은 줄", async () => {
    const { b, line } = await calc(mixed({ price: "1500000000", rightAcq: "2021-06-01" }));
    expect(b.calculationRoute.highValueRule).not.toBe("below_threshold_exempt");
    expect(b.calculationRoute.highValueRule).not.toBe("non_one_house_full_taxation");
    expect(b.housingPart.article89ExceptionApplied).toEqual(THREE);
    expect(line).toContain(LABEL);
  });

  it("MX-3 짝 — 입주권 3년 초과 + 예외 없음 선언(§89② 배제 · 과세) → echo·줄 없음", async () => {
    const { b, line } = await calc(mixed({ rightAcq: "2019-06-01", f: { rightThreeYearExceptionKind: "none" } }));
    expect(b.calculationRoute.highValueRule).toBe("non_one_house_full_taxation");
    expect(b.housingPart.article89ExceptionApplied).toBeUndefined();
    expect(line).toBeNull();
  });
});
