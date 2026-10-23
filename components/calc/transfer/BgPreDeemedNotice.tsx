"use client";

/**
 * 의제취득일(1985.1.1.) 전 상속·증여 토지·주택·상가·건물·재개발 완공 아파트 × 부담부증여 — §159 취득가액 안내 (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18).
 * 시가 평가(Q-24): ①②③ 중 큰 금액 × 채무비율 · 기준시가 평가(Q-25, 담보 승 포함): 의제취득일 기준시가 × 채무비율.
 * 노출·문구는 ④⑧과 같은 술어(`isBgPreDeemedAsset`·`bgPreDeemedUsesThreeWay`)다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { isBgPreDeemedAsset } from "@/lib/calc/bg-pre-deemed";
import { bgPreDeemedUsesThreeWay } from "@/lib/calc/bg-pre-deemed-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function BgPreDeemedNotice({ asset }: { asset: AssetForm }) {
  if (!isBgPreDeemedAsset(asset)) return null;
  const threeWay = bgPreDeemedUsesThreeWay(asset);
  const reported = asset.acquisitionCause === "gift" ? "증여 신고가액" : "상속세 신고가액";
  // 재개발·재건축 완공 아파트(원조합원) — ③은 §166③이다(PR-7b-4 · Q-8 a)
  const isRedev = asset.assetKind === "redevelopment_apt";
  return (
    <div data-testid="bg-pre-deemed-notice" data-basis={threeWay ? "three_way" : "deemed_std"}>
      <ToneCard
        tone="violet"
        title="취득가액 — 의제취득일(1985.1.1.) 전 취득 자산의 부담부증여"
        titleExtra={<LawArticleModal legalBasis="소득세법 시행령 §159" label="시행령 §159" />}
      >
        {threeWay && isRedev ? (
          <p className="text-xs text-violet-900 dark:text-violet-200" data-testid="bg-pre-deemed-notice-redev">
            시가로 평가했으므로 종전 부동산(기존건물과 그 부수토지)의 취득가액은 <b>① {reported}, ② §164④~⑦ 취득당시 기준시가, ③ §166③ 환산취득가액 중 큰 금액</b>에
            채무비율을 곱한 금액입니다(소득세법 시행령 §159①1호 · §163⑨ · §166③). ③은 평가액에 취득일 기준시가를 관리처분계획 인가일 기준시가로 나눈 비율을
            곱한 금액이라(아래 재개발 블록 칸) 세 금액을 채무비율을 곱하기 전 전체 금액으로 비교합니다. 같으면 ①·②를 씁니다. ①·②가 채택되면 인가 전 분
            필요경비 실비를, ③이 채택되면 개산공제(시행령 §163⑥)를 적용합니다(시행령 §166①1호). 취득가액 산정방식은 고르지 않습니다.
          </p>
        ) : threeWay ? (
          <p className="text-xs text-violet-900 dark:text-violet-200">
            시가로 평가했으므로 취득가액은 <b>① {reported}, ② §164④~⑦ 취득당시 기준시가, ③ 환산취득가액 중 큰 금액</b>에 채무비율을 곱한 금액입니다
            (소득세법 시행령 §159①1호 · §163⑨ · §176조의2④). 세 금액은 채무비율을 곱하기 전 물건 전체로 비교하고, ③은 증여가액에 의제취득일 기준시가를
            양도시 기준시가로 나눈 비율을 곱합니다. 같으면 ①·②를 씁니다. ①·②가 채택되면 아래 자본적지출·양도비를 필요경비로 공제하고, ③이 채택되면
            개산공제(시행령 §163⑥)를 적용합니다 — 자본적지출·양도비가 ③과 개산공제의 합보다 크면 그 금액을 씁니다(소득세법 §97②2호 단서).
            ①②③은 위 취득 정보에서 입력합니다.
          </p>
        ) : (
          <p className="text-xs text-violet-900 dark:text-violet-200">
            기준시가로 평가했으므로 취득가액도 기준시가로 산정합니다(소득세법 시행령 §159①1호 괄호). 1984.12.31. 이전 취득분은 취득시기가 1985.1.1.로
            의제되므로(소득세법 부칙 법률 제4803호 §8) <b>의제취득일(1985.1.1.) 기준시가 × 채무비율</b>이 취득가액이고, 필요경비는 개산공제입니다.
            의제취득일 기준시가는 위 취득 정보에서 입력합니다(토지는 §164④ 토지등급 환산, 주택은 §164⑦ 3시점 환산, 상가는 §164⑥ 취득당시 기준시가 결과가
            있으면 그 값을 씁니다).
          </p>
        )}
      </ToneCard>
    </div>
  );
}
