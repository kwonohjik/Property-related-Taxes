/**
 * 양도세 API fieldErrors 한국어 변환.
 *
 * Zod 스키마 검증 실패 시 영문 필드 경로·메시지를 사용자가 이해 가능한
 * 한국어 메시지로 변환한다.
 *
 * 사용처: lib/calc/transfer-tax-api.ts (callTransferAPI 응답 처리)
 */

/** 필드 경로 → 한국어 라벨 매핑 */
const FIELD_LABEL: Record<string, string> = {
  // 기본 거래
  transferDate: "양도일자",
  acquisitionDate: "취득일자",
  transferPrice: "양도가액",
  acquisitionPrice: "취득가액",

  // 환산취득가
  useEstimatedAcquisition: "환산취득가 사용",
  standardPriceAtAcquisition: "취득시 기준시가",
  standardPriceAtTransfer: "양도시 기준시가",

  // 거주·세대
  residencePeriodMonths: "거주기간",
  isOneHousehold: "1세대 여부",
  householdHousingCount: "세대 보유 주택 수",

  // 기타
  isRegulatedArea: "조정대상지역 여부",
  wasRegulatedAtAcquisition: "취득시 조정대상지역 여부",
  isUnregistered: "미등기 여부",
  isNonBusinessLand: "비사업용 토지 여부",
  acquisitionCause: "취득 원인",
  decedentAcquisitionDate: "피상속인 취득일",
  donorAcquisitionDate: "증여자 취득일",
  expenses: "필요경비",
  capitalExpenditure: "자본적 지출",
  transferExpense: "양도비",

  // 토지/건물 분리
  landAcquisitionDate: "토지 취득일",
  selfOwns: "본인 소유 부분",
  landSplitMode: "토지/건물 분리 방식",

  // PHD §164⑤
  "preHousingDisclosure.firstDisclosureDate": "최초 고시일",
  "preHousingDisclosure.firstDisclosureHousingPrice": "최초 고시 주택공시가격",
  "preHousingDisclosure.transferHousingPrice": "양도시 주택공시가격",
  "preHousingDisclosure.landArea": "토지 면적",
  "preHousingDisclosure.landPricePerSqmAtAcquisition": "취득시 토지 ㎡당 공시지가",
  "preHousingDisclosure.landPricePerSqmAtFirstDisclosure": "최초공시 토지 ㎡당 공시지가",
  "preHousingDisclosure.landPricePerSqmAtTransfer": "양도시 토지 ㎡당 공시지가",
  "preHousingDisclosure.buildingStdPriceAtAcquisition": "취득시 건물 기준시가",
  "preHousingDisclosure.buildingStdPriceAtFirstDisclosure": "최초공시 건물 기준시가",
  "preHousingDisclosure.buildingStdPriceAtTransfer": "양도시 건물 기준시가",

  // 신축·증축
  isSelfBuilt: "본인 신축·증축 여부",
  buildingType: "신축·증축 유형",
  constructionDate: "신축·증축 완공일",
  extensionFloorArea: "증축 바닥면적",

  // 1990 토지
  "pre1990Land.acquisitionDate": "1990 토지 취득일",
  "pre1990Land.gradeAtAcquisition": "1990 취득시 토지등급",

  // 검용주택
  "mixedUse.residentialFloorArea": "주거용 면적",
  "mixedUse.nonResidentialFloorArea": "비주거용 면적",
  "mixedUse.totalLandArea": "총 토지면적",
  "mixedUse.preHousingDisclosure.firstDisclosureDate": "검용주택 최초 고시일",
};

/** Zod 영문 메시지 → 한국어 변환 패턴 */
const MESSAGE_PATTERNS: { test: RegExp; replace: string | ((m: RegExpMatchArray) => string) }[] = [
  { test: /^Invalid ISO date$/i, replace: "유효한 날짜 형식이 아닙니다 (YYYY-MM-DD, 존재하는 날만 허용)" },
  { test: /^Invalid date$/i, replace: "유효한 날짜가 아닙니다" },
  { test: /^Required$/i, replace: "필수 입력입니다" },
  { test: /^Expected (\w+), received (\w+)$/i, replace: (m) => `예상 자료형 ${m[1]}, 입력값 ${m[2]}` },
  { test: /^Number must be greater than 0$/i, replace: "0보다 큰 수를 입력하세요" },
  { test: /^Number must be greater than or equal to 0$/i, replace: "0 이상의 수를 입력하세요" },
  { test: /^Number must be a (positive|non-negative) (integer|number)$/i, replace: "양의 숫자를 입력하세요" },
  { test: /^Expected number, received nan$/i, replace: "숫자를 입력하세요" },
  { test: /^String must contain at least 1 character/i, replace: "값을 입력하세요" },
  { test: /^Invalid input$/i, replace: "입력값이 유효하지 않습니다" },
];

/** 한 메시지를 한국어로 변환 */
function translateMessage(msg: string): string {
  for (const { test, replace } of MESSAGE_PATTERNS) {
    const match = msg.match(test);
    if (match) {
      return typeof replace === "function" ? replace(match) : replace;
    }
  }
  return msg; // 한국어 메시지(우리가 superRefine에 한국어로 작성한 것)는 그대로 통과
}

/** 필드 경로를 한국어 라벨로 변환 (없으면 원본 경로 반환) */
function translateField(field: string): string {
  if (FIELD_LABEL[field]) return FIELD_LABEL[field];
  // 인덱스 경로 정규화: companionAssets.0.transferPrice → companionAssets.transferPrice
  const normalized = field.replace(/\.\d+\./g, ".");
  if (FIELD_LABEL[normalized]) return FIELD_LABEL[normalized];
  return field;
}

/**
 * fieldErrors 객체를 사용자 친화적인 한국어 다중행 메시지로 변환.
 *
 * @param fieldErrors API 응답의 fieldErrors
 * @param baseMessage 상위 메시지 (예: "입력값이 올바르지 않습니다")
 * @returns 줄바꿈으로 구분된 한국어 오류 목록
 */
export function formatFieldErrors(
  fieldErrors: Record<string, string[]>,
  baseMessage: string,
): string {
  const lines: string[] = [baseMessage];
  for (const [field, msgs] of Object.entries(fieldErrors)) {
    const fieldLabel = translateField(field);
    for (const msg of msgs) {
      lines.push(`• ${fieldLabel}: ${translateMessage(msg)}`);
    }
  }
  return lines.join("\n");
}
