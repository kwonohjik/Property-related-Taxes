/**
 * anchor — **폐지된 `"MAX_BENEFIT"`가 세션에서 되살아나면 라디오가 「선택 없음」으로 보인다**
 *
 * 그 값은 sessionStorage에 persist돼 있고(`partialize`) 이력 record의 `inputData`에도 들어 있다.
 * 서버 Zod가 접어 주므로 **세액은 맞지만**, `RadioCardGroup`의 `value`가 어느 옵션과도 맞지 않아
 * 사용자는 설정을 잃은 것처럼 본다. ⇒ 리하이드레이션에서 법정 기본값으로 정규화한다.
 *
 * (2026-09-16 — 「높은 세율 우선」 폐지. §103②은 「감면소득금액 외 → 먼저 양도한 자산」이다.)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const KEY = "multi-transfer-tax-wizard";

/** persist 미들웨어가 읽는 모양 그대로 — 구 세션을 흉내낸다 */
function seedLegacySession(allocation: string) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      state: {
        form: {
          taxYear: 2026,
          properties: [],
          activePropertyIndex: 0,
          activeStep: "list",
          annualBasicDeductionUsed: "0",
          basicDeductionAllocation: allocation,
        },
      },
      version: 0,
    }),
  );
}

/**
 * 매번 **새로 초기화된** 스토어를 얻는다 — persist 리하이드레이션은 모듈 평가 시 1회뿐이라
 * 모듈 레지스트리를 비우지 않으면 첫 테스트의 상태가 이어진다.
 * (⚠️ `import("...?t=랜덤")`은 확장자 추론이 깨져 TS transform이 실패한다.)
 */
async function freshStore() {
  vi.resetModules();
  const mod = await import("@/lib/stores/multi-transfer-tax-store");
  return mod.useMultiTransferStore;
}

describe("다건 기본공제 배분 — 구 세션 정규화", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("폐지된 MAX_BENEFIT은 법정 기본값으로 접힌다", async () => {
    seedLegacySession("MAX_BENEFIT");
    const store = await freshStore();
    expect(store.getState().form.basicDeductionAllocation).toBe("EARLIEST_TRANSFER");
  });

  it("알 수 없는 값도 법정 기본값으로 접힌다", async () => {
    seedLegacySession("SOMETHING_ELSE");
    const store = await freshStore();
    expect(store.getState().form.basicDeductionAllocation).toBe("EARLIEST_TRANSFER");
  });

  it("🟢 유효한 선택(FIRST)은 그대로 보존된다", async () => {
    seedLegacySession("FIRST");
    const store = await freshStore();
    expect(store.getState().form.basicDeductionAllocation).toBe("FIRST");
  });
});
