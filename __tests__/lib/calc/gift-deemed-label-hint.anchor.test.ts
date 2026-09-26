import { describe, it, expect } from "vitest";

import { CI_SHARES_LABEL, allocationMethodHint } from "@/components/calc/deemed-gift/capital-forms-shared";

/**
 * 「상속세 및 증여세법」§39 리뷰 **4단계** — ⑤ 라벨·안내가 법문·엔진과 어긋난 축.
 *
 * 이 배치는 세액을 직접 바꾸지 않는다. 바꾸는 것은 **사용자가 무엇을 입력하는가**다 —
 * 라벨이 시행령의 곱셈 인자와 다른 수를 지시하면 그 오입력은 어느 게이트에도 걸리지 않고
 * 그대로 계산된다(G-6 실측 33,335,000 차이).
 */

describe("[4-A] CI_SHARES_LABEL — direction별 곱셈 인자 (#29·#56)", () => {
  it("[LB-1] 고가 다목(제3자 직접배정) — 손해자는 «배정받지 아니한» 주주다", () => {
    // 「상증령」§29②5호 — 「… **신주를 배정받지 아니하거나** 균등한 조건에 의하여 배정받을
    //   신주수에 미달되게 신주를 배정받은 주주의 **배정받지 아니하거나 그 미달되게 배정받은
    //   부분의 신주수**」. 주어가 「주주」이고 소유격이 「주주의 … 부분의 신주수」다.
    //   증여자측 수량(제3자 배정분)은 같은 호에서 분수의 분자·분모로만 등장하고
    //   엔진이 `relatedAcquiredShares`·`ratioDenomShares`로 따로 받는다.
    expect(CI_SHARES_LABEL.high.third_party).toMatch(/배정받지/);
    expect(CI_SHARES_LABEL.high.third_party).not.toBe("직접배정 신주수");
  });

  it("[LB-2] 고가 라목(초과배정) — 손해자는 «미달 배정된» 주주다", () => {
    expect(CI_SHARES_LABEL.high.excess).toMatch(/미달/);
    expect(CI_SHARES_LABEL.high.excess).not.toBe("초과배정 신주수");
  });

  it("[LB-3] 🔑 고가 **가목**은 현행 라벨을 유지한다 — 대수적으로 동일하기 때문", () => {
    // §29②3호 다목 = 포기자의 실권주수 F × (특수관계인이 인수한 실권주수 R ÷ 실권주 총수 T).
    //   포기자 1인이면 F = T이므로 F × (R ÷ T) = R = 「배정받은 실권주수」다.
    //   여기를 «정정»하면 오히려 과다과세가 된다 — 리뷰 법령 렌즈가 원 지적을 이 범위에서 기각했다.
    expect(CI_SHARES_LABEL.high.forfeited_realloc).toBe("배정받은 실권주수");
  });

  it("[LB-4] 저가는 네 목 전부 종전 라벨 그대로다 — 손해자·수익자가 뒤바뀌지 않는다", () => {
    expect(CI_SHARES_LABEL.low.forfeited_realloc).toBe("배정받은 실권주수");
    expect(CI_SHARES_LABEL.low.third_party).toBe("직접배정 신주수");
    expect(CI_SHARES_LABEL.low.excess).toBe("초과배정 신주수");
    expect(CI_SHARES_LABEL.low.no_realloc).toBe("실권주수");
  });
});

describe("[4-B] allocationMethodHint — 「주권상장법인이」는 AND 조건이다 (#46·#48·#64)", () => {
  it("[HT-1] 공모 배정 + **비상장** → 「0이 됩니다」라고 말하면 안 된다", () => {
    // 「상증법」§39①1호 가목 괄호 — 「**주권상장법인이** … 모집방법으로 배정하는 경우는 제외한다」.
    //   비상장법인의 모집방법 배정은 제외 대상이 아니므로 **그대로 과세**된다.
    //   엔진도 `allocationMethod === "public_offering" && isListed === true`로 AND를 건다.
    const h = allocationMethodHint("public_offering", { isListed: false });
    expect(h).not.toMatch(/0이 됩니다/);
    expect(h).toMatch(/주권상장법인/);
    expect(h).toMatch(/과세/);
  });

  it("[HT-2] 양성 짝 — 공모 배정 + 상장이면 종전대로 제외를 안내한다", () => {
    const h = allocationMethodHint("public_offering", { isListed: true });
    expect(h).toMatch(/0이 됩니다/);
  });

  it("[HT-3] 전환주식 **발행 시점**은 배정방법이 결과에 닿지 않는다", () => {
    // 「상증령」§29②6호 나목 = 「전환주식 발행 당시 제1호부터 제5호까지의 규정에 따라 계산한 이익」.
    //   차감항은 **기준선**이라 엔진이 `allocationMethod: "normal"`로 고정해 호출한다
    //   (`convertible-stock.ts` — 리뷰 2-D). 그런데 안내는 「0이 됩니다」라고 말하고 있었다.
    const h = allocationMethodHint("public_offering", { isListed: true, leg: "issuance" });
    expect(h).not.toMatch(/0이 됩니다/);
    expect(h).toMatch(/영향/);
  });

  it("[HT-4] 양성 짝 — 전환 시점은 종전대로 제외가 발동한다", () => {
    const h = allocationMethodHint("public_offering", { isListed: true, leg: "conversion" });
    expect(h).toMatch(/0이 됩니다/);
  });

  it("[HT-5] 간주모집은 상장일 때만 「제외가 취소」가 의미를 갖는다", () => {
    expect(allocationMethodHint("deemed_public_offering", { isListed: true })).toMatch(/취소/);
    // 비상장은 애초에 제외가 발동하지 않으므로 「취소」라는 말이 성립하지 않는다.
    expect(allocationMethodHint("deemed_public_offering", { isListed: false })).not.toMatch(/취소/);
  });

  it("[HT-6] 일반 배정 안내는 상장 여부와 무관하게 같다", () => {
    expect(allocationMethodHint("normal", { isListed: true })).toBe(allocationMethodHint("normal", { isListed: false }));
  });
});
