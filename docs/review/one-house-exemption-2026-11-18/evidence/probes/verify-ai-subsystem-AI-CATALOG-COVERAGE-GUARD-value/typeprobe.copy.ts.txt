/**
 * throwaway probe — 필드 사전 ↔ 판정 메뉴 폼 타입 정합(type-level) + 판정 메뉴 steps 최상위 칸 ↔ 사전(runtime).
 * 타입 부분은 tsc로, runtime 부분은 vitest로 실행한다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ONE_HOUSE_FIELD_CATALOG } from "@/lib/one-house-ai/field-catalog";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
  type OneHouseJudgmentExtraFields,
  type OneHouseJudgmentNonResidentFields,
  type OneHouseJudgmentDemolishedFields,
  type OneHouseJudgmentSurchargeFields,
} from "@/lib/stores/one-house-judgment-form.types";

// ───────────── type-level ─────────────
type NN<T> = NonNullable<T>;
type Root = OneHouseJudgmentFormData & { asset: OneHouseJudgmentFormData["assets"][number] };
type StepKey<T, K extends string> = T extends unknown
  ? K extends `${infer N}[]`
    ? N extends keyof T
      ? NN<T[N]> extends readonly (infer E)[]
        ? NN<E>
        : never
      : never
    : K extends keyof T
      ? T[K]
      : never
  : never;
type Resolve<T, P extends string> = P extends `${infer H}.${infer R}`
  ? Resolve<NN<StepKey<NN<T>, H>>, R>
  : StepKey<NN<T>, P>;

type StringKinds = "date" | "amount" | "intString" | "decimalString" | "string";
type ErrOf<C> = C extends { path: infer P extends string; kind: infer K }
  ? [Resolve<Root, P>] extends [never]
    ? `missing:${P}`
    : K extends "enum"
      ? C extends { values: readonly { value: infer V }[] }
        ? [V] extends [NN<Resolve<Root, P>>]
          ? never
          : `enum:${P}:${Exclude<V & string, NN<Resolve<Root, P>>>}`
        : `enum-novalues:${P}`
      : K extends "boolean"
        ? [boolean] extends [NN<Resolve<Root, P>>]
          ? never
          : `kind-boolean:${P}`
        : K extends "int"
          ? [number] extends [NN<Resolve<Root, P>>]
            ? never
            : `kind-int:${P}`
          : K extends StringKinds
            ? [string] extends [NN<Resolve<Root, P>>]
              ? never
              : `kind-${K}:${P}`
            : `kind-unknown:${P}`
  : "malformed";

type Catalog = (typeof ONE_HOUSE_FIELD_CATALOG)[number];
type Errors = ErrOf<Catalog>;
// 정상: Errors가 never여야 컴파일된다.
export const realCatalogCheck: [Errors] extends [never] ? true : { errors: Errors } = true;

// 음성 대조: 불량 키·불량 enum·불량 kind — 반드시 오류가 나야 한다(나지 않으면 probe가 무력).
type Fake =
  | { path: "asset.notARealField"; kind: "date" }
  | { path: "houses[].acquisitionOrigin"; kind: "enum"; values: readonly [{ value: "bogus_origin" }] }
  | { path: "transferDate"; kind: "boolean" }
  | { path: "longTermMortgageSpecial"; kind: "boolean" }
  | { path: "longTermMortgageBorrowerAge"; kind: "intString" };
type FakeErrors = ErrOf<Fake>;
// 기대: FakeErrors = missing:asset.notARealField | enum:houses[].acquisitionOrigin:bogus_origin | kind-boolean:transferDate
export const fakeCheck: FakeErrors = "missing:asset.notARealField";
export const fakeCheck2: FakeErrors = "enum:houses[].acquisitionOrigin:bogus_origin";
export const fakeCheck3: FakeErrors = "kind-boolean:transferDate";
// longTermMortgage* 두 줄은 폼 타입에 있으므로 오류가 아니어야 한다 → 아래 대입은 컴파일 오류여야 한다.
// @ts-expect-error — longTermMortgageSpecial은 폼 타입에 있다
export const fakeCheck4: FakeErrors = "kind-boolean:longTermMortgageSpecial";

// 양성 스팟: 해석된 칸 타입이 any/string으로 뭉개지지 않았는지
// @ts-expect-error — rentalCategory는 리터럴 유니온이어야 한다
export const spot1: Resolve<Root, "asset.rentalHousingException.rentalUnits[].rentalCategory"> = "zzz_bogus";
// @ts-expect-error — presaleRights[].type도 리터럴 유니온이어야 한다
export const spot2: Resolve<Root, "presaleRights[].type"> = "zzz_bogus";

// 역방향(좁은 판): 판정 메뉴 전용 칸 묶음 − 사전 최상위 경로 → 오류 메시지로 집합을 본다
type MenuOwn =
  | keyof OneHouseJudgmentExtraFields
  | keyof OneHouseJudgmentNonResidentFields
  | keyof OneHouseJudgmentDemolishedFields
  | keyof OneHouseJudgmentSurchargeFields;
type MissingMenuOwn = Exclude<MenuOwn, Catalog["path"]>;
export const reverseCheck: { [K in MissingMenuOwn]: K } = {};

// ───────────── runtime ─────────────
const OUT = "<session>/scratchpad/probes/verify-ai-subsystem-AI-CATALOG-COVERAGE-GUARD-value";

describe("probe", () => {
  it("steps 최상위 form.X − 사전", () => {
    const dir = path.join(process.cwd(), "app/calc/one-house-exemption");
    const files = [
      ...fs.readdirSync(path.join(dir, "steps")).map((f) => path.join(dir, "steps", f)),
      path.join(dir, "OneHouseJudgmentCalculator.tsx"),
    ];
    const used = new Set<string>();
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bform\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
      for (const m of src.matchAll(/onChange\(\{\s*([A-Za-z0-9_]+)\s*[:},]/g)) used.add(m[1]);
    }
    const formKeys = new Set(Object.keys(createInitialOneHouseJudgmentForm()));
    const catalogTop = new Set<string>(
      ONE_HOUSE_FIELD_CATALOG.map((s) => s.path).filter((p) => !p.includes(".") && !p.includes("[")),
    );
    const catalogRoots = new Set<string>(ONE_HOUSE_FIELD_CATALOG.map((s) => s.path.split(/[.[]/)[0]));
    const missing = [...used].filter((k) => formKeys.has(k) && !catalogTop.has(k) && !catalogRoots.has(k)).sort();
    const notFormKeys = [...used].filter((k) => !formKeys.has(k)).sort();
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(
      path.join(OUT, "steps-top-vs-catalog.json"),
      JSON.stringify(
        {
          catalogSize: ONE_HOUSE_FIELD_CATALOG.length,
          usedCount: used.size,
          missingFromCatalog: missing,
          usedButNotFormKey: notFormKeys,
          catalogRoots: [...catalogRoots].sort(),
        },
        null,
        2,
      ),
    );
    expect(ONE_HOUSE_FIELD_CATALOG.length).toBeGreaterThan(0);
  });
});
