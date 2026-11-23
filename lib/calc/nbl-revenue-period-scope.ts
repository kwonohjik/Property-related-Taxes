/**
 * 기타토지 업종 영위 기간(개시·폐업) · 과세기간별 수입금액(NBL-STATE-HISTORY-E3-②) — **④ 전송 · ⑤ 렌더 · ⑧ 검증이 같이 읽는 술어** (단일 소스).
 *
 * 따로 쓰면 한쪽만 바뀌어 막다른 길이 된다 — 화면에서 숨은 연도 행·칸의 stale 값이 전송돼 ⑫가 400으로 막거나, 엔진이 읽지 않는 칸을 ⑧이 요구한다.
 * 그래서 «토글이 적용되는가»(`nblRevenuePeriodApplies`)·«그 해 칸을 엔진이 읽는가»(`revenuePeriodReadsYear`)·«표가 받는 연도»(`revenuePeriodRowYears`)·«전송하는 행»(`revenuePeriodWireRows`)을
 * 이 파일 하나에 두고, 영위 구간 계산은 엔진 leaf(`deriveOperatingRange`·`operatingDaysInYear`)에 위임한다(⑫·⑭·판정과 같은 함수 — 3중 패턴).
 *
 * 폐업이 양도연도 T−1·T 안이면 엔진은 그 해의 기존 칸(`nblRevenueCurrent*`·`Prior*`)을 읽는다. 폐업이 T−2 이전이면 그 두 칸을 읽지 않는다(영위일이 없는 해).
 * 화면은 **칸을 숨기지 않고** «이 해는 영위일이 없어 판정에 쓰지 않음»을 알리며(필요한 칸을 숨겨 «모름 → 불통과»를 만들지 않는다), ⑧은 읽지 않는 해의 필수 규칙만 건너뛴다.
 * `useEffect → store` 미러링은 쓰지 않는다 — 화면은 이 파생을 읽기만 하고 표 값 쓰기는 onChange 핸들러가 한다. 자동 안분·자동 채움 없음(연도·영위일수는 날짜에서 표시용으로만 파생).
 *
 * 이 파일은 서버 모듈(`non-business-land-request.ts`)도 import하므로 React 컴포넌트를 import하지 않는다.
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { NblRevenueYearRowInput } from "@/lib/stores/calc-wizard-asset-nbl-other";
import { consumesRevenueHistory } from "@/lib/tax-engine/non-business-land/land-category";
import { deriveOperatingRange } from "@/lib/tax-engine/non-business-land/revenue-history";
import { operatingDaysInYear } from "@/lib/tax-engine/non-business-land/revenue-history";
import type { OperatingRange } from "@/lib/tax-engine/non-business-land/revenue-history";
import { nblAcquisitionDateOf } from "./nbl-unconditional-exemption-status";

/**
 * 「영위 기간」 토글이 이 자산에 적용되는가 — 정밀판정 ON · 기타토지(엔진 `consumesRevenueHistory`) · 수입금액비율 업종 선택.
 * 연접 다필지는 배제하지 않는다 — 엔진 ⑭는 필지와 무관하게 토지 단위 수입금액비율을 읽는다.
 */
export function nblRevenuePeriodApplies(asset: Pick<AssetForm, "nblUseDetailedJudgment" | "nblLandType" | "nblRevenueBusinessType">): boolean {
  return !!asset.nblUseDetailedJudgment && consumesRevenueHistory(asset.nblLandType) && !!asset.nblRevenueBusinessType;
}

/** 토글이 적용되고 켜져 있다 — 이 값이 거짓이면 현행(OFF)과 같다. ④ 전송 · ⑤ 렌더 · ⑧ 검증이 같이 읽는다. */
export function nblRevenuePeriodOn(asset: AssetForm): boolean {
  return nblRevenuePeriodApplies(asset) && asset.nblRevenuePeriodOn === true;
}

/**
 * 소유기간 중 영위 범위(첫날·마지막 날 포함) — 엔진 leaf. 취득일·양도일을 읽을 수 없으면 `undefined`.
 * 영위일이 하루도 없는 입력(개시일이 양도일 이후 · 폐업일 ≤ 개시일)도 `undefined`다 — 그 입력은 ⑧이 먼저 막는다.
 */
