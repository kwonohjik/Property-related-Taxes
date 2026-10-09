/**
 * D2-4 클라이언트 브리지 · ④ 전송 · ⑧ · ⑧≡⑫ 격자 (2026-10-09 D2-4a · 2026-10-10 D2-4b)
 *
 * 계획서 §13 · 엔진 설계 `transfer-acq-cause-mixed-d2-4.engine.design.md` §3.1·§3.5.
 * D2-4a는 ⑧이 이 범위(2005.4.30. 전 상속·증여 건물)를 전부 막았다(② 입력 칸이 없었다). D2-4b는 카드(`BuildingSec164Card`)와 함께
 * ⑧의 ② 사실을 브리지 파생값으로 바꿨다 — 구간 안 ⑧ 통과 ⇔ ⑫ 200(주택 ∧ 단독·다가구 명시 ∧ 5입력 ∧ ① ∧ 일부 양도 아님).
 */
import { describe, it, expect, vi } from "vitest";
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
import { buildLandPartCausePayload } from "@/lib/calc/transfer-tax-api-split";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import {
  buildingHouseKindSent,
  buildingSec164Applies,
  buildingSec164Open,
  deriveBuildingSec164Total,
} from "@/lib/calc/transfer-building-sec164-bridge";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { BUILDING_HOUSE_KIND_REQUIRED_MESSAGE } from "@/lib/calc/transfer-tax-validate-split";
import { BUILDING_CAUSE_APARTMENT_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { calculateInheritanceHouseValuation } from "@/lib/tax-engine/inheritance-house-valuation";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2026-06-30";

/** D2 토글 ON + 단독·다가구 + 상속 2003-05-01 + 토지 매매 2020-01-10. ② 입력 4칸 + 면적은 store의 기존 키. */
function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2003-05-01", inheritanceStartDate: "2003-05-01", inheritanceDate: "2003-05-01",
    decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2020-01-10",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    inheritanceAssetKind: "house_individual", acquisitionArea: "200",
    inhHouseValHousePriceAtFirst: "300,000,000", inhHouseValLandPricePerSqmAtFirst: "1,000,000",
    inhHouseValBuildingStdPriceAtFirst: "50,000,000", inhHouseValBuildingStdPriceAtInheritance: "30,000,000",
    ...over,
  } as AssetForm;
}
const giftAsset = (over: Partial<AssetForm> = {}) =>
  asset({
    acquisitionCause: "gift", landCauseHost: "gift" as never, acquisitionDate: "2002-09-15", decedentAcquisitionDate: "", buildingAcquisitionPrice: "25,000,000",
    inhHouseValHousePriceAtFirst: "280,000,000", inhHouseValLandPricePerSqmAtFirst: "750,000",
    inhHouseValBuildingStdPriceAtFirst: "40,000,000", inhHouseValBuildingStdPriceAtInheritance: "20,000,000", ...over,
  });
const setDate = (d: string): Partial<AssetForm> => ({ acquisitionDate: d, inheritanceStartDate: d, inheritanceDate: d });

