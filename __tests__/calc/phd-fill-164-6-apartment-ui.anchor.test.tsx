/**
 * anchor — 공동주택 PHD 표시 × 처음 매겨진 가격이 국세청장 고시(영 §164⑥) (계획서 docs/00-pm/phd-fill-164-6-apartment.plan.md §9)
 *   A1 (Q-1 a) 보조 카드 제목 — 공동주택은 «§164⑥·⑦» 조건 문장, 단독·다가구는 종전 문자열 그대로
 *   A2 (Q-2 b) 공용 입력 카드 — 배지·최초 가격 라벨·자동조회 안내·적용 불가 경고가 보조·환산 두 모드 모두 공동주택이면 §164⑥·⑦
 *   A3 (Q-4 b) §164⑤ 준용 확인란 — 보조 모드에서 취득일·최초 고시일이 2000년 이전일 때만 보이고, 체크해야 채우기 버튼이 켜진다
 *   A4 (Q-2 b) 환산 토글 제목 — 공동주택이면 «공동주택가격 미공시 (§164⑥·⑦ 3-시점 계산)»
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { PhdConvertedPriceFill } from "@/components/calc/transfer/PhdConvertedPriceFill";
import { PreHousingDisclosureSection } from "@/components/calc/transfer/PreHousingDisclosureSection";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TD = "2026-03-01";
const noop = () => {};
const text = () => document.body.textContent ?? "";
/** 국세청 고시 공동주택(P1) — 40㎡ · 최초 가격 8,000만 · 취득 합계 4,000만 · 최초 합계 5,300만 */
const P1: Partial<AssetForm> = {
  acquisitionDate: "1991-03-01",
  phdFirstDisclosureDate: "1992-01-01",
  phdFirstDisclosureHousingPrice: "80000000",
  acquisitionArea: "40",
  phdLandPricePerSqmAtAcq: "500000",
  phdBuildingStdPriceAtAcq: "20000000",
  phdLandPricePerSqmAtFirst: "700000",
  phdBuildingStdPriceAtFirst: "25000000",
};
/** 국토교통부 공시 공동주택(P5) — 2003 취득 · 2005 최초 공시 (2001년 이후라 §164⑤ 준용 없음) */
const P5: Partial<AssetForm> = { ...P1, acquisitionDate: "2003-03-01", phdFirstDisclosureDate: "2005-04-30" };
const housing = (over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    addressJibun: "서울 테스트동 1",
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: true,
    ...over,
  }) as AssetForm;

describe("A1 보조 카드 제목 (Q-1 a)", () => {
  it("공동주택 — 첫 가격 두 종류와 §164⑥·⑦을 함께 적고, 단정형 «(소득세법 시행령 §164⑦)»는 없다", () => {
    render(<PhdConvertedPriceFill asset={housing({ ...P5, phdHousingType: "apartment" })} onAssetChange={noop} transferDate={TD} onFill={noop} />);
    expect(text()).toContain(
      "취득일이 공동주택의 첫 가격(국세청장 고시 기준시가 또는 공동주택가격) 고시일 전이면 — 환산 공동주택가격 계산 (소득세법 시행령 §164⑥·⑦)",
    );
    expect(text()).not.toContain("(소득세법 시행령 §164⑦)");
  });
  it("단독·다가구 — 종전 제목 그대로(§164⑥은 단독주택에 적용되지 않는다)", () => {
    render(<PhdConvertedPriceFill asset={housing({ ...P5, phdHousingType: "individual" })} onAssetChange={noop} transferDate={TD} onFill={noop} />);
    expect(text()).toContain("취득일이 개별주택가격 최초 공시일 전이면 — 환산 개별주택가격 계산 (소득세법 시행령 §164⑦)");
    expect(text()).not.toContain("§164⑥");
  });
  it("공동주택 적용 불가 사유 — «공동주택가격(국세청장이 고시한 기준시가 포함)»을 직접 입력", () => {
    render(
      <PhdConvertedPriceFill asset={housing({ ...P5, acquisitionDate: "2010-01-01", phdHousingType: "apartment" })} onAssetChange={noop} transferDate={TD} onFill={noop} />,
    );
    expect(screen.getByTestId("phd-fill-reason").textContent).toBe(
      "취득일이 최초 고시일 이후라 계산하지 않습니다 — 취득일 현재 고시된 공동주택가격(국세청장이 고시한 기준시가 포함)을 직접 입력하세요.",
    );
  });
});

