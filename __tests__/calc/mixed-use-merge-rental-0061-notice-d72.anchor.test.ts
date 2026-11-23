/**
 * D-72 후속 anchor (2026-11 리뷰 · 사용자 결정 Q-22 (b)) — 겸용주택 경로의 0061 합가 상대 쪽 임대 고지 문형.
 *
 * 종전: 단건 주택 경로는 #3555부터 판정 결과의 적용 특례 id로 고지 문형을 고른다(합가 의제로 비과세면 「§155④를 적용했습니다」,
 *   조특법 §99의4 등으로 남은 주택이 양도 주택뿐이면 「합가 의제 없이 1세대1주택으로 판정했습니다」). 겸용 엔진은 판정 **전에**
 *   (`resolveMixedUseRentalResidence`) 고지를 만들어 근거가 「1세대1주택」인데도 「§155④를 적용했습니다」였다(2026-11-23 실측 —
 *   단건 계산기 · 함께 양도 묶음 둘 다. 묶음은 파트 카드 고지 「합가 의제 없이」와 겸용 고지 「§155④ 적용」이 함께 떴다).
 *
 * 시료: `merge-rental-0061-guard-d72.anchor.test.ts`와 같은 E0061 변형(상대 쪽 행 x = 2012-05-01 §99의4 농어촌주택)을 겸용주택으로.
 *
 * | # | 사안 | 주장 |
 * |---|---|---|
 * | MG-1 | 2005 매매(VI) · §99의4 | 겸용 근거 「1세대1주택」 · 고지 「합가 의제 없이」 · 단건 주택 경로 고지와 같은 문장 |
 * | MG-2 | 동일세대 상속(I) · §99의4 | 같음 |
 * | MC-1 | 별도세대 상속(II) · 선언 없음(III) | 근거 「동거봉양 합가 (§155④)」 · 고지 「§155④를 적용했습니다」 · 단건과 같은 문장(대조) |
 * | MB-1 | 함께 양도 묶음(겸용 + 나대지) VI·I | 0061 고지가 모두 「합가 의제 없이」 — 「§155④ 적용」 문장이 없다 |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, withToday } from "./_one-house-pr6a-routes";
import { runCalc, allIssues } from "./_helpers/redev-one-house-route";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

const E = JSON.parse(readFileSync("__tests__/calc/one-house-rulings/cases/E0061.json", "utf8"));
const E0061 = (Array.isArray(E) ? E[0] : E) as RulingCase;
const RURAL = {
  type: "new_99_4_rural", ruralHouseAcquisitionDate: "", ruralHouseStdPrice: "100000000", isRegisteredHanok: false,
  adjacentArea994: "no", meetsLocationRequirement: true, ruralLandAreaSqm994: "330", ruralHouseType994: "other", ruralHouseAreaSqm994: "99",
};
/** `mixed-use-89-2-exception-display.anchor.test.tsx`의 겸용 면적·기준시가 시료 */
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
const RULING = "기준-2024-법규재산-0061";
const APPLIED = "§155④를 적용했습니다";
const NO_MERGE = "합가 의제 없이 1세대1주택으로 판정했습니다";

type Shape = { inh: "same" | "sep" | "none"; rural?: boolean };
const sample = (o: Shape): RulingCase => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 평가셋 폼을 깊이 복제해 칸만 바꾼다
  const c: any = JSON.parse(JSON.stringify(E0061));
  const a = c.form.asset;
  if (o.inh === "none") a.acquisitionDate = "2005-03-01";
  else {
    Object.assign(a, { acquisitionDate: "2018-09-01", acquisitionCause: "inheritance", decedentAcquisitionDate: "2005-03-01" });
    a.decedentSameHouseholdBeforeInheritance = o.inh === "same";
    if (o.inh === "same") a.decedentCohabitationHoldingStartDate = "2005-03-01";
  }
  c.form.houses = [
    {
      id: "x", region: "non_capital", acquisitionDate: "2012-05-01", mergeOrigin: "counterpart_side", officialPrice: "100000000",
      ...(o.rural === false ? {} : { countExclusion: { kind: "reduction", reduction: { ...RURAL } } }),
    },
  ];
  return c;
};

