/**
 * 상속 취득가액 의제(소령 §163⑨ 본문·1호·2호 / §176조의2) + 상속 주택 환산(3-시점) 페이로드 빌더.
 *
 * transfer-tax-api.ts 800줄 정책 준수를 위해 분리 (2026-05-12).
 * acquisitionCause === "inheritance" + 자동(보충적평가) 모드에서만 호출.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { applyRatio, deriveEngineInheritanceAssetKind } from "./transfer-tax-api-helpers";
import { deriveSec163_9BaseDate, isSec163_9Cause } from "./transfer-163-9-base-date";
import {
  sec164HouseStatus,
  sec164CommercialStatus,
  sec164LandStatus,
  isFullyFilled,
} from "./sec164-required-fields";

/**
 * 상속·**증여** 취득가액 의제 페이로드 빌드 (소령 §163⑨).
 * - case A (취득일 < 1985-01-01): pre-deemed — 가목 max(① 상증법 평가액, ② §164④~⑦) 우선,
 *   ③ 환산은 가목 확인 불가 시에만(법 §97①1호 단서). ※ 물가상승률(§176조의2④2호)은 무상취득에 부적용
 * - case B (취득일 ≥ 1985-01-01): post-deemed — max(① 신고가액, ② §164④~⑦)
 * 트리거 조건 미충족 또는 필수 필드 부재 시 빈 객체 반환 (spread-safe).
 *
 * ⭐ **증여도 대상이다** — §163⑨ 본문·1호·2호·§176조의2④가 전부 「**상속 또는 증여**」다.
 *    본문: "상속 또는 증여받은 자산 … **상속개시일 또는 증여일** 현재 … 실지거래가액으로 본다"
 *    ⚠️ 본문 괄호는 **상증법 §34~§42의3 증여의제를 제외**한다 — 현행 취득원인 선택지에
 *       증여의제 항목이 없어(매매/상속/증여/이월과세/신축) `gift`는 순수 수증뿐이라 정합하다.
 *    ⚠️ 이월과세(`carryover_gift`)는 §97의2 승계 경로라 **대상이 아니다**.
 *    ① 소스가 다르다 — 상속은 `publishedValueAtInheritance`, 증여는 `fixedAcquisitionPrice`
 *       (UI 「증여 신고가액」). 계획서: docs/02-design/features/gift-163-9-clause-1-2-max.plan.md
 */
