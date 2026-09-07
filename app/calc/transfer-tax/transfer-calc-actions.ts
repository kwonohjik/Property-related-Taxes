/**
 * 단건 계산기의 **부수효과 액션** — 다건 store 브리지와 가산세 2-패스 호출.
 *
 * `TransferTaxCalculator.tsx`에서 분리했다(800줄 정책, 2026-09-07). 그 파일은 마법사
 * 오케스트레이션·레이아웃을 맡고, 이 파일은 **store를 건드리거나 API를 두 번 부르는**
 * 흐름을 맡는다 — 둘 다 렌더와 무관하고 테스트에서 단독 호출할 수 있는 축이다.
 *
 * ⚠️ 방향은 한쪽뿐이다 — 계산기가 이 파일을 부르고, 이 파일은 컴포넌트를 참조하지 않는다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxPenaltyResult } from "@/lib/tax-engine/transfer-tax-penalty";
import { useMultiTransferStore, generatePropertyId } from "@/lib/stores/multi-transfer-tax-store";
import { calcPropertyCompletion } from "@/lib/calc/multi-transfer-tax-validate";
import { useCalcWizardStore, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** 양도일 문자열에서 과세연도. 파싱 불가면 다건 store를 건드리지 않는다. */
function taxYearOf(transferDate: string | undefined): number | undefined {
  if (!transferDate) return undefined;
  const year = parseInt(transferDate.slice(0, 4), 10);
  return Number.isNaN(year) ? undefined : year;
}

/**
 * 단건 계산 완료분을 다건 store의 「양도 1번」으로 자동 백업하고, 그 propertyId를 돌려준다.
 *
 * 🔴 Q28 — 호출부가 **비어 있거나 이 세션이 만든 백업일 때만** 부른다. 사용자가 다건에서
 *    직접 만든 자산을 경고 없이 지우면 안 된다(판정은 `multiStoreHasUserWork`).
 */
export function backupSingleToMulti(formData: TransferFormData): string {
  const multiStore = useMultiTransferStore.getState();
  const newItem = {
    propertyId: generatePropertyId(),
    propertyLabel: "양도 1번",
    form: formData,
    completionPercent: calcPropertyCompletion(formData),
  };
  multiStore.reset();
  multiStore.addProperty(newItem);
  const year = taxYearOf(formData.transferDate);
  if (year !== undefined) multiStore.setForm({ taxYear: year });
  return newItem.propertyId;
}

/**
 * 「동일연도 다른 양도건 계산하기」 — 단건 입력을 다건 자산1로 옮기고 빈 자산2를 열어 준다.
 * 마법사 store도 자산2로 갈아 끼워, 이동 직후 사용자가 곧장 자산2 입력을 이어 간다.
 */
export function continueToMulti(
  formData: TransferFormData,
  navigate: (href: string) => void,
): void {
  const multiStore = useMultiTransferStore.getState();
  const wizardStore = useCalcWizardStore.getState();

  multiStore.reset();

  multiStore.addProperty({
    propertyId: generatePropertyId(),
    propertyLabel: "양도 1번",
    form: formData,
    completionPercent: calcPropertyCompletion(formData),
  });

  const asset2Form = createDefaultTransferFormData();
  multiStore.addProperty({
    propertyId: generatePropertyId(),
    propertyLabel: "양도 2번",
    form: asset2Form,
    completionPercent: 0,
  });

  const year = taxYearOf(formData.transferDate);
  if (year !== undefined) multiStore.setForm({ taxYear: year });

  multiStore.setActiveProperty(1);
  multiStore.setStep("edit");

  wizardStore.reset();
  wizardStore.updateFormData(asset2Form);
  wizardStore.setStep(0);

  navigate("/calc/transfer-tax/multi");
}

export interface PenaltyCalcCallbacks {
  setDeterminedTax: (v: number) => void;
  setUnpaidTax: (v: string) => void;
  setPenaltyResult: (v: TransferTaxPenaltyResult | null) => void;
  setError: (msg: string) => void;
}

/**
 * 가산세 2-패스 계산 — ① 가산세 없이 결정세액 확보 → ② 미납세액 자동 산출 → ③ 가산세 포함 재계산.
 *
 * 🔴 단건이 아닌 응답에서 종전에는 **조용히 return**했다. 다자산 일괄·겸용주택에서 버튼을
 *    눌러도 아무 반응이 없어 사용자는 눌린 것조차 확신할 수 없었다(2026-09-07 대장 재대조).
 *    막는 것 자체는 옳다 — 그 모드는 결정세액이 자산별로 나뉘어 미납세액이 단일 값이 아니다.
 *    ⇒ 막되 **사유를 말한다**.
 */
export async function runPenaltyCalc(
  formData: TransferFormData,
  cb: PenaltyCalcCallbacks,
): Promise<void> {
  const baseRes = await callTransferTaxAPI({ ...formData, enablePenalty: false });
  if (baseRes.mode !== "single") {
    cb.setError(
      "가산세 계산은 자산 1건(단건) 모드에서만 지원됩니다. 다자산 일괄양도·겸용주택은 결정세액이 자산별로 나뉘어 미납세액을 단일 값으로 확정할 수 없습니다.",
    );
    return;
  }
  const detTax = baseRes.result.determinedTax;
  cb.setDeterminedTax(detTax);

  const priorPaid = parseAmount(formData.priorPaidTax ?? "0");
  const autoUnpaid = Math.max(0, detTax - priorPaid);
  const updatedUnpaidTax = autoUnpaid > 0 ? String(autoUnpaid) : "0";
  cb.setUnpaidTax(updatedUnpaidTax);

  const penaltyRes = await callTransferTaxAPI({ ...formData, unpaidTax: updatedUnpaidTax });
  const penaltyResult =
    penaltyRes.mode === "single" ? (penaltyRes.result.penaltyDetail ?? null) : null;
  cb.setPenaltyResult(penaltyResult);
  if (!penaltyResult) {
    cb.setError("가산세 항목을 입력해 주세요. (신고 유형 또는 미납세액+납부기한)");
  }
}
