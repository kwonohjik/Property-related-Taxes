/**
 * ④⑬ 토지·건물 분리(소령 §166⑥·§168②) API 페이로드 빌더 — `transfer-tax-api.ts`에서 분리(800줄 정책).
 *
 * 분리 축의 게이트 판정과 파트 필드 전송을 **한 곳에 모은다**. 게이트가 본체에 흩어져 있으면
 * "UI는 칸을 노출하는데 API는 전송하지 않는" 침묵 누락이 재발한다(PR #837 §3.1 실사고).
 */

import { parseAmount } from "@/lib/calc/number-parse";
import { applyRatio, getOwnershipRatio } from "./transfer-tax-api-helpers";
import { resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import { effectivePartAcqMode, isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import { deriveLegacyPartAcqMode } from "./transfer-tax-split-acq-mode";
import { resolveLandStdAtTransfer } from "./transfer-tax-split-acq-mode";
import { ownerSplitHousingNeedsBuildingStd } from "./transfer-tax-split-acq-mode";
import { ownerSplitHousingNeedsTransferTotal } from "./transfer-tax-split-acq-mode";
import { housingExcessInheritedTotal, housingExcessNeedsLandSplit } from "./housing-excess-split";
import { housingExcessCapexParts, housingExcessNeedsCapexSplit } from "./housing-excess-split";
import { housingExcessAcqContractPayload } from "./housing-excess-acq-contract";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { effectiveSelfOwns } from "./self-owns-scope";
import { effectiveLandAcquisitionCause } from "./transfer-land-part-cause";
import { engineLandOverlay } from "./transfer-land-part-cause";
import { normalizeBuildingCauseInputs } from "./transfer-land-part-cause";
import { effectiveCarryoverDonorSplit } from "./transfer-land-part-cause";
import { buildSplitCarryoverPayload } from "./transfer-tax-api-split-carryover";
import type { SplitCarryoverPayload } from "./transfer-tax-api-split-carryover";
import { carryoverAcquisitionDateFallback } from "./transfer-tax-api-carryover";
import { splitBuildingAcqPriceInput } from "./transfer-land-part-cause";
import { buildingBundledStdPriceSent } from "./transfer-land-part-cause";
import {
  buildingHouseKindSent,
  buildingSec164Applies,
  deriveBuildingSec164Total,
} from "./transfer-building-sec164-bridge";
import {
  deriveHouseLandSec164Total,
  houseLandKindSent,
  landHouseExistedSent,
} from "./transfer-house-land-sec164-bridge";
import {
  deriveHousingLandSec164Total,
  deriveHousingLandSec164Whole,
  isPartialAreaScenario,
  landSec164Applies,
} from "./transfer-pre1990-housing-land-bridge";
import { saleSplitProvisoApplies } from "./sale-split-100-3-era";
import { isPreDeemedLandPart } from "@/lib/tax-engine/transfer-split-part-cause";

/**
 * 지분 스케일 적용기 — **금액 필드 전용** 단일 진입점.
 *
 * UI 입력은 전부 100% 기준값이고(`AssetForm.ownershipNumerator` 규약) API 변환이 × ratio를
 * 적용한다. 총액(`transferPrice`·`acquisitionPrice`·`capitalExpenditure` 등)은 이미 그렇게
 * 처리되는데 **파트 필드·추계 가액은 raw로 새어나가고 있었다** — 같은 body 안에서 100%와
 * 지분 스케일이 섞여 세액이 틀어진다.
 *
 * ⚠️ 기준시가는 대상이 아니다 — 소유 지분이 아니라 물건의 속성값이며, 환산 산식에서
 *    분자·분모로 함께 나타나 비율이 상쇄된다.
 */
export function makeRatioed(ratio: number, fractional: boolean) {
  return (v: string | undefined): number | undefined => {
    const n = parseAmount(v ?? "");
    if (!n) return undefined;
    return fractional ? applyRatio(n, ratio) : n;
  };
}

/**
 * «같은 날 취득 주택의 배율 초과분 분리»(#17) 컨텍스트 — 양도일이 있어야 배율을 정한다. 주 자산·함께 양도 주택 카드(#17-1)가 같이 넘긴다.
 * 생략하면(감가상각 범위 판정) 그 경로를 보지 않는다.
 */
export type ExcessSplitCtx = {
  transferDate: string | undefined;
  /** 첫 자산이 아님(함께 양도 주택 카드) — §164⑦ PHD는 첫 자산에만 닿는다(`usesPhdGate`). 생략 = 첫 자산. */
  isNonPrimary?: boolean;
};

/** 분리 축이 활성인가 — `calcSplitGain` 진입 게이트(transfer-tax-split-gain.ts)와 동일 조건. */
export function isSplitPayloadActive(
  rawPrimary: AssetForm,
  isBurdenedGift: boolean,
  primaryCtx?: ExcessSplitCtx,
): boolean {
  // 상속·증여 호스트의 화면에 없는 분리 입력(stale)은 보내지 않는다 — `hasStaleSplitInput`(D2 Check 후속).
  const primary = normalizeBuildingCauseInputs(rawPrimary);
  // ⚠️ 부담부증여 제외 — 엔진이 transferPrice·acquisitionPrice를 §159 안분액으로 override하므로
  //    (transfer-tax-burdened-gift-step.ts) 사용자가 화면에서 보는 계약 총액과 **다른 총액**이 기준이 된다.
  //    그 상태로 토지 양도가액을 직접 입력하면 잔액이 계약총액 기준으로 계산돼 음수가 된다
  //    (계약 10억·§159 채무 4억에서 토지 6억 입력 → 건물 = 4억 − 6억 = −2억).
  //    부담부증여는 기준시가 비율 안분만 사용한다.
  return (
    // P2 C — 통째 이월과세 + 증여자 토지·건물 취득일 상이(파트 이월과세). 취득일 분리 토글이 없어도 분리 계산이 성립한다.
    effectiveCarryoverDonorSplit(primary, { isNonPrimary: primaryCtx?.isNonPrimary }) ||
    // M2 — 소유 축은 ⑤가 여는 범위에서만 읽는다(`self-owns-scope.ts`). 토지 등에 남은 잔재는 `both`.
    ((primary.hasSeperateLandAcquisitionDate === true || effectiveSelfOwns(primary) !== "both") &&
      !isBurdenedGift) ||
    // #17 — 같은 날 취득 주택의 배율 초과분 분리(기준시가 5칸). ⑤ 카드 노출·⑧ 필수와 같은 술어.
    (primaryCtx !== undefined && housingExcessNeedsLandSplit(primary, primaryCtx.transferDate, primaryCtx.isNonPrimary))
  );
}

/** 분리 축 전송 페이로드 — 본체 body에 그대로 spread한다. */
export function buildSplitPayload(
  rawPrimary: AssetForm,
  opts: {
    isBurdenedGift: boolean;
    /** §164⑦ PHD 모드 — 취득일 동일이어도 calcSplitGain 진입을 위해 landAcquisitionDate fallback */
    usesPhd: boolean;
    ratioed: (v: string | undefined) => number | undefined;
    /** 양도일 — «같은 날 취득 주택의 배율 초과분 분리»(#17) 게이트(주 자산·함께 양도 주택 카드 공통) */
    primaryCtx?: ExcessSplitCtx;
  },
): Record<string, unknown> {
  const { isBurdenedGift, usesPhd, ratioed, primaryCtx } = opts;
  // D2 — 건물 상속·증여 + 토지 매매면 건물 방식은 실가(평가액) 고정. ⑧·⑥과 같은 사본(`withBuildingActualWhenMix`).
  const primary = normalizeBuildingCauseInputs(rawPrimary);
  const isSplitActive = isSplitPayloadActive(primary, isBurdenedGift, primaryCtx);
  // #17 — 같은 날 취득 주택의 배율 초과분 분리 경로(소유자 분리·별개취득이 아니다). 엔진 `housingExcessSplitAppliesToInput`과 같은 술어.
  const excessSplit = primaryCtx !== undefined && housingExcessNeedsLandSplit(primary, primaryCtx.transferDate, primaryCtx.isNonPrimary);
  // **별개 취득** — 분리 활성의 부분집합. 취득시점이 실제로 달라 취득가액이 파트별로 실재하는
  // 경우만 true(겸용·selfOwns 강제 분리에서 날짜가 같으면 false).
  // 엔진 취득가액 축의 파트별 완결 게이트(§97①1호·§114⑦) — 판정 단일 소스는 그 헬퍼 1곳.
  const separateAcquisition = isSplitActive && isSeparateAcquisition(primary);
  // 파트 입력(구분 양도가액·양도시 감정평가·파트 취득가액·매매사례·자본적지출)이 **화면에 있는가** — 분리 섹션은 별개취득 토글
  // (`hasSeperateLandAcquisitionDate`)·소유자 분리일 때만 렌더된다. 배율 초과분 분리만으로 활성이면 그 칸들이 없다(카드는 기준시가 5칸만 받는다).
  // 별개취득을 켰다 끈 잔존값이 그대로 실리면 엔진이 파트 값을 우선해 §166⑥ 기준시가 안분을 조용히 바꾼다(#17 후속 검토 — 감정 4.5억 시료
  // 11,077,892 → 잔존 토지 취득가액 1억 25,835,260). 술어는 `isSplitPayloadActive`의 첫 항(별개취득 토글·소유자 분리)과 같다.
  const partInputsActive =
    isSplitActive &&
    (primary.hasSeperateLandAcquisitionDate === true ||
      effectiveSelfOwns(primary) !== "both" ||
      // P2 C — 파트 취득가액(증여 신고가액)·수증자 자본적지출·양도가액 구분 칸이 화면에 있다(`CarryoverPartsSaleAxis`).
      effectiveCarryoverDonorSplit(primary, { isNonPrimary: primaryCtx?.isNonPrimary }));

  // 파트 모드 미선택("") 시 자산 전체 레거시 플래그에서 파생 —
  // UI 표시·validate와 단일 소스(effectivePartAcqMode, dual-truth 방지).
  // #17-4 — 배율 초과분 분리 경로는 파트 방식 라디오가 화면에 없다(별개취득·소유자 분리가 아니다). 저장된 파트 방식은 별개취득을 켰다 끈
  //   잔재일 수 있어 자산 단위 방식으로 싣는다 — ⑤⑧의 술어(`housingExcessNeedsLandSplit`)가 읽는 방식과 같은 값.
  //   별개취득 토글을 켠 채 같은 날짜면 라디오가 화면에 있다 — 자산 단위 방식과 다르면 ⑧이 그 라디오로 막는다(`housingExcessPartModeMismatch`, F1).
  const landAcqMode = excessSplit ? deriveLegacyPartAcqMode(primary) : effectivePartAcqMode(primary.landAcqMode, primary);
  const buildingAcqMode = excessSplit ? deriveLegacyPartAcqMode(primary) : effectivePartAcqMode(primary.buildingAcqMode, primary);
  const saleSplitMode = primary.saleSplitMode ?? "apportioned";

  // 🔴 **비소유 파트 차단** — 소유 축(`selfOwns`)이 취득가액 전송 게이트의 일부다(2026-08-13).
  //
  // UI는 비소유 파트의 취득가액 칸을 렌더하지 않고(LandBuildingSplitSection `landOwned` 게이트)
  // validate도 그 파트를 건너뛴다(`validateSeparateAcqParts` :55-80 `p.owned`). 그런데 게이트가
  // `selfOwns`를 보지 않으면 **`both`일 때 입력해 둔 값이 그대로 남아** 전송된다
  // (`AssetOwnershipSplitSection`은 전환 시 값을 지우지 않는다 — 토글 복귀 시 복원 규약).
  //
  // 엔진 `splitPair`(transfer-tax-split-gain.ts)는 한쪽만 입력되면 반대쪽을 `총액 − 입력값`으로
  // 도출하므로, **화면에 없는 잔존값이 본인 파트 취득가액을 결정**하고 §166⑥ 기준시가 비율
  // 안분이 조용히 우회된다(실측: 건물 취득가액 125,000,000 → 50,000,000, 총세액 +27,604,500).
  //
  // 술어는 `separateAcqPartsSum`(transfer-tax-split-acq-mode.ts:125·131)·
  // `validateSeparateAcqParts`(transfer-tax-validate-split.ts:59·66)와 **같은 값**이어야 한다 —
  // 어긋나면 "UI 통과 ↔ validate 차단" 모순이 생긴다(⑧ 규칙).
  //
  // ⚠️ **기준시가 필드로 확대하지 않는다** — 비소유 토지의 취득시 기준시가 카드는 일부러
  //    렌더된다(주택 라목 결합 공시를 토지분·건물분으로 나누는 비례 안분의 분모). 물건 속성값이라 소유 축과 무관하다.
  const selfOwnsEff = effectiveSelfOwns(primary);
  const selfOwns = selfOwnsEff ?? "both";
  const landOwned = selfOwns !== "building_only";
  const buildingOwned = selfOwns !== "land_only";
  // 파트별 취득가액 직접입력 게이트 — actual·appraisal 모드만(환산·매매사례는 총액을 사용자가 입력하지 않음).
  // UI가 분리 칸을 노출하는 조건과 동일(LandBuildingSplitSection showAcqInputs 파트별 판정).
  const landAcqDirectActive =
    partInputsActive && landOwned && (landAcqMode === "actual" || landAcqMode === "appraisal");
  const buildingAcqDirectActive =
    partInputsActive && buildingOwned && (buildingAcqMode === "actual" || buildingAcqMode === "appraisal");
  // 양도가액 직접입력 게이트 — saleSplitMode==="actual"(구분양도) 시만.
  //
  // 🔴 **엔진은 `saleSplitMode`를 읽지 않는다** (2026-08-06 실측 — `types/transfer.types.ts`의
  //    타입 선언 1곳뿐이고 소비 지점이 없다. 계획서 Q-7의 주석↔구현 드리프트를 여기서 정정한다).
  //    실제 스위치는 `landTransferPrice`/`buildingTransferPrice`의 **유무**다.
  //
  // ⇒ 그래서 이 게이트는 "사용자 의도 보호"가 아니라 **유일한 방어선**이다. "기준시가 비율 안분"
  //    으로 되돌린 뒤 잔존한 직접 입력값이 여기를 통과하면, 엔진은 그것을 구분 기재로 보고
  //    §100③ 30% 판정까지 태운다(`transfer-tax-split-sale-price.ts`).
  //
  // 🔴 겸용주택은 제외한다(계획서 `mixed-use-sale-split-basis.plan.md` R-4). 겸용 화면도 같은 폼 키(`landTransferPrice`·
  //    `landAppraisalAtTransfer` 등)를 쓰지만 값은 `mixedUse` 서브객체로만 간다(`transfer-tax-api-mixed-use-sale-split.ts`).
  //    여기서도 실으면 토지·건물 취득일이 다른 겸용(별개 취득 → `partInputsActive`)에서 최상위로 **이중 전송**된다.
  const saleSideActive = partInputsActive && !(primary.assetKind === "housing" && primary.isMixedUseHouse === true);
  const saleDirectActive = saleSideActive && saleSplitMode === "actual";
  // 양도시 기준시가 — 분리 축이 활성이면 **항상 전송**한다(2026-07-29 S1 해소).
  //
  // 종전 게이트는 `apportioned || 어느 파트든 환산`이었다. 그러나 validate V4가
  // "구분양도 + 양도가액 미입력 + **양도시 기준시가 2필드**"를 정당한 입력으로 인정하므로
  // (§166⑥ → 부가세령 §64①1호 — 구분이 없으면 양도 당시 기준시가 비율), 그 조합에서 필드가
  // 전송되지 않아 **validate는 통과시키는데 엔진은 throw**했다(계층 간 `hasSaleRatio` 비대칭 —
  // UI·validate는 폼값 기준, 엔진은 `resolveSaleApportionBasis` 즉 전송값 기준).
  //
  // 과잉 전송은 무해하다 — 양도가액 2칸이 입력되면 `splitPair`가 비율을 쓰지 않고(split-gain.ts:99),
  // 환산 파트가 없으면 분모로도 소비되지 않는다. 기준시가는 물건 속성값이라 지분 스케일 대상도 아니다.
  const saleStdPriceActive = isSplitActive;
  // #17 후속 — 배율 초과분 분리의 자본적지출 토지분·건물분(카드 1칸). 아래 자본적지출 2필드 참조.
  const excessCapex =
    !partInputsActive && primaryCtx !== undefined && housingExcessNeedsCapexSplit(primary, primaryCtx.transferDate, primaryCtx.isNonPrimary)
      ? housingExcessCapexParts(primary)
      : null;

  return {
    // 토지/건물 취득일 분리 + 소유자 분리 (소령 §166⑥, §168②)
    selfOwns: selfOwnsEff !== "both" ? selfOwnsEff : undefined,
    // ⚠️ `selfOwns !== "both"` fallback(2026-07-30) — 소유자 분리를 **비-매매 취득원인**으로
    //    확대하면서 추가. 상속·증여는 취득일이 하나(상속개시일·증여일)라 토지 취득일을 따로
    //    입력받지 않는데, 이 값이 없으면 `calcSplitGain`이 early-return하고(split-gain.ts:356)
    //    `splitDetail`이 null이 되어 **`selfOwns`가 통째로 무시된다**(transfer-tax.ts:315)
    //    → 비소유 파트까지 전액 과세되는 조용한 오답. `usesPhd`가 쓰는 것과 같은 후퇴 패턴이다.
    //    같은 날짜가 되므로 `isSeparateAcquisition`은 false — 파트별 취득가액 완결 규칙은
    //    발동하지 않고 §166⑥ 기준시가 비율 안분 경로로 흐른다(의도된 동작).
    landAcquisitionDate: effectiveCarryoverDonorSplit(primary, { isNonPrimary: primaryCtx?.isNonPrimary })
      ? // P2 C — 수증자 쪽 두 취득일은 증여 등기접수일 하나다(엔진 S5). 칸이 없는 토지 취득일 잔재가 이기지 않는다.
        carryoverAcquisitionDateFallback(primary) || undefined
      : (primary.hasSeperateLandAcquisitionDate || selfOwnsEff !== "both") && primary.landAcquisitionDate
        ? primary.landAcquisitionDate
        : usesPhd || selfOwnsEff !== "both" || excessSplit
          ? primary.acquisitionDate
          : undefined,
    // 파트별 취득 모드 + 양도 분리 모드 — 엔진 명시 입력(§9 M2, "죽은 모드" 재발 방지).
    ...(isSplitActive
      ? { landAcqMode, buildingAcqMode, saleSplitMode, isSeparateAcquisition: separateAcquisition }
      : {}),
    // 건물분 취득시 기준시가(§99①1호 나목) — **별개 취득** 또는 **주택 비-별개 + 소유자 분리**에서만 전송한다.
    // · 별개 취득(자산 종류 무관, 2026-07-30): §163⑥2호가목은 "라목의 주택 **취득당시**의 라목 가액"을 요구하는데,
    //   토지를 먼저 취득하고 건물을 나중에 취득했다면 토지 취득 당시엔 주택이 없어 라목 결합 공시가 존재하지
    //   않는다 → 각 파트가 자기 취득일 기준으로 §163⑥1호·2호를 따른다(파트 독립 — 결합 총액 미참조).
    // · 주택 비-별개 + 소유자 분리(S3-1): 개별주택가격(결합 공시)을 가목:나목 **비례**로 토지분·건물분에 나눈다
    //   (집행기준 99-164-9). 나목이 비례의 분모라 결합 총액과 함께 보낸다 — **총액은 덮어쓰지 않는다**.
    // 전송 조건 = ⑤ 노출·⑧ 필수와 **같은 술어**(`ownerSplitHousingNeedsBuildingStd`) — 숨은 stale 나목이
    // 비례에 쓰이는 것을 막는다(3중 패턴).
    ...(separateAcquisition || ownerSplitHousingNeedsBuildingStd(primary) || excessSplit
      ? { buildingStandardPriceAtAcquisition: parseAmount(primary.buildingStandardPriceAtAcq) || undefined }
      : {}),
    // #17-5 ② — 개별주택가격(보충적 평가) 상속·증여 주택의 취득시 개별주택가격 총액 = 상속·증여 평가액. 화면은 그 칸을 받지 않으므로(평가액 칸이 정본)
    //   폼에 남은 `standardPriceAtAcq`가 아니라 평가액을 싣는다 — 두 값이 다르면 화면에 없는 값이 계산에 쓰인다.
    ...(excessSplit && primaryCtx !== undefined && housingExcessInheritedTotal(primary, primaryCtx.transferDate, primaryCtx.isNonPrimary) !== undefined
      ? { standardPriceAtAcquisition: housingExcessInheritedTotal(primary, primaryCtx.transferDate, primaryCtx.isNonPrimary) }
      : {}),
    ...(separateAcquisition
      ? {
          // **결합 총액 전송 차단**(2026-07-29 Phase 3). 이 조합에서 자산 전체 취득시 기준시가
          // 블록은 읽기 전용 파생 표시로 바뀌어 사용자가 총액을 더는 입력하지 않는다. 폼에 남은
          // 옛 값이 계속 전송되면 엔진이 그 값을 써 **화면에 보이지 않는 값이 계산에 쓰인다**.
          // 폼 값은 지우지 않는다(토글 복귀 시 복원).
          //
          // ⚠️ 본체(`transfer-tax-api.ts:269`)가 설정한 값을 **덮어쓰는 방식**이다 —
          //    이 빌더의 spread(:316)가 뒤에 오므로 override가 성립한다. 별도 플래그를 body에
          //    넣으면 Zod 스키마에 없는 키가 되어 침묵 strip되거나 검증 오류가 된다.
          standardPriceAtAcquisition: undefined,
        }
      : {}),
    // 양도시 개별주택가격(결합) — 주택 비-별개 + 소유자 분리에서 **환산 파트가 있을 때만** 보낸다(S3-1 D-1 ⓑ).
    // 환산취득가액의 분모도 취득시와 같은 비례 척도(양도시 개별주택가격 × 가목 ÷ (가목 + 나목))여야 한다.
    // 본체는 자산 전체 환산 플래그(`useEstimatedAcquisition`)일 때만 보내므로, 파트 모드만 환산인 경우를 여기서 연다.
    // 값이 있을 때만 싣는다 — 본체가 다른 출처(이월과세 증여자 시점 등)의 값을 이미 실은 경우 빈 값으로 덮어쓰지 않는다.
    ...(!usesPhd && ownerSplitHousingNeedsTransferTotal(primary) && parseAmount(primary.standardPriceAtTransfer) > 0
      ? { standardPriceAtTransfer: parseAmount(primary.standardPriceAtTransfer) }
      : {}),
    // 양도가액 2필드 — 구분양도 게이트.
    ...(saleDirectActive
      ? {
          landTransferPrice: ratioed(primary.landTransferPrice),
          buildingTransferPrice: ratioed(primary.buildingTransferPrice),
        }
      : {}),
    // 양도가액 안분 basis — **감정평가가액**(부가령 §64①1호 단서 · 서열 1순위). 분리 축이
    // 활성이면 **항상 전송**한다 — 일괄양도(안분 basis)와 구분양도(30% 판정의 비교 대상) 양쪽에서
    // 쓰이므로 `saleDirectActive`로 좁히면 일괄양도에서 감정가액이 조용히 무시된다.
    //
    // ⚠️ `ratioed`(지분 스케일)를 **걸지 않는다** — 위 기준시가(:88)와 같은 이유다. 비율로만
    //    소비되어 스케일해도 결과가 같고, 물건 전체의 평가액이라 지분으로 깎을 대상이 아니다.
    ...(saleSideActive
      ? {
          landAppraisalAtTransfer: parseAmount(primary.landAppraisalAtTransfer) || undefined,
          buildingAppraisalAtTransfer: parseAmount(primary.buildingAppraisalAtTransfer) || undefined,
          appraisalDateAtTransfer: primary.appraisalDateAtTransfer || undefined,
        }
      : {}),
    // §166⑧ 예외 — 30% 판정 자체가 구분 기재가 있을 때만 돌므로 양도가액 2필드와 **같은 게이트**다.
    //
    // ⚠️ 근거(`saleSplitExemptionNote`)는 **엔진에 보내지 않는다** — 계산에 쓰이지 않는 서술
    //    텍스트이고, 결과 표시는 폼값을 직접 읽는다(`addressDong`·`addressHo`와 같은 UI 전용 취급).
    //    엔진 입력에 넣으면 Zod·Route·엔진 타입 3곳이 계산과 무관한 문자열을 나르게 된다.
    //    단서는 양도일 2025.1.1. 이후만 효력이 있어 그 전 구간(칸을 숨긴다)의 잔존값은 싣지 않는다 — 엔진도 era로 무시한다.
    ...(saleDirectActive && primary.saleSplitExemption && saleSplitProvisoApplies(primaryCtx?.transferDate)
      ? { saleSplitExemption: primary.saleSplitExemption }
      : {}),
    // 취득가액 2필드.
    ...(landAcqDirectActive ? { landAcquisitionPrice: ratioed(primary.landAcquisitionPrice) } : {}),
    ...(buildingAcqDirectActive
      ? {
          // 건물 신축 + 토지 상속·증여(2026-07-30): 건물 취득가액의 정본은 「신축비용」 칸
          // (`fixedAcquisitionPrice`)이다 — ⑥·⑧과 같은 후퇴 leaf(`splitBuildingAcqPriceInput`, D0 G-5).
          buildingAcquisitionPrice: ratioed(splitBuildingAcqPriceInput(primary)),
        }
      : {}),
    // 파트별 매매사례가액 — salesCase 모드 시만. 별개 취득이면 미입력 = 차단(§176의2③1호 —
    // 탐색 창이 파트별 취득일 ±3개월로 달라 총액 안분 근거 없음), 동시 취득이면 §166⑥ 안분 fallback.
    ...(partInputsActive && landOwned && landAcqMode === "salesCase"
      ? { landSalesCaseValue: ratioed(primary.landSalesCaseValue) }
      : {}),
    ...(partInputsActive && buildingOwned && buildingAcqMode === "salesCase"
      ? { buildingSalesCaseValue: ratioed(primary.buildingSalesCaseValue) }
      : {}),
    // 자본적지출 2필드 — 모드 무관 항상 입력 가능(분리 섹션 상시 노출 — 배율 초과분 분리만이면 칸이 없다).
    ...(partInputsActive
      ? {
          landDirectExpenses: ratioed(primary.landDirectExpenses),
          buildingDirectExpenses: ratioed(primary.buildingDirectExpenses),
        }
      : {}),
    // #17 후속 — 배율 초과분 분리만이면 카드의 「그중 토지분 자본적지출」 1칸이 정본이다(건물분 = 전체 − 토지분). ⑤ 노출·⑧ 필수와 같은 술어 —
    // 별개취득 토글이 켜져 있으면 위 파트 칸이 싣는다(`partInputsActive`와 상보, 이중 입력 없음). 지분 스케일은 파트 칸과 같은 `ratioed`.
    ...(excessCapex
      ? {
          landDirectExpenses: excessCapex.land === null ? undefined : ratioed(String(excessCapex.land)),
          buildingDirectExpenses: excessCapex.building === null ? undefined : ratioed(String(excessCapex.building)),
        }
      : {}),
    // #17-6 — 취득 당시 계약서 토지·건물 구분금액(+ 영 §166⑧1호 단서 신고). ⑤ 노출·⑧ 필수와 같은 술어(`housingExcessAcqContractPayload`) — 칸이 안 열리면
    // 실리지 않는다(잔재 무시). 이 경로는 지분이 아니라 `ratioed`를 걸지 않는다(`housingExcessSplitApplies`가 지분을 제외).
    ...(primaryCtx !== undefined ? (housingExcessAcqContractPayload(primary, primaryCtx.transferDate) ?? {}) : {}),
    // 양도시 기준시가 2필드 — 기준시가는 지분 스케일 대상이 아니다(물건 속성값).
    // ⚠️ 토지분은 저장값이 아니라 **단가 × 면적 파생**을 쓴다 — 면적을 ① 기본정보에서 고치면
    //    저장값이 stale로 남기 때문이다(`resolveLandStdAtTransfer` 주석의 실측 참조).
    //    건물분(나목)은 국세청장 산정액이라 직접 입력이 정본이므로 저장값 그대로.
    ...(saleStdPriceActive
      ? {
          landStandardPriceAtTransfer: resolveLandStdAtTransfer(primary),
          buildingStandardPriceAtTransfer: parseAmount(primary.buildingStandardPriceAtTransfer) || undefined,
        }
      : {}),
  };
}

/**
 * ④⑬ 토지분 취득당시 기준시가 입력 — ㎡ 단가 × 면적(`transfer-tax-split-gain.ts` 토지분 기준시가,
 * `transfer-tax-rate-calc.ts` §154⑦ 한도 비교). 면적이 양도분이어야 하는 이유는
 * `resolveAcqAreaForStdPrice` 주석 참조. 단건·다건이 **같은 leaf**를 쓴다(F-12).
 */
export function buildLandStdAtAcquisitionPayload(primary: AssetForm) {
  return {
    standardPricePerSqmAtAcquisition: primary.standardPricePerSqmAtAcq
      ? parseFloat(primary.standardPricePerSqmAtAcq) || undefined
      : undefined,
    acquisitionArea: resolveAcqAreaForStdPrice(primary),
  };
}

/**
 * ④⑬ §104②1호를 **토지 파트**에 적용 (G-4) — 건물과 취득원인이 다른 경우. 단건·다건·컴패니언 공용(F-12 · D0 G-4).
 * 원인이 비면 전송하지 않는다: 엔진이 자산 단위 원인을 그대로 쓰도록(회귀 0).
 * ⚠️ 저장값이 아니라 **유효** 원인을 읽는다(D0 G-6) — 블록이 닫힌 자산의 잔재를 보내지 않는다.
 * ⚠️ 단순 증여의 증여자 취득일은 보내지 않는다(D0 G-8) — §104②2호 통산은 §97의2① 이월과세 자산만이다.
 */
export function buildLandPartCausePayload(
  primary: AssetForm,
  /** 함께 양도 자산(첫 자산이 아님)은 파트 이월과세를 싣지 않는다 — 엔진 S0이 거부하는 자리라 ⑧이 막고 ④는 키를 내지 않는다. */
  opts?: { isNonPrimary?: boolean },
): Omit<Partial<SplitCarryoverPayload>, "landAcquisitionCause"> & {
  landAcquisitionCause?: "inheritance" | "gift" | "purchase" | "carryover_gift";
  landDecedentAcquisitionDate?: string;
  landSec164Value?: number;
  landSec164ValueWhole?: number;
  isPartialAreaTransfer?: true;
  buildingSec164Value?: number;
  buildingHouseKind?: "house_individual" | "house_apart";
  buildingBundledStdPrice?: "yes" | "no";
  landHouseExisted?: "yes" | "no" | "unknown";
  landHouseSec164Value?: number;
} {
  // P2 C — 통째 이월과세 + 증여자 토지·건물 취득일 상이: 사건 1벌 + 파트 2벌. 술어가 거짓이면 키를 하나도 내지 않는다(stray 400 방지).
  const ratio = getOwnershipRatio(primary);
  const splitCarryover = buildSplitCarryoverPayload(primary, makeRatioed(ratio, ratio < 1), opts);
  if (splitCarryover) return splitCarryover;
  const cause = effectiveLandAcquisitionCause(primary);
  // D2 — 건물 상속·증여 + 토지 매매: 엔진에는 overlay `purchase`만 보낸다(토지는 자기 취득일 — 피상속인·§164④ 키는 해당 없음).
  if (!cause) {
    if (engineLandOverlay(primary) !== "purchase") return {};
    // D2-4 영 §163⑨ 단서 2호(2005.4.30. 전 상속·증여 건물, 주택) — 주택 구분 사실과 ②(영 §164⑦ 가액의 건물 몫 총액, ①`ratioed`와 같은
    // 지분 스케일)를 따로 보낸다. max·채택 echo·「② 필수」 차단은 엔진·⑫가 한다. 구간 밖·공동주택·5입력 미완이면 ②는 보내지 않는다.
    // 일부 양도는 구간에서 차단(기준 면적 미확정, 자동 안분 금지) — 그 사실을 엔진·⑫에 알린다.
    const kind = buildingHouseKindSent(primary);
    const sec164 = deriveBuildingSec164Total(primary);
    const bundled = buildingBundledStdPriceSent(primary);
    return {
      landAcquisitionCause: "purchase",
      ...(kind ? { buildingHouseKind: kind } : {}),
      // 비주택 건물 2001.1.1.~2005.4.29. 상속·증여 — 일괄 고시 오피스텔·상업용 건물인가. 질문이 열린 자리에서 고른 값만(leaf Y4e).
      ...(bundled ? { buildingBundledStdPrice: bundled } : {}),
      ...(sec164 > 0 ? { buildingSec164Value: sec164 } : {}),
      ...(buildingSec164Applies(primary) && isPartialAreaScenario(primary) ? { isPartialAreaTransfer: true } : {}),
    };
  }
  return {
    landAcquisitionCause: cause,
    ...(cause === "inheritance" && primary.landDecedentAcquisitionDate
      ? { landDecedentAcquisitionDate: primary.landDecedentAcquisitionDate }
      : {}),
    // D1-4 영 §163⑨ 단서 1호(1990.8.30. 전 상속·증여 토지) — ②(영 §164④ 가액 총액, ①`ratioed`와 같은 지분 스케일)를
    // 따로 보낸다. max·채택 echo·「② 필수」 차단은 엔진·⑫가 한다. 단서 구간 밖이거나 5필드가 덜 차면 보내지 않는다.
    ...(landSec164Applies(primary) && deriveHousingLandSec164Total(primary) > 0
      ? { landSec164Value: deriveHousingLandSec164Total(primary) }
      : {}),
    // 1985.1.1. 전 — ③(환산취득가액) 분자로 ②의 지분 반영 전 값을 함께 보낸다(양도시 토지 기준시가가 전체 값 · 계획서 §13).
    ...(landSec164Applies(primary) && isPreDeemedLandPart(cause, primary.landAcquisitionDate) && deriveHousingLandSec164Whole(primary) > 0
      ? { landSec164ValueWhole: deriveHousingLandSec164Whole(primary) }
      : {}),
    // 일부 양도는 단서 구간에서 차단(평가액의 기준 면적 미확정, 자동 안분 금지) — 그 사실을 엔진·⑫에 알린다.
    ...(landSec164Applies(primary) && isPartialAreaScenario(primary) ? { isPartialAreaTransfer: true } : {}),
    // D1-H 영 §163⑨ 단서 2호 주택 부수토지(1990.8.30.~2005.4.29. 상속·증여 토지 + 건물 매매) — 「받을 당시 주택이 있었는가」·주택 구분·
    // ②(영 §164⑦ 가액의 토지 몫 총액, ①과 같은 지분 스케일)를 따로 보낸다. max·echo·「② 필수」 차단은 엔진·⑫가 한다.
    ...houseLandPayload(primary),
  };
}

/** D1-H 페이로드 — 구간 밖이면 빈 객체. 주택 구분·②는 「있었다」일 때만(브리지가 판정). */
function houseLandPayload(primary: AssetForm): {
  landHouseExisted?: "yes" | "no" | "unknown";
  buildingHouseKind?: "house_individual" | "house_apart";
  landHouseSec164Value?: number;
  isPartialAreaTransfer?: true;
} {
  const existed = landHouseExistedSent(primary);
  if (!existed) return {};
  const kind = houseLandKindSent(primary);
  const sec164 = deriveHouseLandSec164Total(primary);
  return {
    landHouseExisted: existed,
    ...(kind ? { buildingHouseKind: kind } : {}),
    ...(sec164 > 0 ? { landHouseSec164Value: sec164 } : {}),
    ...(existed === "yes" && isPartialAreaScenario(primary) ? { isPartialAreaTransfer: true } : {}),
  };
}
