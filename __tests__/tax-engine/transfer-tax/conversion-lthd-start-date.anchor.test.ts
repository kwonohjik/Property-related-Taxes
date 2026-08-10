/**
 * anchor: **주택→상가 용도변경 LTHD 기산일 — 판정 축은 「다주택」이 아니라 「LTHD 배제 자산」**
 *
 * ## 무엇이 틀렸었나
 *
 * `resolveLTHDStartDate`는 `wasMultiHouseAtConversion`(= 다주택이었나) **boolean 하나만** 보고
 * 기산일을 용도변경일로 밀었다. **시점 게이트가 0건**이었다.
 *
 * ## 예규 3건을 나란히 놓으면 축이 뒤집힌다
 *
 * | 문서 | 용도변경 당시 다주택? | 용도변경 당시 LTHD 대상? | 기산일 |
 * |---|---|---|---|
 * | 사전-2022-법규재산-0684 (2022.11.28.) | 예 | **아니오**(§104⑦1호 중과) | **용도변경일** |
 * | 사전-2022-법규재산-0881 (2022.12.28.) | 예 | **아니오**(중과세율 대상) | **용도변경일** |
 * | **사전-2024-법규재산-0161 (2024.05.03.)** | **예** | **예**(’12~’18 가능기) | **당초 취득일** |
 *
 * 0161 답변: "**용도변경일 당시 장기보유특별공제가 적용되는 주택**을 근린생활시설로 용도변경 후
 * 양도하는 경우 … 보유기간 기산일은 **그 건물의 취득일**로 하는 것입니다."
 * 0161 각주: "’12.1.1.～’18.3.31.까지 다주택자의 주택 양도에 대해 장기보유특별공제 가능"
 *
 * ## 그 각주는 「소득세법」 §95② 괄호 연혁으로 확증된다 (법제처 DRF `target=eflaw` 실측)
 *
 * | 시행일 | §95② 괄호 = LTHD 배제 자산 | 다주택 |
 * |---|---|---|
 * | ~2011.12.31 | "제104조제1항제4호부터 제10호까지의 규정에 따른 세율을 적용받는 자산 및 제104조제6항을 적용받는 자산은 제외" | **배제** |
 * | 2012.1.1~2015.12.31 | "제104조제3항에 따른 미등기양도자산 및 제104조의3에 따른 비사업용 토지는 제외" | **가능** |
 * | 2016.1.1~2018.3.31 | "제104조제3항에 따른 미등기양도자산은 제외" | **가능** |
 * | 2018.4.1~ | "제104조제3항에 따른 미등기양도자산과 **같은 조 제7항 각 호에 따른 자산**은 제외" | **배제** |
 *
 * ⇒ 경계는 **2012-01-01**과 **2018-04-01** 둘이다. 그 사이에 용도변경했다면 그 주택은
 *   다주택이어도 §95② 괄호에 걸리지 않았으므로 **배제 자산이 아니었고**, 기산일은 취득일이다.
 *
 * ## 게이트가 판정하는 것 / 사용자에게 남기는 것
 *
 * - 엔진: **시기**만 판정한다(2012-01-01 ≤ 용도변경일 < 2018-04-01 → 무조건 취득일).
 * - 사용자: 그 밖의 시기에서 「그 주택이 실제로 배제 자산이었는지」(조정대상지역·주택 수)를 답한다.
 *   시기만으로는 확정되지 않기 때문이다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveLTHDStartDate } from "@/lib/tax-engine/transfer-tax-lthd-start";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 용도변경 케이스 입력 — 기산일 축만 남기고 나머지는 고정한다. */
