import { LawArticleModal } from "@/components/ui/law-article-modal";
import { GIFT } from "@/lib/tax-engine/legal-codes/inheritance-gift";

/**
 * 「상증법」§43① 중복적용 배제 공통 고지 — 증여의제 결과뷰(단건·cap-table) 공용(#112).
 * 엔진 표지(`dupExclusionApplies`)만 읽는다 — 화면이 유형을 다시 판단하면 두 개의 진실이 생긴다.
 */
export function DupExclusionNote() {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-700" data-testid="deemed-dup-exclusion-note">
      <b>중복적용 배제</b> ({GIFT.DUP_EXCLUSION}&nbsp;<LawArticleModal legalBasis={GIFT.DUP_EXCLUSION} />) — 하나의 증여에
      이 조문과 다른 증여의제 조문이 동시에 적용되면 이익이 가장 많게 계산되는 것 하나만 적용합니다. 이 화면은 한
      번에 한 유형만 계산하므로, 다른 유형도 성립하면 각각 계산해 가장 큰 하나만 신고하세요.
    </div>
  );
}
