/**
 * 재산세 별도합산 철거ㆍ멸실 특례 판정 echo(`landSplit.demolishedVerdict`) → 결과 화면·PDF 문구 (PSA-U1).
 * 판정·세액은 엔진이 이미 정했다 — 이 모듈은 echo 값을 읽어 문장으로 풀 뿐이다(날짜·시행본 비교 없음).
 * 접힘 사유별·요건별 고지 문장은 엔진이 `result.warnings`로 내므로(고지 상수 단일 소스) 여기서 다시 짓지 않는다.
 */
import type { LandDemolishedVerdictEcho } from "@/lib/tax-engine/separate-aggregate-land";
import type { PropertyDemolishedAskField } from "@/lib/tax-engine/property-separate-requirements";
import type { PropertyDemolishedFoldReason } from "@/lib/tax-engine/property-separate-requirements";

export const PROPERTY_DEMOLISHED_FOLD_REASON_LABEL = {
  not_yet: "과세기준일 시행본에 철거ㆍ멸실 특례가 없음",
  period: "한시 기간이 지남",
  permit: "허가·사용승인을 받지 않았거나 확인되지 않음",
  other_use: "철거 후 건축을 위한 용도 외로 사용(또는 확인되지 않음)",
  public_use_unpaid: "국가 등의 무상 공용·공공용 사용(비과세 가능성 — 계산기는 비과세를 판정하지 않음)",
  area_input: "철거 전 바닥면적·용도지역을 확인할 수 없음",
  // 철거일 없음·읽을 수 없음·과세기준일 뒤(날짜 결함)가 주된 경우다. 종류는 한시 기간 안일 때만 읽으므로(2016~2023 과세기준일엔 판정을 바꾸지도 않는다) 직접 호출에서 종류가 빠진 경우로만 남는다.
  input: "철거일·과세기준일을 확인할 수 없거나 철거일이 과세기준일 뒤임(한시 기간 안이면 철거된 것의 종류도 필요)",
} as const satisfies Record<PropertyDemolishedFoldReason, string>;

const MONTHS_TEXT: Record<number, string> = { 6: "6개월", 12: "1년", 36: "3년(빈집정비사업 철거 빈집)" };
const ALL_KINDS_TEXT: Record<number, string> = { 6: "6개월", 12: "1년", 36: "3년" };

export interface PropertyDemolishedVerdictLine {
  key: "period" | "outcome" | "area" | "required" | "vacant";
  label: string;
  text: string;
}

/**
 * 사슬이 읽는 칸의 짧은 이름 — 결과 카드 «입력이 필요했던 칸»과 입력 화면의 낭독 한 줄(`role="status"`)이 같은 이름을 쓴다.
 * 철거 사슬 칸 id(엔진 `PropertyDemolishedAskField`) 전부를 키로 가져 칸이 늘면 컴파일이 막는다.
 */
export const PROPERTY_ASK_FIELD_NAME = {
  demolishedKind: "철거된 것의 종류",
  demolishedVacantHouse: "빈집정비사업 철거",
  demolishedPermit: "허가·사용승인",
  demolishedOtherUse: "철거 후 건축 외 용도",
  demolishedPublicUse: "국가 등 공용·공공용 사용",
  demolishedPublicUsePaid: "유료·재산세 부과",
  buildingFloorArea: "철거 전 바닥면적·용도지역",
} as const satisfies Record<PropertyDemolishedAskField, string>;

/**
 * 읽은 칸 집합 → «허가·사용승인 · 건축 외 용도 · …» (요구 술어 echo — 화면이 «왜 이 칸을 물었나»를 같은 값으로 말한다).
 * 칸이 하나도 없으면 «없음»이 아니라 **왜 더 묻지 않았는가**를 사실대로 말한다(별도합산 유지 · 날짜만으로 확정 · 앞의 답으로 확정).
 */
function requiredText(v: LandDemolishedVerdictEcho): string {
  const r = v.required;
  const names: string[] = [];
  if (r.permit) names.push(PROPERTY_ASK_FIELD_NAME.demolishedPermit);
  if (r.otherUse) names.push(PROPERTY_ASK_FIELD_NAME.demolishedOtherUse);
  if (r.vacantHouse) names.push(PROPERTY_ASK_FIELD_NAME.demolishedVacantHouse);
  if (r.publicUse) names.push(PROPERTY_ASK_FIELD_NAME.demolishedPublicUse);
  if (r.publicUsePaid) names.push(PROPERTY_ASK_FIELD_NAME.demolishedPublicUsePaid);
  if (r.floorArea) names.push(PROPERTY_ASK_FIELD_NAME.buildingFloorArea);
  if (names.length > 0) return names.join(" · ");
  if (v.kind === "holds") return "이 과세기준일 시행본에는 확인할 요건 칸이 없음";
  if (v.foldReason === "input") return "철거일 등을 확인할 수 없어 요건 칸을 읽지 못함";
  if (v.foldReason === "not_yet" || v.periodAllKinds) return "철거일(과세기준일)만으로 결과가 정해져 더 묻지 않음";
  return "앞의 답(또는 철거일)으로 결과가 정해져 더 묻지 않음";
}

/** 판정 echo → 결과 카드·PDF 행. 문장은 echo 값에서만 만든다. */
export function propertyDemolishedVerdictLines(v: LandDemolishedVerdictEcho): PropertyDemolishedVerdictLine[] {
  const lines: PropertyDemolishedVerdictLine[] = [
    {
      key: "period",
      label: "한시 기간",
      text: v.periodAllKinds
        ? // 날짜만으로 접혀 철거된 것의 종류·빈집정비 여부를 묻지 않았다 — 고지(`propertyDemolishedPeriodAllKindsNotice`)와 같이 두 기간이 모두 지났다고 말한다
          `철거ㆍ멸실일부터 일반 한시 기간(${ALL_KINDS_TEXT[v.periodAllKinds.general]})과 빈집정비사업 철거 빈집 한시 기간(${ALL_KINDS_TEXT[v.periodAllKinds.vacantHouse]}) 모두 경과(과세기준일 시행본)`
        : v.periodMonths > 0
          ? `철거ㆍ멸실일부터 ${MONTHS_TEXT[v.periodMonths]}(과세기준일 시행본)`
          : "과세기준일 시행본에 한시 기간 규정이 없거나 판정할 수 없음",
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
  lines.push({ key: "required", label: "입력이 필요했던 칸", text: requiredText(v) });
  if (v.vacantHouseExtensionUnconfirmed) {
    lines.push({
      key: "vacant",
      label: "확인 필요",
      text: "빈집정비사업 철거 여부가 확인되지 않아 일반 한시 기간만 반영했습니다 — 빈집정비 철거이면 3년까지 인정될 수 있습니다.",
    });
  }
  return lines;
}
