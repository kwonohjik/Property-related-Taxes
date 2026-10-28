/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — Step4가 합가한 토지만 본인 주택의 거주 칸에 합가일 힌트를 연결한다
 * (계획서 `docs/02-design/features/land-only-merge-residence-period.plan.md` Q-3 a · ④ ⑧ 과 같은 술어 `landOnlyMergeResidenceStart`).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const form = (asset: Record<string, unknown>): TransferFormData => {
  const base = createDefaultTransferFormData();
  return {
    ...base, transferDate: "2026-02-16", isOneHousehold: true, householdHousingCount: "1",
    assets: base.assets.map((a, i) => (i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2014-09-01", ...asset } : a)),
  } as TransferFormData;
};
const LAND_ONLY = { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2022-01-01" };

describe("Step4 거주 칸 합가 힌트", () => {
  it("🔑 합가한 토지만 본인 주택: 합가일이 담긴 힌트가 뜬다", () => {
    render(<Step4 form={form(LAND_ONLY)} onChange={() => {}} />);
    expect(screen.getByTestId("residence-merge-hint").textContent).toContain("2022-01-01");
  });

  it("처음부터 같은 세대 · 다른 세대 · 토지·건물 모두 본인이면 힌트가 없다", () => {
    for (const over of [{ buildingOwnerHouseholdMerged: false }, { buildingOwnerSameHousehold: false }, { selfOwns: "both" }]) {
      const { unmount } = render(<Step4 form={form({ ...LAND_ONLY, ...over })} onChange={() => {}} />);
      expect(screen.queryByTestId("residence-merge-hint")).toBeNull();
      unmount();
    }
  });
});
