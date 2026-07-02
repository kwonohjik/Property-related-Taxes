/**
 * 종합부동산세 API Zod 검증 실패 → 사용자 친화 한국어 메시지 변환.
 *
 * route.ts가 보내는 issues(path 보존)를 "주택 N · 항목명: 사유" 형태로 변환한다.
 * flatten().fieldErrors는 properties[] 배열의 인덱스(몇 번째 주택)를 잃어버리므로
 * issues(path 배열)를 사용해 위치를 복원한다.
 *
 * 사용처: lib/calc/comprehensive-api.ts (callComprehensiveApi 응답 처리)
 */

import { translateMessage } from "./transfer-tax-error-format";

/** Zod issue 한 건 (route.ts가 직렬화하여 전송) */
export interface ComprehensiveZodIssue {
  path: (string | number)[];
  message: string;
}

/** 배열 컨테이너 경로 → 한국어 단위 라벨 (인덱스와 결합하여 "주택 2") */
const CONTAINER_LABEL: Record<string, string> = {
  properties: "주택",
  landSeparate: "별도합산 토지",
  landAggregateParcels: "종합합산 토지 필지",
  landSeparateParcels: "별도합산 토지 필지",
};

/** 필드·중첩객체 경로 → 한국어 라벨 */
const FIELD_LABEL: Record<string, string> = {
  // 메인(기본 정보·세부담상한)
  isOneHouseOwner: "1세대 1주택자 여부",
  isJointOwnershipSpecialCase: "부부 공동명의 1주택 특례",
  assessmentYear: "과세연도",
  birthDate: "생년월일",
  acquisitionDate: "취득일",
  taxpayerType: "납세의무자 유형",
  corporateHousingType: "법인 세부 유형",
  previousYearTotalTax: "전년도 총세액(직접입력)",
  previousYearAuto: "직전연도 공시가격 자동계산",
  // 주택(properties[*])
  assessedValue: "공시가격",
  area: "전용면적",
  location: "수도권 여부",
  exclusionType: "합산배제 유형",
  section8para4Type: "§8④ 1세대1주택자 의제 특례 유형",
  reductionRate: "재산세 감면율",
  ownershipRatio: "공유지분율",
  propertyTaxAmount: "재산세 부과세액",
  priorAssessedValue: "직전연도 공시가격(세부담상한)",
  floorUnits: "다가구 층별 면적",
  newHouseAcquisitionDate: "신규주택 취득일",
  inheritanceOpenDate: "상속개시일",
  inheritanceShareRatio: "상속 지분율",
  // 중첩: 임대주택 합산배제(rentalInfo)
  rentalInfo: "임대주택 합산배제 정보",
  registrationType: "임대등록 유형",
  rentalRegistrationDate: "임대사업자 등록일",
  rentalStartDate: "임대개시일",
  currentRent: "현재 임대료",
  isInitialContract: "최초 계약 여부",
  isEupMyeonArea: "읍·면 지역 여부",
  // 중첩: 기타 합산배제(otherInfo)
  otherInfo: "기타 합산배제 정보",
  // 토지(landAggregate·landSeparate·필지)
  landAggregate: "종합합산 토지",
  totalOfficialValue: "공시지가 합산",
  propertyTaxBase: "재산세 과세표준",
  publicPrice: "공시지가(면적×단가)",
  officialPricePerSqm: "㎡당 공시지가",
  priorOfficialPricePerSqm: "직전연도 ㎡당 공시지가",
  jurisdiction: "시군구",
  shareRatio: "지분율",
};

/**
 * path 배열을 위치(location)와 실패 필드(field)로 분해.
 * 예: ["properties", 1, "priorAssessedValue"]
 *   → { location: "주택 2", field: "직전연도 공시가격(세부담상한)" }
 * 예: ["properties", 0, "rentalInfo", "currentRent"]
 *   → { location: "주택 1 · 임대주택 합산배제 정보", field: "현재 임대료" }
 */
function describePath(path: (string | number)[]): { location: string; field: string } {
  const locs: string[] = [];
  let field = "";
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (typeof seg === "number") {
      // 숫자 인덱스 → 직전 컨테이너 라벨에 "N+1"을 결합 ("주택 2")
      const prevKey = String(path[i - 1] ?? "");
      const base = CONTAINER_LABEL[prevKey] ?? FIELD_LABEL[prevKey] ?? (prevKey || "항목");
      if (locs.length > 0) {
        locs[locs.length - 1] = `${base} ${seg + 1}`;
      } else {
        locs.push(`${base} ${seg + 1}`);
      }
    } else if (i === path.length - 1) {
      // 마지막 문자열 세그먼트 = 실패 필드
      field = FIELD_LABEL[seg] ?? seg;
    } else {
      // 중간 문자열 = 컨테이너/중첩 객체 (다음이 숫자면 인덱스 분기가 덮어씀)
      locs.push(FIELD_LABEL[seg] ?? CONTAINER_LABEL[seg] ?? seg);
    }
  }
  return { location: locs.join(" · "), field };
}

/**
 * issues 배열을 사용자 친화 멀티라인 한국어 메시지로 변환.
 *
 * @param issues route.ts가 보낸 Zod issues (path + message)
 * @param baseMessage 상위 안내 (예: "입력값이 올바르지 않습니다.")
 * @returns 줄바꿈으로 구분된 위치별 오류 목록
 */
export function formatComprehensiveErrors(
  issues: ComprehensiveZodIssue[],
  baseMessage: string,
): string {
  const lines: string[] = [baseMessage];
  const seen = new Set<string>();
  for (const issue of issues) {
    const { location, field } = describePath(issue.path ?? []);
    const msg = translateMessage(issue.message);
    const where = location && field ? `${location} · ${field}` : location || field;
    const line = where ? `• ${where}: ${msg}` : `• ${msg}`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines.join("\n");
}
