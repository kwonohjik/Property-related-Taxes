/**
 * E-1 — 증여세 부담부증여 양도 경로에 §155①2호 새 입력(OH-01 A2b)을 싣는다.
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.3 E-1.
 *
 * 경로: 증여세 마법사 `BurdenedGiftTransferSection`(⑤) → `bgt.temporaryTwoHouse`(①) →
 *       `buildGiftBurdenedTransferBody`(④) → POST `/api/calc/transfer`(⑫ `temporaryTwoHouseSchema` ·
 *       ⑭ `mapTemporaryTwoHouseEraFacts`) → 엔진 `resolveTemporaryTwoHouseDeadline`.
 *
 * 🔴 종전 ④는 `temporaryTwoHouse`에 두 날짜만 실어 보내, 이 경로에서는 조정 여부·계약일·전입일·
 *    임차인 종료일이 **엔진에 닿지 않았다** — 엔진이 양도일 기준 양도주택(대리 지표)으로 계산하고
 *    `155-1-regulated-at-new-acquisition-unverified`를 고지했다.
 *
 * 근거(법제처 DRF 실독 — 엔진 anchor `temporary-two-house-regulated-move-in-a2b.anchor.test.ts` 머리 표):
 *   · 「소득세법 시행령」 §155①(대통령령 제30395호로 개정된 것) 2호 가목(1년 내 세대전원 전입)·단서(기존 임차인)
 *   · 같은 호 「종전의 주택이 조정대상지역에 있는 상태에서 조정대상지역에 있는 신규 주택을 취득」
 *   · 대통령령 제29242호 부칙 제2조②2호(계약일 경과조치)
 *   · 대통령령 제32654호(2022-05-10 시행) — 조정→조정 2년
 *
 * 패리티: 같은 사실을 양도세 계산기(`callTransferTaxAPI` — 명부 도출) 경로로 넣으면 같은 비과세 결론이어야 한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildGiftBurdenedTransferBody } from "@/lib/calc/gift-burdened-transfer-api";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

type Obj = Record<string, unknown>;
type TT = NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>;
type Era = Omit<TT, "previousAcquisitionDate" | "newAcquisitionDate">;

const NOTICE = "신규주택 취득일 기준"; // `155-1-regulated-at-new-acquisition-unverified` 경고문 (엔진 A2b R7과 같은 단언)
const PREV_ACQ = "2015-01-01"; // 당시 미지정 — 거주요건 없음

// ─── 증여세 쪽 ────────────────────────────────────────────────────────────────

function giftForm(giftDate: string): FormState {
  return {
    giftDate,
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    isGenerationSkip: false,
    isMinorDonee: false,
    isSubstituteGift: false,
    giftItems: [],
    stockItems: [],
    exemptionItems: [],
    priorGifts: [],
    marriageExemption: "",
    birthExemption: "",
    priorUsedDeduction: "",
    priorUsedMarriageBirthDeduction: "",
    isFiledOnTime: true,
    foreignTaxPaid: "",
    specialTreatment: "",
    startupInvestmentCompleted: false,
    startupNewHiresAtLeast10: false,
    familyBusinessYears: "",
    splitPaymentEnabled: false,
    splitPaymentAmount: "",
  } as unknown as FormState;
}

/** 아파트 1채 부담부증여 — 1세대 2주택(일시적 2주택) 선언. 조정 여부·새 입력은 케이스가 정한다. */
function giftItem(newAcq: string, era: Era = {}, bgtOver: Partial<BurdenedGiftTransferTaxInput> = {}): EstateItem {
  return {
    id: "apt-1",
    category: "real_estate_apartment",
    name: "테스트 아파트",
    standardPrice: 300_000_000,
    leaseDeposit: 100_000_000,
    mortgageAmount: 50_000_000,
    assumedDebtForGift: 150_000_000,
    monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date(PREV_ACQ),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date(PREV_ACQ),
        newAcquisitionDate: new Date(newAcq),
        ...era,
      },
      ...bgtOver,
    },
  } as EstateItem;
}

// ─── 양도세 계산기 쪽(패리티) — `transfer.route.temp-two-house-a2b.anchor.test.ts`와 같은 모양 ─────

