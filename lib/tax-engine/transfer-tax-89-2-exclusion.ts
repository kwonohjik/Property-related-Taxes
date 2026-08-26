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
 * | §156의2⑥·⑦ · §156의3④·⑤ | 상속받은 **권리** 귀속 | 권리의 상속 7필드 + `generalHouseHeldAtInheritance` (Phase 3) |
 * | §156의2⑧·⑨ (§156의3⑥ 준용) | 동거봉양·혼인 합가 — 합가 전 보유 구성 | `mergedHouseholdFirstHouse` (Phase 4) |
 *
 * 나머지는 「그 사실을 선언할 입력이 있는가」로 갈린다:
 *   · 있는데 선언하지 않았다 ⇒ **미해당 확정**(`marriageMerge`·`parentalCareMerge`·`ruralHouse`·
 *     `replacementHouse`·권리의 `isInherited`) — 화면에 칸이 있으므로 미선언은 사실의 표시다.
 *   · 아예 없다 ⇒ **판정 불가**(§156의2⑦의 **주택** 갈래·⑩ 문화유산·⑪ 이농 — Phase 5).
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
 * 🔶 **확인 필요** — §89②의 **조합원입주권 축 자체의 시행일**은 읽지 못했다(법제처 DRF 과거
 *    시행본 조회에 `KOREAN_LAW_OC`가 필요하고 이 저장소 `.env.local`에는 없다).
 *    2006년 이전 양도를 다루게 되면 그 시행일을 먼저 확정할 것.
 */

import type {
  TransferTaxInput,
  RightThreeYearException,
  MergedHouseholdFirstHouse,
} from "./types/transfer.types";
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import { addYears } from "date-fns";

/** §156의2③·§156의3②의 처분기한 — 조문 문언 그대로 3년(단축·연장 규정 없음). */
export const ARTICLE_156_2_3_DEADLINE_YEARS = 3;

/**
 * §156의2⑧·⑨의 「합친 날(혼인한 날)부터 **10년 이내**에 먼저 양도하는 주택」.
 *
 * ⚠️ §155④⑤의 10년과 **숫자만 같고 조문이 다르다**(`MERGE_EXEMPTION_YEARS`) — 상수를
 *    공유하면 한쪽이 개정될 때 다른 쪽이 조용히 따라간다.
 */
export const ARTICLE_156_2_8_MERGE_YEARS = 10;

export type Article89Clause2Status = "not_applicable" | "exception_met" | "undetermined" | "excluded";

export interface Article89Clause2Result {
  status: Article89Clause2Status;
  /** 충족된 예외 조문 표기 (status === "exception_met") */
  exception?: string;
  /** 판정 불가 사유 — 사용자에게 「이 항을 직접 확인하라」고 알릴 조문 표기 */
  openArticles?: string[];
}

/** 이 술어가 읽는 입력만 — 겸용주택 등 부분 입력 경로도 그대로 재사용할 수 있게 좁힌다. */
export type Article89Clause2Input = Pick<
  TransferTaxInput,
  | "propertyType"
  | "isOneHousehold"
  | "acquisitionDate"
  | "transferDate"
  | "householdHousingCount"
  | "presaleRights"
  | "marriageMerge"
  | "parentalCareMerge"
  | "ruralHouse"
  | "replacementHouse"
  | "rightThreeYearException"
  | "generalHouseHeldAtInheritance"
  | "inheritedRightChoiceWhenBothHeld"
  | "generalHouseGiftedFromDecedentWithin2yr"
  | "mergedHouseholdFirstHouse"
  | "isFirstTransferredInMerge"
>;

