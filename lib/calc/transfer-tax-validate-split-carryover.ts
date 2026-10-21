/**
 * ⑧ 주택 split **파트 이월과세**(소득세법 §97의2①) 검증 — P2 C(통째 이월과세 + 증여자 토지·건물 취득일 상이) · P3 A(토지만 이월과세 + 건물 매매·신축) ·
 * P4 B(건물만 이월과세 + 토지 매매).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.5·§3.5·§4.4·§5.4 · engine.design.md §6 (leaf S0~S9)
 *
 * ## 호출 구조 (순환 import 방지)
 * 이 파일은 `transfer-tax-validate-split.ts`를 import하지 않는다 — 그 파일의 `validateLandPartCause`가 A를 이 파일로 위임한다.
 * 파트 입력 뒤의 양도가액 구분·양도시 기준시가·파트 자본적지출(`validateSplitDirectInputs`)은 호출부가 잇는다:
 *   · C — `transfer-tax-validate-carryover-asset.ts`(이월과세 호스트) · A·B — `validateSplitDirectInputs` 자신(원인 검증 다음 단계 — B는 이월과세 호스트가 그 함수로 보낸다).
 *
 * ## 단일 소스
 * 구조 규칙(함께 양도 자산·1세대1주택 겹침·날짜·건물 경계일 등)은 엔진·⑫가 쓰는 **같은 leaf**(`collectSplitPartCauseIssues`)가 정한다.
 * 이 파일은 그 leaf에 **④가 실제로 보내는 값**을 같은 식으로 넣고(3중 패턴 — `splitCarryoverLeafFacts`), leaf가 못 보는 «화면 입력 칸의 완결»만 화면 위→아래
 * 순서로 요구한다. ⑧ 통과 ⇒ ④가 키를 만든다 ⇒ ⑫ 200 이어야 하고(막다른 길 0), ⑧ 차단 사유의 `field`는 화면에 앵커가 있어야 한다.
 *
 * ## 의도적으로 ⑫보다 엄격한 곳 (⑧ 전용 — 안내가 더 구체적이거나 이미 같은 화면 규칙을 따른다)
 *   · 증여 등기접수일 ≥ 양도일 · 관계 「그 외」 · 사망 선언 + 관계 미선택 · 가업상속 선언 — 자산 전체 이월과세 ⑧(`transfer-tax-validate-carryover-asset.ts`)과 같다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { SplitPartCauseFacts, SplitPartCauseIssue } from "@/lib/tax-engine/transfer-split-part-cause";
import { collectSplitPartCauseIssues } from "@/lib/tax-engine/transfer-split-part-cause";
import { effectiveSelfOwns, isLandBuildingSplitable } from "./self-owns-scope";
import { effectivePartAcqMode } from "./transfer-tax-split-acq-mode";
import { effectiveCarryoverDonorSplit, normalizeBuildingCauseInputs, splitBuildingAcqPriceInput } from "./transfer-land-part-cause";
import { effectiveLandCarryover } from "./transfer-land-part-cause";
import { effectiveBuildingCarryoverMix } from "./transfer-land-part-cause";
import { BUILDING_CARRYOVER_PRE_DISCLOSURE_MESSAGE, buildingCarryoverPreDisclosure } from "./transfer-land-part-cause";
import { LAND_CAUSE_SAME_DAY_MESSAGE, landPartCauseSameDay } from "./transfer-land-part-cause";
import { PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { phdPayloadActive } from "./phd-toggle-scope";
import { fieldError } from "./transfer-tax-validate-field";
import { splitCarryoverEventSource } from "./transfer-tax-api-split-carryover";

/** 호출 맥락 — 폼 전역 사실. 생략 = 그 결합이 아니다(단위 테스트·자산 단독 호출). */
export interface SplitCarryoverCtx {
  /** 함께 양도하는 자산이 있는가(`form.assets.length > 1`) — ④가 `companionAssets`를 만드는 조건과 같다(leaf S2′). */
  hasCompanions?: boolean;
  /** 폼 전역 1세대 여부(④ `isOneHousehold: form.isOneHousehold`) — 보유 상황 단계(UI 인덱스 1)에서만 넘긴다(leaf S9). */
  isOneHousehold?: boolean;
  /** ④ `isUnregistered: form.isUnregistered`. */
  isUnregistered?: boolean;
  /** 함께 양도하는 두 번째 이후 자산(A·B만 — C는 술어가 이미 거짓). ④는 키를 싣지 않고 ⑧이 leaf S0로 막는다. */
  isNonPrimary?: boolean;
}

