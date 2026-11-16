/**
 * 토지 파트 취득원인 규칙 ⑧ — `transfer-tax-validate-split.ts`에서 분리(800줄 정책 · 옮긴 것은 위치뿐, 술어·문구 그대로).
 * 영 §163⑨ 단서 1·2호 ② 입력 완결 요구 헬퍼와 `validateLandPartCause`(엔진·⑫와 같은 leaf `collectSplitPartCauseIssues`)를 둔다.
 * 종전 import 경로 호환을 위해 `transfer-tax-validate-split.ts`가 재export한다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { withoutBgHiddenAcqFlags } from "./bg-asset-acq-mode-scope";
import { resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { effectiveSelfOwns } from "./self-owns-scope";
import { fieldError } from "./transfer-tax-validate-field";
import { isLandBuildingSplitable } from "./self-owns-scope";
import { engineLandOverlay } from "./transfer-land-part-cause";
import { anyPartCarryover } from "./transfer-land-part-cause";
import { validateSplitCarryoverParts } from "./transfer-tax-validate-split-carryover";
import { normalizeBuildingCauseInputs } from "./transfer-land-part-cause";
import { splitBuildingAcqPriceInput } from "./transfer-land-part-cause";
import { landPartCauseSameDay } from "./transfer-land-part-cause";
import { LAND_CAUSE_SAME_DAY_MESSAGE } from "./transfer-land-part-cause";
import { buildingHouseKindSent } from "./transfer-building-sec164-bridge";
import { buildingBundledStdPriceSent } from "./transfer-land-part-cause";
import { deriveBuildingSec164Total } from "./transfer-building-sec164-bridge";
import { buildingSec164Applies } from "./transfer-building-sec164-bridge";
import { phdPayloadActive } from "./phd-toggle-scope";
import { phdFlagEffective } from "./phd-toggle-scope";
import { collectSplitPartCauseIssues } from "@/lib/tax-engine/transfer-split-part-cause";
import { isPartialAreaScenario } from "./transfer-pre1990-housing-land-bridge";
import { deriveHousingLandSec164Total } from "./transfer-pre1990-housing-land-bridge";
import { deriveHousingLandSec164Whole } from "./transfer-pre1990-housing-land-bridge";
import { invalidSec164GradeField } from "./transfer-pre1990-housing-land-bridge";
import { sec164LandPartStatus } from "./sec164-required-fields";
import { sec164BuildingPartStatus } from "./sec164-required-fields";
import { sec164HouseLandPartStatus } from "./sec164-required-fields";
import { houseLandSec164Applies } from "./transfer-house-land-sec164-bridge";
import { landHouseExistedSent } from "./transfer-house-land-sec164-bridge";
import { houseLandKindSent } from "./transfer-house-land-sec164-bridge";
import { deriveHouseLandSec164Total } from "./transfer-house-land-sec164-bridge";
import { houseFirstDisclosureSent } from "./house-first-disclosure";
import { validateLandRebuild } from "./transfer-tax-validate-land-rebuild";
import { LAND_PART_RESIDENCE_RENTAL_20_MESSAGE } from "@/lib/tax-engine/transfer-split-land-residence";
import { landPartResidenceFacts } from "./transfer-split-land-residence-scope";

const SEC164_TAIL =
  " — 1990.8.30. 개별공시지가 고시 전에 상속·증여받은 토지는 영 §164④ 가액(토지등급 환산)과 평가액 중 많은 금액이 취득가액입니다 "
  + "(소득세법 시행령 §163조 제9항 단서 1호)";

/**
 * D1-4b — 단서 구간에서 ②(영 §164④ 가액) 입력 완결 요구. 필수다(opt-in 아님 — 비교를 건너뛴 ① 단독 계산은 하지 않는다).
 * 칸 순서 = 계산 순서: 면적 → 현재등급 → 직전등급 → 취득시등급 → 1990 공시지가 → (모두 찼는데 등급이 범위 밖) 불량 등급 칸.
 * ④ 브리지(`deriveHousingLandSec164Total`)가 ②를 못 만드는 경우를 빠짐없이 덮는다 — 그래야 ⑧ 통과 ⇒ ④가 ②를 보냄 ⇒ ⑫ 통과.
 */
