/**
 * 주식 양도 — 가업상속공제 자산 취득가액 특례(소득세법 §97의2④) **입력 정합 술어** (3중 일치의 단일 소스)
 *
 * 계획서: docs/02-design/features/fb-97-2-4-fixes.plan.md §7.1·§7.4(⑧⑨⑩)·§7.7
 *
 * 엔진 진입 throw(`stock-family-business.ts`·`stock-family-business-lot.ts`)와 API ⑩ refine
 * (`lib/api/stock-transfer-tax-refines-family-business.ts`), 그리고 다음 PR의 ⑧ validate가 **같은 함수**를 부른다.
 * 어긋나면 「UI 통과 ↔ 서버 차단」 모순이 생기므로 규칙을 여기 한 곳에만 둔다.
 *
 * - 돌려주는 값은 **접두 없는 문구**(또는 null)다 — 엔진은 `가업상속공제(§97의2④) — ` 접두를 붙여 throw하고,
 *   Zod는 `가업상속공제 — ` 접두로 issue를 만든다.
 * - 매도 lot 배정 결과에 의존하는 검사(가업 lot이 어느 매도에 배정되는가 → 그 양도일의 법정량 시대)는
 *   배정 전에는 알 수 없어 여기에 없다 — 엔진(`fbSubLotCost`·`assertFbEraForSale`)이 throw한다.
 *
 * Layer 2 (Pure Engine): DB·Date 변환 없음. 날짜는 호출부가 Date로 넘긴다(없으면 시대 검사를 건너뛴다).
 */

import type { AcquisitionLot } from "./types/stock-transfer.types";
import type { StockFamilyBusinessInput } from "./types/stock-family-business.types";
import { familyBusinessRateBasisError, type FamilyBusinessRateBasis } from "../family-business-applied-rate";
import { isFamilyBusinessAssetScopeDecreeEra } from "../data/family-business-cgt-era";
import { STOCK_FAMILY_BUSINESS } from "../legal-codes/stock-family-business";
import { isSplitMode, type SplitModeFields } from "./stock-transfer-helpers";

const isPosInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;
const isNonNegInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * 법정량 종류가 **양도일** 시대와 맞는지 — 어긋나면 문구, 맞으면 null.
 * 구 ③(공제금액 ÷ 가업상속 재산가액)은 2026.2.26.까지, 신 ③2호(법인 총자산가액)는 2026.2.27.부터다(부칙 대통령령 제36129호 §10).
 * 단건과 lot이 같은 함수를 쓴다.
 */
export function fbBasisEraError(basis: FamilyBusinessRateBasis, transferDate: Date): string | null {
  const newDecree = isFamilyBusinessAssetScopeDecreeEra(transferDate);
  if (newDecree === (basis.kind === "corporate_business_assets")) return null;
  return newDecree
    ? `양도일이 2026.2.27. 이후이면 적용률은 법인 총자산가액과 사업무관자산가액으로 계산합니다(${STOCK_FAMILY_BUSINESS.APPLIED_RATE_CORPORATE_ASSETS}).`
    : "양도일이 2026.2.26. 이전이면 적용률은 가업상속공제금액과 가업상속 재산가액으로 계산합니다(구 소득세법 시행령 §163의2③).";
}

/** 입력 객체 자체의 형식 오류(피상속인 1주당·자본적지출·법정량) — 단건·lot 공통. lot은 `tag`로 매수 lot을 가리킨다. */
function fbInputShapeError(fb: StockFamilyBusinessInput, tag: string): string | null {
  const t = tag ? `${tag} — ` : "";
  if (!isPosInt(fb.decedentAcquisitionPricePerShare)) return `${t}피상속인의 1주당 취득가액은 0보다 큰 원 단위 금액이어야 합니다.`;
  if (fb.decedentCapitalExpenditure !== undefined && !isNonNegInt(fb.decedentCapitalExpenditure))
    return `${t}피상속인 자본적지출은 0 이상의 원 단위 금액이어야 합니다.`;
  const basisError = familyBusinessRateBasisError(fb.fbRateBasis, undefined);
  return basisError ? `${t}${basisError}` : null;
}

/** 매수 lot 한 건이 가업상속 입력을 갖출 때의 정합 — 가업 입력이 없는 lot은 null */
export type FbLotCheck = Pick<
  AcquisitionLot,
  "id" | "acquisitionCause" | "shareCount" | "perShareAcquisitionPrice" | "familyBusinessInheritance"
>;

