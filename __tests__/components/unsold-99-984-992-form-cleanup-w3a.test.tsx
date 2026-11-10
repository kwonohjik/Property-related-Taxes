/**
 * @vitest-environment jsdom
 *
 * W3a — §99·§99의2·§98의4 입력 폼 정비 (#3114 J·#3142 Y와 같은 방식)
 *  - 로컬 SectionShell 톤맵 삭제 → <ToneCard sectionNum title> (다크 짝)
 *  - emerald 안내 박스 → ToneCard emerald
 *  - 직접 작성 라벨 text-sm · 법조문 hint text-micro 부재
 *  - §98의4·§99의2 「최초 매매계약일」 필수 라벨(선택 표기 없음)
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { New99InputForm } from "@/components/calc/transfer/New99InputForm";
import { Unsold992InputForm } from "@/components/calc/transfer/Unsold992InputForm";
import { Unsold984InputForm } from "@/components/calc/transfer/Unsold984InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";

afterEach(cleanup);

const forms: Array<[string, () => ReturnType<typeof render>, string[]]> = [
  ["§99", () => render(<New99InputForm value={getReductionDefault("new_99") as never} onChange={() => {}} />), ["①", "②"]],
  ["§99의2", () => render(<Unsold992InputForm value={getReductionDefault("unsold_99_2") as never} onChange={() => {}} />), ["①", "②", "③", "④"]],
  ["§98의4", () => render(<Unsold984InputForm value={getReductionDefault("unsold_98_4") as never} onChange={() => {}} />), ["①", "②", "③"]],
];

describe.each(forms)("%s 폼", (_name, mount, badges) => {
  it("섹션 번호 배지·카드가 TONE 정본(다크 짝)이다", () => {
    const r = mount();
    for (const n of badges) {
      const badge = r.getAllByText(n)[0];
      expect(badge.className).toContain("dark:bg-");
      expect(badge.className).toContain("dark:text-");
      const card = badge.closest("div.rounded-lg") as HTMLElement;
      expect(card.className).toContain("dark:border-");
      expect(card.className).not.toContain("950/40 p-3");
    }
  });
  it("emerald 안내 박스가 정본 emerald 카드다", () => {
    const box = mount().container.querySelector("div.border-emerald-200") as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.className).toContain("dark:border-emerald-800");
  });
  it("label은 text-sm이고 text-micro 문단은 없다", () => {
    const r = mount();
    for (const l of Array.from(r.container.querySelectorAll("label.block"))) {
      expect(l.className).toContain("text-sm");
      expect(l.className).not.toContain("text-xs");
    }
    // §99는 공용 자식(New99LuxuryHouseFields·ReductionPhdInput — §99의3 등과 공유)의 text-micro hint가 남아 있어 폼 소스로 확인한다.
    if (_name === "§99") {
      expect(readFileSync("components/calc/transfer/New99InputForm.tsx", "utf8")).not.toMatch(/text-micro|SectionShell/);
    } else {
      expect(r.container.innerHTML).not.toMatch(/<p[^>]*text-micro/);
    }
  });
});

describe("W3a 계약일 칸", () => {
  it("§98의4: 필수 라벨 + data-field, 자산 칸 미사용 문구", () => {
    const r = render(<Unsold984InputForm value={getReductionDefault("unsold_98_4") as never} onChange={() => {}} />);
    expect(r.container.textContent).toContain("최초 매매계약일");
    expect(r.container.textContent).not.toContain("(선택)");
    expect(r.container.querySelector('[data-field="reduction.unsold_98_4.contractDate984"]')).not.toBeNull();
    expect(r.container.textContent).toContain("자산의 매매계약일 칸은 읽지 않습니다");
  });
  it("§99의2: 최초 매매계약일 data-field 존재", () => {
    const r = render(<Unsold992InputForm value={getReductionDefault("unsold_99_2") as never} onChange={() => {}} />);
    expect(r.container.querySelector('[data-field="reduction.unsold_99_2.contractDate992"]')).not.toBeNull();
  });
});
