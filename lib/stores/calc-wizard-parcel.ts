/** 다필지(multi-parcel) UI 폼 상태·마이그레이션 — 800줄 정책에 따라 calc-wizard-asset.ts에서 분리. */

/** 다필지 UI 폼 상태 (문자열 기반) */
export interface ParcelFormItem {
  id: string;
  acquisitionDate: string;
  acquisitionMethod: "actual" | "estimated";
  acquisitionPrice: string;
  acquisitionArea: string;
  transferArea: string;
  standardPricePerSqmAtAcq: string;
  standardPricePerSqmAtTransfer: string;
  /**
   * 기타 필요경비 (deprecated — backward-compat 유지).
   * 신규 입력은 `capitalExpenditure` + `transferExpense` 분리 사용.
   */
  expenses: string;
  /** 자본적 지출액 (소득세법 §97① 가목) — §97② 단서 swap 비교에 사용 */
  capitalExpenditure: string;
  /** 양도비 (소득세법 §97① 나목) — §97② 단서 swap 비교에 사용 */
  transferExpense: string;
  useDayAfterReplotting: boolean;
  replottingConfirmDate: string;
  useExchangeLandReduction: boolean;
  entitlementArea: string;
  allocatedArea: string;
  priorLandArea: string;
  /**
   * 면적 입력 시나리오 (UI 전용, API 전송 시 제외)
   * - "same"      : 취득면적 = 양도면적 (일반)
   * - "reduction" : 감환지 — 교부면적 < 권리면적 (소득령 §162의2)
   * - "partial"   : 일부 양도 — 취득 토지 중 일부만 양도
   */
  areaScenario: "same" | "reduction" | "partial";
}

/** 구형 ParcelFormItem(areaScenario / 신규 경비 필드 없음)을 현재 타입으로 마이그레이션 */
export function migrateParcel(p: unknown): ParcelFormItem {
  const parcel = p as Record<string, unknown>;
  if (parcel.capitalExpenditure === undefined) parcel.capitalExpenditure = "0";
  if (parcel.transferExpense === undefined) parcel.transferExpense = "0";
  if (parcel.areaScenario) return parcel as unknown as ParcelFormItem;
  let areaScenario: ParcelFormItem["areaScenario"];
  if (parcel.useExchangeLandReduction) {
    areaScenario = "reduction";
  } else if (parcel.acquisitionArea && parcel.acquisitionArea === parcel.transferArea) {
    areaScenario = "same";
  } else {
    areaScenario = "partial";
  }
  return { ...(parcel as unknown as ParcelFormItem), areaScenario };
}
