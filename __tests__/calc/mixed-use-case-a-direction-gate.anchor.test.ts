/**
 * anchor: 겸용주택 Case A 4부분 안분 — 방향 게이트를 ⑤·④가 함께 본다
 * (2026-09-05 · 코드리뷰 Q04)
 *
 * ## 종전 결함
 *
 * 정본 헬퍼 `isMixedUseCaseA`·Legacy 판정·⑧ validate 셋은 `partialChangeDirection ===
 * "house_to_commercial"`을 요구하는데, **PHD 패널만 판정을 복제해 두고 방향을 보지 않았다**.
 * 그래서 「상가 → 주택」을 고른 사용자에게도 4부분 분리 입력이 뜨고, 안내문은
 * 「취득시 전체가 주택이었다」로 사실과 정반대를 설명했다.
 *
 * 더 나쁜 것은 ④였다 — 4부분 활성 조건이 **「그 칸이 채워졌는가」뿐**이라, 사용자가 값을
 * 남겨 두기만 하면 세액 산식이 갈렸다(⑧은 그 방향에서 그 값을 요구하지도 않는다).
 * ⑤만 고치면 칸은 사라지고 **값은 남으므로** ④에도 같은 게이트가 필요하다
 * (Q20과 같은 규약 — 「범위 밖이면 보내지 않는다」).
 *
 * ## ⚠️ 방향 제한의 근거는 조문이 아니다
 *
 * 영 §166⑥은 위임 끝(「부가가치세법 시행령」 §64①)까지 따라가도 **방향에 관한 조건이 없고**,
 * 애초에 **토지 ↔ 건물 2분할** 규정이다. 「주택분/상가분 × 토지/건물」 4분할은 §89①3호·§154③이
 * 만드는 별개 축이다. 방향을 가르는 것은 **엔진의 Case A 모델**(취득시 전체 주택 → 양도시 일부
 * 상가)이다 — 그래서 이 anchor는 「조문이 방향을 요구한다」가 아니라 「모델과 게이트가 일치한다」를
 * 고정한다(A축 Q04 조문 확인 결과).
 */
import { describe, it, expect } from "vitest";
import { isMixedUseCaseA } from "../../lib/calc/mixed-use-case";
import { buildMixedUsePayload } from "../../lib/calc/transfer-tax-api-mixed-use";
import { createDefaultTransferFormData } from "../../lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "../../lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "../../lib/stores/calc-wizard-asset";
import type { TransferFormData } from "../../lib/stores/calc-wizard-store";

/** 최초공시(2006) < 용도변경(2015) — Case A 시간 조건은 충족한 상태 */
function mixedAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionDate: "2003-05-01",
    residentialFloorArea: "120",
    nonResidentialFloorArea: "80",
    mixedUseTotalLandArea: "300",
    usePreHousingDisclosure: true,
    hasPartialUsageChange: true,
    partialChangeDirection: "house_to_commercial",
    partialChangeDate: "2015-06-01",
    phdFirstDisclosureDate: "2006-04-28",
    phdFirstDisclosureHousingPrice: "300,000,000",
    phdLandPricePerSqmAtAcq: "1,000,000",
    phdBuildingStdPriceAtAcq: "100,000,000",
    phdLandPricePerSqmAtFirst: "1,200,000",
    phdBuildingStdPriceAtFirst: "120,000,000",
    phdLandPricePerSqmAtTransfer: "2,000,000",
    phdBuildingStdPriceAtTransfer: "150,000,000",
    mixedTransferHousingPrice: "800,000,000",
    // Case A 4부분 전용 2필드 — 채워 둔 상태로 방향만 뒤집어 본다.
    phdCommercialBuildingStdPriceAtAcq: "40,000,000",
    phdCommercialBuildingStdPriceAtFirst: "48,000,000",
    ...over,
  } as AssetForm;
}

function form(asset: AssetForm): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-01-27",
    contractTotalPrice: "2,000,000,000",
    assets: [asset],
  } as unknown as TransferFormData;
}

type Phd = { commercialBuildingStdPriceAtAcq?: number; totalTransferPriceForFourPart?: number };

function phdOf(asset: AssetForm): Phd | undefined {
  const p = buildMixedUsePayload(asset, form(asset)) as
    | { preHousingDisclosure?: Phd }
    | undefined;
  return p?.preHousingDisclosure;
}

describe("isMixedUseCaseA — 방향 게이트", () => {
  it("house_to_commercial + 최초공시 < 용도변경 → Case A", () => {
    expect(isMixedUseCaseA(mixedAsset())).toBe(true);
  });

  it("🔴 commercial_to_house → Case A 아님 (PHD 패널만 이 조건을 빠뜨렸다)", () => {
    expect(
      isMixedUseCaseA(mixedAsset({ partialChangeDirection: "commercial_to_house" })),
    ).toBe(false);
  });

  it("용도변경 자체가 없으면 Case A 아님", () => {
    expect(isMixedUseCaseA(mixedAsset({ hasPartialUsageChange: false }))).toBe(false);
  });

  it("최초공시일이 용도변경일 **이후**면 Case A 아님 (시간 조건)", () => {
    expect(isMixedUseCaseA(mixedAsset({ phdFirstDisclosureDate: "2018-04-30" }))).toBe(false);
  });
});

describe("④ — 방향이 아니면 4부분 필드를 보내지 않는다", () => {
  it("house_to_commercial → 4부분 필드가 실린다 (대조군 — 게이트가 과잉 차단이 아님)", () => {
    const phd = phdOf(mixedAsset());
    expect(phd?.commercialBuildingStdPriceAtAcq).toBe(40_000_000);
    expect(phd?.totalTransferPriceForFourPart).toBe(2_000_000_000);
  });

  it("🔴 commercial_to_house → 값이 남아 있어도 보내지 않는다 (종전에는 세액 산식이 갈렸다)", () => {
    const phd = phdOf(mixedAsset({ partialChangeDirection: "commercial_to_house" }));
    expect(phd?.commercialBuildingStdPriceAtAcq).toBeUndefined();
    expect(phd?.totalTransferPriceForFourPart).toBeUndefined();
  });

  it("🔴 용도변경 토글 OFF인데 값만 남은 경우도 보내지 않는다", () => {
    const phd = phdOf(mixedAsset({ hasPartialUsageChange: false }));
    expect(phd?.commercialBuildingStdPriceAtAcq).toBeUndefined();
  });
});
