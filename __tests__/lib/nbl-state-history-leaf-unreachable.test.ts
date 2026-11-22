/**
 * 게이트 — 기타토지 «상태 이력» leaf는 **E1에서 판정 경로에 연결되지 않았다**(도달 불가)는 것을 고정한다. NBL-STATE-HISTORY-E1.
 *
 * 계획서: docs/01-plan/features/nbl-other-land-state-history.engine.plan.md §7.4 (E1 = «도달 불가 상태 — ⑫ 미개방» · building-site 선례의 도달 불가 가드)
 * 선례: `building-site-land.ts` 머리주석 · `__tests__/lib/property-dead-classifier-reachability.test.ts` (소스 트리를 읽는 정적 분석 — 호출되지 않는 것은 런타임으로 증명할 수 없다).
 *
 * 왜 필요한가: leaf·소비표 열·고지 상수·검증 문구는 있지만 `judgeOtherLand`·⑫ Zod·⑭ 매퍼·⑧이 읽지 않는다. 그 사이 «화면에 있는데 판정에 안 쓰이는 칸»(B1 교훈)이나
 * «⑫가 새 칸을 침묵 strip»하는 길이 생기지 않도록, 누군가 한 군데만 배선하면 이 테스트가 빨개진다.
 *
 * 🔴 **E2가 배선하면 이 테스트가 깨지는 것이 정상이다.** E2는 이 파일의 «허용 목록»을 배선한 파일들로 갱신하거나 가드를 단일 배선 확인(⑫·⑭·judge 5곳 grep)으로 교체한다 — 삭제만 하지 말 것.
 */
import { describe } from "vitest";
import { it } from "vitest";
import { expect } from "vitest";
import { readdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import { statSync } from "node:fs";
import { join } from "node:path";
import { relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");
const PRODUCTION_ROOTS = ["lib", "app", "components"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** 주석 제거 — 머리주석의 심볼 언급이 호출로 잡히지 않게 한다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const FILES = PRODUCTION_ROOTS.flatMap((r) => walk(join(REPO_ROOT, r))).map((f) => ({
  path: relative(REPO_ROOT, f),
  src: stripComments(readFileSync(f, "utf-8")),
}));

const LEAF = "lib/tax-engine/non-business-land/other-land-state-history.ts";
const MESSAGES = "lib/tax-engine/non-business-land/nbl-validation-messages.ts";
const NOTICES = "lib/tax-engine/nbl-confirm-notices.ts";
const CATEGORY = "lib/tax-engine/non-business-land/land-category.ts";

/** 심볼(단어 경계)을 소스에 쓰는 프로덕션 파일 — 정의 파일은 제외한다. */
function usersOf(symbolPattern: string, definedIn: string[]): string[] {
  const re = new RegExp(`\\b(?:${symbolPattern})\\b`);
  return FILES.filter((f) => !definedIn.includes(f.path) && re.test(f.src)).map((f) => f.path);
}

const WIRE_UP_WARNING = "E2가 배선했다면 정상이다 — 이 가드의 허용 목록을 배선한 파일로 갱신한다(삭제 금지). 계획서 engine.plan.md §7.4 E2.";

describe("도달 불가 — 상태 이력 leaf는 E1에서 판정 경로에 연결되지 않았다", () => {
  it("DEAD-0 (공허 방지): leaf가 실제로 존재하고 핵심 함수를 export한다", () => {
    const leaf = FILES.find((f) => f.path === LEAF);
    expect(leaf, "leaf 파일이 없다").toBeDefined();
    for (const name of ["deriveOtherLandStateIntervals", "stateEventRowIssue", "stateEventSequenceIssue", "isStateIntervalBusiness", "stateHistoryBusinessIntervals"]) {
      expect(leaf!.src).toMatch(new RegExp(`export function ${name}\\b`));
    }
  });

  it("DEAD-1: `other-land-state-history`를 import하는 프로덕션 파일이 없다", () => {
    const re = /^\s*import[\s\S]*?from\s+["'][^"']*other-land-state-history["']/m;
    const importers = FILES.filter((f) => re.test(f.src)).map((f) => f.path);
    expect(importers, `새 호출자: ${importers.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
  });

  it("DEAD-2: leaf의 공개 함수를 쓰는 프로덕션 파일이 없다(leaf 밖)", () => {
    const users = usersOf(
      "deriveOtherLandStateIntervals|hasBuildingAtTransfer|stateEventRowIssue|stateEventSequenceIssue|isStateIntervalBusiness|stateHistoryBusinessIntervals|STATE_EVENT_KIND_LABEL|STATE_PROPERTY_TAX_TYPE_LABEL",
      [LEAF],
    );
    expect(users, `새 사용처: ${users.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
  });

  it("DEAD-3: 소비표 술어 `consumesStateHistory`를 쓰는 프로덕션 파일이 없다(④⑤⑧ 미배선 — 정의 파일 밖)", () => {
    const users = usersOf("consumesStateHistory", [CATEGORY]);
    expect(users, `새 사용처: ${users.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
  });

  it("DEAD-4: 이력 고지·검증 문구 상수를 쓰는 프로덕션 파일이 정의 파일·leaf뿐이다", () => {
    const notices = usersOf("NBL_STATE_HISTORY_[A-Z_]+", [NOTICES]);
    expect(notices, `새 사용처: ${notices.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
    const messages = usersOf("STATE_EVENTS_REQUIRED_MESSAGE|stateEvent[A-Za-z]+Message", [MESSAGES, LEAF]);
    expect(messages, `새 사용처: ${messages.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
  });

  it("DEAD-5: 이력 칸 이름(`nblOtherStateEvents`·`nblOtherStateHistoryMode`·`landStateHistory`)이 프로덕션에 없다 — ⑫ 미개방, 침묵 strip·화면 노출 없음", () => {
    const users = usersOf("nblOtherStateEvents|nblOtherStateHistoryMode|landStateHistory", []);
    expect(users, `새 사용처: ${users.join(", ")}. ${WIRE_UP_WARNING}`).toEqual([]);
  });
});
