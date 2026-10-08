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
 * | 상속받은 주택(§104②1호 · §154⑧3호 — E-1 잔여 D) · 토지·비주택 건물(§104②1호만 — E-1 한계 G1) | `buildSameHouseholdInheritancePayload` · `sameHouseholdInheritanceOrderError` |
 * | §155의3 상생임대주택 거주기간 면제(E-1 한계 G2) | `buildWinWinRentalPayload` · `winWinRentalFieldErrors` · `qualifiesWinWinRental` |
 * | §155④⑤ 합가(E-1 한계 G4) | `buildMergeFacts` |
 *
 * 주택 여부(`propertyType === "housing"`)는 호출부가 확인한다(⑤는 주택 필드 세트 안에만 있다). 예외: 상속 취득 leaf는
 * 모든 부동산 유형에서 쓰고 주택 여부를 인자로 받는다(E-1 한계 G1).
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
import {
  buildWinWinRentalPayload,
  toWinWinRentalHouseFact,
  winWinRentalFieldErrors,
  type WinWinRentalFields,
} from "@/lib/calc/one-house-extra-facts-payload";
import { qualifiesWinWinRental } from "@/lib/tax-engine/transfer-tax-exemption-requirements";
import { buildMergeFacts, type MergeDateFields } from "@/lib/calc/transfer-tax-api-body-blocks";
import { isPostDeemedInheritance } from "@/lib/calc/transfer-163-9-base-date";

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
  /** 지정 지구 안인가(`bgt.regionInDesignatedDistrict`) — 엔진과 같은 `inDistrict`. 미선언 = 지정 */
  inDistrict?: boolean,
): { atAcquisition?: boolean; atGift?: boolean } {
  if (!regionCode) return {};
  const acq = toOptionalDate(ymd(acquisitionDate));
  const gift = toOptionalDate(giftDate);
  return {
    // 코드가 있으면 이 함수는 regionCode·지구 선언·취득일(용도변경 없음)만 읽는다 — 나머지 필드는 판정에 쓰이지 않는다.
    ...(acq
      ? {
          atAcquisition: resolveWasRegulatedAtAcquisition({
            regionCode,
            regionInDesignatedDistrict: inDistrict,
            acquisitionDate: acq,
          } as ResidenceReqInput),
        }
      : {}),
    ...(gift
      ? { atGift: isRegulatedByBjdCode(regionCode, ymd(gift), inDistrict).isRegulated }
      : {}),
  };
}

/**
 * 증여 재산 소재지 변경 → 「지정 지구 안인가」 답 초기화 patch (#2055 후속). 답은 그 소재지에 붙는다 — 법정동이
 * 바뀌면 지운다(양도세 계산기 `AssetSectionBasic`과 같은 규칙). 부담부 양도 입력이 없거나 답이 없으면 빈 patch.
 */
