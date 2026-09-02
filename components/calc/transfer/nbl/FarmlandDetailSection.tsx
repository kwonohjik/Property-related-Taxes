"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BusinessUsePeriodsInput } from "./shared/BusinessUsePeriodsInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface FarmlandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function FarmlandDetailSection({
  asset,
  onAssetChange,
}: FarmlandDetailSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="농지 세부 정보"
        description="§168-8 농지 판정 — 자경 기간 및 의제자경 사유를 입력하세요."
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의8" label="§168의8 농지" />}
      />

      {/* 자경 여부 — farmingSelf === false 이면 자경기간 전체 0 처리 */}
      <ToggleCard
        tone="sky"
        title="직접 자경 (소유자가 직접 경작)"
        description="미체크 시 자경기간을 0으로 처리합니다."
        checked={asset.nblFarmingSelf}
        onCheckedChange={(v) => onAssetChange({ nblFarmingSelf: v })}
      />

      {/* 자경 기간 입력 — 재촌 기간과 교집합으로 실질 재촌·자경 기간 계산 */}
      <FieldCard label="자경 기간">
        <BusinessUsePeriodsInput
          periods={asset.nblBusinessUsePeriods}
          onChange={(periods) => onAssetChange({ nblBusinessUsePeriods: periods })}
          label="자경 기간"
        />
        <p className="text-xs text-muted-foreground mt-1">
          거주 이력(재촌)과의 교집합으로 재촌·자경 기간을 산정합니다. (「소득세법 시행령」
          §168의8②)
        </p>
      </FieldCard>

      {/*
        E2-09 (2026-09-03) — §168의8② 후단이 자경기간 판정에 「조세특례제한법 시행령」 §66⑭를
        준용한다(본문 실측 mst=286211). 종전에는 「제외하고 입력하세요」라는 **안내만** 있었다.
        사용자가 자경 기간 행을 손으로 쪼개야 했고, 쪼개지 않으면 자경기간이 과대 인정돼
        §168의6 기간기준을 잘못 통과했다(과소과세 방향).

        ⇒ 결격 **과세기간(연도)** 을 직접 받고 엔진이 자경 기간에서 뺀다.
           연수(count)가 아니라 연도인 이유: §168의6은 「직전 5년 중 3년」·「직전 3년 중 2년」이라
           **어느 해가 빠지는지**가 판정을 가른다(`disqualified-tax-periods.ts` 헤더).
      */}
      <FieldCard
        label="결격 과세기간 (조특령 §66⑭)"
        hint="자경기간에서 제외할 과세기간의 연도를 쉼표로 구분해 입력합니다 (예: 2019, 2020). 해당 없으면 비워 두세요."
      >
        {/* 전역 SelectOnFocusProvider가 포커스 시 전체 선택을 처리한다 (app/layout.tsx) */}
        <input
          type="text"
          inputMode="numeric"
          aria-label="결격 과세기간 연도"
          value={asset.nblDisqualifiedTaxPeriods}
          onChange={(e) => onAssetChange({ nblDisqualifiedTaxPeriods: e.target.value })}
          data-testid="nbl-disqualified-tax-periods"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
          다음 과세기간은 <b>자경한 기간에서 제외</b>됩니다 (「소득세법 시행령」 §168의8② 후단 →
          「조세특례제한법 시행령」 §66⑭).
          <br />
          <b>1호</b> 사업소득금액과 총급여액의 합계가 3,700만원 이상인 과세기간
          <br />
          <b>2호</b> 사업소득 총수입금액이 「소득세법 시행령」 §208⑤2호 각 목의 금액 이상인 과세기간
          <br />
          두 호 모두 농업·임업 소득, 부동산임대업 소득, 농가부업소득은 사업소득에서 제외합니다.
          과세기간은 1월 1일부터 12월 31일까지입니다 (「소득세법」 §5①).
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          조특법 §69 자경농지 감면(4단계)의 「결격 과세기간」 칸과 <b>같은 사실</b>을 묻지만 단위가
          다릅니다 — 그쪽은 <b>연수</b>, 여기는 <b>연도</b>입니다. 둘 다 해당하면 양쪽에 입력하세요.
        </p>
      </FieldCard>

      {/* 의제자경 사유 */}
      <SectionHeader
        title="의제자경 사유 (§168-8 ③)"
        description="해당 시 자경 기간 입력 없이도 사업용으로 간주합니다."
      />

      <ToggleCard
        tone="sky"
        title="주말농장 (의제자경, 1,000㎡ 이하)"
        checked={asset.nblFarmlandIsWeekendFarm}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsWeekendFarm: v })}
      />

      {/*
        🔴 종전 제목은 「농지전용 허가·신고 (3년 이내)」였고 허가일 DateInput을 달고 있었다
           (E2-05 · U1-04, 2026-09-02 코드리뷰). 둘 다 근거가 없었다:

           · **「3년 이내」는 §168의8③4호에 없는 요건**이다(본문 실측 mst=286211). 같은 항에서
             3년이 붙은 것은 2호(상속개시일부터 3년)·3호(이농일부터 3년)뿐이다. 라벨을 믿고
             「12년 전 허가라 해당 없음」으로 토글을 끄면 법상 인정되는 사용의제를 스스로 포기한다.
           · **허가일은 엔진에 도달하지 않았다.** store→Zod→페이로드까지는 실렸으나
             `buildFarmlandDeeming`이 매핑하지 않아 `FarmlandDeemingInput`에 대응 필드가 없었다
             (dead input). 조문에 기간 요건이 없으므로 배선할 곳도 없다 ⇒ 입력 자체를 제거한다.

           법문이 요구하는 실질 요건은 「**당해 전용목적으로 사용되는 토지**」이므로 그것을 제목에
           드러낸다. 별도 확인 체크박스 신설은 14지점 동기화가 필요해 별건으로 둔다.
      */}
      <ToggleCard
        tone="sky"
        title="농지전용 허가·신고·협의 완료 — 당해 전용목적으로 사용"
        description="「농지법」 §6②7호 전용허가·전용신고 또는 같은 항 8호 전용협의를 마친 농지로서 당해 전용목적으로 사용되는 토지 (「소득세법 시행령」 §168의8③4호 — 기간 제한 없음)"
        checked={asset.nblFarmlandIsConversionApproved}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsConversionApproved: v })}
      />

      <ToggleCard
        tone="sky"
        title="농지개발사업지구 (1,500㎡ 미만)"
        description="한국농어촌공사 개발사업지구 내 1,500㎡ 미만 농지 (소득세법 시행령 §168의8③, 농지법 §6②9호)"
        checked={asset.nblFarmlandIsFarmDevZone}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsFarmDevZone: v })}
      />

      <ToggleCard
        tone="sky"
        title="한계농지 정비사업"
        checked={asset.nblFarmlandIsMarginalFarm}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsMarginalFarm: v })}
      />

      <ToggleCard
        tone="sky"
        title="간척지"
        checked={asset.nblFarmlandIsReclaimedLand}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsReclaimedLand: v })}
      />

      <ToggleCard
        tone="sky"
        title="공익사업용"
        checked={asset.nblFarmlandIsPublicProjectUse}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsPublicProjectUse: v })}
      />

      <ToggleCard
        tone="sky"
        title="질병·고령으로 인한 임대 (의제자경)"
        checked={asset.nblFarmlandIsSickElderlyRental}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsSickElderlyRental: v })}
      />
    </div>
  );
}