/** §89②의 「분양권」인가 — §88 10호 정의 시행일(2021-01-01) 이후 취득분만. */
function isClause2Right(right: PresaleRight, presaleRightStartDate: Date): boolean {
  if (right.type === "redevelopment_right") return true;
  return right.acquisitionDate >= presaleRightStartDate;
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
  // §89②은 「**그 주택**을 양도하는 경우」다 — 주택 양도가 아니면 이 조항의 대상이 아니다.
  if (input.propertyType !== "housing" || !input.isOneHousehold) {
    return { status: "not_applicable" };
  }

  const rights = (input.presaleRights ?? []).filter((r) =>
    presaleRightStartDate === undefined
      ? r.type === "redevelopment_right"
      : isClause2Right(r, presaleRightStartDate),
  );
  if (rights.length === 0) return { status: "not_applicable" };

  // §156의2⑤ 대체주택 — `checkExemption` E-5가 요건을 판정한다. 선언돼 있으면 그 판정에 맡긴다.
  if (input.replacementHouse) {
    return { status: "exception_met", exception: "소득세법 시행령 §156의2 ⑤" };
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
    return { status: "exception_met", exception: mergeVerdict.exception };
  }

  /**
   * 2주택 이상 세대 — §156의2⑦⑩⑪ · §156의3⑤⑦⑧은 전부 「(특수)주택 + 일반주택 + 권리를
   * **각각 1개씩**」이라 2주택을 전제한다. 그 축의 입력(상속 귀속·문화유산·이농)이 없으므로
   * 여기서는 결론을 내지 않는다.
   */
  if (input.householdHousingCount >= 2) {
    open.push("소득세법 시행령 §156의2 ⑦·⑩·⑪", "소득세법 시행령 §156의3 ⑤·⑦·⑧");
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
  const inheritedVerdict =
    inheritedRights.length === 1
      ? qualifyInheritedRight(inheritedRights[0], input)
      : inheritedRights.length === 0
        ? "not_inherited"
        : "undetermined"; // 상속 권리 2개 이상 — 조문이 「1개」를 전제한다
  /** ⑦·⑤가 담당하는 조합인가 — 「상속 1 + 상속 외 1」. */
  const isArticle7Shape =
    inheritedVerdict === "qualified" && inheritedRights.length === 1 && otherRights.length === 1;

  if (inheritedVerdict === "undetermined") {
    open.push("소득세법 시행령 §156의2 ⑥·⑦", "소득세법 시행령 §156의3 ④·⑤");
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
   * 합가 축이 **미선언**이면 그 축만 판정 불가로 남긴다(Phase 4).
   * 선언했는데 요건을 못 갖췄으면(`unmet`) 그 축은 **결론이 난 것**이므로 열지 않는다.
   */
  if (mergeVerdict.status === "not_declared") open.push(...mergeVerdict.openArticles);

  // 농어촌 이농주택 — §156의2⑪ · §156의3⑧ (2주택 축이라 위와 겹치나 선언 자체를 신호로 본다).
  if (input.ruralHouse) {
    open.push("소득세법 시행령 §156의2 ⑪", "소득세법 시행령 §156의3 ⑧");
  }

  if (open.length > 0) return { status: "undetermined", openArticles: dedupe(open) };

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
  const oneYearMet = right.acquisitionDate >= addYears(input.acquisitionDate, 1);
  const deadline = addYears(right.acquisitionDate, ARTICLE_156_2_3_DEADLINE_YEARS);
  const withinDeadline = input.transferDate <= deadline;
  const clause = right.type === "redevelopment_right" ? "§156의2 ③" : "§156의3 ②";

  if (oneYearMet && withinDeadline) {
    return { status: "exception_met", exception: `소득세법 시행령 ${clause}` };
  }
  if (oneYearMet) {
    /**
     * 1년은 충족했는데 3년을 넘겼다 — 남은 갈래는 **둘뿐**이다(16항 전수 대조):
     *   · §156의2④ · §156의3③ — 신축주택 완성 후 3년 내 세대전원 이사 + 1년 이상 계속 거주
     *   · 시행규칙 §75① — 3년이 되는 날 현재 매각의뢰·경매·공매 **이고 그 방법으로 양도**
     *
     * 🔴 **선언이 없으면 판정하지 않는다**(Phase 2). 신규 필드라 기존 저장분에 값이 없고,
     *    미입력을 「미해당」으로 읽으면 3년 초과 세대 전체가 갑자기 과세로 뒤집힌다.
     */
    const fourthClause =
      right.type === "redevelopment_right"
        ? "소득세법 시행령 §156의2 ④"
        : "소득세법 시행령 §156의3 ③";
    const declared = input.rightThreeYearException;
    if (declared === undefined) {
      return { status: "undetermined", openArticles: [fourthClause, "소득세법 시행규칙 §75 ①"] };
    }
    if (meetsThreeYearException(declared, input.transferDate)) {
      return {
        status: "exception_met",
        exception:
          declared.kind === "new_house"
            ? fourthClause
            : `${right.type === "redevelopment_right" ? "소득세법 시행령 §156의2 ③" : "소득세법 시행령 §156의3 ②"} 후단(소득세법 시행규칙 §75 ①)`,
      };
    }
    return { status: "excluded" };
  }

  /**
   * 1년 요건 미충족 — ③도 ④도 「1년이 지난 후에 권리를 취득」을 **함께** 요구하므로 둘 다 탈락하고,
   * 나머지 예외는 위에서 전부 배제됐다. ⇒ §89② 본문이 그대로 적용된다.
   */
  return { status: "excluded" };
}

/**
 * 합가(동거봉양·혼인) 축의 판정 — 「소득세법 시행령」 §156의2⑧·⑨.
 *
 * ## 네 갈래
 *
 * · `no_merge`     — 합가 사실 자체가 없다. 화면에 합가일 칸이 있으므로 **미입력은 미해당**이다.
 * · `not_declared` — 합가는 있는데 **합가 전 보유 구성**을 선언하지 않았다 ⇒ 판정 불가(경고).
 * · `unmet`        — 선언했는데 어느 호에도 해당하지 않는다 ⇒ 이 축은 결론이 났다.
 * · `met`          — 어느 호에 해당한다 ⇒ **직접 1세대1주택 의제**(타이밍 요건 없음).
 *
 * ## ⚠️ §155④⑤와 술어를 공유하지 않는다
 *
 * 재사용하는 것은 **합가일과 선양도 두 사실**까지다. §155④⑤는 주택 + 주택 조합이라 아래
 * 3·4·5호의 「합가 전 보유 구성」 요건이 아예 없다.
 */
type MergedHouseholdVerdict =
  | { status: "no_merge" }
  | { status: "not_declared"; openArticles: string[] }
  | { status: "unmet" }
  | { status: "met"; exception: string };

function resolveMergedHouseholdVerdict(input: Article89Clause2Input): MergedHouseholdVerdict {
  const parentalCareDate = input.parentalCareMerge?.mergeDate;
  const marriageDate = input.marriageMerge?.marriageDate;
  if (!parentalCareDate && !marriageDate) return { status: "no_merge" };

  const declared = input.mergedHouseholdFirstHouse;
  if (declared === undefined) {
    return {
      status: "not_declared",
      openArticles: [
        ...(parentalCareDate ? ["소득세법 시행령 §156의2 ⑧"] : []),
        ...(marriageDate ? ["소득세법 시행령 §156의2 ⑨"] : []),
      ],
    };
  }

  // ⑧·⑨ 본문 공통 — 「합친 날부터 10년 이내에 **먼저 양도하는 주택**」.
  if (input.isFirstTransferredInMerge !== true) return { status: "unmet" };

  const axes: { date: Date | undefined; clause: "⑧" | "⑨" }[] = [
    { date: parentalCareDate, clause: "⑧" },
    { date: marriageDate, clause: "⑨" },
  ];
  for (const { date, clause } of axes) {
    if (!date) continue;
    if (input.transferDate > addYears(date, ARTICLE_156_2_8_MERGE_YEARS)) continue;
    const item = matchMergedHouseholdClause(declared, {
      mergeDate: date,
      houseAcquisitionDate: input.acquisitionDate,
      isParentalCare: clause === "⑧",
    });
    if (item) return { status: "met", exception: `소득세법 시행령 §156의2 ${clause}${item}` };
  }
  return { status: "unmet" };
}

/**
 * 최초양도주택이 ⑧3·4·5호(⑨2·3·4호) 중 어디에 해당하는가 — 해당 호·목 표기를 돌려준다.
 *
 * ## 🔑 ⑨는 **호 번호가 하나씩 당겨진다**
 *
 * ⑨에는 「60세 이상 직계존속」인 제2호가 없어 제1호 하나뿐이다 ⇒ **2호 = ⑧3호 · 3호 = ⑧4호 ·
 * 4호 = ⑧5호**. 인용 문자열을 상수로 묶으면 조용히 틀린다.
 *
 * ## 🔑 3·4호와 5호는 취득 시점의 방향이 **반대**다
 *
 * 3·4호는 「합친 날 이전에 … **소유하던** 주택」이고, 5호는 합가 전 권리에 의하여 「합친 날
 * **이후에 취득하는** 주택」이다. 한 조건으로 묶을 수 없다.
 */
function matchMergedHouseholdClause(
  declared: MergedHouseholdFirstHouse,
  p: { mergeDate: Date; houseAcquisitionDate: Date; isParentalCare: boolean },
): string | undefined {
  /** ⑧ 기준 호 번호 → ⑨는 하나 당겨진다. */
  const no = (parentalCareNo: number) => (p.isParentalCare ? parentalCareNo : parentalCareNo - 1);
  const ownedBeforeMerge = p.houseAcquisitionDate <= p.mergeDate;
  const acquiredAfterMerge = p.houseAcquisitionDate > p.mergeDate;

  switch (declared.kind) {
    case "house_only":
      return ownedBeforeMerge ? `${no(3)}호` : undefined;
    case "initial_right":
      // 가목은 요건이 **둘**이다 — 「인가일 이후 취득」 그리고 「취득 후 1년 이상 거주」.
      return ownedBeforeMerge && declared.acquiredAfterApproval && declared.residedOneYear
        ? `${no(4)}호가목`
        : undefined;
    case "succeeded_right":
      return ownedBeforeMerge && declared.ownedBeforeRight ? `${no(4)}호나목` : undefined;
    case "presale_right":
      return ownedBeforeMerge && declared.ownedBeforeRight ? `${no(4)}호다목` : undefined;
    case "right_only":
      return acquiredAfterMerge ? `${no(5)}호` : undefined;
    case "none":
      return undefined;
  }
}

/**
 * 상속받은 권리가 §156의2⑥(입주권)·§156의3④(분양권)의 「상속받은 권리」로 **인정되는가**.
 *
 * ## 세 갈래로 답한다
 *
 * · `qualified`    — 요건을 모두 충족. ⑥(단독) 또는 ⑦(상속 외 권리 1개 동반)로 간다.
 * · `disqualified` — 요건 중 하나가 **명시적으로** 깨졌다. 그 권리는 「상속받은 것」이 아니라
 *                    **일반 권리**로 취급되어 ③④ 타이밍 판정을 탄다.
 * · `undetermined` — 긍정 선언(`generalHouseHeldAtInheritance`)이 없어 판정할 수 없다.
 *                    ⇒ 종전 동작 유지 + 경고. **`disqualified`로 떨어뜨리면 안 된다** —
 *                    미선언을 미해당으로 읽으면 상속 권리 보유 세대가 갑자기 과세로 뒤집힌다.
 *
 * ## 부정 선언은 `!== true` 규약을 따른다
 *
 * 순위 부적격·공동상속 소수지분·동일세대 등은 **체크박스가 화면에 있으므로** 미체크를 「아님」으로
 * 읽는다 — 주택 축(`transfer-inheritance-exclusion.ts`)이 §155②③에서 쓰는 것과 같은 규약이다.
 */
function qualifyInheritedRight(
  right: PresaleRight,
  input: Article89Clause2Input,
): "qualified" | "disqualified" | "undetermined" {
  // ── ⑥ 본문 괄호 ①: 피상속인이 상속개시 당시 **주택**을 소유하지 않았을 것 ──
  //    ⚠️ ⑮·⑫ 선택으로도 **면제되지 않는다**(⑮ 본문이 「주택은 소유하지 않고」를 전제로 건다).
  if (right.decedentOwnedHouseAtDeath === true) return "disqualified";

  // ── ⑥ 본문 괄호 ②: 피상속인이 **다른 종류의 권리**를 소유하지 않았을 것 ──
  //    §156의2⑮ · §156의3⑫ 선택이 이 요건**만** 면제한다.
  const article15Applied = input.inheritedRightChoiceWhenBothHeld === right.type;
  if (right.decedentOwnedOtherRightTypeAtDeath === true && !article15Applied) {
    return "disqualified";
  }

  // ── ⑥1~3호 / §156의3④1~2호 순위 ──
  if (right.isRankingDisqualifiedInheritedRight === true) return "disqualified";

  // ── 공동상속: ⑦3호가목 / ⑤5호가목 — 최대지분 상속인이 소유한 것으로 본다 ──
  if (right.isCoInherited === true && right.isLargestCoInheritedShareholder !== true) {
    return "disqualified";
  }

  // ── ⑥ 단서: 상속개시 당시 상속인·피상속인이 1세대였으면 원칙 배제 ──
  if (
    right.decedentSameHouseholdAtInheritance === true &&
    right.parentalCareMergeInheritedRight !== true
  ) {
    return "disqualified";
  }

  // ── 일반주택 요건: 상속개시일 소급 2년 내 피상속인 증여분이면 배제 ──
  if (input.generalHouseGiftedFromDecedentWithin2yr === true) return "disqualified";

  // ── 일반주택 요건: 「상속개시 당시 보유한 주택」 — **긍정 선언 필수** ──
  if (input.generalHouseHeldAtInheritance !== true) return "undetermined";

  return "qualified";
}

/**
 * 3년 초과 예외 선언이 **요건을 충족하는가**.
 *
 * · `new_house` — 「소득세법 시행령」 §156의2④1호·2호 / §156의3③1호·2호
 *   1호: 완성 후 3년 이내 세대전원 이사 + 1년 이상 계속 거주 (둘 다 자기선언)
 *   2호: **완성되기 전 또는 완성된 후 3년 이내**에 종전주택을 양도
 * · `delay` — 「소득세법 시행규칙」 §75① : 사유 해당 **그리고** 그 방법에 따라 양도
 * · `none` — 명시적 미해당 선언
 */
function meetsThreeYearException(
  declared: RightThreeYearException,
  transferDate: Date,
): boolean {
  if (declared.kind === "none") return false;
  if (declared.kind === "delay") {
    // ⚠️ 요건이 둘이다 — §155⑱(전자만)을 복사하면 후자가 빠진다.
    return declared.disposedByThatMethod === true;
  }
  const movedAndResided =
    declared.movedInWithin3Years === true && declared.residedOneYearOrMore === true;
  if (!movedAndResided) return false;
  // 2호 — 「완성되기 전」이면 완성일 비교 없이 충족, 아니면 완성일 + 3년 이내.
  return (
    transferDate < declared.completionDate ||
    transferDate <= addYears(declared.completionDate, ARTICLE_156_2_3_DEADLINE_YEARS)
  );
}

/**
 * 권리 취득일부터 **3년을 넘겨** 양도했는가 — ⑤ UI가 「3년 초과 예외」 카드를 열 때 쓰는
 * 공용 술어. 엔진 판정과 **같은 기준**이어야 화면과 계산이 갈리지 않는다.
 */
export function isRightThreeYearExceeded(p: {
  rightAcquisitionDate: Date;
  transferDate: Date;
}): boolean {
  return p.transferDate > addYears(p.rightAcquisitionDate, ARTICLE_156_2_3_DEADLINE_YEARS);
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}
