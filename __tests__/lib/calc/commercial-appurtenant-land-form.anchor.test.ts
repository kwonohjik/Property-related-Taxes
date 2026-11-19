/**
 * anchor — CB 부수토지 판정 폼 배관 (Phase D): ①②③ store · ⑧ validate · ⑬ API 변환
 *
 * ⑬은 TypeScript가 잡지 못하는 지점이라(body spread 누락 = 침묵 stripping) 값으로 고정한다.
 * ⑧은 "UI 통과 ↔ validate 차단" 모순을 막기 위해 API 변환 조건과 1:1로 맞춘다.
 */
import { describe, it, expect } from "vitest";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildCommercialAppurtenantLand } from "@/lib/calc/transfer-tax-api-helpers";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const cbAsset = (overrides: Partial<AssetForm> = {}): AssetForm => ({
  ...makeDefaultAsset(1),
  assetKind: "commercial_building",
  ...overrides,
});

/** 초과분의 토지·건물 구분 기준시가 4칸(NBL2611-V5-BX01) — 초과분이 있는 입력은 이 4칸이 필수다 */
const PART_FIELDS = {
  cbPartAcqLandStd: "360,000,000",
  cbPartAcqBuildingStd: "240,000,000",
  cbPartTransferLandStd: "720,000,000",
  cbPartTransferBuildingStd: "480,000,000",
};
const PART_BASIS = { acquisitionLandStd: 360_000_000, acquisitionBuildingStd: 240_000_000, transferLandStd: 720_000_000, transferBuildingStd: 480_000_000 };
const FULL = {
  cbTotalLandArea: "1200",
  cbTotalBuildingFootprintArea: "200",
  cbZoneType: "commercial",
  ...PART_FIELDS,
};

describe("F-1 (①②③) — store 기본값·마이그레이션", () => {
  it("신규 자산의 부수토지 필드는 빈 문자열·false로 초기화된다", () => {
    const a = makeDefaultAsset(1);
    expect(a.cbTotalLandArea).toBe("");
    expect(a.cbTotalBuildingFootprintArea).toBe("");
    expect(a.cbZoneType).toBe("");
    expect(a.cbUnapprovedBuilding).toBe(false);
    // NBL2611-V5-BX01 — 토지·건물 구분 기준시가 4칸도 «미입력»으로 시작한다
    expect([a.cbPartAcqLandStd, a.cbPartAcqBuildingStd, a.cbPartTransferLandStd, a.cbPartTransferBuildingStd]).toEqual(["", "", "", ""]);
  });
});

describe("F-2 (⑬) — API 변환", () => {
  it("두 면적이 모두 있으면 payload를 만든다", () => {
    expect(buildCommercialAppurtenantLand(cbAsset(FULL))).toEqual({
      totalLandArea: 1200,
      totalBuildingFootprintArea: 200,
      zoneType: "commercial",
      partBasis: PART_BASIS,
    });
  });

  it("토지·건물 구분 기준시가는 네 칸이 모두 채워졌을 때만 싣는다 — 일부만 보내면 API가 400을 낸다 (④와 ⑧의 같은 함수)", () => {
    const { cbPartTransferBuildingStd: _drop, ...three } = PART_FIELDS;
    void _drop;
    expect(buildCommercialAppurtenantLand(cbAsset({ ...FULL, ...three, cbPartTransferBuildingStd: "" }))).toEqual({
      totalLandArea: 1200,
      totalBuildingFootprintArea: 200,
      zoneType: "commercial",
    });
  });

  it("면적이 하나라도 없으면 undefined (판정 불가 — 부분 payload 전송 금지)", () => {
    expect(buildCommercialAppurtenantLand(cbAsset())).toBeUndefined();
    expect(
      buildCommercialAppurtenantLand(cbAsset({ cbTotalLandArea: "1200" })),
    ).toBeUndefined();
    expect(
      buildCommercialAppurtenantLand(cbAsset({ cbTotalBuildingFootprintArea: "200" })),
    ).toBeUndefined();
  });

  it("§101① 단서 시 zoneType을 생략하고 unapprovedBuilding를 보낸다", () => {
    expect(
      buildCommercialAppurtenantLand(
        cbAsset({ ...FULL, cbZoneType: "", cbUnapprovedBuilding: true }),
      ),
    ).toEqual({
      totalLandArea: 1200,
      totalBuildingFootprintArea: 200,
      unapprovedBuilding: true,
      partBasis: PART_BASIS,
    });
  });

  it("상업용건물이 아니면 undefined (다른 자산 종류에 누수 금지)", () => {
    expect(
      buildCommercialAppurtenantLand({ ...cbAsset(FULL), assetKind: "housing" }),
    ).toBeUndefined();
    expect(
      buildCommercialAppurtenantLand({ ...cbAsset(FULL), assetKind: "general_building" }),
    ).toBeUndefined();
  });

  it("취득방법과 무관하게 만들어진다 — 상속·실거래가 CB에서도 판정된다", () => {
    for (const overrides of [
      { acquisitionCause: "inheritance" as const },
      { useEstimatedAcquisition: false },
      { useEstimatedAcquisition: true },
    ]) {
      expect(buildCommercialAppurtenantLand(cbAsset({ ...FULL, ...overrides }))).toBeTruthy();
    }
  });
});

