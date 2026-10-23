/**
 * anchor — 승계조합원 완공APT의 §155① 종전주택 취득일 = 준공일(사용승인서 교부일)
 * (`docs/00-pm/land-contributed-apt-temp-two-house.plan.md` §1.4 · Q-1 (c)).
 *
 * 시료: 입주권 승계 2019-06-01 · 인가 2019-03-15 · 사용승인 2021-02-15 · 양도 10억 · 명부에 다른 주택 1채.
 * 「비조정」은 경남 4682025021(조정대상지역 지정 이력 없음)이다 — 거주요건이 결론을 가리지 않게 한다.
 *
 * | # | 주장 |
 * |---|---|
 * | SC-1 | 사용승인 전(2020-09-01) 취득 주택 — 신규 주택 후보가 아니다(④ 도출 없음) · 과세 |
 * | SC-2 | 사용승인 후 1년 안(2021-08-01) — ④ 종전주택 취득일 = 준공일 · 1년 요건 불충족으로 과세 |
 * | SC-3 | 사용승인 후 1년 뒤(2022-03-01) — 비과세 유지(음성 짝) |
 * | SC-4 | API 직접 호출이 입주권 승계일을 보내도 엔진이 준공일로 판정 — SC-2와 같은 결론 |
 * | SC-5 | 대전 유성(사용승인일에 조정대상지역) — 거주 0은 과세, 거주 2년이면 비과세(거주요건 축 불변) |
 * | SC-6 | 토지 출자 원조합원은 그대로(V-1 해석례 대기 — Q-1 (c) 범위 밖) |
 * | SC-7 | 엔진 번역 — 합가 D8 상대 쪽 짝(`previousHouseIsRosterRow`)은 명부 행 취득일을 그대로 둔다 |
 * | SC-8 | 화면 leaf — 승계조합원 완공APT만 준공일, 준공일이 비면·입주권 양도·원조합원은 대체 없음 |
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
import { translateRedevAptForHousingJudgment } from "@/lib/tax-engine/one-house/redev-apt-judgment-input";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const NON_REGULATED = "4682025021";
const YUSEONG = "3020000000";
const COMPLETION = "2021-02-15";

const SUCCESSOR = {
  acquisitionDate: "2019-06-01",
  redevIsSuccessorMember: "yes",
  redevApprovalDate: "2019-03-15",
  redevCompletionDate: COMPLETION,
  redevActualAcquisitionPrice: "100000000",
  fixedAcquisitionPrice: "100000000",
  // 승계조합원은 청산금 납부 0원만 받는다(⑧ `transfer-tax-validate-redev.ts`) — 화면 경로와 같은 입력이다.
  redevSettlementAmount: "0",
  residenceInputMode: "direct",
  residencePeriods: [],
};
const LAND = { ...SUCCESSOR, acquisitionDate: "2005-01-01", redevIsSuccessorMember: "no", redevOriginalAssetType: "land", redevSettlementAmount: "100000000" };

function form(opts: { other: string; transfer: string; region?: string; member?: Record<string, unknown>; asset?: Record<string, unknown> }) {
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
    assetOver: { ...(opts.member ?? SUCCESSOR), regionCode: opts.region ?? NON_REGULATED, ...opts.asset },
    formOver: { residencePeriodMonths: "0", transferDate: opts.transfer } as never,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tth = (body: Record<string, unknown>) => body.temporaryTwoHouse as any;

describe("승계조합원 완공APT × §155① 종전주택 취득일 = 준공일", () => {
  it("SC-1 사용승인 전 취득 주택은 신규 주택 후보가 아니다 — 과세", async () => {
    const r = await runCalc(form({ other: "2020-09-01", transfer: "2023-04-01" }));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(tth(r.body)).toBeUndefined();
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(375_111_000);
  });

  it("SC-2 사용승인 후 1년 안 취득 — 종전주택 취득일 = 준공일 · 1년 요건 불충족으로 과세", async () => {
    const r = await runCalc(form({ other: "2021-08-01", transfer: "2023-04-01" }));
    expect(r.status).toBe(200);
    expect(r.issues).toEqual([]);
    expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: COMPLETION, newAcquisitionDate: "2021-08-01" });
    expect(r.body.acquisitionDate).toBe("2019-06-01"); // 본문 취득일(§166 산식)은 입주권 승계일 그대로
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(375_111_000);
  });

  it("SC-3 사용승인 후 1년 뒤 취득 — 비과세 유지", async () => {
    const r = await runCalc(form({ other: "2022-03-01", transfer: "2024-06-01" }));
    expect(r.status).toBe(200);
    expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: COMPLETION, newAcquisitionDate: "2022-03-01" });
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
  });

  it("SC-4 API 직접 호출이 입주권 승계일을 보내도 엔진은 준공일로 판정한다", async () => {
    const base = await runCalc(form({ other: "2021-08-01", transfer: "2023-04-01" }));
    const body = { ...base.body, temporaryTwoHouse: { ...tth(base.body), previousAcquisitionDate: "2019-06-01" } };
    const r = await postTransfer(body);
    expect(r.status).toBe(200);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(375_111_000);
  });

  it("SC-5 사용승인일에 조정대상지역(유성) — 거주 0 과세 · 거주 2년 비과세", async () => {
    const noResidence = await runCalc(form({ other: "2022-03-01", transfer: "2024-06-01", region: YUSEONG }));
    expect(noResidence.result.isExempt).toBe(false);
    expect(noResidence.result.totalTax).toBe(350_163_000);
    const lived = await runCalc(
      form({
        other: "2022-03-01",
        transfer: "2024-06-01",
        region: YUSEONG,
        asset: { residenceInputMode: "interval", residencePeriods: [{ moveInDate: "2021-03-01", moveOutDate: "2023-03-31" }] },
      }),
    );
    expect(lived.result.isExempt).toBe(true);
    expect(lived.result.totalTax).toBe(0);
  });

  it("SC-6 토지 출자 원조합원은 그대로 — 종전주택 취득일 = 토지 취득일(V-1 해석례 대기)", async () => {
    const r = await runCalc(form({ other: "2021-08-01", transfer: "2023-04-01", member: LAND }));
    expect(r.status).toBe(200);
    expect(tth(r.body)).toMatchObject({ previousAcquisitionDate: "2005-01-01" });
    expect(r.result.isExempt).toBe(true);
  });
});

describe("SC-7 엔진 번역 — 종전 주택이 양도 주택일 때만 준공일로 맞춘다", () => {
  const input = (rosterRow: boolean, successor = true) =>
    ({
      propertyType: "redevelopment_apt",
      acquisitionDate: new Date("2019-06-01"),
      redevelopment: { subject: "apt", isSuccessorMember: successor, completionDate: new Date(COMPLETION), approvalDate: new Date("2019-03-15") },
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date("2018-01-01"),
        newAcquisitionDate: new Date("2021-08-01"),
        ...(rosterRow ? { previousHouseIsRosterRow: true } : {}),
      },
    }) as unknown as TransferTaxInput;

  it("양도 주택이 종전 주택 — 준공일", () => {
    expect(translateRedevAptForHousingJudgment(input(false)).temporaryTwoHouse?.previousAcquisitionDate).toEqual(new Date(COMPLETION));
  });
  it("합가 D8 상대 쪽 짝 — 명부 행 취득일 그대로", () => {
    expect(translateRedevAptForHousingJudgment(input(true)).temporaryTwoHouse?.previousAcquisitionDate).toEqual(new Date("2018-01-01"));
  });
  it("원조합원 — 그대로", () => {
    expect(translateRedevAptForHousingJudgment(input(false, false)).temporaryTwoHouse?.previousAcquisitionDate).toEqual(new Date("2018-01-01"));
  });
});

describe("SC-8 화면 leaf `sellingHousePreviousDateOverride`", () => {
  const asset = (over: Partial<AssetForm>) =>
    ({ assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "yes", redevCompletionDate: COMPLETION, ...over }) as Partial<AssetForm>;

  it("승계조합원 완공APT — 명부가 없어도 준공일", () => {
    expect(sellingHousePreviousDateOverride(asset({}), 0)).toBe(COMPLETION);
    expect(sellingHousePreviousDateOverride(asset({}), 1)).toBe(COMPLETION);
  });
  it("준공일이 비면 대체하지 않는다", () => {
    expect(sellingHousePreviousDateOverride(asset({ redevCompletionDate: "" }), 1)).toBeUndefined();
  });
  it("입주권 양도·원조합원은 대체하지 않는다", () => {
    expect(sellingHousePreviousDateOverride(asset({ redevSubject: "right" }), 1)).toBeUndefined();
    expect(sellingHousePreviousDateOverride(asset({ redevIsSuccessorMember: "no" }), 1)).toBeUndefined();
  });
});
