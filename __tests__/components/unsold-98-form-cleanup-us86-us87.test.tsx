/**
 * @vitest-environment jsdom
 *
 * §98 시리즈 리뷰 3단계 J — 입력 폼 정비 (US-23 · US-26 · US-61 · US-80 · US-86 · US-87)
 *
 *  - US-86: 로컬 SectionShell 톤맵 제거 → <ToneCard sectionNum title> (다크 짝·정본 배지)
 *  - US-87: 직접 작성한 필드 라벨 text-sm, 법조문 hint text-xs (text-micro·text-xs 라벨 잔존 0)
 *  - US-23/26/61/80: 안내 문구 — 단정 문구 제거, 해석례·확인 필요 표기
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Unsold983InputForm } from "@/components/calc/transfer/Unsold983InputForm";
import { Unsold985InputForm } from "@/components/calc/transfer/Unsold985InputForm";
import { Unsold986InputForm } from "@/components/calc/transfer/Unsold986InputForm";
import { Unsold987InputForm } from "@/components/calc/transfer/Unsold987InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";

afterEach(cleanup);

type Of<T extends AssetReductionForm["type"]> = Extract<AssetReductionForm, { type: T }>;
const noop = () => {};
const f983 = getReductionDefault("unsold_98_3") as Of<"unsold_98_3">;
const f985 = getReductionDefault("unsold_98_5") as Of<"unsold_98_5">;
const f986 = getReductionDefault("unsold_98_6") as Of<"unsold_98_6">;
const f987 = getReductionDefault("unsold_98_7") as Of<"unsold_98_7">;

function renderAll() {
  return [
    render(<Unsold983InputForm value={f983} onChange={noop} />),
    render(<Unsold985InputForm value={f985} onChange={noop} />),
    render(<Unsold986InputForm value={f986} onChange={noop} />),
    render(<Unsold987InputForm value={f987} onChange={noop} />),
  ];
}

describe("US-86 — 섹션 카드 ToneCard 정본", () => {
  it("섹션 번호 배지가 TONE 정본(다크 짝 포함)이다", () => {
    for (const r of renderAll()) {
      const badge = r.getAllByText("①")[0];
      expect(badge.className).toContain("dark:bg-");
      expect(badge.className).toContain("dark:text-");
      const card = badge.closest("div.rounded-lg") as HTMLElement;
      expect(card.className).toContain("dark:border-");
      expect(card.className).toContain("dark:bg-");
      // 구 SectionShell 톤(950/40)이 남아 있지 않다
      expect(card.className).not.toContain("950/40");
    }
  });

  it("emerald 안내 박스가 정본 emerald 카드다", () => {
    for (const r of renderAll()) {
      const box = r.container.querySelector("div.border-emerald-200") as HTMLElement;
      expect(box).not.toBeNull();
      expect(box.className).toContain("bg-emerald-50/40");
      expect(box.className).toContain("dark:border-emerald-800");
    }
  });
});

describe("US-87 — 라벨·hint 정본 크기", () => {
  it("직접 작성한 label은 text-sm이고 text-micro hint는 없다", () => {
    for (const r of renderAll()) {
      const labels = Array.from(r.container.querySelectorAll("label.block"));
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) {
        expect(l.className).toContain("text-sm");
        expect(l.className).not.toContain("text-xs");
      }
      expect(r.container.innerHTML).not.toMatch(/<p[^>]*text-micro/);
    }
  });
});

describe("US-80 — 표1 단정 안내 정정 (Q-6 B)", () => {
  it("세 폼 모두 단서(표2)를 적고 거주기간별 공제율 해석례 부재를 확인 필요로 안내한다", () => {
    for (const r of [
      render(<Unsold983InputForm value={f983} onChange={noop} />),
      render(<Unsold985InputForm value={f985} onChange={noop} />),
      render(<Unsold986InputForm value={f986} onChange={noop} />),
    ]) {
      const t = (r.container.textContent ?? "").replace(/\s+/g, " ");
      expect(t).toContain("같은 항 단서의 1세대1주택에 해당하면 표2");
      expect(t).toContain("확인 필요");
      expect(t).toContain("법규과-742");
      expect(t).not.toContain("고가주택 등");
    }
  });
});

describe("US-23 · US-26 · US-61 — 단정 문구 정정", () => {
  it("§98의6: 사업주체등의 임대 사용은 입주가 아니라는 단정이 없고 492호를 인용한다", () => {
    const { container } = render(<Unsold986InputForm value={f986} onChange={noop} />);
    const t = container.textContent ?? "";
    expect(t).not.toContain("임대 사용은 입주가 아닙니다");
    expect(t).toContain("부동산거래관리과-492");
  });

  it("§98의7: 재계약 제외가 3호·4호 범위(해제 주택·해제자·배우자)로 서술된다", () => {
    const { container } = render(<Unsold987InputForm value={f987} onChange={noop} />);
    const t = container.textContent ?? "";
    expect(t).toContain("2012.9.24~12.31 중 해제된 주택 자체");
    expect(t).toContain("사업주체·주택 불문");
    expect(t).toContain("원래 계약을 체결하였던 사업주체등");
  });

  it("§98의7: 9.23 이전 해제 주택도 미분양주택이라는 해석례(570)를 안내한다", () => {
    const { container } = render(<Unsold987InputForm value={f987} onChange={noop} />);
    expect(container.textContent).toContain("부동산거래관리과-570");
  });
});
