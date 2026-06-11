/**
 * 장기보유특별공제·세율 보유기간 기산일 결정 (순수 함수)
 *
 * transfer-tax-finalize.ts에서 분리 (리뷰 Low #8 순환 import 해소, 2026-06-12).
 * rate-calc ↔ finalize 순환을 끊기 위해 입력만 의존하는 본 헬퍼를 독립 모듈로 둔다.
 * finalize.ts는 하위 호환을 위해 이 모듈을 re-export한다.
 */

import type { TransferTaxInput } from "./types/transfer.types";

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

  // 사례 35 — 주택→상가 용도변경 (기존)
  if (!input.houseToCommercialConversion) return input.acquisitionDate;
  if (!input.wasMultiHouseAtConversion) return input.acquisitionDate;
  return input.conversionDate ?? input.acquisitionDate;
}

/** 승계 세율 기산 기준 취득일 — resolveLTHDStartDate 위임 (rate-calc 사용) */
export function getEffectiveAcquisitionDate(input: TransferTaxInput): Date {
  return resolveLTHDStartDate(input);
}
