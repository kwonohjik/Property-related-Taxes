/**
 * S11-7 anchor — 판정 → 계산기 전달 patch가 **출처 키·이전 물건의 선택 키를 지운다**.
 *
 * 결함: 전달 patch가 출처 두 키를 「값이 있을 때만」 실어 id 없는 전달은 이전 판정의 출처가 `fresh`로 남았다.
 * 또 store가 얕은 병합이라 이전 물건의 계산기 전용 선택(`sellingHouseExclusion` 등)이 새 물건의 본문에 실렸다
 * (저당권 실행 배제 `mortgage_execution_3years` 오적용 — 2주택 중과가 일반세율로 과소 산출).
 *
 * 출발점은 실제 경로다: `openTransferWithOneHouseFacts`(store 쓰기) → provenance / ④ → ⑫ → 엔진.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CalculationRecord } from "@/lib/storage/types";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
const repo = new Map<string, CalculationRecord>();
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { get: async (id: string) => repo.get(id) ?? null },
}));

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import {
  applyOneHouseFactsToTransferForm,
  openTransferWithOneHouseFacts,
  toTransferFormPatch,
} from "@/lib/calc/one-house-judgment-handoff";
import { detectJudgmentProvenance } from "@/lib/calc/one-house-judgment-provenance";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeHouse } from "./one-house-rulings/harness";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { withToday } from "./_one-house-pr6a-routes";

const GANGNAM = "1168010100";
function seed(id: string, hash: string, judgedFor: string, isExempt: boolean) {
  repo.set(id, {
    id, userId: "u", taxType: "one_house_exemption", title: "판정", inputData: {},
    resultData: { judgment: { isExempt, isPartialExempt: false } }, taxLawVersion: judgedFor,
    linkedCalculationId: null, clientId: null, inputHash: hash,
    createdAt: "2026-09-21T00:00:00.000Z", updatedAt: "2026-09-21T01:00:00.000Z",
  } as CalculationRecord);
}
function judgmentA(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  f.transferDate = "2026-03-01";
  f.contractTotalPrice = "900000000";
  f.assets = [{ ...f.assets[0], assetKind: "housing", addressJibun: "주택 A", acquisitionDate: "2016-01-01", regionCode: GANGNAM }];
  f.houses = [];
  return f;
}
function judgmentB(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  f.transferDate = "2026-12-31";
  f.contractTotalPrice = "1500000000";
  f.isOneHousehold = true;
  f.isRegulatedArea = true;
  f.wasRegulatedAtAcquisition = true;
  f.assets = [{ ...f.assets[0], assetKind: "housing", addressJibun: "주택 B", acquisitionDate: "2024-06-01", regionCode: GANGNAM, residenceInputMode: "direct", residencePeriods: [] }];
  f.residencePeriodMonths = "0";
  f.houses = [makeHouse("h1", { acquisitionDate: "2015-01-01", officialPrice: "500000000", regionCode: GANGNAM, isApartment: true })];
  return f;
}
const router = { push: () => {} } as unknown as Parameters<typeof openTransferWithOneHouseFacts>[1];

beforeEach(() => {
  repo.clear();
  useCalcWizardStore.getState().reset();
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date("2026-10-11")) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

describe("S11-7 anchor — 전달 patch의 출처 키", () => {
  it("id 없는 두 번째 전달 뒤 출처는 이전 판정(rec-A)이 아니라 unknown이다", async () => {
    seed("rec-A", "hash-A", "2026-03-01", true);
    await openTransferWithOneHouseFacts(judgmentA(), router, "rec-A");
    await openTransferWithOneHouseFacts(judgmentB(), router, undefined);
    const f = useCalcWizardStore.getState().formData;
    expect(f.sourceJudgmentId).toBeUndefined();
    expect(f.sourceJudgmentInputHash).toBeUndefined();
    expect(await detectJudgmentProvenance(f)).toEqual({ state: "unknown", record: null });
  });

  it("「판정 불러오기」(쓰기 전용)도 같다 — id 없이 불러오면 이전 출처가 남지 않는다", async () => {
    seed("rec-A", "hash-A", "2026-03-01", true);
    await applyOneHouseFactsToTransferForm(judgmentA(), "rec-A");
    await applyOneHouseFactsToTransferForm(judgmentB(), undefined);
    const f = useCalcWizardStore.getState().formData;
    expect(f.sourceJudgmentId).toBeUndefined();
    expect(f.sourceJudgmentInputHash).toBeUndefined();
  });

  it("불러오기에서 새 record의 해시를 못 읽으면 이전 판정의 해시가 새 id에 붙지 않는다", async () => {
    seed("rec-A", "hash-A", "2026-03-01", true);
    // rec-C는 해시가 없는 record
    repo.set("rec-C", { ...repo.get("rec-A")!, id: "rec-C", inputHash: undefined } as CalculationRecord);
    await openTransferWithOneHouseFacts(judgmentA(), router, "rec-A");
    await openTransferWithOneHouseFacts(judgmentB(), router, "rec-C");
    const f = useCalcWizardStore.getState().formData;
    expect(f.sourceJudgmentId).toBe("rec-C");
    expect(f.sourceJudgmentInputHash).toBeUndefined();
  });

  // 긍정 짝 — id가 있으면 그 id·해시가 실린다.
  it("긍정 짝: id와 해시가 있으면 그대로 실린다", () => {
    const p = toTransferFormPatch(judgmentA(), "rec-A", "hash-A");
    expect([p.sourceJudgmentId, p.sourceJudgmentInputHash]).toEqual(["rec-A", "hash-A"]);
  });
});

describe("S11-7 anchor — 이전 물건의 계산기 전용 선택이 새 물건에 실리지 않는다", () => {
  it("이전 물건의 sellingHouseExclusion·gracePeriod는 새 판정 전달 뒤 폼에 남지 않는다", async () => {
    useCalcWizardStore.getState().updateFormData({
      sellingHouseExclusion: { isMortgageExecution: true },
      gracePeriod: { isLandPermitTarget: true } as never,
    });
    await openTransferWithOneHouseFacts(judgmentB(), router, undefined);
    const f = useCalcWizardStore.getState().formData;
    expect(f.sellingHouseExclusion).toBeUndefined();
    expect(f.gracePeriod).toBeUndefined();
  });

  it("이전 물건의 폼-전역 regionCode가 새 양도 자산(소재지 코드 없음)의 법정동 폴백으로 새지 않는다", async () => {
    useCalcWizardStore.getState().updateFormData({ regionCode: GANGNAM });
    const noCode = judgmentB();
    noCode.assets = [{ ...noCode.assets[0], regionCode: "" }];
    await openTransferWithOneHouseFacts(noCode, router, undefined);
    const f = useCalcWizardStore.getState().formData;
    expect(f.regionCode).toBeUndefined();
    const st = useCalcWizardStore.getState();
    st.updateFormData({ assets: [{ ...st.formData.assets[0], fixedAcquisitionPrice: "500000000" }] });
    const r = await withToday("2026-10-11", () => runCalc(useCalcWizardStore.getState().formData));
    expect(r.body.regionCode).toBeUndefined(); // ④ 폴백 `primary.regionCode || form.regionCode`
  });

  it("세액: 이전 물건의 저당권 실행 선언이 새 물건 2주택 중과를 일반세율로 바꾸지 않는다(640,761,000)", async () => {
    useCalcWizardStore.getState().updateFormData({ sellingHouseExclusion: { isMortgageExecution: true } });
    await openTransferWithOneHouseFacts(judgmentB(), router, undefined);
    const st = useCalcWizardStore.getState();
    st.updateFormData({ assets: [{ ...st.formData.assets[0], fixedAcquisitionPrice: "500000000" }] });
    const r = await withToday("2026-10-11", () => runCalc(useCalcWizardStore.getState().formData));
    const sell = (r.body.houses as Record<string, unknown>[]).find((h) => h.id === "selling");
    expect(sell?.isMortgageExecution).not.toBe(true);
    expect(r.r.surchargeType).toBe("multi_house_2");
    expect(r.totalTax).toBe(640_761_000);
  });

  // 긍정 짝 — 전달 뒤 사용자가 새 물건에 그 선언을 직접 켜면 본문에 실린다(키를 지우는 것이 입력 경로를 막지 않는다).
  it("긍정 짝: 전달 뒤 사용자가 직접 켠 저당권 실행 선언은 본문에 실린다", async () => {
    await openTransferWithOneHouseFacts(judgmentB(), router, undefined);
    const st = useCalcWizardStore.getState();
    st.updateFormData({
      assets: [{ ...st.formData.assets[0], fixedAcquisitionPrice: "500000000" }],
      sellingHouseExclusion: { isMortgageExecution: true },
    });
    const r = await withToday("2026-10-11", () => runCalc(useCalcWizardStore.getState().formData));
    const sell = (r.body.houses as Record<string, unknown>[]).find((h) => h.id === "selling");
    expect(sell?.isMortgageExecution).toBe(true);
  });
});
