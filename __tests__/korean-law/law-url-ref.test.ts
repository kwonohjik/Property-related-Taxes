/**
 * law-url 파서 anchor — 도움말 법조문 인용 → 모달 조회용 {lawName, articleNum}
 *
 * 설계: docs/02-design/features/inheritance-gift-law-citation-link.engine.design.md
 * 케이스 인벤토리 C-1~C-11 (실측 UI 인용 기반)
 */

import { describe, it, expect } from "vitest";
import { parseLawRef, parseLawRefsForModal } from "@/lib/utils/law-url";

describe("parseLawRef — 단일 ref (회귀 보존)", () => {
  it("C-1 정식명 + §", () => {
    expect(parseLawRef("상속세및증여세법 §19")).toEqual({
      lawName: "상속세및증여세법",
      articleNum: "19",
    });
  });

  it("C-2 약칭 상증법 + 뒤 설명 무시", () => {
    expect(parseLawRef("상증법 §22 금융재산 상속공제")).toEqual({
      lawName: "상속세및증여세법",
      articleNum: "22",
    });
  });

  it("C-3 가지번호 §18의2", () => {
    expect(parseLawRef("상증법 §18의2")).toEqual({
      lawName: "상속세및증여세법",
      articleNum: "18의2",
    });
  });

  it("C-8 조특법 §99의4", () => {
    expect(parseLawRef("조특법 §99의4")).toEqual({
      lawName: "조세특례제한법",
      articleNum: "99의4",
    });
  });

  // ── 현행 실패 실증 (Pre-Do anchor 핵심) ──
  it("C-7 상증령 §15 → 시행령 정식명 (현행 실패 예상)", () => {
    expect(parseLawRef("상증령 §15")).toEqual({
      lawName: "상속세및증여세법 시행령",
      articleNum: "15",
    });
  });
});

describe("parseLawRefsForModal — 복합 인용 분해", () => {
  it("C-4 상증법 §60·시행령 §49②④ → 2 refs (시행령 상속)", () => {
    expect(parseLawRefsForModal("상증법 §60·시행령 §49②④")).toEqual([
      { lawName: "상속세및증여세법", articleNum: "60" },
      { lawName: "상속세및증여세법 시행령", articleNum: "49" },
    ]);
  });

  it("C-6 상증법 §18의2 + 상증령 §15 → 2 refs", () => {
    expect(parseLawRefsForModal("상증법 §18의2 + 상증령 §15")).toEqual([
      { lawName: "상속세및증여세법", articleNum: "18의2" },
      { lawName: "상속세및증여세법 시행령", articleNum: "15" },
    ]);
  });

  it("C-11 상증규 §17의3⑤ + §56⑤ → 후속 §56 본법불명 skip(텍스트 유지)", () => {
    // §56은 실제 상증령이나, 법령명 없는 후속 §는 직전(상증규) 오상속 방지 위해 skip (DE-3)
    expect(parseLawRefsForModal("상증규 §17의3⑤ + §56⑤")).toEqual([
      { lawName: "상속세및증여세법 시행규칙", articleNum: "17의3" },
    ]);
  });
});
