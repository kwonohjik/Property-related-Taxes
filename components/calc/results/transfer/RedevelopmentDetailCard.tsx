"use client";

/**
 * RedevelopmentDetailCard — 재개발/재건축 양도 상세 결과 카드 (사례 44)
 *
 * 시행령 §166②1호 안분 결과 3분할 + 합계 표시.
 * - 인가전 분 (§166①1호 인가전양도차익)
 * - 인가후 기존건물분 (§166②1호 안분 — 권리가액 / 분양가)
 * - 청산금 분 (§166②1호 안분 — 청산금 / 분양가, 또는 §166①2호 수령)
 *
 * §164⑦ 단서 발동 여부 배지 (환산 케이스).
 * FilingFormTable 3열 출력과 1:1 매칭.
 *
 * 정책 준수:
 *  - "원" 단위 표기 금지 → 콤마만
 *  - 변수 약어 금지 → 한국어 풀어쓰기
 *  - floor() 표기 금지 → 묵시
 */

import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";

interface Props {
  detail: RedevelopmentResult;
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function RedevelopmentDetailCard({ detail }: Props) {
  const { preApproval, postApprovalExistingHouse, settlement, total, salePriceTotal, valuationMeta, estimatedLumpDeduction, highValueAllocation, lthdResidenceAttribution } = detail;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-bold text-violet-800">시행령 §166②1호</span>
          <h3 className="text-sm font-semibold text-violet-900">재개발/재건축 양도차익 3분할</h3>
        </div>
        {salePriceTotal != null && (
          <div className="text-xs text-violet-700">
            분양가 <span className="font-mono font-semibold">{fmt(salePriceTotal)}</span>
          </div>
        )}
      </div>

      {/* 환산취득가 메타 (§164⑦ 단서 배지) */}
      {valuationMeta && valuationMeta.method !== "actual" && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-[11px] text-rose-800">
          <span className="font-semibold">환산취득가 적용</span> · {valuationMeta.rationale}
        </div>
      )}

      {/* §166 의제구조 안내 (검산 식 모순 해명) */}
      <div className="rounded-md bg-violet-100/60 border border-violet-200 p-2 text-[11px] text-violet-900 leading-relaxed">
        <span className="font-semibold">시행령 §166②1호 의제구조</span> — 분기별 양도가·취득가는 의제 안분값으로,
        합계 행의 단순 산식(양도가 − 취득가 − 필요경비) 검산은 본문 산식이 아닙니다. 양도차익은 인가전/인가후/청산금 3분기 의제 산식의 합으로 산출됩니다.
      </div>

      {/* 1세대1주택 + 12억 안분 박스 (§95③·시행령 §160 — 사례 45) */}
      {highValueAllocation ? (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">1세대1주택 §95③·시행령 §160</span>
            <span className="font-semibold">고가주택 12억 초과 안분 적용</span>
          </div>
          <p className="text-amber-800">
            보유 상황 단계에서 <span className="font-semibold">1세대 + 1주택</span>으로 입력되어, 양도가액이 12억을 초과하므로 §95③ 안분이 적용되었습니다.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
            <Row label="비과세 기준" value={highValueAllocation.nontaxableThreshold} />
            <Row label="과세대상 비율 (%)" value={Math.round(highValueAllocation.taxableRatio * 10000) / 100} />
            <Row label="12억 안분 전 양도차익" value={highValueAllocation.nontaxableGain + highValueAllocation.taxableGain} />
            <Row label="과세대상 양도차익 (안분 후)" value={highValueAllocation.taxableGain} highlight />
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-[11px] text-sky-900 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">일반 과세</span>
            <span className="font-semibold">12억 안분 미적용 — 전체 과세</span>
          </div>
          <p className="text-sky-800">
            보유 상황 단계에서 <span className="font-semibold">1세대1주택이 아니거나 1주택자가 아닌</span> 입력으로 처리되어, §95③ 비과세 안분 없이 분기별 양도차익 전체가 과세대상입니다.
            <br />1세대1주택 + 12억 초과 비과세 안분을 적용하려면 “보유 상황” 단계에서 1세대 여부와 보유 주택 수를 확인하세요.
          </p>
        </div>
      )}