type Kind = "C" | "A" | "B";

/** 이 자산의 파트 이월과세 유형 — C(통째 이월과세 + 증여자 토지·건물 취득일 상이)·A(토지만)·B(건물만), 아니면 `null`. */
function splitCarryoverKind(asset: AssetForm): Kind | null {
  if (effectiveCarryoverDonorSplit(asset)) return "C";
  if (effectiveLandCarryover(asset)) return "A";
  return effectiveBuildingCarryoverMix(asset) ? "B" : null;
}

/**
 * 파트 이월과세가 ④로 실제 엔진에 보내는 값을 leaf 사실로 옮긴다. ⑫(`refineSplitPartCause`)가 와이어 body에서 읽는 값과 1:1이다.
 *   · C — 토지·건물 취득일 = 증여 등기접수일(`carryoverAcquisitionDateFallback`) · 원인 `carryover_gift` · 두 서브객체·사건 동봉 · 최상위 `carryoverTaxation` 없음
 *   · A — 토지 취득일 = 증여 등기접수일(정규화 사본) · 건물은 매매·신축 그대로(취득일·소유 축·부담부증여는 ④가 싣는 값) · 토지 서브객체·사건만
 *   · B — 토지 overlay `purchase`·토지 취득일 = 토지 칸 그대로 · 건물 취득일 = 증여 등기접수일(정규화 사본) · 건물 서브객체·사건만
 *   · 공통: 파트 방식 `actual`(정규화 사본) · `expenses` 0(자산 단위 필요경비 총액을 싣지 않는다 — S8) · 환산·PHD·§164 비교 입력 없음(I-4)
 */
export function splitCarryoverLeafFacts(rawAsset: AssetForm, ctx: SplitCarryoverCtx = {}): SplitPartCauseFacts {
  const asset = normalizeBuildingCauseInputs(rawAsset);
  const isC = effectiveCarryoverDonorSplit(asset);
  const isB = !isC && effectiveBuildingCarryoverMix(asset);
  const event = splitCarryoverEventSource(asset);
  const gift = event?.giftRegistryDate || undefined;
  const landDate = isB ? asset.landAcquisitionDate || undefined : gift;
  // A는 소유 축·부담부증여를 술어가 거르지 않는다 — ④가 싣는 값 그대로 leaf(S4)에 넣는다(C는 술어가 이미 둘을 «아님»으로 거른다).
  const selfOwnsEff = effectiveSelfOwns(asset) ?? "both";
  return {
    isSplitable: isLandBuildingSplitable(asset.assetKind),
    hasLandAcquisitionDate: !!landDate,
    landAcquisitionCause: isB ? "purchase" : "carryover_gift",
    hasLandDecedentAcquisitionDate: false,
    landMode: effectivePartAcqMode(asset.landAcqMode, asset),
    landAcquisitionDate: landDate,
    buildingAcquisitionCause: asset.acquisitionCause,
    selfOwns: isC || selfOwnsEff === "both" ? undefined : selfOwnsEff,
    isBurdenedGift: !isC && asset.transferType === "burdened_gift",
    hasPreHousingDisclosure: phdPayloadActive(asset),
    hasFamilyBusinessInheritance: false,
    isHousing: asset.assetKind === "housing",
    buildingMode: effectivePartAcqMode(asset.buildingAcqMode, asset),
    buildingAcquisitionDate: isC || isB ? gift : asset.acquisitionDate || undefined,
    hasAssetLevelAcquisitionValuation: false,
    hasBuildingAcquisitionPrice: parseAmount(splitBuildingAcqPriceInput(asset) ?? "") > 0,
    hasLandAcquisitionPrice: parseAmount(asset.landAcquisitionPrice ?? "") > 0,
    hasLandCarryover: !isB,
    hasBuildingCarryover: isC || isB,
    hasTopLevelCarryover: false,
    partCarryoverSupported: !ctx.isNonPrimary,
    hasCompanions: ctx.hasCompanions,
    carryoverGiftDate: gift,
    isOneHousehold: ctx.isOneHousehold,
    isUnregistered: ctx.isUnregistered,
    hasLegacyExpenses: false,
  };
}

