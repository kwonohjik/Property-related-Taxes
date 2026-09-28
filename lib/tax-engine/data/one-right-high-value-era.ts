/**
 * 조합원입주권 1세대1입주권 비과세(「소득세법」 §89①4호)의 **고가 기준금액 연혁** — 양도일 축 (E-3)
 * (개정 없는 확정 역사 데이터. 정적 상수.)
 *
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.3 E-3. 법제처 DRF `target=eflaw` 실독
 * (2026-09-28 — 소득세법 시행령 시행본 190개 전수 · 소득세법 §89 시행본 2005-12~2022-01 전수).
 *
 * | 양도일 | 기준 | 근거 |
 * |---|---|---|
 * | < 2005-02-19 | **미지원** — 현행 12억으로 계산하고 고지 | DRF 시행본 범위 밖(최초 2005-02-19). 해석례 서면인터넷방문상담4팀-1246(2004.08.09)은 「제155조 제16항 … 6억원」 |
 * | 2005-02-19 ~ 2008-10-06 | 6억 | 영 §155 제16항·제17항 「… 제154조제1항에 따른 1세대1주택으로 본다」 → 법 §89(①)3호 괄호 고가주택 → 영 §156① 「6억원을 초과」 |
 * | 2008-10-07 ~ 2016-12-31 | 9억 | 같은 체인 · 영 §156① 「9억원을 초과」(대통령령 제21062호 부칙 제2조 — 시행 후 최초 양도분) |
 * | 2017-01-01 ~ 2017-02-02 | **확인 필요** — 현행 12억으로 계산하고 고지 | 아래 「위임 공백」 |
 * | 2017-02-03 ~ 2021-12-07 | 9억 | 영 §155 제17항 「조합원입주권의 양도 당시의 실지거래가액의 합계액이 9억원을 초과하는 경우」(대통령령 제27829호 부칙 제2조② — 시행 이후 양도분) |
 * | ≥ 2021-12-08 | 12억 | 법 §89①4호 단서 「양도 당시 실지거래가액이 12억원을 초과」(법률 제18578호 부칙 제1조3호 공포일 시행 · 제7조⑤ 시행일 이후 양도하는 조합원입주권부터) |
 *
 * ## 2017-02-03 전 — 「1세대1주택으로 본다」의 고가주택 준용
 *
 * 2016-12-31까지 입주권 비과세는 **법률이 아니라 시행령**(영 §155 제16항 → 2008년 이후 제17항)에 있었고,
 * 문언은 「제154조제1항에 따른 1세대1주택으로 본다」였다(2005-02-19 ~ 2017-02-02 시행본 전부에서
 * 확인). 그래서 고가 기준은 법 §89①3호 괄호 → 영 §156①(주택 기준금액)을 준용한다 — 국세청:
 *  - 서면인터넷방문상담5팀-1152(2006.12.08) 「… 제155조 제16항에서 규정하는 요건을 충족하면서
 *    그 실지양도가액이 **6억 원**을 초과하는 때에는 이를 소득세법 제89조 제3호에서 규정하는
 *    고가주택으로 보아 …」 · 서면4팀-3370(2007.11.22)·서면5팀-74(2008.01.10) 같은 취지(제17항·6억)
 *  - 재산세제과-1061(2010.11.01) 「… 제155조 제17항에 따른 1세대1주택에 해당하는 고가주택일 경우
 *    … 실지거래가액의 합계액이 **9억원**을 초과하는 부분에 대해 계산」
 * ⇒ 이 구간은 주택 축 `resolveHighValueHouseThreshold`와 경계(2008-10-07)가 같아 그 함수를 쓴다.
 *
 * ## 위임 공백 (2017-01-01 ~ 2017-02-02) — 확인 필요
 *
 * 법률 제14389호(시행 2017-01-01, 부칙 제2조② 시행 이후 양도분)가 §89①4호를 신설하며 단서를
 * 「해당 조합원입주권의 가액이 **대통령령으로 정하는 기준**을 초과하는 경우」로 위임했는데,
 * 그 기준(영 §155 제17항 9억)은 대통령령 제27829호(2017-02-03 공포·시행, 부칙 제2조② 시행 이후
 * 양도분)부터다. 그 사이 시행본(2017-01-01·2017-01-20)에는 종전 제17항(1세대1주택 의제 — 영 §156
 * 9억 준용)이 그대로 있다. 「종전 제17항 + §156 9억」과 「위임 기준 부재 — 단서 미작동」 두 독법이
 * 갈리고 이 구간을 직접 다룬 해석례는 찾지 못했다 ⇒ 근거 없이 낮은 기준을 소급하지 않고
 * **종전 동작(12억)을 유지하며 고지**한다(`feedback_no_unfavorable_application_without_legal_basis`).
 *
 * ⚠️ 이 파일은 **기준금액만** 다룬다. 같은 시기의 요건 연혁(2005년 가목만 · 나목 기한 1년→2년→3년 ·
 *    재건축 사업시행인가일 기준 등)은 엔진이 현행 §89①4호 문언으로 판정한다 — 계획서 §9.3 E-3 기재.
 */

