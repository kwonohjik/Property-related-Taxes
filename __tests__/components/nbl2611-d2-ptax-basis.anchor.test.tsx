// @vitest-environment jsdom
/**
 * NBL2611-V1-A (R19 · Q-1) — 재산세 분류 «근거» 입력 위젯(⑤) · 결과 카드 echo(⑦).
 *   · 선택지·표시 조건은 엔진 술어(`propertyTaxBasisOptions`)와 같다 — 비과세/분리과세/별도합산(건축물 없음) 별로 다르고, 종합합산·별도합산(건축물 있음)엔 묻지 않는다.
 *   · 근거 미선택·「모름」이면 «확인 필요» 안내, 철거·멸실을 고르면 종전 바닥면적 칸이 열린다.
 *   · 결과 카드는 enum 원문 없이 선언·근거·판정에 쓴 분류를 한국어로 밝힌다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { DEFAULT_NON_BUSINESS_LAND_RULES, type NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);
const d = (s: string) => new Date(`${s}T00:00:00Z`);

const asset = (over: Partial<AssetForm>): AssetForm => ({ ...makeDefaultAsset(1), nblLandType: "other_land", ...over }) as AssetForm;

describe("⑤ 근거 입력 위젯", () => {
  it("종합합산 선언: 근거를 묻지 않는다", () => {
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "comprehensive" })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-other-tax-basis")).toBeNull();
  });

  it("선언 미선택: 근거를 묻지 않는다(⑧이 분류를 먼저 요구)", () => {
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "" })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-other-tax-basis")).toBeNull();
  });

  it("별도합산 + 건축물 있음: 근거를 묻지 않는다(건축물 부속토지 규칙)", () => {
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: true })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-other-tax-basis")).toBeNull();
  });

  it("별도합산 + 건축물 없음: 공지상태·철거멸실·모름 3지선다 + 미선택 확인 필요 안내", () => {
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "separate", nblOtherHasBuilding: false })} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-other-tax-basis-vacant_state")).toBeTruthy();
    expect(screen.getByTestId("nbl-other-tax-basis-demolished")).toBeTruthy();
    expect(screen.getByTestId("nbl-other-tax-basis-unknown")).toBeTruthy();
    expect(screen.queryByTestId("nbl-other-tax-basis-statutory_exempt")).toBeNull();
    expect(screen.getByTestId("nbl-other-tax-basis-unconfirmed").textContent).toContain("종합합산");
  });

  it("비과세 선언: 가목(§109·관계 법률) + 모름 / 분리과세 선언: 영 §102 + 모름", () => {
    const { unmount } = render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "exempt" })} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-other-tax-basis-statutory_exempt")).toBeTruthy();
    expect(screen.queryByTestId("nbl-other-tax-basis-vacant_state")).toBeNull();
    unmount();
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "special_sum" })} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-other-tax-basis-separate_taxation")).toBeTruthy();
  });

  it("선택 시 onAssetChange(nblOtherPropertyTaxBasis)", () => {
    const onChange = vi.fn();
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "separate" })} onAssetChange={onChange} />);
    fireEvent.click(screen.getByTestId("nbl-other-tax-basis-vacant_state"));
    expect(onChange).toHaveBeenCalledWith({ nblOtherPropertyTaxBasis: "vacant_state" });
  });

  it("공지상태 선택: 확인 필요 안내가 사라진다 · 철거멸실 선택: 종전 바닥면적 칸이 열린다", () => {
    const { unmount } = render(
      <OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "vacant_state" })} onAssetChange={() => {}} />,
    );
    expect(screen.queryByTestId("nbl-other-tax-basis-unconfirmed")).toBeNull();
    expect(document.querySelector('[data-field="nblOtherDemolishedFloorArea"]')).toBeNull();
    unmount();
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "separate", nblOtherPropertyTaxBasis: "demolished" })} onAssetChange={() => {}} />);
    expect(document.querySelector('[data-field="nblOtherDemolishedFloorArea"]')).not.toBeNull();
  });

  it("stale 값(선언을 비과세로 바꿨는데 남은 vacant_state): 미선택으로 보이고 확인 필요 안내가 뜬다 — store 값은 그대로", () => {
    render(<OtherLandDetailSection asset={asset({ nblOtherPropertyTaxType: "exempt", nblOtherPropertyTaxBasis: "vacant_state" })} onAssetChange={() => {}} />);
    expect(screen.getByTestId("nbl-other-tax-basis-unconfirmed")).toBeTruthy();
  });
});

describe("⑦ 결과 카드 echo", () => {
  const other = (ol: Record<string, unknown>): NonBusinessLandInput => ({
    landType: "other_land", landArea: 500, zoneType: "general_residential",
    acquisitionDate: d("2008-01-01"), transferDate: d("2024-06-01"),
    otherLand: { propertyTaxType: "separate", hasBuilding: false, isRelatedToResidenceOrBusiness: false, ...ol } as never,
    businessUsePeriods: [], gracePeriods: [],
  });

  it("근거 확인 → 선언·근거·조문·판정에 쓴 분류를 한국어로(enum 원문 없음)", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxBasis: "vacant_state" }), DEFAULT_NON_BUSINESS_LAND_RULES);
    const { getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    const t = getByTestId("nbl-property-tax-basis-echo").textContent ?? "";
    expect(t).toContain("별도합산");
    expect(t).toContain("공지상태");
    expect(t).toContain("지방세법 시행령 §101 ③");
    expect(t).not.toMatch(/\b(vacant_state|separate|special_sum|comprehensive|exempt)\b/);
  });

  it("근거 미확인 → 종합합산으로 판정했다는 확인 필요", () => {
    const j = judgeNonBusinessLand(other({}), DEFAULT_NON_BUSINESS_LAND_RULES);
    const { getByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(getByTestId("nbl-property-tax-basis-echo").textContent).toContain("선택하지 않음");
    expect(getByTestId("nbl-property-tax-basis-unconfirmed-echo").textContent).toContain("확인 필요");
  });

  it("건축물 부속토지 경로·종합합산 선언: 근거 블록이 없다(이력 복원 결과도 같다)", () => {
    const j = judgeNonBusinessLand(other({ propertyTaxType: "comprehensive" }), DEFAULT_NON_BUSINESS_LAND_RULES);
    const { queryByTestId } = render(<NonBusinessLandResultCard judgment={j} />);
    expect(queryByTestId("nbl-property-tax-basis-echo")).toBeNull();
  });
});
