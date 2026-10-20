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
import { hasDeclaredUnconditionalExemption } from "@/lib/tax-engine/non-business-land/form-mapper-helpers";
import { getLandCategoryGroup } from "@/lib/tax-engine/non-business-land/land-category";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import { isUrbanForFarmland } from "@/lib/tax-engine/non-business-land/urban-area";
import type {
  LandType,
  NonBusinessLandInput,
  ZoneType,
  UnconditionalExemptionInput,
  UnconditionalExemptionReason,
} from "@/lib/tax-engine/non-business-land/types";

/**
 * 무조건 의제 토글 식별자 (AssetForm nblExempt* 6종).
 * ③1호(2006.12.31. 이전 상속)는 토글이 없다 — ③4호 나목과 함께 취득원인·상속개시일로 자동 판정한다
 * (계획서 `docs/00-pm/nbl-unconditional-inherit-cause.plan.md`).
 * ③4호 가목(도시지역 농지 종중)도 토글이 없다 — 「종중 소유」 하나로 받고 근거 조문은 지목·도시지역으로 고른다
 * (계획서 `docs/00-pm/nbl-jongjoong-toggle-merge.plan.md`).
 */
export type NblExemptToggleKey =
  | "longOwned20y"
  | "ancestor8Year"
  | "publicExpropriation"
  | "factoryAdjacent"
  | "jongjoongOwned"
  | "inong";

/** 각 토글의 개별 상태 (ON일 때만 존재) */
export interface ToggleExemptionStatus {
  /** 이 토글 단독으로 의제가 성립하는가 (엔진 판정) */
  qualifies: boolean;
  /** 미충족 시 사용자에게 보여줄 요건 안내 (서술 텍스트 — 판정 아님) */
  requirementHint: string;
}

export interface NblExemptionEval {
  /** 선언 토글(또는 양도원인 공익수용) 중 하나라도 ON — 자동 판정 사유(상속)는 포함하지 않는다 */
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
      "직계존속·배우자가 8년 이상 재촌·자경한 농지·임야·목장을 상속·증여받고(취득원인이 상속·증여), 양도 당시 도시지역(주거·상업·공업)이 아니어야 확정됩니다.",
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
      "자산 취득일이 2005.12.31. 이전이고 지목이 농지·임야·목장이어야 확정됩니다.",
  },
  {
    key: "inong",
    flagField: "nblExemptInong",
    uncondField: "isInong",
    requirementHint:
      "이농일이 2006.12.31. 이전이고 2009.12.31.까지 양도, 지목이 농지여야 확정됩니다. " +
      "그 밖의 농지는 무조건 사업용이 아니라 이농일부터 3년을 사업용 기간으로 셉니다(소득령 §168의8③3호).",
  },
];

/**
 * 「종중 소유」 토글의 법령 배지 — 엔진 종중 분기(`unconditional-exemption.ts`)와 같은 기준으로 근거 조문을 고른다.
 * 지목 미선택이면 농지 조문을 「등」으로 보인다.
 */
export function jongjoongLegalBadge(asset: Pick<AssetForm, "nblLandType" | "nblZoneType">): {
  legalBasis: string;
  label: string;
} {
  const group = getLandCategoryGroup((asset.nblLandType ?? "") as LandType);
  if (group === "forest") return { legalBasis: "소득세법시행령 §168조의9", label: "소득령 §168의9③8호" };
  if (group === "pasture") return { legalBasis: "소득세법시행령 §168조의10", label: "소득령 §168의10②2호" };
  if (group === "farmland" && isUrbanForFarmland((asset.nblZoneType || "undesignated") as ZoneType)) {
    return { legalBasis: "소득세법시행령 §168조의14", label: "소득령 §168의14③4호가목" };
  }
  if (group === "farmland") return { legalBasis: "소득세법시행령 §168조의8", label: "소득령 §168의8③6호" };
  return { legalBasis: "소득세법시행령 §168조의8", label: "소득령 §168의8③6호 등" };
}

