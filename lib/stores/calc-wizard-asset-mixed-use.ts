/**
 * 겸용주택 분리계산 + 보유 중 일부 용도변경 관련 AssetForm 필드 디폴트·마이그레이션 헬퍼.
 *
 * `calc-wizard-asset.ts`가 800줄 정책을 초과하지 않도록 별도 파일로 분리.
 * 본 파일은 `AssetForm` 타입의 겸용주택 + partialUsageChange 18필드만 다룬다.
 */

import type { AssetForm } from "./calc-wizard-asset";
import { round2 } from "@/lib/tax-engine/area-utils";

/**
 * 저장된 **파생 면적**의 부동소수점 잔재 세척 (③ normalize).
 *
 * 2026-07-15 이전 이력에는 구 산식(`round2(전용합+공통) − 주택`)이 만든 잔재가 남아 있다
 * (예: 상가 연면적 `"283.04999999999995"`). 잔재는 **표시만의 문제가 아니다** — API 변환
 * (`transfer-tax-api-mixed-use.ts:27` `parseFloat`)이 그대로 엔진에 넘겨 `floor(단가 × 면적)`을
 * 1원 깎는다(단가 6,216,000 기준 1,759,438,799 vs 1,759,438,800).
 *
 * ⚠️ **정상값에는 항등** — `round2` 후 표기가 같으면 원문을 그대로 둔다(사용자 입력 무변경).
 */
function normalizeStoredArea(a: Record<string, unknown>, key: string): void {
  const raw = a[key];
  // 빈값 조기 반환 — three-state("" = 미입력) 보존.
  // 오늘은 아래 `Number.isFinite`와 중복이다(`parseFloat("")` = NaN). 그럼에도 남기는 이유:
  // 이 저장소의 표준 파서는 `parseDecimal`이고 그것은 **빈값에 0을 돌려준다** → 무심코
  // 교체하면 "" → "0"이 되어 계약이 깨진다. 파서 교체에 대한 방어선으로 명시 유지.
  if (typeof raw !== "string" || raw.trim() === "") return;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return;
  const cleaned = String(round2(n));
  if (cleaned !== raw) a[key] = cleaned;
}

/** 겸용주택 + 보유 중 일부 용도변경 관련 디폴트 (18필드) */
export const MIXED_USE_DEFAULTS: Pick<
  AssetForm,
  | "isMixedUseHouse"
  | "residentialExclusiveArea"
  | "commercialExclusiveArea"
  | "commonArea"
  | "residentialFloorArea"
  | "nonResidentialFloorArea"
  | "buildingFootprintArea"
  | "mixedUseTotalLandArea"
  | "mixedResidentialLandAreaOverride"
  | "mixedCommercialLandAreaOverride"
  | "mixedResidentialFootprintOverride"
  | "mixedTransferHousingPrice"
  | "mixedTransferCommercialBuildingPrice"
  | "mixedTransferLandPricePerSqm"
  | "mixedCommercialLandCompensationTotal"
  | "mixedCommercialLandCompensationBasisTotal"
  | "mixedAcqHousingPrice"
  | "mixedAcqCommercialBuildingPrice"
  | "mixedAcqLandPricePerSqm"
  | "mixedIsMetropolitanArea"
  | "mixedHousingInheritedValueOverride"
  | "mixedCommercialInheritedValueOverride"
  | "mixedHousingInheritedExpense"
  | "mixedCommercialInheritedExpense"
  | "mixedHousingGiftValueOverride"
  | "mixedCommercialGiftValueOverride"
  | "mixedHousingGiftExpense"
  | "mixedCommercialGiftExpense"
  | "hasPartialUsageChange"
  | "partialChangeDirection"
  | "partialChangeAcqResidentialArea"
  | "partialChangeAcqCommercialArea"
  | "partialChangeDate"
> = {
  isMixedUseHouse: false,
  residentialExclusiveArea: "",
  commercialExclusiveArea: "",
  commonArea: "",
  residentialFloorArea: "",
  nonResidentialFloorArea: "",
  buildingFootprintArea: "",
  mixedUseTotalLandArea: "",
  mixedResidentialLandAreaOverride: "",
  mixedCommercialLandAreaOverride: "",
  mixedResidentialFootprintOverride: "",
  mixedTransferHousingPrice: "",
  mixedTransferCommercialBuildingPrice: "",
  mixedTransferLandPricePerSqm: "",
  mixedCommercialLandCompensationTotal: "",
  mixedCommercialLandCompensationBasisTotal: "",
  mixedAcqHousingPrice: "",
  mixedAcqCommercialBuildingPrice: "",
  mixedAcqLandPricePerSqm: "",
  mixedIsMetropolitanArea: true,
  // ── 상속 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (엔진 정합) ──
  mixedHousingInheritedValueOverride: "",
  mixedCommercialInheritedValueOverride: "",
  mixedHousingInheritedExpense: "",
  mixedCommercialInheritedExpense: "",
  // ── 증여 취득 겸용주택 — §163⑨ (D1=옵션B) ──
  mixedHousingGiftValueOverride: "",
  mixedCommercialGiftValueOverride: "",
  mixedHousingGiftExpense: "",
  mixedCommercialGiftExpense: "",
  // ── 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10) ──
  hasPartialUsageChange: false,
  partialChangeDirection: "",
  partialChangeAcqResidentialArea: "",
  partialChangeAcqCommercialArea: "",
  partialChangeDate: "",
};

