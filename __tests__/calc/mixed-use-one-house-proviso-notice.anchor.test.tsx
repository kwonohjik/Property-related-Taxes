/**
 * anchor — 겸용주택 1주택 · §154① 단서 근거 고지 + 삭제 전 4호 미선택 안내
 * (`docs/00-pm/mixed-use-one-house-proviso-notice.plan.md` · Q-1 b · Q-2 a · Q-3 a 사용자 결정 2026-11-15).
 *
 * 일반 주택은 `exemptReason`에 단서·근거를 적고(1주택) 거주 미달 과세면 4호 미선택 안내를 낸다. 겸용 결과에는
 * `exemptReason` 칸이 없어 둘 다 0건이었다(실측 · mock). 세액은 바뀌지 않는다 — 문장만.
 *
 * | # | 주장 |
 * |---|---|
 * | MP-1 | 1주택 + 4호 완비 → 주택분 비과세 · 근거 문장(4호 + 부칙 제38조②) |
 * | MP-2 | 1주택 + 5호 → 근거 문장(5호) — 단서 전 사유(Q-1 b) |
 * | MP-3 | 거주 충족이면 단서가 결론을 가르지 않아 문장 없음 |
 * | MP-4 | 일시적 2주택 + 4호 → 1321 고지만(근거 문장 중복 없음 · Q-2 a) |
 * | MP-5 | 1주택 · 단서 미선택 · 거주 미달 → 4호 미선택 안내(일반 경로와 같은 문장) |
 * | MP-6 | 거주 충족 · 4호 선택 후 제외 · 일시적 2주택(남은 한계 G-5)이면 미선택 안내 없음 |
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, houseRow, allIssues } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GANGNAM = "1168010100";
const NC = "4682025021";
const ACQ = "2019-02-01";
const TRANSFER = "2023-03-20";
const MIXED = {
  isMixedUseHouse: true, residentialFloorArea: "100", nonResidentialFloorArea: "60", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000", mixedTransferLandPricePerSqm: "5000000", mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000", mixedAcqLandPricePerSqm: "2500000", mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000", mixedTransferHousingBuildingStdPrice: "100000000", mixedIsMetropolitanArea: true,
};
const R4 = {
  provisoReason: "rental_registration_4ho",
  proviso4hoBusinessRegDate: "2019-03-01",
  proviso4hoRentalRegDate: "2019-03-01",
  proviso4hoRegulatedOneHouse: "yes",
  proviso4hoStatus: "auto_cancelled",
};
const R5 = { provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true };
const LIVED = [{ moveInDate: ACQ, moveOutDate: TRANSFER }];
const TEMP_HOUSES = [houseRow("b", "2022-03-01", { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" } as never)];

function mixed(o: { f?: object; residencePeriods?: object[]; houses?: typeof TEMP_HOUSES } = {}) {
  const houses = o.houses ?? [];
  return redevAptForm({
    kind: "housing", price: "1000000000", count: String(houses.length + 1), houses,
    assetOver: { ...MIXED, acquisitionDate: ACQ, regionCode: GANGNAM, residencePeriods: o.residencePeriods ?? [] },
    formOver: { transferDate: TRANSFER, filingDate: "2023-12-31", ...(o.f ?? {}) } as never,
  });
}
async function calc(f: ReturnType<typeof mixed>) {
  expect(allIssues(f)).toEqual([]);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  return r.result as { housingPart: { isExempt: boolean }; warnings: string[] };
}
const basisLine = (w: string[]) => w.find((x) => x.startsWith("겸용주택 주택분은 「§154① 단서"));
const UNSELECTED = "§154① 단서에서 「4호 임대사업자 등록」을 선택하고 등록 사실을 입력하세요";

describe("적용 근거 — 1주택", () => {
  it("MP-1 4호 완비 → 비과세 · 4호 + 부칙 제38조② 근거", async () => {
    const r = await calc(mixed({ f: R4 }));
    expect(r.housingPart.isExempt).toBe(true);
    expect(basisLine(r.warnings)).toBe(
      "겸용주택 주택분은 「§154① 단서 4호 임대사업자 등록」에 따라 1세대1주택 비과세 보유·거주요건을 충족했습니다 — " +
        "소득세법 시행령 §154 ① 4호(2020.2.11. 삭제 전) · 대통령령 제30395호 부칙 제38조 ②",
    );
  });
  it("MP-2 5호 → 5호 근거(단서 전 사유)", async () => {
    const r = await calc(mixed({ f: R5 }));
    expect(r.housingPart.isExempt).toBe(true);
    expect(basisLine(r.warnings)).toContain("「§154① 단서 5호 공고전계약」");
  });
  it("MP-3 거주 충족이면 단서가 결론을 가르지 않아 문장 없음", async () => {
    const r = await calc(mixed({ f: R4, residencePeriods: LIVED }));
    expect(r.housingPart.isExempt).toBe(true);
    expect(basisLine(r.warnings)).toBeUndefined();
  });
  it("MP-4 일시적 2주택 + 4호 → 1321 고지만 · 근거 문장 중복 없음", async () => {
    const r = await calc(mixed({ f: R4, houses: TEMP_HOUSES }));
    expect(r.housingPart.isExempt).toBe(true);
    expect(r.warnings.join("\n")).toContain("부동산납세과-1321");
    expect(basisLine(r.warnings)).toBeUndefined();
  });
});

describe("4호 미선택 안내 — 1주택", () => {
  it("MP-5 단서 미선택 · 거주 미달 → 과세 · 일반 경로와 같은 안내", async () => {
    const r = await calc(mixed());
    expect(r.housingPart.isExempt).toBe(false);
    const line = r.warnings.find((w) => w.includes(UNSELECTED));
    expect(line).toBeDefined();
    expect(line).not.toContain("판정 메뉴의");
    expect(line).toContain("대통령령 제30395호 부칙 제38조");
  });
  it.each([
    ["거주 충족(비과세)", { residencePeriods: LIVED }],
    ["4호 선택 후 제외(신청 당시 「아니오」)", { f: { ...R4, proviso4hoRegulatedOneHouse: "no" } }],
    ["일시적 2주택 — 남은 한계 G-5", { houses: TEMP_HOUSES }],
  ])("MP-6 %s → 안내 없음", async (_n, o) => {
    const r = await calc(mixed(o as never));
    expect(r.warnings.some((w) => w.includes(UNSELECTED))).toBe(false);
  });
});
