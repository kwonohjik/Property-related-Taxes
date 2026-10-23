/**
 * 겸용주택 × 부담부증여 — **폼 파생 leaf** (⑤ 표시 · ④ 전송 · ⑧ 요구 · ⑥ 사이드바가 **같은 함수**를 부른다 — 3중 패턴).
 *
 * 설계: docs/02-design/features/transfer-burdened-gift-mixed-use.ui.design.md (R2) §3·§4·§5.1·§5.6 ·
 *       docs/02-design/features/transfer-burdened-gift-mixed-use.engine.design.md (R4) §3.1A·§3.7.
 *
 * ## 이 파일이 하는 일 / 하지 않는 일
 *  · 폼 문자열 → 엔진 입력(채무 귀속 3값 · 구분 감정평가 선언 · 양도시/취득시 기준시가 합계 · 취득 플래그)으로 **옮기기만** 한다.
 *  · 차단 규칙(MB-1~MB-18)·귀속 안분(`B_h'`/`B_c'`)·C·C_h는 **엔진 leaf**(`mixed-use-burdened-gift-prepare.ts`)가 한다 — 복제하지 않는다.
 *    그 호출은 `burdened-gift-mixed-use-preview.ts`(이 파일을 부르는 쪽)가 한다. 이 파일은 `transfer-tax-api-burdened-gift.ts`가 import하므로
 *    그 파일을 거꾸로 import하지 않는다(순환 방지).
 *  · 읽기 전용이다 — `useEffect → store` 미러링으로 쓰지 않는다. 비어 있는 값은 **0으로 메우지 않고** `missing`/`issues`에 싣는다(자동 안분 fallback 금지).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { multiplyByArea } from "@/lib/tax-engine/area-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  mixedAcqCommercialBuildingStd,
  mixedAcqLandPricePerSqm,
  mixedDerivedAreasOf,
  mixedTransferLandPricePerSqm,
} from "./mixed-use-std-fallback";

type ScopeAsset = Pick<AssetForm, "assetKind" | "transferType"> & { isMixedUseHouse?: boolean };

/** 겸용주택이면서 부담부증여인 자산 — 이 작업의 모든 화면·검증·전송 분기의 단일 게이트. */
export function isMixedBurdenedGift(a: ScopeAsset): boolean {
  return a.assetKind === "housing" && a.isMixedUseHouse === true && a.transferType === "burdened_gift";
}

/**
 * 겸용 × 부담부증여 × 시가 평가 × 증여자가 상속·증여로 취득 — 상속개시일·증여일 현재 주택분·상가분 상증법 평가액이 취득 당시 실지거래가액이다
 * (소령 §163⑨ — 엔진 `analyzeMixedBurdenedGift`의 `deemedPath`와 같은 판정 · PR-7b-7a). 산정방식을 고르지 않는다.
 * ⑤ 라디오 숨김·① 칸 필수 · ④ 평가액 전송·산정방식 미전송 · ⑧ 방식 면제가 이 함수 하나를 쓴다.
 * 기준시가 평가는 §159①1호 괄호가 취득시 기준시가를 쓰게 해 평가액을 읽지 않는다(매매와 같다).
 */
export function isMixedBgDeemedPath(
  a: ScopeAsset & Pick<AssetForm, "bgValuationMode" | "acquisitionCause">,
): boolean {
  return (
    isMixedBurdenedGift(a) &&
    a.bgValuationMode === "sangjeungbeop_market" &&
    (a.acquisitionCause === "inheritance" || a.acquisitionCause === "gift")
  );
}

// ───────────────────────── 채무 귀속 (D-7) ─────────────────────────

export type BgAttrItem = "deposit" | "mortgage";
export type BgAttrMode = AssetForm["bgDepositAttribution"];

export const BG_ATTR_ITEM_LABEL: Record<BgAttrItem, string> = { deposit: "임대보증금", mortgage: "담보차입금" };

export interface MixedBgDebtAttrIssue {
  item: BgAttrItem;
  kind: "MODE_MISSING" | "SPLIT_MISMATCH";
  /** ⑧ 점프 앵커(`data-field`) */
  field: "bgDepositAttribution" | "bgMortgageAttribution" | "bgDepositSplitHousing" | "bgMortgageSplitHousing";
  /** SPLIT_MISMATCH: 총액 − 합(양수 = 덜 배분, 음수 = 초과 배분) */
  diff: number;
  /** 오류 문장을 만들 때 쓰는 값 */
  total: number;
  split?: { housing: number; commercial: number; unallocated: number };
}

