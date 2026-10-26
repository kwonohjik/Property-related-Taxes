/**
 * 상속 전환 — 화면 원인 라디오가 싣는 정리 patch(계획서 `docs/02-design/features/inherit-stale-acq-mode-flags.plan.md`).
 *
 * route anchor(`transfer.route.inherit-stale-acq-mode-flags`)는 복원 경로를 고정한다. 여기서는 **화면 전환**의 patch를 본다 —
 *   CS-1 매매 → 상속: 산정 방식 플래그 3종·파트 방식·파트 취득가를 비운다(상속 카드엔 그 칸이 없다).
 *   CS-2 증여 D2(건물 증여 + 토지 매매) → 상속: 같은 batch가 D2 호스트 태그·취득일 분리를 끄고(D2 꺼짐), 토지 매매 흔적이 있으니
 *        **토지** 파트 값은 남기고(D2 재활성 시 복원 설계 — `transfer-land-part-cause.d2.predo.render` C10) 건물 파트 값만 비운다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function switchToInheritance(a: AssetForm): Partial<AssetForm> {
  const calls: Partial<AssetForm>[] = [];
  render(<CompanionAcquisitionCauseSection asset={a} onChange={(p) => calls.push(p)} transferDate="2026-06-30" isNewConstruction={false} />);
  fireEvent.click(screen.getByRole("radio", { name: "상속" }));
  const patch = calls.find((p) => p.acquisitionCause === "inheritance");
  expect(patch).toBeDefined();
  return patch!;
}

const base = (over: Partial<AssetForm>): AssetForm =>
  ({ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionDate: "2025-05-01", ...over }) as AssetForm;

describe("CS — 상속 전환 patch", () => {
  it("CS-1 매매(감정 · 취득일 다름 · 파트 값) → 상속: 플래그·파트 방식·파트 취득가를 비운다", () => {
    const p = switchToInheritance(base({
      acquisitionCause: "purchase", isAppraisalAcquisition: true, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2020-01-01",
      landAcqMode: "appraisal", buildingAcqMode: "estimated", landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "100,000,000",
      landSalesCaseValue: "1", buildingSalesCaseValue: "2",
    }));
    expect(p).toMatchObject({
      useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false, hasSeperateLandAcquisitionDate: false,
      landAcqMode: "", buildingAcqMode: "", landAcquisitionPrice: "", buildingAcquisitionPrice: "", landSalesCaseValue: "", buildingSalesCaseValue: "",
    });
  });

  it("CS-2 증여 D2 → 상속: D2가 꺼지고 토지 파트 값은 남고 건물 파트 값은 빈다", () => {
    const p = switchToInheritance(base({
      acquisitionCause: "gift", landAcquisitionCause: "purchase", landCauseHost: "gift", hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2025-01-10", landAcqMode: "appraisal", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
      buildingAcquisitionPrice: "400,000,000",
    }));
    expect(p).toMatchObject({ landCauseHost: "", hasSeperateLandAcquisitionDate: false, buildingAcqMode: "", buildingAcquisitionPrice: "" });
    for (const k of ["landAcqMode", "landAcquisitionPrice", "landSalesCaseValue"] as const) expect(p, k).not.toHaveProperty(k);
  });
});
