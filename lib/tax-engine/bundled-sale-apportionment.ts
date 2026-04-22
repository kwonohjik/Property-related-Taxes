/**
 * 일괄양도 안분 Pure Engine
 *
 * 하나의 매매계약으로 여러 자산(예: 1세대 1주택 + 별도 필지 농지)을 양도할 때,
 * 기준시가 비율로 자산별 양도가액·취득가액·공통경비를 안분한다.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수.
 * 모든 금액 정수 연산. 곱셈-후-나눗셈 원칙, Math.floor 중간 절사.
 *
 * 근거 조문:
 *   - 소득세법 시행령 §166 ⑥ — 양도가액 안분 (TRANSFER.BUNDLED_APPORTIONMENT)
 *
 * 알고리즘:
 *   - 분모 = Σ standardPriceAtTransfer (모든 자산)
 *   - 각 자산 양도가 = Math.floor(safeMultiplyThenDivide(total, num, denom))
 *   - **말단 자산 = total − Σ(이전 자산들)** → 원 단위 오차 완벽 흡수
 *   - 취득가액: fixedAcquisitionPrice 있으면 그대로, 없으면 totalAcquisitionPrice 비율 안분
 *   - 공통경비: 양도가 비율과 동일 키로 안분 + 자산별 directExpenses 합산
 *
 * 다필지 안분(`./multi-parcel-transfer.ts`)은 **같은 토지를 면적으로** 안분하는 반면,
 * 본 모듈은 **종류가 다른 자산(주택·토지·건물 혼재)을 기준시가 비율로** 안분한다.
 */

import { TRANSFER } from "./legal-codes";

/**
 * 일괄양도 안분 전용 "곱셈-후-나눗셈 후 반올림" 헬퍼.
 *
 * 세법 일반원칙은 Math.floor(중간절사)이나, **비례 안분**은 실무 관례상 반올림.
 * 소득세법 시행령 §166⑥에는 반올림/절사 방식이 명시되어 있지 않으며,
 * 국세청 계산사례(2023 양도·상속·증여세 이론 및 계산실무 p388 등)는 반올림을 사용한다.
 *
 * 말단 자산은 잔여값으로 흡수되므로 합계(Σ) 무결성은 보장된다.
 */
function apportionAmount(total: number, num: number, denom: number): number {
  if (denom === 0) return 0;
  // BigInt overflow 방지 + 정수 반올림
  const product = total * num;
  if (Math.abs(product) > Number.MAX_SAFE_INTEGER) {
    // BigInt 경로 (세법 원칙: 반올림은 Math.round와 동치가 되도록 '+ denom/2 후 floor' 트릭)
    const halfDenom = BigInt(Math.floor(denom / 2));
    return Number(
      (BigInt(total) * BigInt(num) + halfDenom) / BigInt(denom),
    );
  }
  return Math.round(product / denom);
}
import type {
  BundledAssetInput,
  BundledApportionedAsset,
  BundledApportionmentInput,
  BundledApportionmentResult,
} from "./types/bundled-sale.types";

export type {
  BundledAssetInput,
  BundledAssetKind,
  BundledApportionedAsset,
  BundledApportionmentInput,
  BundledApportionmentMethod,
  BundledApportionmentResult,
} from "./types/bundled-sale.types";

