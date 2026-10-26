/**
 * 1세대1주택 AI 사실 추출 — 「원문에 없어 확인할 사실」 질문에 그 자리에서 답하기.
 *
 * 질문 경로(`asset.acquisitionDate` · `houses[B].rentalType`)가 필드 사전의 한 칸을 가리키고, 행이 있는 경로는 그 행이
 * 폼에 있을 때만 바로 입력한다(사용자 결정 2026-10-20 — 행이 특정되는 질문만). 행 이름은 그대로 폼의 행 식별자다
 * (`mergeExtractedForm`이 `houses[].id`로 둔다). 나머지는 판정 메뉴의 해당 단계에서 입력한다:
 * - 묶음 질문(`houses` · `asset.residencePeriods[].moveInDate` — 행을 새로 만들어야 하는 것)
 * - 주소 검색으로 채우는 코드 칸(`string`)
 * - 지금 입력 방식에서 읽히지 않는 칸(구간 입력 중의 거주 개월)
 *
 * 값은 판정 메뉴 화면의 입력 위젯이 넣는 모양 그대로 쓴다 — 참/거짓은 boolean, 나머지는 문자열.
 * 화면은 필드 사전을 싣지 않는다 — 칸 정보(`AnswerField`)는 추출 API가 질문마다 붙여 보낸다.
 */
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import type { FieldSpec } from "./field-catalog.types";
import { catalogKeyOf, parsePath, ROW_ID_FIELD, type Segment } from "./apply-extraction";
import { phrp154_10AnswerOf, withPhrp154_10Answer } from "@/lib/calc/phrp-154-10-fact-question";

const PHRP_154_10_ANSWER_PATH = "asset.rentalHousingException.phrp154_10Answer";

/** 질문에 붙여 보내는 칸 정보 — 필드 사전 한 줄에서 화면에 필요한 것만 */
export type AnswerField = Pick<FieldSpec, "path" | "kind" | "label" | "values">;

export type AnswerTarget = { path: string; spec: AnswerField; segs: Segment[] };

type Node = Record<string, unknown>;

const INLINE_KINDS = new Set<AnswerField["kind"]>(["date", "boolean", "enum", "amount", "intString", "decimalString"]);

/**
 * 마지막 칸의 부모 노드. 행이 폼에 없으면 null(바로 입력 불가).
 * `create`가 아니면 없는 중간 객체는 `parent: undefined`로 둔다 — 값은 아직 없다.
 */
function locate(form: OneHouseJudgmentFormData, segs: Segment[], create: boolean): { parent: Node | undefined } | null {
  let cur: Node | undefined = form as unknown as Node;
  const names: string[] = [];
  for (const [i, s] of segs.slice(0, -1).entries()) {
    names.push(s.name);
    let next: unknown = i === 0 && s.name === "asset" ? form.assets[0] : cur?.[s.name];
    if (s.row !== undefined) {
      const idField = ROW_ID_FIELD[names.join(".")];
      if (!idField || !Array.isArray(next)) return null;
      next = (next as Node[]).find((r) => r != null && String(r[idField]) === s.row);
      if (!next) return null;
    } else if (next == null) {
      if (create && cur) cur[s.name] = next = {};
      else {
        cur = undefined;
        continue;
      }
    }
    cur = next as Node;
  }
  return { parent: cur };
}

/** 질문 경로 → 바로 입력할 칸. 바로 입력할 수 없으면 null(판정 메뉴의 단계에서 입력). */
export function answerTargetOf(
  path: string,
  spec: AnswerField | undefined,
  form: OneHouseJudgmentFormData,
): AnswerTarget | null {
  const segs = parsePath(path);
  if (!segs || !spec || spec.path !== catalogKeyOf(segs) || !INLINE_KINDS.has(spec.kind)) return null;
  if (spec.path === "asset.residencePeriodMonthsAsset" && form.assets[0]?.residenceInputMode !== "direct") return null;
  return locate(form, segs, false) ? { path, spec, segs } : null;
}

export function readAnswer(form: OneHouseJudgmentFormData, target: AnswerTarget): unknown {
  // §154⑩ 사실은 선언 상태에서 도출한다(화면 질문과 같은 값 — `phrp154_10AnswerOf`)
  if (target.spec.path === PHRP_154_10_ANSWER_PATH) {
    const rh = form.assets[0]?.rentalHousingException;
    return rh ? (phrp154_10AnswerOf(rh) ?? "") : "";
  }
  return locate(form, target.segs, false)?.parent?.[target.segs[target.segs.length - 1].name];
}

/** 새 폼을 돌려준다(입력 폼은 그대로). */
export function writeAnswer(
  form: OneHouseJudgmentFormData,
  target: AnswerTarget,
  value: unknown,
): OneHouseJudgmentFormData {
  // §154⑩ 「예」는 칸 하나가 아니라 선언(B · 임대주택 0호)이다 — 화면 질문과 같은 쓰기(`applyPhrp154_10Answer`)를 거친다.
  if (target.spec.path === PHRP_154_10_ANSWER_PATH && form.assets[0]) {
    const next = structuredClone(form);
    next.assets[0] = withPhrp154_10Answer(next.assets[0], value);
    return next;
  }
  const next = structuredClone(form);
  const loc = locate(next, target.segs, true);
  if (!loc?.parent) return form;
  loc.parent[target.segs[target.segs.length - 1].name] = value;
  return next;
}
