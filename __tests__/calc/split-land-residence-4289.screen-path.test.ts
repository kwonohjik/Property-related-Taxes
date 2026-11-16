/**
 * 4289 화면 경로 — 폼(①②③) → ④ 전송 → fetch body(⑬) → 실제 route(⑫⑭) → 엔진 · ⑧ 검증 ↔ ⑫ 격자 정합
 *
 * 계획서: docs/00-pm/split-land-residence-rate-4289.plan.md §6·§7 (시료 S1 — 토지 80% · 건물 40% · 68,790,000 / OFF 186,114,000)
 * 엔진·route 직접 입력은 `__tests__/tax-engine/transfer/split-land-residence-4289.engine.test.ts`·
 * `__tests__/api/transfer.route.split-land-residence-4289.anchor.test.ts`가 잠근다. 이 파일은 **폼 값에서 시작**한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { validateLandPartCause } from "@/lib/calc/transfer-tax-validate-split";
import { buildLandPartCausePayload } from "@/lib/calc/transfer-tax-api-split";
import { landPartResidenceHost, landPartResidenceAsked } from "@/lib/calc/transfer-split-land-residence-scope";
import { collectResidenceIntervalErrors, directResidenceMonthsOverflowError } from "@/lib/calc/residence-interval-validate";
import {
  LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE,
  landPartResidenceMonthsExceedsMessage,
} from "@/lib/tax-engine/transfer-split-land-residence";
import { computeTransferSummary } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** S1 — D2 증여 호스트(토글 「토지는 다른 원인으로 취득」 ON): 토지 2000-06-01 매수 → 건물 2012-10-01 증여(148개월). */
const asset = (o: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "gift",
    acquisitionDate: "2012-10-01",
    landCauseHost: "gift",
    landAcquisitionCause: "purchase",
    landAcquisitionDate: "2000-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "100,000,000",
    buildingAcquisitionPrice: "50,000,000",
    actualSalePrice: "2,000,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "1,400,000,000",
    buildingTransferPrice: "600,000,000",
    landStandardPriceAtTransfer: "1,400,000,000",
    buildingStandardPriceAtTransfer: "600,000,000",
    residencePeriodMonthsAsset: "0",
    ...o,
  }) as unknown as AssetForm;

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: "2025-01-15",
    filingDate: "2025-03-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "2000000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: true,
    residencePeriodMonths: "0",
  }) as unknown as TransferFormData;

async function body(a: AssetForm): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  return cap.body!;
}

async function route(b: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
        ...b,
      }),
    }),
  );
  const json = await res.json();
  return { status: res.status, json, r: json?.data?.result };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const ON = (months: string) => ({ landPartDonorSameHousehold: true, landPartPriorHouseholdResidenceMonths: months });

describe("①② 초기값 · ③ migrate", () => {
  it("신규 자산: 토글 OFF · 개월 빈칸", () => {
    const a = makeDefaultAsset(1);
    expect(a.landPartDonorSameHousehold).toBe(false);
    expect(a.landPartPriorHouseholdResidenceMonths).toBe("");
  });
  it("옛 세션·이력(필드 없음) → migrateAsset이 OFF·빈칸으로 채운다(undefined 잔존 금지)", () => {
    const old = { ...makeDefaultAsset(1) } as Record<string, unknown>;
    delete old.landPartDonorSameHousehold;
    delete old.landPartPriorHouseholdResidenceMonths;
    const m = migrateAsset(old as unknown as AssetForm);
    expect(m.landPartDonorSameHousehold).toBe(false);
    expect(m.landPartPriorHouseholdResidenceMonths).toBe("");
  });
});

