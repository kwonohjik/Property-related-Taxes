// @vitest-environment jsdom
/**
 * anchor — E5-03(공동소유 지분 범위) · U2-02(휴양시설 직접입력 게이트)
 *
 * 둘 다 「같은 값을 두 소비자가 다르게 해석한다」는 한 뿌리다.
 *
 * · **E5-03** — `nblOwnershipRatio`에 ⑧·⑫ 어디에도 범위 검증이 없어, 힌트(`0.5 (50%)`)와 달리
 *   `50`을 넣으면 UI 자동조회는 `공시지가 × 면적 × 50`을 **verbatim** 곱하고
 *   엔진(`parseOwnershipRatio`)은 **조용히 1로 정규화**한다. 전자만으로 §168의11②
 *   수입금액비율이 50분의 1이 되어 사업용이던 토지가 비사업용으로 뒤집힌다(+10%p 중과).
 *
 * · **U2-02** — 휴양시설(6호) 「기준면적 직접입력」 노출 조건이 `nblOtherResortBuildingFloorArea`를
 *   빠뜨려, 바닥면적만 입력해도 칸이 계속 보이고 그 입력값은 엔진이 무시했다.
 *   ⑧ validate는 처음부터 바닥면적을 포함한 4요소로 판정하고 있었다(UI↔validate 반대).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

import "@/lib/api/transfer-tax-schema";
import { validateNblDetailedJudgment } from "@/lib/calc/transfer-tax-validate-nbl";
import { parseOwnershipRatio } from "@/lib/tax-engine/non-business-land/form-mapper";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const TRANSFER = "2024-05-01";

function landAsset(overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    ...createDefaultTransferFormData().assets[0],
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2014-01-01",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "1,000,000,000",
    acquisitionArea: "1000",
    isNonBusinessLand: true,
    nblUseDetailedJudgment: true,
    nblLandType: "farmland",
    nblZoneType: "agriculture_forest",
    ...overrides,
  } as AssetForm;
}

describe("[E5-03] 공동소유 지분 — 0 < ratio ≤ 1 강제", () => {
  const parseNum = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
  };

  it.each(["50", "100", "1.5", "0", "-0.5"])("범위 밖 「%s」은 계산 전에 차단된다", (v) => {
    const err = validateNblDetailedJudgment(landAsset({ nblOwnershipRatio: v }), "자산1", TRANSFER);
    expect(err).toContain("공동소유 지분");
  });

  it.each(["0.5", "1", "0.001", "0.9999"])("정상값 「%s」은 통과한다", (v) => {
    const err = validateNblDetailedJudgment(landAsset({ nblOwnershipRatio: v }), "자산1", TRANSFER);
    expect(err).toBeNull();
  });

  it("미입력은 차단하지 않는다 (단독소유 = 기본 1)", () => {
    expect(validateNblDetailedJudgment(landAsset({ nblOwnershipRatio: "" }), "자산1", TRANSFER)).toBeNull();
  });

  /**
   * 차단이 필요한 이유의 실측 — 엔진과 UI가 같은 `"50"`을 다르게 읽는다.
   * 엔진은 1로 접고(면적 축소 없음), UI 자동조회는 그대로 곱해 토지가액을 50배로 만든다.
   */
  it("차단이 없으면 엔진은 1로 접고 UI는 50을 그대로 곱한다 (해석 분기 실측)", () => {
    expect(parseOwnershipRatio({ nblOwnershipRatio: "50" }, parseNum)).toBe(1);
    // NblLandAutoFetch의 산식과 동일 — parseFloat(raw || "1") || 1
    const raw: string = "50";
    const uiRatio = parseFloat(raw || "1") || 1;
    expect(uiRatio).toBe(50);
    // 공시지가 1,000,000원/㎡ × 1,000㎡
    expect(Math.floor(1_000_000 * 1000 * uiRatio)).toBe(50_000_000_000);
    expect(Math.floor(1_000_000 * 1000 * parseOwnershipRatio({ nblOwnershipRatio: "50" }, parseNum)))
      .toBe(1_000_000_000);
  });
});

describe("[U2-02] 휴양시설 — 직접입력 게이트가 바닥면적을 포함한다", () => {
  function resortAsset(over: Partial<AssetForm> = {}): AssetForm {
    return {
      ...makeDefaultAsset(1),
      nblLandType: "other_land",
      nblOtherRelatedBusinessType: "resort",
      ...over,
    } as AssetForm;
  }

  const DIRECT_LABEL = /기준면적 직접입력 \(㎡\)/;

  it("3요소·바닥면적 모두 미입력이면 직접입력 칸이 보인다", () => {
    render(<OtherLandDetailSection asset={resortAsset()} onAssetChange={() => {}} />);
    expect(screen.queryByText(DIRECT_LABEL)).not.toBeNull();
  });

  it("건축물 바닥면적만 입력해도 직접입력 칸이 사라진다 (종전에는 남아 있었다)", () => {
    render(
      <OtherLandDetailSection
        asset={resortAsset({ nblOtherResortBuildingFloorArea: "500" })}
        onAssetChange={() => {}}
      />,
    );
    expect(screen.queryByText(DIRECT_LABEL)).toBeNull();
  });

  it.each([
    ["nblOtherResortOutdoorArea"],
    ["nblOtherResortParkingStdArea"],
    ["nblOtherResortBuildingArea"],
    ["nblOtherResortBuildingFloorArea"],
  ] as const)("%s 하나만 입력해도 직접입력 칸이 사라진다 (⑧ validate 4요소와 동일)", (field) => {
    render(
      <OtherLandDetailSection
        asset={resortAsset({ [field]: "500" } as Partial<AssetForm>)}
        onAssetChange={() => {}}
      />,
    );
    expect(screen.queryByText(DIRECT_LABEL)).toBeNull();
  });
});
