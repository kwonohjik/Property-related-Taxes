/**
 * @vitest-environment jsdom
 *
 * ⑤ 「당초 증여자 취득 당시 토지·건물 기준시가」 안내 — 자산 종류별 (2026-11-04, 사용자 결정 A안)
 *
 * 주택·상가는 기준시가가 토지를 포함한 한 값이다(「소득세법」 제99조 제1항 제1호 라목·다목) — 「합계를 한 칸에, 다른 칸 0」으로 안내한다.
 * 종전에는 「건물이 없으면 0」이라 안내했다(주택·상가·건물 자산에는 늘 건물이 있다). 토지 자산·일반건물·토글 C 안내는 그대로다.
 * 건물(토지 제외) 자산도 엔진은 두 칸 합계만 쓴다(2026-11-04 실측 52,632,400 세 조합 동일) — 안내만 바꾼다.
 * 계산 쪽(두 칸 합계·토글 C 0 거부)은 `__tests__/api/transfer.route.bg-carryover-codonor-building-std-zero.anchor.test.ts`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { BurdenedGiftCarryoverBlock } from "@/components/calc/transfer/BurdenedGiftCarryoverBlock";
import { bgAsset } from "../calc/_helpers/carryover-donor-built-bg-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const textOf = (over: Partial<AssetForm>) => {
  const a = bgAsset("converted", { donorBuilt: false }, { acquisitionCause: "carryover_gift", ...over } as Partial<AssetForm>);
  const { container } = render(<BurdenedGiftCarryoverBlock asset={a} onChange={() => {}} coDonorNeedsStdPrice />);
  return container.textContent ?? "";
};
const OLD_BUILDING = "건물이 없으면 0을 입력하세요";

describe("⑤ 당초 증여자 기준시가 안내", () => {
  it("주택 — 개별주택가격·공동주택가격 한 값을 토지 칸에, 건물 칸 0 (라목)", () => {
    const t = textOf({ assetKind: "housing" });
    expect(t).toContain("주택의 기준시가는 토지를 포함한 한 값");
    expect(t).toContain("토지 칸에 개별주택가격·공동주택가격을 넣었으면 0");
    expect(t).not.toContain(OLD_BUILDING);
  });

  it("상가 — 일괄 고시 기준시가면 토지 칸에, 그 밖에는 토지·건물 각각 (다목·나목)", () => {
    const t = textOf({ assetKind: "commercial_building" });
    expect(t).toContain("토지와 건물을 일괄 고시하는 상업용 건물·오피스텔");
    expect(t).toContain("토지 칸에 일괄 고시 기준시가를 넣었으면 0");
    expect(t).not.toContain(OLD_BUILDING);
  });

  it("건물(토지 제외) — 건물 칸은 국세청 건물 기준시가(나목), 토지 칸은 0 (종전 「건물이 없으면 0」은 틀린 안내)", () => {
    const t = textOf({ assetKind: "building" });
    expect(t).toContain("국세청 건물 기준시가(「소득세법」 제99조 제1항 제1호 나목)");
    expect(t).toContain("토지 칸은 0입니다");
    expect(t).not.toContain(OLD_BUILDING);
  });

  const REDEV = { assetKind: "redevelopment_apt", redevSubject: "apt", redevIsSuccessorMember: "no", bgValuationMode: "sangjeungbeop_standard", bgAcquisitionMethod: "" } as Partial<AssetForm>;
  it("재개발 완공 아파트 원조합원 · 종전 주택 — 종전 부동산 취득 당시 기준시가(§166⑦1호) 한 값을 토지 칸에", () => {
    const t = textOf({ ...REDEV, redevOriginalAssetType: "housing" } as Partial<AssetForm>);
    expect(t).toContain("종전 부동산(기존건물과 그 부수토지)을 취득할 당시의 기준시가");
    expect(t).toContain("토지 칸에 종전 주택의 개별주택가격·공동주택가격을 넣었으면 0");
    expect(t).not.toContain(OLD_BUILDING);
  });

  it("재개발 완공 아파트 원조합원 · 종전 토지 — 토지 기준시가, 건물 칸 0", () => {
    const t = textOf({ ...REDEV, redevOriginalAssetType: "land" } as Partial<AssetForm>);
    expect(t).toContain("종전 토지를 취득할 당시의 토지 기준시가");
    expect(t).toContain("종전 부동산이 토지뿐이면 0");
  });

  it("재개발 — 승계조합원·환산(K-5)은 바꾸지 않는다(취득가액 기준이 다르거나 이 칸을 쓰지 않는다)", () => {
    for (const over of [{ redevIsSuccessorMember: "yes" }, { bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "converted" }]) {
      const t = textOf({ ...REDEV, redevOriginalAssetType: "housing", ...over } as Partial<AssetForm>);
      expect(t).not.toContain("종전 부동산(기존건물과 그 부수토지)을 취득할 당시");
      cleanup();
    }
  });

  it("토지 — 종전 안내 그대로(건물이 없다)", () => {
    const t = textOf({ assetKind: "land" });
    expect(t).toContain(OLD_BUILDING);
    expect(t).not.toContain("두 칸 합계로 계산합니다");
  });

  it("일반건물 — 종전 「0일 수 없습니다」 그대로", () => {
    const t = textOf({ assetKind: "general_building" });
    expect(t).toContain("0일 수 없습니다");
    expect(t).not.toContain("두 칸 합계로 계산합니다");
  });

  it("주택 토글 C — 토지·건물을 따로 계산하므로 「0일 수 없습니다」(합계 안내 없음)", () => {
    const t = textOf({
      assetKind: "housing",
      carryoverDonorSplit: true,
      buildingCarryover: { donorAcquisitionDate: "2015-01-01" },
    } as Partial<AssetForm>);
    expect(t).toContain("0일 수 없습니다");
    expect(t).not.toContain("두 칸 합계로 계산합니다");
  });
});
