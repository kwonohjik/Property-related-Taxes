/**
 * 무조건 사업용 토지 의제 (§168-14 ③)
 *
 * PDF p.1697 "기준에 관계없이 사업용 토지로 보는 경우" — 해당 시 기간·지역·면적 기준
 * 모두 건너뛰고 사업용 확정.
 *
 * 현행법 §168-14 ③ 본조 + 레거시 플래그(이농·공장인접) 유지.
 */

import { addYears } from "date-fns";
import type {
  LandCategoryGroup,
  NonBusinessLandInput,
  UnconditionalExemptionReason,
} from "./types";
import { isUrbanForFarmland } from "./urban-area";

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
        legalBasis: "시행령 §168조의14 ③ 1호",
      };
    }
  }

  // ③2호: 2006.12.31 이전 20년 이상 소유 + 2009.12.31까지 양도 (농·임·목)
  if (u.ownedOver20YearsBefore2007 && isAgriLike && transferDate <= TRANSFER_CUTOFF) {
    return {
      isExempt: true,
      reason: "long_owned_20years",
      detail: "2006.12.31 이전 20년 이상 소유 + 2009.12.31까지 양도",
      legalBasis: "시행령 §168조의14 ③ 2호",
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
        legalBasis: "시행령 §168조의14 ③ 1의2호",
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
        legalBasis: "시행령 §168조의14 ③ 3호 가목",
      };
    }
    // 5년 전 취득 기준 (2021 개정 현행 단일 기준)
    const boundary5y = addYears(u.publicNoticeDate, -5);
    if (input.acquisitionDate <= boundary5y) {
      return {
        isExempt: true,
        reason: "public_expropriation",
        detail: `공익사업 협의매수·수용 — 고시일 ${u.publicNoticeDate.toISOString().slice(0, 10)} 5년 이전 취득`,
        legalBasis: "시행령 §168조의14 ③ 3호 나목",
      };
    }
  }

  // ③4호: 도시지역 內 농지 중 종중(2005.12.31 이전) 또는 상속 5년 이내 양도
  // (농지 나목 도시지역 예외 경로)
  if (u.isUrbanFarmlandJongjoongOrInherited && categoryGroup === "farmland") {
    return {
      isExempt: true,
      reason: "jongjoong_or_inherit_urban_farmland",
      detail: "도시지역 內 농지 중 종중(2005.12.31 이전 취득) 또는 상속 5년 이내 양도",
      legalBasis: "시행령 §168조의14 ③ 4호",
    };
  }

  // 레거시: 공장인접 토지 (소유자 요구 매수) — 현행 §168-14 ③ 미명시, 보상법 연계 판례 반영
  if (u.isFactoryAdjacent) {
    return {
      isExempt: true,
      reason: "factory_adjacent",
      detail: "공장 인접 토지 — 소유자 요구에 의한 매수 (보상법 연계)",
      legalBasis: "공익사업법 연계 (레거시)",
    };
  }

  // 레거시: 이농 (농지, 2006.12.31 이전 이농 + 2009.12.31까지 양도)
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
      legalBasis: "구법 이농 조항 (레거시)",
    };
  }

  // 레거시: 종중 소유 2005.12.31 이전 취득 (농·임·목)
  if (u.isJongjoongOwned && u.jongjoongAcquisitionDate && isAgriLike) {
    if (u.jongjoongAcquisitionDate <= JONGJOONG_CUTOFF) {
      return {
        isExempt: true,
        reason: "jongjoong_owned",
        detail: `종중 소유 — 2005.12.31 이전 취득(${u.jongjoongAcquisitionDate.toISOString().slice(0, 10)})`,
        legalBasis: "시행령 §168조의14 ③ 4호 가목 · §168-8 ③ 6호 등",
      };
    }
  }

  return { isExempt: false, reason: "none", detail: "" };
}