/**
 * PHD 패널 전용이던 `phdResidentialLandArea` → ①카드 `mixedResidentialLandAreaOverride` 이관.
 *
 * 2026-07-15 주택부수토지를 ①카드 단일 소스로 통일하면서 PHD 패널 입력칸은 조회 전용이 됐다.
 * 옛 이력에 남은 사용자 입력을 그냥 버리면 **pre-1990 환산 면적이 조용히 자동 안분으로 바뀌어
 * 세액이 달라진다** → 단일 소스 필드로 옮겨 의도를 보존한다.
 *
 * ⚠️ ①카드 값이 이미 있으면 덮어쓰지 않는다(단일 소스 우선). 이관 후 원본은 비워 재이관을 막는다.
 * ⚠️ 문자열 수준 분기 — `"0"`(적법한 0)도 이관 대상이다.
 */
function migratePhdLandAreaToOverride(a: Record<string, unknown>): void {
  const legacy = a.phdResidentialLandArea;
  if (typeof legacy !== "string" || legacy.trim() === "") return;
  const current = a.mixedResidentialLandAreaOverride;
  if (typeof current === "string" && current.trim() !== "") {
    a.phdResidentialLandArea = ""; // ①이 이미 정본 — 옛 값 폐기
    return;
  }
  a.mixedResidentialLandAreaOverride = legacy.trim();
  a.phdResidentialLandArea = "";
}

/**
 * 겸용주택 + partialUsageChange 필드를 raw 객체에 backward compat 가드 적용.
 * sessionStorage·DB 이력에서 누락된 신규 필드를 디폴트로 채움.
 */
export function migrateMixedUseFields(a: Record<string, unknown>): void {
  // 겸용주택 분리계산 필드 (기존)
  if (a.isMixedUseHouse === undefined) a.isMixedUseHouse = false;
  if (!a.residentialExclusiveArea) a.residentialExclusiveArea = "";
  if (!a.commercialExclusiveArea) a.commercialExclusiveArea = "";
  if (!a.commonArea) a.commonArea = "";
  // ⚠️ legacy 이력 회귀 방지 (R1): residentialFloorArea 는 직접입력 값이 있을 수 있으므로
  // 전용/공통이 없어도 기존 연면적을 보존한다 (덮어쓰기 금지).
  if (!a.residentialFloorArea) a.residentialFloorArea = "";
  if (!a.nonResidentialFloorArea) a.nonResidentialFloorArea = "";
  // 파생 연면적만 세척 — 구 산식 잔재의 유일한 발생원이다(PR #602 이전 `round2(T) − r`).
  // 전용/공통·정착·전체토지는 사용자 직접입력이라 건드리지 않는다(반올림은 입력 변조).
  // override 3종은 현행 writer가 round2/residualArea라 잔재가 생길 수 없다.
  normalizeStoredArea(a, "residentialFloorArea");
  normalizeStoredArea(a, "nonResidentialFloorArea");
  migratePhdLandAreaToOverride(a);
  if (!a.buildingFootprintArea) a.buildingFootprintArea = "";
  if (!a.mixedUseTotalLandArea) a.mixedUseTotalLandArea = "";
  if (!a.mixedResidentialLandAreaOverride) a.mixedResidentialLandAreaOverride = "";
  if (!a.mixedCommercialLandAreaOverride) a.mixedCommercialLandAreaOverride = "";
  if (!a.mixedResidentialFootprintOverride) a.mixedResidentialFootprintOverride = "";
  if (!a.mixedTransferHousingPrice) a.mixedTransferHousingPrice = "";
  if (!a.mixedTransferCommercialBuildingPrice) a.mixedTransferCommercialBuildingPrice = "";
  if (!a.mixedCommercialLandCompensationTotal) a.mixedCommercialLandCompensationTotal = "";
  if (!a.mixedCommercialLandCompensationBasisTotal) a.mixedCommercialLandCompensationBasisTotal = "";
  if (!a.mixedTransferLandPricePerSqm) a.mixedTransferLandPricePerSqm = "";
  if (!a.mixedAcqHousingPrice) a.mixedAcqHousingPrice = "";
  if (!a.mixedAcqCommercialBuildingPrice) a.mixedAcqCommercialBuildingPrice = "";
  if (!a.mixedAcqLandPricePerSqm) a.mixedAcqLandPricePerSqm = "";
  if (a.mixedIsMetropolitanArea === undefined) a.mixedIsMetropolitanArea = true;

  // 상속 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (신규 — 엔진 정합)
  if (!a.mixedHousingInheritedValueOverride) a.mixedHousingInheritedValueOverride = "";
  if (!a.mixedCommercialInheritedValueOverride) a.mixedCommercialInheritedValueOverride = "";
  if (!a.mixedHousingInheritedExpense) a.mixedHousingInheritedExpense = "";
  if (!a.mixedCommercialInheritedExpense) a.mixedCommercialInheritedExpense = "";

  // 보유 중 일부 용도변경 필드 (신규 — 2026-04-30)
  if (a.hasPartialUsageChange === undefined) a.hasPartialUsageChange = false;
  if (a.partialChangeDirection === undefined) a.partialChangeDirection = "";
  if (!a.partialChangeAcqResidentialArea) a.partialChangeAcqResidentialArea = "";
  if (!a.partialChangeAcqCommercialArea) a.partialChangeAcqCommercialArea = "";
  if (!a.partialChangeDate) a.partialChangeDate = "";
}
