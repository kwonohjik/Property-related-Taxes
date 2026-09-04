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
 *   → 2026-09-04에 **차단이 아니라 원인을 없앴다**. 뿌리는 「같은 지분을 한 화면에서 두 번,
 *   서로 다른 단위로 받는 것」이었다(자산-수준 「공유 지분율」 % · NBL 「공동소유 지분」 비율).
 *   NBL 입력칸을 폐지하고 자산-수준에서 파생하도록 바꿨으므로 범위 밖 값의 **입력 경로가
 *   없다**. 아래 E5-03R이 그 단일 소스 규약을 지킨다 — 종전 범위 게이트는 도달 불가라 폐지.
 *
 * · **U2-02** — 휴양시설(6호) 「기준면적 직접입력」 노출 조건이 `nblOtherResortBuildingFloorArea`를
 *   빠뜨려, 바닥면적만 입력해도 칸이 계속 보이고 그 입력값은 엔진이 무시했다.
 *   ⑧ validate는 처음부터 바닥면적을 포함한 4요소로 판정하고 있었다(UI↔validate 반대).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

import "@/lib/api/transfer-tax-schema";
import { parseOwnershipRatio } from "@/lib/tax-engine/non-business-land/form-mapper";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
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

describe("[E5-03R] 공유 지분 — 자산-수준 「공유 지분율」(%) 단일 소스", () => {
  const parseNum = (s: string) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : undefined;
  };

  /** ④ 변환이 자산-수준 지분율에서 NBL 페이로드의 [0..1] 비율을 파생한다. */
  it.each([
    ["100", "100", "1"],
    ["50", "100", "0.5"],
    ["1", "2", "0.5"],
    ["", "", "1"],
    // 상한·하한이 산식 자체로 접힌다 — 범위 게이트 없이도 배율이 될 수 없다.
    ["150", "100", "1"],
    ["0", "100", "1"],
    ["-50", "100", "1"],
  ])("지분율 %s/%s → nblOwnershipRatio 「%s」", (n, d, expected) => {
    const raw = buildNonBusinessLandRaw(
      landAsset({ ownershipNumerator: n, ownershipDenominator: d }),
      TRANSFER,
    );
    expect(raw?.nblOwnershipRatio).toBe(expected);
  });

  /**
   * 🔴 스프레드 순서 가드 — `buildNonBusinessLandRaw`는 `nbl*` prefix-pick으로 자산을 훑는다.
   * 레거시 sessionStorage에 남은 구 `nblOwnershipRatio`가 그 pick에 걸리므로, 파생값이
   * **뒤에** 놓여 반드시 이겨야 한다. 순서가 뒤집히면 stale 비율이 조용히 되살아난다.
   */
  it("레거시 자산에 남은 구 nblOwnershipRatio는 파생값에 덮인다", () => {
    const legacy = {
      ...landAsset({ ownershipNumerator: "50", ownershipDenominator: "100" }),
      nblOwnershipRatio: "0.25",
    } as AssetForm;
    expect(buildNonBusinessLandRaw(legacy, TRANSFER)?.nblOwnershipRatio).toBe("0.5");
  });

  /** 파생 산식은 금액 스케일링이 쓰는 `getOwnershipRatio`와 **동치**여야 한다. */
  it.each([
    ["100", "100"],
    ["50", "100"],
    ["1", "3"],
    ["", ""],
    ["150", "100"],
    ["0", "100"],
    ["abc", "100"],
  ])("파생 산식 ≡ getOwnershipRatio (%s/%s)", (n, d) => {
    const asset = landAsset({ ownershipNumerator: n, ownershipDenominator: d });
    expect(buildNonBusinessLandRaw(asset, TRANSFER)?.nblOwnershipRatio).toBe(
      String(getOwnershipRatio(asset)),
    );
  });

  /**
   * 종전 실패 경로의 소멸 — 백분율 감각으로 `50`을 넣어도 이제 배율 50이 아니라 50%(=0.5)다.
   * 엔진과 UI 자동조회가 **같은 값**을 읽는다(종전에는 1 vs 50으로 갈렸다).
   */
  it("「50」은 배율 50이 아니라 50%로 읽힌다 — 엔진·자동조회 해석 일치", () => {
    const asset = landAsset({ ownershipNumerator: "50", ownershipDenominator: "100" });
    const raw = buildNonBusinessLandRaw(asset, TRANSFER)!;
    const engineRatio = parseOwnershipRatio(raw, parseNum);
    const uiRatio = getOwnershipRatio(asset); // NblLandAutoFetch가 쓰는 값과 동일 소스
    expect(engineRatio).toBe(0.5);
    expect(uiRatio).toBe(0.5);
    // 공시지가 1,000,000원/㎡ × 1,000㎡ → 종전엔 50,000,000,000원(50배)이 채워졌다.
    expect(Math.floor(1_000_000 * 1000 * uiRatio)).toBe(500_000_000);
  });

  /** ⑤ 입력칸 재유입 차단 — NBL 섹션에 지분 입력칸이 다시 생기면 단위가 또 갈린다. */
  it("NBL 정밀판정 섹션에 「공동소유 지분」 입력칸이 없다", () => {
    render(
      <NblSectionContainer
        asset={landAsset({ nblUseDetailedJudgment: true })}
        onAssetChange={() => {}}
        transferDate={TRANSFER}
      />,
    );
    expect(screen.queryByText(/공동소유 지분/)).toBeNull();
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
