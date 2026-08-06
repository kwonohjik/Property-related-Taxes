/**
 * anchor(D-0): §164 opt-in 판정에서 **공유 필드는 trigger가 아니다**.
 *
 * #1106이 「부분 입력 → 차단」을 넣으면서 필수 필드 목록에 **§164 전용이 아닌 필드**까지 넣었다:
 *   · 토지 `acquisitionArea`(취득 당시 면적) — 취득원인 블록 등 **여러 곳**에서 입력한다
 *   · 상가 `cbExclusiveArea`·`cbSharedArea`·`cbLandArea` — 일반 면적 섹션(`AssetAreaCommercial`)
 * ⇒ 면적만 입력해도 `filled>0`이 되어 「§164를 쓰겠다」는 의사가 없는 사용자까지 차단됐다.
 *    1990.8.30. 이전 상속·증여 **토지 전반**이 영향 범위였다(2026-08-06 probe 실측).
 *
 * 판별 기준은 **입력 위젯이 §164 섹션 밖에도 있는가**다. `inhHouseVal*`는 §164⑤~⑦ 전용 섹션에만
 * 있으므로 **여전히 trigger**다 — 그 칸을 채웠다는 건 그 경로를 쓰겠다는 뜻이다.
 *
 * 설계: docs/02-design/features/pre-deemed-clause-a-confirmation-criteria.engine.design.md §3.2.1
 */
import { describe, it, expect } from "vitest";
import {
  sec164LandStatus,
  sec164CommercialStatus,
  sec164HouseStatus,
  isPartiallyFilled,
  isFullyFilled,
} from "../../lib/calc/sec164-required-fields";
import { validateAssetAcquisition } from "../../lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";

const TRANSFER_DATE = "2025-06-01";

function asset(over: Partial<AssetForm>): AssetForm {
  return { ...makeDefaultAsset(1), ...over } as AssetForm;
}

/** 1987년 증여받은 토지 — §163⑨1호(§164④) 대상 구간 */
function giftLand(over: Partial<AssetForm> = {}): AssetForm {
  return asset({
    assetKind: "land",
    landNature: "standalone",
    acquisitionCause: "gift",
    acquisitionDate: "1987-05-01",
    donorAcquisitionDate: "1970-01-01",
    fixedAcquisitionPrice: "50000000",
    actualSalePrice: "500000000",
    standardPriceAtTransfer: "200000000",
    ...over,
  });
}

/** 2000년 상속받은 상가 — §163⑨2호(§164⑥) 대상 구간 */
function inhCommercial(over: Partial<AssetForm> = {}): AssetForm {
  return asset({
    assetKind: "commercial_building",
    acquisitionCause: "inheritance",
    acquisitionDate: "2000-03-01",
    inheritanceStartDate: "2000-03-01",
    decedentAcquisitionDate: "1990-01-01",
    publishedValueAtInheritance: "300000000",
    actualSalePrice: "920000000",
    ...over,
  });
}

describe("D-0: 공유 필드는 §164 opt-in trigger가 아니다", () => {
  it("S-1: 토지 — 면적만 입력하면 부분 입력이 **아니다** (차단 없음)", () => {
    const a = giftLand({ acquisitionArea: "1000" });
    const s = sec164LandStatus(a);

    expect(s?.filled).toBe(1); // 면적 1칸은 채워졌지만
    expect(s?.triggered).toBe(false); // §164 전용 칸은 하나도 없다
    expect(isPartiallyFilled(s)).toBe(false);
    expect(validateAssetAcquisition(a, "자산1", TRANSFER_DATE)).toBeNull();
  });

  it("S-2: 토지 — 등급 1개라도 손대면 부분 입력으로 **차단**(#1106 본래 의도 보존)", () => {
    const a = giftLand({ acquisitionArea: "1000", pre1990Grade_current: "100" });
    const s = sec164LandStatus(a);

    expect(s?.triggered).toBe(true);
    expect(isPartiallyFilled(s)).toBe(true);
    expect(validateAssetAcquisition(a, "자산1", TRANSFER_DATE)).toContain("§164④");
  });

  it("S-3: 토지 — 등급 3종+1990가를 채웠는데 **면적이 비면** 여전히 차단(계산 불가)", () => {
    const a = giftLand({
      acquisitionArea: "",
      pre1990Grade_current: "100",
      pre1990Grade_prev: "100",
      pre1990Grade_atAcq: "100",
      pre1990PricePerSqm_1990: "100000",
    });

    expect(isPartiallyFilled(sec164LandStatus(a))).toBe(true);
    expect(validateAssetAcquisition(a, "자산1", TRANSFER_DATE)).toContain("취득 당시 면적");
  });

  it("S-4: 토지 — 5필드 전건 충족은 그대로 통과·payload 대상", () => {
    const a = giftLand({
      acquisitionArea: "1000",
      pre1990Grade_current: "100",
      pre1990Grade_prev: "100",
      pre1990Grade_atAcq: "100",
      pre1990PricePerSqm_1990: "100000",
    });

    expect(isFullyFilled(sec164LandStatus(a))).toBe(true);
    expect(isPartiallyFilled(sec164LandStatus(a))).toBe(false);
  });

  it("S-5: 상가 — 면적 3종만 입력하면 부분 입력이 **아니다**", () => {
    const a = inhCommercial({ cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "30" });
    const s = sec164CommercialStatus(a);

    expect(s?.filled).toBe(3);
    expect(s?.triggered).toBe(false);
    expect(isPartiallyFilled(s)).toBe(false);
  });

  it("S-6: 상가 — 가격 필드를 손대면 부분 입력으로 차단", () => {
    const a = inhCommercial({
      cbExclusiveArea: "50",
      cbSharedArea: "20",
      cbLandArea: "30",
      cbBuildingStdPriceAtAcq: "100000000",
    });
    const s = sec164CommercialStatus(a);

    expect(s?.triggered).toBe(true);
    expect(isPartiallyFilled(s)).toBe(true);
  });

  it("S-7: 주택 — `inhHouseVal*`은 §164 전용이라 **면적만 채워도 trigger**", () => {
    const a = asset({
      assetKind: "housing",
      acquisitionCause: "inheritance",
      acquisitionDate: "2000-03-01",
      inheritanceStartDate: "2000-03-01",
      decedentAcquisitionDate: "1990-01-01",
      publishedValueAtInheritance: "300000000",
      inhHouseValLandArea: "100",
      actualSalePrice: "920000000",
    });
    const s = sec164HouseStatus(a);

    expect(s?.triggered).toBe(true);
    expect(isPartiallyFilled(s)).toBe(true);
  });

  it("S-8(경계): 1990.8.30. 이후 취득 토지는 §164④ 대상이 아니다", () => {
    const a = giftLand({ acquisitionDate: "1995-05-01", acquisitionArea: "1000" });

    expect(sec164LandStatus(a)).toBeNull();
    expect(validateAssetAcquisition(a, "자산1", TRANSFER_DATE)).toBeNull();
  });
});