import {
  HIGH_VALUE_HOUSE_12EOK_EFFECTIVE_DATE,
  resolveHighValueHouseThreshold,
} from "../one-house/threshold";
import { REDEVELOPMENT, TRANSFER } from "../legal-codes";

export type OneRightHighValueEra =
  | "unsupported"
  | "deemed_one_house"
  | "delegation_gap"
  | "decree_155_17"
  | "statute";

/** DRF 소득세법 시행령 최초 시행본(대통령령 제18705호) — 이 날 전은 원문 미확인이라 미지원. */
export const ONE_RIGHT_ERA_VERIFIED_START = new Date("2005-02-19");
/** 법률 제14389호 시행일 — §89①4호 신설(단서 기준은 대통령령에 위임). */
export const ONE_RIGHT_STATUTE_4HO_START = new Date("2017-01-01");
/** 대통령령 제27829호 공포·시행일 — 영 §155 제17항 9억 적용 첫 양도일. */
export const ONE_RIGHT_DECREE_9EOK_START = new Date("2017-02-03");

const THRESHOLD_9EOK = 900_000_000;
const THRESHOLD_12EOK = 1_200_000_000;

export function resolveOneRightHighValueEra(transferDate: Date): OneRightHighValueEra {
  // Date가 아닌 값이 오면 즉시 실패시킨다(`Date < string` silent false 방지).
  const t = transferDate.getTime();
  if (t >= HIGH_VALUE_HOUSE_12EOK_EFFECTIVE_DATE.getTime()) return "statute";
  if (t >= ONE_RIGHT_DECREE_9EOK_START.getTime()) return "decree_155_17";
  if (t >= ONE_RIGHT_STATUTE_4HO_START.getTime()) return "delegation_gap";
  if (t >= ONE_RIGHT_ERA_VERIFIED_START.getTime()) return "deemed_one_house";
  return "unsupported";
}

/**
 * 양도일에 적용하는 조합원입주권 고가 기준금액(원). 「초과」 기준이다 — 반환값 **이하**면 전액 비과세.
 *
 * 미지원·확인 필요 구간은 **현행 12억**(종전 동작)을 돌려준다 — 호출부가
 * `oneRightHighValueEraNotice`로 그 사실을 고지한다.
 */
export function resolveOneRightHighValueThreshold(transferDate: Date): number {
  switch (resolveOneRightHighValueEra(transferDate)) {
    case "deemed_one_house":
      return resolveHighValueHouseThreshold(transferDate);
    case "decree_155_17":
      return THRESHOLD_9EOK;
    case "statute":
    case "delegation_gap":
    case "unsupported":
      return THRESHOLD_12EOK;
  }
}

const UNSUPPORTED_NOTICE =
  "2005년 2월 19일 전에 양도한 조합원입주권의 1세대1주택 비과세 고가 기준금액 연혁은 지원하지 않습니다 — " +
  `현행 기준(12억)으로 계산했습니다. 당시 시행령의 1세대1주택으로 보는 입주권 규정과 ` +
  `${REDEVELOPMENT.HIGH_VALUE_HOUSE_DECREE_156}(고가주택 기준금액)으로 직접 확인하세요` +
  `(당시 국세청 해석례는 6억원 기준 — ${REDEVELOPMENT.ONE_RIGHT_HIGH_VALUE_RULING_PRE_2005}).`;

const DELEGATION_GAP_NOTICE =
  "2017년 1월 1일~2월 2일에 양도한 조합원입주권은 고가 기준금액이 확인되지 않아 현행 기준(12억)으로 계산했습니다 — " +
  `${TRANSFER.ONE_RIGHT_EXEMPT} 단서(2017.1.1. 시행)가 기준을 대통령령에 위임했으나 ${REDEVELOPMENT.ONE_RIGHT_DECREE_155_17}` +
  "(9억원 · 2022.2.15. 삭제)은 2017년 2월 3일 이후 양도분부터 적용됩니다. 종전 같은 항(1세대1주택으로 봄)에 따라 " +
  `${REDEVELOPMENT.HIGH_VALUE_HOUSE_DECREE_156}의 9억원을 적용하는지 확인하세요.`;

/** 미지원·확인 필요 구간의 고지 문구 — 확인된 구간은 `undefined`. */
export function oneRightHighValueEraNotice(transferDate: Date): string | undefined {
  const era = resolveOneRightHighValueEra(transferDate);
  if (era === "unsupported") return UNSUPPORTED_NOTICE;
  if (era === "delegation_gap") return DELEGATION_GAP_NOTICE;
  return undefined;
}
