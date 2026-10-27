/**
 * 재개발 §166 — **증여받은 입주권의 승계조합원 완공APT**의 종전주택 거주 통산 고지 (사전-2020-법령해석재산-0691 · 2021.8.26.).
 *
 * 회신 요지: 「배우자로부터 조합원입주권을 증여받아 취득한 주택의 영 §159의3에 따른 거주기간은 기존주택과 신축주택에서 **1세대로서 거주한 기간**을 통산」.
 * 그 사안은 표2(장기보유특별공제) 대상 판정이고, 비과세 거주요건(영 §154①)은 다루지 않았다. 그런데 대법원 2026.1.15. 2025두34935는 표2의 거주기간을
 * 양도자가 취득일부터 양도일까지 보유하는 동안 거주한 기간으로 보았다 — 엔진은 판례를 따라 표2에는 통산하지 않고(`resolveSuccessorOwnResidenceMonths`),
 * 비과세 거주요건에만 통산한다(`resolveAptResidenceMonths`). 비과세 통산은 정면 해석이 없어 확인 필요를 알린다.
 * 동일세대원 증여 후 수증자 양도의 거주기간 통산은 서면인터넷방문상담4팀-912(2005.6.10.)가 비과세 판정에 통산한다고 답했다(주택 증여 사안).
 *
 * 고지는 **결론이 갈릴 수 있을 때만** 낸다 — 거주 2년 문턱(조정대상지역 거주요건 · 판례로 통산하지 않은 표2 대상)을 통산이 넘기거나(통산 적용),
 * 확인하지 않은 통산이 문턱을 넘길 수 있을 때(미확인). 모름 = 혜택 불성립이라 미확인은 통산하지 않고 계산한다.
 */
import { resolveAptResidenceMonths, resolveSuccessorOwnResidenceMonths } from "./redevelopment-lthd";
import type { TransferTaxInput } from "./types/transfer.types";
import { TRANSFER } from "./legal-codes";

const RESIDENCE_YEARS_THRESHOLD = 2;

/** 이 승계가 증여 승계인가 — 완공APT 승계조합원 + 취득원인 증여 + 1세대 판정 대상. 청산금 수령 단독신고는 신축주택을 양도하지 않아 제외한다. */
function isGiftSuccessor(original: Pick<TransferTaxInput, "acquisitionCause" | "redevelopment" | "isOneHousehold">): boolean {
  const redev = original.redevelopment;
  return (
    redev?.subject === "apt" &&
    redev.isSuccessorMember === true &&
    redev.receiveOnlyMode !== true &&
    original.acquisitionCause === "gift" &&
    original.isOneHousehold === true
  );
}

export function redevSuccessorGiftNotices(original: Pick<TransferTaxInput, "acquisitionCause" | "redevelopment" | "isOneHousehold" | "residencePeriodMonths">): string[] {
  if (!isGiftSuccessor(original)) return [];
  const redev = original.redevelopment!;
  const own = resolveSuccessorOwnResidenceMonths({
    newHouseResidenceMonths: redev.newHouseResidenceMonths,
    residencePeriodMonths: original.residencePeriodMonths,
  });
  const prior = redev.priorHouseResidenceMonths;

  if (redev.successorGiftSameHousehold === true && prior !== undefined && prior > 0) {
    const carried = resolveAptResidenceMonths({
      isSuccessorMember: true,
      successorGiftSameHousehold: true,
      priorHouseResidenceMonths: prior,
      newHouseResidenceMonths: redev.newHouseResidenceMonths,
      residencePeriodMonths: original.residencePeriodMonths,
    });
    if (Math.floor(own / 12) < RESIDENCE_YEARS_THRESHOLD && Math.floor(carried / 12) >= RESIDENCE_YEARS_THRESHOLD) {
      return [
        `증여자와 같은 세대로서 종전주택에서 거주한 ${prior}개월을 1세대1주택 비과세 거주요건(영 §154①)에 통산했으나, 증여받은 입주권을 정면으로 다룬 해석례는 ` +
          "확인하지 못했습니다(주택 증여 사안: 서면인터넷방문상담4팀-912) — 확인 필요. " +
          `장기보유특별공제 표2(대상 판정 · 공제율)에는 통산하지 않고 양도자 본인의 신축주택 거주만 반영했습니다(${TRANSFER.LONG_TERM_DEDUCTION_TABLE2_DECREE} — 대법원 2026.1.15. 선고 2025두34935: ` +
          "표2의 거주기간은 양도자가 취득일부터 양도일까지 보유하는 동안 거주한 기간). 사전-2020-법령해석재산-0691은 표2에 통산한다고 답해 해석이 다릅니다.",
      ];
    }
    return [];
  }

  // 통산을 확인하지 않았다(미선언 · 「예」인데 종전주택 거주 미입력) — 통산 없이 계산했다. 본인 거주만으로 2년에 못 미칠 때만 알린다.
  if (redev.successorGiftSameHousehold === false) return [];
  if (Math.floor(own / 12) >= RESIDENCE_YEARS_THRESHOLD) return [];
  return [
    "증여받은 입주권은 증여자와 계속 같은 세대였다면 그 세대가 종전주택에서 거주한 기간을 1세대1주택 비과세 거주요건(영 §154① — 취득 당시 조정대상지역)에 " +
      "통산할 수 있습니다(서면인터넷방문상담4팀-912 · 사전-2020-법령해석재산-0691). 그 사실 또는 종전주택 거주기간이 확인되지 않아 통산하지 않고 계산했습니다 — 확인 필요. " +
      "(장기보유특별공제 표2에는 통산하지 않습니다 — 대법원 2025두34935.)",
  ];
}
