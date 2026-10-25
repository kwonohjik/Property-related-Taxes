/**
 * anchor — 주택을 출자한 원조합원 완공APT의 §155① 종전주택 취득일 = **멸실 전 주택 취득일**
 * (`docs/00-pm/house-contributed-apt-temp-two-house.plan.md` §6 · F-1 Q-2 (a) 사용자 결정 2026-10-26).
 *
 * 근거: 재건축주택은 기존주택의 연장 — 부동산납세과-777(멸실 중 다른 주택 취득 → 재건축주택 준공 후 양도에 §155① 적용) ·
 * 서울고법 2008누6228 → 대법원 2008두16261 심리불속행. 토지만 출자한 원조합원(사용승인일 —
 * `redev-land-contributed-temp-two-house.anchor.test.ts`)과 날짜가 다른 것이 의도다 — 연장할 주택이 없기 때문이다.
 *
 * 시료: 종전주택 2005-01-01 취득 · 인가 2019-03-15 · 사용승인 2021-02-15 · 양도 10억 · 명부에 다른 주택 1채.
 * 「비조정」은 경남 4682025021(조정대상지역 지정 이력 없음)이다.
 *
 * | # | 주장 |
 * |---|---|
 * | HC-1 | 사용승인 전(2020-06-01) · 1년 안(2021-08-01) 취득 — ④ 종전주택 취득일 = 2005-01-01 · 비과세 (LC-5에서 이관) |
 * | HC-2 | 사용승인 후 1년 뒤(2022-03-01) — 비과세(비조정·유성 모두 — 「취득 당시」가 2005년) |
 * | HC-3 | 1년 요건 기준일 = 멸실 전 주택 취득일 — 종전 2019-01-01 · 다른 2019-10-01 과세 / 종전 2018-01-01 비과세 |
 * | HC-4 | 3년 기한 — 다른 주택 2020-06-01 취득 · 2023-08-01 양도 → 과세 |
 * | HC-5 | 엔진 번역 — 판정 취득일·`temporaryTwoHouse.previousAcquisitionDate` 모두 본문 그대로 (LC-8에서 이관 + 판정 취득일) |
 * | HC-6 | 화면 leaf `sellingHousePreviousDateOverride` — 대체하지 않는다 (LC-8에서 이관) |
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
import { sellingHousePreviousDateOverride } from "@/lib/calc/selling-house-origin-scope";
import {
  redevAptJudgmentAcquisitionDate,
  translateRedevAptForHousingJudgment,
} from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NON_REGULATED = "4682025021";
const YUSEONG = "3020000000";
const HOUSE_DATE = "2005-01-01";
const COMPLETION = "2021-02-15";

const HOUSE = {
  acquisitionDate: HOUSE_DATE,
  redevIsSuccessorMember: "no",
  redevOriginalAssetType: "housing",
  redevApprovalDate: "2019-03-15",
  redevCompletionDate: COMPLETION,
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  redevSettlementAmount: "100000000",
  residenceInputMode: "direct",
  residencePeriods: [],
};

function form(opts: { other: string; transfer: string; region?: string; member?: Record<string, unknown> }) {
  const houses = [
    houseRow("n1", opts.other, {
      region: "non_capital",
      regionCode: NON_REGULATED,
      officialPrice: "100000000",
      isApartment: false,
      acquisitionOrigin: "general",
    } as never),
  ];
  return redevAptForm({
    houses,
    count: "2",
    price: "1000000000",
    assetOver: { ...HOUSE, ...opts.member, regionCode: opts.region ?? NON_REGULATED },
    formOver: { residencePeriodMonths: "0", transferDate: opts.transfer } as never,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tth = (body: Record<string, unknown>) => body.temporaryTwoHouse as any;

describe("주택 출자 원조합원 완공APT × §155① 종전주택 취득일 = 멸실 전 주택 취득일", () => {
  it("HC-1 사용승인 전·1년 안 취득 — 종전주택 취득일 = 멸실 전 주택 취득일 · 비과세", async () => {
    for (const other of ["2020-06-01", "2021-08-01"]) {
      const r = await runCalc(form({ other, transfer: "2023-04-01" }));
      expect(r.status).toBe(200);
      expect(r.issues).toEqual([]);
      expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: HOUSE_DATE, newAcquisitionDate: other });
      expect(r.result.isExempt).toBe(true);
      expect(r.result.totalTax).toBe(0);
    }
  });

  it("HC-2 사용승인 후 1년 뒤 취득 — 비과세(비조정 · 유성 모두)", async () => {
    for (const region of [NON_REGULATED, YUSEONG]) {
      const r = await runCalc(form({ other: "2022-03-01", transfer: "2024-06-01", region }));
      expect(r.status).toBe(200);
      expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: HOUSE_DATE, newAcquisitionDate: "2022-03-01" });
      expect(r.result.isExempt).toBe(true);
      expect(r.result.totalTax).toBe(0);
    }
  });

  it("HC-3 1년 요건은 멸실 전 주택 취득일부터 센다 — 1년 안 과세 · 1년 뒤 비과세", async () => {
    const within = await runCalc(form({ other: "2019-10-01", transfer: "2022-06-01", member: { acquisitionDate: "2019-01-01" } }));
    expect(within.status).toBe(200);
    expect(within.issues).toEqual([]);
    expect(tth(within.body)).toMatchObject({ previousAcquisitionDate: "2019-01-01", newAcquisitionDate: "2019-10-01" });
    expect(within.result.isExempt).toBe(false);
    expect(within.result.totalTax).toBe(307_329_000);

    // 음성 짝 — 사용승인일(2021-02-15)을 종전주택 취득일로 쓰면 역순이 되어 과세로 바뀐다.
    const after = await runCalc(form({ other: "2019-10-01", transfer: "2022-06-01", member: { acquisitionDate: "2018-01-01" } }));
    expect(after.status).toBe(200);
    expect(tth(after.body)).toMatchObject({ previousAcquisitionDate: "2018-01-01", newAcquisitionDate: "2019-10-01" });
    expect(after.result.isExempt).toBe(true);
    expect(after.result.totalTax).toBe(0);
  });

  it("HC-4 다른 주택 취득 후 3년이 지나 양도 — 과세", async () => {
    const r = await runCalc(form({ other: "2020-06-01", transfer: "2023-08-01" }));
    expect(r.status).toBe(200);
    expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: HOUSE_DATE, newAcquisitionDate: "2020-06-01" });
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(218_031_000);
  });
});

describe("HC-5·HC-6 갈래 — 엔진 번역과 화면 leaf 모두 멸실 전 주택 취득일을 그대로 둔다", () => {
  const input = () =>
    ({
      propertyType: "redevelopment_apt",
      acquisitionDate: new Date(HOUSE_DATE),
      redevelopment: {
        subject: "apt",
        isSuccessorMember: false,
        originalAssetType: "housing",
        completionDate: new Date(COMPLETION),
        approvalDate: new Date("2019-03-15"),
      },
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date(HOUSE_DATE),
        newAcquisitionDate: new Date("2021-08-01"),
      },
    }) as unknown as TransferTaxInput;

  it("HC-5 엔진 번역 — 판정 취득일 · §155① 종전주택 취득일 모두 본문 그대로", () => {
    const t = translateRedevAptForHousingJudgment(input());
    expect(t.acquisitionDate).toEqual(new Date(HOUSE_DATE));
    expect(t.temporaryTwoHouse?.previousAcquisitionDate).toEqual(new Date(HOUSE_DATE));
    expect(redevAptJudgmentAcquisitionDate(input())).toEqual(new Date(HOUSE_DATE));
  });

  it("HC-6 화면 leaf — 명부 유무와 관계없이 대체하지 않는다", () => {
    const asset = {
      assetKind: "redevelopment_apt",
      redevSubject: "apt",
      redevIsSuccessorMember: "no",
      redevOriginalAssetType: "housing",
      redevCompletionDate: COMPLETION,
    } as Partial<AssetForm>;
    expect(sellingHousePreviousDateOverride(asset, 0)).toBeUndefined();
    expect(sellingHousePreviousDateOverride(asset, 1)).toBeUndefined();
  });
});
