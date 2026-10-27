/**
 * ⑧ 주택·건물 부담부증여 × 토지·건물 취득일 다름 — 파트 칸 필수 (설계서 `docs/00-pm/bg-house-building-split.design.md` §5.2 · Q-2 a · Q-3 a).
 *
 * 엔진은 토지·건물 파트로 §159를 계산한다(PR-A). 다른 날 따로 취득한 자산이라 총액을 나눌 근거가 없다 — 파트 값을 모두 받는다(자동 안분 금지).
 * 화면(⑤)이 여는 칸 = ④가 싣는 칸 = 여기서 요구하는 칸이다(술어 `bgHouseSplitMode` 하나).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { bgHouseSplitAcqStd, bgHouseSplitMode, bgHouseSplitTransferStd } from "./bg-house-split";
import { isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { fieldError } from "./transfer-tax-validate-field";

const filled = (v: string | undefined) => (parseAmount(v ?? "") || 0) > 0;

export function validateBgHouseSplit(asset: AssetForm, label: string): string | null {
  const mode = bgHouseSplitMode(asset);
  if (!mode) return null;
  const market = asset.bgValuationMode === "sangjeungbeop_market";
  const method = asset.bgAcquisitionMethod || "";

  // 이월과세 토글 C — 당초 증여자의 건물 취득일(토지는 증여 사건의 증여자 취득일). 토지 날짜로 대신하지 않는다.
  if (mode === "carryover" && !asset.buildingCarryover?.donorAcquisitionDate)
    return fieldError("buildingCarryover.donorAcquisitionDate", `${label}: 당초 증여자가 건물을 취득한 날을 입력하세요 — 토지·건물을 다른 날 취득했으면 건물 보유기간은 그 건물을 취득한 날부터 셉니다(「소득세법」 제95조 제4항 단서).`);

  // 시가 평가 — 토지분·건물분 평가액(§159① 파트 A · Q-3 a). 시가 총액 칸은 위(4)가 먼저 요구한다.
  if (market && filled(asset.bgMarketValueAtTransfer)) {
    if (!filled(asset.bgMarketValueLand)) return fieldError("bgMarketValueLand", `${label}: 토지·건물 취득일이 다르면 시가를 토지분·건물분 평가액으로 나눠 입력하세요 — 토지분 평가액(「소득세법 시행령」 제159조 제1항).`);
    if (!filled(asset.bgMarketValueBuilding)) return fieldError("bgMarketValueBuilding", `${label}: 토지·건물 취득일이 다르면 시가를 토지분·건물분 평가액으로 나눠 입력하세요 — 건물분 평가액(「소득세법 시행령」 제159조 제1항).`);
    const sum = parseAmount(asset.bgMarketValueLand) + parseAmount(asset.bgMarketValueBuilding);
    const total = parseAmount(asset.bgMarketValueAtTransfer);
    if (sum !== total)
      return fieldError("bgMarketValueLand", `${label}: 토지분·건물분 평가액 합계(${sum.toLocaleString()}원)가 시가(${total.toLocaleString()}원)와 다릅니다.`);
  }

  // 양도시 토지·건물 기준시가 — 기준시가 평가의 파트 A, 환산(K-5)의 분모. 시가 평가 + 다른 방식은 파트 평가액이 대신한다.
  if ((!market || method === "converted") && !bgHouseSplitTransferStd(asset)) {
    const landMissing = !filled(asset.standardPricePerSqmAtTransfer) && !filled(asset.landStandardPriceAtTransfer);
    return fieldError(
      landMissing ? "standardPricePerSqmAtTransfer" : "buildingStandardPriceAtTransfer",
      `${label}: 토지·건물 취득일이 다르면 양도시 토지 기준시가(개별공시지가 × 면적)와 건물 기준시가를 따로 입력하세요 — 토지·건물 파트의 평가액을 그 값으로 나눕니다(「소득세법 시행령」 제166조 제6항).`,
    );
  }

  if (mode === "own") {
    // 기준시가 평가(취득가액도 기준시가 — 영 §159①1호 괄호) · 환산(K-5 분자) — 파트마다 그 취득일의 취득시 기준시가.
    if ((!market || method === "converted") && !bgHouseSplitAcqStd(asset)) {
      const landMissing = !filled(asset.standardPricePerSqmAtAcq) || !(parseFloat((asset.acquisitionArea || "").replace(/,/g, "")) > 0);
      return fieldError(
        landMissing ? "standardPricePerSqmAtAcq" : "buildingStandardPriceAtAcq",
        `${label}: 토지·건물 취득일이 다르면 취득시 토지 기준시가(토지 취득일 직전 고시 공시지가 × 면적)와 건물 기준시가(건물 취득일 직전 고시)를 따로 입력하세요(「소득세법 시행령」 제164조 제3항).`,
      );
    }
    if (market && method === "actual") {
      if (!filled(asset.bgActualAcquisitionLand)) return fieldError("bgActualAcquisitionLand", `${label}: 토지·건물 취득일이 다르면 토지 실지취득가액을 따로 입력하세요 — 다른 날 따로 취득해 총액을 나눌 근거가 없습니다(「소득세법」 제100조 제2항).`);
      if (!filled(asset.bgActualAcquisitionBuilding)) return fieldError("bgActualAcquisitionBuilding", `${label}: 토지·건물 취득일이 다르면 건물 실지취득가액을 따로 입력하세요.`);
    }
    if (market && isBgPresumedMethod(method)) {
      if (!filled(asset.bgPresumedAcquisitionLand)) return fieldError("bgPresumedAcquisitionLand", `${label}: 토지·건물 취득일이 다르면 토지의 취득 당시 가액을 따로 입력하세요.`);
      if (!filled(asset.bgPresumedAcquisitionBuilding)) return fieldError("bgPresumedAcquisitionBuilding", `${label}: 토지·건물 취득일이 다르면 건물의 취득 당시 가액을 따로 입력하세요.`);
    }
    return null;
  }

  // 이월과세 — 양도인(시나리오 B) 값은 증여일 평가액(K-4 칸 · 소령 §163⑨), 당초 증여자(A) 값은 「당초 증여자」 블록. 둘 다 토지·건물로.
  if (market && (method === "actual" || isBgPresumedMethod(method))) {
    if (!filled(asset.bgActualAcquisitionLand)) return fieldError("bgActualAcquisitionLand", `${label}: 이월과세 — 양도인이 증여받은 때의 토지분 평가액을 입력하세요(소령 §163⑨ · 시나리오 B).`);
    if (!filled(asset.bgActualAcquisitionBuilding)) return fieldError("bgActualAcquisitionBuilding", `${label}: 이월과세 — 양도인이 증여받은 때의 건물분 평가액을 입력하세요(소령 §163⑨ · 시나리오 B).`);
  }
  if (market && method === "actual") {
    if (!filled(asset.bgCoDonorActualAcquisitionLand)) return fieldError("bgCoDonorActualAcquisitionLand", `${label}: 당초 증여자의 토지 실지취득가액을 입력하세요 — 토지·건물을 다른 날 취득했으면 따로 받습니다.`);
    if (!filled(asset.bgCoDonorActualAcquisitionBuilding)) return fieldError("bgCoDonorActualAcquisitionBuilding", `${label}: 당초 증여자의 건물 실지취득가액을 입력하세요.`);
  }
  if (market && isBgPresumedMethod(method)) {
    if (!filled(asset.bgCoDonorPresumedAcquisitionLand)) return fieldError("bgCoDonorPresumedAcquisitionLand", `${label}: 당초 증여자의 토지 취득 당시 가액을 입력하세요.`);
    if (!filled(asset.bgCoDonorPresumedAcquisitionBuilding)) return fieldError("bgCoDonorPresumedAcquisitionBuilding", `${label}: 당초 증여자의 건물 취득 당시 가액을 입력하세요.`);
  }
  if (!market || method === "converted" || isBgPresumedMethod(method)) {
    // 당초 증여자 취득 당시 토지·건물 기준시가 — 다른 날 취득한 건물이 있으므로 0일 수 없다.
    if (!filled(asset.bgCoDonorLandStdPriceAtAcq)) return fieldError("bgCoDonorLandStdPriceAtAcq", `${label}: 당초 증여자 취득 당시 토지 기준시가를 입력하세요.`);
    if (!filled(asset.bgCoDonorBuildingStdPriceAtAcq)) return fieldError("bgCoDonorBuildingStdPriceAtAcq", `${label}: 당초 증여자가 건물을 취득할 당시 건물 기준시가를 입력하세요 — 직접 신축했으면 사용승인일 당시(「소득세법 시행령」 제162조 제1항 제4호).`);
  }
  return null;
}
