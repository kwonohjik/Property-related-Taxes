/**
 * 재개발 §166 — **완공APT 청산금 수령분의 1세대1주택 비과세** (Step A.6 · L-12, 2026-09-28)
 *
 * `transfer-tax-redevelopment-transforms.ts`에서 분리했다(그 파일이 677줄이라 이 규칙을 얹으면
 * 700을 넘는다). 원본이 이 파일을 **재export** 한다(import 사이트 무변경).
 *
 * ## 법리 (국세청 회신 원문 실독 — 상수 주석에 원문)
 *
 * 청산금 수령분은 **종전주택 일부의 양도**다(법규재산2012-358 — `calcAptReceiveSettlementGain`).
 * 그 비과세는 신축주택 판정과 **따로** 내린다:
 *
 * | 축 | 기준 | 근거 |
 * |---|---|---|
 * | 1세대1주택(주택 수) | **청산금분 양도일(소유권이전 고시일 다음날) 현재** | `REDEVELOPMENT.REDEV_SETTLEMENT_ONE_HOUSE_RULING` · `…_SALE_DATE_RULING` |
 * | 보유기간 | 종전주택을 **조합에 제공한 때**까지(철거 전 사실상 주거용 사용 기간 합산) | 380 후단 · `exemptionEligibleAtApproval` 자기선언 |
 * | 고가주택 여부 | **권리가격**(§166④1호) > 청산금분 양도일의 기준금액 | `REDEVELOPMENT.REDEV_SETTLEMENT_HIGH_VALUE_RULING` |
 * | 고가면 | 청산금분 양도차익 × (권리가격 − 기준금액) ÷ 권리가격 (§160①) | 같은 해석 |
 *
 * 🔴 **신축주택의 안분 비율을 청산금분에 쓰지 않는다.** 종전에는 신축주택이 고가(§95③)면
 *    Step A.5가 청산금분까지 신축주택 비율로 줄였고, 이 규칙이 불성립해도 그 축소가 남았다
 *    (청산금분 자체 요건 미충족인데 신축주택 비율로 과세분이 줄어드는 과소과세). 호출부가
 *    수령 방향에서는 청산금 분기를 A.5에서 빼고(`applyHighValueAllocation` keepSettlement),
 *    여기서 **원래 값**을 받아 판정한다.
 */
import { resolveHighValueHouseThreshold } from "./one-house/threshold";
import { safeMultiplyThenDivide } from "./tax-utils";
import { scaleLthdParts, zeroLthdParts } from "./transfer-tax-redevelopment-lthd";
import type { TransferTaxInput, RedevelopmentResult } from "./types/transfer.types";

/** 청산금분 양도일 — 엔진 입력이 없으면 양도일(조문상 같은 신고 단위)로 본다. */
function settlementSaleDateOf(input: Pick<TransferTaxInput, "transferDate" | "redevelopment">): Date {
  return input.redevelopment?.settlementSaleDate ?? input.transferDate;
}

/** 청산금분 고가주택 기준금액 — **청산금분 양도일** 시점 값(6억·9억·12억). step 문구와 판정이 같은 값을 본다. */
export function settlementHighValueThreshold(
  input: Pick<TransferTaxInput, "transferDate" | "redevelopment">,
): number {
  return resolveHighValueHouseThreshold(settlementSaleDateOf(input));
}

/** 같은 날인가 — 엔진 Date는 `YYYY-MM-DD` 문자열에서 온다(`lib/api/date-coerce.ts`)라 날짜 키로 비교한다. */
function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * 청산금분 양도일 현재 **1세대1주택(주택 수)** 인가 — `true`/`false`/`undefined`(판정 불가).
 *
 * 1. 자기선언 `oneHouseAtSettlementSale`이 있으면 그것.
 * 2. 없고 청산금분 양도일 = 이 신고의 양도일이면(단독신고는 ④가 양도일을 고시일 다음날로 맞춘다)
 *    세대 입력(`isOneHouseSingle` — 세대 주택 수 1)을 그 날의 사실로 쓴다(종전 동작).
 * 3. 없고 두 날이 다르면 **판정 불가** — 세대 입력은 신축주택 양도일의 사실이라 청산금분
 *    양도일의 주택 수를 말해 주지 않는다. 비과세를 주지 않고 경고한다(「모르니까 준다」 금지 ·
 *    §89①4호 나목 미입력과 같은 처리).
 */
export function resolveOneHouseAtSettlementSale(
  input: Pick<TransferTaxInput, "transferDate" | "redevelopment">,
  isOneHouseSingle: boolean,
): boolean | undefined {
  const declared = input.redevelopment?.oneHouseAtSettlementSale;
  if (declared !== undefined) return declared;
  return sameDay(settlementSaleDateOf(input), input.transferDate) ? isOneHouseSingle : undefined;
}

/** 판정 불가(3번) 경고 문구 — 결과 warnings로 나간다. */
export const SETTLEMENT_ONE_HOUSE_UNDETERMINED_WARNING =
  "청산금 수령분의 1세대1주택 비과세는 청산금분 양도일(소유권이전 고시일 다음날) 현재로 판정합니다" +
  "(부동산거래관리과-380 · 사전-2022-법규재산-1282). 그 날이 신축주택 양도일과 달라 세대 주택 수를 " +
  "확인할 수 없으므로 청산금분 비과세를 적용하지 않았습니다 — 그 날 현재 1세대1주택 여부를 선택하세요.";

