/**
 * D2 Pre-Do anchor (UI·클라이언트 ④⑥⑧ + ⑫ 짝) — 「건물 상속·증여 + 토지 매매」 설계 전 현행 동작 고정 (2026-10-09)
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d2.ui.design.md §3·§5·§6·§8
 * 계획서: docs/00-pm/transfer-acq-cause-mixed.plan.md §4 D2 · §7 V-2·V-3·V-4·V-11
 * 짝(렌더): __tests__/calc/transfer-land-part-cause.d2.predo.render.test.tsx
 *
 * ## 이 파일이 하는 일
 * 1. **D2 후에도 유지되어야 하는 불변식**(A) — 신축·매매 호스트 회귀 0, 상속+상속 overlay는 계속 ⑫ 400,
 *    다른 호스트가 만든 잔재는 D2 호스트에서 무효.
 * 2. **현행 pin**(B) — 이름에 `[D2에서 뒤집힘]`이 붙은 테스트는 D2 Do가 일부러 깨뜨린다. 깨뜨릴 때 같은 자리에서
 *    기대값을 설계 문서 판정으로 바꾼다.
 *    · B1~B5: 클라이언트(④⑥⑧) — 상속·증여 호스트는 토지 원인을 못 읽고, 숨은 칸을 요구·전송·표시한다.
 *    · B6: ⑫+엔진 직접 호출 — `landAcquisitionCause: "purchase"`를 엔진은 **받고** 계산하지만 D2 결합 규칙은 **없다**
 *      (환산·소유자 분리·경계일 전이 침묵 통과). 엔진 시니어 소관 — 클라이언트 ⑧≡⑫ 격자의 기준선.
 * 3. D2 후 기대값은 `it.todo`로 남긴다(설계 문서 §10 목록과 1:1).
 *
 * ⚠️ 수치는 `makeMockRates()` 실측값이지 정본 세액이 아니다. 같은 시드의 **상대 비교**가 본질이다.
 * ⚠️ D2 상태 시드(`d2()`)는 **D2가 만들 상태를 손으로 재현**한 것이다 — 지금은 UI에 이 상태를 만드는 칸이 없으므로
 *    `landAcquisitionCause: "purchase"`·`landCauseHost: "inheritance"`는 타입 우회 캐스팅이다(① 타입 확장 전).
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
import { validateMultiSupportedMode } from "@/lib/calc/multi-transfer-tax-validate";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import { allowsFamilyBusinessInheritance } from "@/lib/calc/transfer-fb-gate";
import { phdFlagEffective } from "@/lib/calc/phd-toggle-scope";
import { separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { effectiveBuildingCauseMix, engineLandOverlay, landCauseMixActive, landPartCauseSameDay } from "@/lib/calc/transfer-land-part-cause";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { validateLandPartCause } from "@/lib/calc/transfer-tax-validate-split";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { effectiveLandAcquisitionCause, landPartCauseApplicable } from "@/lib/calc/transfer-land-part-cause";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2026-06-30";

/**
 * 건물 상속(2025-05-01, 피상속인 2000-01-01) + 토지 매매(2025-01-10) — D2가 만들 상태(토글 ON 직후).
 * 건물 가액 4억(상속개시일 평가액 직접입력) · 토지 3억(실거래가) · 양도 12억(구분양도 7억/5억).
 */
function d2(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "2025-05-01",
    inheritanceStartDate: "2025-05-01",
    inheritanceDate: "2025-05-01",
    decedentAcquisitionDate: "2000-01-01",
    // ── D2 신규 상태 (① 타입 확장 전이라 캐스팅) ──
    landAcquisitionCause: "purchase" as never,
    landCauseHost: "inheritance" as never,
    landAcquisitionDate: "2025-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as AssetForm;
}

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE,
    filingDate: "2026-08-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1200000000",
    totalTransferExpense: "0",
    householdHousingCount: "1",
    isOneHousehold: false,
  }) as unknown as TransferFormData;

const ENGINE_BASE = {
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  annualBasicDeductionUsed: 0,
  isOneHousehold: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
};

