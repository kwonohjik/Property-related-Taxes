/**
 * 조정대상지역 **판정 헬퍼** — 순수 함수 (Layer 2 data).
 *
 * 데이터·타입은 `regulated-areas-data.ts`에 있다(2026-08-01 분리 — 800줄 정책).
 * 외부 import 경로는 **이 파일 하나**로 유지한다 — 아래에서 타입·데이터를 전부 re-export하므로
 * 기존 `import { REGULATED_REGIONS, isRegulatedByBjdCode } from ".../regulated-areas"`가 그대로 동작한다.
 *
 * 단일 진실(single source) 정책: 엔진(multi-house-surcharge)·클라이언트 판별이 이 모듈의
 * 데이터·헬퍼를 **공유**한다. 별도 매칭/판정 함수 재정의 금지(dual-truth 회피).
 */

import { expandSigunguAliases } from "@/lib/geo/sigungu-code-alias";

import type {
  RegulatedAreaDesignation,
  RegulatedAreaHistory,
} from "../types/multi-house-surcharge.types";

import { REGULATED_REGIONS } from "./regulated-areas-data";
import type { RegulatedRegion, RegulatedAreaJudgment } from "./regulated-areas-data";

// 분리 전 경로 호환 — 타입·데이터를 그대로 다시 내보낸다.
export { REGULATED_REGIONS } from "./regulated-areas-data";
export type {
  ExcludedSubArea,
  IncludedSubArea,
  RegulatedRegion,
  RegulatedAreaJudgment,
} from "./regulated-areas-data";

// ============================================================
// 판정 헬퍼 (순수 — 데이터 주입형)
// ============================================================

/** 특정 날짜에 활성(지정 유지 중)인 designation 반환. 없으면 null. */
function findActiveDesignation(
  designations: RegulatedAreaDesignation[],
  date: string,
): RegulatedAreaDesignation | null {
  for (const d of designations) {
    // 폐구간 포함 비교 — releasedDate = 마지막 규제일(효력발생일 −1). `<=` 유지(데이터 헤더 규약 참조).
    const active = d.designatedDate <= date && (d.releasedDate === null || date <= d.releasedDate);
    if (active) return d;
  }
  return null;
}

/** 날짜에 활성인 하위규칙(포함/제외)만 필터. */
function activeSubRules<T extends { appliesFrom?: string; appliesTo?: string }>(
  rules: T[] | undefined,
  date: string,
): T[] {
  return (rules ?? []).filter(
    (r) => (!r.appliesFrom || r.appliesFrom <= date) && (!r.appliesTo || date <= r.appliesTo),
  );
}

/**
 * 법정동코드 + 날짜 → 조정대상지역 판정 (순수, 데이터 주입).
 *
 * @param regions 조정대상지역 이력 데이터 (REGULATED_REGIONS 또는 테스트 fixture)
 * @param bjdCode 법정동코드. 10자리(시군구5+동5)면 읍면/지구 예외까지 정밀, 5자리면 시군구 단위만.
 * @param date    YYYY-MM-DD (양도일 또는 취득일)
 */