describe("술어 — buildingSec164Applies / Open / HouseKindSent (호스트 × 자산 종류 × 날짜 × D2 on/off)", () => {
  const DATES: [string, boolean][] = [["1984-06-01", true], ["2003-05-01", true], ["2005-04-29", true], ["2005-04-30", false], ["2020-01-10", false]];
  it.each(["inheritance", "gift"] as const)("호스트 %s: 주택 ∧ 구간(엄격 <) ∧ D2 유효일 때만 applies", (host) => {
    for (const [date, inRange] of DATES) {
      const a = asset({ acquisitionCause: host, landCauseHost: host as never, ...setDate(date), landAcquisitionDate: "1983-01-01" });
      expect(buildingSec164Applies(a), `${host} ${date}`).toBe(inRange);
      expect(buildingSec164Open(a), `${host} ${date} open`).toBe(inRange);
      expect(buildingHouseKindSent(a), `${host} ${date} kind`).toBe(inRange ? "house_individual" : undefined);
    }
  });
  it("비주택 building · D2 토글 OFF · 호스트 태그 불일치 · 부담부증여 → applies false", () => {
    expect(buildingSec164Applies(asset({ assetKind: "building" }))).toBe(false);
    expect(buildingSec164Applies(asset({ hasSeperateLandAcquisitionDate: false }))).toBe(false);
    expect(buildingSec164Applies(asset({ landCauseHost: "gift" as never }))).toBe(false);
    expect(buildingSec164Applies(asset({ landAcquisitionCause: "" }))).toBe(false);
    expect(buildingSec164Applies(asset({ transferType: "burdened_gift" }))).toBe(false);
    expect(buildingSec164Applies(asset({ acquisitionCause: "purchase", landCauseHost: "purchase" as never }))).toBe(false);
  });
  it("공동주택: applies true(구간) · open false · kind house_apart를 보낸다", () => {
    const apart = asset({ inheritanceAssetKind: "house_apart" });
    expect(buildingSec164Applies(apart)).toBe(true);
    expect(buildingSec164Open(apart)).toBe(false);
    expect(buildingHouseKindSent(apart)).toBe("house_apart");
  });
  // Check F1 — 표시용 파생 `deriveInheritanceHouseKind`는 미선택(기본 "land")·동·호 공란을 단독으로 읽는다.
  //   ② 비교를 여는 사실은 명시 선택만 싣는다(모름 = 불성립): 미선택이면 동·호 유무와 무관하게 보내지 않고 ②도 만들지 않는다.
  it.each([
    ["기본값 land · 동·호 공란", { inheritanceAssetKind: "land" }],
    ["미선택 · 동·호 공란", { inheritanceAssetKind: undefined }],
    ["미선택 · 동·호 있음", { inheritanceAssetKind: undefined, addressDong: "101", addressHo: "1203" }],
  ] as const)("주택 구분 미선택(%s) → kind 미전송 · open false · ② 0", (_, over) => {
    const a = asset(over as never);
    expect(buildingSec164Applies(a)).toBe(true);
    expect(buildingHouseKindSent(a)).toBeUndefined();
    expect(buildingSec164Open(a)).toBe(false);
    expect(deriveBuildingSec164Total(a)).toBe(0);
  });
});

