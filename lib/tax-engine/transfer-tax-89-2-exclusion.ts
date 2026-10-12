/**
 * 「소득세법」 §89② — 주택 + 조합원입주권·분양권 보유 세대의 **주택 양도** 시 §89①3호 배제.
 *
 * ## 조문 (법제처 실독 · 소득세법 MST 280405 · 시행령 MST 286211, 둘 다 시행 2026-07-01)
 *
 * > **§89②** 1세대가 주택(주택부수토지를 포함한다)과 **조합원입주권 또는 분양권을 보유하다가
 * > 그 주택을 양도하는 경우**에는 제1항에도 불구하고 **같은 항 제3호를 적용하지 아니한다**.
 * > 다만, … 시행기간 중 거주를 위하여 주택을 취득하는 경우나 **그 밖의 부득이한 사유로서
 * > 대통령령으로 정하는 경우**에는 그러하지 아니하다.
 *
 * 단서의 「대통령령으로 정하는 경우」는 둘이 나눠 받는다 — **예외는 총 16개 항**이다:
 *   · 시행령 §156의2② → **③~⑪** (주택 + 조합원입주권) 9개 항
 *   · 시행령 §156의3① → **②~⑧** (주택 + 분양권) 7개 항
 *
 * ## 이 파일이 하는 일 — **배제를 함부로 켜지 않는다**
 *
 * 예외 16항 중 상당수는 판정에 필요한 사실(권리의 상속 귀속·완성 후 이주·합가 전 귀속 등)을
 * 입력받을 경로가 아직 없다. 배제만 먼저 켜면 **그 예외에 해당하는 세대가 법 근거 없이
 * 불리해진다**(memory `feedback_no_unfavorable_application_without_legal_basis`).
 *
 * ⇒ 이 술어는 **세 갈래**로 답한다:
 *   · `excluded`      — 예외 전부를 배제할 수 있다 ⇒ §89①3호를 끈다
 *   · `exception_met` — 구현된 예외를 충족한다 ⇒ 종전대로 §89①3호를 적용한다
 *   · `undetermined`  — 판정에 필요한 사실을 입력받을 수 없다 ⇒ **종전 동작 유지** + 경고
 *
 * ## ⚠️ 지금까지 실제로 판정하는 예외 (Phase 1~4)
 *
 * | 항 | 요건 | 판정 근거 입력 |
 * |---|---|---|
 * | §156의2③ · §156의3② | 종전주택 취득 **1년 후** 권리 취득 + 권리 취득일부터 **3년 이내** 양도 | `acquisitionDate` · 권리 `acquisitionDate` · `transferDate` |
 * | §156의2④ · §156의3③ · 규칙 §75① | 3년 초과 — 신축주택 완성 후 이주·거주 / 경매·공매 | `rightThreeYearException` (Phase 2) |
 * | §156의2⑤ | 대체주택 | `replacementHouse` (E-5가 이미 판정 — 여기 오기 전에 비과세로 빠진다) |
 * | §156의2⑥·⑦ · §156의3④·⑤ | 상속받은 **권리** 귀속 | 권리의 상속 7필드 + 「상속개시 당시 보유」 **날짜 판정**(분양권 = 행 `acquisitionDate`, 입주권 = `inheritedDate` — 결정 #8, 선언 토글 폐지) |
 * | §156의2⑧·⑨ (§156의3⑥ 준용) | 동거봉양·혼인 합가 — 합가 전 보유 구성 | `mergedHouseholdFirstHouse` (Phase 4) — 미선택 = 불성립 + 확인 필요(결정 #7) · ⑧2호 `parentalCareMerge.parentAge`(결정 #9) · 혼인 후 분양권 취득은 명부 날짜(7572) |
 * | §156의2⑩ · §156의3⑦ | §155⑥1호 문화유산 주택 + 일반주택 + 권리 각 1개 | `culturalHeritageHouse` (Phase 5) |
 * | §156의2⑪ · §156의3⑧ | §155⑦**2호 이농주택** + 일반주택 + 권리 각 1개 | `ruralHouse.kind === "farm_exit"` (Phase 5) |
 * | §156의2⑦1호 · §156의3⑤1호 | 상속받은 **주택** — 후단 「상속개시 당시 보유한 주택」 | `houses[].isInherited` + 상속개시일 날짜 판정(신축주택 갈래 없음 — 결정 #8 하위 1) |
 *
 * 나머지는 「그 사실을 선언할 입력이 있는가」로 갈린다:
 *   · 있는데 선언하지 않았다 ⇒ **미해당 확정**(`marriageMerge`·`parentalCareMerge`·`ruralHouse`·
 *     `replacementHouse`·권리의 `isInherited`) — 화면에 칸이 있으므로 미선언은 사실의 표시다.
 *   · 아예 없다 ⇒ **판정 불가**(3주택 이상 등 「각각 1개씩」을 벗어난 조합).
 *
 * ## ⭐ ⑦1호(상속받은 **주택**)는 2주택 축으로 오지 않는다
 *
 * §155②③ 주택수 제외가 `checkExemption` 진입 전에 count를 1로 줄이므로
 * (`transfer-tax-house-exclusion-step.ts`) 그 세대는 U-1을 타지 않고 ③ 타이밍까지 그대로
 * 도달한다. 계획서는 이 갈래를 「2주택 + 1권리」로 분류했으나 **실측이 뒤집었다**.
 *
 * ## 🔑 2권리 세대는 두 축이 닫히면 **배제 확정**이다
 *
 * 1주택 + 2권리에 적용될 수 있는 예외는 16항 전수 대조 결과 **넷뿐**이다 —
 * §156의2⑦·§156의3⑤(상속 축, Phase 3)과 §156의2⑧·⑨(합가 축, Phase 4). 둘 다 결론이 나면
 * ③·②·④·③(전부 「1주택과 **1**권리」 전제)은 애초에 해당하지 않으므로 남는 예외가 없다.
 *
 * ## 🔑 §155①을 복사하면 조용히 틀린다
 *
 * 구조는 §155①(일시적 2주택)과 같아 보이지만 **세 군데가 다르다**:
 *   1. **처분기한은 평이한 3년**이다 — §156의2③·§156의3②에는 조정대상지역 단축(§155① DB 규칙)도
 *      §155⑯ 공공기관 이전 5년도 **없다**. `resolveTemporaryTwoHouseDeadlineYears`를 쓰면 안 된다.
 *   2. **기한 초과 치유 사유가 3개뿐**이다 — 시행규칙 §75①(한국자산관리공사 매각의뢰·법원 경매
 *      신청·국세징수법 공매)만이고, §155⑱의 4호(현금청산금 소송)·5호(수용재결·매도청구)는 **없다**.
 *   3. 기산 상대가 「다른 주택」이 아니라 **권리**다.
 *
 * ## ⚠️ 분양권은 취득일 게이트를 탄다 (조합원입주권은 타지 않는다)
 *
 * §89②의 「분양권」은 §88 10호 정의를 쓰고, 그 정의는 2021-01-01 시행분이다. 이 저장소는 같은
 * 사실을 §104⑦ 주택 수 산정에서 이미 `presaleRightStartDate`(DB 2021-01-01)로 다루고 있으므로
 * **같은 값을 재사용**한다(진실을 둘로 만들지 않는다 — `multi-house-surcharge-count.ts` 참조).
 * 조합원입주권은 그 개정 이전부터 조문에 있었으므로 게이트를 걸지 않는다.
 *
 * ✅ **조합원입주권 축 시행일도 확정됐다**(2026-08-27 · R-2) — 법률 제7837호 부칙 §12.
 *    다만 기준이 **인가일**이라 분양권(취득일)과 축이 다르다. `ARTICLE_89_2_REDEV_RIGHT_START_DATE`
 *    주석에 부칙 원문을 옮겨 두었다.
 */

