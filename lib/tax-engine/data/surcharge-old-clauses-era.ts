/**
 * 다주택 중과 배제의 **구 조문**(2018.4.1. ~ 2023.2.27. 양도분) — 구 영 §167의10①8호 · 구 영 §167의11①1·6·7호
 * (개정 없는 확정 역사 데이터. 정적 leaf — 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.3 E-14e·E-14f)
 *
 * 대통령령 제33267호(2023.2.28. 공포·시행)가 네 호를 지우고 §167의10①15호 · §167의11①13호로 바꿨다. 새 호는
 * 「…에 따라 1세대 1주택으로 보아 제154조제1항이 적용되는 주택으로서 **같은 항의 요건을 모두 충족하는 주택**」이다.
 * 구 호는 문언 구조가 다르다 — **§154① 요건이 없다**.
 *
 * ## 적용 구간 (법제처 DRF 실독 2026-09-29 — 대통령령 제33267호 시행본 MST 248191의 부칙 전수)
 *
 * | 호 | 적용 양도일 | 근거 |
 * |---|---|---|
 * | 구 §167의10①8호 | 2018.4.1. ~ 2023.2.27. | 제28637호 부칙 제1조1호(§167의10 2018.4.1. 시행)·제2조② 「이 영 중 양도소득에 관한 개정규정은 이 영 시행 이후 양도하는 분부터 적용한다」 · 제33267호 부칙 제10조 「제167조의10제1항제15호 및 제167조의11제1항제13호의 개정규정은 이 영 시행일 이후 주택을 양도하는 경우부터 적용한다」 |
 * | 구 §167의11①1호(§156의2③~⑤) · 6·7호 | 2018.4.1. ~ 2023.2.27. | 위와 같다(제28637호 부칙 제1조1호 — §167의11) |
 * | 구 §167의11①1호의 §156의3②·③ · 6·7호의 분양권 | 2021.1.1. ~ 2023.2.27. | 제31442호 부칙 제10조② 「… 제167조의11제1항ㆍ제2항의 개정규정은 2021년 1월 1일 이후 양도하는 분부터 적용한다」 |
 *
 * - **시작일(2018.4.1.)은 여기서 게이트하지 않는다** — 그 전 양도에는 법 §104⑦이 없고, 그 판정은 세율 층
 *   (`MULTI_HOUSE_SURCHARGE_START_DATE`)이 맡는다(`isPresaleRightCounted` 주석과 같은 규약 — 진실을 둘로 두지 않는다).
 * - **분양권 개시일(2021.1.1.)도 코드로 게이트하지 않는다** — 분양권은 2021.1.1. 이후 **취득분만** 주택 수에 산입된다
 *   (`isPresaleRightCounted` · 같은 부칙 제10조①). 산입된 분양권이 있으면 양도일은 이미 2021.1.1. 이후다.
 *
 * ## 문언 (실독 — MST 202148 · 229391 · 247489 · 248191)
 *
 * **구 §167의10①8호** (2018.2.13. 신설 ~ 2023.1.1. 시행본까지 글자까지 같다):
 * 「1주택을 소유한 1세대가 그 주택을 양도하기 전에 다른 주택을 취득(자기가 건설하여 취득한 경우를 포함한다)함으로써
 * 일시적으로 2주택을 소유하게 되는 경우의 종전의 주택[다른 주택을 취득한 날부터 3년이 지나지 아니한 경우(3년이 지난
 * 경우로서 제155조제18항 각 호의 어느 하나에 해당하는 경우를 포함한다)에 한정한다]」
 *  - §155①의 「종전의 주택을 취득한 날부터 1년 이상이 지난 후」 요건 · §155①2호 조정대상지역 1·2년 기한 · §154① 요건이
 *    **없다**. 사전-2021-법령해석재산-0869(2021.12.31.): 「1주택(종전의 주택)을 소유한 1세대가 종전의 주택을 취득한 날부터
 *    1년 이내에 다른 주택(신규주택)을 취득하고 신규주택을 취득한 날부터 3년이 지나지 않은 상태에서 종전의 주택을
 *    양도하는 경우 「소득세법 시행령」제167조의10제1항제8호 … 가 적용되는 것」(사실관계는 신규주택을 양도해 불적용).
 *    사전-2021-법령해석재산-1728(2021.12.17. — 조정→조정): 「종전주택을 신규주택 취득일로부터 3년 이내에 양도하여
 *    … 제8호에 규정된 요건을 충족하는 경우에는 양도소득세가 중과되는 1세대2주택에 해당하지 않는 것」.
 *  - 「1주택을 소유한 1세대」는 **실제 소유 주택 수**로 본다 — 조심2021중1803(2021.6.9. 기각, 본문 실독):
 *    「같은 항 본문 괄호에서 기타지역 3억원 이하 주택을 주택 수 계산시 산입하지 아니하는 것으로 규정하고 있다고
 *    하더라도 … 같은 항 제8호에서 규정한 1세대 2주택 중과세율 적용 제외 요건인 "1주택을 소유한 1세대"에서
 *    1주택 소유에 해당하는지 여부를 판단함에 있어서는 같은 항 본문 괄호의 규정이 적용된다고 볼 수 없는바」
 *    (그 결정이 인용한 기획재정부 재산세제과-422(2011.6.7.) — 1세대 3주택자에게는 8호 불적용).
 *  - §155⑯(공공기관·법인 지방 이전 — 「제1항 중 "3년"을 "5년"으로 본다」) 세대는 8호에서도 **5년**이다 —
 *    기획재정부 재산세제과-129(2023.1.19. · 서면-2020-법규재산-3353이 전재, 본문 실독): 「「소득세법 시행령」제155조
 *    제16항을 적용받은 1세대가 종전의 주택을 다른 주택을 취득한 날부터 5년 내에 양도하는 경우 「소득세법」제55조
 *    제1항에 따른 세율에 100분의 20을 더한 세율을 적용하지 않는 것」(질의 법령란이 8호를 인용 · 2023년 양도 예정).
 *    ⑯ 문언은 「제1항을 적용 … 할 때」로 §155①에 걸려 있으나, 해석이 8호에도 5년을 적용했다 ⇒ 해석을 따른다.
 *  - 「3년이 지나지 아니한」 — 초일불산입 3년 만료일까지(1728의 「3년 이내에 양도하여」와 같은 독법). §155①의 「3년
 *    이내」와 같은 함수(`isWithinDeadline` — 민법 §161 말일 연장 포함)를 쓴다(확인 필요: 「지나지 아니한」에 §161을
 *    적용한 선례는 찾지 못했다 — 종전 엔진도 이 구간을 §155① 기한 함수로 판정했으므로 경계일 결론은 종전과 같다).
 *
 * **구 §167의11①1호** — 2018.2.13. ~ 2021.2.16. 시행본: 「제156조의2제3항부터 제5항까지의 규정에 따라 1세대 1주택으로
 * 보아 제154조제1항을 적용받는 주택으로서 양도소득세가 과세되는 주택」 · 2021.2.17. ~ 2023.1.1. 시행본: 「제156조의2
 * 제3항부터 제5항까지 또는 제156조의3제2항ㆍ제3항에 따라 1세대 1주택으로 보아 제154조제1항을 적용받는 주택으로서
 * 양도소득세가 과세되는 주택」.
 *  - 같은 시행본(MST 229391)의 구 §167의10①13호·14호는 「제154조제1항이 적용되고 **같은 항의 요건을 모두 충족하는**」이라
 *    쓴다. 1호는 그 요건 없이 「…적용받는 주택으로서 **양도소득세가 과세되는** 주택」 — 의제로 §154①이 적용되고도
 *    과세되는 주택(고가주택 초과분 · §154① 요건 미충족)을 가리킨다. ⇒ §154① 충족을 요건으로 두지 않는다.
 *  - 인용 범위는 ③~⑤(·§156의3②③)뿐이다. ⑥(상속 권리)·⑧⑨(합가)·⑦⑩⑪ 준용 경로는 인용하지 않는다(⑦⑩⑪ 준용을
 *    「③에 따라」로 읽을지는 해석을 찾지 못했다 — 확인 필요 · 종전 동작). ⑤(대체주택)는 E-14c와 같이 받지 않는다
 *    (의제 요건 판정이 E-5 몫 — 확인 필요).
 *
 * **구 §167의11①6호·7호** (2018.2.13. 시행본 · 2021.2.17. 시행본에서 분양권 추가):
 *  6호 「1주택, 1조합원입주권 또는 1분양권을 소유하고 1세대를 구성하는 자가 1주택, 1조합원입주권 또는 1분양권을 소유하고
 *  있는 60세 이상의 직계존속(…)을 동거봉양하기 위하여 세대를 합침으로써 1세대가 1주택과 1조합원입주권 또는 1주택과
 *  1분양권을 소유하게 되는 경우의 해당 주택(세대를 합친 날부터 10년이 경과하지 않은 경우로 한정한다)」
 *  7호 「… 혼인함으로써 … 경우 해당 주택(혼인한 날부터 5년이 경과하지 않은 경우로 한정한다)」 — §154① 요건 없음.
 *  - 「합침(혼인)으로써 1주택과 1권리를 소유하게 되는」 — 양도 주택과 산입 권리가 **모두 합친 날 이전(당일 포함)에
 *    취득**됐어야 한다(합친 뒤 취득한 것은 합가로 생긴 보유가 아니다).
 *  - 「각자 1주택 또는 1권리를 소유」(누가 무엇을 가졌는지)는 **입력이 없다** — 합가 선언(`marriageMerge`·
 *    `parentalCareMerge`)을 그대로 믿는다. 2주택 구 5·6호 경로(`resolveMergeDeeming`)와 같은 가정이다(확인 필요).
 */

import { MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE } from "../legal-codes";
import { isWithinDeadline } from "../civil-period";
import type { TemporaryTwoHouseDelayReason } from "../types/transfer.types";

/** 구 호(8호 · §167의11①1·6·7호)를 쓰는 양도분인가 — 대통령령 제33267호 시행일(2023.2.28.) **전**. */
export function isOldSurchargeClauseEra(transferDate: Date): boolean {
  return transferDate < MERGE_SURCHARGE_154_GATE_EFFECTIVE_DATE;
}

/** 구 8호 「다른 주택을 취득한 날부터 3년」 */
const OLD_CLAUSE_8_YEARS = 3;
/** §155⑯ 세대 — 재산세제과-129(2023.1.19.) 「다른 주택을 취득한 날부터 5년 내」 */
const OLD_CLAUSE_8_RELOCATION_YEARS = 5;
/** 구 §167의11①6호(동거봉양) 10년 · 7호(혼인) 5년 — 2018.2.13. ~ 2023.1.1. 시행본 모두 같다. */
const OLD_MERGE_RIGHT_YEARS = { parental_care: 10, marriage: 5 } as const;

/**
 * 구 §167의10①8호 요건 — caller가 판정해 `MultiHouseSurchargeInput.oldClause8TemporaryTwoHouse`로 넘긴다.
 *
 * @param householdHousingCount 세대 **실제** 소유 주택 수(중과 불산입 1호 주택 포함 · §155②③·조특법 제외 전) —
 *   조심2021중1803
 * @param publicInstitutionRelocationMet §155⑯ 요건 충족(지역 판정 포함 — `meetsPublicInstitutionRelocationRegion`) ⇒ 5년
 */