/** 단건 ④로 body를 만든다. */
async function buildBody(a: AssetForm): Promise<Record<string, unknown>> {
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

interface SplitPart {
  acquisitionCause?: string;
  rateBasisRule?: string;
  rateBasisAcquisitionDate?: string;
  appliedRateBasisDate?: string;
}
interface RouteOut {
  status: number;
  tax?: number;
  land?: SplitPart;
  building?: SplitPart;
  fieldErrors?: Record<string, string[]>;
}

/** route(⑫⑭ + 엔진)에 body를 태운다. `over`는 ④ body 위에 덮는다 — 엔진 직접 호출(④가 안 보내는 값 포함). */
async function post(body: Record<string, unknown>, over: Record<string, unknown> = {}): Promise<RouteOut> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ENGINE_BASE, ...body, ...over }),
    }),
  );
  const json = (await res.json()) as {
    data?: { result?: { totalTax?: number; splitDetail?: { land: SplitPart; building: SplitPart } } };
    error?: { fieldErrors?: Record<string, string[]> };
  };
  const sd = json.data?.result?.splitDetail;
  return { status: res.status, tax: json.data?.result?.totalTax, land: sd?.land, building: sd?.building, fieldErrors: json.error?.fieldErrors };
}

const run = async (a: AssetForm, over: Record<string, unknown> = {}) => post(await buildBody(a), over);

const v8 = (a: AssetForm) => collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));

