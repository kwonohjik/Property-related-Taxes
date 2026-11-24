/**
 * NBL2611-V1-A (R19 · Q-1) — 재산세 분류 «근거» 칸이 14지점을 끝까지 통과한다.
 *   ④⑬ 폼 → fetch body(근거 칸 전송) · ⑫ Zod(enum·철거 바닥면적 refine) · ⑭ route → 엔진 · ⑧ validate(같은 술어) · 이력 복원(migrate) · 컴패니언 카드 경로
 *
 * 시료: 함께 양도 컴패니언 토지 300㎡(actual · 양도 4억 · 취득 2억) · 2024-06-03 양도 · 건축물 없는 기타토지 · 재산세 «별도합산» 선언.
 * 대조군 = 같은 컴패니언의 표지만 끈 값(`isNonBusinessLand: false`) — 판정이 «사업용»이면 표지를 끈 값과 같아야 한다.
 */
import { describe, it, expect, vi } from "vitest";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const NO_BUILDING_SEPARATE = {
  nblLandType: "other_land",
  nblZoneType: "general_residential",
  nblOtherHasBuilding: false,
  nblOtherPropertyTaxType: "separate",
  // NBL-STATE-HISTORY-U1 픽스처 보정 — 기타토지는 「소유기간 중 건축물 이력」 질문에 답해야 ⑧을 통과한다(미선택 `""`은 ⑧ #1이 막는다). 이 파일의 주제와 무관해 «바뀐 적 없음».
  nblOtherStateHistoryMode: "unchanged",
} as Partial<AssetForm>;

function form(over: Partial<AssetForm>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = "2024-06-03";
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "700,000,000";
  f.bundledSaleMode = "actual";
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "land", landNature: "standalone", acquisitionDate: "2010-01-01", acquisitionArea: "300",
    fixedAcquisitionPrice: "280,000,000", actualSalePrice: "300,000,000", addressJibun: "서울 강남구 테스트동 1",
  } as AssetForm;
  f.assets.push({
    ...makeDefaultAsset(2),
    assetKind: "land", landNature: "standalone", acquisitionCause: "purchase", acquisitionDate: "2014-01-02", acquisitionArea: "300",
    transferArea: "300", fixedAcquisitionPrice: "200,000,000", actualSalePrice: "400,000,000", addressJibun: "서울 강남구 테스트동 2",
    ...over,
  } as AssetForm);
  return f;
}

type Prop = {
  propertyId: string;
  nonBusinessLandJudgmentDetail?: {
    isNonBusinessLand: boolean;
    propertyTaxBasis?: { outcome: string; effective: string; basis?: string };
    areaProportioning?: { nonBusinessRatio: number };
    warnings: string[];
  };
};
async function run(over: Partial<AssetForm>) {
  const r = await runCalc(form(over));
  const agg = (r.json as Loose)?.data?.aggregated as { totalTax: number; properties: Prop[] } | undefined;
  const companion = (r.body.companionAssets as Loose[])[0];
  return {
    status: r.status,
    json: r.json as Loose,
    issues: r.issues,
    raw: companion.nonBusinessLandRaw as Loose | undefined,
    total: agg?.totalTax,
    nbl: agg?.properties.find((p) => p.propertyId !== "primary")?.nonBusinessLandJudgmentDetail,
  };
}

const OFF = { isNonBusinessLand: false } as Partial<AssetForm>;
const ON = { isNonBusinessLand: true, nblUseDetailedJudgment: true } as Partial<AssetForm>;

