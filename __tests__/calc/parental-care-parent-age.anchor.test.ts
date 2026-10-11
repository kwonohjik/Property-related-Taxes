/**
 * anchor (결정 #9 · G6-2) — 동거봉양 합가(§155④ · §156의2⑧2호)의 **직계존속 연령 요건**: 합가일 현재 만 60세 이상(일부 요양급여 60세 미만).
 *
 * 조문(KoreanLaw MCP — 현행 MST 290841 원문): §155④ 본문·1호~3호, §156의2⑧2호(요양급여 예외 없음), §155② 단서(요양급여 예외 없음).
 * 해석례 원문 확인: 재산세과-291(합가일 기준 — 합가 시 54세, 당시 여자 55세 요건) · 서면법규과-820(母 60세 미만 + 祖母 60세 이상이면 적용) ·
 * 사전-2015-법령해석재산-0424[법령해석과-3356](세대합가일 기준, 만 나이 — 民法 §158).
 *
 * 변경 전(master 6362a525b 실측): 판정 메뉴 E122-current referenceForm — 합가일만 넣으면 연령과 무관하게 isExempt=true
 * (applied 155-4-parental-care-merge), 연령 입력·검증·고지 없음. 이제 연령 칸(`parentalCareParentAge`)을 ⑤⑧④⑫⑭ 전 경로에 배선한다.
 * 모든 부정 단언에 긍정 짝(한 갈래만 바꾼 쌍둥이)을 둔다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { POST as POST_SINGLE } from "@/app/api/calc/transfer/route";
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildMergeFacts, buildParentalCareMergeFact } from "@/lib/calc/transfer-tax-api-body-blocks";
import { validateStepDetailed } from "@/lib/calc/transfer-tax-validate";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";
import { giftBurdenedMergeAgeError, buildGiftBurdenedMergePayload } from "@/lib/calc/gift-burdened-one-house";
import { PARENTAL_CARE_PARENT_AGE_REQUIRED_MESSAGE } from "@/lib/calc/parental-care-age-issue";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { parentalCareAgeVerdict } from "@/lib/tax-engine/one-house/parental-care-age";
import { resolveMergeCompositionConfirmNotice, resolveDeemedOneHouseBy155 } from "@/lib/tax-engine/one-house/merge-deeming";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Age = "" | "over_60" | "care_benefit" | "none";

describe("G-1 leaf — 연령 판정 표(경로별)", () => {
  it("§155④ 경로는 요양급여 갈래를 인정하고, §156의2⑧2호·§155② 단서 경로는 인정하지 않는다", () => {
    expect(parentalCareAgeVerdict("over_60", "155_4")).toBe("met");
    expect(parentalCareAgeVerdict("over_60", "156_2_8")).toBe("met");
    expect(parentalCareAgeVerdict("care_benefit", "155_4")).toBe("met");
    expect(parentalCareAgeVerdict("care_benefit", "156_2_8")).toBe("unmet");
    expect(parentalCareAgeVerdict("none", "155_4")).toBe("unmet");
    expect(parentalCareAgeVerdict("none", "156_2_8")).toBe("unmet");
    expect(parentalCareAgeVerdict(undefined, "155_4")).toBe("unknown");
    expect(parentalCareAgeVerdict(undefined, "156_2_8")).toBe("unknown");
  });
});

describe("G-2 ④ — 네 생산 지점이 같은 leaf로 연령 키를 싣는다", () => {
  it("buildParentalCareMergeFact — 합가일 없으면 키 없음 · 미선택은 parentAge 없이 · 선택하면 싣는다 · 무효 값은 버린다", () => {
    expect(buildParentalCareMergeFact(undefined, "over_60")).toEqual({});
    expect(buildParentalCareMergeFact("", "over_60")).toEqual({});
    expect(buildParentalCareMergeFact("2020-03-01", "")).toEqual({ parentalCareMerge: { mergeDate: "2020-03-01" } });
    expect(buildParentalCareMergeFact("2020-03-01", "care_benefit")).toEqual({
      parentalCareMerge: { mergeDate: "2020-03-01", parentAge: "care_benefit" },
    });
    expect(buildParentalCareMergeFact("2020-03-01", "stale-garbage")).toEqual({ parentalCareMerge: { mergeDate: "2020-03-01" } });
  });
  it("계산기·증여 부담부 공용 buildMergeFacts / 증여 슬라이스", () => {
    expect(buildMergeFacts({ parentalCareMergeDate: "2020-03-01", parentalCareParentAge: "none" })).toMatchObject({
      parentalCareMerge: { mergeDate: "2020-03-01", parentAge: "none" },
    });
    const bgt = { householdHousingCount: 2, parentalCareMergeDate: "2020-03-01", parentalCareParentAge: "over_60" } as never;
    expect(buildGiftBurdenedMergePayload(bgt)).toMatchObject({ parentalCareMerge: { parentAge: "over_60" } });
  });
});

const houseRow = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "parent",
    region: "capital",
    acquisitionDate: "2005-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    mergeOrigin: "counterpart_side",
    ...over,
  }) as unknown as HouseEntry;

/** 계산기 폼 — 자녀 주택(양도) 2015-06-01 · 부모 주택 2005-01-01(합가 전) · 동거봉양 2020-03-01 · 양도 2023-06-01 8억 */
function cForm(age: Age, over: Partial<TransferFormData> = {}): TransferFormData {
  const f = createDefaultTransferFormData();
  return {
    ...f,
    transferDate: "2023-06-01",
    filingDate: "2023-08-31",
    contractTotalPrice: "800000000",
    householdHousingCount: "2",
    isOneHousehold: true,
    isRegulatedArea: false,
    residencePeriodMonths: "60",
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2015-06-01",
        fixedAcquisitionPrice: "400000000",
        actualSalePrice: "800000000",
      } as AssetForm,
    ],
    houses: [houseRow()],
    householdNoPresaleRightsConfirmed: true,
    parentalCareMergeDate: "2020-03-01",
    parentalCareParentAge: age,
    isFirstTransferredInMerge: true,
    ...over,
  };
}