// ─────────────────────────────────────────────────────────────────────────────
// A. D2 후에도 유지되어야 하는 불변식 (설계 §3·§6)
// ─────────────────────────────────────────────────────────────────────────────
describe("A. 불변식 — D2 후에도 유지", () => {
  it("A1 매매 호스트(D1) 토글 ON 상태: 유효 원인 inheritance · ④ payload 불변 (D1 회귀 0)", () => {
    const d1 = d2({
      acquisitionCause: "purchase",
      landAcquisitionCause: "inheritance",
      landCauseHost: "purchase",
      landDecedentAcquisitionDate: "1990-04-01",
      decedentAcquisitionDate: "",
    });
    expect(landPartCauseApplicable(d1)).toBe(true);
    expect(effectiveLandAcquisitionCause(d1)).toBe("inheritance");
    expect(buildLandPartCausePayload(d1)).toEqual({
      landAcquisitionCause: "inheritance",
      landDecedentAcquisitionDate: "1990-04-01",
    });
  });

  it("A2 호스트 불일치는 항상 무효: 매매 호스트에 상속 태그(D2 잔재)가 남아도 유효 원인 없음 — D2 후에도 태그 비교는 `===`", () => {
    const stale = d2({ acquisitionCause: "purchase" }); // landCauseHost "inheritance" · landAcquisitionCause "purchase" 잔재
    expect(effectiveLandAcquisitionCause(stale)).toBe("");
    expect(buildLandPartCausePayload(stale)).toEqual({});
    // 상속 → 증여 전환(라디오가 태그를 비운다 — CompanionAcquisitionCauseSection:102)도 같은 결과
    const gift = d2({ acquisitionCause: "gift", landCauseHost: "" });
    expect(effectiveLandAcquisitionCause(gift)).toBe("");
  });

  it("A3 이월과세(증여) 건물은 D2 호스트가 아니다 — 잔재가 있어도 유효 원인 없음 (계획서 §5 이월과세 D 밖)", () => {
    for (const cause of ["carryover_gift", "burdened_gift"] as const) {
      const a = d2({ acquisitionCause: cause as never, landCauseHost: cause as never });
      expect(effectiveLandAcquisitionCause(a)).toBe("");
    }
  });

  it("A4 ⑫: 건물 상속 + 토지 상속·증여 overlay는 D2에서도 계속 400 (R-X5 — D2는 매매 overlay만 연다)", async () => {
    const body = await buildBody(d2());
    for (const cause of ["inheritance", "gift"] as const) {
      const r = await post(body, { landAcquisitionCause: cause, landDecedentAcquisitionDate: "1990-01-01" });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.fieldErrors?.landAcquisitionCause)).toContain("지원하지 않습니다");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. D2-1 전환 완료 — 종전 pin을 같은 자리에서 뒤집었다 (계획서 §12 · 엔진 설계 §4)
// ─────────────────────────────────────────────────────────────────────────────
describe("B. D2-1 전환 [종전 pin → D2 기대]", () => {
  it("B1 ①④ 술어 분리: D1 술어는 상속·증여 호스트를 여전히 읽지 못하고(적용 범위 밖 · 유효 원인 \"\" · D1 소비처 불변), D2 술어가 `purchase` overlay를 싣는다", () => {
    for (const cause of ["inheritance", "gift"] as const) {
      const a = d2({ acquisitionCause: cause, landCauseHost: cause as never });
      expect(landPartCauseApplicable(a)).toBe(false); // D1 술어 의미 불변
      expect(effectiveLandAcquisitionCause(a)).toBe(""); // `purchase`는 D1 술어로 새지 않는다 — D1 소비처 9곳 보호
      expect(effectiveBuildingCauseMix(a)).toBe(cause);
      expect(landCauseMixActive(a)).toBe(true);
      expect(engineLandOverlay(a)).toBe("purchase");
      expect(buildLandPartCausePayload(a)).toEqual({ landAcquisitionCause: "purchase" }); // 피상속인·sec164 키 없음
    }
  });

  it("B2 ④⑫ D2 상태의 body가 overlay `purchase`를 싣는다 → 토지는 자기 취득일(own) — 매매 토지를 상속 토지로 읽던 침묵 오답이 사라진다", async () => {
    const body = await buildBody(d2());
    expect(body.landAcquisitionCause).toBe("purchase");
    expect(body.isSeparateAcquisition).toBe(true);
    const r = await post(body);
    expect(r.status).toBe(200);
    expect(r.land?.acquisitionCause).toBe("purchase");
    expect(r.land?.rateBasisRule).toBe("own");
    expect(r.land?.rateBasisAcquisitionDate).toBe("2025-01-10");
    expect(r.land?.appliedRateBasisDate).toBe("2025-05-01"); // 주택 max(D2-Q1 A안: 건물 취득일 = 상속개시일)
    expect(r.tax).toBe(283_866_000); // 종전 침묵 값과 같다(이 시드에선 주택 max가 둘을 같게 만든다) — 아래 B6로 구별
  });

  it("B3 ⑧ D2 분기: 숨은 자산 단위 칸(신고가액·증여 신고가액)을 요구하지 않는다 — 건물 가액·날짜만", () => {
    expect(v8(d2()).result).toBeNull();
    expect(v8(d2({ acquisitionCause: "gift", landCauseHost: "gift" as never })).result).toBeNull();
    // 건물 가액을 비우면 파트 완결 규칙(V1)이 그 칸을 지목한다
    const noBuilding = v8(d2({ buildingAcquisitionPrice: "" }));
    expect(noBuilding.result).toContain("건물 취득가액");
    expect(noBuilding.fieldOf(noBuilding.result!)).toBe("buildingAcquisitionPrice");
  });

  it("B4 숨은 신고가액 stale: ④가 `inheritedAcquisition`을 싣지 않고 ⑥ 자산 행도 그 값을 읽지 않는다(건물 가액 미입력 → pending 0)", async () => {
    const stale = d2({ publishedValueAtInheritance: "900,000,000", inheritanceValuationMethod: "appraisal" });
    const body = await buildBody(stale);
    expect(body.inheritedAcquisition).toBeUndefined();
    expect(body.inheritedHouseValuation).toBeUndefined();
    expect((await post(body)).tax).toBe(283_866_000);
    const pre = computeTransferPerAssetSummary(form(d2({ buildingAcquisitionPrice: "", publishedValueAtInheritance: "900,000,000" })), null).rows[0];
    expect(pre.acqPending).toBe(true);
    expect(pre.acqPrice).toBe(0);
    expect(computeTransferPerAssetSummary(form(d2({ buildingAcquisitionPrice: "" })), null).rows[0].acqPrice).toBe(0);
  });

  it("B5 동일세대 3키는 D2에서도 ④ body로 전송된다 — 영 §154⑧3호 적용(계획서 §12 D2-Q3, 엔진 현행 유지) + 건물 피상속인 취득일 유지", async () => {
    const body = await buildBody(
      d2({
        decedentSameHouseholdBeforeInheritance: true,
        decedentCohabitationHoldingStartDate: "1995-01-01",
        decedentCohabitationResidenceMonths: "120",
      }),
    );
    expect(body.decedentSameHouseholdBeforeInheritance).toBe(true);
    expect(body.decedentCohabitationHoldingStartDate).toBe("1995-01-01");
    expect(body.decedentCohabitationResidenceMonths).toBe(120);
    expect(body.decedentAcquisitionDate).toBe("2000-01-01");
  });

  it("B6 ⑫+엔진: D2 결합 규칙이 들어갔다 — 건물 환산·소유자 분리·경계일 전은 400, 같은 날은 통과(⑧ 전용), 정상은 종전 값", async () => {
    const body = await buildBody(d2());
    const base = await post(body, { landAcquisitionCause: "purchase" });
    expect(base.status).toBe(200);
    expect(base.tax).toBe(283_866_000);
    expect([base.building?.acquisitionCause, base.building?.rateBasisRule, base.building?.appliedRateBasisDate]).toEqual([
      "inheritance", "decedent", "2000-01-01", // 건물은 피상속인 취득일 통산 → 세율이 갈린다(S3d · V-2)
    ]);
    const est = await post(body, { buildingAcqMode: "estimated", buildingStandardPriceAtAcquisition: 100_000_000, standardPriceAtTransfer: 500_000_000 });
    expect(est.status).toBe(400);
    expect(JSON.stringify(est.fieldErrors?.buildingAcqMode)).toContain("상속·증여로 취득한 건물은 취득가액을");
    const owner = await post(body, { selfOwns: "building_only" });
    expect(owner.status).toBe(400);
    const pre = await post(body, { acquisitionDate: "2003-05-01", landAcquisitionDate: "2002-01-10", decedentAcquisitionDate: "1990-01-01" });
    expect(pre.status).toBe(400);
    expect(JSON.stringify(pre.fieldErrors?.acquisitionDate)).toContain("기준시가(주택은 개별주택가격·공동주택가격)가 고시되기 전");
    const sameDay = await post(body, { landAcquisitionDate: "2025-05-01" });
    expect(sameDay.status).toBe(200);
    expect(sameDay.tax).toBe(283_866_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. D2-1 활성 — ④ 3경로 · ⑥ · ⑧ · 다건 · 술어 합성 (종전 todo)
// ─────────────────────────────────────────────────────────────────────────────
describe("C. D2-1 활성", () => {
  it("C1~C2 ①: 타입이 `purchase`·상속·증여 호스트를 받는다(컴파일) · factory `\"\"` 불변 · 호스트 불일치는 항상 무효", () => {
    const f = makeDefaultAsset(1);
    expect(f.landAcquisitionCause).toBe("");
    expect(f.landCauseHost).toBe("");
    expect(effectiveBuildingCauseMix(d2())).toBe("inheritance");
    expect(effectiveBuildingCauseMix(d2({ landCauseHost: "gift" as never }))).toBe(""); // 태그 ≠ 취득원인
    expect(effectiveBuildingCauseMix(d2({ landAcquisitionCause: "inheritance" }))).toBe(""); // 상속 호스트의 overlay는 `purchase`만 유효
    expect(effectiveBuildingCauseMix(d2({ hasSeperateLandAcquisitionDate: false }))).toBe("");
    expect(effectiveBuildingCauseMix(d2({ transferType: "burdened_gift" }))).toBe(""); // 부담부증여 무효
    expect(effectiveBuildingCauseMix(d2({ isMixedUseHouse: true }))).toBe("");
    expect(effectiveBuildingCauseMix(d2({ assetKind: "land" }))).toBe("");
  });

  it("C3~C5 ④: 상속·증여 호스트 유효 시 overlay `purchase`만 · 자산 단위 평가·환산 payload 미동봉 · 건물 방식 actual 고정(stale estimated 무시)", async () => {
    const body = await buildBody(d2({ buildingAcqMode: "estimated", useEstimatedAcquisition: true, publishedValueAtInheritance: "900,000,000" }));
    expect(body.landAcquisitionCause).toBe("purchase");
    expect(body.landDecedentAcquisitionDate).toBeUndefined();
    expect(body.landSec164Value).toBeUndefined();
    expect(body.inheritedAcquisition).toBeUndefined();
    expect(body.inheritedHouseValuation).toBeUndefined();
    expect(body.commercialInheritanceValuation).toBeUndefined();
    expect(body.buildingAcqMode).toBe("actual");
    expect(body.buildingAcquisitionPrice).toBe(400_000_000);
    expect(body.landAcquisitionPrice).toBe(300_000_000);
    expect(body.acquisitionDate).toBe("2025-05-01");
    expect(body.landAcquisitionDate).toBe("2025-01-10");
    expect(body.decedentAcquisitionDate).toBe("2000-01-01");
    const r = await post(body);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
  });

  it("C3b ④ 경계일 전 자산의 §164⑦ 환산 payload(`inheritedHouseValuation`)도 D2 유효 시 싣지 않는다 (게이트 단독 검증 — ⑫·⑧이 먼저 막는 경계일 전 시드)", async () => {
    const pre = {
      acquisitionDate: "1998-07-01", inheritanceStartDate: "1998-07-01", inheritanceDate: "1998-07-01", landAcquisitionDate: "1998-01-10", decedentAcquisitionDate: "1980-01-01",
      inheritanceAssetKind: "house_individual", inhHouseValLandArea: "200", inhHouseValLandPricePerSqmAtTransfer: "500000", inhHouseValLandPricePerSqmAtFirst: "300000",
      inhHouseValHousePriceAtFirst: "80000000", inhHouseValLandPricePerSqmAtInheritance: "200000",
    } as Partial<AssetForm>;
    const off = await buildBody(d2({ ...pre, hasSeperateLandAcquisitionDate: false, landAcquisitionCause: "", landCauseHost: "" }));
    expect(off.inheritedHouseValuation).toBeDefined(); // 긍정 짝: D2가 아니면 종전대로 싣는다
    expect((await buildBody(d2(pre))).inheritedHouseValuation).toBeUndefined();
  });

  it("C3c D1 술어는 `purchase`를 D1 호스트(신축·매매)에서도 돌려주지 않는다 — 잔재 `purchase`가 D1 소비처에서 상속·증여 UI·검증으로 읽히지 않는다", () => {
    for (const host of ["newConstruction", "purchase"] as const) {
      const a = d2({ acquisitionCause: host, landCauseHost: host as never }); // landAcquisitionCause "purchase" 잔재
      expect(effectiveLandAcquisitionCause(a)).toBe("");
      expect(buildLandPartCausePayload(a)).toEqual({});
    }
  });

  it("C3d ⑧ `validateLandPartCause` 직접 호출도 D2 건물 방식을 실가로 읽는다(stale estimated 무시) — validateSplitDirectInputs 경유 정규화에 기대지 않는다", () => {
    expect(validateLandPartCause(d2({ buildingAcqMode: "estimated" }), "자산1")).toBeNull();
  });

  it("C4 ④ 3경로(단건·다건·컴패니언) D2 payload 동일 — 원인 키·토지 취득일·건물 가액·건물 방식·평가 payload 부재", async () => {
    const a = d2();
    const single = await buildBody(a);
    const multi = buildPropertyPayload(form(a)) as unknown as Record<string, unknown>;
    const comp = buildAssetPayload({ ...a, assetId: "c1" } as AssetForm, "apportioned", TRANSFER_DATE) as Record<string, unknown>;
    for (const k of ["landAcquisitionCause", "landAcquisitionDate", "buildingAcquisitionPrice", "landAcquisitionPrice", "buildingAcqMode", "decedentAcquisitionDate", "acquisitionDate"]) {
      expect(multi[k], `multi.${k}`).toEqual(single[k]);
      expect(comp[k], `comp.${k}`).toEqual(single[k]);
    }
    for (const k of ["inheritedAcquisition", "inheritedHouseValuation", "inheritanceValuation", "commercialInheritanceValuation"]) {
      expect(single[k]).toBeUndefined();
      expect(multi[k]).toBeUndefined();
      expect(comp[k]).toBeUndefined();
    }
  });

  it("C7 ④ houses: D2 유효 시 §155②·7호 계열(isInherited·inheritedDate·동일세대 at inheritance·합가·선순위)을 싣지 않는다(D2-Q3) — D2 아니면 종전", () => {
    const house = { id: "h2", acquisitionDate: "2015-01-01", region: "capital", isInherited: false } as never;
    const sell = (a: AssetForm) =>
      (buildHousesPayload(a, [house], 0, undefined, TRANSFER_DATE) as { id: string; isInherited?: boolean; inheritedDate?: string; decedentSameHouseholdAtInheritance?: boolean }[]).find((h) => h.id === "selling")!;
    const mix = sell(d2({ decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "1995-01-01" }));
    expect(mix.isInherited).toBe(false);
    expect(mix.inheritedDate).toBeUndefined();
    expect(mix.decedentSameHouseholdAtInheritance).toBeUndefined();
    const plain = sell(d2({ hasSeperateLandAcquisitionDate: false, decedentSameHouseholdBeforeInheritance: true }));
    expect(plain.isInherited).toBe(true);
    expect(plain.decedentSameHouseholdAtInheritance).toBe(true);
  });

  it("C8~C9 ⑥: 건물 가액 미입력이면 pending(0), 입력하면 sum = 토지 + 건물(분리 합계가 상속 fallback보다 앞) · stale 건물 방식 estimated도 actual로 본다", () => {
    expect(separateAcqPartsSum(d2())).toEqual({ sum: 700_000_000, pending: false });
    expect(separateAcqPartsSum(d2({ buildingAcquisitionPrice: "" }))).toEqual({ sum: 300_000_000, pending: true });
    expect(separateAcqPartsSum(d2({ buildingAcqMode: "estimated" }))).toEqual({ sum: 700_000_000, pending: false });
    // D2가 아니면 건물 estimated는 환산 대기(종전)
    expect(separateAcqPartsSum(d2({ buildingAcqMode: "estimated", hasSeperateLandAcquisitionDate: true, landCauseHost: "" as never })).pending).toBe(true);
  });

  it("C10~C14 ⑧ D2 분기: 날짜·피상속인·동일세대 시작일·경계일·같은 날·토지일·stale 환산 — 이동 칸", () => {
    const f = (o: Partial<AssetForm>) => {
      const r = v8(d2(o));
      return { msg: r.result, field: r.result ? r.fieldOf(r.result) : undefined };
    };
    expect(f({ acquisitionDate: "" })).toMatchObject({ field: "acquisitionDate" });
    expect(f({ decedentAcquisitionDate: "" })).toMatchObject({ field: "decedentAcquisitionDate" });
    // 증여는 피상속인 요구 없음
    expect(v8(d2({ acquisitionCause: "gift", landCauseHost: "gift" as never, decedentAcquisitionDate: "" })).result).toBeNull();
    expect(f({ decedentSameHouseholdBeforeInheritance: true })).toMatchObject({ field: "decedentCohabitationHoldingStartDate" });
    expect(f({ decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "1995-01-01" }).msg).toBeNull();
    expect(f({ acquisitionDate: "2003-05-01", landAcquisitionDate: "2003-01-10", decedentAcquisitionDate: "1990-01-01" })).toMatchObject({ field: "acquisitionDate" });
    expect(f({ acquisitionDate: "2005-04-30", landAcquisitionDate: "2005-01-10", decedentAcquisitionDate: "1990-01-01" }).msg).toBeNull();
    expect(f({ landAcquisitionDate: "2025-05-01" })).toMatchObject({ field: "landAcquisitionDate" }); // Q-4 같은 날 — ⑧ 전용
    expect(landPartCauseSameDay(d2({ landAcquisitionDate: "2025-05-01" }))).toBe(true);
    expect(f({ landAcquisitionDate: "" })).toMatchObject({ field: "landAcquisitionDate" }); // G-12
    // 토지가 상속 뒤(개시 후 취득)는 통과
    expect(f({ landAcquisitionDate: "2025-09-01" }).msg).toBeNull();
    // stale 환산 플래그는 ④가 actual 고정이라 차단하지 않는다(C14)
    expect(f({ buildingAcqMode: "estimated", useEstimatedAcquisition: true }).msg).toBeNull();
  });

  it("C15 ⑧≡⑫ 격자: 호스트(상속·증여) × 셀 — ⑧이 통과면 ④ body가 ⑫·엔진을 통과하고, ⑧이 막으면 ⑫도 막거나(경계·토지일) ⑧ 전용(같은 날)", async () => {
    type Cell = { name: string; over: Partial<AssetForm>; eight: "pass" | "block"; twelve: "pass" | "block" };
    const cells: Cell[] = [
      { name: "정상", over: {}, eight: "pass", twelve: "pass" },
      { name: "토지가 개시 뒤", over: { landAcquisitionDate: "2025-09-01" }, eight: "pass", twelve: "pass" },
      { name: "stale 건물 환산(④ actual 고정)", over: { buildingAcqMode: "estimated", useEstimatedAcquisition: true }, eight: "pass", twelve: "pass" },
      { name: "토지 환산(토지 매매 허용)", over: { landAcqMode: "estimated", useEstimatedAcquisition: true, standardPricePerSqmAtAcq: "1000000", acquisitionArea: "100", standardPriceAtTransfer: "1000000000" } as never, eight: "pass", twelve: "pass" },
      { name: "경계일 전", over: { acquisitionDate: "2003-05-01", landAcquisitionDate: "2003-01-10", decedentAcquisitionDate: "1990-01-01" }, eight: "block", twelve: "block" },
      { name: "경계일 당일", over: { acquisitionDate: "2005-04-30", landAcquisitionDate: "2005-01-10", decedentAcquisitionDate: "1990-01-01" }, eight: "pass", twelve: "pass" },
      { name: "토지일 비움", over: { landAcquisitionDate: "" }, eight: "block", twelve: "block" },
      { name: "같은 날(⑧ 전용)", over: { landAcquisitionDate: "2025-05-01" }, eight: "block", twelve: "pass" },
      { name: "건물 가액 비움", over: { buildingAcquisitionPrice: "" }, eight: "block", twelve: "block" },
    ];
    for (const host of ["inheritance", "gift"] as const) {
      for (const c of cells) {
        const a = d2({ acquisitionCause: host, landCauseHost: host as never, ...(host === "gift" ? { decedentAcquisitionDate: "" } : {}), ...c.over });
        const eight = v8(a).result ? "block" : "pass";
        const r = await run(a);
        const twelve = r.status === 200 ? "pass" : "block";
        expect(eight, `⑧ ${host}/${c.name}`).toBe(c.eight);
        expect(twelve, `⑫ ${host}/${c.name}`).toBe(c.twelve);
        // 막다른 길 없음: ⑧ 통과 ⇒ ⑫ 통과
        if (eight === "pass") expect(twelve, `막다른 길 ${host}/${c.name}`).toBe("pass");
      }
    }
  });

  it("C16 ⑧ 다건: D2 유효 상속 자산이 신고가액 미입력으로 막히지 않는다 / D2가 아니면 종전 차단 · PHD 플래그는 D2 유효 시 무시", () => {
    const item = (a: AssetForm) => ({ ...form(a), assets: [a] }) as never;
    expect(validateMultiSupportedMode(item(d2()))).toBeNull();
    expect(validateMultiSupportedMode(item(d2({ hasSeperateLandAcquisitionDate: false, landAcquisitionCause: "" }))) ?? "").toContain("상속 취득가액(신고가액)");
    expect(validateMultiSupportedMode(item(d2({ usePreHousingDisclosure: true })))).toBeNull();
    expect(phdFlagEffective(d2({ usePreHousingDisclosure: true }))).toBe(false);
  });

  it("C17 합성 술어·FB 게이트: 가업상속 카드는 D2 유효 시 닫힌다", () => {
    expect(allowsFamilyBusinessInheritance(d2())).toBe(false);
    expect(allowsFamilyBusinessInheritance(d2({ hasSeperateLandAcquisitionDate: false }))).toBe(true);
  });

  it("다건 route: D2 body(`buildPropertyPayload`)를 받는다 — 멀티 ⑫·⑭가 overlay·건물 가액을 운반해 단건과 같은 세액", async () => {
    const a = d2();
    const multi = buildPropertyPayload(form(a)) as unknown as Record<string, unknown>;
    const single = await buildBody(a);
    const m = await post(Object.fromEntries(Object.entries(multi).filter(([, v]) => v !== undefined)));
    const sgl = await post(single);
    expect(m.status, JSON.stringify(m.fieldErrors)).toBe(200);
    expect(m.tax).toBe(sgl.tax);
    expect(m.land?.acquisitionCause).toBe("purchase");
  });
});

// ⑦ 표시(C17~C19 종전 todo)는 D2-3에서 `__tests__/components/split-acq-cause-mixed-d2-3.ui.anchor.test.tsx`(4뷰)로 활성화했다.
