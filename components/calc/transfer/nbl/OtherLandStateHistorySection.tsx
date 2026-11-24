"use client";

/**
 * 기타토지 «소유기간 중 건축물 유무·재산세 구분 이력» 입력 — NBL-STATE-HISTORY-U1 (계획서 `docs/01-plan/features/nbl-other-land-state-history.ui.plan.md` §5) + E3-① U4
 * (`nbl-state-history-e3-1-tax-type-change.ui.plan.md` §4 — 사건 종류 3종: 건축물 신축 · 건축물 멸실·철거·붕괴 · 재산세 과세 구분 변경).
 *
 * 질문(3지선다) → 사건 행(종류·날짜·철거/구분 변경 행의 «직전 재산세 구분») → 이 이력으로 나뉜 소유기간(읽기전용 미리보기).
 * E3-1b — 나대지 구간을 닫는 행(신축 · 건축물 없는 구간의 구분 변경 — leaf `eventClosesBareInterval`)은 «직전 구분» 대신 «나대지 선언» 카드(`OtherLandBareIntervalFields` — 구분 → 근거 → 공지상태 면적한도)를 보인다.
 * «직전 구분» 칸 노출 여부는 leaf 단일 술어 `eventCarriesTaxTypeBefore`가 정한다(`=== "building_removed"` 리터럴 금지 — 새 종류의 값이 침묵으로 «모름»이 된다).
 * 구간은 엔진 공용 leaf가 만든다(`buildStateHistoryPreview`) — 결과 카드·판정과 같은 구간이다. 저장·미러링 없음(`useMemo` 표시 전용).
 *
 * E3-③ A — `variant="housing"`: 주택부수토지 카드가 같은 섹션을 재사용한다(키·행 구조 동일 · 사건 2종 «주택 신축»/«주택 멸실·철거·붕괴» · 철거 행은 «철거 직전 재산세 구분» 대신
 * «철거 직전 주택 정착면적(㎡)» 숫자 입력 + 허용 면적 미리보기 · 양도일 현재 주택은 지목이 정해 «건축물 있음» 토글이 없다). 지목 축 게이트·정착면적 규칙은 ④⑧과 **같은 술어·leaf**를 읽는다
 * (`nblStateHistoryApplies` · `housePriorFootprintIssueOf` · 엔진 `eventClosesHouseInterval`) — 이 파일이 자체 지목 조건을 쓰지 않는다. 기본 `other`는 종전과 바이트 동일.
 *
 * E3-③ B — 기타토지(`variant="other"`) 카드의 **철거 행**은 «철거된 건축물 종류»(주택 / 그 밖)를 더 받는다(`OtherLandBuildingKindField`). 「주택」이면 A와 같은 «철거 직전 주택 정착면적» 칸(+ 허용 면적 미리보기)을 보이고
 * «철거 직전 재산세 구분»은 숨긴다(엔진이 주택 구간의 재산세 구분을 읽지 않는다). 수도권 여부 칸은 엔진 술어 `housePriorNeedsMetropolitan`(`housePriorNeedsMetropolitanOf` — 와이어 사건 인자)이 참일 때만 사건 목록 아래에 보인다.
 * 「그 밖」이면 종전 카드 그대로(바이트 동일 — Q-12 (가)).
 *
 * 3중 패턴: `propertyTaxTypeBefore` `""` = 모름 — 화면은 «모름» 선택 상태로 보이고(`|| "unknown"`) 저장값은 `""`로 쓴다(④ 전송 · ⑫ enum · 엔진 모두 `""` = 종합합산 + 확인 필요).
 * 모드·종류 전환 시 파생 값 쓰기는 **onChange 핸들러**에서만 한다(`useEffect → store` 미러링 금지).
 */
import { useMemo } from "react";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { buildHouseFootprintPreview } from "@/lib/calc/nbl-other-state-history-preview";
import { buildStateHistoryPreview } from "@/lib/calc/nbl-other-state-history-preview";
import { housingAreaLimitState } from "@/lib/calc/nbl-other-state-history-preview";
import { housePriorHistoryIgnoredOf } from "@/lib/calc/nbl-other-state-history-read";
import { nblStateHistoryIsRead } from "@/lib/calc/nbl-other-state-history-read";
import { demolishedRowViewOf } from "@/lib/calc/nbl-demolished-row-scope";
import { buildNonBusinessLandRaw } from "@/lib/calc/non-business-land-request";
import type { StateHistoryPreview, StateHistoryPreviewRow } from "@/lib/calc/nbl-other-state-history-preview";
import { houseCheckText, houseIntervalText } from "@/lib/calc/nbl-house-interval-text";
import { effectiveOtherHasBuildingOf } from "@/lib/calc/nbl-other-state-history-scope";
import { housePriorFootprintIssueOf } from "@/lib/calc/nbl-other-state-history-scope";
import { housePriorNeedsMetropolitanOf } from "@/lib/calc/nbl-other-state-history-scope";
import { nblOtherStateEventsInUse } from "@/lib/calc/nbl-other-state-history-scope";
import { stateEventWireRow } from "@/lib/calc/nbl-other-state-history-scope";
import { FOOTPRINT_DEFINITION } from "@/lib/calc/footprint-definition-copy";
import { hasDeemedTransferReason } from "@/lib/calc/nbl-deemed-transfer-scope";
import { isDeemedTransferApplicable } from "@/lib/calc/nbl-deemed-transfer-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { NblOtherStateEventInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { NBL_STATE_HISTORY_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_DEMOLITION_GRACE_NUDGE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_GRACE_ROW_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNCHANGED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_UNKNOWN_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE } from "@/lib/tax-engine/nbl-confirm-notices";
import { VACANT_LOT_HO } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { vacantLotWithinAreaLimit } from "@/lib/tax-engine/non-business-land/other-land-vacant-lot-history";
import { parseDecimal } from "@/lib/calc/number-parse";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateEventKind } from "@/lib/tax-engine/non-business-land/land-usage.types";
import { bareIntervalTaxTypeText } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesBuildingKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventCarriesTaxTypeBefore } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventClosesBareInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventClosesHouseInterval } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { eventOffersDemolished } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { houseTaxTypeChangedMessage } from "@/lib/tax-engine/non-business-land/nbl-validation-messages";
import { consumesGracePeriods } from "@/lib/tax-engine/non-business-land/land-category";
import { hasBuildingAtTransfer } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isBuildingEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { isEventKind } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_EVENT_KIND_LABEL } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { STATE_EVENT_KIND_LABEL_HOUSE } from "@/lib/tax-engine/non-business-land/other-land-state-history";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
import { OtherLandBareIntervalFields, ptaxOptions } from "./OtherLandBareIntervalFields";
import { OtherLandBuildingKindField } from "./OtherLandBuildingKindField";
import { MetropolitanAreaField } from "./shared/MetropolitanAreaField";

