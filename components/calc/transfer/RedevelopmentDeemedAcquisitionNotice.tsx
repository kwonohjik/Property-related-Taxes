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
}: {
  acquisitionCause?: string;
}) {
  if (acquisitionCause === "inheritance") {
    return (
      <ToneCard
        tone="amber"
        title="종전자산 취득가액 — 상속개시일 상증법 평가액"
        titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="소령 §163⑨" />}
      >
        <p className="text-xs text-amber-800">
          상속으로 취득한 종전자산은 상속개시일 현재 상증법 §60~66 평가액(상속세 신고가액)을 종전자산
          취득가액으로 봅니다(위 &ldquo;상속개시일 평가액&rdquo; 입력값). 이 값이 확인되면 §166③ 환산취득가·
          §163⑥ 개산공제는 적용하지 않습니다. 상속개시일 평가액을 확인할 수 없는 경우에만 아래 환산 기준시가로
          §166③ 환산을 적용합니다.
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
        <p className="text-xs text-violet-800">
          증여로 취득한 종전자산은 증여일 현재 상증법 §60~66 평가액(증여세 신고가액)을 종전자산 취득가액으로
          봅니다. 증여 신고가액은 항상 확인 가능하므로 §166③ 환산취득가·§163⑥ 개산공제는 적용하지 않습니다.
          평가액은 <span className="font-semibold">③ 취득정보의 &ldquo;증여 신고가액&rdquo;</span> 입력값을 씁니다.
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
  const applies =
    buildInheritedAcquisitionPayload(asset, 1, false).inheritedAcquisition !== undefined;
  if (!applies) return null;

  const isGift = asset.acquisitionCause === "gift";
  const sourceLabel = isGift ? "증여 신고가액" : "상속개시일 평가액";

  return (
    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-caption text-amber-900 leading-relaxed space-y-1">
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
