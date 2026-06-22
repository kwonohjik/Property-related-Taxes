/**
 * estate-item-vacancy-validate — §61⑤ 미임대(공실) 부분 입력 정합 검증 (상속·증여 공용).
 *
 * 1동 건물 일부 임대 시 미임대분 기준시가 합산용 3필드(totalBuildingArea·vacantBuildingArea·
 * vacantBuildingStandardPrice)의 모순 입력을 차단한다. inheritance-validate·gift-tax-form-validate
 * 양쪽이 본 단일 헬퍼를 재사용([[single-source-engine-helper]]).
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 미임대 입력 의사가 있을 때만 차단(V-9 단일 정의). "전체 건물 연면적만 입력 + 나머지 미입력"은
 * 미완성(특례 미적용)으로 통과. 반환: 오류 메시지 또는 null(통과).
 */
export function validateVacancyPortion(item: EstateItem): string | null {
  const area = item.vacantBuildingArea ?? 0;
  const buildingStd = item.vacantBuildingStandardPrice ?? 0;
  const total = item.totalBuildingArea ?? 0;
  const intends = area > 0 || buildingStd > 0; // 미임대 입력 의사
  if (!intends) return null;
  const who = item.name?.trim() || "건물";
  if (area > 0 && total <= 0) {
    return `${who}: 미임대(공실) 입력 시 전체 건물 연면적을 입력하세요.`;
  }
  if (buildingStd > 0 && area <= 0) {
    return `${who}: 미임대분 건물 기준시가 입력 시 미임대 건물 연면적을 입력하세요.`;
  }
  if (total > 0 && area > total) {
    return `${who}: 미임대 건물 연면적(${area}㎡)이 전체 건물 연면적(${total}㎡)을 초과할 수 없습니다.`;
  }
  return null;
}
