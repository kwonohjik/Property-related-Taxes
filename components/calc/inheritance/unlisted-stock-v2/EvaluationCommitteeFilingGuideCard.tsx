"use client";

/**
 * EvaluationCommitteeFilingGuideCard — §49의2 신고서 안내 카드 (PR-K-5)
 *
 * 평가심의위 신청 시 사용자가 별도로 준비해야 할 행정 절차 안내.
 * 본 모듈은 계산 영향 없음 — 안내·체크리스트 전용.
 *
 * 법령 (KoreanLaw MCP 2026-05-24):
 *   §49의2⑤2호 — 첨부 자료 3종 (가·나·다)
 *   §49의2④ — 신청·통지 기한 (상속 4개월/1개월 · 증여 70일/20일)
 *   §49의2⑦ — 심의 고려사항 3종
 *   §49의2⑨ — 신용평가전문기관 의뢰 (수수료 납세자 부담)
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-5
 */

export interface EvaluationCommitteeFilingGuideCardProps {
  /** 상속·증여 분기 — 기한 안내 분기 표시 */
  taxKind?: "inheritance" | "gift";
}

const ATTACHMENT_ITEMS = [
  {
    no: "가",
    title: "평가가액·평가방법 명시 평가서",
    desc: "신청 평가가액·평가방법·기초 자료 출처 명시",
  },
  {
    no: "나",
    title: "평가 근거 자료",
    desc: "재무제표·세무조정계산서·매매사례·시장가격·유사상장법인 비교지표 등",
  },
  {
    no: "다",
    title: "기타 평가심의위가 요구하는 자료",
    desc: "특수관계인 거래 내역·법인 사업계획·감정평가서 등 추가 요청 시 제출",
  },
];

const REVIEW_CRITERIA = [
  "1. 평가방법의 합리성 (해당 업종·규모·재무구조 적합성)",
  "2. 기초 자료의 신뢰성 (출처·일관성·검증 가능성)",
  "3. 신청 평가가액의 적정성 (보충적 평가가액 대비 편차 합리성)",
];

export function EvaluationCommitteeFilingGuideCard({
  taxKind = "inheritance",
}: EvaluationCommitteeFilingGuideCardProps) {
  const deadlineLabel =
    taxKind === "inheritance"
      ? "신청 4개월 이내 → 통지 1개월 이내"
      : "신청 70일 이내 → 통지 20일 이내";

  return (
    <div
      className="rounded-lg border border-sky-300 bg-sky-50/40 p-4 space-y-3"
      data-testid="evaluation-committee-filing-guide-card"
    >
      <div className="flex items-center gap-2 pb-2 border-b border-sky-200">
        <span className="text-sky-600 text-base">📋</span>
        <h4 className="text-sm font-bold text-sky-900">
          §49의2 평가심의위 신청 행정 안내
        </h4>
      </div>

      {/* §49의2⑤2호 첨부 자료 체크리스트 */}
      <section
        className="space-y-2"
        data-testid="evaluation-committee-attachments-checklist"
      >
        <p className="text-xs font-semibold text-sky-800">
          ① 첨부 자료 체크리스트 (§49의2⑤2호)
        </p>
        <ul className="space-y-1.5">
          {ATTACHMENT_ITEMS.map((item) => (
            <li
              key={item.no}
              className="rounded border border-sky-200 bg-white p-2 text-xs"
              data-testid={`evaluation-committee-attachment-${item.no}`}
            >
              <div className="flex gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded bg-sky-600 text-micro font-bold text-white shrink-0">
                  ({item.no})
                </span>
                <div>
                  <p className="font-semibold text-sky-900">{item.title}</p>
                  <p className="text-sky-700/80 text-caption mt-0.5">{item.desc}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* §49의2④ 신청·통지 기한 안내 */}
      <section
        className="rounded border border-sky-200 bg-white p-2.5 text-xs space-y-1"
        data-testid="evaluation-committee-deadline-guide"
      >
        <p className="font-semibold text-sky-900">
          ② 신청·통지 기한 (§49의2④ — {taxKind === "inheritance" ? "상속세" : "증여세"})
        </p>
        <p className="text-sky-700">{deadlineLabel}</p>
        <p className="text-sky-700/70 text-micro">
          ※ 신청기한 미준수 시 평가심의위 부의 불가 — 보충적 평가가액으로 신고 (§54①·②)
        </p>
      </section>

      {/* §49의2⑦ 심의 고려사항 */}
      <section
        className="rounded border border-sky-200 bg-white p-2.5 text-xs space-y-1"
        data-testid="evaluation-committee-review-criteria"
      >
        <p className="font-semibold text-sky-900">③ 심의 고려사항 (§49의2⑦)</p>
        <ul className="space-y-0.5 text-sky-700">
          {REVIEW_CRITERIA.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>

      {/* §49의2⑨ 신용평가전문기관 의뢰 안내 */}
      <section
        className="rounded border border-amber-300 bg-amber-50 p-2.5 text-xs"
        data-testid="evaluation-committee-credit-rating-notice"
      >
        <p className="font-semibold text-amber-900">
          ④ 신용평가전문기관 의뢰 (§49의2⑨)
        </p>
        <p className="text-amber-800 mt-1">
          평가심의위가 신용평가전문기관에 평가 의뢰 결정 시 <strong>수수료는 납세자 부담</strong>.
          사전 비용 산정·동의 필수.
        </p>
      </section>
    </div>
  );
}
