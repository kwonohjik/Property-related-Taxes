/**
 * 무조건 사업용 토지 의제 (§168-14 ③)
 *
 * PDF p.1697 "기준에 관계없이 사업용 토지로 보는 경우" — 해당 시 기간·지역·면적 기준
 * 모두 건너뛰고 사업용 확정.
 *
 * 현행법 §168-14③ 본조 + ③5호(재정경제부령 위임 → 시행규칙 §83의5④:
 * 1호 공장 오염피해 인접토지·2호 이농 농지)·종중 등.
 */

import { addYears } from "date-fns";
import type {
  LandCategoryGroup,
  NonBusinessLandInput,
  UnconditionalExemptionReason,
} from "./types";
import { isUrbanForFarmland } from "./urban-area";
import { NBL } from "../legal-codes/transfer-nbl";

export interface UnconditionalExemptionResult {
  isExempt: boolean;
  reason: UnconditionalExemptionReason;
  detail: string;
  /** 적용된 법령 조문 */
  legalBasis?: string;
}

/**
 * 7+1가지 무조건 의제 사유 순차 검토.
 * 해당 시 즉시 반환하여 상위 엔진이 사업용으로 확정.
 */
export function checkUnconditionalExemption(
  input: NonBusinessLandInput,
  categoryGroup: LandCategoryGroup,
): UnconditionalExemptionResult {
  const u = input.unconditionalExemption;
  if (!u) return { isExempt: false, reason: "none", detail: "" };

  const transferDate = input.transferDate;
  const INHERITANCE_CUTOFF = new Date("2006-12-31");
  const TRANSFER_CUTOFF = new Date("2009-12-31");
  const JONGJOONG_CUTOFF = new Date("2005-12-31");

  const isAgriLike =
    categoryGroup === "farmland" ||
    categoryGroup === "forest" ||
    categoryGroup === "pasture";

  // ③1호: 2006.12.31 이전 상속 + 2009.12.31까지 양도 (농·임·목)
  if (u.isInheritedBefore2007 && u.inheritanceDate && isAgriLike) {
    if (u.inheritanceDate <= INHERITANCE_CUTOFF && transferDate <= TRANSFER_CUTOFF) {
      return {
        isExempt: true,
        reason: "inheritance_before_2007",
        detail: `2006.12.31 이전 상속(${u.inheritanceDate.toISOString().slice(0, 10)}) + 2009.12.31까지 양도`,
        legalBasis: NBL.UNCONDITIONAL_INHERIT_BEFORE_2007,
      };
    }
  }

  // ③2호: 2006.12.31 이전 20년 이상 소유 + 2009.12.31까지 양도 (농·임·목)
  if (u.ownedOver20YearsBefore2007 && isAgriLike && transferDate <= TRANSFER_CUTOFF) {
    return {
      isExempt: true,
      reason: "long_owned_20years",
      detail: "2006.12.31 이전 20년 이상 소유 + 2009.12.31까지 양도",
      legalBasis: NBL.UNCONDITIONAL_LONG_OWNED_20Y,
    };
  }

  // ③1의2호: 직계존속·배우자 8년 재촌자경 상속·증여 (양도 당시 도시지역 제외)
  if (u.isAncestor8YearFarming && isAgriLike) {
    // 양도 당시 도시지역(주·상·공) 이면 의제 제외 (단, 녹지·개발제한 제외 = 녹지면 OK)
    const atUrban = isUrbanForFarmland(input.zoneType);
    if (!atUrban) {
      return {
        isExempt: true,
        reason: "ancestor_8year_farming",
        detail: "직계존속·배우자 8년 이상 재촌·자경(축산) 상속·증여",
        legalBasis: NBL.UNCONDITIONAL_ANCESTOR,
      };
    }
    // 도시지역이면 의제 제외 (주의: 여기서는 다음 판정으로 진행)
  }

  // ③3호: 공익사업법 협의매수·수용
  //   - 사업인정고시일 2006.12.31 이전
  //   - 취득일이 사업인정고시일부터 5년 이전
  if (u.isPublicExpropriation && u.publicNoticeDate) {
    const isBefore2007 = u.publicNoticeDate <= INHERITANCE_CUTOFF;
    if (isBefore2007) {
      return {
        isExempt: true,
        reason: "public_expropriation",
        detail: `공익사업 협의매수·수용 — 사업인정고시일 ${u.publicNoticeDate.toISOString().slice(0, 10)} (2006.12.31 이전)`,
        legalBasis: NBL.UNCONDITIONAL_PUBLIC_NOTICE_2006,
      };
    }
    // 5년 전 취득 기준 (2021 개정 현행 단일 기준)
    // 취득일 소급(시행령 §168의14③3호나목 괄호): 상속=피상속인 취득일 / §97의2① 이월과세=증여자 취득일.
    // 미제공 시 양수인 취득일(input.acquisitionDate=상속개시일/증여일) fallback.
    const acqDateForExpropriation = u.expropriationAcquisitionDate ?? input.acquisitionDate;
    const boundary5y = addYears(u.publicNoticeDate, -5);
    if (acqDateForExpropriation <= boundary5y) {
      return {
        isExempt: true,
        reason: "public_expropriation",
        detail: `공익사업 협의매수·수용 — 고시일 ${u.publicNoticeDate.toISOString().slice(0, 10)} 5년 이전 취득 (취득일 ${acqDateForExpropriation.toISOString().slice(0, 10)})`,
        legalBasis: NBL.UNCONDITIONAL_PUBLIC_ACQ_5Y,
      };
    }
  }

  /**
   * ③4호: 「법 제104조의3제1항제1호 **나목**에 해당하는 농지」 중
   *        가목 종중 소유(2005.12.31. 이전 취득) 또는 나목 상속(상속개시일부터 5년 이내 양도)
   *
   * 🔴 종전에는 `isUrbanFarmlandJongjoongOrInherited` **boolean 하나만** 보고 의제를 확정했다
   *    (E5-01·V4-b, 2026-09-02 코드리뷰). detail 문자열은 요건을 말하면서 **아무것도 검사하지
   *    않아** 요건 미달 토지까지 사업용으로 확정됐고(중과 전액 소실), 형제 분기(이농·레거시 종중)는
   *    같은 파일에서 날짜를 검증하고 있었으므로 이 분기만 예외였다.
   *
   *    누락 요건은 셋이다:
   *      1. 본문 — 법 §104의3①1호**나목** 대상, 즉 **도시지역 안의** 농지일 것
   *      2. 가목 — 종중 취득일 ≤ 2005.12.31.
   *      3. 나목 — 상속개시일부터 5년 이내 양도
   *    날짜 미입력은 의제 미성립으로 둔다(자동 fallback 금지 — ⑧이 토글 ON 시 날짜를 요구한다).
   */
  if (u.isUrbanFarmlandJongjoongOrInherited && categoryGroup === "farmland") {
    // 본문 요건 — 1호 나목은 도시지역(주·상·공) 안의 농지에만 적용된다.
    if (isUrbanForFarmland(input.zoneType)) {
      // 가목 — 종중 소유 (2005.12.31. 이전 취득)
      if (u.jongjoongAcquisitionDate && u.jongjoongAcquisitionDate <= JONGJOONG_CUTOFF) {
        return {
          isExempt: true,
          reason: "jongjoong_or_inherit_urban_farmland",
          detail: `도시지역 內 농지 — 종중 소유 2005.12.31 이전 취득(${u.jongjoongAcquisitionDate.toISOString().slice(0, 10)})`,
          legalBasis: NBL.UNCONDITIONAL_URBAN_FARMLAND_JONGJOONG,
        };
      }
      // 나목 — 상속개시일부터 5년 이내 양도
      if (u.inheritanceDate && transferDate <= addYears(u.inheritanceDate, 5)) {
        return {
          isExempt: true,
          reason: "jongjoong_or_inherit_urban_farmland",
          detail: `도시지역 內 농지 — 상속개시일(${u.inheritanceDate.toISOString().slice(0, 10)})부터 5년 이내 양도`,
          legalBasis: NBL.UNCONDITIONAL_URBAN_FARMLAND_INHERIT,
        };
      }
    }
    // 요건 미충족 — 의제하지 않고 지목별 판정으로 진행한다.
  }

  // 공장 오염피해 인접토지 (§168-14③5호 → 시행규칙 §83의5④1호):
  //   공장 가동 오염피해 인접토지로서 소유자 요구에 따라 취득한 공장용 부속토지의 인접토지.
  if (u.isFactoryAdjacent) {
    return {
      isExempt: true,
      reason: "factory_adjacent",
      detail: "공장 오염피해 인접토지 — 소유자 요구로 취득한 공장 부속토지의 인접토지",
      legalBasis: NBL.UNCONDITIONAL_FACTORY_ADJACENT,
    };
  }

  // 이농 농지 (§168-14③5호 → 시행규칙 §83의5④2호):
  //   2006.12.31 이전 이농한 자가 이농 당시 소유 농지를 2009.12.31까지 양도.
  if (
    u.isInong &&
    u.inongDate &&
    categoryGroup === "farmland" &&
    u.inongDate <= INHERITANCE_CUTOFF &&
    transferDate <= TRANSFER_CUTOFF
  ) {
    return {
      isExempt: true,
      reason: "inong",
      detail: `2006.12.31 이전 이농(${u.inongDate.toISOString().slice(0, 10)}) + 2009.12.31까지 양도`,
      legalBasis: NBL.UNCONDITIONAL_INONG,
    };
  }

  /**
   * 레거시: 종중 소유 2005.12.31 이전 취득 (농·임·목)
   *
   * 🔴 근거 조문은 **지목마다 다르다**(E5-05, 2026-09-02 코드리뷰). 종전에는 셋 다
   *    「§168조의14 ③ 4호 가목 · §168-8 ③ 6호 등」을 달았는데 둘 다 **농지 전용 조문**이라
   *    임야·목장 판정의 근거가 될 수 없었다 — 신고서·산출근거를 그대로 신뢰한 이용자가
   *    잘못된 근거를 제시하게 된다.
   */
  if (u.isJongjoongOwned && u.jongjoongAcquisitionDate && isAgriLike) {
    if (u.jongjoongAcquisitionDate <= JONGJOONG_CUTOFF) {
      const jongjoongBasis =
        categoryGroup === "forest"
          ? NBL.JONGJOONG_FOREST
          : categoryGroup === "pasture"
            ? NBL.JONGJOONG_PASTURE
            : NBL.JONGJOONG_FARMLAND;
      return {
        isExempt: true,
        reason: "jongjoong_owned",
        detail: `종중 소유 — 2005.12.31 이전 취득(${u.jongjoongAcquisitionDate.toISOString().slice(0, 10)})`,
        legalBasis: jongjoongBasis,
      };
    }
  }

  return { isExempt: false, reason: "none", detail: "" };
}
