/**
 * 일반건물 — 의제취득일(1985.1.1.) 전 상속·증여 파트의 취득가액 3자 max (PR-4).
 *
 * 계획서: `docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md` §15
 *
 * 파트 취득가액 = max(① 상증법 평가액, ② 영 §164④·⑤ 가액, ③ 환산취득가액 — 영 §176조의2④·②2호).
 * 동점은 ①② 쪽(Q-5) · 취득가액만 비교한다(Q-7 a). ④가 ①②를 따로 싣고(`*PreDeemedClauseA`) 파트 슬롯에는
 * 종전처럼 max(①,②)를 싣는다.
 *
 * ## 왜 dispatch 직전에 경로를 다시 고르는가
 *
 * ③은 파트 양도가액(§166⑥ 안분 · §100③ 구분 기재 · 감정 basis · 증축 3-way)과 양도시 기준시가(영 §164⑨ 공익수용
 * 특례 포함)로 정해진다 — 그 값은 환산 경로 엔진만 안다. 그래서 그 파트만 「환산」으로 바꾼 payload로 환산 경로를
 * **시험 계산**해 ③을 얻고(`trial`), ③이 이긴 파트만 실제로 환산 파트로 바꿔 환산 경로로 보낸다.
 *
 * - ③이 지면 payload를 **그대로** 돌려준다 — 실가 경로(C1)·종전 경로가 그대로 돈다(회귀 0).
 * - ③이 이기면 그 파트는 추계다 — 개산공제(영 §163⑥)·§97②2호 단서 비교가 환산 파트 규칙 그대로 붙는다.
 *   사용자 입력 모드는 실가로 남는다(⑧ O-3 — 상속·증여 파트는 사용자가 환산을 고를 수 없다).
 * - 비교에 쓴 ③과 적용한 ③이 같은 엔진 호출에서 나오므로 서로 갈릴 수 없다(Q-10 A와 같은 요구).
 */
import { apportionByStdPrice } from "./std-price-apportion";
import { multiplyByArea } from "./area-utils";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type {
  GbPreDeemedClauseA,
  GbPreDeemedEcho,
  GbPreDeemedPartEcho,
  GeneralBuildingAcquisition,
} from "./types/general-building.types";

export type { GbPreDeemedClauseA, GbPreDeemedEcho, GbPreDeemedPartEcho };

type Mode = "actual" | "estimated" | "appraisal" | "salesCase";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const modeOf = (v: unknown): Mode => (typeof v === "string" ? (v as Mode) : "estimated");

export const GB_PRE_DEEMED_NUMERATOR_MESSAGE = {
  land: "1985.1.1. 전에 상속·증여받은 토지는 환산취득가액과도 비교하므로 의제취득일(1985.1.1.) 토지 기준시가(취득시 ㎡당 공시지가)가 필요합니다 (소득세법 시행령 §163⑨·§176조의2④)",
  building: "1985.1.1. 전에 상속·증여받은 건물은 환산취득가액과도 비교하므로 의제취득일(1985.1.1.) 건물 기준시가가 필요합니다 (소득세법 시행령 §163⑨·§176조의2④)",
} as const;

/**
 * 실가 경로 payload를 환산 경로 payload로 옮긴다 — 모드만 바꾸고 필요경비는 **실가 경로가 쓰던 규칙 그대로** 파트로 나눈다.
 *
 * 실가 경로(`general-building-route-actual.ts` `apportionExpenses`)는 자산 단위 자본적지출을 취득시 기준시가로,
 * 예전 필요경비 칸(`actualExpenses`)을 양도시 기준시가로 나눠 각 파트에 더한다. 환산 경로는 두 파트의 모드가 다르면
 * 파트 축(`general-building-entry.ts` `usePartAxis`)이라 자산 단위 자본적지출을 읽지 않는다 — 옮기지 않으면 실가로 남는
 * 파트의 자본적지출이 사라진다. 양도비는 두 경로 모두 `transferExpense` 하나로 받아 엔진이 나눈다.
 */
