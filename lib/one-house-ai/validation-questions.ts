/**
 * 1세대1주택 AI 사실 추출 — 추출한 폼에서 **검증이 막는 칸을 질문으로** 바꾼다(결정론, LLM 없음).
 *
 * LLM에게 필수 칸을 묻게 해도 회차마다 빠뜨리는 칸이 생긴다(오프라인 평가 2026-10-19). 화면이 결과 단계로 못 가게 막는
 * ⑧ 검증(`validateAllSteps`)과 API 본문 스키마(`propertySchema`)를 추출 폼에 그대로 돌려, 막히는 칸을 질문 목록에 덧붙인다.
 * 질문 문구는 화면 검증 문구 그대로다.
 */
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { housesOwnedAtTransfer } from "@/lib/calc/household-house-count";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { FieldSpec } from "./field-catalog.types";
import { catalogKeyOf, parsePath } from "./apply-extraction";

export type ValidationQuestion = {
  /** 필드 사전 경로(행 이름 포함) 또는 묶음 경로(`houses`) — 사전에 대응이 없으면 검증 칸 이름 그대로 */
  path: string;
  /** 필드 사전 라벨(대응이 있을 때) */
  label?: string;
  question: string;
  source: "validation";
};

/** API 본문 칸 이름이 폼과 다른 것 */
const API_FIELD_ALIAS: Record<string, string> = { transferPrice: "contractTotalPrice" };

const ROW_FIELD = /^(houses|presaleRights|rentalHousingException\.rentalUnits|rentalUnits)\.(\d+)(?:\.(.+))?$/;

export function collectValidationQuestions(
  form: OneHouseJudgmentFormData,
  catalog: readonly FieldSpec[],
): ValidationQuestion[] {
  const specs = new Map<string, FieldSpec>(catalog.map((s) => [s.path, s]));
  const paths = [...specs.keys()];
  const primary = form.assets[0];
  // API 본문의 명부는 [양도 주택, ...양도일 현재 보유한 취득일 있는 행] 순서다(`buildHousesPayload`).
  const apiHouses = primary
    ? housesOwnedAtTransfer(form.houses, form.transferDate, primary.assetKind).filter((h) => h.acquisitionDate)
    : [];

  const rowPath = (collection: string, index: number, api: boolean): string | undefined => {
    if (collection === "houses") {
      const row = api ? apiHouses[index - 1] : form.houses[index];
      return row ? `houses[${row.id}]` : undefined;
    }
    if (collection === "presaleRights") {
      const row = form.presaleRights[index];
      return row ? `presaleRights[${row.id}]` : undefined;
    }
    const unit = primary?.rentalHousingException?.rentalUnits?.[index] as { unitId?: string } | undefined;
    return unit?.unitId ? `asset.rentalHousingException.rentalUnits[${unit.unitId}]` : undefined;
  };

  const toPath = (field: string, api: boolean): string => {
    const f = API_FIELD_ALIAS[field] ?? field;
    const m = ROW_FIELD.exec(f);
    if (m) {
      const collection = m[1] === "houses" || m[1] === "presaleRights" ? m[1] : "asset.rentalHousingException.rentalUnits";
      const row = rowPath(m[1] === "houses" || m[1] === "presaleRights" ? m[1] : "rentalUnits", Number(m[2]), api);
      if (!row) return collection;
      return m[3] ? `${row}.${m[3]}` : row;
    }
    if (f === "residencePeriods") return "asset.residencePeriods";
    for (const cand of [f, `asset.${f}`]) {
      if (specs.has(cand) || paths.some((p) => p.startsWith(`${cand}.`) || p.startsWith(`${cand}[`))) return cand;
    }
    return f;
  };

  const labelOf = (path: string): string | undefined => {
    const segs = parsePath(path);
    return segs ? specs.get(catalogKeyOf(segs))?.label : undefined;
  };

  const out = new Map<string, ValidationQuestion>();
  const add = (path: string, question: string) => {
    if (!out.has(path)) out.set(path, { path, label: labelOf(path), question, source: "validation" });
  };

  for (const e of validateAllSteps(form)) {
    if (e.severity === "error") add(toPath(e.field, false), e.message);
  }
  // 화면 검증을 통과해도 API 본문 스키마가 막는 칸(형식·필수) — 문구는 화면 말로 바꾼다.
  if (primary) {
    let body: Record<string, unknown> | undefined;
    try {
      body = buildOneHouseExemptionApiBody(form);
    } catch {
      body = undefined; // 본문을 만들 수 없는 폼은 위 ⑧ 질문으로 충분하다
    }
    const parsed = body ? propertySchema.safeParse(body) : undefined;
    if (parsed && !parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = toPath(issue.path.join("."), true);
        add(path, `${labelOf(path) ?? path} — 입력값을 확인하세요.`);
      }
    }
  }
  return [...out.values()];
}
