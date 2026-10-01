/**
 * §154⑤ 단서 최종 1주택 재기산 처분 이력 — ⑤ 노출 범위 · ④⑬ 본문 조립 · ⑧ 필수 입력 · 구 기록 읽기 (OH-22 · I-1)
 *
 * 세 층이 **같은 술어**(`finalHouseRestartInScope`)를 쓴다(3중 패턴). 화면에 없으면 보내지도 검증하지도 않는다
 * — 구간 밖으로 양도일을 바꾼 뒤 남은 stale 이력이 계산을 바꾸거나 입력을 막지 않게.
 *
 * 판정(재기산 여부·기산일)은 엔진 leaf `lib/tax-engine/one-house/final-house-restart.ts` 한 곳이다. 여기서는
 * **결론을 내지 않는다**(2020년 처분·2021-02-16 증여처럼 재기산일이 되지 않는 것은 오류가 아니다).
 * 이력 질문 미답은 오류가 아니라 **판정 보류**다(엔진이 고지한다 — 재기산 없음으로 추정하지 않는다).
 */
import type { FinalHouseDisposalRow, TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { FinalHouseRestartApiPayload } from "@/lib/api/final-house-restart-coerce";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { isFinalOneHouseRestartEra } from "@/lib/tax-engine/one-house/final-house-restart";
import { isOneHouseExemptionAsset } from "./housing-like-asset";
import { fieldError } from "./transfer-tax-validate-field";
import { resolveHouseholdHousingCount } from "./household-house-count";
import {
  deriveJudgmentHouseCount,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

export type FinalHouseRestartFormSlice = Pick<
  TransferFormData,
  "transferDate" | "finalHouseRestartHistory" | "finalHouseRestartDisposals"
>;

/**
 * 노출 범위 — 양도일 2021-01-01~2022-05-09 · 1세대 · 양도일 현재 1주택 · §154① 판정 대상 자산 · 등기.
 * 주택 수는 호출부가 자기 정본으로 넘긴다(계산기 `resolveHouseholdHousingCount` · 판정 메뉴 `deriveJudgmentHouseCount`).
 */
export function finalHouseRestartInScope(p: {
  transferDate: string;
  isOneHousehold: boolean;
  primaryKind: string | undefined;
  householdHousingCount: number;
  isUnregistered: boolean;
}): boolean {
  const t = toOptionalDate(p.transferDate);
  return (
    !!t &&
    isFinalOneHouseRestartEra(t) &&
    p.isOneHousehold &&
    !p.isUnregistered &&
    isOneHouseExemptionAsset(p.primaryKind) &&
    p.householdHousingCount === 1
  );
}

/** 판정 메뉴의 노출 범위 — 주택 수는 명부 파생(G-1) `deriveJudgmentHouseCount`. */
export function judgmentFinalHouseRestartInScope(form: OneHouseJudgmentFormData): boolean {
  return finalHouseRestartInScope({
    transferDate: form.transferDate,
    isOneHousehold: form.isOneHousehold,
    primaryKind: form.assets?.[0]?.assetKind,
    householdHousingCount: deriveJudgmentHouseCount(form),
    isUnregistered: form.isUnregistered === true,
  });
}

/** 계산기(단건·다건·Step4)의 노출 범위 — 주택 수는 ④·⑤·⑧이 쓰는 같은 leaf로 얻는다. */
export function calcFinalHouseRestartInScope(form: TransferFormData): boolean {
  const primary = form.assets?.[0];
  return finalHouseRestartInScope({
    transferDate: form.transferDate,
    isOneHousehold: form.isOneHousehold,
    primaryKind: primary?.assetKind,
    householdHousingCount: resolveHouseholdHousingCount({
      primaryKind: primary?.assetKind,
      declared: parseInt(form.householdHousingCount || "1", 10) || 0,
      houses: form.houses,
      legacyPrecedence: form.legacyHouseCountPrecedence ?? false,
    }),
    isUnregistered: form.isUnregistered === true,
  });
}

const KINDS = new Set(["", "transfer", "gift", "conversion", "other"]);
const YES_NO = new Set(["", "yes", "no"]);

/**
 * 처분 목록 읽기 — **구 기록 가드**. 이 필드가 생기기 전 record(다건 자산 폼은 기본값 병합을 거치지 않는다)나
 * 모양이 다른 값은 빈 목록·빈 칸으로 읽는다(화면이 죽거나 엉뚱한 값이 전송되지 않게).
 */
export function readFinalHouseDisposals(raw: unknown): FinalHouseDisposalRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      id: typeof o.id === "string" && o.id ? o.id : `fhr-${i}`,
      kind: (KINDS.has(o.kind as string) ? o.kind : "") as FinalHouseDisposalRow["kind"],
      date: typeof o.date === "string" ? o.date : "",
      temporaryTwoHouse: (YES_NO.has(o.temporaryTwoHouse as string)
        ? o.temporaryTwoHouse
        : "") as FinalHouseDisposalRow["temporaryTwoHouse"],
    };
  });
}

