"use client";

/**
 * 「비사업용 토지 여부 검토」 토글 + 판정 상태 라디오 + 지정지역 질문 — 토지 자산 하나의 §104①8호 중과 표지 제어.
 *
 * 주 자산은 Step4 `SpecialSituationSection`이, 함께 양도 토지 카드(자산 2 이후)는 ⑤ 기타 특례(`AssetSectionExtras`)가 이 컴포넌트 하나를 쓴다.
 * NBL2611-R21 — 종전에는 컴패니언 카드에 이 토글이 없어 공익수용 프리필이 켠 표지를 끌 수 없었고, 정밀판정을 «접으면» 표지만 남아
 * 컴패니언 전량에 +10%p가 붙었다(리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §1.9 잔여 · Q-9 (가)). 두 위치가 같은 토글을 읽어야 표지·정밀판정이 어긋나지 않는다.
 *
 * 토글 해제는 정밀판정도 끈다(주 자산과 같은 규칙) — 정밀판정만 켜진 채 표지가 꺼진 상태를 만들지 않는다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { NblDesignatedAreaQuestion } from "@/components/calc/transfer/nbl/NblDesignatedAreaQuestion";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 지정지역 질문의 기간 판정 */
  transferDate: string | undefined;
  /** 지정지역 질문 셀렉터를 가른다 — 한 화면에 토지 카드가 여럿 있을 수 있다 */
  idSuffix: string;
}

export function NblScreeningToggle({ asset, onChange, transferDate, idSuffix }: Props) {
  return (
    <ToggleCard
      checked={asset.isNonBusinessLand ?? false}
      onCheckedChange={(v) =>
        onChange({
          isNonBusinessLand: v,
          // 체크 해제 시 상세 판정도 끔. 체크 시는 현재 상태 유지(라디오로 선택).
          nblUseDetailedJudgment: v ? asset.nblUseDetailedJudgment : false,
        })
      }
      title="비사업용 토지 여부 검토"
      description="해당 시 기본세율 +10%p 중과 대상"
      tone="rose"
    >
      {/* P3: 재촌 요건 안내 */}
      <div className="rounded-md bg-muted/40 border border-border/60 px-3 py-2 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground/70">
          농지·임야 재촌(在村) 요건 — 아래 중 하나 충족 시 사업용
        </p>
        <ul className="space-y-0.5 pl-2">
          <li>• 토지 소재지와 <strong>동일 시·군·구</strong>에 거주</li>
          <li>• 토지 소재지와 <strong>연접한 시·군·구</strong>에 거주</li>
          <li>• 토지 소재지와 거주지 사이 <strong>직선거리 30km 이내</strong></li>
        </ul>
        <p className="text-muted-foreground text-micro mt-1">
          소득세법 시행령 §168조의8 — 정밀 판정을 원하시면 세무사 확인 권장
        </p>
      </div>

      {/* 판정 상태 라디오 */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground/70">판정 상태</p>
        <RadioCardGroup
          name={`nbl-mode-${asset.assetId}`}
          tone="rose"
          value={asset.nblUseDetailedJudgment ? "detailed" : "completed"}
          onChange={(v) => onChange({ nblUseDetailedJudgment: v === "detailed" })}
          options={[
            {
              value: "completed",
              label: "이미 비사업용으로 판정 완료",
              description: "바로 +10%p 중과세 적용",
            },
            {
              value: "detailed",
              label: "판정 도움 필요",
              description: "지목·재촌·자경 입력으로 엔진이 자동 판정",
            },
          ]}
        />
      </div>

      {/* 양도일 2009.3.16.~2015.12.31.이면 지정지역 여부가 8호 중과 유예의 요건 사실이다 — 그 기간에만 뜬다 */}
      <NblDesignatedAreaQuestion
        transferDate={transferDate}
        value={asset.isDesignatedArea}
        onChange={(isDesignatedArea) => onChange({ isDesignatedArea })}
        idSuffix={idSuffix}
      />
    </ToggleCard>
  );
}
