/**
 * 매매특약에 따라 **잔금청산 전에 주택을 멸실(철거)**한 양도 — 판정 메뉴 입력 `demolishedBeforeBalance` (결정 #46)
 *
 * 양도물건은 양도일(잔금청산일) 현황으로 판정한다 — 「소득세법 시행령」 §154① 「양도일 현재」 · 「소득세법」 §98 ·
 * 기획재정부 재산세제과-1543(2022.12.20.): 주택 매매계약을 체결하고 그 매매특약에 따라 잔금청산 전에 멸실한 경우
 * 양도일(잔금청산일)이 기준일이며 회신일 이후 매매계약을 체결하는 경우부터 적용한다. 그래서 2022-12-20 이후 계약이고
 * 잔금청산일 현재 나대지이면 주택 양도가 아니다 — 1세대1주택 비과세(§89①3호)를 적용하지 않는다.
 *
 * 입력은 「멸실 여부」와 「매매계약일」뿐이다. 멸실 전 지급 비율 같은 예외 기준선은 법령·해석례에 없어 묻지 않는다 —
 * 예외 결정례는 확인 필요 고지로 알린다(결론은 과세로 둔다).
 *
 * | 구분 | 처리 |
 * |---|---|
 * | 입력 없음 / 입주권 양도 | 변화 없음 |
 * | 계약일 < 2022-12-20 | 변화 없음(종전 기본통칙 89-154-12 — 매매계약일 기준) |
 * | 계약일 ≥ 2022-12-20 + 주택으로 보면 과세 | 변화 없음(어차피 과세 — 고지도 없다) |
 * | 계약일 ≥ 2022-12-20 + 주택으로 보면 비과세·부분과세 | 과세로 거두고 + 확인 필요 고지 |
 *
 * 범위: 판정 메뉴만. 계산기는 이 입력을 보내지 않고, 판정 결과를 넘길 때 ⑧ 경고가 「단순토지로 입력」을 안내한다.
 * 형제 축인 §154① 괄호의 매매계약 후 용도변경(주택 외 용도로 변경해 양도)은 이번 범위 밖이다.
 */
import { TRANSFER } from "../legal-codes/transfer";
import {
  DEMOLISHED_BEFORE_BALANCE_UNMET_ID,
  DEMOLISHED_BEFORE_BALANCE_UNVERIFIED_ID,
  isBalanceDateStatusContract,
} from "../data/demolished-before-balance-era";
import { revokeOneHouseExemption } from "./revoke-exemption";
import type { TransferTaxInput } from "../types/transfer.types";
import type { OneHouseJudgment } from "./types";

/** 주택 양도(§89①3호) 판정에 잔금 전 멸실 특약을 반영한다 — route 마지막 단계(비거주자 다음). */
export function applyDemolishedBeforeBalanceVerdict(
  judgment: OneHouseJudgment,
  input: TransferTaxInput,
  isRightSale: boolean,
): OneHouseJudgment {
  const d = input.demolishedBeforeBalance;
  if (!d || isRightSale || input.propertyType !== "housing") return judgment;
  if (!isBalanceDateStatusContract(d.contractDate)) return judgment;
  // 주택으로 봤을 때 비과세·부분과세가 나오는 경우에만 — 다른 사유로 이미 과세인 주택에는 붙이지 않는다.
  if (!judgment.isExempt && !judgment.isPartialExempt) return judgment;
  const base = revokeOneHouseExemption(judgment);
  return {
    ...base,
    unmetExceptions: [
      ...base.unmetExceptions,
      {
        id: DEMOLISHED_BEFORE_BALANCE_UNMET_ID,
        label: "잔금청산 전 매매특약 멸실 — 주택 양도로 보지 않음",
        legalBasis: `${TRANSFER.ONE_HOUSE_REQUIREMENT}①`,
        reasons: [
          `매매계약을 2022.12.20. 이후 체결하고 그 매매특약에 따라 잔금청산 전에 주택을 멸실했으므로, 양도물건은 양도일(잔금청산일) 현황으로 판정합니다 — 잔금청산일 현재 주택이 아닌 나대지를 양도한 것이라 1세대1주택 비과세(§89①3호)를 적용하지 않습니다(${TRANSFER.ONE_HOUSE_REQUIREMENT}① 「양도일 현재」 · ${TRANSFER.ACQUISITION_TRANSFER_TIMING} · 기획재정부 재산세제과-1543, 2022.12.20. — 회신일 이후 매매계약을 체결하는 경우부터 적용).`,
        ],
      },
    ],
    undetermined: [
      ...base.undetermined,
      {
        id: DEMOLISHED_BEFORE_BALANCE_UNVERIFIED_ID,
        reason:
          "잔금청산 전 멸실 특약 양도는 원칙적으로 토지 양도로 판정했습니다. 다만 사실관계에 따라 주택 양도로 본 결정이 있어 확인이 필요합니다 — " +
          "대법원 1994.9.13. 선고 94누125 판결(구법: 계약 당시 비과세 요건을 갖추고 매수자의 필요로 철거했으면 비과세), " +
          "조세심판원 조심2024중1920(2024.6.11.: 중도금까지 대금의 92.7%를 받은 뒤 멸실해 주택 양도로 봄), " +
          "조심2025서3871(2026.3.11.: 계약금 20%만 받은 상태에서 멸실하고 재작성한 계약서의 목적물이 토지여서 과세).",
      },
    ],
  };
}