export function buildInheritedAcquisitionPayload(
  primary: AssetForm,
  primaryRatio: number,
  primaryFractional: boolean,
): { inheritedAcquisition?: unknown } {
  const isGift = primary.acquisitionCause === "gift";
  const triggerable =
    isSec163_9Cause(primary.acquisitionCause) &&
    (primary.inheritanceAssetKind === "land" ||
      primary.inheritanceAssetKind === "house_individual" ||
      primary.inheritanceAssetKind === "house_apart");
  if (!triggerable) return {};

  /** 기준일 = 「상속개시일 또는 증여일 현재」(§163⑨ 본문). UI 노출 게이트와 **같은 파생**. */
  const inheritanceStartDate = deriveSec163_9BaseDate(primary);
  if (!inheritanceStartDate) return {};
  const isPreDeemed = inheritanceStartDate < "1985-01-01";

  /** ① 상증법 §60~66 평가액 — 상속은 공시가격 필드, 증여는 「증여 신고가액」 */
  const reportedSource = isGift
    ? primary.fixedAcquisitionPrice
    : primary.publishedValueAtInheritance;

  if (isPreDeemed) {
    const stdAtDeemed = parseAmount(primary.standardPriceAtAcq);
    const stdAtTransfer = parseAmount(primary.standardPriceAtTransfer);
    // ① 상증법 §60~66 평가액 — 지분 모드 시 × ratio (post-deemed와 일관)
    const reportedRaw = parseAmount(reportedSource);
    const reportedValue =
      reportedRaw > 0
        ? primaryFractional
          ? applyRatio(reportedRaw, primaryRatio)
          : reportedRaw
        : undefined;

    return {
      inheritedAcquisition: {
        mode: "pre-deemed" as const,
        inheritanceStartDate,
        assetKind: deriveEngineInheritanceAssetKind(primary),
        ...(reportedValue && { reportedValue }),
        ...(stdAtDeemed > 0 && { standardPriceAtDeemedDate: stdAtDeemed }),
        ...(stdAtTransfer > 0 && { standardPriceAtTransfer: stdAtTransfer }),
      },
    };
  }

  // case B post-deemed — ① 신고가액(상속=공시가격 / 증여=증여 신고가액)
  const reportedRaw = parseAmount(reportedSource);
  /**
   * A03(2026-09-02): 종전에는 ①이 비면 payload를 **통째로 버렸다**. 그러면 ②(§164④~⑦)를
   * 다 채워도 `runInheritedAcquisitionStep`이 `!rawInput.inheritedAcquisition`에서 먼저
   * 반환해 **비교 자체가 일어나지 않는다** — 취득가액이 0이 되어 양도가 전액이 차익이 됐다
   * (실측 상가 최대 124,740,000원 과대 · 주택 68,992,000원 · 토지는 양방향).
   *
   * 「소득세법 시행령」 §163⑨ 1호·2호는 「평가한 가액**과** §164④(⑤~⑦)의 가액 **중 많은 금액**」
   * 이라 ②만 있어도 비교 대상이다. 엔진도 `reportedValue: 0`에서 `max(0, ②) = ②`를 채택한다.
   *
   * ⑧도 이 조합을 **의도적으로 통과**시킨다(`transfer-tax-validate-clause-a.ts:116` ·
   * `transfer-tax-validate-commercial-asset.ts:53` 「①만 요구하면 ②를 다 채운 사용자가 막힌다」).
   * ⇒ 같은 술어(`isFullyFilled` + `sec164*Status`)를 ④도 쓰게 해 validate↔API를 묶는다.
   *
   * ⚠️ **상속 전용이다.** 증여도 같은 줄을 타지만 ⑧이 step 0에서 「증여 신고가액을 입력하세요」로
   *    차단하므로(실측), 게이트를 증여까지 넓히면 불필요한 회귀가 난다.
   */
  const sec164Ready =
    isFullyFilled(sec164HouseStatus(primary)) ||
    isFullyFilled(sec164CommercialStatus(primary)) ||
    isFullyFilled(sec164LandStatus(primary));
  const isInheritanceCause = primary.acquisitionCause === "inheritance";
  if (reportedRaw <= 0 && !(isInheritanceCause && sec164Ready)) return {};
  // 지분 모드: 100% 기준 입력값에 × ratio 적용 (primaryInheritanceValuation과 일관)
  // 미적용 시 100% 송신으로 엔진에서 안분 잔여가 필요경비로 잘못 적재됨 (사례 27)
  const reportedValue = primaryFractional
    ? applyRatio(reportedRaw, primaryRatio)
    : reportedRaw;
  return {
    inheritedAcquisition: {
      mode: "post-deemed" as const,
      inheritanceStartDate,
      assetKind: deriveEngineInheritanceAssetKind(primary),
      reportedValue,
      // 사용자가 고른 평가방법을 엔진에 전달(결과 legalBasis·formula 반영). 공란("")이면 "supplementary" 강제 —
      // reportedMethod가 비면 calcPostDeemed가 신고가액 경로(inheritance-acquisition-price.ts:164)를 못 넘고
      // legacyFallback→computeSupplementary(land)로 빠져 post-deemed 총액을 단가로 오인, × 면적 폭증(C2 면적곱 지뢰).
      reportedMethod: primary.inheritanceValuationMethod || ("supplementary" as const),
      useSupplementaryHelper: true,
      ...(primary.acquisitionArea && parseFloat(primary.acquisitionArea) > 0 && {
        landAreaM2: parseFloat(primary.acquisitionArea),
      }),
      publishedValueAtInheritance: reportedValue,
    },
  };
}

/**
 * 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 페이로드 빌드 (상업용건물 + 상속개시일 < 2005-01-01).
 *
 * §163⑨2호: 상가 기준시가 최초고시(2005-01-01) 전 상속 상가는 max(상증법 평가액, §164⑥ 취득당시 기준시가).
 * opt-in — 8필드(면적 3 + 취득시·최초고시 개공지·건물기준시가·최초고시 호별고시가) 모두 입력 시에만 전송
 * (주택 buildInheritedHouseValuationPayload all-or-nothing 미러). cb* 스토어 필드 재사용(환산 섹션과 동일 물리량).
 */