function toConversionRaw(
  raw: Record<string, unknown>,
  modes: { land: Mode; building: Mode },
  actualExpenses: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw, landAcqMode: modes.land, buildingAcqMode: modes.building };
  delete out.actualPriceMode;
  if (raw.actualPriceMode !== true) return out;

  const partAxis =
    modes.land !== modes.building || raw.landDirectExpenses !== undefined || raw.buildingDirectExpenses !== undefined;
  const capex = num(raw.capitalExpenditure);
  const declared = capex + num(raw.transferExpense);
  const landArea = num(raw.landArea);
  if (partAxis && capex > 0) {
    const ap = apportionByStdPrice(
      capex,
      multiplyByArea(num(raw.acquisitionLandPricePerSqm), landArea),
      num(raw.acquisitionBuildingStdPrice),
    );
    out.landDirectExpenses = raw.landDirectExpenses ?? ap.land;
    out.buildingDirectExpenses = raw.buildingDirectExpenses ?? ap.building;
    delete out.capitalExpenditure;
  } else if (declared === 0 && actualExpenses > 0) {
    if (partAxis) {
      const ap = apportionByStdPrice(
        actualExpenses,
        multiplyByArea(num(raw.transferLandPricePerSqm), landArea),
        num(raw.transferBuildingStdPrice),
      );
      out.landDirectExpenses = raw.landDirectExpenses ?? ap.land;
      out.buildingDirectExpenses = raw.buildingDirectExpenses ?? ap.building;
    } else {
      out.capitalExpenditure = actualExpenses;
    }
  }
  return out;
}

function adoptedOf(c: GbPreDeemedClauseA, converted: number): GbPreDeemedPartEcho["adopted"] {
  const clauseA = Math.max(c.reported, c.sec164);
  if (clauseA > 0 && clauseA >= converted) return c.reported >= c.sec164 ? "reported" : "sec164";
  return "converted";
}

/**
 * 의제취득일 전 상속·증여 파트가 있으면 ③과 비교해 경로를 다시 고른다.
 *
 * @param raw            Date 변환을 마친 `generalBuildingValuation`
 * @param actualExpenses 자산(지분) 단위 예전 필요경비 칸 — 실가 경로가 읽던 값
 * @param trial          환산 경로 payload로 파트 취득가액을 계산하는 함수(호출부가 양도가액·지분율·공익수용 특례를 주입)
 */
export function resolveGbPreDeemedRoute(
  raw: Record<string, unknown>,
  actualExpenses: number,
  trial: (conversionRaw: Record<string, unknown>) => GeneralBuildingAcquisition,
): { raw: Record<string, unknown>; echo?: GbPreDeemedEcho } {
  const land = raw.landPreDeemedClauseA as GbPreDeemedClauseA | undefined;
  const building = raw.buildingPreDeemedClauseA as GbPreDeemedClauseA | undefined;
  if (!land && !building) return { raw };

  if (land && !(num(raw.acquisitionLandPricePerSqm) > 0)) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, GB_PRE_DEEMED_NUMERATOR_MESSAGE.land);
  }
  if (building && !(num(raw.acquisitionBuildingStdPrice) > 0)) {
    throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, GB_PRE_DEEMED_NUMERATOR_MESSAGE.building);
  }

  const landMode = modeOf(raw.landAcqMode);
  const buildingMode = modeOf(raw.buildingAcqMode);
  const converted = trial(
    toConversionRaw(raw, { land: land ? "estimated" : landMode, building: building ? "estimated" : buildingMode }, actualExpenses),
  );

  const echo: GbPreDeemedEcho = {
    ...(land ? { land: { ...land, converted: converted.land, adopted: adoptedOf(land, converted.land) } } : {}),
    ...(building
      ? { building: { ...building, converted: converted.building, adopted: adoptedOf(building, converted.building) } }
      : {}),
  };
  const landWins = echo.land?.adopted === "converted";
  const buildingWins = echo.building?.adopted === "converted";
  if (!landWins && !buildingWins) return { raw, echo };

  return {
    raw: toConversionRaw(
      raw,
      { land: landWins ? "estimated" : landMode, building: buildingWins ? "estimated" : buildingMode },
      actualExpenses,
    ),
    echo,
  };
}
