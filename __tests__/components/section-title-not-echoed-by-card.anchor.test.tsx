// @vitest-environment jsdom
/**
 * anchor — 섹션 헤더와 그 안 카드가 **같은 말을 두 번 하지 않는다**.
 *
 * 🔴 자산 카드 ② 섹션 헤더는 「양도정보」인데, 그 안 첫 카드 제목이 「양도 정보」였다.
 *    한 화면에 같은 말이 위아래로 붙어 뜨면서, 카드가 **무엇을 고르는 곳인지**는
 *    정작 아무도 말해주지 않았다(라디오는 양도 형태·원인을 고른다).
 *
 * ⇒ 카드 제목을 「양도 형태·원인」으로 바꾸고, 그때 설명 첫 문장(「양도 형태·원인을
 *   선택하세요.」)은 제목이 하는 말이 되어 지웠다.
 *
 * 전 세목 제목을 훑어 같은 유형을 찾았고(공백·기호 정규화 + import 3-hop 포함관계),
 * 실제 중복은 이 1건뿐이었다. 나머지 후보는 정당한 반복이다:
 *   · `GeneralBuildingBlock`의 「취득시」·「양도시」 ×2 — 토지 파트 / 건물 파트 병렬
 *   · 「조합원입주권 승계취득 정보」 ⊃ 「취득정보」 — 자식이 정보를 **더** 준다
 *   · 「증여세 계산 대상 수증자 선택」 ×2 — 서로 배타적인 결과 뷰
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import fs from "fs";
import path from "path";

afterEach(cleanup);

import { TransferModeBlock } from "@/components/calc/transfer/TransferModeBlock";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** ② 섹션 헤더 제목 — 카드가 이 말을 되풀이하면 안 된다. */
const SECTION_TITLE = "양도정보";

function asset(): AssetForm {
  return { ...makeDefaultAsset(1), assetKind: "land" } as AssetForm;
}

describe("[SEC-ECHO] ② 양도정보 — 섹션 제목을 카드가 되풀이하지 않는다", () => {
  it("섹션 헤더 제목이 실제로 「양도정보」다 (짝을 이루는 쪽 확인)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/calc/transfer/CompanionAssetCard.tsx"),
      "utf-8",
    );
    expect(src).toContain(`title="${SECTION_TITLE}"`);
  });

  it("카드 제목이 무엇을 고르는 곳인지 말한다", () => {
    render(<TransferModeBlock asset={asset()} onChange={vi.fn()} transferDate="2026-02-18" />);
    expect(screen.getByText("양도 형태·원인")).toBeTruthy();
  });

  it("카드가 섹션 제목을 되풀이하지 않는다 (공백 무시)", () => {
    const { container } = render(
      <TransferModeBlock asset={asset()} onChange={vi.fn()} transferDate="2026-02-18" />,
    );
    const flat = (container.textContent ?? "").replace(/\s+/g, "");
    expect(flat).not.toContain(SECTION_TITLE);
  });

  /**
   * 제목으로 승격한 말을 설명문이 다시 하면 되풀이가 자리만 옮긴 것이다.
   * (종전 설명 첫 문장이 정확히 「양도 형태·원인을 선택하세요.」였다.)
   */
  it("설명문이 제목을 다시 말하지 않는다", () => {
    const { container } = render(
      <TransferModeBlock asset={asset()} onChange={vi.fn()} transferDate="2026-02-18" />,
    );
    const flat = (container.textContent ?? "").replace(/\s+/g, "");
    expect(flat).not.toContain("양도형태·원인을선택하세요");
  });
});
