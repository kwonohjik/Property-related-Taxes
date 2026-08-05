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

export function capexHint(label: string, mode: PartAcqMode): string {
  if (mode === "estimated") {
    return `${label}이 환산취득가여서 「환산취득가 + 개산공제」와 「자본적지출」 중 큰 쪽만 필요경비가 됩니다 (소득세법 §97②2호). 없으면 비워두세요`;
  }
  if (mode === "appraisal" || mode === "salesCase") {
    return `${label}은 추계 취득가액이라 개산공제(§163⑥)가 적용되고 자본적지출은 차감되지 않습니다. 없으면 비워두세요`;
  }
  return `${label}에 귀속되는 자본적지출만 입력, 없으면 비워두세요`;
}
