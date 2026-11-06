/**
 * 조특법 §99의4⑤ — 수도권 조정대상지역 2주택 중 1주택을 양도하고 예정신고기한 안에 농어촌주택등을 취득하는 경우
 * (소득세법 §104⑦ 중과 비적용 · 장기보유특별공제 허용) — 2019.1.1.~2020.12.31. 양도분 (리뷰 NH-51 · 사용자 결정 Q-11 「구현」).
 *
 * 법문(시행본 2019.04.30. MST 208557 실독 2026-11-06):
 *   「⑤ 1세대가 수도권 내 「주택법」 제63조의2제1항제1호에 따른 조정대상지역에 소재하는 2주택(양도하는 시점의 「부동산 가격공시에 관한
 *    법률」에 따른 개별주택가격 및 공동주택가격을 합산한 금액이 6억원 이하인 경우에 한정한다)만을 소유하는 경우로서 2020년 12월 31일까지
 *    그 중 1주택을 양도하고 「소득세법」 제105조제1항제1호 본문에 따른 기간 내에 농어촌주택등을 취득하는 경우에는 같은 법
 *    제104조제7항을 적용하지 아니하고, 「소득세법」 제95조제2항에 따른 장기보유 특별공제액을 공제받을 수 있다.」
 *
 * 시기: 법률 제16009호(2018.12.24.) 신설 · 시행 2019.1.1. · 부칙 제2조③ 「양도소득세에 관한 개정규정은 이 법 시행 이후 양도하는
 *   경우부터 적용」 → 양도일 2019.1.1.~2020.12.31.(⑤ 본문). 2025.12.23. 삭제(법률 제21223호 · 시행 2026.1.1.)에는 양도소득세
 *   경과조치·적용례가 없다 — 양도일 시행본을 따른다. 시기 밖 양도에는 적용하지 않는다(평가하지 않는다).
 *
 * 해석한 칸(해석례 없음 — 확인 필요):
 * - 「수도권 내 조정대상지역에 소재하는 2주택」 — **두 주택 모두** 양도일 현재 수도권·조정대상지역에 있는 것으로 읽는다.
 * - 「소득세법 제105조제1항제1호 본문에 따른 기간」 — 양도일이 속하는 달의 말일부터 2개월(예정신고기한)로 읽고, 취득일이 양도일 뒤이고
 *   그 기한까지인 경우로 본다(휴일 연장은 보지 않는다). 양도일과 같은 날 취득은 선후를 알 수 없어 불성립 + 확인 필요로 둔다.
 * - 농어촌주택등 요건 — ①1호·2호의 소재지·가액·종전 면적을 양도일 시행본 기준으로 본다(취득기간 종기 2020.12.31.).
 *   ③ 연접 배제는 「제1항을 적용하지 아니한다」라 ⑤에 적용 근거가 없어 묻지 않는다.
 * - 「모름」·미입력 = 불성립 + 확인 필요(보유 주택 목록이 없거나 소재지 법정동코드가 없는 주택 등).
 *
 * 효과는 양도 주택의 «중과 배제 선판정»이다 — 호출부(`runMultiHouseSurchargeStep`)가 양도 주택 행에 특례 적용 표지를 얹어 기존 중과 엔진
 * 경로로 배제한다(세율 가산·장특 배제 두 축이 함께 닫힌다).
 */

