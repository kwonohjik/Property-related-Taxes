/**
 * 1세대1주택 비과세 — **보유·거주 요건 + 농어촌·부득이한 사유** (소득세법 §89①3호·시행령 §154·§155⑦⑧)
 *
 * `transfer-tax-exemption-requirements.ts`가 802줄로 파일 크기 정책(트리거 800·착지 ≤700)을
 * 다시 넘겨 분리했다(2026-10-05, 리드 전달). 이음매는 「§154① 보유·거주(+§155⑦⑧ 농어촌·부득이)」와
 * 「§155①④⑤ 일시적 2주택·합가 의제 묶음」 사이다 — 후자는 상호 순환 참조가 있어(선행 계획서
 * `one-house-judgment-merge-house-link.plan.md` §7-2) 따로 떼어 `one-house/merge-deeming.ts`로
 * 옮겼다. 의존은 **이 파일 → 없음**(단방향 끝점)이고, `merge-deeming.ts`가 이 파일의
 * `ExemptionReqInput`·`resolveExemptionProviso`·`qualifiesRuralHouse`를 가져다 쓴다.
 *
 * 하위 호환: `transfer-tax-exemption-requirements.ts`가 이 모듈을 통째로 재수출하므로
 * **기존 import 경로는 무변경**이다(memory `feedback_800line_split_export_preservation`).
 *
 *   E-4: §154① 보유·거주 요건 · 농어촌주택 · 부득이한 사유 수도권 밖
 */

import { format } from "date-fns";
import { isWithinDeadline } from "./civil-period";
import { passesHouseholdGate } from "./transfer-inheritance-exclusion";
import { calculateHoldingPeriod, CONVERSION_EXEMPTION_CUTOFF } from "./tax-utils";
import { EXEMPTION_PROVISO_CONST } from "./legal-codes";
import { isRegulatedByBjdCode } from "./data/regulated-areas";
import { qualifiesWinWinRental } from "./transfer-tax-exemption-residence-waivers";
import { resolveRental4hoRegistration } from "./one-house/rental-registration-4ho";
import { applyFinalOneHouseRestart, capResidenceMonthsAtRestart } from "./one-house/final-house-restart";
import type {
  TransferTaxInput,
  UnavoidableReasonKind,
  RuralHouseKind,
} from "./types/transfer.types";
import type { OneHouseSpecialRulesData } from "./schemas/rate-table.schema";

export const UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS = 3;

// §155⑦1호·2호 — 거주 요건 연수.
export const RURAL_HOUSE_RESIDENCE_YEARS = 5;
// §155⑦ 단서 — 귀농주택(3호)은 취득일부터 5년 이내 일반주택 양도에 한정.
export const RURAL_RETURN_TO_FARM_TRANSFER_YEARS = 5;
/**
 * D15 — ⑦ 단서는 대통령령 제26982호(2016.2.17. 공포·시행)가 신설했다(2016-01-01본에 없음 · DRF eflaw 실독).
 * 부칙 제10조 「제155조제7항 각 호 외의 부분 단서 … 의 개정규정은 이 영 시행 이후 **귀농주택을 취득하는 분부터**
 * 적용한다」 · 제22조 「이 영 시행 전에 귀농주택을 취득한 경우에는 … 종전의 규정에 따른다」 — 기준축은 양도일이
 * 아니라 귀농주택 취득일이다.
 */
export const RURAL_RETURN_TO_FARM_DEADLINE_ACQ_START = new Date("2016-02-17");

/** ⑦ 단서(귀농주택 취득일부터 5년 이내 양도)가 이 귀농주택에 붙는가 — 2016-02-17 전 취득분은 종전 규정(단서 없음). */
export function ruralReturnToFarmDeadlineApplies(acquisitionDate: Date): boolean {
  return acquisitionDate.getTime() >= RURAL_RETURN_TO_FARM_DEADLINE_ACQ_START.getTime();
}
// §155⑩3호 — 귀농주택 대지면적 상한(㎡).
export const RURAL_RETURN_TO_FARM_MAX_LAND_SQM = 660;

