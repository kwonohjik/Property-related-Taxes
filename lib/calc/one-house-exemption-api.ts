/**
 * ④⑬ 판정 메뉴 폼 → `POST /api/calc/one-house-exemption` 본문 (P4-2b-1)
 *
 * 계획서 §20.8 · UI 설계 §10 ④⑬.
 *
 * ## 🔑 필드 매핑을 **두 벌로 쓰지 않는다**
 *
 * 계산기의 변환 층은 `callTransferTaxAPI` 하나인데 **22파일 6,517줄**이고 본문 조립과 fetch가
 * 붙어 있다(부담부증여·겸용·재개발·공유지분·컴패니언 번들 — 판정 메뉴에 입력 위젯이 없는 축이
 * 대부분). 통째로 부를 수 없다.
 *
 * ⇒ 이미 분리돼 있는 **leaf 빌더를 그대로 호출**한다. §155 특례·명부·권리·§154① 단서의
 *   FLAT→nested 규칙이 계산기와 **같은 함수**에서 나와야, 두 화면이 같은 사실에 같은 답을 낸다
 *   (D-1 「화면은 나누고 엔진은 하나」의 배관 판).
 *   여기서 새로 쓰는 것은 **§155의2·§155의3 블록 둘뿐**이다 — 계산기 폼에는 그 필드가 없다(D-4).
 *
 * ## 판정에 필요 없는 값은 **중립 placeholder**로 보낸다
 *
 * `propertySchema`는 계산기와 공용이라 `acquisitionPrice`·`expenses` 등을 요구한다. 판정 메뉴는
 * 이 값을 묻지 않으므로 0을 보낸다 — 세액을 계산하지 않는 route라 결과에 영향이 없다.
 * 다만 `transferPrice`는 **양수 필수**이고 고가주택(12억 초과) 판정에 **실제로 쓰이므로**
 * 사용자에게 받는다(③ 예상 양도가액).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { buildHousesPayload } from "./transfer-tax-api-houses";
import { buildPresaleRightsPayload } from "./presale-rights-payload";
import { buildHouseholdSpecialPayload } from "./transfer-tax-api-body-blocks";
import {
  buildReplacementHousePayload,
  buildRightThreeYearExceptionPayload,
  buildMergedHouseholdFirstHousePayload,
  provisoGate,
  effectiveProvisoReason,
} from "./transfer-tax-api-helpers";
import {
  deriveJudgmentHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";

/**
 * §155의2 FLAT → nested. 토글 OFF이거나 계약체결일 미입력이면 **아예 보내지 않는다**
 * (Zod optional 계약 — 형제 빌더 `buildReplacementHousePayload`와 같은 규약).
 */
function buildLongTermMortgagePayload(form: OneHouseJudgmentFormData): object {
  if (!form.longTermMortgageSpecial || !form.longTermMortgageContractDate) return {};
  return {
    longTermMortgageHouse: {
      contractDate: form.longTermMortgageContractDate,
      borrowerAgeAtContract: parseInt(form.longTermMortgageBorrowerAge || "0", 10),
      contractYears: parseInt(form.longTermMortgageContractYears || "0", 10),
      maturityLumpSumRepayment: form.longTermMortgageMaturityLumpSum,
      transferredBeforeMaturity: form.longTermMortgageTransferredBeforeMaturity,
      isTransferredHouseMortgaged: form.longTermMortgageIsTransferredHouseMortgaged,
      ...(form.longTermMortgageParentalCareMerge ? { parentalCareMerge: true } : {}),
    },
  };
}

/**
 * §155의3 FLAT → nested.
 *
 * ⚠️ `increaseRatePct`는 **인하(음수)도 유효**하다 — 「5% 이하」 요건이라 인하는 당연히 충족이다.
 *    `parseAmount`류로 음수를 잘라내면 정당한 상생임대인이 탈락한다.
 */
function buildWinWinRentalPayload(form: OneHouseJudgmentFormData): object {
  if (!form.winWinRentalSpecial || !form.winWinRentalContractDate) return {};
  return {
    winWinRentalHouse: {
      winWinContractDate: form.winWinRentalContractDate,
      increaseRatePct: parseFloat(form.winWinRentalIncreaseRatePct || "0") || 0,
      priorLeaseMonths: parseInt(form.winWinRentalPriorLeaseMonths || "0", 10),
      winWinLeaseMonths: parseInt(form.winWinRentalLeaseMonths || "0", 10),
    },
  };
}