describe("NBL2611-V1-A · 재산세 분류 근거 — 14지점 end-to-end", () => {
  it("D1 근거 미선택: 종합합산 + 확인 필요 → 비사업용(전량) — ⑧ 차단 아님(이슈 0) · 역버그 방지 유지", async () => {
    const off = await run({ ...OFF, ...NO_BUILDING_SEPARATE });
    const on = await run({ ...ON, ...NO_BUILDING_SEPARATE });
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    expect(on.issues).toEqual([]);
    expect(on.nbl?.isNonBusinessLand).toBe(true);
    expect(on.nbl?.propertyTaxBasis).toMatchObject({ outcome: "unconfirmed", effective: "comprehensive" });
    expect(on.nbl?.warnings.some((w) => w.includes("재산세 분류") && w.includes("확인 필요"))).toBe(true);
    expect(on.total).toBeGreaterThan(off.total!);
  });

  it("D2 근거 선택(공지상태): ④⑬ 근거 칸이 raw로 전송 → ⑫ 통과 → ⑭ 엔진 도달 → 사업용 — 표지를 끈 값과 같다", async () => {
    const off = await run({ ...OFF, ...NO_BUILDING_SEPARATE });
    const own = { ...NO_BUILDING_SEPARATE, nblOtherPropertyTaxBasis: "vacant_state" } as Partial<AssetForm>;
    const on = await run({ ...ON, ...own });
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    expect(on.issues).toEqual([]);
    expect(on.raw?.nblOtherPropertyTaxBasis).toBe("vacant_state"); // ⑬ 전송
    expect(on.nbl?.isNonBusinessLand).toBe(false); // ⑭ 도달
    expect(on.nbl?.propertyTaxBasis).toMatchObject({ outcome: "accepted", basis: "vacant_state", effective: "separate" });
    expect(on.total).toBe(off.total);
  });

  it("D3 철거·멸실 + 종전 바닥면적 미입력: ⑧이 막고(입력칸 nblOtherDemolishedFloorArea) 직접 API도 ⑫ 400", async () => {
    // E3f-1b — 철거ㆍ멸실일(이력 없음 → 새 칸)을 채워 둔다: 이 시료의 주제는 바닥면적이다(철거일 미입력은 아래 D3b).
    const own = { ...NO_BUILDING_SEPARATE, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedOn: "2024-03-01" } as unknown as Partial<AssetForm>;
    const on = await run({ ...ON, ...own });
    expect(on.issues.some((i) => i.field === "nblOtherDemolishedFloorArea")).toBe(true);
    expect(on.status).toBe(400);
  });

  it("D3b 철거·멸실 + 철거ㆍ멸실일 미입력(이력 없음): ⑧이 먼저 철거일 칸(nblOtherDemolishedOn)을 막고 직접 API도 ⑫ 400 — 바닥면적은 철거일 뒤", async () => {
    const own = { ...NO_BUILDING_SEPARATE, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "15" } as Partial<AssetForm>;
    const on = await run({ ...ON, ...own });
    expect(on.issues[0]?.field).toBe("nblOtherDemolishedOn");
    expect(on.status).toBe(400);
  });

  it("D4 철거·멸실 + 종전 바닥면적 15㎡ × 일반주거 4배 = 60㎡ → 초과 240㎡(0.8) 비사업용 안분", async () => {
    // E3f-1b — 철거ㆍ멸실일 필수(이력 없음 → 새 칸 `nblOtherDemolishedOn`) · 한시 안(양도 2024-06-03 직전 과세기준일 2024-06-01 — 철거 2024-03-01) → 근거 인정.
    const own = { ...NO_BUILDING_SEPARATE, nblOtherPropertyTaxBasis: "demolished", nblOtherDemolishedFloorArea: "15", nblOtherDemolishedOn: "2024-03-01" } as Partial<AssetForm>;
    const on = await run({ ...ON, ...own });
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    expect(on.issues).toEqual([]);
    expect(on.raw?.nblOtherDemolishedOn).toBe("2024-03-01"); // ④⑬ 전송 → ⑫ 통과(침묵 strip 아님)
    expect(on.nbl?.isNonBusinessLand).toBe(true);
    expect(on.nbl?.areaProportioning?.nonBusinessRatio).toBe(0.8);
  });

  it("D5 철거·멸실 + 세분 전 용도지역(residential): 배율표에 없어 ⑧이 막는다(엔진 500 방지)", async () => {
    const own = {
      ...NO_BUILDING_SEPARATE,
      nblZoneType: "residential",
      nblOtherPropertyTaxBasis: "demolished",
      nblOtherDemolishedFloorArea: "15",
      nblOtherDemolishedOn: "2024-03-01",
    } as unknown as Partial<AssetForm>;
    const on = await run({ ...ON, ...own });
    expect(on.issues.some((i) => i.field === "nblZoneType")).toBe(true);
    expect(on.status).toBe(400);
  });

  it("D6 직접 API: enum 밖 근거 값은 ⑫ Zod가 400(미지원 값이 조용히 읽히지 않는다)", async () => {
    const own = { ...NO_BUILDING_SEPARATE, nblOtherPropertyTaxBasis: "foo" } as unknown as Partial<AssetForm>;
    const on = await run({ ...ON, ...own });
    expect(on.status).toBe(400);
  });

  it("D7 숨은 stale 값: 선언을 종합합산으로 바꾼 뒤 남은 근거·철거 면적은 전송돼도 판정에 쓰이지 않는다", async () => {
    const own = {
      nblLandType: "other_land",
      nblZoneType: "general_residential",
      nblOtherPropertyTaxType: "comprehensive",
      nblOtherPropertyTaxBasis: "vacant_state",
      nblOtherDemolishedFloorArea: "15",
    } as Partial<AssetForm>;
    const on = await run({ ...ON, ...own });
    expect(on.status, JSON.stringify(on.json).slice(0, 300)).toBe(200);
    expect(on.nbl?.isNonBusinessLand).toBe(true);
    expect(on.nbl?.propertyTaxBasis).toBeUndefined();
  });
});

describe("NBL2611-V1-A · 이력 복원(migrate) — 구 이력은 근거 미선택으로 읽힌다", () => {
  it("근거 칸이 없는 구 이력(별도합산 선언 · 건축물 없음)은 '' / ''로 복원되고 종합합산 + 확인 필요(세액 불변)", async () => {
    const legacy = { ...makeDefaultAsset(2), ...NO_BUILDING_SEPARATE } as Record<string, unknown>;
    delete legacy.nblOtherPropertyTaxBasis;
    delete legacy.nblOtherDemolishedFloorArea;
    const restored = migrateAsset(legacy);
    expect(restored.nblOtherPropertyTaxBasis).toBe("");
    expect(restored.nblOtherDemolishedFloorArea).toBe("");

    // 복원 자산을 그대로 계산 — master(근거 모델 이전)와 같은 비사업용 전량.
    const nblFields = Object.fromEntries(Object.entries(restored).filter(([k]) => k.startsWith("nblOther") || k === "nblLandType" || k === "nblZoneType"));
    const on = await run({ ...ON, ...nblFields } as Partial<AssetForm>);
    expect(on.status).toBe(200);
    expect(on.nbl?.isNonBusinessLand).toBe(true);
    expect(on.nbl?.areaProportioning).toBeUndefined();
    expect(on.nbl?.propertyTaxBasis).toMatchObject({ outcome: "unconfirmed" });
  });
});
