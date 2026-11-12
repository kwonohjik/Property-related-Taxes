/**
 * 부담부증여 이월과세 「당초 증여자」 취득 당시 값 변환 — `transfer-tax-api-burdened-gift.ts`에서 분리(800줄 정책 · 소유자 분리 PR-3). 내용은 분리 전과 같다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { bgHouseSplitMode } from "./bg-house-split";
import { bgCarryoverPartsPayload } from "./bg-carryover-parts";
import { gbBgGiftTaxedValueByPart, gbBgGiftValuationByPart, gbBgSplitsGiftValuation } from "./gb-bg-gift-tax-return";
import { bgPresumedInputKind, isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";
import { buildDonorBuiltBgPayload } from "./transfer-tax-api-donor-built-bg";
import type { BurdenedGiftInfoPayload } from "./transfer-tax-api-burdened-gift";

/**
 * 「당초 증여자」 취득 당시 값 한 벌을 폼에서 뽑는다 (D-7b).
 *
 * 빈 문자열은 `undefined`로 떨어뜨린다 — **0과 미입력은 다르다**. 건물이 없는 토지 자산은
 * 사용자가 `0`을 명시해야 하고, 그때는 `parseAmount`가 0을 돌려주므로 `undefined`가 아니다.
 * (`?? undefined`가 아니라 빈 문자열 검사인 이유 — `parseAmount("") || undefined`로 쓰면
 *  사용자가 입력한 **0이 미입력으로 둔갑**한다.)
 */
export function buildCarryoverDonorBasis(
  primary: AssetForm,
): BurdenedGiftInfoPayload["carryoverDonorBasis"] {
  const raw = gbBgGiftValuationByPart(primary);
  // 비율 = 영 §163의2②2호 자산별 증여세 과세가액(평가액 − 당초 증여 때 인수한 채무 · `carryover-gift-tax-numerator-net.plan.md` §4.2). 한 파트가 채무로 0이면 그 파트 몫도 0이다.
  const byPart = raw && raw.land > 0 && raw.building > 0 ? gbBgGiftTaxedValueByPart(primary) : undefined;
  // 비율에만 쓰므로 지분 축소 전 값 그대로다. 평가액 한쪽이라도 비면 싣지 않는다 — ⑧이 막고, 직접 호출은 엔진이 양도가액 비율로 나눈다.
  // 당초 증여자의 건물 취득일 — 둘 다 이월과세일 때만. 비면 싣지 않는다(⑧이 막는다 · 토지 날짜로 채우지 않는다).
  // 주택·건물 이월과세 토글 C(당초 증여자가 토지·건물을 다른 날 취득)도 같은 키다(설계서 `bg-house-building-split.design.md` §5.2).
  const houseSplitC = bgHouseSplitMode(primary) === "carryover";
  const buildingDonorDate = gbBgSplitsGiftValuation(primary) || houseSplitC ? primary.buildingCarryover?.donorAcquisitionDate : undefined;
  const basis = {
    ...buildBothPartsDonorBasis(primary),
    ...(byPart && byPart.land + byPart.building > 0 ? { giftValuationByPart: byPart } : {}),
    ...(buildingDonorDate ? { buildingDonorAcquisitionDate: buildingDonorDate } : {}),
  };
  // 주택·건물 토글 C — 당초 증여자 실지취득가액도 토지·건물 두 칸이 정본이다(총액 칸 미전송). 토글이 꺼져 있으면 파트 칸의 남은 값을 싣지 않는다.
  if (primary.assetKind === "housing" || primary.assetKind === "building")
    return houseSplitC
      ? { ...basis, actualAcquisitionTotal: undefined }
      : { ...basis, actualLandAcquisitionPrice: undefined, actualBuildingAcquisitionPrice: undefined };
  const parts = bgCarryoverPartsPayload(primary);
  if (!parts) return basis;
  if (parts.land && parts.building) return { ...basis, parts };
  /**
   * 한 파트만 증여받았다(계획서 `gb-bg-part-carryover-calc.plan.md` §4.4) — 증여받지 않은 파트의 당초 증여자 칸은 화면에 없다(⑤).
   * 남은 값을 싣지 않는다. 총액 칸(K-4 총액·legacy 시가·K-6/K-7 총액)도 일반건물 화면에는 없다 — 엔진은 한 파트만이면 총액을 거부한다(Q-4).
   */
  return {
    ...basis,
    ...(parts.land ? {} : { landStdPriceAtAcquisition: undefined, actualLandAcquisitionPrice: undefined, presumedLandAcquisitionPrice: undefined }),
    ...(parts.building ? {} : { buildingStdPriceAtAcquisition: undefined, actualBuildingAcquisitionPrice: undefined, presumedBuildingAcquisitionPrice: undefined }),
    actualAcquisitionTotal: undefined,
    presumedAcquisitionTotal: undefined,
    marketValueAtAcquisition: undefined,
    parts,
  };
}

