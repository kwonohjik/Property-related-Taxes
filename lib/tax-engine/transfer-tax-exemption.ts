/**
 * 1세대1주택 비과세 판단 — **평가기** (소득세법 §89①3호·시행령 §154)
 *
 * transfer-tax-helpers.ts H-2 블록을 800줄 정책 준수를 위해 분리한 것이 이 파일이고,
 * 그 뒤 858줄로 다시 넘겨 **요건 술어부**를 `transfer-tax-exemption-requirements.ts`로
 * 한 번 더 갈랐다(CB-08). 여기 남은 것은 `checkExemption`·`checkExemptionCore`다.
 *
 * 하위 호환: 술어부를 전부 재수출하므로 이 모듈을 import하던 곳은 **무변경**이다.
 * `transfer-tax-helpers.ts`도 checkExemption·meetsOneHouseHoldingResidence·
 * resolveExemptionProviso 를 계속 재수출한다.
 *
 *   E-1: 전액 비과세 (양도가 12억 이하) / E-2: 고가주택 부분과세
 */

import { addYears } from "date-fns";
import { resolveArticle89Clause2 } from "./transfer-tax-89-2-exclusion";
import { calculateHoldingPeriod } from "./tax-utils";
import type { TransferTaxInput } from "./types/transfer.types";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";

import {
  DISPOSAL_DELAY_REASON_LABEL,
  evaluateTemporaryTwoHouseTiming,
  meetsOneHouseHoldingResidence,
  MERGE_EXEMPTION_YEARS,
  PROVISO_LABEL,
  qualifiesRuralHouse,
  qualifiesUnavoidableOutsideCapital,
  REPLACEMENT_HOUSE_3YR_TRANSFER_START,
  REPLACEMENT_HOUSE_DEADLINE_YEARS_NEW,
  REPLACEMENT_HOUSE_DEADLINE_YEARS_OLD,
  resolveExemptionHoldingStartDate,
  RURAL_HOUSE_LABEL,
  UNAVOIDABLE_REASON_LABEL,
} from "./transfer-tax-exemption-requirements";
import type { ExemptionResult } from "./transfer-tax-exemption-requirements";

// ── 요건 술어부 재수출 (분리 전 import 경로 보존 — CB-08) ──
export * from "./transfer-tax-exemption-requirements";

/**
 * 1세대1주택 비과세 판정 — §89①3호·§155 각 특례의 **단일 진입점**.
 *
 * §89②(주택 + 조합원입주권·분양권 보유 세대) 판정을 먼저 태우고, 그 결과를 모든 반환에 echo한다.
 * 배제가 **확정**된 경우에만 §89①3호를 끄고, 판정 불가면 종전 동작을 유지한다 —
 * 상위(`transfer-tax.ts`)가 그 사실을 경고로 노출한다.
 *
 * @param presaleRightStartDate §88 10호 「분양권」 정의 시행일 — DB
 *   `houseCountExclusionRules.presaleRightStartDate`. §89② 판정에서 **분양권 축의 취득일
 *   게이트**로 쓴다. 미제공 시 분양권은 판정하지 않는다(기산일을 모르는 채 불리하게 적용하지
 *   않는다 — §104⑦ 주택 수와 같은 값을 공유한다).
 */
export function checkExemption(
  input: TransferTaxInput,
  oneHouseRules: OneHouseSpecialRulesData,
  presaleRightStartDate?: Date,
): ExemptionResult {
  const article89Clause2 = resolveArticle89Clause2(input, presaleRightStartDate);
  if (article89Clause2.status === "excluded") {
    return { isExempt: false, isPartialExempt: false, article89Clause2 };
  }
  return { ...checkExemptionCore(input, oneHouseRules), article89Clause2 };
}

