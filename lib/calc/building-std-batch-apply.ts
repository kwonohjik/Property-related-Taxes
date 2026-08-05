/**
 * 건물 기준시가 **일괄 계산 결과 → 자산 폼 patch** (순수 함수, 자산유형별)
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §4.3·§4.4
 *
 * ## 왜 순수 함수인가
 *
 * 1. **단일 배치 patch 강제** — 최대 4키(건물 기준시가 3시점 + §164⑤ 준용 확인)를 한 객체로
 *    만들어 호출부가 `onChange(patch)` **1회**로 반영하게 한다. 단일키 setter를 연속 호출하면
 *    먼저 쓴 값이 stale spread에 덮여 되돌아간다(memory `feedback_multikey_patch_stale_spread_overwrite`).
 * 2. **트랙 오염 규칙을 테스트 가능하게** — 취득 ≤2000의 모달 공시지가는 2001.1.1 기준
 *    (위치지수 전용)이라 취득당시 토지값에 넣으면 환산이 조용히 틀린다. UI를 열지 않고
 *    anchor로 고정한다.
 *
 * 자산유형별로 대상 필드가 다르다:
 *   상업용건물·오피스텔(§164⑥) — `cbBuildingStdPriceAt*` 3시점 + §164⑤ 준용 확인
 *   일반건물(§166⑥ 안분)        — `gbAcqBuildingValue`·`gbTransferBuildingValue` 2시점
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MultiPointStdPriceApply } from "@/components/calc/building-std-price/MultiPointBuildingStdPriceModal";
import { isAcq2001LocationIndexTrack } from "./phd-acq-land-price-track";
import { isSec164_5ProvisoApplicable } from "./commercial-164-6-proviso";
import { resolveCbEra } from "./commercial-cb-era";

/** 취득연도(YYYY-MM-DD → number). 미완성 값은 undefined. */
export function commercialAcqYear(acquisitionDate: string | undefined): number | undefined {
  return acquisitionDate && acquisitionDate.length >= 4
    ? Number.parseInt(acquisitionDate.slice(0, 4), 10)
    : undefined;
}

/**
 * 배치 적용 patch 조립.
 *
 * - 건물 기준시가: 산출된 시점만 반영(미산출 시점의 기존 값은 보존).
 * - `cbAcqBuildingStdBy164_5`(Q-1): 취득시 금액이 새로 들어오고 §164⑥ 단서 구간이면 자동 체크.
 *   배치의 취득 ≤2000 경로가 곧 §164⑤ 준용 산정(`acqBaseStdPrice`)이라 전제가 코드로 보장된다.
 * - 공시지가 되돌려쓰기: 최초고시·양도만 무조건 반영. **취득분은 ≤2000이면 드롭**(트랙 상이).
 */
export function buildCommercialBatchPatch(
  v: MultiPointStdPriceApply,
  asset: Pick<AssetForm, "acquisitionDate" | "cbEra">,
): Partial<AssetForm> {
  const patch: Partial<AssetForm> = {};
  const acqYear = commercialAcqYear(asset.acquisitionDate);

  if (v.acquisition?.housing != null) patch.cbBuildingStdPriceAtAcq = String(v.acquisition.housing);
  if (v.firstDisclosure?.housing != null)
    patch.cbBuildingStdPriceAtFirst = String(v.firstDisclosure.housing);
  if (v.transfer?.housing != null) patch.cbBuildingStdPriceAtTransfer = String(v.transfer.housing);

  if (
    patch.cbBuildingStdPriceAtAcq &&
    isSec164_5ProvisoApplicable(resolveCbEra(asset), asset.acquisitionDate)
  ) {
    patch.cbAcqBuildingStdBy164_5 = true;
  }

  if (v.landPrices?.firstDisclosure) patch.cbLandPricePerSqmAtFirst = v.landPrices.firstDisclosure;
  if (v.landPrices?.transfer) patch.cbLandPricePerSqmAtTransfer = v.landPrices.transfer;
  if (v.landPrices?.acquisition && !isAcq2001LocationIndexTrack(acqYear))
    patch.cbLandPricePerSqmAtAcq = v.landPrices.acquisition;

  return patch;
}

/**
 * 취득시 건물 기준시가를 **사용자가 직접 수정**할 때의 patch (Q-1).
 * 계산기가 산정한 값이 아니게 되므로 §164⑤ 준용 확인을 해제한다 — 해제도 같은 patch에 싣는다.
 */
export function buildAcqBuildingStdEditPatch(
  value: string,
  asset: Pick<AssetForm, "cbAcqBuildingStdBy164_5">,
): Partial<AssetForm> {
  return asset.cbAcqBuildingStdBy164_5
    ? { cbBuildingStdPriceAtAcq: value, cbAcqBuildingStdBy164_5: false }
    : { cbBuildingStdPriceAtAcq: value };
}


// ── 일반건물(토지+건물 일괄) — 취득·양도 2시점 ─────────────────────────────

/**
 * 일반건물 배치 적용 patch.
 *
 * 상가와 달리 **최초고시 시점이 없고**(§164⑥ 환산 경로가 아니다) §164⑤ 준용 확인 토글도 없다.
 * 공시지가 되돌려쓰기의 취득 트랙 규칙은 동일하다 — 취득 ≤2000의 모달 값은 2001.1.1 기준이라
 * 취득당시 토지값(`gbAcqLandPricePerSqm`)에 넣지 않는다.
 */
export function buildGeneralBuildingBatchPatch(
  v: MultiPointStdPriceApply,
  asset: Pick<AssetForm, "acquisitionDate">,
): Partial<AssetForm> {
  const patch: Partial<AssetForm> = {};
  // 건물 취득일이 따로 있으면 그것이 건물분 기준시가의 시점이다(§166⑥ 별개취득).
  // M-1a(2026-08-05): `acquisitionDate`가 **건물** 취득일이다 — 건물 기준시가 연도는 이 값 하나.
  const acqYear = commercialAcqYear(asset.acquisitionDate);

  if (v.acquisition?.housing != null) patch.gbAcqBuildingValue = String(v.acquisition.housing);
  if (v.transfer?.housing != null) patch.gbTransferBuildingValue = String(v.transfer.housing);

  if (v.landPrices?.transfer) patch.gbTransferLandPricePerSqm = v.landPrices.transfer;
  if (v.landPrices?.acquisition && !isAcq2001LocationIndexTrack(acqYear))
    patch.gbAcqLandPricePerSqm = v.landPrices.acquisition;

  return patch;
}
