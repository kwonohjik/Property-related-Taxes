/**
 * 국외 부동산 엔진이 입력에 던지는 검증 — 이름 붙인 함수 모음(**단일 소스**).
 *
 * 엔진(`calculate.ts`·`convert.ts`·`foreign-tax.ts`)과 API Zod(`lib/api/transfer-foreign-schema.ts` ⑩⑫)가 **같은 함수**를 부른다.
 * 한쪽에만 두면 API 직접 호출이 Zod를 통과하고 엔진에서 던지거나(500·미도달), 반대로 Zod만 막는 모순이 생긴다.
 * 메시지·`details.path`·코드는 엔진 anchor가 고정한 값이라 옮기기만 했다 — 바꾸지 않는다.
 */
import { format } from "../utc-date";
import { TaxCalculationError, TaxErrorCode } from "../tax-errors";
import {
  FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS,
  isForeignRealEstateSupportedTransferDate,
} from "../transfer-foreign-realestate-era";
import type { ForeignTaxMethod } from "./types";

/** 법 §118의2 본문 「계속 5년 이상」 */
export const FOREIGN_RE_MIN_RESIDENCE_YEARS = 5;

export const FOREIGN_RE_SUPPORTED_FROM = format(new Date(FOREIGN_RE_SUPPORT_FROM_TRANSFER_DATE_MS), "yyyy-MM-dd");

export function assertDomesticResidenceYears(years: number): void {
  if (!Number.isInteger(years) || years < 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "domesticResidenceYears: 0 이상의 정수여야 합니다", {
      path: "domesticResidenceYears",
      value: years,
    });
  }
}

export function assertAssetsPresent(count: number): void {
  if (count < 1) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "assets: 1건 이상이어야 합니다", { path: "assets", count });
  }
}

export function assertUniqueAssetIds(ids: readonly string[]): void {
  const dup = ids.findIndex((id, i) => ids.indexOf(id) !== i);
  if (dup >= 0) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `assets[${dup}].id: 자산 id가 겹칩니다`, {
      path: `assets[${dup}].id`,
      value: ids[dup],
    });
  }
}

/** 날짜 칸이 유효한 `Date`인지 — API는 Zod 단계에서 문자열을 `toOptionalDate`로 바꿔 넘긴다(잘못된 문자열은 undefined → 던짐). */
export function assertValidDate(d: unknown, path: string): asserts d is Date {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_DATE, `${path}: 유효한 날짜가 아닙니다`, { path });
  }
}

export function assertAcquisitionNotAfterTransfer(
  asset: { acquisitionDate: Date; transferDate: Date },
  index: number,
): void {
  if (asset.acquisitionDate.getTime() > asset.transferDate.getTime()) {
    const p = `assets[${index}]`;
    throw new TaxCalculationError(TaxErrorCode.INVALID_DATE, `${p}: 취득일이 양도일보다 늦습니다`, { path: p });
  }
}

export function assertSupportedTransferDate(transferDate: Date, index: number): void {
  if (!isForeignRealEstateSupportedTransferDate(transferDate)) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_DATE,
      `assets[${index}].transferDate: 양도일 ${FOREIGN_RE_SUPPORTED_FROM} 이후만 계산합니다`,
      { path: `assets[${index}].transferDate`, reason: "TRANSFER_DATE_BEFORE_SUPPORT_START", supportedFrom: FOREIGN_RE_SUPPORTED_FROM },
    );
  }
}

/** 같은 과세기간(소득세법 §5① 1월 1일~12월 31일 — UTC 달력) 확인 */
export function assertSameTaxYear(assets: readonly { transferDate: Date }[]): void {
  const year = assets[0].transferDate.getUTCFullYear();
  assets.forEach((a, i) => {
    if (a.transferDate.getUTCFullYear() !== year) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        `assets[${i}].transferDate: 한 번에 계산하는 자산은 같은 과세기간(양도일 연도)이어야 합니다 (${year}년과 ${a.transferDate.getUTCFullYear()}년)`,
        { path: `assets[${i}].transferDate`, reason: "TAX_YEAR_MISMATCH" },
      );
    }
  });
}

const FOREIGN_TAX_METHODS: readonly ForeignTaxMethod[] = ["credit", "expense"];

/** 법 §118의6① 두 방법 중 하나 */
export function assertForeignTaxMethod(method: unknown): void {
  if (!FOREIGN_TAX_METHODS.includes(method as ForeignTaxMethod)) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, "foreignTax.method: credit 또는 expense여야 합니다", {
      path: "foreignTax.method",
      value: method,
    });
  }
}

/** 외국납부세액 항목이 가리키는 자산이 같은 계산의 자산인지 */
export function assertForeignTaxAssetId(assetId: string, assetIds: readonly string[], itemPath: string): void {
  if (!assetIds.includes(assetId)) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, `${itemPath}.assetId: 같은 계산의 자산 id가 아닙니다`, {
      path: `${itemPath}.assetId`,
      value: assetId,
    });
  }
}
