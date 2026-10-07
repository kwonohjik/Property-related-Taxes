/**
 * ⑧ 겸용주택 **별개 취득 파트 모델**(B1) 검증 — `transfer-tax-validate-mixed-use-asset.ts`에서 분리(800줄 정책).
 *
 * 설계: `docs/02-design/features/mixed-use-separate-acq-per-part.ui.design.md` §5.6.
 *
 * **규칙은 엔진 leaf가 단일 소스다** — 결합 제외·값 누락은 `collectMixedPartAcqIssues`(엔진 throw·⑫ Zod와 같은 목록),
 * 필수 여부는 `mixedPartAcqNeedsOfForm`(⑤ 노출·④ 전송과 같은 술어)이다. 이 파일은 그 결과에 **입력칸(data-field)과 사용자 문장**을
 * 붙일 뿐 판정을 다시 쓰지 않는다(UI 통과 ↔ 서버 차단 모순 금지).
 *
 * 호출 전제: `isMixedUsePerPartAcq(asset)`. 아니면 호출하지 않는다(총액 모델은 기존 검증 그대로).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { collectMixedPartAcqIssues } from "@/lib/tax-engine/mixed-use-part-acq";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  mixedBuildingContractActive,
  mixedExpenseDeclaredOfForm,
  mixedPartAcqNeedsOfForm,
  mixedPartAcqSourceOf,
  mixedPartModes,
} from "./mixed-use-part-acq-split";
import { mixedAcqCommercialBuildingStd, mixedAcqLandPricePerSqm } from "./transfer-tax-api-mixed-use";
import { fieldError, type IssueField } from "./transfer-tax-validate-field";

/** 엔진 leaf 이슈 경로 → 화면 입력칸(`data-field`). 결합 제외(X-1~X-5)는 모델 토글이 해소 칸이다. */
function fieldOfIssue(path: string[]): IssueField {
  if (path[0] === "separateAcquisition") {
    switch (path[1]) {
      case "landAcquisitionPrice":
      case "landSalesCaseValue":
      case "buildingAcquisitionPrice":
      case "buildingSalesCaseValue":
        return path[1];
      case "housingBuildingContractPrice":
        return "mixedAcqHousingBuildingContractPrice";
    }
  }
  if (path[0] === "preHousingDisclosure") return "phdBuildingStdPriceAtAcq";
  if (path[0] === "usePreHousingDisclosure") return "usePreHousingDisclosure";
  return "mixedAcqPerPartMode";
}

const MISSING_NOTE = "토지·건물 취득시기가 다르면 나머지 금액에서 자동 계산되지 않습니다";

/** 값 누락(X-6) 사용자 문장 — 엔진 메시지 대신 입력칸 어휘로 말한다. 대응이 없으면 `undefined`(엔진 메시지 사용). */
function missingMessage(path: string[], asset: AssetForm): string | undefined {
  if (path[0] !== "separateAcquisition") return undefined;
  const m = mixedPartModes(asset);
  switch (path[1]) {
    case "landAcquisitionPrice":
      return `토지 ${m.land === "appraisal" ? "감정가액" : "취득가액(실거래가)"}을 입력하세요 — ${MISSING_NOTE}.`;
    case "landSalesCaseValue":
      return `토지 매매사례가액을 입력하세요 — ${MISSING_NOTE}.`;
    case "buildingAcquisitionPrice":
      return `건물 ${m.building === "appraisal" ? "감정가액" : "취득가액(실거래가)"}을 입력하세요 — ${MISSING_NOTE}.`;
    case "buildingSalesCaseValue":
      return `건물 매매사례가액을 입력하세요 — ${MISSING_NOTE}.`;
    case "housingBuildingContractPrice":
      return "주택건물 계약액은 건물 취득가액보다 작아야 합니다 — 상가건물 계약액은 총액에서 주택건물 계약액을 뺀 값입니다.";
  }
  return undefined;
}

/**
 * 파트 모델 취득가액 검증. 통과하면 `null`.
 *
 * 순서(계산 순서 = 입력 순서): ① 결합 제외·파트 값 누락 → ② 계약액 토글 필수 → ③ 취득시 H(필수일 때) → ④ 상가 취득시 기준시가.
 * 건물 취득일 공시지가(B0)·주택건물 기준시가(나목)는 호출부의 기존 검증이 같은 술어(`needsMixed…` — `mixedPartAcqNeeds` AND)로 이어서 막는다.
 */
export function validateMixedUsePartAcq(asset: AssetForm, label: string, formTransferDate?: string): string | null {
  const src = mixedPartAcqSourceOf(asset);
  if (!src) return null;

  for (const issue of collectMixedPartAcqIssues(src)) {
    const msg = missingMessage(issue.path, asset) ?? issue.message;
    return fieldError(fieldOfIssue(issue.path), `${label}: ${msg}`);
  }

  // 토글 ON인데 계약액 미입력 — 엔진은 0·미입력을 「계약액 없음」(나목 비율)으로 읽지만, 사용자가 「구분돼 있음」을 켠 이상 값이 필요하다.
  if (mixedBuildingContractActive(asset) && parseAmount(asset.mixedAcqHousingBuildingContractPrice) <= 0) {
    return fieldError(
      "mixedAcqHousingBuildingContractPrice",
      `${label}: 주택건물 계약액을 입력하세요 — 도급계약서·세금계산서상 주택건물 금액입니다(없으면 「용도별 계약액이 구분돼 있음」을 끄세요. 건물 취득시 기준시가 비율로 나눕니다).`,
    );
  }

  const needs = mixedPartAcqNeedsOfForm(asset);
  if (needs?.housingPriceAtAcq && parseAmount(asset.mixedAcqHousingPrice) <= 0) {
    const m = mixedPartModes(asset);
    const reason =
      m.land !== "actual" || m.building !== "actual"
        ? "토지 또는 건물 파트가 실거래가가 아니어서 — 환산취득가·개산공제의 기준시가로 쓰입니다"
        : mixedExpenseDeclaredOfForm(asset)
          ? "자본적지출 또는 주택분·상가분 실제 필요경비를 입력하셨으므로 — 경비를 토지·건물 비율로 나누는 데 취득시 기준시가가 쓰입니다"
          : "취득시 기준시가 비율 안분에 쓰입니다";
    return fieldError("mixedAcqHousingPrice", `${label}: 취득시 개별주택공시가격을 입력하세요. (${reason})`);
  }
  if (needs?.commercialStdAtAcq) {
    // 한 메시지가 두 칸을 묻는다 — 비어 있는 칸(건물 먼저)으로 보낸다.
    const buildingMissing = mixedAcqCommercialBuildingStd(asset) <= 0;
    if (buildingMissing || mixedAcqLandPricePerSqm(asset, formTransferDate ?? "") <= 0) {
      return fieldError(
        buildingMissing ? "mixedAcqCommercialBuildingPrice" : "mixedAcqLandPricePerSqm",
        `${label}: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요. (토지는 토지 취득일, 건물은 건물 취득일 기준 — 상가분 취득가액·개산공제·건물 용도별 안분에 쓰입니다)`,
      );
    }
  }
  return null;
}
