/**
 * anchor — 부담부증여 × 재개발·재건축 완공 아파트(원조합원) × 「매매사례가액·감정가액」: 쓸 수 없다 (소령 §166③④).
 *
 * 종전에는 ⑤가 두 옵션을 열어 두었고 엔진은 오류 없이 계산했다 — 그런데 §166 경로는 그 방식을 **읽지 않아** 취득가액이 실지와 같은 값이었고
 * 필요경비도 개산공제로 바뀌지 않았다(감정가액·매매사례가액의 필요경비는 §97②2호에 따라 개산공제만이어야 한다). 조용한 오답이다.
 * 근거: 영 §166③이 종전 부동산 취득가액을 확인할 수 없는 경우를 환산식으로 직접 정하고, ④2호의 매매사례가액·감정가액은 「평가액」 산정용이다
 * (조합원입주권 R-9와 같은 근거). 승계조합원은 §166 밖이라 막지 않는다. 같은 판단을 ⑤·⑧·엔진이 한다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { BurdenedGiftBlock } from "@/components/calc/transfer/BurdenedGiftBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

afterEach(cleanup);

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2009-03-01",
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_market",
    bgMarketValueAtTransfer: "1,500,000,000",
    bgMortgageDebtAmount: "600,000,000",
    bgDonorRelation: "lineal_descendant",
    bgAcquisitionMethod: "appraisal",
    bgPresumedAcquisitionTotal: "400,000,000",
    bgActualAcquisitionTotal: "400,000,000",
    standardPriceAtTransfer: "1,500,000,000",
    standardPriceAtAcq: "300,000,000",
    ...over,
  }) as AssetForm;

const V = (a: AssetForm) => {
  const { result } = collectWithFields(() => validateBurdenedGiftAsset(a, "자산", undefined, "2024-03-01"));
  return result;
};

describe("⑧ validate", () => {
  it("[R-1] 재개발 완공 APT × 감정가액·매매사례가액 → 그 라디오 칸에서 막는다 (영 §166③)", () => {
    for (const m of ["appraisal", "salesCase"] as const) {
      expect(V(asset({ bgAcquisitionMethod: m }))).toMatch(/재개발·재건축 완공 아파트의 취득가액은 종전 부동산.*제166조 제3항/);
    }
  });

  it.each([
    ["실지취득가액 안분", { bgAcquisitionMethod: "actual" as const }],
    ["승계조합원 완공 APT(§166 밖)", { redevIsSuccessorMember: "yes" as const }],
    ["일반 주택", { assetKind: "housing" as const }],
  ])("🔴 대조군 — %s는 막지 않는다", (_n, over) => {
    expect(V(asset(over as Partial<AssetForm>))).toBeNull();
  });
});

describe("⑤ 라디오", () => {
  // 비활성 사유 문구에도 「매매사례가액」이 들어 이름으로는 하나로 좁혀지지 않는다 — 선택지 anchor는 value를 본다.
  const radio = (value: string) =>
    document.querySelector<HTMLInputElement>(`[data-field="bgAcquisitionMethod"] input[type="radio"][value="${value}"]`)!;
  it("[R-2] 재개발 완공 APT에서는 두 옵션이 비활성이고 사유가 보인다", () => {
    render(<BurdenedGiftBlock asset={asset({ bgAcquisitionMethod: "" })} onChange={() => {}} />);
    expect(radio("salesCase").disabled).toBe(true);
    expect(radio("appraisal").disabled).toBe(true);
    expect(screen.getAllByText(/종전 부동산의 취득가액을 쓰므로 매매사례가액·감정가액을 쓸 수 없습니다/).length).toBeGreaterThan(0);
  });
  it("🔴 대조군 — 일반 주택은 활성이다", () => {
    render(<BurdenedGiftBlock asset={asset({ assetKind: "housing", bgAcquisitionMethod: "" })} onChange={() => {}} />);
    expect(radio("salesCase").disabled).toBe(false);
    expect(radio("appraisal").disabled).toBe(false);
  });
});

describe("엔진 — 직접 호출도 막는다", () => {
  const rates = makeMockRates();
  const input = (info: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({
      ...baseTransferInput(),
      propertyType: "redevelopment_apt",
      transferType: "burdened_gift",
      acquisitionDate: new Date("2009-03-01"),
      transferDate: new Date("2024-03-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      isOneHousehold: false,
      householdHousingCount: 2,
      reductions: [],
      redevelopment: {
        subject: "apt",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2018-06-01"),
        rightsValue: 500_000_000,
        settlementDirection: "pay",
        settlementAmount: 200_000_000,
        preApprovalExpenses: 10_000_000,
        postApprovalExpenses: 5_000_000,
        completionDate: new Date("2021-09-01"),
        ...extra,
      },
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_market",
        marketValueAtTransfer: 1_500_000_000,
        lendingDepositTotal: 0,
        mortgageDebtAmount: 600_000_000,
        annualRentTotal: 0,
        mortgageSetAmount: 600_000_000,
        donorRelation: "lineal_descendant",
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 1_500_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 300_000_000,
        ...info,
      },
    }) as unknown as TransferTaxInput;

  it("[R-3] 원조합원 완공 APT × 감정가액·매매사례가액 → INVALID_INPUT", () => {
    for (const m of ["appraisal", "salesCase"]) {
      expect(() =>
        calculateTransferTax(input({ acquisitionMethod: m, presumedAcquisitionTotal: 400_000_000 }), rates),
      ).toThrow(/재개발·재건축 완공 아파트의 취득가액은 종전 부동산/);
    }
  });

  it("🔴 대조군 — 실지(K-4)는 종전대로 계산된다 · 승계조합원은 막지 않는다", () => {
    expect(() =>
      calculateTransferTax(input({ acquisitionMethod: "actual", actualAcquisitionTotal: 400_000_000 }), rates),
    ).not.toThrow();
    expect(() =>
      calculateTransferTax(
        input({ acquisitionMethod: "appraisal", presumedAcquisitionTotal: 400_000_000 }, { isSuccessorMember: true }),
        rates,
      ),
    ).not.toThrow(/재개발·재건축 완공 아파트의 취득가액은 종전 부동산/);
  });
});
