/**
 * anchor — 토지 출자 원조합원 + 세대원 건물 출자 통산(#12)의 §155① 종전주택 취득일 = **세대원 건물 취득일**
 * (`docs/00-pm/household-building-carryover-temp-two-house.plan.md` §7 · Q-B1 (b)·Q-B2 (a) 사용자 결정 2026-10-26).
 *
 * 세대가 그 주택(건물)을 가진 날이고 #12의 비과세 보유 기산일과 같은 날짜다. 종전에는 토지 취득일이었다(근거 없음 —
 * 서면5팀-1324: 토지만으로는 주택이 아니다). 정면 해석례가 없어 결과에 확인 필요 고지가 붙는다.
 *
 * 시료: 토지 2005-01-01 · 세대원 건물 2010-01-01(거주 0) · 인가 2019-03-15 · 사용승인 2021-02-15 · 양도 10억 · 명부에 다른 주택 1채.
 * 「비조정」은 경남 4682025021(조정대상지역 지정 이력 없음)이다.
 *
 * | # | 주장 |
 * |---|---|
 * | HB-1 | 사용승인 전·1년 안·1년 뒤 취득 — ④ 종전주택 취득일 = 건물 취득일 · 비과세(종전과 같은 결론) |
 * | HB-2 | 건물 2019-01-01 · 다른 주택 2019-10-01 — 1년 요건 불충족 과세 (종전 비과세) |
 * | HB-3 | 토지 2018-06-01 · 건물 2003-01-01 · 다른 주택 2019-01-01 — 일시적 2주택 고가주택 부분 과세 (종전 과세) |
 * | HB-4 | API 직접 호출이 토지 취득일을 보내도 엔진이 건물 취득일로 판정 |
 * | HB-5 | API 직접 — 건물 취득일이 인가일보다 늦으면 ⑫가 400으로 막는다(화면은 ⑧) · 엔진 helper 가드는 HB-6 단위 |
 * | HB-6 | 화면 leaf `sellingHousePreviousDateOverride` · 엔진 번역 갈래 (LC-6·LC-8에서 이관 후 뒤집음) |
 * | HB-7 | 주택 수 제외 일반주택 취득일도 건물 취득일 — 2015년 농어촌주택 행이 빠진다(화면 leaf = 엔진) |
 * | HB-8 | #12 고지 — 일시적 2주택 결론이 통산으로 갈리면 §155① 문장이 붙는다 |
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
import { runCalc, postTransfer, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { sellingHousePreviousDateOverride } from "@/lib/calc/selling-house-origin-scope";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
import { translateRedevAptForHousingJudgment } from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NON_REGULATED = "4682025021";
const YUSEONG = "3020000000";
const LAND_DATE = "2005-01-01";
const BUILDING = "2010-01-01";
const COMPLETION = "2021-02-15";
const NOTICE_155 = "일시적 2주택(「소득세법 시행령」 §155①)의 종전주택 취득일도 토지 취득일이 아니라 세대원 건물 취득일로 보았습니다";

const carry = (land: string, building: string) => ({
  acquisitionDate: land,
  redevIsSuccessorMember: "no",
  redevOriginalAssetType: "land",
  redevApprovalDate: "2019-03-15",
  redevCompletionDate: COMPLETION,
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  redevSettlementAmount: "100000000",
  residenceInputMode: "direct",
  residencePeriods: [],
  redevHouseholdBuildingCarryover: "yes",
  redevHouseholdBuildingAcquisitionDate: building,
  redevHouseholdBuildingResidenceMonths: "0",
});
const RURAL = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "",
  ruralHouseStdPrice: "100000000",
  isRegisteredHanok: false,
  isAdjacentArea: false,
  meetsLocationRequirement: true,
};

function form(opts: { other: string; transfer: string; region?: string; member?: Record<string, unknown>; row?: Record<string, unknown> }) {
  const houses = [
    houseRow("n1", opts.other, {
      region: "non_capital",
      regionCode: NON_REGULATED,
      officialPrice: "100000000",
      isApartment: false,
      acquisitionOrigin: "general",
      ...opts.row,
    } as never),
  ];
  return redevAptForm({
    houses,
    count: "2",
    price: "1000000000",
    assetOver: { ...(opts.member ?? carry(LAND_DATE, BUILDING)), regionCode: opts.region ?? NON_REGULATED },
    formOver: { residencePeriodMonths: "0", transferDate: opts.transfer } as never,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tth = (body: Record<string, unknown>) => body.temporaryTwoHouse as any;
const warnings = (result: { warnings?: string[] }) => (result.warnings ?? []).join("\n");

describe("세대원 건물 출자 통산 × §155① 종전주택 취득일 = 세대원 건물 취득일", () => {
  it("HB-1 사용승인 전·1년 안·1년 뒤 취득 — 종전주택 취득일 = 건물 취득일 · 비과세", async () => {
    for (const [other, transfer, region] of [
      ["2020-06-01", "2023-04-01", NON_REGULATED],
      ["2021-08-01", "2023-04-01", NON_REGULATED],
      ["2022-03-01", "2024-06-01", NON_REGULATED],
      ["2022-03-01", "2024-06-01", YUSEONG],
    ]) {
      const r = await runCalc(form({ other, transfer, region }));
      expect(r.status).toBe(200);
      expect(r.issues).toEqual([]);
      expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: BUILDING, newAcquisitionDate: other });
      expect(r.body.acquisitionDate).toBe(LAND_DATE); // 본문 취득일(§166 산식)은 토지 취득일 그대로
      expect(r.result.isExempt).toBe(true);
      expect(r.result.totalTax).toBe(0);
    }
  });

  it("HB-2 건물 취득 9개월 뒤 다른 주택 — 1년 요건 불충족으로 과세", async () => {
    const r = await runCalc(form({ other: "2019-10-01", transfer: "2022-06-01", member: carry(LAND_DATE, "2019-01-01") }));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: "2019-01-01", newAcquisitionDate: "2019-10-01" });
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(218_625_000);
  });

  it("HB-3 건물을 먼저(2003)·토지를 나중(2018) 취득 — 일시적 2주택 고가주택 부분 과세", async () => {
    const r = await runCalc(form({ other: "2019-01-01", transfer: "2021-12-01", member: carry("2018-06-01", "2003-01-01") }));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: "2003-01-01", newAcquisitionDate: "2019-01-01" });
    expect(r.result.isPartialExempt).toBe(true);
    expect(r.result.exemptReason).toBe("일시적 2주택 고가주택");
    expect(r.result.totalTax).toBe(13_450_800);
  });

  it("HB-4 API 직접 호출이 토지 취득일을 보내도 엔진은 건물 취득일로 판정한다", async () => {
    const base = await runCalc(form({ other: "2019-10-01", transfer: "2022-06-01", member: carry(LAND_DATE, "2019-01-01") }));
    const r = await postTransfer({ ...base.body, temporaryTwoHouse: { ...tth(base.body), previousAcquisitionDate: LAND_DATE } });
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(218_625_000);
  });

  it("HB-5 API 직접 — 건물 취득일이 인가일보다 늦으면 ⑫가 막는다(엔진 가드는 HB-6 단위)", async () => {
    const base = await runCalc(form({ other: "2021-08-01", transfer: "2023-04-01" }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redev = base.body.redevelopment as any;
    const r = await postTransfer({
      ...base.body,
      redevelopment: { ...redev, householdBuilding: { ...redev.householdBuilding, acquisitionDate: "2019-06-01" } },
    });
    expect(r.status).toBe(400);
  });
});

describe("HB-6 갈래 — 화면 leaf와 엔진 번역이 같은 조건으로 건물 취득일을 쓴다", () => {
  const asset = (over: Partial<AssetForm>) =>
    ({
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevIsSuccessorMember: "no",
      redevOriginalAssetType: "land",
      redevCompletionDate: COMPLETION,
      redevHouseholdBuildingCarryover: "yes",
      redevHouseholdBuildingAcquisitionDate: BUILDING,
      ...over,
    }) as Partial<AssetForm>;

  it("화면 leaf — 통산 적용이면 명부가 없어도 건물 취득일", () => {
    expect(sellingHousePreviousDateOverride(asset({}), 0)).toBe(BUILDING);
    expect(sellingHousePreviousDateOverride(asset({}), 1)).toBe(BUILDING);
  });
  it("화면 leaf — 준공일이 비면 대체하지 않는다(엔진 helper가 통산하지 않는다) · 통산을 고르지 않았으면 사용승인일", () => {
    expect(sellingHousePreviousDateOverride(asset({ redevCompletionDate: "" }), 1)).toBeUndefined();
    expect(sellingHousePreviousDateOverride(asset({ redevHouseholdBuildingCarryover: "" }), 1)).toBe(COMPLETION);
  });

  const input = (over: { rosterRow?: boolean; buildingDate?: string; completion?: boolean } = {}) =>
    ({
      propertyType: "redevelopment_apt",
      acquisitionDate: new Date(LAND_DATE),
      redevelopment: {
        subject: "apt",
        isSuccessorMember: false,
        originalAssetType: "land",
        ...(over.completion === false ? {} : { completionDate: new Date(COMPLETION) }),
        approvalDate: new Date("2019-03-15"),
        householdBuilding: { acquisitionDate: new Date(over.buildingDate ?? BUILDING), residenceMonths: 0 },
      },
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date(LAND_DATE),
        newAcquisitionDate: new Date("2021-08-01"),
        ...(over.rosterRow ? { previousHouseIsRosterRow: true } : {}),
      },
    }) as unknown as TransferTaxInput;
  const prev = (i: TransferTaxInput) => translateRedevAptForHousingJudgment(i).temporaryTwoHouse?.previousAcquisitionDate;

  it("엔진 번역 — 통산이면 건물 취득일 · 「취득 당시」 판정 취득일은 사용승인일 그대로(#12)", () => {
    expect(prev(input())).toEqual(new Date(BUILDING));
    expect(translateRedevAptForHousingJudgment(input()).acquisitionDate).toEqual(new Date(COMPLETION));
  });
  it("엔진 번역 — 그대로: 합가 D8 상대 쪽 짝 · 건물 취득일 > 인가일 · 준공일 없음", () => {
    expect(prev(input({ rosterRow: true }))).toEqual(new Date(LAND_DATE));
    expect(prev(input({ buildingDate: "2019-06-01" }))).toEqual(new Date(LAND_DATE));
    expect(prev(input({ completion: false }))).toEqual(new Date(LAND_DATE));
  });
});

describe("HB-7·HB-8 주택 수 제외 · 고지", () => {
  it("HB-7 일반주택 취득일 = 건물 취득일 — 2015년 농어촌주택 행이 빠지고 화면 leaf와 엔진이 같은 결론", async () => {
    const f = form({ other: "2015-06-01", transfer: "2023-04-01", row: { countExclusion: { kind: "reduction", reduction: RURAL } } });
    expect([...eligibleCountExcludedHouseIds(f as never)]).toEqual(["n1"]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(tth(r.body)).toBeUndefined();
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);

    // 건물 취득 전(2008) 농어촌주택은 그대로 빠지지 않는다 — 음성 짝
    const before = form({ other: "2008-06-01", transfer: "2023-04-01", row: { countExclusion: { kind: "reduction", reduction: RURAL } } });
    expect([...eligibleCountExcludedHouseIds(before as never)]).toEqual([]);
  });

  it("HB-8 통산이 일시적 2주택 결론을 가르면 §155① 문장이 붙는다 · 결론이 같으면 고지 없음", async () => {
    const between = await runCalc(form({ other: "2020-06-01", transfer: "2023-04-01" }));
    expect(warnings(between.result)).toContain(NOTICE_155);
    const c5 = await runCalc(form({ other: "2019-01-01", transfer: "2021-12-01", member: carry("2018-06-01", "2003-01-01") }));
    expect(warnings(c5.result)).toContain(NOTICE_155);
    const c4 = await runCalc(form({ other: "2019-10-01", transfer: "2022-06-01", member: carry(LAND_DATE, "2019-01-01") }));
    expect(warnings(c4.result)).not.toContain("세대원 건물 출자 통산을 적용했습니다");
  });
});