import type { TransferTaxInput } from "./types/transfer.types";
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import { isWithinDeadline } from "./civil-period";
import { TRANSFER } from "./legal-codes";
import { meetsReplacementHouse } from "./one-house/replacement-house";
import { resolveRedevelopmentRightTiming } from "./one-house/original-member-right";
import { resolveAcquiredRightTiming } from "./transfer-tax-89-2-acquired-right-timing";
import {
  waivesPriorHouseOneYearGap,
  type ResidenceReqInput,
} from "./transfer-tax-exemption-requirements";
import { resolveMarriageThenPresaleRight, resolveMergedHouseholdVerdict } from "./transfer-tax-89-2-merged-household";
import {
  hasInheritedHouseOtherThanSelling,
  inheritedHousesHeldVerdict,
  qualifyInheritedRight,
  withClause2TraceNotes,
  type Article89Clause2Trace,
} from "./transfer-tax-89-2-inherited-right";
import { resolve1562Clause3Years } from "./data/article-156-2-completion-era";
import { presaleRightDefinitionAcquisitionDate } from "./presale-right-definition-date";

/* §156의2③·§156의3②의 처분기한(현행 3년)은 양도일 연혁 — `resolve1562Clause3Years`(M7). */

/*
 * §156의2⑧·⑨의 「합친 날(혼인한 날)부터 N년 이내에 먼저 양도하는 주택」의 N은
 * `data/merge-exemption-era.ts` `resolveMergeExemptionYears`가 정한다(OH-29).
 * §155④⑤와 **조문은 다르지만 같은 개정령·같은 부칙**으로 함께 바뀌었다 — 대통령령 제28637호
 * 부칙 제2조②(⑧·④ 2018-02-13) · 제34990호 부칙 제2조(⑨·⑤ 2024-11-12, 「제155조제5항 및
 * 제156조의2제9항의 개정규정은」이라 두 조항을 한 문장에 적었다). 그래서 한 함수를 공유한다.
 */

