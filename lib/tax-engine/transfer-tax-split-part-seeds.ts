/**
 * 토지·건물 분리취득(split) 자산의 **파트 구성** — 게이트(0~4) + 파트별 양도소득금액·세율 판정 입력.
 *
 * 두 소비처의 **단일 소스**다(2026-10-16 `transfer-tax-split-rate.ts`에서 분리 — 800줄 정책):
 *   · `evaluateSplitPartTax` — §104⑤ 파트별 세율 + 비교과세
 *   · `splitPartsForLossOffset` — 다건 차손 통산을 파트 단위로(「소득세법 시행령」 §167의2①, Q-F3a)
 * 게이트를 두 곳에 복제하면 한쪽만 바뀌어 **세율 단위와 차손 통산 단위가 갈린다**.
 * 계획서 `docs/02-design/features/transfer-104-5-split-nonhouse-followups.plan.md` §3.
 */
import { calcTax } from "./transfer-tax-rate-calc";
import type { RateClause } from "./transfer-tax-rate-clause";
import {
  resolveAppurtenantLandRateBasisDate,
  resolveLandStatutoryAcquisitionDate,
  buildLandRateInput,
  buildNblPartRateInput,
} from "./transfer-tax-appurtenant-land";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { SplitRatePart } from "./transfer-tax-split-rate";
import type { SplitGainResult } from "./types/transfer-split-gain.types";
import type { TransferTaxInput } from "./types/transfer.types";

export interface SplitPartSeed {
  kind: SplitRatePart["kind"];
  /** §104② 세율 보유기간 기산일 */
  basisDate: Date;
  /** 파트 양도소득금액(과세 양도차익 − 장기보유특별공제) */
  raw: number;
  /** 이 파트의 세율 판정 입력 */
  rateInput: TransferTaxInput;
}

/** 파트별 세율이 성립하지 않으면(게이트 미통과) `null` — 호출부는 자산 단위 경로를 유지한다. */
export function buildSplitPartSeeds(
  splitDetail: SplitGainResult | undefined,
  input: TransferTaxInput,
): SplitPartSeed[] | null {
  // ── 게이트 ──────────────────────────────────────────────
  // 0. 토지·건물 분리 계산 결과가 있어야 한다.
  if (!splitDetail) return null;
  // 1. 토지 기산일이 있어야 파트별 판정이 성립한다.
  //    주택은 `max(토지, 주택)` — 토지를 먼저 샀으면 주택 취득일이 되어 건물 파트와 같아지고,
  //    아래 게이트 8(세율 동일)이 진입을 막는다 ⇒ 조심 2024인3140 정합·회귀 0.
  const landBasisDate = resolveAppurtenantLandRateBasisDate(input);
  if (!landBasisDate) return null;
  // 2. 소유자 분리 자산은 이미 단독 파트만 신고한다(`transfer-tax.ts` selfOwns 분기).
  if ((input.selfOwns ?? "both") !== "both") return null;
  // 3. 세율 강제 특칙 — 조특법 §98①1호 20% 단일 / P3 특칙(단기세율 배제)은 파트 무관.
  if (input.forceFlatRate20 || input.suppressShortTermRate) return null;
  // 4. 부담부증여는 §159 안분이 총액을 override한다(`transfer-tax-api-split.ts`와 동일 사유).
  if (input.transferType === "burdened_gift" || input.acquisitionCause === "burdened_gift") return null;

  // ── 파트 구성 ───────────────────────────────────────────
  // 파트 양도소득금액은 자산 단위와 같은 소스(splitDetail)에서 만든다.
  // ⚠️ `gain`은 12억 안분 **전** 값이라 `longTermDeduction`(안분 후 기준)과 축이 다르다 —
  //    `taxableGainAfterProration`(안분·비과세 제외 반영)을 써야 파트 소득금액이 자산 단위와 맞는다.
  const nbPart = splitDetail.nonBusinessLandPart;
  // 배율 초과분은 주택부수토지가 아니므로 `max` 없이 토지 자체의 §104② 기산일을 쓴다.
  const nbBasisDate = resolveLandStatutoryAcquisitionDate(input);
  const seeds: SplitPartSeed[] = [
    {
      kind: "land",
      basisDate: landBasisDate,
      raw:
        (splitDetail.land.taxableGainAfterProration ?? splitDetail.land.gain) -
        splitDetail.land.longTermDeduction,
      // 배율 초과분을 이미 비사업용 토지로 떼어냈다면(G-2) 남은 배율 내 부수토지는
      // 「소득세법」 제104조의3 제1항 제5호가 비사업용으로 규정한 부분이 아니다 → 중과 제외.
      rateInput: {
        ...buildLandRateInput(input, landBasisDate),
        ...(splitDetail.nonBusinessLandPart ? { isNonBusinessLand: false } : {}),
      },
    },
    {
      kind: "building",
      basisDate: input.acquisitionDate,
      raw:
        (splitDetail.building.taxableGainAfterProration ?? splitDetail.building.gain) -
        splitDetail.building.longTermDeduction,
      // **건물은 비사업용 「토지」가 될 수 없다** — §104의3①은 토지만 규정한다.
      // 자산 단위 `isNonBusinessLand`가 건물분 과세표준까지 +10%p를 물리던 것을 여기서 끊는다
      // (§104⑤ 후단 — 각각을 별개의 자산으로 보아 산출세액을 계산). 계획서 §6 M-12.
      rateInput: {
        ...input,
        isNonBusinessLand: false,
        nonBusinessLandAreaRatio: undefined,
      },
    },
  ];
  if (nbPart && nbBasisDate) {
    seeds.push({
      kind: "non_business_land",
      // 배율 초과분은 주택부수토지가 아니므로 §104②의 "해당 자산"은 토지 본래 취득일이다.
      basisDate: nbBasisDate,
      raw: (nbPart.taxableGainAfterProration ?? nbPart.gain) - nbPart.longTermDeduction,
      // 주택 단기세율(§104①2·3호)이 아니라 §104①8호 누진 + 10%p. `propertyType`을 토지로 두어야
      // `calcTax`의 주택 분기(70%/60%)에 걸리지 않는다.
      rateInput: buildNblPartRateInput(input, nbBasisDate),
    });
  }
  return seeds;
}

