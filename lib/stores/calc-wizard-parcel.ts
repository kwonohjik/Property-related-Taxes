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
  // ── 공익수용 양도당시 기준시가 차감 특례 (소득세법 시행령 §164⑨ 1호) ──
  // **필지별**이다 — 필지마다 개별공시지가가 달라 min[] 선택이 독립 판정된다.
  // 노출 조건: 양도원인 수용 + 필지 환산 방식 + 양도일 ≥ 2009.02.04
  /** 보상가액 (원/㎡) */
  compensationPerSqm: string;
  /** 보상액 산정의 기초가 되는 기준시가 (원/㎡) */
  compensationBasisStdPrice: string;
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
  // §164⑨ 1호 보상 2필드 (2026-07-16) — 구 세션 복원 방어
  if (parcel.compensationPerSqm === undefined) parcel.compensationPerSqm = "";
  if (parcel.compensationBasisStdPrice === undefined) parcel.compensationBasisStdPrice = "";
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
