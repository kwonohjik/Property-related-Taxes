/**
 * 재산세 별도합산 철거ㆍ멸실 특례 판정 echo(`landSplit.demolishedVerdict`) → 결과 화면·PDF 문구 (PSA-U1).
 * 판정·세액은 엔진이 이미 정했다 — 이 모듈은 echo 값을 읽어 문장으로 풀 뿐이다(날짜·시행본 비교 없음).
 * 접힘 사유별·요건별 고지 문장은 엔진이 `result.warnings`로 내므로(고지 상수 단일 소스) 여기서 다시 짓지 않는다.
 */
import type { LandDemolishedVerdictEcho } from "@/lib/tax-engine/separate-aggregate-land";
import type { PropertyDemolishedFoldReason } from "@/lib/tax-engine/property-separate-requirements";

export const PROPERTY_DEMOLISHED_FOLD_REASON_LABEL = {
  not_yet: "과세기준일 시행본에 철거ㆍ멸실 특례가 없음",
  period: "한시 기간이 지남",
  permit: "허가·사용승인을 받지 않았거나 확인되지 않음",
  other_use: "철거 후 건축을 위한 용도 외로 사용(또는 확인되지 않음)",
  public_use_unpaid: "국가 등의 무상 공용·공공용 사용(비과세 가능성 — 계산기는 비과세를 판정하지 않음)",
  area_input: "철거 전 바닥면적·용도지역을 확인할 수 없음",
  input: "철거일·철거된 것의 종류·과세기준일을 확인할 수 없음",
} as const satisfies Record<PropertyDemolishedFoldReason, string>;

const MONTHS_TEXT: Record<number, string> = { 6: "6개월", 12: "1년", 36: "3년(빈집정비사업 철거 빈집)" };

export interface PropertyDemolishedVerdictLine {
  key: "period" | "outcome" | "area" | "required" | "vacant";
  label: string;
  text: string;
}

/** 읽은 칸 집합 → «허가·사용승인 · 건축 외 용도 · …» (요구 술어 echo — 화면이 «왜 이 칸을 물었나»를 같은 값으로 말한다) */
function requiredText(r: LandDemolishedVerdictEcho["required"]): string {
  const names: string[] = [];
  if (r.permit) names.push("허가·사용승인");
  if (r.otherUse) names.push("철거 후 건축 외 용도");
  if (r.vacantHouse) names.push("빈집정비사업 철거");
  if (r.publicUse) names.push("국가 등 공용·공공용 사용");
  if (r.publicUsePaid) names.push("유료·재산세 부과");
  if (r.floorArea) names.push("철거 전 바닥면적·용도지역");
  return names.length > 0 ? names.join(" · ") : "없음(한시 기간 밖이거나 그 시행본에 요건 문언이 없음)";
}

/** 판정 echo → 결과 카드·PDF 행. 문장은 echo 값에서만 만든다. */
export function propertyDemolishedVerdictLines(v: LandDemolishedVerdictEcho): PropertyDemolishedVerdictLine[] {
  const lines: PropertyDemolishedVerdictLine[] = [
    {
      key: "period",
      label: "한시 기간",
      text: v.periodMonths > 0 ? `철거ㆍ멸실일부터 ${MONTHS_TEXT[v.periodMonths]}(과세기준일 시행본)` : "과세기준일 시행본에 한시 기간 규정이 없거나 판정할 수 없음",
    },
    {
      key: "outcome",
      label: "판정",
      text:
        v.kind === "holds"
          ? "별도합산 유지"
          : `종합합산으로 접힘 — ${v.foldReason ? PROPERTY_DEMOLISHED_FOLD_REASON_LABEL[v.foldReason] : "사유 확인 필요"}`,
    },
  ];
  if (v.kind === "holds") {
    lines.push({
      key: "area",
      label: "면적 범위",
      text: v.areaClauseApplied
        ? "철거 전 바닥면적 × 용도지역 적용배율 범위만 별도합산, 초과분은 종합합산으로 이관"
        : "그 과세기준일 시행본에 바닥면적 × 배율 범위 문언이 없거나 주택이라 부속토지 전체를 별도합산 범위로 봄 — 범위 확인 필요",
    });
  }
  lines.push({ key: "required", label: "입력이 필요했던 칸", text: requiredText(v.required) });
  if (v.vacantHouseExtensionUnconfirmed) {
    lines.push({
      key: "vacant",
      label: "확인 필요",
      text: "빈집정비사업 철거 여부가 확인되지 않아 일반 한시 기간만 반영했습니다 — 빈집정비 철거이면 3년까지 인정될 수 있습니다.",
    });
  }
  return lines;
}
