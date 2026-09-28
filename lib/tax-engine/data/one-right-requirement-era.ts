/**
 * 조합원입주권 1세대1입주권 비과세(현행 「소득세법」 §89①4호)의 **요건 연혁** (E-3 후속)
 * (개정 없는 확정 역사 데이터. 정적 상수.)
 *
 * 기준금액(6억·9억·12억)은 `one-right-high-value-era.ts`가 맡고, 이 파일은 **요건**만 다룬다.
 * 계획서 `docs/00-pm/one-house-exemption-fix.plan.md` §9.3 E-3.
 *
 * 법제처 DRF `target=eflaw`(`LM`+`efYd`) 실독 2026-09-28 — 소득세법 시행령 1997-01-01~2022-02-18
 * 시행본(1999~2005년은 부칙 목록의 시행일을 하나씩 조회) · 소득세법 1997~2025 시행본 전수.
 *
 * ## 요건 연혁
 *
 * | 양도일 | 근거 조문 | 요건 | 부칙 |
 * |---|---|---|---|
 * | < 1999-01-01 | 없음(1997·1998 시행본에 입주권 의제 조항 없음) | **미지원** — 현행 요건으로 판정하고 고지 | |
 * | 1999-01-01 ~ 2005-12-31 | 영 §155 제16항 | 「양도일 현재 다른 주택이 없는 경우」 — **가목에 해당하는 것만**(나목 없음) | 대통령령 제15969호 부칙 제10조① 시행 후 최초 양도분 |
 * | 2006-01-01 ~ 2008-11-27 | 영 §155 제16항(2006-02-09부터 제17항) | 1호(다른 주택 없음) · 2호 1주택 + 그 주택 취득일부터 **1년** 이내 | 대통령령 제19254호 부칙 제2조 시행 후 최초 양도분 |
 * | 2008-11-28 ~ 2012-06-28 | 영 §155 제17항 | 2호 **2년** 이내 | 대통령령 제21138호 부칙 제2조 시행 후 최초 양도분 |
 * | 2012-06-29 ~ 2016-12-31 | 영 §155 제17항 | 2호 **3년** 이내 | 대통령령 제23887호 부칙 제2조 시행 후 최초 양도분 |
 * | ≥ 2017-01-01 | 법 §89①4호 가·나목 | 나목 3년(법률 제14389호 — 요건 문언은 영 제17항과 같다) | |
 *
 * 「1개 소유한 1세대」 문언은 2006-01-01 시행본부터다. 1999~2005 시행본은 「조합원 … 이 … 입주자로
 * 선정된 지위 … 를 양도하는 경우 양도일 현재 다른 주택이 없는 경우」뿐이다 — 입주권 2개 보유 세대를
 * 다룬 그 시기 해석례는 찾지 못했다(국세청 검색 「입주권 2개 1세대1주택」 7건 모두 2016년 이후).
 * ⇒ 엔진은 1개 요건을 그대로 두고(종전 동작) 그 시기에 입주권이 2개 이상이면 고지한다.
 *
 * ## 기준일 — 재건축은 관리처분계획인가일이 아니었다 (자기선언 축 · 고지만)
 *
 * 본문 요건 「인가일 현재 §154①(현행 §89①3호가목) 기존주택 소유」의 인가일은 자기선언
 * (`exemptionEligibleAtApproval`)으로 받는다. 연혁상 재건축의 기준일은:
 *  - 1999-01-01 ~ 2003-06-30 시행본: 주택건설촉진법 §33 **사업계획의 승인일**(그 전 철거 시 철거일)
 *  - 2003-07-01 ~ 2005-05-30 시행본: 도시정비법 §28 **사업시행인가일**(2003.12.30. 개정으로 철거일 괄호 부활)
 *  - 2005-05-31 ~: 관리처분계획인가일 — 대통령령 제18850호 부칙 ④ 「이 영 시행전에 … 사업시행인가를
 *    받은 주택재건축사업의 조합원에 대한 1세대1주택 특례적용 … 은 … 종전의 규정에 의한다」.
 *    국세청 서면인터넷방문상담4팀-978(2008.04.17)·-105(2007.01.09)·-3460(2007.12.03) 같은 취지.
 * 엔진은 재개발·재건축 구분 입력이 없고 그 날짜를 판정하지도 않는다 ⇒ **고지**한다
 * (양도일 2005-05-30 이전, 또는 입주권 인가일이 2005-05-31 전이어서 사업시행인가도 그 전인 것이 확실할 때).
 *
 * ## 분양권 — 입주권 취득일·분양권 취득일 두 축
 *
 * 가·나목의 「분양권」 문언은 법률 제18578호(2022-01-01 시행 — 부칙 제1조 본문. 같은 법 제1조3호
 * 공포일 시행분은 단서 12억뿐)가 넣었다. 부칙 제7조:
 *  「② 이 법 시행 전에 취득한 종전의 제88조제9호에 따른 조합원입주권의 양도소득 비과세 요건에
 *     관하여는 제89조제1항제4호가목 및 나목의 개정규정에도 불구하고 종전의 규정에 따른다.
 *   ③ 이 법 시행 이후 취득하는 조합원입주권의 양도소득 비과세 요건과 관련하여 제89조제1항제4호가목
 *     및 나목의 개정규정을 적용하는 경우 2022년 1월 1일 이후에 취득한 분양권을 대상으로 한다.」
 * 원조합원의 입주권 취득일 = 관리처분계획인가일(종전주택이 입주권으로 「변환」된 날) —
 * 국세청 서면-2021-법규재산-7792(2023.08.09): 「종전주택이 2022.1.1. 전에 … 조합원입주권으로 변환된
 * 후, 당해 조합원입주권을 양도하는 경우에는 「소득세법(2021.12.8. 법률 제18578호로 개정되기 전의
 * 것)」 제89조제1항제4호가 적용되는 것」(사실관계: 2016년 관리처분계획인가 · 2021.6.14. 분양권 취득).
 * ⇒ 분양권은 **분양권 취득일 ≥ 2022-01-01 이고 입주권 인가일 ≥ 2022-01-01**일 때만 요건을 막는다.
 */

