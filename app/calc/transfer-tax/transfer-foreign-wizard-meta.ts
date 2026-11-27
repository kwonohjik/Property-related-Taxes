/**
 * 양도세 마법사 국외자산 분기 메타 — `TransferTaxCalculator.tsx`(800줄 정책)에서 분기 계산을 뺀 순수 함수.
 *
 * 국외는 1단계(국외자산 입력)뿐이다 — 보유 상황·감면·가산세는 국내 입력이라 **마운트하지 않는다**(지우는 것이 아니다 · 계획서 §3.2).
 * 단계 라벨을 쓰는 곳(스테퍼·사이드바·제목·`totalSteps`)은 전부 `foreignWizardMeta`가 준 배열 하나를 쓴다 —
 * `STEPS_SINGLE`을 직접 쓰는 곳이 남으면 국외에서 스테퍼가 국내 4단계를 보인다(회귀 가드 FRE-3).
 */
import { isForeignRealEstateForm } from "@/lib/calc/transfer-foreign-scope";
import { STEPS_SINGLE, STEP_TITLES } from "./transfer-calculator-meta";

export const STEPS_FOREIGN = ["국외자산"] as const;
export const STEP_TITLES_FOREIGN = ["국외자산 양도 정보 입력"] as const;

export interface TransferWizardMeta {
  isForeign: boolean;
  steps: readonly string[];
  titles: readonly string[];
}

export function foreignWizardMeta(form: { assetLocation?: "domestic" | "foreign" }): TransferWizardMeta {
  const isForeign = isForeignRealEstateForm(form);
  return isForeign
    ? { isForeign, steps: STEPS_FOREIGN, titles: STEP_TITLES_FOREIGN }
    : { isForeign, steps: STEPS_SINGLE, titles: STEP_TITLES };
}
