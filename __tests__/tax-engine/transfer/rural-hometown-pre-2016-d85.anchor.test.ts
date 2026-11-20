/**
 * PR-35 anchor (2026-11 리뷰 D-85) — 2016.2.17. 전에 취득한 귀농주택의 종전 「소득세법 시행령」 §155⑩1호 「연고지에 소재할 것」.
 *
 * ⑩1호는 대통령령 제26982호(2016.2.17.)로 삭제됐지만 그 부칙 제10조(⑩ 개정규정은 시행 이후 귀농주택을 취득하는 분부터)·제22조(시행 전
 * 취득분은 종전 규정)로 **귀농주택 취득일**이 2016-02-17 전이면 지금 양도해도 걸린다(2016.1.25. 시행본 MST 180012 · 부칙 MST 181100 ·
 * 연고지 정의 시행규칙 §73①② MST 169188 실독). 종전에는 판정·입력·고지 어디에서도 보지 않아 비과세로 확정했다.
 *
 * 공통: 일반주택 2010-01-01 취득(5억) · 귀농주택(면지역 · 500㎡ · 세대전원 이사 · ⑩4호 가목 본인 · ⑪ 없음 · 귀농 전 취득 예) · 양도 2026-06-01.
 *
 * | # | 귀농주택 취득 | 연고지 | 기대 |
 * |---|---|---|---|
 * | H-1 | 2016-02-16 | 예 | 비과세 |
 * | H-2 | 2016-02-16 | 아니오 | 과세(확정 — 확인 필요 없음) |
 * | H-3 | 2016-02-16 | 모름 · 키 없음(직접 호출) | 과세 + 확인 필요 |
 * | H-4 | 2016-02-17 | 무엇이든 | 연고지를 보지 않는다(⑦ 단서 5년 경과로 과세 — 답과 무관) · ④ 키 미전송 · ⑧ 묻지 않음 |
 * | H-5 | 2016-02-16 | 모름 + 대지 800㎡ | 「결론을 가를 때만」 — 확인 필요 고지 없음 |
 * | H-6 | 계산기 = 판정 메뉴 | 예/아니오 | 같은 결론 · ④ body에 `hometownLocated` |
 * | H-7 | D3(⑦ + ① 겹친 3주택 — E022-era 시료) | 아니오 | ⑦·① 중첩 불성립 |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { checkReturnToFarmFacts, withUnconfirmedFactsFavorable } from "@/lib/tax-engine/one-house/rural-return-to-farm-facts";
import { ruralHometownAsked, ruralReturnToFarmFactsIssue } from "@/lib/calc/one-house-row-facts";
import { observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { RETURN_TO_FARM_ROW_OK } from "../../_helpers/rural-return-to-farm-facts";
import E022 from "../../calc/one-house-rulings/cases/E022.json";

type Rural = NonNullable<TransferTaxInput["ruralHouse"]>;
const D = (s: string) => new Date(s);
const BEFORE = "2016-02-16";
const AFTER = "2016-02-17";
const UNCONFIRMED = "155-7-3ho-farm-facts-unconfirmed";
const RURAL = "155-7-rural:return_to_farm";

/** 연고지 답만 바꾸는 명부 행 — 나머지 귀농 사실은 유리한 답(픽스처 기본값이 게이트를 가리지 않게 연고지는 매번 명시) */
const ROW = { ...RETURN_TO_FARM_ROW_OK, ruralHometownLocated: undefined };

const judgmentCase = (house: Record<string, unknown>): RulingCase => ({
  id: "d85",
  docNo: "-",
  docDate: "-",
  basis: "era",
  today: "2026-10-10",
  summary: "종전 ⑩1호 연고지",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "500000000",
    asset: { assetKind: "housing", acquisitionDate: "2010-01-01" },
    houses: [
      {
        id: "rural",
        region: "non_capital",
        ruralHouseKind: "return_to_farm",
        ruralLandAreaSqm: "500",
        ruralWholeHouseholdMoved: true,
        ruralHighPriceAtAcquisition: false,
        oneHouseRuralHouse: true,
        ruralOutsideCapitalEupMyeon: true,
        ruralReturnedToFarmExitHouse: false,
        acquisitionOrigin: "general",
        ...ROW,
        ...house,
      },
    ],
  } as RulingCase["form"],
});

