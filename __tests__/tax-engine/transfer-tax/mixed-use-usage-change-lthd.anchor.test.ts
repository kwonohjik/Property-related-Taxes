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
 * ## ⚠️ 별개 규칙 — 중과 기간 제외는 **다른 경로엔 이미 있다**
 *
 * **사전-2022-법규재산-0684**(2022.11.28.) — 용도변경 전 기간이 §104⑦1호 **중과 주택**이라
 * §95② 괄호로 LTHD **배제 자산**이었던 경우에는 기산일이 **용도변경일**이 된다.
 * 「기간 분할」이 아니라 **「배제 자산이던 기간은 세지 않는다」**는 별개 규칙이다.
 *
 * 🔴 **2026-08-10 정정** — 종전 주석은 이를 「미구현」이라 적었으나 **부정확했다**:
 *   · 단건 경로 — `transfer-tax-lthd.ts:292` `resolveLTHDStartDate`(사례 35, 예규번호 명시)
 *   · 일반건물 경로 — `general-building-valuation.ts:526-530`(카드로 전달)
 *   ⇒ 없는 곳은 **겸용주택 경로뿐**이고, 그것도 「배선 누락」이 아니라 **입력 자체가 없다**
 *     (`houseToCommercialConversion`·`wasMultiHouseAtConversion` grep 0건 — UI·API·타입 전부).
 *     즉 기능 미추가이지 결함이 아니다. UC-4는 그 **현재 상태**를 고정한다.
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

  it("UC-4 🟡 중과 기간 제외(사전-2022-법규재산-0684)는 **겸용 경로에 입력이 없다**", () => {
    /**
     * 단건(`transfer-tax-lthd.ts:292`)·일반건물(`general-building-valuation.ts:526-530`)은
     * 이 규칙을 **이미 구현**하고 있다(`houseToCommercialConversion`·`wasMultiHouseAtConversion`).
     * 겸용주택만 그 입력이 없어 기산일이 취득일 그대로다.
     *
     * ⚠️ 그래서 이건 **배선 결함이 아니라 기능 미추가**다 — 「입력했는데 세액이 그대로」가
     *    아니라 「입력할 칸이 없다」이다. 추가하려면 UI·API·타입이 함께 와야 한다
     *    ([[feedback_api_trigger_without_input_path_is_noop]]).
     * 구현하면 이 테스트는 뒤집힌다 — 그때 값을 맞추지 말고 삭제·재작성할 것.
     */
    const r = run(mixedUsePdfGap());
    const noChange = run(mixedUsePdfGap({ partialUsageChange: undefined }));
    expect(r.commercialPart.longTermDeductionRate).toBe(
      noChange.commercialPart.longTermDeductionRate,
    );
  });
});
