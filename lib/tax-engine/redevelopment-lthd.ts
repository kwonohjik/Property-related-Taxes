/**
 * 재개발/재건축 — 분기별 LTHD 보유기간·율 산정
 *
 * 법령 근거 (law.go.kr 확인 2026-05-13):
 * - ★ 시행령 §166⑤ — LTHD 보유기간 분기 (호별 명시):
 *     1호:     인가전양도차익 보유기간 = 취득일 ~ 관리처분 인가일 (입주권 양도 시)
 *     2호가목: APT 청산금납부분양도차익 보유기간 = 관리처분 인가일 ~ 신축양도일
 *     2호나목: APT 기존건물분양도차익 보유기간 = 취득일 ~ 신축양도일 (전체)
 *
 * - 본법 §95② 본문 괄호 — 입주권 양도 시 인가전 분만 LTHD (원조합원 한정, 승계 0)
 * - 본법 §95④ — LTHD 보유기간 = 취득일~양도일 (청산금 수령 LTHD 종료일 도출)
 * - NTS 집행기준 — 청산금 수령분 양도시기 = 소유권이전 고시일 다음날
 *
 * LTHD 율 산식 (소법 §95② 표1/표2):
 * - 표1 (일반): 3년차 6% / 매년 2% 가산 / 15년+ 30% 캡
 * - 표2 (1세대1주택 + 거주 2년+): 보유 × 4% (40% 캡) + 거주 × 4% (40% 캡) = 80% 캡
 *
 * 사례 44 검증:
 * - preApproval (apt + housing): 2005-04-09 ~ 2023-02-16 ≈ 17년 10월 → 표1 30% 캡
 * - postApprovalExistingHouse (apt): 동일 17년 10월 → 동일 30% (묶음 동일 율 강제)
 * - settlement (apt + pay): 2009-10-23 ~ 2023-02-16 ≈ 13년 3월 → 표1 26%
 */

import { calculateHoldingPeriod } from "./tax-utils";
import { applyFairMarketRatio } from "./tax-utils";
import { completedMonthsInclusive } from "./civil-period";
import type { RedevelopmentInfo } from "./types/transfer-redevelopment.types";
import { resolveOneHouseAtSettlementSale } from "./transfer-tax-redevelopment-settlement";


/**
 * §95② 단서 표2 진입의 **1세대1주택 축** — **입주권(subject="right") 전용** leaf (실가·환산 경로 공용).
 *
 * `exemptionEligibleAtApproval === false`(종전주택 보유 요건 미충족 자기선언 — 조합 제공 시까지,
 * 부동산거래관리과-380 후단)는 표2를 강등한다. `undefined`는 강등하지 않는다 — 「선언하지 않음」이지
 * 「미충족의 적극적 선언」이 아니다.
 *
 * 🔑 2026-08-25(E2-03): 환산 경로(`redevelopment-housing-contribution.ts`)가 이 값을
 *    **`false` 상수로** 넘기고 있어, 취득가액 산정 방식이 LTHD 표를 갈랐다. 두 경로가
 *    같은 함수를 보게 해 **인자 동일성**까지 맞춘다(memory `feedback_shared_predicate_argument_parity`).
 *
 * 🔴 **완공APT(subject="apt")는 이 leaf를 쓰지 않는다** (G3-8). 380 후단의 대상은 「그 청산금」뿐이라
 *    미충족 선언은 **청산금 수령분 분기만** 표1로 내리고(`resolveRedevSettlementReceiveOneHouse`),
 *    신축주택분(인가전·인가후 기존건물분)은 시행령 §159의4·§154⑧1호의 일반 판정(`isOneHouseSingle`)을 따른다.
 */
export function resolveRedevEffectiveOneHouseSingle(input: {
  redevelopment: { exemptionEligibleAtApproval?: boolean };
  isOneHouseSingle?: boolean;
}): boolean {
  return input.redevelopment.exemptionEligibleAtApproval === false
    ? false
    : (input.isOneHouseSingle ?? false);
}