/** §155⑦ 각 호 라벨 (exemptReason 표시용 — 내부 id 노출 금지) */
export const RURAL_HOUSE_LABEL: Record<RuralHouseKind, string> = {
  inherited: "1호 상속",
  farm_exit: "2호 이농",
  return_to_farm: "3호 귀농",
};

/**
 * §155⑦ 농어촌주택 요건 판정 — 「각각 1개씩 소유(2주택)」 + 소재 + 유형별 요건.
 *
 * 비과세(E-3.8)와 중과 배제(영 §167의10①15호)가 같은 값을 쓰도록 정본으로 분리한다.
 * §154① 충족은 여기서 보지 않는다(15호 ② 요소는 별도 게이트).
 */
export function qualifiesRuralHouse(
  input: Pick<TransferTaxInput, "householdHousingCount" | "transferDate" | "ruralHouse">,
): boolean {
  if (!qualifiesRuralHouseApartFromDeadline(input)) return false;
  const r = input.ruralHouse!;
  if (r.kind !== "return_to_farm") return true;
  // ⑦ 단서 — 귀농주택(3호)은 그 취득일부터 5년 이내 일반주택 양도에 한정(2016-02-17 이후 취득분만 — D15).
  if (!ruralReturnToFarmDeadlineApplies(r.acquisitionDate!)) return true;
  return isWithinDeadline(r.acquisitionDate!, RURAL_RETURN_TO_FARM_TRANSFER_YEARS, input.transferDate);
}

/**
 * D3 — §155⑦(농어촌주택)과 §155①(일시적 2주택)이 **겹쳐 3주택**인가 — 주택 수 축만 본다.
 *
 * ⑦ 농어촌주택과 일반주택을 각각 1개씩 소유한 1세대가 신규 주택을 취득해 3주택이 된 상태에서 종전 일반주택을
 * 양도하면, 농어촌주택을 빼고 §155①을 적용한다(서면인터넷방문상담4팀-3617 · 서면인터넷방문상담4팀-977 —
 * 조특법 §99의4 농어촌주택도 같다: 부동산납세과-2367 · 서면-2024-부동산-1967).
 * 그래서 ⑦ 요건은 **신규 주택을 뺀 2주택 기준**으로 본다(`householdHousingCount: 2`).
 *
 * 🔑 **3주택까지만** — ⑦·⑳·① 세 특례를 함께 적용한 4주택은 부인됐다(부동산납세과-870). §155②③ 상속주택 제외가
 *    겹친 경우(세 특례)도 성립하지 않는다(`inheritedHouseExclusionCount`). §155① 기간 요건은
 *    여기서 보지 않는다 — 호출부(비과세 E-3 · 중과 15호 `resolveDeemedOneHouseBy155`)가 2주택과 같은 술어로 본다.
 */
export function ruralTemporaryTwoHouseOverlapCountHolds(
  input: Pick<TransferTaxInput, "householdHousingCount" | "transferDate" | "ruralHouse" | "inheritedHouseExclusionCount">,
): boolean {
  // 상속주택 제외까지 겹치면 세 특례 — 인정 해석 없음(`inheritedHouseExclusionCount` 주석).
  if ((input.inheritedHouseExclusionCount ?? 0) > 0) return false;
  return input.householdHousingCount === 3 && qualifiesRuralHouse({ ...input, householdHousingCount: 2 });
}

/**
 * §155⑦ 농어촌주택 요건 중 **⑦ 단서의 5년 기한만 뺀** 나머지 — `qualifiesRuralHouse`와
 * pending 귀농 축(`one-house/pending.ts`)의 **같은 술어**(OH-23).
 *
 * pending은 「기한 하나만 남았을 때」만 기한을 안내한다. 기한 외 요건(소재·⑩2·3·5호)을 따로
 * 베껴 쓰면 한쪽만 개정 반영되므로, 기한 판정만 떼어 낸 이 함수를 둘이 함께 쓴다.
 */
