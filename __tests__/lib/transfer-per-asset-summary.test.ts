import { describe, it, expect, beforeEach } from "vitest";
import { useCalcWizardStore, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { calculateEstimatedAcquisitionPrice, applyRate } from "@/lib/tax-engine/tax-utils";

function compute() {
  const { formData, result } = useCalcWizardStore.getState();
  return computeTransferPerAssetSummary(formData, result);
}

beforeEach(() => {
  useCalcWizardStore.getState().reset();
});

describe("computeTransferPerAssetSummary — 자산별 요약 + 안분 양도가액", () => {
  // A-1 (Pre-Do): 안분 모드 멀티 자산 — 양도가액이 기준시가 비율로 자산별 산출 (버그 ① 해결)
  it("A-1 안분 모드 2자산 — 기준시가 비율 양도가액 산출", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "225000000",
        bundledSaleMode: "apportioned",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", standardPriceAtTransfer: "90000000", actualSalePrice: "" },
          { ...makeDefaultAsset(2), assetKind: "land", standardPriceAtTransfer: "60000000", actualSalePrice: "" },
        ],
      },
    }));

    const s = compute();
    expect(s.rows).toHaveLength(2);
    // 90M/150M × 225M = 135M, 잔여 90M
    expect(s.rows[0].salePrice).toBe(135_000_000);
    expect(s.rows[1].salePrice).toBe(90_000_000);
    expect(s.rows[0].saleIsApportioned).toBe(true);
    expect(s.rows[1].saleIsApportioned).toBe(true);
    expect(s.rows[0].salePending).toBe(false);
    expect(s.totalSalePrice).toBe(225_000_000);
  });

  // A-2: 안분 모드지만 기준시가 미입력 → pending (silent fallback 금지)
  it("A-2 안분 모드 기준시가 미입력 — pending, throw 미전파", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "225000000",
        bundledSaleMode: "apportioned",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", standardPriceAtTransfer: "90000000" },
          { ...makeDefaultAsset(2), assetKind: "land", standardPriceAtTransfer: "" }, // 미입력
        ],
      },
    }));

    const s = compute();
    expect(s.rows).toHaveLength(2);
    expect(s.rows[0].salePending).toBe(true);
    expect(s.rows[1].salePending).toBe(true);
    expect(s.rows[0].salePrice).toBe(0);
  });

  // A-3: 실가 모드 — 자산별 actualSalePrice 직접값
  it("A-3 실가 모드 — 자산별 actualSalePrice 직접값, 안분 아님", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "300000000",
        bundledSaleMode: "actual",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", actualSalePrice: "200000000" },
          { ...makeDefaultAsset(2), assetKind: "land", actualSalePrice: "100000000" },
        ],
      },
    }));

    const s = compute();
    expect(s.rows[0].salePrice).toBe(200_000_000);
    expect(s.rows[1].salePrice).toBe(100_000_000);
    expect(s.rows[0].saleIsApportioned).toBe(false);
    expect(s.totalSalePrice).toBe(300_000_000);
  });

  // A-4: 단일 자산 — rows 1건 (헤더 미표시는 렌더 측 rows.length 판정)
  it("A-4 단일 자산 — rows 1건", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        bundledSaleMode: "actual",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", actualSalePrice: "500000000", fixedAcquisitionPrice: "300000000", directExpenses: "5000000" },
        ],
      },
    }));

    const s = compute();
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].salePrice).toBe(500_000_000);
    expect(s.rows[0].acqPrice).toBe(300_000_000);
    expect(s.rows[0].expense).toBe(5_000_000);
  });

  // A-5: 지분 단계취득 (ratio<1) — contractTotalPrice × ratio
  it("A-5 지분 50% — 양도가액 = 총액 × 지분", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "400000000",
        bundledSaleMode: "apportioned",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", ownershipNumerator: "50", ownershipDenominator: "100", actualSalePrice: "" },
        ],
      },
    }));

    const s = compute();
    expect(s.rows[0].salePrice).toBe(200_000_000);
    expect(s.rows[0].ownershipRatio).toBe(0.5);
  });

  // A-6: 계산 후 bundled — assetId 매칭 (위치 인덱스 아님)
  it("A-6 계산 후 bundled — assetId 매칭 값", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "225000000",
        bundledSaleMode: "apportioned",
        assets: [
          { ...makeDefaultAsset(1), assetId: "A", assetKind: "housing", standardPriceAtTransfer: "90000000" },
          { ...makeDefaultAsset(2), assetId: "B", assetKind: "land", standardPriceAtTransfer: "60000000" },
        ],
      },
      result: {
        mode: "bundled",
        apportionment: {
          // 주 자산(index 0)은 route.ts에서 assetId "primary"로 하드코딩되고 companion만
          // 실제 assetId를 유지 → primary는 "primary", 자산2는 "B"로 매칭. 순서를 폼과 반대로
          // 넣어 companion assetId 매칭(위치 무관)을 검증.
          apportioned: [
            { assetId: "B", allocatedSalePrice: 90_000_000, allocatedAcquisitionPrice: 40_000_000, allocatedExpenses: 1_000_000, saleMode: "apportioned" },
            { assetId: "primary", allocatedSalePrice: 135_000_000, allocatedAcquisitionPrice: 80_000_000, allocatedExpenses: 2_000_000, saleMode: "apportioned" },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    const s = compute();
    const rowA = s.rows.find((r) => r.assetId === "A")!;
    const rowB = s.rows.find((r) => r.assetId === "B")!;
    expect(rowA.salePrice).toBe(135_000_000);
    expect(rowA.acqPrice).toBe(80_000_000);
    expect(rowB.salePrice).toBe(90_000_000);
    expect(rowB.acqPrice).toBe(40_000_000);
  });

  // A-7: 단건 환산 프리뷰 회귀 (계산 전, useEstimatedAcquisition)
  it("A-7 단건 환산 프리뷰 — 취득가액=환산취득가, 필요경비=개산공제", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        bundledSaleMode: "actual",
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            acquisitionCause: "purchase",
            useEstimatedAcquisition: true,
            actualSalePrice: "300000000",
            standardPriceAtAcq: "80000000",
            standardPriceAtTransfer: "120000000",
          },
        ],
      },
    }));

    const s = compute();
    const est = calculateEstimatedAcquisitionPrice(300_000_000, 80_000_000, 120_000_000);
    expect(s.rows[0].acqPrice).toBe(est);
    expect(s.rows[0].expense).toBe(applyRate(80_000_000, 0.03));
  });

  // A-9: 지분(fractional) 자산 + 안분 모드 공존 — 엔진 잔여흡수와 합계 일치 (이중계상 방지)
  it("A-9 지분+안분 공존 — 형제 자산 잔여흡수·합계 정합", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "225000000",
        bundledSaleMode: "apportioned",
        assets: [
          // 자산1: 지분 50% (총액×0.5 = 112,500,000 구분 기재로 안분 제외)
          { ...makeDefaultAsset(1), assetId: "A", assetKind: "housing", ownershipNumerator: "50", ownershipDenominator: "100", standardPriceAtTransfer: "90000000" },
          // 자산2: 단독 — 잔여 112,500,000 단독 안분
          { ...makeDefaultAsset(2), assetId: "B", assetKind: "land", standardPriceAtTransfer: "60000000" },
        ],
      },
    }));

    const s = compute();
    const rowA = s.rows.find((r) => r.assetId === "A")!;
    const rowB = s.rows.find((r) => r.assetId === "B")!;
    expect(rowA.salePrice).toBe(112_500_000); // 총액 × 지분
    expect(rowB.salePrice).toBe(112_500_000); // 잔여 흡수 (전체총액 기준 90M 아님)
    expect(rowA.saleIsApportioned).toBe(false); // 지분 라벨
    expect(rowB.saleIsApportioned).toBe(true); // 기준시가 안분 라벨
    expect(s.totalSalePrice).toBe(225_000_000); // 합계 무결성
  });

  // A-8: 상속의제 (post-deemed) 회귀
  it("A-8 상속의제 post-deemed — 취득가액=신고가액", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        bundledSaleMode: "actual",
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "housing",
            acquisitionCause: "inheritance",
            actualSalePrice: "600000000",
            inheritanceMode: "post-deemed",
            inheritanceStartDate: "2020-01-01",
            inheritanceReportedValue: "400000000",
          },
        ],
      },
    }));

    const s = compute();
    expect(s.rows[0].acqPrice).toBe(400_000_000);
  });
});