/**
 * 완공APT **청산금 수령분** 분기의 표2 「1주택」 축 — G3-8 · G3-5.
 *
 * 청산금 수령분은 종전주택 일부의 **별도 양도**다(법규재산2012-358). 그 표2 대상 판정은
 * 「소득세법 시행령」 §159의4 「양도일 현재 국내에 1주택」의 **양도일 = 청산금분 양도일**
 * (소유권이전 고시일 다음날 — 사전-2022-법규재산-1282)이다. 그래서:
 *
 * 1. `exemptionEligibleAtApproval === false`(조합 제공 시까지 보유 요건 미충족 선언 — 부동산거래관리과-380 후단)
 *    → 표1. 대상은 「그 청산금」이라 이 분기에만 건다.
 * 2. 청산금분 양도일 현재 1세대1주택이 **아님**(`false`)이거나 **판정 불가**(`undefined` — 신축주택 양도일과
 *    날이 다른데 선언이 없음)면 표1. 판정 불가는 「모름 = 혜택 불성립」이다.
 *    술어는 비과세(Step A.6 `applySettlementExemption`)와 **같은 leaf**(`resolveOneHouseAtSettlementSale`)다.
 *
 * `isOneHouseSingle`은 호출부가 넘기는 **표2·§154① 축**(실제 1주택 ∨ §155 의제)이다.
 */
export function resolveRedevSettlementReceiveOneHouse(
  input: {
    transferDate: Date;
    redevelopment: Pick<
      RedevelopmentInfo,
      "exemptionEligibleAtApproval" | "oneHouseAtSettlementSale" | "settlementSaleDate"
    >;
  },
  isOneHouseSingle: boolean,
): boolean {
  if (input.redevelopment.exemptionEligibleAtApproval === false) return false;
  return resolveOneHouseAtSettlementSale(input, isOneHouseSingle) === true;
}

/**
 * 입주권(subject="right") 인가전 분 LTHD에 쓰이는 **거주월수** — 실가·환산 경로 공용 leaf.
 *
 * 입주권은 인가전 분만 LTHD를 받으므로 **종전주택 거주월수만** 의미가 있다.
 * ⚠️ `newHouseResidenceMonths`(신축 APT 거주월수)를 더하지 않는다 — 입주권은 완공 **전**
 *    권리 양도라 신축 거주가 존재할 수 없다.
 */
export function resolveRightResidenceMonths(input: {
  priorHouseResidenceMonths?: number;
  newHouseResidenceMonths?: number;
  residencePeriodMonths?: number;
}): number {
  const hasSplit =
    input.priorHouseResidenceMonths !== undefined || input.newHouseResidenceMonths !== undefined;
  return hasSplit ? (input.priorHouseResidenceMonths ?? 0) : (input.residencePeriodMonths ?? 0);
}

/**
 * **토지만 출자한 원조합원**의 완공 신축주택인가 — 보유기간이 사용승인서 교부일부터라(영 §162①4호 · 서면-2022-부동산-1616)
 * 「그 보유기간 중 거주기간」이 신축주택 거주뿐인 축(#12). 승계조합원과 같은 거주월수 규칙을 쓴다.
 * 엔진 판정 술어 `isLandContributedOriginalApt`(`one-house/redev-apt-judgment-input.ts`)의 재개발 정보 부분이다 — 두 판정이 같은 술어를 본다.
 */
export function isLandContributedNewBuild(
  redev: Pick<RedevelopmentInfo, "subject" | "isSuccessorMember" | "originalAssetType" | "completionDate">,
): boolean {
  return (
    redev.subject === "apt" &&
    redev.isSuccessorMember !== true &&
    redev.originalAssetType === "land" &&
    redev.completionDate !== undefined
  );
}

/**
 * 완공 신축주택(subject="apt") 양도의 **거주월수 단일 소스** — §154① 비과세 판정 · §95② 표2 공용 leaf
 * (2026-09-26 · OH-48 · OH-50).
 *
 * ## 🔴 왜 한 함수인가
 *
 * 완공APT는 거주를 두 곳에서 받는다 — ① 재개발 카드의 분리 입력(`prior`·`new`)과 ② Step4
 * 거주기간(`residencePeriodMonths`). 종전에는 표2가 ①을, §154① 판정이 ②를 따로 읽어 **같은
 * 계산에서 표2는 「거주 2년 이상」, 비과세는 「거주 미달」**이 동시에 나왔다
 * (실측: 분리 종전 30개월 · Step4 0 · 10억 → 비과세 부정 124,491,714원).
 * 「소득세법 시행령」 §154①(「그 보유기간 중 거주기간이 2년 이상」)과 §159의4(같은 문언)는
 * **같은 사실**을 요구하므로 한 값이어야 한다.
 *
 * ## 규칙 — 분리 입력이 있으면 그것, 없으면 Step4 값
 *
 * - **원조합원**: `prior + new` — 시행령 §154⑧1호 「그 멸실된 주택과 재건축한 주택에 대한
 *   거주기간」 통산. 표2가 종전부터 쓰던 식 그대로다.
 * - **토지만 출자한 원조합원**(`isLandContributedNewBuild`): 승계조합원과 같이 `new`만(호출부가 `isSuccessorMember: true`로 부른다) —
 *   멸실된 주택이 없어 §154⑧1호 통산 대상이 없다(#12 · 대법원 2025두34147: 기존건물분은 기존건물 거주 + 신축 거주를 통산).
 * - **승계조합원**: `new`만 — 보유기간이 준공일(사용승인서 교부일, 시행령 §162①4호)부터라
 *   「그 보유기간 중」 거주는 신축주택 거주뿐이다. 서면-2019-부동산-4508(2022.12.06) 요지:
 *   「보유기간은 해당 주택의 취득일(준공인가증 교부일)부터 계산하는 것으로 **멸실 전 거주기간을
 *   통산하지 아니함**」. `prior`는 승계 전 거주라 읽지 않는다.
 *
 * ⚠️ 분리 입력이 **없을 때**의 Step4 값은 ⑧(`transfer-tax-validate.ts`)이 「입주일 ≥ 보유 기산일」을
 *    막아 둔 값이다(승계조합원은 준공일 기준 — OH-50). 월수 직접 입력은 날짜가 없어 준공 전 거주를 가려낼 수
 *    없고, 준공일~양도일보다 긴 값만 ⑧·⑫가 막는다(I-8 `successorAptMaxResidenceMonths`).
 */