async function captureCalcBody(f: TransferFormData): Promise<Record<string, unknown>> {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(f);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  return captured as Record<string, unknown>;
}

async function postSingle(body: Record<string, unknown>) {
  const res = await POST_SINGLE(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result as { isExempt: boolean; totalTax: number; warnings?: string[] };
}

describe("G-3 ④→⑫→⑭ — 계산기 단건 route", () => {
  it("★ 합가일 현재 만 60세 이상 → 비과세 / 요양급여 60세 미만(§155④3호) → 비과세 (변경 전: 연령 무관 비과세)", async () => {
    for (const age of ["over_60", "care_benefit"] as const) {
      const body = await captureCalcBody(cForm(age));
      expect((body.parentalCareMerge as { parentAge?: string }).parentAge).toBe(age);
      const r = await postSingle(body);
      expect(r.isExempt, age).toBe(true);
      expect(r.totalTax, age).toBe(0);
    }
  });
  it("🔴 부정 짝 — 「해당 없음」 → 합가 특례 불성립 ⇒ 과세 (변경 전: 비과세)", async () => {
    const r = await postSingle(await captureCalcBody(cForm("none")));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
  });
  it("🔴 미선택(직접 호출·stale 세션) → 불성립 + 확인 필요 경고(결론을 가를 때만) — ⑧이 화면에서 막는 값이다", async () => {
    const body = await captureCalcBody(cForm(""));
    expect((body.parentalCareMerge as { parentAge?: string }).parentAge).toBeUndefined();
    const r = await postSingle(body);
    expect(r.isExempt).toBe(false);
    expect((r.warnings ?? []).join("\n")).toContain("직계존속 연령 요건");
    // 긍정 짝 — 한 갈래만 고르면 경고가 사라지고 비과세
    const picked = await postSingle(await captureCalcBody(cForm("over_60")));
    expect((picked.warnings ?? []).join("\n")).not.toContain("직계존속 연령 요건");
  });
});

describe("G-4 ④→⑫→⑭ — 다건 route", () => {
  async function multi(f: TransferFormData) {
    const payload = buildPropertyPayload(f) as Record<string, unknown>;
    const res = await POST_MULTI(
      new NextRequest("http://localhost/api/calc/transfer/multi", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxYear: 2023, properties: [{ propertyId: "p1", propertyLabel: "건1", ...payload }] }),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
    return { payload, total: json.data.result?.totalTax ?? json.data.totalTax ?? json.data.result?.totalTaxPayable };
  }
  it("🔴 다건도 연령을 싣고 route가 엔진까지 보낸다 — 연령이 세액을 가른다(손사본 누락 시 늘 불성립)", async () => {
    const ok = await multi(cForm("over_60"));
    const none = await multi(cForm("none"));
    expect((ok.payload.parentalCareMerge as { parentAge?: string }).parentAge).toBe("over_60");
    expect(ok.total).toBe(0);
    expect(none.total).toBeGreaterThan(0);
  });
});

describe("G-5 ⑧ — 합가일을 넣고 연령을 고르지 않으면 차단 (하위 1 가)", () => {
  it("계산기 — 미선택 → 차단 / 선택하면 통과 / 합가일이 없으면 묻지 않는다", () => {
    const msg = (f: TransferFormData) => validateStepDetailed(1, f)?.message ?? "";
    expect(msg(cForm(""))).toContain(PARENTAL_CARE_PARENT_AGE_REQUIRED_MESSAGE.slice(0, 20));
    expect(msg(cForm("over_60"))).not.toContain("직계존속의 연령");
    expect(msg(cForm("", { parentalCareMergeDate: "" }))).not.toContain("직계존속의 연령");
  });
  it("판정 메뉴 — 같은 규칙·문구(칸 노출 게이트와 동일)", () => {
    const j = (over: Record<string, unknown>) =>
      ({ ...createInitialOneHouseJudgmentForm(), ...cForm("", {}), ...over }) as unknown as OneHouseJudgmentFormData;
    const msgs = (f: OneHouseJudgmentFormData) => validateStep2(f).filter((e) => e.severity === "error").map((e) => e.message).join("|");
    expect(msgs(j({}))).toContain("직계존속의 연령");
    expect(msgs(j({ parentalCareParentAge: "none" }))).not.toContain("직계존속의 연령");
  });
  it("증여 부담부 — 같은 규칙(세대 주택 수 2 이상일 때만)", () => {
    const bgt = (age: string, count = 2) => ({ householdHousingCount: count, parentalCareMergeDate: "2020-03-01", parentalCareParentAge: age }) as never;
    expect(giftBurdenedMergeAgeError(bgt(""))).toBe(PARENTAL_CARE_PARENT_AGE_REQUIRED_MESSAGE);
    expect(giftBurdenedMergeAgeError(bgt("over_60"))).toBeNull();
    expect(giftBurdenedMergeAgeError(bgt("", 1))).toBeNull(); // 칸이 없는 구간은 막지 않는다
  });
});

describe("G-6 §155② 단서 칩과 연령 칸이 어긋나면 경고 (비차단)", () => {
  const j = (age: Age, chip: boolean) =>
    ({
      ...createInitialOneHouseJudgmentForm(),
      ...cForm(age),
      houses: [houseRow({ isInherited: true, inheritedDate: "2019-01-01", parentalCareMergeInheritedHouse: chip })],
    }) as unknown as OneHouseJudgmentFormData;
  it("칩 ON + 연령 「해당 없음」·요양급여 → 경고 / 칩 ON + 60세 이상 → 경고 없음 / 칩 OFF → 경고 없음", () => {
    const warns = (f: OneHouseJudgmentFormData) => validateStep2(f).filter((e) => e.severity === "warning" && e.field === "parentalCareParentAge");
    expect(warns(j("none", true))).toHaveLength(1);
    expect(warns(j("care_benefit", true))).toHaveLength(1);
    expect(warns(j("over_60", true))).toHaveLength(0);
    expect(warns(j("none", false))).toHaveLength(0);
  });
});

describe("G-7 판정 메뉴 전 구간 (폼 → ④ → ⑫ → route → 엔진) — §155④ 주택 경로", () => {
  const judgment = (age: Age): RulingCase => ({
    id: "G6-2-probe",
    docNo: "",
    docDate: "",
    basis: "current",
    today: "2026-10-11",
    summary: "probe",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2026-03-20",
      contractTotalPrice: "800000000",
      parentalCareMergeDate: "2018-05-15",
      parentalCareParentAge: age,
      isFirstTransferredInMerge: true,
      asset: { assetKind: "housing", acquisitionDate: "2012-05-15" },
      houses: [{ id: "parent", region: "capital", acquisitionDate: "2000-05-15", mergeOrigin: "counterpart_side" }],
    } as never,
  });
  it("★ 60세 이상 · 요양급여 → 비과세(applied 155-4) / 변경 전 E122-current referenceForm은 연령 없이도 비과세였다", async () => {
    for (const age of ["over_60", "care_benefit"] as const) {
      const o = await observeCase(judgment(age));
      expect(o.validationErrors, age).toEqual([]);
      expect(o.isExempt, age).toBe(true);
      expect(o.appliedExceptions, age).toContain("155-4-parental-care-merge");
    }
  });
  it("🔴 해당 없음 → 과세 + 불성립 사유(고지 없음) / 미선택 → 과세 + ⑧ 오류 + 확인 필요 사유", async () => {
    const none = await observeCase(judgment("none"));
    expect(none.isExempt).toBe(false);
    expect(none.unmetReasons["155-4-parental-care-merge"]?.join(" ")).toContain("만 60세 미만");
    expect(none.undetermined).toEqual([]);
    const blank = await observeCase(judgment(""));
    expect(blank.isExempt).toBe(false);
    expect(blank.validationErrors.join(" ")).toContain("parentalCareParentAge");
    expect(Object.values(blank.unmetReasons).flat().join(" ")).toContain("확인 필요");
  });
});

