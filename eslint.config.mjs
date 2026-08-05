import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright 실행 산물 — HTML 리포트의 **minified 번들 JS**(단일 파일 640KB+)와 trace가
    // 여기 쌓인다. lint 대상에 들어가면 error 수백 건이 나 **pre-push가 통째로 막힌다**
    // (E2E를 한 번이라도 돌린 개발자는 전원 차단됨). .gitignore 대상이라 커밋과도 무관하다.
    "e2e/_artifacts/**",
    // 저장소 **안에** 만드는 git worktree — 전체 소스 사본이라 lint 대상에 들어가면
    // 같은 파일을 두 번 검사하고, 그 사본의 `.next`·산출물까지 딸려와 error 1,000건대가
    // 나 **pre-push가 통째로 막힌다**(2026-08-05 실측: 1,293 errors / 14,580 problems —
    // 전량이 `.claude/worktrees/**`·`.claire/**`에서 나왔다).
    // 위 `e2e/_artifacts`와 같은 이유·같은 조치다. 둘 다 `.gitignore` 대상이라 커밋과 무관하다.
    ".claude/worktrees/**",
    ".claire/**",
  ]),
]);

export default eslintConfig;
