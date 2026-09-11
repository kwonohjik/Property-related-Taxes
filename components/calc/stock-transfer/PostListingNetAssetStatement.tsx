"use client";

/**
 * PostListingNetAssetStatement — 순자산가액 계산서 (PDF 20행 · 이미지 7 양식 이식)
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.2 · §4.2.1
 *
 * 구조:
 *   행 1~7  = 자산 그룹 (행 1 기초 + 가산 2~5 + 차감 6·7)
 *   (가)    = 자산총계
 *   행 8~17 = 부채 그룹 (행 8 기초 + 가산 9~14 + 차감 15~17)
 *   (나)    = 부채총계
 *   행 18   = 영업권 포함 전 순자산가액 (가 − 나)
 *   행 19   = 영업권
 *   행 20   = 순자산가액 (18 + 19)
 *   1주당 순자산가치
 */

import { useMemo } from "react";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { calcNetAssetPerShare } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { StatementTable } from "./statement-table/StatementTable";
import { StatementRow } from "./statement-table/StatementRow";
import { StatementCalcRow } from "./statement-table/StatementCalcRow";
import { readCell } from "./statement-table/statement-table-types";
import type {
  StatementColumn,
  StatementColumnSpec,
} from "./statement-table/statement-table-types";
import {
  NA_ASSET_ROWS,
  NA_LIAB_ROWS,
  NA_GOODWILL_ROW,
  NA_SHARE_ROW,
  NA_ASSET_ADD_PREFIXES,
  NA_ASSET_SUB_PREFIXES,
  NA_LIAB_ADD_PREFIXES,
  NA_LIAB_SUB_PREFIXES,
} from "./statement-table/net-asset-rows";
import { buildStatementColumns } from "./statement-table/build-columns";
import { shareCandidates } from "./statement-table/share-candidates";

export type Column = StatementColumn;

export const COL_LABEL: Record<Column, string> = {
  Listing: "상장연도 직전",
  Acq: "취득연도 직전 (상장 §165⑤)",
  EUTransfer: "양도연도 직전 (비상장 §165④)",
  EUAcq: "취득연도 직전 (비상장 §165④)",
};

/**
 * 열별 미리보기 — 엔진 헬퍼를 그대로 부른다(이중 진실 차단).
 *
 * 평가기준일: 제55조 제1항 후단(0원 하한)이 2009.2.4. 신설이라 게이팅 기준이 필요하다.
 * 미입력이면 하한 미적용(원값 표시) — 임의 기준일 fallback 금지.
 */
function useNetAssetPreviews(form: StockTransferFormData, cols: readonly StatementColumnSpec[]) {
  const colKeys = cols.map((c) => c.col).join("|");
  return useMemo(() => {
    const parsed = form.transferDate ? new Date(form.transferDate) : undefined;
    const evalDate = parsed && !isNaN(parsed.getTime()) ? parsed : undefined;
    const out = {} as Record<Column, ReturnType<typeof calcNetAssetPerShare>>;
    for (const key of colKeys.split("|").filter(Boolean) as Column[]) {
      out[key] = calcNetAssetPerShare(
        {
          assetTotalRow1: parseAmount(readCell(form, "naAssetTotalRow1", key)),
          assetAdd: NA_ASSET_ADD_PREFIXES.map((p) => parseAmount(readCell(form, p, key))),
          assetSub: NA_ASSET_SUB_PREFIXES.map((p) => parseAmount(readCell(form, p, key))),
          liabTotalRow8: parseAmount(readCell(form, "naLiabTotalRow8", key)),
          liabAdd: NA_LIAB_ADD_PREFIXES.map((p) => parseAmount(readCell(form, p, key))),
          liabSub: NA_LIAB_SUB_PREFIXES.map((p) => parseAmount(readCell(form, p, key))),
          goodwillRow19: parseAmount(readCell(form, NA_GOODWILL_ROW.keyPrefix, key)),
          shareCount: parseInt(readCell(form, NA_SHARE_ROW.keyPrefix, key) || "0", 10),
        },
        evalDate,
      );
    }
    return out;
  }, [form, colKeys]);
}

export interface NetAssetStatementTableProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  cols: readonly StatementColumnSpec[];
}

/**
 * 표 본체 — `PostListing*` 과 `EstimatedUnlisted*` wrapper가 공유한다(계획서 §3.4).
 */
