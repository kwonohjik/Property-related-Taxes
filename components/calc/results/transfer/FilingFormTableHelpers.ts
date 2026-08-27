/**
 * FilingFormTable 순수 계산 헬퍼 — 800줄 분리 정책 준수.
 *
 * Props 타입, RowDef/Column 타입, buildRows, 재무 열 채우기 함수를 포함.
 * FilingFormTable.tsx는 이 파일에서 import 후 JSX만 담당.
 *
 * 재개발 분기 행 생성은 FilingFormTableRedevRows.ts 에 분리.
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import { partAcquisitionDates } from "@/lib/calc/transfer-tax-split-acq-mode";
import type {
  AggregateTransferResult,
  PerPropertyBreakdown,
} from "@/lib/tax-engine/types/transfer-aggregate.types";


// ── Props ──────────────────────────────────────────────────────

/**
 * 다자산 합산(aggregate) 모드 메타 — 사례 27 등 묶음매매·합산신고에서 사용.
 * 자산별 컬럼 + 합계 컬럼으로 단건과 동일한 32행 신고서 양식 표 렌더.
 */
export interface AggregateMeta {
  properties: PerPropertyBreakdown[];
  aggregated: AggregateTransferResult;
  /** propertyId → 지분율 매핑 (헤더 "지분 X%" 배지) */
  ownershipMap?: Map<string, { numerator: number; denominator: number }>;
  /**
   * propertyId → 토지 성격 매핑 (헤더 "자산 N (부수토지)" / "(독립 나대지)" suffix용).
   * 사례 28 landNature 명시 입력 정책에 따라 토지 자산은 성격을 명시.
   */
  landNatureMap?: Map<string, "appurtenant" | "standalone">;
  /**
   * propertyId → 해당 property의 form (다건 multi 전용 — 자산별 양도일·취득일·거주기간 파생).
   * multi는 N개 개별 filing이라 각 property가 자기 form을 가짐. bundled(1 formData) 미주입 시 기존 formData 폴백.
   */
  propertyFormMap?: Map<string, TransferFormData>;
}

export interface FilingFormTableProps {
  result: TransferTaxResult;
  /** 단건 모드에서 폼 데이터 — 미제공 시 합계 열만 결과 기반으로 표시 */
  formData?: TransferFormData;
  /** 다건 모드에서 자산별 표 렌더 시 해당 자산 1개 */
  asset?: AssetForm;
  /** 단건 모드 자산 가액 (formData.contractTotalPrice 우선) */
  transferPriceOverride?: number;
  /**
   * 다자산 합산 모드 — 본 prop이 존재하면 단건/분리 detail보다 우선해
   * `aggregate` 모드 컬럼(합계 + 자산별)으로 32행 표 렌더.
   */
  aggregate?: AggregateMeta;
  /** 헤더 우측 출력 버튼 핸들러 */
  onPrint?: () => void;
  /**
   * 취득일자 라벨 보조 텍스트 — carryover_gift 모드에서 어느 날짜인지 명확화.
   * 예: "(증여자 취득일)" / "(증여 등기접수일)"
   */
  acquisitionDateLabel?: string;
  /**
   * 취득일자 표시값 override — carryover_gift Scenario A에서 증여자 취득일을 표시하기 위함.
   * 자산-수준 acquisitionDate(등기접수일)와 별도로 보유기간/장특공 기산점인 증여자 취득일을 우선 표시.
   * "YYYY-MM-DD" 또는 빈 문자열.
   */
  acquisitionDateOverride?: string;
  /** 헤더 제목 — 기본값 "신고서 양식". Scenario A/B 구분 시 사용. */
  title?: string;
  /** 헤더 서브타이틀 */
  subtitle?: string;
  /** 채택 여부 강조 스타일 */
  adopted?: boolean;
  /**
   * 재개발/재건축 양도 대상 — deriveColumns 컬럼 모드 결정용.
   * "right" + redevSettlementDirection="pay" → 3열 모드 (redev-right-pay).
   * 미제공 시 기본 4열 모드 (redev-4split).
   */
  redevSubject?: "right" | "apt";
  /**
   * 재개발 청산금 방향 — redev-right-pay 모드 활성화 조건.
   */
  redevSettlementDirection?: "pay" | "receive";
}

// ── 내부 타입 ──────────────────────────────────────────────────

export type ColumnKey = string;

export interface Column {
  key: ColumnKey;
  label: string;
}

export interface RowDef {
  label: string;
  /** 열별 값 (number=금액, string=날짜·기간 등) */
  values: Record<ColumnKey, number | string | null>;
  /** 들여쓰기 (보유분/거주분 장특공제 등) */
  indent?: boolean;
  /** 강조 (결정세액·총결정세액·과세표준 등) */
  highlight?: boolean;
  /** 구분선 (섹션 구분) */
  separatorAfter?: boolean;
  /**
   * 열별 주석 — 특수 세율 분기(부수토지 일체과세 등) 시 세율 근거를 산출세액 행 셀 아래에 표시.
   * 예: { "primary": "주택·부수토지 일체과세 / §104①2호·영§167의5 / 재산세제과-1354" }
   */
  notes?: Record<ColumnKey, string>;
  /**
   * 열별 rose 색상 주석 — §95② 단서 배제 등 법령 경고를 붉은 색으로 표시.
   * 예: { "postApproval": "§95② 단서 배제" }
   */
  roseNotes?: Record<ColumnKey, string>;
}

// ── 분할 모드 판정 ─────────────────────────────────────────────

export type ColumnMode =
  | "fourpart"
  | "mixed-4col"
  | "split-2col"
  | "single"
  | "aggregate"
  | "redev-4split"
  | "redev-right-pay"
  | "redev-right-receive"
  | "redev-right-land-pay";