describe("엔진 — 취득일 축(2016-02-17 ±1일) × 연고지 답", () => {
  const base = (over: Partial<Rural>): Rural => ({
    kind: "return_to_farm",
    isOutsideCapitalEupMyeon: true,
    acquisitionDate: D(BEFORE),
    isHighPriceAtAcquisition: false,
    landAreaSqm: 500,
    wholeHouseholdMoved: true,
    farmlandBasis: "ga",
    farmlandHolder: "self",
    priorReturnFarmExemption: "none",
    generalHouseAcquiredBeforeReturn: "yes",
    ...over,
  });
  const check = (over: Partial<Rural>) => checkReturnToFarmFacts(base(over), D("2026-06-01"));
  it("2016-02-16: 예 충족 · 아니오 확정 불충족 · 모름/키 없음 확인 필요", () => {
    expect(check({ hometownLocated: "yes" }).qualified).toBe(true);
    const no = check({ hometownLocated: "no" });
    expect(no.qualified).toBe(false);
    expect(no.failed.join(" ")).toContain("§155⑩1호");
    expect(no.unconfirmed).toEqual([]);
    for (const h of ["unknown", undefined] as const) {
      const r = check({ hometownLocated: h });
      expect(r.qualified).toBe(false);
      expect(r.failed).toEqual([]);
      expect(r.unconfirmed.join(" ")).toContain("연고지");
    }
  });
  it("2016-02-17: 연고지를 보지 않는다(아니오여도 충족)", () => {
    expect(check({ acquisitionDate: D(AFTER), hometownLocated: "no" }).qualified).toBe(true);
    expect(check({ acquisitionDate: D(AFTER), hometownLocated: undefined }).qualified).toBe(true);
  });
  it("반사실 복사본 — 모름/키 없음만 예로 바꾸고 아니오는 그대로", () => {
    expect(withUnconfirmedFactsFavorable(base({ hometownLocated: "unknown" })).hometownLocated).toBe("yes");
    expect(withUnconfirmedFactsFavorable(base({})).hometownLocated).toBe("yes");
    expect(withUnconfirmedFactsFavorable(base({ hometownLocated: "no" })).hometownLocated).toBe("no");
  });
});

describe("⑤⑧ — 2016-02-17 전 취득 행에만 묻는다", () => {
  const row = (acq: string, h?: "yes" | "no" | "unknown") => ({
    oneHouseRuralHouse: true as const,
    ruralHouseKind: "return_to_farm" as const,
    ruralLandAreaSqm: "500",
    ...RETURN_TO_FARM_ROW_OK,
    acquisitionDate: acq,
    ruralHometownLocated: h,
  });
  it("칸 표시 술어", () => {
    expect(ruralHometownAsked(row(BEFORE))).toBe(true);
    expect(ruralHometownAsked(row(AFTER))).toBe(false);
    expect(ruralHometownAsked(row(""))).toBe(false);
    expect(ruralHometownAsked({ ...row(BEFORE), ruralHouseKind: "farm_exit" })).toBe(false);
  });
  it("⑧ — 미답이면 막고 「모름」은 통과 · 2016-02-17 이후 취득은 묻지 않는다", () => {
    expect(ruralReturnToFarmFactsIssue(row(BEFORE))?.field).toBe("ruralHometownLocated");
    expect(ruralReturnToFarmFactsIssue(row(BEFORE, "unknown"))).toBeNull();
    expect(ruralReturnToFarmFactsIssue(row(AFTER))).toBeNull();
  });
});

