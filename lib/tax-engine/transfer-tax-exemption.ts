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

import { isLaterAcquiredLandHeldTooShort } from "./transfer-tax-appurtenant-land";
import { isWithinPeriod } from "./civil-period";
import { resolveArticle89Clause2 } from "./transfer-tax-89-2-exclusion";
import { calculateHoldingPeriod } from "./tax-utils";
import { resolveHighValueHouseThreshold } from "./one-house/threshold";
import { TRANSFER, shortArticle } from "./legal-codes";
import type {
  OneHouseAppliedException,
  OneHouseCoreVerdict,
  OneHouseJudgeInput,
  OneHouseJudgment,
} from "./one-house/types";
import {
  collectPendingConditions,
  collectUndetermined,
  collectUnmetExceptions,
  meetsTemporaryTwoHousePrevHolding,
} from "./one-house/pending";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";

import {
  DISPOSAL_DELAY_REASON_LABEL,
  evaluateTemporaryTwoHouseTiming,
  meetsOneHouseHoldingResidence,
  PROVISO_LABEL,
  qualifiesRuralHouse,
  qualifiesUnavoidableOutsideCapital,
  REPLACEMENT_HOUSE_3YR_TRANSFER_START,
  REPLACEMENT_HOUSE_DEADLINE_YEARS_NEW,
  REPLACEMENT_HOUSE_DEADLINE_YEARS_OLD,
  resolveExemptionHoldingStartDate,
  qualifiesLongTermMortgageContract,
  qualifiesLongTermMortgageResidenceExemption,
  qualifiesWinWinRental,
  resolveMergeDeeming,
  resolveMergeOverlapDeeming,
  RURAL_HOUSE_LABEL,
  UNAVOIDABLE_REASON_LABEL,
} from "./transfer-tax-exemption-requirements";

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

/** 「§156의2⑤」 — `exemptReason` 라벨은 공백 없는 축약을 쓴다(동치 비교용 `§156의2 ⑤`와 다르다). */
const REPLACEMENT_HOUSE_SHORT = shortArticle(TRANSFER.REPLACEMENT_HOUSE_156_2_5).replace(" ", "");
/** 합가 중첩 라벨이 쓰는 항 기호 — 조문 번호의 단일 소스에서 뽑는다. */
const MARRIAGE_CLAUSE = shortArticle(TRANSFER.MARRIAGE_MERGE_EXEMPT).replace("§155", "");
const PARENTAL_CARE_CLAUSE = shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT).replace("§155", "");

export function checkExemption(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  presaleRightStartDate?: Date,
): OneHouseJudgment {
  const article89Clause2 = resolveArticle89Clause2(input, presaleRightStartDate);

  /**
   * 🔑 §89② 배제가 확정이어도 **본체 판정을 계산한다**(P4-1).
   *
   * 종전에는 배제면 여기서 단락했다. 그러면 「§89②만 아니었다면 비과세였는가」를 알 수 없고,
   * 판정 메뉴가 「권리 취득일부터 3년 내에 양도했어야 한다」를 **말해도 되는지** 판단할 수 없다
   * (보유 2년도 못 채운 세대에게 그 안내를 하면 틀린 약속이다 — `pending.ts` 계약 주석).
   *
   * ⚠️ **세액은 불변**이다 — 배제면 반환하는 판정은 종전과 똑같이 `{false, false}`이고
   *    `deemedOneHouseBy155`·`exemptReason`도 새지 않는다(아래 `verdict` 삼항). 순수 함수를
   *    한 번 더 부르는 것뿐이다.
   */
  const core = checkExemptionCore(input, oneHouseRules);
  const excluded = article89Clause2.status === "excluded";
  const coreWouldPass = core.isExempt || core.isPartialExempt;
  const verdict: OneHouseCoreVerdict = excluded
    ? { isExempt: false, isPartialExempt: false }
    : core;

  const settled = verdict.isExempt || verdict.isPartialExempt;
  const appliedExceptions = verdict.appliedExceptions ?? [];
  // 이미 비과세·부분과세면 「무엇을 더 하면」이 없다 — pending은 과세를 뒤집는 조건만 담는다.
  const pending = settled
    ? []
    : collectPendingConditions(input, oneHouseRules, article89Clause2, coreWouldPass);

  /**
   * 「선언했는데 왜 적용 안 됐나」 — **`coreWouldPass`로 막는다**(`settled`가 아니다).
   *
   * §89② 배제면 `settled === false`지만 본체 판정은 통과했다. 그 경우 합가 특례는 실제로
   * **성립했고** 다른 조문이 결론을 뒤집은 것이므로, 「합가가 적용되지 않았다」는 안내는
   * 거짓이 된다. 본체가 통과한 경우는 사유를 내지 않는다.
   */
  const unmetExceptions =
    settled || coreWouldPass ? [] : collectUnmetExceptions(input, oneHouseRules);

  return {
    ...verdict,
    article89Clause2,
    appliedExceptions,
    pending,
    undetermined: collectUndetermined(input, oneHouseRules, article89Clause2, settled),
    unmetExceptions,
    legalBasis: dedupeLegalBasis([
      ...appliedExceptions.map((e) => e.legalBasis),
      ...pending.map((p) => p.legalBasis),
    ]),
  };
}