/**
 * §89②의 **조합원입주권 축 시행일** — 법률 제7837호(2005-12-31 공포·2006-01-01 시행) 부칙 §12.
 *
 * §89②을 **신설한** 개정이며, 그 부칙이 적용 범위를 이렇게 정했다:
 *   ① 「2006년 1월 1일 이후 최초로 … **관리처분계획이 인가된 분**부터 적용한다」
 *   ② 2006-01-01 **전** 인가분이라도 그 지위를 **2006-01-01 이후에 승계취득**하면
 *      2006-01-01 이후 인가로 취득한 조합원입주권으로 **보아서** 적용한다.
 *
 * ⚠️ **분양권 축과 기준이 다르다** — 분양권은 §88 10호 정의 시행일 기준 **취득일**
 *    (`presaleRightStartDate`, DB 2021-01-01)인데 조합원입주권은 **인가일**이다.
 *    한 상수로 묶으면 조용히 틀린다.
 */
export const ARTICLE_89_2_REDEV_RIGHT_START_DATE = new Date("2006-01-01");

export type Article89Clause2Status = "not_applicable" | "exception_met" | "undetermined" | "excluded";

export interface Article89Clause2Result {
  status: Article89Clause2Status;
  /** 충족된 예외 조문 표기 (status === "exception_met") */
  exception?: string;
  /**
   * **준용 근거** — §156의2⑦·⑩·⑪(§156의3⑤·⑦·⑧)를 거쳐 ③~⑤에 이른 경우 그 항.
   *
   * 🔑 `exception`을 「③(⑩ 준용)」처럼 합치지 않는다 — `transfer-tax.ts`의 사후관리(§156의2⑬)
   *    경고가 `exception`을 **문자열 일치**로 보는데, ⑬은 「제7항·제10항 또는 제11항에 따라
   *    제4항을 적용받은 1세대를 **포함한다**」라 준용 경로도 추징 대상이다. 합치면 그 경고가
   *    조용히 사라진다.
   */
  viaArticle?: string;
  /**
   * 예외가 §156의2**③·④** 또는 §156의3**②·③**(③ 후단 시행규칙 §75① 포함) 경로로 섰다 — ⑥(상속 권리)·⑧⑨(합가)·
   * ⑤(대체주택)가 아니다. 준용(⑦⑩⑪) 여부는 `viaArticle`이 따로 말한다.
   * 구 영 §167의11①1호(「제156조의2제3항부터 제5항까지 또는 제156조의3제2항ㆍ제3항에 따라」 — E-14f)의
   * 인용 범위를 문자열 비교 없이 가르려고 둔다. 비과세 판정에는 쓰지 않는다.
   */
  byTimingClause?: boolean;
  /**
   * 예외를 받은 세대의 **권리 종류** — 합가(⑧⑨·§156의3⑥) 의제에서만 채운다. `exception`이 항상 §156의2⑧·⑨로 적혀
   * (분양권은 §156의3⑥이 그 항에 위임한다) 문자열로는 어느 권리 세대인지 가릴 수 없어서 둔다(S05-8).
   * 입주권과 분양권이 섞인 세대는 `redevelopment_right`다 — 어느 라벨이 맞는지는 법문만으로 정해지지 않아 종전 표기를 유지한다.
   */
  rightKind?: PresaleRight["type"];
  /** 판정 불가 사유 — 사용자에게 「이 항을 직접 확인하라」고 알릴 조문 표기 */
  openArticles?: string[];
  /**
   * 3년 경과 예외(§156의2④·§156의3③ · 시행규칙 §75①)를 **선언하지 않아** 배제로 판정했다(`excluded`) — 그 조문 표기.
   * 「모름 → 혜택 불성립 + 확인 필요」(사용자 정책 2026-10-04 · E011 #2009 선례). 확인 필요 고지는 비과세 판정이
   * 이 배제 때문에만 과세로 갈릴 때 판정 메뉴가(`undeclaredThreeYearExceptionUndetermined`), 계산기는 경고로 낸다.
   */
  undeclaredArticles?: string[];
  /**
   * 배제(`excluded`)했지만 **모르는 사실 때문에** 특례를 적용하지 않은 경우의 확인 필요 사유(모름=불리).
   * 원조합원·승계취득 미입력, 원조합원 §155① 처분기한의 조정대상지역 판정 불가 등(`one-house/original-member-right.ts`).
   */
  confirmNotes?: string[];
  /**
   * 배제(`excluded`)가 **확정된 사실** 때문에 특정 예외를 적용하지 않은 사유 — 모름이 아니라 날짜로 확정된 불성립이다(결정 #8).
   * 상속 권리·상속주택 축에서 「상속개시 당시 보유한 주택」 요건이 날짜로 깨졌을 때, 종전에 뜨던 조문 지목 카드가 사라지므로
   * 이유를 한 줄 남긴다(`feedback_success_only_breakdown_hides_failures`). 판정 메뉴는 불성립 사유 카드로, 계산기는 경고로 낸다.
   */
  exclusionReasons?: string[];
  /**
   * 합가(혼인) 전 보유 구성(§156의2⑧⑨ · 분양권은 §156의3⑥)을 **선택하지 않아** 합가 예외를 적용하지 않고 배제한(`excluded`) 조문 표기
   * (결정 #7 — 모름 = 혜택 불성립 + 확인 필요). 확인 필요 고지는 비과세 판정이 이 배제 때문에만 과세로 갈릴 때 판정 메뉴가
   * (`undeclaredMergeCompositionUndetermined`), 계산기는 경고로 낸다. 문구는 중립이다 — 특정 선택지를 유도하지 않는다.
   */
  undeclaredMergeArticles?: string[];
  /** `exclusionReasons`가 가리키는 조문(불성립 사유 카드의 근거 표기) */
  exclusionBasis?: string;
  /**
   * §156의2③·§156의3② — **권리 취득일부터 3년** 처분기한 (P4-1).
   *
   * 종전에는 `:337` 지역변수로 만들어 비교에만 쓰고 버렸다. 판정 메뉴(P4)의 「조건부·기한」이
   * 「이 날짜까지 종전주택을 양도했어야 한다」를 보여주려면 그 값이 결과에 올라와야 한다
   * (UI가 날짜를 다시 계산하면 dual-truth — `feedback_aggregate_display_rederives_engine_value`).
   *
   * 🔑 **세액에는 영향이 없다** — 판정(`status`)은 이 필드 없이도 종전과 똑같이 난다.
   *    3년 기한을 **판정한 경로**에서만 채워지므로, 값이 없다는 것은 「그 축을 보지 않았다」는 뜻이다.
   * 말일이 토요일·공휴일이면 익일(민법 §161 — L-1) — 연장된 날이며 `deadlineNote`가 이유를 말한다.
   */
  deadline?: Date;
  deadlineNote?: string;
  /**
   * 공휴일 표 한계 고지(`civil-161-holiday-table-uncovered` — #32)의 **추가 후보 말일**(민법 §161 반영 후).
   * `deadline`은 배제 갈래에서만 채워져 **충족 갈래**(3년 안 양도 · 완성 후 N년 내 양도)의 기한 말일을 담지 못한다 —
   * 그 갈래에서도 말일이 양도일 곁에 있으면 공휴일 한 날이 결론을 가르므로 판정 경로가 실제로 비교한 말일을 따로 싣는다.
   * 세액·판정에는 쓰지 않는다.
   */
  noticeDeadlines?: Date[];
}

