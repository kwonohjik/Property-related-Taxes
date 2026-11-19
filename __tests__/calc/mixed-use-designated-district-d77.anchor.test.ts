/**
 * D-77 anchor — 겸용주택 §154① 판정 입력도 「지정 지구 안인가」 선언을 읽는다(결정 #57 구현 누락).
 *
 * 겸용 판정 입력(`transfer-tax-mixed-use-exemption.ts` `exemptionReqInput`)에 `regionCode`만 있고 선언이 없어,
 * 지구 한정 동에서 「지구 밖」으로 답해도 「취득 당시 조정대상지역 해당」(지정·medium)으로 거주요건이 걸렸다.
 * 일반 주택은 같은 선언으로 거주요건이 없다. 차이는 선언 축 하나다 — 겸용 결론이 일반 주택 결론과 같아야 한다.
 *
 * 시료 — 삼송동(4128111100)은 고양시 삼송택지 지구 한정 지정 동(2019.11.8.~2020.6.18.). 2020-01-10 취득 · 거주 0 ·
 * 2024-06-03 10억 양도. 계산기 화면 경로(폼 → ④ → ⑫ → route ⑭ → 엔진).
 *
 * | 축 | 지구 밖 | 지구 안 | 미선언 |
 * |---|---|---|---|
 * | §154① 1주택 | 비과세 | 과세(거주 0) | 과세(지정 + 확인 필요) |
 * | §155① 종전 삼송 + 신규 경남 | 비과세 | 과세(종전 주택 거주 0) | 과세 |
 * | 대조 — 경남(미지정) | 비과세 | — | 비과세 |
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const SAMSONG = "4128111100";
const NR = "4682025021";

/** 겸용주택 — 주택 연면적 100 · 주택 외 60(주택 > 주택 외) */
const MIXED = {
  isMixedUseHouse: true,
  residentialFloorArea: "100",
  nonResidentialFloorArea: "60",
  mixedUseTotalLandArea: "200",
  buildingFootprintArea: "100",
  mixedTransferHousingPrice: "600000000",
  mixedTransferLandPricePerSqm: "5000000",
  mixedTransferCommercialBuildingPrice: "100000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqLandPricePerSqm: "2500000",
  mixedAcqCommercialBuildingPrice: "50000000",
  mixedAcqHousingBuildingStdPrice: "50000000",
  mixedTransferHousingBuildingStdPrice: "100000000",
  mixedIsMetropolitanArea: true,
};

type Kind = "mixed" | "housing";
type District = boolean | undefined;

function form(k: Kind, regionCode: string, district: District, withNewHouse = false) {
  const houses = withNewHouse
    ? [houseRow("n1", "2023-06-01", { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" } as never)]
    : [];
  return redevAptForm({
    kind: "housing",
    price: "1000000000",
    houses,
    count: String(1 + houses.length),
    assetOver: {
      ...(k === "mixed" ? MIXED : {}),
      acquisitionDate: "2020-01-10",
      regionCode,
      regionInDesignatedDistrict: district,
      residencePeriods: [],
    },
    formOver: { transferDate: "2024-06-03", filingDate: "2024-07-31" } as never,
  });
}

async function verdict(k: Kind, regionCode: string, district: District, withNewHouse = false) {
  const r = await runCalc(form(k, regionCode, district, withNewHouse));
  expect(r.status, JSON.stringify(r.result ?? r).slice(0, 300)).toBe(200);
  return (k === "mixed" ? r.result.housingPart.isExempt : r.result.isExempt) as boolean;
}

const CELLS: [string, District][] = [["지구 밖", false], ["지구 안", true], ["미선언", undefined]];

describe("D-77 §154① 1주택 — 겸용 결론이 일반 주택과 같다", () => {
  for (const [label, d] of CELLS) {
    it(`삼송동 ${label}`, async () => {
      const [housing, mixed] = [await verdict("housing", SAMSONG, d), await verdict("mixed", SAMSONG, d)];
      expect(housing).toBe(d === false);
      expect(mixed).toBe(housing);
    });
  }

  it("대조 — 경남(미지정)은 선언과 무관하게 둘 다 비과세", async () => {
    for (const d of [false, undefined] as District[]) {
      expect(await verdict("housing", NR, d)).toBe(true);
      expect(await verdict("mixed", NR, d)).toBe(true);
    }
  });
});

describe("D-77 §155① 일시적 2주택(종전 삼송 + 신규 경남) — 겸용 결론이 일반 주택과 같다", () => {
  for (const [label, d] of CELLS) {
    it(`종전 주택 ${label}`, async () => {
      const [housing, mixed] = [await verdict("housing", SAMSONG, d, true), await verdict("mixed", SAMSONG, d, true)];
      expect(housing).toBe(d === false);
      expect(mixed).toBe(housing);
    });
  }
});