export function qualifiesRuralHouseApartFromDeadline(
  input: Pick<TransferTaxInput, "householdHousingCount" | "ruralHouse">,
): boolean {
  const r = input.ruralHouse;
  if (input.householdHousingCount !== 2 || !r) return false;
  // 소재: 수도권 밖의 읍(도시지역 제외)·면 — 유형 불문 공통 요건.
  if (!r.isOutsideCapitalEupMyeon) return false;

  switch (r.kind) {
    case "inherited":
      // 1호: 피상속인이 취득 후 5년 이상 거주 + §155② 단서(동일세대 상속 배제 — 동거봉양 합가 전 보유분 예외, D7)
      return (r.decedentResidenceYears ?? 0) >= RURAL_HOUSE_RESIDENCE_YEARS && passesHouseholdGate(r);
    case "farm_exit":
      // 2호: 이농인이 취득일 후 5년 이상 거주
      return (r.ownerResidenceYears ?? 0) >= RURAL_HOUSE_RESIDENCE_YEARS;
    case "return_to_farm":
      // 3호 + ⑩ 요건 (⑦ 단서 5년 기한은 호출부 몫)
      if (r.isHighPriceAtAcquisition === true) return false; // ⑩2호
      if ((r.landAreaSqm ?? Infinity) > RURAL_RETURN_TO_FARM_MAX_LAND_SQM) return false; // ⑩3호
      if (r.wholeHouseholdMoved !== true) return false; // ⑩5호
      return !!r.acquisitionDate; // ⑦ 단서 판정 불가 → 적용하지 않는다
  }
}

/**
 * §155⑧ 요건 판정 — 「각각 1개씩 소유(2주택)」 + 「해소된 날부터 3년 이내」.
 *
 * 비과세(E-3.7)와 중과 배제(영 §167의10①4호)가 **같은 값을 써야** 한다 — 앞 계획서 F-2에서
 * 기한 규칙을 양쪽이 따로 구현했다가 「비과세 O / 중과배제 X」 모순이 났던 것과 같은 구조다.
 *
 * §154① 충족(「§154①을 적용한다」)은 여기서 보지 않는다 — 비과세는 `meetsOneHouseHoldingResidence`가,
 * 중과는 §167의10①4호가 §154①을 요구하지 않으므로(15호와 달리 문언에 없다) 별도로 다룬다.
 */
export function qualifiesUnavoidableOutsideCapital(
  input: Pick<
    TransferTaxInput,
    "householdHousingCount" | "transferDate" | "unavoidableOutsideCapitalHouse"
  >,
): boolean {
  const u = input.unavoidableOutsideCapitalHouse;
  if (input.householdHousingCount !== 2 || !u) return false;
  // 🔶 해소 전 양도는 명문이 없다 — 기한이 기산되지 않은 것으로 본다(계획서 W-1).
  if (u.resolvedDate === undefined) return true;
  return isWithinDeadline(u.resolvedDate, UNAVOIDABLE_OUTSIDE_CAPITAL_YEARS, input.transferDate);
}

/** §155⑧ 부득이한 사유 라벨 (exemptReason 표시용 — 내부 id 노출 금지) */
export const UNAVOIDABLE_REASON_LABEL: Record<UnavoidableReasonKind, string> = {
  study: "취학",
  work: "근무상 형편",
  illness: "질병 요양",
  other: "그 밖의 부득이한 사유",
};

/**
 * 거주요건 판정 입력 — TransferTaxInput의 부분집합. UI(Step4 안내 메시지)와 엔진이 공용.
 * resolveExemptionProviso·resolveWasRegulatedAtAcquisition·meetsOneHouseResidenceRequirement 입력.
 */
