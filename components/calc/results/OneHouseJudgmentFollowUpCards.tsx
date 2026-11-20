/**
 * 1세대1주택 판정 결과의 「양도일 조정 안내」·「판정하지 않은 부분」 카드 — 1주택 결과뷰와 다주택 중과 결과뷰가 함께 쓴다.
 *
 * 2026-11 리뷰 D-55 — 중과 메뉴 「1세대1주택 비과세 (요약)」은 결론 배지만 그려, 판정 보류가 있는 비과세가 보류 없는 비과세와
 * 글자까지 같았고 과세 + pending은 화면에 없는 「아래 안내」를 가리켰다. 같은 카드를 요약 뒤에 그린다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";

/** JSON을 거치며 Date가 ISO 문자열이 된다 — 그 형태를 그대로 받는다. */
export type PendingItem = {
  id: string;
  description: string;
  deadline: string | Date;
  /** 민법 §161 연장·공휴일 표 밖 안내(엔진 값) */
  deadlineNote?: string;
  legalBasis: string;
};

function formatDate(v: string | Date): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

/**
 * ── 양도일 조정 안내 (G-3) ──
 * 🔑 배지가 아니다(Q-1=B, 2026-09-29) — 입력한 양도(예정)일로는 과세이고, 이 카드는 「날짜를 바꾸면」의
 *    안내다. 판정 기준일 전에 지난 「이 날까지 양도」 기한은 엔진이 이미 뺐다(이룰 수 없는 조건).
 */
export function OneHousePendingCard({ pending, sectionNum }: { pending: readonly PendingItem[]; sectionNum: string }) {
  return (
    <ToneCard tone="amber" sectionNum={sectionNum} title="양도일을 조정하면 요건을 갖출 수 있습니다">
      <ul className="space-y-3">
        {pending.map((p) => (
          <li key={p.id} className="text-sm" data-testid={`one-house-pending-${p.id}`}>
            <p>
              <b className="font-mono tabular-nums">{formatDate(p.deadline)}</b>
              {"까지 — "}
              {p.description}
            </p>
            {p.deadlineNote && (
              <p className="text-xs text-muted-foreground" data-testid={`one-house-pending-note-${p.id}`}>
                {p.deadlineNote}
              </p>
            )}
            <LawArticleModal legalBasis={p.legalBasis} />
          </li>
        ))}
      </ul>
    </ToneCard>
  );
}

/**
 * ── 판정 보류 · 확인 필요 ──
 * 🔑 이 채널에는 두 종류가 실린다 — 자료가 없어 판정하지 않은 항목과, 「모름」 원칙으로 결론을 낸 뒤 확인을 요구하는
 *    항목(「…로 판정했습니다(확인 필요)」). 머리 문구가 앞 종류만 말하면 뒤 종류와 모순된다(S13-13). 제목은 e2e가 잡는
 *    이름이라 그대로 두고 머리 문구만 두 종류를 포괄한다.
 */
export function OneHouseUndeterminedCard({
  undetermined,
  sectionNum,
}: {
  undetermined: readonly { id: string; reason: string }[];
  sectionNum: string;
}) {
  return (
    <ToneCard tone="rose" sectionNum={sectionNum} title="판정하지 않은 부분">
      <p className="text-sm text-muted-foreground">
        아래는 입력만으로 확정할 수 없어 확인이 필요한 부분입니다. 항목에 적은 대로 판정을 보류했거나, 적힌 기준으로 판정했습니다.
      </p>
      <ul className="ml-4 list-disc space-y-1 text-sm">
        {undetermined.map((u) => (
          <li key={u.id} data-testid={`one-house-undetermined-${u.id}`}>
            {u.reason}
          </li>
        ))}
      </ul>
    </ToneCard>
  );
}