describe("G-8 §156의2⑧2호 — 입주권·분양권 합가 경로 (요양급여 갈래 없음)", () => {
  const rights = (age: Age, kind: string = "house_only"): RulingCase => ({
    id: "G6-2-right",
    docNo: "",
    docDate: "",
    basis: "current",
    today: "2026-10-11",
    summary: "probe",
    bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2024-06-01",
      contractTotalPrice: "900000000",
      parentalCareMergeDate: "2020-03-01",
      parentalCareParentAge: age,
      isFirstTransferredInMerge: true,
      mergedHouseholdFirstHouseKind: kind,
      asset: { assetKind: "housing", acquisitionDate: "2015-06-01" },
      presaleRights: [{ id: "r", type: "redevelopment_right", memberOrigin: "successor", acquisitionDate: "2016-10-01", region: "capital" }],
    } as never,
  });
  it("★ 60세 이상 + 구성 선택 → ⑧3호 성립(비과세) / 부정 짝: 요양급여 60세 미만은 이 경로에 없어 과세 + 사유", async () => {
    const ok = await observeCase(rights("over_60"));
    expect(ok.isExempt).toBe(true);
    const care = await observeCase(rights("care_benefit"));
    expect(care.isExempt).toBe(false);
    expect(Object.values(care.unmetReasons).flat().join(" ")).toContain("§155④3호에만");
  });
  it("🔴 해당 없음 → 과세 / 미선택 → 과세 + 확인 필요(89-2-confirm)", async () => {
    expect((await observeCase(rights("none"))).isExempt).toBe(false);
    const blank = await observeCase(rights(""));
    expect(blank.isExempt).toBe(false);
    expect(blank.undetermined.some((id) => id.startsWith("89-2-confirm"))).toBe(true);
    // 긍정 짝 — 선택하면 확인 필요가 사라진다
    expect((await observeCase(rights("over_60"))).undetermined.some((id) => id.startsWith("89-2-confirm"))).toBe(false);
  });
});

