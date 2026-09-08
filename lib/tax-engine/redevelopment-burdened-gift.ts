/**
 * 재개발·재건축(§166) × 부담부증여(§159) 결합 — **β 스케일**과 그 고지.
 *
 * 설계: `docs/02-design/features/burdened-gift-redevelopment-assets.{plan,engine.design}.md`
 *
 * ## 왜 필요한가 — 스케일이 어긋난 뺄셈
 *
 * §159①은 **「취득가액 및 양도가액」 두 항만** 안분한다. §166 산식의 나머지 항(관리처분계획상
 * 평가액·청산금·필요경비)은 **물건 전체 값** 그대로다. 그대로 결합하면
 *
 * ```
 *   인가전양도차익 = 평가액(물건 전체) − 취득가액(채무비율 안분)
 * ```
 *
 * 이 되어 **스케일이 다른 두 값을 뺀다**. P0 probe 실측에서 그 결과가 −30,781,500이었고,
 * 음수는 `redevelopment.ts`의 `splitLthdAmount`가 `gain <= 0`에서 장기보유특별공제를 0으로
 * 반환하기 때문에 **보유 15년의 공제가 통째로 사라진다**.
 *
 * ## β의 법적 지위 — 명문 없음 · 선례 부존재 (2026-08-12 조사)
 *
 * §159①은 취득가액·양도가액 두 항만 정하고, §166④1호의 「평가액」(= 관리처분계획등에 따라
 * **정하여진 가격**)은 물건에 관한 사실이라 채무 비율과 무관하다. §166은 법 §100④ 위임
 * 규정으로 §159와 같은 층위다. ⇒ **문언만 보면 안분하지 않는 쪽(α)이 맞다.**
 *
 * 선례 조사는 0건이었다 — 국세청 2질의 · 조세심판원 2질의 · 국세청 통합검색 547건
 * (「부담부증여 관리처분계획」) 상위 전수. 전부 비과세·장기보유공제 축이고 §166 산식 항의
 * 취급을 다룬 것은 없다.
 *
 * 그럼에도 β를 택한 근거는 셋이며, 어느 것도 조문 문언이 아니다:
 *
 *   1. **산식 정합성** — 위의 스케일이 어긋난 뺄셈을 없앤다.
 *   2. **불리 적용 회피** — α는 음수 분기의 장기보유공제를 소멸시켜 **세액을 높인다**.
 *      명문 없는 해석으로 납세자에게 불리한 결과를 강제할 수 없다.
 *   3. **비율 보존** — §166②1호의 안분 비율(`평가액 : 청산금`)은 분자·분모에 같은 `r`이
 *      걸려 **바뀌지 않는다**. β는 시기별 배분 구조를 건드리지 않고 스케일만 맞춘다.
 *
 * ⇒ **β를 적용하되 결과 화면에 고지한다**(`detectRedevelopmentBurdenedGiftNotice`).
 *
 * ## 적용 지점이 «하나»인 이유
 *
 * 설계 초안은 4분기(APT 납부/수령 · 입주권 납부/수령) 각각에 `× r`을 심으려 했다. 그러면
 * 분기가 늘 때마다 빠뜨릴 자리가 생기고, `runSuccessorMember`처럼 `computeRedevelopmentSplit`
 * **앞에서 조기 반환**하는 경로는 아예 도달하지 않는다.
 *
 * ⇒ `runRedevelopment` 진입부에서 **`RedevelopmentInfo`의 절대 금액항 4개만** 한 번에 줄인다.
 *   비율항은 분자·분모가 함께 `r`배라 자동으로 no-op이다.
 */

import { applyRatio } from "./tax-utils";
import type { RedevelopmentInfo } from "./types/transfer-redevelopment.types";

