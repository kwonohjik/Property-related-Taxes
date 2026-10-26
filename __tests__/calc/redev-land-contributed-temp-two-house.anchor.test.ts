/**
 * anchor — 토지만 출자한 원조합원 완공APT의 §155① 종전주택 취득일 = 사용승인일(사용승인서 교부일)
 * (`docs/00-pm/land-contributed-apt-temp-two-house.plan.md` §11 · Q-3 사용자 결정 2026-10-25 — 영 §162①4호 문언).
 *
 * 시료: 토지 2005-01-01 취득 · 인가 2019-03-15 · 사용승인 2021-02-15 · 양도 10억 · 명부에 다른 주택 1채.
 * 「비조정」은 경남 4682025021(조정대상지역 지정 이력 없음)이다. 수정 전에는 아래 LC-1·LC-2·LC-4가 전부 비과세 0이었다.
 *
 * | # | 주장 |
 * |---|---|
 * | LC-1 | 사용승인 전(2020-06-01) 취득 주택 — 신규 주택 후보가 아니다(④ 도출 없음) · 과세 |
 * | LC-2 | 사용승인 후 1년 안(2021-08-01) — ④ 종전주택 취득일 = 사용승인일 · 1년 요건 불충족으로 과세(본문 취득일은 토지 취득일 그대로) |
 * | LC-3 | 사용승인 후 1년 뒤(2022-03-01) — 비과세 유지(음성 짝) · 유성(사용승인일에 조정)도 거주요건은 인가일 기준이라 같다 |
 * | LC-4 | API 직접 호출이 토지 취득일을 보내도 엔진이 사용승인일로 판정 — 1년 안·역순 모두 과세 |
 * | LC-5 | 이관 — 주택 출자 원조합원은 `redev-house-contributed-temp-two-house.anchor.test.ts` HC-1~6(F-1 Q-2 (a) 2026-10-26) |
 * | LC-6 | 이관 — 세대원 건물 출자 통산(#12)은 `redev-household-building-carryover-temp-two-house.anchor.test.ts` HB-1~8(Q-B1 (b) 2026-10-26) |
 * | LC-7 | 주택 수 제외 화면 leaf(`eligibleCountExcludedHouseIds`) — 일반주택 취득일이 엔진과 같은 사용승인일 · 세액은 일시적 2주택 경로로 바뀌지 않는다 |
 * | LC-8 | 화면 leaf `sellingHousePreviousDateOverride` · 엔진 번역 `translateRedevAptForHousingJudgment`의 갈래 |
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
const COMPLETION = "2021-02-15";
const TAXED = 218_031_000;

const LAND = {
  acquisitionDate: LAND_DATE,
  redevIsSuccessorMember: "no",
  redevOriginalAssetType: "land",
  redevApprovalDate: "2019-03-15",
  redevCompletionDate: COMPLETION,
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  redevSettlementAmount: "100000000",
  residenceInputMode: "direct",
  residencePeriods: [],
};
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
    assetOver: { ...(opts.member ?? LAND), regionCode: opts.region ?? NON_REGULATED },
    formOver: { residencePeriodMonths: "0", transferDate: opts.transfer } as never,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tth = (body: Record<string, unknown>) => body.temporaryTwoHouse as any;

describe("토지 출자 원조합원 완공APT × §155① 종전주택 취득일 = 사용승인일", () => {
  it("LC-1 사용승인 전 취득 주택은 신규 주택 후보가 아니다 — 과세", async () => {
    const r = await runCalc(form({ other: "2020-06-01", transfer: "2023-04-01" }));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(tth(r.body)).toBeUndefined();
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(TAXED);
  });

  it("LC-2 사용승인 후 1년 안 취득 — 종전주택 취득일 = 사용승인일 · 1년 요건 불충족으로 과세", async () => {
    const r = await runCalc(form({ other: "2021-08-01", transfer: "2023-04-01" }));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: COMPLETION, newAcquisitionDate: "2021-08-01" });
    expect(r.body.acquisitionDate).toBe(LAND_DATE); // 본문 취득일(§166 산식)은 토지 취득일 그대로
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(TAXED);
  });

  it("LC-3 사용승인 후 1년 뒤 취득 — 비과세 유지(비조정 · 유성 모두)", async () => {
    for (const region of [NON_REGULATED, YUSEONG]) {
      const r = await runCalc(form({ other: "2022-03-01", transfer: "2024-06-01", region }));
      expect(r.status).toBe(200);
      expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: COMPLETION, newAcquisitionDate: "2022-03-01" });
      expect(r.result.isExempt).toBe(true);
      expect(r.result.totalTax).toBe(0);
    }
  });

  it("LC-4 API 직접 호출이 토지 취득일을 보내도 엔진은 사용승인일로 판정한다 — 1년 안·역순 모두 과세", async () => {
    const base = await runCalc(form({ other: "2021-08-01", transfer: "2023-04-01" }));
    const lt1y = await postTransfer({ ...base.body, temporaryTwoHouse: { ...tth(base.body), previousAcquisitionDate: LAND_DATE } });
    expect(lt1y.status).toBe(200);
    expect(lt1y.result.isExempt).toBe(false);
    expect(lt1y.result.totalTax).toBe(TAXED);
    const reversed = await postTransfer({
      ...base.body,
      temporaryTwoHouse: { ...tth(base.body), previousAcquisitionDate: LAND_DATE, newAcquisitionDate: "2020-06-01" },
    });
    expect(reversed.status).toBe(200);
    expect(reversed.result.isExempt).toBe(false);
    expect(reversed.result.totalTax).toBe(TAXED);
  });

  it("LC-7 주택 수 제외 화면 leaf — 사용승인 전 취득 농어촌주택은 빼지 않는다(엔진과 같은 날짜) · 세액은 그대로", async () => {
    const row = { countExclusion: { kind: "reduction", reduction: RURAL } };
    const before = form({ other: "2020-06-01", transfer: "2023-04-01", row });
    expect([...eligibleCountExcludedHouseIds(before as never)]).toEqual([]);
    const b = await runCalc(before);
    expect(tth(b.body)).toBeUndefined();
    expect(b.result.totalTax).toBe(TAXED);

    const after = form({ other: "2021-08-01", transfer: "2023-04-01", row });
    expect([...eligibleCountExcludedHouseIds(after as never)]).toEqual(["n1"]);
    const a = await runCalc(after);
    expect(tth(a.body)).toBeUndefined();
    expect(a.result.isExempt).toBe(true);
    expect(a.result.totalTax).toBe(0);
  });
});

describe("LC-8 갈래 — 화면 leaf와 엔진 번역이 같은 조건으로 사용승인일을 쓴다", () => {
  const asset = (over: Partial<AssetForm>) =>
    ({
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevIsSuccessorMember: "no",
      redevOriginalAssetType: "land",
      redevCompletionDate: COMPLETION,
      ...over,
    }) as Partial<AssetForm>;

  it("화면 leaf — 토지 출자면 명부가 없어도 사용승인일", () => {
    expect(sellingHousePreviousDateOverride(asset({}), 0)).toBe(COMPLETION);
    expect(sellingHousePreviousDateOverride(asset({}), 1)).toBe(COMPLETION);
  });
  it("화면 leaf — 대체하지 않는 경우: 준공일 빔 · 청산금 수령 단독신고 (주택 출자는 HC-6 · 세대원 건물 통산은 HB-6)", () => {
    expect(sellingHousePreviousDateOverride(asset({ redevCompletionDate: "" }), 1)).toBeUndefined();
    expect(sellingHousePreviousDateOverride(asset({ redevReceiveOnlyMode: "yes" } as never), 1)).toBeUndefined();
    // 통산 「예」인데 건물 취득일이 비면 ④가 통산을 싣지 않는다 — 엔진과 같이 사용승인일
    expect(sellingHousePreviousDateOverride(asset({ redevHouseholdBuildingCarryover: "yes", redevHouseholdBuildingAcquisitionDate: "" }), 1)).toBe(COMPLETION);
  });

  const input = (over: { rosterRow?: boolean } = {}) =>
    ({
      propertyType: "redevelopment_apt",
      acquisitionDate: new Date(LAND_DATE),
      redevelopment: {
        subject: "apt",
        isSuccessorMember: false,
        originalAssetType: "land",
        completionDate: new Date(COMPLETION),
        approvalDate: new Date("2019-03-15"),
      },
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date(LAND_DATE),
        newAcquisitionDate: new Date("2021-08-01"),
        ...(over.rosterRow ? { previousHouseIsRosterRow: true } : {}),
      },
    }) as unknown as TransferTaxInput;
  const prev = (i: TransferTaxInput) => translateRedevAptForHousingJudgment(i).temporaryTwoHouse?.previousAcquisitionDate;

  it("엔진 번역 — 토지 출자 · 양도 주택이 종전 주택이면 사용승인일", () => {
    expect(prev(input())).toEqual(new Date(COMPLETION));
  });
  it("엔진 번역 — 그대로: 합가 D8 상대 쪽 짝 (주택 출자는 HC-5 · 세대원 건물 통산은 HB-6)", () => {
    expect(prev(input({ rosterRow: true }))).toEqual(new Date(LAND_DATE));
  });
});