export function buildCommercialInheritanceValuationPayload(
  primary: AssetForm,
): { commercialInheritanceValuation?: unknown } {
  // 대상 판정(자산종류·§163⑨ 취득원인·최초고시 前)과 8필드 완성 여부는 **단일 소스**가 한다.
  if (!isFullyFilled(sec164CommercialStatus(primary))) return {};
  const inheritanceDate = deriveSec163_9BaseDate(primary);

  const exclusiveArea = parseFloat(primary.cbExclusiveArea) || 0;
  const commonArea = parseFloat(primary.cbSharedArea) || 0;
  const landArea = parseFloat(primary.cbLandArea) || 0;
  const unitPriceAtFirstDisclosure = parseAmount(primary.cbUnitPriceAtFirstOrAcq);
  const landPriceAtAcquisition = parseAmount(primary.cbLandPricePerSqmAtAcq);
  const landPriceAtFirstDisclosure = parseAmount(primary.cbLandPricePerSqmAtFirst);
  const buildingStdPriceAtAcquisition = parseAmount(primary.cbBuildingStdPriceAtAcq);
  const buildingStdPriceAtFirstDisclosure = parseAmount(primary.cbBuildingStdPriceAtFirst);

  // all-or-nothing 검사는 위 `sec164CommercialStatus`가 이미 수행했다(중복 게이트 제거).

  return {
    commercialInheritanceValuation: {
      exclusiveArea,
      commonArea,
      landArea,
      unitPriceAtFirstDisclosure,
      landPriceAtAcquisition,
      landPriceAtFirstDisclosure,
      buildingStdPriceAtAcquisition,
      buildingStdPriceAtFirstDisclosure,
    },
  };
}

/**
 * 상속 주택 환산취득가 보조 입력 페이로드 빌드 (주택 + 상속개시일 < 2005-04-30).
 *
 * 필수 4필드(landArea·transferLandPricePerSqm·firstLandPricePerSqm·firstHousePrice)가
 * 모두 입력되었다면 사용자가 환산 보조 사용 의사 표명으로 간주 (inhHouseValEnabled 토글은 dead flag).
 */
export function buildInheritedHouseValuationPayload(
  primary: AssetForm,
  transferDate: string,
): { inheritedHouseValuation?: unknown } {
  // 필수 필드 판정은 **단일 소스**(`sec164-required-fields.ts`)가 한다 — validate와 같은 기준이라
  // "부분 입력이 조용히 무시"도 "칸은 다 있는데 차단"도 생기지 않는다(계획서 §5.1).
  // 자산종류(주택 2종)·취득원인(§163⑨ 대상)·기간(개별주택가격 최초공시 前) 게이트가 그 안에 있다.
  if (!isFullyFilled(sec164HouseStatus(primary))) return {};

  const inheritanceDate = deriveSec163_9BaseDate(primary);
  const isBefore1990 = !!inheritanceDate && inheritanceDate < "1990-08-30";
  const buildGrade = (raw: string) => {
    const n = Number(raw.replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return primary.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
  };

  const pre1990Payload = isBefore1990
    ? (() => {
        const gCur = buildGrade(primary.pre1990Grade_current ?? "");
        const gPrev = buildGrade(primary.pre1990Grade_prev ?? "");
        const gAcq = buildGrade(primary.pre1990Grade_atAcq ?? "");
        const p1990 = parseAmount(primary.pre1990PricePerSqm_1990 ?? "");
        if (!gCur || !gPrev || !gAcq || p1990 <= 0) return undefined;
        return {
          grade_1990_0830: gCur,
          gradePrev_1990_0830: gPrev,
          gradeAtAcquisition: gAcq,
          pricePerSqm_1990: p1990,
        };
      })()
    : undefined;

  const landPriceAtInheritance = parseAmount(primary.inhHouseValLandPricePerSqmAtInheritance);

  // 1990 前「등급 3종+1990가 ↔ 취득당시 단가」 택일·1990 後 단가 필수는 위 `sec164HouseStatus`가
  // 이미 판정했다(`oneOf`). 여기서 다시 게이트하지 않는다 — 두 곳이 어긋나면 침묵 실패가 재발한다.

  return {
    inheritedHouseValuation: {
      inheritanceDate,
      transferDate,
      landArea: parseFloat(primary.inhHouseValLandArea),
      landPricePerSqmAtTransfer: parseAmount(primary.inhHouseValLandPricePerSqmAtTransfer),
      landPricePerSqmAtFirstDisclosure: parseAmount(primary.inhHouseValLandPricePerSqmAtFirst),
      landPricePerSqmAtInheritance: landPriceAtInheritance || undefined,
      housePriceAtTransfer: parseAmount(primary.inhHouseValHousePriceAtTransfer) || 0,
      housePriceAtFirstDisclosure: parseAmount(primary.inhHouseValHousePriceAtFirst),
      buildingStdPriceAtFirstDisclosure:
        parseAmount(primary.inhHouseValBuildingStdPriceAtFirst) || undefined,
      buildingStdPriceAtInheritance:
        parseAmount(primary.inhHouseValBuildingStdPriceAtInheritance) || undefined,
      housePriceAtInheritanceOverride: primary.inhHouseValUseHousePriceOverride
        ? parseAmount(primary.inhHouseValHousePriceAtInheritanceOverride) || undefined
        : undefined,
      firstDisclosureDate: primary.inhHouseValFirstDisclosureDate || "2005-04-30",
      pre1990: pre1990Payload,
    },
  };
}