describe("G-9 같은 leaf를 쓰는 소비처 — 중과 배제 ① 요소 · 확인 필요 문구 · 요건 검토표", () => {
  const input = (age: string | undefined) =>
    ({
      isOneHousehold: true,
      householdHousingCount: 2,
      acquisitionDate: new Date("2015-06-01"),
      transferDate: new Date("2023-06-01"),
      sellingHouseId: "selling",
      houses: [
        { id: "selling", acquisitionDate: new Date("2015-06-01"), officialPrice: 3e8, region: "capital", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false },
        { id: "parent", acquisitionDate: new Date("2005-01-01"), officialPrice: 3e8, region: "capital", isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false, mergeOrigin: "counterpart_side" },
      ],
      parentalCareMerge: { mergeDate: new Date("2020-03-01"), ...(age ? { parentAge: age } : {}) },
      isFirstTransferredInMerge: true,
    }) as never;
  it("의제(중과 15호 ① 요소가 읽는 정본): 60세 이상·요양급여 → parental_care_merge / 해당 없음·미선택 → 의제 없음", () => {
    expect(resolveDeemedOneHouseBy155(input("over_60"), undefined)).toBe("parental_care_merge");
    expect(resolveDeemedOneHouseBy155(input("care_benefit"), undefined)).toBe("parental_care_merge");
    expect(resolveDeemedOneHouseBy155(input("none"), undefined)).toBeUndefined();
    expect(resolveDeemedOneHouseBy155(input(undefined), undefined)).toBeUndefined();
  });
  it("확인 필요 문구는 미선택(모름)일 때만 — 「해당 없음」은 사실의 선언이라 고지가 없다", () => {
    expect(resolveMergeCompositionConfirmNotice(input(undefined))).toContain("직계존속 연령 요건");
    expect(resolveMergeCompositionConfirmNotice(input("none"))).toBeUndefined();
    expect(resolveMergeCompositionConfirmNotice(input("over_60"))).toBeUndefined();
  });
});

