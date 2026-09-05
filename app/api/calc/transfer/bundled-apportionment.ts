/**
 * 일괄양도(시행령 §166⑥) **안분 준비·실행** — route (1)~(4.5) 추출.
 *
 * 상속 보충평가 취득가액 → 컴패니언 취득가액 → `BundledAssetInput` 조립 → 안분 →
 * 매매 환산 사후산정까지를 단일 함수로. route는 결과(`apportionment`·`adjustedAcq`)만 소비한다.
 *
 * ⚠️ `bundled-split-helpers.ts`에서 분리했다(800줄 정책). 그 파일은 **⑭ 컴패니언 엔진 input
 *    조립**을 맡고, 이 파일은 **그 앞 단계(안분)** 를 맡는다 — 두 축은 서로 부르지 않는다.
 */
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import type { InheritanceAssetKind } from "@/lib/tax-engine/inheritance-acquisition-price";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";
import {
  apportionBundledSale,
  type BundledAssetInput,
  type BundledApportionmentResult,
} from "@/lib/tax-engine/bundled-sale-apportionment";
import { toApportionKind } from "./bundled-split-helpers";

interface BundledInheritanceValuation {
  inheritanceDate: string;
  assetKind: InheritanceAssetKind;
  landAreaM2?: number;
  publishedValueAtInheritance: number;
}

interface BundledPrimaryInput {
  // 넓은 union 허용 (right_to_move_in 등) — 내부에서 housing/building/land로 매핑
  propertyType: TransferTaxItemInput["propertyType"];
  totalSalePrice?: number;
  standardPriceAtTransferForApportion?: number;
  expenses?: number;
  acquisitionPrice: number;
  /** 지분 모드·actual 모드에서 route가 fixedSalePrice로 주입할 primary 확정 양도가액 */
  primaryActualSalePrice?: number;
  primaryInheritanceValuation?: BundledInheritanceValuation;
  /**
   * 신고 단위 **공통 양도비** (원) — 「소득세법」 §100② 후단 (Q08).
   * 「공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분계산한다」.
   * `apportionBundledSale`의 `commonExpenses`로 그대로 넘어간다 — 자산별 `directExpenses`와
   * **더해지지 대체되지 않는다**(`allocatedExpenses = direct + commonShare`).
   */
  commonTransferExpense?: number;
}

interface BundledCompanionForApportion {
  assetId: string;
  assetLabel: string;
  assetKind:
    | "housing"
    | "land"
    | "building"
    | "commercial_building"
    | "presale_right"
    | "right_to_move_in"
    | "redevelopment_apt"
    | "general_building"
    | "mixed_use_house";
  acquisitionCause: TransferTaxItemInput["acquisitionCause"];
  useEstimatedAcquisition?: boolean;
  /** §97①1호나목 환산 분모(4.5 매매 estimated). 이월과세 general에서는 증여자 축 값이다. */
  standardPriceAtTransfer?: number;
  /**
   * §166⑥ **안분 키** — 사용자가 입력한 자산-수준 「양도시 기준시가」(⑫ 전용 필드).
   * `standardPriceAtTransfer`와 나눠 두지 않으면 이월과세 general 환산 컴패니언에서
   * 안분 키가 증여자 기준시가로 치환된다(D-5·V-10).
   */
  standardPriceAtTransferForApportion?: number;
  standardPriceAtAcquisition?: number;
  directExpenses?: number;
  fixedAcquisitionPrice?: number;
  fixedSalePrice?: number;
  inheritanceValuation?: BundledInheritanceValuation;
}

/**
 * 일괄양도 안분 준비·실행.
 * @param opts.isActualMode §166⑥ 본문 (계약서 구분기재)
 * @param opts.isFullFractionalBundle 완전 지분 모드 (같은 물건 지분 분할) — fixedSalePrice 주입 + 잔액 흡수
 */
