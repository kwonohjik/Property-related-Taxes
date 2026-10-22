/**
 * 의제취득일 전 상속·증여 재개발 종전자산 — ③ = §166③ 화면 표시 (계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12).
 *
 * - 입력: `PreDeemedInputs`가 재개발이면 §176조의2④ 기준시가 2칸을 숨기고 §166③ 안내를 띄운다(그 칸은 엔진이 쓰지 않는다).
 * - 재개발 블록: pre-deemed면 「평가액 우선」 안내 대신 3자 max 안내(종전 안내는 「환산 미적용」이라 틀렸다).
 * - 결과 카드: `convertedBasis`가 재개발이면 ③ 라벨·근거를 §166③으로.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { InheritedAcquisitionDetailCard } from "@/components/calc/results/transfer/InheritedAcquisitionDetailCard";
import { InheritedHouseValuationDetailCard } from "@/components/calc/results/transfer/InheritedHouseValuationDetailCard";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { case44RedevelopmentInfo } from "@/__tests__/tax-engine/transfer-tax/redevelopment/_helpers";
import { PreDeemedInputs } from "@/components/calc/transfer/inheritance/PreDeemedInputs";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

function inhAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    redevSubject: "apt",
    acquisitionCause: "inheritance",
    acquisitionDate: "1980-01-01",
    inheritanceStartDate: "1980-01-01",
    inheritanceAssetKind: "house_individual",
    publishedValueAtInheritance: "100000000",
    redevApprovalDate: "2009-10-23",
    useEstimatedAcquisition: true,
    ...over,
  } as AssetForm;
}

describe("입력 — PreDeemedInputs", () => {
  it("재개발: §176조의2④ 기준시가 2칸을 숨기고 §166③ 안내", () => {
    render(<PreDeemedInputs asset={inhAsset()} onChange={vi.fn()} transferDate="2026-02-16" />);
    expect(screen.queryAllByText("양도시 기준시가")).toEqual([]);
    expect(screen.queryByText("의제취득일(1985.1.1.) 시점 기준시가")).toBeNull();
    expect(screen.getByTestId("pre-deemed-redev-166-3-note").textContent).toMatch(/§166③ 환산취득가액/);
    expect(screen.getByText(/① 상증법 평가액·② 취득당시 기준시가·③ 환산취득가액 중 많은 금액/)).toBeTruthy();
  });

  it("승계조합원(리뷰 FAIL-2): §166③ 대상이 아니라 기준시가 2칸이 그대로 보인다", () => {
    render(<PreDeemedInputs asset={inhAsset({ redevIsSuccessorMember: "yes" })} onChange={vi.fn()} transferDate="2026-02-16" />);
    expect(screen.getAllByText("양도시 기준시가").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("pre-deemed-redev-166-3-note")).toBeNull();
  });

  it("주택(대조군): 기준시가 2칸이 그대로 보인다", () => {
    render(<PreDeemedInputs asset={inhAsset({ assetKind: "housing" })} onChange={vi.fn()} transferDate="2026-02-16" />);
    expect(screen.getAllByText("양도시 기준시가").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("pre-deemed-redev-166-3-note")).toBeNull();
  });
});

describe("재개발 블록 — pre-deemed 3자 max 안내", () => {
  const renderBlock = (asset: AssetForm) =>
    render(<RedevelopmentBlock asset={asset} onChange={vi.fn()} isOneHouseSingle={false} />);

  it("상속 1980: 「평가액 우선」이 아니라 3자 max 안내", () => {
    renderBlock(inhAsset());
    expect(screen.getByTestId("redev-pre-deemed-166-3-notice").textContent).toMatch(/세 금액 중 큰 금액/);
    expect(screen.queryByText(/이 섹션보다 우선 적용됩니다/)).toBeNull();
  });

  it("상속 2005(post-deemed · 대조군): 종전 「평가액 우선」 안내 유지", () => {
    renderBlock(inhAsset({ acquisitionDate: "2005-04-09", inheritanceStartDate: "2005-04-09" }));
    expect(screen.queryByTestId("redev-pre-deemed-166-3-notice")).toBeNull();
    expect(screen.getByText(/이 섹션보다 우선 적용됩니다/)).toBeTruthy();
  });
});

describe("결과 카드 — ③ 라벨", () => {
  const detail = (basis?: "redevelopment_166_3") =>
    ({
      acquisitionPrice: 141_221_534,
      method: "pre_deemed_max",
      legalBasis: "테스트",
      formula: "",
      preDeemedBreakdown: {
        reportedAmount: 100_000_000,
        sec164Amount: null,
        convertedAmount: 141_221_534,
        selectedMethod: "converted",
        ...(basis && { convertedBasis: basis }),
      },
    }) as never;

  it("재개발: ③ 「재개발 환산취득가액 (소령 §166③)」 선택 · 근거 §166③", () => {
    render(<InheritedAcquisitionDetailCard detail={detail("redevelopment_166_3")} />);
    const row = screen.getByText(/③ 재개발 환산취득가액 \(소령 §166③\)/).closest("span") as HTMLElement;
    expect(within(row).getByText("선택")).toBeTruthy();
    expect(screen.getByText("①②③ 중 큰 금액 — 재개발 환산취득가액 적용 (소령 §166③)")).toBeTruthy();
    expect(screen.queryByText(/§176조의2④/)).toBeNull();
  });

  it("대조군: convertedBasis 없으면 종전 §176조의2④", () => {
    render(<InheritedAcquisitionDetailCard detail={detail()} />);
    expect(screen.getByText(/①②③ 중 큰 금액 — 환산취득가액 적용 \(소령 §163⑫ → §176조의2④\)/)).toBeTruthy();
  });
});

/** 리뷰 FAIL-1(2026-10-22): 주택 3-시점 카드가 재개발 ③(§166③) 채택을 「§176조의2④ 환산 적용」으로 표시하던 것. */
describe("주택 3-시점 카드 — 재개발 ③ 채택", () => {
  it("엔진 결과 그대로: 「적용」이 아니라 「미적용 — 재개발 종전자산은 §166③ 환산취득가액 적용」", () => {
    const input = baseTransferInput({
      propertyType: "redevelopment_apt",
      acquisitionCause: "inheritance",
      transferPrice: 525_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("1980-01-01"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      redevelopment: case44RedevelopmentInfo(),
      inheritedHouseValuation: {
        inheritanceDate: new Date("1980-01-01"),
        transferDate: new Date("2026-02-16"),
        landArea: 100,
        landPricePerSqmAtTransfer: 3_000_000,
        landPricePerSqmAtFirstDisclosure: 1_000_000,
        housePriceAtTransfer: 400_000_000,
        housePriceAtFirstDisclosure: 150_000_000,
        buildingStdPriceAtFirstDisclosure: 30_000_000,
        buildingStdPriceAtInheritance: 20_000_000,
        landPricePerSqmAtInheritance: 500_000,
        housePriceAtInheritanceOverride: 100_000_000,
      },
      inheritedAcquisition: { inheritanceDate: new Date("1980-01-01"), assetKind: "house_individual" },
    }) as TransferTaxInput;
    const r = calculateTransferTax(input, makeMockRates());
    expect(r.inheritedAcquisitionDetail!.preDeemedBreakdown!.convertedBasis).toBe("redevelopment_166_3");
    render(
      <InheritedHouseValuationDetailCard
        detail={r.inheritedHouseValuationDetail!}
        acquisitionDetail={r.inheritedAcquisitionDetail}
      />,
    );
    const box = screen.getByTestId("inh-house-converted-box");
    expect(within(box).getByText("미적용 — 재개발 종전자산은 §166③ 환산취득가액 적용")).toBeTruthy();
    expect(within(box).queryByText("적용")).toBeNull();
  });
});