export interface MixedBgDebtAttribution {
  /** 엔진 `BurdenedGiftInfo.debtAttribution`에 실을 3값 — 이슈가 없을 때만 의미가 있다 */
  housing: number;
  commercial: number;
  unallocated: number;
  issues: MixedBgDebtAttrIssue[];
}

function itemOf(a: AssetForm, item: BgAttrItem) {
  return item === "deposit"
    ? {
        total: parseAmount(a.bgLendingDepositTotal) || 0,
        mode: a.bgDepositAttribution as BgAttrMode,
        split: {
          housing: parseAmount(a.bgDepositSplitHousing) || 0,
          commercial: parseAmount(a.bgDepositSplitCommercial) || 0,
          unallocated: parseAmount(a.bgDepositSplitUnallocated) || 0,
        },
        modeField: "bgDepositAttribution" as const,
        splitField: "bgDepositSplitHousing" as const,
      }
    : {
        total: parseAmount(a.bgMortgageDebtAmount) || 0,
        mode: a.bgMortgageAttribution as BgAttrMode,
        split: {
          housing: parseAmount(a.bgMortgageSplitHousing) || 0,
          commercial: parseAmount(a.bgMortgageSplitCommercial) || 0,
          unallocated: parseAmount(a.bgMortgageSplitUnallocated) || 0,
        },
        modeField: "bgMortgageAttribution" as const,
        splitField: "bgMortgageSplitHousing" as const,
      };
}

/**
 * 임대보증금·담보차입금의 귀속 선언 → 엔진 `debtAttribution` 3값.
 *
 * · 총액 0인 항목은 건너뛴다(모드 선택을 요구하지 않는다).
 * · 모드 `""`는 **어느 버킷에도 넣지 않는다** — 「전부 구분 불분명」 기본값 금지(엔진 Q-10).
 * · `split`은 입력 3칸을 그대로 쓰고 합이 총액과 다르면 `SPLIT_MISMATCH`. 비분할 모드는 구조상 합이 총액과 같다.
 * · 분할 3칸은 `split`일 때만 읽는다 — 모드를 바꿔도 값은 보존되지만 전송되지 않는다(stale 가드).
 */
export function mixedBgDebtAttribution(a: AssetForm): MixedBgDebtAttribution {
  const out: MixedBgDebtAttribution = { housing: 0, commercial: 0, unallocated: 0, issues: [] };
  for (const item of ["deposit", "mortgage"] as const) {
    const it = itemOf(a, item);
    if (it.total <= 0) continue;
    switch (it.mode) {
      case "housing": out.housing += it.total; break;
      case "commercial": out.commercial += it.total; break;
      case "unallocated": out.unallocated += it.total; break;
      case "split": {
        const sum = it.split.housing + it.split.commercial + it.split.unallocated;
        if (sum !== it.total) {
          out.issues.push({ item, kind: "SPLIT_MISMATCH", field: it.splitField, diff: it.total - sum, total: it.total, split: it.split });
        } else {
          out.housing += it.split.housing;
          out.commercial += it.split.commercial;
          out.unallocated += it.split.unallocated;
        }
        break;
      }
      default:
        out.issues.push({ item, kind: "MODE_MISSING", field: it.modeField, diff: it.total, total: it.total });
    }
  }
  return out;
}

