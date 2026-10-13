/**
 * 증여세 부담부증여 양도 경로 — §155① 신규 주택 **취득 경위** 질문 (결정 #43-4).
 *
 * 이 경로에는 보유 주택 목록이 없어 명부 행의 경위 질문을 받지 못했다(`not_collected` — BT-E2E-7·11). 신규 주택 취득일 칸 아래에 같은 공용
 * 블록(`DeclaredNewHouseOriginBlock`)으로 한 번 묻는다. 경로: ⑤ `bgt.temporaryTwoHouse.newHouseOriginKind…`(①) →
 * `buildGiftBurdenedTransferBody`(④) → POST `/api/calc/transfer`(⑫ `temporaryTwoHouseSchema` · ⑭ `mapTemporaryTwoHouseEraFacts`) → 엔진
 * `judgeNewHouseOrigin`(양도세 명부 경로와 같은 정본).
 *
 * | # | 검증 | 기대 |
 * |---|---|---|
 * | B-* | ④ 본문 | 미답 = not_collected(종전과 같다) · 답이 있으면 경위·날짜 · 기존주택의 연장은 신규 주택 취득일을 바꾼다 · 계약일 칸을 권리 취득일이 덮는다 |
 * | R-* | route | 순차 분양권 = 불성립(비과세 → 과세) · 같은 날·모름 = 불성립 · 일반 = 미답과 같은 결론·세액 · 양도세 명부 경로와 패리티 |
 * | V-* | ⑧ | 미답은 막지 않는다 · 앞뒤가 안 맞는 답은 막는다 · 칸이 닫히면(주택 수 3) 막지 않는다 |
 * | N-* | ③ 복원 | 새 필드가 살아남는다 |
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
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

type Obj = Record<string, unknown>;
type TT = NonNullable<BurdenedGiftTransferTaxInput["temporaryTwoHouse"]>;
type Era = Omit<TT, "previousAcquisitionDate" | "newAcquisitionDate">;

/** 종전(증여) 주택 2023-03-15 · 신규 주택 완공 2024-06-15 · 증여 2025-06-15 — 신규 취득 후 1년 · 종전 보유 2년 이상 */
const PREV = "2023-03-15";
const NEW_ACQ = "2024-06-15";
const GIFT_DATE = "2025-06-15";

function giftItem(origin: Era = {}, over: Partial<BurdenedGiftTransferTaxInput> = {}, newAcq = NEW_ACQ): EstateItem {
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
      acquisitionDate: new Date(PREV),
      standardPriceAtAcquisition: 150_000_000,
      isOneHousehold: true,
      householdHousingCount: 2,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      isUnregistered: false,
      temporaryTwoHouse: {
        previousAcquisitionDate: new Date(PREV),
        newAcquisitionDate: new Date(newAcq),
        ...origin,
      },
      ...over,
    },
  } as EstateItem;
}
const giftForm = (giftDate: string, items: EstateItem[]): FormState =>
  ({ ...INITIAL_FORM, giftDate, donor: "father", giftItems: items }) as FormState;

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
const bodyOf = (origin: Era = {}, over: Partial<BurdenedGiftTransferTaxInput> = {}, newAcq = NEW_ACQ, giftDate = GIFT_DATE) =>
  buildGiftBurdenedTransferBody(giftItem(origin, over, newAcq), giftForm(giftDate, []));
const gift = (origin: Era = {}, over: Partial<BurdenedGiftTransferTaxInput> = {}, newAcq = NEW_ACQ) => run(bodyOf(origin, over, newAcq));
const originOf = (b: Obj) => (b.temporaryTwoHouse as Obj | undefined)?.newHouseOrigin;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