      {/* LTHD 거주월수 귀속 박스 (§155⑰ + 해석례 2020-386 — 사례 45) */}
      {lthdResidenceAttribution && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-[11px] text-emerald-900 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[10px] font-bold text-emerald-800">시행령 §155⑰ + 해석례 2020-386</span>
            <span className="font-semibold">장기보유공제 거주월수 귀속 분리</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
            <Row
              label="기존건물분 거주 (종전+신축 통산)"
              value={lthdResidenceAttribution.existingResidenceMonths}
            />
            <Row
              label="청산금분 거주 (신축만)"
              value={lthdResidenceAttribution.payResidenceMonths}
            />
            <div className="text-[10px]">
              <p className="text-emerald-700">기존건물분 적용 표</p>
              <p className="font-semibold text-emerald-900">
                {lthdResidenceAttribution.existingTable === "table2"
                  ? "표2 (보유 + 거주)"
                  : "표1 (보유만)"}
              </p>
            </div>
            <div className="text-[10px]">
              <p className="text-emerald-700">청산금분 적용 표</p>
              <p className="font-semibold text-emerald-900">
                {lthdResidenceAttribution.payTable === "table2"
                  ? "표2 (보유 + 거주)"
                  : "표1 (보유만)"}
              </p>
            </div>
          </div>
          {/* 거주기간 산정 근거 (입주일·퇴거일) — UI 자동산정 입력 시에만 부착 */}
          {(lthdResidenceAttribution.priorPeriod || lthdResidenceAttribution.newPeriod) && (
            <div className="mt-2 rounded border border-emerald-200 bg-white/60 p-2 text-[10px] space-y-0.5">
              <p className="font-semibold text-emerald-800">거주기간 산정 근거</p>
              {lthdResidenceAttribution.priorPeriod && (
                <p className="text-emerald-900">
                  종전주택: <span className="font-mono">{lthdResidenceAttribution.priorPeriod.start}</span> ~{" "}
                  <span className="font-mono">{lthdResidenceAttribution.priorPeriod.end}</span>
                </p>
              )}
              {lthdResidenceAttribution.newPeriod && (
                <p className="text-emerald-900">
                  신축주택: <span className="font-mono">{lthdResidenceAttribution.newPeriod.start}</span> ~{" "}
                  <span className="font-mono">{lthdResidenceAttribution.newPeriod.end}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3분할 표 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 인가전 분 */}
        <div className="rounded-md bg-white border border-violet-200 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-violet-700">① 인가전 분</p>
          <p className="text-[10px] text-violet-600">§166①1호 · §166⑤2호나목 (취득일 기산)</p>
          <Row label="의제 양도가액(=권리가액)" value={preApproval.apportionedTransfer} />
          <Row label="취득가액" value={preApproval.apportionedAcquisition} />
          {estimatedLumpDeduction != null && estimatedLumpDeduction > 0 && (
            <Row label="개산공제 (취득당시 라목값 × 3%, §163⑥)" value={estimatedLumpDeduction} />
          )}
          <Row label="양도차익" value={preApproval.gain} highlight />
          <p className="pt-1 border-t border-violet-100 text-[10px] text-violet-600">
            장기보유공제 ({Math.floor(preApproval.holdingMonths / 12)}년 {preApproval.holdingMonths % 12}개월, {fmtPct(preApproval.lthdRate)})
          </p>
          <Row label="LTHD" value={preApproval.lthd} />
        </div>

        {/* 인가후 기존건물분 */}
        <div className="rounded-md bg-white border border-violet-200 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-violet-700">② 인가후 기존건물분</p>
          <p className="text-[10px] text-violet-600">§166②1호 안분 (권리가액/분양가) · §166⑤2호나목</p>
          <Row label="안분 양도가액" value={postApprovalExistingHouse.apportionedTransfer} />
          <Row label="안분 취득가액(=권리가액)" value={postApprovalExistingHouse.apportionedAcquisition} />
          <Row label="양도차익" value={postApprovalExistingHouse.gain} highlight />
          <p className="pt-1 border-t border-violet-100 text-[10px] text-violet-600">
            장기보유공제 ({Math.floor(postApprovalExistingHouse.holdingMonths / 12)}년 {postApprovalExistingHouse.holdingMonths % 12}개월, {fmtPct(postApprovalExistingHouse.lthdRate)})
          </p>
          <Row label="LTHD" value={postApprovalExistingHouse.lthd} />
        </div>

        {/* 청산금 분 */}
        <div className="rounded-md bg-white border border-violet-200 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-violet-700">③ 청산금 분</p>
          <p className="text-[10px] text-violet-600">§166②1호 안분 (청산금/분양가) · §166⑤2호가목 (인가일 기산)</p>
          <Row label="안분 양도가액" value={settlement.apportionedTransfer} />
          <Row label="안분 취득가액(=청산금)" value={settlement.apportionedAcquisition} />
          <Row label="양도차익" value={settlement.gain} highlight />
          <p className="pt-1 border-t border-violet-100 text-[10px] text-violet-600">
            장기보유공제 ({Math.floor(settlement.holdingMonths / 12)}년 {settlement.holdingMonths % 12}개월, {fmtPct(settlement.lthdRate)})
          </p>
          <Row label="LTHD" value={settlement.lthd} />
        </div>
      </div>

      {/* 합계 */}
      <div className="rounded-md bg-violet-100/60 border border-violet-300 p-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-[10px] text-violet-700">합계 양도차익</p>
          <p className="font-mono font-semibold text-violet-900">{fmt(total.gain)}</p>
        </div>
        <div>
          <p className="text-[10px] text-violet-700">합계 장기보유공제</p>
          <p className="font-mono font-semibold text-violet-900">{fmt(total.lthd)}</p>
        </div>
        <div>
          <p className="text-[10px] text-violet-700">양도소득금액</p>
          <p className="font-mono font-semibold text-violet-900">{fmt(total.taxableIncome)}</p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-violet-700">{label}</span>
      <span className={`font-mono ${highlight ? "font-semibold text-violet-900" : "text-violet-800"}`}>
        {fmt(value)}
      </span>
    </div>
  );
}
