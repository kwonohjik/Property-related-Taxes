/**
 * estate-item-valuation — EstateItem 평가액 도출 헬퍼
 *
 * Plan estate-card-followup §FU-1 사전 분리.
 * PropertyValuationForm·chip-config 등 다수 모듈이 공유.
 * 순환 의존 회피 + [[single-source-engine-helper]] 정책.
 */

import { parseISO } from "date-fns";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { computeStockValuation } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { evaluateEstateItem, resolveSuperficiesTenureYears } from "@/lib/tax-engine/property-valuation";

/**
 * 자산 카드별 "효과 평가액" — **부동산 엔진 단일 진실 위임**(estate-valuation-single-source).
 * TotalEstimatedValue·사이드바·chip-config·테이블·협의분할 배분 공통 사용.
 *
 * hybrid 위임 (2026-06-22, Do 환류):
 *   - 부동산(land/building/apartment): evaluateEstateItem(item).valuatedAmount로 위임 →
 *     §61⑤ 임대료환산·미임대(공실) 특례·§66 담보채권 하한·부수토지(경로 B)·§60 우선순위까지 엔진과
 *     동일 반영. 종전 경량 추정은 이들을 누락해 사이드바·칩·미리보기가 결과 화면(엔진값)과 어긋났음(dual-truth 해소).
 *   - 주식(listed/unlisted): §60 명시 시가/감정/매매 우선, 없으면 computeStockValuation(item, valuationDate).
 *     evaluateAllEstateItems는 valuationDate 인자가 없어 V2 evaluationDate fallback이 소실되므로 위임 안 함.
 *   - deposit: leaseDeposit (evaluateRentalConversion은 leaseDeposit<=0 throw → 직접 처리로 회피).
 *   - cash·financial·기타: §60 명시값 우선 chain (엔진 evaluateCash/Financial=marketValue만과 실무 정합).
 *
 * 설계 환류: 초안의 "전 카테고리 evaluateEstateItem 위임"은 financial·무효 category에서 §60 chain과 갈려
 *   기존 동작(전 category 공통 우선순위)을 깸 → **부동산만 위임**으로 축소(나머지 §60 chain 보존).
 */
/**
 * 지상권 잔존연수 합성 (§61③) — 엔진 단일진실 resolveSuperficiesTenureYears 위임.
 * override 우선, 미입력은 0(validate가 차단). 엔진 evaluateSuperficies가 소비할 superficiesRemainingYears 주입.
 * lib/calc 입력빌드(buildInput/buildGiftTaxInput)·사이드바 추정 공용. (mirror-pattern: store 미러링 아님 — 빌드시 합성)
 */
export function injectSuperficiesRemainingYears(
  item: EstateItem,
  valuationDateISO?: string,
): EstateItem {
  if (item.category !== "superficies") return item;
  if (item.superficiesRemainingYearsOverride != null) {
    // 음수/소수 override 정규화 — 엔진(Math.max(0,trunc))·validate(int positive)와 3중 일관
    return {
      ...item,
      superficiesRemainingYears: Math.max(0, Math.trunc(item.superficiesRemainingYearsOverride)),
    };
  }
  if (!item.superficiesSetDate || !valuationDateISO || item.superficiesStructureType == null) {
    return { ...item, superficiesRemainingYears: 0 }; // 미입력 — validate 차단
  }
  const setDate =
    typeof item.superficiesSetDate === "string"
      ? parseISO(item.superficiesSetDate)
      : item.superficiesSetDate;
  const years = resolveSuperficiesTenureYears({
    agreed: !!item.superficiesAgreed,
    structureType: item.superficiesStructureType,
    agreedYears: item.superficiesAgreedYears,
    setDate,
    valuationDate: parseISO(valuationDateISO),
  });
  return { ...item, superficiesRemainingYears: years };
}

export function computeEffectiveValuation(
  item: EstateItem,
  valuationDate?: string,
): number {
  // 부동산: 엔진 권위값 위임 (임대료환산·미임대·담보하한·부수토지·§60 우선순위 전부 반영)
  if (
    item.category === "real_estate_land" ||
    item.category === "real_estate_building" ||
    item.category === "real_estate_apartment"
  ) {
    try {
      return evaluateEstateItem(item).valuatedAmount;
    } catch {
      return 0; // 부분입력 throw 가드 — 입력 단계 추정
    }
  }
  // 주식: §60 시가 우선 후 §63 보충평가(valuationDate fallback 보존)
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    if (item.marketValue && item.marketValue > 0) return item.marketValue;
    if (item.appraisedValue && item.appraisedValue > 0) return item.appraisedValue;
    if (item.similarSalesValue && item.similarSalesValue > 0) return item.similarSalesValue;
    return computeStockValuation(item, valuationDate);
  }
  // 지상권: 잔존연수 합성 후 엔진 위임 (§61③, single-source — dual-truth 아님)
  if (item.category === "superficies") {
    try {
      return evaluateEstateItem(injectSuperficiesRemainingYears(item, valuationDate)).valuatedAmount;
    } catch {
      return 0; // 부분입력 가드
    }
  }
  // deposit: 임대보증금 액면
  if (item.category === "deposit") {
    return item.leaseDeposit ?? 0;
  }
  // cash·financial·기타: §60 명시값 우선 (marketValue > 감정 > 매매 > 기준시가)
  return (
    item.marketValue ?? item.appraisedValue ?? item.similarSalesValue ?? item.standardPrice ?? 0
  );
}
