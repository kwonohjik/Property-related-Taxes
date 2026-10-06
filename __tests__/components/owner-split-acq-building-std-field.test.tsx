/**
 * S3-1 — 취득시 건물 기준시가(나목) 입력칸 `AcqBuildingStdField`의 노출·배타·입력, 양도시 개별주택가격 칸, 결과 비례 산식.
 *
 * 노출 술어는 `ownerSplitHousingNeedsBuildingStd`(엔진 leaf `requiresHousingBuildingStdAtAcq`의 AssetForm 어댑터)
 * 하나다 — ⑧ 필수·④ 전송·⑫ 요구·엔진 throw와 같은 값(격자 패리티: `__tests__/calc/owner-split-building-std-leaf-parity.test.ts`).
 * 여기서는 화면이 그 술어를 **그대로** 따르는지(칸이 열린 상태에서만 요구 — 막다른 길 없음)와 testid 분리 불변식을 고정한다.
 *
 * ⚠️ 카드 wrapper testid(`acq-building-std-card`)로 판정한다 — 내부 input으로 대리 판정하면 카드가 남고 칸만 빠졌을 때 거짓 통과한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { NonPurchaseSplitInputsBlock } from "@/components/calc/transfer/NonPurchaseSplitInputsBlock";
import { TransferStdPriceCard } from "@/components/calc/transfer/TransferStdPriceCards";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

type Init = Partial<AssetForm> & { useEstimatedAcquisition?: boolean };

function Harness({ init = {}, onAsset }: { init?: Init; onAsset?: (a: AssetForm) => void }) {
  const { useEstimatedAcquisition = false, ...assetInit } = init;
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2025-08-29",
    landAcquisitionDate: "2015-01-08",
    hasSeperateLandAcquisitionDate: true,
    addressJibun: "서울특별시 강남구 삼성동 100",
    ...assetInit,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) =>
    setAsset((a) => {
      const next = { ...a, ...p };
      onAsset?.(next);
      return next;
    });
  return (
    <CompanionAcqPurchaseBlock
      acquisitionDate={asset.acquisitionDate}
      onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
      useEstimatedAcquisition={useEstimatedAcquisition}
      onUseEstimatedChange={() => {}}
      fixedAcquisitionPrice={asset.fixedAcquisitionPrice ?? ""}
      onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
      standardPriceAtAcq={asset.standardPriceAtAcq ?? ""}
      onStandardPriceAtAcqChange={(v) => patch({ standardPriceAtAcq: v })}
      standardPriceAtTransfer={asset.standardPriceAtTransfer ?? ""}
      onStandardPriceAtTransferChange={(v) => patch({ standardPriceAtTransfer: v })}
      standardPricePerSqmAtAcq={asset.standardPricePerSqmAtAcq ?? ""}
      onStandardPricePerSqmAtAcqChange={(v) => patch({ standardPricePerSqmAtAcq: v })}
      assetKind={asset.assetKind}
      transferDate="2026-03-06"
      jibun={asset.addressJibun}
      acquisitionArea={asset.acquisitionArea}
      onAcquisitionAreaChange={(v) => patch({ acquisitionArea: v })}
      hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
      onHasSeperateLandAcquisitionDateChange={(v) => patch({ hasSeperateLandAcquisitionDate: v })}
      landAcquisitionDate={asset.landAcquisitionDate}
      onLandAcquisitionDateChange={(v) => patch({ landAcquisitionDate: v })}
      selfOwns={asset.selfOwns ?? "both"}
      onSelfOwnsChange={(v) => patch({ selfOwns: v })}
      landTransferPrice={asset.landTransferPrice ?? ""}
      onLandTransferPriceChange={(v) => patch({ landTransferPrice: v })}
      buildingTransferPrice={asset.buildingTransferPrice ?? ""}
      onBuildingTransferPriceChange={(v) => patch({ buildingTransferPrice: v })}
      landAcquisitionPrice={asset.landAcquisitionPrice ?? ""}
      onLandAcquisitionPriceChange={(v) => patch({ landAcquisitionPrice: v })}
      buildingAcquisitionPrice={asset.buildingAcquisitionPrice ?? ""}
      onBuildingAcquisitionPriceChange={(v) => patch({ buildingAcquisitionPrice: v })}
      landStandardPriceAtTransfer={asset.landStandardPriceAtTransfer ?? ""}
      onLandStandardPriceAtTransferChange={(v) => patch({ landStandardPriceAtTransfer: v })}
      buildingStandardPriceAtTransfer={asset.buildingStandardPriceAtTransfer ?? ""}
      onBuildingStandardPriceAtTransferChange={(v) => patch({ buildingStandardPriceAtTransfer: v })}
      landDirectExpenses={asset.landDirectExpenses ?? ""}
      onLandDirectExpensesChange={(v) => patch({ landDirectExpenses: v })}
      buildingDirectExpenses={asset.buildingDirectExpenses ?? ""}
      onBuildingDirectExpensesChange={(v) => patch({ buildingDirectExpenses: v })}
      asset={asset}
      onAssetChange={patch}
    />
  );
}


const nCard = () => screen.queryAllByTestId("acq-building-std-card");
const sepCard = () => screen.queryAllByTestId("split-building-std-acq-card");

/** 소유자 분리(건물만 본인) · 같은 취득일 · 실거래가 + 두 파트 비움 — 비율 안분이 유일한 도출 수단 */
const OWNER: Init = {
  landAcquisitionDate: "2025-08-29",
  acquisitionDate: "2025-08-29",
  selfOwns: "building_only",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
};