/** 토지·건물 두 파트의 당초 증여자 값 — 증여받은 파트로 거르기 전. */
function buildBothPartsDonorBasis(
  primary: AssetForm,
): NonNullable<BurdenedGiftInfoPayload["carryoverDonorBasis"]> {
  const num = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseAmount(v) : undefined;
  return {
    landStdPriceAtAcquisition: num(primary.bgCoDonorLandStdPriceAtAcq),
    buildingStdPriceAtAcquisition: num(primary.bgCoDonorBuildingStdPriceAtAcq),
    actualLandAcquisitionPrice: num(primary.bgCoDonorActualAcquisitionLand),
    /**
     * 토지 자산에는 건물 부분이 없다 — 토지 칸이 입력되면 건물은 **0**(B1, 2026-09-30).
     * 화면에 건물 칸이 없어 비워 두면 엔진 게이트(`assertCarryoverDonorBasis` K-4 「분리 2칸 또는 총액」)가
     * 던진다. 위 토지 자산 기준시가 변환(`buildingStdPriceAt*: 0`)과 같은 사실을 싣는 것이지 fallback이 아니다.
     */
    actualBuildingAcquisitionPrice:
      primary.assetKind === "land"
        ? num(primary.bgCoDonorActualAcquisitionLand) !== undefined
          ? 0
          : undefined
        : num(primary.bgCoDonorActualAcquisitionBuilding),
    actualAcquisitionTotal: num(primary.bgCoDonorActualAcquisitionTotal),
    marketValueAtAcquisition: num(primary.bgCoDonorMarketValueAtAcquisition),
    ...buildCoDonorPresumed(primary),
    // 당초 증여자 신축·증축(§114조의2, PR-4) — 토글 ON + 환산(K-5)·감정(K-7)일 때만. 양도인 본인 신축(`isSelfBuilt`)과 다른 축이다.
    ...(() => {
      const donorBuilt = buildDonorBuiltBgPayload(primary);
      return donorBuilt ? { donorBuilt } : {};
    })(),
  };
}

/**
 * 이월과세 × K-6/K-7 — **당초 증여자**의 매매사례가액·감정가액. 방식이 아니면 비운다.
 * 자산 종류의 입력 형태에 맞는 칸만 싣는다(양도인 쪽 `buildPresumedAcquisition`과 같은 `bgPresumedInputKind`) —
 * 엔진 STEP 4가 분리 칸이 하나라도 있으면 총액을 무시하므로 stale 칸이 새면 안 된다.
 */
function buildCoDonorPresumed(
  primary: AssetForm,
): Pick<
  NonNullable<BurdenedGiftInfoPayload["carryoverDonorBasis"]>,
  "presumedLandAcquisitionPrice" | "presumedBuildingAcquisitionPrice" | "presumedAcquisitionTotal"
> {
  if (!isBgPresumedMethod(primary.bgAcquisitionMethod)) return {};
  const num = (v: string | undefined) =>
    v !== undefined && v !== "" ? parseAmount(v) : undefined;
  switch (bgPresumedInputKind(primary)) {
    case "split":
      return {
        presumedLandAcquisitionPrice: num(primary.bgCoDonorPresumedAcquisitionLand),
        presumedBuildingAcquisitionPrice: num(primary.bgCoDonorPresumedAcquisitionBuilding),
      };
    case "land":
      return { presumedLandAcquisitionPrice: num(primary.bgCoDonorPresumedAcquisitionLand) };
    default:
      return { presumedAcquisitionTotal: num(primary.bgCoDonorPresumedAcquisitionTotal) };
  }
}
