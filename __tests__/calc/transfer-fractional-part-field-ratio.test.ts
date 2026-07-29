/**
 * P3 — 지분 모드에서 파트 필드·추계 가액의 지분 스케일 적용.
 *
 * 설계: docs/02-design/features/transfer-separate-acq-date-per-part-completion.engine.design.md §4 E5
 *
 * `AssetForm.ownershipNumerator` 규약상 **UI 입력은 전부 100% 기준값**이고 API 변환이 × ratio를
 * 적용한다. 총액(`transferPrice`·`acquisitionPrice`·`capitalExpenditure`)은 그렇게 처리되는데
 * 파트 필드와 추계 가액(`appraisalValue`·`similarSalesValue`)은 raw로 새어나가, 같은 body 안에
 * 100% 스케일과 지분 스케일이 섞여 있었다.
 *
 * P2a가 취득가액 축을 파트 필드 전용으로 바꾸면서 이 누수가 **세액에 직결**됐다 —
 * 종전에는 총액 안분이 흡수하던 것이 이제 그대로 취득가액이 된다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, number | undefined> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}

/** 지분 50/100. 모든 입력은 100% 기준값. */
function makeForm(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  const asset = {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2018-06-01",
    landAcquisitionDate: "2015-06-01",
    hasSeperateLandAcquisitionDate: true,
    ownershipNumerator: "50",
    ownershipDenominator: "100",
    actualSalePrice: "1000000000",
    fixedAcquisitionPrice: "400000000",
    standardPriceAtAcq: "500000000",
    standardPricePerSqmAtAcq: "1000000",
    acquisitionArea: "200",
    landStandardPriceAtTransfer: "600000000",
    buildingStandardPriceAtTransfer: "400000000",
    saleSplitMode: "actual" as const,
    landTransferPrice: "600000000",
    buildingTransferPrice: "400000000",
    landAcqMode: "actual" as const,
    buildingAcqMode: "actual" as const,
    landAcquisitionPrice: "300000000",
    buildingAcquisitionPrice: "250000000",
    landDirectExpenses: "10000000",
    buildingDirectExpenses: "20000000",
    ...over,
  };
  return {
    transferDate: "2024-06-01",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

afterEach(() => vi.unstubAllGlobals());

describe("지분 50% — 파트 필드에 지분 스케일 적용", () => {
  it("🔴 양도가액 파트 합 = 총액 (종전: 파트만 100% → 양도차익 과대)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    expect(cap.body?.transferPrice).toBe(500_000_000);
    expect(cap.body?.landTransferPrice).toBe(300_000_000);
    expect(cap.body?.buildingTransferPrice).toBe(200_000_000);
    expect(
      (cap.body?.landTransferPrice ?? 0) + (cap.body?.buildingTransferPrice ?? 0),
      "파트 합이 총액과 어긋나면 엔진 splitPair가 스케일이 섞인 값을 쓴다",
    ).toBe(cap.body?.transferPrice);
  });

  it("🔴 취득가액 파트 — P2a 이후 총액 안분이 흡수하지 않으므로 세액 직결", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    expect(cap.body?.landAcquisitionPrice).toBe(150_000_000);
    expect(cap.body?.buildingAcquisitionPrice).toBe(125_000_000);
  });

  it("자본적지출 파트 — 총액(capitalExpenditure)과 동일 스케일", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    expect(cap.body?.landDirectExpenses).toBe(5_000_000);
    expect(cap.body?.buildingDirectExpenses).toBe(10_000_000);
  });

  it("매매사례 파트 (분리)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({
        landAcqMode: "salesCase",
        buildingAcqMode: "salesCase",
        landSalesCaseValue: "220000000",
        buildingSalesCaseValue: "330000000",
      }),
    );
    expect(cap.body?.landSalesCaseValue).toBe(110_000_000);
    expect(cap.body?.buildingSalesCaseValue).toBe(165_000_000);
  });
});

