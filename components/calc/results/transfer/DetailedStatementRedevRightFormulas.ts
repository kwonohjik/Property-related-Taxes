/**
 * 입주권(subject="right") 재개발 분할 산식 — 시행령 §166①1호(청산금 납부)·2호(청산금 수령) 구조 (R-c05-06).
 *
 * 엔진 칸 구조(`lib/tax-engine/redevelopment-split.ts` computeRightPay·computeRightReceive · `redevelopment-branches.ts`
 * runHousingContribReceiveEstimated)를 그대로 적는다 — 적힌 산식이 적힌 값을 만든다.
 *
 * | 칸 | 납부(1호) | 수령(2호) |
 * |---|---|---|
 * | 인가전 양도가액 | 권리가액(평가액) | 평가액 − 지급받은 청산금 (나목 분자) |
 * | 인가전 취득가액 | 종전 취득가액 그대로 | 종전 취득가액 × (평가액 − 청산금)을 평가액으로 나눈 값 (나목) |
 * | 인가후 양도가액 | 양도가액 − 평가액 | 양도가액 전액 (가목) |
 * | 인가후 취득가액 | 납부한 청산금 | 평가액 − 지급받은 청산금 (가목) |
 *
 * 종전에는 완공 APT 납부(§166②1호)의 분양가 안분 문구로 떨어져 「520,000,000 × (300,000,000 ÷ 400,000,000) = 0」 같은
 * 거짓 등식이 찍혔다. 인가후 기존건물분은 엔진이 0으로 채우는 칸이라 행 자체를 뺀다(`buildPerAsset`).
 * `DetailedStatementRedevelopmentBuilders.ts` 800줄 정책 분리.
 */
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { RedevBranch } from "./DetailedStatementRedevelopmentBuilders";
import { REDEVELOPMENT } from "@/lib/tax-engine/legal-codes/transfer-house";

const fmt = (n: number) => n.toLocaleString("ko-KR");

/** 인가후 기존건물분 칸 — 엔진이 0으로 채운다(행은 `buildPerAsset`이 빼므로 화면에 나오지 않는다). */
const NO_EXISTING_HOUSE = `해당 없음 — 입주권은 인가후 기존건물분이 없다 (${REDEVELOPMENT.GAIN_BASE} ①)`;

/** 양도가액 칸 */
export function rightTransferFormula(branch: RedevBranch, redev: RedevelopmentResult, dir?: "pay" | "receive"): string {
  if (branch === "postApprovalExistingHouse") return NO_EXISTING_HOUSE;
  const pre = redev.preApproval.apportionedTransfer;
  const post = redev.settlement.apportionedTransfer;
  if (dir === "receive") {
    return branch === "preApproval"
      ? `의제 양도가액 = 평가액 − 지급받은 청산금 = ${fmt(pre)} (${REDEVELOPMENT.RIGHT_RECEIVE} 나목 — 안분 비율의 분자)`
      : `양도가액 = ${fmt(post)} (${REDEVELOPMENT.RIGHT_RECEIVE} 가목 — 실지 양도가액 전액)`;
  }
  return branch === "preApproval"
    ? `의제 양도가액 = 권리가액 = ${fmt(pre)} (${REDEVELOPMENT.EVALUATION} 평가액)`
    : `양도가액 ${fmt(post + pre)} − 평가액 ${fmt(pre)} = ${fmt(post)} (${REDEVELOPMENT.RIGHT_PAY} — 양도가액 − (평가액 + 납부한 청산금)의 평가액 항)`;
}

/**
 * 취득가액 칸. 납부의 인가전 분은 안분이 없어 `undefined` — 호출자의 실가·환산·이월과세 산식이 그대로 맞다.
 * 수령의 인가전 분은 평가액이 echo에 따로 없어 비율을 문자로 적고, 환산이면 §166③ 원액(`housingContribDetail`)을 함께 적는다.
 */
export function rightAcquisitionFormula(
  branch: RedevBranch,
  redev: RedevelopmentResult,
  dir: "pay" | "receive" | undefined,
  carryoverDonor: boolean,
): string | undefined {
  if (branch === "postApprovalExistingHouse") return NO_EXISTING_HOUSE;
  const receive = dir === "receive";
  if (branch === "settlement") {
    return receive
      ? `평가액 − 지급받은 청산금 = ${fmt(redev.settlement.apportionedAcquisition)} (${REDEVELOPMENT.RIGHT_RECEIVE} 가목)`
      : `납부한 청산금 = ${fmt(redev.settlement.apportionedAcquisition)} (${REDEVELOPMENT.RIGHT_PAY} — 양도가액 − (평가액 + 납부한 청산금)의 청산금 항)`;
  }
  if (!receive) return undefined;
  const meta = redev.valuationMeta;
  const hcd = redev.housingContribDetail;
  const base = hcd
    ? `환산취득가 ${fmt(hcd.convertedAcquisition)} (${REDEVELOPMENT.CONVERTED_ACQ} — 평가액 × (취득 당시 기준시가 ${fmt(hcd.housingStdPriceAtAcq)}) ÷ (관리처분계획 인가일 현재 기준시가 ${fmt(hcd.housingStdPriceAtApproval)}))`
    : meta?.burdenedGiftStdLumpRate !== undefined
      ? "취득시 기준시가 × 채무비율 (소득세법 시행령 제159조 제1항 제1호 괄호)"
      : meta && meta.method !== "actual" && meta.method !== "successor_member_decree_162_1_4"
        ? `환산취득가 (${REDEVELOPMENT.CONVERTED_ACQ})`
        : carryoverDonor
          ? "증여자 취득가액 (이월과세 — 「소득세법」 §97의2①1호)"
          : "종전 취득가액";
  // 피연산자를 괄호로 감싸야 `FormulaText`가 분수로 그린다(literal-division-render · formula-fraction-render-path).
  return `${base} × (평가액 − 지급받은 청산금) ÷ (평가액) = ${fmt(redev.preApproval.apportionedAcquisition)} (${REDEVELOPMENT.RIGHT_RECEIVE} 나목, 1원 미만 절사)`;
}
