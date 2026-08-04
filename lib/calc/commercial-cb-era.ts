/**
 * 상업용건물·오피스텔 「호별고시 취득 시점 구분」(`cbEra`) 파생 — 취득일 기준 자동 판정
 *
 * ## 왜 파생인가
 *
 * `cbEra`는 **취득일이 국세청 호별 고시 최초일(2005-01-01)보다 앞서는가**로 결정된다.
 * 취득일은 이미 자산 카드 상단에서 입력받으므로, 같은 사실을 라디오로 한 번 더 묻는 것은
 * 이중 입력이고 두 값이 어긋날 수 있는 dual-truth였다.
 *
 * ## 저장하지 않는다 (useEffect → store 미러링 금지)
 *
 * 취득일에서 파생한 값을 store에 **쓰지 않는다**. 대신 UI 표시·API 변환·validate가
 * 모두 `resolveCbEra()`를 거쳐 같은 fallback을 적용한다(3중 패턴).
 * 사용자가 라디오를 직접 고르면 그 값이 `asset.cbEra`에 저장되어 파생을 **덮어쓴다** —
 * 국세청 호별 고시 **대상이 아닌** 물건은 취득이 2005년 이후여도 호별고시가가 없어
 * §164⑥ 경로(`pre_disclosure`)를 써야 하므로, 수동 선택 경로를 남겨둔다.
 *
 * 경계일 2005-01-01은 엔진(`transfer-tax-commercial-step.ts` `COMMERCIAL_FIRST_DISCLOSURE_DATE`)·
 * 상속 상가 §163⑨2호(`transfer-tax-api-inheritance.ts`)와 같은 값이다.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export type CbEra = AssetForm["cbEra"];

/** 국세청 상업용건물·오피스텔 호별 기준시가 최초 고시일 (YYYY-MM-DD 문자열 비교용). */
export const COMMERCIAL_FIRST_DISCLOSURE_DATE = "2005-01-01";

/**
 * 같은 최초 고시일의 **연도**(숫자) — 건물 기준시가 계산기 시점 스펙(`StdPricePointSpec.year`)처럼
 * 숫자를 요구하는 곳에서 쓴다. 문자열 상수에서 매번 `slice(0,4)`로 파싱하면 파싱이 산재한다.
 */
export const COMMERCIAL_FIRST_DISCLOSURE_YEAR = 2005;

/**
 * 취득일 → 호별고시 시점 구분. 취득일 미입력이면 `""`(판정 불가).
 * 입력 형식은 `DateInput`이 만드는 `YYYY-MM-DD` — 미완성 값은 판정하지 않는다.
 */
export function deriveCbEra(acquisitionDate: string | undefined): CbEra {
  if (!acquisitionDate || acquisitionDate.length < 10) return "";
  return acquisitionDate < COMMERCIAL_FIRST_DISCLOSURE_DATE
    ? "pre_disclosure"
    : "post_disclosure";
}

/**
 * 실제로 적용할 `cbEra` — 사용자의 명시 선택 우선, 없으면 취득일에서 파생.
 * **UI·API 변환·validate가 모두 이 함수를 쓴다**(단일 소스).
 */
export function resolveCbEra(
  asset: Pick<AssetForm, "cbEra" | "acquisitionDate">,
): CbEra {
  return asset.cbEra || deriveCbEra(asset.acquisitionDate);
}

/** 표시용 — 현재 값이 사용자 선택이 아니라 취득일에서 자동 판정된 것인가. */
export function isCbEraAutoDerived(
  asset: Pick<AssetForm, "cbEra" | "acquisitionDate">,
): boolean {
  return !asset.cbEra && deriveCbEra(asset.acquisitionDate) !== "";
}