function checkExemptionCore(
  input: TransferTaxInput,
  oneHouseRules: OneHouseSpecialRulesData,
): ExemptionResult {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  /**
   * §91① — 미등기양도자산에는 **비과세** 규정을 적용하지 아니한다.
   *
   * 「제104조제3항에서 규정하는 미등기양도자산에 대하여는 이 법 또는 이 법 외의 법률 중
   *  양도소득에 대한 소득세의 비과세에 관한 규정을 적용하지 아니한다.」
   *
   * 이 함수가 §89①3호(1세대1주택)·§155 각 특례를 **전부** 판정하는 단일 진입점이므로
   * 여기서 한 번 막으면 전액 비과세·12억 초과 부분 비과세가 함께 배제된다.
   *
   * ⚠️ **배제 대상은 「비과세」뿐이다.** 조문 표제가 「비과세 또는 감면의 배제 등」이라
   *    오독하기 쉬우나, 감면 배제는 §91②(매매계약서 거래가액 허위기재) 사유이고 미등기를
   *    사유로 한 감면 배제는 §91에 없다 — 감면까지 끄면 법 근거 없는 불리 적용이 된다.
   *    따라서 이 게이트는 `checkExemption` 안에만 두고 감면 라우터는 건드리지 않는다.
   *
   * 겸용주택 경로는 자체 게이트를 이미 갖고 있다(`transfer-tax-mixed-use.ts:135-139`) —
   * 이중 적용돼도 결과는 같다(양쪽 다 배제).
   */
  if (input.isUnregistered) {
    return { isExempt: false, isPartialExempt: false };
  }

  if (!input.isOneHousehold || input.propertyType !== "housing") {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-5: §156의2⑤ 대체주택 특례 — 재개발·재건축 시행기간 중 거주 목적 대체주택.
  // 신축주택+대체주택 2주택이나 대체주택 양도를 1세대1주택으로 의제(§154① 보유·거주 요건 면제).
  // 요건 미충족 시 fall through(일반 과세). 사후관리(§156의2⑬) 추징 경고는 `transfer-tax.ts`가
  // `article89Clause2.exception`을 보고 낸다(2026-08-26 배선 — 종전에는 이 주석만 있고 경고가 없었다).
  if (input.replacementHouse) {
    const rh = input.replacementHouse;
    // ① 사업시행인가일 이후 대체주택 취득 + 1년 이상 거주
    const meetsAcquisition =
      input.acquisitionDate >= rh.businessApprovalDate &&
      Math.floor(rh.replacementResidenceMonths / 12) >= 1;
    // ④ 신축주택 완성 전 또는 완성 후 3년(2023.01.12 이후 양도분; 구 2년)내 대체주택 양도
    const deadlineYears =
      input.transferDate >= REPLACEMENT_HOUSE_3YR_TRANSFER_START
        ? REPLACEMENT_HOUSE_DEADLINE_YEARS_NEW
        : REPLACEMENT_HOUSE_DEADLINE_YEARS_OLD;
    const meetsTransferTiming =
      input.transferDate < rh.completionDate ||
      input.transferDate <= addYears(rh.completionDate, deadlineYears);
    // ③ 신축주택 1년 이상 거주 (전제 — 자기선언, 미충족 시 §156의2⑬ 추징)
    const meetsNewHouseResidence = rh.willResideNewHouse === true;

    if (meetsAcquisition && meetsTransferTiming && meetsNewHouseResidence) {
      const priceCheck =
        input.burdenedGiftDenominator ??
        input.totalPropertyTransferPrice ??
        input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return {
          isExempt: true,
          isPartialExempt: false,
          exemptReason: "대체주택 특례 비과세 (§156의2⑤)",
        };
      }
      return {
        isExempt: false,
        isPartialExempt: true,
        exemptReason: "대체주택 특례 고가주택 (§156의2⑤)",
      };
    }
  }

  // E-3: 일시적 2주택
  if (input.householdHousingCount === 2 && input.temporaryTwoHouse && twoHouseRule) {
    const provisoReason = input.oneHouseExemptionProviso?.reason;
    const { provisoRelaxesHolding, timing } = evaluateTemporaryTwoHouseTiming(input, twoHouseRule);

    /**
     * §154① 보유 2년 사전게이트 — 2026-08-13 F09로 **두 가지**를 고쳤다.
     *
     * (a) **기산일**을 `resolveExemptionHoldingStartDate` 정본으로 바꾼다. 종전에는
     *     `previousAcquisitionDate`로 raw 보유기간을 계산해, §154⑤(용도변경 주거용 사용일)·
     *     §154⑧3호(동일세대 상속 통산 backdate)를 반영한 정본이 「충족」이라 본 자산을
     *     12줄 뒤 정본 판정(`meetsOneHouseHoldingResidence`)보다 **먼저 거부**했다
     *     (실측: 동일세대 상속 통산 기산 2012-01-01인데 raw 1년 2개월로 차단 → 328,350,000).
     *
     * (b) **`return`이 아니라 조건 분기**로 바꾼다. 종전에는 일시적 2주택 토글이 켜져 있기만
     *     하면 아래 E-3.7(§155⑧)·E-3.8(§155⑦)·E-3.5(§155④⑤)가 **아예 평가되지 않았다**
     *     (실측: 농어촌·부득이·합가 단독이면 0원인데 토글 동시 ON이면 328,350,000).
     *
     * ⚠️ `!provisoRelaxesHolding` 화이트리스트 조건은 **유지**한다. `meetsOneHouseHoldingResidence`는
     *    proviso === "both"면 화이트리스트와 무관하게 보유요건을 면제하는데, 나·다목(해외이주·
     *    국외거주)을 §155① 준용에서 뺀 것은 `TEMP_TWO_HOUSE_PROVISO_REASONS`의 명시적 설계다.
     *    이 조건을 함께 없애면 다자산 경로(정규화 없음)에서 과다 비과세가 난다.
     */
    const prevHolding = calculateHoldingPeriod(
      resolveExemptionHoldingStartDate(input),
      input.transferDate,
    );
    const meetsPrevHolding =
      provisoRelaxesHolding || prevHolding.years >= rule.minHoldingYears;

    // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): 종전에는 타이밍(요건 A·B)만 보고
    //   비과세를 줬다. §155①은 "…국내에 1주택을 소유한 것으로 **보아 제154조제1항을 적용**한다"이므로
    //   종전주택 자체가 **§154①의 보유 2년 + (취득 당시 조정대상지역이면) 거주 2년**을 충족해야 한다.
    //   검증이 없어 거주 0년인 조정지역 취득 종전주택도 비과세됐다(비과세 과다 → 세액 과소).
    //   `meetsOneHouseHoldingResidence`가 §154① 단서(보유·거주 면제 사유)까지 함께 처리하므로
    //   `provisoRelaxesHolding` 케이스는 종전대로 통과한다.
    //   바로 아래 E-3.5(합가 §155④⑤)는 이미 "§154① 보유·거주"를 요건으로 명시하고 있어
    //   같은 조 구조에서 E-3만 빠져 있던 내부 불일치였다.
    if (meetsPrevHolding && timing.overall && meetsOneHouseHoldingResidence(input, rule)) {
      // 적용된 특례 근거를 결과에 남긴다 — 어느 조항으로 요건이 완화됐는지 납세자가 확인할 수 있어야 한다.
      const basisParts: string[] = [];
      if (provisoRelaxesHolding) basisParts.push(`§154① 단서 ${PROVISO_LABEL[provisoReason!]}`);
      if (input.temporaryTwoHouse.publicInstitutionRelocation) {
        basisParts.push("§155⑯ 지방이전 처분기한 5년·1년요건 면제");
      }
      if (input.temporaryTwoHouse.disposalDelayReason) {
        basisParts.push(`§155⑱ ${DISPOSAL_DELAY_REASON_LABEL[input.temporaryTwoHouse.disposalDelayReason]}`);
      }
      const provisoLabel = basisParts.length > 0 ? ` (${basisParts.join(" · ")})` : "";
      // §155①은 "1세대1주택으로 보아 §154①을 적용" — 고가주택 배제(§89①3괄호)·12억 초과분
      // 안분(§95③·§160)도 동일 적용. E-1/E-3.5/E-5와 같은 priceCheck 패턴.
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `일시적 2주택 비과세${provisoLabel}`, deemedOneHouseBy155: true };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `일시적 2주택 고가주택${provisoLabel}`, deemedOneHouseBy155: true };
    }
  }

  // E-3.7: §155⑧ 부득이한 사유로 취득한 수도권 밖 주택 + 일반주택 → **일반주택 양도**를 1주택 의제.
  //   "…각각 1개씩 소유하고 있는 1세대가 …일반주택을 양도하는 경우에는 국내에 1개의 주택을
  //    소유하고 있는 것으로 보아 제154조제1항을 적용한다."
  //   ⇒ ① 2주택일 것 ② 해소일부터 3년 이내 양도 ③ §154① 요건 충족(「§154①을 적용」이므로).
  if (qualifiesUnavoidableOutsideCapital(input)) {
    const u = input.unavoidableOutsideCapitalHouse!;
    if (meetsOneHouseHoldingResidence(input, rule)) {
      const label = `수도권 밖 부득이한 사유 주택`;
      const basis = ` (§155⑧ ${UNAVOIDABLE_REASON_LABEL[u.reason]})`;
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `${label} 비과세${basis}`, deemedOneHouseBy155: true };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `${label} 고가주택${basis}`, deemedOneHouseBy155: true };
    }
  }

  /**
   * E-3.6: §155⑥1호 문화유산 주택 + 일반주택 → **일반주택 양도**를 1주택 의제.
   *
   * > 다음 각 호의 어느 하나에 해당하는 주택과 그밖의 주택(일반주택)을 국내에 **각각 1개씩**
   * > 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 국내에 1개의 주택을 소유하고 있는
   * > 것으로 보아 **제154조제1항을 적용**한다.
   * >   1. 지정문화유산 · 국가등록문화유산 · 천연기념물등   2. **삭제**   3. **삭제**
   *
   * 🔑 2·3호가 삭제돼 요건은 **boolean 하나**다. 설계 문서는 「§155⑥ 자체가 미구현이므로 별도
   *    선행 과제」라 적었으나 **과대평가였다**(계획서 §4.2).
   * ⇒ ① 2주택일 것 ② 문화유산 주택 선언 ③ §154① 요건 충족(「§154①을 적용」이므로).
   */
  if (
    input.householdHousingCount === 2 &&
    input.culturalHeritageHouse === true &&
    meetsOneHouseHoldingResidence(input, rule)
  ) {
    const basis = " (§155⑥1호)";
    const priceCheck =
      input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
    if (priceCheck <= rule.maxExemptPrice) {
      return { isExempt: true, isPartialExempt: false, exemptReason: `문화유산 주택 비과세${basis}`, deemedOneHouseBy155: true };
    }
    return { isExempt: false, isPartialExempt: true, exemptReason: `문화유산 주택 고가주택${basis}`, deemedOneHouseBy155: true };
  }

  // E-3.8: §155⑦ 농어촌주택 + 일반주택 → **일반주택 양도**를 1주택 의제.
  if (qualifiesRuralHouse(input) && meetsOneHouseHoldingResidence(input, rule)) {
    const basis = ` (§155⑦${RURAL_HOUSE_LABEL[input.ruralHouse!.kind]})`;
    const priceCheck =
      input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
    if (priceCheck <= rule.maxExemptPrice) {
      return { isExempt: true, isPartialExempt: false, exemptReason: `농어촌주택 비과세${basis}`, deemedOneHouseBy155: true };
    }
    return { isExempt: false, isPartialExempt: true, exemptReason: `농어촌주택 고가주택${basis}`, deemedOneHouseBy155: true };
  }

  // E-3.5: 합가 비과세 (§155④⑤ 혼인·동거봉양) — 합가일부터 10년 내 "먼저 양도" 주택 1세대1주택 의제.
  // 요건: 2주택 + (marriageMerge | parentalCareMerge) + 선양도 + 양도주택 합가 전 취득 + §154① 보유·거주.
  if (
    input.householdHousingCount === 2 &&
    (input.marriageMerge || input.parentalCareMerge) &&
    input.isFirstTransferredInMerge === true
  ) {
    const mergeDate = input.marriageMerge?.marriageDate ?? input.parentalCareMerge?.mergeDate;
    if (
      mergeDate &&
      input.acquisitionDate < mergeDate && // 합가·혼인 전 취득
      input.transferDate <= addYears(mergeDate, MERGE_EXEMPTION_YEARS) && // 합가일부터 10년 내
      meetsOneHouseHoldingResidence(input, rule) // §154① 보유·거주 요건
    ) {
      const mergeLabel = input.marriageMerge ? "혼인 합가 (§155⑤)" : "동거봉양 합가 (§155④)";
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      if (priceCheck <= rule.maxExemptPrice) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `${mergeLabel} 1세대1주택 비과세`, deemedOneHouseBy155: true };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `${mergeLabel} 고가주택`, deemedOneHouseBy155: true };
    }
  }

  if (input.householdHousingCount !== 1) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-4: §154① 보유·거주 요건 (2017.8.3 이전 경과규정 포함) — meetsOneHouseHoldingResidence로 단일화
  if (!meetsOneHouseHoldingResidence(input, rule)) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-1: 전액 비과세 (양도가 12억 이하)
  // 우선순위:
  //   1) burdenedGiftDenominator (부담부증여 — D-0-2 해석 B: 분모 = giftValuation C)
  //   2) totalPropertyTransferPrice (지분 모드 — 총 물건가)
  //   3) transferPrice (단독 모드 fallback)
  const exemptionPriceCheck =
    input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
  // §154① 단서 각호 적용 시 비과세 사유에 호 라벨 부가 (result detail·PDF·step formula 자동 노출)
  const provisoReason = input.oneHouseExemptionProviso?.reason;
  const provisoLabel = provisoReason ? ` (§154① 단서 ${PROVISO_LABEL[provisoReason]})` : "";
  if (exemptionPriceCheck <= rule.maxExemptPrice) {
    return { isExempt: true, isPartialExempt: false, exemptReason: `1세대1주택 비과세${provisoLabel}` };
  }

  // E-2: 부분과세 (양도가 12억 초과)
  return { isExempt: false, isPartialExempt: true, exemptReason: `1세대1주택 고가주택${provisoLabel}` };
}
