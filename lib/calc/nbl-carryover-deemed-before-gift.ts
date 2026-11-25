/**
 * 이월과세 토지 × 양도일 의제 — 의제일이 증여 등기접수일 이전인 경우의 「확인 필요」 고지 (단일 소스 · 사용자 결정 2026-11-25 Low-1).
 *
 * 이월과세(`carryover_gift`) 토지는 A(이월과세 적용 — 증여자 취득일부터 소유기간)와 B(배제 — 증여 등기접수일부터)를 둘 다 판정한다
 * (판정 메뉴 `judgmentIfCarryoverExcluded` · 계산기 시나리오 B `buildNblEngineInputGiftBasis`). 양도일 의제일(소득세법 시행령
 * §168의14② — 최초 경매기일·최초 공매일 등)이 증여 등기접수일과 같거나 빠르면 B의 소유기간은 0일이 되어 비사업용으로 판정된다
 * (`deemed-transfer-date-range.ts`). A 기준으로는 정상 입력이라 ⑧·⑫로 막지 않는다 — 막으면 A 판정까지 막힌다.
 * 의제일이 수증 이전인 경우를 정한 법령 규정이 없으므로 판정값은 바꾸지 않고 고지만 한다(사용자 결정: 「확인 필요 고지」).
 *
 * 판정 메뉴 결과(B 카드)·단건 계산기·다건/일괄 계산기 결과가 이 함수 하나를 부른다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { deemedTransferDateIssue } from "@/lib/tax-engine/non-business-land/deemed-transfer-date-range";
import { deemedTransferDateIssueMessage } from "@/lib/tax-engine/non-business-land/deemed-transfer-date-range";
import { consumesPeriodJudgmentDate } from "@/lib/tax-engine/non-business-land/land-category";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

type CarryoverDeemedAsset = Pick<AssetForm, "acquisitionCause" | "nblLandType" | "nblDeemedTransferReason" | "nblDeemedTransferDate" | "carryover">;

/**
 * 고지 + 그 고지와 겹치는 엔진 주의사항 한 줄.
 * `duplicateWarning`은 B 입력(취득일 = 증여 등기접수일)에서 엔진이 내는 문구와 **같은 함수**(`deemedTransferDateIssueMessage`)로 만든다 —
 * 엔진 `engine.ts`의 의제일 범위 경고와 글자까지 같아야 화면이 정확히 그 한 줄만 뺀다(그 밖의 주의사항은 그대로).
 */
export interface NblCarryoverDeemedBeforeGift {
  note: string;
  duplicateWarning: string;
}

/** 해당하면 고지·중복 경고, 아니면 undefined. 날짜가 비었거나 형식이 깨졌으면 다른 검증이 맡는다(undefined). */
export function nblCarryoverDeemedBeforeGift(asset: CarryoverDeemedAsset | undefined): NblCarryoverDeemedBeforeGift | undefined {
  if (!asset || asset.acquisitionCause !== "carryover_gift") return undefined;
  if (!consumesPeriodJudgmentDate(asset.nblLandType)) return undefined;
  if (!asset.nblDeemedTransferReason || asset.nblDeemedTransferReason === "none") return undefined;
  const deemed = asset.nblDeemedTransferDate ?? "";
  const gift = asset.carryover?.giftRegistryDate ?? "";
  if (!YMD.test(deemed) || !YMD.test(gift)) return undefined;
  if (deemedTransferDateIssue(deemed, gift, undefined) !== "not_after_acquisition") return undefined;
  const note =
    `양도일 의제일(${deemed})이 증여 등기접수일(${gift})과 같거나 빠릅니다. 이월과세를 적용하지 않는 경우(증여 등기접수일부터 소유기간 계산)에는 ` +
    `소유기간이 0일로 계산되어 비사업용 토지로 판정되며, 이 판정은 이월과세 적용 여부를 가르는 세액 비교(소득세법 §97의2②3호)에도 쓰입니다. ` +
    `의제일이 증여받기 전인 경우를 정한 법령 규정이 없어 확인이 필요합니다(소득세법 시행령 §168의14②).`;
  return { note, duplicateWarning: deemedTransferDateIssueMessage("not_after_acquisition", deemed, gift, "") };
}

/** 고지 문구만 — 판정 메뉴·계산기가 고지 카드에 쓴다. */
export function nblCarryoverDeemedBeforeGiftNote(asset: CarryoverDeemedAsset | undefined): string | undefined {
  return nblCarryoverDeemedBeforeGift(asset)?.note;
}

/**
 * 고지가 붙는 판정 카드에서 같은 사실을 말하는 엔진 주의사항 한 줄만 뺀다(사용자 요청 2026-11-25 「중복 정리」). 판정값은 그대로다.
 * 해당 없으면 같은 객체를 돌려준다.
 */
export function withoutCarryoverDeemedDuplicate<J extends { warnings: string[] }>(judgment: J, d: NblCarryoverDeemedBeforeGift | undefined): J {
  if (!d || !judgment.warnings.includes(d.duplicateWarning)) return judgment;
  return { ...judgment, warnings: judgment.warnings.filter((w) => w !== d.duplicateWarning) };
}