/** 판정 메뉴 → 계산기 넘기기 폼. `mixed`면 주 자산을 겸용주택으로, `bundle`이면 나대지를 함께 양도한다. */
async function calc(o: Shape, mode: "housing" | "mixed" | "bundle") {
  let out: Awaited<ReturnType<typeof runCalc>> | undefined;
  await withToday(E0061.today, async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 폼 칸을 직접 바꾼다
    const f: any = handoff(buildCaseForm(sample(o)));
    if (mode !== "housing") {
      f.assets[0] = {
        ...f.assets[0], ...MIXED, addressJibun: "경상북도 구미시 송정동 1",
        ...(o.inh === "none" ? { fixedAcquisitionPrice: "300000000" } : {}), // 겸용 매매 실거래가 안분은 취득가액 총액이 필요하다
      };
    }
    if (mode === "bundle") {
      f.assets[0].actualSalePrice = f.contractTotalPrice;
      f.assets[1] = {
        ...f.assets[0], assetId: "land2", assetKind: "land", isMixedUseHouse: false, acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
        fixedAcquisitionPrice: "100000000", actualSalePrice: "300000000", addressJibun: "경상북도 구미시 송정동 9", landArea: "300", landNature: "standalone",
      };
      Object.assign(f, { contractTotalPrice: String(Number(f.contractTotalPrice) + 300_000_000), assetSplitMode: "companion", bundledSaleMode: "actual" });
    }
    if (mode !== "housing") expect(allIssues(f as TransferFormData)).toEqual([]);
    out = await runCalc(f as TransferFormData);
  });
  expect(out!.status, JSON.stringify(out!.json).slice(0, 300)).toBe(200);
  const res = out!.result ?? {};
  const warnings: string[] = res.warnings ?? out!.json?.data?.aggregated?.warnings ?? [];
  const notices = warnings.filter((w) => w.includes(RULING));
  return { res, notices, json: out!.json };
}

describe("D-72 후속 — 겸용주택 0061 고지 문형이 실제 근거를 따른다", () => {
  it.each([
    ["MG-1 2005 매매(VI)", { inh: "none" } as Shape],
    ["MG-2 동일세대 상속(I)", { inh: "same" } as Shape],
  ])("%s · §99의4 → 근거 「1세대1주택」 · 고지 「합가 의제 없이」 · 단건 주택 경로와 같은 문장", async (_l, o) => {
    const m = await calc(o, "mixed");
    expect(m.res.housingPart.isExempt).toBe(true);
    expect(m.res.housingPart.exemptBasis).toBe("1세대1주택");
    expect(m.notices).toHaveLength(1);
    expect(m.notices[0]).toContain(NO_MERGE);
    expect(m.notices[0]).not.toContain(APPLIED);
    const h = await calc(o, "housing");
    expect(h.res.exemptReason).toBe("1세대1주택 비과세");
    expect(m.notices).toEqual(h.notices);
  });

  it.each([
    ["II 별도세대 상속 · §99의4", { inh: "sep" } as Shape],
    ["III 동일세대 상속 · §99의4 선언 없음", { inh: "same", rural: false } as Shape],
  ])("MC-1 대조 %s → 근거 「동거봉양 합가 (§155④)」 · 고지 「§155④를 적용했습니다」 · 단건과 같은 문장", async (_l, o) => {
    const m = await calc(o, "mixed");
    expect(m.res.housingPart.isExempt).toBe(true);
    expect(m.res.housingPart.exemptBasis).toBe("동거봉양 합가 (§155④)");
    expect(m.notices).toHaveLength(1);
    expect(m.notices[0]).toContain(APPLIED);
    expect(m.notices).toEqual((await calc(o, "housing")).notices);
  });

  it.each([
    ["VI", { inh: "none" } as Shape],
    ["I", { inh: "same" } as Shape],
  ])("MB-1 함께 양도 묶음(겸용 + 나대지) %s → 0061 고지가 모두 「합가 의제 없이」", async (_l, o) => {
    const b = await calc(o, "bundle");
    expect(b.json.data.mode).toBe("bundled");
    expect(b.notices.length).toBeGreaterThan(0);
    for (const n of b.notices) {
      expect(n).toContain(NO_MERGE);
      expect(n).not.toContain(APPLIED);
    }
  });
});
