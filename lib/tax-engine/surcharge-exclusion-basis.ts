/**
 * 감면주택 다주택 중과 배제의 근거 조문 — 세대 구성에 따라 달라진다(leaf: 엔진·결과 카드가 같은 값을 읽는다).
 * 순환 import 방지를 위해 legal-codes만 의존한다.
 */
import { MULTI_HOUSE } from "./legal-codes";

/** 중과 판정이 확정한 세대 구성 — 배제 근거 조문을 가르는 두 축(US-85). */
export interface SurchargeHousehold {
  /** 산입 조합원입주권·분양권 수(법 §104⑦2호·4호) */
  countedRightCount: number;
  /** 산입 주택·권리를 합한 유효 수(`MultiHouseSurchargeResult.effectiveHouseCount`) */
  effectiveHouseCount: number;
}

/**
 * 감면주택 중과 배제의 근거 조문 — 세대 구성에 따라 배제를 정하는 조항이 달라진다(소득세법 §104⑦ · US-85 · NH-82).
 * 감면주택의 정의 조항은 §98이 §167의3①3호, 나머지가 ①5호다.
 *   주택만 · 3 이상    → §167의3① 각 호 **직접**
 *   주택만 · 2주택     → §167의10①2호 **준용**(세대 구성을 모르는 기본값)
 *   주택 1 + 권리 1    → §167의11①2호 준용
 *   주택 + 권리 합 3 이상 → §167의4③2호 준용
 * 단일 소스: STEP 0.45 근거(`buildSurchargeExclusionStep`)와 결과 카드 문구가 모두 이 값을 읽는다.
 */
export function surchargeExclusionBasis(id: string | undefined, household?: SurchargeHousehold): string {
  const def = id === "unsold_98" ? MULTI_HOUSE.TAX_INCENTIVE_RENTAL_3_BASIS : MULTI_HOUSE.TAX_INCENTIVE_HOUSE_5_BASIS;
  const rights = household?.countedRightCount ?? 0;
  const threePlus = (household?.effectiveHouseCount ?? 0) >= 3;
  if (rights === 0 && threePlus) return def;
  const regime =
    rights > 0
      ? threePlus
        ? MULTI_HOUSE.HOUSE_RIGHT_3PLUS_REFERENCE_BASIS
        : MULTI_HOUSE.HOUSE_RIGHT_ONE_EACH_REFERENCE_BASIS
      : MULTI_HOUSE.TWO_HOUSE_167_3_REFERENCE_BASIS;
  return `${def}·${regime.replace(DECREE_PREFIX, "")}`;
}
const DECREE_PREFIX = "소득세법 시행령 ";

/** STEP 0.45 배제 단계 라벨 — 결과 카드가 이 단계의 근거(`legalBasis`)를 읽는 키(US-85). */
export const SURCHARGE_EXCLUSION_STEP_LABEL = "감면주택 다주택 중과 배제";

/** 결과 steps에서 STEP 0.45 근거를 꺼낸다 — 없으면(배제 안 됨·합산 경로) undefined. */
export function findSurchargeExclusionBasis(
  steps: ReadonlyArray<{ label: string; legalBasis?: string }> | undefined,
): string | undefined {
  return steps?.find((s) => s.label === SURCHARGE_EXCLUSION_STEP_LABEL)?.legalBasis || undefined;
}
