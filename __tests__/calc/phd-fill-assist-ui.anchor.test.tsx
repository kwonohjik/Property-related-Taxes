/**
 * anchor — «환산 개별주택가격 계산해 채우기» UI (PHD × 비환산 PR-2, 계획서 §9.2)
 *   U1 보이는 조건(방식 × 취득일) · 환산에서는 PHD 토글이 대신하고 버튼은 없다
 *   U2 클릭 → «취득시 기준시가» 칸에 환산 개별주택가격이 **한 번** 채워진다 (실거래가 안분·감정·매매사례 3칸)
 *   U3 채운 뒤 직접 고칠 수 있고, 보조 입력이 바뀌어도 자동 갱신되지 않는다 (useEffect 미러링 금지)
 *   U4 칸이 모자라거나 적용할 수 없으면 버튼이 꺼지고 사유를 말한다
 *   U5 보조 입력은 환산과 같은 phd* 칸 — 환산으로 돌아가면 같은 값이 그대로 복귀한다
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TD = "2026-03-01";
const BUTTON = "환산 개별주택가격 계산해 채우기";
const SEVEN: Partial<AssetForm> = {
  phdFirstDisclosureDate: "2005-04-30",
  phdFirstDisclosureHousingPrice: "100000000",
  phdLandPricePerSqmAtAcq: "1000000",
  phdBuildingStdPriceAtAcq: "60000000",
  phdLandPricePerSqmAtFirst: "1100000",
  phdBuildingStdPriceAtFirst: "61000000",
  acquisitionArea: "100",
};
const METHOD = {
  actual: { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false },
  est: { useEstimatedAcquisition: true, isAppraisalAcquisition: false, isSalesCaseAcquisition: false },
  app: { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: false },
  sales: { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: true },
} as const;
/** 실거래가는 취득시 기준시가 칸이 «토지·건물 분리 입력»에서만 열린다(StdPriceSection) */
const ACTUAL_SPLIT = { ...METHOD.actual, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2003-01-10" };

let onAssetPatches = 0;
function Harness({ init, nonPrimary = false }: { init: Partial<AssetForm>; nonPrimary?: boolean }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-01-10",
    addressJibun: "서울 테스트동 1",
    fixedAcquisitionPrice: "300000000",
    similarSalesValue: "300000000",
    standardPriceAtAcq: "",
    standardPriceAtTransfer: "400000000",
    ...init,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));
  return (
    <>
      <span data-testid="probe" data-std={asset.standardPriceAtAcq ?? ""} data-first-price={asset.phdFirstDisclosureHousingPrice} data-flag={String(asset.usePreHousingDisclosure)} />
      <CompanionAcqPurchaseBlock
        acquisitionDate={asset.acquisitionDate}
        onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
        useEstimatedAcquisition={!!asset.useEstimatedAcquisition}
        onUseEstimatedChange={(v) => patch({ useEstimatedAcquisition: v })}
        isAppraisalAcquisition={!!asset.isAppraisalAcquisition}
        isSalesCaseAcquisition={!!asset.isSalesCaseAcquisition}
        fixedAcquisitionPrice={asset.fixedAcquisitionPrice ?? ""}
        onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
        similarSalesValue={asset.similarSalesValue ?? ""}
        onSimilarSalesValueChange={(v) => patch({ similarSalesValue: v })}
        standardPriceAtAcq={asset.standardPriceAtAcq ?? ""}
        onStandardPriceAtAcqChange={(v) => {
          onAssetPatches++;
          patch({ standardPriceAtAcq: v });
        }}
        standardPriceAtTransfer={asset.standardPriceAtTransfer ?? ""}
        onStandardPriceAtTransferChange={(v) => patch({ standardPriceAtTransfer: v })}
        assetKind={asset.assetKind}
        transferDate={TD}
        jibun={asset.addressJibun}
        acquisitionArea={asset.acquisitionArea}
        onAcquisitionAreaChange={(v) => patch({ acquisitionArea: v })}
        hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
        onHasSeperateLandAcquisitionDateChange={(v) => patch({ hasSeperateLandAcquisitionDate: v })}
        landAcquisitionDate={asset.landAcquisitionDate}
        onLandAcquisitionDateChange={(v) => patch({ landAcquisitionDate: v })}
        selfOwns={asset.selfOwns ?? "both"}
        onSelfOwnsChange={(v) => patch({ selfOwns: v })}
        isNonPrimaryAsset={nonPrimary}
        asset={asset}
        onAssetChange={patch}
      />
    </>
  );
}
const probe = () => screen.getByTestId("probe");
const button = () => screen.queryByRole("button", { name: BUTTON });
const stdInput = () => document.querySelector('[data-field="standardPriceAtAcq"] input') as HTMLInputElement | null;

