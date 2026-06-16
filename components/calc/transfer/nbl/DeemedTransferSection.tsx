"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type DeemedReason =
  | "none"
  | "auction"
  | "public_sale"
  | "kamco_consignment"
  | "newspaper_public_offering"
  | "republication";

// §168의14②·§83의5② 양도일 의제 사유. 의제일을 양도일로 보아 §168의6 기간기준만 재판정.
const DEEMED_OPTIONS: RadioCardOption<DeemedReason>[] = [
  { value: "none", label: "해당 없음", description: "실제 양도일 기준으로 기간기준 판정", testId: "nbl-deemed-none" },
  { value: "auction", label: "민사집행법 경매 (1호)", description: "최초 경매기일을 양도일로 의제", testId: "nbl-deemed-auction" },
  { value: "public_sale", label: "국세징수법 공매 (2호)", description: "최초 공매일을 양도일로 의제", testId: "nbl-deemed-public_sale" },
  { value: "kamco_consignment", label: "캠코 매각위임 (§83의5②1호)", description: "한국자산관리공사 매각위임일을 양도일로 의제", testId: "nbl-deemed-kamco" },
  { value: "newspaper_public_offering", label: "신문 매각공고 (§83의5②2호)", description: "3개 이상 일간신문 3일 이상 공고 + 1년 내 매각계약 → 최초 공고일", testId: "nbl-deemed-newspaper" },
  { value: "republication", label: "매각 재공고 (§83의5②3호)", description: "직전 매각가 10% 차감 재공고 + 1년 내 계약 → 최초 공고일", testId: "nbl-deemed-republication" },
];

/**
 * §168의14② 양도일 의제 — 경매·공매·장기매각으로 양도 지연 시 의제일을 §168의6 기간기준 판정에만 적용.
 * 주택부수토지(§168의6 미적용)는 NblSectionContainer 게이트에서 제외.
 */
export function DeemedTransferSection({
  asset,
  onAssetChange,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  const reason = (asset.nblDeemedTransferReason || "none") as DeemedReason;
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold text-rose-700">양도일 의제 (경매·공매·장기매각)</p>
        <LawArticleModal legalBasis="소득세법 시행령 §168의14②" label="§168의14②" />
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        경매·공매·장기매각으로 양도가 지연된 경우, 해당 일자를 양도일로 보아 기간기준(§168의6)만 재판정합니다.
        양도차익·세율·도시지역·편입유예는 실제 양도일 기준으로 계산됩니다.
      </p>
      <RadioCardGroup
        name="nbl-deemed-reason"
        value={reason}
        onChange={(v) => onAssetChange({ nblDeemedTransferReason: v })}
        options={DEEMED_OPTIONS}
      />
      {reason !== "none" && (
        <FieldCard label="의제 양도일" hint="최초 경매기일·공매일·매각위임일·최초 공고일">
          <DateInput
            value={asset.nblDeemedTransferDate}
            onChange={(v) => onAssetChange({ nblDeemedTransferDate: v })}
          />
        </FieldCard>
      )}
    </div>
  );
}
