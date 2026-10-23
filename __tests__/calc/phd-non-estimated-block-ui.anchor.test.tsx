/**
 * anchor — ⑤ PHD(§164⑦) 토글 노출 = 방식 leaf (`phdAcqMethodEstimated`) · 비환산 «취득시 기준시가» 칸 hint (환산 개별주택가격)
 * 계획서: docs/00-pm/phd-appraisal-dead-end.plan.md §5.1(⑤ 토글 노출을 같은 leaf) · §7.2(hint 한 줄) · §11 Q-7(자동 ON effect 는 그대로)
 *
 * 토글 카드 제목 «취득 당시 개별주택가격 미공시 (§164⑦ 3-시점 계산)» 는 공용 ToggleCard 라 data-testid 가 전달되지 않는다 → 제목 텍스트로 센다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const TD = "2026-03-01";
const TOGGLE = /취득 당시 개별주택가격 미공시/;
const NON_PRIMARY_NOTICE = /첫 자산에서만/;
const HINT = /환산 개별주택가격\(부수토지 포함 총액\)/;
const METHOD = {
  actual: { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false },
  est: { useEstimatedAcquisition: true, isAppraisalAcquisition: false, isSalesCaseAcquisition: false },
  app: { useEstimatedAcquisition: false, isAppraisalAcquisition: true, isSalesCaseAcquisition: false },
  sales: { useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: true },
} as const;

function Harness({ init, nonPrimary = false }: { init: Partial<AssetForm>; nonPrimary?: boolean }) {
  const [asset, setAsset] = useState<AssetForm>({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-01-10",
    addressJibun: "서울 테스트동 1",
    fixedAcquisitionPrice: "300000000",
    standardPriceAtAcq: "200000000",
    standardPriceAtTransfer: "400000000",
    ...init,
  } as AssetForm);
  const patch = (p: Partial<AssetForm>) => setAsset((a) => ({ ...a, ...p }));
  return (
    <>
    <span data-testid="state-probe" data-phd={String(asset.usePreHousingDisclosure)} data-phd-first-date={asset.phdFirstDisclosureDate} data-phd-first-price={asset.phdFirstDisclosureHousingPrice} />
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
      isNonPrimaryAsset={nonPrimary}
      asset={asset}
      onAssetChange={patch}
    />
    </>
  );
}

describe("⑤ PHD 토글 노출 — 환산에서만 (방식 leaf)", () => {
  it.each([
    ["환산", "est", true],
    ["실거래가", "actual", false],
    ["감정가액", "app", false],
    ["매매사례가액", "sales", false],
  ] as const)("%s + 플래그 ON → 토글 %s", (_n, key, shown) => {
    render(<Harness init={{ ...METHOD[key], usePreHousingDisclosure: true }} />);
    expect(screen.queryAllByText(TOGGLE).length > 0).toBe(shown);
  });

  it("환산+감정 잔재(우선순위상 감정)는 토글을 숨긴다 — ④⑧과 같은 우선순위 (수정 전: raw 환산 플래그로 노출)", () => {
    render(<Harness init={{ useEstimatedAcquisition: true, isAppraisalAcquisition: true, usePreHousingDisclosure: true }} />);
    expect(screen.queryAllByText(TOGGLE).length).toBe(0);
  });

  it("환산 → 감정 → 환산 왕복: 11칸 값·플래그가 지워지지 않고 환산 복귀 시 토글이 그대로 돌아온다", () => {
    const keep = { usePreHousingDisclosure: true, phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: "100000000" };
    const { unmount } = render(<Harness init={{ ...METHOD.app, ...keep }} />);
    expect(screen.queryAllByText(TOGGLE).length).toBe(0);
    const probe = screen.getByTestId("state-probe"); // 저장값 보존(읽는 쪽 파생)
    expect(probe.dataset.phd).toBe("true");
    expect(probe.dataset.phdFirstDate).toBe("2005-04-30");
    expect(probe.dataset.phdFirstPrice).toBe("100000000");
    unmount();
    render(<Harness init={{ ...METHOD.est, ...keep }} />);
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
  });

  it("별개 취득: 한 파트라도 환산이면 토글 · 두 파트 모두 비환산이면(자산 전체 환산 플래그 잔재여도) 숨김", () => {
    const sep = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2001-05-01", usePreHousingDisclosure: true };
    const a = render(<Harness init={{ ...sep, ...METHOD.actual, landAcqMode: "estimated", buildingAcqMode: "actual" }} />);
    expect(screen.queryAllByText(TOGGLE).length).toBeGreaterThan(0);
    a.unmount();
    const b = render(<Harness init={{ ...sep, ...METHOD.est, landAcqMode: "actual", buildingAcqMode: "appraisal" }} />);
    expect(screen.queryAllByText(TOGGLE).length).toBe(0);
    b.unmount();
  });

  it("자동 ON effect 는 그대로다(Q-7) — 취득일 < 2005-04-29 주택이면 방식과 무관하게 플래그를 켜지만 비환산에서는 토글이 보이지 않는다", () => {
    render(<Harness init={{ ...METHOD.actual, usePreHousingDisclosure: false, acquisitionDate: "2000-03-01" }} />);
    expect(screen.getByTestId("state-probe").dataset.phd).toBe("true");
    expect(screen.queryAllByText(TOGGLE).length).toBe(0);
  });

  it("첫 자산이 아니면 환산에서만 «첫 자산에서만» 안내 — 감정은 안내 없음(종전과 같음)", () => {
    const a = render(<Harness nonPrimary init={{ ...METHOD.est }} />);
    expect(screen.queryAllByText(NON_PRIMARY_NOTICE).length).toBeGreaterThan(0);
    a.unmount();
    render(<Harness nonPrimary init={{ ...METHOD.app, usePreHousingDisclosure: true }} />);
    expect(screen.queryAllByText(NON_PRIMARY_NOTICE).length).toBe(0);
  });
});

describe("비환산 «취득시 기준시가» 칸 hint — §164⑦ 환산 개별주택가격 한 줄", () => {
  it("감정가액: hint 에 «소득세법 시행령 §164⑦ … 환산 개별주택가격(부수토지 포함 총액)»", () => {
    render(<Harness init={{ ...METHOD.app }} />);
    expect(screen.queryAllByText(HINT).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("소득세법 시행령 §164⑦ 산식으로 계산한 환산 개별주택가격");
    expect(document.body.textContent).not.toContain("추정");
  });

  it("매매사례가액: 같은 hint", () => {
    render(<Harness init={{ ...METHOD.sales }} />);
    expect(screen.queryAllByText(HINT).length).toBeGreaterThan(0);
  });

  it("실거래가(주택 단일 취득): 취득시 기준시가 칸 자체가 열리지 않으므로 hint 도 없다 — 칸이 열리는 경우(안분 필요)는 같은 hint 를 붙인다(StdPriceSection)", () => {
    render(<Harness init={{ ...METHOD.actual }} />);
    expect(screen.queryAllByText(/취득시 기준시가 \(원\)/).length).toBe(0);
    expect(screen.queryAllByText(HINT).length).toBe(0);
  });

  it("실거래가 + 토지·건물 분리 입력(취득일 같음, 파트 가액 미입력): 취득시 기준시가 칸이 열려 같은 hint 가 붙는다 — PHD 플래그 잔재여도 «3-시점 입력으로 자동 도출» 문구 대신 칸이 보인다", () => {
    render(<Harness init={{ ...METHOD.actual, hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2003-01-10", usePreHousingDisclosure: true }} />);
    expect(screen.queryAllByText(HINT).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("3-시점 입력으로부터 자동 도출");
  });

  it("환산: 이 hint 를 붙이지 않는다(PHD 3-시점 입력이 대신)", () => {
    render(<Harness init={{ ...METHOD.est }} />);
    expect(screen.queryAllByText(HINT).length).toBe(0);
  });

  it("비주택(감정·토지): hint 없음", () => {
    render(<Harness init={{ ...METHOD.app, assetKind: "land" }} />);
    expect(screen.queryAllByText(HINT).length).toBe(0);
  });
});
