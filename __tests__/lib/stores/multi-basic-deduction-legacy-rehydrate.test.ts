/**
 * anchor — **폐지된 `"MAX_BENEFIT"`가 세션에서 되살아나면 라디오가 「선택 없음」으로 보인다**
 *
 * 그 값은 sessionStorage에 persist돼 있고(`partialize`) 이력 record의 `inputData`에도 들어 있다.
 * 서버 Zod가 접어 주므로 **세액은 맞지만**, `RadioCardGroup`의 `value`가 어느 옵션과도 맞지 않아
 * 사용자는 설정을 잃은 것처럼 본다. ⇒ 리하이드레이션에서 법정 기본값으로 정규화한다.
 *
 * (2026-09-16 — 「높은 세율 우선」 폐지. §103②은 「감면소득금액 외 → 먼저 양도한 자산」이다.)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useMultiTransferStore } from "@/lib/stores/multi-transfer-tax-store";

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
 * 심어 둔 세션으로 스토어를 다시 리하이드레이션한다 — `persist.rehydrate()`는 모듈 평가 때와 같은
 * `merge` → `onRehydrateStorage` 경로를 탄다(`wizard-step-reset-on-reentry.test.ts`와 같은 방식).
 * 종전엔 테스트마다 `vi.resetModules()` 후 스토어를 다시 import해 첫 테스트가 모듈 그래프 평가(≈1초,
 * 부하 시 5초 한도 초과)를 테스트 시간 안에서 치렀다.
 */
async function freshStore() {
  await useMultiTransferStore.persist.rehydrate();
  return useMultiTransferStore;
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