import { REDEVELOPMENT } from "../legal-codes";

export type OneRightRequirementEra =
  | "unsupported"
  | "ga_only"
  | "na_1y"
  | "na_2y"
  | "na_3y";

/** 대통령령 제15969호(1998.12.31.) 시행일 — 영 §155 제16항 신설(부칙 제10조① 시행 후 최초 양도분). */
export const ONE_RIGHT_DEEMED_EXEMPTION_START = new Date("1999-01-01");
/** 대통령령 제19254호(2005.12.31.) 시행일 — 「1개 소유」·2호(1주택 + 1년) 신설. */
export const ONE_RIGHT_CLAUSE_NA_START = new Date("2006-01-01");
/** 대통령령 제21138호 공포·시행일 — 2호 기한 2년. */
export const ONE_RIGHT_CLAUSE_NA_2Y_START = new Date("2008-11-28");
/** 대통령령 제23887호 공포·시행일 — 2호 기한 3년. */
export const ONE_RIGHT_CLAUSE_NA_3Y_START = new Date("2012-06-29");
/** 대통령령 제18850호 공포·시행일 — 재건축 기준일이 사업시행인가일에서 관리처분계획인가일로. */
export const ONE_RIGHT_RECONSTRUCTION_APPROVAL_SWITCH = new Date("2005-05-31");
/** 법률 제18578호 본문 시행일 — 가·나목 「분양권」 요건(부칙 제7조②·③의 기준일도 같다). */
export const ONE_RIGHT_PRESALE_REQUIREMENT_START = new Date("2022-01-01");

export function resolveOneRightRequirementEra(transferDate: Date): OneRightRequirementEra {
  // Date가 아닌 값이 오면 즉시 실패시킨다(`Date < string` silent false 방지).
  const t = transferDate.getTime();
  if (t >= ONE_RIGHT_CLAUSE_NA_3Y_START.getTime()) return "na_3y";
  if (t >= ONE_RIGHT_CLAUSE_NA_2Y_START.getTime()) return "na_2y";
  if (t >= ONE_RIGHT_CLAUSE_NA_START.getTime()) return "na_1y";
  if (t >= ONE_RIGHT_DEEMED_EXEMPTION_START.getTime()) return "ga_only";
  return "unsupported";
}

/**
 * 나목(1주택 보유) 기한(년) — 「해당 1주택을 취득한 날부터 N년 이내」. `null`이면 **나목이 없던 시기**다.
 *
 * 미지원 구간(1999년 전)은 현행 3년으로 판정한다(종전 동작 — 고지가 따로 붙는다).
 */
export function oneRightClauseNaYears(transferDate: Date): number | null {
  switch (resolveOneRightRequirementEra(transferDate)) {
    case "ga_only":
      return null;
    case "na_1y":
      return 1;
    case "na_2y":
      return 2;
    case "na_3y":
    case "unsupported":
      return 3;
  }
}