export function prepareBundledApportionment(
  primary: BundledPrimaryInput,
  companions: BundledCompanionForApportion[],
  opts: { isActualMode: boolean; isFullFractionalBundle: boolean },
): {
  apportionment: BundledApportionmentResult;
  adjustedAcq: Map<string, { price: number; used: boolean }>;
} {
  const { isActualMode, isFullFractionalBundle } = opts;

  // (1) 주 자산 상속 보충적평가액 (선택)
  let primaryFixedAcq: number | undefined;
  if (primary.primaryInheritanceValuation) {
    const v = primary.primaryInheritanceValuation;
    primaryFixedAcq = calculateInheritanceAcquisitionPrice({
      inheritanceDate: new Date(v.inheritanceDate),
      assetKind: v.assetKind,
      landAreaM2: v.landAreaM2,
      reportedValue: v.publishedValueAtInheritance,
      reportedMethod: "supplementary",
    }).acquisitionPrice;
  }

  // (2) 컴패니언 자산별 취득가액 (acquisitionCause 분기)
  const companionFixedAcq: (number | undefined)[] = companions.map((c) => {
    if (c.acquisitionCause === "purchase" && c.useEstimatedAcquisition) return undefined;
    if (c.acquisitionCause === "inheritance" && c.inheritanceValuation) {
      const v = c.inheritanceValuation;
      return calculateInheritanceAcquisitionPrice({
        inheritanceDate: new Date(v.inheritanceDate),
        assetKind: v.assetKind,
        landAreaM2: v.landAreaM2,
        reportedValue: v.publishedValueAtInheritance,
        reportedMethod: "supplementary",
      }).acquisitionPrice;
    }
    return c.fixedAcquisitionPrice;
  });

  // (3) BundledAssetInput 배열 구성
  const primaryAssetKind: BundledAssetInput["assetKind"] =
    primary.propertyType === "housing"
      ? "housing"
      : primary.propertyType === "building"
        ? "building"
        : "land";
  const primaryLabel =
    primary.propertyType === "housing"
      ? "주 자산(주택)"
      : primary.propertyType === "land"
        ? "주 자산(토지)"
        : "주 자산";

  const bundleAssets: BundledAssetInput[] = [
    {
      assetId: "primary",
      assetLabel: primaryLabel,
      assetKind: primaryAssetKind,
      standardPriceAtTransfer: primary.standardPriceAtTransferForApportion ?? 0,
      directExpenses: primary.expenses,
      fixedAcquisitionPrice:
        primaryFixedAcq ??
        (primary.acquisitionPrice > 0 ? primary.acquisitionPrice : undefined),
      // actual 모드 또는 완전 지분 모드: 주 자산의 확정 양도가액 주입
      fixedSalePrice:
        isActualMode || isFullFractionalBundle ? primary.primaryActualSalePrice : undefined,
    },
    ...companions.map(
      (c, i): BundledAssetInput => ({
        assetId: c.assetId,
        assetLabel: c.assetLabel,
        /**
         * §166⑥ **안분 축**은 3종뿐이다. 상가·분양권은 `building`으로 접는다 — 이 축에서
         * `assetKind`는 라벨·표시용이고 안분 키는 **기준시가**라 결과가 달라지지 않는다.
         * (primary도 위 `primaryAssetKind`에서 같은 fold를 한다.)
         *
         * ⚠️ 세율·환산이 걸리는 `propertyType` 축과 혼동 금지 — 그쪽은 접으면 오산이다.
         * ⚠️ 분양권을 `housing`으로 접지 않는 이유: 이 값은 결과 카드의 `ValuationDetailCards`
         *    게이트로도 흘러가므로, 권리에 주택 라벨을 붙이면 표시가 거짓이 된다.
         */
        assetKind: toApportionKind(c.assetKind),
        // §166⑥ 안분 키 — 전용 필드 우선. 구필드 fallback은 전용 키를 모르는 직접 호출자 하위호환
        // (⑩ superRefine의 `apportionKey` 선택식과 **같은 식**이어야 한다 — 단일 기준).
        standardPriceAtTransfer:
          c.standardPriceAtTransferForApportion ?? c.standardPriceAtTransfer ?? 0,
        standardPriceAtAcquisition: c.standardPriceAtAcquisition,
        directExpenses: c.directExpenses,
        fixedAcquisitionPrice: companionFixedAcq[i],
        // actual 모드 또는 완전 지분 모드: 컴패니언의 확정 양도가액 주입
        fixedSalePrice:
          isActualMode || isFullFractionalBundle ? c.fixedSalePrice : undefined,
      }),
    ),
  ];

  // 완전 지분 모드: applyRatio(floor) 절사로 Σfixed < total일 수 있으므로
  // 마지막 자산이 잔액을 흡수해 Σfixed = totalSalePrice 불변식 보장
  // (apportionBundledSale "잔여 양도가액 있으나 안분 대상 없음" throw 회피).
  // 정수 보정(1~2원)일 뿐 안분 방식 선택이 아님 — feedback_floor_residual_absorption.
  if (isFullFractionalBundle && bundleAssets.every((a) => a.fixedSalePrice !== undefined)) {
    const last = bundleAssets.length - 1;
    const sumExceptLast = bundleAssets
      .slice(0, last)
      .reduce((s, a) => s + (a.fixedSalePrice ?? 0), 0);
    bundleAssets[last].fixedSalePrice = primary.totalSalePrice! - sumExceptLast;
  }

  // (4) 안분 실행
  const apportionment = apportionBundledSale({
    totalSalePrice: primary.totalSalePrice!,
    assets: bundleAssets,
    // §100② 후단 — 공통 양도비를 결정된 양도가액 비율로 안분(마지막 자산 잔액 흡수).
    // 🔴 종전에는 이 인자가 **한 번도 전달되지 않아** 엔진 Step 5가 죽은 코드였다(Q08).
    commonExpenses: primary.commonTransferExpense,
  });

  // (4.5) 매매 estimated 컴패니언: 안분된 양도가액으로 환산취득가 사후 산정
  const adjustedAcq = new Map<string, { price: number; used: boolean }>();
  companions.forEach((c) => {
    if (
      c.acquisitionCause === "purchase" &&
      c.useEstimatedAcquisition &&
      c.standardPriceAtAcquisition &&
      c.standardPriceAtTransfer
    ) {
      const alloc = apportionment.apportioned.find((a) => a.assetId === c.assetId);
      if (!alloc) return;
      const price = calculateEstimatedAcquisitionPrice(
        alloc.allocatedSalePrice,
        c.standardPriceAtAcquisition,
        c.standardPriceAtTransfer,
      );
      adjustedAcq.set(c.assetId, { price, used: true });
    }
  });

  // usedEstimatedAcquisition 플래그 전파 (결과 표시용)
  apportionment.apportioned.forEach((a) => {
    const adj = adjustedAcq.get(a.assetId);
    if (adj?.used) a.usedEstimatedAcquisition = true;
  });

  return { apportionment, adjustedAcq };
}