function validateLandSec164Inputs(asset: AssetForm, label: string): string {
  const status = sec164LandPartStatus(asset);
  if (status.missing.length > 0) {
    return fieldError(status.missingFields[0], `${label}: ${status.missing[0]} 칸을 입력하세요${SEC164_TAIL}`);
  }
  const bad = invalidSec164GradeField(asset);
  return fieldError(
    bad ?? "pre1990Grade_atAcq",
    `${label}: 토지등급으로 영 §164④ 가액을 계산할 수 없습니다 — 등급번호(1~365) 또는 등급가액을 확인하세요${SEC164_TAIL}`,
  );
}

const BUILDING_SEC164_TAIL =
  " — 2005.4.30. 개별주택가격 공시 전에 상속·증여받은 단독·다가구주택 건물은 평가액과 영 §164⑦ 가액의 건물 몫 중 많은 금액이 취득가액입니다 "
  + "(소득세법 시행령 §163조 제9항 단서 2호)";

/** 단서 2호 구간에서 주택 구분을 고르지 않았을 때(모름 = 불성립 — 단독으로 보지 않는다). 공동주택을 고른 경우는 leaf 문구 그대로. */
export const BUILDING_HOUSE_KIND_REQUIRED_MESSAGE =
  "주택 구분(단독·다가구주택 / 공동주택)을 선택하세요 — 단독·다가구주택이면 평가액과 영 §164⑦ 가액의 건물 몫을 비교하고, "
  + "공동주택은 이 비교를 지원하지 않습니다. 고르지 않으면 단독·다가구주택으로 보지 않습니다 (소득세법 시행령 §163조 제9항 단서 2호)";

/**
 * D2-4b — 단서 2호 구간에서 ②(영 §164⑦ 가액의 건물 몫) 입력 완결 요구(필수 — D1-4b 토지 `validateLandSec164Inputs`와 같은 모양).
 * 칸 순서 = 카드 위→아래: 면적 → 최초공시 개별주택가격 → 최초공시 개별공시지가 → 최초공시 건물 기준시가 → 취득 당시 건물 기준시가
 * → (모두 찼는데 건물 몫이 0원 — 분자가 분모보다 작다) 취득 당시 건물 기준시가 칸.
 * ④ 브리지(`deriveBuildingSec164Total`)가 ②를 못 만드는 경우를 빠짐없이 덮는다 — ⑧ 통과 ⇒ ④가 ②를 보냄 ⇒ ⑫ 통과.
 */
function validateBuildingSec164Inputs(asset: AssetForm, label: string): string {
  const status = sec164BuildingPartStatus(asset);
  if (status.missing.length > 0) {
    return fieldError(status.missingFields[0], `${label}: ${status.missing[0]} 칸을 입력하세요${BUILDING_SEC164_TAIL}`);
  }
  return fieldError(
    "inhHouseValBuildingStdPriceAtInheritance",
    `${label}: 영 §164⑦ 가액의 건물 몫이 0원으로 계산됩니다 — 최초공시 개별주택가격·기준시가 입력값(원 단위)을 확인하세요${BUILDING_SEC164_TAIL}`,
  );
}

const HOUSE_LAND_SEC164_TAIL =
  " — 1990.8.30.~2005.4.29.에 상속·증여받은 주택 부수토지로, 받을 당시 이 주택이 그 위에 있었으면 평가액과 영 §164⑦ 가액의 토지 몫 중 "
  + "많은 금액이 토지 취득가액입니다 (소득세법 시행령 §163조 제9항 단서 2호 · 부동산거래관리과-364)";

/** D1-H — 「받을 당시 주택이 있었는가」 미선택(⑧ 전용 — 엔진·⑫는 미선택을 모름으로 읽어 막지 않는다. 화면은 명시 선택을 받는다). */
export const LAND_HOUSE_EXISTED_REQUIRED_MESSAGE =
  "토지를 받을 당시 지금의 주택이 그 위에 있었는지 선택하세요 — 있었으면 평가액과 영 §164⑦ 가액의 토지 몫을 비교하고, 모르면 평가액만으로 "
  + "계산하고 결과에 확인 필요를 표시합니다 (소득세법 시행령 §163조 제9항 단서 2호)";

