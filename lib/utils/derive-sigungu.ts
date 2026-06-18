/**
 * deriveSigunguFromAddress — 주소 문자열에서 시군구만 추출.
 *
 * 토지 필지 시군구(jurisdiction) 자동 채움용. parseAddressRegion(조정대상지역 파서) 재사용.
 *   "서울특별시 송파구 ..." → "송파구"
 *   "경기도 성남시 수정구 ..." → "성남시 수정구" (일반구 2단어 결합)
 *   파싱 불가 → null (자동 채움 생략 → 사용자 수동 입력).
 */
import { parseAddressRegion } from "@/lib/regulated-area";

export function deriveSigunguFromAddress(address: string | undefined | null): string | null {
  if (!address) return null;
  return parseAddressRegion(address)?.sigungu ?? null;
}
