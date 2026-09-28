/**
 * 증여세 부담부증여 양도 경로 — 「소득세법 시행령」 §155⑳ 장기임대주택 보유자 거주주택 특례
 * (I-4 §155㉓ 말소일 포함)의 **게이트·어댑터 정본** (E-1 잔여 C)
 *
 * ⑤ `BurdenedGiftHousingFieldSet`(화면) · ④ `buildGiftBurdenedTransferBody`(본문) · ⑧ `gift-tax-form-validate.ts`
 * (검증)가 **같은 함수**로 게이트를 열고 **같은 합성 자산**을 쓴다(3중 패턴). 판정·조립은 양도세 계산기와 같은
 * leaf다 — 카드 `RentalHousingExceptionSection` · ④ `toRentalHousingExceptionApi` · ⑧ `validateRentalHousingException`.
 * 이 파일은 증여세 폼(`bgt`)을 그 leaf가 받는 `AssetForm` 모양으로 옮기기만 한다.
 *
 * 🔑 거주기간은 이 경로의 한 칸(`residencePeriodMonths` — 개월 직접 입력)이 정본이다. 합성 자산은 그 값을
 *    `residenceInputMode: "direct"`로 싣고, 카드에는 거주 구간 편집기(`onChangeResidence`)를 넘기지 않는다 —
 *    두 입력 칸이 같은 사실을 다르게 담지 않게 한다. 그 칸은 1세대 1주택 ON일 때만 보이므로 게이트도 같다
 *    (OFF면 카드가 거주 24개월을 요구하는데 채울 칸이 없다 — dead-end).
 *
 * 근거(부담부증여에 §155⑳ 적용): 사전-2020-법령해석재산-0097(2020.3.19.) — 「장기임대주택과 1거주주택을 국내에
 * 소유하고 있는 1세대가 거주주택을 양도(부담부증여)하는 경우 국내에 1개의 주택을 소유하고 있는 것으로 보아
 * 1세대1주택 비과세 규정을 적용하는 것」.
 */
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultAsset, RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";

/** Date(메모리) 또는 YYYY-MM-DD(복원 직후) → YYYY-MM-DD. 무효면 "". */
function ymd(v: Date | string | undefined): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return typeof v === "string" ? v : "";
}

/** ⑤④⑧ 공용 게이트 — 주택(호출부가 확인) · 1세대 1주택 ON(거주기간 칸이 있는 맥락). */
export function giftBurdenedRentalExceptionInScope(bgt: BurdenedGiftTransferTaxInput): boolean {
  return bgt.isOneHousehold === true;
}

/** 카드·leaf에 넘길 특례 입력 — 옛 record(필드 없음)는 계산기 기본값(미적용). */
export function giftBurdenedRentalHousingException(
  bgt: BurdenedGiftTransferTaxInput,
): AssetForm["rentalHousingException"] {
  return bgt.rentalHousingException ?? { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS };
}

/**
 * 계산기 leaf가 받는 합성 자산 — 거주주택(증여 주택) 1건. 계산기 자산 기본값 위에 이 경로의 사실만 얹는다:
 * 주택 · 취득일 · 거주 개월(직접 입력) · 특례 입력. 그 밖(주소·환산 연동 등)은 기본값이다 — §161① 기준시가는
 * 카드의 직접 입력 칸을 쓴다(`isPhrpStdPriceLinked`가 거짓).
 */
export function giftBurdenedRentalAsset(
  item: Pick<EstateItem, "id">,
  bgt: BurdenedGiftTransferTaxInput,
): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetId: item.id,
    assetKind: "housing",
    acquisitionDate: ymd(bgt.acquisitionDate),
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: String(bgt.residencePeriodMonths ?? 0),
    rentalHousingException: giftBurdenedRentalHousingException(bgt),
  };
}

/** ④ — 게이트 밖이거나 특례 OFF면 키 없음(계산기 leaf와 같은 규칙). */
export function buildGiftBurdenedRentalExceptionPayload(
  item: Pick<EstateItem, "id">,
  bgt: BurdenedGiftTransferTaxInput,
): { rentalHousingException: object } | Record<string, never> {
  if (!giftBurdenedRentalExceptionInScope(bgt)) return {};
  const payload = toRentalHousingExceptionApi(giftBurdenedRentalAsset(item, bgt));
  return payload ? { rentalHousingException: payload } : {};
}

/**
 * ⑧ — 계산기와 같은 규칙(`mode: "full"` — 카드가 판정 사실과 §161① 안분 입력을 모두 보이는 모드).
 * 게이트 밖의 stale 선언은 막지 않는다(영구 차단 방지). 상생임대(§155의3①) 거주 면제 입력은 이 경로에 없다.
 */
export function giftBurdenedRentalExceptionError(
  item: Pick<EstateItem, "id">,
  bgt: BurdenedGiftTransferTaxInput,
  giftDate: string | undefined,
  label: string,
): string | null {
  if (!giftBurdenedRentalExceptionInScope(bgt)) return null;
  const asset = giftBurdenedRentalAsset(item, bgt);
  return validateRentalHousingException(asset.rentalHousingException, asset, 0, label, giftDate, "full");
}