export function deriveColumns(
  result: TransferTaxResult,
  aggregate?: AggregateMeta,
  redevSubject?: "right" | "apt",
  redevSettlementDirection?: "pay" | "receive",
): {
  columns: Column[];
  mode: ColumnMode;
} {
  // 다자산 합산 모드 우선 — 사례 27 등 묶음·합산 신고
  if (aggregate && aggregate.properties.length > 0) {
    const aggCols: Column[] = [{ key: "total", label: "합계" }];
    for (const p of aggregate.properties) {
      const own = aggregate.ownershipMap?.get(p.propertyId);
      const nature = aggregate.landNatureMap?.get(p.propertyId);
      let label = p.propertyLabel;
      // 지분 배지
      if (own && own.numerator > 0 && own.denominator > 0 && own.numerator < own.denominator) {
        const pct = ((own.numerator / own.denominator) * 100)
          .toFixed(2)
          .replace(/\.?0+$/, "");
        label = `${label} (지분 ${pct}%)`;
      }
      // 토지 성격 suffix — 부수토지/독립 나대지 (사례 28 landNature 명시 입력 정책)
      if (nature === "appurtenant") {
        label = `${label} (부수토지)`;
      } else if (nature === "standalone") {
        label = `${label} (독립 나대지)`;
      }
      aggCols.push({ key: p.propertyId, label });
    }
    return { mode: "aggregate", columns: aggCols };
  }

  // 재개발/재건축 — aggregate와 mutually exclusive
  if (result.redevelopmentDetail) {
    // 사례 37 — 토지 출자 §166③: landContribDetail 존재 시 3열 (합계/인가전/인가후)
    // land 분기는 right+pay에서만 허용 (validate가 차단). 최우선 분기.
    if (result.redevelopmentDetail.landContribDetail) {
      return {
        mode: "redev-right-land-pay",
        columns: [
          { key: "total", label: "합계" },
          { key: "preApproval", label: "① 인가전 분 (취득일~인가일)" },
          { key: "postApprovalExistingHouse", label: "② 인가후 분 (LTHD 제외)" },
        ],
      };
    }
    // subject="right" + pay → 3열 (합계/인가전/인가후)
    // §95② 단서: 인가후(청산금납부분) LTHD 배제 — 별도 열로 명시
    if (redevSubject === "right" && redevSettlementDirection === "pay") {
      return {
        mode: "redev-right-pay",
        columns: [
          { key: "total", label: "합계" },
          { key: "preApproval", label: "① 인가전 분" },
          { key: "postApproval", label: "② 인가후 분 (청산금 납부)" },
        ],
      };
    }
    // subject="right" + receive → 3열 (합계/인가전 분(나목)/인가후 분(가목))
    // §166①2호 나목(인가전 분)·가목(인가후 분) 분리 표시
    // 가목(인가후 분) LTHD = 0 (§95② 본문 괄호·zeroBranch)
    // ★ 사례 38·39 라벨 정합화: "입주권 분/청산금 분" → "인가전 분(나목)/인가후 분(가목)"
    if (redevSubject === "right" && redevSettlementDirection === "receive") {
      return {
        mode: "redev-right-receive",
        columns: [
          { key: "total", label: "합계" },
          { key: "preApproval", label: "① 인가전 분 (나목)" },
          { key: "settlement", label: "② 인가후 분 (가목)" },
        ],
      };
    }
    // 그 외(apt): 4열
    // apt + receive + settlementExemptionApplied=true → 청산금 열 라벨에 비과세 차감 명시
    const settlementLabel =
      redevSettlementDirection === "receive" &&
      result.redevelopmentDetail?.settlementExemptionApplied === true
        ? "③ 청산금 분 (§89①4호 비과세 차감 후)"
        : "③ 청산금 분";
    return {
      mode: "redev-4split",
      columns: [
        { key: "total", label: "합계" },
        { key: "preApproval", label: "① 인가전 분" },
        { key: "postApprovalExistingHouse", label: "② 인가후 기존건물분" },
        { key: "settlement", label: settlementLabel },
      ],
    };
  }

  const mu = result.mixedUseDetail;
  const sp = result.splitDetail;

  if (mu && mu.partialUsageChange?.phdScopeBranch === "case_a_whole_building") {
    return {
      mode: "fourpart",
      columns: [
        { key: "total", label: "합계" },
        { key: "housingLand", label: "토지(주택분)" },
        { key: "housingBuilding", label: "주택" },
        { key: "commercialLand", label: "토지(기타분)" },
        { key: "commercialBuilding", label: "기타건물" },
      ],
    };
  }
  if (mu) {
    // 일반 겸용주택 — 주택분·상가분을 각각 토지/건물로 4분할 (토지-우선).
    // 컬럼 키는 Case A "fourpart"와 동일 재사용 → fourPartFinancials 채움 로직 공유.
    return {
      mode: "mixed-4col",
      columns: [
        { key: "total", label: "합계" },
        { key: "housingLand", label: "주택분 토지" },
        { key: "housingBuilding", label: "주택분 건물" },
        { key: "commercialLand", label: "상가분 토지" },
        { key: "commercialBuilding", label: "상가분 건물" },
      ],
    };
  }
  if (sp) {
    // 토지·건물 소유자 분리 — 본인이 소유하지 않는 파트 컬럼 제거 (소령 §166⑥, §168②).
    // building_only → 토지 컬럼 없음 / land_only → 건물 컬럼 없음.
    const selfOwns = sp.selfOwns ?? "both";
    const columns: Column[] = [{ key: "total", label: "합계" }];
    if (selfOwns !== "building_only") columns.push({ key: "land", label: "토지" });
    if (selfOwns !== "land_only") columns.push({ key: "building", label: "건물" });
    return { mode: "split-2col", columns };
  }
  return {
    mode: "single",
    columns: [{ key: "total", label: "합계" }],
  };
}