/** 이 술어가 읽는 입력만 — 겸용주택 등 부분 입력 경로도 그대로 재사용할 수 있게 좁힌다. */
export type Article89Clause2Input = Pick<
  TransferTaxInput,
  | "propertyType"
  | "isOneHousehold"
  | "acquisitionDate"
  | "transferDate"
  | "householdHousingCount"
  | "knownHouseExclusionHouseIds"
  | "presaleRights"
  | "marriageMerge"
  | "parentalCareMerge"
  | "ruralHouse"
  | "replacementHouse"
  | "rightThreeYearException"
  | "inheritedRightChoiceWhenBothHeld"
  | "generalHouseGiftedFromDecedentWithin2yr"
  | "generalHouseGiftDate"
  | "generalHouseRightAtInheritance"
  | "newBuildRightAcquisitionDate"
  | "mergedHouseholdFirstHouse"
  | "isFirstTransferredInMerge"
  | "culturalHeritageHouse"
  | "houses"
  | "sellingHouseId"
  | "regionCode"
  | "regionInDesignatedDistrict"
> &
  // §156의2③④·§156의3②③ 후단 — §154① 단서(1호·2호가목·3호) 해당 시 1년 요건 면제(OH-47)
  ResidenceReqInput;

/**
 * 이 권리가 §89②의 적용 대상인가 — **권리 종류마다 축이 다르다**.
 *
 * @param presaleRightStartDate §88 10호 「분양권」 정의 시행일. 미제공 시 분양권 축은
 *   **판정하지 않는다**(기산일을 모르는 채 불리하게 적용하지 않는다).
 */
function isClause2Right(right: PresaleRight, presaleRightStartDate: Date | undefined): boolean {
  if (right.type === "redevelopment_right") return isClause2RedevelopmentRight(right);
  if (presaleRightStartDate === undefined) return false;
  // 상속 분양권은 동일세대면 피상속인 취득일 — §104⑦과 같은 leaf(부칙 제4조가 두 축을 한 문장으로 정한다).
  return presaleRightDefinitionAcquisitionDate(right) >= presaleRightStartDate;
}

/**
 * 조합원입주권 축 — 법률 제7837호 부칙 §12(위 상수 주석에 원문).
 *
 * 🔑 **인가일이 2006 이전일 때만 취득일이 갈래를 가른다.**
 *   · 원조합원 — 종전주택 취득일이든 인가일이든 **둘 다 2006 이전**이라 어느 쪽으로 입력해도
 *     결과가 같다(⑤의 「취득일」 라벨이 모호해도 이 판정은 흔들리지 않는다).
 *   · 승계조합원 — 취득일 = 승계취득일. 2006-01-01 이후면 부칙 ②가 대상으로 **의제**한다.
 */
