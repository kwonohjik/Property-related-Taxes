/**
 * variants/index.ts — pickBodyVariant + re-export
 *
 * Plan estate-card-followup-phase2 §3.2·Design §4.2
 * 순환 의존 회피: 본 모듈만 variant 컴포넌트를 import. helpers는 컴포넌트 import 0.
 */

import type { ComponentType } from "react";
import { EstateBodySimple } from "./EstateBodySimple";
import { EstateBodyRealEstate } from "./EstateBodyRealEstate";
import { EstateBodyDeposit } from "./EstateBodyDeposit";
import { EstateBodySuperficies } from "./EstateBodySuperficies";
import { EstateBodyIntangibleIp } from "./EstateBodyIntangibleIp";
import { EstateBodyFinancial } from "./EstateBodyFinancial";
import { EstateBodyReceivable } from "./EstateBodyReceivable";
import { EstateBodyConvertibleBond } from "./EstateBodyConvertibleBond";
import { EstateBodyTrustBenefit } from "./EstateBodyTrustBenefit";
import { EstateBodyPeriodicPayment } from "./EstateBodyPeriodicPayment";
import { EstateBodyCryptoAsset } from "./EstateBodyCryptoAsset";
import { assertNever } from "./EstateBodyHelpers";
import type { SupportedCategory, VariantBodyProps } from "./types";

export {
  EstateBodySimple,
  EstateBodyRealEstate,
  EstateBodyDeposit,
  EstateBodySuperficies,
  EstateBodyIntangibleIp,
  EstateBodyFinancial,
  EstateBodyReceivable,
  EstateBodyConvertibleBond,
  EstateBodyTrustBenefit,
  EstateBodyPeriodicPayment,
  EstateBodyCryptoAsset,
};
export type { SupportedCategory, VariantBodyProps };

/**
 * SupportedCategory를 variant 컴포넌트로 매핑.
 * exhaustive switch — 신규 카테고리 추가 시 컴파일러가 차단 (assertNever).
 */
export function pickBodyVariant(
  category: SupportedCategory,
): ComponentType<VariantBodyProps> {
  switch (category) {
    case "real_estate_land":
    case "real_estate_building":
    case "real_estate_apartment":
      return EstateBodyRealEstate;
    case "deposit":
      return EstateBodyDeposit;
    case "superficies":
      return EstateBodySuperficies;
    case "intangible_ip":
      return EstateBodyIntangibleIp;
    case "receivable":
      return EstateBodyReceivable;
    case "convertible_bond":
      return EstateBodyConvertibleBond;
    case "trust_benefit":
      return EstateBodyTrustBenefit;
    case "periodic_payment":
      return EstateBodyPeriodicPayment;
    case "crypto_asset":
      return EstateBodyCryptoAsset;
    case "financial":
      return EstateBodyFinancial;
    case "cash":
    case "other":
      return EstateBodySimple;
  }
  // 도달 불가 — TypeScript 추론을 위한 명시 (Plan I-P2-4 정합)
  return assertNever(category as never);
}