export type ResidenceReqInput = Pick<
  TransferTaxInput,
  | "acquisitionDate"
  | "transferDate"
  | "residencePeriodMonths"
  | "oneHouseExemptionProviso"
  | "regionCode"
  | "wasRegulatedAtAcquisition"
  | "residenceTransitionAcquisitionDate"
  | "acquisitionCause"
  | "decedentSameHouseholdBeforeInheritance"
  | "decedentCohabitationResidenceMonths"
  // §154⑤ 단서 — 비주택을 주택으로 용도변경한 경우 보유기간을 주거용 사용일부터 기산한다.
  | "nonHousingToHousingConversion"
  // §155의3① — 상생임대주택은 §154①·§155⑳1호·§159의4의 **거주기간 제한을 받지 않는다**.
  // 의제 1주택 세대까지 포함하는 면제라 공통 술어가 읽는다(§155의2와 달리 경로 한정이 없다).
  | "winWinRentalHouse"
  // §154⑤ 단서(2021-01-01~2022-05-09 양도) 최종 1주택 재기산 — 보유 기산일·거주요건이 함께 읽는다(OH-22).
  | "finalOneHouseRestart"
> &
  Partial<Pick<TransferTaxInput, "householdHousingCount">>;

/**
 * §154① **보유·거주 통합** 요건 판정 입력 — `ResidenceReqInput` + 보유 기산일 backdate 1필드.
 *
 * `meetsOneHouseHoldingResidence`가 `TransferTaxInput` 전체를 요구하면 겸용주택 서브엔진처럼
 * 전체를 구성할 수 없는 호출부가 정본을 재사용하지 못한다(그 결과가 계획서 E-3 —
 * P3a가 보유 판정을 따로 구현했다가 단서 면제를 놓친 과다과세 결함).
 * **타입 전용 narrowing이며 동작은 불변**이다. 단건 엔진이 넘기는 `TransferTaxInput`은
 * 구조적으로 이 타입을 만족한다.
 */
export type ExemptionReqInput = ResidenceReqInput &
  Pick<TransferTaxInput, "decedentCohabitationHoldingStartDate">;

/** §154① 단서 각호 면제 범위 라벨 (exemptReason 표시용) — 모듈 스코프 (per-call 재생성 금지) */
export const PROVISO_LABEL: Record<
  NonNullable<TransferTaxInput["oneHouseExemptionProviso"]>["reason"],
  string
> = {
  rental_5yr_residence: "1호 임대주택 거주5년",
  expropriation: "2호가 수용",
  overseas_migration: "2호나 해외이주",
  overseas_residence: "2호다 국외거주",
  unavoidable: "3호 부득이",
  pre_designation_contract: "5호 공고전계약",
  rental_registration_4ho: "4호 임대사업자 등록",
};

/**
 * §154① 단서 각호 — 보유·거주 요건 면제 범위 판정 (소득세법 시행령 §154 ① 단서).
 * 반환: "both"(보유+거주 면제 — 1·2·3호) / "residence_only"(거주만 — 5호) / null(미선택 또는 요건 미충족).
 * 시한 상수: EXEMPTION_PROVISO_CONST (가목 5년·나다목 2년·1호 거주5년·3호 거주1년).
 */