describe("AcqBuildingStdField — 매매 경로 (CompanionAcqStdPriceSection)", () => {
  it("소유자 분리 + 비율 안분이면 나목 카드가 열리고 별개 전용 카드는 0 — 둘의 합 ≤ 1", () => {
    render(<Harness init={OWNER} />);
    expect(nCard()).toHaveLength(1);
    expect(sepCard()).toHaveLength(0);
    expect(nCard().length + sepCard().length).toBeLessThanOrEqual(1);
  });

  it("라벨에 필수(*) 표시 · 입력하면 폼 필드 buildingStandardPriceAtAcq에 기록된다", () => {
    let last: AssetForm | undefined;
    render(<Harness init={OWNER} onAsset={(a) => (last = a)} />);
    const card = nCard()[0];
    expect(card.textContent).toContain("취득시 건물 기준시가");
    expect(card.querySelector('[data-field="buildingStandardPriceAtAcq"]')).not.toBeNull();
    expect(card.textContent).toContain("*");
    fireEvent.change(screen.getByTestId("acq-building-std"), { target: { value: "360,000,000" } });
    expect(last?.buildingStandardPriceAtAcq).toMatch(/360/);
  });

  it("건물 기준시가 계산 모달 런처가 있다 — 카드 아래 `<Button variant=modalLauncher>`", () => {
    render(<Harness init={OWNER} />);
    expect(screen.getAllByRole("button", { name: "취득시 건물 기준시가 계산" })).toHaveLength(1);
  });

  it("hint는 비례 안분을 설명한다 — 뺄셈(총액 − 토지분) 서술이 없다", () => {
    render(<Harness init={OWNER} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("토지 기준시가 : 건물 기준시가 비율로 나누는 데 씁니다");
    expect(text).toContain("개별주택가격(부수토지 포함)을 아래 토지·건물 기준시가 비율로 토지분·건물분에 나눕니다");
    expect(text).not.toContain("건물분 = 총액 − 토지분");
  });

  it("비소유 파트(토지)에 stale 가격만 남고 소유 파트(건물)가 비었으면 ④가 그 값을 안 보내 비율 안분이 필요하다 — 카드가 열린다(칸 없는 ⑫ 400 방지)", () => {
    render(<Harness init={{ ...OWNER, landAcquisitionPrice: "200000000" }} />);
    expect(nCard()).toHaveLength(1);
  });

  it("부정 짝: 본인 파트 취득가액을 직접 입력하면(비율 불요) 카드가 닫힌다", () => {
    render(<Harness init={{ ...OWNER, buildingAcquisitionPrice: "100000000" }} />);
    expect(nCard()).toHaveLength(0);
  });

  it("부정 짝: 소유자 분리가 아니면 닫힌다(같은 날짜 + 「취득일 다름」만)", () => {
    render(<Harness init={{ ...OWNER, selfOwns: "both" }} />);
    expect(nCard()).toHaveLength(0);
  });

  it("값은 지우지 않는다 — 숨겨도 입력값이 폼에 남는다", () => {
    let last: AssetForm | undefined;
    render(<Harness init={{ ...OWNER, buildingStandardPriceAtAcq: "360000000", selfOwns: "both" }} onAsset={(a) => (last = a)} />);
    expect(nCard()).toHaveLength(0);
    expect(last).toBeUndefined(); // 숨김은 patch를 만들지 않는다
  });
});

describe("AcqBuildingStdField — 별개 취득과의 testid 분리", () => {
  it("별개 취득(날짜 상이) + 건물 환산: 별개 전용 카드 1 · 비례 카드 0 (같은 컴포넌트, 다른 testid)", () => {
    render(
      <Harness
        init={{
          acquisitionDate: "2025-08-29",
          landAcquisitionDate: "2015-01-08",
          selfOwns: "both",
          landAcqMode: "actual",
          buildingAcqMode: "estimated",
          landAcquisitionPrice: "100000000",
        }}
      />,
    );
    expect(sepCard()).toHaveLength(1);
    expect(nCard()).toHaveLength(0);
    // 별개 경로 DOM 계약 유지 — 입력 testid·라벨
    expect(screen.getAllByTestId("split-building-std-acq")).toHaveLength(1);
    expect(screen.getAllByText("취득시 건물기준시가").length).toBeGreaterThan(0);
  });
});

describe("AcqBuildingStdField — 비-매매 경로 (NonPurchaseSplitInputsBlock)", () => {
  const inherited = (over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "inheritance",
      acquisitionDate: "2020-03-15",
      selfOwns: "building_only",
      hasSeperateLandAcquisitionDate: false,
      ...over,
    }) as AssetForm;

  it("상속 + 소유자 분리: non-purchase-split-inputs 안에 나목 카드가 열린다", () => {
    render(<NonPurchaseSplitInputsBlock asset={inherited()} onChange={() => {}} transferDate="2026-03-06" />);
    const block = screen.getByTestId("non-purchase-split-inputs");
    expect(block.querySelectorAll('[data-testid="acq-building-std-card"]')).toHaveLength(1);
  });

  it("부정 짝: 상속이어도 본인 파트가 환산이 아니고 비율도 안 쓰는 경우는 해당 없다 — selfOwns 없음이면 블록 자체가 없다", () => {
    const { container } = render(
      <NonPurchaseSplitInputsBlock asset={inherited({ selfOwns: "both" })} onChange={() => {}} transferDate="2026-03-06" />,
    );
    expect(container.querySelector('[data-testid="non-purchase-split-inputs"]')).toBeNull();
    expect(nCard()).toHaveLength(0);
  });
});