function isClause2RedevelopmentRight(right: PresaleRight): boolean {
  const approval = right.managementDisposalApprovalDate;
  // 미입력은 **원칙(부칙 ①)** 으로 읽는다 — 상수 주석의 「미입력 = 적용」 근거 참조.
  if (approval === undefined) return true;
  if (approval >= ARTICLE_89_2_REDEV_RIGHT_START_DATE) return true;
  return right.acquisitionDate >= ARTICLE_89_2_REDEV_RIGHT_START_DATE;
}

/**
 * §89② 배제 판정.
 *
 * @param presaleRightStartDate §88 10호 「분양권」 정의 시행일. DB `houseCountExclusionRules
 *   .presaleRightStartDate`를 그대로 넘긴다 — 미제공 시 분양권 축을 **판정하지 않는다**
 *   (기산일을 모르는 채 불리하게 적용하지 않는다).
 */
export function resolveArticle89Clause2(
  input: Article89Clause2Input,
  presaleRightStartDate: Date | undefined,
): Article89Clause2Result {
  const trace: Article89Clause2Trace = {};
  return withClause2TraceNotes(resolveArticle89Clause2Core(input, presaleRightStartDate, trace), trace);
}

function resolveArticle89Clause2Core(
  input: Article89Clause2Input,
  presaleRightStartDate: Date | undefined,
  trace: Article89Clause2Trace,
): Article89Clause2Result {
  // §89②은 「**그 주택**을 양도하는 경우」다 — 주택 양도가 아니면 이 조항의 대상이 아니다.
  if (input.propertyType !== "housing" || !input.isOneHousehold) {
    return { status: "not_applicable" };
  }

  // 🔴 종전에는 기산일 미제공 시 조합원입주권을 **무조건** 통과시켰다 — 인가일 게이트가
  //    그 경로를 타지 못했다. 이제 leaf가 종류별 축을 모두 판정한다.
  const rights = (input.presaleRights ?? []).filter((r) => isClause2Right(r, presaleRightStartDate));
  if (rights.length === 0) return { status: "not_applicable" };

  // §156의2⑤ 대체주택 — E-5와 같은 술어. 요건을 갖췄을 때만 예외다. 선언만으로 예외를 주면 E-5가
  //   불성립으로 떨어진 뒤 입주권이 주택 수에서 빠진 채 일반 1주택 비과세가 난다(M6 — 평가셋 N-G125).
  if (meetsReplacementHouse(input)) {
    return { status: "exception_met", exception: TRANSFER.REPLACEMENT_HOUSE_156_2_5 };
  }

  const open: string[] = [];

  /**
   * 합가 축 — §156의2⑧(동거봉양)·⑨(혼인). 분양권은 §156의3⑥이 **그대로 준용**하므로
   * 별도 구현하지 않는다(위임을 재구현하면 진실이 둘이 된다).
   *
   * ⑧은 「이를 1세대1주택으로 **보아** 제154조제1항을 적용한다」 = **직접 의제**다 ⇒ 충족하면
   * 타이밍(③④) 판정 없이 그 자체로 예외가 성립한다.
   */
  const mergeVerdict = resolveMergedHouseholdVerdict(input);
  if (mergeVerdict.status === "met") {
    // 분양권만 있는 세대는 §156의3⑥이 ⑧·⑨에 위임한다 — 그 경유를 `viaArticle`로 밝힌다(준용 표기 규약).
    const presaleOnly = rights.every((r) => r.type === "presale_right");
    return {
      status: "exception_met",
      exception: mergeVerdict.exception,
      rightKind: presaleOnly ? "presale_right" : "redevelopment_right",
      ...(presaleOnly ? { viaArticle: TRANSFER.PRESALE_MERGE_156_3_6 } : {}),
    };
  }

  // ⑧ 직계존속 연령 요건 — 모름은 확인 필요, 요양급여 갈래는 이 경로에 없다는 사유(결정 #9). 최종 결과가 배제일 때만 래퍼가 싣는다.
  if (mergeVerdict.status === "unmet") {
    if (mergeVerdict.confirmNotes) trace.mergeConfirmNotes = mergeVerdict.confirmNotes;
    if (mergeVerdict.exclusionReasons) trace.mergeExclusionReasons = mergeVerdict.exclusionReasons;
  }
  // 구성 미선언 — 불성립 + 확인 필요(결정 #7). 최종 결과가 배제일 때만 래퍼가 `undeclaredMergeArticles`로 옮긴다.
  if (mergeVerdict.status === "undeclared") trace.mergeUndeclared = mergeVerdict.articles;

  // 혼인 후 분양권 취득(서면-2021-부동산-7572) — 합가 전 보유 구성 선언과 무관하게 명부 날짜로 판정한다(결정 #7 하위 1).
  const marriageThenPresale = resolveMarriageThenPresaleRight(input, rights);
  if (marriageThenPresale) return marriageThenPresale;

  /**
   * 2주택 축 — §156의2⑦·⑩·⑪ · §156의3⑤·⑦·⑧ (Phase 5).
   *
   * 셋 다 「(특수)주택 + 일반주택 + 권리를 **각각 1개씩**」이고 ③~⑤(②·③)를 **준용**한다.
   * ⇒ 특수주택이 무엇인지 판정되면 타이밍 판정을 그대로 태우고, 아니면 판정 불가로 남긴다.
   */
  const twoHouseVia = resolveTwoHouseSpecialArticle(input, rights);
  /**
   * E011 — **2주택 + 1권리**에서 특수주택(문화유산·이농주택)을 선언하지 않았으면 2주택 축은 **결론이 난 것**이다.
   * 두 사실 모두 명부 행에 선언 칸이 있으므로 미선언은 사실의 표시이고(위 「있는데 선언하지 않았다 ⇒ 미해당
   * 확정」과 같은 규약), 상속받은 주택(⑦1호)은 §155②③ 제외가 count를 먼저 줄여 여기 오지 않는다.
   * 일시적 2주택(§155①)과 §156의2③·§156의3②의 중첩은 국세청이 부인했다(해석례 평가셋 `E011-era`·`E011-era-2`).
   * 3주택 이상은 「각각 1개씩」을 벗어나 입력 경로가 없으므로 종전대로 판정 불가로 둔다.
   * 🔑 농어촌주택을 **선언했는데** ⑪(이농)이 아닌 경우(상속·귀농)는 닫지 않는다 — 결정 범위가 「선언 없음」이다.
   */
  const twoHouseAxisClosed =
    input.householdHousingCount === 2 &&
    rights.length === 1 &&
    twoHouseVia === undefined &&
    input.culturalHeritageHouse !== true &&
    input.ruralHouse === undefined;
  if (input.householdHousingCount >= 2 && twoHouseVia === undefined && !twoHouseAxisClosed) {
    open.push(...openArticlesForTwoHouseAxis(input));
  }

  /**
   * 상속받은 권리 축 — §156의2⑥·⑦ · §156의3④·⑤ (Phase 3).
   *
   * ⑥·④ = 「상속 권리 + 일반주택」 각 1개 ⇒ **직접 1세대1주택 의제**.
   * ⑦·⑤ = 「상속 권리 + 일반주택 + **상속 외** 권리」 각 1개 ⇒ 상속받은 것을 **없는 셈 치고**
   *        ③~⑤(②·③)를 준용한다.
   */
  const inheritedRights = rights.filter((r) => r.isInherited === true);
  const otherRights = rights.filter((r) => r.isInherited !== true);
  // 신축주택 갈래(상속개시 당시 보유한 권리로 완공된 신축주택)는 ⑥·④ 모양(상속 권리 + 일반주택)에서만 인정한다 —
  // ⑦·⑤ 후단(상속 외 권리 동반)에는 그 문구가 없다(결정 #8 조건).
  const newBuildAllowed = otherRights.length === 0;
  const inheritedVerdict =
    inheritedRights.length === 1
      ? qualifyInheritedRight(inheritedRights[0], input, newBuildAllowed, trace)
      : inheritedRights.length === 0
        ? "not_inherited"
        : "undetermined"; // 상속 권리 2개 이상 — 조문이 「1개」를 전제한다
  /** ⑦·⑤가 담당하는 조합인가 — 「상속 1 + 상속 외 1」. */
  const isArticle7Shape =
    inheritedVerdict === "qualified" && inheritedRights.length === 1 && otherRights.length === 1;

  if (inheritedVerdict === "undetermined") {
    // 세대가 가진 권리 종류의 조문만 안내한다 — 분양권만 있는 세대에 §156의2를 가리키면 확인해도 소용없다(S05-8).
    open.push(...openArticlesByRightKind(rights, "⑥·⑦", "④·⑤"));
  }

  /**
   * 권리 2개 이상.
   *
   * 🔴 2026-08-26 정정(P-0): 종전에는 여기서 §156의2③·④ · §156의3②·③을 가리켰다. **틀렸다** —
   *    그 네 항은 전부 「1주택과 **1**조합원입주권/분양권」을 전제하므로 2권리 세대에는 애초에
   *    해당하지 않는다. 확인해도 소용없는 조문을 안내하면 「판정 불가 고지」가 무의미해진다.
   *
   *    1주택 + 2권리에 실제로 적용될 수 있는 예외는 넷이다(16항 전수 대조):
   *      · §156의2⑦ · §156의3⑤ — 상속받은 것이 **권리**면 「상속 권리 + 일반주택 + 상속 외 권리」
   *      · §156의2⑧ · ⑨ — 본문이 「1주택과 **2조합원입주권**」을 **명문으로 열거**한다
   *
   * ⑦·⑤가 성립하는 조합(`isArticle7Shape`)은 Phase 3이 담당하므로 여기서 빼지 않는다.
   */
  const isTwoRightShape = rights.length >= 2 && !isArticle7Shape;

  /**
   * §156의2⑦1호 · §156의3⑤1호 — 상속받은 **주택** 갈래의 후단 요건.
   *
   * 🔴 이 세대는 §155②③ 주택수 제외가 `checkExemption` 진입 전에 count를 1로 줄여
   *    (`transfer-tax-house-exclusion-step.ts`) 위 2주택 축을 **타지 않는다**. 그래서 ③ 타이밍
   *    까지 그대로 도달하는데, ⑦ 후단의 「제3항 및 제4항의 규정을 적용받는 일반주택은
   *    **상속개시 당시 보유한 주택**으로 한정한다」가 한 번도 검증되지 않고 있었다(실측).
   */
  const houseHeldVerdict = hasInheritedHouseOtherThanSelling(input) ? inheritedHousesHeldVerdict(input) : "yes";

  if (open.length > 0) return { status: "undetermined", openArticles: dedupe(open) };

  /**
   * ⑦1호·⑤1호 후단의 일반주택 요건이 날짜로 깨졌거나(`no`) 날짜를 몰라(`unknown` — 모름 = 혜택 불성립 + 확인 필요) 상속주택 갈래가
   * 서지 않는다 ⇒ 남은 예외가 없어 배제 확정이다(종전: 판정 불가·비과세 유지). 사유·확인 필요는 래퍼가 싣는다.
   */
  if (houseHeldVerdict !== "yes") {
    trace.houses = {
      kind: houseHeldVerdict === "no" ? "after" : "unknown",
      rightTypes: [...new Set(rights.map((r) => r.type))],
    };
    return { status: "excluded" };
  }

  /**
   * 권리 2개 이상 — 남는 예외가 없으면 **배제 확정**이다.
   *
   * 🔴 2026-08-26 정정(P-0): 종전에는 여기서 §156의2③·④ · §156의3②·③을 가리켰다. **틀렸다** —
   *    그 네 항은 전부 「1주택과 **1**조합원입주권/분양권」을 전제하므로 2권리 세대에는 애초에
   *    해당하지 않는다.
   *
   *    1주택 + 2권리에 실제로 적용될 수 있는 예외는 넷이다(16항 전수 대조):
   *      · §156의2⑦ · §156의3⑤ — 상속받은 것이 **권리**면 「상속 권리 + 일반주택 + 상속 외 권리」
   *        ⇒ `isArticle7Shape`. Phase 3이 담당한다.
   *      · §156의2⑧ · ⑨ — 본문이 「1주택과 **2조합원입주권**」을 **명문으로 열거**한다
   *        ⇒ 위 `mergeVerdict`가 담당한다(Phase 4).
   *
   * ⇒ 두 축이 모두 결론난 2권리 세대에는 적용될 예외가 **남지 않는다**.
   */
  if (isTwoRightShape) return { status: "excluded" };
  if (twoHouseAxisClosed) return { status: "excluded" };


  /**
   * §156의2③ / §156의3② — 「종전주택 취득한 날부터 **1년 이상이 지난 후**에 권리를 취득하고
   * 그 권리를 취득한 날부터 **3년 이내**에 종전주택을 양도하는 경우」.
   *
   * ⚠️ 「1년」의 상대는 **가장 먼저 취득한 권리**다(권리가 1개인 경로만 여기 온다 — 위에서
   *    2개 이상은 판정 불가로 빠진다).
   */
  /**
   * §156의2⑥ · §156의3④ — 상속 권리 + 일반주택 각 1개. 준용이 아니라 **직접 1세대1주택 의제**다
   * (「국내에 1개의 주택을 소유하고 있는 것으로 보아 제154조제1항을 적용한다」).
   * ⇒ 타이밍(1년·3년) 요건이 **없다**. ③④를 태우면 조용히 틀린다.
   */
  if (inheritedVerdict === "qualified" && otherRights.length === 0) {
    return {
      status: "exception_met",
      exception:
        inheritedRights[0].type === "redevelopment_right"
          ? "소득세법 시행령 §156의2 ⑥"
          : "소득세법 시행령 §156의3 ④",
    };
  }

  /**
   * §156의2⑦ · §156의3⑤ — 상속받은 것을 **없는 셈 치고** 「일반주택 + 상속 외 권리」로 보아
   * ③~⑤(②·③)를 준용한다. ⇒ 타이밍 판정의 상대는 **상속 외 권리**다.
   */
  const right = isArticle7Shape ? otherRights[0] : rights[0];
  /** 준용 근거 — ⑦(상속 축) 또는 ⑩·⑪(2주택 축). 둘 다 아니면 ③이 직접 적용된 것이다. */
  const viaArticle =
    isArticle7Shape || hasInheritedHouseOtherThanSelling(input)
      ? // ⑦(입주권판)·§156의3⑤(분양권판)는 **상속 외의 원인으로 취득한 권리**의 종류가 가른다 — `right`가 바로 그 권리다.
        right.type === "presale_right"
        ? TRANSFER.INHERITED_OTHER_PRESALE_156_3_5
        : TRANSFER.INHERITED_OTHER_RIGHT_156_2_7
      : resolveTwoHouseSpecialArticle(input, rights);
  const successorReading = () => resolveAcquiredRightTiming(input, right, viaArticle);
  if (right.type !== "redevelopment_right") return successorReading();
  // 조합원입주권 — ③·④는 승계취득 전용, 원조합원은 §155①(`one-house/original-member-right.ts`).
  return resolveRedevelopmentRightTiming({
    input,
    right,
    oneYearWaived: waivesPriorHouseOneYearGap(input),
    viaArticle,
    successorReading,
  });
}

