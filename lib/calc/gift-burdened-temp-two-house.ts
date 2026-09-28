/**
 * 증여세 부담부증여 양도 경로 — §155①2호 새 입력(OH-01 A2b)의 **노출 게이트** (E-1)
 *
 * ⑤ `BurdenedGiftTransferSection`(입력 칸)과 ⑧ `gift-tax-form-validate.ts`(모순 차단)가 **같은 함수**로
 * 게이트를 연다 — 칸이 없는 상태에서 막거나, 칸이 있는데 검증이 빠지는 어긋남을 막는다(3중 패턴).
 *
 * 판정은 양도세 판정 카드와 같은 leaf(`judgeTempTwoHouseFromForm`)를 부른다. 이 경로는 ④가
 * `regionCode`(양도 주택 주소)·신규 주택 법정동코드를 싣지 않으므로 여기서도 넘기지 않는다 —
 * 그래서 두 주택 조정 여부는 선언으로만 판정된다(④·엔진과 같은 입력). §154① 단서(1년 요건 면제)도
 * 이 경로에는 입력이 없어 넘기지 않는다.
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
    isRegulatedArea: bgt.isRegulatedArea === true,
    eraFields: tt,
  });
  if (v.status === "pending" || !v.regulated.relevant) return null;
  return { regulated: v.regulated, newAcquisitionDate };
}
