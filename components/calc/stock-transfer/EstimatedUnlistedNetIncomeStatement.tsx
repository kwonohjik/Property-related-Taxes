"use client";

/**
 * EstimatedUnlistedNetIncomeStatement — 비상장 §165④ 순손익 계산서 thin wrapper.
 *
 * [stock-transfer-unlisted-direct-calc] ui.design §4-A
 * PostListing 표 본체(상증령 §54 동일 산식) 재사용 — cols = EUTransfer / EUAcq.
 *
 * [E-6 (1)] 순자산 단독인 평가 시점의 열은 비노출(양도·취득 따로 — 계획서
 * `stock-165-4-valuation-followups.plan.md` §14). 남는 열이 없으면 컴포넌트 전체 대신 안내 메시지.
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
  /**
   * 취득측 전용 경로(매매사례·취득일 거래정지) — 취득 열(EUAcq)만 렌더한다.
   * 🔴 이때는 `acqFaceValueOnly`를 **무시**한다 — 환산에서 켜 둔 액면가 토글이 남아 취득 열을 숨기면
   *    ⑧은 취득 열 주식수를 요구하는 막다른 길이 된다(블록의 취득기준시가 미리보기도 같은 규칙).
   */
  acquisitionSideOnly?: boolean;
}

export function EstimatedUnlistedNetIncomeStatement({ form, onChange, acquisitionSideOnly = false }: Props) {
  // [사례 49] acqFaceValueOnly 시 EUAcq 컬럼만 비노출 (취득측 전용 경로에서는 무시)
  const hideAcqColumn = !acquisitionSideOnly && form.acqFaceValueOnly === true;
  // 순자산 단독인 평가 시점의 열은 순손익이 필요 없다 — 양도·취득 따로
  const skipTransfer = !acquisitionSideOnly && shouldSkipNetIncome(form, "transfer");
  const skipAcq = !hideAcqColumn && shouldSkipNetIncome(form, "acquisition");
  const showTransfer = !acquisitionSideOnly && !skipTransfer;
  const showAcq = !hideAcqColumn && !skipAcq;
  const cols: StatementColumnSpec[] = useMemo(() => {
    const base: { col: StatementColumn; label: string }[] = [];
    if (showTransfer) base.push({ col: "EUTransfer", label: `${COL_LABEL.EUTransfer} 사업연도` });
    if (showAcq) base.push({ col: "EUAcq", label: `${COL_LABEL.EUAcq} 사업연도` });
    return buildStatementColumns(form, onChange, base);
  }, [showTransfer, showAcq, form, onChange]);
  // 사용자가 고른 사유로 단독이면 §165④3, 아니면 라목 후단(§165⑧1호)
  const hiddenMessage =
    (skipTransfer && form.netAssetOnlyReason) || (skipAcq && form.acquisitionNetAssetOnlyReason)
      ? UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN
      : UNLISTED_MESSAGES.NET_ASSET_ONLY_HIDDEN_RA_MOK;

  // [DM-2] 분기 우선순위: Priority 1 — 남는 열 없음(전체 비노출) > Priority 2 — 사례 49·한쪽 단독(그 열만 비노출)
  if (!showTransfer && !showAcq) {
    return (
      <div
        data-testid="eu-ni-hidden-notice"
        className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800"
      >
        ⓘ {hiddenMessage}
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
          순손익 계산서 (소령 §165④1 가목 — 24행 × {showTransfer && showAcq ? "양도/취득연도" : showTransfer ? "양도연도" : "취득연도"})
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
      {(skipTransfer || skipAcq) && (
        <p
          data-testid="eu-ni-side-hidden-notice"
          className="rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800"
        >
          ⓘ {skipTransfer ? "양도연도" : "취득연도"} — {hiddenMessage}
        </p>
      )}
      <NetIncomeStatementTable form={form} onChange={onChange} cols={cols} />
    </div>
  );
}
