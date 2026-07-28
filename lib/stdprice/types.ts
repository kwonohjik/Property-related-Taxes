/**
 * 상업용건물·오피스텔 기준시가 파티션 데이터 타입 — 빌드 스크립트와 조회 계층의 **단일 진실**.
 *
 * `scripts/build-commercial-stdprice-helpers.ts`(생산)와 `lib/stdprice/load-partition.ts`(소비)가
 * 같은 타입을 쓰도록 여기 한 곳에만 선언한다.
 *
 * 설계: docs/02-design/features/commercial-officetel-standard-price-lookup.engine.design.md §3-1
 */

/**
 * 파티션에 저장되는 물건(호) 1건.
 * 필드명을 1~2자로 줄인 것은 26,458,783행 × 13필드의 JSON 키 반복 비용 때문이다.
 */
export interface StdPriceUnit {
  b: string; // 법정동코드 10자리
  s: string; // 특수지코드 — "0"=일반 "1"=산 "2"~"9" "A" ★ number 금지 ("A" 실재)
  bn: number; // 번지(본번)
  jn: number; // 호(부번)
  nm: string; // 건물명(상가건물블록주소) ★ 물건 키 구성요소
  dg: string; // 동(상가건물동주소)
  fc: 1 | 4 | 5; // 층구분 1=지하 4=지상 5=옥탑 ★ 물건 키 구성요소
  fl: string; // 층
  ho: string; // 호수
  p: number; // 고시가격 원/㎡
  ea: number; // 전용면적 ㎡
  sa: number; // 공유면적 ㎡
  k: 1 | 2 | 3; // 건물구분 1=상가 2=오피스텔 3=복합건물
}

export interface StdPriceNotice {
  date: string;
  /** 파싱 성공 행수 (원본 대조 기준) */
  rows: number;
  /** 완전중복 제거 후 실제 저장 행수 */
  storedRows: number;
  sigunguCount: number;
  /**
   * 해당 고시일자에 **실제 고시된** 시군구 5자리 목록.
   * 고시 대상 지역은 해마다 다르다 — 2022년까지는 특별·광역시+세종+경기(41)뿐이고
   * 2023년부터 전국으로 확대됐다. 이 목록이 "지역 미고시"(정상)와 "변환 결손"(장애)을 가른다.
   */
  sigungus: string[];
  coverage: "full" | "partial";
  adopted: string[];
  superseded?: string[];
  repairs: { hoRestored: number };
  skippedRows: number;
  unjoinableParcelRows: number;
  /** 키·가격·면적까지 전부 동일해 제거된 행 수 */
  duplicateKeyRows: number;
  /** 키는 같은데 가격·면적이 다른 키 수 — 행은 전부 보존된다 */
  conflictingKeyCount: number;
}

export interface StdPriceManifest {
  generatedAt: string;
  totalRows: number;
  notices: StdPriceNotice[];
}

export const FLOOR_CLASS_LABEL: Record<1 | 4 | 5, "지하" | "지상" | "옥탑"> = {
  1: "지하",
  4: "지상",
  5: "옥탑",
};

export const BUILDING_KIND_LABEL: Record<1 | 2 | 3, "상가" | "오피스텔" | "복합건물"> = {
  1: "상가",
  2: "오피스텔",
  3: "복합건물",
};

/**
 * 물건 키 — 건물명·층구분 **필수 포함**.
 * 층구분 제외 시 0.370%, 건물명 제외 시 0.225%가 충돌한다(2021 전수 실측).
 * 적선현대빌딩 1층 1호는 지상 5,898,000원 / 지하 2,485,000원으로 단가가 2.4배 다르다.
 */
export function stdPriceUnitKey(u: StdPriceUnit): string {
  return `${u.nm}|${u.dg}|${u.fc}|${u.fl}|${u.ho}`;
}
