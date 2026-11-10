/**
 * 부담부증여 × §163⑨ 단서 안내의 근거 문구(Q-29 a) — 양도일(= 부담부증여일)로 가른다.
 * 영 §163⑨ 본문 괄호 「부담부증여의 채무액에 해당하는 부분도 포함」은 대통령령 제30395호(2020.2.11. 공포 · 시행) 신설 ·
 * 부칙 제2조② 「이 영 시행 이후 양도하는 분부터」. 계획서 docs/00-pm/bg-163-9-proviso-post-deemed.plan.md §10.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BgSec163_9ProvisoSection } from "@/components/calc/transfer/BgSec163_9ProvisoSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);
const asset = { ...makeDefaultAsset(1), assetKind: "commercial_building", acquisitionCause: "inheritance" } as AssetForm;
const renderAt = (transferDate?: string) =>
  render(<BgSec163_9ProvisoSection asset={asset} onChange={() => {}} transferDate={transferDate} kind="commercial" />);

describe("BG163-BASIS — 근거 문구", () => {
  it("2020-02-11 양도(시행일 당일) — 본문 괄호", () => {
    renderAt("2020-02-11");
    expect(screen.getByTestId("bg-163-9-proviso-section").textContent).toContain("「부담부증여의 채무액에 해당하는 부분」");
  });
  it("2023-02-16 양도 — 본문 괄호 · 해석례 미확보 문구 없음", () => {
    renderAt("2023-02-16");
    const t = screen.getByTestId("bg-163-9-proviso-section").textContent ?? "";
    expect(t).toContain("2020.2.11. 신설 · 그 이후 양도분");
    expect(t).not.toContain("확인하지 못했습니다");
  });
  it("2020-02-10 양도(전날) — 괄호 없음 · 해석례(서면5팀-3272) · 단서 해석례 미확보", () => {
    renderAt("2020-02-10");
    const t = screen.getByTestId("bg-163-9-proviso-section").textContent ?? "";
    expect(t).toContain("2020.2.11. 전 양도분");
    expect(t).toContain("서면5팀-3272");
    expect(t).toContain("확인하지 못했습니다");
  });
  it("양도일 미입력 — 괄호를 근거로 단정하지 않는다(전 양도분 문구)", () => {
    renderAt(undefined);
    expect(screen.getByTestId("bg-163-9-proviso-section").textContent).toContain("2020.2.11. 전 양도분");
  });
});
