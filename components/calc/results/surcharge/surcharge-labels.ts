/**
 * 다주택 중과 판정 결과 화면 표기 — 표·상세·세율 카드가 같은 라벨을 쓴다(계획서 §5.5 · P7).
 * 판정은 하지 않는다 — 응답 값을 글로 옮길 뿐이다(T5).
 */
import type { SurchargeRightRow } from "@/app/api/calc/multi-house-surcharge-judgment/surcharge-judgment-payload";
import type { MultiHouseSurchargeResult } from "@/lib/tax-engine/types/multi-house-surcharge.types";

export const SURCHARGE_TYPE_LABEL: Record<MultiHouseSurchargeResult["surchargeType"], string> = {
  none: "중과 없음",
  multi_house_2: "2주택 중과",
  multi_house_3plus: "3주택 이상 중과",
};

export const RIGHT_COUNT_REASON_LABEL: Record<SurchargeRightRow["countReason"], string> = {
  counted: "산입",
  presale_before_start: "2021.1.1. 전 취득 분양권 — 불산입",
  low_value_local: "가액기준 지역 3억 이하 — 불산입",
};

export const RIGHT_TYPE_LABEL: Record<SurchargeRightRow["type"], string> = {
  presale_right: "분양권",
  redevelopment_right: "조합원입주권",
};

/** 행 결론 한 줄 — 중과 유형 + 유예. 판정을 다시 하지 않고 결과 필드만 읽는다. */
export function rowConclusionLabel(r: Pick<MultiHouseSurchargeResult, "surchargeType" | "isSurchargeSuspended">): string {
  const base = SURCHARGE_TYPE_LABEL[r.surchargeType];
  return r.surchargeType !== "none" && r.isSurchargeSuspended ? `${base} — 한시 유예` : base;
}

/** 금액 칸 — 「원」 없이 천 단위 구분. 미입력·0은 「—」 */
export function priceCell(v: string | number | undefined | null): string {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("ko-KR") : "—";
}
