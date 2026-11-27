/**
 * ⑧ 국외자산 부동산 양도소득세 입력 검증 — 계획서 `transfer-foreign-realestate.ui.plan.md` §7 · U1 확정(§13).
 *
 * 구조 (3중 패턴 — UI 통과 ↔ API 차단 모순 금지):
 *  1) **빈 칸·화면 필수** — 서버가 모르는 「입력 안 함」을 먼저 짚는다(0으로 읽혀 통과하는 외화액 등). 환율은 어떤 fallback도 없다.
 *  2) **서버 ⑩ refine을 그대로 실행** — `buildForeignRealEstateBody`(④와 같은 빌더) 결과에 `FOREIGN_RE_REFINES`(= 엔진이 던지는 검증과 같은
 *     `input-asserts.ts` 술어)를 돌린다. 재구현하지 않으므로 서버가 refine을 추가하면 ⑧도 자동으로 따라온다.
 *  3) **서버 ⑨ 기본 모양**(종류 enum · 통화 형식 · 건수 상한)은 Zod 객체 정의에 있어 refine 목록에 없다 → 같은 상수·같은 규칙을 이 파일이 명시한다
 *     (`FOREIGN_RE_MAX_ASSETS`·`FOREIGN_RE_MAX_ROWS` import — 단일 소스). 격자 테스트 `__tests__/calc/transfer-foreign-validate.parity.test.ts`가 고정.
 *
 * 거주 5년 미만은 **차단하지 않는다**(엔진이 not_liable로 반환 — 경고 카드는 화면) · 미등기·장특 입력은 없다(C-3 · §118의8 단서).
 * 서버 오류는 `path`를 입력칸 `data-field`로 되돌려 이슈에 싣는다 — 같은 칸을 이미 짚었으면(빈 칸) 중복으로 올리지 않는다.
 */
