/**
 * V-7 취득 당시 감정평가가액 칸 — 노출은 `acqAppraisalApportionApplies`(④ 전송·⑧ 쌍 검증과 같은 술어), 결과 카드는 엔진 echo 그대로.
 * 계획서: docs/02-design/features/owner-split-residue-followups.plan.md §2.5.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NonPurchaseSplitInputsBlock } from "@/components/calc/transfer/NonPurchaseSplitInputsBlock";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

function Harness({ init, onAsset }: { init: Partial<AssetForm>; onAsset?: (a: AssetForm) => void }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "inheritance",
    acquisitionDate: "2015-01-01",
    addressJibun: "서울특별시 강남구 삼성동 100",
    ...init,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) =>
    setAsset((a) => {
      const next = { ...a, ...p };
      onAsset?.(next);
      return next;
    });
  return <NonPurchaseSplitInputsBlock asset={asset} onChange={patch} transferDate="2023-02-16" />;
}

describe("소유자 분리 블록 — 취득 당시 감정평가가액 칸", () => {
  it("상속 토지만 본인이면 칸이 열리고 입력이 폼에 쓰인다", () => {
    let last: AssetForm | undefined;
    render(<Harness init={{ selfOwns: "land_only" }} onAsset={(a) => (last = a)} />);
    expect(screen.getByTestId("acq-appraisal-fields")).toBeTruthy();
    fireEvent.change(screen.getByTestId("acq-appraisal-land"), { target: { value: "150000000" } });
    fireEvent.change(screen.getByTestId("acq-appraisal-building"), { target: { value: "150000000" } });
    expect([last?.landAppraisalAtAcquisition, last?.buildingAppraisalAtAcquisition].map((v) => v?.replace(/,/g, ""))).toEqual(["150000000", "150000000"]);
  });

  it("부담부증여는 ④가 분리 입력을 보내지 않으므로 칸을 열지 않는다", () => {
    render(<Harness init={{ acquisitionCause: "gift", transferType: "burdened_gift", selfOwns: "land_only" } as Partial<AssetForm>} />);
    expect(screen.queryByTestId("acq-appraisal-fields")).toBeNull();
  });
});

describe("결과 카드 — 취득가액 안분 basis", () => {
  const part = { transferPrice: 480_000_000, acquisitionPrice: 150_000_000, directExpenses: 0, appraisalDeduction: 0, gain: 330_000_000, holdingYears: 8, longTermRate: 0.16, longTermDeduction: 0 };
  const detail = (over: Record<string, unknown> = {}) => ({ land: part, building: { ...part, transferPrice: 720_000_000 }, note: "", selfOwns: "land_only", ...over }) as never;

  it("엔진이 감정평가가액 비율로 나눴다고 알리면 한 줄을 낸다", () => {
    render(<SplitGainDetailSection splitDetail={detail({ acqApportionBasisKind: "appraisal" })} assetKind="housing" />);
    expect(screen.getByTestId("split-acq-apportion-appraisal").textContent).toContain("감정평가가액 비율");
  });

  it("echo가 없으면(기준시가 비율) 줄을 내지 않는다", () => {
    render(<SplitGainDetailSection splitDetail={detail()} assetKind="housing" />);
    expect(screen.queryByTestId("split-acq-apportion-appraisal")).toBeNull();
  });
});
