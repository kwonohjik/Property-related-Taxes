/**
 * normalizeRestoredFormDates — sessionStorage/IndexedDB 복원 후 Date 정규화
 *
 * # 문제
 * sessionStorage는 JSON 직렬화를 사용한다. JSON.stringify → JSON.parse 경로에서
 * Date 객체가 ISO 문자열(예: "2023-12-31T00:00:00.000Z")로 역직렬화된다.
 * validateUnlistedStockV2(lib/calc/inheritance-validate.ts)는 `instanceof Date`
 * 검사를 수행하므로, string 타입의 날짜는 false → 진행 불가 오류 반환.
 *
 * # 수정 전 (H-5 버그)
 * InheritanceTaxForm.tsx 복원 직후:
 *   const parsed = JSON.parse(raw) as Partial<FormState>;
 *   setForm(prev => pruneOrphanHeirReferences({ ...prev, ...parsed }));
 * → fiscalYearEndDate 등이 string → "종료일 입력해야" 오류 → Step1→Step2 진행 불가
 *
 * # 수정 (1차 근본 수정)
 * 복원 직후 이 함수를 적용해 V2 비상장주식의 Date 필드를 Date 객체로 변환.
 *
 * # 정규화 대상 (UnlistedStockValuationInput 내 Date 타입 필드 전수 열거)
 *   - fiscalYears[0..2].fiscalYearEndDate (Date — 필수)
 *   - fiscalYears[0..2].fiscalYearStartDate (Date | undefined — 선택)
 *   - capitalChanges[].changeDate (Date | undefined — 선택)
 *   - businessStartDate (Date — 필수)
 *   - evaluationDate (Date — 필수)
 *
 * # 정책
 * - lib/api/date-coerce.ts 의 toOptionalDate 사용 (new Date(x) 직접 호출 금지)
 * - 정규화 실패(invalid 문자열) 시 undefined로 처리 — validate가 "미입력 오류"로 차단
 * - coerceDates()는 path 배열이 배열 요소를 지원하지만 FiscalYear처럼 고정 인덱스
 *   3개 중 "선택" 필드가 혼재하는 구조에는 수동 순회가 더 명확
 *
 * @param parsed JSON.parse로 복원된 폼 데이터 (Partial<FormState>)
 * @returns Date 필드가 정규화된 새 객체 (원본 불변)
 */

import { toOptionalDate } from "@/lib/api/date-coerce";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

interface FormLike {
  estateItems?: EstateItem[];
  stockItems?: EstateItem[];
  /** 증여세 폼 — gift-tax-form-shared.tsx FormState */
  giftItems?: EstateItem[];
  [key: string]: unknown;
}

/**
 * EstateItem 하나의 Date 필드를 정규화.
 * - unlistedStockValuationV2 Date 필드 (V2 비상장주식)
 * - burdenedGiftTransferTax Date 필드 (부담부증여 양도소득세)
 */
function normalizeEstateItemDates(item: EstateItem): EstateItem {
  let result: EstateItem = item;

  // unlistedStockValuationV2 Date 정규화
  const v2 = item.unlistedStockValuationV2;
  if (v2) {
    const normalizedFiscalYears = v2.fiscalYears.map((fy) => ({
      ...fy,
      fiscalYearEndDate: toOptionalDate(fy.fiscalYearEndDate) ?? fy.fiscalYearEndDate,
      ...(fy.fiscalYearStartDate !== undefined && fy.fiscalYearStartDate !== null
        ? { fiscalYearStartDate: toOptionalDate(fy.fiscalYearStartDate) }
        : {}),
    })) as typeof v2.fiscalYears;

    const normalizedCapitalChanges = v2.capitalChanges.map((cc) => ({
      ...cc,
      changeDate: toOptionalDate(cc.changeDate),
    }));

    result = {
      ...result,
      unlistedStockValuationV2: {
        ...v2,
        businessStartDate: toOptionalDate(v2.businessStartDate) ?? v2.businessStartDate,
        evaluationDate: toOptionalDate(v2.evaluationDate) ?? v2.evaluationDate,
        fiscalYears: normalizedFiscalYears,
        capitalChanges: normalizedCapitalChanges,
      },
    };
  }

  // burdenedGiftTransferTax Date 정규화 (부담부증여 양도소득세 함께 계산)
  // sessionStorage JSON.parse 후 acquisitionDate / temporaryTwoHouse 내 Date 필드가 string으로 도달
  const bgt = item.burdenedGiftTransferTax;
  if (bgt) {
    const normalizedAcq = toOptionalDate(bgt.acquisitionDate);
    // §114조의2 신축일(constructionDate)도 Date 필드 — sessionStorage 복원 시 string 도달 방지
    const normalizedConstruction = toOptionalDate(bgt.constructionDate);
    const normalizedBgt = {
      ...bgt,
      ...(normalizedAcq !== undefined ? { acquisitionDate: normalizedAcq } : {}),
      ...(normalizedConstruction !== undefined ? { constructionDate: normalizedConstruction } : {}),
      ...(bgt.temporaryTwoHouse !== undefined
        ? {
            temporaryTwoHouse: {
              previousAcquisitionDate:
                toOptionalDate(bgt.temporaryTwoHouse.previousAcquisitionDate) ??
                bgt.temporaryTwoHouse.previousAcquisitionDate,
              newAcquisitionDate:
                toOptionalDate(bgt.temporaryTwoHouse.newAcquisitionDate) ??
                bgt.temporaryTwoHouse.newAcquisitionDate,
            },
          }
        : {}),
    };
    result = { ...result, burdenedGiftTransferTax: normalizedBgt };
  }

  return result;
}

/**
 * sessionStorage 복원 직후 호출. 폼의 estateItems·stockItems·giftItems 내
 * Date 필드를 Date 객체로 복원.
 *
 * - V2 비상장주식: unlistedStockValuationV2 Date 필드
 * - 부담부증여 양도소득세: burdenedGiftTransferTax.acquisitionDate / temporaryTwoHouse
 * - 다른 FormState 필드(deathDate 등)는 string 타입으로 정의되어 있으므로 변환 불필요.
 */
export function normalizeRestoredFormDates<T extends FormLike>(parsed: T): T {
  const estateItems = parsed.estateItems?.map(normalizeEstateItemDates);
  const stockItems = parsed.stockItems?.map(normalizeEstateItemDates);
  const giftItems = parsed.giftItems?.map(normalizeEstateItemDates);

  return {
    ...parsed,
    ...(estateItems !== undefined ? { estateItems } : {}),
    ...(stockItems !== undefined ? { stockItems } : {}),
    ...(giftItems !== undefined ? { giftItems } : {}),
  };
}