export function resolveExemptionProviso(
  input: ResidenceReqInput,
): "both" | "residence_only" | null {
  const p = input.oneHouseExemptionProviso;
  if (!p) return null;
  const C = EXEMPTION_PROVISO_CONST;
  // §154⑧3호: 단서 각호 거주요건(3호 부득이 1년·1호 임대 5년)도 "제1항에 따른 거주기간"이므로
  // 동일세대 상속 통산을 반영 (favorable-only — 통산은 거주연수를 늘려 비과세 요건 충족 방향, 불리 없음).
  const residenceYears = Math.floor(resolveExemptionResidenceMonths(input) / 12);
  switch (p.reason) {
    case "expropriation":
      // 2호 가목: 사업인정 고시일 전 취득 + 양도일·수용일부터 5년 이내
      if (p.businessApprovalDate && input.acquisitionDate >= p.businessApprovalDate) return null;
      // 2026-07-29 정정(#591 감사 R7 — **세액 변경**): `?? input.transferDate` fallback은
      //   fail-open이었다. 수용일 미입력 시 `transferDate <= transferDate + 5년`이 **항상 참**이라
      //   5년 요건을 검증하지 않고 무조건 "both"(보유·거주 면제)를 줬다 → 비과세 과다.
      //   §154①2호가목의 5년은 **수용일 기산**이므로, 수용일을 모르면 요건을 판정할 수 없다
      //   → 특례 미적용(null)이 맞다. 미입력을 유리하게 추정할 근거가 없다.
      if (!p.expropriationDate) return null;
      return isWithinDeadline(p.expropriationDate, C.EXPROPRIATION_TRANSFER_YEARS, input.transferDate)
        ? "both"
        : null;
    case "overseas_migration":
    case "overseas_residence":
      // 2호 나·다목: 출국일부터 2년 이내
      return p.departureDate && isWithinDeadline(p.departureDate, C.OVERSEAS_TRANSFER_YEARS, input.transferDate)
        ? "both"
        : null;
    case "unavoidable":
      // 3호: 1년 이상 거주
      return residenceYears >= C.UNAVOIDABLE_RESIDENCE_YEARS ? "both" : null;
    case "rental_5yr_residence":
      // 1호: 세대전원 거주 5년 이상
      return residenceYears >= C.RENTAL_RESIDENCE_YEARS ? "both" : null;
    case "pre_designation_contract":
      // 5호: 거주만 면제 (계약금일 무주택은 ⑧ `exemption-proviso-validate.ts`·⑫ `transfer-tax-schema-household-refines.ts`로 담보)
      return "residence_only";
    case "rental_registration_4ho":
      // 삭제 전 4호: 거주만 면제 — 부칙<제30395호> 제38조 경과조치 (`one-house/rental-registration-4ho.ts`)
      return resolveRental4hoRegistration(input)?.status === "applies" ? "residence_only" : null;
    default:
      return null;
  }
}

/**
 * 거주요건(§154① 본문) 판정의 **기준일** — 「주택을 취득한 날」.
 *
 * 통상은 취득일이지만, 비주택을 주택으로 용도변경한 경우에는 **주거용으로 사용하기 시작한 날**이
 * 주택 취득 시점이다(서면-2020-부동산-5098 [부동산납세과-1247] — 거주요건은 주택 취득시점 기준).
 * 조정대상지역 지정·해제는 시점에 따라 갈리므로 이 기준일이 거주요건 유무를 바꾼다.
 *
 * ⚠️ **호출부가 기준일을 각자 고르지 않게** 여기서 한 번만 도출한다 —
 *    엔진·Step4 안내·수동 토글이 서로 다른 날짜를 보면 "화면은 통과인데 엔진은 차단"이 된다.
 */
function resolveResidenceJudgmentDate(input: ResidenceReqInput): Date {
  return input.nonHousingToHousingConversion?.residentialUseStartDate ?? input.acquisitionDate;
}

/**
 * 취득 당시 조정대상지역 여부 — 거주요건(§154① 본문) 판정 입력.
 *
 * regionCode(법정동코드)가 있으면 판정 기준일 기준 isRegulatedByBjdCode로 정밀 판정
 * (읍·면·동/택지지구 예외까지 반영). 없으면 wasRegulatedAtAcquisition boolean fallback (회귀 0 보장).
 * 다주택 중과(multi-house-surcharge: 양도일 기준)와 대칭 — 여기서는 취득일(용도변경 시 주거용 사용일) 기준.
 *
 * ⚠️ boolean fallback 경로는 기준일을 쓰지 않는다 — 폼이 넘긴 값을 그대로 신뢰한다.
 *    용도변경 케이스에서 정밀 판정을 받으려면 `regionCode`가 있어야 한다.
 */
