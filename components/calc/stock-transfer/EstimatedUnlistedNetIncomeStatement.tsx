"use client";

/**
 * EstimatedUnlistedNetIncomeStatement — 비상장 §165④ 순손익 계산서 thin wrapper.
 *
 * [stock-transfer-unlisted-direct-calc] ui.design §4-A
 * PostListing 표 본체(상증령 §54 동일 산식) 재사용 — cols = EUTransfer / EUAcq.
 *
 * [E-6 (1)] isNetAssetOnly === true 시 컴포넌트 전체 비노출 + 안내 메시지.
 * 데이터 보존 정책: store 키는 그대로 유지, UI만 hidden (실수 토글 보호).
 *
 * 🔑 종전에는 `YearColumn`을 열마다 하나씩 렌더했다. 행 기반 표로 바뀌면서
 *    **표가 열 목록을 받는다** — 계획서 §3.4.
 */

import { useMemo } from "react";
import {
  NetIncomeStatementTable,
  COL_LABEL,
} from "./PostListingNetIncomeStatement";
import type {
  StatementColumn,
  StatementColumnSpec,
} from "./statement-table/statement-table-types";
import { buildStatementColumns } from "./statement-table/build-columns";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import { shouldSkipNetIncome } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function EstimatedUnlistedNetIncomeStatement({ form, onChange }: Props) {
  // [사례 49] acqFaceValueOnly 시 EUAcq 컬럼만 비노출
  const hideAcqColumn = form.acqFaceValueOnly === true;
  const cols: StatementColumnSpec[] = useMemo(() => {
    const base: { col: StatementColumn; label: string }[] = [
      { col: "EUTransfer", label: `${COL_LABEL.EUTransfer} 사업연도` },
    ];
    if (!hideAcqColumn) base.push({ col: "EUAcq", label: `${COL_LABEL.EUAcq} 사업연도` });
    return buildStatementColumns(form, onChange, base);
  }, [hideAcqColumn, form, onChange]);

  // [DM-2] 분기 우선순위: Priority 1 — NA 단독 (전체 비노출) > Priority 2 — 사례 49 (EUAcq만 비노출)
  // [E-6 (1)] 순자산 단독 평가 사유 발생 시 NI 24행 양/취 모두 비노출
  if (shouldSkipNetIncome(form)) {
    return (
      <div
        data-testid="eu-ni-hidden-notice"
        className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800"
      >
        ⓘ {UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
          1
        </span>
        <p className="text-sm font-semibold text-sky-800">
          순손익 계산서 (상증령 §54 — 24행 × {hideAcqColumn ? "양도연도" : "양도/취득연도"})
        </p>
      </div>
      {hideAcqColumn && (
        <p
          data-testid="eu-ni-acq-hidden-notice"
          className="rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800"
        >
          ⓘ {UNLISTED_MESSAGES.ACQ_FACE_VALUE_NOTICE} — 취득연도 NI 입력 비노출
        </p>
      )}
      <NetIncomeStatementTable form={form} onChange={onChange} cols={cols} />
    </div>
  );
}