describe("④⑬ → ⑫⑭ → 엔진 — S1 화면 경로", () => {
  it("토글 ON 132개월: body에 새 키 2개 · 토지 80% · 건물 40% · 68,790,000 · 파트 거주 연수 11/0", async () => {
    const b = await body(asset(ON("132")));
    expect(b.landPartDonorSameHousehold).toBe(true);
    expect(b.landPartPriorHouseholdResidenceMonths).toBe(132);
    const { status, json, r } = await route({ ...b, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 0 });
    expect(status, JSON.stringify(json.error ?? {})).toBe(200);
    expect(r.splitDetail.land.longTermRate).toBeCloseTo(0.8, 10);
    expect(r.splitDetail.building.longTermRate).toBeCloseTo(0.4, 10);
    expect(r.calculatedTax).toBe(68_790_000);
    expect(r.splitDetail.land.residenceYears).toBe(11);
    expect(r.splitDetail.building.residenceYears).toBe(0);
  });

  it("토글 OFF(짝): body에 새 키 없음 · 현행 186,114,000", async () => {
    const b = await body(asset());
    expect(b).not.toHaveProperty("landPartDonorSameHousehold");
    expect(b).not.toHaveProperty("landPartPriorHouseholdResidenceMonths");
    const { r } = await route({ ...b, isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 0 });
    expect(r.calculatedTax).toBe(186_114_000);
  });

  it("토글 OFF + 개월 잔재: 개월도 싣지 않는다(stale 방지)", async () => {
    const b = await body(asset({ landPartPriorHouseholdResidenceMonths: "132" }));
    expect(b).not.toHaveProperty("landPartPriorHouseholdResidenceMonths");
  });

  it("stale — 토글 ON 뒤 건물 취득원인을 상속으로 바꾸면(호스트 태그 불일치): ④ 미전송 · ⑧ 통과", async () => {
    const a = asset({ ...ON("132"), acquisitionCause: "inheritance" } as Partial<AssetForm>);
    expect(landPartResidenceHost(a)).toBe(false);
    expect(buildLandPartCausePayload(a)).not.toHaveProperty("landPartDonorSameHousehold");
    expect(buildLandPartCausePayload(a)).not.toHaveProperty("landPartPriorHouseholdResidenceMonths");
    expect(validateLandPartCause(a, "자산1")).toBeNull();
  });

  it("stale — D2 토글(「토지는 다른 원인으로 취득」)을 끄면: ④ 미전송 · ⑧ 통과", () => {
    const a = asset({ ...ON("132"), landAcquisitionCause: "", landCauseHost: "", hasSeperateLandAcquisitionDate: false });
    expect(buildLandPartCausePayload(a)).toEqual({});
    expect(validateLandPartCause(a, "자산1")).toBeNull();
  });

  it("부담부증여·소유자 분리: 호스트 아님 — ④ 미전송 · ⑧이 이 규칙으로 막지 않는다", () => {
    for (const o of [{ transferType: "burdened_gift" }, { selfOwns: "land_only" }] as Partial<AssetForm>[]) {
      const a = asset({ ...ON("132"), ...o });
      expect(buildLandPartCausePayload(a)).not.toHaveProperty("landPartDonorSameHousehold");
      const err = validateLandPartCause(a, "자산1");
      expect(err ?? "").not.toContain("건물 증여 전 같은 세대 거주");
    }
  });
});

describe("컴패니언(함께 양도 두 번째 이후): 칸·전송·검증 모두 없음", () => {
  it("호스트 아님 · ④ 미전송 · ⑧ 통과", () => {
    const a = asset(ON("132"));
    expect(landPartResidenceHost(a, { isNonPrimary: true })).toBe(false);
    expect(buildLandPartCausePayload(a, { isNonPrimary: true })).not.toHaveProperty("landPartDonorSameHousehold");
    expect(validateLandPartCause(a, "자산2", { isNonPrimary: true })).toBeNull();
  });
});