describe("deriveBuildingSec164Total — ② = P_F × B_E ÷ (L_F + B_F), 안분 1회 floor + 지분 1회 floor", () => {
  it("상속 시드 36,000,000 · 증여 시드 29,473,684 (5.6×10¹⁵ ÷ 190,000,000 = 29,473,684.2 floor)", () => {
    expect(deriveBuildingSec164Total(asset())).toBe(36_000_000);
    expect(deriveBuildingSec164Total(giftAsset())).toBe(29_473_684);
  });
  it("1984-06-01 상속(의제취득일 전)도 같은 값 — 산식에 날짜가 들어가지 않는다(라벨은 UI)", () => {
    expect(deriveBuildingSec164Total(asset({ ...setDate("1984-06-01"), landAcquisitionDate: "1983-01-01" }))).toBe(36_000_000);
  });
  it("지분 50% → applyRatio(36,000,000, 0.5) = 18,000,000 · 입력은 100% 기준(지분 곱 전에 분모에 들어가지 않는다)", () => {
    expect(deriveBuildingSec164Total(asset({ ownershipNumerator: "50", ownershipDenominator: "100" }))).toBe(18_000_000);
    // 1/3: floor(36,000,000 × 0.3333…) — 0.333…의 double 표현으로 단순 곱하는 applyRatio와 같은 값이어야 ①(ratioed)과 같은 축
    expect(deriveBuildingSec164Total(asset({ ownershipNumerator: "1", ownershipDenominator: "3" }))).toBe(Math.floor(36_000_000 * (1 / 3)));
  });
  it("5입력 중 하나라도 비거나 0이면 0 — 부분 입력은 ②를 만들지 않는다(분모가 0이 되는 시도 포함)", () => {
    for (const k of ["inhHouseValHousePriceAtFirst", "inhHouseValLandPricePerSqmAtFirst", "inhHouseValBuildingStdPriceAtFirst", "inhHouseValBuildingStdPriceAtInheritance", "acquisitionArea"] as const) {
      expect(deriveBuildingSec164Total(asset({ [k]: "" } as Partial<AssetForm>)), k).toBe(0);
      expect(deriveBuildingSec164Total(asset({ [k]: "0" } as Partial<AssetForm>)), `${k}=0`).toBe(0);
    }
  });
  it("구간 밖(2005-04-30)·공동주택·비주택·D2 OFF → 0 (스토어에 4칸 값이 남아 있어도)", () => {
    expect(deriveBuildingSec164Total(asset({ ...setDate("2005-04-30") }))).toBe(0);
    expect(deriveBuildingSec164Total(asset({ inheritanceAssetKind: "house_apart" }))).toBe(0);
    expect(deriveBuildingSec164Total(asset({ assetKind: "building" }))).toBe(0);
    expect(deriveBuildingSec164Total(asset({ hasSeperateLandAcquisitionDate: false }))).toBe(0);
  });
  it("면적 콤마(stale 「1,200」)를 지운다 — 콤마 파싱이 1로 잘리면 ②가 1200배 커진다", () => {
    const a = deriveBuildingSec164Total(asset({ acquisitionArea: "1,200", inhHouseValLandPricePerSqmAtFirst: "166,666" }));
    const b = deriveBuildingSec164Total(asset({ acquisitionArea: "1200", inhHouseValLandPricePerSqmAtFirst: "166,666" }));
    expect(a).toBeGreaterThan(0);
    expect(a).toBe(b);
    expect(a).not.toBe(deriveBuildingSec164Total(asset({ acquisitionArea: "1", inhHouseValLandPricePerSqmAtFirst: "166,666" })));
  });
  it("소수 면적은 ㎡ 정수 곱 규약(multiplyByArea) — 부동소수 곱 1원 과소를 피한다 (5,000,000 × 8.04 = 40,200,000)", () => {
    // L_F = 40,200,000 → ② = P_F 120,000,000 × B_E 10,000,000 ÷ (40,200,000 + 9,800,000) = 24,000,000 (분모가 정확히 5천만이어야 떨어진다)
    const a = asset({ acquisitionArea: "8.04", inhHouseValLandPricePerSqmAtFirst: "5,000,000", inhHouseValBuildingStdPriceAtFirst: "9,800,000",
      inhHouseValHousePriceAtFirst: "120,000,000", inhHouseValBuildingStdPriceAtInheritance: "10,000,000" });
    expect(deriveBuildingSec164Total(a)).toBe(24_000_000);
  });
  it("토지 취득 시점(L_acq) 불변성 — 영 §164⑦ 환산주택가격을 재산세과-1702식으로 건물 몫에 안분한 값과 같다(3개 L_acq)", () => {
    const base = {
      inheritanceDate: new Date("2003-05-01"), transferDate: new Date("2026-06-30"), landArea: 200,
      landPricePerSqmAtTransfer: 2_000_000, housePriceAtTransfer: 500_000_000,
      landPricePerSqmAtFirstDisclosure: 1_000_000, housePriceAtFirstDisclosure: 300_000_000,
      buildingStdPriceAtFirstDisclosure: 50_000_000, buildingStdPriceAtInheritance: 30_000_000,
    };
    for (const landAcq of [600_000, 300_000, 1_000_000]) {
      const v = calculateInheritanceHouseValuation({ ...base, landPricePerSqmAtInheritance: landAcq });
      const buildingShare = Math.floor((v.housePriceAtInheritanceUsed * v.buildingStdAtInheritance) / v.sumAtInheritance);
      expect(buildingShare, `L_acq=${landAcq}`).toBe(deriveBuildingSec164Total(asset()));
    }
  });
});