/** 귀속 오류 문장 — ⑧과 귀속 카드 인라인 경고가 같은 문장을 쓴다. */
export function mixedBgDebtAttrMessage(issue: MixedBgDebtAttrIssue): string {
  const label = BG_ATTR_ITEM_LABEL[issue.item];
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  if (issue.kind === "MODE_MISSING") {
    return issue.item === "deposit"
      ? `${label} ${won(issue.total)}이 주택·상가 중 어디에 속하는지 선택하세요. 임차 대상이 분명하면 그 부분을, 건물 전체를 일괄 임대하는 등 분명하지 않으면 「구분 불분명」을 선택합니다 (국세청 부동산거래관리과-119).`
      : `${label} ${won(issue.total)}이 주택·상가 중 어디에 속하는지 선택하세요. 근저당이 건물 전체에 설정되어 대상이 분명하지 않으면 「구분 불분명」을 선택합니다 (국세청 부동산거래관리과-119).`;
  }
  const s = issue.split ?? { housing: 0, commercial: 0, unallocated: 0 };
  const sum = s.housing + s.commercial + s.unallocated;
  const gap = issue.diff > 0 ? `${won(issue.diff)}이 배분되지 않았습니다.` : `${won(-issue.diff)}을 초과해 배분했습니다.`;
  return `${label} 귀속 합계(주택 ${s.housing.toLocaleString("ko-KR")} + 상가 ${s.commercial.toLocaleString("ko-KR")} + 구분 불분명 ${s.unallocated.toLocaleString("ko-KR")} = ${won(sum)})가 ${label} 총액(${won(issue.total)})과 다릅니다 — ${gap}`;
}

/**
 * MB-14(부분 초과) 점프 대상 — 초과한 쪽에 **0이 아닌 귀속이 들어간 항목** 중 담보차입금 → 임대보증금 순으로 첫 번째의 모드 칸.
 * 구분 불분명 몫은 두 쪽 모두에 들어가므로 «귀속이 들어갔다»에 포함한다. 없으면 임대보증금 모드 칸.
 */
export function mixedBgOverflowField(a: AssetForm, part: "housing" | "commercial"): MixedBgDebtAttrIssue["field"] {
  for (const item of ["mortgage", "deposit"] as const) {
    const it = itemOf(a, item);
    if (it.total <= 0) continue;
    const contributes =
      it.mode === part || it.mode === "unallocated" || (it.mode === "split" && (it.split[part] > 0 || it.split.unallocated > 0));
    if (contributes) return it.modeField;
  }
  return "bgDepositAttribution";
}

// ───────────────────────── 구분 감정평가 선언 (G-13) ─────────────────────────

/**
 * 시가 모드 × 겸용: 엔진 `BurdenedGiftInfo.housingAppraisal`. 선언 `""`(미선택)이면 **undefined** — 엔진이 MB-17로 차단한다(기본값 없음).
 * 시가 모드가 아니면 보내지 않는다(기준시가 모드에 실리면 MB-17이 거부).
 */
export function mixedBgHousingAppraisal(a: AssetForm): { exists: boolean; housingValue?: number } | undefined {
  if (a.bgValuationMode !== "sangjeungbeop_market") return undefined;
  if (a.bgHousingAppraisalDeclared === "none") return { exists: false };
  if (a.bgHousingAppraisalDeclared === "exists") {
    const hv = parseAmount(a.bgHousingAppraisalValue);
    return hv > 0 ? { exists: true, housingValue: hv } : { exists: true };
  }
  return undefined;
}

// ───────────────────────── 기준시가 합계 (표시 = ④ 전송 = ⑧ 요구) ─────────────────────────

export interface MixedStdTotal {
  /** 주택분 — 개별주택가격(주택건물 + 부수토지 일괄 고시) */
  housing: number;
  /** 상가 부수토지 = 개별공시지가 × 상가 부수토지 면적 */
  commercialLand: number;
  /** 상가건물 기준시가 */
  commercialBuilding: number;
  total: number;
  /** 상가 부수토지 면적(㎡) · 단가(원/㎡) — 요약 패널이 산식 옆에 숫자로 보인다 */
  commercialLandArea: number;
  landPricePerSqm: number;
  /** 비어 있는 입력칸의 `data-field` 이름 — **0으로 메우지 않는다**. */
  missing: string[];
}

/** 양도시(= 증여일) 4부분 기준시가 합계. 엔진 MB-12 검증 대상(엔진이 재파생한 Σ와 같아야 한다). */
export function mixedTransferStdTotal(a: AssetForm): MixedStdTotal {
  const areas = mixedDerivedAreasOf(a);
  const housing = parseAmount(a.mixedTransferHousingPrice);
  const landPricePerSqm = mixedTransferLandPricePerSqm(a);
  const commercialBuilding = parseAmount(a.mixedTransferCommercialBuildingPrice);
  const commercialLand = multiplyByArea(landPricePerSqm, areas.commercialLandArea);
  const missing: string[] = [];
  if (!(housing > 0)) missing.push("mixedTransferHousingPrice");
  if (!(landPricePerSqm > 0)) missing.push("mixedTransferLandPricePerSqm");
  if (!(commercialBuilding > 0)) missing.push("mixedTransferCommercialBuildingPrice");
  return {
    housing, commercialLand, commercialBuilding,
    total: housing + commercialLand + commercialBuilding,
    commercialLandArea: areas.commercialLandArea, landPricePerSqm, missing,
  };
}