describe("⑧ 격자 — 토글 × 개월(빈칸/정수/상한/비정수) × ⑳ × 호스트(D2 증여/상속) ↔ ⑫", () => {
  const rental = (applyException: boolean) =>
    ({
      rentalHousingException: {
        applyException, scenario: "B", rentalUnits: [],
      },
    }) as unknown as Partial<AssetForm>;

  /** ④ payload를 S1 wire에 얹어 ⑫(propertySchema)에 태운다 — ⑧ 통과 ⇒ ⑫ 통과를 격자로 확인. */
  const S1_WIRE = {
    propertyType: "housing", useEstimatedAcquisition: false, transferPrice: 2_000_000_000, transferDate: "2025-01-15",
    acquisitionDate: "2012-10-01", acquisitionCause: "gift", landAcquisitionCause: "purchase", landAcquisitionDate: "2000-06-01",
    acquisitionPrice: 0, expenses: 0, isOneHousehold: true, householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    isUnregistered: false, isNonBusinessLand: false, residencePeriodMonths: 0, annualBasicDeductionUsed: 0, isSeparateAcquisition: true,
    landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual", landTransferPrice: 1_400_000_000, buildingTransferPrice: 600_000_000,
    landStandardPriceAtTransfer: 1_400_000_000, buildingStandardPriceAtTransfer: 600_000_000, landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 50_000_000,
  };
  const wire = (a: AssetForm) => {
    const p = buildLandPartCausePayload(a);
    return { ...S1_WIRE, ...(a.acquisitionCause === "gift" ? {} : { acquisitionCause: a.acquisitionCause, decedentAcquisitionDate: "1990-01-01" }), ...p };
  };
  const wireIssues = (a: AssetForm) => {
    const r = propertySchema.safeParse(wire(a));
    return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}`);
  };
  const mine = (paths: string[]) => paths.filter((p) => p.startsWith("landPart"));

  const toggles = [false, true];
  const months = ["", "0", "132", "148", "149"];
  const hosts: Array<["gift" | "inheritance", Partial<AssetForm>]> = [["gift", {}], ["inheritance", { acquisitionCause: "inheritance", landCauseHost: "inheritance", decedentAcquisitionDate: "1990-01-01" } as Partial<AssetForm>]];

  for (const [hostName, hostO] of hosts)
    for (const declared of [false, true])
      for (const t of toggles)
        for (const m of months) {
          const name = `${hostName} · ⑳${declared ? "선언" : "미선언"} · 토글 ${t ? "ON" : "OFF"} · 개월 "${m}"`;
          it(name, () => {
            const a = asset({ ...hostO, landPartDonorSameHousehold: t, landPartPriorHouseholdResidenceMonths: m, ...(declared ? rental(true) : {}) } as Partial<AssetForm>);
            const err = validateLandPartCause(a, "자산1");
            const own = (err ?? "").includes("건물 증여 전 같은 세대") || (err ?? "").includes("건물 증여자와 증여일부터");
            const w = mine(wireIssues(a));
            // 기대 ⑧: 호스트(D2 증여) ∧ 토글 ON ∧ (⑳ 선언 ∨ 개월 빈칸 ∨ 상한 초과)만 이 규칙으로 막는다.
            const hostOk = hostName === "gift";
            const expectBlock = hostOk && t && (declared || m === "" || Number(m) > 148);
            expect(own, `⑧ ${err}`).toBe(expectBlock);
            // ⑫(④ payload 기준): ⑳ 선언이면 ④가 싣지 않으므로 통과(⑧이 더 엄격 — 의도) · 그 밖은 ⑧과 같다.
            const expect12 = expectBlock && !declared;
            expect(w.length > 0, `⑫ ${w.join(",")}`).toBe(expect12);
          });
        }
});

describe("거주 구간 오류의 안내 칸 — D2 증여 호스트 전용 · ⑳ 선언 때는 안내하지 않는다", () => {
  const periods = [{ moveInDate: "2000-07-01", moveOutDate: "2012-12-31" }];
  const run = (asked: boolean) => collectResidenceIntervalErrors({ periods, acquisitionDate: "2012-10-01", transferDate: "2025-01-15", landPriorHint: asked });

  it("호스트: 새 칸 안내(기존 증여 칸 안내문과 다르다)", () => {
    const [msg] = run(true);
    expect(msg).toContain("건물 증여 전 같은 세대 거주 개월 수");
    expect(msg).not.toContain("증여 전 동일세대 거주기간」 칸");
    expect(run(false)[0]).not.toContain("건물 증여 전 같은 세대 거주 개월 수");
  });
  it("직접 입력 상한 초과도 같은 안내", () => {
    const m = directResidenceMonthsOverflowError({ months: 400, acquisitionDate: "2012-10-01", transferDate: "2025-01-15", field: "residencePeriodMonthsAsset", landPriorHint: true });
    expect(m).toContain("건물 증여 전 같은 세대 거주 개월 수");
  });
  it("landPartResidenceAsked: 호스트 ∧ ⑳ 미선언만 참", () => {
    expect(landPartResidenceAsked(asset())).toBe(true);
    expect(landPartResidenceAsked(asset({ rentalHousingException: { applyException: true, scenario: "B", rentalUnits: [] } } as unknown as Partial<AssetForm>))).toBe(false);
    expect(landPartResidenceAsked(asset(), { isNonPrimary: true })).toBe(false);
  });
});

describe("⑧ 문구", () => {
  it("빈칸: 필수 문구 · 상한 초과: 상한 개월 문구 · ⑳ 선언: 해소 방법 포함", () => {
    expect(validateLandPartCause(asset(ON("")), "자산1")).toContain(LAND_PART_RESIDENCE_MONTHS_REQUIRED_MESSAGE);
    expect(validateLandPartCause(asset(ON("149")), "자산1")).toContain(landPartResidenceMonthsExceedsMessage(148, false));
    const rh = asset({ ...ON("132"), rentalHousingException: { applyException: true, scenario: "B", rentalUnits: [] } } as unknown as Partial<AssetForm>);
    expect(validateLandPartCause(rh, "자산1")).toMatch(/끄거나 장기임대주택 거주주택 특례 선언을 해제/);
  });
});

describe("⑥ 사이드바 합계 — 이 입력은 합계에 영향이 없다(공제율은 합계 표시에 쓰이지 않음)", () => {
  it("토글 ON·OFF의 computeTransferSummary · computeTransferPerAssetSummary가 같다(결과 도착 전)", () => {
    const on = form(asset({ ...ON("132"), assetId: "a1" }));
    const off = form(asset({ assetId: "a1" }));
    expect(computeTransferSummary(on, null)).toEqual(computeTransferSummary(off, null));
    expect(computeTransferPerAssetSummary(on, null)).toEqual(computeTransferPerAssetSummary(off, null));
  });
});
