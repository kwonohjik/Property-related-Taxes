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
import { assertNever } from "./EstateBodyHelpers";
import type { SupportedCategory, VariantBodyProps } from "./types";

export { EstateBodySimple, EstateBodyRealEstate, EstateBodyDeposit, EstateBodySuperficies, EstateBodyIntangibleIp };
export type { SupportedCategory, VariantBodyProps };

/**
 * SupportedCategory 7종을 variant 3 타입으로 매핑.
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
    case "cash":
    case "financial":
    case "other":
      return EstateBodySimple;
  }
  // 도달 불가 — TypeScript 추론을 위한 명시 (Plan I-P2-4 정합)
  return assertNever(category as never);
}
