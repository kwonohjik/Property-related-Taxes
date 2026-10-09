/**
 * 「토지는 다른 원인으로 취득」 토지 파트 표시 문구 — 신축·매매 호스트 공용(D1-2).
 *
 * 신축은 블록 안 칸이, 매매는 기존 칸(취득일 2열의 토지 칸 · 취득가액 산정 방식의 토지 칸)이 같은 문구를 쓴다 —
 * 같은 사실에 두 문구가 생기지 않게 한 곳에 둔다.
 */
import { SPLIT_LAND_VALUE_LABEL } from "@/lib/tax-engine/transfer-tax-split-display";

export type LandCause = "inheritance" | "gift";

export const LAND_CAUSE_META: Record<
  LandCause,
  {
    label: string;
    dateLabel: string;
    /** 가액의 이름(「상속개시일 평가액」) — 결과 상세명세서 파트 태그 `토지(상속개시일 평가액)`도 이 값을 쓴다(D1-3) */
    valueLabel: string;
    priceLabel: string;
    hint: string;
    fixedMode: string;
  }
> = {
  inheritance: {
    label: "상속",
    dateLabel: "상속개시일",
    valueLabel: SPLIT_LAND_VALUE_LABEL.inheritance,
    priceLabel: "토지 상속개시일 평가액",
    hint: "상속세 신고서상 토지 평가액 (소득세법 시행령 §163⑨ — 상속개시일 현재 상증법 §60~§66 평가액)",
    fixedMode: "실거래가 · 상속개시일 평가액",
  },
  gift: {
    label: "증여",
    dateLabel: "증여일",
    valueLabel: SPLIT_LAND_VALUE_LABEL.gift,
    priceLabel: "토지 증여 신고가액",
    hint: "증여세 신고서상 토지 평가액 (증여일 현재 시가 또는 보충적 평가액)",
    fixedMode: "실거래가 · 증여 신고가액",
  },
};
