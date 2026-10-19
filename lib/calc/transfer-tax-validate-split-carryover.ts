/**
 * ⑧ 주택 split **파트 이월과세**(소득세법 §97의2①) 검증 — P2 C(통째 이월과세 + 증여자 토지·건물 취득일 상이).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.5·§3.5 · engine.design.md §6 (leaf S0~S9)
 *
 * ## 단일 소스
 * 구조 규칙(함께 양도 자산·1세대1주택 겹침·날짜·건물 경계일 등)은 엔진·⑫가 쓰는 **같은 leaf**(`collectSplitPartCauseIssues`)가 정한다.
 * 이 파일은 그 leaf에 **④가 실제로 보내는 값**을 같은 식으로 넣고(3중 패턴 — `splitCarryoverLeafFacts`), leaf가 못 보는 «화면 입력 칸의 완결»만 화면 위→아래
 * 순서로 요구한다. ⑧ 통과 ⇒ ④가 키를 만든다 ⇒ ⑫ 200 이어야 하고(막다른 길 0), ⑧ 차단 사유의 `field`는 화면에 앵커가 있어야 한다.
 *
 * ## 의도적으로 ⑫보다 엄격한 곳 (⑧ 전용 — 안내가 더 구체적이거나 이미 같은 화면 규칙을 따른다)
 *   · 증여 등기접수일 ≥ 양도일 · 관계 「그 외」 · 사망 선언 + 관계 미선택 · 가업상속 선언 — 자산 전체 이월과세 ⑧(`transfer-tax-validate-carryover-asset.ts`)과 같다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { SplitPartCauseFacts, SplitPartCauseIssue } from "@/lib/tax-engine/transfer-split-part-cause";
import { collectSplitPartCauseIssues } from "@/lib/tax-engine/transfer-split-part-cause";
import { isLandBuildingSplitable } from "./self-owns-scope";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { effectiveCarryoverDonorSplit, normalizeBuildingCauseInputs, splitBuildingAcqPriceInput } from "./transfer-land-part-cause";
import { phdPayloadActive } from "./phd-toggle-scope";
import { fieldError } from "./transfer-tax-validate-field";
import { validateSplitDirectInputs } from "./transfer-tax-validate-split";
import { splitCarryoverEventSource } from "./transfer-tax-api-split-carryover";

/** 호출 맥락 — 폼 전역 사실. 생략 = 그 결합이 아니다(단위 테스트·자산 단독 호출). */
export interface SplitCarryoverCtx {
  /** 함께 양도하는 자산이 있는가(`form.assets.length > 1`) — ④가 `companionAssets`를 만드는 조건과 같다(leaf S2′). */
  hasCompanions?: boolean;
  /** 폼 전역 1세대 여부(④ `isOneHousehold: form.isOneHousehold`) — 보유 상황 단계(UI 인덱스 1)에서만 넘긴다(leaf S9). */
  isOneHousehold?: boolean;
  /** ④ `isUnregistered: form.isUnregistered`. */
  isUnregistered?: boolean;
}

/**
 * C가 ④로 실제 엔진에 보내는 값을 leaf 사실로 옮긴다. ⑫(`refineSplitPartCause`)가 와이어 body에서 읽는 값과 1:1이다:
 *   · 토지·건물 취득일 = 증여 등기접수일(`carryoverAcquisitionDateFallback`) · 원인 `carryover_gift` · 두 서브객체·사건 동봉 · 최상위 `carryoverTaxation` 없음
 *   · 파트 방식 `actual`(정규화 사본) · `expenses` 0(C는 자산 단위 필요경비 총액을 싣지 않는다 — S8) · 환산·PHD·§164 비교 입력 없음(I-4)
 */
export function splitCarryoverLeafFacts(rawAsset: AssetForm, ctx: SplitCarryoverCtx = {}): SplitPartCauseFacts {
  const asset = normalizeBuildingCauseInputs(rawAsset);
  const event = splitCarryoverEventSource(asset);
  const gift = event?.giftRegistryDate || undefined;
  return {
    isSplitable: isLandBuildingSplitable(asset.assetKind),
    hasLandAcquisitionDate: !!gift,
    landAcquisitionCause: "carryover_gift",
    hasLandDecedentAcquisitionDate: false,
    landMode: effectivePartAcqMode(asset.landAcqMode, asset),
    landAcquisitionDate: gift,
    buildingAcquisitionCause: asset.acquisitionCause,
    selfOwns: undefined,
    isBurdenedGift: false,
    hasPreHousingDisclosure: phdPayloadActive(asset),
    hasFamilyBusinessInheritance: false,
    isHousing: asset.assetKind === "housing",
    buildingMode: effectivePartAcqMode(asset.buildingAcqMode, asset),
    buildingAcquisitionDate: gift,
    hasAssetLevelAcquisitionValuation: false,
    hasBuildingAcquisitionPrice: parseAmount(splitBuildingAcqPriceInput(asset) ?? "") > 0,
    hasLandAcquisitionPrice: parseAmount(asset.landAcquisitionPrice ?? "") > 0,
    hasLandCarryover: true,
    hasBuildingCarryover: true,
    hasTopLevelCarryover: false,
    partCarryoverSupported: true,
    hasCompanions: ctx.hasCompanions,
    carryoverGiftDate: gift,
    isOneHousehold: ctx.isOneHousehold,
    isUnregistered: ctx.isUnregistered,
    hasLegacyExpenses: false,
  };
}

