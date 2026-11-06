/**
 * 조특법 §99의4 선언 — 폼 값 읽기·④ 변환 단일 소스(④ `transfer-tax-api-reductions.ts`·⑤ 입력·⑧ 검증이 같이 부른다).
 *
 * ## 연접 여부(③ — 리뷰 NH-30 · Q-13)
 * 종전에는 토글 `isAdjacentArea`(기본 false)라 묻지 않아도 「연접 아님」으로 답해진 상태였다. 그 저장값의 `false`는
 * 사용자가 고른 답과 기본값을 구별할 수 없으므로 **미응답("")으로 강등**하고 다시 묻는다. 켠 값(`true`)은 사용자가 고른
 * 답이라 「예」로 읽는다. 새 값(`adjacentArea994`)이 있으면 그것이 정본이다.
 *
 * ## 면적(NH-05 PR-2b)
 * 빈 칸은 보내지 않는다(0으로 읽지 않음 — 엔진이 범위 안이면 불성립 + 확인 필요). 공동주택 전용면적은 명부 행 값
 * (`house-count-exclusion-rows.ts`가 `ruralHouseExclusiveAreaSqm994`로 채운다).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { parseDecimal } from "@/lib/calc/number-parse";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

export type New994AdjacentAnswer = "" | "yes" | "no" | "unknown";

type New994Form = Extract<AssetReductionForm, { type: "new_99_4_rural" | "new_99_4_hometown" }>;

export function new994AdjacentAnswer(r: {
  adjacentArea994?: New994AdjacentAnswer;
  isAdjacentArea?: boolean;
}): New994AdjacentAnswer {
  if (r.adjacentArea994) return r.adjacentArea994;
  return r.isAdjacentArea === true ? "yes" : "";
}

const positiveDecimal = (v: string | undefined) => {
  const n = parseDecimal(v || "");
  return n > 0 ? n : undefined;
};

/** 주택 면적 — 공동주택은 행 전용면적, 그 밖의 주택은 선언의 연면적. 유형 미응답이면 없음. */
export function new994HouseArea(r: New994Form): number | undefined {
  if (r.ruralHouseType994 === "multi_unit") return positiveDecimal(r.ruralHouseExclusiveAreaSqm994);
  if (r.ruralHouseType994 === "other") return positiveDecimal(r.ruralHouseFloorAreaSqm994);
  return undefined;
}

/** ④ — 날짜는 string 그대로(⑭ route-reductions-mapper가 Date 변환). */
export function toNew994Payload(r: New994Form) {
  const adjacent = new994AdjacentAnswer(r);
  const landArea = positiveDecimal(r.ruralLandAreaSqm994);
  const houseArea = new994HouseArea(r);
  const common994 = {
    ...(r.houseId ? { houseId: r.houseId } : {}),
    ruralHouseAcquisitionDate: r.ruralHouseAcquisitionDate || undefined,
    ruralHouseStdPrice: parseAmount(r.ruralHouseStdPrice || "0") || undefined,
    isRegisteredHanok: r.isRegisteredHanok,
    ...(adjacent ? { adjacentArea994: adjacent } : {}),
    meetsLocationRequirement: r.meetsLocationRequirement,
    ...(landArea !== undefined ? { ruralLandAreaSqm994: landArea } : {}),
    ...(r.ruralHouseType994 ? { ruralHouseType994: r.ruralHouseType994 } : {}),
    ...(houseArea !== undefined ? { ruralHouseAreaSqm994: houseArea } : {}),
    ...(r.ruralHouseRegionCode ? { ruralHouseRegionCode: r.ruralHouseRegionCode } : {}),
  };
  if (r.type === "new_99_4_hometown") {
    return {
      type: "new_99_4_hometown" as const,
      ...common994,
      meetsHometownRequirement: r.meetsHometownRequirement,
    };
  }
  return { type: "new_99_4_rural" as const, ...common994 };
}