import type { z } from "zod";
import { FOREIGN_RE_MAX_ASSETS, FOREIGN_RE_MAX_ROWS } from "@/lib/api/transfer-foreign-schema";
import { FOREIGN_RE_REFINES } from "@/lib/api/transfer-foreign-refines";
import { buildForeignRealEstateBody, foreignAssetLabel } from "@/lib/calc/transfer-foreign-body";
import { TRANSFER_FOREIGN_RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import type { ForeignAssetForm, ForeignMoneyRowForm } from "@/lib/stores/calc-wizard-form-foreign";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { ValidationIssue } from "./transfer-tax-validate";
import type { IssueField } from "./transfer-tax-validate-field";

export const FOREIGN_KIND_RIGHT_BLOCKED_MESSAGE = `부동산에 관한 권리(${TRANSFER_FOREIGN_RE.SECTION_118_2_SCOPE} 2호)는 계산하지 않습니다 — 토지 또는 건물을 선택하세요.`;

type RowKind = "capitalRows" | "costRows" | "taxRows";
const ROW_LABEL: Record<RowKind, string> = { capitalRows: "자본적지출", costRows: "양도비", taxRows: "외국납부세액" };
const ROW_CAP_LABEL: Record<RowKind, string> = { capitalRows: "자본적지출은 자산당", costRows: "양도비는 자산당", taxRows: "외국납부세액 납부 내역은 전체" };
const ROW_CELL_LABEL = { date: "일자", amount: "외화 금액", rate: "기준환율" } as const;
type Cell = keyof typeof ROW_CELL_LABEL;

/** 자산 카드 안 단일 칸 — `field`는 화면 FieldCard의 `field` 앵커와 같은 리터럴이다(`transfer-validation-field-anchor-coverage` 게이트가 읽는다) */
const SCALAR = {
  kind: { field: "foreignAsset.kind", what: "자산 종류" },
  country: { field: "foreignAsset.country", what: "소재 국가" },
  address: { field: "foreignAsset.address", what: "소재지" },
  currency: { field: "foreignAsset.currency", what: "통화" },
  transferDate: { field: "foreignAsset.transferDate", what: "양도일" },
  transferAmount: { field: "foreignAsset.transferAmount", what: "양도가액(외화)" },
  transferRate: { field: "foreignAsset.transferRate", what: "양도일 기준환율" },
  acquisitionDate: { field: "foreignAsset.acquisitionDate", what: "취득일" },
  acquisitionAmount: { field: "foreignAsset.acquisitionAmount", what: "취득가액(외화)" },
  acquisitionRate: { field: "foreignAsset.acquisitionRate", what: "취득일 기준환율" },
} as const satisfies Record<string, { field: IssueField; what: string }>;
type ScalarKey = keyof typeof SCALAR;

/** 서버 오류 경로의 항목 키 → 화면 칸 키 */
const ENGINE_CELL: Record<string, Cell> = { date: "date", amountForeign: "amount", exchangeRate: "rate" };

interface Locator {
  /** 카드 안에서만 찾는 입력칸(자산 카드 소속)이면 그 카드 인덱스 — 외국납부세액 행은 카드 밖이라 비운다 */
  assetIndex?: number;
  /** 메시지에 붙일 자산 라벨 인덱스(카드 소속이 아니어도 어느 자산인지 알린다) */
  labelIndex?: number;
  /** `foreignAsset.*` 또는 폼 전역 키 — 화면 `data-field`와 같다 */
  field?: IssueField;
  /** 사람이 읽는 칸 이름 */
  what?: string;
}

/** 외국납부세액 행은 자산 카드 밖(§118의6 섹션)에 있어 키에 자산 인덱스를 싣는다 — 카드 소속 칸은 카드 범위 안에서 찾으므로 인덱스가 없다 */
const rowField = (kind: RowKind, assetIndex: number, j: number, cell: Cell) =>
  (kind === "taxRows" ? `foreignTaxRow.${assetIndex}.${j}.${cell}` : `foreignAsset.${kind}.${j}.${cell}`) as IssueField;
const rowWhat = (kind: RowKind, j: number, cell: Cell) => `${ROW_LABEL[kind]} ${j + 1}행 ${ROW_CELL_LABEL[cell]}`;

/** 서버 이슈 경로(`["assets", 0, "transfer", "exchangeRate"]`) → 입력칸 */
function locate(path: readonly PropertyKey[], taxOrigins: readonly { assetIndex: number; rowIndex: number }[]): Locator {
  const [root, a, b, c, d] = path;
  if (root === "domesticResidenceYears") return { field: "foreignResidenceYears", what: "국내 거주 연수" };
  if (root === "assets" && typeof a === "number") {
    const assetIndex = a;
    const scalar = (key: ScalarKey): Locator => ({ assetIndex, labelIndex: assetIndex, ...SCALAR[key] });
    if (b === undefined) return scalar("acquisitionDate");
    if (b === "transferDate") return scalar("transferDate");
    if (b === "acquisitionDate") return scalar("acquisitionDate");
    if (b === "transfer" || b === "acquisition") {
      const cell = ENGINE_CELL[String(c)];
      if (!cell) return { assetIndex, labelIndex: assetIndex };
      const t = b === "transfer";
      return scalar(cell === "date" ? (t ? "transferDate" : "acquisitionDate") : cell === "amount" ? (t ? "transferAmount" : "acquisitionAmount") : t ? "transferRate" : "acquisitionRate");
    }
    if ((b === "capitalExpenditures" || b === "transferCosts") && typeof c === "number") {
      const kind: RowKind = b === "capitalExpenditures" ? "capitalRows" : "costRows";
      const cell = ENGINE_CELL[String(d)];
      return cell
        ? { assetIndex, labelIndex: assetIndex, field: rowField(kind, assetIndex, c, cell), what: rowWhat(kind, c, cell) }
        : { assetIndex, labelIndex: assetIndex };
    }
    return { assetIndex, labelIndex: assetIndex };
  }
  if (root === "foreignTax" && a === "items" && typeof b === "number") {
    const origin = taxOrigins[b];
    const cell = ENGINE_CELL[String(c)];
    if (!origin) return {};
    return cell
      ? { labelIndex: origin.assetIndex, field: rowField("taxRows", origin.assetIndex, origin.rowIndex, cell), what: rowWhat("taxRows", origin.rowIndex, cell) }
      : { labelIndex: origin.assetIndex };
  }
  return {};
}

/** 서버 메시지 `경로: 사유` → 사유만 — 화면에는 칸 이름을 앞에 붙인다. 경로 머리가 없는 메시지(차손 혼재 등)는 그대로. */
function reasonOf(message: string): string {
  const m = /^[A-Za-z0-9_.[\]]+: (.*)$/s.exec(message);
  return m ? m[1] : message;
}

function isBlank(v: string): boolean {
  return v.trim() === "";
}

const CURRENCY_RE = /^[A-Z]{3}$/;

export function collectForeignIssues(form: TransferFormData): ValidationIssue[] {
  const step = 0;
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  function add(message: string, field?: IssueField, assetIndex?: number) {
    const key = `${assetIndex ?? ""}|${field ?? message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ step, message, ...(assetIndex !== undefined ? { assetIndex } : {}), ...(field ? { field } : {}) });
  }

  // ── 1) 폼 전역 · 빈 칸 · 화면 필수 ────────────────────────────────
  if (isBlank(form.foreignResidenceYears)) {
    add("국내 거주 연수를 입력하세요 (양도일까지 계속 국내에 주소·거소를 둔 연수).", "foreignResidenceYears");
  }
  if (form.foreignAssets.length > FOREIGN_RE_MAX_ASSETS) {
    add(`국외자산은 최대 ${FOREIGN_RE_MAX_ASSETS}건까지 한 번에 계산합니다.`);
  }

  const taxTotal = form.foreignTaxEnabled ? form.foreignAssets.reduce((n, a) => n + a.taxRows.length, 0) : 0;
  if (form.foreignTaxEnabled && taxTotal === 0) {
    add("외국납부세액이 있으면 납부 내역을 1행 이상 입력하세요 (없으면 「외국납부세액 있음」을 끄세요).", "foreignTaxEnabled");
  }
  if (taxTotal > FOREIGN_RE_MAX_ROWS) {
    add(`${ROW_CAP_LABEL.taxRows} 최대 ${FOREIGN_RE_MAX_ROWS}행까지 입력할 수 있습니다.`, "foreignTaxEnabled");
  }

  form.foreignAssets.forEach((a, i) => {
    const label = foreignAssetLabel(i);
    const need = (blank: boolean, key: ScalarKey, text: string) => {
      if (blank) add(`${label} ${text}`, SCALAR[key].field, i);
    };
    if (a.kind === "right") add(`${label}: ${FOREIGN_KIND_RIGHT_BLOCKED_MESSAGE}`, SCALAR.kind.field, i);
    need(isBlank(a.countryCode), "country", "소재 국가를 선택하세요.");
    need(isBlank(a.address), "address", "소재지를 입력하세요.");
    if (!CURRENCY_RE.test(a.currency)) {
      add(`${label} 통화 코드는 3자리 영문 대문자로 입력하세요.`, SCALAR.currency.field, i);
    }
    need(isBlank(a.transferDate), "transferDate", "양도일을 입력하세요.");
    need(isBlank(a.transferAmount), "transferAmount", "양도가액(외화)을 입력하세요.");
    need(isBlank(a.transferRate), "transferRate", "양도일 기준환율을 입력하세요.");
    need(isBlank(a.acquisitionDate), "acquisitionDate", "취득일을 입력하세요.");
    need(isBlank(a.acquisitionAmount), "acquisitionAmount", "취득가액(외화)을 입력하세요.");
    need(isBlank(a.acquisitionRate), "acquisitionRate", "취득일 기준환율을 입력하세요.");

    (["capitalRows", "costRows", "taxRows"] as const).forEach((kind) => {
      if (kind === "taxRows" && !form.foreignTaxEnabled) return; // 꺼진 토글의 숨은 값은 보지 않는다(D-4)
      const rows: ForeignMoneyRowForm[] = a[kind];
      if (kind !== "taxRows" && rows.length > FOREIGN_RE_MAX_ROWS) {
        add(`${label} ${ROW_CAP_LABEL[kind]} 최대 ${FOREIGN_RE_MAX_ROWS}행까지 입력할 수 있습니다.`, rowField(kind, i, 0, "date"), i);
      }
      rows.forEach((r, j) => {
        const blanks: [Cell, boolean][] = [
          ["date", isBlank(r.date)],
          ["amount", isBlank(r.amountForeign)],
          ["rate", isBlank(r.exchangeRate)],
        ];
        for (const [cell, blank] of blanks) {
          if (blank) {
            add(`${label} ${rowWhat(kind, j, cell)}을(를) 입력하세요 (필요 없는 행은 삭제하세요).`, rowField(kind, i, j, cell), kind === "taxRows" ? undefined : i);
          }
        }
      });
    });
  });

  // ── 2) 서버 ⑩ refine 그대로 ──────────────────────────────────────
  const { body, taxItemOrigins } = buildForeignRealEstateBody(form);
  const server: { message?: string; path?: PropertyKey[] }[] = [];
  const ctx = { addIssue: (i: { message?: string; path?: PropertyKey[] }) => server.push(i), path: [] } as unknown as z.RefinementCtx;
  for (const r of FOREIGN_RE_REFINES) r.run(body, ctx);
  for (const s of server) {
    const d = describeServerIssue(s.path ?? [], s.message ?? "", taxItemOrigins);
    add(d.message, d.field, d.assetIndex);
  }

  return issues;
}

/** 서버 오류 1건(경로 + 메시지) → 화면 이슈(칸 이름을 붙인 메시지 + `data-field` 앵커 + 카드 인덱스) — ⑧과 ④의 400 응답 처리가 같은 함수를 쓴다 */
function describeServerIssue(
  path: readonly PropertyKey[],
  rawMessage: string,
  taxOrigins: readonly { assetIndex: number; rowIndex: number }[],
): { message: string; field?: IssueField; assetIndex?: number } {
  const loc = locate(path, taxOrigins);
  const reason = reasonOf(rawMessage);
  const prefix = loc.labelIndex !== undefined ? `${foreignAssetLabel(loc.labelIndex)} ` : "";
  return { message: loc.what ? `${prefix}${loc.what}: ${reason}` : `${prefix}${reason}`, field: loc.field, assetIndex: loc.assetIndex };
}

/**
 * ④ 400 응답의 `fieldErrors`(점 표기 키 `assets.0.transfer.exchangeRate` · `foreignTax.items.0.date`) → 입력칸으로 갈 수 있는 이슈 목록.
 * ⑧이 서버 refine을 먼저 돌리므로 정상 흐름에서는 비어 있다 — 그래도 서버가 ⑧이 모르는 오류를 내면 사용자가 그 칸으로 이동할 수 있어야 한다.
 */
export function foreignFieldErrorsToIssues(
  fieldErrors: Record<string, string[]>,
  taxOrigins: readonly { assetIndex: number; rowIndex: number }[],
): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const path = key === "_root" ? [] : key.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
    for (const m of messages) {
      const d = describeServerIssue(path, m, taxOrigins);
      const dedup = `${d.assetIndex ?? ""}|${d.field ?? d.message}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);
      out.push({ step: 0, message: d.message, ...(d.assetIndex !== undefined ? { assetIndex: d.assetIndex } : {}), ...(d.field ? { field: d.field } : {}) });
    }
  }
  return out;
}

/** 목록 완성도(0~100) — 다건 목록 배지용. 필수 입력 칸 중 채운 비율(건별 평균). */
export function foreignCompletionPercent(form: TransferFormData): number {
  const cells = (a: ForeignAssetForm) =>
    [a.countryCode, a.address, a.transferDate, a.transferAmount, a.transferRate, a.acquisitionDate, a.acquisitionAmount, a.acquisitionRate];
  const total = 1 + form.foreignAssets.length * 8;
  const done =
    (isBlank(form.foreignResidenceYears) ? 0 : 1) +
    form.foreignAssets.reduce((n, a) => n + cells(a).filter((v) => !isBlank(v)).length, 0);
  return Math.round((done / total) * 100);
}
