/**
 * 1세대1주택 AI 사실 추출 — 추출한 폼 조각을 판정 메뉴 폼(`OneHouseJudgmentFormData`)에 합친다.
 *
 * 빈 판정 메뉴 폼(`createInitialOneHouseJudgmentForm`) 위에 추출한 칸만 덮는다. 명부 행은 화면 「+ 주택 추가」와 같은
 * 기본값(`createHouseEntry`) 위에 덮는다 — 추출해 넣은 행과 직접 추가한 행이 같은 모양이어야 ⑧ 검증·판정이 같다.
 */
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { createHouseEntry } from "@/lib/stores/house-entry-factory";
import type { ExtractedForm } from "./apply-extraction";

export function mergeExtractedForm(fragment: ExtractedForm): OneHouseJudgmentFormData {
  const base = createInitialOneHouseJudgmentForm();
  const { asset, houses, ...top } = fragment;
  const extractedAsset = asset ?? {};
  // 거주를 총 개월로만 받았으면 직접 입력 모드 — 구간 입력(기본값)에서는 개월 칸이 읽히지 않는다.
  const monthsOnly =
    extractedAsset.residencePeriodMonthsAsset !== undefined && !Array.isArray(extractedAsset.residencePeriods);
  return {
    ...base,
    ...top,
    assets: [
      migrateAsset({
        ...base.assets[0],
        ...(monthsOnly ? { residenceInputMode: "direct", residencePeriods: [] } : {}),
        ...extractedAsset,
      }),
    ],
    houses: (houses ?? []).map((h, i) => ({ ...createHouseEntry(h.id ?? `house_ai_${i + 1}`), ...h })),
  } as OneHouseJudgmentFormData;
}
