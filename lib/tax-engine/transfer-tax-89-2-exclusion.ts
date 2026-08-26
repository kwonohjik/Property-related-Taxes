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
 * ## ⚠️ 이번 범위(Phase 1)에서 실제로 판정하는 예외
 *
 * | 항 | 요건 | 판정 근거 입력 |
 * |---|---|---|
 * | §156의2③ · §156의3② | 종전주택 취득 **1년 후** 권리 취득 + 권리 취득일부터 **3년 이내** 양도 | `acquisitionDate` · 권리 `acquisitionDate` · `transferDate` |
 * | §156의2⑤ | 대체주택 | `replacementHouse` (E-5가 이미 판정 — 여기 오기 전에 비과세로 빠진다) |
 *
 * 나머지는 「그 사실을 선언할 입력이 있는가」로 갈린다:
 *   · 있는데 선언하지 않았다 ⇒ **미해당 확정**(`marriageMerge`·`parentalCareMerge`·`ruralHouse`·
 *     `replacementHouse`·권리의 `isInherited`) — 화면에 칸이 있으므로 미선언은 사실의 표시다.
 *   · 아예 없다 ⇒ **판정 불가**(§156의2④·§156의3③ 완성 후 이주 · 시행규칙 §75① 경매 등).
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

import type { TransferTaxInput } from "./types/transfer.types";
import type { PresaleRight } from "./types/multi-house-surcharge.types";
import { addYears } from "date-fns";

/** §156의2③·§156의3②의 처분기한 — 조문 문언 그대로 3년(단축·연장 규정 없음). */
export const ARTICLE_156_2_3_DEADLINE_YEARS = 3;

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
   * 2주택 이상 세대 — §156의2⑦⑩⑪ · §156의3⑤⑦⑧은 전부 「(특수)주택 + 일반주택 + 권리를
   * **각각 1개씩**」이라 2주택을 전제한다. 그 축의 입력(상속 귀속·문화유산·이농)이 없으므로
   * 여기서는 결론을 내지 않는다.
   */
  if (input.householdHousingCount >= 2) {
    open.push("소득세법 시행령 §156의2 ⑦·⑩·⑪", "소득세법 시행령 §156의3 ⑤·⑦·⑧");
  }

  // 권리 2개 이상 — ③·②는 「1주택과 **1**조합원입주권/분양권」 전제다.
  if (rights.length >= 2) {
    open.push("소득세법 시행령 §156의2 ③·④", "소득세법 시행령 §156의3 ②·③");
  }

  // 상속받은 권리 — §156의2⑥⑦ · §156의3④⑤. 순위 규칙(피상속인 소유·거주기간)은 미구현.
  if (rights.some((r) => r.isInherited === true)) {
    open.push("소득세법 시행령 §156의2 ⑥", "소득세법 시행령 §156의3 ④");
  }

  // 동거봉양·혼인 합가 — §156의2⑧⑨(§156의3⑥이 그대로 준용). 4호 가·나·다목의 합가 전 귀속 미구현.
  if (input.marriageMerge || input.parentalCareMerge) {
    open.push("소득세법 시행령 §156의2 ⑧·⑨");
  }

  // 농어촌 이농주택 — §156의2⑪ · §156의3⑧ (2주택 축이라 위와 겹치나 선언 자체를 신호로 본다).
  if (input.ruralHouse) {
    open.push("소득세법 시행령 §156의2 ⑪", "소득세법 시행령 §156의3 ⑧");
  }

  if (open.length > 0) return { status: "undetermined", openArticles: dedupe(open) };

  /**
   * §156의2③ / §156의3② — 「종전주택 취득한 날부터 **1년 이상이 지난 후**에 권리를 취득하고
   * 그 권리를 취득한 날부터 **3년 이내**에 종전주택을 양도하는 경우」.
   *
   * ⚠️ 「1년」의 상대는 **가장 먼저 취득한 권리**다(권리가 1개인 경로만 여기 온다 — 위에서
   *    2개 이상은 판정 불가로 빠진다).
   */
  const right = rights[0];
  const oneYearMet = right.acquisitionDate >= addYears(input.acquisitionDate, 1);
  const deadline = addYears(right.acquisitionDate, ARTICLE_156_2_3_DEADLINE_YEARS);
  const withinDeadline = input.transferDate <= deadline;
  const clause = right.type === "redevelopment_right" ? "§156의2 ③" : "§156의3 ②";

  if (oneYearMet && withinDeadline) {
    return { status: "exception_met", exception: `소득세법 시행령 ${clause}` };
  }
  if (oneYearMet) {
    /**
     * 1년은 충족했는데 3년을 넘겼다 — 아직 두 갈래가 열려 있다:
     *   · §156의2④ · §156의3③ (완성 후 3년 내 세대전원 이사 + 1년 이상 계속 거주)
     *   · 시행규칙 §75① (권리 취득일부터 3년이 되는 날 현재 매각의뢰·경매·공매 + 그 방법으로 양도)
     * 둘 다 입력 경로가 없다.
     */
    return {
      status: "undetermined",
      openArticles: [
        right.type === "redevelopment_right"
          ? "소득세법 시행령 §156의2 ④"
          : "소득세법 시행령 §156의3 ③",
        "소득세법 시행규칙 §75 ①",
      ],
    };
  }

  /**
   * 1년 요건 미충족 — ③도 ④도 「1년이 지난 후에 권리를 취득」을 **함께** 요구하므로 둘 다 탈락하고,
   * 나머지 예외는 위에서 전부 배제됐다. ⇒ §89② 본문이 그대로 적용된다.
   */
  return { status: "excluded" };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items));
}