export function resolveAptResidenceMonths(input: {
  isSuccessorMember?: boolean;
  priorHouseResidenceMonths?: number;
  newHouseResidenceMonths?: number;
  residencePeriodMonths?: number;
}): number {
  if (input.isSuccessorMember === true) {
    return input.newHouseResidenceMonths !== undefined
      ? input.newHouseResidenceMonths
      : (input.residencePeriodMonths ?? 0);
  }
  const hasSplit =
    input.priorHouseResidenceMonths !== undefined || input.newHouseResidenceMonths !== undefined;
  return hasSplit
    ? (input.priorHouseResidenceMonths ?? 0) + (input.newHouseResidenceMonths ?? 0)
    : (input.residencePeriodMonths ?? 0);
}

/**
 * I-8 — 승계조합원 완공APT가 **거주월수로 쓸 수 있는 최댓값** = 준공일부터 양도일까지의 개월 수.
 *
 * 신축주택 취득시기는 「소득세법 시행령」 §162①4호(사용승인서 교부일 — 그 전 사실상 사용·임시사용승인이면
 * 그 날)이고, §154①·§159의4의 「그 보유기간 중 거주기간」은 그 뒤의 거주뿐이다(서면-2019-부동산-4508
 * 「멸실 전 거주기간을 통산하지 아니함」). 개월 수 직접 입력은 날짜가 없어 준공 전 거주를 가려낼 수 없지만,
 * **보유기간보다 긴 거주**는 사실상 불가능한 값이다 ⇒ ⑧·⑫가 이 상한으로 막는다.
 *
 * 셈은 구간 입력(`residenceIntervalMonths` = `completedMonthsInclusive`)이 [준공일, 양도일] 한 구간에서
 * 만드는 값과 같다 — 구간으로 입력하면 통과하는 값을 개월 입력에서 막지 않는다.
 */
export function successorAptMaxResidenceMonths(completionDate: Date, transferDate: Date): number {
  return completedMonthsInclusive(completionDate, transferDate);
}

// ──────────────────────────────────────────────────────────────────────────────
// 입력·결과
// ──────────────────────────────────────────────────────────────────────────────

/** 분기별 LTHD 산정 입력 */
export interface RedevelopmentLthdInput {
  /** RedevelopmentInfo (subject·approvalDate·settlementDirection·settlementSaleDate) */
  redevelopment: RedevelopmentInfo;

  /** 자산 취득일 */
  acquisitionDate: Date;

  /** 자산 양도일 (완공 APT 양도일 또는 입주권 양도일) */
  transferDate: Date;

  /** 입주권 양도 시 승계조합원 여부 (true 시 LTHD 0 — §95② 본문 괄호) */
  isSuccessorRightToMoveIn?: boolean;

  /** 1세대 1주택 여부 (표2 적용 분기) */
  isOneHouseSingle?: boolean;

  /**
   * 거주기간 개월 (legacy 단일값 — 신규 두 필드가 모두 undefined 일 때 fallback).
   * 신규 케이스에서는 priorHouseResidenceMonths + newHouseResidenceMonths 사용 권장.
   */
  residencePeriodMonths?: number;

  /**
   * 종전주택 거주개월수 (시행령 §154⑧ 통산 산식의 prior 분량).
   * 기존건물분(인가전+인가후 비청산) LTHD 표2 거주분 = prior + new (통산). 토지 출자 원조합원은 new만(#12).
   */
  priorHouseResidenceMonths?: number;