export interface OtherLandStateHistorySectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일 — 미리보기 구간의 끝 */
  transferDate?: string;
  /** E3-③ A — `housing` = 주택부수토지 카드(주택 신축·멸실 2종 · 철거 행 정착면적). 기본 `other` = 기타토지(종전과 바이트 동일). */
  variant?: "other" | "housing";
}

type Mode = "unchanged" | "changed" | "unknown";

const MODE_OPTIONS: RadioCardOption<Mode>[] = [
  { value: "unchanged", label: "바뀐 적 없습니다", description: "소유기간 내내 양도일 현재와 같았습니다(건축물이 계속 있었거나 계속 없었고, 재산세 과세 구분도 같았습니다).", testId: "nbl-other-state-mode-unchanged" },
  { value: "changed", label: "바뀐 적 있습니다", description: "건축물을 새로 지었거나 철거·멸실된 적, 또는 재산세 과세 구분이 바뀐 적이 있습니다 — 아래에 사건을 입력합니다.", testId: "nbl-other-state-mode-changed" },
  { value: "unknown", label: "모름", description: "건축물·재산세 과세 구분 이력을 확인하지 못했습니다 — 양도일 현재 상태를 소유기간 전체에 적용하고 확인 필요로 표시합니다.", testId: "nbl-other-state-mode-unknown" },
];

const KIND_OPTIONS = (i: number): RadioCardOption<StateEventKind>[] => [
  { value: "building_built", label: STATE_EVENT_KIND_LABEL.building_built, testId: `nbl-other-state-event-${i}-kind-built` },
  { value: "building_removed", label: STATE_EVENT_KIND_LABEL.building_removed, testId: `nbl-other-state-event-${i}-kind-removed` },
  { value: "tax_type_changed", label: STATE_EVENT_KIND_LABEL.tax_type_changed, testId: `nbl-other-state-event-${i}-kind-taxchange` },
];

/** E3-③ A — 주택부수토지 카드의 3지선다 설명. 「바뀐 적 없습니다」는 현행과 같은 결과(엔진 A-10 — 판정·세액·echo 불변)라 새 단정을 달지 않는다. testId는 기타토지와 같다(한 화면에 둘이 동시에 뜨지 않는다). */
const MODE_OPTIONS_HOUSE: RadioCardOption<Mode>[] = [
  { value: "unchanged", label: "바뀐 적 없습니다", description: "소유기간 내내 양도일 현재처럼 이 토지 위에 주택이 있었습니다.", testId: "nbl-other-state-mode-unchanged" },
  { value: "changed", label: "바뀐 적 있습니다", description: "주택을 새로 지었거나 철거·멸실된 적이 있습니다 — 아래에 사건을 입력합니다.", testId: "nbl-other-state-mode-changed" },
  { value: "unknown", label: "모름", description: "주택 신축·멸실 이력을 확인하지 못했습니다 — 양도일 현재 상태를 소유기간 전체에 적용하고 확인 필요로 표시합니다.", testId: "nbl-other-state-mode-unknown" },
];

const KIND_OPTIONS_HOUSE = (i: number): RadioCardOption<StateEventKind>[] => [
  { value: "building_built", label: STATE_EVENT_KIND_LABEL_HOUSE.building_built, testId: `nbl-other-state-event-${i}-kind-built` },
  { value: "building_removed", label: STATE_EVENT_KIND_LABEL_HOUSE.building_removed, testId: `nbl-other-state-event-${i}-kind-removed` },
];

const BUILT_DATE_HINT =
  "건축물이 있는 것으로 보는 첫날입니다. 사용승인일(준공일)과 재산세상 건축물로 보는 첫날이 다를 수 있습니다 — 확인 필요.";
const REMOVED_DATE_HINT = "건축물이 없어진 첫날(멸실·철거·붕괴일)입니다.";
const TAX_CHANGE_DATE_HINT =
  "바뀐 과세 구분이 적용되기 시작한 첫날입니다. 재산세 납세고지서(과세구분)가 달라진 해를 확인해 날짜를 정하세요 — 정확한 날을 모르면 확인 필요.";
const NEUTRAL_DATE_HINT = "새 상태가 시작되는 첫날입니다. 같은 날의 사건은 입력할 수 없습니다.";
const KIND_HINT_FIRST_ROW =
  "취득 당시 건축물이 있었다면 «건축물 멸실·철거·붕괴»부터 입력합니다. 건축물이 없던 토지라면 «건축물 신축»부터 입력합니다. 지분을 나눠 취득한 토지는 가장 이른 지분의 취득일 이후 사건부터 입력합니다. " +
  "재산세 과세 구분만 바뀐 적이 있으면 «재산세 과세 구분 변경»을 입력합니다. 건축물이 없던 기간(나대지)에도 입력할 수 있고, 나대지의 별도합산·분리과세·비과세는 근거를 함께 고릅니다.";

