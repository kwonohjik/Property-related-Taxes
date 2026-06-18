/**
 * deriveSigunguFromAddress — 주소 문자열에서 시군구만 추출.
 *
 * 토지 필지 시군구(jurisdiction) 자동 채움용. parseAddressRegion(조정대상지역 파서) 재사용.
 *   "서울특별시 송파구 ..." → "송파구"
 *   "경기도 성남시 수정구 ..." → "성남시 수정구" (일반구 2단어 결합)
 *   파싱 불가/시군구 아님 → null (자동 채움 생략 → 사용자 수동 입력).
 *
 * ★ 반드시 도로명 주소(시도·시군구 포함)를 전달할 것. Vworld 지번(parcel)은 "석촌동 276-1"처럼
 *   시도·시군구가 없어 오추출되므로, 추출 결과가 시군구 형태(…구/군/시)인지 검증해 아니면 null.
 *   이로써 지번 번호("276-1")·도로명("가락로")·세종 단층제("한누리대로") 오추출을 차단한다.
 */
import { parseAddressRegion } from "@/lib/regulated-area";

export function deriveSigunguFromAddress(address: string | undefined | null): string | null {
  if (!address) return null;
  const sigungu = parseAddressRegion(address)?.sigungu;
  if (!sigungu) return null;
  // 시군구는 마지막 토큰이 구/군/시로 끝나야 한다 (오추출 방어)
  const lastToken = sigungu.split(/\s+/).pop() ?? "";
  if (!/[구군시]$/.test(lastToken)) return null;
  return sigungu;
}