describe("F-3 (⑧) — validate가 API 변환 조건과 일치한다", () => {
  /** validate는 다른 사유로도 실패할 수 있으므로 부수토지 메시지 유무로 판정한다. */
  const appurtenantError = (a: AssetForm): string | null => {
    const err = validateAssetAcquisition(a, "자산 1", "2024-06-01");
    return err && err.includes("부수토지 판정") ? err : null;
  };

  it("둘 다 공란이면 통과 (판정 생략 — 선택 기능)", () => {
    expect(appurtenantError(cbAsset())).toBeNull();
  });

  it("대지면적만 입력하면 차단 — API가 조용히 payload를 버리는 것을 막는다", () => {
    expect(appurtenantError(cbAsset({ cbTotalLandArea: "1200" }))).toContain("바닥면적");
  });

  it("바닥면적만 입력하면 차단", () => {
    expect(appurtenantError(cbAsset({ cbTotalBuildingFootprintArea: "200" }))).toContain(
      "대지면적",
    );
  });

  it("면적은 있는데 용도지역이 없으면 차단 (엔진 throw 전에 막는다)", () => {
    expect(appurtenantError(cbAsset({ ...FULL, cbZoneType: "" }))).toContain("용도지역");
  });

  it("§101① 단서면 용도지역 없이도 통과", () => {
    expect(
      appurtenantError(cbAsset({ ...FULL, cbZoneType: "", cbUnapprovedBuilding: true })),
    ).toBeNull();
  });

  it("완전 입력이면 통과", () => {
    expect(appurtenantError(cbAsset(FULL))).toBeNull();
  });

  /** ⑧ NBL2611-V5-BX01 — 초과분이 있으면 토지·건물 구분 기준시가 4칸이 필수다(자동 안분 fallback 금지) */
  const partError = (a: AssetForm): string | null => {
    const err = validateAssetAcquisition(a, "자산 1", "2024-06-01");
    return err && err.includes("부수토지 초과분") ? err : null;
  };

  it("초과분이 있는데 4칸이 비면 차단 — 위에서부터 첫 빈 칸을 가리킨다", () => {
    const base = { cbTotalLandArea: "1200", cbTotalBuildingFootprintArea: "200", cbZoneType: "commercial" };
    expect(partError(cbAsset(base))).toContain("취득 당시 토지 기준시가");
    expect(partError(cbAsset({ ...base, cbPartAcqLandStd: "1" }))).toContain("취득 당시 건물 기준시가");
    expect(partError(cbAsset({ ...base, cbPartAcqLandStd: "1", cbPartAcqBuildingStd: "1" }))).toContain("양도 당시 토지 기준시가");
    expect(partError(cbAsset({ ...base, cbPartAcqLandStd: "1", cbPartAcqBuildingStd: "1", cbPartTransferLandStd: "1" }))).toContain("양도 당시 건물 기준시가");
  });

  it("무허가 단서(전량 비사업용)도 4칸이 필수다", () => {
    expect(partError(cbAsset({ cbTotalLandArea: "1200", cbTotalBuildingFootprintArea: "200", cbUnapprovedBuilding: true }))).toContain("취득 당시 토지 기준시가");
  });

  it("초과분이 없으면(녹지 7배) 4칸이 비어도 통과한다", () => {
    expect(partError(cbAsset({ cbTotalLandArea: "1200", cbTotalBuildingFootprintArea: "200", cbZoneType: "green" }))).toBeNull();
  });

  it("취득 당시·양도 당시 각각 토지·건물 합이 0이면 차단", () => {
    expect(partError(cbAsset({ ...FULL, cbPartAcqLandStd: "0", cbPartAcqBuildingStd: "0" }))).toContain("취득 당시");
    expect(partError(cbAsset({ ...FULL, cbPartTransferLandStd: "0", cbPartTransferBuildingStd: "0" }))).toContain("양도 당시");
  });

  it("음수 기준시가는 차단 — API(Zod)가 400으로 막는 값을 UI가 통과시키지 않는다", () => {
    expect(partError(cbAsset({ ...FULL, cbPartAcqLandStd: "-1" }))).toContain("0 이상");
  });

  it("④가 payload를 만드는 조건과 ⑧이 통과시키는 조건이 같다 — 통과하면 partBasis가 실린다", () => {
    const a = cbAsset(FULL);
    expect(partError(a)).toBeNull();
    expect((buildCommercialAppurtenantLand(a) as { partBasis?: unknown }).partBasis).toEqual(PART_BASIS);
  });

  /**
   * 🔑 **단서 ON + 면적 공란** (2026-09-06 UI 리뷰).
   *
   * 종전 anchor는 단서 케이스를 늘 `FULL`(면적 채움) 위에서만 봤고, **그 칸을 비운 케이스가
   * 없어** 결함이 그대로 남았다. 토글을 켜면 ⑤가 면적칸을 렌더에서 빼버려 두 값이 빈 채로
   * 남고, ④가 payload 전체를 `undefined`로 버리며(`transfer-tax-api-commercial.ts:32`)
   * `unapprovedBuilding: true`까지 함께 사라져 **+10%p 중과가 전혀 적용되지 않았다**.
   * 화면은 「부속토지 전체 비사업용」이라 확언하는데 세액은 그 반대였다.
   */
  it("🔑 §101① 단서 ON인데 면적이 비면 차단 — 중과가 조용히 사라지는 것을 막는다", () => {
    const err = appurtenantError(cbAsset({ cbUnapprovedBuilding: true }));
    expect(err).toContain("허가·사용승인 미이행");
    expect(err).toContain("§101① 단서");
  });

  it("§101① 단서 ON + 면적 입력 → 통과 (①까지 배선되면 막지 않는다)", () => {
    expect(
      appurtenantError(cbAsset({ ...FULL, cbZoneType: "", cbUnapprovedBuilding: true })),
    ).toBeNull();
  });

  it("단서 OFF + 둘 다 공란은 종전대로 통과 (판정 생략 — 과차단 금지)", () => {
    expect(appurtenantError(cbAsset())).toBeNull();
  });
});
