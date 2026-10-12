/**
 * 조합원입주권 양도의 장기보유특별공제 **표2(1세대1주택) 대상 판정** — §89①4호 가·나목 술어를 그대로 쓴다 (#14 · G3-7).
 *
 * ## 왜 가·나목 술어인가
 *
 * 「소득세법」 §95② 단서는 양도하는 **그 자산**이 1세대1주택일 때만 표2를 준다. 입주권은 §89①4호 요건(가목: 다른 주택·분양권 없음 /
 * 나목: 다른 주택 1채 + 그 취득일부터 N년 이내 양도 — 본문의 인가일 현재 기존주택 요건 포함)을 갖춰야 1세대1주택으로 보는 것이
 * 국세청 회신(재산세과-1078 · 부동산거래관리과-1046 · 서면법규과-501 · 사전-2018-법령해석재산-0017 · 사전-2023-법규재산-0141)과
 * 심판례(조심2011서1530 · 조심2022중7305)의 일관된 독법이다 — 「요건 성립이면 표2, 불성립이면 표1」.
 * 종전에는 「입주권 외 다른 주택이 정확히 1채」(`householdHousingCount === 1`)로 표2를 줘서, 다른 주택이 없는 가목 고가 입주권은 표1이었고
 * 나목 기한이 지났거나 요건을 선언하지 않은 입주권(다른 주택 1채)은 표2였다(E3-03 기각 주석 — 이번에 뒤집었다).
 *
 * 표2의 거주 2년 요건은 별개 축이다(`usesTable2`). 비과세와 표2가 **같은 판정 하나**(`resolveOneRightExemptionClause`)에서 나온다.
 *
 * 범위 밖(한계): 2019년 이전 양도분의 표2 연혁(G3-6)과 2010~2019년 비거주자의 API 직접 호출.
 */
import { calculateHoldingPeriod } from "./tax-utils";
import { resolveRightResidenceMonths } from "./redevelopment-lthd";
import { oneRightOtherHouseCount, resolveRightSaleMarriageMerge } from "./one-house/right-sale-marriage-merge";
import { resolveOneRightHighValueThreshold } from "./data/one-right-high-value-era";
import {
  oneRightHighValueBase,
  oneRightPresaleGate,
  resolveOneRightExemptionClause,
  type OneRightExemptionFacts,
} from "./transfer-tax-redevelopment-transforms";
import { REDEVELOPMENT } from "./legal-codes";
import type { TransferTaxInput } from "./types/transfer.types";

/**
 * 표2 대상 판정에 쓰는 가·나목 — 계산기 입주권(`redevelopment.subject === "right"`)만 판정한다.
 *
 * 토지만 출자한 입주권도 같은 술어다(#13 조건 4 · 사용자 결정 2026-10-12 「나」): 같은 세대가 철거 대상 건물을 소유했다는 선언이
 * 「예」면 가·나목이 성립해 비과세와 함께 표2도 받는다. 미선언·「아니오」면 술어가 `undefined`(`landContributionBlocksOneRight`)라 표1이다.
 * 보유기간은 본인 토지 취득일~인가일(영 §166⑤1호)이고, 세대원 건물의 보유기간과 통산하지 않는다.
 */
export function resolveRightTable2Clause(input: TransferTaxInput): "ga" | "na" | undefined {
  const redev = input.redevelopment;
  if (!redev || redev.subject !== "right") return undefined;
  return resolveOneRightExemptionClause(redev, input);
}

/** 거주 2년 요건(표2 대상 판정에는 인가 후 철거 전 거주를 포함한다 — 사전-2023-법규재산-0141). */
function residenceYearsOf(input: TransferTaxInput): number {
  const redev = input.redevelopment!;
  return Math.floor(
    resolveRightResidenceMonths({
      priorHouseResidenceMonths: redev.priorHouseResidenceMonths,
      newHouseResidenceMonths: redev.newHouseResidenceMonths,
      residencePeriodMonths: input.residencePeriodMonths,
    }) / 12,
  );
}

function residenceMonthsOf(input: TransferTaxInput): number {
  const redev = input.redevelopment!;
  return resolveRightResidenceMonths({
    priorHouseResidenceMonths: redev.priorHouseResidenceMonths,
    newHouseResidenceMonths: redev.newHouseResidenceMonths,
    residencePeriodMonths: input.residencePeriodMonths,
  });
}