/**
 * 2주택 축 — 「(특수)주택 + 일반주택 + 권리를 **각각 1개씩**」이 성립하는가.
 * 성립하면 ③~⑤(②·③)를 **준용**하므로 그 준용 근거 항을 돌려준다.
 *
 * | 항 | 특수주택 | 근거 입력 |
 * |---|---|---|
 * | §156의2⑩ · §156의3⑦ | §155⑥1호 문화유산 주택 | `culturalHeritageHouse` |
 * | §156의2⑪ · §156의3⑧ | §155⑦**2호 이농주택** | `ruralHouse.kind === "farm_exit"` |
 *
 * 🔑 ⑪은 **이농주택만**이다 — `RuralHouseKind` 셋 중 상속(1호)·귀농(3호)은 대상이 아니다.
 * 🔑 ⑦1호(상속받은 **주택**)는 여기 오지 않는다 — §155②③ 주택수 제외가 진입 전에 count를
 *    1로 줄이기 때문이다(호출부 주석 참조).
 */
function resolveTwoHouseSpecialArticle(
  input: Article89Clause2Input,
  rights: readonly PresaleRight[],
): string | undefined {
  // 「각각 1개씩」 — 특수주택 1 + 일반주택 1 = 2주택, 권리 1개.
  if (input.householdHousingCount !== 2 || rights.length !== 1) return undefined;
  // ⑩·⑪은 조합원입주권, §156의3⑦·⑧은 분양권을 요건으로 한다(S05-8).
  const presale = rights[0].type === "presale_right";
  if (input.culturalHeritageHouse === true) {
    return presale ? TRANSFER.CULTURAL_HERITAGE_PRESALE_156_3_7 : TRANSFER.CULTURAL_HERITAGE_RIGHT_156_2_10;
  }
  if (input.ruralHouse?.kind === "farm_exit") {
    return presale ? TRANSFER.FARM_EXIT_PRESALE_156_3_8 : TRANSFER.FARM_EXIT_RIGHT_156_2_11;
  }
  return undefined;
}

