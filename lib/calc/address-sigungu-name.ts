/**
 * 주소 문자열(지번·도로명)에서 "시·도 + 시·군·구" 읽기 이름을 추출.
 *
 * 시군구 코드 테이블(sigungu-codes.ts)이 전국 250여 개 중 일부만 담고 있어
 * lookupSigungu(code)?.name 이 다수 시군구에서 undefined가 되는 문제를 우회한다.
 * 주소검색(Vworld) 결과 문자열에는 항상 읽기 가능한 시·군·구가 포함되므로,
 * 표시용 이름은 테이블 대신 이 함수로 파싱한다. (코드·좌표는 별도로 저장·판정에 사용)
 *
 * 예:
 *  "경상남도 거제시 장승포동 24"   → "경상남도 거제시"
 *  "경상남도 창원시 성산구 …"      → "경상남도 창원시 성산구"
 *  "서울특별시 종로구 세종로 1"    → "서울특별시 종로구"
 *  "세종특별자치시 한누리대로 …"   → "세종특별자치시"
 */
export function extractSidoSigunguName(address: string | undefined | null): string {
  if (!address) return "";
  const tokens = address.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "";

  const sido = tokens[0];
  // 세종특별자치시는 시·군·구 레벨이 없다 (단일 계층).
  if (sido === "세종특별자치시") return sido;

  let sigungu = "";
  for (const t of tokens.slice(1)) {
    if (/(시|군|구)$/.test(t)) {
      sigungu = sigungu ? `${sigungu} ${t}` : t;
      // "…시" 뒤에 자치구가 따라오는 경우(창원시 성산구·수원시 팔달구) 계속 이어붙인다.
      if (/시$/.test(t)) continue;
      break; // "…군"·"…구"에서 종료
    }
    if (sigungu) break; // 시군구를 이미 잡았고 다음이 읍·면·동이면 종료
  }

  return sigungu ? `${sido} ${sigungu}` : sido;
}
