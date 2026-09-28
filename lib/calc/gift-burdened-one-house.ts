/**
 * 증여세 부담부증여 양도 경로 — 1세대1주택 후속 입력의 **게이트·조립 정본** (E-1 후속)
 *
 * ⑤ `BurdenedGiftHousingFieldSet`(화면) · ④ `buildGiftBurdenedTransferBody`(본문) · ⑧ `gift-tax-form-validate.ts`
 * (검증)가 **같은 함수**로 게이트를 연다(3중 패턴). 판정·조립은 양도세 계산기와 같은 leaf를 부른다 —
 * 이 파일은 증여세 폼(`bgt`·`item`)을 그 leaf의 입력 모양으로 옮기기만 한다.
 *
 * | 축 | 양도세 계산기와 공용인 leaf |
 * |---|---|
 * | 증여 주택 주소 → 조정대상지역 | `regionCode`(PNU 앞 10자리 — `AssetSectionBasic`과 같은 규칙) → 엔진 `resolveWasRegulatedAtAcquisition` · `resolveRegulatedAtNewAcquisition` |
 * | 증여 주택 주소 → 「양도시 조정대상지역」 토글(E-1 잔여 A) | 계산기 `useRegulatedAreaAutoTip`과 같은 규칙(안 만진 토글은 주소 판정) — `giftBurdenedEffectiveIsRegulatedArea` |
 * | §154① 단서(삭제 전 4호 포함) | `provisoGate` · `buildExemptionProvisoPayload` · `collectExemptionProvisoErrors` |
 * | §154⑤ 단서 재기산 | `finalHouseRestartInScope` · `buildFinalHouseRestartPayload` · `collectFinalHouseRestartErrors` |
 * | 상속받은 주택(§104②1호 · §154⑧3호 — E-1 잔여 D) | `buildSameHouseholdInheritancePayload` · `sameHouseholdInheritanceOrderError` |
 *
 * 주택 여부(`propertyType === "housing"`)는 호출부가 확인한다(⑤는 주택 필드 세트 안에만 있다).
 */
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { provisoGate, type ProvisoMode } from "@/lib/calc/transfer-tax-api-helpers";
import type { ExemptionProvisoFormSlice } from "@/lib/calc/exemption-proviso-payload";
import { finalHouseRestartInScope, type FinalHouseRestartFormSlice } from "@/lib/calc/final-house-restart";
import {
  resolveWasRegulatedAtAcquisition,
  type ResidenceReqInput,
} from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { buildSameHouseholdInheritancePayload } from "@/lib/calc/transfer-tax-api-helpers";
import { sameHouseholdInheritanceOrderError } from "@/lib/calc/same-household-inheritance-order";

/** Date(메모리) 또는 YYYY-MM-DD(복원 직후) → YYYY-MM-DD. 무효면 "". */
function ymd(v: Date | string | undefined): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return typeof v === "string" ? v : "";
}

/**
 * 증여 주택 법정동코드 — 소재지 검색(`AddressSearch`) PNU의 앞 10자리. 양도세 계산기 ①
 * (`AssetSectionBasic` — `pnu.length >= 10`이면 `slice(0, 10)`)과 같은 규칙이다.
 * 없으면 `undefined` — 엔진은 선언 토글로 판정한다(계산기와 같은 폴백).
 */
export function giftBurdenedRegionCode(item: Pick<EstateItem, "estateAddress">): string | undefined {
  const pnu = item.estateAddress?.pnu;
  return pnu && pnu.length >= 10 ? pnu.slice(0, 10) : undefined;
}

/**
 * ⑤ 표시 — 주소(법정동코드)가 있을 때 **엔진이 쓰는 값**. 코드가 없으면 둘 다 `undefined`(선언 토글을 쓴다).
 *  - `atAcquisition`: 엔진 `resolveWasRegulatedAtAcquisition` 그대로(취득일 기준 — §154① 거주요건). 코드가
 *    있으면 엔진은 「취득시 조정대상지역」 토글을 읽지 않는다 ⇒ 화면은 토글 대신 이 값을 보여 준다.
 *  - `atGift`: 증여일(양도일) 기준 — 엔진 §155① 폴백(`resolveIsRegulatedAtTransfer`)과 같은 `isRegulatedByBjdCode`.
 *    「양도시 조정대상지역」 토글은 안 만졌으면 이 값을 따른다(`giftBurdenedEffectiveIsRegulatedArea` — E-1 잔여 A).
 */
export function giftBurdenedRegulatedByAddress(
  regionCode: string | undefined,
  acquisitionDate: Date | string | undefined,
  giftDate: string | undefined,
): { atAcquisition?: boolean; atGift?: boolean } {
  if (!regionCode) return {};
  const acq = toOptionalDate(ymd(acquisitionDate));
  const gift = toOptionalDate(giftDate);
  return {
    // 코드가 있으면 이 함수는 regionCode·취득일(용도변경 없음)만 읽는다 — 나머지 필드는 판정에 쓰이지 않는다.
    ...(acq
      ? { atAcquisition: resolveWasRegulatedAtAcquisition({ regionCode, acquisitionDate: acq } as ResidenceReqInput) }
      : {}),
    ...(gift
      ? { atGift: isRegulatedByBjdCode(regionCode, ymd(gift)).isRegulated }
      : {}),
  };
}

