/**
 * 게이트: 검증이 가리키는 입력칸(field) ⊆ 화면의 앵커(data-field).
 *
 * 계획서: `docs/00-pm/transfer-validation-field-jump.plan.md` D-8
 *
 * 검증에 키를 달았는데 화면에 같은 키의 앵커가 없으면, 사용자가 그 오류를 눌러도
 * **조용히 자산 카드로 후퇴**한다(`validation-jump.ts`). 그 어긋남을 이름으로 출력한다.
 * 역방향(앵커는 있는데 검증이 안 가리킴)은 정상이라 검사하지 않는다.
 *
 * 순수 정적 분석 — 소스 문자열만 읽는다. 인덱스(`${i}`·`${idx}`)는 `*`로 정규화한다.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const normalize = (k: string) => k.replace(/\$\{[^}]+\}/g, "*");

function validatorKeys(): Set<string> {
  const keys = new Set<string>();
  const dir = join(ROOT, "lib/calc");
  // Phase 4: 이름이 `transfer-tax-validate*`가 아니지만 양도세 검증이 부르는 하위 모듈
  const LEAF_VALIDATORS = new Set([
    "house-count-exclusion-reduction-validate.ts",
    "exemption-proviso-validate.ts",
    "residence-interval-validate.ts",
    "rental-4ho-proviso.ts",
    "final-house-restart.ts",
    "pre-designation-contract-scope.ts",
  ]);
  for (const name of readdirSync(dir)) {
    if (!(/^transfer-tax-validate.*\.ts$/.test(name) || LEAF_VALIDATORS.has(name)) || name === "transfer-tax-validate-field.ts") continue;
    const src = readFileSync(join(dir, name), "utf8");
    for (const m of src.matchAll(/\bfield: ["`]([^"`]+)["`]/g)) keys.add(normalize(m[1]));
    for (const m of src.matchAll(/\bfieldError\(\s*["`]([^"`]+)["`]/g)) keys.add(normalize(m[1]));
    // fieldError(cond ? "a" : "b", …) — 파트별로 다른 객체를 가리킬 때(일반건물 이월과세 토지/건물)
    for (const m of src.matchAll(/\bfieldError\(\s*[^,"`()]*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/g)) {
      keys.add(m[1]);
      keys.add(m[2]);
    }
  }
  return keys;
}

function anchorKeys(): Set<string> {
  const keys = new Set<string>();
  const files = [
    ...walk(join(ROOT, "components/calc")),
    ...walk(join(ROOT, "app/calc/transfer-tax")),
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // field="x" · data-field="x" · data-field={`x.${i}.y`}
    for (const m of src.matchAll(/\b(?:data-)?field=(?:"([^"]+)"|\{`([^`]+)`\})/g)) keys.add(normalize(m[1] ?? m[2]));
    // 공용 위젯에 키를 넘기는 prop — fieldLandAtAcq="x" (`ThreePointStandardPriceInput`)
    for (const m of src.matchAll(/\bfield[A-Z]\w*="([^"]+)"/g)) keys.add(m[1]);
    // data-field={cond ? "a" : "b"} · field={cond ? "a" : "b"}
    for (const m of src.matchAll(/\b(?:data-)?field=\{[^}]*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\}/g)) {
      keys.add(m[1]);
      keys.add(m[2]);
    }
  }
  return keys;
}

/**
 * 엔진 PR(E3f-2)이 ⑧을 먼저 배선하고 **화면 앵커는 같은 브랜치의 UI PR(U-3)이 더하는** 칸 — 나대지 구간 근거 «철거ㆍ멸실»의 사실 칸 4개.
 * 근거 선택지가 UI에 아직 열리지 않아(`eventBasisOptions(before)`가 `demolished`를 주지 않는다) ⑧이 이 칸을 가리키는 입력은 화면에서 만들 수 없다 — 막다른 길이 아니다.
 * U-3이 앵커를 더하면 아래 «만료» 단언이 실패해 이 목록을 지우게 한다(삭제 금지가 아니라 **지우는 것이 정상**).
 */
const PENDING_UI_ANCHORS = new Set([
  "nblOtherStateEvents.*.demolishedPermitBefore",
  "nblOtherStateEvents.*.demolishedOtherUseBefore",
  "nblOtherStateEvents.*.demolishedVacantHouseBefore",
  "nblOtherStateEvents.*.demolishedFloorAreaBefore",
]);

describe("검증 field ↔ 화면 data-field 앵커", () => {
  it("검증이 가리키는 입력칸은 모두 화면에 앵커가 있다", () => {
    const anchors = anchorKeys();
    const missing = [...validatorKeys()].filter((k) => !anchors.has(k) && !PENDING_UI_ANCHORS.has(k)).sort();
    expect(missing, `앵커 없는 field — 화면에 data-field/FieldCard field를 추가할 것`).toEqual([]);
  });

  it("대기 목록(PENDING_UI_ANCHORS)은 앵커가 아직 없는 키만 담는다 — 앵커가 생기면 목록에서 지운다", () => {
    const anchors = anchorKeys();
    const validators = validatorKeys();
    for (const k of PENDING_UI_ANCHORS) {
      expect(validators.has(k), `${k}: ⑧이 더는 이 칸을 가리키지 않는다 — 목록에서 지운다`).toBe(true);
      expect(anchors.has(k), `${k}: 화면 앵커가 생겼다 — 이 대기 목록에서 지운다`).toBe(false);
    }
  });

  it("스캐너가 실제로 키를 읽는다 (공백 통과 방지)", () => {
    // 두 집합이 모두 비면 첫 테스트가 공허하게 통과한다
    expect(validatorKeys().size).toBeGreaterThanOrEqual(15);
    expect(anchorKeys().has("transferDate")).toBe(true);
    expect(validatorKeys().has("presaleRights.*.acquisitionDate")).toBe(true);
    expect(anchorKeys().has("presaleRights.*.acquisitionDate")).toBe(true);
  });
});
