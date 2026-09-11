"use client";

/**
 * PostListingNetIncomeStatement — 순손익 계산서 (PDF 24행 · 이미지 7 원본 서식 표 레이아웃)
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md
 * 기반 PDF: `주식-취득후 상장.pdf` (stock-transfer-post-listing-pdf-replica.plan.md:7 — 다이얼로그 ②)
 *
 * 구조:
 *   행 1 = 각 사업연도 소득금액 (음수 허용)
 *   행 2~4 = 가산 그룹 「소득에 가산할 금액」
 *   (A) = 가산할금액 합계 (1+2+3+4)
 *   행 5~16 = 차감 그룹 「소득에서 공제할 금액」 (+ 「비업무용토지 취득세(현행 삭제)」 비활성 행)
 *   (B) = 공제할금액 합계 (5 + … + 16)
 *   행 17 = 순손익액 (A − B)
 *   행 20 = 사업연도말 주식 또는 환산주식수
 *   행 21 = 1주당 순손익액 (17 ÷ 20)
 *   행 23 = 환원율 (default 10% — 시행규칙 §81② → 상증령 §17)
 *   행 24 = 1주당 가액 (21 ÷ 23)
 *
 * 열 수는 **1 또는 2**다 — `mode` / EU wrapper 분기(계획서 §4.2.2).
 */

import { useMemo } from "react";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { calcNetIncomePerShare } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
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
  NI_ADD_ROWS,
  NI_SUB_ROWS,
  NI_SHARE_ROW,
  NI_RATE_ROW,
} from "./statement-table/net-income-rows";
import { buildStatementColumns } from "./statement-table/build-columns";
import { shareCandidates } from "./statement-table/share-candidates";

/**
 * [unlisted-direct-calc] Column 타입 — EUTransfer/EUAcq 비상장 §165④ 컬럼 포함.
 *
 * 🔑 `statement-table-types`의 `StatementColumn`과 같은 축이다. 종전 로컬 정의를 재export해
 *    기존 import 경로(`import type { Column } from "./PostListingNetIncomeStatement"`)를 보존한다.
 */
export type Column = StatementColumn;

export const COL_LABEL: Record<Column, string> = {
  Listing: "상장연도 직전",
  Acq: "취득연도 직전 (상장 §165⑤)",
  EUTransfer: "양도연도 직전 (비상장 §165④)",
  EUAcq: "취득연도 직전 (비상장 §165④)",
};

/** 행 1~16의 폼 키 prefix — (A)·(B) 합계에 넘길 배열 순서와 1:1 */
const ADD_PREFIXES = NI_ADD_ROWS.map((r) => r.keyPrefix);
const SUB_PREFIXES = NI_SUB_ROWS.filter((r) => !r.disabled).map((r) => r.keyPrefix);

/**
 * 열별 미리보기 — 엔진 헬퍼를 그대로 부른다(이중 진실 차단).
 *
 * ⚠️ (A)·(B) 소계를 UI에서 따로 더하지 않는다 — 엔진 echo `addTotalA`/`subTotalB`를 쓴다.
 *    [[feedback_ui_engine_dual_truth_avoidance]]
 */
function useNetIncomePreviews(form: StockTransferFormData, cols: readonly StatementColumnSpec[]) {
  const colKeys = cols.map((c) => c.col).join("|");
  return useMemo(() => {
    const out = {} as Record<Column, ReturnType<typeof calcNetIncomePerShare>>;
    for (const key of colKeys.split("|").filter(Boolean) as Column[]) {
      const addA = ADD_PREFIXES.map((p) => parseAmount(readCell(form, p, key)));
      const subB = SUB_PREFIXES.map((p) => parseAmount(readCell(form, p, key)));
      const shareCount = parseInt(readCell(form, NI_SHARE_ROW.keyPrefix, key) || "0", 10);
      const rateStr = readCell(form, NI_RATE_ROW.keyPrefix, key) || "10";
      out[key] = calcNetIncomePerShare({
        addA,
        subB,
        shareCount,
        discountRate: parseFloat(rateStr) / 100,
      });
    }
    return out;
  }, [form, colKeys]);
}

export interface NetIncomeStatementTableProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  cols: readonly StatementColumnSpec[];
}

/**
 * 표 본체 — `PostListing*` 과 `EstimatedUnlisted*` wrapper가 공유한다.
 *
 * 🔑 종전 `YearColumn`(컬럼 1개 렌더)을 대체한다. 행 기반 표에서는 「한 컬럼을 그리는
 *    컴포넌트」가 성립하지 않는다 — 표가 열 목록을 받아 한 번에 그린다(계획서 §3.4).
 */