/**
 * leaf issue 한 건 → 화면 앵커. 화면에 없는 API 칸은 사용자가 고칠 수 있는 입력으로 모은다.
 *   · C — 두 취득일은 증여 등기접수일 한 곳 · 구조·짝 규칙은 C 토글
 *   · A — 토지 취득일은 등기접수일, 건물 취득일은 화면 칸 그대로 · 구조·짝 규칙은 토지 취득 원인
 *   · B — 토지 취득일은 화면 칸 그대로, 건물 취득일은 등기접수일 · 구조·짝 규칙은 «토지는 다른 원인으로 취득» 토글(같은 `data-field`)
 */
function anchorOfLeafIssue(issue: SplitPartCauseIssue, kind: Kind): string {
  const event = kind === "A" ? "landCarryover" : "carryover";
  switch (issue.field) {
    case "isOneHousehold":
      return "isOneHousehold";
    case "landAcquisitionPrice":
    case "buildingAcquisitionPrice":
      return issue.field;
    case "acquisitionDate":
      return kind === "A" ? "acquisitionDate" : `${event}.giftRegistryDate`;
    case "landAcquisitionDate":
      return kind === "B" ? "landAcquisitionDate" : `${event}.giftRegistryDate`;
    case "buildingSec164Value":
    case "areaScenario":
    case "inheritedAcquisition":
      return `${event}.giftRegistryDate`;
    case "landAcqMode":
      // B의 토지 방식은 사용자 선택(매매 4방식)이다 — 이 칸이 아니라 leaf가 정한 실가 고정 위반은 A·C에서만 난다.
      return kind === "B" ? "landAcqMode" : "landAcquisitionCause";
    default:
      // 호스트·구조·짝 규칙(함께 양도 자산 · 입력 짝 · 소유자 분리 · 부담부증여) — C 토글 / 토지 취득 원인 라디오가 고치는 칸
      return kind === "C" ? "carryoverDonorSplit" : "landAcquisitionCause";
  }
}

/** 1세대1주택 비과세 겹침(leaf S9)만 — 보유 상황 단계(UI 인덱스 1)가 부른다. 첫 자산이 파트 이월과세(C·A)가 아니면 `null`. */
export function splitCarryoverOneHouseIssue(primary: AssetForm | undefined, ctx: SplitCarryoverCtx): string | null {
  const kind = primary ? splitCarryoverKind(primary) : null;
  if (!primary || !kind) return null;
  const issue = collectSplitPartCauseIssues(splitCarryoverLeafFacts(primary, ctx)).find((i) => i.field === "isOneHousehold");
  if (!issue) return null;
  const off =
    kind === "C"
      ? "자산의 «증여자가 토지·건물을 다른 날 취득» 선택을 끄세요"
      : kind === "A"
        ? "자산의 토지 취득 원인을 «이월과세(증여)»가 아닌 것으로 바꾸세요"
        : "자산의 «토지는 다른 원인으로 취득»을 끄세요";
  return fieldError("isOneHousehold", `${issue.message} — 이 양도가 1세대1주택에 해당하지 않으면 «1세대 해당»을 해제하고, 해당하면 ${off}`);
}

const MSG_TAIL_DONOR = "(소득세법 §97의2①·시행령 §163의2②)";

