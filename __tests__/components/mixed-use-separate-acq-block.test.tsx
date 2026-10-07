/**
 * anchor: 겸용 별개 취득 파트 블록(B1) ⑤ — `MixedUseSeparateAcqBlock` + `CompanionAcqPurchaseBlock` 연동.
 *
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.ui.design.md` §2·§3.3·§6.
 * 불변식
 *  · 후보(날짜 ∧ 매매 ∧ chip)일 때만 토글이 뜬다 · 파트 모델일 때만 파트 블록이 뜨고 상단 축 A(총액 라디오·금액 칸)가 숨는다.
 *  · 모든 전환은 **한 키만** 쓴다(모델 토글·파트 라디오·계약액 토글) — 왕복해도 다른 값이 바뀌지 않는다.
 *  · 파트 4종 모드 × 입력칸 노출, 계약액은 건물 실거래가 한정(감정·매매사례는 비율 안내만, 환산은 없음).
 *  · 미노출 단언에는 긍정 단언이 짝으로 있다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MixedUseSeparateAcqBlock } from "@/components/calc/transfer/mixed-use/MixedUseSeparateAcqBlock";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "purchase",
    hasSeperateLandAcquisitionDate: true,
    landAcquisitionDate: "2005-06-10",
    acquisitionDate: "2010-03-15",
    mixedAcqPerPartMode: true,
    ...over,
  } as AssetForm;
}

function Harness({ init, onPatch }: { init: AssetForm; onPatch?: (p: Partial<AssetForm>) => void }) {
  const [a, setA] = useState<AssetForm>(init);
  return (
    <MixedUseSeparateAcqBlock
      asset={a}
      onChange={(p) => {
        onPatch?.(p);
        setA((prev) => ({ ...prev, ...p }));
      }}
    />
  );
}
const tid = (id: string) => screen.queryAllByTestId(id);

describe("노출 — 후보 ∧ 토글", () => {
  it("후보 ∧ 토글 ON → 토글(체크) + 파트 블록 + 양 파트 라디오 4종씩", () => {
    render(<Harness init={asset()} />);
    expect(tid("mixed-per-part-toggle")).toHaveLength(1);
    expect(tid("mixed-sep-acq-block")).toHaveLength(1);
    expect(tid("mixed-total-model-note")).toHaveLength(0);
    for (const part of ["land", "building"] as const) {
      expect(tid(`mixed-part-acq-mode-${part}`)).toHaveLength(1);
      for (const m of ["actual", "estimated", "appraisal", "salesCase"]) expect(tid(`mixed-part-acq-${part}-${m}`)).toHaveLength(1);
    }
    expect((screen.getByTestId("mixed-part-acq-land-actual") as HTMLInputElement).checked).toBe(true);
  });
  it("후보 ∧ 토글 OFF(구 이력 기본) → 토글 + 총액 모델 안내만, 파트 블록 없음", () => {
    render(<Harness init={asset({ mixedAcqPerPartMode: false })} />);
    expect(tid("mixed-per-part-toggle")).toHaveLength(1);
    expect(tid("mixed-total-model-note")).toHaveLength(1);
    expect(tid("mixed-sep-acq-block")).toHaveLength(0);
  });
  it("부정 짝 — 같은 날 · chip OFF · 비매매 · 겸용 아님이면 아무것도 렌더하지 않는다", () => {
    for (const over of [
      { landAcquisitionDate: "2010-03-15" },
      { hasSeperateLandAcquisitionDate: false },
      { acquisitionCause: "inheritance" as const },
      { isMixedUseHouse: false },
    ]) {
      const { container, unmount } = render(<Harness init={asset(over)} />);
      expect(container.innerHTML, JSON.stringify(over)).toBe("");
      unmount();
    }
  });
});

describe("전환은 한 키만 쓴다 — 왕복 무변화", () => {
  it("모델 토글 ON→OFF→ON: patch는 {mixedAcqPerPartMode} 한 키, 파트 값·모드는 그대로", () => {
    const patches: Array<Partial<AssetForm>> = [];
    render(
      <Harness
        init={asset({ landAcqMode: "appraisal", landAcquisitionPrice: "500,000,000", buildingAcqMode: "salesCase", buildingSalesCaseValue: "350,000,000", fixedAcquisitionPrice: "700,000,000" })}
        onPatch={(p) => patches.push(p)}
      />,
    );
    const toggle = () => screen.getByTestId("mixed-per-part-toggle").querySelector('[role="switch"]') as HTMLElement;
    fireEvent.click(toggle());
    expect(tid("mixed-sep-acq-block")).toHaveLength(0);
    fireEvent.click(toggle());
    expect(patches).toEqual([{ mixedAcqPerPartMode: false }, { mixedAcqPerPartMode: true }]);
    // 복원 — 파트 값·모드가 그대로 화면에 돌아온다
    expect((screen.getByTestId("mixed-part-acq-land-appraisal") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("mixed-part-acq-building-salesCase") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("mixed-split-land-appraisal-value") as HTMLInputElement).value).toMatch(/500,?000,?000/);
    expect((screen.getByTestId("mixed-split-building-salescase-value") as HTMLInputElement).value).toMatch(/350,?000,?000/);
  });
  it("파트 라디오: 변경은 {landAcqMode}/{buildingAcqMode} 한 키(레거시 플래그 미기록)", () => {
    const patches: Array<Partial<AssetForm>> = [];
    render(<Harness init={asset()} onPatch={(p) => patches.push(p)} />);
    fireEvent.click(screen.getByTestId("mixed-part-acq-land-estimated"));
    fireEvent.click(screen.getByTestId("mixed-part-acq-building-appraisal"));
    expect(patches).toEqual([{ landAcqMode: "estimated" }, { buildingAcqMode: "appraisal" }]);
  });
});

describe("모드 × 입력칸 (4×2)", () => {
  const FIELD: Record<PartAcqMode, (part: "land" | "building") => string> = {
    actual: (p) => `mixed-split-${p}-acq-price`,
    appraisal: (p) => `mixed-split-${p}-appraisal-value`,
    salesCase: (p) => `mixed-split-${p}-salescase-value`,
    estimated: (p) => `mixed-split-${p}-estimated-note`,
  };
  for (const part of ["land", "building"] as const)
    for (const mode of ["actual", "estimated", "appraisal", "salesCase"] as PartAcqMode[]) {
      it(`${part} ${mode} → 그 모드의 칸만 렌더`, () => {
        render(<Harness init={asset(part === "land" ? { landAcqMode: mode } : { buildingAcqMode: mode })} />);
        expect(tid(FIELD[mode](part)), "긍정").toHaveLength(1);
        for (const other of ["actual", "estimated", "appraisal", "salesCase"] as PartAcqMode[])
          if (other !== mode) expect(tid(FIELD[other](part)), `${other}는 미렌더`).toHaveLength(0);
      });
    }
  it("환산 안내는 겸용 문구 — 「위 『…취득시 기준시가』 카드」를 가리키지 않는다(겸용에는 그 카드가 없다)", () => {
    render(<Harness init={asset({ landAcqMode: "estimated", buildingAcqMode: "estimated" })} />);
    const land = screen.getByTestId("mixed-split-land-estimated-note").textContent ?? "";
    const building = screen.getByTestId("mixed-split-building-estimated-note").textContent ?? "";
    expect(land).toMatch(/토지 취득일/);
    expect(building).toMatch(/건물 취득일/);
    expect(land + building).not.toMatch(/위 「/);
  });
  it("입력칸 data-field = ⑧ 이동 키", () => {
    const { container } = render(<Harness init={asset({ buildingAcqMode: "salesCase" })} />);
    expect(container.querySelector('[data-field="landAcquisitionPrice"]')).not.toBeNull();
    expect(container.querySelector('[data-field="buildingSalesCaseValue"]')).not.toBeNull();
    expect(container.querySelector('[data-field="mixedAcqPerPartMode"]')).not.toBeNull();
  });
});

describe("S-2 건물 용도별 계약액 — 건물 실거래가 한정", () => {
  const sw = (id: string) => screen.getByTestId(id).querySelector('[role="switch"]') as HTMLElement;
  it("건물 실거래가: 토글 OFF → 비율 안내 / ON → 주택건물 계약액 칸 + 파생 줄(총액 − 주택건물)", () => {
    const patches: Array<Partial<AssetForm>> = [];
    render(<Harness init={asset({ buildingAcquisitionPrice: "400,000,000" })} onPatch={(p) => patches.push(p)} />);
    expect(tid("mixed-bldg-contract-toggle")).toHaveLength(1);
    expect(tid("mixed-bldg-ratio-note")).toHaveLength(1);
    expect(tid("mixed-bldg-contract-housing")).toHaveLength(0);
    fireEvent.click(sw("mixed-bldg-contract-toggle"));
    expect(patches).toEqual([{ mixedAcqBuildingContractSplit: true }]);
    expect(tid("mixed-bldg-contract-housing")).toHaveLength(1);
    expect(tid("mixed-bldg-ratio-note")).toHaveLength(0);
    fireEvent.change(screen.getByTestId("mixed-bldg-contract-housing"), { target: { value: "150000000" } });
    expect(screen.getByTestId("mixed-bldg-contract-commercial-derived").textContent).toContain("250,000,000");
    // 파생은 표시 전용 — store에는 계약액 한 키만 쓴다
    expect(patches[patches.length - 1]).toEqual({ mixedAcqHousingBuildingContractPrice: "150000000" });
  });
  it("건물 감정·매매사례: 토글 없음 + 비율 안내만 / 건물 환산: 둘 다 없음 / 실가 복귀 시 토글 상태 복원", () => {
    const over = { mixedAcqBuildingContractSplit: true, mixedAcqHousingBuildingContractPrice: "150,000,000", buildingAcquisitionPrice: "400,000,000" };
    for (const m of ["appraisal", "salesCase"] as const) {
      const { unmount } = render(<Harness init={asset({ ...over, buildingAcqMode: m })} />);
      expect(tid("mixed-bldg-contract-toggle"), `${m} 토글 없음`).toHaveLength(0);
      expect(tid("mixed-bldg-ratio-note"), `${m} 비율 안내`).toHaveLength(1);
      unmount();
    }
    const est = render(<Harness init={asset({ ...over, buildingAcqMode: "estimated" })} />);
    expect(tid("mixed-bldg-contract-toggle")).toHaveLength(0);
    expect(tid("mixed-bldg-ratio-note")).toHaveLength(0);
    est.unmount();
    // 긍정 짝 — 실가면 저장된 토글 ON·값이 그대로 복원된다
    render(<Harness init={asset({ ...over, buildingAcqMode: "actual" })} />);
    expect(tid("mixed-bldg-contract-housing")).toHaveLength(1);
    expect((screen.getByTestId("mixed-bldg-contract-housing") as HTMLInputElement).value).toMatch(/150,?000,?000/);
  });
});

describe("결합 제외 안내 — 블록은 계속 보인다(총액 모델로 조용히 후퇴하지 않는다)", () => {
  it("용도변경·공익수용이면 rose 안내 + 파트 블록 유지, 해소 칸(모델 토글)이 같은 화면에 있다", () => {
    render(<Harness init={asset({ hasPartialUsageChange: true, partialChangeDirection: "house_to_commercial", transferCause: "public_expropriation" })} />);
    expect(tid("mixed-sep-exclusion-note")).toHaveLength(1);
    expect(tid("mixed-sep-exclusion-note-expropriation")).toHaveLength(1);
    expect(tid("mixed-sep-acq-block")).toHaveLength(1);
    expect(tid("mixed-per-part-toggle")).toHaveLength(1);
  });
  it("부정 짝 — 용도변경 플래그 OFF + stale 방향이면 안내 없음", () => {
    render(<Harness init={asset({ hasPartialUsageChange: false, partialChangeDirection: "house_to_commercial" })} />);
    expect(tid("mixed-sep-exclusion-note")).toHaveLength(0);
  });
});

describe("혼합 조합 고지", () => {
  it("감정·매매사례 파트가 있으면 「개산공제만」 · 산정방식이 서로 다르면 해석례 고지 — 실/실에서는 둘 다 없다(짝)", () => {
    const aa = render(<Harness init={asset()} />);
    expect(tid("mixed-deduction-only-notice")).toHaveLength(0);
    expect(tid("mixed-mixed-combo-note")).toHaveLength(0);
    aa.unmount();
    render(<Harness init={asset({ buildingAcqMode: "appraisal" })} />);
    expect(tid("mixed-deduction-only-notice")).toHaveLength(1);
    expect(tid("mixed-mixed-combo-note")).toHaveLength(1);
  });
});

// ── CompanionAcqPurchaseBlock 연동 — 상단 축 A 숨김/복원 ─────────────────────
function PurchaseHarness({ init }: { init: AssetForm }) {
  const [a, setA] = useState<AssetForm>(init);
  const patch = (p: Partial<AssetForm>) => setA((prev) => ({ ...prev, ...p }));
  return (
    <CompanionAcqPurchaseBlock
      acquisitionDate={a.acquisitionDate}
      onAcquisitionDateChange={(v) => patch({ acquisitionDate: v })}
      useEstimatedAcquisition={false}
      onUseEstimatedChange={() => {}}
      fixedAcquisitionPrice={a.fixedAcquisitionPrice ?? ""}
      onFixedAcquisitionPriceChange={(v) => patch({ fixedAcquisitionPrice: v })}
      standardPriceAtAcq={a.standardPriceAtAcq ?? ""}
      onStandardPriceAtAcqChange={(v) => patch({ standardPriceAtAcq: v })}
      standardPriceAtTransfer={a.standardPriceAtTransfer ?? ""}
      onStandardPriceAtTransferChange={(v) => patch({ standardPriceAtTransfer: v })}
      assetKind={a.assetKind}
      transferDate="2026-03-06"
      acquisitionArea={a.acquisitionArea}
      onAcquisitionAreaChange={(v) => patch({ acquisitionArea: v })}
      hasSeperateLandAcquisitionDate={a.hasSeperateLandAcquisitionDate}
      onHasSeperateLandAcquisitionDateChange={(v) => patch({ hasSeperateLandAcquisitionDate: v })}
      landAcquisitionDate={a.landAcquisitionDate}
      onLandAcquisitionDateChange={(v) => patch({ landAcquisitionDate: v })}
      selfOwns={a.selfOwns ?? "both"}
      onSelfOwnsChange={(v) => patch({ selfOwns: v })}
      landTransferPrice={a.landTransferPrice ?? ""}
      onLandTransferPriceChange={(v) => patch({ landTransferPrice: v })}
      buildingTransferPrice={a.buildingTransferPrice ?? ""}
      onBuildingTransferPriceChange={(v) => patch({ buildingTransferPrice: v })}
      landAcquisitionPrice={a.landAcquisitionPrice ?? ""}
      onLandAcquisitionPriceChange={(v) => patch({ landAcquisitionPrice: v })}
      buildingAcquisitionPrice={a.buildingAcquisitionPrice ?? ""}
      onBuildingAcquisitionPriceChange={(v) => patch({ buildingAcquisitionPrice: v })}
      landStandardPriceAtTransfer={a.landStandardPriceAtTransfer ?? ""}
      onLandStandardPriceAtTransferChange={(v) => patch({ landStandardPriceAtTransfer: v })}
      buildingStandardPriceAtTransfer={a.buildingStandardPriceAtTransfer ?? ""}
      onBuildingStandardPriceAtTransferChange={(v) => patch({ buildingStandardPriceAtTransfer: v })}
      landDirectExpenses={a.landDirectExpenses ?? ""}
      onLandDirectExpensesChange={(v) => patch({ landDirectExpenses: v })}
      buildingDirectExpenses={a.buildingDirectExpenses ?? ""}
      onBuildingDirectExpensesChange={(v) => patch({ buildingDirectExpenses: v })}
      asset={a}
      onAssetChange={patch}
    />
  );
}

describe("CompanionAcqPurchaseBlock 연동 — 상단 축 A는 파트 모델에서만 숨는다", () => {
  it("파트 모델 ON: 파트 블록 · 상단 라디오/총액 칸 없음 · 비-겸용 split 축 B(part-acq-mode-*) 없음", () => {
    render(<PurchaseHarness init={asset()} />);
    expect(tid("mixed-sep-acq-block")).toHaveLength(1);
    expect(tid("mixed-asset-acq-mode")).toHaveLength(0);
    expect(tid("fixed-acquisition-price")).toHaveLength(0);
    expect(tid("part-acq-mode-land")).toHaveLength(0);
  });
  it("토글 OFF(총액 모델): 상단 라디오·총액 칸 복원 · 토글 유지 · 파트 블록 없음 (왕복)", () => {
    render(<PurchaseHarness init={asset()} />);
    fireEvent.click(screen.getByTestId("mixed-per-part-toggle").querySelector('[role="switch"]') as HTMLElement);
    expect(tid("mixed-per-part-toggle")).toHaveLength(1);
    expect(tid("mixed-sep-acq-block")).toHaveLength(0);
    expect(tid("mixed-asset-acq-mode")).toHaveLength(1);
    expect(tid("fixed-acquisition-price")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("mixed-per-part-toggle").querySelector('[role="switch"]') as HTMLElement);
    expect(tid("mixed-sep-acq-block")).toHaveLength(1);
    expect(tid("fixed-acquisition-price")).toHaveLength(0);
  });
  it("같은 날 취득: 토글 없음 · 총액 모델 그대로 (부정 짝)", () => {
    render(<PurchaseHarness init={asset({ landAcquisitionDate: "2010-03-15" })} />);
    expect(tid("mixed-per-part-toggle")).toHaveLength(0);
    expect(tid("mixed-sep-acq-block")).toHaveLength(0);
    expect(tid("mixed-asset-acq-mode")).toHaveLength(1);
    expect(tid("fixed-acquisition-price")).toHaveLength(1);
  });
  it("날짜 안내(split-acq-date-mixed-note) — 파트 모델이면 「각각 입력합니다」, OFF면 종전 문구(§166⑥ 인용 없음)", () => {
    const on = render(<PurchaseHarness init={asset()} />);
    expect(screen.getByTestId("split-acq-date-mixed-note").textContent).toMatch(/취득가액을.*각각 입력합니다/);
    on.unmount();
    render(<PurchaseHarness init={asset({ mixedAcqPerPartMode: false })} />);
    const off = screen.getByTestId("split-acq-date-mixed-note").textContent ?? "";
    expect(off).toMatch(/취득일을.*각각/);
    expect(off).not.toMatch(/§166/);
  });
});

