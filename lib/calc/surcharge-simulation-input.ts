/**
 * ⑤⑧④ 다주택 중과 판정 메뉴 ⑤ 세부담 시뮬레이션 입력 — 지원 범위 술어 · 입력 검증 · 본문(계획서 §4.7 · D8 · P8).
 *
 * 입력(취득가액·필요경비 합계)은 판정 **사실**이 아니라 store의 중과 슬롯(`simulationInput`)에 둔다 — 공유 폼(`formData`)에 두면
 * 칸을 고칠 때마다 두 판정 메뉴의 결과가 함께 무효화되고, 계산기 넘기기가 계산기의 필요경비 칸 구조(자본적지출·양도비 분리)와 엇갈린다.
 */
import { parseAmount } from "./number-parse";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

export interface SurchargeSimulationInputForm {
  acquisitionPrice: string;
  /** 필요경비 합계(자본적지출액 + 양도비) — 비우면 0 */
  expenses: string;
}

export function createInitialSurchargeSimulationInput(): SurchargeSimulationInputForm {
  return { acquisitionPrice: "", expenses: "" };
}

/** 상속·증여 취득 — ⑤가 이 술어와 route 응답(`not_purchase_housing` — 본문에 보이는 원인만 다시 확인한다)에 같은 문장을 쓴다 */
export const SIMULATION_NOT_PURCHASE_HOUSING_TEXT =
  "상속·증여로 취득한 주택은 취득가액과 보유기간을 정하는 방식이 달라 이 화면에서 계산하지 않습니다 — 양도세 계산기에서 확인하세요.";

/**
 * D8 — 매매로 취득한 주택만 계산한다. 상속·증여 취득은 취득가액 산정(§163⑨ 평가액 등)과 보유기간 기산이 달라 이 화면의 두 칸으로 계산하면
 * 틀린 세액이 나온다. 조합원입주권 양도는 판정 범위 밖이다(§104⑦은 주택 양도).
 */
export function surchargeSimulationUnsupportedReason(form: OneHouseJudgmentFormData): string | null {
  const primary = form.assets?.[0];
  if (!primary || primary.assetKind !== "housing") {
    return "조합원입주권 양도는 다주택 중과 대상이 아니라 비교할 세액이 없습니다.";
  }
  if (primary.acquisitionCause !== "purchase") {
    return SIMULATION_NOT_PURCHASE_HOUSING_TEXT;
  }
  return null;
}

/** ⑧ — 취득가액은 필수(0 불가). 필요경비는 비우면 0 */
export function surchargeSimulationInputError(input: SurchargeSimulationInputForm): string | null {
  return parseAmount(input.acquisitionPrice) > 0 ? null : "취득가액(실지거래가액)을 입력하세요.";
}

/** ④ 본문의 `simulation` 블록 */
export function toSurchargeSimulationPayload(input: SurchargeSimulationInputForm): { acquisitionPrice: number; expenses: number } {
  return { acquisitionPrice: parseAmount(input.acquisitionPrice), expenses: parseAmount(input.expenses) };
}
