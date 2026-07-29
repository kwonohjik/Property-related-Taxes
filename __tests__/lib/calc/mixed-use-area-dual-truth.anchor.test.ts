/**
 * anchor — 겸용주택 면적 파생 dual-truth 3건 + three-state 파괴 수정.
 *
 * 설계: docs/02-design/features/mixed-use-area-single-source-editable.engine.design.md §4
 *
 * D1 `MixedUseLegacyStdPrice.tsx:49-50` — computeDerivedAreas 미사용 → override 무시 (컴포넌트 anchor 별도)
 * D2 `transfer-pre1990-phd-bridge.ts:35` — `||` → 적법한 0이 자동 안분값으로 덮어써짐
 * E7-a `helpers.ts:79` — `round2(T − x)` (정본 `residualArea(T, x)`) → T 3자리 소수에서 ±0.01㎡
 *
 * ⚠️ `parseArea`/`parseFloat`는 항상 number를 반환하므로 **`??`는 미발동**한다.
 *    정정은 반드시 **문자열 수준 분기**(`(x ?? "").trim() !== ""`).
 */
import { describe, it, expect } from "vitest";
import { derivePhdResidentialLandArea } from "@/lib/calc/transfer-pre1990-phd-bridge";
import { computeAcqDerivedAreas } from "@/lib/tax-engine/transfer-tax-mixed-use-helpers";
import { residualArea, round2 } from "@/lib/tax-engine/area-utils";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MixedUseAssetInput, MixedUseDerivedAreas } from "@/lib/tax-engine/types/transfer-mixed-use.types";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    isMixedUseHouse: true,
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    mixedUseTotalLandArea: "200",
    buildingFootprintArea: "100",
    ...over,
  };
}

// 2026-07-15 축 이동 — 주택부수토지의 소스가 PHD 패널 전용 `phdResidentialLandArea`에서
// **①카드 `mixedResidentialLandAreaOverride`**로 통일됐다. 종전 필드는 ⑫ Zod가 strip해
// 엔진 부수토지에 도달한 적이 없어(PHD 패널에만 반영) 이중 입력이었다.
// three-state("" = 자동 / "0" = 적법한 0) 계약 자체는 그대로 — 축만 바뀐다.
describe("[D2] transfer-pre1990-phd-bridge — ①카드 단일 소스 + three-state 0 보존", () => {
  it("override 미입력('') → 자동 안분값", () => {
    // 회귀 방어: 정정이 자동 안분을 죽이지 않아야 한다(`??` 오적용 시 0이 반환됨)
    expect(derivePhdResidentialLandArea(asset({ mixedResidentialLandAreaOverride: "" }))).toBe(100);
  });

  it("override = '0' (적법한 0) → 0 보존, 자동 안분으로 덮어쓰지 않음", () => {
    expect(derivePhdResidentialLandArea(asset({ mixedResidentialLandAreaOverride: "0" }))).toBe(0);
  });

  it("override = '90.29' → 그대로", () => {
    expect(derivePhdResidentialLandArea(asset({ mixedResidentialLandAreaOverride: "90.29" }))).toBe(
      90.29,
    );
  });

  it("★상가 override만 지정 → 주택은 잔액 (computeDerivedAreas 정본 위임 확인)", () => {
    // 자체 재구현이면 상가 override를 못 봐서 자동 안분(100)이 나온다.
    expect(
      derivePhdResidentialLandArea(asset({ mixedCommercialLandAreaOverride: "130" })),
    ).toBe(70);
  });

  it("★PHD 패널 전용 필드는 더 이상 면적을 바꾸지 않는다 (이중 입력 제거)", () => {
    // migrate가 ①카드로 이관하므로 이 필드는 소스가 아니다.
    expect(derivePhdResidentialLandArea(asset({ phdResidentialLandArea: "55" }))).toBe(100);
  });

  it("UI·bridge 단일 소스 — 같은 asset에 같은 값", () => {
    for (const v of ["", "0", "90.29", "150"]) {
      const a = asset({ mixedResidentialLandAreaOverride: v });
      // UI(MixedUsePreHousingDisclosureSection)도 이 헬퍼를 직접 호출한다
      expect(derivePhdResidentialLandArea(a)).toBe(derivePhdResidentialLandArea(a));
    }
    // 0은 자동값(100)과 달라야 한다 — three-state 보존
    expect(derivePhdResidentialLandArea(asset({ mixedResidentialLandAreaOverride: "0" }))).not.toBe(
      derivePhdResidentialLandArea(asset({ mixedResidentialLandAreaOverride: "" })),
    );
  });
});

// [B2] PHD landArea three-state — **전용 anchor 미작성 (한계 명시)**
//   B2는 2계층 결함이었다: API `transfer-tax-api.ts:219`의 `parseFloat(x) > 0` 게이트와
//   엔진 `helpers.ts:166-169`의 `(landArea ?? 0) > 0` 게이트가 각각 0을 침묵 무시 → 둘 다 정정.
//   `calcHousingEstimatedAcq`를 직접 부르는 fixture가 PHD 분기 조건을 충족시키지 못해
//   (landArea 0/undefined가 동일 결과) 단위 anchor를 세우지 못했다. 전체 회귀(10,456건)로만 방어된다.
//   → 후속: 겸용 PHD 통합 fixture로 anchor 보강 필요.

describe("[E7-a] computeAcqDerivedAreas — residualArea 정본", () => {
  /** 용도변경 ON(house_to_commercial) 취득시 파생. T가 3자리 소수일 때 잔액 산식 차이가 드러난다. */
  function acqInput(totalLandArea: number, acqRes: number, acqComm: number): MixedUseAssetInput {
    return {
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea,
      partialUsageChange: {
        direction: "house_to_commercial",
        acqResidentialArea: acqRes,
        acqCommercialArea: acqComm,
      },
    } as MixedUseAssetInput;
  }
  const dummyTransfer: MixedUseDerivedAreas = {
    residentialRatio: 0.5,
    residentialLandArea: 0,
    commercialLandArea: 0,
    residentialFootprintArea: 0,
  };

  it("T 3자리 소수 → 상가 부수토지가 residualArea 정본과 일치", () => {
    // 실측으로 찾은 차이 케이스: T=1.005, 취득시 주택 8% → x=round2(1.005×0.08)=0.08
    //   현행 round2(T − x)          = round2(0.925)              = 0.93  ← ★버그
    //   정본 residualArea(T, x)     = round2(round2(1.005) − 0.08) = 0.92
    const T = 1.005;
    const r = computeAcqDerivedAreas(acqInput(T, 8, 92), dummyTransfer);
    const expectedResLand = round2(T * 0.08); // 0.08
    expect(r.residentialLandArea).toBe(expectedResLand);
    expect(r.commercialLandArea).toBe(residualArea(T, expectedResLand)); // 0.92
    expect(r.commercialLandArea).toBe(0.92);
  });

  it("용도변경 없으면 양도시 파생을 그대로 반환 (override 양시점 관철)", () => {
    const input = { ...acqInput(200, 0, 0) } as MixedUseAssetInput;
    delete (input as { partialUsageChange?: unknown }).partialUsageChange;
    const transfer: MixedUseDerivedAreas = {
      residentialRatio: 0.5,
      residentialLandArea: 90.29,
      commercialLandArea: 109.71,
      residentialFootprintArea: 50,
    };
    expect(computeAcqDerivedAreas(input, transfer)).toBe(transfer);
  });
});
