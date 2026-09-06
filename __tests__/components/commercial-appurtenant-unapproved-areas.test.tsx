/**
 * @vitest-environment jsdom
 *
 * anchor: 상가 부수토지 — 「허가·사용승인 미이행」(지방세령 §101① 단서) ON에서도 면적칸이 남는다.
 *
 * 종전에는 토글을 켜는 순간 두 면적 FieldCard가 렌더에서 빠졌다. 토글이 칸보다 위에 있어
 * 사용자는 대개 먼저 켰고, 그러면 두 값이 빈 채로 남아 ④가 payload 전체를 `undefined`로
 * 버리면서(`transfer-tax-api-commercial.ts:32`) `unapprovedBuilding: true`까지 함께 사라졌다
 * — 화면은 「부속토지 전체 비사업용」이라 확언하는데 +10%p 중과는 **전혀 적용되지 않았다**.
 *
 * 엔진은 단서 분기에서도 면적을 쓴다(`appurtenant-land-excess.ts:98` — allowedLandArea=0 →
 * nonBusinessArea = landArea). 배율만 불필요하므로 **용도지역과 배율 배지만** 숨긴다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CommercialAppurtenantLandSection } from "@/components/calc/transfer/CommercialAppurtenantLandSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return { ...makeDefaultAsset(1), assetKind: "commercial_building", ...over } as AssetForm;
}

function zoneRadios(): NodeListOf<HTMLInputElement> {
  return document.querySelectorAll<HTMLInputElement>('input[name="cbZoneType"]');
}

describe("상가 부수토지 — §101① 단서 ON에서도 면적칸이 남는다", () => {
  it("🔑 C-1: 단서 ON에서도 대지면적·바닥면적 두 칸이 렌더된다", () => {
    render(
      <CommercialAppurtenantLandSection
        asset={asset({ cbUnapprovedBuilding: true })}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("집합건물 전체 대지면적")).toBeTruthy();
    expect(screen.getByText("집합건물 전체 바닥면적")).toBeTruthy();
  });

  it("C-2: 단서 ON이면 용도지역은 숨긴다 (배율이 불필요 — 세액 무관 입력 강제 금지)", () => {
    render(
      <CommercialAppurtenantLandSection
        asset={asset({ cbUnapprovedBuilding: true })}
        onChange={() => {}}
      />,
    );
    expect(zoneRadios().length).toBe(0);
    expect(screen.getByText(/부속토지 전체 비사업용/)).toBeTruthy();
  });

  it("C-3: 단서 OFF면 면적 두 칸 + 용도지역이 모두 보인다 (종전 동작 유지)", () => {
    render(<CommercialAppurtenantLandSection asset={asset()} onChange={() => {}} />);
    expect(screen.getByText("집합건물 전체 대지면적")).toBeTruthy();
    expect(screen.getByText("집합건물 전체 바닥면적")).toBeTruthy();
    expect(zoneRadios().length).toBeGreaterThan(0);
  });
});
