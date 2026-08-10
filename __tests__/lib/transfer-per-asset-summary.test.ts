import { describe, it, expect, beforeEach } from "vitest";
import { useCalcWizardStore, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { calculateEstimatedAcquisitionPrice, applyRate } from "@/lib/tax-engine/tax-utils";
import type { ParcelFormItem } from "@/lib/stores/calc-wizard-parcel";

function compute() {
  const { formData, result } = useCalcWizardStore.getState();
  return computeTransferPerAssetSummary(formData, result);
}

/** 다필지 fixture — 실가(actual) 필지 기본값. 개별 케이스에서 필요한 칸만 덮어쓴다. */
function makeParcel(id: string): ParcelFormItem {
  return {
    id,
    acquisitionDate: "2015-01-01",
    acquisitionMethod: "actual",
    acquisitionPrice: "",
    acquisitionArea: "100",
    transferArea: "100",
    standardPricePerSqmAtAcq: "",
    standardPricePerSqmAtTransfer: "",
    expenses: "",
    capitalExpenditure: "",
    transferExpense: "",
    useDayAfterReplotting: false,
    replottingConfirmDate: "",
    useExchangeLandReduction: false,
    entitlementArea: "",
    allocatedArea: "",
    priorLandArea: "",
    compensationPerSqm: "",
    compensationBasisStdPrice: "",
    areaScenario: "same",
  };
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

  // A-8: 상속의제 (post-deemed) 회귀 — 신고가액(상증법 평가액)은 엔진 실경로 publishedValueAtInheritance (P3)
  it("A-8 상속의제 post-deemed — 취득가액=신고가액(publishedValueAtInheritance)", () => {
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
            publishedValueAtInheritance: "400000000",
          },
        ],
      },
    }));

    const s = compute();
    expect(s.rows[0].acqPrice).toBe(400_000_000);
  });

  // A-10 (Pre-Do): 겸용주택 계산 후 — result.mode "mixed-use" 처리.
  // 취득가액 = 주택+상가 환산취득가액 합, 필요경비 = 주택·상가 토지·건물 개산공제(§163⑥) 합.
  // 수정 전: mode "mixed-use"가 single/bundled 어디에도 안 걸려 acqPrice=0(«-»).
  it("A-10 겸용주택 계산 후 — mode:mixed-use breakdown 취득가액·필요경비 합계", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        bundledSaleMode: "actual",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", isMixedUseHouse: true, actualSalePrice: "2300000000" },
        ],
      },
      result: {
        mode: "mixed-use",
        result: {
          housingPart: { estimatedAcquisitionPrice: 300_000_000, landAppraisalDed: 3_000_000, buildingAppraisalDed: 1_000_000 },
          commercialPart: { estimatedAcquisitionPrice: 200_000_000, landAppraisalDed: 2_000_000, buildingAppraisalDed: 500_000 },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    const s = compute();
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].salePrice).toBe(2_300_000_000);
    expect(s.rows[0].acqPrice).toBe(500_000_000); // 300M + 200M
    expect(s.rows[0].expense).toBe(6_500_000); // 3M + 1M + 2M + 0.5M
    expect(s.rows[0].acqPending).toBe(false);
    expect(s.rows[0].expensePending).toBe(false);
  });
});

/**
 * B 시리즈 — **자산 종류별 표시 갭** (2026-08-11).
 *
 * 종전에는 취득가액·필요경비를 `fixedAcquisitionPrice`/`capitalExpenditure`에서만 읽어, 그 필드를
 * 쓰지 않는 자산 종류(일반건물 파트별·재개발·다필지)가 계산 전은 물론 **계산 후에도** «-»로
 * 남았다. 각 케이스의 소스는 API 변환(`transfer-tax-api.ts:277-289`)의 정본을 미러링한다.
 */