  /**
   * 신축주택 거주개월수.
   * 청산금납부분 LTHD 표2 진입 가드 — 사전법령해석재산 2020-386.
   */
  newHouseResidenceMonths?: number;
}

/** 분기별 LTHD 산정 결과 (3분기 각각) */
export interface RedevelopmentLthdBranch {
  /** 보유기간 (months 단위) */
  holdingMonths: number;
  /** 보유기간 잔여 일수 (X년 Y월 Z일 표시용 — 사례 46 신고서 양식 표 정합) */
  holdingDays?: number;
  /** 보유기간 (years 정수 — 표 적용용) */
  holdingYears: number;
  /** LTHD 율 (0~0.8) — holdingRate + residenceRate */
  rate: number;
  /** LTHD 보유분 율 (표1: rate 전액, 표2: 0~0.40) */
  holdingRate: number;
  /** LTHD 거주분 율 (표1: 0, 표2: 0~0.40, 거주 2년+ 가드) */
  residenceRate: number;
  /** LTHD 산정 가능 여부 (false 시 LTHD 대상 자체 부존재) */
  applicable: boolean;
  /** 비적용 사유 (UI 표시용) */
  reason?: string;
}

/** 분기별 LTHD 결과 — 3분기 묶음 */
export interface RedevelopmentLthdResult {
  preApproval: RedevelopmentLthdBranch;
  postApprovalExistingHouse: RedevelopmentLthdBranch;
  settlement: RedevelopmentLthdBranch;
}

// ──────────────────────────────────────────────────────────────────────────────
// 본문 함수
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 분기별 LTHD 보유기간·율 산정.
 *
 * §166⑤ 호별 보유기간 + §95② 본문 괄호 분기 처리:
 * - subject="right" (입주권 양도): 인가전 분만 LTHD (원조합원), 나머지 부존재
 * - subject="apt" (완공 APT 양도): 3분기 모두 LTHD (단, 묶음 LTHD율 동일 강제)
 *
 * @returns 3분기 각각의 보유기간·율·적용 가능 여부
 */