// ── 날짜·기간 포맷 헬퍼 ────────────────────────────────────────

export function holdingMonthsFromDates(acq?: string, transfer?: string): number {
  if (!acq || !transfer) return 0;
  const a = new Date(acq);
  const t = new Date(transfer);
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return 0;
  let m = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
  if (t.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

export function fmtDate(s?: string): string {
  if (!s) return "-";
  return s;
}

export function fmtPeriod(months?: number): string {
  if (!months || months <= 0) return "-";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y}년 ${m}월`;
}

export function holdingPeriodFromDates(acq?: string, transfer?: string): string {
  if (!acq || !transfer) return "-";
  const a = new Date(acq);
  const t = new Date(transfer);
  if (isNaN(a.getTime()) || isNaN(t.getTime())) return "-";
  // 신고서 표시 규약(2026-07-29 사용자 확정): **연·월 숫자 차이만** 센다(일 무시).
  //   2025-01-08 → 2026-03-06 = 1년 2월 (일 절사 방식의 1년 1월 아님)
  // 만-개월 절사(일 borrow)는 적용하지 않는다 — 합계·토지·건물 전 열 동일 규약.
  const months =
    (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
  if (months < 0) return "-";
  // 같은 달 취득·양도(0개월)도 "-"가 아니라 명시적으로 표시한다.
  if (months === 0) return "0년 0월";
  return fmtPeriod(months);
}

// ── 장특공제 보유/거주 분할 ────────────────────────────────────

/**
 * GB(일반건물) 카드 propertyId별 정확한 취득일 산출.
 *
 * 엔진 내부 카드의 acquisitionDate를 UI에서도 동일하게 표시하기 위한 도메인 매핑:
 *  - 토지 카드(land·land_business·land_nbl) → 토지 취득일 (`partAcquisitionDates(asset).land`)
 *  - 원건물 카드(building·building1) → 건물 취득일 (M-1a 이후 `acquisitionDate`가 건물 취득일)
 *  - 증축건물 카드(building2) → 증축일 (gbExtensionDate, 영 §162①4호 빠른 날 — 사례 33)
 *
 * 비-GB 자산은 asset.acquisitionDate 그대로 반환.
 *
 * 사용처: FilingFormTableAggregateHelpers·DetailedStatementHelpers (DRY).
 */
export function getAcqDateForCard(asset: import("@/lib/stores/calc-wizard-asset").AssetForm | undefined, pid: string): string {
  if (!asset) return "";
  if (asset.assetKind !== "general_building") return asset.acquisitionDate || "";
  // 🔴 지분(%) 분할 카드는 `building2#0` 꼴이라 접미사를 벗기고 봐야 한다 —
  //    안 벗기면 증축분 카드가 default로 떨어져 **증축일 대신 원건물 취득일**을 표시한다.
  const base = baseCardId(pid);
  if (base === "building" || base === "building1") {
    return asset.acquisitionDate || "";
  }
  if (base === "building2") {
    return asset.gbExtensionDate || "";
  }
  // 🔴 토지 카드는 **토지 취득일**이다 — M-1a 이후 `acquisitionDate`는 건물 취득일이라
  //    그대로 쓰면 신축(자가건축)처럼 토지를 먼저 산 자산에서 토지 열 취득일자·보유기간이
  //    건물 기준으로 표시된다(장특공제는 엔진이 토지 취득일로 계산하므로 표시만 어긋난다).
  //    기산일 식은 엔진(`general-building-valuation.ts:412`)·API 변환과 **같은 단일 소스**를 쓴다.
  //
  // ⚠️ **토지 카드 id를 명시 열거한다.** default로 두면 카드 id가 아닌 컬럼(다건 모드의
  //    propertyId — 그 열은 GB 자산 **전체**다)까지 토지 취득일로 바뀐다.
  if (base === "land" || base === "land_business" || base === "land_nbl") {
    return partAcquisitionDates(asset).land;
  }
  return asset.acquisitionDate || "";
}

/**
 * 장기보유특별공제 보유/거주 분할 계산.
 * 소득세법 §95② 별표 — 보유기간분 공제율 : 거주기간분 공제율 비율로 안분.
 */
export function splitLtDeduction(
  totalAmount: number,
  holdingMonths: number,
  residenceMonths: number,
  useTable2: boolean,
): { holdingAmount: number; residenceAmount: number } {
  if (totalAmount <= 0) return { holdingAmount: 0, residenceAmount: 0 };
  if (!useTable2 || residenceMonths <= 0) {
    return { holdingAmount: totalAmount, residenceAmount: 0 };
  }
  const hY = Math.floor(holdingMonths / 12);
  const rY = Math.floor(residenceMonths / 12);
  const holdingRate = Math.min(hY * 0.04, 0.40);
  const residenceRate = Math.min(rY * 0.04, 0.40);
  const totalRate = holdingRate + residenceRate;
  if (totalRate <= 0) return { holdingAmount: totalAmount, residenceAmount: 0 };
  // §95② 별표 표2: 보유기간분·거주기간분 각각 자기 공제율로 직접 산정(잔액 방식 아님).
  // floor 잔액(최대 1원)은 보유분(기저 공제)에 흡수 — 합 = 총 장특공제 불변식 유지, 세액 무관.
  const residenceAmount = Math.floor(totalAmount * residenceRate / totalRate);
  return { holdingAmount: totalAmount - residenceAmount, residenceAmount };
}

// ── 행 정의 생성 ───────────────────────────────────────────────

import { fourPartFinancials, splitTwoColFinancials } from "./FilingFormTableFinancials";
import { buildAggregateRows } from "./FilingFormTableAggregateHelpers";
import { fillRedev4SplitBranchData, fillRedevRightPayBranchData, fillRedevRightReceiveBranchData, fillRedevRightLandPayBranchData } from "./FilingFormTableRedevRows";
import { buildRowsFromOrder } from "./FilingFormTableRowDefs";
import {
  reductionEligibleIncome,
  incomeDeductionReducible,
  resolveRuralSurtax,
} from "./reduction-eligible-income";
import { resolveReceiveOnlyDisplay } from "./receive-only-display";
import { redevBranchTotals } from "./redev-acquisition-inverse";
import { inverseRedevAcquisition } from "./redev-acquisition-inverse";
export { fmtCell } from "./FilingFormTableRowDefs";

export function buildRows(
  result: TransferTaxResult,
  mode: ColumnMode,
  formData?: TransferFormData,
  asset?: AssetForm,
  transferPriceOverride?: number,
  acquisitionDateLabel?: string,
  acquisitionDateOverride?: string,
  aggregate?: AggregateMeta,
): RowDef[] {
  // 다자산 합산 모드 — 별도 빌더 위임. 합계 열은 aggregated, 자산 열은 properties[]로 채움.
  if (mode === "aggregate" && aggregate) {
    return buildAggregateRows(result, aggregate, formData, acquisitionDateLabel);
  }

  const primary = asset ?? formData?.assets[0];
  const acquisitionDate =
    acquisitionDateOverride && acquisitionDateOverride !== ""
      ? acquisitionDateOverride
      : primary?.acquisitionDate ?? "";

  // 양도가액 표시 — 지분 모드(자산 1건 + ratio < 1.0) 방어적 처리:
  //   form.contractTotalPrice는 100% 기준값이므로, 자산이 지분이라면 × ratio 적용해서 본 자산의 지분분 표시.
  //   F4-1 검증으로 본 케이스는 차단되지만, 단독 모드(ratio=1.0)는 무영향이므로 안전한 방어 코드로 유지.
  const rawTotalPrice =
    transferPriceOverride ??
    Number(formData?.contractTotalPrice || primary?.actualSalePrice || 0) ??
    0;
  const ownNum = parseFloat(primary?.ownershipNumerator || "100");
  const ownDen = parseFloat(primary?.ownershipDenominator || "100");
  const ownRatio =
    isFinite(ownNum) && isFinite(ownDen) && ownDen > 0 && ownNum > 0
      ? Math.min(ownNum / ownDen, 1.0)
      : 1.0;
  // receiveOnly(사례 46) — 신고단위 양도가액·양도일은 청산금 분 단독이다(§166①2호 가목).
  // ④ API 변환(`transfer-tax-api.ts:332`·`:341`)과 같은 규칙을 ⑦ 표시에 적용한다.
  // 미발동이면 fallback을 그대로 돌려주므로 아래 지분 안분 분기가 종전대로 살아 있다.
  const receiveOnly = resolveReceiveOnlyDisplay(
    result,
    transferPriceOverride === undefined && ownRatio < 1.0
      ? Math.floor(rawTotalPrice * ownRatio)
      : rawTotalPrice,
    formData?.transferDate ?? "",
  );
  const transferDate = receiveOnly.transferDate;
  const totalTransferPrice = receiveOnly.transferPrice;
  const rawExpenses = Number(primary?.directExpenses || 0);
  const totalExpenses =
    transferPriceOverride === undefined && ownRatio < 1.0
      ? Math.floor(rawExpenses * ownRatio)
      : rawExpenses;

  const mu = result.mixedUseDetail;
  const sp = result.splitDetail;

  const periods = primary?.residenceInputMode === "interval" ? primary.residencePeriods ?? [] : [];
  const firstMoveIn = periods.length > 0 ? periods[0].moveInDate : "";
  const lastMoveOut = periods.length > 0
    ? (periods[periods.length - 1].moveOutDate || transferDate)
    : "";

  const v: Record<string, Record<ColumnKey, number | string | null>> = {};
  const roseNotesMap: Record<string, Record<ColumnKey, string>> = {};

  function setNum(rowKey: string, col: ColumnKey, n: number | null) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = n;
  }
  function setStr(rowKey: string, col: ColumnKey, s: string) {
    if (!v[rowKey]) v[rowKey] = {};
    v[rowKey][col] = s;
  }
  function setRoseNote(rowKey: string, col: ColumnKey, note: string) {
    if (!roseNotesMap[rowKey]) roseNotesMap[rowKey] = {};
    roseNotesMap[rowKey][col] = note;
  }

  setStr("transferDate", "total", fmtDate(transferDate));
  setStr("acquisitionDate", "total", fmtDate(acquisitionDate));
  setStr("holdingPeriod", "total", holdingPeriodFromDates(acquisitionDate, transferDate));

  const residenceMonthsTotal = (() => {
    if (primary?.residenceInputMode === "interval" && periods.length > 0) {
      return periods.reduce((sum, p) => {
        const end = p.moveOutDate || transferDate;
        return sum + holdingMonthsFromDates(p.moveInDate, end);
      }, 0);
    }
    return parseInt(primary?.residencePeriodMonthsAsset || formData?.residencePeriodMonths || "0") || 0;
  })();
  setStr("moveOut", "total", lastMoveOut ? fmtDate(lastMoveOut) : "-");
  setStr("moveIn", "total", firstMoveIn ? fmtDate(firstMoveIn) : "-");
  setStr("residencePeriod", "total", fmtPeriod(residenceMonthsTotal));

  // ── 재개발/재건축 분할 모드 (시행령 §166) — FilingFormTableRedevRows.ts 위임 ──
  const isRedevMode = mode === "redev-4split" || mode === "redev-right-pay" || mode === "redev-right-receive" || mode === "redev-right-land-pay";
  /**
   * 환산취득가 표시 소스 — `usedEstimatedAcquisition` 플래그에만 의존하지 않는다.
   *
   * 🔴 상업용건물 「소득세법 시행령」 제164조 제6항은 엔진이 환산 결과를 **실가처럼 주입**하고
   * `useEstimatedAcquisition:false`로 내린다(`transfer-tax-commercial-step.ts:119~151` — 설계상 의도).
   * 그 플래그로 표시 분기를 가르면 상가가 **실가 분기로 떨어져** 취득가액을
   * 역산(`양도가액 − 양도차익 − 필요경비`)하게 된다. 양도차익이 0이면 역산은 필연적으로
   * `취득가액 = 양도가액`을 내놓아 환산이 수행됐는지조차 화면에서 알 수 없다
   * (2026-08-04 실사례: 최초고시 ㎡당 고시가 10배 오입력 → 사용자가 엔진 결함으로 오인).
   *
   * ⚠️ 「소득세법」 제97조 제2항 제2호 단서 swap 시에는 환산취득가를 **차감하지 않으므로**
   *    (같은 파일 :153) 취득가액 칸에 환산취득가를 쓰면 「양도가 − 취득가 − 경비 = 양도차익」
   *    자기정합이 깨진다 → swap이면 종전 역산을 유지한다(현행 동작 보존).
   */
  const cbDetail = result.commercialBuildingValuationDetail;
  const estimatedDisplay: { base: number; deduction: number } | null = result.swapApplied
    ? null
    : result.usedEstimatedAcquisition && result.estimatedBase !== undefined
      ? { base: result.estimatedBase, deduction: result.estimatedDeduction ?? 0 }
      : cbDetail
        ? { base: cbDetail.estimatedAcquisitionTotal, deduction: cbDetail.estimatedDeductionTotal }
        : null;

  if (isRedevMode && result.redevelopmentDetail) {
    if (mode === "redev-right-land-pay") {
      fillRedevRightLandPayBranchData(result.redevelopmentDetail, setNum, setStr, setRoseNote);
    } else if (mode === "redev-right-pay") {
      fillRedevRightPayBranchData(result.redevelopmentDetail, setNum, setStr, setRoseNote);
    } else if (mode === "redev-right-receive") {
      fillRedevRightReceiveBranchData(result.redevelopmentDetail, setNum, setStr, setRoseNote);
    } else {
      fillRedev4SplitBranchData(result.redevelopmentDetail, setNum, setStr, setRoseNote);
    }
    // 합계 열은 아래 공용 매핑에서 result.* 필드로 채워짐
  } else if ((mode === "fourpart" || mode === "mixed-4col") && mu) {
    const hp = mu.housingPart;
    const cp = mu.commercialPart;
    setStr("transferDate", "housingLand", fmtDate(transferDate));
    setStr("transferDate", "housingBuilding", fmtDate(transferDate));
    setStr("transferDate", "commercialLand", fmtDate(transferDate));
    setStr("transferDate", "commercialBuilding", fmtDate(transferDate));
    // 토지/건물 취득일 분리 표시 — 토지 열=토지 취득일, 건물 열=건물 취득일.
    // 건물 취득일 = 기존 acquisitionDate 변수(override 반영, total 열과 정합).
    // 토지 취득일 = primary.landAcquisitionDate || acquisitionDate (API transfer-tax-api.ts:147 미러 — single-source).
    const landAcqDate = primary?.landAcquisitionDate || acquisitionDate;
    setStr("acquisitionDate", "housingLand", fmtDate(landAcqDate));
    setStr("acquisitionDate", "housingBuilding", fmtDate(acquisitionDate));
    setStr("acquisitionDate", "commercialLand", fmtDate(landAcqDate));
    setStr("acquisitionDate", "commercialBuilding", fmtDate(acquisitionDate));
    const landHold = holdingPeriodFromDates(landAcqDate, transferDate);
    const buildingHold = holdingPeriodFromDates(acquisitionDate, transferDate);
    setStr("holdingPeriod", "housingLand", landHold);
    setStr("holdingPeriod", "housingBuilding", buildingHold);
    setStr("holdingPeriod", "commercialLand", landHold);
    setStr("holdingPeriod", "commercialBuilding", buildingHold);
    setStr("moveOut", "housingLand", lastMoveOut ? fmtDate(lastMoveOut) : "-");
    setStr("moveOut", "housingBuilding", lastMoveOut ? fmtDate(lastMoveOut) : "-");
    setStr("moveIn", "housingLand", firstMoveIn ? fmtDate(firstMoveIn) : "-");
    setStr("moveIn", "housingBuilding", firstMoveIn ? fmtDate(firstMoveIn) : "-");
    setStr("residencePeriod", "housingLand", fmtPeriod(residenceMonthsTotal));
    setStr("residencePeriod", "housingBuilding", fmtPeriod(residenceMonthsTotal));
    fourPartFinancials(hp, cp, mu.nonBusinessLandPart, setNum);
  } else if (mode === "split-2col" && sp) {
    setStr("transferDate", "land", fmtDate(transferDate));
    setStr("transferDate", "building", fmtDate(transferDate));
    // 토지·건물 취득일은 상이할 수 있다(별개취득) — 열별 자기 취득일 표시 (:477 4열 모드와 동일 규약).
    const spLandAcqDate = primary?.landAcquisitionDate || acquisitionDate;
    setStr("acquisitionDate", "land", fmtDate(spLandAcqDate));
    setStr("acquisitionDate", "building", fmtDate(acquisitionDate));
    // 보유기간은 일자 차이(월 단위 절사)로 산정한다. 엔진 holdingYears는 만-연수 정수라
    // 보유 1년 미만이면 `0 × 12 = 0` → fmtPeriod가 "-"를 반환해 건물 열이 비어 보였다.
    // 합계 열(:439)·4열 모드(:482)와 동일 소스.
    const spLandHold = holdingPeriodFromDates(spLandAcqDate, transferDate);
    const spBuildingHold = holdingPeriodFromDates(acquisitionDate, transferDate);
    // 일자가 없는 호출 경로(formData 미전달)에서는 종전대로 엔진 만-연수로 폴백.
    setStr("holdingPeriod", "land", spLandHold !== "-" ? spLandHold : fmtPeriod(Math.round(sp.land.holdingYears * 12)));
    setStr("holdingPeriod", "building", spBuildingHold !== "-" ? spBuildingHold : fmtPeriod(Math.round(sp.building.holdingYears * 12)));
    // 과세비율 분모는 본인 소유 파트의 gain만 — building_only인데 land.gain을 포함하면
    // 분자(result.taxableGain=건물분)와 불일치해 토지·건물 셀이 모두 오염됨.
    const ownedGain =
      (sp.selfOwns === "building_only" ? 0 : sp.land.gain) +
      (sp.selfOwns === "land_only" ? 0 : sp.building.gain);
    const taxableRatio = ownedGain > 0 ? result.taxableGain / ownedGain : 1;
    splitTwoColFinancials(sp.land, sp.building, taxableRatio, setNum);
  }

  setNum("transferPrice", "total", totalTransferPrice || null);
  if (isRedevMode && result.redevelopmentDetail) {
    const r = result.redevelopmentDetail;
    // ★ 재개발/재건축 합계 취득가액 — 역산 규칙 (memory: feedback_redev_filing_form_acquisition_inverse)
    //   합계 취득가액 = 합계 양도가 − 합계 필요경비 − 합계 양도차익
    //   자기일관성(양도가 = 취득가 + 필요경비 + 차익) 자동 보장.
    //   전 분기 공통 적용 — redev-right-pay/receive/land-pay/4split/승계조합원.
    //   사례 37 검산: 520M − 103M − 217M = 200M (환산취득가 = §166③ 결과).
    //   산식·분기 합은 계산명세서와 **공용 leaf**를 쓴다 — 종전엔 여기만 역산이고 명세서는
    //   파트 합이라 같은 화면에서 취득가액이 갈렸다(`redev-acquisition-inverse.ts` 주석 참조).
    const branchTotals = redevBranchTotals(r);
    const inverseAcquisition = inverseRedevAcquisition({
      totalTransferPrice: totalTransferPrice || 0,
      totalExpenses: branchTotals.expenses,
      totalGain: branchTotals.gain,
    });
    setNum("acquisitionPrice", "total", inverseAcquisition);
    // 필요경비 합계는 redev 분기 합으로 이미 설정됨 — 덮어쓰기 금지.
  } else if ((mode === "fourpart" || mode === "mixed-4col") && mu) {
    const hp = mu.housingPart;
    const cp = mu.commercialPart;
    // 취득가액 합계 = 4분할 취득가 합 (= hp/cp.estimatedAcquisitionPrice 합과 동일: land+building=est).
    setNum("acquisitionPrice", "total", hp.landAcqPrice + hp.buildingAcqPrice + cp.landAcqPrice + cp.buildingAcqPrice);
    setNum("expenses", "total", hp.landAppraisalDed + hp.buildingAppraisalDed + cp.landAppraisalDed + cp.buildingAppraisalDed);
  } else if (mode === "split-2col" && sp) {
    if (sp.selfOwns === "building_only" || sp.selfOwns === "land_only") {
      // 본인이 소유한 파트만 신고 대상 — 합계도 소유 파트 단독 (자기정합 + line 613 override).
      const p = sp.selfOwns === "building_only" ? sp.building : sp.land;
      setNum("transferPrice", "total", p.transferPrice || null);
      setNum("acquisitionPrice", "total", p.acquisitionPrice);
      setNum("expenses", "total", p.directExpenses + p.appraisalDeduction);
    } else {
      // both — 토지+건물 합 (지분 반영 totalTransferPrice는 613에서 유지)
      setNum("acquisitionPrice", "total", sp.land.acquisitionPrice + sp.building.acquisitionPrice);
      setNum("expenses", "total",
        sp.land.directExpenses + sp.land.appraisalDeduction +
        sp.building.directExpenses + sp.building.appraisalDeduction,
      );
    }
  } else if (estimatedDisplay !== null) {
    // 환산취득가 모드: 자본적지출(있다면)을 취득가액(=환산취득가)에 합산, 필요경비는 개산공제 + 양도비
    const capExp = result.capitalExpenditureForDisplay ?? 0;
    setNum("acquisitionPrice", "total", estimatedDisplay.base + capExp > 0 ? estimatedDisplay.base + capExp : null);
    const deduction = estimatedDisplay.deduction;
    const transferOnlyExpense = Math.max(0, totalExpenses - capExp);
    const totalNecessaryExpenses = deduction + transferOnlyExpense;
    setNum("expenses", "total", totalNecessaryExpenses > 0 ? totalNecessaryExpenses : null);
  } else {
    // 실가 모드: 자본적지출은 취득가액에 합산 (§97① 가목, 신고서 양식 표시 관행)
    // 엔진 result.expenses는 capitalExpenditure + transferExpense 합산값. split 입력 케이스에서는 form의 legacy directExpenses 대신 사용.
    const capExp = result.capitalExpenditureForDisplay ?? 0;
    const engineExpenses = result.expenses ?? 0;
    const totalEngineExpenses = engineExpenses > 0 ? engineExpenses : totalExpenses;
    // 비과세 자산은 transferGain=0 → exemptGrossGain echo로 취득가액 역산 (그렇지 않으면 취득가액=양도가액−경비로 왜곡).
    const effGainForAcq = result.isExempt ? (result.exemptGrossGain ?? 0) : result.transferGain;
    const engineAcqPrice = totalTransferPrice - effGainForAcq - totalEngineExpenses;
    const displayAcqPrice = engineAcqPrice + capExp;
    const displayExpenses = Math.max(0, totalEngineExpenses - capExp);
    setNum("acquisitionPrice", "total", displayAcqPrice > 0 ? displayAcqPrice : null);
    setNum("expenses", "total", displayExpenses || null);
  }

  // §161 적용 분기 (장기임대주택 거주주택 비과세 특례) — 산식 순서:
  // 양도차익 → 장기보유공제 → §95① 양도소득금액 → §161① 안분 → 비과세/과세 분리
  // 비과세는 양도차익 단계가 아닌 양도소득금액 단계에서 분리하므로 비과세 양도차익=0,
  // 과세대상 양도차익=전체 양도차익으로 표기.
  const isRH = result.rentalHousingExceptionDetail?.applied === true;

  // redev 모드는 분기 합으로 이미 설정됨 — 덮어쓰지 않음.
  if (!isRedevMode) {
    // 비과세 자산은 transferGain=0 → exemptGrossGain echo 사용 (전체·비과세 양도차익 표시).
    const effGain = result.isExempt ? (result.exemptGrossGain ?? 0) : result.transferGain;
    setNum("transferGain", "total", effGain);
    setNum("exemptGain", "total", isRH ? 0 : Math.max(0, effGain - result.taxableGain));
    setNum("taxableGain", "total", isRH ? effGain : result.taxableGain);
  }
  setNum("ltDeduction", "total", result.longTermHoldingDeduction);

  const holdingMs = holdingMonthsFromDates(acquisitionDate, transferDate);
  const residenceMs = residenceMonthsTotal;
  // §161 적용 + 표1(일반)인 경우 거주 기간분 개념 없음 — 보유 기간분에 전액 할당 (§161④)
  // appliedTable === "mixed"(B2) 또는 "table-2"(A2)는 기존 분할 로직 유지
  const isRHTable1Only = result.rentalHousingExceptionDetail?.applied === true
    && result.rentalHousingExceptionDetail.appliedTable === "table-1";
  const useTable2 = mu
    ? mu.housingPart.longTermDeductionTable === 2
    : (isRHTable1Only ? false : residenceMs >= 24);

  if ((mode === "fourpart" || mode === "mixed-4col") && mu) {
    const hpSplit = splitLtDeduction(mu.housingPart.longTermDeductionAmount, holdingMs, residenceMs, useTable2);
    const cpSplit = { holdingAmount: mu.commercialPart.longTermDeductionAmount, residenceAmount: 0 };
    const hpLandRatio = mu.housingPart.transferGain > 0 ? mu.housingPart.landTransferGain / mu.housingPart.transferGain : 0.5;
    const hpBuildRatio = 1 - hpLandRatio;
    const cpLandRatio = mu.commercialPart.transferGain > 0 ? mu.commercialPart.landTransferGain / mu.commercialPart.transferGain : 0.5;
    const cpBuildRatio = 1 - cpLandRatio;
    // 배율초과 비사업용토지 장특은 표1 **보유분** 단독(거주분 없음) — 보유 기간분 행에 싣는다.
    // 누락하면 「장기보유특별공제 합계 ≠ 보유분 + 거주분」이 되어 합계 열 내부가 어긋난다.
    const nbLtDeduction = mu.nonBusinessLandPart?.longTermDeductionAmount ?? 0;
    setNum("ltHoldingPart", "total", hpSplit.holdingAmount + cpSplit.holdingAmount + nbLtDeduction);
    setNum("ltResidencePart", "total", hpSplit.residenceAmount);
    setNum("ltHoldingPart", "housingLand", Math.floor(hpSplit.holdingAmount * hpLandRatio) + nbLtDeduction);
    setNum("ltHoldingPart", "housingBuilding", Math.floor(hpSplit.holdingAmount * hpBuildRatio));
    setNum("ltHoldingPart", "commercialLand", Math.floor(cpSplit.holdingAmount * cpLandRatio));
    setNum("ltHoldingPart", "commercialBuilding", Math.floor(cpSplit.holdingAmount * cpBuildRatio));
    setNum("ltResidencePart", "housingLand", Math.floor(hpSplit.residenceAmount * hpLandRatio));
    setNum("ltResidencePart", "housingBuilding", Math.floor(hpSplit.residenceAmount * hpBuildRatio));
    setNum("ltResidencePart", "commercialLand", 0);
    setNum("ltResidencePart", "commercialBuilding", 0);
  } else if (mode === "split-2col" && sp) {
    const landSplit = splitLtDeduction(sp.land.longTermDeduction, Math.round(sp.land.holdingYears * 12), residenceMs, useTable2);
    const buildSplit = splitLtDeduction(sp.building.longTermDeduction, Math.round(sp.building.holdingYears * 12), residenceMs, useTable2);
    setNum("ltHoldingPart", "total", landSplit.holdingAmount + buildSplit.holdingAmount);
    setNum("ltResidencePart", "total", landSplit.residenceAmount + buildSplit.residenceAmount);
    setNum("ltHoldingPart", "land", landSplit.holdingAmount);
    setNum("ltResidencePart", "land", landSplit.residenceAmount);
    setNum("ltHoldingPart", "building", buildSplit.holdingAmount);
    setNum("ltResidencePart", "building", buildSplit.residenceAmount);
  } else if (isRedevMode) {
    // 분기별 lthdHoldingPart/lthdResidencePart 합으로 이미 정확하게 설정됨.
    // result.longTermHoldingDeduction 기반 재계산은 분기별 분리 정보를 잃으므로 덮어쓰지 않는다.
  } else {
    const split = splitLtDeduction(result.longTermHoldingDeduction, holdingMs, residenceMs, useTable2);
    setNum("ltHoldingPart", "total", split.holdingAmount);
    setNum("ltResidencePart", "total", split.residenceAmount);
  }

  // §161 적용 시: 양도소득금액(§95①) = 양도차익 − 장기보유공제 (전체 양도차익 기준)
  // 일반 케이스: 양도소득금액 = 과세대상 양도차익 − 장기보유공제 (기존 로직)
  const incomeAmount = isRH
    ? result.transferGain - result.longTermHoldingDeduction
    : result.taxableGain - result.longTermHoldingDeduction;
  setNum("incomeAmount", "total", incomeAmount);
  // §161 비과세 양도소득금액 — 양도소득금액 단계 차감 (§95①에서 안분)
  setNum("nontaxableIncome", "total", isRH ? (result.nontaxableGainAmount ?? 0) : 0);
  // ⑲ 세액감면대상금액 = 감면대상 양도소득금액 (§90① — 감면율 前). §77 계열 reducibleIncome은 감면율 곱값이라 부적합.
  setNum(
    "reductionTargetIncome",
    "total",
    reductionEligibleIncome(
      result.reductionTypeApplied,
      incomeAmount,
      result.reducibleIncome ?? 0,
      result.replacementLandDetail?.eligibleTransferIncome,
    ),
  );
  // 소득금액차감방식(§90②) 5년 안분 차감액 — §99의3·§99·§98의8·하이브리드 공용.
  // 산식: 양도소득금액 × (5년시점 공시가격 - 취득시 공시가격) / (양도시 공시가격 - 취득시 공시가격)
  const incomeDeductionAmount = incomeDeductionReducible(result);
  setNum("reductionTargetIncome2", "total", incomeDeductionAmount);
  // 감면후 소득금액 = 양도소득금액 − 소득금액 감면대상(⑳ §90② 소득금액차감방식)
  // §90①(세액감면방식·§77 등)은 소득금액 미차감 → ⑲(세액감면대상)은 빼지 않는다 (다건·상세명세서와 일치).
  // §161 (장기임대 거주주택 비과세) 케이스는 result.taxableGain이 이미 안분 후 값이므로 별도 처리.
  const incomeAmountAfter = isRH
    ? result.taxableGain
    : Math.max(0, incomeAmount - incomeDeductionAmount);
  setNum("incomeAmountAfter", "total", incomeAmountAfter);
  setNum("priorIncomeAmount", "total", 0);
  setNum("basicDeduction", "total", result.basicDeduction);
  setNum("taxBase", "total", result.taxBase);
  setNum("calculatedTax", "total", result.calculatedTax);
  setNum("reductionTax", "total", result.reductionAmount);
  setNum("determinedTax", "total", result.determinedTax);
  /**
   * ㉘ 가산세액 — **두 축의 합**이다(「소득세법」 제92조 제3항 제3호).
   *   · `result.penaltyTax`      : 「소득세법」 제114조의2 환산가액적용가산세
   *   · `result.penaltyDetail`   : 「국세기본법」 제47조의2~제47조의4 신고불성실·납부지연
   *
   * 종전에는 §114조의2분만 실어, 같은 화면의 상세명세서(`DetailedStatementHelpers.ts`)·
   * 다건 신고서 표(`FilingFormTableAggregateHelpers.ts`)·상단 총납부세액 카드가 합산해 보여주는
   * 값과 이 표만 어긋났다. 「신고서 양식」은 단독 print leaf라 이 표만 인쇄하면 국기법
   * 가산세가 통째로 빠진 서식이 나온다.
   */
  const totalPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
  setNum("penaltyTax", "total", totalPenalty);
  setNum("totalDeterminedTax", "total", result.determinedTax + totalPenalty);
  // Round 11 (2026-05-06): §99의3 등 감면 적용 시 농어촌특별세 (감면세액 × 20%, 농특세법 §3·§5)
  // 농특세는 **총액 echo가 정본**이다 — 종전 `incomeDeductionRuralSurtax`는 소득금액차감형
  // detail 11종만 훑어 §77·§77의2·§77의3·§97 계열이 통째로 빠졌다(`resolveRuralSurtax` 주석).
  setNum("ruralSurtax", "total", resolveRuralSurtax(result));
  /**
   * 지방소득세 산출세액 — **다시 계산하지 않는다**.
   *
   * 지방세 감면세액(아래 `localReduction`)이 0 하드코딩이므로 「산출세액 ≡ 결정세액」이고,
   * 결정세액은 엔진 `localIncomeTax`가 정본이다. 종전에는 여기서 base를 재현했는데
   * 그 방식은 **어댑터 경유 result에서 조용히 틀렸다** — `result.penaltyTax` 슬롯이
   * 겸용(`mixedUseToFilingResult`)에서는 국기법분 그 자체이고, 건별
   * (`breakdownToFilingResult`)에서는 국기법분이 합산된 총액이기 때문이다.
   * 축 설명은 `local-income-tax-display.ts` 참조.
   */
  setNum("localCalculatedTax", "total", result.localIncomeTax);
  setNum("localReduction", "total", 0);
  setNum("localDeterminedTax", "total", result.localIncomeTax);

  // 단건 — shortTermNote 산출세액 행 주석 (부수토지 일체과세 등 특수 세율)
  const singleTaxNotes: Record<ColumnKey, string> | undefined =
    result.shortTermNote ? { total: result.shortTermNote } : undefined;

  const acqDateRowLabel = acquisitionDateLabel
    ? `취득일자 ${acquisitionDateLabel}`
    : "취득일자";

  return buildRowsFromOrder(v, roseNotesMap, acqDateRowLabel, singleTaxNotes);
}