/**
 * 「양도시(증여일) 조정대상지역」의 **실효값** (E-1 잔여 A) — ⑤ 토글 표시와 ④ `isRegulatedArea`가 같은 값을 쓴다
 * (3중 패턴 — store에 쓰지 않고 파생한다). ⑧에는 이 값을 읽는 규칙이 없다 — §155①2호 게이트
 * (`giftBurdenedTempTwoHouseRegulatedGate`)는 저장값을 넘기지만, 주소 코드가 있으면 판정이 코드를 먼저 보고
 * (`resolveIsRegulatedAtTransfer`) 없으면 실효값 = 저장값이라 결과가 같다.
 *
 * 규칙은 양도세 계산기(`useRegulatedAreaAutoTip`)와 같다: 주소가 있으면 증여일(= 양도일) 판정
 * (`/api/address/regulated-area`와 같은 `isRegulatedByBjdCode`)으로 토글을 채우되, **사용자가 직접 만진
 * 토글은 덮어쓰지 않는다**. 계산기의 「만짐」 표지(`isRegulatedAreaTouched`)는 여기서는 저장값의 유무다 —
 * ⑤는 토글을 만지면 `true`/`false`를 그대로 저장하고, 안 만졌으면 저장값이 없다(`undefined`).
 * 주소가 없으면 저장값(없으면 아님)이다 — 종전 동작 그대로.
 *
 * 이 값은 엔진의 중과(§104⑦ — 양도 주택 명부가 없는 경로의 폴백)·단기세율·§155①2호 폴백 판정에 쓰인다.
 */
export function giftBurdenedEffectiveIsRegulatedArea(
  bgt: Pick<BurdenedGiftTransferTaxInput, "isRegulatedArea">,
  regionCode: string | undefined,
  giftDate: string | undefined,
): boolean {
  if (bgt.isRegulatedArea !== undefined) return bgt.isRegulatedArea === true;
  return giftBurdenedRegulatedByAddress(regionCode, undefined, giftDate).atGift ?? false;
}

/**
 * §154① 단서 카드 맥락 — 양도세 계산기와 같은 `provisoGate`. 이 경로의 주택 수는 선언 스칼라(④와 같은 `?? 1`),
 * 일시적 2주택 성립은 ④가 `temporaryTwoHouse`를 싣는 조건(세대 2주택 + 두 날짜)이다.
 */
export function giftBurdenedProvisoMode(bgt: BurdenedGiftTransferTaxInput): ProvisoMode {
  const count = bgt.householdHousingCount ?? 1;
  const tt = bgt.temporaryTwoHouse;
  return provisoGate({
    isOneHousehold: bgt.isOneHousehold === true,
    isHousing: true,
    householdHousingCount: count,
    temporaryTwoHouseApplies:
      count === 2 && !!tt && !!ymd(tt.previousAcquisitionDate) && !!ymd(tt.newAcquisitionDate),
  }).mode;
}

/** 증여세 폼 → 양도세 폼 같은 이름의 slice. 양도일 = 증여일. 옛 record의 빈 칸은 미입력으로 읽는다. */
export function giftBurdenedOneHouseSlice(
  bgt: BurdenedGiftTransferTaxInput,
  giftDate: string | undefined,
): ExemptionProvisoFormSlice & FinalHouseRestartFormSlice & { provisoPreContractNoHouse: boolean } {
  return {
    transferDate: giftDate ?? "",
    provisoReason: bgt.provisoReason ?? "",
    provisoDepartureDate: bgt.provisoDepartureDate ?? "",
    provisoExpropriationDate: bgt.provisoExpropriationDate ?? "",
    provisoBusinessApprovalDate: bgt.provisoBusinessApprovalDate ?? "",
    provisoPreContractNoHouse: bgt.provisoPreContractNoHouse === true,
    proviso4hoBusinessRegDate: bgt.proviso4hoBusinessRegDate ?? "",
    proviso4hoRentalRegDate: bgt.proviso4hoRentalRegDate ?? "",
    proviso4hoRegulatedOneHouse: bgt.proviso4hoRegulatedOneHouse ?? "",
    proviso4hoStatus: bgt.proviso4hoStatus ?? "",
    proviso4hoDuringMandatory: bgt.proviso4hoDuringMandatory ?? "",
    proviso4hoRentOver5: bgt.proviso4hoRentOver5 ?? "",
    proviso4hoRentOver5ContractDate: bgt.proviso4hoRentOver5ContractDate ?? "",
    proviso4hoGiftSeparated: bgt.proviso4hoGiftSeparated === true,
    // 모양 가드는 leaf(`readFinalHouseRestartHistory`·`readFinalHouseDisposals`)가 한다
    finalHouseRestartHistory: bgt.finalHouseRestartHistory ?? "",
    finalHouseRestartDisposals: bgt.finalHouseRestartDisposals ?? [],
  };
}

