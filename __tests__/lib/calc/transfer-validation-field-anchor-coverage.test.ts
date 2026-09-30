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
  for (const name of readdirSync(dir)) {
    if (!/^transfer-tax-validate.*\.ts$/.test(name) || name === "transfer-tax-validate-field.ts") continue;
    const src = readFileSync(join(dir, name), "utf8");
    for (const m of src.matchAll(/\bfield: ["`]([^"`]+)["`]/g)) keys.add(normalize(m[1]));
    for (const m of src.matchAll(/\bfieldError\(\s*["`]([^"`]+)["`]/g)) keys.add(normalize(m[1]));
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
    // data-field={cond ? "a" : "b"}
    for (const m of src.matchAll(/\bdata-field=\{[^}]*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\}/g)) {
      keys.add(m[1]);
      keys.add(m[2]);
    }
  }
  return keys;
}

describe("검증 field ↔ 화면 data-field 앵커", () => {
  it("검증이 가리키는 입력칸은 모두 화면에 앵커가 있다", () => {
    const anchors = anchorKeys();
    const missing = [...validatorKeys()].filter((k) => !anchors.has(k)).sort();
    expect(missing, `앵커 없는 field — 화면에 data-field/FieldCard field를 추가할 것`).toEqual([]);
  });

  it("스캐너가 실제로 키를 읽는다 (공백 통과 방지)", () => {
    // 두 집합이 모두 비면 첫 테스트가 공허하게 통과한다
    expect(validatorKeys().size).toBeGreaterThanOrEqual(15);
    expect(anchorKeys().has("transferDate")).toBe(true);
    expect(validatorKeys().has("presaleRights.*.acquisitionDate")).toBe(true);
    expect(anchorKeys().has("presaleRights.*.acquisitionDate")).toBe(true);
  });
});
