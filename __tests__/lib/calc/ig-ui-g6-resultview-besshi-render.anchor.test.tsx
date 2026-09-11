/**
 * @vitest-environment jsdom
 *
 * G6 «렌더» anchor — 별지 표의 «열 수»와 결과뷰 게이트·라벨은 실제 DOM으로 잰다.
 * 소스 문자열만 보면 「구조가 맞는가」를 증명하지 못한다.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { Besshi6_2Section2 } from "@/components/calc/inheritance/deduction-besshi/Besshi6_2Section2";
import { Page2NetAssetTable } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/Page2NetAssetTable";
import { Page1CoverSection } from "@/components/calc/inheritance/listed-stock/besshi/Page1CoverSection";
import type { Besshi6_2Data } from "@/lib/calc/cohabit-besshi-data";

afterEach(cleanup);

/** 한 행이 차지하는 논리 열 수 = Σ colSpan (colSpan 미지정은 1). */
function colCount(tr: HTMLTableRowElement): number {
  return Array.from(tr.cells).reduce((n, c) => n + (c.colSpan || 1), 0);
}

describe("IG-039 — 별지6호의2 상속인별 표: 모든 행이 19열로 맞물린다", () => {
  const data = (heirCount: number): Besshi6_2Data =>
    ({
      heirRows: Array.from({ length: heirCount }, (_, i) => ({
        name: `상속인${i + 1}`,
        residentNumber: "800101-1******",
        cohabitShare: 0.5,
        meetsCohabitYears: true,
        qualifiedShare: 0.5,
      })),
      totalQualifiedShare: 1,
    }) as unknown as Besshi6_2Data;

  function rowSpans(table: HTMLTableElement) {
    // rowspan이 덮는 행 수를 반영해 «각 행의 실제 열 수»를 복원한다.
    const rows = Array.from(table.rows) as HTMLTableRowElement[];
    const carry = new Array(rows.length).fill(0);
    return rows.map((tr, i) => {
      const own = colCount(tr);
      for (const c of Array.from(tr.cells)) {
        for (let k = 1; k < (c.rowSpan || 1); k++) {
          if (i + k < carry.length) carry[i + k] += c.colSpan || 1;
        }
      }
      return own + carry[i];
    });
  }

  it("H-1 (양성): 상속인 2명 — 헤더·데이터·패딩·⑨계 전 행이 19열", () => {
    const { container } = render(<Besshi6_2Section2 data={data(2)} />);
    const table = container.querySelector(
      '[data-testid="cohabit-besshi-row-3"]',
    ) as HTMLTableElement;
    expect(table).toBeTruthy();
    expect(rowSpans(table)).toEqual(new Array(table.rows.length).fill(19));
  });

  it("H-2: 상속인 6명 — 하드코딩 7이 아니라 파생값이라 여전히 19열", () => {
    const { container } = render(<Besshi6_2Section2 data={data(6)} />);
    const table = container.querySelector(
      '[data-testid="cohabit-besshi-row-3"]',
    ) as HTMLTableElement;
    expect(rowSpans(table)).toEqual(new Array(table.rows.length).fill(19));
  });

  it("H-3 (경계): 상속인 0명(전부 패딩)에서도 밴드가 시작돼 19열", () => {
    const { container } = render(<Besshi6_2Section2 data={data(0)} />);
    const table = container.querySelector(
      '[data-testid="cohabit-besshi-row-3"]',
    ) as HTMLTableElement;
    expect(rowSpans(table)).toEqual(new Array(table.rows.length).fill(19));
  });
});

describe("IG-062 — 별지 2쪽 「마 = 다 + 라」 항등식이 유지된다", () => {
  // 자산 < 부채 → 「다」가 음수가 되던 구간 (엔진은 §55① 후단 0 하한 → 「마」는 0)
  const raw = {
    bsTotalAssets: 100_000_000,
    bsTotalLiabilities: 900_000_000,
  } as never;

  /** 행의 «금액 셀»(3번째 td)만 읽는다 — 행 전체 텍스트에는 번호·라벨의 숫자가 섞인다. */
  const readAmount = (id: string) => {
    const tr = screen.getByTestId(`p2-${id}`) as HTMLTableRowElement;
    return Number((tr.cells[2].textContent ?? "").replace(/[^0-9-]/g, "") || "0");
  };

  it("H-4 (양성): 자산 < 부채여도 「다」가 0 하한을 받아 마 = 다 + 라가 성립한다", () => {
    render(<Page2NetAssetTable raw={raw} netAssetTotal={0} goodwillFinal={0} />);
    const da = readAmount("다");
    expect(da).toBe(0); // §55① 후단 0 하한 — 종전에는 −800,000,000이 찍혔다
    expect(da + readAmount("라")).toBe(readAmount("마"));
  });

  it("H-5 (음성·대조군): 자산 > 부채면 「다」가 그대로 차액이다 (무조건 0이 아니다)", () => {
    cleanup();
    render(
      <Page2NetAssetTable
        raw={{ bsTotalAssets: 900_000_000, bsTotalLiabilities: 100_000_000 } as never}
        netAssetTotal={800_000_000}
        goodwillFinal={0}
      />,
    );
    expect(readAmount("다")).toBe(800_000_000);
  });
});

// ════════════════════════════════════════════════
// IG-054 — §53⑧2호 배제가 «거부된» 사유가 화면에 뜬다
//
// ⚠️ 소스 문자열 anchor는 이 축에 «구별력 0»이었다 — 게이트를 `{false && …}`로 바꿔도
//    본문의 `{page1Values.section53_8_2FailLabel}`이 그대로 남아 통과했다.
//    조건만 바뀌고 문자열이 남는 형태다(G1의 「외국납부세액공제」 거짓 양성과 동형).
// ════════════════════════════════════════════════
describe("IG-054 — 할증 배제 거부 사유가 갑지에 렌더된다", () => {
  const besshi = (over: Record<string, unknown>) =>
    ({
      page1: { isUnlistedShareSection: false, valuationDate: "2024-06-01" },
      page1Values: {
        closingAvg: 10_000,
        perShareMajorShareholder: 10_000,
        majorShareholderRate: 0,
        ...over,
      },
      page2: {
        beforeM1: [], beforeM2: [], afterM1: [], afterM2: [],
        beforeSubtotal: 0, afterSubtotal: 0,
        tradingDays: 0, closingSum: 0, closingAverage: 0,
      },
    }) as never;

  it("H-6 (양성): fail 라벨이 있으면 rose 안내가 뜬다", () => {
    render(<Page1CoverSection besshi={besshi({ section53_8_2FailLabel: "평가기간 밖 매매계약" })} />);
    const el = screen.getByTestId("ls-besshi-p1-53-8-2-fail");
    expect(el.textContent).toMatch(/평가기간 밖 매매계약/);
    expect(el.textContent).toMatch(/할증 배제가 적용되지 않았습니다/);
  });

  it("H-7 (음성·대조군): 라벨이 없으면 안내가 없다", () => {
    cleanup();
    render(<Page1CoverSection besshi={besshi({})} />);
    expect(screen.queryByTestId("ls-besshi-p1-53-8-2-fail")).toBeNull();
  });
});
