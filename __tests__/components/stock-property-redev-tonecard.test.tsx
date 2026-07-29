/**
 * @vitest-environment jsdom
 *
 * anchor: stock-transfer 9 + property/Step0 2 + RedevelopmentBlock 7 섹션카드 → <ToneCard noDark> 전환(회귀 0). 색상 ToneCard 24~26호.
 *   stock: MarketSample(amber①·emerald②)·PostListingClosing(emerald① fragment title)·TransferDate1Month(amber① fragment)·
 *          CapitalAdjustments(violet "CA" +행추가)·AcquisitionLots(sky 순수박스 text-sky-900)·MajorShareholder(violet×2 순수박스)·ExitTaxHoldings(amber map idx+1 삭제).
 *   property/Step0: 소유자정보·시가표준액(amber title형, 배지 없음).
 *   redev: 양도대상 sky①·출자자산 emerald②·청산금 amber③·일정금액 violet④·인가전취득가 sky⑤·비과세요건 violet"ⓘ"·조합원구분 rose"2a".
 *   props(무겁거나 내부 컴포넌트)라 class-equivalence로 검증. (배치23이 번호배지·titleExtra·★ 커버 → 여기선 신규 패턴: 문자열배지·fragment title·순수박스 override·title형)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ToneCard } from "@/components/calc/shared/ToneCard";

afterEach(cleanup);

describe("stock-transfer·property·redev <ToneCard> 전환 회귀 0 (24~26호)", () => {
  it("문자열 sectionNum 배지 (CA·ⓘ·2a) — badge textContent·tone·dark:0", () => {
    for (const [tone, num] of [["violet", "CA"], ["violet", "ⓘ"], ["rose", "2a"]] as const) {
      const { container } = render(
        <ToneCard tone={tone} sectionNum={num} title="t" bodyClassName="space-y-2" noDark />,
      );
      const box = container.firstChild as HTMLElement;
      const badge = box.querySelector("span.rounded-full") as HTMLElement;
      expect(badge.textContent).toBe(num);
      expect(badge.className).toContain(`bg-${tone}-200`);
      expect(box.className).toContain(`border-${tone}-200`);
      expect(box.className).not.toContain("dark:");
      cleanup();
    }
  });

  it("ReactNode(fragment) title — PostListing/TransferDate 동적 제목 렌더 (text-{t}-700)", () => {
    const { container } = render(
      <ToneCard
        tone="emerald"
        sectionNum={1}
        bodyClassName="space-y-3"
        noDark
        title={<>상장일 이후 1개월 종가 (소령 §165⑤ — {"2024-01-01"} ~ {"2024-01-31"})</>}
      />,
    );
    const box = container.firstChild as HTMLElement;
    const titleP = box.querySelector("p.font-semibold") as HTMLElement;
    expect(titleP.className).toContain("text-emerald-700");
    expect(titleP.textContent).toContain("상장일 이후 1개월 종가");
  });

  it("순수박스 className override + bodyClassName='' (AcquisitionLots text-sm text-sky-900, space 없음)", () => {
    const { container } = render(
      <ToneCard tone="sky" noDark className="text-sm text-sky-900" bodyClassName="">
        <p>총 매수</p>
      </ToneCard>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-sky-200");
    expect(box.className).toContain("bg-sky-50/40");
    expect(box.className).toContain("text-sm");
    expect(box.className).toContain("text-sky-900");
    expect(box.className).toContain("p-3");
    expect(box.className).not.toContain("space-y-2"); // bodyClassName="" → 원본과 동일 (space-y 없음)
    expect(box.className).not.toContain("dark:");
    expect(box.querySelector("span.rounded-full")).toBeNull(); // 헤더 없는 순수박스
  });

  it("title형 (배지 없음, sectionNum 無) — property/Step0 amber 소유자·시가표준액 카드", () => {
    const { container } = render(
      <ToneCard tone="amber" title="시가표준액 (안분 기준, §4)" bodyClassName="space-y-3" noDark />,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.querySelector("span.rounded-full")).toBeNull(); // 배지 없음
    const titleP = box.querySelector("p.font-semibold") as HTMLElement;
    expect(titleP.className).toContain("text-amber-700");
    expect(titleP.textContent).toBe("시가표준액 (안분 기준, §4)");
    expect(box.className).not.toContain("dark:");
  });
});