/** leaf issue 한 건 → 화면 앵커. C 화면에 없는 API 칸(`acquisitionDate` 등)은 사용자가 고칠 수 있는 입력(증여 등기접수일)으로 모은다. */
function anchorOfLeafIssue(issue: SplitPartCauseIssue): string {
  switch (issue.field) {
    case "isOneHousehold":
      return "isOneHousehold";
    case "landAcquisitionPrice":
    case "buildingAcquisitionPrice":
      return issue.field;
    case "landAcquisitionDate":
    case "acquisitionDate":
    case "buildingSec164Value":
    case "areaScenario":
    case "inheritedAcquisition":
      return "carryover.giftRegistryDate";
    default:
      // 호스트·구조·짝 규칙(함께 양도 자산 · 입력 짝) — 토글이 고치는 칸
      return "carryoverDonorSplit";
  }
}

/** 1세대1주택 비과세 겹침(leaf S9)만 — 보유 상황 단계(UI 인덱스 1)가 부른다. 첫 자산이 C가 아니면 `null`. */
export function splitCarryoverOneHouseIssue(primary: AssetForm | undefined, ctx: SplitCarryoverCtx): string | null {
  if (!primary || !effectiveCarryoverDonorSplit(primary)) return null;
  const issue = collectSplitPartCauseIssues(splitCarryoverLeafFacts(primary, ctx)).find((i) => i.field === "isOneHousehold");
  if (!issue) return null;
  return fieldError(
    "isOneHousehold",
    `${issue.message} — 이 양도가 1세대1주택에 해당하지 않으면 «1세대 해당»을 해제하고, 해당하면 자산의 «증여자가 토지·건물을 다른 날 취득» 선택을 끄세요`,
  );
}

const MSG_TAIL_DONOR = "(소득세법 §97의2①·시행령 §163의2②)";

/**
 * C의 ⑧ — 화면 위→아래 순서. 첫 미완 칸의 앵커로 이동한다.
 *
 * 1) 가업상속 선언 → 2) 증여 등기접수일 → 3) 관계(그 외·사망) → 4) 토지 파트 → 5) 건물 파트 → 6) 증여세 → 7) leaf(구조·함께 양도 자산) → 8) 양도가액 구분·양도시 기준시가·파트 자본적지출(`validateSplitDirectInputs`).
 */
