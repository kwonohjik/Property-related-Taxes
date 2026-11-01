/**
 * §155⑥⑦⑧·④⑤·§155의2② 의제 1세대1주택 판정 — `transfer-tax-exemption.ts` 800줄 정책 분리(순서·로직 그대로).
 *
 * 각 분기는 의제 성립과 §154① 보유·거주(「제154조제1항을 적용」)를 함께 본다. 아무 분기도 성립하지 않으면
 * `undefined`를 돌려 호출부(`checkExemptionCore`)가 다음 판정으로 넘어간다.
 */
import { TRANSFER, shortArticle } from "../legal-codes";
import type { OneHouseSpecialRulesData } from "../schemas/rate-table.schema";
import {
  doubleMergeOrderOf,
  meetsOneHouseHoldingResidence,
  qualifiesCulturalHeritageHouse,
  qualifiesLongTermMortgageContract,
  qualifiesLongTermMortgageResidenceExemption,
  qualifiesRuralHouse,
  qualifiesUnavoidableOutsideCapital,
  resolveDoubleMergeDeeming,
  resolveMergeDeeming,
  resolveMergeOverlapDeeming,
  RURAL_HOUSE_LABEL,
  UNAVOIDABLE_REASON_LABEL,
} from "../transfer-tax-exemption-requirements";
import { decisiveProvisoException } from "./decisive-proviso";
import type { OneHouseAppliedException, OneHouseCoreVerdict, OneHouseJudgeInput } from "./types";

/** 합가 중첩 라벨이 쓰는 항 기호 — 조문 번호의 단일 소스에서 뽑는다. */
const MARRIAGE_CLAUSE = shortArticle(TRANSFER.MARRIAGE_MERGE_EXEMPT).replace("§155", "");
const PARENTAL_CARE_CLAUSE = shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT).replace("§155", "");

