"use client";

/**
 * 「같은 토지 위 구주택을 멸실하고 신축했다」 — 주택 부수토지 세율 보유기간 통산 입력 (해석 (5)).
 *
 * 설계: docs/02-design/features/appurtenant-land-rebuild-rate-basis.ui.design.md §4
 * 근거: 서면법규과-1222(2014.11.19.) · 사전-2023-법규재산-0097(2023.6.15.) — 구주택과 신축주택의 부수토지 기간을 합하여 §104① 세율 구간을 판정한다.
 *
 * 호스트가 두 곳이다(`landRebuildHost` — 단일 소스): 건물 신축 + 「토지는 다른 원인으로 취득」(`LandPartCauseBlock` 안) / 매매 + 「토지·건물 취득일 다름」
 * (`CompanionAcqDateSection`의 토지·건물 날짜 2열 직후). 한 자산에서는 한 호스트만 열리므로 `host` prop이 자기 호스트일 때만 렌더해 같은 testid가 둘이 되지 않는다.
 * ④ 전송·⑧ 검증도 `effectiveLandRebuild`로 같은 술어를 읽는다. 블록이 닫혀도 저장값은 지우지 않는다.
 * 건물 신축 취득일은 신축 호스트에서는 위 «취득정보»(사용승인일 등 4시점), 매매 호스트에서는 위 날짜 2열의 «건물 취득일»이 받는다 — 이 블록은 그 값을 새로 받지 않고
 * 구주택 구간(시작·멸실)과 정착면적 확인만 받는다.
 * 시작일·정착면적은 자동으로 채우지 않는다(자동 안분 금지) — 미선택·미확인은 ⑧이 막는다.
 */

import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { landRebuildHost, type LandRebuildHost } from "@/lib/calc/transfer-land-rebuild";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type StartMode = "since_land" | "later";

const START_OPTIONS: RadioCardOption<StartMode>[] = [
  { value: "since_land", label: "예 — 토지 취득 때부터 있었다", testId: "land-rebuild-start-since-land" },
  { value: "later", label: "아니오 — 토지 취득 뒤에 생겼다", testId: "land-rebuild-start-later" },
];

export function RebuiltHouseLandBlock(props: {
  /** 이 블록을 마운트한 자리의 호스트 — `landRebuildHost(asset)`가 같을 때만 렌더한다 */
  host: LandRebuildHost;
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 함께 양도하는 두 번째 이후 자산 — 이 입력을 받지 않는 자리(⑫가 400) */
  isNonPrimary?: boolean;
}) {
  const { asset, onChange } = props;
  if (landRebuildHost(asset, { isNonPrimary: props.isNonPrimary }) !== props.host) return null;
  const isPurchase = props.host === "purchase";

  const mode = asset.landRebuildStartMode ?? "";

  return (
    <div data-testid="land-rebuild-block">
      <ToggleCard
        data-field="landRebuildEnabled"
        data-testid="land-rebuild-toggle"
        tone="amber"
        title="같은 토지 위 구주택을 멸실하고 신축했다"
        description="구주택 부수토지 기간과 신축주택 부수토지 기간을 합해 토지 세율 구간을 판정"
        checked={asset.landRebuildEnabled === true}
        onCheckedChange={(checked) => onChange({ landRebuildEnabled: checked })}
      >
        <ToneCard tone="amber">
          <p className="text-xs text-amber-900" data-testid="land-rebuild-notice">
            <strong>본인 소유였던 구주택</strong>의 부수토지 기간만 통산합니다 — 주택과 토지의 소유자가 달랐던 기간과 나대지·상가였던 기간은
            주택 부수토지가 아니므로 제외합니다. 멸실일부터 신축 취득일(사용승인일 등)까지의 기간은 합산하지 않고, 각 구간의 남는 일수는 버립니다
            (서면법규과-1222, 2014.11.19. · 사전-2023-법규재산-0097, 2023.6.15.). 신축주택의 정착면적이 구주택보다 늘었다면 이 계산기로
            계산하지 않습니다. 비과세 보유·거주기간과 장기보유특별공제 보유기간의 통산은 별도로 판정해야 합니다.
          </p>
          {isPurchase && (
            <p className="text-xs text-amber-900" data-testid="land-rebuild-purchase-notice">
              <strong>건물 취득일 칸에는 신축 주택의 취득일을 넣으세요.</strong> 자기가 건설한 건축물의 취득시기는 사용승인서 교부일이고, 그 전에 사실상 사용하거나
              임시사용승인을 받았다면 사실상 사용일 또는 임시사용승인일 중 빠른 날입니다(건축허가 없이 지은 건물은 사실상 사용일) — {TRANSFER.SELF_BUILT_ACQUISITION_DATE}.
              구주택이 아닌 신축 건물의 취득일이어야 구주택 기간과 신축 기간이 나뉩니다.
            </p>
          )}
        </ToneCard>

        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-amber-800">구주택이 토지 취득 때부터 있었나요?</p>
          <RadioCardGroup
            name={`landRebuildStartMode-${asset.assetId ?? "primary"}`}
            data-field="landRebuildStartMode"
            data-testid="land-rebuild-start-mode"
            tone="amber"
            layout="inline"
            options={START_OPTIONS}
            value={mode}
            onChange={(v) => onChange({ landRebuildStartMode: v })}
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 items-start">
          {mode === "later" && (
            <FieldCard
              label="구주택 취득일"
              field="landRebuildPriorHouseStartDate"
              required
              stacked
              hint="구주택을 본인이 소유하기 시작한 날 — 이 날부터 멸실일까지가 구주택 부수토지 기간입니다. 토지 취득일보다 앞서면 토지 취득일(상속은 피상속인 취득일)부터 봅니다."
            >
              <DateInput
                value={asset.landRebuildPriorHouseStartDate ?? ""}
                onChange={(v) => onChange({ landRebuildPriorHouseStartDate: v })}
                data-testid="land-rebuild-prior-start-date"
              />
            </FieldCard>
          )}
          <FieldCard
            label="구주택 멸실일"
            field="landRebuildDemolitionDate"
            required
            stacked
            hint={isPurchase ? "구주택 부수토지 기간의 끝 — 위 건물 취득일(신축 주택의 취득일)보다 앞이어야 합니다." : "구주택 부수토지 기간의 끝 — 위 신축 취득일(사용승인일 등)보다 앞이어야 합니다."}
          >
            <DateInput
              value={asset.landRebuildDemolitionDate ?? ""}
              onChange={(v) => onChange({ landRebuildDemolitionDate: v })}
              data-testid="land-rebuild-demolition-date"
            />
          </FieldCard>
        </div>

        <ToggleCard
          size="sm"
          data-field="landRebuildFootprintUnchanged"
          data-testid="land-rebuild-footprint-toggle"
          tone="amber"
          title="신축주택의 정착면적이 구주택보다 늘지 않았다"
          description="확인하지 않으면 계산하지 않습니다 — 면적을 자동으로 나누지 않습니다"
          checked={asset.landRebuildFootprintUnchanged === true}
          onCheckedChange={(checked) => onChange({ landRebuildFootprintUnchanged: checked })}
        />
      </ToggleCard>
    </div>
  );
}