export function resolveWasRegulatedAtAcquisition(input: ResidenceReqInput): boolean {
  if (input.regionCode) {
    return isRegulatedByBjdCode(
      input.regionCode,
      format(resolveResidenceJudgmentDate(input), "yyyy-MM-dd"),
    ).isRegulated;
  }
  return input.wasRegulatedAtAcquisition === true;
}

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
 * §154① 본문 거주요건 단독 판정 (보유요건 제외) — Step4 거주요건 안내 메시지와 엔진 공용(단일 진실).
 * true = 거주요건 충족 또는 면제. 단서면제(both·residence_only)·취득시 비조정·
 * 2017.8.3 이전 취득(경과규정)·거주 2년 이상(§154⑧3호 동일세대 상속 통산 포함) 중 하나라도 해당하면 충족.
 */
/**
 * §154① 거주요건 **판정 사유** — `meetsOneHouseResidenceRequirement`의 정본(2026-09-29 추출).
 *
 * 종전 boolean 함수의 OR 항을 **같은 순서로** 사유로 돌려준다. 요건 순차 검토 카드가
 * 「충족」과 「요건 없음」(취득 당시 비조정·경과규정)·「면제」(단서·상생임대)를 구별해야 해서 뽑았다.
 * boolean 함수는 이것에서 파생한다 — 판정 로직은 한 벌이다.
 *
 *   proviso      — §154① 단서(보유·거주 또는 거주만 면제)
 *   not_regulated — 취득 당시 조정대상지역 아님 → 거주요건 자체가 없음
 *   pre_policy   — 2017.8.2. 이전 취득(대통령령 제28293호 부칙) → 거주요건 없음
 *   win_win_rental — §155의3① 상생임대주택 → 거주기간 제한 없음
 *   met / unmet  — 거주 N년 요건 충족 여부
 */
export type OneHouseResidenceBasis =
  | "proviso"
  | "not_regulated"
  | "pre_policy"
  | "win_win_rental"
  | "met"
  | "unmet";

export function describeOneHouseResidenceRequirement(
  input: ResidenceReqInput,
  rule: Pick<
    OneHouseSpecialRulesData["one_house_exemption"],
    "regulatedAreaMinResidenceYears" | "prePolicyDate" | "prePolicyExemptResidence"
  >,
): { basis: OneHouseResidenceBasis; wasRegulated: boolean; residenceMonths: number; requiredYears: number } {
  const proviso = resolveExemptionProviso(input);
  // §154① 거주요건 경과규정 — 2017.8.3(prePolicyDate) 이전 취득은 조정지역이라도 거주요건 면제.
  // 이월과세 시 acquisitionDate는 증여자(보유 기산)로 교체되므로(§95④), 경과규정 판정은
  // 수증자 실제 취득일(residenceTransitionAcquisitionDate) 사용 — §97의2는 필요경비 계산 특례에 한정.
  const residenceTransitionDate =
    input.residenceTransitionAcquisitionDate ?? input.acquisitionDate;
  const isPrePolicy = residenceTransitionDate < new Date(rule.prePolicyDate);
  // §154⑧3호: 동일세대 상속이면 상속개시 전 동일세대 통산 거주분을 거주요건 판정에 합산.
  // §154⑤ 단서 재기산이면 재기산일 이후 거주만(재산세제과-1058 — `one-house/final-house-restart.ts`).
  const residenceMonths = capResidenceMonthsAtRestart(input, resolveExemptionResidenceMonths(input));
  const residenceYears = Math.floor(residenceMonths / 12);
  // 취득 당시 조정대상지역 — regionCode 있으면 취득일 기준 정밀 판정, 없으면 boolean fallback
  const wasRegulated = resolveWasRegulatedAtAcquisition(input);
  const requiredYears = rule.regulatedAreaMinResidenceYears;
  const basis: OneHouseResidenceBasis =
    proviso === "both" || proviso === "residence_only"
      ? "proviso"
      : !wasRegulated
        ? "not_regulated"
        : // §154① 부칙(대통령령 제28293호) 적용례 — prePolicy 취득은 조정지역이라도 거주요건 면제
          rule.prePolicyExemptResidence && isPrePolicy
          ? "pre_policy"
          : // §155의3① 상생임대주택 — 「제154조제1항 … 을 적용할 때 거주기간의 제한을 받지 않는다」.
            // 🔑 §155의2는 여기 두지 않는다 — 경로가 한정돼 있어 공통 술어에 넣으면 샌다
            //    (`qualifiesLongTermMortgageResidenceExemption` 주석 참조).
            qualifiesWinWinRental(input)
            ? "win_win_rental"
            : residenceYears >= requiredYears
              ? "met"
              : "unmet";
  return { basis, wasRegulated, residenceMonths, requiredYears };
}