/** ④ 판정 메뉴 폼 → API 본문. */
export function buildOneHouseExemptionApiBody(
  form: OneHouseJudgmentFormData,
): Record<string, unknown> {
  const primary = form.assets[0];
  if (!primary) throw new Error("양도 대상 주택이 없습니다.");

  /**
   * 🔴 **주택 수는 명부에서 파생한다**(G-1 · D-3). 판정 메뉴에는 선언 위젯이 없다.
   *
   * route도 본문의 `householdHousingCount`를 믿지 않고 독립적으로 도출하지만(P4-2a),
   * 여기서 같은 값을 실어야 하는 이유가 따로 있다 — **`provisoGate`가 이 값을 읽는다**.
   * 빈 문자열을 넘기면 `parseInt("") = NaN`으로 `visible:false`가 되어
   * **§154① 단서(해외이주·수용·부득이)가 조용히 사라진다**.
   */
  const houseCount = deriveJudgmentHouseCount(form);

  const housesPayload = buildHousesPayload(
    primary,
    form.houses,
    form.presaleRights.length,
    // §167의10 중과 축이라 판정 메뉴에는 입력 위젯이 없다 — 미전송(§3.2-C).
    undefined,
  );
  const presaleRightsPayload = buildPresaleRightsPayload(primary.assetKind, form.presaleRights);

  return {
    propertyType: primary.assetKind,
    transferDate: form.transferDate,
    acquisitionDate: primary.acquisitionDate,
    /**
     * 예상 양도가액 — 고가주택(12억 초과) 판정에 **실제로 쓰인다**.
     *
     * 🔑 계산기와 **같은 필드**(`form.contractTotalPrice`)를 읽는다 — 자산-수준
     *    `actualSalePrice`가 아니다(`transfer-tax-api.ts:170` `totalContractPrice`와 동일 출처).
     *    판정 메뉴는 단일 자산·지분 100% 전제이므로 안분(`applyRatio`)은 타지 않는다.
     */
    transferPrice: parseAmount(form.contractTotalPrice),
    // ↓ 판정에 쓰이지 않는 세액 축 — 중립 placeholder.
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    reductions: [],
    annualBasicDeductionUsed: 0,
    isNonBusinessLand: false,

    isOneHousehold: form.isOneHousehold,
    isUnregistered: form.isUnregistered,
    isRegulatedArea: form.isRegulatedArea,
    wasRegulatedAtAcquisition: form.wasRegulatedAtAcquisition,
    residencePeriodMonths: parseInt(form.residencePeriodMonths || "0", 10),
    householdHousingCount: houseCount,

    /**
     * ── 계산기와 **같은 leaf** ──────────────────────────────
     *
     * 🔑 폼을 **그대로** 넘긴다. 종전에 `householdHousingCount`를 파생값으로 덮어쓴 사본을
     *    만들어 넘겼는데, 뮤테이션(N3)이 그 사본을 지워도 단언이 하나도 깨지지 않아
     *    **네 leaf 중 누구도 그 필드를 읽지 않음**을 확인했다(전수 grep 0건).
     *    읽는 것은 아래 `provisoGate` 하나뿐이고 거기엔 파생값을 직접 넘긴다.
     *    쓰이지 않는 사본은 「언젠가 필요할 것」이라는 추측이므로 두지 않는다.
     */
    ...buildHouseholdSpecialPayload(form, primary),
    ...buildReplacementHousePayload(form),
    ...buildRightThreeYearExceptionPayload(form),
    ...buildMergedHouseholdFirstHousePayload(form),
    ...(housesPayload ? { houses: housesPayload, sellingHouseId: "selling" } : {}),
    ...(presaleRightsPayload ? { presaleRights: presaleRightsPayload } : {}),
    ...(form.marriageDate ? { marriageMerge: { marriageDate: form.marriageDate } } : {}),
    ...(form.parentalCareMergeDate
      ? { parentalCareMerge: { mergeDate: form.parentalCareMergeDate } }
      : {}),
    ...(form.isFirstTransferredInMerge ? { isFirstTransferredInMerge: true } : {}),
    ...(form.generalHouseGiftedFromDecedentWithin2yr
      ? { generalHouseGiftedFromDecedentWithin2yr: true }
      : {}),
    ...(form.generalHouseHeldAtInheritance ? { generalHouseHeldAtInheritance: true } : {}),
    ...(form.inheritedRightChoiceWhenBothHeld
      ? { inheritedRightChoiceWhenBothHeld: form.inheritedRightChoiceWhenBothHeld }
      : {}),
    specialHouseExclusions: (form.specialHouseExclusions ?? [])
      .filter((e) => e.article)
      .map((e) => ({
        article: e.article,
        houseAcquisitionDate: e.houseAcquisitionDate || undefined,
        houseContractDate: e.houseContractDate || undefined,
        isNationalHousing: e.isNationalHousing,
        requirementsConfirmed: e.requirementsConfirmed,
      })),
    // §154① 단서 — 계산기와 같은 두 단계 정규화(게이트 → 유효 사유).
    ...(() => {
      const mode = provisoGate({
        isOneHousehold: form.isOneHousehold,
        isHousing: primary.assetKind === "housing",
        householdHousingCount: String(houseCount),
        temporaryTwoHouseSpecial: form.temporaryTwoHouseSpecial,
      }).mode;
      const reason = effectiveProvisoReason(mode, form.provisoReason);
      return reason
        ? {
            oneHouseExemptionProviso: {
              reason,
              ...(form.provisoDepartureDate ? { departureDate: form.provisoDepartureDate } : {}),
              ...(form.provisoExpropriationDate
                ? { expropriationDate: form.provisoExpropriationDate }
                : {}),
              ...(form.provisoBusinessApprovalDate
                ? { businessApprovalDate: form.provisoBusinessApprovalDate }
                : {}),
            },
          }
        : {};
    })(),

    // ── 판정 메뉴 고유 (P4-2b-0이 ⑫⑭를 열어 둔 축) ──────────
    ...buildLongTermMortgagePayload(form),
    ...buildWinWinRentalPayload(form),
  };
}

/**
 * ⑬ fetch.
 *
 * 🔴 **응답 envelope가 다른 계산 route와 다르다**(계획서 §20.2). 판정 route는
 *    성공 `{ data }` · 실패 `{ error: { code, message, fieldErrors? } }`이고,
 *    주식·양도세 route는 `{ result }` · `{ error: "문자열" }`이다.
 *    그쪽을 복사하면 화면에 **`[object Object]`** 가 뜬다.
 */
export async function callOneHouseExemptionAPI(
  form: OneHouseJudgmentFormData,
): Promise<OneHouseExemptionResponse> {
  const res = await fetch("/api/calc/one-house-exemption", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildOneHouseExemptionApiBody(form)),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (json as { error?: { message?: string } } | null)?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return (json as { data: OneHouseExemptionResponse }).data;
}