describe("G-11 §155⑳ 합가 중첩 · 이중 합가 · 검토표 행 · C6 양론 재판정이 같은 leaf를 따른다", () => {
  const D = (s: string) => new Date(s);
  const row = (id: string, acq: string, over: Record<string, unknown> = {}) => ({
    id,
    acquisitionDate: D(acq),
    officialPrice: 3e8,
    region: "capital" as const,
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  });

  it("§155⑳ — 거주주택 + 장기임대 + 동거봉양 상대 쪽 주택: 60세 이상이면 met(parental_care_merge) / 해당 없음이면 exceeded", async () => {
    const { resolveRentalResidenceComposition } = await import("@/lib/tax-engine/transfer-tax-rental-residence-composition");
    const { parseRatesFromMap } = await import("@/lib/tax-engine/transfer-tax-helpers");
    const { baseTransferInput } = await import("../tax-engine/_helpers/mock-rates");
    const parsed = parseRatesFromMap(makeMockRates());
    const build = (age?: string) =>
      baseTransferInput({
        propertyType: "housing",
        acquisitionDate: D("2015-01-01"),
        transferDate: D("2023-06-01"),
        isOneHousehold: true,
        householdHousingCount: 3,
        sellingHouseId: "selling",
        houses: [
          row("selling", "2015-01-01"),
          row("rental", "2016-01-01", { isLongTermRental: true, isApartment: false }),
          row("parent", "2005-01-01", { mergeOrigin: "counterpart_side" }),
        ],
        parentalCareMerge: { mergeDate: D("2020-03-01"), ...(age ? { parentAge: age } : {}) },
        isFirstTransferredInMerge: true,
      } as never);
    expect(resolveRentalResidenceComposition(build("over_60"), parsed)).toEqual({ status: "met", via: "parental_care_merge" });
    expect(resolveRentalResidenceComposition(build("none"), parsed)).toMatchObject({ status: "exceeded" });
    // 모름 — 확인 필요 문구가 실린다(결론을 가를 때만)
    const unknown = resolveRentalResidenceComposition(build(undefined), parsed);
    expect(unknown).toMatchObject({ status: "exceeded" });
    expect(unknown.status === "exceeded" && unknown.confirmNotice).toContain("직계존속 연령 요건");
  });

  it("C6 양론 재판정(입주권 양도) — 연령 요건을 못 채우면 동거봉양 합가 적용 입장도 서지 않는다", async () => {
    const { resolveRightSaleMarriageMerge } = await import("@/lib/tax-engine/one-house/right-sale-marriage-merge");
    const base = (age?: string) =>
      ({
        parentalCareMerge: { mergeDate: D("2020-03-01"), ...(age ? { parentAge: age } : {}) },
        isFirstTransferredInMerge: true,
        acquisitionDate: D("2015-06-01"),
        transferDate: D("2023-06-01"),
        houses: [row("selling", "2015-06-01"), row("parent", "2005-01-01", { mergeOrigin: "counterpart_side" })],
        sellingHouseId: "selling",
        contestedRightSaleParentalCareMergeApply: true,
      }) as never;
    expect(resolveRightSaleMarriageMerge(base("over_60"))?.status).toBe("applies");
    expect(resolveRightSaleMarriageMerge(base("care_benefit"))?.status).toBe("applies"); // §155④3호 — 주택 경로와 같은 입장
    expect(resolveRightSaleMarriageMerge(base("none"))).toBeNull();
    expect(resolveRightSaleMarriageMerge(base(undefined))).toBeNull();
  });
});
