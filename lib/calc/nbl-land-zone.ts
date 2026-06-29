/**
 * 비사업용 토지(NBL) 자동조회 헬퍼 — vWorld 개별공시지가·용도지역(도시지역 여부)
 *
 * 토지가액(당해·직전) = 개별공시지가(원/㎡) × 면적 × 지분.
 * 도시편입일 자체는 vWorld가 제공하지 않으므로(토지이용계획 registDt는 실제
 * 고시일이 아닌 데이터 적재·갱신일) 자동입력하지 않고, 용도지역명으로
 * 도시지역 "여부"만 판정해 편입일 입력 보조 안내에 사용한다.
 */

export interface LandLookupResult {
  /** 개별공시지가 (원/㎡) */
  pricePerSqm: number;
  /** 적용 연도 (응답 stdrYear) */
  year: string;
  /** 용도지역명 (예: "일반상업지역") — vWorld 토지특성정보 prposArea1Nm */
  zoneName?: string;
}

/**
 * 국토계획법 용도지역 4분류 중 도시지역(주거·상업·공업·녹지) 여부.
 * 관리지역·농림지역·자연환경보전지역은 비도시지역.
 * 비도시 키워드를 먼저 배제해 "보전녹지지역"(녹지=도시) 등 충돌을 방지한다.
 */
export function isUrbanZone(zoneName: string): boolean {
  if (!zoneName) return false;
  if (/관리지역|농림지역|자연환경보전지역/.test(zoneName)) return false;
  return /주거|상업|공업|녹지/.test(zoneName);
}

/** 개별공시지가·용도지역 1회 조회 (standard-price land 프록시). */
export async function lookupLandPrice(jibun: string, year: string): Promise<LandLookupResult> {
  const params = new URLSearchParams({ jibun, propertyType: "land", year });
  const res = await fetch(`/api/address/standard-price?${params}`);
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message ?? "조회 실패");
  }
  const price = Number(json.price) || 0;
  if (price <= 0) throw new Error(`${year}년 공시지가 없음`);
  return {
    pricePerSqm: price,
    year: String(json.year ?? year),
    zoneName: typeof json.zoneName === "string" ? json.zoneName : undefined,
  };
}
