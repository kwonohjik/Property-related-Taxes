"use client";

/**
 * RedevelopmentDeemedAcquisitionNotice — 재개발 종전자산 취득가액 §163⑨ 안내 카드.
 *
 * 상속·증여 취득 종전자산은 상속개시일/증여일 현재 상증법 §60~66 평가액(신고가액)을
 * 취득당시 실지거래가액으로 본다(소령 §163⑨) → §166③ 환산·§163⑥ 개산공제 배제.
 *
 * RedevelopmentBlock.tsx 800줄 정책 준수를 위해 안내 카드 2종을 분리.
 */

import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { buildInheritedAcquisitionPayload } from "@/lib/calc/transfer-tax-api-inheritance";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function RedevelopmentDeemedAcquisitionNotice({
  acquisitionCause,
  isBurdenedGift = false,
}: {
  acquisitionCause?: string;
  /** 부담부증여 — ⑤ 실가·환산 라디오가 없고 의제취득일 전이면 §166③ 칸이 늘 뜬다(`redevPreApprovalAcqMode` · PR-7b-4) */
  isBurdenedGift?: boolean;
}) {
  // ③(§166③)의 입력 위치 — 일반 양도는 ⑤ 라디오의 「환산취득가액」, 부담부증여는 아래 §166③ 칸(라디오 없음)
  const sec166Where = isBurdenedGift ? "아래 §166③ 칸" : "아래 ⑤에서 「환산취득가액」 선택 시";
  if (acquisitionCause === "inheritance") {
    return (
      <ToneCard
        tone="amber"
        title="종전자산 취득가액 — 상속개시일 상증법 평가액"
        titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
      >
        <p className="text-xs text-amber-800 dark:text-amber-200">
          상속으로 취득한 종전자산은 상속개시일 현재 상증법 §60~66 평가액(상속세 신고가액)을 종전자산
          취득가액으로 봅니다(위 &ldquo;상속개시일 평가액&rdquo; 입력값). 이 값이 확인되면 §166③ 환산취득가·
          §163⑥ 개산공제는 적용하지 않습니다. 의제취득일(1985.1.1.) 이후 상속은 이 평가액(또는 §164⑤~⑦ 취득당시
          기준시가)을 꼭 입력해야 하며, 종전 부동산 실거래가로는 계산하지 않습니다. 의제취득일 전 상속이면 §166③
          환산취득가액({sec166Where})과 비교해 큰 금액을 취득가액으로 합니다.
        </p>
      </ToneCard>
    );
  }

  if (acquisitionCause === "gift") {
    return (
      <ToneCard
        tone="violet"
        title="종전자산 취득가액 — 증여일 상증법 평가액"
        titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
      >
        <p className="text-xs text-violet-800 dark:text-violet-200">
          증여로 취득한 종전자산은 증여일 현재 상증법 §60~66 평가액(증여세 신고가액)을 종전자산 취득가액으로
          봅니다. 증여 신고가액은 항상 확인 가능하므로 §166③ 환산취득가·§163⑥ 개산공제는 적용하지 않습니다.
          평가액은 <span className="font-semibold">③ 취득정보의 &ldquo;증여 신고가액&rdquo;</span> 입력값을 씁니다.
          다만 의제취득일(1985.1.1.) 전 증여면 §166③ 환산취득가액({sec166Where})과 비교해 큰 금액을 취득가액으로 합니다.
        </p>
      </ToneCard>
    );
  }

  return null;
}

/**
 * §163⑨ 평가액이 ⑤ 「인가전 분 종전 부동산 취득가액」보다 **우선 적용된다**는 표시.
 *
 * ## 왜 필요한가 (2026-08-23 실측 · R-10)
 *
 * ⑧ validate는 실가 모드에서 `redevActualAcquisitionPrice`를 **필수**로 요구한다
 * (`transfer-tax-validate-redev.ts:111`·`:214`). 그런데 상속·증여 평가액이 함께 입력되면
 * STEP 0.45(`transfer-tax.ts:115`)가 `input.acquisitionPrice`를 그 평가액으로 **무조건 교체**하므로
 * (`inheritance-acquisition-helpers.ts:264`), 사용자가 **필수라서 채운 값이 조용히 버려진다**.
 *
 * 실측 (입주권 원조합원 · 실가 모드 · 권리가액 3억):
 *
 * | 증여 신고가액 | ⑤ 칸 | 인가전 취득가액 |
 * |---|---|---|
 * | 3억 | 2억 | **3억** (⑤ 무시) |
 * | 미입력 | 2억 | 2억 (⑤ 사용) |
 *
 * 상속·증여 × 실가·환산 × 입주권·완공APT **8조합 전부** 같은 방향이다.
 *
 * ## 술어를 복제하지 않는다
 *
 * 노출 조건은 **API 변환이 실제로 `inheritedAcquisition`을 송신하는가**와 같아야 한다.
 * 조건을 다시 쓰면 갈린다(예: 증여 신고가액 미입력 시 payload는 안 나가는데 안내만 뜨면 거짓말이 된다).
 * 그래서 `buildInheritedAcquisitionPayload` **그 함수**를 그대로 호출해 판정한다.
 *
 * ⚠️ 안내만 하고 **입력을 막지 않는다** — 값을 지우면 §163⑨ 경로가 사라져 계산이 조용히 틀어진다
 *   (선행 PR 교훈: 「UI 게이트가 유일 입력 경로를 제거」).
 */
