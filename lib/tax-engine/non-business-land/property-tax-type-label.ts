/**
 * 재산세 과세 분류(`PropertyTaxType`)의 **한국어 라벨 단일 소스** — NBL2611-V10-K.
 *
 * 종전에는 판정 사유·단계 문구가 enum 원문(`separate`·`special_sum`·`comprehensive`)을 그대로 끼워 넣었고,
 * 입력 화면도 같은 매핑을 인라인 삼항으로 따로 들고 있었다. 엔진 문구와 입력 화면이 이 표 하나를 읽는다.
 * `satisfies Record<PropertyTaxType, string>`가 새 분류 추가 시 이 표의 누락을 컴파일 오류로 만든다.
 */
import type { PropertyTaxType } from "./land-usage.types";

export const PROPERTY_TAX_TYPE_LABEL = {
  exempt: "비과세·면제",
  separate: "별도합산",
  special_sum: "분리과세",
  comprehensive: "종합합산",
} as const satisfies Record<PropertyTaxType, string>;

export function propertyTaxTypeLabel(type: PropertyTaxType): string {
  return PROPERTY_TAX_TYPE_LABEL[type];
}
