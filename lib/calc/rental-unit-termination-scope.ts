/**
 * §155㉓ 말소 특례 — 임대주택 호의 말소 표시가 **효력을 갖는가**의 단일 술어 (④ 전송 · 엔진 `periodPending`).
 *
 * 법문(MST 290841): ㉓은 「제167조의3제1항제2호가목 및 다목부터 마목까지」의 임대주택으로 한정된다. 말소 토글은 ⑤가 그 목
 * (가·다·라·마)에서만 보여 주므로(`RentalUnitCard`), 목이 바뀌어 비대상(구법·나·바·아·자목)이 되면 화면에서는 사라지는데
 * 값은 남는다(등록일·취득방법·임대 구분을 고치는 onChange는 말소 3필드를 지우지 않는다). 남은 값이 전송돼 엔진이
 * 「말소된 호」로 읽으면 §155㉑(임대기간요건 충족 전 양도) 구제가 꺼져 비과세가 과세로 바뀐다(S16-3).
 * ⑧(`transfer-tax-validate-rental-exception.ts`)은 이미 같은 목에만 말소 필드를 검사한다.
 */
import {
  deriveEffectiveRegDate,
  deriveRentalArticle,
  isTerminationEligibleArticle,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type RentalUnitForm = AssetForm["rentalHousingException"]["rentalUnits"][number];

export function rentalUnitTerminationInScope(u: RentalUnitForm): boolean {
  if (!u.rentalAutoTermination) return false;
  const effReg =
    u.businessRegistrationDate && u.rentalRegistrationDate
      ? deriveEffectiveRegDate({
          businessRegistrationDate: new Date(u.businessRegistrationDate),
          rentalRegistrationDate: new Date(u.rentalRegistrationDate),
        })
      : null;
  return isTerminationEligibleArticle(deriveRentalArticle(u.rentalCategory, u.rentalAcquisitionType, effReg));
}
