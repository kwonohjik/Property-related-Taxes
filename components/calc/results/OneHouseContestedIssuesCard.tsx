"use client";

/**
 * 판정 결과 — **해석이 갈리는 쟁점**(P4)
 *
 * 국세청 해석과 조세심판원 결정이 다른 결론을 낸 사실 패턴이면, 두 입장으로 각각 판정한 결론을 나란히 보여 준다.
 * 🔑 결론은 엔진이 낸 값(`contestedIssues[].positions[].verdict`)을 라벨로 옮길 뿐이다 — 여기서 다시 판정하지 않는다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type {
  ContestedVerdict,
  OneHouseContestedIssue,
} from "@/lib/tax-engine/one-house/contested-issues";

const VERDICT_LABEL: Record<ContestedVerdict, string> = {
  exempt: "비과세",
  partial: "부분 비과세",
  taxable: "과세",
};

const VERDICT_CLASS: Record<ContestedVerdict, string> = {
  exempt: "text-emerald-700",
  partial: "text-amber-700",
  taxable: "text-rose-700",
};

type Props = {
  issues: OneHouseContestedIssue[];
  sectionNum: string;
};

export function OneHouseContestedIssuesCard({ issues, sectionNum }: Props) {
  return (
    <ToneCard tone="violet" sectionNum={sectionNum} title="해석이 갈리는 쟁점">
      <p className="text-sm text-muted-foreground">
        아래 사실은 과세관청 해석과 조세심판원 결정의 결론이 다릅니다. 두 입장으로 각각 판정한 결론을 함께
        보여 드리니 근거 문서를 확인해 판단하세요.
      </p>
      {issues.map((issue) => (
        <div key={issue.id} className="space-y-2" data-testid={`one-house-contested-${issue.id}`}>
          <p className="text-sm font-semibold">
            {issue.title}
            <span className="ml-2">
              <LawArticleModal legalBasis={issue.legalBasis} />
            </span>
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {issue.positions.map((p) => (
              <div
                key={p.key}
                className="space-y-1 rounded-md border border-violet-200 bg-card p-3"
                data-testid={`one-house-contested-${issue.id}-${p.key}`}
              >
                <p className="text-xs font-semibold text-violet-800">
                  입장 {p.key}
                  {p.key === issue.enginePosition && (
                    <span className="ml-1 font-normal text-muted-foreground">(아래 판정 내역)</span>
                  )}
                </p>
                <p
                  className={`text-base font-bold ${VERDICT_CLASS[p.verdict]}`}
                  data-testid={`one-house-contested-${issue.id}-${p.key}-verdict`}
                >
                  {VERDICT_LABEL[p.verdict]}
                </p>
                <p className="text-sm leading-relaxed">{p.summary}</p>
                <ul className="ml-4 list-disc text-xs text-muted-foreground">
                  {p.authorities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" data-testid={`one-house-contested-${issue.id}-note`}>
            {issue.conclusionsDiffer
              ? `이 화면 아래의 판정 내역과 양도소득세 계산기는 입장 ${issue.enginePosition}에 따릅니다.`
              : "두 입장의 결론이 같습니다."}
          </p>
        </div>
      ))}
    </ToneCard>
  );
}
