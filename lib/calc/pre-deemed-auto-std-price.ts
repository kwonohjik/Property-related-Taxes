/**
 * 의제취득일(1985.1.1.) 전 상속·증여 — ③ 분자·분모의 **자동값** (PR-5에서 화면 컴포넌트로부터 분리 · 단일 소스).
 *
 * ⑤ `PreDeemedConversionFields`가 칸에 보여 주는 값과 ④ `buildInheritedAcquisitionPayload`의 전송 판단이 같은 함수를 쓴다.
 * 자동값이 있고 직접 입력 토글이 꺼져 있으면 ④는 store 값을 싣지 않는다 — 엔진이 같은 자동값을 주입한다
 * (`inheritance-acquisition-helpers.ts` — 사용자가 보낸 분자가 있으면 자동 주입을 건너뛰므로, 보이지 않는 남은 값이 이기던 것을 막는다).
 *
 * 토지: §164④ 등급 환산(`calculatePre1990LandValuation`) · 주택: §164⑦ 3시점 환산 P_F × ΣA ÷ ΣF · 주택 분모: 양도 당시 공시 개별주택가격.
 * 상가: §164⑥ 취득당시 기준시가(8칸이 다 찼을 때 — ②와 같은 값 · 사용자 결정 A안, 계획서 commercial-pre-deemed-converted-numerator.plan.md).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { calculatePre1990LandValuation, type LandGradeInput } from "@/lib/tax-engine/pre-1990-land-valuation";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import { apartSec164FormOpen, isApartSec163_9Asset } from "./apart-nts-price";
import { isSec163_9HouseAsset } from "./transfer-163-9-base-date";
import { resolveAcqAreaForStdPrice } from "./transfer-tax-api-helpers";
import { buildCommercialInheritanceValuationPayload } from "./transfer-tax-api-inheritance";
import { computeCommercial164_6StdPrice } from "@/lib/tax-engine/inheritance-acquisition-helpers";
import type { CommercialInheritanceValuationInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 1990.8.30. 토지등급 → 개별공시지가 전환일 */
const PRE_1990_DATE = "1990-08-30";

/** 의제취득일 전이면 주택의 §164⑦ 3시점 입력이 열려 있는가 — 공동주택은 국세청 고시 가액 질문이 정한다. */
export function preDeemedShowsHouseValuation(asset: AssetForm): boolean {
  if (isApartSec163_9Asset(asset)) return apartSec164FormOpen(asset);
  return isSec163_9HouseAsset(asset);
}

export interface PreDeemedAutoStdPrices {
  /** ③ 분자 자동값(의제취득일 기준시가) — 없으면 null */
  atDeemed: number | null;
  /** ③ 분모 자동값(양도시 기준시가) — 없으면 null */
  atTransfer: number | null;
}