const house = (over: Partial<HouseEntry>): HouseEntry =>
  ({
    id: "h-new",
    region: "capital",
    acquisitionDate: "2020-06-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    acquisitionPrice: "",
    exclusiveArea: "",
    isUnsoldNewHouse: false,
    completionDate: "",
    isSpouseOwned: false,
    isCoInherited: false,
    decedentSameHouseholdAtInheritance: false,
    isRankingDisqualifiedInheritedHouse: false,
    ...over,
  }) as HouseEntry;

function transferForm(transferDate: string, newAcq: string, over: Partial<TransferFormData>, isRegulatedArea: boolean): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = transferDate;
  f.householdHousingCount = "2";
  f.isOneHousehold = true;
  f.isRegulatedArea = isRegulatedArea;
  f.contractTotalPrice = "300,000,000";
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: PREV_ACQ,
    actualSalePrice: "300,000,000",
    fixedAcquisitionPrice: "150,000,000",
    useEstimatedAcquisition: false,
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "0",
  });
  f.houses = [house({ acquisitionDate: newAcq })];
  return { ...f, ...over };
}

/** 증여세 폼 3-상태·날짜 문자열 → 양도세 폼 같은 이름 필드(두 폼이 같은 leaf를 쓰므로 이름이 같다) */
const toTransferOver = (era: Era): Partial<TransferFormData> => ({ ...era }) as Partial<TransferFormData>;

// ─── 공통 ────────────────────────────────────────────────────────────────────

const post = (body: unknown) =>
  SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

type R = { isExempt: boolean; totalTax: number; warnings?: string[] };
async function run(body: unknown): Promise<R> {
  const res = await post(body);
  const json = (await res.json()) as { data: { result: R } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result;
}
async function gift(giftDate: string, newAcq: string, era: Era = {}, isRegulatedArea = false): Promise<R> {
  return run(buildGiftBurdenedTransferBody(giftItem(newAcq, era, { isRegulatedArea }), giftForm(giftDate)));
}
async function bodyOf(send: () => Promise<unknown>): Promise<Obj> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as Obj;
}
async function transfer(transferDate: string, newAcq: string, era: Era = {}, isRegulatedArea = false): Promise<R> {
  return run(await bodyOf(() => callTransferTaxAPI(transferForm(transferDate, newAcq, toTransferOver(era), isRegulatedArea))));
}
const hasNotice = (r: R) => (r.warnings ?? []).some((w) => w.includes(NOTICE));

const BOTH: Era = { newHouseRegulatedAtAcquisition: "yes", prevHouseRegulatedAtNewAcquisition: "yes" };

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("E-1 ④⑬ 본문 — 새 필드가 `temporaryTwoHouse`에 실린다 (양도세 계산기와 같은 leaf)", () => {
  it("B-1 선언·계약일·전입일·임차인 종료일", () => {
    const body = buildGiftBurdenedTransferBody(
      giftItem("2020-06-01", {
        ...BOTH,
        newHouseContractDate: "2020-05-01",
        newHouseMoveInDate: "2021-01-01",
        newHouseExistingTenant: true,
        newHouseTenantLeaseEndDate: "2021-12-31",
      }),
      giftForm("2021-03-01"),
    );
    expect(body.temporaryTwoHouse).toEqual({
      previousAcquisitionDate: PREV_ACQ,
      newAcquisitionDate: "2020-06-01",
      newHouseRegulatedAtAcquisition: true,
      previousHouseRegulatedAtNewAcquisition: true,
      newHouseContractDate: "2020-05-01",
      wholeHouseholdMoveInDate: "2021-01-01",
      existingTenantLeaseEndDate: "2021-12-31",
    });
  });
  it("B-1 부정 짝 — 임차인 토글 OFF면 남은 종료일 미전송 · 미선택 선언 미전송 · 신규 주택 코드 없음", () => {
    const tt = buildGiftBurdenedTransferBody(
      giftItem("2020-06-01", { newHouseRegulatedAtAcquisition: "", newHouseTenantLeaseEndDate: "2021-12-31" }),
      giftForm("2021-03-01"),
    ).temporaryTwoHouse as Obj;
    expect(tt).toEqual({ previousAcquisitionDate: PREV_ACQ, newAcquisitionDate: "2020-06-01" });
  });
});