export function NetAssetStatementTable({ form, onChange, cols }: NetAssetStatementTableProps) {
  const preview = useNetAssetPreviews(form, cols);
  const set = (prefix: string, col: Column, v: string) =>
    onChange({ [`${prefix}${col}`]: v } as Partial<StockTransferFormData>);
  const value = (prefix: string) => (col: Column) => readCell(form, prefix, col);
  const testIdPrefix = "na";
  const valuesOf = (pick: (p: ReturnType<typeof calcNetAssetPerShare>) => number) =>
    Object.fromEntries(cols.map((c) => [c.col, pick(preview[c.col])]));

  let rowIndex = 0;
  const next = () => ++rowIndex;

  const inputRow = (row: (typeof NA_ASSET_ROWS)[number]) => (
    <StatementRow
      key={row.keyPrefix}
      row={row}
      cols={cols}
      hasGroupColumn
      rowIndex={next()}
      testIdPrefix={testIdPrefix}
      value={value(row.keyPrefix)}
      onChange={(c, v) => set(row.keyPrefix, c, v)}
    />
  );

  return (
    <div className="space-y-2">
      <StatementTable
        cols={cols}
        hasGroupColumn
        caption="순자산가액 계산서"
        testIdPrefix={testIdPrefix}
      >
        {NA_ASSET_ROWS.map(inputRow)}
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-ga`}
          row={{
            kind: "calc",
            label: "(가) 자산총계 (1 + 2 + 3 + 4 + 5 − 6 − 7)",
            values: valuesOf((p) => p.assetSubtotal),
          }}
        />
        {NA_LIAB_ROWS.map(inputRow)}
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-na`}
          row={{
            kind: "calc",
            label: "(나) 부채총계 (8 + 9 + … + 14 − 15 − 16 − 17)",
            values: valuesOf((p) => p.liabSubtotal),
          }}
        />
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-18`}
          row={{
            kind: "calc",
            num: "18.",
            label: "영업권 포함 전 순자산가액 (가 − 나)",
            values: valuesOf((p) => p.netAssetBeforeGoodwillRaw),
          }}
        />
        {inputRow(NA_GOODWILL_ROW)}
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-20`}
          row={{
            kind: "calc",
            num: "20.",
            label: "순자산가액 (18 + 19)",
            values: valuesOf((p) => p.netAssetAmount),
          }}
        />
        <StatementRow
          row={NA_SHARE_ROW}
          cols={cols}
          hasGroupColumn
          rowIndex={next()}
          testIdPrefix={testIdPrefix}
          value={value(NA_SHARE_ROW.keyPrefix)}
          onChange={(c, v) => set(NA_SHARE_ROW.keyPrefix, c, v)}
          candidates={(c) => shareCandidates(form, c, "niShareCount")}
        />
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-pershare`}
          row={{
            kind: "calc",
            label: (
              <>
                1주당 순자산가치 = <Frac top="20" bottom="발행주식총수" />
              </>
            ),
            emphasis: true,
            values: valuesOf((p) => p.perShareAsset),
          }}
        />
      </StatementTable>

      {/* 0 하한 안내 — 이미지 7에는 없다. 행 18은 사실대로 보이되 평가 단계 규정을 알린다. */}
      {cols.map((c) =>
        preview[c.col].zeroFloorApplied ? (
          <p
            key={c.col}
            className="rounded border border-sky-300 bg-sky-50/70 px-3 py-2 text-xs text-sky-800"
          >
            <strong>{COL_LABEL[c.col]} 사업연도</strong> — 자본잠식. 영업권 포함 전 순자산가액이
            0원 이하이므로 <strong>0원으로 보아</strong> 평가합니다. 영업권이 있으면 영업권만
            가산됩니다. 「상속세 및 증여세법 시행령」 제55조 제1항 후단(「소득세법」 제99조
            제1항 제4호 전단이 준용)
            <LawArticleModal
              legalBasis={STOCK.INH_DECREE_55_1_NET_ASSET_ZERO_FLOOR}
              label="상증령 §55①"
              className="ml-1"
            />
          </p>
        ) : null,
      )}
    </div>
  );
}

interface PostListingNetAssetStatementProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  mode: "listing_only" | "full";
}

export function PostListingNetAssetStatement({
  form,
  onChange,
  mode,
}: PostListingNetAssetStatementProps) {
  const cols: StatementColumnSpec[] = useMemo(() => {
    const base: { col: Column; label: string }[] = [
      { col: "Listing", label: `${COL_LABEL.Listing} 사업연도` },
    ];
    if (mode === "full") base.push({ col: "Acq", label: `${COL_LABEL.Acq} 사업연도` });
    return buildStatementColumns(form, onChange, base);
  }, [mode, form, onChange]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-sky-700">
        순자산가액 계산서 (PDF 20행 — 소령 §165④1 나목)
      </p>
      <NetAssetStatementTable form={form} onChange={onChange} cols={cols} />
    </div>
  );
}
