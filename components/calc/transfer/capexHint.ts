/**
 * 자본적지출 칸 hint — **파트 취득 방식에 따라 실제 반영 여부가 다르다**(엔진 `applyAssetSwap`).
 *
 * · 실가(actual): 필요경비로 전액 차감 (「소득세법」 제97조 제1항 제2호)
 * · 환산(estimated): 「환산취득가 + 개산공제」(가목) ↔ 「자본적지출」(나목) **택일** — 같은 조 제2항 제2호 단서
 * · 감정·매매사례: 개산공제(같은 법 시행령 제163조 제6항)만 적용되고 자본적지출은 차감되지 않는다
 *
 * `LandBuildingSplitSection`(주택·건물)에서 승격했다(2026-08-05 P5) — 일반건물 파트 카드가
 * **같은 문구**를 쓰기 위함이다. 규칙이 갈리면 같은 상황에 다른 설명이 뜬다.
 */
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

/** 이월과세 × 당초 증여 채무 부분(매입분)을 나누는 파트의 실가 자본적지출 — 증여분과 채무 인수 부분이 같은 몫으로 나눠 쓴다(계획서 Q-2 a). 환산 파트는 문구를 정하지 않는다(엔진 설계서 §3.5 · V-1 · V-2). */
export const CAPEX_DEBT_SPLIT_SENTENCE =
  " 당초 증여 때 채무를 인수했으면 증여분과 채무 인수 부분에 같은 몫(증여 당시 평가액 − 인수한 채무 : 인수한 채무)으로 나누어 적용합니다.";

/**
 * @param debtSplits 이 파트에 채무 부분(매입분) 조각 규칙이 적용된다 — 실가 모드에서만 «같은 몫» 문장을 덧붙인다.
 */
export function capexHint(label: string, mode: PartAcqMode, withExtension = false, debtSplits = false): string {
  if (mode === "estimated") {
    return `${label}이 환산취득가여서 「환산취득가 + 개산공제」와 「자본적지출」 중 큰 쪽만 필요경비가 됩니다 (소득세법 §97②2호). 없으면 비워두세요`;
  }
  if ((mode === "appraisal" || mode === "salesCase") && withExtension) {
    // 일반건물 증축 — 원건물은 개산공제만이지만 증축분은 자기 취득방식대로 받는다(`gb-extension-capex-timing.plan.md` §10).
    return `원건물은 추계 취득가액이라 개산공제(§163⑥)만 적용되고 자본적지출은 차감되지 않습니다. 증축 후 지출의 증축분 몫은 증축분 취득방식대로 반영됩니다(실지거래가액이면 가산, 환산취득가액이면 개산공제와 비교 — §97②). 없으면 비워두세요`;
  }
  if (mode === "appraisal" || mode === "salesCase") {
    return `${label}은 추계 취득가액이라 개산공제(§163⑥)가 적용되고 자본적지출은 차감되지 않습니다. 없으면 비워두세요`;
  }
  return `${label}에 귀속되는 자본적지출만 입력, 없으면 비워두세요${debtSplits ? "." + CAPEX_DEBT_SPLIT_SENTENCE : ""}`;
}