export function qualifiesOldClause8TemporaryTwoHouse(p: {
  isOneHousehold: boolean;
  householdHousingCount: number | undefined;
  transferDate: Date;
  publicInstitutionRelocationMet?: boolean;
  temporaryTwoHouse?: {
    previousAcquisitionDate: Date;
    newAcquisitionDate: Date;
    disposalDelayReason?: TemporaryTwoHouseDelayReason;
  };
}): boolean {
  const tt = p.temporaryTwoHouse;
  if (!p.isOneHousehold || !tt || !isOldSurchargeClauseEra(p.transferDate)) return false;
  // 「1주택을 소유한 1세대가 … 다른 주택을 취득 … 일시적으로 2주택」 — 실제 소유 2채.
  if (p.householdHousingCount !== 2) return false;
  // 「그 주택을 양도하기 전에 다른 주택을 취득」 — 종전 주택이 먼저다(같은 날 취득은 확인 필요 · 불성립으로 둔다).
  if (!(tt.previousAcquisitionDate < tt.newAcquisitionDate)) return false;
  // 「3년이 지난 경우로서 제155조제18항 각 호의 어느 하나에 해당하는 경우를 포함」 — ⑱ 사유 선언(§155①과 같은 입력).
  if (tt.disposalDelayReason !== undefined) return true;
  const years = p.publicInstitutionRelocationMet === true ? OLD_CLAUSE_8_RELOCATION_YEARS : OLD_CLAUSE_8_YEARS;
  return isWithinDeadline(tt.newAcquisitionDate, years, p.transferDate);
}

/**
 * 구 §167의11①6호(동거봉양)·7호(혼인) — 주택 1 + 산입 권리 1 세대. 성립하면 해당 호, 아니면 `undefined`.
 * 혼인·동거봉양 입력이 둘 다 있으면 혼인을 먼저 본다(`matchMergeWindow`와 같은 순서).
 */
export function resolveOldMergeRightClause(p: {
  transferDate: Date;
  sellingHouseAcquisitionDate: Date | undefined;
  countedRightAcquisitionDates: readonly Date[];
  marriageDate?: Date;
  parentalCareMergeDate?: Date;
}): { kind: "marriage" | "parental_care"; mergeDate: Date; years: number } | undefined {
  if (!isOldSurchargeClauseEra(p.transferDate) || !p.sellingHouseAcquisitionDate) return undefined;
  if (p.countedRightAcquisitionDates.length !== 1) return undefined;
  const axes = [
    { kind: "marriage" as const, date: p.marriageDate },
    { kind: "parental_care" as const, date: p.parentalCareMergeDate },
  ];
  for (const { kind, date } of axes) {
    if (!date || p.transferDate < date) continue;
    // 「합침(혼인)으로써 … 소유하게 되는」 — 주택·권리 모두 합친 날 이전(당일 포함) 취득.
    if (p.sellingHouseAcquisitionDate > date) continue;
    if (p.countedRightAcquisitionDates[0] > date) continue;
    const years = OLD_MERGE_RIGHT_YEARS[kind];
    if (!isWithinDeadline(date, years, p.transferDate)) continue;
    return { kind, mergeDate: date, years };
  }
  return undefined;
}
