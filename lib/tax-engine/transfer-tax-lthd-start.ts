/**
 * 장기보유특별공제·세율 보유기간 기산일 결정 (순수 함수)
 *
 * transfer-tax-finalize.ts에서 분리 (리뷰 Low #8 순환 import 해소, 2026-06-12).
 * rate-calc ↔ finalize 순환을 끊기 위해 입력만 의존하는 본 헬퍼를 독립 모듈로 둔다.
 * finalize.ts는 하위 호환을 위해 이 모듈을 re-export한다.
 */

import type { TransferTaxInput } from "./types/transfer.types";
import { isMultiHouseLthdExclusionEra } from "./data/lthd-multi-house-exclusion-era";
import { usesNbl2016LthdAnchor } from "./data/lthd-non-business-land-era";
import { NBL_LTHD_EXCLUSION_LIFTED } from "./data/lthd-non-business-land-era";

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
  /**
   * §95④ 단서 — 비사업용 토지 **2016.1.1. 기산** (2016년 양도분 한정).
   *
   * 2016.1.1. 개정(법률 제13558호)이 §95② 괄호에서 비사업용 토지를 빼면서 §95④에 단서를 함께
   * 신설했다: 「… 제104조의3에 따른 비사업용 토지로서 **2016년 1월 1일 이전에 취득**하여 보유하고
   * 있는 자산인 경우에는 **2016년 1월 1일부터 기산**한다」. 그 단서는 2017.1.1. 개정(법률 제14389호)에서
   * **삭제**됐다 — 창이 딱 1년이다(2016.1.25. 시행본·2017.3.28. 시행본 본문 실측).
   *
   * 종전에는 이 축이 아예 없어 2016년 양도분의 2016.1.1. 이전 취득 비사토에 **취득일 기산**
   * 공제율이 붙었다(H-3, 과소과세 방향). 판정 근거는 `data/lthd-non-business-land-era.ts`.
   *
   * ⚠️ 용도변경 축(아래)보다 **앞**이다 — 토지에는 주택→상가 용도변경이 성립하지 않아 두 축이
   *    겹치지 않지만, 겹치더라도 §95④ 단서가 명문이므로 우선한다.
   */
  if (input.isNonBusinessLand && usesNbl2016LthdAnchor(input.transferDate, input.acquisitionDate)) {
    return new Date(NBL_LTHD_EXCLUSION_LIFTED);
  }

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
