/**
 * 주식 양도세 — ⑧(UI validate)과 ⑫(Zod refine)가 **같이 쓰는** 필수 입력 술어
 *
 * 2026-09-30 Zod↔엔진 필수 점검 2차(B5·B6·B8·B9·B13~B18). 두 계층이 «어느 조건에서 어느 키가
 * 필요한가»를 따로 적으면 한쪽만 고쳐지는 순간 「UI 통과 → API 400」이나 「API 200 + 조용한 0」이
 * 된다. 여기는 **키 집합만** 정한다 — 빈 값 판정(폼 문자열 vs 파싱된 숫자)과 메시지는 각 계층이 한다.
 *
 * ⚠️ 순손익가치 0은 적법한 입력이다(결손 법인 — 시행령 §165④1호 단서 80% 하한이 그때 선다).
 *    그래서 ⑫는 **존재**(`!== undefined`)만 보고, ⑧은 빈 문자열만 본다. 양수 판정 금지.
 */

// ── 비상장 보충적 평가(소득세법 시행령 §165④) ──────────────────────────────

export type UnlistedValuationKey =
  | "transferYearNetIncomePerShare"
  | "transferYearNetAssetPerShare"
  | "acquisitionYearNetIncomePerShare"
  | "acquisitionYearNetAssetPerShare"
  | "acqFaceValuePerShare";

/**
 * 보충적 평가에 필요한 키.
 *
 * - `scope: "both"` — 비상장·기타자산 환산, 또는 상장 **양도일 거래정지**(시행령 §165③ → ④)
 * - `scope: "acquisition"` — 상장 **취득일 거래정지**(취득측만 §165④). 이때 장부분실 액면가
 *   토글은 읽지 않는다(엔진·UI 모두 취득측 평가를 무조건 쓴다).
 * - `scope: "transfer"` — 이월과세 **증여자 기준 환산**의 분모(양도측만). 분자는 증여자 취득 당시
 *   기준시가로 덮어쓰이므로 취득측 평가가 필요 없다(계획서 `stock-carryover-sale-case-donor-basis.plan.md` V-2).
 * - 순자산 단독 평가 사유(§165④3호)가 있는 **평가 시점**은 순손익가치가 필요 없다(양도·취득 따로 — 계획서 §14).
 * - 취득시 장부분실(소득세법 §99①4호 후단)이면 취득측 대신 **액면가**가 필요하다.
 */
export function requiredUnlistedValuationKeys(o: {
  scope: "both" | "acquisition" | "transfer";
  niSkip: { transfer: boolean; acquisition: boolean };
  acqFaceValueOnly: boolean;
}): UnlistedValuationKey[] {
  const keys: UnlistedValuationKey[] = [];
  if (o.scope === "both" || o.scope === "transfer") {
    if (!o.niSkip.transfer) keys.push("transferYearNetIncomePerShare");
    keys.push("transferYearNetAssetPerShare");
  }
  if (o.scope === "transfer") return keys;
  if (o.scope === "both" && o.acqFaceValueOnly) {
    keys.push("acqFaceValuePerShare");
  } else {
    if (!o.niSkip.acquisition) keys.push("acquisitionYearNetIncomePerShare");
    keys.push("acquisitionYearNetAssetPerShare");
  }
  return keys;
}

/**
 * 영 §165④3 순자산 단독 사유를 **읽는** 평가 시점 — 그 시점의 사유 칸이 화면(⑤ `EstimatedUnlistedBlock`)에
 * 있는 경우와 같다. ⑧·⑫가 연혁 차단(`isNetAssetOnlyReasonInEra`)을 이 시점에서만 건다 — 칸이 없는 시점에
 * 남은 값을 막으면 고칠 곳이 없다(계획서 `stock-165-4-valuation-followups.plan.md` §13·§14).
 *
 * - 양측: 환산 — 비상장·기타자산 또는 양도일 거래정지(§165③). 취득시 장부분실(사례 49)이면 취득측은 액면가라 취득 사유 없음
 * - 취득측만: 취득일 거래정지(§165③) · 매매사례가액(비상장 — 개산공제 기준시가)
 * - 양도측만: 이월과세 증여자 기준 환산의 분모(비상장 또는 양도일 거래정지)
 */
export function netAssetOnlyReasonSidesRead(o: {
  acquisitionMode: string | undefined;
  listed: boolean;
  haltAtTransfer: boolean;
  haltAtAcquisition: boolean;
  acqFaceValueOnly: boolean;
  donorConversion: boolean;
}): { transfer: boolean; acquisition: boolean } {
  const bothSides = o.acquisitionMode === "estimated" && (!o.listed || o.haltAtTransfer);
  return {
    transfer: bothSides || (o.donorConversion && (!o.listed || o.haltAtTransfer)),
    acquisition:
      (bothSides && !o.acqFaceValueOnly) ||
      (o.acquisitionMode === "estimated" && o.listed && !o.haltAtTransfer && o.haltAtAcquisition) ||
      (o.acquisitionMode === "sale_case" && !o.listed),
  };
}

