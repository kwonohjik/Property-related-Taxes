/**
 * 「토지는 다른 원인으로 취득」 토지 파트 표시 문구 — 신축·매매 호스트 공용(D1-2).
 *
 * 신축은 블록 안 칸이, 매매는 기존 칸(취득일 2열의 토지 칸 · 취득가액 산정 방식의 토지 칸)이 같은 문구를 쓴다 —
 * 같은 사실에 두 문구가 생기지 않게 한 곳에 둔다.
 */
import { SPLIT_CAUSE_VALUE_LABEL } from "@/lib/tax-engine/transfer-tax-split-display";

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
    valueLabel: SPLIT_CAUSE_VALUE_LABEL.inheritance,
    priceLabel: "토지 상속개시일 평가액",
    hint: "상속세 신고서상 토지 평가액 (소득세법 시행령 §163⑨ — 상속개시일 현재 상증법 §60~§66 평가액)",
    fixedMode: "실거래가 · 상속개시일 평가액",
  },
  gift: {
    label: "증여",
    dateLabel: "증여일",
    valueLabel: SPLIT_CAUSE_VALUE_LABEL.gift,
    priceLabel: "토지 증여 신고가액",
    hint: "증여세 신고서상 토지 평가액 (증여일 현재 시가 또는 보충적 평가액)",
    fixedMode: "실거래가 · 증여 신고가액",
  },
};

/**
 * 「건물을 상속·증여로 취득」 건물 파트 표시 문구 — D2 매매 블록 건물 원인 모드(`LandBuildingSplitSection`)용.
 * 결과 상세명세서 파트 태그 「건물(상속개시일 평가액)」은 파트 중립 상수 `SPLIT_CAUSE_VALUE_LABEL`을 쓴다(`partTag`, D2-3) —
 * 입력 라벨 「건물 상속개시일 평가액」과 같은 어휘다.
 */
export const BUILDING_CAUSE_META: Record<
  LandCause,
  { priceLabel: string; hint: string; fixedMode: string }
> = {
  inheritance: {
    priceLabel: "건물 상속개시일 평가액",
    hint: "상속세 신고서상 건물 평가액 (소득세법 시행령 §163⑨ — 상속개시일 현재 상증법 §60~§66 평가액, 건물분만)",
    fixedMode: "실거래가 · 상속개시일 평가액",
  },
  gift: {
    priceLabel: "건물 증여 신고가액",
    hint: "증여세 신고서상 건물 평가액 (증여일 현재 시가 또는 보충적 평가액, 건물분만)",
    fixedMode: "실거래가 · 증여 신고가액",
  },
};