export function meetsOneHouseResidenceRequirement(
  input: ResidenceReqInput,
  rule: Pick<
    OneHouseSpecialRulesData["one_house_exemption"],
    "regulatedAreaMinResidenceYears" | "prePolicyDate" | "prePolicyExemptResidence"
  >,
): boolean {
  return describeOneHouseResidenceRequirement(input, rule).basis !== "unmet";
}

/**
 * §154① 보유·거주 요건 (단서 각호 면제 포함).
 * 본문: 보유 2년(rule.minHoldingYears) + 취득 당시 조정대상지역이면 거주 2년(거주요건은 위 헬퍼 재사용).
 * 단서: resolveExemptionProviso "both"=보유+거주 면제 / "residence_only"=거주만 면제 (소령 §154① 단서).
 * §155⑤(혼인 합가) 1세대1주택 의제 중과배제(§167의10①15호) 게이트에 재사용 — checkExemption과 단일 진실.
 */
/**
 * §154① 비과세 **보유기간 기산일** — 취득일을 옮기는 두 규정을 한 곳에서 판정한다.
 *
 *   §154⑤ 단서: 비주택 → 주택 용도변경 시 **주택으로 사용한 날**부터 (2024-02-29 이후 양도분)
 *   §154⑧3호 : 동일세대 상속이면 상속개시 전 동일세대 보유 개시일부터 통산 → backdate
 *
 * 어느 쪽도 아니면 acquisitionDate(상속개시일 등) 그대로.
 * ⚠️ §154① 요건 판정 전용 — meetsOneHouseHoldingResidence 경유 소비처 전반에 적용:
 *    (1) 1세대1주택 비과세(checkExemption E-4), (2) §155⑤ 혼인·합가 1세대1주택 의제 중과배제 게이트.
 *    둘 다 §154① 보유·거주 요건 판정이라 §154⑧ 통산이 정합(먼저양도 상속주택도 §154① 적용).
 *    단 LTHD(resolveLTHDStartDate)·단기세율(decedentAcquisitionDate)에는 적용하지 않는다.
 */
export function resolveExemptionHoldingStartDate(input: ExemptionReqInput): Date {
  // §154⑤ 단서(2021-01-01~2022-05-09 양도) 최종 1주택 재기산은 아래 기산일보다 늦으면 그날부터(OH-22).
  return applyFinalOneHouseRestart(input, resolveBaseHoldingStartDate(input));
}

