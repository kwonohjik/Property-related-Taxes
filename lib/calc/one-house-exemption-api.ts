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
 *   §155의2·§155의3 블록도 **여기서 쓰지 않는다** — `one-house-extra-facts-payload.ts`가 정본이고
 *   계산기(`transfer-tax-api.ts`)가 넘겨받은 사실을 같은 함수로 편다(P5-a). 계산기 화면에 그
 *   **입력 위젯**이 없다는 것(D-4)과, 계산기가 그 사실을 **운반하지 않는다**는 것은 다른 말이다.
 *
 * ## 판정에 필요 없는 값은 **중립 placeholder**로 보낸다
 *
 * `propertySchema`는 계산기와 공용이라 `acquisitionPrice`·`expenses` 등을 요구한다. 판정 메뉴는
 * 이 값을 묻지 않으므로 0을 보낸다 — 세액을 계산하지 않는 route라 결과에 영향이 없다.
 * 다만 `transferPrice`는 **양수 필수**이고 고가주택(12억 초과) 판정에 **실제로 쓰이므로**
 * 사용자에게 받는다(③ 예상 양도가액).
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { clampResidenceToHousingPeriod } from "@/lib/stores/calc-wizard-asset-residence";
import { isUsageConversionActive } from "@/lib/stores/calc-wizard-asset-usage-conversion";
import { buildHousesPayload } from "./transfer-tax-api-houses";
import { buildPresaleRightsPayload } from "./presale-rights-payload";
import { buildHouseholdSpecialPayload } from "./transfer-tax-api-body-blocks";
import { toRentalHousingExceptionApi } from "./transfer-tax-api-rental-housing";
import { buildOneHouseExtraFactsPayload } from "./one-house-extra-facts-payload";
import {
  buildReplacementHousePayload,
  buildRightThreeYearExceptionPayload,
  buildMergedHouseholdFirstHousePayload,
  effectiveProvisoReason,
} from "./transfer-tax-api-helpers";
import {
  judgmentProvisoMode,
  judgmentReplacementHouseVisible,
} from "./one-house-judgment-section-scope";
import {
  deriveJudgmentHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { OneHouseExemptionResponse } from "@/app/api/calc/one-house-exemption/route";


/**
 * 판정 메뉴의 **거주 개월 정본** — ④ 본문과 ⑤ 일시적 2주택 요건 카드가 함께 쓴다(OH-56).
 *
 * 🔴 폼-전역 `residencePeriodMonths`를 직접 읽지 않는다 — 이 메뉴의 거주 위젯은 자산-수준
 *    필드에만 쓴다(아래 본문 주석). 카드가 폼-전역 값(기본 "0")을 읽어 §154① 단서 1·3호의
 *    거주연수 요건을 늘 미충족으로 보고 「요건 A 미충족」을 띄운 것이 OH-56이다.
 */
export function deriveJudgmentResidenceMonths(form: OneHouseJudgmentFormData): number {
  const primary = form.assets[0];
  if (!primary) return 0;
  return clampResidenceToHousingPeriod(
    primary,
    form.transferDate,
    form.residencePeriodMonths,
    isUsageConversionActive(primary) ? primary.residentialUseStartDate : undefined,
  ).months;
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
   * 여기서 같은 값을 실어야 하는 이유가 따로 있다 — **`provisoGate`가 이 값을 읽는다**
   * (지금은 `judgmentProvisoMode`가 같은 파생값으로 부른다).
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
    /**
     * ④ 양도 물건 법정동코드 — ② 화면의 소재지 검색(PNU 앞 10자리)이 세운다.
     *
     * 🔑 **제공 시 엔진이 boolean 토글을 무시한다** — `resolveWasRegulatedAtAcquisition`
     *    (`transfer-tax-exemption-requirements.ts:382-390`)이 `regionCode`를 우선해
     *    `isRegulatedByBjdCode(취득일)`로 읍·면·동·택지지구 예외까지 정밀 판정한다.
     *    그래서 ⑤(2-C)가 주소가 있을 때 토글 대신 **자동 판정 결과를 읽기 전용으로** 보여준다.
     *    셋이 어긋나면 사용자가 켠 값이 조용히 버려진다(3중 패턴 — ⑤/④/⑧).
     *
     * 🔴 종전에는 이 한 줄이 없어, 명부 행(`buildHousesPayload`)에만 실리고 **거주요건 판정에는
     *    닿지 않았다**. ⑫ Zod(`transfer-tax-schema-base-shape.ts:116`)와
     *    ⑭ 매핑(`app/api/calc/transfer/engine-input.ts:68`)은 이미 있었다 —
     *    빠진 배관은 ④ 하나였다(`judgment-region-code-transport.anchor.test.ts`).
     */
    regionCode: primary.regionCode || undefined,
    /**
     * 🔴 거주기간은 **폼-전역 값을 그대로 읽으면 안 된다**.
     *
     * `ResidencePeriodSection`(③에서 재사용)은 **자산-수준** `residencePeriods[]`(구간 입력)
     * 또는 `residencePeriodMonthsAsset`(직접 입력)에 쓴다. 폼-전역 `residencePeriodMonths`는
     * 그 위젯이 **건드리지 않는 옛 필드**다 — 그대로 읽으면 사용자가 「5년 거주」를 입력해도
     * 판정에는 **0개월**이 들어가 비과세가 탈락한다.
     *
     * ⇒ 계산기와 **같은 leaf**(`clampResidenceToHousingPeriod` → `deriveResidencePeriodMonths`)를
     *   쓴다. 폼-전역 값은 그 함수 안에서 **fallback**으로만 쓰인다
     *   (`transfer-tax-api.ts:242-247`과 인자까지 동일).
     *
     * ⚠️ 이 결함은 anchor가 **픽스처로 가렸다** — 폼-전역 값을 직접 넣어 두면 위젯을 붙이기
     *    전까지 드러나지 않는다(`feedback_fixture_default_masks_gate_defect`).
     */
    residencePeriodMonths: deriveJudgmentResidenceMonths(form),
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
    /**
     * §156의2⑤ — ⑤·⑧과 **같은 게이트**(`judgmentReplacementHouseVisible`, OH-05).
     * 🔴 칸이 숨은 세대(입주권 없는 1주택)에서 남은 토글을 보내면 엔진 분기가 주택 수를 보지
     *    않으므로 보유기간과 무관하게 비과세가 된다.
     */
    ...(judgmentReplacementHouseVisible(form) ? buildReplacementHousePayload(form) : {}),
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
    // 🔑 맥락은 ⑧과 **같은 함수**로 정한다(`judgmentProvisoMode` — OH-06).
    ...(() => {
      const reason = effectiveProvisoReason(judgmentProvisoMode(form), form.provisoReason);
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
    ...buildOneHouseExtraFactsPayload(form),

    /**
     * §155⑳ 장기임대주택 특례 (P4-3a) — 계산기의 leaf를 **그대로** 쓴다.
     *
     * 🔑 §161 안분 3필드까지 함께 실린다. 판정 route는 그것을 **읽지 않지만**
     *    (`checkEligibility` 인자에 없다), 여기서 골라 빼면 계산기와 다른 payload를 만드는
     *    두 번째 변환이 된다. leaf 하나를 그대로 쓰고 무엇을 읽을지는 엔진이 정한다.
     */
    ...(() => {
      const rhPayload = toRentalHousingExceptionApi(primary);
      return rhPayload ? { rentalHousingException: rhPayload } : {};
    })(),

    /**
     * §89①4호 1세대1입주권 **판정 사실** (P4-3b).
     *
     * 🔴 계산기의 `buildRedevelopmentPayload`를 쓰지 않는다 — 그 payload는 §166 3분할
     *    **산식 입력**(`rightsValue`·`settlementAmount`·`preApprovalExpenses` 등)을 Zod 필수로
     *    끌고 온다. 판정 하나를 받으려고 그 값들을 0으로 지어내면 **거짓 데이터**를 보내는 것이다.
     *    ⇒ 판정 사실만 담는 좁은 블록으로 보낸다(⑫ `oneRightExemptionFactsSchema`).
     *
     * 🔑 엔진 쪽 **규칙은 한 벌**이다 — `resolveOneRightExemptionClause`가 두 상자 어느 쪽에서
     *    오든 같은 두 사실을 받아 같은 판정을 낸다.
     */
    ...(primary.assetKind === "right_to_move_in"
      ? {
          oneRightExemptionFacts: {
            eligibleAtApproval: primary.redevExemptionEligibleAtApproval === "yes",
            // 빈 문자열은 **미입력**이다 — 엔진이 나목을 「판정 불가」로 두게 한다.
            otherHouseAcquisitionDate: primary.redevOtherHouseAcquisitionDate || undefined,
          },
        }
      : {}),
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
