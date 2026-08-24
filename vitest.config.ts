import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * 🔴 **환경은 파일 종류로 가른다 — 전역 jsdom은 CPU의 30%를 환경 구축에 썼다** (2026-08-25 실측)
 *
 * 종전엔 `environment: "jsdom"`이 전역이라 순수 함수 엔진 테스트(`__tests__/tax-engine/` 879
 * 디렉터리)까지 파일마다 jsdom을 세웠다. 전건 1488파일 실측:
 *
 *   | 구성        | 벽시계 | CPU 총합 | environment | setup |
 *   |-------------|--------|----------|-------------|-------|
 *   | 전역 jsdom  | 223.5s | 1811s    | **545.2s**  | 49.8s |
 *   | 종류별 분리 | 160.0s | 1305s    | 82.6s       | 7.2s  |
 *
 * 실제 테스트 실행은 89초인데 환경 구축이 545초 — **6배**였다. CI 러너는 2 worker라 CPU가
 * 곧 벽시계이므로 이 28% 감소가 그대로 CI 시간이다(vitest 862s → ~620s).
 *
 * `--environment=node`로 전건을 돌려 **실제로 DOM이 필요한 파일을 실측**했다: 1488 중 149건
 * (10%)뿐이고, 그중 `.test.ts`는 아래 3건이 전부였다. ⇒ 규칙은 **`.test.tsx` = jsdom,
 * `.test.ts` = node** + 예외 3건.
 *
 * ✅ **실행 집합은 종전과 완전히 동일하다** — 구 설정(전역 jsdom + `.test.{ts,tsx}` 단일 include,
 *    2026-08-25 이전)과 신 설정을 각각 json 리포터로 돌려 파일 집합을 대조했다: **양쪽 다 1488파일
 *    16366 passed**, 차집합 0. node 1265 + dom 223 = 1488 = 디스크 실측(`.test.ts` 1268 +
 *    `.test.tsx` 220 − DOM_TS 3건 중복 계상 보정)이다.
 *    ⚠️ **`--reporter=dot`의 요약은 파일 6개·테스트 65건을 적게 집계한다**(1482/16315로 보인다).
 *      커버리지를 대조할 때 dot 요약과 json을 섞어 비교하면 있지도 않은 누락을 만들어낸다.
 *
 * ⚠️ 컴포넌트를 렌더하는 `.test.ts`를 새로 만들면 `document is not defined`로 실패한다.
 *    그때는 파일을 `.test.tsx`로 만들거나 아래 `DOM_TS`에 추가할 것.
 * ⚠️ `setupFiles`(jest-dom 매처)는 **jsdom 프로젝트에만** 건다 — node 쪽엔 쓸 데가 없고,
 *    전건에 걸면 setup만 49.8초다.
 */
const DOM_TS = [
  // JSX는 없지만 createElement로 컴포넌트를 렌더한다
  "__tests__/components/calc/detailed-statement-993-income-deduction.anchor.test.ts",
  "__tests__/lib/stores/wizard-step-reset-on-reentry.test.ts",
  "__tests__/tax-engine/transfer-tax/estimated-acquisition-formula-display.anchor.test.ts",
];

const shared = {
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
};

export default defineConfig({
  ...shared,
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "node",
          environment: "node",
          include: ["__tests__/**/*.test.ts"],
          exclude: DOM_TS,
        },
      },
      {
        ...shared,
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./__tests__/setup.ts"],
          include: ["__tests__/**/*.test.tsx", ...DOM_TS],
        },
      },
    ],
  },
});
