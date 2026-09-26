/**
 * §155의2·§155의3 FLAT → nested **페이로드 빌더 정본** (P5-a에서 분리)
 *
 * ## 왜 leaf로 뺐는가 — 소비자가 **둘**이 됐다
 *
 * P4-2b-0이 이 규칙을 `one-house-exemption-api.ts` 안에 썼을 때 소비자는 판정 메뉴뿐이었다.
 * P5-a가 두 번째 소비자를 만든다 — 계산기(`transfer-tax-api.ts`)가 **넘겨받은 사실**을
 * 같은 모양으로 펴서 보내야 한다(`TransferFormData.importedOneHouseFacts`).
 *
 * 🔴 규칙을 복제하면 두 화면이 **같은 사실에 다른 본문**을 보낸다. 판정 메뉴는 「비과세」인데
 *    계산기는 특례를 못 받아 과세로 나오는 식이다 — D-1 「화면은 나누고 엔진은 하나」가
 *    배관에서 깨지는 자리다. ⇒ 두 어댑터가 **이 함수 하나**를 부른다.
 *
 * 🔑 입력 타입을 `OneHouseJudgmentExtraFields`로 좁혔다(종전엔 폼 전체를 받았다).
 *    빌더가 읽는 것이 그 13필드뿐이므로, 좁혀 두면 계산기 폼도 **운반 상자를 그대로** 넘길 수 있고
 *    「폼 전체를 받는데 일부만 읽는다」는 오해도 사라진다.
 */
import type { OneHouseJudgmentExtraFields } from "@/lib/stores/one-house-extra-fields.types";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import { toDate } from "@/lib/api/date-coerce";

/**
 * §155의2 FLAT → nested. 토글 OFF이거나 계약체결일 미입력이면 **아예 보내지 않는다**
 * (Zod optional 계약 — 형제 빌더 `buildReplacementHousePayload`와 같은 규약).
 */
function buildLongTermMortgagePayload(f: OneHouseJudgmentExtraFields): object {
  if (!f.longTermMortgageSpecial || !f.longTermMortgageContractDate) return {};
  return {
    longTermMortgageHouse: {
      contractDate: f.longTermMortgageContractDate,
      borrowerAgeAtContract: parseInt(f.longTermMortgageBorrowerAge || "0", 10),
      contractYears: parseInt(f.longTermMortgageContractYears || "0", 10),
      maturityLumpSumRepayment: f.longTermMortgageMaturityLumpSum,
      transferredBeforeMaturity: f.longTermMortgageTransferredBeforeMaturity,
      isTransferredHouseMortgaged: f.longTermMortgageIsTransferredHouseMortgaged,
      ...(f.longTermMortgageParentalCareMerge ? { parentalCareMerge: true } : {}),
    },
  };
}

/**
 * §155의3 FLAT → nested.
 *
 * ⚠️ `increaseRatePct`는 **인하(음수)도 유효**하다 — 「5% 이하」 요건이라 인하는 당연히 충족이다.
 *    `parseAmount`류로 음수를 잘라내면 정당한 상생임대인이 탈락한다.
 */
function buildWinWinRentalPayload(f: OneHouseJudgmentExtraFields): object {
  if (!f.winWinRentalSpecial || !f.winWinRentalContractDate) return {};
  return {
    winWinRentalHouse: {
      winWinContractDate: f.winWinRentalContractDate,
      increaseRatePct: parseFloat(f.winWinRentalIncreaseRatePct || "0") || 0,
      priorLeaseMonths: parseInt(f.winWinRentalPriorLeaseMonths || "0", 10),
      winWinLeaseMonths: parseInt(f.winWinRentalLeaseMonths || "0", 10),
    },
  };
}

/**
 * §155의2·§155의3 두 블록을 한 번에 편다.
 *
 * @param extra `undefined`면 `{}` — 「판정 메뉴를 거치지 않았다」는 뜻이고, 그때 계산기는
 *              종전과 **완전히 같은 본문**을 보낸다(회귀 0).
 */
export function buildOneHouseExtraFactsPayload(
  extra: OneHouseJudgmentExtraFields | undefined,
): object {
  if (!extra) return {};
  return { ...buildLongTermMortgagePayload(extra), ...buildWinWinRentalPayload(extra) };
}

/**
 * §155의3 사실을 **엔진 입력 모양**(`TransferTaxInput.winWinRentalHouse`, 계약일 `Date`)으로 편다.
 *
 * 화면 쪽 판정(⑧ `validateRentalHousingException` — OH-42 · Step4 거주요건 안내 — OH-58)이 엔진과
 * **같은 술어** `qualifiesWinWinRental`에 넣기 위한 것이다. 페이로드 규칙은 위 `buildWinWinRentalPayload`
 * 하나를 그대로 쓴다(두 벌 금지) — 날짜만 route와 같은 `toDate`로 바꾼다.
 */
export function toWinWinRentalHouseFact(
  extra: OneHouseJudgmentExtraFields | undefined,
): TransferTaxInput["winWinRentalHouse"] {
  if (!extra) return undefined;
  const w = (buildWinWinRentalPayload(extra) as {
    winWinRentalHouse?: Omit<NonNullable<TransferTaxInput["winWinRentalHouse"]>, "winWinContractDate"> & {
      winWinContractDate: string;
    };
  }).winWinRentalHouse;
  if (!w) return undefined;
  return { ...w, winWinContractDate: toDate(w.winWinContractDate, "winWinContractDate") };
}
