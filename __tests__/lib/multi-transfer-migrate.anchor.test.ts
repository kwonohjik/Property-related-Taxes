/**
 * 다건 계산기 자산 폼 마이그레이션 (2026-10-11 재실측 #14).
 *
 * 종전: 다건 스토어(persist)에 `merge`/`migrate`가 없고, 이력 편입(단건·다건 record)·다건 「편집」 어느 경로도 단건의
 * `migrateAsset` 계열을 거치지 않았다. 구 이력의 폐지 값(예: 2026-07-25 전 임대주택 유닛 `rentalType`·`region:"regulated-area"`)이
 * ⑧은 통과하고 ⑫ `multiInputSchema`에서 400이 났다.
 * 지금: 세 진입 경로 + 세션 복원이 `migratePersistedTransferForm`(단건 세션 복원과 같은 함수)을 지난다.
 */
import { describe, it, expect, vi } from "vitest";
import { resumeTransferRecord } from "@/lib/calc/transfer-resume-entry";
import { createDefaultTransferFormData, migratePersistedTransferForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildPropertyFromSingleRecord, buildPropertiesFromMultiRecord } from "@/lib/calc/transfer-multi-load-entry";
import { useMultiTransferStore, migrateMultiForm, mergePersistedMulti, type PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { multiInputSchema } from "@/lib/api/transfer-tax-schema";
import type { CalculationRecord } from "@/lib/storage/types";

/** 2026-07-25 전 저장 형태의 거주주택 특례 임대유닛을 실은 주택 자산 폼. */
function legacyRentalForm(): TransferFormData {
  const f = createDefaultTransferFormData();
  const a = { ...(f.assets[0] as unknown as Record<string, unknown>) };
  Object.assign(a, {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2012-03-01", fixedAcquisitionPrice: "300000000",
    addressJibun: "서울 강남구 역삼동 1", residenceInputMode: "direct", residencePeriodMonthsAsset: "60", residencePeriods: [],
  });
  const unit: Record<string, unknown> = { ...(makeDefaultRentalUnit() as unknown as Record<string, unknown>) };
  delete unit.rentalCategory;
  delete unit.isExcluded918Rule;
  delete unit.unitId;
  Object.assign(unit, {
    rentalType: "long-8", registrationDate: "2018-01-02", region: "regulated-area", isRegulatedAreaNewAcq: false,
    standardPriceAtRentalStart: "300000000", rentalStartDate: "2018-01-02", businessRegistrationDate: "2018-01-02",
    requirementsConfirmed: true, rentalRegistrationDate: "2018-01-02",
  });
  a.rentalHousingException = { applyException: true, scenario: "A", rentalUnits: [unit] };
  return {
    ...f, transferDate: "2025-06-01", contractTotalPrice: "800000000",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets: [a as never],
  } as TransferFormData;
}
const record = (inputData: unknown, mode: "single" | "multi"): CalculationRecord =>
  ({ id: "r1", taxType: "transfer", inputData, resultData: { mode, result: { determinedTax: 0, localIncomeTax: 0 } } }) as unknown as CalculationRecord;
const zodOk = (form: TransferFormData) =>
  multiInputSchema.safeParse({ taxYear: 2025, properties: [{ propertyId: "p1", propertyLabel: "p1", ...(buildPropertyPayload(form) as object) }] }).success;
const item = (form: TransferFormData): PropertyItem => ({ propertyId: "p1", propertyLabel: "p1", form, completionPercent: 0 });

describe("#14 다건 자산 폼 마이그레이션", () => {
  it("전제(부정형 짝): 구 폼을 그대로 보내면 ⑫ 400 — 단건 마이그레이션을 거치면 통과", () => {
    expect(zodOk(legacyRentalForm())).toBe(false);
    expect(zodOk(migratePersistedTransferForm(legacyRentalForm()))).toBe(true);
  });

  it("단건 이력 → 다건 편입(`buildPropertyFromSingleRecord`)", () => {
    const p = buildPropertyFromSingleRecord(record(legacyRentalForm(), "single"), "자산1");
    expect(zodOk(p.form)).toBe(true);
  });

  it("다건 이력 → 자산 목록 교체(`buildPropertiesFromMultiRecord`)", () => {
    const [p] = buildPropertiesFromMultiRecord(record({ properties: [item(legacyRentalForm())] }, "multi"));
    expect(zodOk(p.form)).toBe(true);
  });

  it("다건 「편집」(`migrateMultiForm`) · 다른 필드는 그대로", () => {
    const m = migrateMultiForm({ taxYear: 2025, properties: [item(legacyRentalForm())] });
    expect(m.taxYear).toBe(2025);
    expect(zodOk(m.properties[0].form)).toBe(true);
  });

  it("세션 복원(persist `merge`)", () => {
    const current = useMultiTransferStore.getState();
    const restored = mergePersistedMulti({ form: { ...current.form, properties: [item(legacyRentalForm())] } }, current);
    expect(zodOk(restored.form.properties[0].form)).toBe(true);
    expect(typeof restored.setForm).toBe("function"); // 액션은 current에서 온다(얕은 병합)
  });

  it("현행 폼은 마이그레이션해도 같은 payload(멱등)", () => {
    const once = migratePersistedTransferForm(legacyRentalForm());
    const twice = migratePersistedTransferForm(once);
    expect(buildPropertyPayload(twice)).toEqual(buildPropertyPayload(once));
  });

  it("다건 이력 「편집」(`resumeTransferRecord`) — 스토어에 들어간 자산 폼이 마이그레이션돼 있다", async () => {
    const r = { ...record({ __multiTransfer: true, taxYear: 2025, properties: [{ ...item(legacyRentalForm()), completionPercent: 100 }] }, "multi") };
    const router = { push: vi.fn() } as unknown as Parameters<typeof resumeTransferRecord>[1];
    await resumeTransferRecord(r, router);
    expect(zodOk(useMultiTransferStore.getState().form.properties[0].form)).toBe(true);
  });
});