/**
 * Step A.6 — 완공APT 청산금 **수령**분 비과세·고가 안분.
 *
 * 트리거 (AND):
 *   1. subject === "apt" · settlementDirection === "receive"
 *      (입주권의 `settlement` 분기는 §166①2호 **가목**(입주권 인가후 분)이지 청산금 수령분이 아니다 —
 *       종전에는 subject 가드가 없어 입주권 가목 양도차익이 이 비과세로 지워졌다.)
 *   2. exemptionEligibleAtApproval === true — 종전주택 보유(거주) 요건(조합 제공 시까지)
 *   3. 청산금분 양도일 현재 1세대1주택 (`resolveOneHouseAtSettlementSale`)
 *   ※ 단독신고(`receiveOnlyMode`)도 대상이다 — 380·1282·2705 모두 청산금 수령분 그 자체를 다룬다.
 *
 * 효과:
 *   · 권리가격 ≤ 기준금액(청산금분 양도일) → 청산금 분기 전액 비과세(마스킹) — `settlementExemptionApplied`
 *   · 권리가격 > 기준금액 → §160① 안분 — `settlementHighValueAllocation`
 *   · 불성립 → 입력 그대로(청산금분 전액 과세)
 */
export function applySettlementExemption(
  redev: RedevelopmentResult,
  redevInfo: NonNullable<TransferTaxInput["redevelopment"]>,
  input: Pick<TransferTaxInput, "transferDate" | "redevelopment">,
  isOneHouseSingle: boolean,
): RedevelopmentResult {
  if (
    redevInfo.subject !== "apt" ||
    redevInfo.settlementDirection !== "receive" ||
    redevInfo.exemptionEligibleAtApproval !== true ||
    resolveOneHouseAtSettlementSale(input, isOneHouseSingle) !== true
  ) {
    return redev;
  }

  const threshold = settlementHighValueThreshold(input);
  const s = redev.settlement;

  if (redevInfo.rightsValue > threshold) {
    // §160①1호 — 양도차익 × (양도가액 − 기준금액) ÷ 양도가액. 「양도가액」 자리에 권리가격(2705 질의2).
    // 손실 분기는 안분하지 않는다(`applyHighValueAllocation`의 같은 규약).
    if (s.gain <= 0) return redev;
    const taxableGain = safeMultiplyThenDivide(
      s.gain,
      redevInfo.rightsValue - threshold,
      redevInfo.rightsValue,
    );
    // §160①2호 — 형제 경로(`applyHighValueAllocation`)와 같이 안분 후 양도차익 × 그 분기 공제율.
    const taxableLthd = s.lthdRate > 0 ? Math.floor(taxableGain * s.lthdRate) : 0;
    const settlement = {
      ...s,
      gain: taxableGain,
      lthd: taxableLthd,
      gainBeforeAllocation: s.gain,
      nontaxableGain: s.gain - taxableGain,
      ...scaleLthdParts(s, taxableLthd),
    };
    const totalGain = redev.preApproval.gain + redev.postApprovalExistingHouse.gain + settlement.gain;
    const totalLthd = redev.preApproval.lthd + redev.postApprovalExistingHouse.lthd + settlement.lthd;
    return {
      ...redev,
      settlement,
      total: { gain: totalGain, lthd: totalLthd, taxableIncome: totalGain - totalLthd },
      settlementHighValueAllocation: {
        rightsValue: redevInfo.rightsValue,
        threshold,
        taxableRatio: (redevInfo.rightsValue - threshold) / redevInfo.rightsValue,
        gainBeforeAllocation: s.gain,
        taxableGain,
        nontaxableGain: s.gain - taxableGain,
      },
    };
  }

  const exemptedGain = s.gain;
  const exemptedLthd = s.lthd;
  const settlement = {
    ...s,
    // 신고서 「전체 양도차익 = 비과세 + 과세대상」 항등식이 이 값을 전체로 읽는다
    // (`FilingFormTableRedevRows` — 비과세 행은 `exemptedGain`). 종전에는 신축주택 안분(A.5)이
    // 우연히 채웠다 — 청산금분을 A.5에서 뺀 뒤로는 여기서 채운다.
    gainBeforeAllocation: s.gainBeforeAllocation ?? s.gain,
    gainAfterAllocation: s.gain,
    lthdAfterAllocation: s.lthd,
    gain: 0,
    lthd: 0,
    // 🔴 E3-05 — 분해 2필드도 함께 0으로(값이 있을 때만).
    ...zeroLthdParts(s),
  };
  const totalGain = redev.preApproval.gain + redev.postApprovalExistingHouse.gain;
  const totalLthd = redev.preApproval.lthd + redev.postApprovalExistingHouse.lthd;
  return {
    ...redev,
    // 3분기 trace 보존 — 종전 동작(결과 화면이 안분 후 값을 읽는다).
    preApproval: {
      ...redev.preApproval,
      gainAfterAllocation: redev.preApproval.gain,
      lthdAfterAllocation: redev.preApproval.lthd,
    },
    postApprovalExistingHouse: {
      ...redev.postApprovalExistingHouse,
      gainAfterAllocation: redev.postApprovalExistingHouse.gain,
      lthdAfterAllocation: redev.postApprovalExistingHouse.lthd,
    },
    settlement,
    total: { gain: totalGain, lthd: totalLthd, taxableIncome: totalGain - totalLthd },
    settlementExemptionApplied: true,
    exemptedGain,
    exemptedLthd,
  };
}