/** 구 기록의 이력 답 — 없거나 모양이 다르면 미답. */
export function readFinalHouseRestartHistory(raw: unknown): TransferFormData["finalHouseRestartHistory"] {
  return raw === "yes" || raw === "no" ? raw : "";
}

/** 그 밖(멸실 등)은 처분이 아니므로 일시적 2주택 관계를 묻지 않는다. */
export function asksTemporaryTwoHouse(kind: FinalHouseDisposalRow["kind"]): boolean {
  return kind === "transfer" || kind === "gift" || kind === "conversion";
}

/**
 * ④⑬ 본문 — 범위 밖이거나 미답이면 **키를 싣지 않는다**(엔진이 판정 보류를 고지한다).
 * 미완성 행은 ⑧이 막으므로 여기 오지 않는다(오면 뺀다 — 빈 날짜를 보내 400이 나는 것보다 낫다).
 */
export function buildFinalHouseRestartPayload(
  form: Partial<FinalHouseRestartFormSlice>,
  inScope: boolean,
): { finalOneHouseRestart: FinalHouseRestartApiPayload } | Record<string, never> {
  if (!inScope) return {};
  const history = readFinalHouseRestartHistory(form.finalHouseRestartHistory);
  if (history === "") return {};
  if (history === "no") return { finalOneHouseRestart: { hadOtherHouseDisposal: false, disposals: [] } };
  const disposals = readFinalHouseDisposals(form.finalHouseRestartDisposals)
    .filter((r) => r.kind !== "" && !!toOptionalDate(r.date) && (!asksTemporaryTwoHouse(r.kind) || r.temporaryTwoHouse !== ""))
    .map((r) => ({
      kind: r.kind as Exclude<FinalHouseDisposalRow["kind"], "">,
      date: r.date,
      temporaryTwoHouseSpecial: r.temporaryTwoHouse === "yes",
    }));
  return { finalOneHouseRestart: { hadOtherHouseDisposal: true, disposals } };
}

/** ⑧ 필수 입력 — 「있음」을 골랐을 때만. 미답은 오류가 아니다(판정 보류). */
export function collectFinalHouseRestartErrors(
  form: Partial<FinalHouseRestartFormSlice>,
  inScope: boolean,
): string[] {
  if (!inScope || readFinalHouseRestartHistory(form.finalHouseRestartHistory) !== "yes") return [];
  const P = "§154⑤ 단서(최종 1주택 재기산)";
  const rows = readFinalHouseDisposals(form.finalHouseRestartDisposals);
  if (rows.length === 0) return [fieldError("finalHouseRestartDisposals", `${P}: 처분한 다른 주택을 1건 이상 입력하세요.`)];
  const transfer = toOptionalDate(form.transferDate);
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const n = `${i + 1}번째 처분`;
    if (r.kind === "") errors.push(fieldError(`finalHouseRestartDisposals.${i}.kind`, `${P}: ${n}의 유형(양도·증여·용도변경·그 밖)을 선택하세요.`));
    const date = toOptionalDate(r.date);
    if (!date) errors.push(fieldError(`finalHouseRestartDisposals.${i}.date`, `${P}: ${n}의 처분일을 입력하세요.`));
    else if (transfer && date > transfer) errors.push(fieldError(`finalHouseRestartDisposals.${i}.date`, `${P}: ${n}의 처분일은 이 주택 양도일 이전이어야 합니다.`));
    if (asksTemporaryTwoHouse(r.kind) && r.temporaryTwoHouse === "") {
      errors.push(fieldError(`finalHouseRestartDisposals.${i}.temporaryTwoHouse`, `${P}: ${n}이 이 주택과 일시적 2주택 관계였는지 선택하세요.`));
    }
  });
  return errors;
}