/**
 * 감정·매매사례 모드는 `acquisitionPrice`가 0이고 추계 가액이 취득가액이 된다.
 * **분리와 무관하게** 지분 자산 전체에 걸린 누수였다(취득가 과대 = 세액 과소).
 */
describe("지분 50% — 추계 가액 (비분리 자산에서도)", () => {
  it("🔴 감정가액 — 양도가액과 같은 스케일이어야 한다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ hasSeperateLandAcquisitionDate: false, isAppraisalAcquisition: true }),
    );
    expect(cap.body?.transferPrice).toBe(500_000_000);
    expect(
      cap.body?.appraisalValue,
      "감정가액이 100% 스케일이면 취득가액이 2배가 되어 세액이 과소 산출된다",
    ).toBe(200_000_000);
  });

  it("🔴 매매사례가액 (비분리)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({
        hasSeperateLandAcquisitionDate: false,
        isSalesCaseAcquisition: true,
        similarSalesValue: "450000000",
      }),
    );
    expect(cap.body?.similarSalesValue).toBe(225_000_000);
  });
});

describe("단독 소유(100/100) — 무변경 (회귀 0)", () => {
  const sole = { ownershipNumerator: "100", ownershipDenominator: "100" };

  it("파트 필드가 입력값 그대로 전송된다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(sole));
    expect(cap.body?.transferPrice).toBe(1_000_000_000);
    expect(cap.body?.landTransferPrice).toBe(600_000_000);
    expect(cap.body?.buildingTransferPrice).toBe(400_000_000);
    expect(cap.body?.landAcquisitionPrice).toBe(300_000_000);
    expect(cap.body?.buildingAcquisitionPrice).toBe(250_000_000);
    expect(cap.body?.landDirectExpenses).toBe(10_000_000);
  });

  it("감정가액도 그대로", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({ ...sole, hasSeperateLandAcquisitionDate: false, isAppraisalAcquisition: true }),
    );
    expect(cap.body?.appraisalValue).toBe(400_000_000);
  });
});

describe("기준시가는 지분 스케일 대상이 아니다", () => {
  it("취득시 기준시가·㎡당 공시지가·면적은 raw 유지", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());
    expect(
      cap.body?.standardPriceAtAcquisition,
      "기준시가는 소유 지분이 아니라 물건의 속성값 — 환산 산식에서 분자·분모로 상쇄된다",
    ).toBe(500_000_000);
    expect(cap.body?.standardPricePerSqmAtAcquisition).toBe(1_000_000);
    expect(cap.body?.acquisitionArea).toBe(200);
  });
});

/**
 * P2 ⑬ 배관 — `ownershipRatio`(개산공제 base 축소 전용).
 *
 * 금액 필드와 성격이 다르다: **기준시가는 raw 100%로 유지**하고 지분율만 별도 전송해
 * 엔진이 개산공제 계산 지점에서만 적용한다. 기준시가를 스케일하면 환산 상쇄·§166⑥ 안분
 * 비율이 깨지기 때문이다(설계 transfer-fractional-lump-sum-deduction.plan.md §3).
 */
describe("P2 — 개산공제 지분율(ownershipRatio) 전송", () => {
  it("지분 50% → ownershipRatio 0.5 전송, 기준시가는 raw 유지", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ useEstimatedAcquisition: true }));
    expect(cap.body?.ownershipRatio).toBe(0.5);
    expect(
      cap.body?.standardPriceAtAcquisition,
      "기준시가까지 스케일하면 §166⑥ 안분 비율(landStd/total)이 깨진다",
    ).toBe(500_000_000);
  });

  it("🔴 단독소유(100%) → 미전송 (기본값 1로 종전 동작)", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(
      makeForm({
        ownershipNumerator: "100",
        ownershipDenominator: "100",
        useEstimatedAcquisition: true,
      }),
    );
    expect(cap.body?.ownershipRatio).toBeUndefined();
  });
});
