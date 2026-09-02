// @vitest-environment jsdom
/**
 * anchor — 별표6 3호바 종업원용 체육시설 입력의 **⑧ 차단 + ⑤ 위젯** (양도세 NBL · 재산세 동시)
 *
 * 표를 적용하려면 종업원수가 필수다(비고 2-가). 없으면 엔진이 표 기준면적을 산출할 수 없어
 * **인정면적이 통째로 0**이 된다 — 기준면적 과소 → 비사업용/종합합산 면적 과대(납세자 불리).
 * 자동 fallback 금지 원칙상 계산 전에 차단한다.
 *
 * 비고 2-나(50명 이하 **법인** 코트만)는 개인사업자에 적용하면 법 근거 없이 불리해지므로
 * 사업주체를 명시 선택하게 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(cleanup);

import "@/lib/api/transfer-tax-schema";
import { validateNblFactory } from "@/lib/calc/transfer-tax-validate-nbl-other";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { FactoryLandSection } from "@/components/calc/transfer/nbl/FactoryLandSection";

function factoryAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "land",
    nblUseDetailedJudgment: true,
    nblLandType: "other_land",
    nblZoneType: "general_residential",
    nblFactoryEnabled: true,
    nblFactoryLocationCategory: "eup_myeon_or_complex",
    nblFactoryTotalLandArea: "30000",
    nblFactorySegments: [{ id: "s1", floorArea: "2000", ratePercent: "20", industryLabel: "" }],
    ...over,
  } as AssetForm;
}

describe("[별표6 3호바] ⑧ — 종업원수 없이 체육시설 면적만 넣으면 차단한다", () => {
  it.each([
    ["nblFactorySportsPlaygroundArea"],
    ["nblFactorySportsCourtArea"],
    ["nblFactorySportsIndoorFloorArea"],
  ] as const)("%s 만 입력 → 종업원수를 요구한다", (field) => {
    const err = validateNblFactory(
      factoryAsset({ [field]: "500" } as Partial<AssetForm>),
      "자산1",
    );
    expect(err).toContain("종업원수");
  });

  it("종업원수를 넣으면 통과한다 (51명 — 비고 2-나 대상 아님)", () => {
    const err = validateNblFactory(
      factoryAsset({ nblFactorySportsPlaygroundArea: "500", nblFactorySportsEmployeeCount: "51" }),
      "자산1",
    );
    expect(err).toBeNull();
  });

  it("50명 이하인데 사업주체 미선택이면 차단한다 (비고 2-나는 「법인」만)", () => {
    const err = validateNblFactory(
      factoryAsset({ nblFactorySportsPlaygroundArea: "500", nblFactorySportsEmployeeCount: "50" }),
      "자산1",
    );
    expect(err).toContain("사업주체");
  });

  it.each(["corporation", "individual"] as const)("50명 이하 + 사업주체 「%s」 선택 시 통과", (t) => {
    const err = validateNblFactory(
      factoryAsset({
        nblFactorySportsPlaygroundArea: "500",
        nblFactorySportsEmployeeCount: "50",
        nblFactorySportsEntityType: t,
      }),
      "자산1",
    );
    expect(err).toBeNull();
  });

  it("체육시설을 아예 입력하지 않으면 종업원수를 묻지 않는다 (과차단 방지)", () => {
    expect(validateNblFactory(factoryAsset(), "자산1")).toBeNull();
  });
});

describe("[별표6 3호바] ⑤ — 시설별 입력 칸과 조건부 사업주체", () => {
  it("종업원수·운동장·코트·실내 바닥면적 칸이 모두 렌더된다", () => {
    render(<FactoryLandSection asset={factoryAsset()} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-factory-sports-employee-count")).toBeTruthy();
    expect(screen.getByTestId("nbl-factory-sports-playground-area")).toBeTruthy();
    expect(screen.getByTestId("nbl-factory-sports-court-area")).toBeTruthy();
    expect(screen.getByTestId("nbl-factory-sports-indoor-floor-area")).toBeTruthy();
  });

  it("종업원 51명이면 사업주체 선택이 나타나지 않는다", () => {
    const { container } = render(
      <FactoryLandSection
        asset={factoryAsset({ nblFactorySportsEmployeeCount: "51" })}
        onAssetChange={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("사업주체");
  });

  it("종업원 50명이면 사업주체(법인/개인) 선택이 나타난다 (비고 2-나 게이트)", () => {
    const { container } = render(
      <FactoryLandSection
        asset={factoryAsset({ nblFactorySportsEmployeeCount: "50" })}
        onAssetChange={() => {}}
      />,
    );
    expect(container.textContent).toContain("사업주체");
    expect(container.textContent).toContain("코트면적만 인정");
  });

  it("비고 1(적용요건)이 안내된다 — 엔진이 검증하지 않는 사실 판단이다", () => {
    const { container } = render(
      <FactoryLandSection asset={factoryAsset()} onAssetChange={() => {}} />,
    );
    expect(container.textContent).toContain("운동경기가 가능한 시설");
    expect(container.textContent).toContain("탁구대");
  });

  it("실내 칸은 「용지 면적」이 아니라 「건축물 바닥면적」임을 밝힌다", () => {
    const { container } = render(
      <FactoryLandSection asset={factoryAsset()} onAssetChange={() => {}} />,
    );
    expect(container.textContent).toContain("실내체육시설 건축물 바닥면적");
  });
});
