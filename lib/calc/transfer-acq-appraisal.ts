/**
 * 취득 당시 감정평가가액 안분(V-7) — ⑤ 칸 노출 · ④ 전송 · ⑧ 쌍 검증이 같은 술어를 쓴다.
 * 계획서: docs/02-design/features/owner-split-residue-followups.plan.md §2.5.
 *
 * 「소득세법」 제100조 제2항은 「양도가액 또는 **취득가액**을 실지거래가액에 따라 산정하는 경우로서 토지와 건물 등을 함께 **취득**하거나
 * 양도한 경우」의 구분 불분명 안분을 시행령에 맡기고, 영 §166⑥은 「부가가치세법 시행령」 제64조 제1항을 준용한다 — 그 제1호 단서가
 * 「감정평가가액 … 이 있는 경우에는 그 가액에 비례하여 안분」이다. 양도가액 쪽은 `SaleAppraisalFields`가 받는다.
 *
 * 소유자 분리의 비-별개 취득에서 취득가액 총액을 나눌 때만 쓴다 — 별개 취득은 파트 금액을 각각 받아 나누지 않는다. 겸용(4부분 안분)·PHD(§164⑦ 3시점)·
 * 파트 이월과세(파트별 증여 신고가액)는 자체 구조라 범위 밖이다(계획서 V-3).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { partialAppraisal } from "@/lib/tax-engine/sale-split-apportion-basis";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { normalizeBuildingCauseInputs } from "./transfer-land-part-cause";
import { effectiveCarryoverDonorSplit } from "./transfer-land-part-cause";
import { effectiveSelfOwns } from "./self-owns-scope";
import { isLandBuildingSplitable } from "./self-owns-scope";
import { isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { phdFlagEffective } from "./phd-toggle-scope";
import { fieldError } from "./transfer-tax-validate-field";

/**
 * 취득가액 총액의 안분 비율이 세액을 가르는가 — **소유자 분리**(본인 파트만 과세) ∧ 별개 취득 아님 ∧ 본인 파트가 총액 안분을 탄다.
 *
 * 소유자가 같은 같은 날 취득은 두 파트의 취득일·세율이 같아 비율이 세액을 바꾸지 않고, 엔진은 그 경우 분리 계산 없이 자산 전체로 계산한다
 * (실측: 매매 주택 같은 날 「취득일 다름」 ON — `splitDetail` 없음) — 칸을 열면 입력이 엔진에 닿지 않는다(침묵 무시). 부담부증여는 ④가 분리
 * 입력을 보내지 않는다(`isSplitPayloadActive`).
 */
export function acqAppraisalApportionApplies(rawAsset: AssetForm): boolean {
  const asset = normalizeBuildingCauseInputs(rawAsset);
  if (!isLandBuildingSplitable(asset.assetKind) || asset.isMixedUseHouse) return false;
  if (asset.transferType === "burdened_gift" || phdFlagEffective(asset)) return false;
  if (effectiveCarryoverDonorSplit(asset)) return false;
  const selfOwns = effectiveSelfOwns(asset) ?? "both";
  if (selfOwns === "both" || isSeparateAcquisition(asset)) return false;
  return ownedPartApportionsTotal(asset, selfOwns === "land_only");
}

/**
 * 본인 파트가 총액 안분을 타는가 — 엔진 `calcPartAcquisitionPrice`가 비율 분기(`splitPair` 두 칸 모두 없음)에 닿는 경우만.
 * 환산 파트는 기준시가로 바로 구하고, 매매사례·실가·감정은 파트 금액을 직접 넣으면 비율을 쓰지 않는다(④는 본인 파트 금액만 보낸다 —
 * `landAcqDirectActive`). 신축 건물만은 정규화 사본이 신축비용을 건물 금액으로 채워 비율이 없다(C-2). 리뷰 게이트 F-1.
 */
function ownedPartApportionsTotal(asset: AssetForm, landOwned: boolean): boolean {
  const mode = effectivePartAcqMode(landOwned ? asset.landAcqMode : asset.buildingAcqMode, asset);
  if (mode === "estimated") return false;
  if (mode === "salesCase") return !parseAmount((landOwned ? asset.landSalesCaseValue : asset.buildingSalesCaseValue) ?? "");
  return !parseAmount((landOwned ? asset.landAcquisitionPrice : asset.buildingAcquisitionPrice) ?? "");
}

/** ⑧ — 한쪽만 입력하면 비율이 없다(⑫ `refineSplitAcquisitionInputs`와 같은 `partialAppraisal`). 칸이 보일 때만 본다. */
export function validateAcqAppraisalPair(asset: AssetForm, label: string): string | null {
  if (!acqAppraisalApportionApplies(asset)) return null;
  const pair = {
    land: parseAmount(asset.landAppraisalAtAcquisition ?? "") || 0,
    building: parseAmount(asset.buildingAppraisalAtAcquisition ?? "") || 0,
  };
  if (!partialAppraisal(pair)) return null;
  return fieldError(
    pair.land > 0 ? "buildingAppraisalAtAcquisition" : "landAppraisalAtAcquisition",
    `${label}: 취득 당시 감정평가가액은 토지·건물 양쪽 모두 필요합니다 — 한쪽만으로는 취득가액을 나눌 비율이 없습니다 (소득세법 §100②·부가가치세법 시행령 §64①1호 단서).`,
  );
}