export function computeRedevelopmentLthd(
  input: RedevelopmentLthdInput,
): RedevelopmentLthdResult {
  const { redevelopment, acquisitionDate, transferDate, isSuccessorRightToMoveIn } = input;
  const { subject, approvalDate, settlementDirection, settlementSaleDate } = redevelopment;

  // ─ 사례 46 가드: exemptionEligibleAtApproval=false 시 표1 강등 ─
  // 부동산거래관리과-380 (2012.07.20) 후단 — 종전주택을 조합에 제공한 때까지 보유 요건 미충족이면
  // 청산금분 1세대1주택 비과세 미해당(판정 기준일 자체는 청산금분 양도일 — L-12) → 표2 진입 차단, 표1 강제.
  // undefined 시 legacy isOneHouseSingle fallback (사례 44·45 회귀 안전).
  // 🔴 입주권(right)만 이 값을 쓴다. 완공APT는 강등 대상이 **청산금 수령분 분기뿐**이다(G3-8 — 아래 apt 분기).
  const effectiveOneHouseSingle = resolveRedevEffectiveOneHouseSingle(input);

  // ─ 거주월수 귀속 분리 (사례 45 — 시행령 §154⑧ + 사전법령해석재산 2020-386) ─
  // 신규 두 필드(prior/new)가 모두 undefined 시 legacy fallback:
  //   기존건물분 = residencePeriodMonths 단일값
  //   청산금분   = 0 (해석례 보수적 적용 — 신축거주 입력 없으면 표1 강등)
  const hasSplitResidence =
    input.priorHouseResidenceMonths !== undefined || input.newHouseResidenceMonths !== undefined;
  const newMonths = input.newHouseResidenceMonths ?? 0;
  // 식은 §154① 판정과 공용 leaf(`resolveAptResidenceMonths`) — 두 판정이 같은 거주월수를 본다(OH-48).
  // #12 — 토지만 출자한 원조합원은 종전주택이 없어 신축 거주만 센다(판정 번역 `translateRedevAptForHousingJudgment`와 같다).
  //   종전에는 표2만 prior + new를 더해, API로 종전 거주를 보내면 비과세 판정(신축만)과 표2가 다른 거주월수를 봤다.
  const existingResidenceMonths = resolveAptResidenceMonths({
    isSuccessorMember: isLandContributedNewBuild(redevelopment),
    priorHouseResidenceMonths: input.priorHouseResidenceMonths,
    newHouseResidenceMonths: input.newHouseResidenceMonths,
    residencePeriodMonths: input.residencePeriodMonths,
  });
  const payResidenceMonths = hasSplitResidence ? newMonths : 0;

  // ─ subject="right" (입주권 양도) 분기 ─
  if (subject === "right") {
    return computeRightLthd({
      acquisitionDate,
      approvalDate,
      isSuccessorRightToMoveIn: isSuccessorRightToMoveIn ?? false,
      isOneHouseSingle: effectiveOneHouseSingle,
      /**
       * 입주권은 인가전 분만 LTHD → **종전주택 거주월수만** 의미 있다.
       *
       * ⚠️ `newHouseResidenceMonths`(신축 APT 거주월수, 사례 45)를 더하지 않는다 —
       * 입주권은 완공 **전** 권리 양도라 신축 거주가 존재할 수 없다. 종전에는 위
       * `existingResidenceMonths`(= prior + new)를 그대로 넘겨, 신축 거주월수만 입력해도
       * 인가전 분 LTHD가 표1 14% → 표2 68%까지 올라갔다(2026-08-14 실측).
       * 입력 UI·API에도 게이트를 뒀지만(`RedevelopmentBlock` · `buildRedevelopmentPayload`),
       * 별도 조립 경로(다건 route 등)까지 덮으려면 엔진이 정본이어야 한다.
       */
      residencePeriodMonths: resolveRightResidenceMonths(input),
    });
  }

  // ─ subject="apt" (완공 APT 양도) 분기 ─
  // 신축주택분(인가전·인가후 기존건물분)·청산금 납부분은 일반 판정 축(`input.isOneHouseSingle`)을 그대로 쓴다 —
  // 미충족 선언(380 후단)은 「그 청산금」만 과세로 보는 것이라 신축주택분 표2를 내리지 않는다(G3-8).
  // 청산금 **수령**분은 청산금분 양도일 축으로 따로 판정한다(G3-5).
  const aptOneHouseSingle = input.isOneHouseSingle ?? false;
  return computeAptLthd({
    acquisitionDate,
    approvalDate,
    transferDate,
    settlementDirection,
    settlementSaleDate,
    isOneHouseSingle: aptOneHouseSingle,
    receiveSettlementOneHouseSingle: resolveRedevSettlementReceiveOneHouse(
      { transferDate, redevelopment },
      aptOneHouseSingle,
    ),
    existingResidenceMonths,
    payResidenceMonths,
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// 입주권 양도 (§166⑤1호 + §95② 본문 괄호)
// ──────────────────────────────────────────────────────────────────────────────

export function computeRightLthd(args: {
  acquisitionDate: Date;
  approvalDate: Date;
  isSuccessorRightToMoveIn: boolean;
  isOneHouseSingle: boolean;
  residencePeriodMonths: number;
}): RedevelopmentLthdResult {
  const {
    acquisitionDate,
    approvalDate,
    isSuccessorRightToMoveIn,
    isOneHouseSingle,
    residencePeriodMonths,
  } = args;

  // §95② 본문 괄호: 승계조합원은 LTHD 0
  if (isSuccessorRightToMoveIn) {
    return {
      preApproval: zeroBranch("§95② 본문 괄호 — 승계조합원(조합원으로부터 취득)은 LTHD 미적용"),
      postApprovalExistingHouse: zeroBranch("입주권 양도 시 인가후 기존주택분 양도차익은 LTHD 대상 부존재 (§95② 본문 괄호·§166⑤1호)"),
      settlement: zeroBranch("§94①2호 (조합원입주권 = 부동산을 취득할 수 있는 권리) + 시행령 §166①1호·2호 가목 산식 구조상 LTHD 대상 자산 부존재 (§95② 대상자산 토지·건물 범위 외)"),
    };
  }

  // 원조합원: 인가전 분만 LTHD (§166⑤1호 — 취득일 ~ 관리처분 인가일)
  const preApprovalHolding = calculateHoldingPeriod(acquisitionDate, approvalDate);
  const preApprovalMonths = preApprovalHolding.years * 12 + preApprovalHolding.months;
  // 표2 **대상 판정**은 입력한 거주 전체(관리처분계획인가일 이후 철거 전 거주 포함)로, 거주기간별 **공제율**은 취득일~인가일 안의 거주만
  // 센다(사전-2023-법규재산-0141 — 입력 칸을 새로 만들지 않고, 그 기간을 넘는 부분은 확실히 인가 후 거주라 «모름»이 아니다 · #14 하위 나).
  const preApprovalSplit = computeLthdRateSplit(
    preApprovalHolding.years,
    isOneHouseSingle,
    Math.floor(residencePeriodMonths / 12),
    Math.floor(Math.min(residencePeriodMonths, preApprovalMonths) / 12),
  );

  return {
    preApproval: {
      holdingMonths: preApprovalMonths,
      holdingDays: preApprovalHolding.days,
      holdingYears: preApprovalHolding.years,
      rate: preApprovalSplit.total,
      holdingRate: preApprovalSplit.holding,
      residenceRate: preApprovalSplit.residence,
      applicable: true,
    },
    postApprovalExistingHouse: zeroBranch("입주권 양도 시 인가후 기존주택분 양도차익은 LTHD 대상 부존재 (§95② 본문 괄호·§166⑤1호)"),
    settlement: zeroBranch("§94①2호 (조합원입주권 = 부동산을 취득할 수 있는 권리) + 시행령 §166①1호·2호 가목 산식 구조상 LTHD 대상 자산 부존재 (§95② 대상자산 토지·건물 범위 외)"),
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 완공 APT 양도 (§166⑤2호 + 묶음 동일 율 강제)
// ──────────────────────────────────────────────────────────────────────────────

function computeAptLthd(args: {
  acquisitionDate: Date;
  approvalDate: Date;
  transferDate: Date;
  settlementDirection: "pay" | "receive";
  settlementSaleDate?: Date;
  /** 신축주택분·청산금 납부분의 표2 「1주택」 축 */
  isOneHouseSingle: boolean;
  /** 청산금 **수령**분의 표2 「1주택」 축 — 청산금분 양도일 기준 + 미충족 선언 강등 (`resolveRedevSettlementReceiveOneHouse`) */
  receiveSettlementOneHouseSingle: boolean;
  /** 기존건물분 거주월수 (= prior + new, §154⑧ 통산 — 토지 출자 원조합원은 new만 · #12) */
  existingResidenceMonths: number;
  /** 청산금분 거주월수 (= new, 해석례 2020-386) */
  payResidenceMonths: number;
}): RedevelopmentLthdResult {
  const {
    acquisitionDate,
    approvalDate,
    transferDate,
    settlementDirection,
    settlementSaleDate,
    isOneHouseSingle,
    receiveSettlementOneHouseSingle,
    existingResidenceMonths,
    payResidenceMonths,
  } = args;

  const existingResidenceYears = Math.floor(existingResidenceMonths / 12);
  const payResidenceYears = Math.floor(payResidenceMonths / 12);

  // ─ §166⑤2호나목: 기존건물분 (preApproval + postApprovalExistingHouse) = 취득일 ~ 신축양도일 ─
  // 묶음 동일 보유기간 → 동일 LTHD율 (분배법칙으로 분기별 산출해도 합계 동일)
  // 거주분 = §154⑧ 통산 (prior + new) — 토지 출자 원조합원은 new만(#12, 호출부 `existingResidenceMonths`)
  const existingHolding = calculateHoldingPeriod(acquisitionDate, transferDate);
  const existingMonths = existingHolding.years * 12 + existingHolding.months;
  const existingSplit = computeLthdRateSplit(existingHolding.years, isOneHouseSingle, existingResidenceYears);

  const preApprovalBranch: RedevelopmentLthdBranch = {
    holdingMonths: existingMonths,
    holdingDays: existingHolding.days,
    holdingYears: existingHolding.years,
    rate: existingSplit.total,
    holdingRate: existingSplit.holding,
    residenceRate: existingSplit.residence,
    applicable: true,
  };
  const postApprovalBranch: RedevelopmentLthdBranch = { ...preApprovalBranch };

  // ─ 청산금 분 보유기간 + 거주월수 = new 만 (해석례 2020-386) ─
  let settlementBranch: RedevelopmentLthdBranch;
  if (settlementDirection === "pay") {
    // §166⑤2호가목: 인가일 ~ 신축양도일
    const payHolding = calculateHoldingPeriod(approvalDate, transferDate);
    const payMonths = payHolding.years * 12 + payHolding.months;
    const paySplit = computeLthdRateSplit(payHolding.years, isOneHouseSingle, payResidenceYears);
    settlementBranch = {
      holdingMonths: payMonths,
      holdingDays: payHolding.days,
      holdingYears: payHolding.years,
      rate: paySplit.total,
      holdingRate: paySplit.holding,
      residenceRate: paySplit.residence,
      applicable: true,
    };
  } else {
    // 수령: §95④ + NTS 집행기준 — 취득일 ~ settlementSaleDate (소유권이전 고시일 다음날)
    // 거주월수도 신축거주만 (해석례 동일 적용 — 수령 분기는 별도 해석례 없으나 보수적 적용)
    const endDate = settlementSaleDate ?? transferDate;
    const receiveHolding = calculateHoldingPeriod(acquisitionDate, endDate);
    const receiveMonths = receiveHolding.years * 12 + receiveHolding.months;
    const receiveSplit = computeLthdRateSplit(receiveHolding.years, receiveSettlementOneHouseSingle, payResidenceYears);
    settlementBranch = {
      holdingMonths: receiveMonths,
      holdingDays: receiveHolding.days,
      holdingYears: receiveHolding.years,
      rate: receiveSplit.total,
      holdingRate: receiveSplit.holding,
      residenceRate: receiveSplit.residence,
      applicable: true,
    };
  }

  return {
    preApproval: preApprovalBranch,
    postApprovalExistingHouse: postApprovalBranch,
    settlement: settlementBranch,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

/**
 * LTHD 율 산정 (표1·표2 분기).
 *
 * 소법 §95② 별표:
 * - 표1 (일반): 3년 미만 0% / 3년차 6% / 매년 2% 가산 / 15년+ 30% 캡
 * - 표2 (1세대1주택 + 거주 2년+): 보유 × 4% (40% 캡) + 거주 × 4% (40% 캡)
 *
 * @param years 보유 연수 (정수, 보유개월 / 12 floor)
 * @param isOneHouseSingle 1세대1주택 여부
 * @param residenceYears 거주 연수 (정수)
 */
function computeLthdRate(
  years: number,
  isOneHouseSingle: boolean,
  residenceYears: number,
): number {
  return computeLthdRateSplit(years, isOneHouseSingle, residenceYears).total;
}

/**
 * 보유분/거주분 분리 율 산정 (신고서 양식 표시용).
 * 표1: holding=rate(≤0.30), residence=0
 * 표2: holding=min(years×0.04,0.40), residence=min(resYears×0.04,0.40) (거주 2년+ 가드)
 */
/**
 * §95② **단서**(1세대1주택 표2) 진입 여부 — **단일 소스**.
 *
 * 「대통령령으로 정하는 1세대 1주택」 + 보유기간 중 **거주기간 2년 이상**. 조특법 §97의4①
 * 단서(「같은 항 단서에 해당하는 경우에는 그러하지 아니하다」)가 가리키는 것이 이 조건이라,
 * 추가공제율 가산 배제 판정도 같은 술어를 써야 한다 — 두 술어로 판정하면 드리프트한다
 * (memory `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ 보유기간(3년) 게이트는 여기 넣지 않는다. 표2 **대상**인지와 공제율이 0인지는 다른 축이고,
 *   §97의4 단서는 「표2 대상이면 가산하지 않는다」이지 「공제율이 있으면」이 아니다.
 */
export function usesTable2(isOneHouseSingle: boolean, residenceYears: number): boolean {
  return isOneHouseSingle && residenceYears >= 2;
}

/**
 * 재개발 경로의 §95② 단서(표2) 해당 여부 — 조특법 §97의4① 단서 판정용 (E-4).
 *
 * LTHD 산정이 실제로 쓰는 leaf를 그대로 쓴다(memory `feedback_shared_predicate_argument_parity`).
 * 종전에는 Step4 `residencePeriodMonths`·원시 1세대1주택 값을 읽어, 분리 입력으로 표2가 적용된
 * 계산에 추가공제율이 더해지거나(과소과세) 표1로 강등된 계산에서 가산이 빠졌다(과대과세).
 *
 * - 입주권 승계조합원: LTHD 부존재(§95② 본문 괄호) → 표2 아님
 * - 입주권 원조합원: `resolveRedevEffectiveOneHouseSingle` + `resolveRightResidenceMonths`
 * - 완공APT 승계조합원: `runSuccessorMember`와 같이 원시 1세대1주택 + 신축 거주(`resolveAptResidenceMonths`)
 * - 완공APT 원조합원: 기존건물분 표2와 같은 원시 1세대1주택 축 + `resolveAptResidenceMonths`(미충족 선언은 청산금 수령분 분기만 강등 — G3-8)
 *
 * ⚠️ 청산금 납부분은 신축 거주만으로 표를 정한다(해석례 2020-386) — 분기별 단서 판정은 하지 않고
 *   자산 단위(기존건물분 기준)로 본다(종전 구조 유지).
 * ⚠️ **청산금 수령 단독신고**(`receiveOnlyMode`)는 청산금분만 양도 대상이라 그 분기의 표(청산금분 양도일 축 +
 *   미충족 선언 강등 — `resolveRedevSettlementReceiveOneHouse`, 신축 거주만)를 본다. `transferDate`를 넘긴
 *   호출부에서만 켠다(G3-8 · 완공APT 원조합원의 강등이 청산금 수령분 분기로 좁혀지면서 생긴 분기).
 */
export function redevUsesTable2(input: {
  redevelopment: {
    subject: "apt" | "right";
    isSuccessorMember?: boolean;
    exemptionEligibleAtApproval?: boolean;
    priorHouseResidenceMonths?: number;
    newHouseResidenceMonths?: number;
    settlementDirection?: RedevelopmentInfo["settlementDirection"];
    receiveOnlyMode?: boolean;
    oneHouseAtSettlementSale?: boolean;
    settlementSaleDate?: Date;
    originalAssetType?: RedevelopmentInfo["originalAssetType"];
    completionDate?: Date;
  };
  isOneHouseSingle: boolean;
  residencePeriodMonths?: number;
  isSuccessorRightToMoveIn?: boolean;
  transferDate?: Date;
}): boolean {
  const r = input.redevelopment;
  const months = {
    priorHouseResidenceMonths: r.priorHouseResidenceMonths,
    newHouseResidenceMonths: r.newHouseResidenceMonths,
    residencePeriodMonths: input.residencePeriodMonths,
  };
  if (r.subject === "right") {
    if (input.isSuccessorRightToMoveIn === true) return false;
    return usesTable2(
      resolveRedevEffectiveOneHouseSingle(input),
      Math.floor(resolveRightResidenceMonths(months) / 12),
    );
  }
  if (r.isSuccessorMember === true) {
    return usesTable2(
      input.isOneHouseSingle,
      Math.floor(resolveAptResidenceMonths({ ...months, isSuccessorMember: true }) / 12),
    );
  }
  if (
    r.settlementDirection === "receive" &&
    r.receiveOnlyMode === true &&
    input.transferDate !== undefined
  ) {
    const hasSplit =
      r.priorHouseResidenceMonths !== undefined || r.newHouseResidenceMonths !== undefined;
    return usesTable2(
      resolveRedevSettlementReceiveOneHouse(
        { transferDate: input.transferDate, redevelopment: r },
        input.isOneHouseSingle,
      ),
      Math.floor((hasSplit ? (r.newHouseResidenceMonths ?? 0) : 0) / 12),
    );
  }
  // #12 — 토지 출자 원조합원은 신축 거주만(위 `computeRedevelopmentLthd`와 같은 규칙).
  return usesTable2(
    input.isOneHouseSingle,
    Math.floor(resolveAptResidenceMonths({ ...months, isSuccessorMember: isLandContributedNewBuild(r) }) / 12),
  );
}

export function computeLthdRateSplit(
  years: number,
  isOneHouseSingle: boolean,
  residenceYears: number,
  /**
   * 거주분 공제율에 쓰는 거주 연수 — 표2 **대상 판정**(`residenceYears`)과 갈릴 때만 준다(입주권: 인가 후 거주 제외). 생략하면 같은 값.
   * 표2 거주기간 열은 「2년 이상」부터라(§95② 표2) 공제율용 거주가 2년 미만이면 거주분은 0이다.
   */
  rateResidenceYears: number = residenceYears,
): { holding: number; residence: number; total: number } {
  if (years < 3) return { holding: 0, residence: 0, total: 0 };

  if (usesTable2(isOneHouseSingle, residenceYears)) {
    const holding = Math.min(years * 0.04, 0.40);
    const residence = rateResidenceYears >= 2 ? Math.min(rateResidenceYears * 0.04, 0.40) : 0;
    return { holding, residence, total: holding + residence };
  }

  const holding = Math.min(years * 0.02, 0.30);
  return { holding, residence: 0, total: holding };
}

/** LTHD 대상 부존재 분기 (입주권 양도 인가후·청산금) */
function zeroBranch(reason: string): RedevelopmentLthdBranch {
  return {
    holdingMonths: 0,
    holdingYears: 0,
    rate: 0,
    holdingRate: 0,
    residenceRate: 0,
    applicable: false,
    reason,
  };
}

/**
 * 양도차익 × LTHD율 → LTHD 금액 (분기별).
 * applyRate (Math.floor) 사용 — 세법 정수연산 원칙.
 *
 * 묶음 양도차익 (preApproval + postApprovalExistingHouse) × 동일 율 = 분기별 산출 합 (분배법칙).
 */
export function applyLthdToGain(gain: number, rate: number): number {
  if (gain <= 0 || rate <= 0) return 0;
  // 공제율이 double 합(보유분 + 거주분 · 표1 + §97의4 가산)이라 0.6799…처럼 내려가면 1원 과소 — 정수 분수로(일반 경로 `applyLthdRate`와 같은 leaf)
  return applyFairMarketRatio(gain, rate);
}
