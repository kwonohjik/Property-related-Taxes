import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

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
  // sessionStorage를 실제로 읽고 쓴다(자동 백업 id 세션 공유)
  "__tests__/lib/stores/multi-auto-backup-session-id.anchor.test.ts",
  // persist 리하이드레이션을 sessionStorage로 흉내낸다(폐지된 배분 전략 정규화)
  "__tests__/lib/stores/multi-basic-deduction-legacy-rehydrate.test.ts",
];

/**
 * 🔴 **node 테스트는 기본으로 모듈 격리를 끈다 — 실행 시간의 대부분이 import였다** (2026-10-21 실측)
 *
 * vitest는 기본으로 파일마다 모듈 그래프를 새로 올린다. CI 샤드(run 39551558331 test 3/4)는
 * 749초 중 **import 1664초 · tests 238초**(CPU 합)로, 같은 엔진 모듈을 파일마다 다시 올리는
 * 비용이 실행의 7배였다. 순수 함수 엔진 테스트는 격리가 필요 없다. 로컬 node 프로젝트 2484파일:
 *
 *   | 구성                      | 벽시계 | 결과                                  |
 *   |---------------------------|--------|---------------------------------------|
 *   | 전부 격리(종전)           | 371s   | 전건 통과                             |
 *   | 전부 격리 해제            | 41s    | **16파일 실패**(mock 11 · IndexedDB 5) |
 *   | mock·stub·IndexedDB만 격리 | 126s  | 전건 통과(31875 passed — 종전과 동일)  |
 *
 *   위 셋은 같은 시점에 잰 값이다. 현행 기준(아래 패턴 — store 등 추가, 격리 543파일)은 머신
 *   부하가 높은 상태에서 종전 731초 대 218초였다(같은 31875 passed). 부하가 달라 비율은 참고치다.
 *
 * ⇒ **전역 상태를 바꾸는 파일만 `node-isolated`로 보낸다.** 판정은 파일 본문 + 그 파일이
 *    import하는 `__tests__/` 안 보조 파일(재귀)에서 아래 패턴을 찾는다 — 보조 파일 14개가
 *    `vi.mock`·`vi.stubGlobal`·가짜 타이머를 품고 있어 테스트 파일만 보면 놓친다.
 *    목록을 손으로 관리하지 않으므로 새 테스트가 mock을 쓰면 자동으로 격리된다.
 *    zustand store(`use…Store`)도 격리한다 — 공유 모드에서 앞 파일이 남긴 `formData`가
 *    `...st.formData` 시드에 섞여 셔플 실행에서 실패했다(transfer-replot-increment-std-price).
 *
 * ⚠️ 격리를 끄면 **앞 파일이 남긴 상태 덕에 통과하는** 거짓 초록이 생길 수 있다(모듈 수준
 *    카운터·캐시 등 패턴으로 못 잡는 상태). 안전망은 `.github/workflows/vitest-isolated.yml`
 *    (주간 · `--isolate`로 전건 격리 실행)이다. 공유 쪽에서만 깨지는 테스트를 발견하면 그 파일을
 *    `FORCE_ISOLATED`에 넣는다.
 */
const FORCE_ISOLATED: string[] = [];

const ISOLATION_PATTERN =
  /vi\.(mock|doMock|stubGlobal|stubEnv|resetModules|spyOn|useFakeTimers|setSystemTime)\b|\buse[A-Z]\w*Store\b|indexeddb|indexedDB|Dexie|sessionStorage|localStorage|process\.env(\.\w+|\[[^\]]+\])\s*=[^=]|delete process\.env|(globalThis|global)\.[A-Za-z_$]+\s*=[^=]/;

const LOCAL_IMPORT = /(?:from|import)\s*\(?\s*["']((?:\.{1,2}\/|@\/__tests__\/)[^"']+)["']/g;

function resolveLocal(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(__dirname, spec.slice(2))
    : path.resolve(path.dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (c.startsWith(path.join(__dirname, "__tests__")) && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

function needsIsolation(file: string, seen = new Set<string>()): boolean {
  if (seen.has(file)) return false;
  seen.add(file);
  const src = fs.readFileSync(file, "utf8");
  if (ISOLATION_PATTERN.test(src)) return true;
  for (const m of src.matchAll(LOCAL_IMPORT)) {
    const dep = resolveLocal(file, m[1]);
    if (dep && needsIsolation(dep, seen)) return true;
  }
  return false;
}

const NODE_ISOLATED = (fs.readdirSync(path.join(__dirname, "__tests__"), { recursive: true }) as string[])
  .map((f) => `__tests__/${f.split(path.sep).join("/")}`)
  .filter((f) => f.endsWith(".test.ts") && !DOM_TS.includes(f))
  .filter((f) => FORCE_ISOLATED.includes(f) || needsIsolation(path.join(__dirname, f)));

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
          isolate: false,
          include: ["__tests__/**/*.test.ts"],
          exclude: [...DOM_TS, ...NODE_ISOLATED],
        },
      },
      {
        ...shared,
        test: {
          name: "node-isolated",
          environment: "node",
          include: NODE_ISOLATED,
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