/** 차손 통산 1행이 될 파트 — 「같은 세율을 적용받는 자산」 판정 재료(`lossOffsetRateKey`). */
export interface LossOffsetPart {
  kind: SplitRatePart["kind"];
  income: number;
  rateClause: RateClause | undefined;
  appliedRate: number;
  propertyType: TransferTaxInput["propertyType"];
}

/**
 * 다건 차손 통산(영 §167의2①)을 **파트 단위**로 할 비주택 split 자산의 파트들(Q-F3a). 대상이 아니면 `null`.
 *
 * 엔진은 비주택 토지·건물을 별개 자산으로 보고 파트별 세율을 적용한다(G-1 · #2224). 그런데 차손 통산만 자산
 * 단위였다 — split 자산은 단건 결과에 호가 없어 「같은 세율 먼저」(1호)에서 늘 빠지고(`solo` 키), 받은 차손도
 * 세율과 무관하게 소득 비율로 파트에 나뉘었다. 토지 자산 + 건물 자산으로 따로 신고한 값과 최대 76,534,002 갈렸다.
 * (조세심판원 국심2007중3718 — 같은 거래의 토지·건물을 §102② 통산의 각각의 자산으로 본다.)
 *
 * 대상 밖: 주택 split(파트를 다건 합산 단위로 남기지 않는다) · 배율 초과 비사업용 토지 파트 · 결손 파트.
 * 세율 사실은 파트 소득금액 그대로 `calcTax`를 돌려 얻는다 — 차손 통산은 기본공제 전 단계다.
 */
export function splitPartsForLossOffset(
  splitDetail: SplitGainResult | undefined,
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined,
): LossOffsetPart[] | null {
  if (input.propertyType === "housing" || splitDetail?.nonBusinessLandPart) return null;
  const seeds = buildSplitPartSeeds(splitDetail, input);
  if (!seeds || seeds.some((s) => s.raw < 0)) return null;
  return seeds.map((s) => {
    const t = calcTax(s.raw, parsedRates, s.rateInput, multiHouseSurchargeResult);
    return { kind: s.kind, income: s.raw, rateClause: t.rateClause, appliedRate: t.appliedRate, propertyType: s.rateInput.propertyType };
  });
}
