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
 * | §154① 단서(삭제 전 4호 포함) | `provisoGate` · `buildExemptionProvisoPayload` · `collectExemptionProvisoErrors` |
 * | §154⑤ 단서 재기산 | `finalHouseRestartInScope` · `buildFinalHouseRestartPayload` · `collectFinalHouseRestartErrors` |
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
 *    「양도시 조정대상지역」 토글은 중과·단기세율 판정에 그대로 쓰이므로 화면은 토글을 두고 이 값을 안내만 한다.
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