export function preDeemedAutoStdPrices(
  asset: AssetForm,
  baseDate: string,
  showHouseValuation: boolean,
  transferDate?: string,
): PreDeemedAutoStdPrices {
  const inheritanceDate = baseDate;
  const showPre1990 = asset.assetKind === "land";
  // ── 자동 계산값 미리보기 (엔진 자동 주입 로직과 동일한 결과를 재현) ──
  // 엔진은 `inheritance-acquisition-helpers.ts`의 resolveInheritedAcquisitionInput에서
  // PHD 결과(houseValuationResult.housePriceAtInheritanceUsed) 또는 Pre1990 결과를 자동 주입.
  // UI에서도 동일한 로직을 미리 계산해 사용자에게 노출.
  const phdAutoDeemedPrice = ((): number | null => {
    if (!showHouseValuation) return null;
    const area = parseFloat(asset.inhHouseValLandArea) || 0;
    const isBefore1990 = !!inheritanceDate && inheritanceDate < PRE_1990_DATE;

    // 상속개시일 시점 토지기준시가 (Sum_A의 토지 성분)
    let landStdA = 0;
    // 1990.8.30. 전 토지 몫은 등급 환산 — ④(`buildInheritedHouseValuationPayload`)는 `pre1990Enabled` 래치를 보지 않는다(같은 기준).
    if (isBefore1990) {
      const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
        if (!raw) return undefined;
        const n = parseFloat(raw);
        if (!Number.isFinite(n) || n <= 0) return undefined;
        return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
      };
      const gCur = buildGrade(asset.pre1990Grade_current);
      const gPrev = buildGrade(asset.pre1990Grade_prev);
      const gAcq = buildGrade(asset.pre1990Grade_atAcq);
      const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
      if (gCur && gPrev && gAcq && p1990 > 0 && area > 0) {
        try {
          const r = calculatePre1990LandValuation({
            acquisitionDate: new Date(inheritanceDate),
            transferDate: new Date(transferDate || inheritanceDate),
            areaSqm: area,
            pricePerSqm_1990: p1990,
            pricePerSqm_atTransfer: p1990,
            grade_1990_0830: gCur,
            gradePrev_1990_0830: gPrev,
            gradeAtAcquisition: gAcq,
          });
          landStdA = r.standardPriceAtAcquisition;
        } catch {
          landStdA = 0;
        }
      }
    } else {
      landStdA = multiplyByArea(parseAmount(asset.inhHouseValLandPricePerSqmAtInheritance), area);
    }

    const buildingA = parseAmount(asset.inhHouseValBuildingStdPriceAtInheritance) || 0;
    const landStdF = multiplyByArea(parseAmount(asset.inhHouseValLandPricePerSqmAtFirst), area);
    const buildingStdF = parseAmount(asset.inhHouseValBuildingStdPriceAtFirst) || 0;
    const P_F = parseAmount(asset.inhHouseValHousePriceAtFirst) || 0;
    const sumA = landStdA + buildingA;
    const sumF = landStdF + buildingStdF;

    // override 사용 시 그 값을 그대로 반환
    if (asset.inhHouseValUseHousePriceOverride) {
      const override = parseAmount(asset.inhHouseValHousePriceAtInheritanceOverride) || 0;
      return override > 0 ? Math.floor(override) : null;
    }

    if (sumF <= 0 || P_F <= 0 || sumA <= 0) return null;
    return Math.floor((P_F * sumA) / sumF);
  })();

  // Pre1990 토지 자동값 (주택이 아닌 토지 자산일 때)
  const pre1990AutoDeemedPrice = ((): number | null => {
    if (showHouseValuation) return null; // 주택은 PHD 우선
    // 래치(`pre1990Enabled`)를 보지 않는다 — ④·엔진은 등급 5칸이 다 차면 래치와 무관하게 ②를 만들어 ③ 분자로 주입한다
    // (`transfer-tax-api-primary-context.ts` `hasPre1990ForSec164`). 래치를 보면 증여 토지(등급 입력이 래치를 켜지 않는다)에서
    // 칸은 비어 보이는데 계산은 자동값을 쓴다(PR-5 실측).
    if (!showPre1990) return null;
    // 면적은 ④ `buildPre1990LandPayload`와 같다 — 일부양도면 양도분 면적(분모 양도시 기준시가와 같은 면적 · A01).
    //   종전 화면은 취득 전체면적을 써, 잠긴 칸이 엔진 분자의 (취득면적/양도면적)배를 보였다(PR-5 리뷰 F1).
    const area =
      resolveAcqAreaForStdPrice({
        areaScenario: asset.areaScenario,
        acquisitionArea: (asset.acquisitionArea ?? "").replace(/,/g, ""),
        transferArea: (asset.transferArea ?? "").replace(/,/g, ""),
      }) ?? 0;
    const buildGrade = (raw: string | undefined): LandGradeInput | undefined => {
      if (!raw) return undefined;
      const n = parseFloat(raw);
      if (!Number.isFinite(n) || n <= 0) return undefined;
      return asset.pre1990GradeMode === "number" ? Math.trunc(n) : { gradeValue: n };
    };
    const gCur = buildGrade(asset.pre1990Grade_current);
    const gPrev = buildGrade(asset.pre1990Grade_prev);
    const gAcq = buildGrade(asset.pre1990Grade_atAcq);
    const p1990 = parseAmount(asset.pre1990PricePerSqm_1990 || "");
    if (!gCur || !gPrev || !gAcq || p1990 <= 0 || area <= 0) return null;
    try {
      const r = calculatePre1990LandValuation({
        acquisitionDate: new Date(asset.acquisitionDate || inheritanceDate),
        transferDate: new Date(transferDate || asset.acquisitionDate || inheritanceDate),
        areaSqm: area,
        pricePerSqm_1990: p1990,
        pricePerSqm_atTransfer: parseAmount(asset.pre1990PricePerSqm_atTransfer || "") || p1990,
        grade_1990_0830: gCur,
        gradePrev_1990_0830: gPrev,
        gradeAtAcquisition: gAcq,
      });
      return r.standardPriceAtAcquisition;
    } catch {
      return null;
    }
  })();

  // 상가 §164⑥ 자동값 — ④가 싣는 payload(같은 판정 · 같은 산식)로 엔진 `shouldInjectCommercialDeemed`와 같은 값을 만든다.
  // 분모(양도시 상가 기준시가)는 자동값이 없다 — 칸 그대로.
  const commercialAutoDeemedPrice = ((): number | null => {
    if (asset.assetKind !== "commercial_building") return null;
    const v = buildCommercialInheritanceValuationPayload(asset).commercialInheritanceValuation;
    return v ? computeCommercial164_6StdPrice(v as CommercialInheritanceValuationInput) : null;
  })();

  // 양도시 기준시가 자동값: PHD inhHouseValHousePriceAtTransfer 사용
  const autoStdPriceAtTransfer = ((): number | null => {
    if (!showHouseValuation) return null;
    const v = parseAmount(asset.inhHouseValHousePriceAtTransfer) || 0;
    return v > 0 ? v : null;
  })();

  return { atDeemed: phdAutoDeemedPrice ?? commercialAutoDeemedPrice ?? pre1990AutoDeemedPrice, atTransfer: autoStdPriceAtTransfer };
}

/** ④ 전송 판단 — 칸이 자동값을 보여 주는 동안은 store 값을 싣지 않는다(직접 입력 토글이 켜졌을 때만 싣는다). */
export function preDeemedSentStdPrices(
  asset: AssetForm,
  baseDate: string,
  transferDate?: string,
): { atDeemed: number; atTransfer: number } {
  const auto = preDeemedAutoStdPrices(asset, baseDate, preDeemedShowsHouseValuation(asset), transferDate);
  return {
    atDeemed: auto.atDeemed !== null && !asset.useStandardPriceAtAcqOverride ? 0 : parseAmount(asset.standardPriceAtAcq),
    atTransfer: auto.atTransfer !== null && !asset.useStandardPriceAtTransferOverride ? 0 : parseAmount(asset.standardPriceAtTransfer),
  };
}
