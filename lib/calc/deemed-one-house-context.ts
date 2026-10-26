/**
 * §154① 단서 게이트의 「§155 의제 2주택 이상」 맥락 — 사용자가 그 특례 사실을 **입력했는가** (V-F4 · Q-M1 (a), 2026-10-26).
 *
 * §155④⑤(합가)는 「이를 1세대1주택으로 보아 제154조제1항을 적용한다」, ⑥⑦⑧은 「국내에 1개의 주택을 소유하고 있는 것으로 보아
 * 제154조제1항을 적용한다」 — 이미 단서를 받는 §155②와 같은 구조다. 엔진은 이 경로들에서 정본 `meetsOneHouseHoldingResidence`로
 * 단서를 읽는데, 게이트가 `null`로 떨어뜨려 화면·④·⑧이 사유를 버렸다(계산기 과세 163,966,000 vs 엔진 비과세 0 — 계획서 §1).
 *
 * 🔑 성립(합가 10년·각 항 요건)은 보지 않는다 — 엔진이 판정한다. 게이트가 성립을 다시 판정하면 엔진과 두 벌이 된다.
 * 🔑 §155⑳ 거주주택 특례는 여기 넣지 않는다 — 받는 사유가 다르다(1호·2호가목·3호 — 보유 2년만 면제). 별도 leaf
 *    `rentalResidenceContextDeclared`(아래)가 `rental_residence` 맥락을 연다(계획서 `rental-residence-holding-proviso.plan.md` D-6).
 *
 * 양도세 계산기 ④(단건·다건)·⑤ Step4·⑧·거주 안내와 1주택 판정 메뉴(`judgmentProvisoMode`)가 이 leaf 하나를 쓴다.
 * 증여세 부담부증여 경로는 명부가 없어 합가일만 본다(`giftBurdenedProvisoMode`).
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { housesOwnedAtTransfer } from "./household-house-count";
import { findRuralHouseRow, findUnavoidableOutsideCapitalRow, hasCulturalHeritageRow } from "./one-house-row-facts";

type DeemedContextForm = Pick<
  TransferFormData,
  | "marriageDate"
  | "parentalCareMergeDate"
  | "houses"
  | "transferDate"
  | "assets"
  | "culturalHeritageHouseSpecial"
  | "ruralHouseSpecial"
  | "unavoidableOutsideCapitalSpecial"
>;

export function deemedOneHouseContextDeclared(form: DeemedContextForm): boolean {
  if (form.marriageDate || form.parentalCareMergeDate) return true;
  // 행 표시가 없는 옛 record의 세대 단위 스칼라(레거시 폴백 — ④ `transfer-tax-api-body-blocks.ts`와 같은 축)
  if (form.culturalHeritageHouseSpecial || form.ruralHouseSpecial || form.unavoidableOutsideCapitalSpecial) return true;
  const owned = housesOwnedAtTransfer(form.houses, form.transferDate, form.assets?.[0]?.assetKind);
  return hasCulturalHeritageRow(owned) || !!findRuralHouseRow(owned) || !!findUnavoidableOutsideCapitalRow(owned);
}

/**
 * §154① 단서 게이트의 「§155⑳ 거주주택」 맥락 — 첫 자산에 장기임대주택 보유자 거주주택 특례를 **선언했는가**(D-6).
 * 성립(호별·거주 요건)은 엔진이 본다. §154⑩ 단독 경로(B · 임대주택 0호)는 별도 제도라 열지 않는다 — 엔진 leaf
 * `rentalResidenceDecisiveProviso`와 같은 범위.
 */
export function rentalResidenceContextDeclared(rh: AssetForm["rentalHousingException"] | undefined): boolean {
  return rh?.applyException === true && !(rh.scenario === "B" && (rh.rentalUnits?.length ?? 0) === 0);
}