/**
 * 판정 불가 안내용 — 세대가 가진 **권리 종류의 조문만** 싣는다(입주권 → §156의2, 분양권 → §156의3).
 * 둘 다 가진 세대는 둘 다 싣는다.
 */
function openArticlesByRightKind(rights: readonly PresaleRight[], redevClauses: string, presaleClauses: string): string[] {
  const out: string[] = [];
  if (rights.some((r) => r.type === "redevelopment_right")) out.push(`${TRANSFER.RIGHT_ONE_HOUSE_SPECIAL} ${redevClauses}`);
  if (rights.some((r) => r.type === "presale_right")) out.push(`${TRANSFER.PRESALE_ONE_HOUSE_SPECIAL} ${presaleClauses}`);
  return out;
}

/**
 * 2주택 축이 판정되지 않았을 때 **그 세대에 실제로 적용될 수 있는** 조문만 안내한다.
 *
 * 🔑 ⑪·§156의3⑧은 이농주택 전용이므로, 상속 농어촌주택·귀농주택 세대에는 가리키지 않는다
 *    (확인해도 소용없는 조문 안내 금지 — P-0과 같은 층위).
 */
function openArticlesForTwoHouseAxis(input: Article89Clause2Input): string[] {
  const isRuralOutOfScope = input.ruralHouse !== undefined && input.ruralHouse.kind !== "farm_exit";
  return isRuralOutOfScope
    ? ["소득세법 시행령 §156의2 ⑦·⑩", "소득세법 시행령 §156의3 ⑤·⑦"]
    : ["소득세법 시행령 §156의2 ⑦·⑩·⑪", "소득세법 시행령 §156의3 ⑤·⑦·⑧"];
}

/**
 * 권리 취득일부터 **3년을 넘겨** 양도했는가 — ⑤ UI가 「3년 초과 예외」 카드를 열 때 쓰는
 * 공용 술어. 엔진 판정과 **같은 기준**이어야 화면과 계산이 갈리지 않는다.
 */
export function isRightThreeYearExceeded(p: {
  rightAcquisitionDate: Date;
  transferDate: Date;
}): boolean {
  return !isWithinDeadline(p.rightAcquisitionDate, resolve1562Clause3Years(p.transferDate), p.transferDate);
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}
