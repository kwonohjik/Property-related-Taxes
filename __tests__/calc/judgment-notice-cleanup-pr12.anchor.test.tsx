/**
 * PR-12 anchor (2026-11 리뷰 · 판정 고지 정리) — 결론을 가르지 않는 고지·사실이 아닌 안내를 거둔다(#32).
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-37 | 비과세 회수 뒤 「비과세 전제」 고지(#43·#44 3종 · 원조합원 `89-2-open:*`)가 남음 | 회수 필터가 거른다 · 일반 89-2-open은 남는다 |
 * | D-38 | 비거주자 강제 과세에 「답을 고르면 다시 판정합니다」 고지 3종이 남음 | 강제 과세 경로가 거른다 · 2010 전(판정 보류)은 그대로 |
 * | D-60 | ⑳ 성립 + 비거주자 과세에 ⑳ 카드 「요건 충족」·㉒ 추징 안내 | 「요건은 충족했으나 적용하지 않습니다」 · ㉒ 안내 없음 |
 * | D-68 | J-3 짝 1년 고지가 타이밍만 비교 — 4주택으로 어차피 과세여도 「결론이 달라집니다」 | 본체 판정 결론이 갈릴 때만 |
 * | D-69 | 재상속 기준일 고지가 과세 판정에도 | `one-house-subtree-inherited-echo-s07-11` 짝(이 파일 밖) |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { revokeOneHouseExemption } from "@/lib/tax-engine/one-house/revoke-exemption";
import { applyNonResidentVerdict } from "@/lib/tax-engine/one-house/non-resident";
import { NEW_HOUSE_ORIGIN_UNCONFIRMED_ID, NEW_HOUSE_PRESALE_HOLDING_ID } from "@/lib/tax-engine/one-house/new-house-origin";
import { RURAL_FARM_FACTS_UNCONFIRMED_ID, RURAL_FARMLAND_990_ERA_ID } from "@/lib/tax-engine/one-house/rural-return-to-farm-facts";
import { POP_DECLINE_71_2_UNCONFIRMED_ID } from "@/lib/tax-engine/transfer-reductions/population-decline-71-2";
import { RENTAL_NOT_APPLIED_TAXABLE_REASON } from "@/lib/tax-engine/one-house/rental-housing-verdict";
import { mkCase, observeRaw } from "./_one-house-pr3a-judge-route";
import { judgeAndRender } from "./_one-house-pr12a-judge-view";
import type { OneHouseJudgment } from "@/lib/tax-engine/one-house/types";
import type { RulingCase } from "./one-house-rulings/harness";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date as Date) as Awaited<ReturnType<typeof preloadTaxRates>>);
});

const D = (s: string) => new Date(s);
const withUndetermined = (ids: string[], exempt = true) =>
  ({
    isExempt: exempt, isPartialExempt: false, appliedExceptions: [], unmetExceptions: [], pending: [], legalBasis: [],
    undetermined: ids.map((id) => ({ id, reason: id })),
  }) as unknown as OneHouseJudgment;
const ORIGINAL_OPEN = "89-2-open:소득세법 시행령 §156의2⑦(원조합원 입주권 — 2주택 축 준용)";
const GENERAL_OPEN = "89-2-open:소득세법 시행령 §156의2⑤";

describe("D-37 비과세 회수 필터", () => {
  it("#43·#44 비과세 전제 고지·89-2-open(원조합원·일반 모두 — I-26)·89-2-reading(I-26 표 확장)은 거르고 다른 고지는 남긴다", () => {
    const j = revokeOneHouseExemption(
      withUndetermined([NEW_HOUSE_PRESALE_HOLDING_ID, RURAL_FARMLAND_990_ERA_ID, ORIGINAL_OPEN, GENERAL_OPEN, "89-2-reading:0", "other-notice"]),
    );
    expect(j.undetermined.map((u) => u.id)).toEqual(["other-notice"]);
  });
});

describe("D-38 비거주자 강제 과세", () => {
  const nonResident = (t: string) =>
    ({ transferorNonResidentAtTransfer: true, transferDate: D(t), acquisitionDate: D("2015-03-15") }) as never;
  const ids = [NEW_HOUSE_ORIGIN_UNCONFIRMED_ID, RURAL_FARM_FACTS_UNCONFIRMED_ID, POP_DECLINE_71_2_UNCONFIRMED_ID, "other-notice"];
  it("2010 이후 — 「모름」 반사실 고지 3종을 거르고 과세 · 다른 고지는 남긴다", () => {
    const j = applyNonResidentVerdict(withUndetermined(ids, false), nonResident("2018-06-19"), false);
    expect(j.isExempt).toBe(false);
    expect(j.undetermined.map((u) => u.id)).toEqual(["other-notice"]);
  });
  it("짝 — 2010 전 양도(거주자 기준 판정 보류)는 그대로 둔다", () => {
    const j = applyNonResidentVerdict(withUndetermined(ids, false), nonResident("2009-12-31"), false);
    expect(j.undetermined.map((u) => u.id)).toEqual(expect.arrayContaining(ids));
  });
});

describe("D-60 ⑳ 성립 + 비거주자 과세", () => {
  const rentalCase = (top: object = {}): RulingCase =>
    ({
      id: "rm", docNo: "", docDate: "", basis: "era", today: "2024-06-02", summary: "",
      form: {
        isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "1000000000",
        houses: [{ id: "r1", region: "capital", acquisitionDate: "2007-01-01", officialPrice: "250000000", isLongTermRental: true, isApartment: false, acquisitionOrigin: "general" }],
        ...top,
        asset: {
          assetKind: "housing", acquisitionDate: "2008-01-01", fixedAcquisitionPrice: "500000000", addressJibun: "서울특별시 종로구 청운동 1",
          residenceInputMode: "direct", residencePeriodMonthsAsset: "60",
          rentalHousingException: {
            applyException: true, scenario: "A", priorRentalExemptionHistory: "none",
            rentalUnits: [{
              unitId: "b", businessRegistrationDate: "2023-02-01", rentalRegistrationDate: "2023-02-01", rentalRegisteredDate: "2023-02-01",
              rentalCategory: "long_general", rentalAcquisitionType: "purchase", isApartment: false, region: "seoul-metro",
              standardPriceAtRentalStart: "250000000", acquisitionOfficialPrice: "250000000", isNationalSizeHousing: true,
              hasMinimum2Units: true, rentalMonths: "16", requirementsConfirmed: true,
            }],
          },
        },
      },
    }) as never;
  it("거주자 짝 — 비과세 · 「요건 충족」 · ㉒ 안내(㉑ 통과 호)", async () => {
    const v = await judgeAndRender(rentalCase());
    expect(v.isExempt).toBe(true);
    expect(v.text).toContain("요건 충족");
    expect(v.text).toContain("§155㉒");
  });
  it("비거주자 — 과세 · 「요건은 충족했으나 적용하지 않습니다」 · ㉒ 추징 안내 없음", async () => {
    const v = await judgeAndRender(rentalCase({ transferorNonResident: true }));
    expect(v.isExempt).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((v.data as any).rentalHousingException).toMatchObject({ passed: true, periodPendingUnitIndexes: [], notAppliedReason: RENTAL_NOT_APPLIED_TAXABLE_REASON });
    expect(v.text).toContain("요건은 충족했으나 적용하지 않습니다");
    expect(v.text).not.toContain("§155㉒에 따라 차액을");
  });
});

describe("D-68 J-3 짝 1년 고지 — 본체 결론이 갈릴 때만", () => {
  const NOTICE = "155-1-roster-pair-one-year-waiver-unverified";
  const d8 = (extraHouses: object[] = []) =>
    mkCase("2025-03-20", {
      isOneHousehold: true, transferDate: "2025-03-19", contractTotalPrice: "800000000", marriageDate: "2022-11-23", isFirstTransferredInMerge: true,
      provisoReason: "unavoidable",
      asset: { assetKind: "housing", acquisitionDate: "2018-02-22", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
      houses: [
        { id: "b", region: "non_capital", acquisitionDate: "2021-06-01", mergeOrigin: "counterpart_side", acquisitionOrigin: "general" },
        { id: "c", region: "non_capital", acquisitionDate: "2022-04-19", mergeOrigin: "counterpart_side", acquisitionOrigin: "general" },
        ...extraHouses,
      ],
    });
  const ids = (r: Awaited<ReturnType<typeof observeRaw>>) => (r.j?.undetermined ?? []).map((u: { id: string }) => u.id);
  it("J-3 원 시료(3주택) — 고지가 남는다", async () => {
    expect(ids(await observeRaw(d8()))).toContain(NOTICE);
  });
  it("4주택(본인 쪽 주택 1채 더 — 합가 의제 불성립) — 면제해도 과세라 고지 없음(종전에는 냈다)", async () => {
    const r = await observeRaw(
      d8([{ id: "d", region: "non_capital", acquisitionDate: "2010-01-01", mergeOrigin: "self_side", acquisitionOrigin: "general" }]),
    );
    expect(r.j.isExempt).toBe(false);
    expect(ids(r)).not.toContain(NOTICE);
  });
});

describe("I-31 §154⑧2호 「3년」 기산 — 결론을 가를 때만 확인 필요", () => {
  const NOTICE = "154-8-2-holding-count-start-unverified";
  // 취득 2019-01-01 · 비거주 2019-11-01~2022-03-15(2.4년) · 그 주택에 거주한 채 거주자 전환 · 비조정 · 9억
  const nr = (transfer: string, over: object = {}) =>
    mkCase("2026-11-20", {
      isOneHousehold: true, transferDate: transfer, contractTotalPrice: "900000000",
      nonResidentPeriod: true, nonResidentStartDate: "2019-11-01", residentFromDate: "2022-03-15", nonResidentResidedAtConversion: true,
      asset: { assetKind: "housing", acquisitionDate: "2019-01-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "0" },
      houses: [],
      ...over,
    });
  const ids = (r: Awaited<ReturnType<typeof observeRaw>>) => (r.j?.undetermined ?? []).map((u: { id: string }) => u.id);
  it("거주자 보유만으론 2년 미달(2022-09-01 양도) — 취득일 기산 통산으로 비과세 + 확인 필요", async () => {
    const r = await observeRaw(nr("2022-09-01"));
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).toContain(NOTICE);
  });
  it("짝 — 거주자 보유만으로도 2년(2023-06-01 양도)이면 독법과 무관해 고지 없음", async () => {
    const r = await observeRaw(nr("2023-06-01"));
    expect(r.j.isExempt).toBe(true);
    expect(ids(r)).not.toContain(NOTICE);
  });
  it("짝 — 비거주 기간 자체가 3년 이상이면 두 독법이 같아 고지 없음", async () => {
    const r = await observeRaw(nr("2022-09-01", { nonResidentStartDate: "2019-02-01" }));
    expect(ids(r)).not.toContain(NOTICE);
  });
});