/**
 * 표2 고지 셋 (세액 불변) — 입주권 양도에만. 승계조합원은 장특 자체가 없어 말할 거리가 없다.
 *
 * ① 표2 적용 고지: 거주분은 관리처분계획인가일까지의 거주만 반영하므로(사전-2023-법규재산-0141) 입력에 인가 후 거주가 들어갔다면 확인 필요.
 * ② 거주기간 미입력 고지: 가·나목이 성립하고 12억 초과분이 과세되며 보유 3년 이상인데 거주기간이 0이면 표2의 거주분이 비어 있다.
 * ③ 모르는 사실 때문에 표2가 막힐 때만: 인가일 요건 미선언 · 나목 다른 주택 취득일 미입력 · 분양권 미확인 · 혼인합가 보유 쪽 미입력 —
 *    그 사실이 「있다」면 가·나목이 성립해 표2가 열리는 경우(반사실 판정)에만 낸다. 「모름 = 혜택 불성립 + 확인 필요」.
 */
export function rightTable2Notices(input: TransferTaxInput, clause: "ga" | "na" | undefined): string[] {
  const redev = input.redevelopment;
  if (!redev || redev.subject !== "right" || input.isSuccessorRightToMoveIn === true) return [];
  const holding = calculateHoldingPeriod(input.acquisitionDate, redev.approvalDate);
  if (holding.years < 3) return []; // 보유 3년 미만은 표1·표2 모두 공제율 0 — 표 선택이 세액을 가르지 않는다
  const resYears = residenceYearsOf(input);
  const out: string[] = [];

  if (clause !== undefined) {
    if (resYears >= 2) {
      out.push(
        `조합원입주권에 장기보유특별공제 표2(1세대1주택)를 적용했습니다 — §89①4호 가·나목 요건 성립 + 거주 2년(소득세법 시행령 §159의4). ` +
          `거주기간별 공제율은 관리처분계획인가일까지의 거주만 반영하므로 입력한 거주기간 중 취득일~인가일을 넘는 부분은 공제율에서 제외했습니다` +
          `(${REDEVELOPMENT.RIGHT_TABLE2_POST_APPROVAL_RESIDENCE_RULING}). 입력한 거주기간에 인가 후 철거 전 거주가 들어 있다면 확인이 필요합니다.`,
      );
    }
    const highValue = oneRightHighValueBase(input) > resolveOneRightHighValueThreshold(input.transferDate);
    if (highValue && residenceMonthsOf(input) === 0) {
      out.push(
        "거주기간이 입력되지 않았거나 0개월이라 장기보유특별공제 표2의 거주분이 반영되지 않았습니다 — 종전주택에 거주한 사실이 있으면 거주기간을 입력하세요. 확인이 필요합니다.",
      );
    }
    return out;
  }

  // 가·나목 불성립 — 표2가 거주 2년까지 채웠는데 모르는 사실 때문에 막힌 경우만 안내한다.
  if (resYears < 2 || !input.isOneHousehold || input.householdRightCount !== 1) return out;
  const missing: string[] = [];
  const cfRedev: OneRightExemptionFacts & NonNullable<TransferTaxInput["redevelopment"]> = { ...redev };
  let cfInput: TransferTaxInput = input;
  if (redev.exemptionEligibleAtApproval === undefined) {
    missing.push("관리처분계획인가일 현재 기존주택 비과세 요건(§89①4호 본문)을 선언하지 않았습니다");
    cfRedev.exemptionEligibleAtApproval = true;
  }
  if (redev.originalAssetType === "land" && redev.landHouseholdOwnedBuilding === undefined) {
    missing.push("토지만 출자한 입주권인데 같은 세대의 철거 대상 건물 소유를 선언하지 않았습니다");
    cfRedev.landHouseholdOwnedBuilding = true;
  }
  if (oneRightOtherHouseCount(input) === 1 && !redev.otherHouseAcquisitionDate) {
    missing.push("나목 다른 주택의 취득일이 입력되지 않았습니다");
    cfRedev.otherHouseAcquisitionDate = new Date(input.transferDate.getTime() - 86_400_000);
  }
  if (oneRightPresaleGate(input, redev) === "undetermined" && (input.presaleRights ?? []).length === 0) {
    missing.push("세대가 보유한 분양권이 없는지 확인하지 않았습니다");
    cfInput = { ...cfInput, householdNoPresaleRightsConfirmed: true };
  }
  const merge = resolveRightSaleMarriageMerge(input);
  if (merge?.status === "fails" && merge.confirmNotice) {
    missing.push("혼인 전 보유자(양도자 쪽/배우자 쪽)를 고르지 않았습니다");
    cfInput = { ...cfInput, householdHousingCount: Math.max(0, cfInput.householdHousingCount - 1) };
  }
  if (missing.length === 0) return out;
  if (resolveOneRightExemptionClause(cfRedev, { ...cfInput, redevelopment: cfRedev }) === undefined) return out;
  out.push(
    `조합원입주권에 장기보유특별공제 표2를 적용하지 않았습니다 — ${missing.join(" · ")}. ` +
      "해당 사실이 확인되어 §89①4호 가·나목이 성립하면 표2(1세대1주택)가 적용됩니다 — 확인이 필요합니다.",
  );
  return out;
}
