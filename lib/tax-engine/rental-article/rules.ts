/**
 * §167조의3①2호 목별 판정 상수·룩업 — §155⑳·다주택 중과 단일 소스 (Phase 2 C1).
 *
 * cap·의무기간·경계일을 두 feature가 각자 하드코딩하던 것을 본 파일로 단일화.
 * (이전: rental-housing-exception/eligibility.ts + multi-house-surcharge-count.ts 이중 정의 → F5 divergence 원인.)
 */

import type { SharedRentalArticle } from "./types";

/** 목별 판정 경계일 (getTime() 캐시) */
export const RA_CUT = {
  Y2018_04_02: new Date("2018-04-02").getTime(), // 가·다목 등록 상한
  Y2020_07_11: new Date("2020-07-11").getTime(), // 매입 장기 아파트 제한 개시
  Y2020_08_18: new Date("2020-08-18").getTime(), // 마·바 의무기간 8→10년
  Y2025_02_28: new Date("2025-02-28").getTime(), // 바목 cap 6억→9억 (다주택 tested·MCP amendment_track 미확인 — 확인 필요)
  Y2025_06_04: new Date("2025-06-04").getTime(), // 아·자 단기 6년 신설
} as const;

/**
 * 목·지역·등록기준일별 기준시가 상한(원).
 * @param isCapital 수도권 여부
 * @param effRegTs  등록기준일 getTime() = max(세무서, 지자체). 바목 6억/9억 경계 판정용.
 *
 * 가/마/구법: 6억(수도권)·3억 | 나/라: 취득당시 3억(지역무관) | 다/자: 6억 | 바: 6억(→2025.2.28↑ 9억) | 아: 4억(수도권)·2억.
 */
export function rentalStdPriceCap(
  article: SharedRentalArticle,
  isCapital: boolean,
  effRegTs: number,
): number {
  switch (article) {
    case "가":
    case "마":
    case "구법":
      return isCapital ? 600_000_000 : 300_000_000;
    case "나":
    case "라":
      return 300_000_000; // 취득당시 3억 (지역무관)
    case "다":
    case "자":
      return 600_000_000;
    case "바":
      // F5: 2025.2.28 이후 등록분 9억, 이전 6억 (다주택 checkRentalType_F 정합)
      return effRegTs >= RA_CUT.Y2025_02_28 ? 900_000_000 : 600_000_000;
    case "아":
      return isCapital ? 400_000_000 : 200_000_000;
    default:
      return 600_000_000;
  }
}

/**
 * 목·등록기준일별 의무임대기간(년).
 * 가/나/다/라/구법: 5 | 마/바: ≤2020.8.17 준용 8·이후 10 | 아/자: 6.
 */
export function rentalRequiredYears(article: SharedRentalArticle, effRegTs: number): number {
  switch (article) {
    case "가":
    case "나":
    case "다":
    case "라":
    case "구법":
      return 5;
    case "아":
    case "자":
      return 6;
    case "마":
    case "바":
      return effRegTs < RA_CUT.Y2020_08_18 ? 8 : 10;
    default:
      return 10;
  }
}
