/**
 * 일괄양도 안분 Pure Engine
 *
 * 하나의 매매계약으로 여러 자산(예: 1세대 1주택 + 별도 필지 농지)을 양도할 때,
 * 양도가액을 다음 두 방식 중 하나로 결정한다.
 *
 *   (1) §166⑥ 본문 — `fixedSalePrice`가 지정된 자산은 안분 대상에서 제외하고
 *       그 값을 그대로 `allocatedSalePrice`로 사용한다(계약서에 가액이 구분 기재된 경우).
 *   (2) §166⑥ 단서 — `fixedSalePrice`가 없는 자산은 잔여 totalSalePrice를
 *       기준시가(`standardPriceAtTransfer`) 비율로 안분한다(구분 불분명한 경우).
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수.
 * 모든 금액 정수 연산. 곱셈-후-나눗셈 원칙, 비례 안분은 반올림(국세청 계산사례 관행).
 *
 * 근거 조문:
 *   - 소득세법 시행령 §166 ⑥ — 양도가액 안분 (TRANSFER.BUNDLED_APPORTIONMENT)
 *
 * 알고리즘:
 *   - fixedSet  = assets.filter(a => a.fixedSalePrice !== undefined)
 *   - variableSet = assets.filter(a => a.fixedSalePrice === undefined)
 *   - residual = totalSalePrice - Σ(fixedSet.fixedSalePrice)
 *   - variableSet 안분: 분모 = Σ(variableSet.standardPriceAtTransfer), 말단 잔여값 흡수
 *   - 취득가액: fixedAcquisitionPrice 있으면 그대로, 없으면 totalAcquisitionPrice 비율 안분
 *   - 공통경비: 양도가 비율(allocatedSalePrice 기준)로 안분 + 자산별 directExpenses 합산
 *
 * 다필지 안분(`./multi-parcel-transfer.ts`)은 **같은 토지를 면적으로** 안분하는 반면,
 * 본 모듈은 **종류가 다른 자산(주택·토지·건물 혼재)을 가액·기준시가로** 결정한다.
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

  // ── Step 1: fixed/variable 자산 분리 (§166⑥ 본문 vs 단서) ──
  const fixedIndices: number[] = [];
  const variableIndices: number[] = [];
  for (let i = 0; i < assets.length; i++) {
    if (assets[i].fixedSalePrice !== undefined) {
      fixedIndices.push(i);
    } else {
      variableIndices.push(i);
    }
  }

  const sumFixedSale = fixedIndices.reduce(
    (s, i) => s + (assets[i].fixedSalePrice ?? 0),
    0,
  );
  const residualSale = totalSalePrice - sumFixedSale;

  if (residualSale < 0) {
    throw new Error(
      `구분 기재된 양도가액 합(${sumFixedSale.toLocaleString()})이 ` +
      `총 양도가액(${totalSalePrice.toLocaleString()})을 초과합니다`,
    );
  }
  if (variableIndices.length === 0 && residualSale > 0) {
    throw new Error(
      `잔여 양도가액(${residualSale.toLocaleString()})이 있으나 안분 대상 자산이 없습니다`,
    );
  }

  // ── Step 2: variableSet 안분 분모 (variable 자산의 standardPriceAtTransfer 합) ──
  const totalStandardAtTransfer = variableIndices.reduce(
    (s, i) => s + assets[i].standardPriceAtTransfer,
    0,
  );

  if (variableIndices.length > 0 && totalStandardAtTransfer <= 0 && residualSale > 0) {
    throw new Error(
      "자산 기준시가 합이 0 이하입니다 — 안분 분모 부족, 안분 불가",
    );
  }

  for (const i of variableIndices) {
    const a = assets[i];
    if (a.standardPriceAtTransfer <= 0) {
      warnings.push(
        `자산 "${a.assetLabel}"의 양도시점 기준시가가 0 이하입니다 — 비율 0으로 처리됩니다`,
      );
    }
  }

  // ── Step 3: 양도가액 결정 ──
  // - fixed 자산: fixedSalePrice 그대로
  // - variable 자산: residualSale를 기준시가 비율로 안분, 말단 자산이 잔여값 흡수
  const allocatedSales: number[] = new Array(assets.length).fill(0);

  for (const i of fixedIndices) {
    allocatedSales[i] = assets[i].fixedSalePrice!;
  }

  if (variableIndices.length > 0) {
    let accSale = 0;
    for (let k = 0; k < variableIndices.length; k++) {
      const i = variableIndices[k];
      const isLast = k === variableIndices.length - 1;
      if (isLast) {
        // 말단: 잔여값으로 원 단위 오차 완벽 흡수
        allocatedSales[i] = residualSale - accSale;
      } else {
        const v = apportionAmount(
          residualSale,
          assets[i].standardPriceAtTransfer,
          totalStandardAtTransfer,
        );
        allocatedSales[i] = v;
        accSale += v;
      }
    }
  }

  // ── Step 4: 취득가액 결정 ─────────────────────
  // 우선순위:
  //   (1) fixedAcquisitionPrice 있는 자산은 그대로 사용 (상속·증여·매매 actual 등)
  //   (2) totalAcquisitionPrice 제공 → 취득시 기준시가(또는 양도시 기준시가) 비율 안분
  //   (3) 둘 다 없으면 0 (라우트 어댑터에서 환산취득가 등 사후 결정 가능)
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

  // ── Step 5: 공통경비 안분 + 직접경비 합산 ────
  // 공통경비는 결정된 양도가액(allocatedSales) 비율로 안분 — fixed/variable 무관 일관 처리.
  const allocatedExpenses: number[] = [];
  if (commonExpenses > 0 && totalSalePrice > 0) {
    let accExp = 0;
    for (let i = 0; i < assets.length; i++) {
      const direct = assets[i].directExpenses ?? 0;
      let commonShare: number;
      if (i === assets.length - 1) {
        commonShare = commonExpenses - accExp;
      } else {
        commonShare = apportionAmount(
          commonExpenses,
          allocatedSales[i],
          totalSalePrice,
        );
        accExp += commonShare;
      }
      allocatedExpenses.push(direct + commonShare);
    }
  } else {
    for (const a of assets) allocatedExpenses.push(a.directExpenses ?? 0);
  }

  // ── Step 6: 결과 조립 ─────────────────────────
  // displayRatio 계산:
  //   - fixed 자산: 자기 가액 / totalSalePrice
  //   - variable 자산: 자기 standardPriceAtTransfer / Σ(variable standardPriceAtTransfer)
  //     (단, 표시상 일관성을 위해 자기 가액 / totalSalePrice도 가능 — 후자가 사용자 직관에 부합)
  const apportioned: BundledApportionedAsset[] = assets.map((a, i) => {
    const isFixed = a.fixedSalePrice !== undefined;
    const ratio = totalSalePrice > 0 ? allocatedSales[i] / totalSalePrice : 0;
    return {
      assetId: a.assetId,
      assetLabel: a.assetLabel,
      assetKind: a.assetKind,
      allocatedSalePrice: allocatedSales[i],
      allocatedAcquisitionPrice: allocatedAcqs[i],
      allocatedExpenses: allocatedExpenses[i],
      displayRatio: Math.round(ratio * 10000) / 10000,
      standardPriceAtTransfer: a.standardPriceAtTransfer,
      standardPriceAtAcquisition: a.standardPriceAtAcquisition,
      saleMode: isFixed ? "actual" : "apportioned",
    };
  });

  // ── Step 7: 합계 일치 검증 (방어적) ────────────
  const sumAllocated = apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0);
  if (sumAllocated !== totalSalePrice) {
    warnings.push(
      `안분 합계 불일치: sum=${sumAllocated}, total=${totalSalePrice} (말단 보정 실패 — 버그 가능성)`,
    );
  }

  // residualAbsorbedBy: variable 자산이 있으면 그 말단, 없으면 null (모두 fixed)
  const residualAbsorbedBy =
    variableIndices.length > 0
      ? assets[variableIndices[variableIndices.length - 1]].assetId
      : null;

  return {
    apportioned,
    totalStandardAtTransfer,
    residualAbsorbedBy,
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
    fixedSalePrice?: number;
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
    fixedSalePrice: options?.fixedSalePrice,
  };
}