describe("양도시 개별주택가격 칸 (D-1 ⓑ) — 축 A 카드", () => {
  const ownerEst = (over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2018-03-02",
      landAcquisitionDate: "2018-03-02",
      hasSeperateLandAcquisitionDate: true,
      selfOwns: "building_only",
      landAcqMode: "actual",
      buildingAcqMode: "estimated",
      useEstimatedAcquisition: false,
      ...over,
    }) as AssetForm;
  const housingTotalCard = () => screen.queryAllByTestId("split-housing-std-transfer-card");

  it("소유자 분리 + 환산 파트(자산 환산 토글 OFF): 열린다 · standardPriceAtTransfer 앵커", () => {
    render(<TransferStdPriceCard asset={ownerEst()} onChange={() => {}} transferDate="2026-06-30" />);
    expect(housingTotalCard()).toHaveLength(1);
    expect(housingTotalCard()[0].querySelector('[data-field="standardPriceAtTransfer"]')).not.toBeNull();
  });

  it("부정 짝: 환산 파트가 없으면(실거래가) 닫힌다", () => {
    render(<TransferStdPriceCard asset={ownerEst({ buildingAcqMode: "actual" })} onChange={() => {}} transferDate="2026-06-30" />);
    expect(housingTotalCard()).toHaveLength(0);
  });

  it("부정 짝: 매매 + 자산 환산 토글 ON이면 취득 블록의 「양도시 기준시가」 칸이 정본이라 중복 노출하지 않는다", () => {
    render(<TransferStdPriceCard asset={ownerEst({ useEstimatedAcquisition: true })} onChange={() => {}} transferDate="2026-06-30" />);
    expect(housingTotalCard()).toHaveLength(0);
  });

  it("비-매매(상속)에는 그 칸이 없으므로 환산 토글이 켜져 있어도 축 A가 연다", () => {
    render(
      <TransferStdPriceCard
        asset={ownerEst({ acquisitionCause: "inheritance", useEstimatedAcquisition: true })}
        onChange={() => {}}
        transferDate="2026-06-30"
      />,
    );
    expect(housingTotalCard()).toHaveLength(1);
  });
});