describe("computeTransferPerAssetSummary — 자산 종류별 가액 소스 (B 시리즈)", () => {
  // B-1: 일반건물 토지·건물 파트별 실가 — 취득시기가 같아 `isSeparateAcquisition`이 false라
  //      종전에는 파트 합계 경로에 들어가지 못하고 빈 `fixedAcquisitionPrice`를 읽어 «-»였다.
  it("B-1 일반건물 파트별 실가 — 토지+건물 합계 표시", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            actualSalePrice: "925000000",
            landAcquisitionPrice: "300000000",
            buildingAcquisitionPrice: "200000000",
            landDirectExpenses: "5000000",
            buildingDirectExpenses: "3000000",
          },
        ],
      },
    }));

    const r = compute().rows[0];
    expect(r.acqPrice).toBe(500_000_000);
    expect(r.expense).toBe(8_000_000);
    expect(r.acqPending).toBe(false);
  });

  // B-2: 자산 전체 값이 있으면 파트 값에 밀리지 않는다 (stale 파트 방어).
  it("B-2 자산 전체 취득가액 우선 — stale 파트 값 무시", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            actualSalePrice: "925000000",
            fixedAcquisitionPrice: "600000000",
            landAcquisitionPrice: "300000000", // stale
            buildingAcquisitionPrice: "200000000", // stale
          },
        ],
      },
    }));

    expect(compute().rows[0].acqPrice).toBe(600_000_000);
  });

  // B-3: 재개발·입주권 — 상단 일반 취득가액 칸이 숨겨지고 §166 전용 필드를 쓴다
  //      (API :283-286 · RedevelopmentBlock.tsx:344 "상단 일반 취득가액 입력 대신 본 값이 자동 사용").
  it("B-3 재개발 실가 — redevActualAcquisitionPrice + 인가 전·후 필요경비", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "redevelopment_apt",
            actualSalePrice: "925000000",
            redevActualAcquisitionPrice: "400000000",
            redevPreApprovalExpenses: "2000000",
            redevPostApprovalExpenses: "3000000",
            capitalExpenditure: "1000000",
          },
        ],
      },
    }));

    const r = compute().rows[0];
    expect(r.acqPrice).toBe(400_000_000);
    expect(r.expense).toBe(6_000_000); // 2M(인가전) + 3M(인가후) + 1M(자본적지출)
    // 표시 범위가 자산 전체가 아니라 인가 전 분이므로 라벨로 구분한다(전체 취득가액 오독 차단).
    expect(r.acqLabel).toBe("인가전 분 취득가액");
  });

  // B-4: 승계조합원(사례 48)만 자산 카드 `fixedAcquisitionPrice` — API :283-285 분기 일치.
  it("B-4 재개발 승계조합원 — fixedAcquisitionPrice 사용", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "right_to_move_in",
            actualSalePrice: "925000000",
            redevIsSuccessorMember: "yes",
            fixedAcquisitionPrice: "450000000",
            redevActualAcquisitionPrice: "400000000", // 승계조합원에선 UI 미노출
          },
        ],
      },
    }));

    const r = compute().rows[0];
    expect(r.acqPrice).toBe(450_000_000);
    // 승계조합원은 종전주택을 소유하지 않아 「인가 전 분」이 성립하지 않는다 — 일반 라벨.
    expect(r.acqLabel).toBe("취득가액");
  });

  // B-4b: 재개발이 아닌 자산은 라벨이 갈리지 않는다 (라벨 분기 누수 가드).
  it("B-4b 일반 자산 — 취득가액 라벨 유지", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", actualSalePrice: "925000000", fixedAcquisitionPrice: "500000000" },
        ],
      },
    }));

    expect(compute().rows[0].acqLabel).toBe("취득가액");
  });

  // B-5: 다필지 — 자산 전체 취득가액이 없고 필지별로 실재한다 (API :277 parcelModeActive → 0 송신).
  it("B-5 다필지 실가 2필지 — 필지 합계 표시", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            parcelMode: true,
            actualSalePrice: "925000000",
            parcels: [
              { ...makeParcel("p1"), acquisitionPrice: "200000000", capitalExpenditure: "1000000" },
              { ...makeParcel("p2"), acquisitionPrice: "300000000", capitalExpenditure: "2000000" },
            ],
          },
        ],
      },
    }));

    const r = compute().rows[0];
    expect(r.acqPrice).toBe(500_000_000);
    expect(r.expense).toBe(3_000_000);
  });

  // B-6: 환산 필지가 섞이면 그 필지 금액이 계산 후에야 확정 → 부분합을 총액으로 표시하지 않는다.
  it("B-6 다필지 환산 혼합 — pending (부분합 미표시)", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            parcelMode: true,
            actualSalePrice: "925000000",
            parcels: [
              { ...makeParcel("p1"), acquisitionPrice: "200000000", capitalExpenditure: "1000000" },
              { ...makeParcel("p2"), acquisitionMethod: "estimated" as const, standardPricePerSqmAtAcq: "1000000", standardPricePerSqmAtTransfer: "2000000" },
            ],
          },
        ],
      },
    }));

    const r = compute().rows[0];
    expect(r.acqPrice).toBe(0);
    expect(r.acqPending).toBe(true);
    expect(r.expense).toBe(0);
    expect(r.expensePending).toBe(true);
  });

  // B-7: 계산 후 — 필지별 결과(`parcelDetails`) 합으로 pending 해소.
  it("B-7 다필지 계산 후 — parcelDetails 합계로 확정", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "land",
            parcelMode: true,
            actualSalePrice: "925000000",
            parcels: [
              { ...makeParcel("p1"), acquisitionPrice: "200000000" },
              { ...makeParcel("p2"), acquisitionMethod: "estimated" as const },
            ],
          },
        ],
      },
      result: {
        mode: "single",
        result: {
          parcelDetails: [
            { acquisitionPrice: 200_000_000, expenses: 1_000_000 },
            { acquisitionPrice: 150_000_000, expenses: 4_500_000 },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    const r = compute().rows[0];
    expect(r.acqPrice).toBe(350_000_000);
    expect(r.expense).toBe(5_500_000);
    expect(r.acqPending).toBe(false);
    expect(r.expensePending).toBe(false);
  });

  /**
   * B-8: **일반건물 자산카드 분해** — 폼 자산 1건이 엔진에서 카드 여러 장으로 쪼개져 돌아온다.
   * `apportioned[].assetId`가 폼 assetId가 아니라 카드 ID(`general-building-route-cards.ts:200`)라
   * 종전 매칭(`"primary"`)이 반드시 실패했고, 그래서 **계산을 마친 뒤에도** 취득가액·필요경비가
   * «-»로 남았다(사용자 보고 화면). 폼 자산이 1건이면 카드 전부가 그 자산 몫이므로 합계로 귀속한다.
   */
  it("B-8 일반건물 환산 계산 후 — 카드 ID 매칭 실패 시 카드 합계로 귀속", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "general_building",
            useEstimatedAcquisition: true,
            actualSalePrice: "925000000",
          },
        ],
      },
      result: {
        mode: "bundled",
        apportionment: {
          apportioned: [
            { assetId: "land_business", allocatedSalePrice: 500_000_000, allocatedAcquisitionPrice: 250_000_000, allocatedExpenses: 3_000_000, saleMode: "apportioned" },
            { assetId: "land_nbl", allocatedSalePrice: 125_000_000, allocatedAcquisitionPrice: 60_000_000, allocatedExpenses: 1_000_000, saleMode: "apportioned" },
            { assetId: "building", allocatedSalePrice: 300_000_000, allocatedAcquisitionPrice: 140_000_000, allocatedExpenses: 2_000_000, saleMode: "apportioned" },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    const r = compute().rows[0];
    expect(r.salePrice).toBe(925_000_000);
    expect(r.acqPrice).toBe(450_000_000); // 250M + 60M + 140M
    expect(r.expense).toBe(6_000_000); // 3M + 1M + 2M
    expect(r.acqPending).toBe(false);
    expect(r.expensePending).toBe(false);
  });

  // B-9: 멀티 자산에서는 카드 합계 귀속을 적용하지 않는다 — 카드↔자산 대응이 없어
  //      남의 금액이 붙는다. 매칭 실패는 그대로 미표시로 둔다.
  it("B-9 멀티 자산 — 카드 합계 귀속 미적용", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        contractTotalPrice: "925000000",
        bundledSaleMode: "actual",
        assets: [
          { ...makeDefaultAsset(1), assetKind: "housing", actualSalePrice: "600000000" },
          { ...makeDefaultAsset(2), assetKind: "land", actualSalePrice: "325000000" },
        ],
      },
      result: {
        mode: "bundled",
        apportionment: {
          apportioned: [
            { assetId: "land_business", allocatedSalePrice: 500_000_000, allocatedAcquisitionPrice: 250_000_000, allocatedExpenses: 3_000_000, saleMode: "actual" },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    const s = compute();
    // 어느 자산에도 250M이 붙지 않는다
    expect(s.rows[0].acqPrice).toBe(0);
    expect(s.rows[1].acqPrice).toBe(0);
  });

  /**
   * B-10: **환산 프리뷰 게이트** — 엔진 환산 산식은 자산 종류를 보지 않는다
   * (`transfer-tax-helpers.ts:312-330`은 `useEstimatedAcquisition`만 판정). 종전의
   * `land || housing` 화이트리스트는 같은 산식을 쓰는 `building`을 근거 없이 제외했다.
   */
  it("B-10 건물(토지 제외) 환산 — 프리뷰 표시 (land·housing과 동일 산식)", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "building",
            useEstimatedAcquisition: true,
            actualSalePrice: "925000000",
            standardPriceAtAcq: "200000000",
            standardPriceAtTransfer: "400000000",
          },
        ],
      },
    }));

    const r = compute().rows[0];
    // 925,000,000 × 200,000,000 ÷ 400,000,000
    expect(r.acqPrice).toBe(calculateEstimatedAcquisitionPrice(925_000_000, 200_000_000, 400_000_000));
    expect(r.expense).toBe(applyRate(200_000_000, 0.03)); // 개산공제 §163⑥
    expect(r.acqPending).toBe(false);
  });

  // B-11: 전용 환산 경로(일반건물·상가)는 프리뷰 대상이 아니다 — 별도 산식·별도 입력 필드라
  //       공통 §176의2② 식으로 계산하면 실제 세액과 다른 값을 보여준다. «계산 후 표시»가 정답.
  it("B-11 일반건물·상가 환산 — 계산 전 pending 유지 (오표시 방지)", () => {
    for (const kind of ["general_building", "commercial_building"] as const) {
      useCalcWizardStore.getState().reset();
      useCalcWizardStore.setState((st) => ({
        formData: {
          ...st.formData,
          assets: [
            {
              ...makeDefaultAsset(1),
              assetKind: kind,
              useEstimatedAcquisition: true,
              actualSalePrice: "925000000",
              standardPriceAtAcq: "200000000",
              standardPriceAtTransfer: "400000000",
            },
          ],
        },
      }));

      const r = compute().rows[0];
      expect(r.acqPrice, kind).toBe(0);
      expect(r.acqPending, kind).toBe(true);
    }
  });

  /**
   * B-12: **상가 환산 계산 후** — STEP 0.35가 `useEstimatedAcquisition`을 false로 되돌려
   * (`transfer-tax-commercial-step.ts:136`) 결과의 `usedEstimatedAcquisition`·`estimatedBase`가
   * 비므로, 종전 fallback 체인이 전부 빗나가 계산 후에도 «계산 후 표시»에 머물렀다.
   */
  it("B-12 상가 환산 계산 후 — commercialBuildingValuationDetail로 확정", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "commercial_building",
            useEstimatedAcquisition: true,
            actualSalePrice: "925000000",
          },
        ],
      },
      result: {
        mode: "single",
        result: {
          usedEstimatedAcquisition: false, // STEP 0.35가 되돌린 상태
          commercialBuildingValuationDetail: { estimatedAcquisitionTotal: 412_000_000 },
          expenses: 7_500_000,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    const r = compute().rows[0];
    expect(r.acqPrice).toBe(412_000_000);
    expect(r.expense).toBe(7_500_000);
    expect(r.acqPending).toBe(false);
  });

  // B-13: §97②2호 swap 발동 시 환산취득가액은 채택되지 않는다 — 표시도 하지 않는다.
  it("B-13 상가 환산 + swap 발동 — 환산취득가액 미표시", () => {
    useCalcWizardStore.setState((st) => ({
      formData: {
        ...st.formData,
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "commercial_building",
            useEstimatedAcquisition: true,
            actualSalePrice: "925000000",
          },
        ],
      },
      result: {
        mode: "single",
        result: {
          usedEstimatedAcquisition: false,
          swapApplied: true,
          commercialBuildingValuationDetail: { estimatedAcquisitionTotal: 412_000_000 },
          expenses: 20_000_000,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }));

    expect(compute().rows[0].acqPrice).toBe(0);
  });
});
