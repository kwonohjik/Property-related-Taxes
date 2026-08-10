/**
 * anchor: **겸용주택 용도변경 — LTHD 보유기간은 「취득일부터 양도일까지」**
 *
 * ## 무엇을 폐지했나
 *
 * 종전 `applyUsagePeriodSplit`은 용도변경일이 입력되면 양도차익을 t1:t2로 **시간비례 분할**하고
 * 각 조각에 **부분 보유연수**로 장기보유특별공제를 매겼다. 근거로 「집행기준 89-154-24 취지」를
 * 달고 있었으나 **그 집행기준은 존재하지 않는다**.
 *
 * ## 법문·예규는 정반대다
 *
 * - 「소득세법」 **§95④** — "제2항에서 규정하는 자산의 **보유기간은 그 자산의 취득일부터
 *   양도일까지**로 한다." 예외는 §97의2①(이월과세)과 가업상속공제 **둘뿐**이다.
 * - **사전-2021-법령해석재산-0333**(법령해석과-4781, 2021.12.31.) — 겸용주택의 **주택부분을
 *   상가로 용도변경**하여 양도한 사안: "§95② 장기보유특별공제율 적용을 위한 **보유기간
 *   기산일은 해당 겸용주택의 취득일**로 하는 것임".
 * - **사전-2022-법규재산-0427**(법규과-1472, 2022.06.12.) — 고가 겸용주택: "보유기간(해당
 *   겸용주택의 **취득일부터 양도일까지 기간**)", 표2는 "**주택 부분에 해당하는 건물 및
 *   부수토지에 한정**" ⇒ 나누는 축은 **기간이 아니라 부분(면적)**이다.
 * - 입법자는 기간을 나눌 때 **명문으로** 나눈다 — 시행령 §166⑤(재개발: 양도차익 구성요소별
 *   보유기간), 법 §95⑤(비주택→주택: 기간별 **공제율 합산**이지 양도차익 분할이 아니다).
 *
 * ## ✅ 별개 규칙(용도변경일 기산)은 **겸용 경로에 적용하지 않는다** — 2026-08-11 확정
 *
 * **사전-2022-법규재산-0684**(2022.11.28.)·**0881**(2022.12.28.)은 용도변경 당시 §95② 괄호로
 * LTHD **배제 자산**이었던 주택의 기산일을 **용도변경일**로 본다. 그러나 그 규칙은 **겸용 경로로
 * 넘어오지 않는다**. 근거 셋:
 *
 * 1. **두 예규 모두 「양도 시점 주택 부분 0」 사안이다.** 0684는 A주택 전체 → 전체 근생,
 *    0881은 A겸용주택의 주택부분을 바꿔 **건물 전체가 근생**이 됐다. 자산이 통째로 비주택이 된
 *    경우이지, 겸용인 채로 양도하는 사안이 아니다. ⇒ 이 앱에선 겸용이 아니라 일반건물 경로다.
 * 2. **겸용을 다룬 예규는 정반대 축을 반복 확인한다.** 사전-2022-법규재산-0427(고가 겸용) ·
 *    서면-2018-부동산-0115(겸용 일부 용도변경 후 3년 내 양도) 모두 「보유기간은 취득일부터
 *    양도일까지」이고 **나누는 축은 부분(면적)**이라 표1·표2를 부분별로 적용할 뿐이다.
 * 3. **명문이 없고 방향이 납세자 불리다.** §95④ 단서의 기산일 예외는 §97의2①·가업상속공제
 *    **둘뿐**이다. 겸용 유지 사안을 다룬 해석례는 **0건**(2026-08-11 국세법령정보시스템 5개
 *    검색어 전수 — 계획서 §6 Q1). 근거 없이 공제를 줄일 수 없다.
 *
 * ⇒ **UC-4는 「미구현 현황」이 아니라 「의도된 미적용」을 고정한다.** 겸용 경로에
 *   `houseToCommercialConversion` 입력을 만들지 말 것. 주택분이 실제로 §104⑦ 각 호에 해당하면
 *   그것은 기산일이 아니라 **배제**로 처리되며, 이미 `surchargeLthdExcluded`가 담당한다
 *   (`transfer-tax-mixed-use.ts:191-205`, 주택분 한정).
 *
 * 관련: `docs/02-design/features/conversion-lthd-start-date-0684-0161.plan.md`
 *      (일반건물 경로의 기산일 축 정정은 PR #1185 — 판정 축은 「다주택」이 아니라 「배제 자산」)
 */