export function apportionBundledSale(
  input: BundledApportionmentInput,
): BundledApportionmentResult {
  const { totalSalePrice, totalAcquisitionPrice, commonExpenses = 0, assets } = input;
  const warnings: string[] = [];

  if (assets.length < 2) {
    throw new Error("안분 대상 자산은 최소 2건 이상이어야 합니다");
  }
  if (totalSalePrice <= 0) {
    throw new Error("총 양도가액은 0보다 커야 합니다");
  }

  // ── Step 1: 안분 분모 ──────────────────────────
  const totalStandardAtTransfer = assets.reduce(
    (sum, a) => sum + a.standardPriceAtTransfer,
    0,
  );
  if (totalStandardAtTransfer <= 0) {
    throw new Error("자산 기준시가 합이 0 이하입니다 — 안분 불가");
  }

  for (const a of assets) {
    if (a.standardPriceAtTransfer <= 0) {
      warnings.push(
        `자산 "${a.assetLabel}"의 양도시점 기준시가가 0 이하입니다 — 비율 0으로 처리됩니다`,
      );
    }
  }

  // ── Step 2: 양도가액 비율 안분 (말단 잔여값 보정) ──
  const allocatedSales: number[] = [];
  let accSale = 0;
  for (let i = 0; i < assets.length; i++) {
    if (i === assets.length - 1) {
      // 말단: 잔여값으로 원 단위 오차 완벽 흡수
      allocatedSales.push(totalSalePrice - accSale);
    } else {
      const v = apportionAmount(
        totalSalePrice,
        assets[i].standardPriceAtTransfer,
        totalStandardAtTransfer,
      );
      allocatedSales.push(v);
      accSale += v;
    }
  }

  // ── Step 3: 취득가액 안분 ─────────────────────
  // 우선순위:
  //   (1) fixedAcquisitionPrice 있는 자산은 그대로 사용 (상속·증여 등)
  //   (2) totalAcquisitionPrice 제공 → 취득시 기준시가(또는 양도시 기준시가) 비율 안분
  //   (3) 둘 다 없으면 0
  const hasAnyFixed = assets.some((a) => a.fixedAcquisitionPrice !== undefined);
  const allocatedAcqs: number[] = [];

  if (hasAnyFixed) {
    // 자산별 개별 선계산: fixed 있으면 그 값, 없으면 0
    for (const a of assets) {
      allocatedAcqs.push(a.fixedAcquisitionPrice ?? 0);
    }
    if (totalAcquisitionPrice !== undefined) {
      warnings.push(
        "fixedAcquisitionPrice가 지정된 자산이 있어 totalAcquisitionPrice는 무시됩니다",
      );
    }
  } else if (totalAcquisitionPrice !== undefined && totalAcquisitionPrice > 0) {
    const denomAcq = assets.reduce(
      (sum, a) => sum + (a.standardPriceAtAcquisition ?? a.standardPriceAtTransfer),
      0,
    );
    if (denomAcq <= 0) {
      warnings.push(
        "취득가액 안분 분모가 0 이하 — 모든 자산 취득가액을 0으로 처리",
      );
      for (let i = 0; i < assets.length; i++) allocatedAcqs.push(0);
    } else {
      let accAcq = 0;
      for (let i = 0; i < assets.length; i++) {
        const num =
          assets[i].standardPriceAtAcquisition ?? assets[i].standardPriceAtTransfer;
        if (i === assets.length - 1) {
          allocatedAcqs.push(totalAcquisitionPrice - accAcq);
        } else {
          const v = apportionAmount(totalAcquisitionPrice, num, denomAcq);
          allocatedAcqs.push(v);
          accAcq += v;
        }
      }
    }
  } else {
    for (let i = 0; i < assets.length; i++) allocatedAcqs.push(0);
  }

  // ── Step 4: 공통경비 안분 + 직접경비 합산 ────
  const allocatedExpenses: number[] = [];
  if (commonExpenses > 0) {
    let accExp = 0;
    for (let i = 0; i < assets.length; i++) {
      const direct = assets[i].directExpenses ?? 0;
      let commonShare: number;
      if (i === assets.length - 1) {
        commonShare = commonExpenses - accExp;
      } else {
        commonShare = apportionAmount(
          commonExpenses,
          assets[i].standardPriceAtTransfer,
          totalStandardAtTransfer,
        );
        accExp += commonShare;
      }
      allocatedExpenses.push(direct + commonShare);
    }
  } else {
    for (const a of assets) allocatedExpenses.push(a.directExpenses ?? 0);
  }

  // ── Step 5: 결과 조립 ─────────────────────────
  const apportioned: BundledApportionedAsset[] = assets.map((a, i) => ({
    assetId: a.assetId,
    assetLabel: a.assetLabel,
    assetKind: a.assetKind,
    allocatedSalePrice: allocatedSales[i],
    allocatedAcquisitionPrice: allocatedAcqs[i],
    allocatedExpenses: allocatedExpenses[i],
    displayRatio:
      totalStandardAtTransfer > 0
        ? Math.round((a.standardPriceAtTransfer / totalStandardAtTransfer) * 10000) / 10000
        : 0,
    standardPriceAtTransfer: a.standardPriceAtTransfer,
    standardPriceAtAcquisition: a.standardPriceAtAcquisition,
  }));

  // ── Step 6: 합계 일치 검증 (방어적) ────────────
  const sumAllocated = apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0);
  if (sumAllocated !== totalSalePrice) {
    warnings.push(
      `안분 합계 불일치: sum=${sumAllocated}, total=${totalSalePrice} (말단 보정 실패 — 버그 가능성)`,
    );
  }

  return {
    apportioned,
    totalStandardAtTransfer,
    residualAbsorbedBy: assets[assets.length - 1].assetId,
    legalBasis: TRANSFER.BUNDLED_APPORTIONMENT,
    warnings,
  };
}

/**
 * 단일 자산 입력을 BundledAssetInput으로 변환하기 위한 헬퍼 (API route에서 사용).
 * 주 자산(`propertySchema`의 transferPrice·acquisitionPrice·standardPriceAtTransfer 등)과
 * companionAssets를 동일한 BundledAssetInput 배열로 통일해 apportion에 넘기기 위함.
 */
export function toBundledAsset(
  assetId: string,
  assetLabel: string,
  assetKind: BundledAssetInput["assetKind"],
  standardPriceAtTransfer: number,
  options?: {
    standardPriceAtAcquisition?: number;
    directExpenses?: number;
    fixedAcquisitionPrice?: number;
  },
): BundledAssetInput {
  return {
    assetId,
    assetLabel,
    assetKind,
    standardPriceAtTransfer,
    standardPriceAtAcquisition: options?.standardPriceAtAcquisition,
    directExpenses: options?.directExpenses,
    fixedAcquisitionPrice: options?.fixedAcquisitionPrice,
  };
}