/** 취득시 4부분 기준시가 합계(정보용 — 엔진은 비교하지 않는다. 취득일이 다르면 엔진 basis와 합이 다를 수 있다 — 엔진 V-15). */
export function mixedAcqStdTotal(a: AssetForm, transferDate: string): MixedStdTotal {
  const areas = mixedDerivedAreasOf(a);
  const housing = parseAmount(a.mixedAcqHousingPrice);
  const landPricePerSqm = mixedAcqLandPricePerSqm(a, transferDate);
  const commercialBuilding = mixedAcqCommercialBuildingStd(a);
  const commercialLand = multiplyByArea(landPricePerSqm, areas.commercialLandArea);
  const missing: string[] = [];
  if (!(housing > 0)) missing.push("mixedAcqHousingPrice");
  if (!(landPricePerSqm > 0)) missing.push("mixedAcqLandPricePerSqm");
  if (!(commercialBuilding > 0)) missing.push("mixedAcqCommercialBuildingPrice");
  return {
    housing, commercialLand, commercialBuilding,
    total: housing + commercialLand + commercialBuilding,
    commercialLandArea: areas.commercialLandArea, landPricePerSqm, missing,
  };
}

// ───────────────────────── 취득 플래그 파생 (BG 산정방식이 정본) ─────────────────────────

export interface MixedBgAcquisitionFlags {
  useActualAcquisition: boolean;
  useAppraisalSalesAcquisition: boolean;
  /** 실지·추계 총액(원) — K-4 `bgActualAcquisitionTotal` · K-6/K-7 `bgPresumedAcquisitionTotal`. 그 밖에는 undefined */
  acquisitionActualTotalPrice: number | undefined;
}

/**
 * 겸용 `mixedUse`의 취득 플래그를 **BG 산정방식에서 파생**한다 — 폼의 겸용 취득 플래그(`useEstimatedAcquisition`·`fixedAcquisitionPrice`·`similarSalesValue`)는
 * BG 화면에서 숨겨져 있어 stale이다. ⑫는 `useActualAcquisition`이면 총액을 요구하므로(`transfer-tax-schema-mixed-use.ts:167`) 기본 매매 폼의 stale 플래그를 그대로 보내면 400이다.
 * 기준시가 모드(K-1~3)·K-5는 두 플래그 모두 끈다.
 */
export function resolveMixedBgAcquisition(a: AssetForm): MixedBgAcquisitionFlags {
  const none: MixedBgAcquisitionFlags = { useActualAcquisition: false, useAppraisalSalesAcquisition: false, acquisitionActualTotalPrice: undefined };
  if (a.bgValuationMode !== "sangjeungbeop_market") return none;
  // 상속·증여 취득 — 산정방식이 없다(평가액이 취득가액 · 엔진이 상속·증여 플래그로 덮어쓴다). 숨은 방식·총액 칸의 stale 값을 싣지 않는다.
  if (isMixedBgDeemedPath(a)) return none;
  if (a.bgAcquisitionMethod === "actual") {
    const t = parseAmount(a.bgActualAcquisitionTotal);
    return { useActualAcquisition: true, useAppraisalSalesAcquisition: false, acquisitionActualTotalPrice: t > 0 ? t : undefined };
  }
  if (a.bgAcquisitionMethod === "salesCase" || a.bgAcquisitionMethod === "appraisal") {
    const t = parseAmount(a.bgPresumedAcquisitionTotal);
    return { useActualAcquisition: false, useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: t > 0 ? t : undefined };
  }
  return none;
}

// ───────────────────────── UI 전용 P1 좁힘 ─────────────────────────

export interface MixedBgUiBlock {
  /** ⑧ 점프 앵커 */
  field: "acquisitionCause" | "isSelfBuilt";
  /** 짧은 사유 — 라디오 옵션 hint·disabledReason */
  short: string;
  /** 오류 문장(자산 라벨 접두 없음) */
  long: string;
}