describe("B ④ 본문", () => {
  it("B-1 불변 — 미답(키 없음·빈 값)은 not_collected를 싣고 본문이 같다 (BT-E2E-7·11이 보는 모양)", () => {
    const legacy = bodyOf({});
    expect(legacy.temporaryTwoHouse).toEqual({ previousAcquisitionDate: PREV, newAcquisitionDate: NEW_ACQ, newHouseOrigin: { kind: "not_collected" } });
    expect(bodyOf({ newHouseOriginKind: "", newHouseRightAcquisitionDate: "", newHouseRightApprovalDate: "" })).toEqual(legacy);
  });
  it("B-2 답이 있으면 경위·권리 취득일이 본문에 실리고 계약일 칸을 권리 취득일이 덮는다", () => {
    const b = bodyOf({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2021-09-01", newHouseContractDate: "2018-06-15" });
    expect(originOf(b)).toEqual({ kind: "presale", rightAcquisitionDate: "2021-09-01" });
    expect((b.temporaryTwoHouse as Obj).newHouseContractDate).toBe("2021-09-01");
    // 일반·모름은 폼 계약일 칸을 그대로 쓴다
    const g = bodyOf({ newHouseOriginKind: "general", newHouseContractDate: "2018-06-15" });
    expect(originOf(g)).toEqual({ kind: "general" });
    expect((g.temporaryTwoHouse as Obj).newHouseContractDate).toBe("2018-06-15");
  });
  it("B-3 기존주택의 연장(자가 재건축)은 신규 주택 취득일이 기존주택 취득일로 바뀐다 — 양도세 명부 경로와 같다", () => {
    const b = bodyOf({ newHouseOriginKind: "self_rebuild", newHouseRightAcquisitionDate: "2022-01-10" });
    expect((b.temporaryTwoHouse as Obj).newAcquisitionDate).toBe("2022-01-10");
    expect(originOf(b)).toEqual({ kind: "self_rebuild", rightAcquisitionDate: "2022-01-10" });
    // 날짜를 모르면 완공일 그대로(엔진이 불성립 + 확인 필요)
    expect(((bodyOf({ newHouseOriginKind: "self_rebuild" })).temporaryTwoHouse as Obj).newAcquisitionDate).toBe(NEW_ACQ);
  });
  it("B-4 부정 짝 — 주택 수가 3이면(칸이 닫힘) 남은 답을 싣지 않는다", () => {
    const b = bodyOf({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2021-09-01" }, { householdHousingCount: 3 });
    expect(b.temporaryTwoHouse).toBeUndefined();
  });
});

describe("R route — 결론이 방향을 바꾼다", () => {
  it("R-1 불변 — 미답 = 일반 취득 답: 결론·세액이 같고 확인 필요만 걷힌다", async () => {
    const un = await gift({});
    const general = await gift({ newHouseOriginKind: "general" });
    expect({ isExempt: general.isExempt, totalTax: general.totalTax }).toEqual({ isExempt: un.isExempt, totalTax: un.totalTax });
    expect(un.isExempt).toBe(true);
    expect((un.warnings ?? []).join(" ")).toContain("답하지 않았거나 이 경로에서 묻지 못했습니다");
    expect((general.warnings ?? []).join(" ")).not.toContain("답하지 않았거나 이 경로에서 묻지 못했습니다");
  });
  it("R-2 순차 분양권(권리 2021-09-01 < 종전 2023-03-15) → 불성립: 비과세 → 과세", async () => {
    const un = await gift({});
    const seq = await gift({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2021-09-01" });
    expect(un.isExempt).toBe(true);
    expect(seq.isExempt).toBe(false);
    expect(seq.totalTax).toBeGreaterThan(un.totalTax);
  });
  it("R-3 같은 날 분양권·모름 → 불성립", async () => {
    expect((await gift({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: PREV })).isExempt).toBe(false);
    expect((await gift({ newHouseOriginKind: "unknown" })).isExempt).toBe(false);
  });
  it("R-4 분양권 2021.1.1. 전 취득은 현행 §155①(완공일 기산) → 비과세", async () => {
    expect((await gift({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2020-06-01" })).isExempt).toBe(true);
  });
  it("R-5 승계 입주권 3년 경계 — 권리 2024-06-17 · 3년 말일 2027-06-17(목): 증여 당일 비과세 / 다음 날 과세", async () => {
    const origin = { newHouseOriginKind: "successor_right", newHouseRightAcquisitionDate: "2024-06-17" } as const;
    const at = (giftDate: string) => run(bodyOf(origin, {}, "2025-01-15", giftDate));
    expect((await at("2027-06-17")).isExempt).toBe(true);
    expect((await at("2027-06-18")).isExempt).toBe(false);
  });
  it("R-6 양도세 명부 경로와 패리티 — 같은 경위·같은 날짜는 같은 비과세 결론", async () => {
    const answers = [
      { kind: "general" },
      { kind: "presale", date: "2021-09-01" },
      { kind: "presale", date: PREV },
      { kind: "presale", date: "2020-06-01" },
      { kind: "unknown" },
    ] as const;
    for (const a of answers) {
      const g = await gift({
        newHouseOriginKind: a.kind,
        ...("date" in a ? { newHouseRightAcquisitionDate: a.date } : {}),
      });
      const f = createDefaultTransferFormData();
      f.transferDate = GIFT_DATE;
      f.householdHousingCount = "2";
      f.isOneHousehold = true;
      f.contractTotalPrice = "300,000,000";
      f.householdNoPresaleRightsConfirmed = true;
      f.householdNoOtherHousesConfirmed = true;
      Object.assign(f.assets[0], {
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: PREV,
        actualSalePrice: "300,000,000",
        fixedAcquisitionPrice: "150,000,000",
        useEstimatedAcquisition: false,
        residenceInputMode: "direct",
        residencePeriodMonthsAsset: "0",
      });
      f.houses = [
        {
          id: "h-new",
          region: "non_capital",
          acquisitionDate: NEW_ACQ,
          officialPrice: "300000000",
          isInherited: false,
          isLongTermRental: false,
          isApartment: false,
          isOfficetel: false,
          isUnsoldHousing: false,
          acquisitionOrigin: a.kind,
          ...("date" in a ? { rightAcquisitionDate: a.date } : {}),
        },
      ] as never;
      let body: unknown;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_u: string, init: RequestInit) => {
          body = JSON.parse(String(init.body));
          return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
        }),
      );
      await callTransferTaxAPI(f).catch(() => undefined);
      vi.unstubAllGlobals();
      const t = await run(body);
      expect(g.isExempt, `${a.kind} ${"date" in a ? a.date : ""}`).toBe(t.isExempt);
    }
  });
});

describe("V ⑧ 검증", () => {
  const v = (origin: Era, over: Partial<BurdenedGiftTransferTaxInput> = {}) => validateStep(1, giftForm(GIFT_DATE, [giftItem(origin, over)]));
  it("V-1 미답·일반·모름은 막지 않는다", () => {
    expect(v({})).toBeNull();
    expect(v({ newHouseOriginKind: "general" })).toBeNull();
    expect(v({ newHouseOriginKind: "unknown" })).toBeNull();
  });
  it("V-2 권리 취득일 누락·완공일보다 늦음은 막고, 같은 날은 통과", () => {
    expect(v({ newHouseOriginKind: "presale" })).toContain("권리 취득일");
    expect(v({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: "2024-06-16" })).toContain("늦을 수 없");
    expect(v({ newHouseOriginKind: "presale", newHouseRightAcquisitionDate: NEW_ACQ })).toBeNull();
  });
  it("V-3 승계 입주권 인가일이 승계취득일보다 늦으면 막는다", () => {
    expect(
      v({ newHouseOriginKind: "successor_right", newHouseRightAcquisitionDate: "2005-06-01", newHouseRightApprovalDate: "2005-06-02" }, {}),
    ).toContain("승계취득일보다 늦을 수 없");
  });
  it("V-4 부정 짝 — 칸이 닫힌 주택 수 3이면 같은 오류도 막지 않는다", () => {
    expect(v({ newHouseOriginKind: "presale" }, { householdHousingCount: 3 })).toBeNull();
  });
});

describe("N ③ 복원", () => {
  it("N-1 JSON 왕복 후 새 필드가 살아남는다", () => {
    const origin: Era = { newHouseOriginKind: "successor_right", newHouseRightAcquisitionDate: "2008-06-01", newHouseRightApprovalDate: "2007-01-01" };
    const parsed = JSON.parse(JSON.stringify({ giftItems: [giftItem(origin)] }));
    const tt = normalizeRestoredFormDates(parsed).giftItems![0].burdenedGiftTransferTax!.temporaryTwoHouse!;
    expect(tt).toMatchObject(origin);
  });
});