describe("④ buildLandPartCausePayload — 단건·다건·컴패니언 3경로 공용", () => {
  const TF = (a: AssetForm) =>
    ({ transferDate: TRANSFER_DATE, filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1200000000",
      totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false }) as unknown as TransferFormData;
  async function single(a: AssetForm): Promise<Record<string, unknown>> {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }));
    await callTransferTaxAPI(TF(a));
    vi.unstubAllGlobals();
    return cap.body!;
  }
  const pick = (o: Record<string, unknown>) => ({ v: o.buildingSec164Value, k: o.buildingHouseKind, p: o.isPartialAreaTransfer, c: o.landAcquisitionCause });

  it("구간 + 단독·다가구 + 5입력: overlay purchase + kind + ② (일부 양도 아님)", () => {
    expect(buildLandPartCausePayload(asset())).toEqual({ landAcquisitionCause: "purchase", buildingHouseKind: "house_individual", buildingSec164Value: 36_000_000 });
  });
  it("공동주택: kind만(② 없음) / 입력 미완: kind만 / 일부 양도: kind + isPartialAreaTransfer", () => {
    expect(buildLandPartCausePayload(asset({ inheritanceAssetKind: "house_apart" }))).toEqual({ landAcquisitionCause: "purchase", buildingHouseKind: "house_apart" });
    expect(buildLandPartCausePayload(asset({ inhHouseValHousePriceAtFirst: "" }))).toEqual({ landAcquisitionCause: "purchase", buildingHouseKind: "house_individual" });
    expect(buildLandPartCausePayload(asset({ areaScenario: "partial", transferArea: "100" }))).toMatchObject({
      landAcquisitionCause: "purchase", buildingHouseKind: "house_individual", isPartialAreaTransfer: true,
    });
  });
  it("구간 밖(2005-04-30)·비주택·D2 OFF: overlay만 또는 {} — kind·②·partial을 보내지 않는다(범위 밖 잔재 차단)", () => {
    expect(buildLandPartCausePayload(asset({ ...setDate("2005-04-30") }))).toEqual({ landAcquisitionCause: "purchase" });
    expect(buildLandPartCausePayload(asset({ ...setDate("2005-04-30"), areaScenario: "partial", transferArea: "100" }))).toEqual({ landAcquisitionCause: "purchase" });
    expect(buildLandPartCausePayload(asset({ assetKind: "building" }))).toEqual({ landAcquisitionCause: "purchase" });
    expect(buildLandPartCausePayload(asset({ hasSeperateLandAcquisitionDate: false }))).toEqual({});
  });
  it("단건 body · 다건 buildPropertyPayload · 컴패니언 buildAssetPayload 세 경로가 같은 ②·kind를 싣는다", async () => {
    const a = asset();
    const s = pick(await single(a));
    const m = pick(buildPropertyPayload(TF(a)) as unknown as Record<string, unknown>);
    const c = pick(buildAssetPayload({ ...a, assetId: "c1" } as AssetForm, "apportioned", TRANSFER_DATE) as Record<string, unknown>);
    expect(s).toEqual({ v: 36_000_000, k: "house_individual", p: undefined, c: "purchase" });
    expect(m).toEqual(s);
    expect(c).toEqual(s);
    // 증여도 같다
    const g = giftAsset();
    expect(pick(await single(g)).v).toBe(29_473_684);
    expect(pick(buildPropertyPayload(TF(g)) as unknown as Record<string, unknown>).v).toBe(29_473_684);
    // Y7 — 자산 단위 payload는 D2 유효 시 계속 싣지 않는다
    expect((await single(a)).inheritedHouseValuation).toBeUndefined();
  });
});

