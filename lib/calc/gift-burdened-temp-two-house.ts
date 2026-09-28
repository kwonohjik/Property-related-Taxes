/**
 * 증여세 부담부증여 양도 경로 — §155①2호 새 입력(OH-01 A2b)의 **노출 게이트** (E-1)
 *
 * ⑤ `BurdenedGiftTransferSection`(입력 칸)과 ⑧ `gift-tax-form-validate.ts`(모순 차단)가 **같은 함수**로
 * 게이트를 연다 — 칸이 없는 상태에서 막거나, 칸이 있는데 검증이 빠지는 어긋남을 막는다(3중 패턴).
 *
 * 판정은 양도세 판정 카드와 같은 leaf(`judgeTempTwoHouseFromForm`)를 부른다. 종전(증여) 주택 주소
 * (`regionCode` — E-1 후속)는 ④가 싣는 값과 같은 것을 넘긴다(`giftBurdenedRegionCode`) — 있으면 종전 주택
 * 조정 여부는 주소로 자동 판정되고 위젯은 선언 칸 대신 결과를 보여 준다. 신규 주택 법정동코드는 이 경로에
 * 입력 칸(보유 주택 목록)이 없어 선언으로만 판정한다. §154① 단서는 `regulated`(노출 게이트)를 바꾸지 않아
 * 넘기지 않는다(1년 요건 면제만 바꾼다 — 엔진은 ④가 싣는 사유로 판정한다).
 */
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { judgeTempTwoHouseFromForm, type TempTwoHouseVerdict } from "@/lib/calc/transfer-temp-two-house-judge";

type RegulatedVerdict = Extract<TempTwoHouseVerdict, { status: "eligible" | "ineligible" }>["regulated"];

/** Date(메모리) 또는 YYYY-MM-DD(복원 직후) → YYYY-MM-DD. 무효면 "". */
function ymd(v: Date | string | undefined): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return typeof v === "string" ? v : "";
}

/**
 * 일시적 2주택 블록(세대 주택 수 2)이 열려 있고, 그 양도(증여) 시기에 두 주택의 조정 여부가 기한을
 * 바꾸면 판정 결과(`regulated`)를 돌려준다. 아니면 `null` — 새 입력 칸을 그리지 않고 검증하지 않는다.
 * 주택 여부(`propertyType === "housing"`)는 호출부가 확인한다(⑤는 주택 필드 세트 안에만 있다).
 */
export function giftBurdenedTempTwoHouseRegulatedGate(
  bgt: BurdenedGiftTransferTaxInput,
  giftDate: string | undefined,
  /** 증여 주택 법정동코드 — ④와 같은 `giftBurdenedRegionCode(item)` */
  regionCode: string | undefined,
): { regulated: RegulatedVerdict; newAcquisitionDate: string } | null {
  const tt = bgt.temporaryTwoHouse;
  if ((bgt.householdHousingCount ?? 1) !== 2 || !tt) return null;
  const newAcquisitionDate = ymd(tt.newAcquisitionDate);
  const v = judgeTempTwoHouseFromForm({
    previousAcquisitionDate: ymd(tt.previousAcquisitionDate),
    newHouseAcquisitionDate: newAcquisitionDate,
    transferDate: giftDate ?? "",
    provisoReason: "",
    provisoDepartureDate: "",
    provisoExpropriationDate: "",
    provisoBusinessApprovalDate: "",
    residencePeriodMonths: String(bgt.residencePeriodMonths ?? 0),
    regionCode,
    isRegulatedArea: bgt.isRegulatedArea === true,
    eraFields: tt,
  });
  if (v.status === "pending" || !v.regulated.relevant) return null;
  return { regulated: v.regulated, newAcquisitionDate };
}
