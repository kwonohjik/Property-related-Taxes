"use client";

/**
 * 의제취득일(1985.1.1.) 전 **증여** — ③ 환산취득가액 입력 (PR-5 · 계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §16).
 *
 * 취득가액 = max(① 증여 신고가액, ② 영 §164④~⑦ 가액, ③ 환산취득가액). ①은 위 증여 블록, ②는 위 §164 섹션(토지 등급·주택 3시점·상가 8칸)이
 * 받고, 이 카드가 ③의 분자·분모를 받는다(상속 `PreDeemedInputs`와 같은 칸 — `PreDeemedConversionFields`).
 * ①은 계속 필수다(사용자 결정 Q-14) — ③만으로 계산하는 「평가액 확인 불가」 선언은 증여에 두지 않는다.
 * 노출 술어는 ④ 전송 게이트와 같다(`isGiftPreDeemedConversionAsset`) — 칸이 없으면 값도 싣지 않는다.
 */
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import { PreDeemedConversionFields } from "@/components/calc/transfer/inheritance/PreDeemedConversionFields";
import { isGiftPreDeemedConversionAsset } from "@/lib/calc/gift-pre-deemed";
import { isBgPreDeemedAsset } from "@/lib/calc/bg-pre-deemed";
import { bgPreDeemedUsesThreeWay } from "@/lib/calc/bg-pre-deemed-mode";
import { preDeemedShowsHouseValuation } from "@/lib/calc/pre-deemed-auto-std-price";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function GiftPreDeemedConversionSection({ asset, onChange, transferDate }: Props) {
  // 부담부증여(의제취득일 전 증여 토지·주택)도 같은 칸을 쓴다 — 시가면 ③의 분자·분모, 기준시가면 의제취득일 기준시가가 취득가액의 기준이다(계획서 §18).
  const bgPreDeemed = asset.acquisitionCause === "gift" && isBgPreDeemedAsset(asset);
  if (!isGiftPreDeemedConversionAsset(asset) && !bgPreDeemed) return null;
  const bgDeemedStdOnly = bgPreDeemed && !bgPreDeemedUsesThreeWay(asset);
  // 3시점(§164⑦) 입력이 열려 있는가 — ④ 전송값(`preDeemedSentStdPrices`)과 같은 판정(재개발은 위 술어가 이미 뺀다).
  const showHouseValuation = preDeemedShowsHouseValuation(asset);
  return (
    <div data-testid="gift-pre-deemed-conversion">
      <ToneCard tone="amber" title={bgDeemedStdOnly ? "의제취득일(1985.1.1.) 전 증여 — 의제취득일 기준시가" : "의제취득일(1985.1.1.) 전 증여 — ③ 환산취득가액"}>
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨" label="§163⑨" />
          <LawArticleModal legalBasis="소득세법 시행령 §176조의2 ④" label="§176조의2④" />
        </div>
        {bgDeemedStdOnly ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            기준시가로 평가한 부담부증여는 취득가액이 <b>의제취득일 기준시가 × 채무비율</b>입니다(소득세법 시행령 §159①1호 괄호). 아래 칸에 의제취득일(1985.1.1.) 시점 기준시가를 입력하세요.
          </p>
        ) : (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          1985.1.1. 전에 증여받은 자산은 <b>① 증여 신고가액, ② §164 취득당시 기준시가, ③ 환산취득가액 중 큰 금액</b>이 취득가액입니다.
          ③ = 양도가액 × <Frac top="의제취득일 기준시가" bottom="양도시 기준시가" />. 아래 두 칸을 비우면 ③은 비교하지 않습니다.
          ③이 적용되면 추계라 실제 필요경비 대신 개산공제(소득세법 시행령 §163⑥)를 더합니다.
          {bgPreDeemed && " 부담부증여는 ③의 양도가액이 증여가액이고, 고른 금액에 채무비율을 곱합니다(소득세법 시행령 §159①1호)."}
        </p>
        )}
        <PreDeemedConversionFields
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
          baseDate={asset.acquisitionDate}
          showHouseValuation={showHouseValuation}
          hideTransferField={bgDeemedStdOnly}
        />
      </ToneCard>
    </div>
  );
}
