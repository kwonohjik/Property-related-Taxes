/**
 * @vitest-environment jsdom
 *
 * anchor: 대장 재대조 보류 6건 최종 판정 — 살아 있던 3건(#4·#10·#29).
 *
 * 셋 다 **「미리보기·안내가 엔진의 게이트를 하나 덜 본다」**는 같은 형태다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HousesListSection } from "@/app/calc/transfer-tax/steps/step4-sections/HousesListSection";
import { ReductionPhdInput } from "@/components/calc/transfer/ReductionPhdInput";
import { PreDeemedInputs } from "@/components/calc/transfer/inheritance/PreDeemedInputs";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

/* ── #10 경과조치 미리보기가 「보유 2년」 게이트를 본다 ────────── */

function graceForm(acquisitionDate: string): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2026-05-01",
    isOneHousehold: true,
    householdHousingCount: "3",
    assets: [
      { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate, regionCode: "11680" },
    ],
    houses: [{ id: "h1", acquisitionDate: "2015-01-01", officialPrice: "500,000,000" }],
    presaleRights: [],
    gracePeriod: {
      contractDate: "2024-01-10",
      isLandPermitTarget: false,
      permitGranted: false,
      depositReceiptConfirmed: true,
    },
  } as unknown as TransferFormData;
}

describe("#10 — 경과조치 미리보기가 엔진의 바깥 게이트를 건너뛰지 않는다", () => {
  it("🔑 A-1: 보유 2년 미만이면 초록 「충족」을 띄우지 않는다", () => {
    render(<HousesListSection form={graceForm("2025-06-01")} onChange={() => {}} />);
    expect(screen.queryByText("충족 — 중과 경과조치 배제 대상")).toBeNull();
    expect(screen.getByText(/보유기간이 2년 미만/)).toBeTruthy();
  });

  it("A-2: 보유 2년 이상이면 종전 판정 그대로 — 게이트를 덧씌워 죽인 게 아니다", () => {
    render(<HousesListSection form={graceForm("2015-02-10")} onChange={() => {}} />);
    expect(screen.queryByText(/보유기간이 2년 미만/)).toBeNull();
  });
});

/* ── #4 환산 미완성 안내가 실제 요구 필드를 말한다 ────────────── */

describe("#4 — 「무엇이 빠졌는지」를 말한다", () => {
  const base = {
    phdMode: true,
    firstDisclosureDate: "2005-04-30",
    firstDisclosurePrice: "",
    landAreaSqm: "200",
    landPricePerSqmAtAcq: "1000000",
    landPricePerSqmAtFirst: "1500000",
    buildingStdAtAcq: "",
    buildingStdAtFirst: "",
  };

  it("🔑 B-1: 취득시 건물 기준시가가 있으면 최초공시시 건물 기준시가도 열거한다", () => {
    render(
      <ReductionPhdInput
        value={{ ...base, buildingStdAtAcq: "50000000" } as never}
        onChange={() => {}}
      />,
    );
    const notes = screen.getAllByText(
      (_, el) => el?.tagName === "P" && (el?.textContent ?? "").includes("환산을 위해"),
    );
    expect(notes[0].textContent).toContain("최초공시시 건물 기준시가");
  });

  it("B-2: 건물분이 없으면 종전대로 토지 항목만 — 과잉 안내가 아니다", () => {
    render(<ReductionPhdInput value={base as never} onChange={() => {}} />);
    const notes = screen.getAllByText(
      (_, el) => el?.tagName === "P" && (el?.textContent ?? "").includes("환산을 위해"),
    );
    expect(notes[0].textContent).not.toContain("최초공시시 건물 기준시가");
  });
});

/* ── #29 override가 켜져 있으면 자동값이 덮지 않는다 ──────────── */

describe("#29 — 「직접 입력」 선언을 자동값이 되덮지 않는다", () => {
  const landAsset = (over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "1985-03-01",
      acquisitionArea: "300",
      pre1990Enabled: true,
      pre1990GradeMode: "grade",
      pre1990Grade_current: "100",
      pre1990Grade_prev: "95",
      pre1990Grade_atAcq: "90",
      pre1990PricePerSqm_1990: "50000",
      useStandardPriceAtAcqOverride: true,
      standardPriceAtAcq: "999,999,999",
      ...over,
    }) as unknown as AssetForm;

  it("🔑 C-1: override ON이면 `standardPriceAtAcq` 패치가 발생하지 않는다", () => {
    const onChange = vi.fn();
    render(
      <PreDeemedInputs asset={landAsset()} onChange={onChange} transferDate="2025-05-01" />,
    );
    const wrote = onChange.mock.calls.some(
      (c) => (c[0] as Record<string, unknown>)?.standardPriceAtAcq !== undefined,
    );
    expect(wrote).toBe(false);
  });
});
