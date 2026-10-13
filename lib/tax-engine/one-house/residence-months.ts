/**
 * §154① 거주요건에 쓰는 **거주 개월** — 통산 규칙 모음 (`transfer-tax-exemption-holding.ts`에서 800줄 정책으로 분리, 이음매는 「거주 개월을 만드는 함수」).
 *
 * - `consolidateResidenceMonths` · `resolveExemptionResidenceMonths` — §154⑧3호 동일세대 상속 통산. **표2 대상 판정**(장기보유특별공제)도 읽는다.
 * - `resolveExemptionRequirementResidenceMonths` — 위 값 + 증여 전 동일세대 거주 개월(결정 #38-7). **비과세 거주요건 전용**이다.
 *
 * 하위 호환: `transfer-tax-exemption-holding.ts`가 앞의 두 함수를 재수출해 기존 import 경로(`transfer-tax-exemption`·`-requirements`·`-helpers`)는 무변경이다.
 * 이 파일은 그 파일의 **타입만** 가져온다(런타임 의존은 단방향).
 */
import type { TransferTaxInput } from "../types/transfer.types";
import type { ResidenceReqInput } from "../transfer-tax-exemption-holding";
import { giftHouseholdPriorResidenceMonths } from "./gift-household-basis";

/**
 * §154⑧3호 통산 거주 개월 규칙 코어 — 최소입력 pure 헬퍼 (client·engine 공용 단일 소스).
 * 동일세대 상속이면 상속개시일 이후 실거주 + 상속개시 전 동일세대 통산 거주, 그 외에는 실거주만.
 * 겸용주택 API 어댑터(`transfer-tax-api-mixed-use.ts`)도 이 함수를 재사용해 규칙 중복을 없앤다
 * (`resolveExemptionResidenceMonths`가 10-필드 Pick 인자라 어댑터에서 직접 호출 불가한 것을 우회).
 */
export function consolidateResidenceMonths(
  residencePeriodMonths: number,
  opts: {
    acquisitionCause?: TransferTaxInput["acquisitionCause"];
    decedentSameHouseholdBeforeInheritance?: boolean;
    decedentCohabitationResidenceMonths?: number;
  },
): number {
  if (
    opts.acquisitionCause === "inheritance" &&
    opts.decedentSameHouseholdBeforeInheritance === true
  ) {
    return residencePeriodMonths + (opts.decedentCohabitationResidenceMonths ?? 0);
  }
  return residencePeriodMonths;
}

/**
 * §154⑧3호 — 상속주택 자체 양도 시 (비과세 거주요건·§95② 표2 대상 판정용) 통산 거주 개월.
 * 동일세대 상속이면 상속개시일 이후 실거주(residencePeriodMonths) + 상속개시 전 동일세대 통산 거주
 * (decedentCohabitationResidenceMonths). 그 외에는 실거주만.
 * ⚠️ 대상 판정 전용 — 표2 "거주분 공제율"은 residencePeriodMonths(상속개시일부터 실거주)를 별도 사용
 *    (사전법령해석재산 2021-202: 통산은 표2 대상 판정 한정, 공제율은 상속개시일 기산).
 * 두 기간은 disjoint(상속개시 이전/이후)라 단순 합산이 정확.
 *
 * ⚠️ **비주택 → 주택 용도변경(§154⑤ 단서)이면 통산하지 않는다.** §154⑧3호는
 *    "**상속받은 주택**으로서"가 전제라 상속개시 당시 주택이어야 하는데, 용도변경 토글이
 *    켜졌다는 것은 취득 당시 비주택이었다는 뜻이다 — C-8이 이중으로
 *    (`transfer-tax-validate-usage-conversion.ts` · `usage-period-info.ts`)
 *    용도변경일 > 취득일을 강제하고, 상속의 취득일은 **상속개시일**이기 때문이다
 *    (피상속인 취득일은 `decedentAcquisitionDate` 별도 필드).
 *    ⇒ 통산 요건 자체가 성립하지 않는다. 「명문 부재 = 유리」는 **불리한 적용을 막는 원칙**이지
 *      **없는 혜택을 만드는 근거가 아니다**.
 *    설계: `docs/02-design/features/non-housing-to-housing-conversion-inheritance-c21.plan.md` D-1
 *
 * 게이트를 `consolidateResidenceMonths`가 아니라 여기에 둔 이유 — 그쪽은 호출부가 인자를
 * 직접 넘기는 최소입력 헬퍼라 6개 호출부의 인자 동일성에 의존하게 된다. 여기서는
 * `ResidenceReqInput`이 이미 담고 있는 필드로 **내부 도출**해 호출부가 값을 고를 여지를 없앤다.
 * (겸용주택 어댑터가 `consolidateResidenceMonths`를 직접 호출하지만, 그 경로는
 *  `nonHousingToHousingConversion`을 아예 전달하지 않고 C-14가 조합을 차단해 우회가 불가능하다.)
 *
 * ⭐ **여기 들어오는 `residencePeriodMonths`는 이미 클램프된 값**이다(API 변환 계층
 *    `clampResidenceToHousingPeriod` — 주거용 사용일 이전 거주를 잘라냈다). 그 클램프의 근거는
 *    **§154① 괄호의 「그 보유기간 중 거주기간이 2년 이상」 + §154⑤ 단서**(그 보유기간을
 *    주거용 사용일부터로 재정의)다 — 문언 그대로이지 창작이 아니다.
 *    종전 계획서 R-G의 「명문 없는 불리 적용」 서술은 ①의 「그 보유기간 중」을 놓친 것이었다.
 *    세액 anchor: `non-housing-to-housing-conversion.engine.test.ts` R-G-1~R-G-3.
 */
export function resolveExemptionResidenceMonths(input: ResidenceReqInput): number {
  if (input.nonHousingToHousingConversion) return input.residencePeriodMonths;
  return consolidateResidenceMonths(input.residencePeriodMonths, input);
}

/**
 * §154① **비과세 거주요건** 판정에 쓰는 거주 개월 = §154⑧3호 통산값(`resolveExemptionResidenceMonths`) + 증여 전 동일세대 거주 개월 (결정 #38-7).
 *
 * 증여받은 주택을 증여자와 계속 같은 세대로 보유한 것으로 확인된 경우(`giftHouseholdConsolidationStart`)에만 증여 전 거주 개월을 더한다 —
 * 보유기간 통산(`giftHouseholdHoldingStart`)과 같은 성립 조건이다. 두 기간은 증여일을 경계로 겹치지 않아 단순 합산이 정확하다.
 *
 * 🔴 **표2 대상 판정에는 이 함수를 쓰지 않는다** — 그쪽은 `resolveExemptionResidenceMonths`다(별건 #38-9: 증여 전 거주를 표2 대상 판정에 통산할지는
 *    해석이 갈려 사용자 결정 대기). 통산하면 표2 대상이 되는 경우는 결과에 확인 필요로만 고지한다(`gift-table2-notice.ts`).
 *
 * 근거: 서면인터넷방문상담4팀-912(2005.6.10.) — 동일세대원에게 증여한 뒤 수증자가 양도하면 증여자의 보유기간 및 거주기간을 통산해 비과세 여부를 판정.
 * ⚠️ 그 회신은 배우자 지분 증여를 다룬 2005년 사안이라 주택 전부 증여·현행 조정대상지역 거주요건의 정면 해석은 확인하지 못했다.
 */
export function resolveExemptionRequirementResidenceMonths(input: ResidenceReqInput): number {
  return resolveExemptionResidenceMonths(input) + giftHouseholdPriorResidenceMonths(input.giftHouseholdBasis);
}

