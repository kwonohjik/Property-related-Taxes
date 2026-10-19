/**
 * 1세대1주택 AI 사실 추출 — LLM 출력(「경로 = 값」 목록)을 판정 메뉴 폼 조각으로 옮긴다.
 *
 * 순수 함수다. 경로가 필드 사전에 없거나 값이 칸의 형식에 맞지 않으면 **넣지 않고 오류로 돌려준다** —
 * 틀린 값을 조용히 고쳐 넣으면 판정이 원문과 다른 사실로 나온다.
 *
 * 결과 모양은 평가셋 케이스의 `form`과 같다(최상위 필드 + `asset` = assets[0] + `houses` = 명부 행).
 */
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { FieldSpec } from "./field-catalog.types";
import type { OneHouseExtraction } from "./extraction-schema";

export type ExtractedForm = Partial<Omit<OneHouseJudgmentFormData, "assets" | "houses">> & {
  asset?: Record<string, unknown>;
  houses?: Partial<HouseEntry>[];
};

export type ExtractionIssue = { path: string; message: string };

type Segment = { name: string; row?: string };

/** 배열 행의 식별자 칸 — 행 이름(rowId)을 이 칸에 넣는다. 없으면 식별자를 두지 않는다. */
const ROW_ID_FIELD: Record<string, string> = {
  houses: "id",
  presaleRights: "id",
  finalHouseRestartDisposals: "id",
  "asset.rentalHousingException.rentalUnits": "unitId",
};

const SEGMENT = /^([A-Za-z0-9_]+)(?:\[([^\]]+)\])?$/;

/** `houses[A].acquisitionDate` → 구간 목록. 형식이 틀리면 null. */
export function parsePath(path: string): Segment[] | null {
  const parts = path.split(/\.(?![^[]*\])/);
  const segs: Segment[] = [];
  for (const p of parts) {
    const m = SEGMENT.exec(p);
    if (!m) return null;
    segs.push(m[2] === undefined ? { name: m[1] } : { name: m[1], row: m[2] });
  }
  return segs;
}