describe("판정 메뉴 route", () => {
  it("H-1 2016-02-16 · 연고지 예 → 비과세(귀농주택 특례)", async () => {
    const o = await observeCase(judgmentCase({ acquisitionDate: BEFORE, ruralHometownLocated: "yes" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toContain(RURAL);
  });
  it("H-2 2016-02-16 · 아니오 → 과세 확정 · 사유에 ⑩1호 · 확인 필요 없음", async () => {
    const o = await observeCase(judgmentCase({ acquisitionDate: BEFORE, ruralHometownLocated: "no" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.unmetReasons[RURAL].join(" ")).toContain("§155⑩1호");
    expect(o.undetermined).not.toContain(UNCONFIRMED);
  });
  it("H-3 2016-02-16 · 모름 → 과세 + 확인 필요 / 미답은 ⑧이 막는다", async () => {
    const unknown = await observeCase(judgmentCase({ acquisitionDate: BEFORE, ruralHometownLocated: "unknown" }));
    expect(unknown.validationErrors).toEqual([]);
    expect(unknown.isExempt).toBe(false);
    expect(unknown.undetermined).toContain(UNCONFIRMED);
    const blank = await observeCase(judgmentCase({ acquisitionDate: BEFORE }));
    expect(blank.validationErrors.join(" ")).toContain("ruralHometownLocated");
  });
  it("H-4 2016-02-17 · 연고지 답과 무관(⑦ 단서 5년 경과로 과세) · ⑧ 묻지 않음", async () => {
    const outcomes = [];
    for (const h of ["yes", "no", undefined]) {
      const o = await observeCase(judgmentCase({ acquisitionDate: AFTER, ruralHometownLocated: h }));
      expect(o.validationErrors).toEqual([]);
      outcomes.push([o.isExempt, o.undetermined.includes(UNCONFIRMED)]);
    }
    expect(outcomes).toEqual([
      [false, false],
      [false, false],
      [false, false],
    ]);
  });
  it("H-5 결론을 가를 때만 — 대지 800㎡로 어차피 불성립이면 모름이어도 확인 필요 고지 없음", async () => {
    const o = await observeCase(judgmentCase({ acquisitionDate: BEFORE, ruralHometownLocated: "unknown", ruralLandAreaSqm: "800" }));
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).not.toContain(UNCONFIRMED);
  });
  it("H-7 D3 — ⑦ + ① 겹친 3주택(E022-era 시료)도 연고지 아니오면 중첩 불성립", async () => {
    const era = (E022 as unknown as RulingCase[]).find((c) => c.id === "E022-era")!;
    const yes = await observeCase(era);
    expect(yes.isExempt).toBe(true);
    const no = structuredClone(era);
    for (const h of (no.form as unknown as { houses: Record<string, unknown>[] }).houses) {
      if (h.ruralHouseKind === "return_to_farm") h.ruralHometownLocated = "no";
    }
    const o = await observeCase(no);
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
  });
});

describe("H-6 계산기 = 판정 메뉴 · ④ body", () => {
  const calc = async (house: Record<string, unknown>) => {
    const f = createDefaultTransferFormData();
    f.transferDate = "2026-06-01";
    f.isOneHousehold = true;
    f.contractTotalPrice = "500000000";
    f.householdNoPresaleRightsConfirmed = true;
    f.householdNoOtherHousesConfirmed = true;
    f.residencePeriodMonths = "0";
    Object.assign(f.assets[0], {
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      actualSalePrice: "500000000",
      fixedAcquisitionPrice: "300000000",
      addressJibun: "테스트 주소 1",
      regionCode: "4377037000",
      residenceInputMode: "direct",
      residencePeriods: [],
      residencePeriodMonthsAsset: "0",
    });
    f.householdHousingCount = "2";
    f.houses = [
      {
        id: "rural",
        region: "non_capital",
        regionCode: "4377037000",
        officialPrice: "100000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: false,
        isOfficetel: false,
        isUnsoldHousing: false,
        acquisitionOrigin: "general",
        ruralHouseKind: "return_to_farm",
        ruralLandAreaSqm: "500",
        ruralWholeHouseholdMoved: true,
        ruralHighPriceAtAcquisition: false,
        oneHouseRuralHouse: true,
        ruralOutsideCapitalEupMyeon: true,
        ruralReturnedToFarmExitHouse: false,
        ...ROW,
        ...house,
      } as never,
    ];
    let body: Record<string, unknown> = {};
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_u: unknown, init?: RequestInit) => {
      body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
    }) as never;
    try {
      await callTransferTaxAPI(f);
    } catch {
      /* 본문만 본다 */
    } finally {
      globalThis.fetch = realFetch;
    }
    const res = await SINGLE(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = (await res.json()) as { data: { result: { isExempt: boolean; totalTax: number } } };
    return { status: res.status, rural: body.ruralHouse as Record<string, unknown> | undefined, result: json.data?.result };
  };
  it("2016-02-16 · 예 → 비과세 / 아니오 → 과세 · body에 연고지 답", async () => {
    const yes = await calc({ acquisitionDate: BEFORE, ruralHometownLocated: "yes" });
    expect(yes.status).toBe(200);
    expect(yes.rural).toMatchObject({ hometownLocated: "yes" });
    expect(yes.result.isExempt).toBe(true);
    const no = await calc({ acquisitionDate: BEFORE, ruralHometownLocated: "no" });
    expect(no.rural).toMatchObject({ hometownLocated: "no" });
    expect(no.result.isExempt).toBe(false);
    expect(no.result.totalTax).toBeGreaterThan(0);
  });
  it("2016-02-17 이후 취득 행에 남은 답은 싣지 않는다", async () => {
    const after = await calc({ acquisitionDate: AFTER, ruralHometownLocated: "no" });
    expect(after.rural).toBeDefined();
    expect(after.rural).not.toHaveProperty("hometownLocated");
  });
});