export function isRegulatedByBjdCodeIn(
  regions: RegulatedRegion[],
  bjdCode: string,
  date: string,
): RegulatedAreaJudgment {
  if (!bjdCode || !date) {
    return { isRegulated: false, confidence: "low", basis: "법정동코드 또는 날짜 누락" };
  }

  // 이 데이터는 지정 당시 기준이라 **구 코드**로 남아 있는 지역이 있다(광주 29·전남 46).
  //   주소검색 PNU는 현행(전남광주통합 12)을 주므로 구·신 코드를 모두 후보로 둔다 —
  //   행정구역 개편으로 코드만 바뀌었을 뿐 지정 이력이 붙은 지역 실체는 같다
  //   (계획서 sigungu-code-system-drift D-1 — 실측 −337,386,500 과소과세).
  const sigunguCandidates = expandSigunguAliases(bjdCode);
  const sigunguCode = bjdCode.slice(0, 5);
  const sidoCode = bjdCode.slice(0, 2);
  // 시군구(5자리) 매칭 우선 → 없으면 시도 전역(2자리) 폴백.
  // 시도 전역 지정은 서울(코드 "11")만 해당. 전역 해제기간에도 개별 지정으로 남는 구
  // (강남3구·용산)는 시군구 엔트리가 우선 매칭되어 정확히 처리된다.
  const region =
    regions.find((r) => sigunguCandidates.includes(r.code)) ??
    regions.find((r) => r.code === sidoCode);
  if (!region) {
    // 데이터 수록 시도 내 미매칭 = 진짜 미지정(high). 미수록 시도(데이터 범위 밖)는
    // "미지정"으로 단정하지 않고 low(직접 확인) — 주소 경로(isRegulatedByAddressIn)와 대칭.
    // 별칭 후보의 시도(구 코드 29·46 포함)까지 훑는다 — 그러지 않으면 통합 코드(12)가
    //   「데이터 미수록 시도」로 떨어져 confidence가 low가 된다(판정은 같아도 안내가 틀린다).
    const sidoCandidates = new Set(sigunguCandidates.map((c) => c.slice(0, 2)));
    const sidoCovered = regions.some((r) => sidoCandidates.has(r.code.slice(0, 2)));
    return sidoCovered
      ? { isRegulated: false, confidence: "high", basis: `${date} 기준 미지정 지역(${sigunguCode})` }
      : { isRegulated: false, confidence: "low", basis: `데이터 미수록 시도(${sidoCode}) — 직접 확인 필요` };
  }

  const active = findActiveDesignation(region.designations, date);
  if (!active) {
    return {
      isRegulated: false,
      confidence: "high",
      basis: `${region.name} — ${date} 기준 미지정(지정 이력 없음 또는 해제됨)`,
    };
  }

  // 10자리 코드: 포함 지구(includedSubCodes) / 읍면 예외(excludedSubCodes) 정밀 판정
  if (bjdCode.length >= 10) {
    // (1) 포함 목록: 해당 날짜에 활성인 "지구만 지정" 규칙이 있으면 그 안에서만 지정
    const included = activeSubRules(region.includedSubCodes, date);
    if (included.length > 0) {
      const hit = included.find((inc) => bjdCode.startsWith(inc.codePrefix));
      return hit
        ? {
            isRegulated: true,
            confidence: "high",
            basis: `${active.designatedDate} 고시 — ${region.name} ${hit.name} 지정`,
          }
        : {
            isRegulated: false,
            confidence: "high",
            basis: `${active.designatedDate} 고시 — ${region.name} 지정 지구 외 지역`,
          };
    }
    // (2) 제외 목록: 읍·면 제외
    const excluded = activeSubRules(region.excludedSubCodes, date).find((ex) =>
      bjdCode.startsWith(ex.codePrefix),
    );
    if (excluded) {
      return {
        isRegulated: false,
        confidence: "high",
        basis: `${active.designatedDate} 고시 — ${region.name} 중 ${excluded.name} 제외`,
      };
    }
    // coarseNote(예: 세종 예정지역 한함) — 전역 코드화이나 일부만 지정 → medium 강등
    return {
      isRegulated: true,
      confidence: region.coarseNote ? "medium" : "high",
      basis:
        `${active.designatedDate} 고시 — ${region.name} 지정` +
        (region.coarseNote ? ` (${region.coarseNote})` : ""),
    };
  }

  // 5자리만: 동·지구 단위 하위규칙이 있거나 coarseNote가 있으면 정밀 판정 불가 → confidence medium
  const hasSubRules =
    (region.excludedSubCodes?.length ?? 0) > 0 || (region.includedSubCodes?.length ?? 0) > 0;
  return {
    isRegulated: true,
    confidence: hasSubRules || region.coarseNote ? "medium" : "high",
    basis:
      `${active.designatedDate} 고시 — ${region.name} 지정` +
      (region.coarseNote
        ? ` (${region.coarseNote})`
        : hasSubRules
          ? " (동·지구 단위 지정/제외 — 10자리 코드 확인 필요)"
          : ""),
  };
}

/** REGULATED_REGIONS(모듈 데이터) 기준 판정 편의 래퍼. */
export function isRegulatedByBjdCode(bjdCode: string, date: string): RegulatedAreaJudgment {
  return isRegulatedByBjdCodeIn(REGULATED_REGIONS, bjdCode, date);
}

/**
 * 데이터에 수록된 시도명 집합 — 등장하는 region.name의 첫 어절(시도명).
 * 정적 리스트 대신 REGULATED_REGIONS에서 동적 도출 → 지방 데이터 추가 시 자동 반영(드리프트 0).
 * 수록 시도 내 미매칭은 "진짜 미지정"(high), 미수록 시도는 판정 불가(low, 직접 확인 유도).
 */
