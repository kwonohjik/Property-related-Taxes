/**
 * ⑥ 판정 메뉴 사이드바 요약 — `one-house-exemption-validate.ts`에서 800줄 정책으로 분리했다(export 보존:
 * validate 파일이 이 함수를 그대로 다시 내보낸다).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import {
  judgmentHouseCountExclusionReductions,
  judgmentReplacementHouseVisible,
  judgmentSpecialHouseExclusions,
} from "./one-house-judgment-section-scope";
import { deriveOneHouseFactsFromHouses } from "./one-house-row-facts";
import { sameDayExcludedRows } from "./same-day-transfer-notice";
import { housesOwnedAtTransfer } from "./household-house-count";
import {
  deriveJudgmentHouseCount,
  deriveJudgmentRightCount,
  judgmentSaleIsHousing,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

/**
 * ⑥ 사이드바 요약 — **순수 함수**(호출부가 `useMemo`로 감싼다).
 *
 * 🔑 세액이 없는 화면이라 금액 합계가 없다. 요약은 「지금까지 입력으로 무엇이 정해졌나」다.
 * 🔑 주택 수는 **명부 파생 단일 소스**를 쓴다 — 여기서 다시 세면 G-1이 화면 안에서 되살아난다
 *    (`feedback_aggregate_display_rederives_engine_value`).
 */
export function computeOneHouseJudgmentSummary(
  form: OneHouseJudgmentFormData,
): Array<{ label: string; value: string | number | null }> {
  const items: Array<{ label: string; value: string | number | null }> = [];

  items.push({ label: "1세대 해당", value: form.isOneHousehold ? "예" : "아니오" });
  /**
   * 양도 대상 종류는 **판정 조문을 가르는 축**이라(§89①3호 / §89①4호) 요약 맨 앞에 둔다.
   * 주택일 때는 종전과 같이 적지 않는다 — 기본값이고, 줄이 늘면 정작 다른 값이 묻힌다.
   */
  if (!judgmentSaleIsHousing(form)) {
    items.push({ label: "양도 대상", value: "조합원입주권" });
  }
  items.push({ label: "세대 보유 주택 수", value: `${deriveJudgmentHouseCount(form)}채` });
  const sameDayOut = sameDayExcludedRows(form.houses, form.transferDate, form.assets?.[0]?.assetKind).length; // 위 주택 수가 명부보다 적은 이유(#40)
  if (sameDayOut > 0) items.push({ label: "같은 날 먼저 양도(§154⑨)로 제외", value: `${sameDayOut}채` });
  if (!judgmentSaleIsHousing(form)) {
    // §89①4호 본문이 「1개」를 요구하는 축 — 양도 대상 포함 수를 그대로 보여준다.
    items.push({ label: "세대 보유 입주권 수", value: `${deriveJudgmentRightCount(form)}개` });
  }

  if (form.presaleRights?.length) {
    items.push({ label: "분양권·입주권", value: `${form.presaleRights.length}건` });
  }
  if (form.transferDate) items.push({ label: "양도 예정일", value: form.transferDate });

  const price = parseAmount(form.contractTotalPrice);
  if (price > 0) items.push({ label: "예상 양도가액", value: price });

  // 적용을 **선언한** 특례 — 성립 여부는 엔진 판정이므로 여기서 말하지 않는다.
  //
  // 🔴 D-2 — `temporaryTwoHouseSpecial`은 없다(§155①이 명부 도출로 바뀐 뒤 이 토글을
  //    true로 쓰는 화면이 전무하다 — `ImportedOneHouseFactsCard.tsx:131`과 같은 사실).
  //    한때 있던 「일시적 2주택」 행은 항상 죽은 조건이라 제거했다.
  //
  // 🔑 §155⑥1호·⑦·⑧ 세 줄은 ④(`buildHouseholdSpecialPayload`)와 **같은 leaf**(`deriveOneHouseFactsFromHouses` —
  //    행 우선, 레거시 폴백, 양도일 현재 보유 행만)로 읽는다(S10-11). 종전에는 화면에서 켤 수 없는 레거시 스칼라만 읽어,
  //    정본인 명부 행 선언은 빠지고(결과 화면에 들어가기 전에는 선언이 어디에도 안 보임) 레거시 선언은 남았다.
  //    레거시 폴백을 지우지 않는다 — 행 표시가 없는 옛 record는 ④가 스칼라를 그대로 쓰므로 사이드바도 같이 말해야 한다.
  const factsLegacy = {
    culturalHeritageHouseSpecial: form.culturalHeritageHouseSpecial,
    ...(form.ruralHouseSpecial && form.ruralHouseKind
      ? {
          ruralHouse: {
            kind: form.ruralHouseKind as "inherited" | "farm_exit" | "return_to_farm",
            isOutsideCapitalEupMyeon: form.ruralHouseOutsideCapitalEupMyeon,
          },
        }
      : {}),
    ...(form.unavoidableOutsideCapitalSpecial
      ? {
          unavoidableOutsideCapitalHouse: {
            reason: form.unavoidableOutsideCapitalReason as "study" | "work" | "illness" | "other",
          },
        }
      : {}),
  };
  const rowFacts = deriveOneHouseFactsFromHouses(
    housesOwnedAtTransfer(form.houses, form.transferDate, form.assets?.[0]?.assetKind),
    factsLegacy,
    form.transferDate,
  );
  const declared = [
    rowFacts.culturalHeritageHouse && "문화유산주택",
    rowFacts.ruralHouse && "농어촌주택",
    rowFacts.unavoidableOutsideCapitalHouse && "수도권 밖 부득이",
    // ⑤(섹션)·④·⑧과 같은 게이트 — 섹션이 숨은 세대 구성의 stale 선언은 적지 않는다(OH-05 형제).
    judgmentReplacementHouseVisible(form) && form.replacementHouseSpecial && "대체주택",
    judgmentSaleIsHousing(form) && form.longTermMortgageSpecial && "장기저당담보주택",
    judgmentSaleIsHousing(form) && form.winWinRentalSpecial && "상생임대주택",
    // OH-18·OH-28 — ④가 실제로 싣는 조건(⑤·⑧과 같은 게이트)일 때만 적는다.
    judgmentSaleIsHousing(form) &&
      form.assets[0]?.acquisitionCause === "inheritance" &&
      form.assets[0]?.decedentSameHouseholdBeforeInheritance &&
      "동일세대 상속 통산",
    judgmentHouseCountExclusionReductions(form).some((r) => r.type !== "unsold_98_9") &&
      "농어촌·고향주택(조특법)",
    judgmentHouseCountExclusionReductions(form).some((r) => r.type === "unsold_98_9") &&
      "준공후미분양주택(조특법)",
    judgmentSpecialHouseExclusions(form).length > 0 && "감면주택(조특법)",
  ].filter(Boolean) as string[];
  if (declared.length > 0) {
    items.push({ label: "선언한 특례", value: declared.join(" · ") });
  }

  return items;
}