describe("A2 공용 입력 카드 (Q-2 b — 보조·환산 두 모드)", () => {
  it.each(["assist", "phd"] as const)("%s · 공동주택 — 배지 §164⑥·⑦ · 라벨 두 가격 · 국세청 고시는 직접 입력 안내", (mode) => {
    render(<PreHousingDisclosureSection mode={mode} asset={housing({ ...P5, phdHousingType: "apartment" })} transferDate={TD} onChange={noop} />);
    const t = text();
    expect(t).toContain("소득세법 시행령 §164⑥·⑦");
    expect(t).not.toContain("소득세법 시행령 §164 ⑦");
    expect(t).toContain("최초 고시 가격(국세청장 고시 기준시가 또는 공동주택가격)");
    expect(t).not.toContain("최초 고시 공동주택가격");
    expect(t).toContain("아래 자동조회는 공동주택가격만 찾으므로 국세청장 고시 기준시가는 직접 입력하세요.");
  });
  it.each(["assist", "phd"] as const)("%s · 단독·다가구 — 배지·라벨·안내 종전 그대로", (mode) => {
    render(<PreHousingDisclosureSection mode={mode} asset={housing({ ...P5, phdHousingType: "individual" })} transferDate={TD} onChange={noop} />);
    const t = text();
    expect(t).toContain("소득세법 시행령 §164 ⑦");
    expect(t).not.toContain("§164⑥");
    expect(t).toContain("최초 고시 개별주택가격");
    expect(t).not.toContain("국세청장 고시 기준시가");
  });
  it.each(["assist", "phd"] as const)("%s · 적용 불가 경고 — 공동주택 §164⑥·⑦ / 단독 §164⑦", (mode) => {
    const late = { ...P5, acquisitionDate: "2010-01-01" };
    render(<PreHousingDisclosureSection mode={mode} asset={housing({ ...late, phdHousingType: "apartment" })} transferDate={TD} onChange={noop} />);
    expect(text()).toContain("⚠️ 3-시점 환산(§164⑥·⑦) 대상이 아닙니다");
    expect(text()).toContain("취득 당시 공동주택가격(국세청장이 고시한 기준시가 포함)이 이미 고시되어 있습니다");
    cleanup();
    render(<PreHousingDisclosureSection mode={mode} asset={housing({ ...late, phdHousingType: "individual" })} transferDate={TD} onChange={noop} />);
    expect(text()).toContain("⚠️ 3-시점 환산(§164⑦) 대상이 아닙니다");
    expect(text()).toContain("취득 당시 주택공시가격이 이미 고시되어 있습니다");
  });
});

const CHECK_FIELD = '[data-field="phdAssistBuildingStdBy164_5"]';
const button = () => screen.getByTestId("phd-fill-button") as HTMLButtonElement;

function FillHarness({ init }: { init: Partial<AssetForm> }) {
  const [asset, setAsset] = useState<AssetForm>(housing(init));
  return <PhdConvertedPriceFill asset={asset} onAssetChange={(p) => setAsset((a) => ({ ...a, ...p }))} transferDate={TD} onFill={noop} />;
}

