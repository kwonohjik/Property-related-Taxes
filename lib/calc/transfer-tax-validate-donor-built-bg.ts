/**
 * ⑧ 부담부증여 × 이월과세 × 당초 증여자 신축·증축(소득세법 §114조의2) 검증 (PR-4) — `validateBurdenedGiftAsset` 의 필수 입력 검사 뒤에서 부른다.
 *
 * 규칙은 ⑫(`refineBgDonorBuilt`)·엔진(`assertBgDonorBuiltInput` · §159 step 의 증축 감정가액 요구)과 **같은 조건**이다 — UI 통과 ↔ 400 모순 0.
 * 게이트는 ⑤·④와 같은 술어(`donorBuiltBgActive`) — 범위 밖에서 켜 둔 stale 토글은 요구하지 않는다.
 * 신축·증축일을 증여자 취득일로 **대신 채우지 않는다**(자동 fallback 금지). 증축 부분 감정가액(K-7)은 **가산세 게이트가 열릴 때만** 요구한다(엔진 step 과 같은 단일 소스 `calculateBuildingPenalty`).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { calculateBuildingPenalty } from "@/lib/tax-engine/transfer-tax-building-penalty";
import { parseAmount, parseDecimal } from "@/lib/calc/number-parse";
import { donorBuiltBgActive } from "./donor-built-bg-scope";
import { bgCarryoverForm } from "./bg-carryover-parts";
import { gbBgSplitsGiftValuation } from "./gb-bg-gift-tax-return";
import { bgPresumedInputKind } from "./burdened-gift-presumed-acquisition";
import { fieldError } from "./transfer-tax-validate-field";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function validateDonorBuiltBg(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  /** 지분 분할 취득(축 B)·함께 부담부증여 묶음 — 컴패니언 부담부증여는 ⑫가 증여자 신축·증축을 받지 않는다(범위 밖). ⑤는 이 묶음에서 토글을 새로 보이지 않고 켜 둔 값만 끄게 한다 */
  bundled = false,
): string | null {
  if (!donorBuiltBgActive(asset)) return null;
  // 증여 사건 서브폼 — 건물만 이월과세면 건물 블록이다. 앵커는 그대로 `carryover.*`(⑤ 「당초 증여자」 블록의 칸이 그 이름이다).
  const c = bgCarryoverForm(asset)!;
  if (bundled)
    return fieldError(
      "carryover.donorBuilt",
      `${label}: 지분 분할 취득·함께 부담부증여 묶음에서는 당초 증여자 신축·증축 가산세(소득세법 §114조의2)를 아직 지원하지 않습니다 — 토글을 끄세요.`,
    );

  if (c.donorBuiltType === "")
    return fieldError("carryover.donorBuiltType", `${label}: 당초 증여자가 신축한 건물인지 증축한 건물인지 구분을 선택하세요 (소득세법 §114조의2).`);
  if (!c.donorBuiltDate)
    return fieldError(
      "carryover.donorBuiltDate",
      `${label}: 당초 증여자의 ${c.donorBuiltType === "extension" ? "증축 완공일" : "신축 취득일(사용승인서 교부일 등)"}을 입력하세요 — 증여자 취득일로 대신 채우지 않습니다 (5년 기산점).`,
    );
  if (c.donorBuiltDate < c.donorAcquisitionDate)
    return fieldError("carryover.donorBuiltDate", `${label}: 신축·증축일은 당초 증여자 취득일(${c.donorAcquisitionDate}) 이후여야 합니다.`);
  if (c.donorBuiltDate > c.giftRegistryDate)
    return fieldError("carryover.donorBuiltDate", `${label}: 신축·증축일은 증여 등기접수일(${c.giftRegistryDate}) 이전이어야 합니다 — 당초 증여자가 신축·증축한 건물이어야 합니다.`);

  /**
   * 일반건물 신축 — 신축 취득일이 곧 당초 증여자의 **건물** 취득일이다(「소득세법 시행령」 제162조 제1항 제4호 · `gb-bg-donor-building-acquisition-date.plan.md` Q-3 a).
   * 건물 취득일은 둘 다 이월과세면 건물 블록·건물분 칸, 건물만이면 사건 서브폼(= 건물 블록)의 증여자 취득일이다. 증축은 날짜가 다른 것이 정상이라 보지 않는다.
   */
  if (asset.assetKind === "general_building" && c.donorBuiltType === "new") {
    const buildingDate = gbBgSplitsGiftValuation(asset) ? asset.buildingCarryover?.donorAcquisitionDate : c.donorAcquisitionDate;
    if (buildingDate && c.donorBuiltDate !== buildingDate)
      return fieldError("carryover.donorBuiltDate", `${label}: 당초 증여자가 신축한 건물이면 신축 취득일(${c.donorBuiltDate})이 당초 증여자의 건물 취득일(${buildingDate})과 같아야 합니다 — 직접 신축한 건물의 취득일은 사용승인서 교부일 등입니다(「소득세법 시행령」 제162조 제1항 제4호).`);
  }

  if (c.donorBuiltType !== "extension") return null;
  if (!(parseDecimal(c.donorBuiltExtensionArea) > 0))
    return fieldError("carryover.donorBuiltExtensionArea", `${label}: 증축 바닥면적 합계를 입력하세요 (85㎡ 초과만 대상입니다).`);

  if (asset.bgAcquisitionMethod === "converted") {
    if (!(parseAmount(c.donorBuiltExtensionStdPrice) > 0))
      return fieldError(
        "carryover.donorBuiltExtensionStdPrice",
        `${label}: 증축 부분의 당초 증여자 취득(완공) 당시 기준시가 총액을 입력하세요 — 가산세 기준은 증축한 부분에 한정한 환산취득가액입니다.`,
      );
    return null;
  }

  // K-7 감정가액 — 증축한 부분의 감정가액(물건 전체 기준). 가산세 게이트(5년·2020.1.1.·85㎡)가 열릴 때만 요구한다(엔진 step 과 같다).
  const transferDate = toOptionalDate(formTransferDate);
  const gateOpen =
    !!transferDate &&
    calculateBuildingPenalty(
      {
        isSelfBuilt: true,
        acquisitionMethod: "appraisal",
        transferDate,
        constructionDate: toOptionalDate(c.donorBuiltDate),
        buildingType: "extension",
        extensionFloorArea: parseDecimal(c.donorBuiltExtensionArea),
      } as unknown as TransferTaxInput,
      1,
    ) !== null;
  if (!gateOpen) return null;
  const extensionAppraisal = parseAmount(asset.bgPresumedExtensionAppraisal);
  if (!extensionAppraisal)
    return fieldError(
      "bgPresumedExtensionAppraisal",
      `${label}: 당초 증여자가 증축한 건물을 증축일부터 5년 이내에 양도하면서 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따라 증축한 부분의 감정가액에 5% 가산세가 붙습니다 — 증축한 부분의 감정가액을 입력하세요(건물 전체로 대신할 수 없습니다).`,
    );
  // 부분이 전체를 넘을 수 없다 — 엔진과 같은 상한(당초 증여자 값: 분리 입력이면 건물, 총액 입력이면 총액)
  const kind = bgPresumedInputKind(asset.assetKind);
  const cap = kind === "split" ? parseAmount(asset.bgCoDonorPresumedAcquisitionBuilding) : parseAmount(asset.bgCoDonorPresumedAcquisitionTotal);
  if (cap > 0 && extensionAppraisal > cap)
    return fieldError(
      "bgPresumedExtensionAppraisal",
      `${label}: 증축한 부분의 감정가액이 당초 증여자의 ${kind === "split" ? "건물 감정가액" : "감정가액 총액"}(${cap.toLocaleString()}원)보다 클 수 없습니다.`,
    );
  return null;
}