/** D1-H — 주택 구분 미선택(모름 = 불성립 — 단독으로 보지 않는다). 공동주택을 고른 경우는 leaf 문구 그대로. */
export const HOUSE_LAND_KIND_REQUIRED_MESSAGE =
  "주택 구분(단독·다가구주택 / 공동주택)을 선택하세요 — 단독·다가구주택이면 평가액과 영 §164⑦ 가액의 토지 몫을 비교하고, "
  + "공동주택은 이 비교를 지원하지 않습니다. 고르지 않으면 단독·다가구주택으로 보지 않습니다 (소득세법 시행령 §163조 제9항 단서 2호)";

/**
 * D1-H — ②(영 §164⑦ 가액의 토지 몫) 입력 완결 요구(필수 — D2-4 `validateBuildingSec164Inputs`와 같은 모양).
 * 칸 순서 = 카드 위→아래: 면적 → 최초공시 개별주택가격 → 최초공시 개별공시지가 → 최초공시 건물 기준시가 → 취득 당시 개별공시지가
 * → (모두 찼는데 토지 몫이 0원) 취득 당시 개별공시지가 칸. ④ 브리지가 ②를 못 만드는 경우를 빠짐없이 덮는다 — ⑧ 통과 ⇒ ④가 ②를 보냄 ⇒ ⑫ 통과.
 */
function validateHouseLandSec164Inputs(asset: AssetForm, label: string): string {
  const status = sec164HouseLandPartStatus(asset);
  if (status.missing.length > 0) {
    return fieldError(status.missingFields[0], `${label}: ${status.missing[0]} 칸을 입력하세요${HOUSE_LAND_SEC164_TAIL}`);
  }
  return fieldError(
    "inhHouseValLandPricePerSqmAtInheritance",
    `${label}: 영 §164⑦ 가액의 토지 몫이 0원으로 계산됩니다 — 최초공시 개별주택가격·공시지가·기준시가 입력값(원 단위)을 확인하세요${HOUSE_LAND_SEC164_TAIL}`,
  );
}

/**
 * 토지 파트 취득원인 규칙(D0 — G-1·G-2·G-3). 엔진·⑫와 **같은 leaf**(`collectSplitPartCauseIssues`)에
 * ④가 실제로 보내는 값(유효 원인 — `effectiveLandAcquisitionCause`)을 넣는다.
 *
 * ⚠️ 신축 분기(`transfer-tax-validate-acquisition.ts`)도 직접 부른다 — 그 분기는 `validateSplitDirectInputs`에
 *    닿기 전에 반환하는데, 이 규칙의 범위(건물 신축 + 토지 상속·증여)가 정확히 그 분기다.
 */