// ── 취득원인 보조 입력(소득세법 §104② · §97의2①) — 단건 ─────────────────────

export type AcquisitionCauseKey =
  | "decedentAcquisitionDate"
  | "preMergerAcquisitionDate"
  | "donorAcquisitionDate"
  | "donorRelation"
  | "transferredAssetValue"
  | "giftTaxableValue";

/**
 * 단건 취득원인별로 **비어 있는** 필수 키.
 *
 * - 상속 → 피상속인 취득일(§104②1호 — 없으면 상속개시일부터 세어 단기 세율이 된다)
 * - 합병·분할 → 종전 주식 취득일(§104②3호)
 * - 이월과세 증여 → 증여자 취득일(§104②2호) · 증여자와의 관계(§97의2① 본문 — 비우면 엔진이
 *   「배제하지 않음」으로 읽어 배우자와 같게 적용된다)
 * - 이월과세 증여세 산출세액을 넣었으면 안분 분자·분모(시행령 §163의2②2호·3호) — 한쪽이라도
 *   비면 엔진이 증여세 필요경비를 조용히 0으로 둔다.
 */
export function missingAcquisitionCauseKeys(
  cause: string | undefined,
  has: (key: AcquisitionCauseKey | "giftTaxAmount") => boolean,
): AcquisitionCauseKey[] {
  const out: AcquisitionCauseKey[] = [];
  if (cause === "inheritance" && !has("decedentAcquisitionDate")) out.push("decedentAcquisitionDate");
  if (cause === "merger_split" && !has("preMergerAcquisitionDate")) out.push("preMergerAcquisitionDate");
  if (cause === "carryover_gift") {
    if (!has("donorAcquisitionDate")) out.push("donorAcquisitionDate");
    if (!has("donorRelation")) out.push("donorRelation");
    if (has("giftTaxAmount")) {
      if (!has("transferredAssetValue")) out.push("transferredAssetValue");
      if (!has("giftTaxableValue")) out.push("giftTaxableValue");
    }
  }
  return out;
}

// ── 취득원인 보조 입력 — 매수 lot(분할·일자별 다건 공용) ───────────────────────

export type LotCauseKey =
  | "decedentAcquisitionDate"
  | "preMergerAcquisitionDate"
  | "donorAcquisitionDate"
  | "donorRelation"
  | "donorGiftTaxableValue";

/**
 * 매수 lot 취득원인별로 **비어 있는** 필수 키.
 *
 * 이월과세 lot의 증여세는 산출세액과 과세가액이 **짝**이다(시행령 §163의2② 안분) — 한쪽만 양수면
 * 안분이 서지 않아 조용히 0이 된다. 분자(양도한 자산가액)는 엔진이 lot에서 구한다.
 */
export function missingLotCauseKeys(
  cause: string | undefined,
  has: (key: Exclude<LotCauseKey, "donorGiftTaxableValue">) => boolean,
  positive: (key: "donorGiftTaxAmount" | "donorGiftTaxableValue") => boolean,
): LotCauseKey[] {
  const out: LotCauseKey[] = [];
  if (cause === "inheritance" && !has("decedentAcquisitionDate")) out.push("decedentAcquisitionDate");
  if (cause === "merger_split" && !has("preMergerAcquisitionDate")) out.push("preMergerAcquisitionDate");
  if (cause === "carryover_gift") {
    if (!has("donorAcquisitionDate")) out.push("donorAcquisitionDate");
    if (!has("donorRelation")) out.push("donorRelation");
    if (positive("donorGiftTaxAmount") !== positive("donorGiftTaxableValue")) out.push("donorGiftTaxableValue");
  }
  return out;
}

/** 매수 lot 누락 메시지 — ⑧ 분할(step1)·일자별 다건(step2)과 ⑫가 같은 문구를 쓴다. */
export function lotCauseMessage(key: LotCauseKey, index: number): string {
  const n = `매수 lot #${index + 1}`;
  switch (key) {
    case "decedentAcquisitionDate":
      return `${n} (상속): 피상속인 취득일을 입력하세요 (§104②1)`;
    case "preMergerAcquisitionDate":
      return `${n} (합병·분할): 종전 주식 취득일을 입력하세요 (§104②3)`;
    case "donorAcquisitionDate":
      return `${n} (이월과세): 증여자 취득일을 입력하세요 (§104②2)`;
    case "donorRelation":
      return `${n} (이월과세): 증여자와의 관계를 선택하세요 (§97의2① 본문)`;
    case "donorGiftTaxableValue":
      return `${n} (이월과세): 증여세 산출세액과 과세가액을 함께 입력하세요 (영 §163의2② 안분)`;
  }
}