import { NEW_99_4_PARA5, TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { isRegulatedByBjdCode } from "../data/regulated-areas";
import type { New994ArticleId } from "./types";
import { evaluateNew994, isNew994Like, type New994ReductionLike } from "./new-99-4";

/** 양도일 범위 — ⑤ 본문 「2020년 12월 31일까지」 · 법률 제16009호 부칙 제2조③(2019.1.1. 이후 양도) */
export const NEW_99_4_PARA5_TRANSFER_FROM = new Date("2019-01-01");
export const NEW_99_4_PARA5_TRANSFER_TO = new Date("2020-12-31");
/** 양도일 시행본(2019.04.30.~2020.12.28.)의 농어촌주택등취득기간 종기 — 법률 제17759호(2021.1.1. 시행)가 종기를 늘렸으나 양도소득세 개정규정은 그 이후 양도분부터 */
export const NEW_99_4_PARA5_ACQUISITION_PERIOD_TO = new Date("2020-12-31");
/** 개별주택가격·공동주택가격 합산 한도 (이하) */
export const NEW_99_4_PARA5_PRICE_LIMIT = 600_000_000;

export type New994Para5ReasonCode =
  | "ROSTER_MISSING"
  | "NOT_TWO_HOUSES"
  | "NOT_ONE_HOUSEHOLD"
  | "PRESALE_RIGHT_HELD"
  | "NOT_CAPITAL_AREA"
  | "REGULATED_UNKNOWN"
  | "NOT_REGULATED"
  | "PRICE_MISSING"
  | "PRICE_EXCEEDED"
  | "ACQUISITION_NOT_AFTER_TRANSFER"
  | "DEADLINE_EXCEEDED"
  | "MULTIPLE_DECLARATIONS"
  | "RURAL_REQUIREMENT";

export interface New994Para5Reason {
  code: New994Para5ReasonCode;
  message: string;
}

/** ⑤가 보는 보유 주택 행(엔진 명부 `HouseInfo`의 부분집합 — 양도 주택 행 포함) */
export interface New994Para5House {
  id: string;
  region: "capital" | "non_capital";
  regionCode?: string;
  inDesignatedDistrict?: boolean;
  officialPrice: number;
  /** 양도 시 공시가격 — 있으면 우선(⑤ 「양도하는 시점」 가격) */
  transferOfficialPrice?: number;
}

export interface New994Para5Input {
  transferDate: Date;
  reductions: ReadonlyArray<{ type: string }>;
  /** 엔진 명부(양도 주택 행 포함). 없으면 판정할 수 없다(불성립 + 확인 필요) */
  houses: readonly New994Para5House[] | undefined;
  sellingHouseId: string | undefined;
  isOneHousehold: boolean;
  /** 양도 주택의 양도일 현재 조정대상지역 여부 — 계산기와 같은 leaf(`resolveIsRegulatedAtTransfer`) 값 */
  isSellingRegulated: boolean;
  /** 양도일 현재 보유한 분양권·조합원입주권 수 — 「2주택만을 소유」 */
  presaleRightCount: number;
}

export interface New994Para5Result {
  isEligible: boolean;
  /** 평가한 농어촌주택등 선언의 조문 */
  ruralArticleId: New994ArticleId;
  legalBasis: string;
  reasons: New994Para5Reason[];
  /** 소득세법 §105①1호 본문 기간의 끝(양도일이 속하는 달의 말일부터 2개월) */
  acquisitionDeadline: Date;
  /** 두 주택의 양도 시 공시가격 합산 — 산출 가능할 때만 */
  priceSum?: number;
  /** 성립 시 안내(⑥ 사후관리 · 해석 칸) */
  notices: string[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const won = (n: number) => n.toLocaleString("ko-KR");

/** 소득세법 §105①1호 본문 — 양도일이 속하는 달의 말일부터 2개월 = 양도 달 + 2개월의 말일 */
export function newPreliminaryFilingDeadline(transferDate: Date): Date {
  return new Date(Date.UTC(transferDate.getUTCFullYear(), transferDate.getUTCMonth() + 3, 0));
}

/**
 * ⑤ 평가. 대상이 아니면(양도일이 2019.1.1.~2020.12.31. 밖이거나, 양도일 뒤에 취득한 농어촌주택등 선언이 없으면) `undefined`다 —
 * 그 경우는 ①의 몫이다.
 */
export function evaluateNew994Para5(p: New994Para5Input): New994Para5Result | undefined {
  const t = p.transferDate.getTime();
  if (t < NEW_99_4_PARA5_TRANSFER_FROM.getTime() || t > NEW_99_4_PARA5_TRANSFER_TO.getTime()) return undefined;
  const declared = p.reductions.filter(isNew994Like);
  const later = declared.filter((r) => r.ruralHouseAcquisitionDate && r.ruralHouseAcquisitionDate.getTime() >= t);
  if (later.length === 0) return undefined;

  const decl: New994ReductionLike = later[0];
  const reasons: New994Para5Reason[] = [];
  const deadline = newPreliminaryFilingDeadline(p.transferDate);
  const label = decl.type === "new_99_4_hometown" ? "고향주택" : "농어촌주택";

  // 농어촌주택등 「1채」 — 선언이 둘 이상이면 어느 쪽이 ⑤의 1채인지 알 수 없다
  if (declared.length > 1) {
    reasons.push({
      code: "MULTIPLE_DECLARATIONS",
      message: `농어촌주택등 선언이 ${declared.length}건입니다 — ⑤는 「1채의 주택」을 취득하는 경우라 적용하지 않았습니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
    });
  }

  // 취득 시점 — 양도 뒤, 예정신고기한까지
  const acq = decl.ruralHouseAcquisitionDate!;
  if (acq.getTime() === t) {
    reasons.push({
      code: "ACQUISITION_NOT_AFTER_TRANSFER",
      message: `확인 필요: ${label} 취득일이 양도일과 같아 양도 뒤 취득인지 알 수 없어 적용하지 않았습니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
    });
  } else if (acq.getTime() > deadline.getTime()) {
    reasons.push({
      code: "DEADLINE_EXCEEDED",
      message: `${label} 취득일(${iso(acq)})이 소득세법 제105조제1항제1호 본문의 기간(양도일이 속하는 달의 말일부터 2개월 — ${iso(deadline)}까지)을 넘었습니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
    });
  }

  // 세대·주택 수
  if (!p.isOneHousehold) {
    reasons.push({ code: "NOT_ONE_HOUSEHOLD", message: `1세대가 아니라서 적용하지 않았습니다 (${NEW_99_4_PARA5.PARAGRAPH}).` });
  }
  if (p.presaleRightCount > 0) {
    reasons.push({
      code: "PRESALE_RIGHT_HELD",
      message: `분양권·조합원입주권을 보유해 「2주택만을 소유」하는 경우가 아닙니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
    });
  }
  const houses = p.houses ?? [];
  let priceSum: number | undefined;
  if (houses.length === 0) {
    reasons.push({
      code: "ROSTER_MISSING",
      message: `확인 필요: 세대 보유 주택 목록이 없어 2주택 여부·소재지·공시가격을 판정할 수 없어 적용하지 않았습니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
    });
  } else if (houses.length !== 2) {
    reasons.push({
      code: "NOT_TWO_HOUSES",
      message: `양도일 현재 보유 주택이 ${houses.length}채라 「2주택만을 소유」하는 경우가 아닙니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
    });
  } else {
    const date = iso(p.transferDate);
    for (const h of houses) {
      const isSelling = h.id === p.sellingHouseId;
      const name = isSelling ? "양도 주택" : "다른 보유 주택";
      if (h.region !== "capital") {
        reasons.push({ code: "NOT_CAPITAL_AREA", message: `${name}이 수도권에 있지 않습니다 (${NEW_99_4_PARA5.PARAGRAPH}).` });
      }
      if (isSelling) {
        if (!p.isSellingRegulated) {
          reasons.push({ code: "NOT_REGULATED", message: `양도 주택이 양도일 현재 조정대상지역이 아닙니다 (${NEW_99_4_PARA5.PARAGRAPH}).` });
        }
      } else if (h.regionCode) {
        if (!isRegulatedByBjdCode(h.regionCode, date, h.inDesignatedDistrict).isRegulated) {
          reasons.push({ code: "NOT_REGULATED", message: `${name}이 양도일 현재 조정대상지역이 아닙니다 (${NEW_99_4_PARA5.PARAGRAPH}).` });
        }
      } else {
        reasons.push({
          code: "REGULATED_UNKNOWN",
          message: `확인 필요: ${name}의 소재지(법정동코드)가 없어 양도일 현재 조정대상지역인지 알 수 없어 적용하지 않았습니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
        });
      }
    }
    const prices = houses.map((h) => h.transferOfficialPrice ?? h.officialPrice);
    if (prices.some((v) => !(v > 0))) {
      reasons.push({
        code: "PRICE_MISSING",
        message: `확인 필요: 양도하는 시점의 개별주택가격·공동주택가격이 입력되지 않은 주택이 있어 합산 6억원 이하인지 알 수 없어 적용하지 않았습니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
      });
    } else {
      priceSum = prices.reduce((a, b) => a + b, 0);
      if (priceSum > NEW_99_4_PARA5_PRICE_LIMIT) {
        reasons.push({
          code: "PRICE_EXCEEDED",
          message: `두 주택의 개별주택가격·공동주택가격 합산 ${won(priceSum)}원이 6억원을 넘습니다 (${NEW_99_4_PARA5.PARAGRAPH}).`,
        });
      }
    }
  }

  // 농어촌주택등 요건(①1호·2호) — 양도일 시행본 기준, 순서·③은 보지 않는다
  const rural = evaluateNew994(
    {
      id: decl.type,
      generalHouseAcquisitionDate: p.transferDate,
      transferDate: p.transferDate,
      ruralHouseAcquisitionDate: decl.ruralHouseAcquisitionDate,
      ruralHouseStdPrice: decl.ruralHouseStdPrice,
      isRegisteredHanok: decl.isRegisteredHanok,
      adjacentArea994: decl.adjacentArea994,
      meetsLocationRequirement: decl.meetsLocationRequirement,
      meetsHometownRequirement: decl.type === "new_99_4_hometown" ? decl.meetsHometownRequirement : undefined,
      ruralLandAreaSqm994: decl.ruralLandAreaSqm994,
      ruralHouseType994: decl.ruralHouseType994,
      ruralHouseAreaSqm994: decl.ruralHouseAreaSqm994,
    },
    { acquisitionPeriodTo: NEW_99_4_PARA5_ACQUISITION_PERIOD_TO },
  );
  if (!rural.isEligible) {
    for (const r of rural.ineligibleReasons) reasons.push({ code: "RURAL_REQUIREMENT", message: r.message });
  }

  const isEligible = reasons.length === 0;
  const legalBasis =
    decl.type === "new_99_4_hometown" ? TRANSFER_REDUCTION_ARTICLE.NEW_99_4_HOMETOWN : TRANSFER_REDUCTION_ARTICLE.NEW_99_4_RURAL;
  return {
    isEligible,
    ruralArticleId: decl.type,
    legalBasis: `${NEW_99_4_PARA5.PARAGRAPH} · ${legalBasis}`,
    reasons,
    acquisitionDeadline: deadline,
    ...(priceSum !== undefined ? { priceSum } : {}),
    notices: isEligible
      ? [
          `${NEW_99_4_PARA5.AFTERCARE}: 이 특례를 받은 뒤 ${label}을 3년 이상 보유하지 아니하거나 최초 보유한 기간 3년 중 2년 이상 거주하지 아니한 경우에는 그 보유 또는 거주하지 아니하게 된 날이 속하는 달의 말일부터 2개월 이내에 특례를 받지 아니하였을 경우 납부하였을 세액(${NEW_99_4_PARA5.AFTERCARE_TAX_DECREE})을 양도소득세로 납부해야 합니다. 수용·상속·멸실은 제외합니다(${NEW_99_4_PARA5.AFTERCARE_EXCEPTION_DECREE}).`,
          "확인 필요: 「수도권 내 조정대상지역에 소재하는 2주택」을 두 주택 모두 양도일 현재 수도권 조정대상지역에 있는 경우로, 소득세법 제105조제1항제1호 본문의 기간을 양도 뒤 예정신고기한까지로 읽었습니다(해석례 없음).",
        ]
      : [],
  };
}
