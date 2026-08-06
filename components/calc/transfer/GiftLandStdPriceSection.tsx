/**
 * GiftLandStdPriceSection — **증여** 토지 §164④ 취득당시 기준시가 입력 (소령 §163⑨**1호**)
 *
 * 「소득세법 시행령」 §163⑨1호: "1990년 8월 30일 개별공시지가가 고시되기 전에 **상속 또는 증여**받은
 * 토지의 경우에는 … 평가한 가액과 **제164조제4항의 규정에 의한 가액 중 많은 금액**"
 *
 * ⭐ **환산(나목)과 무관한 가목 입력이다.** 종전에 토지등급 입력은 「환산취득가 모드」 안에만 있었고
 *    (`CompanionAcqPurchaseBlock`) 상속은 `PreDeemedInputs`가 따로 제공했다. 증여는 어느 쪽도
 *    해당하지 않아 ②를 산정할 화면이 **없었다** — API `hasPre1990`이 post-1985 증여를 배제하기까지 해서
 *    이중으로 막혀 있었다(계획서 §10).
 *
 * ⚠️ 이 섹션은 **환산 모드를 켜지 않는다**. 증여의 ①(증여 신고가액)은 그대로 살아 있고, 엔진이
 *    max(①, ②)를 계산한다(anchor `gift-land-164-4-max.anchor.test.ts`). API 쪽 대응 게이트는
 *    `hasPre1990ForSec164`(`transfer-tax-api.ts`)로, payload만 공급하고 override는 켜지 않는다.
 *
 * ⚠️ 등급 3종·면적·1990 ㎡당가가 **모두** 입력돼야 payload가 생성된다(all-or-nothing opt-in —
 *    `buildPre1990LandPayload`). 미입력 시 ① 단독으로 계산되므로 기존 동작과 같다.
 *
 * 계획서: docs/02-design/features/gift-163-9-clause-1-2-max.plan.md §4 G-1 · §10
 */
"use client";

import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { deriveSec163_9BaseDate } from "@/lib/calc/transfer-163-9-base-date";
import { sec164LandStatus } from "@/lib/calc/sec164-required-fields";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 개별공시지가 최초고시일 — 이 날 前 상속·증여받은 토지가 §163⑨1호의 §164④ max 대상. */
const LAND_FIRST_DISCLOSURE = "1990-08-30";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function GiftLandStdPriceSection({ asset, onChange, transferDate }: Props) {
  // 기준일은 API payload 빌더와 **같은 파생**(stale `inheritanceStartDate` 회피).
  const giftDate = deriveSec163_9BaseDate(asset);
  // 필수 항목 개수는 단일 소스에서 받는다(문구 하드코딩 금지).
  const status = sec164LandStatus(asset);
  if (
    asset.acquisitionCause !== "gift" ||
    asset.assetKind !== "land" ||
    !giftDate ||
    giftDate >= LAND_FIRST_DISCLOSURE
  ) {
    return null;
  }

  return (
    <ToneCard
      tone="amber"
      title="§164④ 취득당시 기준시가 (선택 — 증여일 평가액과 큰 금액 적용)"
      noDark
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨ 1호" label="§163⑨1호" />
        <LawArticleModal legalBasis="소득세법 시행령 §164 ④" label="§164④" />
      </div>
      <p className="text-xs text-amber-700">
        개별공시지가 최초고시(1990.8.30.) 전 증여받은 토지는{" "}
        <b>max(증여일 상증법 평가액, §164④ 취득당시 기준시가)</b>를 취득가액으로 봅니다. 위 「증여
        신고가액」이 앞의 값이고, 아래 토지등급 입력이 뒤의 값을 산정합니다.{" "}
        <b>{status ? `${status.total}개 항목을 모두` : "아래 항목을 모두"}</b> 입력한 경우에만
        비교합니다. 전부 비워두면 증여 신고가액만 사용하고,{" "}
        <b>일부만 입력하면 계산할 때 오류로 안내</b>합니다.
      </p>

      <Pre1990LandValuationInput
        form={{
          pre1990Enabled: asset.pre1990Enabled,
          pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
          pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
          pre1990Grade_current: asset.pre1990Grade_current,
          pre1990Grade_prev: asset.pre1990Grade_prev,
          pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
          pre1990GradeMode: asset.pre1990GradeMode,
        }}
        onChange={(patch) => onChange(patch)}
        acquisitionArea={asset.acquisitionArea}
        jibun={asset.addressJibun}
        acquisitionDate={asset.acquisitionDate}
        transferDate={transferDate}
        // ② 산출은 엔진이 `pre1990Land` payload로 직접 수행한다 — 여기서 `standardPriceAtAcq`에
        // 쓰면 환산(나목) 경로의 분자를 오염시킨다. `PreDeemedInputs`와 같은 noop.
        onCalculatedPrice={() => {}}
      />
    </ToneCard>
  );
}
