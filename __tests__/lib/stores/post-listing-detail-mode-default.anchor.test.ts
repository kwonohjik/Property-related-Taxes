/**
 * `unlistedDetailMode` — **「신규 폼의 초기 선택」과 「값 부재의 해석」은 다른 문제다**.
 *
 * 사용자 결정(2026-09-02): 「환산 입력 방식」의 기본 선택을 «재무제표로 계산»(`full`)으로 한다.
 * 종전 기본은 `simple`(평가액 직접 입력)이었다.
 *
 * ⚠️ 이 필드의 `"simple"`은 저장소 8개 지점에 흩어져 있는데 **성격이 둘로 갈린다**:
 *
 *   (A) 신규 폼의 초기 선택      `createInitialStockFormData()`      → `full`로 바꾼다
 *   (B) 값이 없을 때의 해석       `?? "simple"` / `|| "simple"`        → `simple` 그대로 둔다
 *
 * (B)를 함께 바꾸면 **이 필드가 생기기 전에 저장된 폼**(sessionStorage·IndexedDB 이력)이
 * 복원될 때 결산서가 빈 채로 `full`이 되어 validate가 차단한다. 그 폼들이 실제로 쓰던 흐름은
 * `simple`(결과값 4필드)이었으므로, 부재값의 해석은 `simple`이 옳다.
 *
 * 정책: [[feedback_store_default_vs_ui_display_fallback]] ·
 *       [[feedback_new_asset_field_stale_sessionstorage_guard]]
 */

import { describe, it, expect } from "vitest";
import { createInitialStockFormData } from "@/lib/stores/calc-wizard-stock-form";
import { normalizeStockFormData } from "@/lib/stores/calc-wizard-stock-normalize";

describe("DM — unlistedDetailMode 기본값 축", () => {
  it("DM-1 신규 폼의 초기 선택은 «재무제표로 계산»(full)이다", () => {
    expect(createInitialStockFormData().unlistedDetailMode).toBe("full");
  });

  it("DM-2 저장된 값은 그대로 보존된다 (기본값이 덮어쓰지 않는다)", () => {
    for (const mode of ["simple", "listing_only", "full"] as const) {
      const out = normalizeStockFormData({ unlistedDetailMode: mode });
      expect(out.unlistedDetailMode).toBe(mode);
    }
  });

  it("DM-3 필드가 «없는» 레거시 폼은 full이 아니라 simple로 해석된다", () => {
    // 🔑 이 단언이 뒤집히면 옛 이력 복원이 「완전 재현」 모드로 열려 결산서 미입력 차단에 걸린다.
    const out = normalizeStockFormData({ marketType: "kosdaq" });
    expect(out.unlistedDetailMode).toBe("simple");
  });

  it("DM-4 알 수 없는 값도 simple로 떨어진다 (enum 방어)", () => {
    const out = normalizeStockFormData({ unlistedDetailMode: "pdf_3_screens" } as never);
    expect(out.unlistedDetailMode).toBe("simple");
  });
});