describe("결과 — 개별주택가격 분할(비례) 표시 (`splitDetail.stdSplit`)", () => {
  const part = {
    transferPrice: 480_000_000,
    acquisitionPrice: 280_000_000,
    directExpenses: 0,
    appraisalDeduction: 0,
    gain: 200_000_000,
    holdingYears: 20,
    longTermRate: 0.3,
    longTermDeduction: 0,
  };
  const detail = (over: Record<string, unknown> = {}) =>
    ({
      land: part,
      building: { ...part, transferPrice: 720_000_000, stdPriceDerivedFromTotal: true },
      note: "",
      selfOwns: "both",
      ...over,
    }) as never;

  it("stdSplit이 있으면 엔진 값 그대로 한국어 풀어쓰기 산식으로 표시한다(재계산 없음)", () => {
    render(
      <SplitGainDetailSection
        splitDetail={detail({
          stdSplit: { housingTotal: 480_000_000, landStd: 240_000_000, buildingStd: 360_000_000, landBasis: 192_000_000, buildingBasis: 288_000_000 },
        })}
        assetKind="housing"
      />,
    );
    const block = screen.getByTestId("split-std-split-detail");
    expect(block.textContent).toContain("개별주택가격 분할");
    expect(block.textContent).toContain("토지분 기준시가 = 개별주택가격 480,000,000");
    expect(block.textContent).toContain("토지 기준시가 240,000,000 + 건물 기준시가 360,000,000");
    expect(screen.getByTestId("split-std-split-land").textContent).toBe("192,000,000");
    expect(screen.getByTestId("split-std-split-building").textContent).toBe("288,000,000");
    expect(block.textContent).toContain("건물분 기준시가 = 개별주택가격 480,000,000 − 토지분 192,000,000");
    // 종전 뺄셈 안내는 같이 뜨지 않는다
    expect(document.body.textContent).not.toContain("에서 토지분을 분리한 값입니다");
  });

  it("stdSplit이 없는 결과(종전 저장 이력의 뺄셈 스냅샷)는 종전 안내 문구를 유지한다", () => {
    render(<SplitGainDetailSection splitDetail={detail()} assetKind="housing" />);
    expect(screen.queryByTestId("split-std-split-detail")).toBeNull();
    expect(document.body.textContent).toContain("개별주택가격(부수토지 포함)에서 토지분을 분리한 값입니다");
  });

  it("일반건물은 stdSplit이 없고 일반건물 한시 후퇴 안내가 그대로다(E-3)", () => {
    render(<SplitGainDetailSection splitDetail={detail()} assetKind="building" />);
    expect(screen.queryByTestId("split-std-split-detail")).toBeNull();
    expect(document.body.textContent).toContain("건물 취득시 기준시가를 직접 입력하지 않아 결합 총액에서 안분한 값입니다");
  });
});