function conv(opts: {
  acquisition: string;
  conversion: string;
  transfer: string;
  wasMultiHouse: boolean;
}) {
  return baseTransferInput({
    acquisitionDate: new Date(opts.acquisition),
    transferDate: new Date(opts.transfer),
    acquisitionPrice: 300_000_000,
    transferPrice: 1_500_000_000,
    propertyType: "building",
    houseToCommercialConversion: true,
    conversionDate: new Date(opts.conversion),
    wasMultiHouseAtConversion: opts.wasMultiHouse,
  });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("CV — 주택→상가 용도변경 LTHD 기산일", () => {
  it("CV-1 사전-2022-법규재산-0684: '20.11 용도변경(중과 다주택) → 기산일 = 용도변경일", () => {
    // '17.12 A주택 취득 → '20.11 근린생활시설 용도변경(조정지역 2주택) → '22.5.31 양도
    const input = conv({
      acquisition: "2017-12-01",
      conversion: "2020-11-01",
      transfer: "2022-05-31",
      wasMultiHouse: true,
    });
    expect(iso(resolveLTHDStartDate(input))).toBe("2020-11-01");
  });

  it("CV-2 사전-2022-법규재산-0881: '19.12.30 용도변경(중과 다주택) → 기산일 = 용도변경일", () => {
    // '16.9.7 증여취득 → '19.12.30 주택부분 용도변경(건물 전체 근생) → '22.7.5 양도
    const input = conv({
      acquisition: "2016-09-07",
      conversion: "2019-12-30",
      transfer: "2022-07-05",
      wasMultiHouse: true,
    });
    expect(iso(resolveLTHDStartDate(input))).toBe("2019-12-30");
  });

  it("CV-3 🔴 사전-2024-법규재산-0161: '14.5 용도변경(다주택이나 LTHD 가능기) → 기산일 = 당초 취득일", () => {
    // 0161 사실관계: '75.1 신축 → '14.5 용도변경(다주택 해당하나 장특 가능) → '24.2 양도.
    // 다주택 여부는 **예**인데도 결론이 취득일이다 — 「다주택」 축을 단독으로 반증하는 케이스.
    const input = conv({
      acquisition: "2000-01-01",
      conversion: "2014-05-01",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    });
    expect(iso(resolveLTHDStartDate(input))).toBe("2000-01-01");
  });

  it("CV-4 경계 2011-12-31 용도변경(다주택) → 배제기이므로 용도변경일", () => {
    // §95② 괄호가 "제104조제1항제4호부터 제10호까지 … 세율을 적용받는 자산"을 배제하던 시기.
    const input = conv({
      acquisition: "2005-01-01",
      conversion: "2011-12-31",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    });
    expect(iso(resolveLTHDStartDate(input))).toBe("2011-12-31");
  });

  it("CV-5 🔴 경계 2012-01-01 용도변경(다주택) → 배제 조문에서 빠진 첫날이므로 취득일", () => {
    const input = conv({
      acquisition: "2005-01-01",
      conversion: "2012-01-01",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    });
    expect(iso(resolveLTHDStartDate(input))).toBe("2005-01-01");
  });

  it("CV-6 🔴 경계 2018-03-31 용도변경(다주택) → 가능기 마지막 날이므로 취득일", () => {
    const input = conv({
      acquisition: "2005-01-01",
      conversion: "2018-03-31",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    });
    expect(iso(resolveLTHDStartDate(input))).toBe("2005-01-01");
  });

  it("CV-7 경계 2018-04-01 용도변경(다주택) → §104⑦ 배제가 부활한 첫날이므로 용도변경일", () => {
    const input = conv({
      acquisition: "2005-01-01",
      conversion: "2018-04-01",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    });
    expect(iso(resolveLTHDStartDate(input))).toBe("2018-04-01");
  });

  it("CV-8 양성 대조군: 1주택(배제 아님)이면 시기와 무관하게 취득일", () => {
    // 이 단언이 없으면 「전부 취득일」 구현도 CV-3·5·6을 통과한다.
    for (const conversion of ["2011-12-31", "2014-05-01", "2020-11-01"]) {
      const input = conv({
        acquisition: "2005-01-01",
        conversion,
        transfer: "2024-02-01",
        wasMultiHouse: false,
      });
      expect(iso(resolveLTHDStartDate(input))).toBe("2005-01-01");
    }
  });

  it("CV-9 양성 대조군: 용도변경 토글 OFF면 conversionDate가 있어도 취득일", () => {
    const input = { ...conv({
      acquisition: "2005-01-01",
      conversion: "2020-11-01",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    }), houseToCommercialConversion: false };
    expect(iso(resolveLTHDStartDate(input))).toBe("2005-01-01");
  });

  it("CV-10 🔴 기산일이 세액까지 도달한다 — 0161 사안 결정세액", async () => {
    /**
     * 중간값(기산일)만 보면 「어느 단계를 보는가」가 어긋나도 통과할 수 있다.
     * 파이프라인 끝(결정세액)까지 단언해 게이트가 실제로 세액을 바꾸는지 고정한다.
     *
     * 정정 전 실측: 184,770,000 (기산일 2014-05-01)
     * 정정 후 정답: 165,060,000 (기산일 2000-01-01) — 과대분 19,710,000
     */
    const wrong = conv({
      acquisition: "2000-01-01",
      conversion: "2014-05-01",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    });
    const r = await calculateTransferTax(wrong, rates);
    expect(r.determinedTax).toBe(165_060_000);
  });

  it("CV-11 배제기(0684)는 세액이 달라야 한다 — 게이트가 전부를 끄지 않았음", async () => {
    // CV-10의 반대편. 게이트를 「항상 취득일」로 만들면 이 단언이 깨진다.
    const excluded = conv({
      acquisition: "2000-01-01",
      conversion: "2020-11-01",
      transfer: "2024-02-01",
      wasMultiHouse: true,
    });
    const notExcluded = { ...excluded, wasMultiHouseAtConversion: false };
    const a = await calculateTransferTax(excluded, rates);
    const b = await calculateTransferTax(notExcluded, rates);
    expect(a.determinedTax).toBeGreaterThan(b.determinedTax);
  });
});
