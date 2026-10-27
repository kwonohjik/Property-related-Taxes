/**
 * 토지·건물 분리취득(split) 자산의 **파트 구성** — 게이트(0~4) + 파트별 양도소득금액·세율 판정 입력.
 *
 * 세 소비처의 **단일 소스**다(2026-10-16 `transfer-tax-split-rate.ts`에서 분리 — 800줄 정책):
 *   · `evaluateSplitPartTax` — §104⑤ 파트별 세율 + 비교과세(파트 소득·1차 세율까지는 `prepareSplitParts`)
 *   · `splitPartsForLossOffset` — 다건 차손 통산을 파트 단위로(「소득세법 시행령」 §167의2①, Q-F3a)
 *   · `splitPartBasicUnits` — 다건 §103② 기본공제 배분을 파트 단위로(F-B, 2026-10-18)
 * 게이트를 여러 곳에 복제하면 한쪽만 바뀌어 **세율 단위·차손 통산 단위·기본공제 배분 단위가 갈린다**.
 * 계획서 `docs/02-design/features/transfer-104-5-split-nonhouse-followups.plan.md` §3 ·
 * `transfer-split-basic-deduction-units-and-order-rounding.plan.md` §4.
 */
import { calcTax } from "./transfer-tax-rate-calc";
import { offsetLossesCore } from "./loss-offset-core";
import { lossOffsetRateKey } from "./loss-offset-rate-key";
import type { RateClause } from "./transfer-tax-rate-clause";
import {
  resolveAppurtenantLandRateBasisDate,
  resolveLandStatutoryAcquisitionDate,
  buildLandRateInput,
  buildNblPartRateInput,
} from "./transfer-tax-appurtenant-land";
import type { ParsedRates } from "./transfer-tax-helpers";
import type { MultiHouseSurchargeResult } from "./multi-house-surcharge";
import type { SplitPartLossOffset, SplitPartRateContext, SplitRatePart } from "./transfer-tax-split-rate";
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
  //    단 토지만 본인에 배율 초과분이 있으면 그 토지가 이내분 + 비사업용 토지로 갈린다 — 건물 파트 없이 두 파트로 낸다
  //    (§104⑤ 후단 「한 필지의 토지가 … 비사업용 토지와 그 외의 토지로 구분되는 경우에는 각각을 별개의 자산으로」).
  const landOnly = input.selfOwns === "land_only";
  if ((input.selfOwns ?? "both") !== "both" && !(landOnly && splitDetail.nonBusinessLandPart)) return null;
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
  if (landOnly) seeds.splice(1, 1); // 건물은 본인 소유가 아니다
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
 * 다건 차손 통산(영 §167의2①)을 **파트 단위**로 할 split 자산의 파트들(Q-F3a). 대상이 아니면 `null`.
 *
 * 엔진은 비주택 토지·건물을 별개 자산으로 보고 파트별 세율을 적용한다(G-1 · #2224). 그런데 차손 통산만 자산
 * 단위였다 — split 자산은 단건 결과에 호가 없어 「같은 세율 먼저」(1호)에서 늘 빠지고(`solo` 키), 받은 차손도
 * 세율과 무관하게 소득 비율로 파트에 나뉘었다. 토지 자산 + 건물 자산으로 따로 신고한 값과 최대 76,534,002 갈렸다.
 * (조세심판원 국심2007중3718 — 같은 거래의 토지·건물을 §102② 통산의 각각의 자산으로 본다.)
 *
 * 2026-10-19 P2(B): 주택 split · 배율 초과 비사업용 토지 파트 · **차손 파트**도 행으로 낸다 — 건물 차손이 자기 토지보다
 * 신고 전체의 같은 세율 자산에서 먼저 공제된다(영 §167의2①1호). 감면 자산의 차손 파트는 호출부가 자산 한 행으로 둔다(Q-2).
 * 세율 사실은 파트 소득금액으로 `calcTax`를 돌려 얻는다(차손 파트는 0 — 다건 차손 자산 규약) — 차손 통산은 기본공제 전 단계다.
 */
export function splitPartsForLossOffset(
  splitDetail: SplitGainResult | undefined,
  input: TransferTaxInput,
  parsedRates: ParsedRates,
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined,
): LossOffsetPart[] | null {
  const seeds = buildSplitPartSeeds(splitDetail, input);
  if (!seeds) return null;
  return seeds.map((s) => {
    const t = calcTax(Math.max(0, s.raw), parsedRates, s.rateInput, multiHouseSurchargeResult);
    return { kind: s.kind, income: s.raw, rateClause: t.rateClause, appliedRate: t.appliedRate, propertyType: s.rateInput.propertyType };
  });
}

/**
 * 파트 차손 통산(「소득세법 시행령」 §167의2①) — 다건과 같은 코어(`offsetLossesCore`)·같은 「같은 세율」 키(`lossOffsetRateKey`)를 쓴다.
 * 세율 사실은 다건 차손 자산 규약과 같다(`transfer-tax-aggregate-asset-records.ts` `resolveRateFacts`) — 차손 파트는 `calcTax(0)`.
 */
function offsetPartLosses(
  seeds: SplitPartSeed[],
  parsedRates: ParsedRates,
  multiHouseSurchargeResult: MultiHouseSurchargeResult | undefined,
): { incomes: number[]; rows: SplitPartLossOffset[] } {
  const out = offsetLossesCore(
    seeds.map((s) => {
      const t = calcTax(Math.max(0, s.raw), parsedRates, s.rateInput, multiHouseSurchargeResult);
      return {
        income: s.raw,
        rateKey: lossOffsetRateKey({ rateClause: t.rateClause, appliedRate: t.appliedRate, propertyType: s.rateInput.propertyType, propertyId: s.kind }),
      };
    }),
  );
  return {
    incomes: out.incomeAfterOffset,
    rows: out.rows.map((r) => ({ from: seeds[r.from].kind, to: seeds[r.to].kind, amount: r.amount, scope: r.scope })),
  };
}

/** 다건 신고의 비주택 토지·건물 split — 파트를 합산 단위로 항상 남긴다(P3). 비주택 판정은 G-1과 같은 술어(`resolveAppurtenantLandRateBasisDate`). */
export const keepsNonHousingParts = (ctx: SplitPartRateContext) =>
  ctx.aggregateFiling === true && ctx.taxRateInput.propertyType !== "housing";

/**
 * 기본공제 배분 **전** 파트 — 시드 · 소득 안분 · 1차 세율, 게이트 6·7까지. 세액 계산(`evaluateSplitPartTax`)과
 * 다건 §103② 배분 단위(`splitPartBasicUnits`)가 함께 쓴다 — 둘이 파트 소득을 따로 구하면 배분과 세액이 갈린다.
 */
export function prepareSplitParts(
  ctx: SplitPartRateContext,
):
  | { ready: false; judged: boolean }
  | {
      ready: true;
      seeds: SplitPartSeed[];
      incomes: number[];
      preRates: ReturnType<typeof calcTax>[];
      lossOffset?: SplitPartLossOffset[];
    } {
  const { splitDetail, taxRateInput: input, parsedRates, transferIncome } = ctx;
  const notJudged = { ready: false, judged: false } as const;

  const seeds = buildSplitPartSeeds(splitDetail, input);
  if (!seeds) return notJudged;

  // 다건이 신고 전체에서 파트 단위로 이미 통산했으면(`partIncomeWeights` — 계획서 P2 B) 그 값이 정본이다 — 자산 안에서 다시 통산하지 않고,
  //   「자산 전체 차손」 판정도 그 값으로 한다(건물 차손을 다른 자산이 가져가면 자산 합이 음수여도 토지 소득이 남는다).
  const filingWeights = ctx.partIncomeWeights?.length === seeds.length ? ctx.partIncomeWeights : undefined;
  if (filingWeights) {
    if (filingWeights.reduce((s, v) => s + v, 0) <= 0) return notJudged;
  } else if (seeds.reduce((s, p) => s + p.raw, 0) <= 0) return notJudged;
  //    한 파트만 차손이면 다른 파트의 양도소득금액에서 「소득세법 시행령」 §167의2① 순서로 공제한다 —
  //    1호 같은 세율 파트 먼저, 2호 남은 차손은 다른 세율 파트에 소득 비율로 안분(국심2007중3718: 토지·건물 차손익 통산).
  //    종전에는 자산 단위 세율(건물 기산일)로 후퇴해 토지 기산일이 버려졌다(계획서 `transfer-split-part-loss-offset-167-2.plan.md`).
  //    Σ파트 > 0이면 차손은 전액 흡수되어 통산 후 합 = 통산 전 합이다 — 아래 안분·잔액 흡수가 그대로 성립한다.
  const lossOffset = !filingWeights && seeds.some((s) => s.raw < 0) ? offsetPartLosses(seeds, parsedRates, ctx.multiHouseSurchargeResult) : undefined;
  const partRaw = lossOffset ? lossOffset.incomes : seeds.map((s) => s.raw);
  const weights =
    ctx.partIncomeWeights?.length === seeds.length ? ctx.partIncomeWeights : partRaw;
  const rawSum = weights.reduce((s, w) => s + w, 0);

  // 자산 단위 양도소득금액과 어긋나면(감면 등) 비율 안분 후 잔액은 **마지막 파트가 흡수**한다.
  // 큰 금액의 곱(최대 1e18)이 2^53을 넘길 수 있어 BigInt로 계산한다.
  let allocatedIncome = 0;
  const incomes = seeds.map((_, i) => {
    if (i === seeds.length - 1) return transferIncome - allocatedIncome;
    const v =
      transferIncome === rawSum
        ? weights[i]
        : rawSum === 0
          ? 0
          : Number((BigInt(transferIncome) * BigInt(weights[i])) / BigInt(rawSum));
    allocatedIncome += v;
    return v;
  });
  if (incomes.some((v) => v < 0)) return notJudged;

  // 1차: 기본공제 배분 전 세율 확인 (§103② MAX_BENEFIT 판정에 적용세율이 필요하다)
  const preRates = seeds.map((s, i) =>
    calcTax(incomes[i], parsedRates, s.rateInput, ctx.multiHouseSurchargeResult),
  );

  // 7. 파트별 확정세율이 모두 같으면 분해해도 결과가 같다 — 진입하지 않는다(회귀 0의 핵심).
  //    세율**군**이 아니라 **확정세율 + 누진공제쌍**으로 판정한다. 1년 미만 50% + 1~2년 40%는
  //    둘 다 short_term 군이라 군 단위로 보면 누락된다.
  const uniform = preRates.every(
    (r) =>
      r.appliedRate === preRates[0].appliedRate &&
      r.progressiveDeduction === preRates[0].progressiveDeduction,
  );
  //    단, 다건 + 비주택은 세율이 같아도 접지 않는다 — 다건 합산 단위는 세율이 아니라 해당 호 집합(Q3 키)이고, 키가 같은 파트는
  //    다건 버킷이 다시 합산하므로 접지 않아도 값이 같다. 여기서 접으면 파트 단독 1호 ↔ 단기세율 교차점마다 합산 단위가 바뀌어
  //    1원 절벽이 생기고(계획서 §2.3), 이 시점의 키(기본공제 배분 전)는 버킷 키(배분 후)와 갈릴 수도 있다(§7.5).
  if (uniform && !keepsNonHousingParts(ctx)) return { ready: false, judged: true };
  return { ready: true, seeds, incomes, preRates, ...(lossOffset ? { lossOffset: lossOffset.rows } : {}) };
}

/**
 * 다건 §103② 배분 단위로 쓸 파트(F-B). 파트가 만들어지지 않는 자산은 `null` — 자산 한 행으로 배분한다.
 * 세액 계산과 같은 준비 단계(`prepareSplitParts`)를 거치므로 파트 소득이 세액 쪽과 갈리지 않는다.
 */
export function splitPartBasicUnits(
  ctx: SplitPartRateContext,
): { kind: SplitRatePart["kind"]; income: number; rate: number }[] | null {
  const prep = prepareSplitParts(ctx);
  if (!prep.ready) return null;
  return prep.seeds.map((s, i) => ({ kind: s.kind, income: prep.incomes[i], rate: prep.preRates[i].appliedRate }));
}