export function revenuePeriodRange(asset: AssetForm, transferDate: string | undefined): OperatingRange | undefined {
  const acq = toOptionalDate(nblAcquisitionDateOf(asset));
  const transfer = toOptionalDate(transferDate);
  if (!acq || !transfer) return undefined;
  return deriveOperatingRange(
    { businessStartDate: toOptionalDate(asset.nblRevenueCurrentBusinessStartDate), businessEndDate: toOptionalDate(asset.nblRevenueBusinessEndDate) },
    acq,
    transfer,
  );
}

/** 양도연도 — 양도일이 읽히지 않으면 `undefined`. */
function transferYearOf(transferDate: string | undefined): number | undefined {
  return toOptionalDate(transferDate)?.getUTCFullYear();
}

/**
 * 엔진이 그 해의 기존 칸(`current`=양도연도 T · `prior`=T−1)을 **읽는가** — 영위일이 있는 해만 읽는다(`evaluateRevenueHistory`의 `yearCell`).
 * 토글이 꺼졌거나 영위 범위를 알 수 없으면 **읽는다**(= 현행 요구 유지 — 칸을 숨기거나 규칙을 건너뛰지 않는다).
 */
export function revenuePeriodReadsYear(asset: AssetForm, transferDate: string | undefined, which: "current" | "prior"): boolean {
  if (!nblRevenuePeriodOn(asset)) return true;
  const range = revenuePeriodRange(asset, transferDate);
  const t = transferYearOf(transferDate);
  if (!range || t === undefined) return true;
  return operatingDaysInYear(range, which === "current" ? t : t - 1) > 0;
}

/** 표가 받는 과세연도 — 영위 범위가 걸치는 해 중 양도연도 T−2 이전만(오래된 해부터). T·T−1은 기존 당해·직전 칸이 말한다. */
export function revenuePeriodRowYears(asset: AssetForm, transferDate: string | undefined): number[] {
  if (!nblRevenuePeriodOn(asset)) return [];
  const range = revenuePeriodRange(asset, transferDate);
  const t = transferYearOf(transferDate);
  if (!range || t === undefined) return [];
  const years: number[] = [];
  for (let y = range.first.getUTCFullYear(); y <= Math.min(range.last.getUTCFullYear(), t - 2); y++) years.push(y);
  return years;
}

/** 저장된 행에서 그 해의 값. 없으면 빈 행. */
export function revenuePeriodRowOf(rows: ReadonlyArray<NblRevenueYearRowInput> | undefined, year: number): NblRevenueYearRowInput {
  return (rows ?? []).find((r) => r.year === String(year)) ?? { year: String(year), revenue: "", landValue: "" };
}

/**
 * ④ 가 와이어에 싣는 연도 행 — **저장된 행 중 표가 받는 연도의 것만**(오름차순). 개시일·폐업일을 바꿔 표에서 사라진 연도의 값은 store에 남지만(되돌리면 복원) 보내지 않는다.
 * ⑧은 같은 목록으로 leaf 검증을 한다(⑫는 와이어로 온 행만 본다 — 같은 집합).
 */
export function revenuePeriodWireRows(asset: AssetForm, transferDate: string | undefined): NblRevenueYearRowInput[] {
  const years = new Set(revenuePeriodRowYears(asset, transferDate).map(String));
  return (asset.nblRevenueYearRows ?? [])
    .filter((r) => years.has(r.year))
    .sort((a, b) => Number(a.year) - Number(b.year))
    .map((r) => ({ year: r.year, revenue: r.revenue, landValue: r.landValue }));
}

/**
 * ④ 와이어 3칸 — 술어가 거짓이면 **반드시** `false`·`""`·`[]`로 덮어 쓴다(`nbl*` prefix-pick은 저장값을 그대로 싣는다 — 숨은 stale 값이 닿으면 ⑧은 건너뛰는데 ⑫가 400으로 막는다).
 * 개시일은 기존 `nblRevenueCurrentBusinessStartDate`(단일 소스)가 prefix-pick으로 간다.
 */
export function revenuePeriodWireFields(asset: AssetForm, transferDate: string | undefined): {
  nblRevenuePeriodOn: boolean;
  nblRevenueBusinessEndDate: string;
  nblRevenueYearRows: NblRevenueYearRowInput[];
} {
  if (!nblRevenuePeriodOn(asset)) return { nblRevenuePeriodOn: false, nblRevenueBusinessEndDate: "", nblRevenueYearRows: [] };
  return { nblRevenuePeriodOn: true, nblRevenueBusinessEndDate: asset.nblRevenueBusinessEndDate ?? "", nblRevenueYearRows: revenuePeriodWireRows(asset, transferDate) };
}
