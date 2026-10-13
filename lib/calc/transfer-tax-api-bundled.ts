import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { effectiveBundledSaleMode } from "@/lib/calc/bundled-sale-mode";
import { applyRatio } from "./transfer-tax-api-helpers";
import { buildAssetPayload } from "./transfer-tax-api-helpers";
import { deriveEngineInheritanceAssetKind } from "./transfer-tax-api-helpers";
import { mergePrimaryBasic } from "./transfer-tax-api-helpers";
import { effectiveBuildingCauseMix } from "./transfer-land-part-cause";
import type { buildPrimaryContext } from "./transfer-tax-api-primary-context";

/**
 * ④⑬ 일괄양도(assets 2건 이상) 신고 단위 페이로드 — `transfer-tax-api.ts`에서 800줄 정책으로 분리했다(결정 #38-10 작업 중 776줄).
 * 호출부 게이트(`form.assets.length > 1 && gbShares === undefined`)는 그대로 호출부에 있고, 이 함수는 그 안쪽 본문만 만든다 — 무동작 이동이다.
 */
export function buildBundledPrimaryPayload(c: {
  form: TransferFormData;
  primary: AssetForm;
  fractionalBundleMerge: boolean;
  totalContractPrice: number;
  primaryRatio: number;
  primaryFractional: boolean;
  primaryShareInCompanion: boolean;
  effBundledSaleMode: ReturnType<typeof effectiveBundledSaleMode>;
  shareOf: (v: number) => number;
  formTotalTransferExpense: number;
  companionBgDebtOverrides: ReturnType<typeof buildPrimaryContext>["companionBgDebtOverrides"];
}) {
  const {
    form,
    primary,
    fractionalBundleMerge,
    totalContractPrice,
    primaryRatio,
    primaryFractional,
    primaryShareInCompanion,
    effBundledSaleMode,
    shareOf,
    formTotalTransferExpense,
    companionBgDebtOverrides,
  } = c;
  return {
    totalSalePrice: totalContractPrice,
    // §166⑥ 안분 키 — 함께양도 묶음의 지분 primary는 물건 전체(100%) 기준시가 × 지분율(양도하는 것이 지분이다).
    standardPriceAtTransferForApportion:
      parseAmount(primary.standardPriceAtTransfer) > 0
        ? primaryShareInCompanion
          ? applyRatio(parseAmount(primary.standardPriceAtTransfer), primaryRatio)
          : parseAmount(primary.standardPriceAtTransfer)
        : undefined,
    primaryInheritanceValuation:
      primary.acquisitionCause === "inheritance" && !effectiveBuildingCauseMix(primary) // D2: 건물 평가액은 파트 가액
        ? {
            inheritanceDate: primary.acquisitionDate,
            // 보충적평가 자산 구분 — 상단 assetKind 기준 파생(land vs 非land; housing은 개별/공동).
            // 상속 자산구분 라디오 폐지 대응(deriveEngineInheritanceAssetKind). 결과는 schema enum 값.
            assetKind: deriveEngineInheritanceAssetKind(primary),
            landAreaM2: primary.acquisitionArea ? parseFloat(primary.acquisitionArea) : undefined,
            // 지분 모드: 100% 기준 입력값(공동주택가격 등)에 × ratio 적용
            publishedValueAtInheritance: primaryFractional
              ? applyRatio(parseAmount(primary.publishedValueAtInheritance), primaryRatio)
              : parseAmount(primary.publishedValueAtInheritance),
          }
        : undefined,
    companionAssets: form.assets
      .slice(1)
      // 지분 모드(같은 물건 분할취득): companion ① 기본정보를 UI에서 숨기므로
      // primary basic(자산종류·면적·토지성격)을 병합해 엔진에 전달 (mergePrimaryBasic).
      // ⑬ 폼-수준 총 양도비를 **자산에 싣지 않는다** — 아래 `commonTransferExpense`로
      //    신고 단위 1회만 보내고 엔진이 §100② 후단(가액 비례)으로 안분한다(Q08).
      //    자산별 직접 입력분(`transferExpense`)은 그대로 `directExpenses`로 더해진다.
      .map((a, ci) => buildAssetPayload(fractionalBundleMerge ? mergePrimaryBasic(a, primary) : a, effBundledSaleMode, form.transferDate, totalContractPrice, undefined, form.assets[0], form.isOneHousehold, companionBgDebtOverrides?.[ci + 1], form)),
    // 🔴 신고 단위 선언도 **파생값**이다(H8) — 자산별 계산만 안분하고 여기를 raw로 두면
    //    한 요청 안에서 「자산은 안분 / 신고는 구분기재」로 어긋난다.
    bundledSaleMode: effBundledSaleMode,
    /**
     * ⑬ 신고 단위 공통 양도비 (§100② 후단) — 「공통되는 … 양도비용은 해당 자산의
     * 가액에 비례하여 안분계산한다」. 안분은 `apportionBundledSale`의 `commonExpenses`가
     * 수행하고 마지막 자산이 잔액을 흡수해 Σ가 보존된다.
     */
    ...(formTotalTransferExpense > 0
      ? { commonTransferExpense: formTotalTransferExpense }
      : {}),
    // primary 확정 양도가액.
    //  - 축 B(같은 물건 지분 분할): 총계약가 × ratio 자동 결정 (bundledSaleMode 무관, actualSalePrice 무시 —
    //    companion `buildAssetPayload` 정책과 일관). route가 fixedSalePrice로 주입해
    //    기준시가 안분 없이 지분율 안분 성립.
    //  - actual 모드: 계약서상 양도가액 — 함께양도 묶음의 지분 primary는 물건 전체(100%) 입력 × 지분율.
    //  - apportioned(축 B 아님): undefined (양도시 기준시가 비율 안분).
    primaryActualSalePrice: primaryFractional && !primaryShareInCompanion
      ? applyRatio(totalContractPrice, primaryRatio)
      : effBundledSaleMode === "actual" && primary.actualSalePrice
        ? shareOf(parseAmount(primary.actualSalePrice))
        : undefined,
  };
}