/**
 * 파트 이월과세(C·A·B)의 ⑧ — 화면 위→아래 순서. 첫 미완 칸의 앵커로 이동한다. 파트 이월과세가 아니면 `null`.
 *
 * 1) (A·B: 함께 양도 자산 — leaf S0) → 가업상속 선언 → 2) 증여 등기접수일(B: 고시 전 증여 차단) → 3) 관계(그 외·사망) → 4) 토지 파트(C·A) → 5) 건물 파트(C·B) → 6) 증여세
 * → 7) leaf(구조·함께 양도 자산) → (A: 같은 날) → 8) 이전 입력 형식 필요경비. 그 뒤 양도가액 구분·양도시 기준시가·파트 자본적지출은 호출부가 잇는다(파일 머리 주석).
 */
export function validateSplitCarryoverParts(
  rawAsset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  ctx: SplitCarryoverCtx = {},
): string | null {
  const kind = splitCarryoverKind(rawAsset);
  if (!kind) return null;
  // A의 토지 취득일·B의 건물 취득일은 등기접수일이다 — ④와 같은 정규화 사본으로 읽는다.
  const asset = kind === "C" ? rawAsset : normalizeBuildingCauseInputs(rawAsset);
  const c = splitCarryoverEventSource(asset);
  const land = asset.landCarryover;
  // 사건 키(C·B `carryover.*` · A `landCarryover.*`)는 리터럴 삼항으로 — 정적 앵커 게이트(`transfer-validation-field-anchor-coverage`)가 읽는다
  const hostEvent = kind !== "A";

  // 0) A·B — 함께 양도하는 두 번째 이후 자산에서는 계산하지 않는다(엔진 S0). 입력을 다 채운 뒤에 알게 하지 않는다.
  if (kind === "A" && ctx.isNonPrimary)
    return fieldError("landAcquisitionCause", `${label}: ${PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE} — 토지 취득 원인을 «상속»·«증여»로 바꾸거나 이 자산을 첫 번째 자산으로 입력하세요`);
  if (kind === "B" && ctx.isNonPrimary)
    return fieldError("landAcquisitionCause", `${label}: ${PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE} — «토지는 다른 원인으로 취득»을 끄거나 이 자산을 첫 번째 자산으로 입력하세요`);

  // 1) 가업상속공제 최우선 차단 (§97조의2 ④) — 자산 전체 이월과세와 같은 문구
  if (c?.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
    return `${label}: 가업상속공제 적용 자산은 현재 버전에서 지원하지 않습니다. 세무사에게 수동 계산을 의뢰하세요 (소득세법 §97조의2 ④).`;
  }
  if (!c) return fieldError(hostEvent ? "carryover.giftRegistryDate" : "landCarryover.giftRegistryDate", `${label}: 이월과세 증여 정보를 입력하세요.`);

  // 2) 증여 등기접수일 (사건 1벌 — 이월과세 파트의 수증자 취득일)
  if (!c.giftRegistryDate) return fieldError(hostEvent ? "carryover.giftRegistryDate" : "landCarryover.giftRegistryDate", `${label}: 증여 등기접수일을 입력하세요.`);
  if (formTransferDate && c.giftRegistryDate >= formTransferDate)
    return fieldError(hostEvent ? "carryover.giftRegistryDate" : "landCarryover.giftRegistryDate", `${label}: 증여 등기접수일은 양도일보다 이전이어야 합니다.`);
  // B — 영 §163⑨ 단서 2호 구간(2005.4.30. 전 증여) 건물은 비교 입력이 없다(C U-11과 같은 차단 · ⑤ 안내와 같은 술어).
  if (kind === "B" && buildingCarryoverPreDisclosure(asset))
    return fieldError("carryover.giftRegistryDate", `${label}: ${BUILDING_CARRYOVER_PRE_DISCLOSURE_MESSAGE}`);

  // 3) 관계 — §97조의2① 본문은 배우자·직계존비속뿐. 사망 선언이면 관계가 있어야 판정이 갈린다.
  if (c.donorRelation === "other")
    return kind !== "A"
      ? fieldError("acquisitionCause", `${label}: 이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다 (「소득세법」 제97조의2 제1항). 취득 원인을 "증여"로 변경하세요.`)
      : fieldError("landAcquisitionCause", `${label}: 이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다 (「소득세법」 제97조의2 제1항). 토지 취득 원인을 "증여"로 변경하세요.`);
  if (c.donorDeceased && !c.donorRelation)
    return fieldError(hostEvent ? "carryover.donorRelation" : "landCarryover.donorRelation", `${label}: 증여자와의 관계를 선택하세요 (소득세법 §97조의2 ①).`);

  // 4)·5) 파트 — 증여자 취득일(≤ 증여일: 엔진 F-6) → 취득가액(필수: I-4 파트 환산 없음) → 자본적지출 → 증여 신고가액(= 파트 평가액)
  //    A의 토지·B의 건물 증여 신고가액은 이 카드가 아니라 매매 블록의 파트 가액 칸(`landAcquisitionPrice`·`buildingAcquisitionPrice`)이 받는다 — 같은 앵커다.
  const parts = [
    ...(kind !== "B"
      ? [
          {
            name: "토지",
            form: land,
            keyPrefix: "landCarryover",
            valuation: asset.landAcquisitionPrice,
            valuationField: "landAcquisitionPrice" as const,
          },
        ]
      : []),
    ...(kind !== "A"
      ? [
          {
            name: "건물",
            form: c,
            keyPrefix: "carryover",
            valuation: asset.buildingAcquisitionPrice,
            valuationField: "buildingAcquisitionPrice" as const,
          },
        ]
      : []),
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
    return fieldError(hostEvent ? "carryover.giftTaxBase" : "landCarryover.giftTaxBase", `${label}: 증여세 과세가액을 입력하세요 — 영 §163의2② 안분의 분모입니다 ${MSG_TAIL_DONOR}.`);
  if (parseAmount(c.giftTaxCalculated) < 0)
    return fieldError(hostEvent ? "carryover.giftTaxCalculated" : "landCarryover.giftTaxCalculated", `${label}: 증여세 산출세액은 음수일 수 없습니다.`);
  // 이월과세 파트 평가액의 합 ≤ 과세가액(⑫ refine 거울) — A는 토지·B는 건물 한 파트(나머지 파트는 매매·신축이라 증여 재산이 아니다).
  const valuationSum = (kind !== "B" ? parseAmount(asset.landAcquisitionPrice) : 0) + (kind !== "A" ? parseAmount(asset.buildingAcquisitionPrice) : 0);
  if (valuationSum > parseAmount(c.giftTaxBase))
    return fieldError(
      hostEvent ? "carryover.giftTaxBase" : "landCarryover.giftTaxBase",
      `${label}: ${kind === "C" ? "토지·건물 증여 신고가액의 합이" : kind === "A" ? "토지 증여 신고가액이" : "건물 증여 신고가액이"} 증여세 과세가액을 초과합니다 ${MSG_TAIL_DONOR}.`,
    );

  // 7) leaf — 함께 양도 자산·구조·날짜·건물 경계일 (엔진·⑫와 같은 판정)
  const [issue] = collectSplitPartCauseIssues(splitCarryoverLeafFacts(asset, ctx));
  if (issue) return fieldError(anchorOfLeafIssue(issue, kind) as never, `${label}: ${issue.message}`);
  // A·B — 토지·건물 취득일이 같으면 «별개 취득»이 꺼져 파트 완결 규칙이 서지 않는다. D1·D2와 같은 ⑤·⑧ 정책(Q-4 — ⑫는 막지 않는다).
  //   A는 토지 날짜가 등기접수일이라 그 칸으로, B는 건물 날짜가 등기접수일이라 토지 취득일 칸으로 보낸다.
  if (kind === "A" && landPartCauseSameDay(asset)) return fieldError("landCarryover.giftRegistryDate", `${label}: ${LAND_CAUSE_SAME_DAY_MESSAGE}`);
  if (kind === "B" && landPartCauseSameDay(asset)) return fieldError("landAcquisitionDate", `${label}: ${LAND_CAUSE_SAME_DAY_MESSAGE}`);

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
  return null;
}
