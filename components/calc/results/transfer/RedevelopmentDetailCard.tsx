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
  /**
   * 양도 대상 subject — "right" 시 입주권 양도 분기 (사례 36).
   * RedevelopmentResult에 echo 필드 없으므로 호출 사이트에서 직접 전달.
   * 미전달 시 "apt" fallback (기존 사례 44~48 회귀 무관).
   */
  subject?: "apt" | "right";
}

const fmt = (n: number) => n.toLocaleString("ko-KR");
const fmtPct = (r: number) => `${(r * 100).toFixed(1)}%`;

export function RedevelopmentDetailCard({ detail, subject = "apt" }: Props) {
  const { preApproval, postApprovalExistingHouse, settlement, total, salePriceTotal, valuationMeta, estimatedLumpDeduction, highValueAllocation, lthdResidenceAttribution, successorMemberApplied, successorMemberDetail, oneRightExemptionApplied, oneRightHighValueApplied } = detail;

  // subject="right": 입주권 양도 분기 (사례 36)
  const isRightSubject = subject === "right";

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {successorMemberApplied ? (
            <>
              <span className="rounded-full bg-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-800">승계조합원</span>
              <h3 className="text-sm font-semibold text-rose-900">재개발 신축APT 양도 (단순 차감 · 준공일 기산)</h3>
            </>
          ) : isRightSubject ? (
            <>
              <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-bold text-violet-800">시행령 §166①</span>
              <h3 className="text-sm font-semibold text-violet-900">조합원입주권 양도 (§95② 단서 + §166①)</h3>
              {oneRightExemptionApplied && !oneRightHighValueApplied && (
                <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-bold text-violet-900">1세대1입주권 비과세</span>
              )}
              {oneRightHighValueApplied && (
                <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">12억 초과 안분</span>
              )}
            </>
          ) : (
            <>
              <span className="rounded-full bg-violet-200 px-2 py-0.5 text-[10px] font-bold text-violet-800">시행령 §166②1호</span>
              <h3 className="text-sm font-semibold text-violet-900">재개발/재건축 양도차익 3분할</h3>
            </>
          )}
        </div>
        {!successorMemberApplied && !isRightSubject && salePriceTotal != null && (
          <div className="text-xs text-violet-700">
            분양가 <span className="font-mono font-semibold">{fmt(salePriceTotal)}</span>
          </div>
        )}
      </div>

      {/* 사례 36 — 1세대1입주권 비과세 배지 + 안내 */}
      {isRightSubject && oneRightExemptionApplied && !oneRightHighValueApplied && (
        <div className="rounded-md bg-violet-100/70 border border-violet-300 p-3 text-[11px] text-violet-900 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-violet-300 px-2 py-0.5 text-[10px] font-bold text-violet-900">§89①4호 가목</span>
            <span className="font-semibold">1세대1입주권 비과세 적용 — 산출세액 0</span>
          </div>
          <p>
            양도일 현재 1세대1입주권(다른 주택 0채 + 입주권 1개) + 인가일 기준 §89①3호 가목 보유요건 충족.
            3분기 양도차익 전체 비과세 차감 → 과세 양도소득금액 0.
          </p>
          <p className="text-[10px] text-violet-700">
            ※ 본 결과는 사용자 자기선언(§⑥ 토글 ON) 기준입니다. 세무서 최종 판단과 다를 수 있습니다.
          </p>
        </div>
      )}

      {/* 사례 36 — 12억 초과 안분 배지 (oneRightHighValueApplied) */}
      {isRightSubject && oneRightHighValueApplied && highValueAllocation && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-800">§89①4호 가목 단서 + §95③</span>
            <span className="font-semibold">1세대1입주권 12억 초과 안분 적용</span>
          </div>
          <p className="text-amber-800">
            양도가액이 12억을 초과하여 초과 비율 분에 대해서만 과세됩니다. 각 분기 양도차익에 과세대상 비율을 곱한 값이 최종 과세 양도차익입니다.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
            <Row label="비과세 기준 (12억)" value={highValueAllocation.nontaxableThreshold} />
            <Row label="과세대상 비율 (%)" value={Math.round(highValueAllocation.taxableRatio * 10000) / 100} />
            <Row label="과세대상 양도차익 합 (안분 후)" value={highValueAllocation.taxableGain} highlight />
          </div>
          <p className="text-[10px] text-amber-700 mt-1">
            산식: 각 분기 양도차익 × (양도가액 − 12억) ÷ 양도가액. 근거: §89①4호 가목 단서 + §95③ + 시행령 §160 준용.
          </p>
        </div>
      )}

      {/* subject="right" 시 §166 의제구조 안내 대신 §166① 구조 안내 */}
      {isRightSubject && !successorMemberApplied && (
        <div className="rounded-md bg-violet-100/60 border border-violet-200 p-2 text-[11px] text-violet-900 leading-relaxed">
          <span className="font-semibold">§166① 입주권 양도 구조</span> — 인가전 양도차익에만 LTHD 적용 (§95② 단서).
          인가후·청산금 분은 LTHD 대상 외 (§94①2호 + §166①1호 산식 구조).
          인가후 기존건물분(=0) 행은 표시 생략.
        </div>
      )}

      {/* 사례 48 — 승계조합원 단순 차감 산식 (§166 안분 우회) */}
      {successorMemberApplied && successorMemberDetail && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-3 text-[12px] text-rose-900 space-y-2 leading-relaxed">
          <div className="space-y-0.5">
            <div className="font-semibold">보유기간 기산일 = 준공일 (사용검사필증 교부일)</div>
            <div>
              · 준공일: <span className="font-mono font-semibold">{new Date(successorMemberDetail.completionDate as unknown as string | Date).toISOString().slice(0, 10)}</span>
            </div>
            <div>
              · 보유일수(개략): <span className="font-mono font-semibold">{successorMemberDetail.holdingDaysFromCompletion}일</span>
            </div>
            <div>· 적용 세율: <span className="font-semibold">{successorMemberDetail.rateLabel}</span></div>
          </div>
          <div className="space-y-0.5 pt-1 border-t border-rose-200">
            <div className="font-semibold">단순 차감 산식 (§166 안분 우회)</div>
            <div>
              양도차익 = 양도가액 <span className="font-mono">{fmt(postApprovalExistingHouse.apportionedTransfer)}</span>{" "}
              − 권리가액(상속·증여 평가액) <span className="font-mono">{fmt(postApprovalExistingHouse.apportionedAcquisition)}</span>{" "}
              − 인가후 필요경비 <span className="font-mono">{fmt(postApprovalExistingHouse.expenses ?? 0)}</span>{" "}
              = <span className="font-mono font-bold">{fmt(postApprovalExistingHouse.gain)}</span>
            </div>
          </div>
          <div className="pt-1 text-[11px] text-rose-700">
            ※ 근거: 사전-2019-법령해석재산-0649 (2020.02.11.) + 소득세법 시행령 §162①4호 (자가건설 의제 — 사용승인서 교부일)
            <br />
            ※ 단기세율 분기: 소득세법 §104①3호 (주택 1년 미만 70%) — 입주권 양도가 아닌 신축APT(주택) 양도이므로 주택 단기세율 본문 적용.
          </div>
        </div>
      )}

      {/* 환산취득가 메타 (§164⑦ 단서 배지) — 승계조합원 분기는 환산 미적용이라 자동 숨김 */}
      {valuationMeta && valuationMeta.method !== "actual" && valuationMeta.method !== "successor_member_decree_162_1_4" && (
        <div className="rounded-md bg-rose-50 border border-rose-200 p-2 text-[11px] text-rose-800">
          <span className="font-semibold">환산취득가 적용</span> · {valuationMeta.rationale}
        </div>
      )}

      {/* §166②1호 의제구조 안내 — subject="apt" 전용, 승계조합원 분기·입주권 분기에서 숨김 */}
      {!successorMemberApplied && !isRightSubject && (
        <div className="rounded-md bg-violet-100/60 border border-violet-200 p-2 text-[11px] text-violet-900 leading-relaxed">
          <span className="font-semibold">시행령 §166②1호 의제구조</span> — 분기별 양도가·취득가는 의제 안분값으로,
          합계 행의 단순 산식(양도가 − 취득가 − 필요경비) 검산은 본문 산식이 아닙니다. 양도차익은 인가전/인가후/청산금 3분기 의제 산식의 합으로 산출됩니다.
        </div>
      )}

      {/* 1세대1주택 + 12억 안분 박스 (§95③·시행령 §160 — 사례 45, subject="apt" 전용) */}
      {!isRightSubject && highValueAllocation && (
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
      )}
      {!isRightSubject && !highValueAllocation && !successorMemberApplied && (
        <div className="rounded-md bg-sky-50 border border-sky-200 p-3 text-[11px] text-sky-900 space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-800">일반 과세</span>
            <span className="font-semibold">12억 안분 미적용 — 전체 과세</span>
          </div>
          <p className="text-sky-800">
            보유 상황 단계에서 <span className="font-semibold">1세대1주택이 아니거나 1주택자가 아닌</span> 입력으로 처리되어, §95③ 비과세 안분 없이 분기별 양도차익 전체가 과세대상입니다.
            1세대1주택 + 12억 초과 비과세 안분을 적용하려면 &ldquo;보유 상황&rdquo; 단계에서 1세대 여부와 보유 주택 수를 확인하세요.
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

      {/* 3분할 표 — subject="right" 시 ② 인가후 기존건물분 숨김 (gain=0, §95② 단서로 대상 외) */}
      <div className={`grid grid-cols-1 gap-3 ${isRightSubject ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
        {/* 인가전 분 */}
        <div className="rounded-md bg-white border border-violet-200 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-violet-700">① 인가전 분</p>
          <p className="text-[10px] text-violet-600">
            {isRightSubject
              ? "§166①1호 · §166⑤1호 (취득일 → 관리처분 인가일 기산)"
              : "§166①1호 · §166⑤2호나목 (취득일 기산)"}
          </p>
          <Row label={isRightSubject ? "의제 양도가액(=권리가액)" : "의제 양도가액(=권리가액)"} value={preApproval.apportionedTransfer} />
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

        {/* 인가후 기존건물분 — subject="apt" 시만 표시 */}
        {!isRightSubject && (
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
        )}

        {/* 청산금 분 */}
        <div className="rounded-md bg-white border border-violet-200 p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-violet-700">
            {isRightSubject
              ? "② 인가후·청산금 분 (§166①1호)"
              : `③ 청산금 분${detail.settlementExemptionApplied ? " (1세대1주택 비과세)" : ""}`}
          </p>
          <p className="text-[10px] text-violet-600">
            {isRightSubject
              ? "§166①1호 · §166⑤1호 (인가일 기산 — LTHD 대상 외)"
              : "§166②1호 안분 (청산금/분양가) · §166⑤2호가목 (인가일 기산)"}
          </p>
          <Row label="안분 양도가액" value={settlement.apportionedTransfer} />
          <Row label="안분 취득가액(=청산금)" value={settlement.apportionedAcquisition} />
          {detail.settlementExemptionApplied ? (
            // 사례 47 — 옵션 B 4행 분해 시각화 (안분 후 → LTHD → 비과세 차감 → 결과 0)
            <>
              <Row label="양도차익 (안분 후)" value={settlement.gainAfterAllocation ?? 0} />
              <p className="pt-1 border-t border-violet-100 text-[10px] text-violet-600">
                장기보유공제 ({Math.floor(settlement.holdingMonths / 12)}년 {settlement.holdingMonths % 12}개월, {fmtPct(settlement.lthdRate)})
              </p>
              <Row label="LTHD" value={settlement.lthdAfterAllocation ?? 0} />
              <div className="pt-1 mt-1 border-t border-rose-200 rounded bg-rose-50/60 px-1.5 py-1">
                <Row
                  label="1세대1주택 비과세 차감"
                  value={-((settlement.gainAfterAllocation ?? 0) - (settlement.lthdAfterAllocation ?? 0))}
                />
                <p className="text-[10px] text-rose-700 mt-0.5">
                  PDF 사례수정 2 (2)-1번 · 서면2016-법령해석재산-2705 — 양도소득금액 합산 제외
                </p>
              </div>
              <Row label="과세 양도소득금액" value={0} highlight />
            </>
          ) : (
            // 사례 44/45/46 기존 패턴
            <>
              <Row label="양도차익" value={settlement.gain} highlight />
              <p className="pt-1 border-t border-violet-100 text-[10px] text-violet-600">
                장기보유공제 ({Math.floor(settlement.holdingMonths / 12)}년 {settlement.holdingMonths % 12}개월, {fmtPct(settlement.lthdRate)})
              </p>
              <Row label="LTHD" value={settlement.lthd} />
            </>
          )}
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