function coveredSidoNamesOf(regions: RegulatedRegion[]): Set<string> {
  return new Set(regions.map((r) => r.name.split(/\s+/)[0]));
}

/**
 * 시도·시군구명 + 날짜 → 조정대상지역 판정 (주소 기반, 순수·데이터 주입).
 *
 * 법정동코드(regionCode)가 없을 때의 보조 경로. 시군구명으로 매칭하므로
 * 읍·면·동/택지지구 예외는 판정 불가 → 하위규칙이 있는 시군구는 confidence "medium"
 * (정확한 동 단위 판정은 isRegulatedByBjdCodeIn 사용).
 *
 * @param regions 조정대상지역 이력 데이터 (REGULATED_REGIONS 또는 fixture)
 * @param sido    시도 전체명 (예: "서울특별시", "경기도")
 * @param sigungu 시군구명 (예: "강남구", "성남시 수정구"). 생략 시 시도 전역 엔트리만 조회.
 * @param date    YYYY-MM-DD (양도일 또는 취득일)
 */
export function isRegulatedByAddressIn(
  regions: RegulatedRegion[],
  sido: string,
  sigungu: string,
  date: string,
): RegulatedAreaJudgment {
  if (!sido || !date) {
    return { isRegulated: false, confidence: "low", basis: "시도 또는 날짜 누락" };
  }

  const fullName = sigungu ? `${sido} ${sigungu}` : sido;
  // 1. 시군구 정확 매칭 (일반구 포함: "경기도 성남시 수정구")
  //    2. 시도 전역 폴백 (서울 전역 "11" — name이 시도명과 동일)
  const region =
    regions.find((r) => r.name === fullName) ??
    regions.find((r) => r.code.length === 2 && r.name === sido);

  if (!region) {
    const covered = coveredSidoNamesOf(regions).has(sido);
    return {
      isRegulated: false,
      confidence: covered ? "high" : "low",
      basis: covered
        ? `${fullName} — ${date} 기준 미지정`
        : `${sido}는 데이터 미수록 — 직접 확인 필요`,
    };
  }

  const active = findActiveDesignation(region.designations, date);
  if (!active) {
    return {
      isRegulated: false,
      confidence: "high",
      basis: `${region.name} — ${date} 기준 미지정(지정 이력 없음 또는 해제됨)`,
    };
  }

  // 시군구명만으로는 동·지구 단위 예외(읍면 제외/택지지구 한정)를 판정할 수 없다.
  const hasSubRules =
    (region.excludedSubCodes?.length ?? 0) > 0 || (region.includedSubCodes?.length ?? 0) > 0;
  return {
    isRegulated: true,
    confidence: hasSubRules ? "medium" : "high",
    basis:
      `${active.designatedDate} 고시 — ${region.name} 지정` +
      (hasSubRules ? " (동·지구 단위 지정/제외 — 정확한 소재지 확인 필요)" : ""),
  };
}

/** REGULATED_REGIONS(모듈 데이터) 기준 주소 판정 편의 래퍼. */
export function isRegulatedByAddress(
  sido: string,
  sigungu: string,
  date: string,
): RegulatedAreaJudgment {
  return isRegulatedByAddressIn(REGULATED_REGIONS, sido, sigungu, date);
}

// ============================================================
// 엔진 주입용 변환 (RegulatedAreaHistory)
// ============================================================

/**
 * 정적 데이터 → 엔진(multi-house-surcharge) 주입용 RegulatedAreaHistory 변환.
 * 하위규칙(included/excluded)은 엔진 스키마에 없으므로 code/name/designations만 추출.
 * (동·지구 단위 정밀 판정은 isRegulatedByBjdCode 단일 헬퍼에서 처리 — 엔진 연결 시 P3.)
 */
export function toRegulatedAreaHistoryFrom(regions: RegulatedRegion[]): RegulatedAreaHistory {
  return {
    type: "regulated_area_history",
    regions: regions.map((r) => ({
      code: r.code,
      name: r.name,
      designations: r.designations,
    })),
  };
}

/** REGULATED_REGIONS(모듈 데이터) 변환 편의 래퍼. */
export function toRegulatedAreaHistory(): RegulatedAreaHistory {
  return toRegulatedAreaHistoryFrom(REGULATED_REGIONS);
}

