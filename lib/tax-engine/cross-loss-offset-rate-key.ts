/**
 * cross-loss-offset-rate-key.ts — **부동산 ↔ 기타자산 크로스 통산의 통합 세율축** (무의존 leaf)
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` §6 Q-1 **(가)**
 *
 * ## 왜 번역이 필요한가
 *
 * 「소득세법」 §102①**1호**는 §94①**1호·2호 및 4호**를 **한 호**에 담는다. 즉 부동산과
 * 기타자산은 같은 통산 그룹인데, 계산하는 엔진이 둘로 갈려 있다. 통산 코어
 * (`loss-offset-core.ts`)는 세목 중립이라 두 엔진의 행을 한 배열로 받을 수 있으나,
 * **`rateKey` 생산자가 둘이고 규약이 다르다**:
 *
 * | 엔진 | 생산자 | 예 |
 * |---|---|---|
 * | 부동산 | `loss-offset-rate-key.ts` | `prog:{호}` · `rate:{값}` · `solo:{자산}` |
 * | 주식·기타자산 | `stock-transfer-rate-calc.ts` `resolveStockRateKey` | `other_asset_progressive` … |
 *
 * **둘 다 §55① 기본누진인데 문자열이 다르다.** 그대로 이어 붙이면 영 §167의2①**1호(같은 세율
 * 먼저)가 죽고 2호(다른 세율 안분)로 떨어져 금액이 달라진다** — PR #1643이 부동산 «내부»에서
 * 고친 것과 **같은 병의 크로스판**이다(당시 실측 5,197,222원 과대·과소).
 *
 * ## 🔑 두 엔진은 한 줄도 바꾸지 않는다
 *
 * Q-1에서 **(가) 크로스 전용 번역**을 택했다. (나) 「두 엔진의 키 규약 통일」은 주식 내부 통산의
 * 기존 거동까지 흔들어 회귀 표면이 넓고, (다) 「세율 값으로만 비교」는 **순환**이라 주식 엔진이
 * 이미 기각했다(`stock-transfer-rate-calc.ts:91~92` — 값이 과세표준에 의존하고 과세표준은
 * 통산 결과에 의존한다).
 *
 * ⚠️ 그 대가로 이 표가 **세 번째 진실**이 된다. 세율표가 바뀌면 여기도 함께 본다 —
 *   그래서 anchor(`cross-loss-offset-rate-key.predo.anchor.test.ts`)가 **표 전체를 고정**한다.
 *
 * ## 같은 표라는 근거
 *
 * - **§55① 기본누진** — 부동산 §104①1호 ↔ 기타자산(§94①4호). 기타자산은 §104①1호 본문의
 *   「제55조제1항에 따른 세율」을 그대로 탄다.
 * - **기본 + 10%p** — 부동산 §104①**8호**(비사업용 토지) ↔ 기타자산 §104①**9호**(비사업용
 *   토지 과다소유 법인의 주식). **이 저장소가 이미 둘을 한 표로 계산한다** —
 *   `comparative-104-5-cross.ts:102`가 `clause8TaxBase + clause9TaxBase`를 **하나의
 *   `nbl89Brackets`**에 넣는다.
 *
 * ## 무엇을 `null`로 돌려주나 — 호 간 통산 차단
 *
 * 법 §102① 본문 후단: 「… 결손금은 **다른 호의 소득금액과 합산하지 아니한다**」.
 * 주식 그룹(§102①2호 = §94①3호)의 키(`"10"`·`"20"`·`"30"`·`"20_25"`)와 비과세·범위 밖은
 * **`null`**이다 — 호출자가 그 행을 크로스 배열에서 **제외**한다.
 *
 * ⛔ **`null`을 「묶지 않는 키」로 바꾸지 말 것.** 배열에 남으면 §167의2①**2호(다른 세율 안분)**
 *   로 흡수돼 **호가 다른 자산끼리 통산**된다 — 조문 정면 위반이다.
 */

/** 출처 엔진 — 같은 문자열이 양쪽에서 다른 뜻일 수 있어 반드시 함께 받는다. */
export type CrossRateKeySource = "real_estate" | "other_asset";

/** §55① 기본누진 (부동산 §104①1호 = 기타자산 본칙) */
export const CROSS_PROG_BASIC = "x:prog-basic";
/** 기본누진 + 10%p (부동산 §104①8호 = 기타자산 §104①9호) */
export const CROSS_PROG_NBL = "x:prog-nbl";
/** 조정지역 1세대 2주택 중과 +20%p (§104⑦1호) — 기타자산에 대응 없음 */
export const CROSS_PROG_SURCHARGE_20 = "x:prog-surcharge-20";
/** 조정지역 1세대 3주택 이상 중과 +30%p (§104⑦3호) — 기타자산에 대응 없음 */
export const CROSS_PROG_SURCHARGE_30 = "x:prog-surcharge-30";

/** 부동산 `prog:{호}` → 크로스 축 */
const REAL_ESTATE_PROG: Readonly<Record<string, string>> = {
  "prog:104-1-1": CROSS_PROG_BASIC,
  "prog:104-1-8": CROSS_PROG_NBL,
  "prog:104-7-1": CROSS_PROG_SURCHARGE_20,
  "prog:104-7-3": CROSS_PROG_SURCHARGE_30,
};

/** 기타자산 키 → 크로스 축. 여기 없는 주식 키는 §102①1호 그룹이 아니다. */
const OTHER_ASSET_PROG: Readonly<Record<string, string>> = {
  other_asset_progressive: CROSS_PROG_BASIC,
  other_asset_progressive_nbl: CROSS_PROG_NBL,
};

/**
 * 엔진별 `rateKey`를 **크로스 통산 축**으로 번역한다.
 *
 * @returns 크로스 축 키. **`null`이면 §102①1호 그룹이 아니다** — 호출자가 배열에서 제외한다.
 */
export function crossLossOffsetRateKey(
  source: CrossRateKeySource,
  rateKey: string,
): string | null {
  if (source === "other_asset") {
    // 기타자산(§94①4호)만 1호 그룹이다. 주식 그룹·비과세·범위 밖은 제외한다.
    return OTHER_ASSET_PROG[rateKey] ?? null;
  }

  // 부동산은 전부 §102①1호 그룹이다(§94①1·2호).
  const mapped = REAL_ESTATE_PROG[rateKey];
  if (mapped) return mapped;

  /**
   * 단일세율(`rate:{값}`)·호 불명(`solo:{자산}`)·미지의 키는 **기타자산에 대응이 없다**.
   * 버리면 부동산 «내부» 통산이 크로스 경로에서 사라지므로 **출처를 붙여 그대로 살린다** —
   * 같은 값끼리는 여전히 1호로 묶이고(`rate:0.7` 둘은 한 키), 기타자산과는 섞이지 않는다.
   */
  return `x:re:${rateKey}`;
}
