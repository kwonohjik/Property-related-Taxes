/**
 * 국외자산 부동산 → 별지 제84호서식(양도소득과세표준 신고 및 납부계산서) 신고서 표 — 순수 매핑.
 *
 * 국내 부동산과 같은 서식·같은 격자(`Column`×`RowDef`)로 만든다(사용자 결정 V-6). 엔진이 낸 값(`ForeignRealEstateResult`)만 읽는다 —
 * 세액·공제·배분을 여기서 다시 계산하지 않는다. 자산별 열의 금액은 원화 환산값이다.
 *
 * 칸 번호는 별지 제84호서식 본지·부표 1의 것이다(코드 근거: `foreign-filing-form-codes.ts`).
 * 서식에 칸이 없거나(지방소득세 · 필요경비 산입 외국납부세액) 엔진이 계산하지 않는 칸(⑪ 감면세액 · ⑯ 가산세 등)은 비우고 `notices`로 알린다.
 *
 * 납세의무 없음(거주 5년 미만)은 신고 의무가 없어 신고서 표를 만들지 않는다 — 호출 측이 `hasForeignFilingForm`으로 가린다.
 */
import { fmtRatePct } from "@/components/calc/results/transfer/FilingFormTableRowDefs";
import type { Column, RowDef } from "@/components/calc/results/transfer/FilingFormTableTypes";
import { COUNTRY_OPTIONS } from "@/components/calc/foreign/foreign-options";
import type { ForeignRealEstateAssetRow, ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import { TRANSFER_FOREIGN_RE } from "@/lib/tax-engine/legal-codes/transfer-foreign-realestate";
import {
  FOREIGN_ACQUISITION_KIND_TEXT,
  FOREIGN_ASSET_KIND_CODE,
  FOREIGN_LOCATION_CODE,
  FOREIGN_LTHD_CELL,
  FOREIGN_RE_RATE_CODE,
} from "./foreign-filing-form-codes";

/** 신고서 표가 읽는 입력 쪽 표시값 — 엔진 입력에 없는 소재지(소재지국·소재지). 결과 `rows`와 같은 입력 순서(인덱스)로 짝짓는다. */
export interface ForeignFilingAssetMeta {
  countryLabel?: string;
  address?: string;
}

export type ForeignFilingMeta = readonly ForeignFilingAssetMeta[];

export interface ForeignFilingForm {
  columns: Column[];
  rows: RowDef[];
  /** 표 아래 「※」 안내 — 서식에 칸이 없거나 확인이 필요한 사항 */
  notices: string[];
}

/** 신고서 표 머리글 부제 — 서식 명칭과 근거 조문(상수) */
export const FOREIGN_FILING_SUBTITLE = `양도소득(국외전출자)과세표준 신고 및 납부계산서 · 국외분(${TRANSFER_FOREIGN_RE.SECTION_118_2_SCOPE}) — 국내 부동산과 같은 서식`;

/** 신고서 표를 만드는 결과인가 — 거주 5년 미만(납세의무 없음)은 신고 대상이 아니다 */
export function hasForeignFilingForm(result: ForeignRealEstateResult): boolean {
  return result.isLiable && result.rows.length > 0;
}

/** 폼의 소재국·소재지 → 신고서 표 표시값 — `COUNTRY_OPTIONS` 라벨의 통화 괄호를 뗀다. 「기타」는 국가를 가리키지 않아 비운다(확인 필요). */
export function buildForeignFilingMeta(
  assets: readonly { countryCode: string; address: string }[],
): ForeignFilingMeta {
  return assets.map((a) => {
    const opt = a.countryCode && a.countryCode !== "OTHER" ? COUNTRY_OPTIONS.find((o) => o.value === a.countryCode) : undefined;
    return {
      countryLabel: opt ? opt.label.replace(/\s*\(.*\)$/, "") : undefined,
      address: a.address.trim() || undefined,
    };
  });
}

const KIND_LABEL: Record<ForeignRealEstateAssetRow["kind"], string> = { land: "토지", building: "건물" };

type Cell = number | string | null;

export function buildForeignFilingForm(result: ForeignRealEstateResult, meta: ForeignFilingMeta = []): ForeignFilingForm {
  const assets = result.rows;
  const single = assets.length === 1;
  const columns: Column[] = [
    { key: "total", label: single ? "합계 (국외분 소계)" : "합계 (국외분)" },
    ...(single ? [] : assets.map((a) => ({ key: a.id, label: `${a.id} (${KIND_LABEL[a.kind]})` }))),
  ];

  /** 합계 열 값 + 자산 열 값(다건일 때만). 단건은 합계 열이 곧 그 자산이라 합계 열 값만 쓴다. */
  const values = (total: Cell, per?: (a: ForeignRealEstateAssetRow) => Cell): Record<string, Cell> => {
    const v: Record<string, Cell> = { total };
    if (!single && per) for (const a of assets) v[a.id] = per(a);
    return v;
  };
  /** 자산 한 건의 값을 단건은 합계 열에, 다건은 합계 열 「-」 + 자산 열에 싣는다 */
  const perAsset = (per: (a: ForeignRealEstateAssetRow) => Cell): Record<string, Cell> =>
    values(single ? per(assets[0]) : null, per);
  const noteOn = (per: (a: ForeignRealEstateAssetRow) => string | undefined): Record<string, string> | undefined => {
    const n: Record<string, string> = {};
    if (single) {
      const t = per(assets[0]);
      if (t) n.total = t;
    } else {
      for (const a of assets) {
        const t = per(a);
        if (t) n[a.id] = t;
      }
    }
    return Object.keys(n).length > 0 ? n : undefined;
  };
  const metaOf = (a: ForeignRealEstateAssetRow): ForeignFilingAssetMeta => meta[assets.indexOf(a)] ?? {};

  const paid = result.foreignTaxPaidKrwTotal > 0;
  const creditApplied = result.foreignTaxMethod === "credit" && paid;
  const expenseApplied = result.foreignTaxMethod === "expense" && paid;
  const sumOf = (f: (a: ForeignRealEstateAssetRow) => number): number => assets.reduce((s, a) => s + f(a), 0);

  const rows: RowDef[] = [
    { label: "소재지 구분 (부표1 ① 국내 1 · 국외 2)", values: values(`${FOREIGN_LOCATION_CODE} (국외)`, () => `${FOREIGN_LOCATION_CODE} (국외)`) },
    { label: "소재지국 (부표1 ②)", values: perAsset((a) => metaOf(a).countryLabel ?? null) },
    { label: "소재지 (부표1 ②)", values: perAsset((a) => metaOf(a).address ?? null) },
    {
      label: "자산종류 코드 (부표1 ③)",
      values: perAsset((a) => FOREIGN_ASSET_KIND_CODE[a.kind] ?? null),
      notes: noteOn((a) => (FOREIGN_ASSET_KIND_CODE[a.kind] ? undefined : "건물: 일반주택 3 · 기타건물 4 구분 확인 필요")),
    },
    { label: "양도일자", values: perAsset((a) => a.transferDate) },
    { label: "취득일자", values: perAsset((a) => a.acquisitionDate), separatorAfter: true },
    { label: "양도가액 (원화 환산)", values: values(sumOf((a) => a.transferValueKrw), (a) => a.transferValueKrw) },
    { label: "취득가액 (원화 환산)", values: values(sumOf((a) => a.acquisitionValueKrw), (a) => a.acquisitionValueKrw) },
    { label: "취득가액 종류 (부표1)", values: values(FOREIGN_ACQUISITION_KIND_TEXT, () => FOREIGN_ACQUISITION_KIND_TEXT) },
    {
      label: "기타필요경비 (부표1 ⑭ — 자본적지출 + 양도비)",
      values: values(sumOf((a) => a.capitalExpenditureKrw + a.transferCostKrw), (a) => a.capitalExpenditureKrw + a.transferCostKrw),
    },
    ...(expenseApplied
      ? [{
          label: `필요경비 산입 외국납부세액 (${TRANSFER_FOREIGN_RE.SECTION_118_6_FOREIGN_TAX})`,
          indent: true,
          values: values(sumOf((a) => a.foreignTax.expenseKrw), (a) => a.foreignTax.expenseKrw),
        } satisfies RowDef]
      : []),
    { label: "전체 양도차익 (차손은 음수)", values: values(result.capitalGainTotal, (a) => a.capitalGain), separatorAfter: true },
    // 장기보유특별공제 0이라 과세대상 양도차익 = 양도소득금액(차손 자산은 0 — 통산하지 않는다). 엔진 값 그대로.
    { label: "과세대상 양도차익", values: values(result.incomeAmountTotal, (a) => a.incomeAmount) },
    {
      label: "장기보유특별공제",
      values: values(0, () => 0),
      notes: { total: "국외자산은 해당되지 않습니다 (부표1 작성방법 12.)" },
    },
    { label: "장기보유특별공제 코드 (부표1 ⑯)", values: values(FOREIGN_LTHD_CELL, () => FOREIGN_LTHD_CELL), separatorAfter: true },
    { label: "양도소득금액", values: values(result.incomeAmountTotal, (a) => a.incomeAmount) },
    {
      label: "기본공제 (먼저 양도한 자산부터)",
      values: values(result.basicDeduction, (a) => a.basicDeductionAllocated),
      separatorAfter: true,
    },
    { label: "과세표준", highlight: true, values: values(result.taxBase, (a) => a.taxBaseAllocated) },
    { label: "세율구분 코드 (본지 ③)", values: values(FOREIGN_RE_RATE_CODE, () => FOREIGN_RE_RATE_CODE) },
    { label: "세율", values: values(fmtRatePct(result.appliedRate), () => null) },
    {
      label: "산출세액",
      values: values(result.calculatedTax, () => null),
      notes: single ? undefined : { total: "합계 열에서만 계산 — 과세표준 합계에 한 번 적용" },
    },
    ...(creditApplied
      ? [{
          label: "외국납부세액공제 (⑫ 해당 신고분까지 누계)",
          values: values(result.foreignTaxCreditApplied, (a) => a.foreignTax.applied),
          notes: result.foreignTaxUnappliedKrw > 0
            ? { total: `한도 초과 미공제 외국납부세액 ${result.foreignTaxUnappliedKrw.toLocaleString("ko-KR")}` }
            : undefined,
        } satisfies RowDef]
      : []),
    { label: "결정세액", highlight: true, values: values(result.determinedTax, () => null), separatorAfter: true },
    { label: "지방소득세 산출세액", values: values(result.localIncomeTaxBeforeRounding, () => null) },
    ...(result.localForeignTaxCredit > 0
      ? [{ label: `외국납부세액 공제 (${TRANSFER_FOREIGN_RE.LOCAL_SPECIAL_97_3_FOREIGN_TAX_CREDIT})`, indent: true, values: values(result.localForeignTaxCredit, () => null) } satisfies RowDef]
      : []),
    { label: "지방세 결정세액", highlight: true, values: values(result.localIncomeTax, () => null) },
  ];

  const notices: string[] = [
    "별지 제84호서식(국내 부동산과 같은 서식)에 국외자산을 적은 표입니다. 서식에 지방소득세 칸은 없어 참고로 덧붙였습니다.",
    "⑪ 감면세액 · ⑯ 가산세 · ⑰ 기신고세액 · ⑲ 분납 등 계산하지 않는 칸은 적지 않았습니다 — 신고 시 직접 기재합니다.",
  ];
  if (assets.some((a) => FOREIGN_ASSET_KIND_CODE[a.kind] === undefined)) {
    notices.push("건물의 자산종류 코드(일반주택 3 · 기타건물 4)는 입력받지 않아 비웠습니다 — 확인 필요.");
  }
  if (assets.some((a) => !metaOf(a).countryLabel)) {
    notices.push("소재지국이 비어 있습니다(미선택 또는 「기타」) — 국가명·국가코드는 신고 시 직접 기재합니다(확인 필요).");
  }
  if (result.confirmationNeeded.includes("FOREIGN_LOSS_NOT_NETTED")) {
    notices.push(
      `양도차손 자산은 다른 국외자산의 양도소득과 통산하지 않고 0으로 보아 과세대상 양도차익·양도소득금액에 0으로 적었습니다(${TRANSFER_FOREIGN_RE.SECTION_102_2_LOSS_OFFSET}은 ${TRANSFER_FOREIGN_RE.SECTION_118_8_MUTATIS_NO_LTHD} 준용 목록에 없음) — 확인 필요.`,
    );
  }
  if (expenseApplied) {
    notices.push(
      `필요경비 산입방법(${TRANSFER_FOREIGN_RE.SECTION_118_6_FOREIGN_TAX}): 서식에 이 금액의 전용 칸이 없어 기타필요경비 밖에 별도 행으로 적었습니다 — 서식상 위치 확인 필요.`,
    );
  }
  return { columns, rows, notices };
}
