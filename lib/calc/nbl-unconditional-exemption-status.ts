/**
 * 무조건 사업용 의제(§168-14③) — UI 상태 어댑터
 *
 * 배너·지목별 비활성·토글 뱃지를 엔진의 "실제" 판정 기준으로 구동하기 위한 얇은 어댑터.
 * 날짜·지역·지목 조건을 UI에서 재구현하지 않고, 엔진 순수 함수를 그대로 재사용한다
 * (memory feedback_ui_engine_dual_truth_avoidance).
 *
 *   - buildUnconditionalExemption : AssetForm 평면 → 엔진 UnconditionalExemptionInput
 *   - getLandCategoryGroup        : nblLandType → LandCategoryGroup (미선택 → "unknown")
 *   - checkUnconditionalExemption : 실제 의제 판정 (날짜/지역/지목 조건)
 *
 * 셋 다 순수·client-safe (date-fns + type import만).
 */

import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { buildUnconditionalExemption } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { getLandCategoryGroup } from "@/lib/tax-engine/non-business-land/land-category";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import type {
  LandType,
  NonBusinessLandInput,
  UnconditionalExemptionInput,
  UnconditionalExemptionReason,
} from "@/lib/tax-engine/non-business-land/types";

/** 무조건 의제 토글 식별자 (AssetForm nblExempt* 8종) */
export type NblExemptToggleKey =
  | "inheritBefore2007"
  | "longOwned20y"
  | "ancestor8Year"
  | "publicExpropriation"
  | "factoryAdjacent"
  | "jongjoongOwned"
  | "urbanFarmland"
  | "inong";

/** 각 토글의 개별 상태 (ON일 때만 존재) */
export interface ToggleExemptionStatus {
  /** 이 토글 단독으로 의제가 성립하는가 (엔진 판정) */
  qualifies: boolean;
  /** 미충족 시 사용자에게 보여줄 요건 안내 (서술 텍스트 — 판정 아님) */
  requirementHint: string;
}

export interface NblExemptionEval {
  /** 8토글 중 하나라도 ON (기존 anyExempt 대체) */
  anyToggleOn: boolean;
  /** 엔진 실제 판정 — 하나라도 요건 충족 */
  isExempt: boolean;
  /** 성립한 첫 사유 (배너 상세 문구) */
  matched?: {
    reason: UnconditionalExemptionReason;
    detail: string;
    legalBasis?: string;
  };
  /** ON 토글별 상태 (뱃지용). OFF 토글은 undefined */
  perToggle: Partial<Record<NblExemptToggleKey, ToggleExemptionStatus>>;
}

/** 토글 정의 — AssetForm flag ↔ 엔진 uncond boolean ↔ 요건 안내 */
interface ToggleDef {
  key: NblExemptToggleKey;
  flagField: keyof AssetForm;
  uncondField: keyof UnconditionalExemptionInput;
  requirementHint: string;
}

const TOGGLE_DEFS: readonly ToggleDef[] = [
  {
    key: "inheritBefore2007",
    flagField: "nblExemptInheritBefore2007",
    uncondField: "isInheritedBefore2007",
    requirementHint:
      "상속일이 2006.12.31. 이전이고 2009.12.31.까지 양도, 지목이 농지·임야·목장이어야 사업용으로 확정됩니다.",
  },
  {
    key: "longOwned20y",
    flagField: "nblExemptLongOwned20y",
    uncondField: "ownedOver20YearsBefore2007",
    requirementHint:
      "2006.12.31. 이전 20년 이상 소유 + 2009.12.31.까지 양도, 지목이 농지·임야·목장이어야 확정됩니다.",
  },
  {
    key: "ancestor8Year",
    flagField: "nblExemptAncestor8YearFarming",
    uncondField: "isAncestor8YearFarming",
    requirementHint:
      "직계존속·배우자가 8년 이상 재촌·자경한 농지·임야·목장을 상속·증여받고, 양도 당시 도시지역(주거·상업·공업)이 아니어야 확정됩니다.",
  },
  {
    key: "publicExpropriation",
    flagField: "nblExemptPublicExpropriation",
    uncondField: "isPublicExpropriation",
    requirementHint:
      "사업인정고시일이 2006.12.31. 이전이거나, 취득일이 고시일로부터 5년 이전이어야 사업용으로 확정됩니다.",
  },
  {
    key: "factoryAdjacent",
    flagField: "nblExemptFactoryAdjacent",
    uncondField: "isFactoryAdjacent",
    requirementHint:
      "소유자 요구로 취득한 공장 부속토지의 인접토지에 해당하면 사업용으로 확정됩니다.",
  },
  {
    key: "jongjoongOwned",
    flagField: "nblExemptJongjoongOwned",
    uncondField: "isJongjoongOwned",
    requirementHint:
      "취득일이 2005.12.31. 이전이고 지목이 농지·임야·목장이어야 확정됩니다.",
  },
  {
    key: "urbanFarmland",
    flagField: "nblExemptUrbanFarmlandJongjoong",
    uncondField: "isUrbanFarmlandJongjoongOrInherited",
    requirementHint:
      "지목이 농지여야 확정됩니다 (도시지역 內 종중 또는 상속 5년 이내 양도 농지).",
  },
  {
    key: "inong",
    flagField: "nblExemptInong",
    uncondField: "isInong",
    requirementHint:
      "이농일이 2006.12.31. 이전이고 2009.12.31.까지 양도, 지목이 농지여야 확정됩니다.",
  },
];