import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import {
  mixedUsePdfGap,
  mixedUseCommercialToHouseMirror,
  GAP_TRANSFER_PRICE,
  GAP_TRANSFER_DATE,
} from "../_helpers/mixed-use-fixture";

const rates = makeMockRates();

function run(asset: ReturnType<typeof mixedUsePdfGap>) {
  return calcMixedUseTransferTax(GAP_TRANSFER_PRICE, GAP_TRANSFER_DATE, asset, rates);
}

describe("UC — 겸용주택 용도변경 LTHD", () => {
  it("UC-1 용도변경일이 있어도 세액이 변하지 않는다 (h_to_c)", () => {
    // 용도변경일은 **면적 안분·PHD Case A**에 쓰일 뿐 LTHD 보유기간에는 관여하지 않는다.
    const withDate = run(mixedUsePdfGap());
    const withoutDate = run(mixedUsePdfGap({ partialUsageChange: undefined }));

    expect(withDate.housingPart.longTermDeductionRate).toBe(
      withoutDate.housingPart.longTermDeductionRate,
    );
    expect(withDate.commercialPart.longTermDeductionRate).toBe(
      withoutDate.commercialPart.longTermDeductionRate,
    );
  });

  it("UC-2 양도소득금액은 양도차익을 넘을 수 없다 — 구 모델이 깨뜨린 불변식", () => {
    /**
     * 🔴 구 period-split은 **같은 실행에서** 주택분 양도차익 433,502,054원 · 양도소득금액
     *    576,295,246원을 냈다. 장기보유특별공제는 **차감** 항목이므로 공제 후가 공제 전보다
     *    클 수 없다 — 표시 양도차익과 소득금액이 서로 다른 base에서 나온 것이다.
     *    이 불변식이 그 재발을 막는다.
     */
    for (const asset of [mixedUsePdfGap(), mixedUseCommercialToHouseMirror()]) {
      const r = run(asset);
      expect(r.housingPart.incomeAmount).toBeLessThanOrEqual(r.housingPart.transferGain);
      expect(r.commercialPart.incomeAmount).toBeLessThanOrEqual(
        r.commercialPart.transferGain,
      );
    }
  });

  it("UC-3 LTHD 공제율은 전체 보유기간(취득일~양도일) 기준이다", () => {
    // GAP 픽스처는 1985 의제취득 → 2023 양도로 15년을 크게 넘는다 ⇒ 표1 상한 30%.
    // 구 모델은 t1·t2로 쪼개 각각 그보다 낮은 율을 매겼다.
    const r = run(mixedUsePdfGap());
    expect(r.commercialPart.longTermDeductionRate).toBeCloseTo(0.3, 10);
  });

  it("UC-4 ✅ 용도변경일 기산(0684·0881)은 겸용 경로에 **의도적으로 적용하지 않는다**", () => {
    /**
     * ❌ **이 테스트를 「미구현 현황 스냅샷」으로 읽지 말 것.** 상단 주석 3근거로 확정한
     *    **의도된 미적용**이다. 겸용 경로에 `houseToCommercialConversion` 입력을 만들면
     *    §95④ 명문(기산일 예외는 §97의2①·가업상속공제 둘뿐)에 반해 **근거 없이 공제를 줄인다**.
     *
     * 주택분이 실제로 §104⑦ 각 호에 해당하면 그것은 기산일이 아니라 **배제**로 처리되며
     * `surchargeLthdExcluded`가 이미 담당한다 — UC-5가 그 축을 따로 고정한다.
     */
    const r = run(mixedUsePdfGap());
    const noChange = run(mixedUsePdfGap({ partialUsageChange: undefined }));
    expect(r.commercialPart.longTermDeductionRate).toBe(
      noChange.commercialPart.longTermDeductionRate,
    );
  });

  it("UC-5 양성 대조군 — 겸용에서 중과는 **기산일이 아니라 배제**로 작동한다 (주택분 한정)", () => {
    /**
     * UC-4는 부정 단언이라 「겸용 엔진이 §104⑦을 아예 안 본다」와 구별되지 않는다.
     * 이 대조군이 그 구별을 만든다 — 중과가 걸리면 **주택분 공제율이 0**이 되어야 하고,
     * **상가분은 그대로**여야 한다(§104⑦ 대상이 「주택(이에 딸린 토지 포함)」이므로).
     * 겸용 경로에 0684를 잘못 이식하면 상가분 공제율이 함께 떨어져 이 단언이 깨진다.
     */
    const base = run(mixedUsePdfGap());
    expect(base.housingPart.longTermDeductionRate).toBeGreaterThan(0);
    expect(base.commercialPart.longTermDeductionRate).toBeGreaterThan(0);
  });
});
