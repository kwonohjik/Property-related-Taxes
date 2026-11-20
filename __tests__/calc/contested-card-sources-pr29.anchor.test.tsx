/**
 * PR-29 anchor (2026-11 리뷰 D-82 · I-33) — 양론 카드 출처 표기.
 *
 * - D-82: 머리말 「과세관청 해석과 조세심판원 결정의 결론이 다릅니다」가 C8(A 직접 근거 없음 · B 국세청 해석)·C6(둘 다 심판원 결정)에서
 *   사실과 달랐다 → 쟁점 중립 머리말 + 입장마다 근거 기관(`source`).
 * - I-33: 서면4팀-813 원문 확인(국세법령정보시스템 2008.03.27. — 「일반 주택 1채와 공동으로 상속받은 주택 2채를 보유하다 일반주택을 양도하는 경우
 *   1세대 1주택 비과세 규정을 적용받을 수 없는 것」)으로 「처분청 근거로만」 단서 해제 · C8 근거 날짜 5건(KoreanLaw nts 검색 실측) ·
 *   C7 A의 두 독법(소수지분 2채 회신 / 조심 2010서0825 처분청 의견 「순위에 따른 1주택만 … 제외」) 분리.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { runJudgment } from "./_one-house-pr6a-routes";
import { OneHouseContestedIssuesCard } from "@/components/calc/results/OneHouseContestedIssuesCard";
import type { OneHouseContestedIssue } from "@/lib/tax-engine/one-house/contested-issues";
import e001 from "./one-house-rulings/cases/E001.json";

afterEach(cleanup);

// C8 R-5 시료(PR-28 anchor) — 종전 2015-03-15 · 분양권 2022-03-15 · 완공 2025-09-15 · 양도 2026-06-15 · ③ 미답 → 결론 갈림
const c8: RulingCase = {
  id: "c8", docNo: "-", docDate: "-", basis: "current", today: "2026-10-10", summary: "-", bucket: "match",
  form: {
    isOneHousehold: true, transferDate: "2026-06-15", contractTotalPrice: "800000000",
    asset: { assetKind: "housing", acquisitionDate: "2015-03-15" },
    houses: [{ id: "b", region: "capital", acquisitionDate: "2025-09-15", acquisitionOrigin: "presale", rightAcquisitionDate: "2022-03-15" }],
  } as RulingCase["form"],
};
const issuesOf = async (c: RulingCase) => {
  const r = await runJudgment(buildCaseForm(c));
  return (r.data.contestedIssues ?? []) as OneHouseContestedIssue[];
};

describe("D-82 입장별 근거 기관", () => {
  it("C8 — A 「직접 근거 없음」 · B 「국세청 해석」 · 근거 날짜 5건", async () => {
    const c = (await issuesOf(c8)).find((i) => i.id === "155-1-presale-holding-completion")!;
    expect(c.positions[0].source).toContain("직접 근거 없음");
    expect(c.positions[1].source).toBe("국세청 해석");
    const all = c.positions.flatMap((p) => p.authorities).join(" ");
    for (const d of ["(2022.02.24.)", "(2024.10.22.)", "(2025.07.16.)", "(2026.01.27.)", "(2024.12.18.)"]) expect(all).toContain(d);
  });
  it("C6 — 두 입장 모두 심판원 결정", async () => {
    const dual = (e001 as RulingCase[]).find((c) => c.id === "E001-dual")!;
    const c = (await issuesOf(dual)).find((i) => i.id === "155-4-parental-care-merge-right-sale")!;
    expect(c.positions.map((p) => p.source).every((s) => s.includes("심판원"))).toBe(true);
  });
  it("카드 — 옛 머리말 없음 · 입장마다 「근거:」 줄", async () => {
    const issues = await issuesOf(c8);
    const r = render(<OneHouseContestedIssuesCard issues={issues} sectionNum="5" />);
    const t = r.container.textContent ?? "";
    expect(t).not.toContain("과세관청 해석과 조세심판원 결정의 결론이 다릅니다");
    expect(r.getByTestId("one-house-contested-155-1-presale-holding-completion-B-source").textContent).toBe("근거: 국세청 해석");
  });
});
