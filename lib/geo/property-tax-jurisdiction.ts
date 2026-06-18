/**
 * resolvePropertyTaxJurisdiction — 재산세 관내 합산 단위(과세권자)로 정규화.
 *
 * 재산세는 과세권자(자치단체)별로 합산한다:
 *   - 서울특별시·광역시: 구가 자치구(자치단체) → 구 단위 ("송파구"·"강남구" 그대로)
 *   - 도 산하 일반시: 구는 행정구(일반구), 자치단체 아님 → 시 단위 ("용인시 기흥구" → "용인시")
 *   - 군: 군 단위 ("평창군" 그대로)
 *
 * 규칙: 일반구는 항상 "○○시 ○○구" 형태(주소 파서가 시+구 2단어 결합)이고,
 *   자치구는 단일 "○○구"(시도 stripped)다. 따라서 "시 구" → "시"로 축약하되,
 *   특별시/광역시/특별자치시 + 구(자치구) 조합은 가드로 제외(오축약 방지).
 *   ※ 비고: lib/geo/sigungu-code-list의 general_district(시 단위)·autonomous_district(구 단위)
 *     분류와 정합. 단 그 리스트는 전수 아님(샘플)이라 이름 규칙이 메커니즘.
 */
export function resolvePropertyTaxJurisdiction(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return s;
  const tokens = s.split(/\s+/);
  if (tokens.length < 2) return s;
  const last = tokens[tokens.length - 1];
  const prev = tokens[tokens.length - 2];
  // 마지막이 "구"이고 직전이 일반시("시"로 끝나되 특별시/광역시/특별자치시 아님)면 구를 떼어 시 단위로
  if (
    /구$/.test(last) &&
    /시$/.test(prev) &&
    !/(특별시|광역시|특별자치시)$/.test(prev)
  ) {
    return tokens.slice(0, -1).join(" ");
  }
  return s;
}
