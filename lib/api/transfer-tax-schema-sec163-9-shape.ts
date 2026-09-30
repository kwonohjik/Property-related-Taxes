/**
 * ⑫ **§163⑨ 상속·증여 취득가액 운반 shape** — 주 자산(`propertyBaseShape`)과 컴패니언(`companionAssetSchema`)이
 * **같은 객체를 spread**한다 (2026-09-30 · CP-3).
 *
 * 「소득세법 시행령」 §163⑨ 본문·1호·2호: 상속·증여 자산의 취득가액은 기준일 현재 상증법 평가액(①)이고, 기준시가
 * 고시 前 취득이면 그 평가액과 §164④~⑦ 가액(②) 중 많은 금액이다. 의제취득일(1985.1.1.) 前이면 가목 확인 불가 시
 * ③(환산, 법 §97①1호 단서·§176조의2④)까지 간다.
 *
 * 🔴 종전에는 이 네 키가 **주 자산에만** 있었다. 컴패니언은 ⑤ UI(`CompanionAcqInheritanceBlock` →
 *    `InheritedAcquisitionDeemedSection`)가 같은 입력을 받고 ⑧도 같은 규칙으로 통과시키는데, ④·⑫·⑭ 어디에도 운반
 *    경로가 없어 ②만 입력하거나 ③(선언)으로 가면 **컴패니언 취득가액 0**이었다(CP-3a/b).
 *
 * ⚠️ 목록을 두 곳에 **복사하지 않는다** — 두 벌이면 한쪽에 필드가 늘 때 다른 쪽만 빠진다(`splitAcquisitionShape` 규약).
 */
import { inheritedAcquisitionSchema, inheritanceHouseValuationSchema } from "./transfer-tax-schema-acq-deemed";
import { commercialInheritanceValuationSchema } from "./transfer-tax-building-schemas";
import { pre1990LandSchema } from "./transfer-tax-schema-pre1990-land";

export const sec163_9AcquisitionShape = {
  /** 1990.8.30. 이전 취득 토지 등급환산(§164④) — 환산 모드와 §163⑨1호 ②가 함께 쓴다 */
  pre1990Land: pre1990LandSchema.optional(),
  /** 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨) — 의제취득일 전/후 분기 */
  inheritedAcquisition: inheritedAcquisitionSchema.optional(),
  /** 상속 주택 환산취득가 보조 입력 — 주택 + 상속개시일 < 2005-04-30 시 3-시점 합계 기준시가 자동 산출 */
  inheritedHouseValuation: inheritanceHouseValuationSchema.optional(),
  /** ⑫ 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 — 상가 + 상속개시일 < 2005-01-01 시 §163⑨2호 max */
  commercialInheritanceValuation: commercialInheritanceValuationSchema.optional(),
};
