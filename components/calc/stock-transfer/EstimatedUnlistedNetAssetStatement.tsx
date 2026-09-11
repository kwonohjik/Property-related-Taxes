"use client";

/**
 * EstimatedUnlistedNetAssetStatement — 비상장 §165④ 순자산가액 계산서 thin wrapper.
 *
 * [stock-transfer-unlisted-direct-calc] ui.design §4-B
 * PostListing 표 본체(상증령 §55 동일 산식) 재사용 — cols = EUTransfer / EUAcq.
 *
 * isNetAssetOnly === true 시에도 NA는 항상 노출 (순자산 단독 평가 자체가 NA 사용).
 *
 * 🔑 종전에는 `YearColumn`을 열마다 하나씩 렌더했다 — 계획서 §3.4.
 */

import { useMemo } from "react";
import { NetAssetStatementTable, COL_LABEL } from "./PostListingNetAssetStatement";
import type {
  StatementColumn,
  StatementColumnSpec,
} from "./statement-table/statement-table-types";
import { buildStatementColumns } from "./statement-table/build-columns";
import { UNLISTED_MESSAGES } from "@/lib/tax-engine/stock-transfer/unlisted-messages";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Props {
  form: StockTransferFormData;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function EstimatedUnlistedNetAssetStatement({ form, onChange }: Props) {
  // [사례 49] acqFaceValueOnly 시 EUAcq 컬럼만 비노출
  const hideAcqColumn = form.acqFaceValueOnly === true;
  const cols: StatementColumnSpec[] = useMemo(() => {
    const base: { col: StatementColumn; label: string }[] = [
      { col: "EUTransfer", label: `${COL_LABEL.EUTransfer} 사업연도` },
    ];
    if (!hideAcqColumn) base.push({ col: "EUAcq", label: `${COL_LABEL.EUAcq} 사업연도` });
    return buildStatementColumns(form, onChange, base);
  }, [hideAcqColumn, form, onChange]);

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
          2
        </span>
        <p className="text-sm font-semibold text-emerald-800">
          순자산가액 계산서 (소령 §165④1 나목 — {hideAcqColumn ? "양도연도" : "양도/취득연도"})
        </p>
      </div>
      <p className="text-xs text-amber-700 bg-amber-50/70 border border-amber-200 rounded px-2 py-1.5">
        {UNLISTED_MESSAGES.GOODWILL_NOTICE}
      </p>
      {hideAcqColumn && (
        <p
          data-testid="eu-na-acq-hidden-notice"
          className="rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800"
        >
          ⓘ {UNLISTED_MESSAGES.ACQ_FACE_VALUE_NOTICE} — 취득연도 NA 입력 비노출
        </p>
      )}
      <NetAssetStatementTable form={form} onChange={onChange} cols={cols} />
    </div>
  );
}