export function checkDeemedOneHouseVerdict(
  input: OneHouseJudgeInput,
  oneHouseRules: OneHouseSpecialRulesData,
  highValueThreshold: number,
): OneHouseCoreVerdict | undefined {
  const { one_house_exemption: rule, temporary_two_house: twoHouseRule } = oneHouseRules;

  // E-3.7: §155⑧ 부득이한 사유로 취득한 수도권 밖 주택 + 일반주택 → **일반주택 양도**를 1주택 의제.
  //   "…각각 1개씩 소유하고 있는 1세대가 …일반주택을 양도하는 경우에는 국내에 1개의 주택을
  //    소유하고 있는 것으로 보아 제154조제1항을 적용한다."
  //   ⇒ ① 2주택일 것 ② 해소일부터 3년 이내 양도 ③ §154① 요건 충족(「§154①을 적용」이므로).
  if (qualifiesUnavoidableOutsideCapital(input)) {
    const u = input.unavoidableOutsideCapitalHouse!;
    if (meetsOneHouseHoldingResidence(input, rule)) {
      const label = `수도권 밖 부득이한 사유 주택`;
      const proviso = decisiveProvisoException(input, rule); // V-F4 D-3 — 단서가 결론을 바꿨을 때만
      const basis = ` (${shortArticle(TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL)} ${UNAVOIDABLE_REASON_LABEL[u.reason]}${proviso ? ` · ${proviso.label}` : ""})`;
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      const exceptions: OneHouseAppliedException[] = [
        {
          id: `155-8-unavoidable:${u.reason}`,
          label: `수도권 밖 부득이한 사유 주택 (${UNAVOIDABLE_REASON_LABEL[u.reason]})`,
          legalBasis: TRANSFER.UNAVOIDABLE_OUTSIDE_CAPITAL,
        },
        ...(proviso ? [proviso] : []),
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
  if (qualifiesCulturalHeritageHouse(input) && meetsOneHouseHoldingResidence(input, rule)) {
    const proviso = decisiveProvisoException(input, rule); // V-F4 D-3
    const basis = ` (${shortArticle(TRANSFER.CULTURAL_HERITAGE_HOUSE)}${proviso ? ` · ${proviso.label}` : ""})`;
    const priceCheck =
      input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
    const exceptions: OneHouseAppliedException[] = [
      {
        id: "155-6-1ho-cultural-heritage",
        label: "문화유산 주택",
        legalBasis: TRANSFER.CULTURAL_HERITAGE_HOUSE,
      },
      ...(proviso ? [proviso] : []),
    ];
    if (priceCheck <= highValueThreshold) {
      return { isExempt: true, isPartialExempt: false, exemptReason: `문화유산 주택 비과세${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
    }
    return { isExempt: false, isPartialExempt: true, exemptReason: `문화유산 주택 고가주택${basis}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
  }

  // E-3.8: §155⑦ 농어촌주택 + 일반주택 → **일반주택 양도**를 1주택 의제.
  if (qualifiesRuralHouse(input) && meetsOneHouseHoldingResidence(input, rule)) {
    const proviso = decisiveProvisoException(input, rule); // V-F4 D-3
    const basis = ` (§155⑦${RURAL_HOUSE_LABEL[input.ruralHouse!.kind]}${proviso ? ` · ${proviso.label}` : ""})`;
    const priceCheck =
      input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
    const exceptions: OneHouseAppliedException[] = [
      {
        id: `155-7-rural:${input.ruralHouse!.kind}`,
        label: `농어촌주택 (${RURAL_HOUSE_LABEL[input.ruralHouse!.kind]})`,
        legalBasis: `${TRANSFER.TEMPORARY_TWO_HOUSE}⑦`,
      },
      ...(proviso ? [proviso] : []),
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
    // D4 — 혼인·동거봉양 이중 합가 3주택(서면인터넷방문상담4팀-598 · 역순은 대칭 — 2026-10-09). 두 합가 조문이 함께 근거다.
    const mergeBasis =
      resolveMergeDeeming(input) ??
      resolveMergeOverlapDeeming(input, twoHouseRule) ??
      (resolveDoubleMergeDeeming(input) ? ("double_merge" as const) : undefined);
    if (mergeBasis && meetsOneHouseHoldingResidence(input, rule)) {
      const isMarriage = mergeBasis.startsWith("marriage");
      const isDouble = mergeBasis === "double_merge";
      // D4 — 순서대로 적는다(혼인이 먼저면 「혼인 합가 후 동거봉양 합가」, 동거봉양이 먼저면 그 반대).
      const marriageFirst = doubleMergeOrderOf(input)?.first !== "parental_care";
      const mergeLabel = isDouble
        ? marriageFirst
          ? `혼인 합가 후 동거봉양 합가 (${shortArticle(TRANSFER.MARRIAGE_MERGE_EXEMPT)}·${PARENTAL_CARE_CLAUSE})`
          : `동거봉양 합가 후 혼인 합가 (${shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT)}·${MARRIAGE_CLAUSE})`
        : mergeBasis.endsWith("_overlap")
        ? `일시적 2주택·${isMarriage ? "혼인" : "동거봉양"} 합가 중첩 (${shortArticle(TRANSFER.TEMPORARY_TWO_HOUSE)}①·${isMarriage ? MARRIAGE_CLAUSE : PARENTAL_CARE_CLAUSE})`
        : isMarriage
          ? `혼인 합가 (${shortArticle(TRANSFER.MARRIAGE_MERGE_EXEMPT)})`
          : `동거봉양 합가 (${shortArticle(TRANSFER.PARENTAL_CARE_MERGE_EXEMPT)})`;
      const priceCheck =
        input.burdenedGiftDenominator ?? input.totalPropertyTransferPrice ?? input.transferPrice;
      // 중첩(§155①·④⑤)이면 두 조문이 함께 근거다 — 한 줄로 합치지 않고 행을 나눈다.
      const doubleExceptions: OneHouseAppliedException[] = [
        { id: "155-5-marriage-merge", label: "혼인 합가", legalBasis: TRANSFER.MARRIAGE_MERGE_EXEMPT },
        { id: "155-4-parental-care-merge", label: "동거봉양 합가", legalBasis: TRANSFER.PARENTAL_CARE_MERGE_EXEMPT },
      ];
      const exceptions: OneHouseAppliedException[] = isDouble
        ? marriageFirst
          ? doubleExceptions
          : [...doubleExceptions].reverse()
        : mergeBasis.endsWith("_overlap")
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
      // V-F4 D-3 — §154① 단서가 결론을 바꿨으면 근거로 남긴다(서면-2015-부동산-22330: 합가 × 3호에 「§155④ 및 §154① 단서 적용」)
      const proviso = decisiveProvisoException(input, rule);
      if (proviso) exceptions.push(proviso);
      const provisoLabel = proviso ? ` (${proviso.label})` : "";
      if (priceCheck <= highValueThreshold) {
        return { isExempt: true, isPartialExempt: false, exemptReason: `${mergeLabel} 1세대1주택 비과세${provisoLabel}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
      }
      return { isExempt: false, isPartialExempt: true, exemptReason: `${mergeLabel} 고가주택${provisoLabel}`, deemedOneHouseBy155: true, appliedExceptions: exceptions };
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
      // §154① 단서가 결론을 바꿨으면 근거로 남긴다 — 담보주택 거주기간 면제가 이미 풀었으면 단서가 가른 것이 아니다.
      const proviso = qualifiesLongTermMortgageResidenceExemption(input) ? undefined : decisiveProvisoException(input, rule);
      const basis = ` (${shortArticle(TRANSFER.LONG_TERM_MORTGAGE_MERGE)}${proviso ? ` · ${proviso.label}` : ""})`;
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
      if (proviso) exceptions.push(proviso);
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

  return undefined;
}