/** §154⑤ 단서 재기산 노출 범위 — 양도세 계산기와 같은 `finalHouseRestartInScope`(주택 수는 ④와 같은 `?? 1`). */
export function giftBurdenedFinalHouseRestartInScope(
  bgt: BurdenedGiftTransferTaxInput,
  giftDate: string | undefined,
): boolean {
  return finalHouseRestartInScope({
    transferDate: giftDate ?? "",
    isOneHousehold: bgt.isOneHousehold === true,
    primaryKind: "housing",
    householdHousingCount: bgt.householdHousingCount ?? 1,
    isUnregistered: bgt.isUnregistered === true,
  });
}

/**
 * 상속받은 주택(E-1 잔여 D) — 증여세 폼 → 양도세 폼(`AssetForm`) 같은 이름의 slice. ⑤ 위젯
 * (`InheritedSameHouseholdField`)·④·⑧이 같은 값을 본다. 옛 record의 빈 칸은 「매매」·미입력으로 읽는다.
 * 취득일은 상속개시일이다(위젯 안내 — 상속 자산의 취득시기는 「소득세법 시행령」 §162①5호).
 */
export type GiftBurdenedInheritanceSlice = Pick<
  AssetForm,
  | "acquisitionDate"
  | "decedentAcquisitionDate"
  | "decedentSameHouseholdBeforeInheritance"
  | "decedentCohabitationHoldingStartDate"
  | "decedentCohabitationResidenceMonths"
> & { acquisitionCause: "purchase" | "inheritance" };

export function giftBurdenedInheritanceSlice(bgt: BurdenedGiftTransferTaxInput): GiftBurdenedInheritanceSlice {
  return {
    acquisitionCause: bgt.acquisitionCause === "inheritance" ? "inheritance" : "purchase",
    acquisitionDate: ymd(bgt.acquisitionDate),
    decedentAcquisitionDate: bgt.decedentAcquisitionDate ?? "",
    decedentSameHouseholdBeforeInheritance: bgt.decedentSameHouseholdBeforeInheritance === true,
    decedentCohabitationHoldingStartDate: bgt.decedentCohabitationHoldingStartDate ?? "",
    decedentCohabitationResidenceMonths: bgt.decedentCohabitationResidenceMonths ?? "",
  };
}

/**
 * ④ 상속받은 주택 — 양도세 계산기 ④(`transfer-tax-api.ts` — `acquisitionCause` · 상속일 때만
 * `decedentAcquisitionDate` · `buildSameHouseholdInheritancePayload`)와 같은 키·같은 leaf.
 * 원인이 상속이 아니면 키를 만들지 않는다(남은 값이 엔진에 닿지 않는다). 주택 여부는 호출부가 본다.
 *
 * 엔진에서 바뀌는 축은 둘뿐이다(anchor D-1~D-4 실측 — 양도차익·장기보유특별공제는 그대로):
 *   · 「소득세법」 §104②1호 — 세율 보유기간을 피상속인 취득일부터
 *   · 「소득세법 시행령」 §154⑧3호 — 동일세대 보유·거주 통산(비과세 요건)
 */
export function buildGiftBurdenedInheritancePayload(bgt: BurdenedGiftTransferTaxInput): Record<string, unknown> {
  const s = giftBurdenedInheritanceSlice(bgt);
  if (s.acquisitionCause !== "inheritance") return {};
  return {
    acquisitionCause: "inheritance",
    // ⑫ refine이 상속에 피상속인 취득일을 요구한다 — 빈 값은 ⑧이 막는다(계산기와 같은 계약).
    ...(s.decedentAcquisitionDate ? { decedentAcquisitionDate: s.decedentAcquisitionDate } : {}),
    ...buildSameHouseholdInheritancePayload(s),
  };
}

/**
 * ⑧ 상속받은 주택 — 판정 메뉴 `validateStep3`·계산기 `getAssetDateOrderError`와 같은 규칙·문구.
 * 첫 오류 문구 또는 null. 주택 여부는 호출부가 본다(⑤·④와 같은 게이트).
 */
export function giftBurdenedInheritanceError(bgt: BurdenedGiftTransferTaxInput): string | null {
  const s = giftBurdenedInheritanceSlice(bgt);
  if (s.acquisitionCause !== "inheritance") return null;
  if (!s.decedentAcquisitionDate) return "상속받은 주택이면 피상속인 취득일을 입력하세요.";
  if (s.acquisitionDate && s.decedentAcquisitionDate >= s.acquisitionDate) {
    return "피상속인 취득일은 상속개시일보다 이전이어야 합니다.";
  }
  if (s.decedentSameHouseholdBeforeInheritance) {
    if (!s.decedentCohabitationHoldingStartDate) {
      return "동일세대 상속이면 동일세대 거주·보유 개시일을 입력하세요. (§154⑧3호 통산)";
    }
    return sameHouseholdInheritanceOrderError(s);
  }
  return null;
}
