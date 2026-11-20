// @vitest-environment jsdom
/**
 * NBL2611-B4 (R09 · V7-F) Pre-Do anchor — 체육시설 입력칸 렌더 게이트 = 엔진 소비 술어.
 *
 * 엔진(`resolveAreaLimit`)은 주종목 + 추가 종목 전체를 보고 실내 바닥면적·실내 미설치·선수 수를 소비한다.
 * 종전 화면은 «주종목»만 보고 칸을 그렸다 → 추가 종목으로 실내·테니스를 고르면 엔진이 읽는 칸이 화면에 없었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OtherLandDetailSection } from "@/components/calc/transfer/nbl/OtherLandDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function sports(over: Partial<AssetForm>): AssetForm {
  return {
    ...makeDefaultAsset(1),
    nblLandType: "other_land",
    nblOtherRelatedBusinessType: "sports",
    ...over,
  } as AssetForm;
}
const FLOOR = /실내 시설 바닥면적/;
const NOT_INSTALLED = "nbl-other-indoor-not-installed";
const PLAYER = /선수 수/;

describe("V7-F — 체육시설 입력칸 렌더 게이트", () => {
  it("F-1: 🔴 주종목 축구 + 추가 종목 실내(구기) → 실내 바닥면적 칸이 보인다", () => {
    render(<OtherLandDetailSection asset={sports({ nblOtherSportsFacilityType: "soccer", nblOtherSportsExtraEvents: ["ball_court"] })} onAssetChange={() => {}} />);
    expect(screen.queryByText(FLOOR)).not.toBeNull();
  });

  it("F-2: 🔴 직장(별표3) 주종목 축구 + 추가 종목 실내 → 실내체육시설 미설치 토글이 보인다", () => {
    render(<OtherLandDetailSection asset={sports({ nblOtherSportsFacilityType: "soccer", nblOtherSportsExtraEvents: ["swimming"] })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId(NOT_INSTALLED)).not.toBeNull();
  });

  it("F-3: 운동경기업(별표4)은 실내 미설치 토글이 없다(별표3 비고4 전용)", () => {
    render(<OtherLandDetailSection asset={sports({ nblOtherSportsCategory: "business", nblOtherSportsFacilityType: "soccer", nblOtherSportsExtraEvents: ["swimming"] })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId(NOT_INSTALLED)).toBeNull();
    expect(screen.queryByText(FLOOR)).not.toBeNull();
  });

  it("F-4: 🔴 주종목 구기(실내) + 추가 종목 테니스 → 선수 수 칸이 보인다", () => {
    render(<OtherLandDetailSection asset={sports({ nblOtherSportsFacilityType: "ball_court", nblOtherSportsExtraEvents: ["tennis"] })} onAssetChange={() => {}} />);
    expect(screen.queryByText(PLAYER)).not.toBeNull();
  });

  it("F-5: 🔴 종업원(별표5) 50인 초과 + 실내체육시설 보유 → 실내 바닥면적 칸이 보인다 · 50인 이하(코트만)면 안 보인다", () => {
    const { unmount } = render(<OtherLandDetailSection asset={sports({ nblOtherSportsCategory: "employee", nblOtherEmployeeCount: "300", nblOtherEmployeeFacilityKinds: ["indoor"] })} onAssetChange={() => {}} />);
    expect(screen.queryByText(FLOOR)).not.toBeNull();
    unmount();
    render(<OtherLandDetailSection asset={sports({ nblOtherSportsCategory: "employee", nblOtherEmployeeCount: "40", nblOtherEmployeeFacilityKinds: ["indoor", "court"] })} onAssetChange={() => {}} />);
    expect(screen.queryByText(FLOOR)).toBeNull();
  });

  it("F-6: 대조 — 실외 종목만이면 실내·선수 칸이 없다", () => {
    render(<OtherLandDetailSection asset={sports({ nblOtherSportsFacilityType: "soccer", nblOtherSportsExtraEvents: ["baseball"] })} onAssetChange={() => {}} />);
    expect(screen.queryByText(FLOOR)).toBeNull();
    expect(screen.queryByTestId(NOT_INSTALLED)).toBeNull();
    expect(screen.queryByText(PLAYER)).toBeNull();
  });

  it("F-7: 회귀 — 주종목 구기(실내) 단독이면 종전처럼 실내 바닥면적·미설치 토글이 보인다", () => {
    render(<OtherLandDetailSection asset={sports({ nblOtherSportsFacilityType: "ball_court" })} onAssetChange={() => {}} />);
    expect(screen.queryByText(FLOOR)).not.toBeNull();
    expect(screen.queryByTestId(NOT_INSTALLED)).not.toBeNull();
  });
});

describe("V7-DM02·V9-DM11 — 호 불인정 사실을 판정 전에 알린다(엔진 술어 그대로)", () => {
  const ho = (over: Partial<AssetForm>): AssetForm =>
    ({ ...makeDefaultAsset(1), nblLandType: "other_land", ...over }) as AssetForm;

  it("H-1: 5호 + 도시지역 주·상·공 → 불인정 안내 · 그 밖의 지역이면 없다", () => {
    const { unmount } = render(<OtherLandDetailSection asset={ho({ nblOtherRelatedBusinessType: "reserve_forces", nblZoneType: "commercial" })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-other-ho-fail-notice")?.textContent).toContain("나목");
    unmount();
    render(<OtherLandDetailSection asset={ho({ nblOtherRelatedBusinessType: "reserve_forces", nblZoneType: "management" })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-other-ho-fail-notice")).toBeNull();
  });

  it("H-2: 13호 + 건축물 있음 → 불인정 안내 · 건축물 없음이면 없다", () => {
    const { unmount } = render(<OtherLandDetailSection asset={ho({ nblOtherRelatedBusinessType: "vacant_lot_1household", nblOtherHasBuilding: true })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-other-ho-fail-notice")?.textContent).toContain("나지");
    unmount();
    render(<OtherLandDetailSection asset={ho({ nblOtherRelatedBusinessType: "vacant_lot_1household", nblOtherHasBuilding: false })} onAssetChange={() => {}} />);
    expect(screen.queryByTestId("nbl-other-ho-fail-notice")).toBeNull();
  });

  it("H-3: Q-6 (다) — 라디오 설명에 입력으로 판정할 수 없는 요건이 적혀 있다", () => {
    render(<OtherLandDetailSection asset={ho({})} onAssetChange={() => {}} />);
    expect(screen.getByText(/수임 군부대 소유\(라목\)/)).toBeTruthy();
    expect(screen.getByText(/무주택 1세대·1필지·주택 신축 가능 여부는 직접 확인/)).toBeTruthy();
  });
});
