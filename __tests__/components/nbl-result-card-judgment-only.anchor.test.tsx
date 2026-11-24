/**
 * anchor: NonBusinessLandResultCard `judgmentOnly` (판정 메뉴 PR-1 · 계획서 `nbl-judgment-menu.ui.plan.md` §6-3 · U-9)
 *
 * 1) `judgmentOnly` 미지정 = 현행 마크업 — 기준(`__fixtures__/nbl-result-card-baseline.json`: 길이 + sha256)은 **`judgmentOnly` 도입 전 코드에서** 떴다
 *    (재생성은 `NBL_BASELINE_WRITE=1` — 현행 코드가 맞다고 확신할 때만).
 * 2) `judgmentOnly` = 세율을 단정하는 문장 2곳만 판정 중심으로 바뀐다 — 「+10%p」·「중과」·「일반세율」이 카드 어디에도 없다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { CARD_CASES, jsonRound, judgeFromAsset } from "./_helpers/nbl-judgment-fixtures";

afterEach(cleanup);

const FIXTURE = path.join(process.cwd(), "__tests__/components/__fixtures__/nbl-result-card-baseline.json");

function html(name: string, extra: Record<string, unknown> = {}): string {
  const c = CARD_CASES[name];
  const judgment = judgeFromAsset(c.over, c.transferDate);
  const { container, unmount } = render(<NonBusinessLandResultCard judgment={judgment} {...(extra as object)} />);
  const out = container.innerHTML;
  unmount();
  return out;
}
const digest = (s: string) => ({ length: s.length, sha256: createHash("sha256").update(s).digest("hex") });

describe("NonBusinessLandResultCard — judgmentOnly 미지정 마크업 불변", () => {
  if (process.env.NBL_BASELINE_WRITE === "1") {
    it("기준 마크업 기록", () => {
      const out: Record<string, { length: number; sha256: string }> = {};
      for (const name of Object.keys(CARD_CASES)) {
        out[name] = digest(html(name));
        expect(html(name)).toBe(html(name));
      }
      writeFileSync(FIXTURE, JSON.stringify(out, null, 1) + "\n");
    });
    return;
  }
  const baseline = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, { length: number; sha256: string }>;
  it("fixture 키 = 케이스 키", () => {
    expect(Object.keys(baseline).sort()).toEqual(Object.keys(CARD_CASES).sort());
  });
  for (const name of Object.keys(CARD_CASES)) {
    it(`${name}: 현행 마크업과 동일`, () => {
      expect(digest(html(name))).toEqual(baseline[name]);
    });
  }
});

describe("NonBusinessLandResultCard — judgmentOnly 문구", () => {
  const FORBIDDEN = ["+10%p", "중과", "일반세율", "기본세율", "장기보유특별공제 표1"] as const;

  it("🔴 전 케이스에서 세율을 단정하는 문구가 카드 어디에도 없다", () => {
    for (const name of Object.keys(CARD_CASES)) {
      const c = CARD_CASES[name];
      const { container, unmount } = render(<NonBusinessLandResultCard judgment={judgeFromAsset(c.over, c.transferDate)} judgmentOnly />);
      const text = container.textContent ?? "";
      for (const f of FORBIDDEN) expect(text, `${name}: ${f}`).not.toContain(f);
      unmount();
    }
  });

  it("대조군 — 미지정은 현행 문구 그대로(배너·면적 안분)", () => {
    expect(html("nonBusinessVacant")).toContain("비사업용 토지 — 기본세율 +10%p 중과");
    expect(html("businessFarmSelf")).toContain("사업용 토지 — 일반세율이 적용됩니다.");
    expect(html("housingArea")).toContain("중과세(+10%p)가 적용됩니다");
  });

  it("배너는 판정만 말한다 — 비사업용·사업용", () => {
    const bad = judgeFromAsset(CARD_CASES.nonBusinessVacant.over);
    const good = judgeFromAsset(CARD_CASES.businessFarmSelf.over);
    const a = render(<NonBusinessLandResultCard judgment={bad} judgmentOnly />);
    expect(a.container.textContent).toContain("비사업용 토지에 해당합니다.");
    a.unmount();
    const b = render(<NonBusinessLandResultCard judgment={good} judgmentOnly />);
    expect(b.container.textContent).toContain("사업용 토지에 해당합니다.");
  });

  it("면적 안분 안내는 판정 문장 — 비율·근거는 그대로", () => {
    const c = CARD_CASES.housingArea;
    const j = judgeFromAsset(c.over);
    const { container } = render(<NonBusinessLandResultCard judgment={j} judgmentOnly />);
    expect(container.textContent).toContain("비사업용 면적분(전체의 50.0%)이 비사업용으로 판정됩니다.");
    expect(container.textContent).toContain("면적 안분 근거");
  });

  it("judgmentOnly는 두 문장 외 블록을 건드리지 않는다 — 그 두 문장을 마스킹하면 마크업이 같다", () => {
    for (const name of Object.keys(CARD_CASES)) {
      const c = CARD_CASES[name];
      const j = judgeFromAsset(c.over, c.transferDate);
      const strip = (h: string) =>
        h
          .replace(/<p class="text-sm font-bold [^"]*">[^<]*<\/p>/, "<BANNER/>")
          .replace(/<p class="text-caption text-muted-foreground mt-2 leading-snug">[^<]*(?:<!-- -->)?[^<]*/g, (m) => (m.includes("면적분") ? "<AREA/>" : m));
      const off = render(<NonBusinessLandResultCard judgment={j} />);
      const a = strip(off.container.innerHTML);
      off.unmount();
      const on = render(<NonBusinessLandResultCard judgment={j} judgmentOnly />);
      const b = strip(on.container.innerHTML);
      on.unmount();
      expect(b, name).toBe(a);
    }
  });

  it("JSON 왕복(Date → 문자열) 판정도 무오류 렌더 — 응답은 JSON을 거친다", () => {
    for (const name of Object.keys(CARD_CASES)) {
      const c = CARD_CASES[name];
      const j = jsonRound(judgeFromAsset(c.over, c.transferDate));
      expect(() => {
        const { unmount } = render(<NonBusinessLandResultCard judgment={j} judgmentOnly />);
        unmount();
      }, name).not.toThrow();
    }
  });
});