const BUILT_DATE_HINT_HOUSE = "주택이 있는 것으로 보는 첫날입니다. 사용승인일(준공일)과 주택으로 보는 첫날이 다를 수 있습니다 — 확인 필요.";
const REMOVED_DATE_HINT_HOUSE = "주택이 없어진 첫날(멸실·철거·붕괴일)입니다.";
/** 첫 행 안내 — 끝 문장은 엔진 상수(R-6): 주택이 아닌 건축물이 있던 기간은 이 질문이 표현하지 못한다. */
const KIND_HINT_FIRST_ROW_HOUSE =
  "취득 당시 주택이 있었다면 «주택 멸실·철거·붕괴»부터, 없었다면 «주택 신축»부터 입력합니다. 지분을 나눠 취득한 토지는 가장 이른 지분의 취득일 이후 사건부터 입력합니다. " +
  NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE;
const FOOTPRINT_HINT_HOUSE = `${FOOTPRINT_DEFINITION} 정착면적을 모르면 위 질문에서 「모름」을 선택하세요.`;

/** 종류별 사건일 hint — `Record<StateEventKind, …>`라 새 종류가 생기면 컴파일 오류로 알려 준다. 미선택·허용값 밖은 중립 문구. */
const DATE_HINT: Record<StateEventKind, string> = { building_built: BUILT_DATE_HINT, building_removed: REMOVED_DATE_HINT, tax_type_changed: TAX_CHANGE_DATE_HINT };
const DATE_HINT_HOUSE: Record<StateEventKind, string> = { building_built: BUILT_DATE_HINT_HOUSE, building_removed: REMOVED_DATE_HINT_HOUSE, tax_type_changed: NEUTRAL_DATE_HINT };
const dateHintOf = (kind: string, house: boolean): string => (isEventKind(kind) ? (house ? DATE_HINT_HOUSE : DATE_HINT)[kind] : NEUTRAL_DATE_HINT);

/** 재산세 과세 구분 변경 행의 «변경 후» — 그 사건일에 시작하는 구간의 구분(읽기 전용 표시). 꼬리는 엔진이 보정할 수 있어 «선언 기준»으로 한정해 적는다(UV-4). */
function afterTaxTypeText(row: { propertyTaxType: PropertyTaxType | "unknown"; isTail: boolean }): string {
  if (row.isTail) return `${PROPERTY_TAX_TYPE_LABEL[row.propertyTaxType === "unknown" ? "comprehensive" : row.propertyTaxType]}(양도일 현재 선언 기준)`;
  return row.propertyTaxType === "unknown" ? `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(선언 없음 — 확인 필요)` : `${PROPERTY_TAX_TYPE_LABEL[row.propertyTaxType]}(선언)`;
}

/** 이 행(사건일 `date`)이 닫은 구간의 미리보기 행 — 다음 구간이 그 사건일에 시작한다(표시 전용). 첫 구간이거나 미리보기를 못 그리면 없다. */
function closedRowOf(preview: StateHistoryPreview | null, date: string): StateHistoryPreviewRow | undefined {
  const k = preview?.rows.findIndex((r) => r.start === date) ?? -1;
  return k > 0 ? preview?.rows[k - 1] : undefined;
}

function rowTaxTypeText(row: Pick<StateHistoryPreviewRow, "hasBuilding" | "propertyTaxType" | "isTail" | "basisOutcome" | "basis" | "foldReason" | "buildingKind" | "houseOutcome" | "houseCheck" | "temporaryStatusWindow" | "temporaryStatusPublicUse">): string {
  // E3-③ A — 주택 구간은 재산세 구분이 아니라 정착면적 × 배율 판정(leaf echo)을 그대로 보인다. 꼬리(양도일 현재 주택)는 위 «주택 정착면적» 칸이 말한다 — 결과 계산 후 확정.
  if (row.buildingKind === "house") return row.isTail ? "양도일 현재 정착면적 · 배율(위 칸 기준)" : (houseIntervalText(row) ?? "주택");
  if (row.isTail) return "양도일 현재 선언 기준";
  if (!row.hasBuilding) {
    // E3-1b — 비종합합산 선언이 있는 나대지 구간은 근거 해석(받아들임·접힘)을 보이고, 선언이 없으면 종전 문구 그대로(주장 없음 = 종합합산).
    const bare = bareIntervalTaxTypeText(row);
    // E3f-2 — 근거 «철거ㆍ멸실»을 받아들인 구간은 구간 전체가 아니라 한시 지위 인정 창만 별도합산이다(창은 엔진 구간 해석이 낸 echo).
    if (bare) return row.temporaryStatusWindow ? `${bare} · 인정 ${row.temporaryStatusWindow.start} ~ ${row.temporaryStatusWindow.lastDay}(${row.temporaryStatusWindow.days.toLocaleString()}일)` : bare;
    return row.propertyTaxType === "unknown" ? `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(나대지 — 선언 없음 · 확인 필요)` : `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(나대지 — 고정)`;
  }
  if (row.propertyTaxType === "unknown") return `${PROPERTY_TAX_TYPE_LABEL.comprehensive}(선언 없음 — 확인 필요)`;
  return `${PROPERTY_TAX_TYPE_LABEL[row.propertyTaxType]}(선언)`;
}