/**
 * 분양권 1개가 가·나목의 「분양권을 보유하지 아니할 것」에 걸리는가.
 *
 * @param rightApprovalDate 양도하는 입주권의 관리처분계획인가일(= 원조합원의 입주권 취득일).
 *   모르면 `undefined` — 그 분양권이 2022-01-01 이후 취득분일 때만 결론이 갈리므로 `"undetermined"`.
 */
export function oneRightPresaleRightBlocks(
  presaleAcquisitionDate: Date,
  rightApprovalDate: Date | undefined,
): boolean | "undetermined" {
  const start = ONE_RIGHT_PRESALE_REQUIREMENT_START.getTime();
  // 부칙 제7조③ — 2022-01-01 전 취득 분양권은 어느 쪽이든 대상이 아니다.
  if (presaleAcquisitionDate.getTime() < start) return false;
  if (!rightApprovalDate) return "undetermined";
  // 부칙 제7조② — 2022-01-01 전 취득 입주권은 종전 규정(분양권 요건 없음).
  return rightApprovalDate.getTime() >= start;
}

const UNSUPPORTED_NOTICE =
  "1999년 1월 1일 전에 양도한 조합원입주권의 1세대1주택 비과세 요건 연혁은 지원하지 않습니다 — " +
  "현행 요건(가·나목)으로 판정했습니다. 당시 소득세법 시행령(1997·1998년 시행본)에는 입주권을 " +
  `1세대1주택으로 보는 조항이 없었습니다(${REDEVELOPMENT.ONE_RIGHT_DECREE_155_16}은 1999.1.1. 이후 양도분부터). 직접 확인하세요.`;

const MULTIPLE_RIGHTS_PRE_2006_NOTICE =
  `2005년 12월 31일 이전 양도분의 ${REDEVELOPMENT.ONE_RIGHT_DECREE_155_16}에는 「조합원입주권을 1개 소유한 1세대」 ` +
  "문언이 없습니다(2006.1.1. 시행본부터). 이 시기 입주권 2개 이상 보유 세대를 다룬 해석례를 찾지 못해 " +
  "현행과 같이 1개 요건으로 판정했습니다 — 확인하세요.";

const RECONSTRUCTION_APPROVAL_NOTICE =
  "재건축 조합원입주권이면 「인가일 현재 기존주택 요건」의 기준일이 관리처분계획인가일이 아닐 수 있습니다 — " +
  "2005.5.30. 이전 양도분과, 그 뒤 양도분이라도 2005.5.31. 전에 사업시행인가를 받은 재건축은 " +
  "사업시행인가일(2003.6.30. 이전 양도분은 주택건설촉진법에 따른 사업계획승인일) 현재로 판정합니다 " +
  `(소득세법 시행령 개정령 ${REDEVELOPMENT.ONE_RIGHT_RECONSTRUCTION_TRANSITION_ADDENDUM} · ${REDEVELOPMENT.ONE_RIGHT_RECONSTRUCTION_TRANSITION_RULING}). ` +
  "자기선언을 그 날 기준으로 확인하세요. 재개발은 관리처분계획인가일 그대로입니다.";

/**
 * 요건 연혁 고지 — 계산기(warnings)와 판정 메뉴(verdict)가 같은 함수를 부른다.
 *
 * @param rightApprovalDate 입주권 관리처분계획인가일. 판정 메뉴에서 미입력이면 `undefined`.
 * @param eligibleAtApprovalDeclared 본문 요건 자기선언이 켜져 있는가 — 기준일 고지는 그 선언의 뜻을 말하므로 선언이 있을 때만.
 */
export function oneRightRequirementEraNotices(args: {
  transferDate: Date;
  rightApprovalDate?: Date;
  householdRightCount?: number;
  eligibleAtApprovalDeclared: boolean;
}): string[] {
  const era = resolveOneRightRequirementEra(args.transferDate);
  const notices: string[] = [];
  if (era === "unsupported") notices.push(UNSUPPORTED_NOTICE);
  if (era === "ga_only" && (args.householdRightCount ?? 0) > 1) {
    notices.push(MULTIPLE_RIGHTS_PRE_2006_NOTICE);
  }
  const switchAt = ONE_RIGHT_RECONSTRUCTION_APPROVAL_SWITCH.getTime();
  const reconstructionOldRule =
    args.transferDate.getTime() < switchAt ||
    (args.rightApprovalDate !== undefined && args.rightApprovalDate.getTime() < switchAt);
  if (args.eligibleAtApprovalDeclared && era !== "unsupported" && reconstructionOldRule) {
    notices.push(RECONSTRUCTION_APPROVAL_NOTICE);
  }
  return notices;
}