describe("⑧ — D2-4b ② 입력 완결 요구 · 같은 leaf 사용", () => {
  const v8 = (a: AssetForm) => {
    const r = collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));
    return { result: r.result, field: r.result ? r.fieldOf(r.result) : undefined };
  };

  it("단독·다가구 + 구간 + 5입력 → 통과 (D2-4a의 화면 사실 차단은 사라졌다)", () => {
    expect(v8(asset()).result).toBeNull();
    expect(v8(giftAsset()).result).toBeNull();
  });
  it("칸 이동 순서 = 카드 위→아래: 면적 → 최초공시 개별주택가격 → 최초공시 개별공시지가 → 최초공시 건물 기준시가 → 취득 당시 건물 기준시가", () => {
    const all = { acquisitionArea: "", inhHouseValHousePriceAtFirst: "", inhHouseValLandPricePerSqmAtFirst: "", inhHouseValBuildingStdPriceAtFirst: "", inhHouseValBuildingStdPriceAtInheritance: "" };
    const order = ["acquisitionArea", "inhHouseValHousePriceAtFirst", "inhHouseValLandPricePerSqmAtFirst", "inhHouseValBuildingStdPriceAtFirst", "inhHouseValBuildingStdPriceAtInheritance"] as const;
    const filled = asset();
    for (let k = 0; k < order.length; k++) {
      // 앞 k칸은 채우고 나머지는 비운다 → 첫 빈 칸(order[k])으로 이동
      const over: Partial<AssetForm> = { ...all };
      for (const f of order.slice(0, k)) (over as Record<string, string>)[f] = filled[f] as string;
      const r = v8(asset(over));
      expect(r.field, `k=${k}`).toBe(order[k]);
      expect(r.result).toContain("칸을 입력하세요");
      expect(r.result).toContain("단서 2호");
    }
  });
  it("5칸 모두 찼는데 건물 몫이 0원(분자 < 분모) → 취득 당시 건물 기준시가 칸 · ⑫도 ② 미전송으로 400", () => {
    const tiny = asset({ inhHouseValHousePriceAtFirst: "1", inhHouseValBuildingStdPriceAtInheritance: "1" });
    expect(deriveBuildingSec164Total(tiny)).toBe(0);
    const r = v8(tiny);
    expect(r.field).toBe("inhHouseValBuildingStdPriceAtInheritance");
    expect(r.result).toContain("0원으로 계산됩니다");
  });
  it("주택 구분 미선택(기본값 land) → 주택 구분 칸 + 선택 요구 · 공동주택 → 같은 칸 + leaf 문구(지원하지 않는 이유)", () => {
    const none = v8(asset({ inheritanceAssetKind: "land" }));
    expect(none.field).toBe("inheritanceAssetKind");
    expect(none.result).toContain(BUILDING_HOUSE_KIND_REQUIRED_MESSAGE);
    const apart = v8(asset({ inheritanceAssetKind: "house_apart" }));
    expect(apart.field).toBe("inheritanceAssetKind");
    expect(apart.result).toContain(BUILDING_CAUSE_APARTMENT_MESSAGE);
    expect(apart.result).not.toContain(BUILDING_HOUSE_KIND_REQUIRED_MESSAGE);
  });
  it("일부 양도 → areaScenario · 비주택 building → 종전 Y4 문구(건물 취득일 칸) · 구간 밖(2005-04-30)은 통과", () => {
    const partial = v8(asset({ areaScenario: "partial", transferArea: "100" }));
    expect(partial.field).toBe("areaScenario");
    expect(partial.result).toContain("일부 양도");
    const b = v8(asset({ assetKind: "building" }));
    expect(b.field).toBe("acquisitionDate");
    expect(b.result).toContain("기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전");
    expect(v8(asset({ ...setDate("2005-04-30"), landAcquisitionDate: "2005-01-10" })).result).toBeNull();
  });
});