export function OtherLandStateHistorySection({ asset, onAssetChange, transferDate, variant = "other" }: OtherLandStateHistorySectionProps) {
  const house = variant === "housing";
  const events = asset.nblOtherStateEvents ?? [];
  const mode = asset.nblOtherStateHistoryMode;
  // 기타토지 전용 파생(건축물 있음 토글 · 의제 안내) — 주택은 이 술어가 거짓이라 토글·의제를 읽지 않는다(양도일 현재 주택 = 지목이 정함).
  const inUse = nblOtherStateEventsInUse(asset);
  const deemedBlocks = inUse && isDeemedTransferApplicable(asset.nblLandType) && hasDeemedTransferReason(asset);
  const idKey = asset.assetId ?? "primary";

  const preview = useMemo(() => buildStateHistoryPreview(asset, transferDate), [asset, transferDate]);
  // 양도일 현재 배율 초과 안내(표시 전용 — ④⑧ 게이트가 아니다). 주택 변형에서만 계산한다.
  const areaLimit = house ? housingAreaLimitState(asset, transferDate) : "unknown";
  const tailHasBuilding = house || asset.nblOtherHasBuilding;
  const tailKind = house ? ("house" as const) : undefined;
  // B — 엔진이 «철거된 건축물 = 주택» 행 입력을 읽지 않는 경우(양도일 의제 사유 ∨ core가 면적 일부만 비사업용): ⑧ H9·H10과 같은 함수(`housePriorHistoryIgnoredOf` — 엔진 `isPartialArea`·`stateHistoryDeemedBlocks`를 돌린다).
  const otherIgnored = useMemo(() => !house && mode === "changed" && housePriorHistoryIgnoredOf(asset, transferDate), [asset, house, mode, transferDate]);
  // A — 양도일 현재 배율 초과면 엔진이 이력을 읽지 않는다: 미리보기·정착면적 필수 표시를 하지 않는다(⑧ H9와 같은 판정 — `housingAreaLimitState`). B도 엔진이 읽지 않으면 같은 표시를 한다(칸 값은 보존).
  const historyIgnored = (house && areaLimit === "exceeded") || otherIgnored;
  // E3-④ Q-5 (가) — 13호가 건축물 없는 구간에 구간별로 적용되는 상태(660㎡ 이내 · 엔진이 이력을 읽음): «호별 용도는 소유기간 전체에 적용» 한정 고지가 13호와 모순이라 엔진이 싣는 13호 변형으로 보인다(`applyStateHistory`와 같은 조건).
  const vacantLotApplied = !house && asset.nblOtherRelatedBusinessType === VACANT_LOT_HO && !otherIgnored && vacantLotWithinAreaLimit(parseDecimal(asset.acquisitionArea));
  // 수도권 칸은 철거된 주택 구간의 배율 전용이다 — 엔진이 그 구간을 읽지 않으면 쓰이지 않으므로 보이지 않는다(저장값은 지우지 않는다).
  const needsMetro = housePriorNeedsMetropolitanOf(asset, transferDate) && !otherIgnored;

  function changeMode(v: Mode) {
    // `changed → 그 밖`으로 바꿀 때는 숨었던 「건축물 있음」 토글에 마지막 파생값을 한 번 써 준다(이벤트 시점 쓰기 — `useEffect` 미러링 아님).
    onAssetChange(inUse && v !== "changed" ? { nblOtherStateHistoryMode: v, nblOtherHasBuilding: effectiveOtherHasBuildingOf(asset) } : { nblOtherStateHistoryMode: v });
  }
  function patchEvent(i: number, patch: Partial<NblOtherStateEventInput>) {
    // `undefined` 값은 키째 지운다(E3f-2 — 구분을 바꿀 때 사실 칸 4개를 리셋해도 종전 행과 byte-identical).
    const merged: Record<string, unknown> = { ...events[i], ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete merged[k];
    onAssetChange({ nblOtherStateEvents: events.map((e, idx) => (idx === i ? (merged as unknown as NblOtherStateEventInput) : e)) });
  }
  function addEvent() {
    // 새 행의 기본 종류는 직전 «건축물 사건»의 반대(신축과 멸실은 번갈아 온다 — 재산세 과세 구분 변경 행은 건너뛴다). 첫 행·직전 행이 미선택·건축물 사건이 없으면 사용자가 고른다. 날짜는 비워 둔다(자동 채움 금지).
    const prev = events[events.length - 1];
    const lastBuilding = [...events].reverse().find((e) => isBuildingEventKind(e.kind));
    const next: "" | StateEventKind = prev && isEventKind(prev.kind) && lastBuilding ? (lastBuilding.kind === "building_built" ? "building_removed" : "building_built") : "";
    onAssetChange({ nblOtherStateEvents: [...events, { kind: next, date: "", propertyTaxTypeBefore: "" }] });
  }
  function removeEvent(i: number) {
    onAssetChange({ nblOtherStateEvents: events.filter((_, idx) => idx !== i) });
  }

  const eventsComplete = events.length > 0 && events.every((e) => isEventKind(e.kind));
  // 양도일 현재 건축물 = 마지막 «건축물 사건»(leaf `hasBuildingAtTransfer`). 건축물 사건이 0건이면 줄 대신 「건축물 있음」 토글이 보인다(`OtherLandDetailSection`).
  const hasBuildingEvent = events.some((e) => isBuildingEventKind(e.kind));
  const hasTaxChange = events.some((e) => e.kind === "tax_type_changed");
  const lastBuilding = eventsComplete ? hasBuildingAtTransfer(events) : undefined;
  // Q-8 (가) — 초과 구간 뒤에 철거 후 9호 유예 행이 있으면 엔진이 싣는 고지(`applyHousingStateHistory`와 같은 조건 — 표시 전용).
  // A·B 공통 — 주택 구간(A: 모든 철거 행 · B: «주택» 철거 행)이 있을 때만(엔진 `houseIntervalNotices`·`applyHousingStateHistory`와 같은 조건).
  const previewHasHouse = !house && !!preview?.rows.some((r) => r.buildingKind === "house");
  const hasHouseRow = events.some((_, i) => eventClosesHouseInterval(events, i, tailKind));
  const exceededWithGrace = hasHouseRow && !!preview?.rows.some((r) => r.houseOutcome === "exceeded") && (asset.nblGracePeriods ?? []).some((g) => g.reasonCode === "demolition");
  const lastBuildingKind = [...events].reverse().find((e) => isBuildingEventKind(e.kind))?.kind;
  // E3-⑤ N-2 — 철거 행에 9호 유예 행이 없을 때의 조건부 입력 안내. 저장값 존재 여부만 본다(기산일 일치는 판정하지 않는다 · 유예 자동 생성 없음). 게이트 = 이 지목이 유예를 읽음(`GracePeriodSection`과 같은 술어) ∧ 의제 아님 ∧ 엔진이 이력을 읽음.
  const noDemolitionGrace = !(asset.nblGracePeriods ?? []).some((g) => g.reasonCode === "demolition");
  const graceNudgeApplies = noDemolitionGrace && !!asset.nblLandType && consumesGracePeriods(asset.nblLandType) && !deemedBlocks && !historyIgnored;
  // E3f-2 — 근거 «철거ㆍ멸실» 사실 칸 뷰(엔진 술어 — ④ 전송·⑧·⑫′와 같은 술어)와 «엔진이 이력을 읽는가»(`nblStateHistoryIsRead` — ⑧·⑫′와 같은 함수 · 엔진을 돌리므로 근거 «철거ㆍ멸실»을 고른 행이 있을 때만 계산).
  // 읽지 않으면(양도일 의제 ∨ core 부분 면적) 사실 칸 4개를 모두 그리지 않는다(UQ-8 (가)) — 값은 보존하고 위 의제·부분 면적 안내가 말한다.
  const demolishedViews = useMemo(() => (mode === "changed" ? (asset.nblOtherStateEvents ?? []).map((_, i) => demolishedRowViewOf(asset, i)) : []), [asset, mode]);
  const historyRead = useMemo(
    () => (demolishedViews.some((v) => v) ? nblStateHistoryIsRead(buildNonBusinessLandRaw(asset, transferDate ?? "") ?? {}) : true),
    [asset, demolishedViews, transferDate],
  );
  const demolishedFactsHidden = !historyRead && demolishedViews.some((v) => v);

  return (
    <div className="space-y-3" data-testid="nbl-other-state-history">
      <SectionHeader
        title={house ? "소유기간 중 주택 신축·멸실 이력" : "소유기간 중 건축물 유무·재산세 구분 이력"}
        description={house ? "주택이 새로 지어지거나 없어진 적이 있으면 그 기간을 나누어(일 단위) 판정합니다." : "건축물이 새로 생기거나 없어졌거나 재산세 과세 구분이 바뀐 적이 있으면 그 기간을 나누어(일 단위) 판정합니다."}
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의6" label="§168의6 기간기준" />}
      />

      <FieldCard
        label={house ? "소유기간 중 이 토지 위에 주택이 새로 지어지거나 없어진 적이 있습니까?" : "소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적, 또는 재산세 과세 구분(고지서의 과세구분)이 바뀐 적이 있습니까?"}
        hint={house ? NBL_STATE_HISTORY_HOUSING_NON_HOUSE_BUILDING_NOTICE : undefined}
        required
      >
        <RadioCardGroup
          name={`nblOtherStateHistoryMode-${idKey}`}
          tone="amber"
          options={house ? MODE_OPTIONS_HOUSE : MODE_OPTIONS}
          value={mode === "unchanged" || mode === "changed" || mode === "unknown" ? mode : ""}
          onChange={changeMode}
          data-field="nblOtherStateHistoryMode"
          data-testid="nbl-other-state-mode"
        />
      </FieldCard>

      {/* 양도일 현재 배율을 초과하면 엔진은 이력을 판정에 반영하지 않는다(Q-3a (나) — 초과분은 유예만 반영). 질문은 그대로 두되 «모드가 바뀐 적 있음»일 때만 알린다 — 엔진은 `changed`에서만 이 고지를 싣는다
          (`judgeHousingLand` — UI Low 1: 입력 화면 = 결과 고지). 철거 행 정착면적은 이때 ⑧이 요구하지 않는다(UI Low 3 — 엔진이 읽지 않는 칸). 문구는 엔진의 주택 변형 상수. */}
      {house && mode === "changed" && areaLimit === "exceeded" && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid="nbl-housing-area-exceeded-notice">{NBL_STATE_HISTORY_HOUSING_PARTIAL_AREA_NOTICE}</p>
        </ToneCard>
      )}

      {/* 주택부수토지의 「바뀐 적 없음」은 현행과 같은 결과다(엔진 A-10 — 새 고지 없음). 기타토지 문구(업종·호별 용도·재산세 분류)는 주택에 맞지 않아 보이지 않는다. */}
      {mode === "unchanged" && !house && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid="nbl-state-history-unchanged-notice">{NBL_STATE_HISTORY_UNCHANGED_NOTICE}</p>
        </ToneCard>
      )}
      {/* 주택 카드 + 양도일 현재 배율 초과: 엔진은 이력을 읽지 않고 `unknown` 고지도 싣지 않는다(결과 = 현행 그대로 — UI Low 2: 입력 화면 = 결과). */}
      {/* B — 면적 일부만 비사업용이라 엔진이 철거 행 이력을 읽지 않는다(의제 사유는 아래 의제 안내가 따로 있다). 문구는 엔진 `PARTIAL_AREA` 상수(결과 고지와 같다). */}
      {/* E3f-2 — 근거 «철거ㆍ멸실» 사실 칸이 «엔진이 이력을 읽지 않아» 숨었을 때도 같은 안내가 말한다(칸이 사라진 이유 — 주택 카드는 위 배율 초과 안내). 의제 사유면 아래 의제 안내가 말한다. */}
      {(otherIgnored || (!house && demolishedFactsHidden)) && mode === "changed" && !deemedBlocks && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid="nbl-other-partial-area-notice">{NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE}</p>
        </ToneCard>
      )}
      {mode === "unknown" && !historyIgnored && (
        <ToneCard tone="amber">
          <p className="text-caption leading-snug" data-testid="nbl-state-history-unknown-notice">{NBL_STATE_HISTORY_UNKNOWN_NOTICE}</p>
        </ToneCard>
      )}

      {mode === "changed" && (
        <div className="space-y-3" data-field="nblOtherStateEvents" data-testid="nbl-other-state-events">
          {deemedBlocks && (
            <ToneCard tone="amber">
              <p className="text-caption leading-snug" data-testid="nbl-state-history-deemed-notice">{NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE}</p>
            </ToneCard>
          )}

          {events.map((ev, i) => {
            // 나대지 구간을 닫는 행(신축 · 건축물 없는 구간의 구분 변경)은 «나대지 선언» 카드, 건축물 있는 구간을 닫는 행(철거 · 건축물 위 구분 변경)은 종전 «직전 구분» 카드다 — 둘 다 leaf 술어가 정한다.
            const closesBare = eventClosesBareInterval(events, i, tailHasBuilding);
            // E3-③ A — 주택 구간을 닫는 철거 행(leaf 술어)은 «직전 재산세 구분» 대신 «철거 직전 주택 정착면적» 카드다(⑭·④·⑧과 같은 술어).
            // B(기타토지)는 «철거된 건축물 종류: 주택»으로 고른 철거 행이다(엔진 술어가 종류 칸을 읽는다).
            const closesHouse = eventClosesHouseInterval(events, i, tailKind);
            const carriesBefore = eventCarriesTaxTypeBefore(ev.kind) && !closesBare && !closesHouse;
            const taxChange = ev.kind === "tax_type_changed";
            // 주택 카드가 받지 않는 종류(기타토지에서 입력하다 지목을 바꾼 stale 행) — 화면에 보이고 ⑧이 막는다(H4). 이 행의 구분·선언 카드는 그리지 않는다.
            const houseTaxChangeRow = house && taxChange;
            const footprintIssue = closesHouse && !historyIgnored ? housePriorFootprintIssueOf(asset, i) : null;
            const footprintPreview = closesHouse && !historyIgnored ? buildHouseFootprintPreview(asset, i, transferDate) : null;
            // B — 기타토지 카드의 철거 행에서만 «철거된 건축물 종류»를 받는다(주택 카드는 모든 철거 행이 주택).
            const showKindField = !house && eventCarriesBuildingKind(ev.kind);
            // 「변경 후」 = 이 사건일에 시작하는 미리보기 구간(표시 전용 — 저장·전송·검증 없음). 미리보기 불가·클립(사건일 ≤ 소유 첫날)이면 줄을 그리지 않는다.
            const afterRow = taxChange && !deemedBlocks ? preview?.rows.find((r) => r.start === ev.date) : undefined;
            return (
              <ToneCard
                key={i}
                tone="amber"
                sectionNum={i + 1}
                title={taxChange ? STATE_EVENT_KIND_LABEL.tax_type_changed : house ? "주택 사건" : "건축물 사건"}
                titleExtra={
                  <button
                    type="button"
                    onClick={() => removeEvent(i)}
                    className="ml-auto text-xs text-destructive hover:underline"
                    data-testid={`nbl-other-state-event-${i}-remove`}
                  >
                    삭제
                  </button>
                }
              >
                <FieldCard
                  label="사건 종류"
                  hint={i === 0 ? (house ? KIND_HINT_FIRST_ROW_HOUSE : KIND_HINT_FIRST_ROW) : undefined}
                >
                  <RadioCardGroup
                    name={`nblOtherStateEventKind-${idKey}-${i}`}
                    tone="amber"
                    layout="inline"
                    options={house ? KIND_OPTIONS_HOUSE(i) : KIND_OPTIONS(i)}
                    value={isEventKind(ev.kind) ? ev.kind : ""}
                    // 종류를 바꾸면 «직전 재산세 구분»과 나대지 선언(근거·면적한도)을 함께 리셋한다 — 행을 `{kind, date, propertyTaxTypeBefore:""}`로 **다시 만들어** 선언 키도 지운다
                    // (이벤트 시점 쓰기 — 신축 행에 stale 값이 남지 않게 · 철거 ↔ 구분 변경 전환 시 재선택 · 키가 없던 행은 키가 없는 채로 남는다).
                    onChange={(v) => onAssetChange({ nblOtherStateEvents: events.map((e, idx) => (idx === i ? { kind: v, date: e.date, propertyTaxTypeBefore: "" } : e)) })}
                    data-field={`nblOtherStateEvents.${i}.kind`}
                  />
                </FieldCard>

                {houseTaxChangeRow && (
                  <ToneCard tone="amber">
                    <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-house-taxchange-notice`}>{houseTaxTypeChangedMessage(i)}</p>
                  </ToneCard>
                )}

                <FieldCard label="사건일" hint={dateHintOf(ev.kind, house)}>
                  <DateInput
                    value={ev.date}
                    onChange={(v) => patchEvent(i, { date: v })}
                    data-field={`nblOtherStateEvents.${i}.date`}
                    data-testid={`nbl-other-state-event-${i}-date`}
                  />
                </FieldCard>

                {showKindField && (
                  <OtherLandBuildingKindField
                    index={i}
                    idKey={idKey}
                    event={ev}
                    onRowChange={(row) => onAssetChange({ nblOtherStateEvents: events.map((e, idx) => (idx === i ? row : e)) })}
                  />
                )}

                {closesBare && !houseTaxChangeRow && (
                  <OtherLandBareIntervalFields
                    index={i}
                    idKey={idKey}
                    taxChange={taxChange}
                    event={ev}
                    wire={stateEventWireRow(events, i, tailHasBuilding, tailKind)}
                    patchEvent={(patch) => patchEvent(i, patch)}
                    offersDemolished={eventOffersDemolished(events, i, tailHasBuilding)}
                    demolishedView={historyRead ? (demolishedViews[i] ?? undefined) : undefined}
                    closedRow={closedRowOf(preview, ev.date)}
                  />
                )}

                {closesHouse && (
                  <FieldCard
                    field={`nblOtherStateEvents.${i}.houseFootprintBefore`}
                    label="철거 직전 주택 정착면적"
                    unit="㎡"
                    required={!historyIgnored}
                    hint={FOOTPRINT_HINT_HOUSE}
                    warning={footprintIssue && footprintIssue.kind !== "blank" ? <span data-testid={`nbl-other-state-event-${i}-footprint-error`}>{footprintIssue.message}</span> : undefined}
                  >
                    <div className="space-y-2">
                      {/* 빈칸은 빈칸이다 — 표시 fallback·가정값 없음(저장 `""` = 전송 키 없음 = ⑧ H9 차단). */}
                      <DecimalInput
                        value={ev.houseFootprintBefore ?? ""}
                        onChange={(v) => patchEvent(i, { houseFootprintBefore: v })}
                        data-testid={`nbl-other-state-event-${i}-footprint`}
                      />
                      {/* 표시 전용 — 엔진 leaf `resolveHouseInterval`이 낸 허용 면적(재계산 없음). 입력이 ⑧ 결함이면 그리지 않는다. */}
                      {footprintPreview?.check && (
                        <p className="text-xs text-muted-foreground" data-testid={`nbl-other-state-event-${i}-footprint-preview`}>
                          {houseCheckText(footprintPreview.check)}
                        </p>
                      )}
                      {footprintPreview?.check && footprintPreview.check.excessArea > 0 && (
                        <ToneCard tone="amber">
                          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-footprint-exceeded-notice`}>{NBL_STATE_HISTORY_HOUSE_EXCEEDED_NOTICE}</p>
                        </ToneCard>
                      )}
                    </div>
                  </FieldCard>
                )}

                {carriesBefore && !houseTaxChangeRow && (
                  <FieldCard
                    label={taxChange ? "변경 직전 그 토지의 재산세 구분" : "철거 직전 그 토지의 재산세 구분"}
                    hint={
                      taxChange
                        ? "건축물이 있던 기간 중 이 날짜 직전의 재산세 과세 구분입니다. 재산세 납세고지서(과세구분)에서 확인할 수 있습니다."
                        : "건축물이 있던 기간의 재산세 과세 구분입니다. 재산세 납세고지서(과세구분)에서 확인할 수 있습니다."
                    }
                  >
                    <div className="space-y-2">
                      <RadioCardGroup
                        name={`nblOtherStatePtax-${idKey}-${i}`}
                        tone="amber"
                        layout="inline"
                        options={ptaxOptions(i, true)}
                        // 표시 fallback: 저장값 `""`(모름)은 «모름»이 선택된 것으로 보인다. 저장·전송·⑧(규칙 없음)·⑫(enum)·엔진 모두 `""` = 모름 → 종합합산 + 확인 필요.
                        value={ev.propertyTaxTypeBefore || "unknown"}
                        onChange={(v) => patchEvent(i, { propertyTaxTypeBefore: v === "unknown" ? "" : v })}
                        data-field={`nblOtherStateEvents.${i}.propertyTaxTypeBefore`}
                      />
                      {!ev.propertyTaxTypeBefore && (
                        <ToneCard tone="amber">
                          <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-ptax-unknown-notice`}>
                            {taxChange ? NBL_STATE_HISTORY_TAX_CHANGE_UNKNOWN_NOTICE : NBL_STATE_HISTORY_REMOVED_TAX_TYPE_UNKNOWN_NOTICE}
                          </p>
                        </ToneCard>
                      )}
                    </div>
                  </FieldCard>
                )}

                {graceNudgeApplies && eventCarriesBuildingKind(ev.kind) && (
                  <ToneCard tone="amber">
                    <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-grace-nudge`}>{NBL_STATE_HISTORY_DEMOLITION_GRACE_NUDGE_NOTICE}</p>
                  </ToneCard>
                )}

                {afterRow && !house && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground px-1" data-testid={`nbl-other-state-event-${i}-after`}>
                      변경 후: {afterTaxTypeText(afterRow)}
                    </p>
                    {/* UQ-3 (가) — 변경 전후 구분이 같아도 막지 않는다(비차단 안내). 직전 구분 «모름»(`""`)·변경 후 «모름»(`"unknown"`)은 어떤 실제 구분과도 같지 않아 비교에서 자연히 빠진다. */}
                    {ev.propertyTaxTypeBefore === afterRow.propertyTaxType && (
                      <ToneCard tone="amber">
                        <p className="text-caption leading-snug" data-testid={`nbl-other-state-event-${i}-same-notice`}>
                          변경 전후 구분이 같습니다. 바뀐 적이 없으면 이 행을 삭제하세요.
                        </p>
                      </ToneCard>
                    )}
                  </div>
                )}
              </ToneCard>
            );
          })}

          <button
            type="button"
            onClick={addEvent}
            className="w-full rounded-lg border border-dashed border-border py-2 text-xs text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors"
            data-testid="nbl-other-state-event-add"
          >
            + 사건 추가
          </button>

          {/* E3-③ B — 철거된 주택 구간의 배율(주·상·공 수도권 3배 / 수도권 밖 5배)이 수도권 여부로 갈릴 때만(엔진 술어 `housePriorNeedsMetropolitan` — ④ 전송·⑧ H10과 같은 함수). 카드 단위 1개. */}
          {needsMetro && (
            <div className="space-y-1" data-testid="nbl-house-prior-metro">
              <MetropolitanAreaField asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />
              <p className="text-xs text-muted-foreground px-1" data-testid="nbl-house-prior-metro-hint">철거 전 주택 구간의 배율 판정(도시지역 주·상·공 3배 / 5배)에 쓰입니다.</p>
            </div>
          )}

          {/* 양도일 현재 건축물 — 건축물 사건이 1건 이상이면 「건축물 있음」 토글을 이 줄이 대신한다(같은 사실을 두 곳에서 받지 않는다). 건축물 사건이 0건이면 줄 없이 토글이 보인다. */}
          {house ? (
            // 주택부수토지 카드 — 양도일 현재 주택은 입력이 아니라 지목이 정한다(④ `nblOtherHasBuilding = true` 고정 · ⑭ `tailHasBuilding = true`와 같은 값). 읽기 전용 한 줄.
            <p className="text-xs text-muted-foreground px-1" data-testid="nbl-state-history-at-transfer">양도일 현재 주택: 있음 (주택 부속토지 — 지목에서 정함)</p>
          ) : hasBuildingEvent && (
            <p className="text-xs text-muted-foreground px-1" data-testid="nbl-state-history-at-transfer">
              {lastBuilding !== undefined && lastBuildingKind
                ? `양도일 현재 건축물: ${lastBuilding ? "있음" : "없음"} (마지막 건축물 사건: ${STATE_EVENT_KIND_LABEL[lastBuildingKind as StateEventKind]})`
                : "사건 종류를 모두 선택하면 양도일 현재 건축물 유무가 정해집니다."}
            </p>
          )}

          {!deemedBlocks && !historyIgnored &&
            (preview ? (
              <ToneCard tone="sky" title="이 이력으로 나뉜 소유기간">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs" data-testid="nbl-state-history-preview">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="py-1 pr-2 font-medium">구간(시작일 포함 ~ 종료일 전날)</th>
                        <th className="py-1 pr-2 text-right font-medium">일수</th>
                        <th className="py-1 pr-2 font-medium">{house ? "주택" : "건축물"}</th>
                        <th className="py-1 pr-2 font-medium">{house || previewHasHouse ? "재산세 구분 · 배율 판정" : "재산세 구분"}</th>
                        <th className="py-1 font-medium">사업용 토지 요건</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((r, i) => (
                        <tr key={i} data-testid={`nbl-state-history-preview-row-${i}`} className="border-t border-sky-200/60 dark:border-sky-800/60 align-top">
                          <td className="py-1 pr-2 font-mono tabular-nums">{r.start} ~ {r.lastDay}</td>
                          <td className="py-1 pr-2 text-right font-mono tabular-nums">{r.days.toLocaleString()}일</td>
                          <td className="py-1 pr-2">{r.hasBuilding ? (!house && r.buildingKind === "house" ? "있음(주택)" : "있음") : house ? "없음(나대지)" : "없음"}</td>
                          <td className="py-1 pr-2">{rowTaxTypeText(r)}</td>
                          <td className="py-1">{r.meetsBuildingRequirement === null ? "결과 계산 후 확정" : r.temporaryStatusWindow ? "한시 지위 창만 충족" : r.meetsBuildingRequirement ? "충족" : "미충족"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-caption text-muted-foreground leading-snug" data-testid="nbl-state-history-preview-total">
                  합계 {preview.totalDays.toLocaleString()}일 = 소유기간. «사업용 토지 요건»은 {house ? "주택 유무(나대지 구간은 재산세 구분 선언)와 철거 전 배율 이내 여부" : previewHasHouse ? "건축물과 재산세 구분(철거된 주택 구간은 배율 이내 여부)" : "건축물과 재산세 구분"}만 본 것이며, 소유기간 전체의 비사업용 여부는 계산 결과에서 확정합니다.
                </p>
              </ToneCard>
            ) : (
              <p className="text-xs text-muted-foreground px-1" data-testid="nbl-state-history-preview-empty">
                사건을 모두 입력하면 이 이력으로 나뉜 소유기간(구간·일수)이 여기에 표시됩니다.
              </p>
            ))}

          <ToneCard tone="amber">
            <div className="space-y-1.5 text-caption leading-snug">
              {house && (
                <>
                  {/* 주택 변형 — 엔진이 이력 적용 결과에 싣는 고지와 같은 상수(`applyHousingStateHistory` — 이력 없음 고지를 한정 고지로 대체 · 일 단위 합산 · 철거 전 구간 근거). */}
                  <p data-testid="nbl-state-history-applied-notice">{NBL_STATE_HISTORY_HOUSING_APPLIED_NOTICE}</p>
                  <p data-testid="nbl-state-history-daywise-notice">{NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE}</p>
                  {hasHouseRow && <p data-testid="nbl-state-history-house-before-notice">{NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE}</p>}
                  {exceededWithGrace && <p data-testid="nbl-state-history-house-exceeded-grace-notice">{NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE}</p>}
                </>
              )}
              {/* E3-③ B — 기타토지 카드에 «주택» 철거 행이 있으면 엔진이 싣는 주택 구간 고지(`houseIntervalNotices` — 일 단위 합산 → 근거 → 초과 뒤 9호 유예). 종전 구분 변경·한정 고지는 아래 그대로. */}
              {!house && hasHouseRow && (
                <>
                  <p data-testid="nbl-state-history-daywise-notice">{NBL_STATE_HISTORY_DAYWISE_NO_RULING_NOTICE}</p>
                  <p data-testid="nbl-state-history-house-before-notice">{NBL_STATE_HISTORY_HOUSE_BEFORE_NOTICE}</p>
                  {exceededWithGrace && <p data-testid="nbl-state-history-house-exceeded-grace-notice">{NBL_STATE_HISTORY_HOUSE_EXCEEDED_GRACE_NOTICE}</p>}
                </>
              )}
              {/* 결과 경고와 같은 문구 — 엔진은 구분 변경 사건이 1건 이상이면 종전 한정 고지를 변형 고지로 «대체»한다(`applyStateHistory`). */}
              {!house && (
                <p data-testid="nbl-state-history-applied-notice">
                  {vacantLotApplied
                    ? hasTaxChange
                      ? NBL_STATE_HISTORY_VACANT_LOT_TAX_CHANGE_APPLIED_NOTICE
                      : NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE
                    : hasTaxChange
                      ? NBL_STATE_HISTORY_TAX_CHANGE_APPLIED_NOTICE
                      : NBL_STATE_HISTORY_APPLIED_NOTICE}
                </p>
              )}
              <p data-testid="nbl-state-history-grace-row-notice">{NBL_STATE_HISTORY_GRACE_ROW_NOTICE}</p>
            </div>
          </ToneCard>
        </div>
      )}
    </div>
  );
}
