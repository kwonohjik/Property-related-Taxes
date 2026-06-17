/**
 * 조정대상지역 판별 — 정적 단일 소스(`lib/tax-engine/data/regulated-areas.ts`) 위임 래퍼
 *
 * 양도소득세 중과·장기보유특별공제 배제·1세대1주택 거주요건 등 세법 적용을 위해,
 * 지정·해제 이력을 날짜별로 조회하여 양도일·취득일 기준 조정대상지역 여부를 반환한다.
 *
 * 판정 경로(정밀도 순):
 *   1. 법정동코드(regionCode, PNU 앞 10자리) → isRegulatedByBjdCode
 *      → 읍·면·동/택지지구 예외까지 정밀(high). 주소검색(Vworld)이 PNU를 제공할 때 사용.
 *   2. 주소 문자열 → isRegulatedByAddress (시군구명 매칭)
 *      → 동 예외 판정 불가(하위규칙 있는 시군구는 medium). regionCode 없을 때의 fallback.
 *
 * ⚠️ 구 스냅샷(SNAPSHOTS) 기반 판정은 제거됨. 데이터·매칭 로직은
 *    `lib/tax-engine/data/regulated-areas.ts`의 REGULATED_REGIONS 단일 소스로 통합(dual-truth 회피).
 */

import {
  isRegulatedByAddress,
  isRegulatedByBjdCode,
  type RegulatedAreaJudgment,
} from "@/lib/tax-engine/data/regulated-areas";

export type RegulatedAreaResult = RegulatedAreaJudgment;

/**
 * 주소에서 시도·시군구 추출 (간이 파서)
 * 입력: "서울특별시 강남구 테헤란로 123" → { sido: "서울특별시", sigungu: "강남구" }
 *       "경기도 성남시 수정구 ..."       → { sido: "경기도", sigungu: "성남시 수정구" }
 */
function parseAddressRegion(address: string): { sido: string; sigungu: string } | null {
  if (!address) return null;
  const parts = address.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const sido = parts[0];
  let sigungu = parts[1];

  // "성남시 수정구" 같은 일반구는 2-단어 시군구로 합침
  if (parts.length >= 3 && /^.+시$/.test(parts[1]) && /^.+구$/.test(parts[2])) {
    sigungu = `${parts[1]} ${parts[2]}`;
  }

  return { sido, sigungu };
}

/**
 * 특정 주소가 특정 날짜 기준 조정대상지역인지 판별 (주소 문자열 경로)
 * @param address 주소 (도로명 또는 지번)
 * @param date YYYY-MM-DD
 */
export function checkRegulatedArea(address: string, date: string): RegulatedAreaResult {
  if (!address || !date) {
    return { isRegulated: false, confidence: "low", basis: "주소 또는 날짜가 비어있음" };
  }

  const parsed = parseAddressRegion(address);
  if (!parsed) {
    return { isRegulated: false, confidence: "low", basis: "주소 파싱 실패" };
  }

  return isRegulatedByAddress(parsed.sido, parsed.sigungu, date);
}

/**
 * 법정동코드(PNU 앞 10자리) 기준 정밀 판별 — 읍·면·동/택지지구 예외까지 반영.
 * @param regionCode 법정동코드(10자리 권장, 5자리는 시군구 단위 medium)
 * @param date YYYY-MM-DD
 */
export function checkRegulatedAreaByCode(regionCode: string, date: string): RegulatedAreaResult {
  if (!regionCode || !date) {
    return { isRegulated: false, confidence: "low", basis: "법정동코드 또는 날짜가 비어있음" };
  }
  return isRegulatedByBjdCode(regionCode, date);
}
