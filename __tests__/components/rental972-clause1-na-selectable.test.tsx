/**
 * @vitest-environment jsdom
 *
 * anchor: §97의2 1호 나목(1999.8.19 이전 신축 공동주택)을 **선택할 수 있어야 한다** — UI 리뷰 高.
 *
 * `period-check.ts`의 §97의2는 호마다 축이 다르다(1호=신축일 / 2호=매매계약일). 그 갈림은
 * `rental972Type` 하나가 정하는데, `UnifiedReductionPanel`의 `buildPeriodContext`가 그 키를
 * **아예 넣지 않아** 항상 2호 분기로 판정됐다. 2호에는 「1999.8.19 이전」 갈래가 없으므로
 * 나목 사례는 언제나 `inPeriod=false`가 되고, `UnifiedReductionGroupSection:252`가 항목을
 * disabled로 만들어 **100% 면제를 선택할 방법 자체가 없었다**.
 *
 * 유형 라디오는 그 항목을 켜야 열리는 폼 안에 있어(`Rental972InputForm:51`) 우회도 불가능했다
 * — 「켜려면 골라야 하고, 고르려면 켜야 하는」 잠금이다.
 *
 * ⭐ 관측 지점은 **비활성 사유 문구**다. 항목이 시한 밖이면 카드에
 *   `⚠ …조특법 §97의2① 시한 외…`(period-check의 `failReason`)가 붙는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import {
  UnifiedReductionPanel,
  buildPeriodContext,
} from "@/components/calc/transfer/UnifiedReductionPanel";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    acquisitionDate: "1998-03-01", // 1호 나목 — 1999.8.19 이전 신축
    ...over,
  } as AssetForm;
}

/**
 * 패널을 렌더하고 **장기임대 카테고리를 펼친 뒤** §97의2 시한-외 사유가 붙었는지 본다.
 *
 * ⚠️ 펼치지 않으면 항목이 아예 렌더되지 않아 「문구 없음」이 항상 참이 된다 —
 *    그러면 이 anchor는 구별력 0이 된다(작성 중 실제로 그렇게 만들었다가 R972-3이 잡았다).
 */
function has972PeriodBlock(a: AssetForm): boolean {
  const { container } = render(
    <UnifiedReductionPanel asset={a} transferDate="2024-06-01" onChange={() => {}} />,
  );
  fireEvent.click(screen.getByText("장기임대주택").closest("button")!);
  const text = container.textContent ?? "";
  if (!text.includes("§97의2")) throw new Error("§97의2 항목이 렌더되지 않았다 — 셀렉터 확인");
  return text.includes("조특법 §97의2① 시한 외");
}

describe("§97의2 1호 나목 선택 가능성", () => {
  it("🔑 R972-1: 1999.8.19 이전 취득이면 시한-외로 막지 않는다 (나목 경로)", () => {
    expect(has972PeriodBlock(asset()), "나목 사례인데 시한 외로 막히면 면제를 켤 수 없다").toBe(
      false,
    );
  });

  it("R972-2: 2000년 취득(1호 가목·2호 공통 시한)도 막지 않는다 (회귀 가드)", () => {
    expect(has972PeriodBlock(asset({ acquisitionDate: "2000-06-01" }))).toBe(false);
  });

  it("🔑 R972-3: 두 축 모두 시한 밖이면 종전대로 막는다 — 게이트가 무의미해지지 않는다", () => {
    expect(has972PeriodBlock(asset({ acquisitionDate: "2010-06-01" }))).toBe(true);
  });

  /**
   * ⭐ ⑤ ctx 배관을 **값으로** 고정한다.
   *
   * `rental972Type`은 optional 키라 빠져도 tsc가 잡지 못한다(⑫⑬⑭와 같은 층위) —
   * 실제로 그 키가 없어 §97의2가 항상 2호로 판정됐다. 위 렌더 anchor는 period-check의
   * 미선택 낙관에 가려 이 누락을 보지 못하므로(작성 중 뮤테이션으로 실측), 여기서 직접 본다.
   */
  it("🔑 R972-4: 선택된 §97의2 폼의 유형이 ctx에 실린다 (키 누락 = 2호 고정)", () => {
    const withForm = asset({
      reductions: [
        {
          type: "rental_97_2",
          rental972Type: "construction",
          registrationDate: "",
          rentalStartDate: "",
        },
      ],
    } as unknown as Partial<AssetForm>);
    expect(buildPeriodContext(withForm, "2024-06-01").rental972Type).toBe("construction");
  });

  it("R972-5: 유형 미선택(\"\")은 undefined로 — period-check가 두 축을 연다", () => {
    const noType = asset({
      reductions: [
        { type: "rental_97_2", rental972Type: "", registrationDate: "", rentalStartDate: "" },
      ],
    } as unknown as Partial<AssetForm>);
    expect(buildPeriodContext(noType, "2024-06-01").rental972Type).toBeUndefined();
  });
});
