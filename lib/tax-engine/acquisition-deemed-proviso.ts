/**
 * 간주취득 세율 — 「지방세법」 §15② 본문·단서
 *
 * ## 세율의 근거는 §7④⑤가 아니라 §15②다
 *
 * > ② 다음 각 호의 어느 하나에 해당하는 취득에 대한 취득세는 **중과기준세율을 적용**하여
 * > 계산한 금액을 그 세액으로 한다. **다만, 취득물건이 제13조제1항에 해당하는 경우에는
 * > 중과기준세율의 100분의 300을, 같은 조 제5항에 해당하는 경우에는 중과기준세율의
 * > 100분의 500을 각각 적용한다.**
 * > 1. **개수**로 인한 취득 … 2. 제7조제4항에 따른 … **토지의 가액 증가** …
 * > 3. 제7조제5항에 따른 **과점주주의 취득** …
 *
 * ⚠️ **「법인 보유 자산 종류별 표준세율」은 §15②에 없다.** 본문이 표준세율을 중과기준세율로
 *    통째 치환하므로 토지 4%·주택 1~3% 같은 §11 세율은 간주취득에 등장하지 않는다.
 *    종전 주석(`acquisition-tax-rate.ts`)이 2%를 「임시값」이라 적었던 것은 **오기**다.
 *
 * ## 단서의 기준은 「취득**물건이**」 — 물건 단위다
 *
 * 과점주주(§15②3호)는 법인이 여러 물건을 보유하므로 **물건마다 갈린다**.
 * 조심 1998-0634은 골프장 안의 부동산 중 수영장만 중과 대상으로 보고 테니스장·게이트볼장·
 * 골프연습장을 제외해 처분을 경정했다(5,118,929,000 → 5,065,179,000). 그래서
 * `assessMajorShareholder`가 `assetBuckets`를 받는다.
 *
 * ## §13①(6%)은 넣지 않는다
 *
 * §13①은 「**신축하거나 증축하는**」·「공장을 **신설하거나 증설하기 위하여**」라는 **행위**
 * 요건이다. 간주취득에 이 요건이 어떻게 대응되는지는 문언만으로 결정되지 않는다.
 * 6%는 2%의 3배라 근거 없이 적용하면 **법 근거 없는 불리 적용**이 된다
 * (계획서 U-1 — `docs/00-pm/acquisition-deemed-15-2-proviso.plan.md`).
 * 반면 §13⑤는 골프장·고급주택·고급오락장·고급선박이라는 **물건의 상태**만 정의하므로
 * 「취득물건이 해당하는가」가 그대로 성립한다.
 *
 * ## ⚠️ 이 세율은 §13⑤ 경로와 **대수적으로 같은 수**에 착지한다 — 우연이 아니다
 *
 *   `중과기준세율 + 중과기준세율×400%` (§13⑤ 산식) `= 중과기준세율×500%` (§15② 단서)
 *
 * 간주취득에서는 `basicRate`가 곧 중과기준세율이라 `assessSurcharge`의 §13⑤ 분기도 10%를
 * 낸다. 그래서 **버킷을 쓰지 않는 단일 물건 경로는 엔진을 고치지 않았다.** 두 경로가 같은
 * 수를 내는지는 `deemed-15-2-proviso.anchor.test.ts`가 고정한다 — 한쪽이 바뀌면 red.
 */

import { ACQUISITION, ACQUISITION_CONST } from "./legal-codes";

/**
 * §15② 단서 구분 — 취득물건이 §13⑤(사치성)에 해당하는가.
 *
 * `"none"`  → 본문: 중과기준세율 2%
 * `"luxury"` → 단서: 중과기준세율 × 500% = 10%
 */
export type DeemedProviso = "none" | "luxury";

/** §15② 본문·단서 세율 */
export function deemedProvisoRate(proviso: DeemedProviso | undefined): number {
  return proviso === "luxury"
    ? ACQUISITION_CONST.HEAVY_TAX_BASE_RATE * ACQUISITION_CONST.DEEMED_PROVISO_LUXURY_MULTIPLIER
    : ACQUISITION_CONST.HEAVY_TAX_BASE_RATE;
}

/** 세율 근거 조문 — 본문/단서 구분 */
export function deemedRateLegalBasis(proviso: DeemedProviso | undefined): string {
  return proviso === "luxury" ? ACQUISITION.DEEMED_RATE_PROVISO : ACQUISITION.DEEMED_RATE;
}

/** 화면 표기용 라벨 */
export function deemedProvisoLabel(proviso: DeemedProviso | undefined): string {
  return proviso === "luxury"
    ? "사치성 재산 (§13⑤) — 중과기준세율 × 500%"
    : "일반 — 중과기준세율";
}

/**
 * 최상위 사치성 플래그 → §15② 단서 구분.
 *
 * 단일 물건(지목변경·개수)과 버킷 미사용 과점주주가 쓴다. 버킷을 쓰면 행마다 자기
 * `proviso`를 들고 있으므로 이 함수를 거치지 않는다(이중 적용 방지 — ④가 strip 한다).
 */
export function provisoFromLuxuryFlag(isLuxuryProperty: boolean | undefined): DeemedProviso {
  return isLuxuryProperty === true ? "luxury" : "none";
}