describe("E-1 ⑭ route — 새 입력이 결론을 바꾸고, 양도세 계산기와 같은 결론", () => {
  it("V-1 ★ 2019-12-17 체제 가목 — 전입 2021-06-01 비과세 / 2021-06-02 과세 (신규 2020-06-01 · 증여 2021-03-01)", async () => {
    const ok = { ...BOTH, newHouseMoveInDate: "2021-06-01" };
    const late = { ...BOTH, newHouseMoveInDate: "2021-06-02" };
    expect((await gift("2021-03-01", "2020-06-01", ok, true)).isExempt).toBe(true);
    expect((await gift("2021-03-01", "2020-06-01", late, true)).isExempt).toBe(false);
    // 패리티
    expect((await transfer("2021-03-01", "2020-06-01", ok, true)).isExempt).toBe(true);
    expect((await transfer("2021-03-01", "2020-06-01", late, true)).isExempt).toBe(false);
  });

  it("V-2 ★ 대리 지표 반전 — 양도일(증여일) 조정이지만 신규 취득 당시 신규 주택 비조정 → 3년 비과세 (신규 2020-06-01 · 증여 2021-08-01)", async () => {
    const era = { newHouseRegulatedAtAcquisition: "no", prevHouseRegulatedAtNewAcquisition: "yes" };
    const withFacts = await gift("2021-08-01", "2020-06-01", era, true);
    expect(withFacts.isExempt).toBe(true);
    expect(hasNotice(withFacts)).toBe(false);
    expect((await transfer("2021-08-01", "2020-06-01", era, true)).isExempt).toBe(true);
    // 미입력 — 종전 대리 지표(양도일 조정 ⇒ 1년 도과) 그대로 + 고지 유지
    const legacy = await gift("2021-08-01", "2020-06-01", {}, true);
    expect(legacy.isExempt).toBe(false);
    expect(hasNotice(legacy)).toBe(true);
  });

  it("V-3 ★ 2022-05-10~2023-01-11 — 증여일 비조정이어도 신규 취득(2020-12-01) 당시 두 주택 조정 → 2년 → 과세 (증여 2022-12-10)", async () => {
    const withFacts = await gift("2022-12-10", "2020-12-01", BOTH, false);
    expect(withFacts.isExempt).toBe(false);
    expect((await transfer("2022-12-10", "2020-12-01", BOTH, false)).isExempt).toBe(false);
    const legacy = await gift("2022-12-10", "2020-12-01", {}, false);
    expect(legacy.isExempt).toBe(true); // 대리 지표(증여일 비조정 ⇒ 3년)
    expect(hasNotice(legacy)).toBe(true);
  });

  it("V-4 제29242호 부칙 제2조②2호 — 신규 2018-10-01 · 증여 2021-06-01: 계약 2018-09-13 비과세 / 2018-09-14 과세", async () => {
    const at = (c: string) => ({ ...BOTH, newHouseContractDate: c });
    expect((await gift("2021-06-01", "2018-10-01", at("2018-09-13"))).isExempt).toBe(true);
    expect((await gift("2021-06-01", "2018-10-01", at("2018-09-14"))).isExempt).toBe(false);
    expect((await transfer("2021-06-01", "2018-10-01", at("2018-09-13"))).isExempt).toBe(true);
    expect((await transfer("2021-06-01", "2018-10-01", at("2018-09-14"))).isExempt).toBe(false);
  });

  it("V-5 단서 — 종료 2021-12-31 · 증여 2021-12-31: 임차인 토글 ON 비과세 / OFF 과세 (신규 2020-06-01)", async () => {
    const on = {
      ...BOTH,
      newHouseMoveInDate: "2021-12-30",
      newHouseExistingTenant: true,
      newHouseTenantLeaseEndDate: "2021-12-31",
    };
    const off = { ...on, newHouseExistingTenant: false };
    expect((await gift("2021-12-31", "2020-06-01", on)).isExempt).toBe(true);
    expect((await gift("2021-12-31", "2020-06-01", off)).isExempt).toBe(false);
    expect((await transfer("2021-12-31", "2020-06-01", on)).isExempt).toBe(true);
    expect((await transfer("2021-12-31", "2020-06-01", off)).isExempt).toBe(false);
  });

  it("V-6 부정 짝 — 2023-01-12 이후 증여는 조정 여부와 무관하게 3년: 입력 유무가 결론·고지를 바꾸지 않는다", async () => {
    const withFacts = await gift("2023-06-01", "2021-06-01", BOTH, true);
    const legacy = await gift("2023-06-01", "2021-06-01", {}, true);
    expect(withFacts.isExempt).toBe(true);
    expect(legacy.isExempt).toBe(true);
    expect(hasNotice(legacy)).toBe(false);
  });
});