/** 근거 조문 목록 — 입력 순서를 유지한 채 중복만 제거한다(표시 순서가 곧 판정 순서다). */
function dedupeLegalBasis(values: string[]): string[] {
  return [...new Set(values)];
}

function checkExemptionCore(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
): OneHouseCoreVerdict {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  /**
   * 고가주택 기준금액 — **양도일** 기준 시점 함수 (G-5).
   *
   * 종전에는 세율 seed의 `one_house_exemption.maxExemptPrice`(12억 단일값)를 읽었다.
   * 그 값은 시점을 표현하지 못해 2021-12-07·2008-10-06 양도를 **전액 비과세**로 만들었다.
   * 다건 route는 과세기간 말일로 세율 행을 고르므로 규칙 행으로는 애초에 자산별 양도일을
   * 표현할 수 없다 — 그래서 기준금액의 단일 소스를 규칙 행에서 이 함수로 옮겼다.
   *
   * ⚠️ 이 값을 쓰는 **판정**과, 그 판정을 소비하는 **안분**은 반드시 같은 값을 봐야 한다.
   *    (`calcOneHouseProration` · `transfer-tax-lthd` 분리 안분 · 겸용 · 재개발 안분)
   */
  const highValueThreshold = resolveHighValueHouseThreshold(input.transferDate);

  /**
   * §91① — 미등기양도자산에는 **비과세** 규정을 적용하지 아니한다.
   *
   * 「제104조제3항에서 규정하는 미등기양도자산에 대하여는 이 법 또는 이 법 외의 법률 중
   *  양도소득에 대한 소득세의 비과세에 관한 규정을 적용하지 아니한다.」
   *
   * 이 함수가 §89①3호(1세대1주택)·§155 각 특례를 **전부** 판정하는 단일 진입점이므로
   * 여기서 한 번 막으면 전액 비과세·12억 초과 부분 비과세가 함께 배제된다.
   *
   * ⚠️ **이 조문이 배제하는 것은 「비과세」뿐이다** — 감면 배제는 §91②(매매계약서 거래가액
   *    허위기재) 사유다. 다만 미등기양도자산의 **감면** 배제는 **조세특례제한법 §129②**가 따로
   *    정한다(「…미등기양도자산에 대해서는 양도소득세의 비과세 및 감면에 관한 규정을 적용하지
   *    아니한다」). 그 게이트는 감면 진입점에 있다 — `unregisteredReductionNotice`
   *    (`transfer-tax-reductions-calc.ts`) 참조(D15, 2026-09-18). 이 함수는 비과세만 맡는다.
   *
   * 겸용주택 경로는 자체 게이트를 이미 갖고 있다(`transfer-tax-mixed-use.ts:135-139`) —
   * 이중 적용돼도 결과는 같다(양쪽 다 배제).
   */
  if (input.isUnregistered) {
    return { isExempt: false, isPartialExempt: false };
  }

  /**
   * F-13 — 일괄양도에서 따로 입력된 **주택부수토지(배율 이내) 카드**는 짝 주택의 판정을 따른다.
   *
   * 「소득세법」 §89①3호: 비과세 대상은 「각 목의 주택」과 「주택부수토지」이고, 12억 판정은 「주택 및 이에 딸린
   * 토지의 양도 당시 실지거래가액의 합계액」이다. 합산 엔진이 주택 카드를 먼저 계산해 그 판정(합계액 기준)을
   * `appurtenantHouseVerdict`로 주입한다. 이 카드의 12억 안분 분모도 합계액(`totalPropertyTransferPrice`)이다.
   * 다만 주택보다 **나중에** 취득해 부수토지로서 2년을 못 채웠으면 비과세가 아니다(단일 입력 G-3과 같은 함수).
   */
  if (input.oneHouseUnitRole === "appurtenant_land") {
    const v = input.appurtenantHouseVerdict;
    if (!v || !(v.isExempt || v.isPartialExempt)) return { isExempt: false, isPartialExempt: false };
    if (isLaterAcquiredLandHeldTooShort(input.acquisitionDate, v.houseAcquisitionDate, input.transferDate)) {
      return { isExempt: false, isPartialExempt: false };
    }
    return {
      isExempt: v.isExempt,
      isPartialExempt: v.isPartialExempt,
      exemptReason: v.isExempt ? "주택부수토지 — 1세대1주택 비과세" : "주택부수토지 — 1세대1주택 고가주택",
      // 짝 주택이 **어떤 특례로** 비과세가 됐는지는 `appurtenantHouseVerdict`에 담겨 오지 않는다
      // (isExempt·isPartialExempt·houseAcquisitionDate뿐). 여기서는 부수토지 근거만 낸다.
      appliedExceptions: [
        {
          id: "89-1-3-appurtenant-land",
          label: "주택부수토지 — 짝 주택의 판정을 따름",
          legalBasis: TRANSFER.ONE_HOUSE_EXEMPT,
        },
      ],
    };
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
      isWithinPeriod(rh.completionDate, deadlineYears, input.transferDate);
    // ③ 신축주택 1년 이상 거주 (전제 — 자기선언, 미충족 시 §156의2⑬ 추징)
    const meetsNewHouseResidence = rh.willResideNewHouse === true;

    if (meetsAcquisition && meetsTransferTiming && meetsNewHouseResidence) {
      const priceCheck =
        input.burdenedGiftDenominator ??
        input.totalPropertyTransferPrice ??
        input.transferPrice;
      const exceptions: OneHouseAppliedException[] = [
        {
          id: "156-2-5-replacement-house",
          label: "재개발·재건축 대체주택 특례",
          legalBasis: TRANSFER.REPLACEMENT_HOUSE_156_2_5,
        },
      ];
      if (priceCheck <= highValueThreshold) {
        return {
          isExempt: true,
          isPartialExempt: false,
          exemptReason: `대체주택 특례 비과세 (${REPLACEMENT_HOUSE_SHORT})`,
          appliedExceptions: exceptions,
        };
      }
      return {
        isExempt: false,
        isPartialExempt: true,
        exemptReason: `대체주택 특례 고가주택 (${REPLACEMENT_HOUSE_SHORT})`,
        appliedExceptions: exceptions,
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
    // 🔑 P4-1 — 인라인이던 이 2줄을 `one-house/pending.ts`의 `meetsTemporaryTwoHousePrevHolding`
    //    으로 추출했다. 기한 수집기가 「처분기한만 미충족인가」를 판정할 때 **같은 술어**를 써야
    //    §154⑤·§154⑧3호 기산일 보정이 한쪽에만 반영되는 일이 없다. 동작은 불변이다.
    const meetsPrevHolding = meetsTemporaryTwoHousePrevHolding(input, rule, provisoRelaxesHolding);

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
      // 🔑 P4-1 — 같은 근거를 **구조화**해서도 낸다(`appliedExceptions`). 문자열 쪽은 그대로 둔다:
      //    `transfer-tax.ts:346·355`가 `exemptReason`을 부분문자열로 읽어 경고를 만들기 때문이다.
      const basisParts: string[] = [];
      const exceptions: OneHouseAppliedException[] = [
        {
          id: "155-1-temporary-two-house",
          label: "일시적 2주택",
          legalBasis: TRANSFER.TEMPORARY_TWO_HOUSE,
        },
      ];
      if (provisoRelaxesHolding) {
        basisParts.push(`§154① 단서 ${PROVISO_LABEL[provisoReason!]}`);
        exceptions.push({
          id: `154-1-proviso:${provisoReason!}`,
          label: `§154① 단서 ${PROVISO_LABEL[provisoReason!]}`,
          legalBasis: TRANSFER.ONE_HOUSE_REQUIREMENT,
        });
      }
      if (input.temporaryTwoHouse.publicInstitutionRelocation) {
        basisParts.push("§155⑯ 지방이전 처분기한 5년·1년요건 면제");
        exceptions.push({
          id: "155-16-public-institution-relocation",
          label: "§155⑯ 지방이전 처분기한 5년·1년요건 면제",
          legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}⑯`,
        });
      }
      if (input.temporaryTwoHouse.disposalDelayReason) {
        const delayLabel = DISPOSAL_DELAY_REASON_LABEL[input.temporaryTwoHouse.disposalDelayReason];
        basisParts.push(`§155⑱ ${delayLabel}`);
        exceptions.push({
          id: `155-18-disposal-delay:${input.temporaryTwoHouse.disposalDelayReason}`,
          label: `§155⑱ ${delayLabel}`,
          legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}⑱`,
        });
      }
      const provisoLabel = basisParts.length > 0 ? ` (${basisParts.join(" · ")})` : "";
      // §155①은 "1세대1주택으로 보아 §154①을 적용" — 고가주택 배제(§89①3괄호)·12억 초과분
      // 안분(§95③·§160)도 동일 적용. E-1/E-3.5/E-5와 같은 priceCheck 패턴.
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      if (priceCheck <= highValueThreshold) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `일시적 2주택 비과세${provisoLabel}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `일시적 2주택 고가주택${provisoLabel}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
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
      const basis = ` (${shortArticle(TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL)} ${UNAVOIDABLE_REASON_LABEL[u.reason]})`;
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      const exceptions: OneHouseAppliedException[] = [
        {
          id: `155-8-unavoidable:${u.reason}`,
          label: `수도권 밖 부득이한 사유 주택 (${UNAVOIDABLE_REASON_LABEL[u.reason]})`,
          legalBasis: TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL,
        },
      ];
      if (priceCheck <= highValueThreshold) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `${label} 비과세${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `${label} 고가주택${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
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
    const basis = ` (${shortArticle(TRANSFER.CULTURAL_HERITAGE_HOUSE)})`;
    const priceCheck =
      input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
    const exceptions: OneHouseAppliedException[] = [
      {
        id: "155-6-1ho-cultural-heritage",
        label: "문화유산 주택",
        legalBasis: TRANSFER.CULTURAL_HERITAGE_HOUSE,
      },
    ];
    if (priceCheck <= highValueThreshold) {
      return { isExempt: true, isPartialExempt: false, exemptReason: `문화유산 주택 비과세${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
    }
    return { isExempt: false, isPartialExempt: true, exemptReason: `문화유산 주택 고가주택${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
  }

  // E-3.8: §155⑦ 농어촌주택 + 일반주택 → **일반주택 양도**를 1주택 의제.
  if (qualifiesRuralHouse(input) && meetsOneHouseHoldingResidence(input, rule)) {
    const basis = ` (§155⑦${RURAL_HOUSE_LABEL[input.ruralHouse!.kind]})`;
    const priceCheck =
      input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
    const exceptions: OneHouseAppliedException[] = [
      {
        id: `155-7-rural:${input.ruralHouse!.kind}`,
        label: `농어촌주택 (${RURAL_HOUSE_LABEL[input.ruralHouse!.kind]})`,
        legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}⑦`,
      },
    ];
    if (priceCheck <= highValueThreshold) {
      return { isExempt: true, isPartialExempt: false, exemptReason: `농어촌주택 비과세${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
    }
    return { isExempt: false, isPartialExempt: true, exemptReason: `농어촌주택 고가주택${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
  }

  // E-3.5: 합가 비과세 (§155④⑤ 혼인·동거봉양) — 합가일부터 10년 내 "먼저 양도" 주택 1세대1주택 의제.
  // 의제 성립(①)은 중과 배제(영 §167의10①15호)와 **같은 정본** `resolveMergeDeeming`이 판정하고,
  // 여기서는 §154① 보유·거주(②)만 더 본다.
  {
    // F-1 — ①(일시적 2주택)과 겹쳐 3주택이 된 경우도 국세청 해석상 §154①이 적용된다.
    const mergeBasis = resolveMergeDeeming(input) ?? resolveMergeOverlapDeeming(input, twoHouseRule);
    if (mergeBasis && meetsOneHouseHoldingResidence(input, rule)) {
      const isMarriage = mergeBasis.startsWith("marriage");
      const mergeLabel = mergeBasis.endsWith("_overlap")
        ? `일시적 2주택·${isMarriage ? "혼인" : "동거봉양"} 합가 중첩 (${shortArticle(TRANSFER.TEMPORARY_TWO_HOUSE)}①·${isMarriage ? MARRIAGE_CLAUSE : PARENTAL_CARE_CLAUSE})`
        : isMarriage
          ? `혼인 합가 (${shortArticle(TRANSFER.MARRIAGE_MERGE_EXEMPT)})`
          : `동거봉양 합가 (${shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT)})`;
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      // 중첩(§155①·④⑤)이면 두 조문이 함께 근거다 — 한 줄로 합치지 않고 행을 나눈다.
      const exceptions: OneHouseAppliedException[] = mergeBasis.endsWith("_overlap")
        ? [
            { id: "155-1-temporary-two-house", label: "일시적 2주택", legalBasis: TRANSFER.TEMPORARY_TWO_HOUSE },
            {
              id: isMarriage ? "155-5-marriage-merge" : "155-4-parental-care-merge",
              label: isMarriage ? "혼인 합가" : "동거봉양 합가",
              legalBasis: isMarriage ? TRANSFER.MARRIAGE_MERGE_EXEMPT : TRANSFER.PARENTAL_CARE_MERGE_EXEMPT,
            },
          ]
        : [
            {
              id: isMarriage ? "155-5-marriage-merge" : "155-4-parental-care-merge",
              label: isMarriage ? "혼인 합가" : "동거봉양 합가",
              legalBasis: isMarriage ? TRANSFER.MARRIAGE_MERGE_EXEMPT : TRANSFER.PARENTAL_CARE_MERGE_EXEMPT,
            },
          ];
      if (priceCheck <= highValueThreshold) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `${mergeLabel} 1세대1주택 비과세`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `${mergeLabel} 고가주택`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
    }
  }

  /**
   * E-3.9: §155의2② — 담보주택 보유 **직계존속 동거봉양 합가**로 2주택이 된 경우,
   * 「먼저 양도하는 주택에 대하여는 국내에 1개의 주택을 소유하고 있는 것으로 보아 §154①을 적용」.
   *
   * ⚠️ E-3.5(§155④⑤ 합가) **뒤**에 둔다 — 둘 다 성립하면 §155④가 먼저 잡히고(결과 동일),
   *    §155④의 10년 기한이 지난 세대는 여기로 떨어진다. §155의2②에는 기한이 없다.
   * ⚠️ 거주기간 면제는 **양도하는 주택이 담보주택일 때만** 붙는다(「장기저당담보주택은」).
   *    담보주택이 아닌 쪽을 먼저 양도하면 의제만 서고 §154① 거주요건은 그대로 본다.
   * ⚠️ `deemedOneHouseBy155`는 **§159의4 표2 대상 축**이고, 같은 조가 §155의2를 명시 포함한다.
   *    중과 배제(§167의10①15호)는 「제155조 또는 조세특례제한법」만 열거하므로 **켜지 않는다** —
   *    그 축은 `resolveDeemedOneHouseBy155`가 따로 판정하며 여기서 건드리지 않는다.
   */
  {
    const mortgage = input.longTermMortgageHouse;
    if (
      mortgage?.parentalCareMerge === true &&
      input.householdHousingCount === 2 &&
      input.isFirstTransferredInMerge === true &&
      qualifiesLongTermMortgageContract(input) &&
      meetsOneHouseHoldingResidence(input, rule, qualifiesLongTermMortgageResidenceExemption(input))
    ) {
      const basis = ` (${shortArticle(TRANSFER.LONG_TERM_MORTGAGE_MERGE)})`;
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      const exceptions: OneHouseAppliedException[] = [
        {
          id: "155-2-2-long-term-mortgage-merge",
          label: "장기저당담보주택 동거봉양 합가",
          legalBasis: TRANSFER.LONG_TERM_MORTGAGE_MERGE,
        },
      ];
      // ①의 거주기간 면제가 함께 붙은 경우(양도 주택이 담보주택)만 그 조항도 근거로 낸다.
      if (qualifiesLongTermMortgageResidenceExemption(input)) {
        exceptions.push({
          id: "155-2-1-long-term-mortgage-residence",
          label: "장기저당담보주택 거주기간 제한 면제",
          legalBasis: TRANSFER.LONG_TERM_MORTGAGE_EXEMPT,
        });
      }
      if (priceCheck <= highValueThreshold) {
        return {
          isExempt: true,
          isPartialExempt: false,
          exemptReason: `장기저당담보주택 동거봉양 합가 1세대1주택 비과세${basis}`,
          appliedExceptions: exceptions,
          // 📌 전액 비과세는 상위가 조기 반환해 장특을 계산하지 않으므로 이 echo는 **무효과**다
          //    (뮤테이션으로 확인 — 끄고 돌려도 전건 통과). 형제 분기(E-3·E-3.5)와 모양을 맞춰
          //    남긴다. 실제로 표2를 여는 것은 아래 부분과세 분기의 같은 필드다.
          deemedOneHouseBy155: true,
        };
      }
      return {
        isExempt: false,
        isPartialExempt: true,
        exemptReason: `장기저당담보주택 동거봉양 합가 고가주택${basis}`,
        deemedOneHouseBy155: true,
        appliedExceptions: exceptions,
      };
    }
  }

  if (input.householdHousingCount !== 1) {
    return { isExempt: false, isPartialExempt: false };
  }

  // E-4: §154① 보유·거주 요건 (2017.8.3 이전 경과규정 포함) — meetsOneHouseHoldingResidence로 단일화
  //   §155의2① 장기저당담보주택(1주택 세대)은 **거주기간 제한 면제**를 여기서 주입한다.
  //   보유 2년은 면제되지 않는다 — 면제 대상이 거주기간뿐이라 `meetsHolding`은 그대로 판정된다.
  if (!meetsOneHouseHoldingResidence(input, rule, qualifiesLongTermMortgageResidenceExemption(input))) {
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
  /**
   * 본칙 1주택은 「특례」가 아니므로 기본 행을 만들지 않는다 — 판정 배지가 이미 말한다.
   * 요건을 **완화한 것이 있을 때만** 행이 선다(§154① 단서 · §155의2① · §155의3①).
   */
  const exceptions: OneHouseAppliedException[] = [];
  if (provisoReason) {
    exceptions.push({
      id: `154-1-proviso:${provisoReason}`,
      label: `§154① 단서 ${PROVISO_LABEL[provisoReason]}`,
      legalBasis: TRANSFER.ONE_HOUSE_REQUIREMENT,
    });
  }
  if (qualifiesLongTermMortgageResidenceExemption(input)) {
    exceptions.push({
      id: "155-2-1-long-term-mortgage-residence",
      label: "장기저당담보주택 거주기간 제한 면제",
      legalBasis: TRANSFER.LONG_TERM_MORTGAGE_EXEMPT,
    });
  }
  if (qualifiesWinWinRental(input)) {
    exceptions.push({
      id: "155-3-1-win-win-rental",
      label: "상생임대주택 거주기간 제한 면제",
      legalBasis: TRANSFER.WIN_WIN_RENTAL_EXEMPT,
    });
  }
  if (exemptionPriceCheck <= highValueThreshold) {
    return { isExempt: true, isPartialExempt: false, exemptReason: `1세대1주택 비과세${provisoLabel}`, appliedExceptions: exceptions };
  }

  // E-2: 부분과세 (양도가 12억 초과)
  return { isExempt: false, isPartialExempt: true, exemptReason: `1세대1주택 고가주택${provisoLabel}`, appliedExceptions: exceptions };
}