function resolveBaseHoldingStartDate(input: ExemptionReqInput): Date {
  // §154⑤ 단서 — 주택이 아닌 건물을 주택으로 용도변경한 경우 보유기간은 **주택으로 사용한 날**부터
  // 기산한다. 2024-02-29 이후 양도분부터 적용(대통령령 제34265호 — 공포일 시행).
  //
  // ⚠️ §154⑧3호(상속 통산 backdate)보다 **먼저** 판정한다.
  //    2026-08-05 근거 강화 — 종전 주석은 "두 사유가 동시에 성립하는 조합은 **명문이 없어**
  //    validation이 차단한다(C-21)"였으나, 실은 **§154⑧3호의 적용 요건이 성립하지 않는다**.
  //    같은 호가 "상속받은 **주택**으로서"를 전제하는데, 용도변경 토글이 켜졌다는 것은 취득
  //    (상속개시) 당시 비주택이었다는 뜻이기 때문이다 — C-8이 용도변경일 > 취득일을 강제한다.
  //    ⇒ 상속은 더 이상 차단 대상이 아니고(C-21은 증여·이월과세만 남았다), 이 순서는
  //      「명문 없음 하의 잠정 선택」이 아니라 **요건 불성립에 따른 필연**이다.
  //    거주 통산 배제는 `resolveExemptionResidenceMonths`가 같은 근거로 담당한다.
  //    설계: `docs/02-design/features/non-housing-to-housing-conversion-inheritance-c21.plan.md`
  if (
    input.nonHousingToHousingConversion &&
    input.transferDate >= CONVERSION_EXEMPTION_CUTOFF
  ) {
    return input.nonHousingToHousingConversion.residentialUseStartDate;
  }
  if (
    input.acquisitionCause === "inheritance" &&
    input.decedentSameHouseholdBeforeInheritance === true &&
    input.decedentCohabitationHoldingStartDate &&
    input.decedentCohabitationHoldingStartDate < input.acquisitionDate
  ) {
    return input.decedentCohabitationHoldingStartDate;
  }
  return input.acquisitionDate;
}

/**
 * @param longTermMortgageResidenceExempt §155의2①② 거주기간 면제를 이 호출에 한해 주입한다.
 *   기본값 `false`가 **정본**이다 — §155의2는 「1주택」(①)·「동거봉양 합가」(②)로 경로가 한정돼
 *   있어, 공통 술어에 넣으면 일시적 2주택·혼인 합가 경로까지 면제가 새기 때문이다.
 *   중과 배제 게이트(§167의10①15호)는 §155의2를 인정하지 않으므로 **주입하지 않는다**.
 */
/**
 * §154① 보유요건 **판정 사유** — `meetsOneHouseHoldingResidence`의 보유 항 정본(2026-09-29 추출).
 * 기산일은 `resolveExemptionHoldingStartDate`(§154⑤·⑧3호 보정), 기간은 §95④ 초일 산입.
 * `provisoWaives`는 §154① 단서 "both"(보유·거주 모두 면제) — 연수 충족과 별개로 돌려준다.
 */
export function describeOneHouseHoldingRequirement(
  input: ExemptionReqInput,
  rule: Pick<OneHouseSpecialRulesData["one_house_exemption"], "minHoldingYears">,
): { startDate: Date; years: number; months: number; met: boolean; provisoWaives: boolean } {
  const startDate = resolveExemptionHoldingStartDate(input);
  const holding = calculateHoldingPeriod(startDate, input.transferDate);
  return {
    startDate,
    years: holding.years,
    months: holding.months,
    met: holding.years >= rule.minHoldingYears,
    provisoWaives: resolveExemptionProviso(input) === "both",
  };
}

export function meetsOneHouseHoldingResidence(
  input: ExemptionReqInput,
  rule: OneHouseSpecialRulesData["one_house_exemption"],
  longTermMortgageResidenceExempt = false,
): boolean {
  const holding = describeOneHouseHoldingRequirement(input, rule);
  // §155의2가 면제하는 것은 **거주기간뿐**이다 — 보유 2년은 그대로 본다(①② 법문).
  const meetsHolding = holding.provisoWaives || holding.met;
  return (
    meetsHolding &&
    (longTermMortgageResidenceExempt || meetsOneHouseResidenceRequirement(input, rule))
  );
}