/** Invalid Date — 미입력 날짜의 비교는 항상 false가 되어 조기 확정을 막는다 */
const INVALID_DATE = new Date(NaN);

function buildMinimalInput(
  uncond: UnconditionalExemptionInput,
  transferDate: Date,
  acquisitionDate: Date,
  zoneType: string,
): NonBusinessLandInput {
  // checkUnconditionalExemption 이 실제로 읽는 필드만 채워 넘긴다(재구현 아님).
  return {
    unconditionalExemption: uncond,
    transferDate,
    acquisitionDate,
    zoneType,
  } as unknown as NonBusinessLandInput;
}

/** 특정 토글 하나만 true 로 격리한 uncond 사본 (날짜는 유지) */
function isolate(
  uncond: UnconditionalExemptionInput,
  only: keyof UnconditionalExemptionInput,
): UnconditionalExemptionInput {
  return {
    ...uncond,
    isInheritedBefore2007: only === "isInheritedBefore2007",
    ownedOver20YearsBefore2007: only === "ownedOver20YearsBefore2007",
    isAncestor8YearFarming: only === "isAncestor8YearFarming",
    isPublicExpropriation: only === "isPublicExpropriation",
    isFactoryAdjacent: only === "isFactoryAdjacent",
    isJongjoongOwned: only === "isJongjoongOwned",
    isUrbanFarmlandJongjoongOrInherited: only === "isUrbanFarmlandJongjoongOrInherited",
    isInong: only === "isInong",
  };
}

/**
 * AssetForm + 양도일로 무조건 의제의 실제 판정 상태를 계산한다.
 * 순수 함수 — 컴포넌트에서 useMemo로 감싸 사용한다.
 */
export function evaluateUnconditionalExemption(
  asset: AssetForm,
  transferDate: string,
): NblExemptionEval {
  const record = asset as unknown as Record<string, unknown>;
  const anyToggleOn = TOGGLE_DEFS.some((d) => asset[d.flagField] === true);

  if (!anyToggleOn) {
    return { anyToggleOn: false, isExempt: false, perToggle: {} };
  }

  const uncond = buildUnconditionalExemption(record, toOptionalDate);
  // anyToggleOn 이면 buildUnconditionalExemption 은 항상 정의됨(내부 has 가드와 동일 조건).
  if (!uncond) {
    return { anyToggleOn: true, isExempt: false, perToggle: {} };
  }

  const categoryGroup = getLandCategoryGroup((asset.nblLandType ?? "") as LandType);
  const transfer = toOptionalDate(transferDate) ?? INVALID_DATE;
  const acquisition = toOptionalDate(asset.acquisitionDate) ?? INVALID_DATE;
  const zoneType = asset.nblZoneType || "undesignated";

  // 전체 판정 — 배너 matched + isExempt
  const agg = checkUnconditionalExemption(
    buildMinimalInput(uncond, transfer, acquisition, zoneType),
    categoryGroup,
  );

  // 토글별 격리 판정 — 뱃지
  const perToggle: Partial<Record<NblExemptToggleKey, ToggleExemptionStatus>> = {};
  for (const def of TOGGLE_DEFS) {
    if (asset[def.flagField] !== true) continue;
    const res = checkUnconditionalExemption(
      buildMinimalInput(isolate(uncond, def.uncondField), transfer, acquisition, zoneType),
      categoryGroup,
    );
    perToggle[def.key] = {
      qualifies: res.isExempt,
      requirementHint: def.requirementHint,
    };
  }

  return {
    anyToggleOn: true,
    isExempt: agg.isExempt,
    matched: agg.isExempt
      ? { reason: agg.reason, detail: agg.detail, legalBasis: agg.legalBasis }
      : undefined,
    perToggle,
  };
}