/**
 * β — §166 산식의 **물건 전체 스케일 절대항**을 채무비율 `r`로 줄인다.
 *
 * 대상 4개는 §166 산식이 직접 더하고 빼는 금액항이다:
 *
 * | 필드 | 조문 | 성격 |
 * |---|---|---|
 * | `rightsValue` | §166④1호 평가액 | 인가전 의제 양도가액 · 인가후 분양가 구성 |
 * | `settlementAmount` | §166①②의 청산금 | 분양가 구성 · 수령분 안분 |
 * | `preApprovalExpenses` | §97①2·3호 | 인가전 필요경비 |
 * | `postApprovalExpenses` | 동상 | 인가후 필요경비 |
 *
 * **줄이지 않는 것**:
 *   · 기준시가·면적 계열(`managementDisposalHousingPrice`·`housingStdPriceAt*`·`landStdPriceAt*`
 *     ·`landArea` 등) — §166③ 환산 산식의 **분자·분모**라 함께 줄이면 비율이 그대로이고,
 *     한쪽만 줄이면 비율이 깨진다. 애초에 부담부증여에서는 환산 분기가 점화되지 않는다
 *     (`transfer-tax-burdened-gift-step.ts`가 `useEstimatedAcquisition: false`를 강제).
 *   · 날짜·플래그·개월수 — 금액이 아니다.
 *
 * **취득가액에는 `r`을 곱하지 않는다** — §159 STEP 4가 이미 안분했다. 여기서 또 곱하면 `r²`가 된다.
 *
 * @param info  물건 전체 스케일의 §166 입력
 * @param debtRatio 채무비율 `r = B/C`. `undefined`·1이면 **원본을 그대로 반환**(일반 양도).
 */
export function scaleRedevelopmentForBurdenedGift(
  info: RedevelopmentInfo,
  debtRatio: number | undefined,
): RedevelopmentInfo {
  if (debtRatio === undefined || debtRatio === 1) return info;
  if (!(debtRatio > 0) || debtRatio > 1) {
    /**
     * `r`은 `B/C`이고 `assertBurdenedGiftEligible`이 `B > C`(초과부담부)를 이미 fail-fast
     * 시킨다. 여기에 도달했다면 상류 계약이 깨진 것이므로 조용히 통과시키지 않는다 —
     * 통과시키면 모든 금액항이 0이 되거나 부풀어 **세액만 조용히 틀린다**.
     */
    throw new Error(
      `[redev-burdened-gift] debtRatio ${debtRatio}는 (0, 1] 범위를 벗어났다 — ` +
        "소령 §159①의 B/C는 상증법 §47③상 1을 넘을 수 없다.",
    );
  }
  return {
    ...info,
    rightsValue: applyRatio(info.rightsValue, debtRatio),
    settlementAmount: applyRatio(info.settlementAmount, debtRatio),
    preApprovalExpenses: applyRatio(info.preApprovalExpenses, debtRatio),
    ...(info.postApprovalExpenses !== undefined
      ? { postApprovalExpenses: applyRatio(info.postApprovalExpenses, debtRatio) }
      : {}),
  };
}

/**
 * β 적용 고지 — 결과 화면 `warnings`에 실린다.
 *
 * 배선은 `detectBurdenedGiftMultiHouseWarning`(`burdened-gift-eligibility.ts`) 선례를 그대로
 * 따른다. 별도 컴포넌트를 만들지 않는다 — 결과 화면의 warning 표시 경로가 이미 있다.
 *
 * ⚠️ 문구에 유리·불리·절감 표현을 넣지 않는다. **적용한 방법과 그 근거 상태**만 기술한다.
 */
export function detectRedevelopmentBurdenedGiftNotice(args: {
  propertyType: string;
  hasRedevelopment: boolean;
  isBurdenedGift: boolean;
}): string | null {
  const isRedev =
    args.propertyType === "redevelopment_apt" || args.propertyType === "right_to_move_in";
  if (!isRedev || !args.hasRedevelopment || !args.isBurdenedGift) return null;
  return (
    "부담부증여로 재개발·재건축 자산을 이전하는 경우의 양도차익 산정" +
    "(「소득세법 시행령」 제159조와 제166조의 결합)에 관한 명문 규정과 해석례가 없습니다. " +
    "본 계산은 제166조 산식의 평가액·청산금·필요경비를 「양도로 보는 부분」 기준으로 안분하여 " +
    "산식의 스케일을 맞췄습니다. 신고 전 세무 대리인 확인을 권합니다."
  );
}