describe("A3 §164⑤ 준용 확인란 (Q-4 b)", () => {
  it.each([
    ["국세청 고시 공동주택 1991 취득 · 1992 최초 고시", { ...P1, phdHousingType: "apartment" as const }],
    ["단독주택 2000-12-31 취득 · 2005 최초 공시(취득 시점만 2000년 이전)", { ...P5, acquisitionDate: "2000-12-31", phdHousingType: "individual" as const }],
  ])("%s — 확인란이 보이고, 체크 전에는 버튼이 꺼진 채 사유를 말한다 · 체크하면 켜진다", (_n, init) => {
    const { container } = render(<FillHarness init={init} />);
    expect(container.querySelector(CHECK_FIELD)).not.toBeNull();
    expect(button().disabled).toBe(true);
    expect(screen.getByTestId("phd-fill-reason").textContent).toContain("2000년 이전 시점의 건물 기준시가는 §164⑤를 준용해 산정합니다");
    fireEvent.click(screen.getByText("§164⑤ 준용으로 산정한 금액입니다"));
    expect(button().disabled).toBe(false);
  });
  it("2001년 이후 시점만 있으면(P5) 확인란이 없고 버튼은 바로 켜진다", () => {
    const { container } = render(<FillHarness init={{ ...P5, phdHousingType: "apartment" }} />);
    expect(container.querySelector(CHECK_FIELD)).toBeNull();
    expect(button().disabled).toBe(false);
  });
  it("환산(phd) 모드에는 확인란이 없다 — 3시점 일괄 계산기가 2000년 이전을 준용 산정한다", () => {
    const { container } = render(
      <PreHousingDisclosureSection asset={housing({ ...P1, phdHousingType: "apartment", useEstimatedAcquisition: true, isAppraisalAcquisition: false })} transferDate={TD} onChange={noop} />,
    );
    expect(container.querySelector(CHECK_FIELD)).toBeNull();
  });
  it("공동주택은 §164⑥·⑦ 후단, 단독·다가구는 §164⑦ 후단으로 안내한다", () => {
    render(<PreHousingDisclosureSection mode="assist" asset={housing({ ...P1, phdHousingType: "apartment" })} transferDate={TD} onChange={noop} />);
    expect(text()).toContain("§164⑥·⑦ 후단에 따라 §164⑤를 준용해 산정합니다");
    cleanup();
    render(<PreHousingDisclosureSection mode="assist" asset={housing({ ...P1, phdHousingType: "individual" })} transferDate={TD} onChange={noop} />);
    expect(text()).toContain("§164⑦ 후단에 따라 §164⑤를 준용해 산정합니다");
    expect(text()).not.toContain("§164⑥");
  });
});

function ToggleHarness({ init }: { init: Partial<AssetForm> }) {
  const [asset, setAsset] = useState<AssetForm>(
    housing({ useEstimatedAcquisition: true, isAppraisalAcquisition: false, acquisitionDate: "2003-01-10", standardPriceAtTransfer: "400000000", ...init }),
  );
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));
  return (
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
      onStandardPriceAtAcqChange={(v) => patch({ standardPriceAtAcq: v })}
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
      asset={asset}
      onAssetChange={patch}
    />
  );
}

describe("A4 환산 토글 제목 (Q-2 b)", () => {
  it("공동주택(패널 라디오) → «취득 당시 공동주택가격 미공시 (§164⑥·⑦ 3-시점 계산)»", () => {
    render(<ToggleHarness init={{ phdHousingType: "apartment", usePreHousingDisclosure: true }} />);
    expect(screen.queryAllByText("취득 당시 공동주택가격 미공시 (§164⑥·⑦ 3-시점 계산)").length).toBe(1);
    expect(screen.queryAllByText("취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 계산)").length).toBe(0);
    expect(text()).toContain("취득시/양도시 기준시가는 위 §164⑥·⑦ 3-시점 입력으로부터 자동 도출됩니다.");
  });
  it("단독·다가구 → 종전 제목 그대로", () => {
    render(<ToggleHarness init={{ phdHousingType: "individual", usePreHousingDisclosure: true }} />);
    expect(screen.queryAllByText("취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 계산)").length).toBe(1);
    expect(screen.queryAllByText(/§164⑥/).length).toBe(0);
    expect(text()).toContain("취득시/양도시 기준시가는 위 §164⑦ 3-시점 입력으로부터 자동 도출됩니다.");
  });
});