/** 필드 사전 키 — 행 이름을 지운 경로(`houses[].acquisitionDate`). */
export function catalogKeyOf(segs: Segment[]): string {
  return segs.map((s) => (s.row === undefined ? s.name : `${s.name}[]`)).join(".");
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(v: string): boolean {
  if (!DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** 칸 형식에 맞춰 값을 바꾼다 — 맞지 않으면 오류 문구. */
export function coerceValue(spec: FieldSpec, raw: string): { value: unknown } | { error: string } {
  const v = raw.trim();
  switch (spec.kind) {
    case "date":
      return isRealDate(v) ? { value: v } : { error: `날짜 형식이 아닙니다(YYYY-MM-DD): ${raw}` };
    case "boolean":
      if (v === "true") return { value: true };
      if (v === "false") return { value: false };
      return { error: `참/거짓이 아닙니다: ${raw}` };
    case "enum":
      return spec.values?.some((x) => x.value === v)
        ? { value: v }
        : { error: `허용값이 아닙니다(${(spec.values ?? []).map((x) => x.value).join(", ")}): ${raw}` };
    case "amount":
    case "intString": {
      const digits = v.replace(/,/g, "");
      return /^\d+$/.test(digits) ? { value: digits } : { error: `숫자가 아닙니다: ${raw}` };
    }
    case "decimalString": {
      const num = v.replace(/,/g, "");
      return /^-?\d+(\.\d+)?$/.test(num) ? { value: num } : { error: `숫자가 아닙니다: ${raw}` };
    }
    case "int": {
      const digits = v.replace(/,/g, "");
      return /^-?\d+$/.test(digits) ? { value: Number(digits) } : { error: `정수가 아닙니다: ${raw}` };
    }
    case "string":
      return { value: v };
  }
}

type Node = Record<string, unknown>;

/** 배열 경로(`houses` · `asset.rentalHousingException.rentalUnits`)가 사전에 있는가 */
function isCollection(catalogKeys: Set<string>, collection: string): boolean {
  const prefix = `${collection}[].`;
  for (const k of catalogKeys) if (k.startsWith(prefix)) return true;
  return false;
}

function rowsOf(root: Node, collection: string): Map<string, Node> {
  const names = collection.split(".");
  let cur = root;
  for (const n of names.slice(0, -1)) cur = (cur[n] ??= {}) as Node;
  const last = names[names.length - 1];
  return (cur[last] ??= new Map<string, Node>()) as Map<string, Node>;
}

function finalize(node: Node, prefix: string): Node {
  const out: Node = {};
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v instanceof Map) {
      const idField = ROW_ID_FIELD[path];
      out[k] = [...(v as Map<string, Node>).entries()].map(([rowId, row]) => ({
        ...(idField ? { [idField]: rowId } : {}),
        ...finalize(row, path),
      }));
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = finalize(v as Node, path);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** 경로에 값을 넣는다. 없던 배열 행을 새로 만들었으면 그 행 경로를 돌려준다. */
function setAt(root: Node, segs: Segment[], value: unknown): string | null {
  let cur = root;
  let prefix = "";
  let created: string | null = null;
  for (const [i, s] of segs.entries()) {
    prefix = prefix ? `${prefix}.${s.name}` : s.name;
    if (i === segs.length - 1) {
      cur[s.name] = value;
    } else if (s.row === undefined) {
      cur = (cur[s.name] ??= {}) as Node;
    } else {
      const rows = rowsOf(cur, s.name);
      if (!rows.has(s.row)) {
        created ??= `${prefix}[${s.row}]`;
        rows.set(s.row, {});
      }
      cur = rows.get(s.row)!;
    }
  }
  return created;
}

export function applyExtraction(
  extraction: OneHouseExtraction,
  catalog: readonly FieldSpec[],
): { form: ExtractedForm; issues: ExtractionIssue[] } {
  const specs = new Map(catalog.map((s) => [s.path, s]));
  const keys = new Set(specs.keys());
  const issues: ExtractionIssue[] = [];
  const root: Node = {};

  // 행은 사실이 하나도 없어도 만든다 — 「다른 주택 1채 보유(취득일 모름)」도 주택 수에 들어간다.
  for (const r of extraction.rows) {
    if (!isCollection(keys, r.collection)) {
      issues.push({ path: r.collection, message: "필드 사전에 없는 배열입니다" });
      continue;
    }
    const rows = rowsOf(root, r.collection);
    if (!rows.has(r.rowId)) rows.set(r.rowId, {});
  }

  const seen = new Set<string>();
  for (const f of extraction.facts) {
    const segs = parsePath(f.path);
    const spec = segs ? specs.get(catalogKeyOf(segs)) : undefined;
    if (!segs || !spec) {
      issues.push({ path: f.path, message: "필드 사전에 없는 경로입니다" });
      continue;
    }
    if (seen.has(f.path)) {
      issues.push({ path: f.path, message: "같은 경로가 두 번 나왔습니다 — 뒤의 값은 버렸습니다" });
      continue;
    }
    const coerced = coerceValue(spec, f.value);
    if ("error" in coerced) {
      issues.push({ path: f.path, message: coerced.error });
      continue;
    }
    seen.add(f.path);
    const created = setAt(root, segs, coerced.value);
    if (created) {
      issues.push({ path: f.path, message: `rows에 선언되지 않은 행입니다(${created}) — 행을 새로 만들었습니다` });
    }
  }

  for (const m of extraction.missingFacts) {
    // 묶음 질문 — 배열 경로(`houses`) 또는 행 이름 없는 칸(`asset.residencePeriods[].moveInDate`)
    if (isCollection(keys, m.path) || specs.has(m.path)) continue;
    const segs = parsePath(m.path);
    if (!segs || !specs.has(catalogKeyOf(segs))) {
      issues.push({ path: m.path, message: "질문의 경로가 필드 사전에 없습니다" });
    }
  }

  const form = finalize(root, "") as ExtractedForm;
  // 거주 구간을 받았으면 구간 입력으로 — 하네스·UI 기본값(직접 입력 개월)과 구분한다.
  const asset = form.asset as Record<string, unknown> | undefined;
  if (asset && Array.isArray(asset.residencePeriods) && asset.residencePeriods.length > 0) {
    asset.residenceInputMode = "interval";
  }
  return { form, issues };
}

/**
 * 폼 조각 → 「경로 = 값」 평면 목록(행 이름 포함). 평가에서 손 매핑 폼과 추출 폼을 칸 단위로 대조할 때 쓴다.
 * 행 식별자 칸(`id`·`unitId`)은 경로의 대괄호로 옮기고 값 목록에서는 뺀다.
 * 행마다 `houses[A]` → `ROW_MARKER` 항목을 하나씩 둔다 — 사실이 하나도 없는 행도 되돌릴 때 살아남게.
 */
/** `flattenForm`의 행 표지 값 — 칸 값이 아니다. */
export const ROW_MARKER: unique symbol = Symbol("row");

export function flattenForm(form: ExtractedForm): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (node: Node, prefix: string, collectionPath: string) => {
    for (const [k, v] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${k}` : k;
      const cPath = collectionPath ? `${collectionPath}.${k}` : k;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null) {
        const idField = ROW_ID_FIELD[cPath];
        v.forEach((row: Node, i: number) => {
          const rowId = idField && row[idField] != null ? String(row[idField]) : String(i + 1);
          const rest = { ...row };
          if (idField) delete rest[idField];
          out.set(`${path}[${rowId}]`, ROW_MARKER);
          walk(rest, `${path}[${rowId}]`, cPath);
        });
      } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Node, path, cPath);
      } else {
        out.set(path, v);
      }
    }
  };
  walk(form as Node, "", "");
  return out;
}

/** `flattenForm`의 역 — 검증 없이 평면 목록을 폼 조각으로 되돌린다(평가에서 답을 채운 폼을 만들 때). */
export function formFromFlat(entries: Iterable<[string, unknown]>): ExtractedForm {
  const root: Node = {};
  for (const [path, value] of entries) {
    const segs = parsePath(path);
    if (!segs) throw new Error(`경로 형식 오류: ${path}`);
    const last = segs[segs.length - 1];
    if (value === ROW_MARKER && last.row !== undefined) {
      // 행 표지 — 행만 만든다
      const parent = segs.slice(0, -1);
      let cur = root;
      for (const s of parent) cur = s.row === undefined ? ((cur[s.name] ??= {}) as Node) : rowsOf(cur, s.name).get(s.row)!;
      const rows = rowsOf(cur, last.name);
      if (!rows.has(last.row)) rows.set(last.row, {});
      continue;
    }
    setAt(root, segs, value);
  }
  return finalize(root, "") as ExtractedForm;
}