export function validateLandPartCause(
  rawAsset: AssetForm,
  label: string,
  /**
   * isNonPrimary — 함께 양도 자산(첫 자산이 아님): 파트 이월과세를 받지 않는 자리라 leaf에 `partCarryoverSupported: false`(S0)를 넘긴다. ⑫가 컴패니언에 넘기는 값과 같다.
   * formTransferDate·hasCompanions — P3 A(토지 이월과세) 위임이 쓴다(등기접수일 < 양도일 · leaf S2′).
   */
  opts?: { isNonPrimary?: boolean; formTransferDate?: string; hasCompanions?: boolean },
): string | null {
  // P3 A·P4 B — 토지만·건물만 이월과세: 이월과세 입력 칸(화면 위→아래)과 같은 leaf를 그 사실로 건다(`transfer-tax-validate-split-carryover.ts`). 함께 양도 자산도 그 파일이 S0로 막는다.
  if (anyPartCarryover(rawAsset))
    return validateSplitCarryoverParts(rawAsset, label, opts?.formTransferDate, { hasCompanions: opts?.hasCompanions, isNonPrimary: opts?.isNonPrimary });
  // D2: ④와 같은 사본(stale 분리 입력 무시 · 건물 방식 실가 고정) · V-5: 부담부증여의 숨은 감정·매매사례 플래그 무시(④와 같은 술어)
  const asset = withoutBgHiddenAcqFlags(normalizeBuildingCauseInputs(rawAsset));
  const selfOwnsEff = effectiveSelfOwns(asset) ?? "both";
  const selfOwnsSplit = selfOwnsEff !== "both";
  // ④ `buildSplitPayload`의 토지 취득일 식 그대로 — 토지 취득일 칸 값, 없으면 PHD·소유자 분리의 건물 취득일 후퇴.
  //    PHD는 컴패니언에서 열리지 않으므로(⑤·⑧ N-6 (B)) 플래그만 봐도 ④(주 자산 `usesPhd`)와 같다.
  const landDateSent =
    asset.landAcquisitionDate && (asset.hasSeperateLandAcquisitionDate === true || selfOwnsSplit)
      ? asset.landAcquisitionDate
      : phdFlagEffective(asset) || selfOwnsSplit
        ? asset.acquisitionDate
        : undefined;
  // D1 사실도 ④가 실제로 보내는 값으로(3중 패턴): 소유 축 = 유효값, PHD = 페이로드 게이트, 부담부증여 = 단건 ④가
  // 원인·토지 취득일을 그대로 싣는 조건(⑫ R-X1과 같은 술어). 가업상속은 건물 원인이 상속일 때만 열려 원인 혼합과
  // 동시에 도달하지 않는다(⑫ R-X3이 API 직접 호출을 막는다).
  const [issue] = collectSplitPartCauseIssues({
    isSplitable: isLandBuildingSplitable(asset.assetKind),
    hasLandAcquisitionDate:
      (!!asset.landAcquisitionDate && (asset.hasSeperateLandAcquisitionDate === true || selfOwnsSplit)) ||
      phdFlagEffective(asset) ||
      selfOwnsSplit,
    // D2 합성 — D1 유효 원인, 없으면 건물 상속·증여 + 토지 매매의 `purchase`(④ `engineLandOverlay`와 같은 값).
    landAcquisitionCause: engineLandOverlay(asset),
    hasLandDecedentAcquisitionDate: !!asset.landDecedentAcquisitionDate,
    landMode: effectivePartAcqMode(asset.landAcqMode, asset),
    landAcquisitionDate: landDateSent || undefined,
    buildingAcquisitionCause: asset.acquisitionCause,
    selfOwns: selfOwnsSplit ? selfOwnsEff : undefined,
    isBurdenedGift: asset.transferType === "burdened_gift" || asset.acquisitionCause === "burdened_gift",
    hasPreHousingDisclosure: phdPayloadActive(asset),
    // D1-4b — ② 사실은 ④가 실제로 보내는 값(브리지 파생 총액) 그대로. 토지 취득일은 위 `landDateSent` — ④ 브리지는
    //   `asset.landAcquisitionDate`를 직독하므로 같은 값을 넣은 사본을 먹인다(유효 토지 원인이면 `hasSeperate…`가 참이라 두 식은 같다).
    //   일부 양도는 ④가 `isPartialAreaTransfer`로 실제로 보낸다(`buildLandPartCausePayload`).
    landSec164Value: deriveHousingLandSec164Total({ ...asset, landAcquisitionDate: landDateSent ?? "" }) || undefined,
    // 1985.1.1. 전 토지 파트 ③ — ④가 실제로 보내는 값(같은 브리지의 지분 반영 전 파생 · 양도시 토지 기준시가 `resolveLandStdAtTransfer`).
    landSec164ValueWhole: deriveHousingLandSec164Whole({ ...asset, landAcquisitionDate: landDateSent ?? "" }) || undefined,
    hasLandStdAtTransfer: (resolveLandStdAtTransfer(asset) ?? 0) > 0,
    isPartialAreaTransfer: isPartialAreaScenario(asset),
    // D2-4 — 영 §163⑨ 단서 2호(2005.4.30. 전 상속·증여 건물). 주택 구분·②는 ④가 실제로 보내는 값(`buildingHouseKindSent`·
    //   `deriveBuildingSec164Total` — 카드 `BuildingSec164Card`가 받는 5칸의 파생) 그대로. 일부 양도·공동주택·비주택은 leaf가 판정한다.
    isHousing: asset.assetKind === "housing",
    // D2-4·D1-H는 overlay 방향이 반대라 한 자산에서 동시에 켜지지 않는다 — 주택 구분 사실은 켜진 쪽 브리지가 보낸 값.
    buildingHouseKind: buildingHouseKindSent(asset) ?? houseLandKindSent(asset),
    buildingSec164Value: deriveBuildingSec164Total(asset) || undefined,
    // 비주택 건물 2001.1.1.~2005.4.29. 상속·증여 — 일괄 고시 여부. ④가 실제로 보내는 값(`buildingBundledStdPriceSent`)
    buildingBundledStdPrice: buildingBundledStdPriceSent(asset),
    // D1-H — 주택 부수토지 단서 2호. 「받을 당시 주택 있음」·②는 ④가 실제로 보내는 값(브리지 `landHouseExistedSent`·`deriveHouseLandSec164Total`).
    landHouseExisted: landHouseExistedSent(asset),
    landHouseSec164Value: deriveHouseLandSec164Total(asset) || undefined,
    // 주택별 최초공시일 — ④가 실제로 보내는 값(`houseFirstDisclosureSent` — 명시 단독·다가구 ∧ 2005-04-30 뒤일 때만)
    houseFirstDisclosureDate: houseFirstDisclosureSent(asset),
    // D2 — ④가 실제로 보내는 값. 건물 방식은 D2 유효 시 실가 고정, 자산 단위 평가 payload는 D2 유효 시 미전송(= false).
    buildingMode: effectivePartAcqMode(asset.buildingAcqMode, asset),
    buildingAcquisitionDate: asset.acquisitionDate || undefined,
    hasBuildingAcquisitionPrice: parseAmount(splitBuildingAcqPriceInput(asset) ?? "") > 0,
    hasLandAcquisitionPrice: parseAmount(asset.landAcquisitionPrice ?? "") > 0,
    ...(opts?.isNonPrimary ? { partCarryoverSupported: false } : {}),
    // 4289 — 건물 증여 전 동일세대 거주. 호스트(D2 증여·주 자산·본인 토지·건물 소유)에서 토글 ON일 때만 값을 넘긴다 — ④가 싣는 값과 같은 leaf(3중 패턴).
    ...landPartResidenceFacts(asset, { isNonPrimary: opts?.isNonPrimary }),
  });
  // Q-4 — ⑫는 막지 않는 ⑤·⑧ 정책(엔진 값은 원인 없음과 같다 — 계획서 §10.2 T-4).
  if (!issue && landPartCauseSameDay(asset)) return fieldError("landAcquisitionDate", `${label}: ${LAND_CAUSE_SAME_DAY_MESSAGE}`);
  // D1-H Q-1 — 화면은 「받을 당시 주택이 있었는가」를 명시 선택으로 받는다(⑧ 전용 — 엔진·⑫는 미선택을 모름으로 읽는다: ⑧이 더 엄격한 방향).
  if (!issue && houseLandSec164Applies(asset) && !landHouseExistedSent(asset))
    return fieldError("landHouseExisted", `${label}: ${LAND_HOUSE_EXISTED_REQUIRED_MESSAGE}`);
  // 구주택 멸실·신축 통산 — 위 원인 규칙을 모두 통과한 뒤(토지 취득일·원인 칸이 먼저). 입력이 없으면 null(회귀 0).
  if (!issue) return validateLandRebuild(asset, label, opts);
  // ② 필수 위반 = 화면 입력 칸(`LandSec164Card` 5칸 + 기본 정보의 토지 면적) 중 첫 미완 칸으로 이동시킨다(엔진 문구는 API 소비자용).
  // ③ 분자(② 지분 반영 전)도 같은 카드 5칸에서 나온다 — ②가 있으면 ④가 함께 보내므로 화면에서는 ②와 같이 풀린다.
  if (issue.field === "landSec164Value" || issue.field === "landSec164ValueWhole") return validateLandSec164Inputs(asset, label);
  // ③ 분모 — 축 A 「양도시 기준시가」 카드의 ㎡당 공시지가 칸으로(양도시 토지 기준시가 = 단가 × 양도 당시 면적).
  if (issue.field === "landStandardPriceAtTransfer") return fieldError("standardPricePerSqmAtTransfer", `${label}: ${issue.message}`);
  // D2-4b — 단서 2호 ② 필수 위반 = 카드(`BuildingSec164Card`) 5칸 + 기본 정보의 토지 면적 중 첫 미완 칸으로.
  if (issue.field === "buildingSec164Value") return validateBuildingSec164Inputs(asset, label);
  // D1-H — 주택 부수토지 ② 필수 위반 = 카드(`HouseLandSec164Card`) 4칸 + 기본 정보의 토지 면적 중 첫 미완 칸으로.
  if (issue.field === "landHouseSec164Value") return validateHouseLandSec164Inputs(asset, label);
  // D1-H — 받을 당시 주택이 있었는데 단독·다가구로 확인되지 않음 → 카드의 주택 구분 칸으로(미선택은 선택 요구, 공동주택은 leaf 문구).
  if (issue.field === "buildingHouseKind") {
    return fieldError("inheritanceAssetKind", `${label}: ${houseLandKindSent(asset) ? issue.message : HOUSE_LAND_KIND_REQUIRED_MESSAGE}`);
  }
  // 단서 2호 구간의 주택인데 단독·다가구로 확인되지 않음(leaf Y4d — API 칸은 건물 취득일) → 카드의 주택 구분 칸으로.
  // 고르지 않았으면 선택을 요구하고, 공동주택을 골랐으면 leaf 문구(지원하지 않는 이유)를 그대로 낸다.
  if (issue.field === "acquisitionDate" && buildingSec164Applies(asset)) {
    return fieldError("inheritanceAssetKind", `${label}: ${buildingHouseKindSent(asset) ? issue.message : BUILDING_HOUSE_KIND_REQUIRED_MESSAGE}`);
  }
  // 4289 — §155⑳ 선언 + 토글 ON: 칸은 그대로 보인다(막다른 길 금지) — 해소 방법 둘을 문구에 적는다.
  if (issue.message === LAND_PART_RESIDENCE_RENTAL_20_MESSAGE)
    return fieldError("landPartDonorSameHousehold", `${label}: ${issue.message} — 「건물 증여자와 증여일부터 양도일까지 계속 같은 세대」를 끄거나 장기임대주택 거주주택 특례 선언을 해제하세요.`);
  const msg = `${label}: ${issue.message}`;
  // 「토지는 다른 원인으로 취득」 블록엔 산정방식 라디오가 없다(켜는 순간 실거래가로 고정) — 고칠 칸이 없어 field를
  // 달지 않고 방법을 적는다. 남은 값은 그 고정을 거치지 않은 잔재다.
  if (issue.field === "landAcqMode") return `${msg} — 「토지는 다른 원인으로 취득」을 껐다가 다시 켜면 실거래가로 고정됩니다.`;
  // Y7 `inheritedAcquisition`은 ④가 D2 유효 시 싣지 않는 payload라 ⑧에는 고칠 칸이 없다(발동하지 않음) — 앵커만 토글 칸으로.
  // P1 파트 이월과세 입력 칸(landCarryoverPart 등)은 아직 폼에 없다(P2~) — 토지 취득원인 앵커로 모은다.
  const anchor =
    issue.field === "inheritedAcquisition" ||
    issue.field === "landCarryoverPart" ||
    issue.field === "buildingCarryoverPart" ||
    issue.field === "carryoverGiftEvent" ||
    issue.field === "carryoverTaxation" ||
    issue.field === "expenses"
      ? "landAcquisitionCause"
      : issue.field;
  return fieldError(anchor, msg);
}