export function validateSplitCarryoverInputs(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  ctx: SplitCarryoverCtx = {},
): string | null {
  const c = splitCarryoverEventSource(asset);
  const land = asset.landCarryover;

  // 1) 가업상속공제 최우선 차단 (§97조의2 ④) — 자산 전체 이월과세와 같은 문구
  if (c?.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
    return `${label}: 가업상속공제 적용 자산은 현재 버전에서 지원하지 않습니다. 세무사에게 수동 계산을 의뢰하세요 (소득세법 §97조의2 ④).`;
  }
  if (!c) return fieldError("carryover.giftRegistryDate", `${label}: 이월과세 증여 정보를 입력하세요.`);

  // 2) 증여 등기접수일 (사건 1벌 — 두 파트의 수증자 취득일)
  if (!c.giftRegistryDate) return fieldError("carryover.giftRegistryDate", `${label}: 증여 등기접수일을 입력하세요.`);
  if (formTransferDate && c.giftRegistryDate >= formTransferDate)
    return fieldError("carryover.giftRegistryDate", `${label}: 증여 등기접수일은 양도일보다 이전이어야 합니다.`);

  // 3) 관계 — §97조의2① 본문은 배우자·직계존비속뿐. 사망 선언이면 관계가 있어야 판정이 갈린다.
  if (c.donorRelation === "other")
    return fieldError("acquisitionCause", `${label}: 이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다 (「소득세법」 제97조의2 제1항). 취득 원인을 "증여"로 변경하세요.`);
  if (c.donorDeceased && !c.donorRelation)
    return fieldError("carryover.donorRelation", `${label}: 증여자와의 관계를 선택하세요 (소득세법 §97조의2 ①).`);

  // 4)·5) 파트 — 증여자 취득일(≤ 증여일: 엔진 F-6) → 취득가액(필수: I-4 파트 환산 없음) → 자본적지출 → 증여 신고가액(= 파트 평가액)
  const parts = [
    {
      name: "토지",
      form: land,
      keyPrefix: "landCarryover",
      valuation: asset.landAcquisitionPrice,
      valuationField: "landAcquisitionPrice" as const,
    },
    {
      name: "건물",
      form: c,
      keyPrefix: "carryover",
      valuation: asset.buildingAcquisitionPrice,
      valuationField: "buildingAcquisitionPrice" as const,
    },
  ];
  for (const p of parts) {
    const f = p.form;
    if (!f?.donorAcquisitionDate)
      return fieldError(`${p.keyPrefix}.donorAcquisitionDate`, `${label}: ${p.name} 증여자 취득일을 입력하세요 ${MSG_TAIL_DONOR}.`);
    if (f.donorAcquisitionDate > c.giftRegistryDate)
      return fieldError(`${p.keyPrefix}.donorAcquisitionDate`, `${label}: ${p.name} 증여자 취득일은 증여 등기접수일보다 늦을 수 없습니다 ${MSG_TAIL_DONOR}.`);
    if (!(parseAmount(f.donorAcquisitionPrice) > 0))
      return fieldError(
        `${p.keyPrefix}.donorAcquisitionPrice`,
        `${label}: ${p.name} 증여자 취득가액을 입력하세요 — 증여자의 취득 당시 금액을 모르면 이 입력은 아직 지원하지 않습니다 ${MSG_TAIL_DONOR}.`,
      );
    if (parseAmount(f.donorCapitalExpenditure) < 0)
      return fieldError(`${p.keyPrefix}.donorCapitalExpenditure`, `${label}: ${p.name} 증여자 자본적지출은 음수일 수 없습니다.`);
    if (!(parseAmount(p.valuation) > 0))
      return fieldError(p.valuationField, `${label}: ${p.name} 증여 신고가액(증여 당시 평가액)을 입력하세요 — 증여세 상당액 안분의 분자이자 이월과세를 적용하지 않을 때의 취득가액입니다 ${MSG_TAIL_DONOR}.`);
  }

  // 6) 증여세 — 산출세액은 0 허용(비어 있으면 0), 과세가액은 안분 분모라 필수, 파트 평가액 합은 과세가액을 넘을 수 없다.
  if (!(parseAmount(c.giftTaxBase) > 0))
    return fieldError("carryover.giftTaxBase", `${label}: 증여세 과세가액을 입력하세요 — 영 §163의2② 안분의 분모입니다 ${MSG_TAIL_DONOR}.`);
  if (parseAmount(c.giftTaxCalculated) < 0)
    return fieldError("carryover.giftTaxCalculated", `${label}: 증여세 산출세액은 음수일 수 없습니다.`);
  if (parseAmount(asset.landAcquisitionPrice) + parseAmount(asset.buildingAcquisitionPrice) > parseAmount(c.giftTaxBase))
    return fieldError("carryover.giftTaxBase", `${label}: 토지·건물 증여 신고가액의 합이 증여세 과세가액을 초과합니다 ${MSG_TAIL_DONOR}.`);

  // 7) leaf — 함께 양도 자산·구조·날짜·건물 경계일 (엔진·⑫와 같은 판정)
  const [issue] = collectSplitPartCauseIssues(splitCarryoverLeafFacts(asset, ctx));
  if (issue) return fieldError(anchorOfLeafIssue(issue) as never, `${label}: ${issue.message}`);

  // 8) 자산 단위 필요경비 총액(이전 입력 형식)은 파트에 안분되지 않는다 — 보이는 칸(자본적지출·양도비가 모두 0일 때만 노출)이면 비우도록 안내한다.
  //    숨은 잔재는 ④가 보내지 않는다(`expenses: 0`).
  if (
    parseAmount(asset.directExpenses ?? "") > 0 &&
    !(parseAmount(asset.capitalExpenditure ?? "") > 0) &&
    !(parseAmount(asset.transferExpense ?? "") > 0)
  )
    return fieldError(
      "directExpenses",
      `${label}: 이전 입력 형식의 «직접 귀속 필요경비»는 토지·건물 파트 이월과세와 함께 쓸 수 없습니다 — 비우고 토지분·건물분 자본적지출 칸에 입력하세요 (총액이 있으면 파트에 다시 나뉘어 증여세 상당액 산입이 반대 파트 경비를 밀어냅니다)`,
    );

  // 9) 양도가액 구분·양도시 기준시가·파트 자본적지출 — 별개취득·소유자 분리와 같은 규칙(축 A)
  return validateSplitDirectInputs(asset, label, formTransferDate);
}