/** 취득원인 옵션이 겸용 × 부담부증여에서 막히는가 — 라디오 옵션 `disabled` 판정(⑤)과 ⑧이 같은 함수를 쓴다. */
export function mixedBgBlockedCause(cause: string | undefined): MixedBgUiBlock | null {
  switch (cause) {
    case "carryover_gift":
      return {
        field: "acquisitionCause",
        short: "겸용주택 부담부증여는 이월과세 취득과 함께 계산할 수 없습니다",
        long: "겸용주택 부담부증여는 배우자등 이월과세(「소득세법」 제97조의2) 취득과 함께 계산할 수 없습니다.",
      };
    case "newConstruction":
      return {
        field: "acquisitionCause",
        short: "겸용주택 부담부증여는 신축(자가건축) 취득을 계산하지 않습니다",
        long: "겸용주택 부담부증여는 증여자가 신축(자가건축)한 경우를 계산하지 않습니다 — 겸용 입력에 신축 정보가 없고 「소득세법」 제114조의2(신축·증축 5년 내 환산·감정 가산세)를 반영하지 못합니다.",
      };
    default:
      return null;
  }
}

/**
 * UI 전용 제한 — 엔진 MB-1~MB-18에 **없는** 것만 둔다(엔진 판정은 collector가 한다 — 복제 금지).
 *
 *  · 취득원인: 이월과세·신축은 엔진 MB-9·MB-15와 같은 결론이라 문구도 같다. 상속·증여는 PR-7b-7a부터 연다(1985.1.1. 전은 엔진 MB-16,
 *    시가 평가의 1985.1.1.~2005.4.29.은 MB-18이 막는다 — collector가 ⑧에 알린다).
 *  · 신축·증축 **값**: 엔진 MB-15는 API `acquisitionCause === "newConstruction"`만 본다. 취득원인이 매매인데 `isSelfBuilt`가 켜져 있으면 겸용 ④는
 *    그 값을 보내지 않아(`transfer-tax-api.ts:420` `!isMixed && …`) 엔진이 모르는 채 §114조의2 가산세 없이 계산된다 → 화면에서 막는다.
 */
export function bgMixedUseBlock(a: AssetForm): MixedBgUiBlock | null {
  const cause = mixedBgBlockedCause(a.acquisitionCause);
  if (cause) return cause;
  if (a.isSelfBuilt === true) {
    return {
      field: "isSelfBuilt",
      short: "겸용주택 부담부증여는 신축·증축 특례를 반영하지 못합니다",
      long: "신축·증축 정보가 켜져 있습니다 — 겸용주택 부담부증여는 신축·증축 특례(「소득세법」 제114조의2 5년 내 환산·감정 가산세, 환산취득가 기산)를 반영하지 못해 계산하지 않습니다. 취득정보의 「신축·증축」 선택을 끄세요.",
    };
  }
  return null;
}

// ───────────────────────── 「양도 없음」 표시 (사이드바 · 결과) ─────────────────────────

/**
 * 한쪽(주택/상가)에 양도로 보는 채무액이 없을 때의 한 줄 — 사이드바 양도가액 보조 문구.
 * 세법상 분류(비과세/과세)가 아니라 **양도 여부**를 말한다. 「비과세」·「감면」은 쓰지 않는다.
 */
export function mixedBgNoTransferNote(housingDebt: number, commercialDebt: number): string | undefined {
  if (housingDebt <= 0 && commercialDebt > 0) return "주택분 양도 없음 (채무 귀속: 상가)";
  if (commercialDebt <= 0 && housingDebt > 0) return "상가분 양도 없음 (채무 귀속: 주택)";
  return undefined;
}

/**
 * 계산 **전**에도 알 수 있는 경우 — 귀속이 한쪽 «전부»이고 구분 불분명이 없을 때만(불분명이 있으면 안분 결과를 엔진만 안다).
 * 계산 후에는 엔진 echo(`debtAttribution.housingDebt/commercialDebt`)로 같은 문구를 만든다.
 */
export function mixedBgNoTransferNoteOfForm(a: AssetForm): string | undefined {
  const attr = mixedBgDebtAttribution(a);
  if (attr.issues.length > 0 || attr.unallocated > 0) return undefined;
  return mixedBgNoTransferNote(attr.housing, attr.commercial);
}
