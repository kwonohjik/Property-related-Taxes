// @vitest-environment jsdom
/**
 * NBL2611-B2 (R07) 입력 화면 anchor.
 *   V3-O     무조건 의제 화면 — 규칙 §83의5④ 3~7호 «지원하지 않음 — 해당하면 확인 필요» 고지
 *   V1-OL06  재산세 분류 칸 — 출처(고지서·위택스) hint + 혼재 고지서 선택 안내 + 확인 필요 (Q-2 (가): 판정 로직 불변)
 *   V8-VL01  별장 기준시가 한도 hint — 양도일 연혁(2015.2.3. 전 1억 · 이후 2억)에서 파생
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { NblSectionContainer } from "@/components/calc/transfer/nbl/NblSectionContainer";
import { VillaLandDetailSection } from "@/components/calc/transfer/nbl/VillaLandDetailSection";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  NBL_PROPERTY_TAX_TYPE_MIXED_NOTICE,
  NBL_PROPERTY_TAX_TYPE_SOURCE_HINT,
  NBL_UNCONDITIONAL_RULE_4_UNSUPPORTED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL } from "@/lib/tax-engine/legal-codes";
import { villaRuralValueLimitHint } from "@/lib/tax-engine/data/nbl-historical-values-era";

afterEach(cleanup);

const base = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "land", nblUseDetailedJudgment: true, nblZoneType: "general_residential", ...over }) as AssetForm;

describe("V3-O — 무조건 의제 화면 «지원하지 않음» 고지", () => {
  it.each(["farmland", "forest", "other_land"] as const)("%s: 규칙 §83의5④ 3~7호 고지가 보인다", (landType) => {
    render(<NblSectionContainer asset={base({ nblLandType: landType })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    const n = screen.getByTestId("nbl-uncond-rule4-unsupported-notice").textContent ?? "";
    expect(n).toBe(NBL_UNCONDITIONAL_RULE_4_UNSUPPORTED_NOTICE);
    expect(n).toContain(NBL.UNCONDITIONAL_RULE_4_3_TO_7);
    expect(n).toContain("지원하지 않습니다");
    expect(n).toContain("확인 필요");
  });
});

describe("V1-OL06 — 재산세 분류 칸 안내", () => {
  it("출처 hint(재산세 과세내역·위택스)와 혼재 고지서 선택 안내가 보인다", () => {
    render(<OtherLandDetailSection asset={base({ nblLandType: "other_land" })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(document.body.textContent).toContain(NBL_PROPERTY_TAX_TYPE_SOURCE_HINT);
    const n = screen.getByTestId("nbl-other-tax-type-mixed-notice").textContent ?? "";
    expect(n).toBe(NBL_PROPERTY_TAX_TYPE_MIXED_NOTICE);
    expect(n).toContain("별도합산과 종합합산");
    expect(n).toContain(NBL.BUILDING_SITE_SEPARATE_AGG_PROVISO);
    expect(n).toContain("확인 필요");
  });

  it("선택값 표시는 엔진과 같은 한국어 라벨표를 쓴다", () => {
    render(<OtherLandDetailSection asset={base({ nblLandType: "other_land", nblOtherPropertyTaxType: "special_sum" })} onAssetChange={() => {}} transferDate="2024-06-03" />);
    expect(document.body.textContent).toContain("분리과세");
  });
});

describe("V8-VL01 — 별장 기준시가 한도 hint는 양도일에서 파생", () => {
  const withRural = (transferDate?: string) =>
    render(<VillaLandDetailSection asset={base({ nblLandType: "villa_land", nblVillaIsRuralHousing: true })} onAssetChange={() => {}} transferDate={transferDate} />);

  it("양도일 2015.2.3. 전 → 1억원 이하", () => {
    withRural("2015-02-02");
    expect(document.body.textContent).toContain("1억원 이하");
    expect(document.body.textContent).not.toContain("2억원 이하");
  });
  it("양도일 2015.2.3. 이후 → 2억원 이하", () => {
    withRural("2024-06-03");
    expect(document.body.textContent).toContain("2억원 이하");
    expect(document.body.textContent).not.toContain("1억원 이하");
  });
  it("양도일 미입력 → 추정하지 않고 현행 기준임과 연혁을 밝힌다", () => {
    withRural(undefined);
    expect(document.body.textContent).toContain(villaRuralValueLimitHint(undefined));
  });
});