/** Invalid Date — 미입력 날짜의 비교는 항상 false가 되어 조기 확정을 막는다 */
const INVALID_DATE = new Date(NaN);

/**
 * 무조건 의제 판정의 **입력 레코드 단일 소스** (E5-02·A3-02, 2026-09-02 코드리뷰).
 *
 * `buildUnconditionalExemption`은 평면 `Record`를 읽는데 `AssetForm`의 이월과세 증여자 취득일은
 * `carryover.donorAcquisitionDate`로 **중첩**되어 있다(평면 `donorAcquisitionDate`는 일반증여 축의
 * 별개 필드다). 종전에는 ④ raw 빌더만 그 중첩을 평면으로 풀어 넘기고 이 어댑터는 `asset`을 그대로
 * 넘겨, 같은 자산에서 **클라이언트와 서버의 의제 판정이 갈렸다**.
 *
 * ④ `buildNonBusinessLandRaw`도 이 함수를 쓴다 — 매핑 규칙을 한 곳에만 둔다.
 */
export function buildUncondSourceRecord(asset: AssetForm): Record<string, unknown> {
  return {
    ...(asset as unknown as Record<string, unknown>),
    // §168의14③3호나목 취득일 소급 — 상속=피상속인 취득일(평면) / 이월과세=증여자 취득일(중첩)
    donorAcquisitionDate: asset.carryover?.donorAcquisitionDate ?? "",
  };
}

/**
 * 서버 매퍼(`buildUnconditionalExemption`)의 `has` 게이트와 **동일 조건**.
 *
 * 종전 `anyToggleOn`은 `nblExempt*` 8토글만 봤는데, 서버는 「양도원인 = 공익수용」 단독으로도
 * §168의14③3호 판정을 트리거한다. 그래서 섹션 토글 없이 양도원인만 수용인 자산에서
 * 클라이언트는 의제 미성립, 서버는 성립으로 갈렸다 (A1-03·A2-03·A3-03).
 */
function hasAnyExemptionTrigger(asset: AssetForm): boolean {
  return hasDeclaredUnconditionalExemption(buildUncondSourceRecord(asset));
}

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

/**
 * 특정 토글 하나만 남긴 uncond 사본 (날짜는 유지).
 * 남기는 표지도 매퍼가 정한 값을 그대로 쓴다 — `true`로 덮으면 매퍼 게이트(③1의2호 취득원인 등)가 배지에서만 풀린다.
 * 상속개시일은 어느 토글의 것도 아니라(③1호·③4호 나목 자동 판정) 지운다 — 남기면 다른 토글의 배지가 상속 사유로 「충족」이 된다.
 */
function isolate(
  uncond: UnconditionalExemptionInput,
  only: keyof UnconditionalExemptionInput,
): UnconditionalExemptionInput {
  const keep = (f: keyof UnconditionalExemptionInput) => only === f && uncond[f] === true;
  return {
    ...uncond,
    isInheritedBefore2007: false,
    inheritanceDate: undefined,
    ownedOver20YearsBefore2007: keep("ownedOver20YearsBefore2007"),
    isAncestor8YearFarming: keep("isAncestor8YearFarming"),
    isPublicExpropriation: keep("isPublicExpropriation"),
    isFactoryAdjacent: keep("isFactoryAdjacent"),
    isJongjoongOwned: keep("isJongjoongOwned"),
    isInong: keep("isInong"),
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
  const record = buildUncondSourceRecord(asset);
  const anyToggleOn = hasAnyExemptionTrigger(asset);

  // 선언이 없어도 상속 자산이면 정의된다(③1호·③4호 나목 자동 판정 — 서버 매퍼와 같은 함수).
  const uncond = buildUnconditionalExemption(record, toOptionalDate);
  if (!uncond) {
    return { anyToggleOn, isExempt: false, perToggle: {} };
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
    anyToggleOn,
    isExempt: agg.isExempt,
    matched: agg.isExempt
      ? { reason: agg.reason, detail: agg.detail, legalBasis: agg.legalBasis }
      : undefined,
    perToggle,
  };
}
