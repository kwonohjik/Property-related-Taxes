"use client";

/**
 * 겸용주택 분리계산 입력 섹션
 *
 * assetKind === "housing" 이고 isMixedUseHouse === true 일 때 하단 노출.
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분부터 강제 분리.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { MixedUseAreaInputs } from "./mixed-use/MixedUseAreaInputs";
import { MixedUseStandardPriceInputs } from "./mixed-use/MixedUseStandardPriceInputs";
import { PartialUsageChangeInputs } from "./mixed-use/PartialUsageChangeInputs";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 2022.1.1 미만이면 경고 표시. PHD 양도시 시점 기준연도용. */
  transferDate?: string;
  /** 환산취득가 모드 여부 — PHD 토글 노출 조건 */
  useEstimatedAcquisition?: boolean;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
}

/**
 * 겸용주택 분리계산 토글 행 — 체크박스 + 라벨만.
 * 자산 카드 상단(자산 종류 토글 바로 아래)에 배치.
 * 확장 패널은 별도 컴포넌트(`MixedUseExpandedPanel`)로 분리되어
 * 카드 하단(직접 귀속 필요경비 위)에 렌더링됨.
 */
export function MixedUseToggleRow({ asset, onChange }: Pick<Props, "asset" | "onChange">) {
  return (
    <div className="mt-4 border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
      {/* 겸용주택 토글 — 활성화 시 토지/건물 분리도 자동 ON (SOT 일관성) */}
      <ToggleCard
        tone="amber"
        title="겸용주택 분리계산"
        description="주택+상가 복합건물 (§160①단서)"
        trailing={<LawArticleModal legalBasis="소득세법 시행령 §160①" label="§160①단서 겸용주택" />}
        checked={!!asset.isMixedUseHouse}
        onCheckedChange={(checked) => {
          onChange({
            isMixedUseHouse: checked,
            // 겸용주택 ON: 토지/건물 분리 모드 자동 활성화 (취득시기 분리 일반화)
            ...(checked ? { hasSeperateLandAcquisitionDate: true } : {}),
          });
        }}
      />
      {/* 보유 중 일부 용도변경 — 시행령 §166⑥ + 집행기준 99-164-10 */}
      <ToggleCard
        tone="amber"
        title="보유 중 일부 용도변경"
        description="취득시 자산 구성이 양도시와 다른 경우 (§166⑥ + 집행기준 99-164-10)"
        trailing={<LawArticleModal legalBasis="소득세법 시행령 §166⑥" label="§166⑥ 안분" />}
        checked={!!asset.hasPartialUsageChange}
        disabled={!asset.isMixedUseHouse}
        disabledReason="겸용주택 분리계산 활성화 시 사용 가능"
        onCheckedChange={(checked) => {
          onChange({
            hasPartialUsageChange: checked,
            // 토글 ON 시 디폴트 direction 자동 선택 (PDF 갑氏 케이스가 더 흔한 시나리오)
            ...(checked && !asset.partialChangeDirection
              ? { partialChangeDirection: "house_to_commercial" as const }
              : {}),
          });
        }}
      />
    </div>
  );
}

/**
 * 겸용주택 확장 패널 — 체크박스가 ON일 때만 면적·기준시가·거주·수도권 입력을 노출.
 * `MixedUseToggleRow`와 분리되어 자산 카드 하단(직접 귀속 필요경비 위)에 배치.
 * `isMixedUseHouse`가 false면 null 반환하여 시각적 노이즈 없음.
 */
export function MixedUseExpandedPanel({
  asset,
  onChange,
  transferDate,
  useEstimatedAcquisition,
  jibun,
}: Props) {
  if (!asset.isMixedUseHouse) return null;

  const isAfter2022 = !transferDate || transferDate >= "2022-01-01";

  return (
    <div className="mt-4 border-t pt-4 space-y-3">
      {/* 2022.1.1 이전 경고 */}
      {!isAfter2022 && (
        <div className="px-3 py-2 rounded-lg bg-red-50 text-red-800 text-sm">
          2022.1.1 이전 양도분은 겸용주택 강제 분리계산 범위 외입니다.
          주택연면적과 상가연면적을 비교하여 단일 자산 모드로 계산하세요.
        </div>
      )}

      {/* 4-way 결합 모드 가이드 — 환산 + PHD 활성 시 노출 */}
      {useEstimatedAcquisition && asset.usePreHousingDisclosure && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">겸용주택 + 환산취득가 + 토지/건물 분리 + §164⑤ 미공시 4-way 적용</p>
          <ol className="ml-4 list-decimal space-y-0.5 leading-relaxed">
            <li>양도가액을 면적·기준시가 비율로 주택/상가 안분</li>
            <li>주택부분: §164⑤ 3-시점 환산으로 취득시 주택가격 역산 → 토지/건물 보유연수 분리·표2 장특공제</li>
            <li>상가부분: §97 직접 환산 + 토지/건물 보유연수 분리·표1 장특공제</li>
            <li>주택부수토지 배율초과 면적은 비사업용토지로 이전(+10%p 가산)</li>
          </ol>
        </div>
      )}

      {/* ① 면적 정보 */}
      <MixedUseAreaInputs asset={asset} onChange={onChange} sectionNum={1} />

      {/* 1-A 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10) */}
      {asset.hasPartialUsageChange && (
        <PartialUsageChangeInputs asset={asset} onChange={onChange} sectionNum="1-A" />
      )}

      {/* ② 취득시 기준시가 / ③ 양도시 기준시가 (자산-우선 경로는 ② 주택 / ③ 상가).
          번호 스왑은 MixedUseStandardPriceInputs의 legacy 분기에서 처리 — 여기 숫자는 고정. */}
      <MixedUseStandardPriceInputs
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
        useEstimatedAcquisition={useEstimatedAcquisition}
        transferSectionNum={2}
        acqSectionNum={3}
        jibun={jibun}
      />

      {/* 거주기간은 보유상황 단계(1세대1주택)에서 단일 입력 — 자산목록 거주 입력 제거(중복 제거) */}
    </div>
  );
}
