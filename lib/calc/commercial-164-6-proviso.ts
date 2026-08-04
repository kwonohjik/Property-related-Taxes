/**
 * 소득세법 시행령 §164⑥ 단서 게이트 — 나목 가액 부재 시 §164⑤ 준용.
 *
 * > §164⑥ … 이 경우 해당 자산에 대하여 국세청장이 최초로 고시한 기준시가 고시당시 또는
 * > 취득당시의 **법 제99조제1항제1호나목의 가액이 없는 경우**에는 **제5항을 준용**하여 계산한 가액에 따른다.
 *
 * UI(안내·확인 토글)와 validate(차단)가 **같은 판정을 써야 하므로** 여기 한 곳에만 둔다.
 *
 * 계획서: docs/01-plan/features/commercial-164-6-proviso-164-5-application.plan.md
 */
import { ACQ_BASE_RATE_MAX_ACQ_YEAR } from "@/lib/tax-engine/data/building-standard-price";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { resolveCbEra } from "./commercial-cb-era";

/**
 * §164⑥ 단서 발동 여부 — 취득당시 건물 기준시가(나목)가 없는 구간인가.
 *
 * 경계는 국세청 「취득당시 건물기준시가 산정기준율표」의 취득연도 축 상한(2000)이다.
 * 그 표가 1985~2000만 수록하고 `resolveAcqBaseRate()`가 그 위를 잘라내는 것이,
 * 곧 국세청이 정한 "나목 가액이 없어 §164⑤로 산정하는 구간"이다.
 *
 * 최초고시 당시(상가·오피스텔 2005-01-01)는 2001년 이후라 나목 가액이 존재하므로
 * 단서의 두 요건("최초고시 당시 또는 취득당시") 중 **취득당시만** 문제된다.
 *
 * @param cbEra          호별고시 취득 시점 구분 — `pre_disclosure`(§164⑥ 경로)일 때만 대상
 * @param acquisitionDate 취득일(YYYY-MM-DD). 상속은 상속개시일.
 */
export function isSec164_5ProvisoApplicable(
  cbEra: string | undefined,
  acquisitionDate: string | undefined,
): boolean {
  if (cbEra !== "pre_disclosure") return false;
  return isBeforeBuildingStdPriceNotice(acquisitionDate);
}

/** 취득일이 건물 기준시가(나목) 고시 이전 구간(취득연도 ≤ 2000)인가. */
export function isBeforeBuildingStdPriceNotice(acquisitionDate: string | undefined): boolean {
  if (!acquisitionDate || acquisitionDate.length < 4) return false;
  const year = Number.parseInt(acquisitionDate.slice(0, 4), 10);
  return Number.isFinite(year) && year <= ACQ_BASE_RATE_MAX_ACQ_YEAR;
}

/**
 * §164⑥ 산식 **괄호 단서** 해당 여부 — 취득당시 기준시가합 == 최초고시당시 기준시가합.
 *
 * > (취득당시의 가액과 최초로 고시한 기준시가 고시당시의 가액이 동일한 경우에는 제8항의 규정을 준용한다)
 *
 * 합계액 산식과 **floor 위치를 엔진과 동일하게** 맞춘다
 * (`commercial-building-valuation.ts` `calcStdPriceSum`: 토지·건물 각각 정수화 후 합산).
 * 어긋나면 UI·validate가 보는 조건과 엔진 판정이 갈린다.
 */
export function isSec164_8ProvisoApplicable(asset: AssetForm): boolean {
  // 적용 cbEra — 명시 선택이 없으면 취득일에서 파생(UI·API·validate와 단일 소스).
  if (resolveCbEra(asset) !== "pre_disclosure") return false;
  const acq = stdPriceSumAt(asset, "acq");
  const first = stdPriceSumAt(asset, "first");
  return acq > 0 && acq === first;
}

/** 시점별 기준시가합 = INT(개별공시지가 × 대지면적) + INT(건물 기준시가 총액). */
export function stdPriceSumAt(asset: AssetForm, point: "acq" | "first"): number {
  const landArea = parseDecimal(asset.cbLandArea);
  const landPrice = parseAmount(
    point === "acq" ? asset.cbLandPricePerSqmAtAcq : asset.cbLandPricePerSqmAtFirst,
  );
  const building = parseAmount(
    point === "acq" ? asset.cbBuildingStdPriceAtAcq : asset.cbBuildingStdPriceAtFirst,
  );
  if (!landArea || !landPrice || !building) return 0;
  return Math.floor(landPrice * landArea) + Math.floor(building);
}
