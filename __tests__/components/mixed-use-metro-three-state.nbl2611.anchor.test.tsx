/**
 * anchor (NBL2611-V4-HS06 · V10-BX09 · V4-HS01 표시) — 겸용 화면 3-state · 결과 문구가 실제 적용값을 따른다.
 *
 * - 수도권 여부: 미선택이 기본(어느 쪽도 체크되지 않음) · 선택하면 patch가 boolean으로 간다 · 칸 앵커(`data-field`)가 있다(⑧ 이동).
 * - 결과 ④ 섹션: OH-17이면 한도·양도차익 산식이 전체 토지·상가 몫을 포함하고, 위기취득이면 +10%p 대신 배제 안내를 낸다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MixedUseAreaInputs } from "@/components/calc/transfer/mixed-use/MixedUseAreaInputs";
import { MixedUseNblSection } from "@/components/calc/results/mixed-use/MixedUseNblSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MixedUseNonBusinessLandPart } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({ ...makeDefaultAsset(1), isMixedUseHouse: true, residentialFloorArea: "72", nonResidentialFloorArea: "48", mixedUseTotalLandArea: "200", buildingFootprintArea: "100", ...over }) as AssetForm;

describe("수도권 여부 3-state 위젯", () => {
  it("기본값은 미선택 — 두 라디오 모두 체크되지 않는다", () => {
    const { getByTestId } = render(<MixedUseAreaInputs asset={asset()} onChange={() => undefined} />);
    expect((getByTestId("mixed-metro-yes") as HTMLInputElement).checked).toBe(false);
    expect((getByTestId("mixed-metro-no") as HTMLInputElement).checked).toBe(false);
  });

  it("저장된 값(true/false)은 그대로 체크로 복원된다", () => {
    const yes = render(<MixedUseAreaInputs asset={asset({ mixedIsMetropolitanArea: true })} onChange={() => undefined} />);
    expect((yes.getByTestId("mixed-metro-yes") as HTMLInputElement).checked).toBe(true);
    yes.unmount();
    const no = render(<MixedUseAreaInputs asset={asset({ mixedIsMetropolitanArea: false })} onChange={() => undefined} />);
    expect((no.getByTestId("mixed-metro-no") as HTMLInputElement).checked).toBe(true);
  });

  it("선택하면 boolean patch가 간다 · ⑧ 이동 앵커가 있다", () => {
    let patch: Partial<AssetForm> = {};
    const { getByTestId, container } = render(<MixedUseAreaInputs asset={asset()} onChange={(p) => (patch = p)} />);
    fireEvent.click(getByTestId("mixed-metro-no"));
    expect(patch).toEqual({ mixedIsMetropolitanArea: false });
    fireEvent.click(getByTestId("mixed-metro-yes"));
    expect(patch).toEqual({ mixedIsMetropolitanArea: true });
    expect(container.querySelector('[data-field="mixedIsMetropolitanArea"]')).not.toBeNull();
  });
});

const nb = (over: Partial<MixedUseNonBusinessLandPart> = {}): MixedUseNonBusinessLandPart => ({
  excessArea: 100, appliedMultiplier: 3, transferGain: 50_000_000, longTermDeductionRate: 0.3, longTermDeductionAmount: 15_000_000,
  incomeAmount: 35_000_000, additionalRate: 0.1, ...over,
});
const render4 = (n: MixedUseNonBusinessLandPart, commercial?: number) =>
  render(<MixedUseNblSection nb={n} landTransferGain={100_000_000} nonBusinessTransferRatio={0.25} commercialLandTransferGain={commercial} open onToggle={() => undefined} />);

describe("④ 비사업용토지 결과 섹션", () => {
  it("기본(+10%p)은 종전 문구 그대로", () => {
    const { container } = render4(nb());
    expect(container.textContent).toContain("비사업용토지 양도소득금액 (+10%p 가산)");
    expect(container.querySelector('[data-testid="mixed-nbl-surcharge-excluded"]')).toBeNull();
  });

  it("위기취득(가산 0)이면 «+10%p»를 쓰지 않고 배제 안내를 낸다", () => {
    const { container } = render4(nb({ additionalRate: 0, surchargeExcludedBy: "crisis_acquisition" }));
    expect(container.textContent).not.toContain("+10%p 가산)");
    expect(container.textContent).toContain("위기취득 — 가산 없음");
    expect(container.querySelector('[data-testid="mixed-nbl-surcharge-excluded"]')?.textContent).toContain("부칙 §9270호 §14①");
  });

  it("OH-17이면 한도(전체 토지 − 건물 전체 정착 × 배율)와 양도차익(주택 + 상가 몫)을 값대로 적는다", () => {
    const { container } = render4(
      nb({ excessBasis: { landArea: 400, footprintArea: 100, wholeBuildingDeemedHouse: true }, commercialLandTransferredGain: 7_000_000 }),
      28_000_000,
    );
    const t = container.textContent ?? "";
    expect(t).toContain("전체 토지 400㎡ - (건물 전체 정착면적 100㎡ × 3배)");
    expect(t).toContain("상가 부수토지분 양도차익 28,000,000 × 같은 비율");
  });
});