describe("⑧≡⑫ 격자 — 호스트 × 주택 구분 × 자산 종류 × 날짜 × 입력: ⑧ 통과 ⇒ ⑫ 200 (막다른 길 0)", () => {
  const ENGINE_BASE = {
    isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0,
    isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0,
  };
  const TF = (a: AssetForm) =>
    ({ transferDate: TRANSFER_DATE, filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1200000000",
      totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false }) as unknown as TransferFormData;
  async function twelve(a: AssetForm): Promise<number> {
    const cap: { body?: Record<string, unknown> } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }));
    await callTransferTaxAPI(TF(a));
    vi.unstubAllGlobals();
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ENGINE_BASE, ...cap.body }),
    }));
    return res.status;
  }
  const v8 = (a: AssetForm) => collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));

  it("격자 전수: 막다른 길 0 · 구간 안 ⑧ = ⑫(②·구분·일부양도·종류에 따라 같이 갈린다)", async () => {
    const dates = ["1984-06-01", "2003-05-01", "2005-04-29", "2005-04-30", "2020-01-10"];
    const inputs: [string, Partial<AssetForm>, "ok" | "blocked"][] = [
      ["5입력 전부", {}, "ok"],
      ["P_F 비움", { inhHouseValHousePriceAtFirst: "" }, "blocked"],
      ["㎡당가 비움", { inhHouseValLandPricePerSqmAtFirst: "" }, "blocked"],
      ["B_F 비움", { inhHouseValBuildingStdPriceAtFirst: "" }, "blocked"],
      ["B_E 비움", { inhHouseValBuildingStdPriceAtInheritance: "" }, "blocked"],
      ["면적 비움", { acquisitionArea: "" }, "blocked"],
      ["① 비움", { buildingAcquisitionPrice: "" }, "blocked"],
      ["일부 양도", { areaScenario: "partial", transferArea: "100" }, "blocked"],
    ];
    let cells = 0;
    for (const host of ["inheritance", "gift"] as const) {
      for (const kind of ["house_individual", "house_apart", "land"] as const) {
        for (const assetKind of ["housing", "building"] as const) {
          for (const date of dates) {
            for (const [name, over, ok] of inputs) {
              const inRange = date < "2005-04-30";
              const base = host === "gift" ? giftAsset : asset;
              const a = base({ inheritanceAssetKind: kind, assetKind, ...(host === "inheritance" ? { decedentAcquisitionDate: "1960-01-01" } : {}), ...setDate(date), landAcquisitionDate: date < "2003-01-01" ? "1983-01-01" : "2003-01-10", ...over });
              const eight = v8(a).result ? "block" : "pass";
              const tw = (await twelve(a)) === 200 ? "pass" : "block";
              const id = `${host}/${kind}/${assetKind}/${date}/${name}`;
              cells++;
              // 막다른 길 0: ⑧ 통과 ⇒ ⑫ 통과
              if (eight === "pass") expect(tw, `막다른 길 ${id}`).toBe("pass");
              // 구간 안에서 열리는 건 주택 ∧ 단독·다가구(명시 선택) ∧ 5입력 ∧ ① ∧ 일부 양도 아님 뿐이다 — ⑧·⑫가 같이 갈린다(D2-4b)
              const open = assetKind === "housing" && kind === "house_individual" && ok === "ok" ? "pass" : "block";
              if (inRange) expect(tw, `⑫ ${id}`).toBe(open);
              if (inRange) expect(eight, `⑧ 구간 안 ${id}`).toBe(open);
              // 구간 밖은 입력과 무관하게 종전 그대로(통과) — ② 입력 유무가 영향을 주지 않는다
              if (!inRange && ok === "ok") expect(tw, `구간 밖 ${id}`).toBe("pass");
            }
          }
        }
      }
    }
    expect(cells).toBe(2 * 3 * 2 * 5 * 8);
  }, 90_000);
});
