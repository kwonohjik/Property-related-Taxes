/**
 * anchor — 보유 감면주택(소령 §167의3①5호 · 소득세법 §89①3호 주택 수 제외)의 §99·§99의3 «유형» (리뷰 NH-23 · NH-24)
 *
 * 결함 NH-24: §99·§99의3 선언의 취득기간을 「취득일 또는 계약일 중 하나만 창 안」이면 통과시켰다. 그러나 호마다 기준일이 하나다 —
 *   매수(§99①2호 · §99의3①1호) = 최초 매매계약일 + 계약금 납부 / 자기건설(§99①1호 · §99의3①2호) = 사용승인·사용검사일.
 * 결함 NH-23: 원시 §99의3(2001.1.16. 시행본 MST 53785: 수도권 밖 국민주택 · 신축주택취득기간 2000.11.1.~2001.12.31.)로 감면받는 주택은
 *   법률 제6501호(2001.8.14.) 부칙 제13조 「2001년 5월 23일전에 … 취득」분이 종전 규정인데, 현행 창(2001.5.23.~2003.6.30.)만 보아 5호로 인정하지 않았다.
 * 결정: 유형을 칸으로 받는다. 원시 §99의3은 수도권 밖·국민주택을 3-state로 받고 「모름」은 불성립 + 확인 필요.
 *
 * 세액 시료(프로덕션 fallback 세율 · 양도 2026-09-18 · 20억 · 2주택 중 한 채가 보유 감면주택): 5호로 인정되면 영 §167의10①10호로 중과 배제 →
 *   582,598,500 / 아니면 2주택 중과 → 1,141,178,500. 전(前) 실측은 각 케이스에 적었다(변경 전 master와 같은 시료 비교).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../_helpers/mock-rates";
import { resolveSpecialHouseExclusions } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import {
  evaluateNewHousingKind,
  newHousingKindFieldsOf,
  newHousingKindOptions,
} from "@/lib/tax-engine/transfer-reductions/special-house-exclusion-kind";
import { newHousingKindErrors, collectSpecialHouseExclusionRowErrors } from "@/lib/calc/house-count-exclusion-reduction-validate";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const D = (s: string) => new Date(s);
const GN = "1168010100";
const house = (id: string, acq: string) => ({
  id, acquisitionDate: D(acq), officialPrice: 300_000_000, region: "capital" as const, regionCode: GN,
  isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false,
});

const EXCLUDED = 582_598_500; // 5호 인정 → 10호 배제
const SURCHARGED = 1_141_178_500; // 2주택 중과

function run(decl: Record<string, unknown>) {
  const i = baseTransferInput({
    transferPrice: 2_000_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D("2015-01-01"), transferDate: D("2026-09-18"),
    isRegulatedArea: true, wasRegulatedAtAcquisition: false, residencePeriodMonths: 0, regionCode: GN, sellingHouseId: "selling",
    householdHousingCount: 2, houses: [house("selling", "2015-01-01"), house("s", "2002-08-01")],
    specialHouseExclusions: [{ houseId: "s", requirementsConfirmed: true, ...decl }],
  } as never);
  const r = calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
  return { tax: r.totalTax, reasons: (r.multiHouseSurchargeEvaluation?.exclusionReasons ?? []).map((e) => e.type).join(",") };
}

describe("NH-24 §99의3 — 호마다 기준일 하나 (전: 둘 중 하나만 창 안이면 통과)", () => {
  it("매수 · 계약 창 안(2002-05-01) · 취득일은 창 밖 → 5호 인정 (전·후 같음)", () => {
    expect(run({ article: "new_99_3", housingKind: "purchase", houseContractDate: D("2002-05-01"), houseAcquisitionDate: D("2005-09-01") }).tax).toBe(EXCLUDED);
  });
  it("🔴 매수 · 계약 창 밖(2004-01-01) · 취득일만 창 안 → 불성립 (전 582,598,500 → 후 1,141,178,500)", () => {
    const r = run({ article: "new_99_3", housingKind: "purchase", houseContractDate: D("2004-01-01"), houseAcquisitionDate: D("2002-08-01") });
    expect(r.tax).toBe(SURCHARGED);
    expect(r.reasons).toBe("");
  });
  it("자기건설 · 사용승인(취득일) 창 안 · 계약일은 창 밖 → 5호 인정 (전·후 같음)", () => {
    expect(run({ article: "new_99_3", housingKind: "self_built", houseContractDate: D("2000-01-01"), houseAcquisitionDate: D("2002-08-01") }).tax).toBe(EXCLUDED);
  });
  it("🔴 자기건설 · 사용승인 창 밖(2004-01-01) · 계약일만 창 안 → 불성립 (전 582,598,500 → 후 1,141,178,500)", () => {
    expect(run({ article: "new_99_3", housingKind: "self_built", houseContractDate: D("2002-05-01"), houseAcquisitionDate: D("2004-01-01") }).tax).toBe(SURCHARGED);
  });
  it("경계: 매수 계약 2001-05-22(창 직전) 불성립 · 2001-05-23 성립 · 2003-06-30 성립 · 2003-07-01 불성립", () => {
    const at = (d: string) => resolveSpecialHouseExclusions([{ article: "new_99_3", housingKind: "purchase", houseContractDate: D(d), requirementsConfirmed: true }] as never, D("2007-11-30")).excludedCount;
    expect([at("2001-05-22"), at("2001-05-23"), at("2003-06-30"), at("2003-07-01")]).toEqual([0, 1, 1, 0]);
  });
});

describe("NH-24 §99 — 같은 규칙 (신축주택취득기간 1998.5.22~1999.6.30. · 국민주택 ~1999.12.31.)", () => {
  it("매수 계약 창 안 → 인정 / 🔴 계약 창 밖 + 취득일만 안 → 불성립 (전 582,598,500 → 후 1,141,178,500)", () => {
    expect(run({ article: "new_99", housingKind: "purchase", houseContractDate: D("1998-08-01"), houseAcquisitionDate: D("2000-01-01") }).tax).toBe(EXCLUDED);
    expect(run({ article: "new_99", housingKind: "purchase", houseContractDate: D("1997-01-01"), houseAcquisitionDate: D("1999-01-01") }).tax).toBe(SURCHARGED);
  });
  it("자기건설 사용승인 창 안 → 인정 · 국민주택이면 종기가 1999.12.31.", () => {
    expect(run({ article: "new_99", housingKind: "self_built", houseAcquisitionDate: D("1999-03-01") }).tax).toBe(EXCLUDED);
    const at = (d: string, national: boolean) =>
      resolveSpecialHouseExclusions([{ article: "new_99", housingKind: "self_built", houseAcquisitionDate: D(d), isNationalHousing: national, requirementsConfirmed: true }] as never, D("2007-06-15")).excludedCount;
    expect([at("1999-09-01", false), at("1999-09-01", true)]).toEqual([0, 1]);
  });
});

describe("NH-23 원시 §99의3 — 2001.5.23. 전 취득 · 수도권 밖 국민주택 (법률 제6501호 부칙 제13조)", () => {
  const orig = { article: "new_99_3", houseContractDate: D("2001-03-01"), houseAcquisitionDate: D("2001-05-01"), originalOutsideMetropolitan: "yes", originalNationalHousing: "yes" };
  it("🔴 매수 · 계약 2001-03-01 · 취득 2001-05-01 · 수도권 밖 예 · 국민주택 예 → 5호 인정 (전 1,141,178,500 → 후 582,598,500)", () => {
    expect(run({ ...orig, housingKind: "original_purchase" }).tax).toBe(EXCLUDED);
  });
  it("🔴 자기건설 · 사용승인(취득) 2001-02-01 → 5호 인정 (전 1,141,178,500 → 후 582,598,500)", () => {
    expect(run({ article: "new_99_3", housingKind: "original_self_built", houseAcquisitionDate: D("2001-02-01"), originalOutsideMetropolitan: "yes", originalNationalHousing: "yes" }).tax).toBe(EXCLUDED);
  });
  it("짝 — 국민주택 「모름」 → 불성립 + 확인 필요 (1,141,178,500 · unconfirmed)", () => {
    expect(run({ ...orig, housingKind: "original_purchase", originalNationalHousing: "unknown" }).tax).toBe(SURCHARGED);
    const e = resolveSpecialHouseExclusions([{ ...orig, housingKind: "original_purchase", originalNationalHousing: "unknown", requirementsConfirmed: true }] as never, D("2007-06-15")).entries[0];
    expect(e.eligible).toBe(false);
    expect(e.unconfirmed).toBe(true);
    expect(e.reason).toContain("확인 필요");
  });
  it("짝 — 수도권 밖 「아니오」 → 불성립(확인 필요 아님) · 1,141,178,500", () => {
    expect(run({ ...orig, housingKind: "original_purchase", originalOutsideMetropolitan: "no" }).tax).toBe(SURCHARGED);
    const e = resolveSpecialHouseExclusions([{ ...orig, housingKind: "original_purchase", originalOutsideMetropolitan: "no", requirementsConfirmed: true }] as never, D("2007-06-15")).entries[0];
    expect(e.unconfirmed).toBeUndefined();
  });
  it("짝 — 취득일이 2001-05-23 이후면 종전 규정 대상이 아니다 (부칙 제13조 «2001년 5월 23일전에 … 취득»)", () => {
    expect(run({ ...orig, housingKind: "original_purchase", houseAcquisitionDate: D("2001-06-01") }).tax).toBe(SURCHARGED);
    const f = evaluateNewHousingKind({ ...orig, housingKind: "original_purchase", houseAcquisitionDate: D("2001-05-23"), originalOutsideMetropolitan: "yes", originalNationalHousing: "yes" } as never, [], "x");
    expect(f?.reason).toContain("법률 제6501호 부칙 제13조");
    expect(evaluateNewHousingKind({ ...orig, housingKind: "original_purchase", houseAcquisitionDate: D("2001-05-22") } as never, [], "x")).toBeUndefined();
  });
  it("짝 — 원시 창(2000.11.1.~2001.12.31.) 밖의 계약은 불성립", () => {
    expect(run({ ...orig, housingKind: "original_purchase", houseContractDate: D("2000-10-31"), houseAcquisitionDate: D("2001-01-01") }).tax).toBe(SURCHARGED);
  });
  it("원시 유형은 §99의3에서만 고른다 (§99에서는 매수·자기건설뿐)", () => {
    expect(newHousingKindOptions("new_99")).toEqual(["purchase", "self_built"]);
    expect(newHousingKindOptions("new_99_3")).toHaveLength(4);
    expect(run({ ...orig, article: "new_99", housingKind: "original_purchase" }).tax).toBe(SURCHARGED);
  });
});

describe("유형 미선택 — 자동 안분 fallback 금지: 불성립 + 확인 필요", () => {
  it("유형 없는 §99의3 선언(옛 기록·직접 API)은 불성립이고 사유에 확인 필요가 있다", () => {
    expect(run({ article: "new_99_3", houseAcquisitionDate: D("2002-08-01") }).tax).toBe(SURCHARGED);
    const e = resolveSpecialHouseExclusions([{ article: "new_99_3", houseAcquisitionDate: D("2002-08-01"), requirementsConfirmed: true }] as never, D("2007-06-15")).entries[0];
    expect(e.eligible).toBe(false);
    expect(e.unconfirmed).toBe(true);
  });
  it("다른 조문(§99의2 계약 기준)은 유형 칸과 무관하게 종전대로 판정한다", () => {
    // §99의2 감면주택은 15호(조특법 감면주택 의제)로 배제된다 — 204,355,800 (`surcharge-deemed-clauses-e14abc` A-1과 같은 값)
    const r = run({ article: "unsold_99_2", houseContractDate: D("2013-06-01") });
    expect(r.tax).toBe(204_355_800);
    expect(r.reasons).toBe("special_act_house_exclusion");
    expect(newHousingKindFieldsOf({ article: "unsold_99_2", housingKind: "purchase" })).toEqual({});
  });
});

describe("⑧ 필수값 leaf — 계산기 전역 목록·명부 행·판정 메뉴 공용", () => {
  const base = { article: "new_99_3" as const, houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: false };
  it("유형 미선택 → 선택 요구", () => {
    expect(newHousingKindErrors(base)[0]).toContain("유형");
    expect(collectSpecialHouseExclusionRowErrors(base)[0]).toContain("유형");
  });
  it("매수는 계약일 · 자기건설은 취득일(사용승인일)만 요구한다", () => {
    expect(newHousingKindErrors({ ...base, housingKind: "purchase" })).toHaveLength(1);
    expect(newHousingKindErrors({ ...base, housingKind: "purchase", houseContractDate: "2002-05-01" })).toEqual([]);
    expect(newHousingKindErrors({ ...base, housingKind: "self_built" })[0]).toContain("사용승인일");
    expect(newHousingKindErrors({ ...base, housingKind: "self_built", houseAcquisitionDate: "2002-08-01" })).toEqual([]);
  });
  it("원시 유형은 두 일자와 두 3-state 응답이 필요하고 「모름」은 입력으로 인정한다", () => {
    const o = { ...base, housingKind: "original_purchase" as const, houseContractDate: "2001-03-01", houseAcquisitionDate: "2001-05-01" };
    expect(newHousingKindErrors(o)).toHaveLength(2);
    expect(newHousingKindErrors({ ...o, originalOutsideMetropolitan: "yes", originalNationalHousing: "unknown" })).toEqual([]);
  });
});

describe("④⑫⑭ 배관 — 유형·3-state가 침묵 소실되지 않는다", () => {
  afterEach(() => vi.unstubAllGlobals());
  const row = {
    article: "new_99_3" as const, houseAcquisitionDate: "2001-05-01", houseContractDate: "2001-03-01", isNationalHousing: false,
    housingKind: "original_purchase" as const, originalOutsideMetropolitan: "yes" as const, originalNationalHousing: "unknown" as const,
    requirementsConfirmed: true,
  };
  it("PL-1 ④⑬: fetch body에 housingKind·원시 3-state가 실린다", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }));
    const form = {
      transferDate: "2007-11-30",
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing" as const, acquisitionCause: "purchase" as const, acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "400,000,000", actualSalePrice: "800,000,000" }],
      houses: [], presaleRights: [], specialHouseExclusions: [row],
    } as unknown as TransferFormData;
    await callTransferTaxAPI(form);
    const she = (captured.body?.specialHouseExclusions ?? []) as Array<Record<string, unknown>>;
    expect(she[0]).toMatchObject({ housingKind: "original_purchase", originalOutsideMetropolitan: "yes", originalNationalHousing: "unknown" });
  });
  it("PL-1b ④: 유형을 묻지 않는 조문(§99의2)으로 바꾸면 남은 유형 값은 보내지 않는다", async () => {
    const captured: { body?: Record<string, unknown> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }));
    const form = {
      transferDate: "2024-11-30",
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing" as const, acquisitionCause: "purchase" as const, acquisitionDate: "2000-01-01", fixedAcquisitionPrice: "400,000,000", actualSalePrice: "800,000,000" }],
      houses: [], presaleRights: [], specialHouseExclusions: [{ ...row, article: "unsold_99_2" as const }],
    } as unknown as TransferFormData;
    await callTransferTaxAPI(form);
    const she = (captured.body?.specialHouseExclusions ?? []) as Array<Record<string, unknown>>;
    expect(she[0]?.article).toBe("unsold_99_2");
    expect(she[0]).not.toHaveProperty("housingKind");
    expect(she[0]).not.toHaveProperty("originalNationalHousing");
  });
  it("PL-2 ⑫: Zod가 세 칸을 stripping하지 않는다", () => {
    const parsed = propertySchema.parse({
      propertyType: "housing", transferDate: "2007-11-30", acquisitionDate: "2000-01-01", transferPrice: 800_000_000, acquisitionPrice: 400_000_000,
      expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 2, residencePeriodMonths: 0, isRegulatedArea: false,
      wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, annualBasicDeductionUsed: 0,
      specialHouseExclusions: [{ article: "new_99_3", houseAcquisitionDate: "2001-05-01", houseContractDate: "2001-03-01", housingKind: "original_purchase", originalOutsideMetropolitan: "yes", originalNationalHousing: "unknown", requirementsConfirmed: true }],
    }) as { specialHouseExclusions: Array<Record<string, unknown>> };
    expect(parsed.specialHouseExclusions[0]).toMatchObject({ housingKind: "original_purchase", originalOutsideMetropolitan: "yes", originalNationalHousing: "unknown" });
  });
  it("PL-2b ⑫: 잘못된 유형 값은 거절한다", () => {
    expect(() =>
      propertySchema.parse({
        propertyType: "housing", transferDate: "2007-11-30", acquisitionDate: "2000-01-01", transferPrice: 800_000_000, acquisitionPrice: 400_000_000,
        expenses: 0, useEstimatedAcquisition: false, householdHousingCount: 2, residencePeriodMonths: 0, isRegulatedArea: false,
        wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, isOneHousehold: true, annualBasicDeductionUsed: 0,
        specialHouseExclusions: [{ article: "new_99_3", housingKind: "bogus", requirementsConfirmed: true }],
      }),
    ).toThrow();
  });
});
