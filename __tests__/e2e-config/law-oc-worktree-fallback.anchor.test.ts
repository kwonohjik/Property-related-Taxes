/**
 * anchor: 워크트리 E2E가 `.env.local`에 의존하지 않는다 (2026-08-09).
 *
 * ## 무엇이 있었나
 *
 * `.gitignore`가 `.env*`를 제외하므로 `git worktree add`로 만든 트리에는 `.env.local`이
 * **없다**. 그러면 `app/law/page.tsx`의 `Boolean(process.env.KOREAN_LAW_OC)` 게이트가
 * **서버 렌더 단계에서** 검색창 대신 「API 키가 설정되지 않았습니다」 안내를 그리고,
 * `law-*` **12건이 「통합 검색창을 찾을 수 없음」으로 타임아웃**한다.
 *
 * `page.route` mock으로는 못 막는다 — mock은 브라우저 요청을 가로채는데 이 게이트는
 * 서버에서 화면을 갈라버려 검색창이 애초에 DOM에 없다.
 *
 * ## 왜 anchor인가 — 오판을 부르는 실패다
 *
 * 워크트리끼리 대조하면 양쪽 다 키가 없어 **둘 다 실패**한다. 「master에서도 실패하니
 * 기존 실패」로 읽히지만 **메인 트리에서는 통과**한다. 실제로 그렇게 오판했다.
 * 12건이 상시 빨간 상태로 남으면 E2E 실패를 무시하는 습관이 생긴다 — 그것이 진짜 손해다.
 *
 * ⚠️ 이 anchor는 「키가 유효한가」를 보지 않는다. **게이트를 통과시킬 값이 항상 있는가**만 본다.
 *    본문을 단언하는 5건은 이미 fixture mock이다(`e2e/_helpers/law-api-mock.ts`).
 */
import { describe, it, expect } from "vitest";
import config from "../../playwright.config";

/** webServer는 단일 객체 또는 배열이다 — 어느 쪽이든 첫 항목을 본다. */
function webServer() {
  const ws = config.webServer;
  return Array.isArray(ws) ? ws[0] : ws;
}

describe("워크트리 E2E — 법제처 키 폴백", () => {
  it("webServer가 KOREAN_LAW_OC를 항상 넘긴다 (.env.local 없이도 게이트 통과)", () => {
    const value = webServer()?.env?.KOREAN_LAW_OC;
    expect(value).toBeTruthy();
    expect(String(value).length).toBeGreaterThan(0);
  });

  it("실제 키가 있으면 그 값을 쓴다 — 더미로 덮어쓰지 않는다", () => {
    // 이 프로세스의 env가 폴백보다 우선한다는 계약. 값 자체는 환경마다 다르므로
    // 「process.env에 있으면 그것과 같다」로만 단언한다(CI·메인 트리 회귀 방지).
    const real = process.env.KOREAN_LAW_OC;
    if (real) expect(webServer()?.env?.KOREAN_LAW_OC).toBe(real);
    else expect(webServer()?.env?.KOREAN_LAW_OC).toBe("e2e-dummy-oc");
  });

  it("게이트가 읽는 변수명과 같다 — 이름이 갈리면 폴백이 무용지물이다", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const src = await readFile(resolve(process.cwd(), "app/law/page.tsx"), "utf8");
    // 양성 대조군 — 게이트 자체가 사라지면 이 단언이 먼저 깨진다.
    expect(src).toMatch(/process\.env\.KOREAN_LAW_OC/);
  });
});
