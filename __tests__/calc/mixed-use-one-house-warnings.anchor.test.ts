/**
 * anchor — 겸용주택도 「선언했으나 적용되지 않은 특례」 사유를 일반 주택과 같은 문장으로 낸다
 * (`docs/00-pm/mixed-use-one-house-warning-parity.plan.md` D-1·D-2 · Q-1 (a)).
 *
 * 겸용은 자체 판정이라 정본 `unmetExceptions`가 없다. 결론(과세)은 같은 술어로 맞았지만 이유가 결과에 없었다.
 *
 * | # | 주장 |
 * |---|---|
 * | MW-1 | 계산기 화면 · 삭제 전 §154①4호 미충족(등록 신청 2019-12-17) — ⑧ 통과 · 일반 주택과 같은 4호 문장 1건 |
 * | MW-2 | 옛 저장 이력(직접 선언) · §155① 신규 주택 먼저 취득 + 3호 — 일반 주택과 같은 순서 사유 1건 |
 * | MW-3 | 같은 날 취득 — 「확인 필요」 사유 |
 * | MW-4 | 짝 — 정순 + 3호 비과세 · 4호 충족 비과세 — 사유 없음 |
 * | MW-5 | 다른 주택이 2채(주택 수 3) — 일반 주택과 같다. 주택 수 2 이상이면 ④가 §154① 단서를 싣지 않아(`provisoGate`) 두 경로 모두 4호 사유가 없다 |
 * | MW-6 | 4호는 미충족이지만 거주 3년으로 비과세 — 사유를 내지 않는다(일반 주택과 같음 · 결론을 가를 때만) |
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

const GANGNAM = "1168010100";
const NR = "4682025021";
const RENTAL_4HO_TEXT = /삭제 전 §154①4호 .*을 적용하지 않았습니다 — .*2019년 12월 16일 뒤/;
const ORDER_TEXT = /먼저 취득했습니다 — 양도하는 주택이 나중에 취득한 주택이라 일시적 2주택\(.*§155①\)이 적용되지 않습니다/;
const SAME_DAY_TEXT = /같은 날.*확인 필요/;

/** 겸용주택 — 주택 연면적 100 · 주택 외 60 · 지방(배율) */
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
const RENTAL_4HO = (date: string) => ({
  provisoReason: "rental_registration_4ho",
  proviso4hoBusinessRegDate: date,
  proviso4hoRentalRegDate: date,
  proviso4hoRegulatedOneHouse: "yes",
  proviso4hoStatus: "maintained",
  proviso4hoDuringMandatory: "no",
  proviso4hoRentOver5: "no",
});
const other = (id: string, acq: string) =>
  houseRow(id, acq, { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" } as never);

type Kind = "mixed" | "housing";
const warningsOf = (r: Awaited<ReturnType<typeof runCalc>>) => (r.result?.warnings ?? []) as string[];
const exemptOf = (k: Kind, r: Awaited<ReturnType<typeof runCalc>>) => (k === "mixed" ? r.result.housingPart.isExempt : r.result.isExempt) as boolean;
const pick = (ws: string[], re: RegExp) => ws.filter((w) => re.test(w));

/** 강남 2018-06-01 취득(조정) · 거주 0 · 2026-06-01 양도 · 4호 선언 */
function rental4ho(k: Kind, date: string, houses: ReturnType<typeof other>[] = [], residencePeriods: { moveInDate: string; moveOutDate: string }[] = []) {
  return redevAptForm({
    kind: "housing",
    price: "1000000000",
    houses,
    count: String(1 + houses.length),
    assetOver: { ...(k === "mixed" ? MIXED : {}), acquisitionDate: "2018-06-01", regionCode: GANGNAM, residencePeriods },
    formOver: { transferDate: "2026-06-01", filingDate: "2026-07-31", wasRegulatedAtAcquisition: true, isRegulatedArea: true, ...RENTAL_4HO(date) } as never,
  });
}
/** 경남 2024-03-01 취득 · 거주 2024-03-01~2025-12-31 · 2026-01-01 양도 · 옛 저장 이력(직접 선언) + 3호 */
function legacyTemp(k: Kind, newHouse: string) {
  return redevAptForm({
    kind: "housing",
    price: "1000000000",
    count: "2",
    houses: [other("n1", newHouse)],
    assetOver: { ...(k === "mixed" ? MIXED : {}), acquisitionDate: "2024-03-01", regionCode: NR, residencePeriods: [{ moveInDate: "2024-03-01", moveOutDate: "2025-12-31" }] },
    formOver: { transferDate: "2026-01-01", filingDate: "2026-02-28", temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: newHouse, provisoReason: "unavoidable" } as never,
  });
}

describe("겸용주택 — 미충족 특례 사유", () => {
  it("MW-1 계산기 화면 · 4호 미충족 — ⑧ 통과 · 일반 주택과 같은 문장 1건", async () => {
    const mixed = await runCalc(rental4ho("mixed", "2019-12-17"));
    expect(mixed.issues).toEqual([]);
    expect(mixed.body.mixedUse).toBeDefined();
    expect(exemptOf("mixed", mixed)).toBe(false);
    expect(pick(warningsOf(mixed), RENTAL_4HO_TEXT)).toHaveLength(1);
    const housing = await runCalc(rental4ho("housing", "2019-12-17"));
    expect(pick(warningsOf(mixed), RENTAL_4HO_TEXT)).toEqual(pick(warningsOf(housing), RENTAL_4HO_TEXT));
  });

  it("MW-2 옛 저장 이력 · 신규 주택 먼저 취득 + 3호 — 일반 주택과 같은 순서 사유 1건", async () => {
    const mixed = await runCalc(legacyTemp("mixed", "2023-12-01"));
    expect(mixed.issues).toEqual([]);
    expect(mixed.body.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: "2024-03-01", newAcquisitionDate: "2023-12-01" });
    expect(exemptOf("mixed", mixed)).toBe(false);
    expect(pick(warningsOf(mixed), ORDER_TEXT)).toHaveLength(1);
    const housing = await runCalc(legacyTemp("housing", "2023-12-01"));
    expect(pick(warningsOf(mixed), ORDER_TEXT)).toEqual(pick(warningsOf(housing), ORDER_TEXT));
  });

  it("MW-3 같은 날 취득 — 확인 필요 사유", async () => {
    const mixed = await runCalc(legacyTemp("mixed", "2024-03-01"));
    expect(exemptOf("mixed", mixed)).toBe(false);
    expect(pick(warningsOf(mixed), SAME_DAY_TEXT)).toHaveLength(1);
  });

  it("MW-4 짝 — 정순 + 3호 · 4호 충족이면 비과세 · 사유 없음", async () => {
    const fwd = await runCalc(legacyTemp("mixed", "2024-08-01"));
    expect(exemptOf("mixed", fwd)).toBe(true);
    expect(pick(warningsOf(fwd), ORDER_TEXT)).toEqual([]);
    const ok = await runCalc(rental4ho("mixed", "2019-12-16"));
    expect(exemptOf("mixed", ok)).toBe(true);
    expect(pick(warningsOf(ok), /삭제 전 §154①4호/)).toEqual([]);
  });

  it("MW-5 주택 수 3 — 일반 주택과 같다(④가 단서를 싣지 않아 둘 다 사유 없음)", async () => {
    const houses = [other("n1", "2010-01-01"), other("n2", "2011-01-01")];
    const mixed = await runCalc(rental4ho("mixed", "2019-12-17", houses));
    const housing = await runCalc(rental4ho("housing", "2019-12-17", houses));
    expect(exemptOf("mixed", mixed)).toBe(false);
    expect(exemptOf("housing", housing)).toBe(false);
    expect(mixed.body.oneHouseExemptionProviso).toBeUndefined();
    expect(pick(warningsOf(mixed), RENTAL_4HO_TEXT)).toEqual(pick(warningsOf(housing), RENTAL_4HO_TEXT));
  });

  it("MW-6 4호 미충족 · 거주 3년으로 비과세 — 사유 없음(일반 주택과 같음)", async () => {
    const lived = [{ moveInDate: "2018-06-01", moveOutDate: "2021-06-01" }];
    const mixed = await runCalc(rental4ho("mixed", "2019-12-17", [], lived));
    const housing = await runCalc(rental4ho("housing", "2019-12-17", [], lived));
    expect(exemptOf("mixed", mixed)).toBe(true);
    expect(exemptOf("housing", housing)).toBe(true);
    expect(pick(warningsOf(mixed), /삭제 전 §154①4호/)).toEqual([]);
    expect(pick(warningsOf(housing), /삭제 전 §154①4호/)).toEqual([]);
  });
});