export function giftBurdenedDistrictResetPatch(
  item: Pick<EstateItem, "estateAddress" | "burdenedGiftTransferTax">,
  nextPnu: string | undefined,
): Partial<EstateItem> {
  const bgt = item.burdenedGiftTransferTax;
  if (!bgt || bgt.regionInDesignatedDistrict === undefined) return {};
  const next = nextPnu && nextPnu.length >= 10 ? nextPnu.slice(0, 10) : undefined;
  if (next === giftBurdenedRegionCode(item)) return {};
  return { burdenedGiftTransferTax: { ...bgt, regionInDesignatedDistrict: undefined } };
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
  bgt: Pick<BurdenedGiftTransferTaxInput, "isRegulatedArea" | "regionInDesignatedDistrict">,
  regionCode: string | undefined,
  giftDate: string | undefined,
): boolean {
  if (bgt.isRegulatedArea !== undefined) return bgt.isRegulatedArea === true;
  return giftBurdenedRegulatedByAddress(regionCode, undefined, giftDate, bgt.regionInDesignatedDistrict).atGift ?? false;
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
    provisoDepartureOnlyHouse: bgt.provisoDepartureOnlyHouse ?? "",
    provisoExpropriationDate: bgt.provisoExpropriationDate ?? "",
    provisoBusinessApprovalDate: bgt.provisoBusinessApprovalDate ?? "",
    provisoRentalLeaseResidenceMonths: bgt.provisoRentalLeaseResidenceMonths ?? "",
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
 * ④ 상속받은 자산 — 양도세 계산기 ④(`transfer-tax-api.ts` — `acquisitionCause` · 상속일 때만
 * `decedentAcquisitionDate` · `buildSameHouseholdInheritancePayload`)와 같은 키·같은 leaf.
 * 원인이 상속이 아니면 키를 만들지 않는다(남은 값이 엔진에 닿지 않는다).
 *
 * 엔진에서 바뀌는 축(anchor D-1~D-4 · G1 실측 — 양도차익·장기보유특별공제는 그대로):
 *   · 「소득세법」 §104②1호 — 세율 보유기간을 피상속인 취득일부터 (**주택·토지·건물 모두** — E-1 한계 G1)
 *   · 「소득세법 시행령」 §154⑧3호 — 동일세대 보유·거주 통산(비과세 요건) — **주택만**(`isHousing`).
 *     비주택이면 남은 통산 값을 싣지 않는다(계산기 `CompanionAcqInheritanceBlock`의 주택 게이트와 같다).
 */
export function buildGiftBurdenedInheritancePayload(
  bgt: BurdenedGiftTransferTaxInput,
  isHousing: boolean,
): Record<string, unknown> {
  const s = giftBurdenedInheritanceSlice(bgt);
  if (s.acquisitionCause !== "inheritance") return {};
  return {
    acquisitionCause: "inheritance",
    // ⑫ refine이 상속에 피상속인 취득일을 요구한다 — 빈 값은 ⑧이 막는다(계산기와 같은 계약).
    ...(s.decedentAcquisitionDate ? { decedentAcquisitionDate: s.decedentAcquisitionDate } : {}),
    ...(isHousing ? buildSameHouseholdInheritancePayload(s) : {}),
  };
}

/**
 * ⑧ 상속받은 자산 — 판정 메뉴 `validateStep3`·계산기 `getAssetDateOrderError`와 같은 규칙·문구.
 * 첫 오류 문구 또는 null. 동일세대 통산(§154⑧3호) 규칙은 주택만 본다(④와 같은 `isHousing` 게이트 —
 * 비주택의 stale 통산 값은 막지 않는다).
 */
export function giftBurdenedInheritanceError(
  bgt: BurdenedGiftTransferTaxInput,
  isHousing: boolean,
): string | null {
  const s = giftBurdenedInheritanceSlice(bgt);
  if (s.acquisitionCause !== "inheritance") return null;
  const noun = isHousing ? "주택" : "자산";
  if (!s.decedentAcquisitionDate) return `상속받은 ${noun}이면 피상속인 취득일을 입력하세요.`;
  if (s.acquisitionDate && s.decedentAcquisitionDate >= s.acquisitionDate) {
    return "피상속인 취득일은 상속개시일보다 이전이어야 합니다.";
  }
  if (isHousing && s.decedentSameHouseholdBeforeInheritance) {
    if (!s.decedentCohabitationHoldingStartDate) {
      return "동일세대 상속이면 동일세대 거주·보유 개시일을 입력하세요. (§154⑧3호 통산)";
    }
    return sameHouseholdInheritanceOrderError(s);
  }
  return null;
}

/**
 * 「소득세법 시행령」 §155의3 상생임대주택 (E-1 한계 G2) — ⑤④⑧ 공용 게이트: 주택(호출부가 확인) ·
 * 1세대 1주택 ON(거주기간 칸이 있는 맥락 — §155⑳ 카드와 같은 게이트). 면제되는 거주기간은
 * §154①·§155⑳1호·§159의4(표2)의 것이고 모두 1세대 1주택(의제 포함) 맥락이다.
 */
export function giftBurdenedWinWinInScope(bgt: BurdenedGiftTransferTaxInput): boolean {
  return bgt.isOneHousehold === true;
}

/** 증여세 폼 → 판정 메뉴 운반 상자와 같은 이름의 6필드. 옛 record(필드 없음)는 미적용. */
export function giftBurdenedWinWinSlice(bgt: BurdenedGiftTransferTaxInput): WinWinRentalFields {
  return {
    winWinRentalSpecial: bgt.winWinRentalSpecial === true,
    winWinRentalContractDate: bgt.winWinRentalContractDate ?? "",
    winWinRentalIncreaseRatePct: bgt.winWinRentalIncreaseRatePct ?? "",
    winWinRentalPriorLeaseMonths: bgt.winWinRentalPriorLeaseMonths ?? "",
    winWinRentalLeaseMonths: bgt.winWinRentalLeaseMonths ?? "",
    winWinRentalLeaseEndDate: bgt.winWinRentalLeaseEndDate ?? "",
  };
}

/** ④ — 계산기가 운반 상자에서 싣는 것과 같은 leaf(`buildWinWinRentalPayload` → `winWinRentalHouse`). 게이트 밖이면 키 없음. */
export function buildGiftBurdenedWinWinPayload(bgt: BurdenedGiftTransferTaxInput): object {
  if (!giftBurdenedWinWinInScope(bgt)) return {};
  return buildWinWinRentalPayload(giftBurdenedWinWinSlice(bgt));
}

/**
 * ⑧ — 판정 메뉴와 같은 필수값 규칙·문구. 첫 오류 또는 null. 게이트 밖의 stale 선언은 막지 않는다.
 * @param giftDate 증여일(= 이 경로의 양도일, `form.giftDate`) — 2026 개정 양도기한 종료일 필수
 *   여부를 판정 메뉴와 같은 경계(`isWinWinDeadlineEraApplicable`)로 가른다.
 */
export function giftBurdenedWinWinError(
  bgt: BurdenedGiftTransferTaxInput,
  giftDate?: string,
): string | null {
  if (!giftBurdenedWinWinInScope(bgt)) return null;
  return winWinRentalFieldErrors(giftBurdenedWinWinSlice(bgt), giftDate)[0]?.message ?? null;
}

/**
 * ⑧ §155⑳1호 거주요건 면제 여부 — 엔진(`checkEligibility`)과 같은 술어 `qualifiesWinWinRental`에 ④와 같은 사실을
 * 넣는다(계산기 `transfer-tax-validate-asset.ts`와 같은 배선). 게이트 밖이면 면제 없음.
 * @param giftDate 증여일(= 이 경로의 양도일) — 2026 개정 양도기한 판정에 필요(엔진과 같은 필드).
 */
export function giftBurdenedWinWinResidenceExempt(
  bgt: BurdenedGiftTransferTaxInput,
  giftDate?: string,
): boolean {
  if (!giftBurdenedWinWinInScope(bgt)) return false;
  return qualifiesWinWinRental({
    winWinRentalHouse: toWinWinRentalHouseFact(giftBurdenedWinWinSlice(bgt)),
    transferDate: toOptionalDate(giftDate),
  });
}

/**
 * 「소득세법 시행령」 §155④⑤ 합가 (E-1 한계 G4) — ⑤④ 공용 게이트: 주택(호출부가 확인) · 세대 주택 수 2 이상.
 * 양도세 계산기가 `MergeDateSection`을 여는 조건(`isHousingLike && 세대 주택수 ≥ 2` — `TemporaryTwoHouseSection`
 * 호출부)과 같다. 이 경로의 주택 수는 선언 스칼라(④와 같은 `?? 1`)다.
 */
export function giftBurdenedMergeInScope(bgt: BurdenedGiftTransferTaxInput): boolean {
  return (bgt.householdHousingCount ?? 1) >= 2;
}

/** 증여세 폼 → 위젯 필드(양도세 폼과 같은 이름). 옛 record는 빈 값. */
export function giftBurdenedMergeSlice(bgt: BurdenedGiftTransferTaxInput): MergeDateFields {
  return {
    marriageDate: bgt.marriageDate ?? "",
    parentalCareMergeDate: bgt.parentalCareMergeDate ?? "",
    isFirstTransferredInMerge: bgt.isFirstTransferredInMerge === true,
  };
}

/** ④ — 계산기와 같은 leaf. 게이트 밖이면 키 없음. */
export function buildGiftBurdenedMergePayload(bgt: BurdenedGiftTransferTaxInput): object {
  if (!giftBurdenedMergeInScope(bgt)) return {};
  return buildMergeFacts(giftBurdenedMergeSlice(bgt));
}

/**
 * 상속받은 자산의 환산취득가액(K-5) 차단 여부 (E-1 한계 G6) — ⑤ 라디오 비활성 · ⑧ 차단이 같은 술어를 쓴다.
 *
 * 「소득세법 시행령」 §163⑨: 상속받은 자산에 법 §97①1호가목을 적용할 때 「상속개시일 … 현재 「상속세 및 증여세법」
 * 제60조부터 제66조까지의 규정에 따라 평가한 가액 … 을 취득당시의 실지거래가액으로 본다」. 법 §97①1호 단서:
 * 「가목의 실지거래가액을 확인할 수 없는 경우에 한정하여 나목(환산취득가액 등)의 금액을 적용한다」. 상증법 §60③은
 * 시가를 산정하기 어려우면 §61~§65 보충적 평가액을 시가로 **본다** ⇒ 평가액이 없는 상속 자산은 없고 가목이 늘
 * 확인된다 ⇒ 환산에 닿지 않는다(MST 286211·280405·276123 실독). 영 §159①1호 A = 법 §97①1호에 따른 가액이라
 * 부담부증여 양도분에도 같다. 양도세 계산기 `postDeemedClauseARequiredError`와 같은 결론.
 *
 * 🔑 상속개시일이 의제취득일(1985.1.1.) **전**이면 막지 않는다 — 영 §176의2④·법 §97②1호나목의 의제취득일 환산
 *    경로가 있다(계산기는 「가목 확인 불가」 선언 + 의제취득일 비교로 받는다). 이 경로에는 그 입력이 없어 종전 동작을
 *    유지한다(확인 필요).
 */
export function giftBurdenedInheritedConversionBlocked(bgt: BurdenedGiftTransferTaxInput): boolean {
  // 상속개시일 = 이 경로의 취득일(위젯 안내) — 계산기 부담부증여와 같은 술어
  return isPostDeemedInheritance(bgt.acquisitionCause, ymd(bgt.acquisitionDate));
}

/** ⑧ 문구 — 계산기 `postDeemedClauseARequiredError`와 같은 근거를 이 경로의 칸 이름으로 안내한다. */
export const GIFT_BURDENED_INHERITED_CONVERSION_ERROR =
  "상속받은 자산은 상속개시일 현재 「상속세 및 증여세법」 평가액이 취득 당시 실지거래가액입니다(소득세법 시행령 §163⑨) — " +
  "환산취득가액(K-5)을 쓸 수 없습니다(소득세법 §97①1호 단서). 실지취득가액(K-4)에 상속개시일 평가액(상속세 신고·결정가액)을 입력하세요.";