describe("U1 보이는 조건", () => {
  it.each([
    ["감정가액", METHOD.app],
    ["매매사례가액", METHOD.sales],
    ["실거래가(토지·건물 분리 입력)", ACTUAL_SPLIT],
  ] as const)("%s + 취득일 < 2005-04-29 → 버튼이 있다", (_n, m) => {
    render(<Harness init={{ ...m, ...SEVEN }} />);
    expect(button()).not.toBeNull();
  });

  it("환산 → 버튼 없음(PHD 3-시점 토글이 대신 — 두 카드가 함께 뜨지 않는다)", () => {
    render(<Harness init={{ ...METHOD.est, usePreHousingDisclosure: true, ...SEVEN }} />);
    expect(button()).toBeNull();
    expect(screen.queryAllByText(/취득 당시 개별주택가격 미공시/).length).toBeGreaterThan(0);
  });

  it("함께 양도 둘째 이후 자산도 보인다 — 값만 채우는 보조라 PHD 엔진 경로(첫 자산 한정)와 무관하다(둘째 자산은 취득시 기준시가를 직접 입력)", () => {
    onAssetPatches = 0;
    render(<Harness nonPrimary init={{ ...METHOD.app, ...SEVEN }} />);
    expect(button()).not.toBeNull();
    fireEvent.click(button()!);
    expect(probe().dataset.std).toBe("93567251");
  });

  it("취득일 ≥ 2005-04-29 / 비주택 → 없음 (긍정 짝은 위 케이스)", () => {
    const a = render(<Harness init={{ ...METHOD.app, acquisitionDate: "2010-01-10" }} />);
    expect(button()).toBeNull();
    a.unmount();
    render(<Harness init={{ ...METHOD.app, assetKind: "land" }} />);
    expect(button()).toBeNull();
  });

  it("보조 카드는 양도시 입력(양도시 개별주택가격·③ 양도시 기준시가)을 받지 않는다 — 환산 개별주택가격에 쓰이지 않고 ④ 도 보내지 않는다 (긍정 짝: 환산 PHD 카드는 받는다)", () => {
    const a = render(<Harness init={{ ...METHOD.app, ...SEVEN }} />);
    expect(document.querySelector('[data-field="phdFirstDisclosureHousingPrice"]')).not.toBeNull();
    for (const f of ["phdTransferHousingPrice", "phdLandPricePerSqmAtTransfer", "phdBuildingStdPriceAtTransfer"])
      expect(document.querySelector(`[data-field="${f}"]`), f).toBeNull();
    a.unmount();
    render(<Harness init={{ ...METHOD.est, usePreHousingDisclosure: true, ...SEVEN }} />);
    for (const f of ["phdTransferHousingPrice", "phdLandPricePerSqmAtTransfer", "phdBuildingStdPriceAtTransfer"])
      expect(document.querySelector(`[data-field="${f}"]`), f).not.toBeNull();
  });

  it("보조 입력이 비어 있으면 접힌 채 시작하고(버튼 없음), 펼치면 버튼이 꺼진 채 보인다", () => {
    render(<Harness init={{ ...METHOD.app }} />);
    expect(button()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /펼치기/ }));
    expect(button()).not.toBeNull();
    expect((button() as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("U2 클릭 → 취득시 기준시가 칸 채움 (한 번의 onChange)", () => {
  it.each([
    ["감정가액", METHOD.app],
    ["매매사례가액", METHOD.sales],
    ["실거래가(분리 입력)", ACTUAL_SPLIT],
  ] as const)("%s: 93,567,251 이 채워진다", (_n, m) => {
    onAssetPatches = 0;
    render(<Harness init={{ ...m, ...SEVEN }} />);
    expect(screen.getByTestId("phd-fill-value").textContent).toBe("93,567,251"); // 미리보기(파생 표시 — store 에 쓰지 않는다)
    expect(probe().dataset.std).toBe(""); // 클릭 전에는 채우지 않는다
    fireEvent.click(button()!);
    expect(probe().dataset.std).toBe("93567251");
    expect(onAssetPatches).toBe(1);
    expect(stdInput()?.value).toBe("93,567,251");
  });
});

describe("U3 보조 도구일 뿐이다 — 고칠 수 있고 자동 갱신하지 않는다", () => {
  it("채운 뒤 칸을 직접 고칠 수 있다", () => {
    render(<Harness init={{ ...METHOD.app, ...SEVEN }} />);
    fireEvent.click(button()!);
    fireEvent.change(stdInput()!, { target: { value: "90000000" } });
    expect(probe().dataset.std).toBe("90000000");
  });

  it("보조 입력을 바꿔도 칸이 자동으로 바뀌지 않는다 — 다시 눌러야 갱신된다", () => {
    onAssetPatches = 0;
    render(<Harness init={{ ...METHOD.app, ...SEVEN }} />);
    fireEvent.click(button()!);
    const filled = probe().dataset.std;
    const priceInput = document.querySelector('[data-field="phdFirstDisclosureHousingPrice"] input') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "200000000" } });
    expect(probe().dataset.firstPrice).toBe("200000000"); // 입력은 반영됐고
    expect(probe().dataset.std).toBe(filled); // 칸은 그대로
    expect(onAssetPatches).toBe(1);
    expect(screen.getByTestId("phd-fill-value").textContent).toBe("187,134,502"); // 미리보기는 새 값을 보여주되
    fireEvent.click(button()!); // 다시 눌러야 채운다
    expect(probe().dataset.std).toBe("187134502");
    expect(onAssetPatches).toBe(2);
  });

  it("플래그(usePreHousingDisclosure)를 건드리지 않는다 — 클릭 전후 같다(마운트 시 값은 기존 자동 ON effect 의 몫 — Q-7 그대로)", () => {
    render(<Harness init={{ ...METHOD.app, ...SEVEN, usePreHousingDisclosure: false }} />);
    const before = probe().dataset.flag;
    fireEvent.click(button()!);
    expect(probe().dataset.flag).toBe(before);
  });
});

describe("U4 막힘 — 버튼이 꺼지고 사유를 말한다", () => {
  it("칸이 모자라면 비활성 + 부족한 칸 지목", () => {
    render(<Harness init={{ ...METHOD.app, ...SEVEN, phdBuildingStdPriceAtFirst: "" }} />);
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("phd-fill-reason").textContent).toContain("최초공시일 건물 기준시가");
    fireEvent.click(button()!);
    expect(probe().dataset.std).toBe("");
  });

  it("취득일 ≥ 최초 고시일 → 비활성 + 직접 입력 안내", () => {
    render(<Harness init={{ ...METHOD.app, ...SEVEN, phdFirstDisclosureDate: "2003-01-10" }} />);
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("phd-fill-reason").textContent).toContain("직접 입력");
  });
});

describe("U5 환산 복귀 — 같은 phd* 칸이라 보조 입력이 그대로 복귀한다", () => {
  it("비환산에서 채운 값이 환산 전환 시 PHD 카드의 같은 칸에 그대로 보인다(저장값 삭제 없음)", () => {
    const a = render(<Harness init={{ ...METHOD.app, ...SEVEN }} />);
    expect(probe().dataset.firstPrice).toBe("100000000");
    a.unmount();
    render(<Harness init={{ ...METHOD.est, usePreHousingDisclosure: true, ...SEVEN }} />);
    const el = document.querySelector('[data-field="phdFirstDisclosureHousingPrice"] input') as HTMLInputElement;
    expect(el.value).toBe("100,000,000");
  });
});
