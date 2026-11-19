/**
 * NBL2611-V6-D — 기타토지 «호»·«재산세 분류»의 **런타임 값 목록** (⑫ Zod enum의 단일 소스).
 *
 * 종전 Zod는 두 칸을 `z.string()`으로 받았고 매퍼는 `as OtherLandUsage[...]`로 단언만 했다. 오타·미지원 값("foo")은
 * 검증 없이 엔진까지 가서, 재산세 분류는 `!== "comprehensive"` 분기를 타 **비종합합산(사업용 쪽)** 으로 읽혔다(침묵 과소).
 * 타입만 있던 엔진 union을 값으로 내려 Zod가 같은 목록을 쓰게 한다. 새 호·분류가 union에 생기면 아래 가드가
 * 컴파일 오류가 되어 이 목록이 따라간다.
 */
import type { NblRelatedBusinessType, PropertyTaxType } from "./land-usage.types";

export const NBL_RELATED_BUSINESS_TYPE_VALUES = [
  "sports",
  "parking_attached",
  "parking_garage",
  "youth_training",
  "reserve_forces",
  "resort",
  "hatchang",
  "vacant_lot_1household",
  "etc_14호",
  "none",
] as const satisfies readonly NblRelatedBusinessType[];

export const NBL_PROPERTY_TAX_TYPE_VALUES = [
  "exempt",
  "separate",
  "special_sum",
  "comprehensive",
] as const satisfies readonly PropertyTaxType[];

// 커버리지 가드 — union에 있는데 목록에 없는 값이 있으면 `true`를 `false` 타입에 대입하는 오류가 난다.
const relatedCovered: Exclude<NblRelatedBusinessType, (typeof NBL_RELATED_BUSINESS_TYPE_VALUES)[number]> extends never
  ? true
  : false = true;
const taxTypeCovered: Exclude<PropertyTaxType, (typeof NBL_PROPERTY_TAX_TYPE_VALUES)[number]> extends never
  ? true
  : false = true;
void relatedCovered;
void taxTypeCovered;