/**
 * lot 입력 불변식(계획서 §7.7 L-a) — 위반 문구, 없으면 null. lot이 `familyBusinessInheritance`를 갖지 않으면 null.
 * 순서: 원인 상속 → 주식수 → 평가액 → 피상속인 1주당 → 자본적지출 → 법정량.
 */
export function fbLotInputError(lot: FbLotCheck): string | null {
  const fb = lot.familyBusinessInheritance;
  if (!fb) return null;
  const tag = `매수 lot(${lot.id ?? "?"})`;
  if (lot.acquisitionCause !== "inheritance") return `${tag} — 취득원인이 상속인 lot에만 적용합니다.`;
  if (!isPosInt(lot.shareCount)) return `${tag} — 주식수는 0보다 큰 정수여야 합니다.`;
  if (!isNonNegInt(lot.perShareAcquisitionPrice)) return `${tag} — 상속개시일 평가액(1주당)은 0 이상의 원 단위 금액이어야 합니다.`;
  return fbInputShapeError(fb, tag);
}

/** 종목 입력에서 가업상속 검사가 읽는 필드 — 엔진 `StockTransferInput`과 Zod 파싱 결과(날짜는 호출부가 Date로)가 모두 맞는다 */
export type StockFamilyBusinessCheck = Omit<SplitModeFields, "acquisitionLots"> & {
  acquisitionCause?: string;
  acquisitionMode?: string;
  /** 양도일 — 없으면(날짜 변환 실패) 법정량 시대 검사만 건너뛴다 */
  transferDate?: Date;
  familyBusinessInheritance?: StockFamilyBusinessInput;
  acquisitionLots?: readonly FbLotCheck[];
};

/**
 * 단건 취득(종목 축) 가업상속 입력 정합 — 위반 문구, 없으면 null. `familyBusinessInheritance`가 없으면 null.
 * 순서: 원인 상속 → 취득모드 실가 → 분할 입력과 동시 금지 → 형식 → 양도일 시대.
 */
export function stockFbSingleInputError(input: StockFamilyBusinessCheck): string | null {
  const fb = input.familyBusinessInheritance;
  if (!fb) return null;
  if (input.acquisitionCause !== "inheritance") return "취득원인이 상속인 주식에만 적용합니다.";
  if (input.acquisitionMode !== "actual") return "취득가액을 실지거래가액(상속개시일 현재 평가액)으로 입력한 경우에만 적용합니다.";
  // 분할·다건 lot에서는 취득가액을 lot이 정한다 — 종목 축 입력은 읽히는 곳이 없어 조용히 버려지므로 막는다(자동 무시 금지).
  if (isSplitMode(input)) return "취득 lot 단위 입력에서는 가업상속 입력을 종목 축이 아니라 해당 상속 lot에 입력해야 합니다.";
  const shapeError = fbInputShapeError(fb, "");
  if (shapeError) return shapeError;
  return input.transferDate ? fbBasisEraError(fb.fbRateBasis, input.transferDate) : null;
}

/**
 * 취득 lot 단위 가업상속 입력 정합 — 위반 문구, 가업 lot이 없거나 이상이 없으면 null.
 * 순서: 종목 축과 동시 입력 금지 → 분할·다건 입력에서만 → lot별 불변식.
 */
export function stockFbLotsInputError(input: StockFamilyBusinessCheck): string | null {
  const fbLots = (input.acquisitionLots ?? []).filter((l) => l.familyBusinessInheritance !== undefined);
  if (fbLots.length === 0) return null;
  if (input.familyBusinessInheritance) return "종목 축과 취득 lot에 가업상속 입력이 함께 있습니다 — 한 쪽만 입력해야 합니다.";
  if (!isSplitMode(input)) return "취득 lot 단위 가업상속 입력은 분할·다건 취득·양도 입력에서만 적용합니다.";
  for (const lot of fbLots) {
    const error = fbLotInputError(lot);
    if (error) return error;
  }
  return null;
}

/**
 * 종목 1건의 가업상속 입력 정합 전체 — lot 축을 먼저, 없으면 단건 축(엔진 `planStockFamilyBusiness`와 같은 순서).
 * 엔진 throw·⑩ refine·⑧ validate가 이 함수 하나를 부른다.
 */
export function stockFamilyBusinessInputError(input: StockFamilyBusinessCheck): string | null {
  const hasFbLot = (input.acquisitionLots ?? []).some((l) => l.familyBusinessInheritance !== undefined);
  return hasFbLot ? stockFbLotsInputError(input) : stockFbSingleInputError(input);
}