export function NetIncomeStatementTable({
  form,
  onChange,
  cols,
}: NetIncomeStatementTableProps) {
  const preview = useNetIncomePreviews(form, cols);
  const set = (prefix: string, col: Column, v: string) =>
    onChange({ [`${prefix}${col}`]: v } as Partial<StockTransferFormData>);
  const value = (prefix: string) => (col: Column) => readCell(form, prefix, col);
  const testIdPrefix = "ni";

  let rowIndex = 0;
  const next = () => ++rowIndex;

  return (
    <div className="space-y-2">
      <StatementTable
        cols={cols}
        hasGroupColumn
        caption="순손익 계산서"
        testIdPrefix={testIdPrefix}
      >
        {NI_ADD_ROWS.map((row) => (
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
        ))}
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-A`}
          row={{
            kind: "calc",
            label: "(A) 가산할금액 합계 (1 + 2 + 3 + 4)",
            values: Object.fromEntries(
              cols.map((c) => [c.col, preview[c.col].addTotalA]),
            ),
          }}
        />
        {NI_SUB_ROWS.map((row) => (
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
        ))}
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-B`}
          row={{
            kind: "calc",
            label: "(B) 공제할금액 합계 (5 + … + 16)",
            values: Object.fromEntries(
              cols.map((c) => [c.col, preview[c.col].subTotalB]),
            ),
          }}
        />
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-17`}
          row={{
            kind: "calc",
            num: "17.",
            label: "순손익액 (A − B)",
            values: Object.fromEntries(
              cols.map((c) => [c.col, preview[c.col].netIncomeAmount]),
            ),
          }}
        />
        <StatementRow
          row={NI_SHARE_ROW}
          cols={cols}
          hasGroupColumn
          rowIndex={next()}
          testIdPrefix={testIdPrefix}
          value={value(NI_SHARE_ROW.keyPrefix)}
          onChange={(c, v) => set(NI_SHARE_ROW.keyPrefix, c, v)}
          candidates={(c) => shareCandidates(form, c, "naShareCount")}
        />
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-21`}
          row={{
            kind: "calc",
            num: "21.",
            // 나눗셈은 `<Frac>`이 정본 — 리터럴 `÷` 금지(literal-division-render 래칫 게이트)
            label: (
              <>
                1주당 순손익액 = <Frac top="17" bottom="20" />
              </>
            ),
            values: Object.fromEntries(
              cols.map((c) => [c.col, preview[c.col].perShareIncome]),
            ),
          }}
        />
        <StatementRow
          row={NI_RATE_ROW}
          cols={cols}
          hasGroupColumn
          rowIndex={next()}
          testIdPrefix={testIdPrefix}
          value={(c) => readCell(form, NI_RATE_ROW.keyPrefix, c) || "10"}
          onChange={(c, v) => set(NI_RATE_ROW.keyPrefix, c, v)}
        />
        <StatementCalcRow
          hasGroupColumn
          cols={cols}
          testIdPrefix={`${testIdPrefix}-24`}
          row={{
            kind: "calc",
            num: "24.",
            label: (
              <>
                1주당 가액 = <Frac top="21" bottom="23" />
              </>
            ),
            emphasis: true,
            values: Object.fromEntries(
              cols.map((c) => [c.col, preview[c.col].perShareValue]),
            ),
          }}
        />
      </StatementTable>

      {/* 0 하한 안내 — 이미지 7에는 없다. 서식은 사실대로(행 17 음수) 보이되 평가 단계 규정을 알린다. */}
      {cols.map((c) =>
        preview[c.col].netIncomeAmount < 0 ? (
          <p
            key={c.col}
            className="rounded border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-800"
          >
            <strong>{COL_LABEL[c.col]} 사업연도</strong> — 결손 입력. 1주당 순손익액이 음수이므로{" "}
            <strong>0으로 보아</strong> 평가합니다. 「상속세 및 증여세법 시행령」 제56조 제1항
            후단(「소득세법」 제99조 제1항 제4호 전단이 준용)
            <LawArticleModal
              legalBasis={STOCK.INH_DECREE_56_1_NET_INCOME_ZERO_FLOOR}
              label="상증령 §56①"
              className="ml-1"
            />
          </p>
        ) : null,
      )}
    </div>
  );
}

interface PostListingNetIncomeStatementProps {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  mode: "listing_only" | "full";
}

export function PostListingNetIncomeStatement({
  form,
  onChange,
  mode,
}: PostListingNetIncomeStatementProps) {
  const cols: StatementColumnSpec[] = useMemo(() => {
    const base: { col: Column; label: string }[] = [
      { col: "Listing", label: `${COL_LABEL.Listing} 사업연도` },
    ];
    if (mode === "full") base.push({ col: "Acq", label: `${COL_LABEL.Acq} 사업연도` });
    return buildStatementColumns(form, onChange, base);
  }, [mode, form, onChange]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-amber-700">
        순손익 계산서 (PDF 24행 — 소령 §165④1 가목 + 시행규칙 §81② → 상증령 §17)
      </p>
      <NetIncomeStatementTable form={form} onChange={onChange} cols={cols} />
    </div>
  );
}