export function RedevelopmentSec163_9PriorityNotice({ asset }: { asset: AssetForm }) {
  const payload = buildInheritedAcquisitionPayload(asset, 1, false).inheritedAcquisition as
    | { mode?: string }
    | undefined;
  if (payload === undefined) return null;

  const isGift = asset.acquisitionCause === "gift";
  const sourceLabel = isGift ? "증여 신고가액" : "상속개시일 평가액";

  // 의제취득일(1985.1.1.) 전 — 평가액이 「우선」이 아니라 3자 max다. ③은 §166③이고 이 섹션의 「환산취득가액」 칸으로 계산된다
  // (엔진 `resolvePreDeemedRedevelopment166_3Price` · 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12).
  if (payload.mode === "pre-deemed") {
    return (
      <div
        className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-caption text-amber-900 dark:text-amber-200 leading-relaxed space-y-1"
        data-testid="redev-pre-deemed-166-3-notice"
      >
        <p className="font-semibold">의제취득일(1985.1.1.) 전 {isGift ? "증여" : "상속"} — 세 금액 중 큰 금액이 종전자산 취득가액입니다</p>
        {asset.transferType === "burdened_gift" ? (
          // 부담부증여(시가 평가) — 라디오 없이 §166③ 칸이 늘 뜬다. 세 금액은 안분 전 전체 금액으로 비교하고 채택값에 채무비율을 곱한다(PR-7b-4)
          <p data-testid="redev-pre-deemed-166-3-notice-bg">
            ① ③ 취득정보의 &ldquo;{sourceLabel}&rdquo; · ② 취득당시 기준시가(§164④~⑦) · ③ 아래 §166③ 환산취득가액 중 큰 금액에
            채무비율을 곱합니다(소득세법 시행령 §159①1호). ③이 채택되면 인가 전 분 필요경비는 개산공제(§163⑥)이고, ①·②가 채택되면
            인가 전 분 실비를 씁니다.
          </p>
        ) : (
          <p>
            ① ③ 취득정보의 &ldquo;{sourceLabel}&rdquo; · ② 취득당시 기준시가(§164④~⑦) · ③ §166③ 환산취득가액 중 큰 금액으로
            계산합니다. ③은 아래에서 <span className="font-semibold">「환산취득가액」</span>을 고르고 §166③ 칸을 채우면 계산되고,
            ③이 채택되면 개산공제(§163⑥)가 함께 적용됩니다. 「실지거래가액」을 고르면 ③ 없이 ①·② 중 큰 금액이며, 그때 아래
            실지거래가액 칸 값은 계산에 쓰이지 않습니다.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />
          <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="소령 §166③" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-caption text-amber-900 dark:text-amber-200 leading-relaxed space-y-1">
      <p className="font-semibold">
        ③ 취득정보의 &ldquo;{sourceLabel}&rdquo;이 이 섹션보다 우선 적용됩니다
      </p>
      <p>
        인가전 분 종전 부동산 취득가액은 <span className="font-semibold">그 평가액</span>으로 계산됩니다.
        아래 값은 입력이 필요하지만 계산에는 쓰이지 않습니다. 평가액을 바꾸려면 ③ 취득정보에서
        수정하세요.
      </p>
      <p>
        「소득세법 시행령」 §163⑨는 상속개시일·증여일 현재 상증법 §60~66 평가액을 취득 당시
        실지거래가액으로 봅니다. §166③ 환산은 취득가액을 <span className="font-semibold">확인할 수 없는 경우</span>에만
        적용되므로, 평가액이 확인되면 환산취득가와 개산공제(§163⑥)도 적용되지 않습니다.
      </p>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />
        <LawArticleModal legalBasis="소득세법 시행령 §166 ③" label="소령 §166③" />
      </div>
    </div>
  );
}
