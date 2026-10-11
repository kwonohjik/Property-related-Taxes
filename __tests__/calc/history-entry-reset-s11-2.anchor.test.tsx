/**
 * S11-2 anchor — 이력 「편집」·수정신고·경정청구 진입은 **저장 당시 입력 그대로**여야 한다.
 *
 * 결함: 세 진입이 `updateFormData`(얕은 병합)로 이력 입력을 덮어, 직전 판정 전달이 남긴 키
 * (`importedOneHouseFacts`·`sourceJudgmentId`·`sourceJudgmentInputHash`)가 무관한 이력 R에 붙은 채 열렸다.
 * 상생임대 사실이 R의 거주요건을 면제해 과세 → 비과세로 뒤집혔다(소령 §155의3①1호 「해당 주택에 대하여」).
 *
 * 출발점은 실제 경로다: 판정 전달(`toTransferFormPatch`) → 이력 진입 함수 → store → ④ → ⑫ → 엔진.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { useCalcWizardStore, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { resumeTransferRecord } from "@/lib/calc/transfer-resume-entry";
import { enterAmendment, enterRefundClaim } from "@/lib/calc/transfer-amendment-entry";
import type { CalculationRecord } from "@/lib/storage/types";
import { runCalc } from "./_one-house-pr3a-calc-route";

const TD = "2025-06-01";
const router = { push: vi.fn(), replace: vi.fn() } as never;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});

/** 판정 J — 상생임대 충족(전달 키를 남기는 쪽). */
function judgmentJ(): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: TD,
    contractTotalPrice: "1000000000",
    assets: [
      { ...f.assets[0], assetKind: "housing", acquisitionDate: "2019-01-10", regionCode: "1168010100", addressJibun: "판정 J 주택" },
    ],
    winWinRentalSpecial: true,
    winWinRentalContractDate: "2022-03-01",
    winWinRentalIncreaseRatePct: "4",
    winWinRentalPriorLeaseMonths: "18",
    winWinRentalLeaseMonths: "24",
    winWinRentalLeaseEndDate: "2024-03-01",
  } as OneHouseJudgmentFormData;
}

/** 이력 R — 판정과 무관한 주택. 거주 0개월이라 §154① 거주요건 하나로 과세되는 사안. */
function recordR(extra: Record<string, unknown> = {}): CalculationRecord {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: TD,
    isOneHousehold: true,
    contractTotalPrice: "1000000000",
    householdNoPresaleRightsConfirmed: true,
    householdNoOtherHousesConfirmed: true,
    residencePeriodMonths: "0",
    householdHousingCount: "1",
    ...extra,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2019-01-10",
    actualSalePrice: "1000000000",
    fixedAcquisitionPrice: "500000000",
    addressJibun: "이력 R 주택",
    regionCode: "1168010100",
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
  });
  return {
    id: "rec-R",
    userId: "local",
    taxType: "transfer",
    title: "R",
    inputData: JSON.parse(JSON.stringify(f)),
    resultData: { mode: "single", result: { determinedTax: 149060000 } },
    taxLawVersion: TD,
    linkedCalculationId: null,
    clientId: null,
  } as unknown as CalculationRecord;
}

const flush = () => new Promise((r) => setTimeout(r, 30));
const ENTRIES: [string, (r: CalculationRecord) => Promise<unknown> | void][] = [
  ["편집", (r) => resumeTransferRecord(r, router)],
  ["수정신고", (r) => enterAmendment(r, router)],
  ["경정청구", (r) => enterRefundClaim(r, router)],
];

async function afterHandoffThenEnter(
  enter: (r: CalculationRecord) => Promise<unknown> | void,
  rec: CalculationRecord,
) {
  useCalcWizardStore.getState().reset();
  useCalcWizardStore.getState().updateFormData(toTransferFormPatch(judgmentJ(), "rec-J", "hash-J"));
  await enter(rec);
  await flush();
  return useCalcWizardStore.getState().formData;
}

describe("S11-2 anchor — 판정 전달 → 판정과 무관한 이력 진입은 저장 당시 그대로", () => {
  it.each(ENTRIES)("%s: 전달 키 3개가 남지 않고 과세(결정세액 149,060,000)로 계산된다", async (_n, enter) => {
    const f = await afterHandoffThenEnter(enter, recordR());
    expect(f.importedOneHouseFacts).toBeUndefined();
    expect(f.sourceJudgmentId).toBeUndefined();
    expect(f.sourceJudgmentInputHash).toBeUndefined();
    const r = await runCalc(f);
    expect([r.status, r.isExempt, (r.r as Record<string, unknown>).determinedTax]).toEqual([200, false, 149060000]);
  });

  // 긍정 짝 — 저장된 R 자체가 전달 키를 담고 있으면 그 키는 유지된다(「키 삭제」가 아니라 「reset 후 병합」).
  it.each(ENTRIES)("%s: R 자체가 전달 키를 담고 있으면 그 키가 복원된다", async (_n, enter) => {
    const { importedOneHouseFacts, sourceJudgmentId, sourceJudgmentInputHash } = toTransferFormPatch(
      judgmentJ(),
      "rec-OWN",
      "hash-OWN",
    );
    const f = await afterHandoffThenEnter(
      enter,
      recordR({ importedOneHouseFacts, sourceJudgmentId, sourceJudgmentInputHash }),
    );
    expect(f.sourceJudgmentId).toBe("rec-OWN");
    expect(f.sourceJudgmentInputHash).toBe("hash-OWN");
    expect(f.importedOneHouseFacts?.winWinRentalSpecial).toBe(true);
  });

  // 수정신고·경정청구 진입의 정정 필드는 reset 뒤에도 주입된다.
  it("수정신고: 정정 플래그는 reset 후에도 주입된다", async () => {
    const f = await afterHandoffThenEnter((r) => enterAmendment(r, router), recordR());
    expect(f.amendmentMode).toBe(true);
    expect(f.correctionKind).toBe("amend");
    expect(f.amendmentSourceId).toBe("rec-R");
  });

  // 직전 폼의 계산기 전용 선택 키(이력 R에 없는 키)도 남지 않는다.
  it("편집: 직전 폼의 계산기 전용 선택 키(sellingHouseExclusion)가 R에 붙지 않는다", async () => {
    useCalcWizardStore.getState().reset();
    useCalcWizardStore.getState().updateFormData({ sellingHouseExclusion: { isMortgageExecution: true } });
    await resumeTransferRecord(recordR(), router);
    await flush();
    expect(useCalcWizardStore.getState().formData.sellingHouseExclusion).toBeUndefined();
  });
});
