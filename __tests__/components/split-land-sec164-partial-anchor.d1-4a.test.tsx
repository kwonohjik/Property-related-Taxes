/**
 * @vitest-environment jsdom
 *
 * D1-4a D14-5 — 1990.8.30. 전 상속·증여 토지 + 「일부 양도」 차단(⑧)이 다는 이동 칸 `areaScenario`가
 * 화면에 실제 앵커로 있다. 앵커가 없으면 `jumpToIssueField`가 대상을 못 찾아 메시지만 뜨고 고칠 칸으로 가지 않는다
 * (sync 검사 Low-1 — 종전엔 「면적 입력 방식」 래퍼에 `data-field`가 없었다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AssetAreaSection } from "@/components/calc/transfer/asset-sections/AssetAreaSection";
import { validateLandPartCause } from "@/lib/calc/transfer-tax-validate-split";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-03-02",
    landAcquisitionCause: "inheritance",
    landCauseHost: "purchase",
    landAcquisitionDate: "1988-05-01",
    landDecedentAcquisitionDate: "1960-01-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    areaScenario: "partial",
    acquisitionArea: "300",
    transferArea: "100",
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "350000000",
    ...over,
  }) as AssetForm;

describe("D14-5 ⑧ 이동 칸 앵커", () => {
  it("⑧이 다는 칸(areaScenario)이 「면적 입력 방식」 래퍼에 data-field로 있다", () => {
    const a = asset();
    const r = collectWithFields(() => validateLandPartCause(a, "자산1"));
    const field = r.fieldOf(r.result!);
    expect(field).toBe("areaScenario");
    const { container } = render(<AssetAreaSection asset={a} onChange={() => {}} />);
    const anchor = container.querySelector(`[data-field="${field}"]`);
    expect(anchor).not.toBeNull();
    expect(anchor!.textContent).toContain("면적 입력 방식");
  });
});
