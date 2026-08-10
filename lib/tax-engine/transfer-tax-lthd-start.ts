/**
 * 장기보유특별공제·세율 보유기간 기산일 결정 (순수 함수)
 *
 * transfer-tax-finalize.ts에서 분리 (리뷰 Low #8 순환 import 해소, 2026-06-12).
 * rate-calc ↔ finalize 순환을 끊기 위해 입력만 의존하는 본 헬퍼를 독립 모듈로 둔다.
 * finalize.ts는 하위 호환을 위해 이 모듈을 re-export한다.
 */

import type { TransferTaxInput } from "./types/transfer.types";
import { isMultiHouseLthdExclusionEra } from "./data/lthd-multi-house-exclusion-era";

/** LTHD/세율 보유기간 기산일 (용도변경·승계조합원 신축APT 분기 반영) */
export function resolveLTHDStartDate(input: TransferTaxInput): Date {
  // 사례 48 — 승계조합원 신축APT 양도 (관리처분 후 입주권 승계).
  // 사전-2019-법령해석재산-0649 + 시행령 §162①4호 — 보유기간 기산일 = 준공일.
  if (
    input.propertyType === "redevelopment_apt" &&
    input.redevelopment?.isSuccessorMember === true &&
    input.redevelopment?.completionDate
  ) {
    return input.redevelopment.completionDate;
  }

  // 사례 35 — 주택→상가 용도변경.
  //
  // 「용도변경 전 기간이 §95② 괄호로 LTHD **배제 자산**이었다면 그 기간은 세지 않는다」는 규칙
  // (사전-2022-법규재산-0684·0881). 기간 분할이 아니라 **기산일 이동**이다.
  //
  // ⚠️ 판정 축은 「다주택이었나」가 **아니다** — 사전-2024-법규재산-0161(2024.5.3.)은
  //    "**용도변경일 당시 장기보유특별공제가 적용되는 주택**"이면 다주택이어도 기산일이
  //    **당초 취득일**이라고 명시한다. 축은 「**그때 배제 자산이었나**」이고, 그것은
  //    **용도변경 시점의 §95② 괄호**가 무엇을 배제했는지에 달렸다(연혁 leaf 참조).
  if (!input.houseToCommercialConversion) return input.acquisitionDate;
  if (!input.wasMultiHouseAtConversion) return input.acquisitionDate;
  const conversionDate = input.conversionDate;
  if (!conversionDate) return input.acquisitionDate;
  // 2012.1.1~2018.3.31 용도변경분: 그 시기 §95② 괄호에 다주택이 없었으므로 배제 자산일 수 없다.
  if (!isMultiHouseLthdExclusionEra(conversionDate)) return input.acquisitionDate;
  return conversionDate;
}

/** 승계 세율 기산 기준 취득일 — resolveLTHDStartDate 위임 (rate-calc 사용) */
export function getEffectiveAcquisitionDate(input: TransferTaxInput): Date {
  return resolveLTHDStartDate(input);
}
