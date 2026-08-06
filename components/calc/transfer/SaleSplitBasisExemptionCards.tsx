"use client";

/**
 * 축 A 부속 — 양도가액 **안분 basis(감정평가가액)** + **§166⑧ 예외** 입력 (Phase 1-E)
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §12.3 · §12.6
 *
 * ## 왜 축 A에 두는가
 *
 * 두 입력 모두 **양도가액을 어떻게 나눌지**를 결정한다 — 취득가액 축(축 B)과 무관하다.
 *
 * | 입력 | 노출 조건 | 이유 |
 * |---|---|---|
 * | 감정평가가액 3필드 | **모드 무관** | 일괄양도의 안분 basis이자 구분양도의 30% 비교 대상이다 |
 * | §166⑧ 예외 | **구분양도 전용** | 30% 판정 자체가 구분 기재가 있어야 돈다 |
 *
 * ## 토글 상태를 폼에 저장하지 않는 이유
 *
 * 값의 유무로 열림을 판정하면 「입력하다가 지웠을 때 카드가 접히는」 문제가 생기고, 별도
 * 토글 필드를 두면 값과 상태 두 벌을 동기화해야 한다. ⇒ **로컬 `useState` + 초기값만 폼에서
 * 파생**한다(세션 복원 시 값이 있으면 열린 채 시작). 로컬 state는 store 미러링이 아니므로
 * `useEffect → store` 금지 정책과 무관하다.
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function SaleAppraisalBasisCard({ asset, onChange }: Props) {
  const [open, setOpen] = useState(
    () => !!(asset.landAppraisalAtTransfer || asset.buildingAppraisalAtTransfer || asset.appraisalDateAtTransfer),
  );

  return (
    // ⚠️ `ToggleCard`는 `data-testid`를 DOM으로 흘리지 않는다(props에 없다) — 기존 코드와 같이
    //    **감싸는 div에** 붙인다. 토글 자체를 조작할 때는 Switch의 `aria-label`(= title)로 잡는다.
    <div data-testid="sale-appraisal-toggle">
    <ToggleCard
      tone="emerald"
      checked={open}
      onCheckedChange={(v) => {
        setOpen(v);
        // 끄면 값을 **함께 비운다** — 남겨 두면 화면에 없는 값이 계속 전송돼 안분 기준이 조용히
        // 바뀐다(구분양도로 되돌린 뒤 잔존 양도가액이 일으켰던 것과 같은 종류의 사고다).
        if (!v) {
          onChange({ landAppraisalAtTransfer: "", buildingAppraisalAtTransfer: "", appraisalDateAtTransfer: "" });
        }
      }}
      title="감정평가가액으로 안분"
      description="감정평가가액이 있으면 양도시 기준시가보다 우선합니다 (부가가치세법 시행령 §64①1호 단서)"
    >
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <FieldCard label="토지 감정평가가액">
            <CurrencyInput
              label=""
              value={asset.landAppraisalAtTransfer}
              onChange={(v) => onChange({ landAppraisalAtTransfer: v })}
              data-testid="sale-appraisal-land"
            />
          </FieldCard>
          <FieldCard label="건물 감정평가가액">
            <CurrencyInput
              label=""
              value={asset.buildingAppraisalAtTransfer}
              onChange={(v) => onChange({ buildingAppraisalAtTransfer: v })}
              data-testid="sale-appraisal-building"
            />
          </FieldCard>
        </div>
        <FieldCard label="감정일자" hint="선택 입력 — 기록·신고서 참고용이며 안분 계산에는 쓰지 않습니다">
          <DateInput
            value={asset.appraisalDateAtTransfer}
            onChange={(v) => onChange({ appraisalDateAtTransfer: v })}
            data-testid="sale-appraisal-date"
          />
        </FieldCard>
        <p className="text-caption leading-snug text-muted-foreground">
          토지·건물 <strong>양쪽 모두</strong> 입력해야 안분 기준이 됩니다.
        </p>
        {/*
          🔴 시기 요건은 **프로그램이 판정하지 않는다**(Q-9 확정 — 계획서 §21). 부가령 §64①1호
             괄호의 기간 제한을 양도소득세에 적용하는 근거가 확정되지 않아, 엔진이 대신 판단하는
             대신 사실을 알리고 사용자 판단에 맡긴다.
        */}
        <p className="text-caption leading-snug text-amber-800">
          「부가가치세법 시행령」 제64조 제1항 제1호 괄호는 감정평가 시기에 제한을 두고 있습니다
          (공급시기가 속하는 과세기간의 <strong>직전 과세기간 개시일 ~ 종료일</strong>).
          이 프로그램은 그 요건을 <strong>검증하지 않으므로</strong> 충족 여부는 직접 확인하세요.
        </p>
      </div>
    </ToggleCard>
    </div>
  );
}

const EXEMPTION_OPTIONS: RadioCardOption<"other_law" | "demolished_land_only">[] = [
  { value: "other_law", label: "다른 법령에 구분 기준이 있는 경우" },
  { value: "demolished_land_only", label: "건물을 철거하고 토지만 사용하는 경우" },
];

export function SaleSplitExemptionCard({ asset, onChange }: Props) {
  const on = !!asset.saleSplitExemption;

  return (
    <div data-testid="sale-split-exemption-toggle">
    <ToggleCard
      tone="amber"
      checked={on}
      onCheckedChange={(v) =>
        // 켤 때 1호를 기본 선택한다 — 「켰는데 아무것도 안 고른」 중간 상태를 만들지 않는다.
        onChange(
          v
            ? { saleSplitExemption: "other_law" }
            : { saleSplitExemption: "", saleSplitExemptionNote: "" },
        )
      }
      title="구분 기재 가액을 그대로 인정받는 예외"
      description="선택하면 30% 차이가 나도 구분 기재한 가액을 씁니다 (소득세법 시행령 §166⑧)"
    >
      <div className="space-y-2">
        <RadioCardGroup
          name="saleSplitExemption"
          tone="amber"
          options={EXEMPTION_OPTIONS}
          value={asset.saleSplitExemption as "other_law" | "demolished_land_only"}
          onChange={(v) => onChange({ saleSplitExemption: v })}
        />
        <FieldCard label="근거" hint="신고서에 기재됩니다">
          <input
            type="text"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={asset.saleSplitExemptionNote}
            onChange={(e) => onChange({ saleSplitExemptionNote: e.target.value })}
            placeholder="적용 법령·사실관계를 적으세요"
            data-testid="sale-split-exemption-note"
          />
        </FieldCard>
        {asset.saleSplitExemption === "demolished_land_only" && (
          <p className="text-caption leading-snug text-amber-800">
            건물을 철거하고 토지만 사용하는 경우이므로 <strong>건물 양도가액이 0에 가까운 것이 정상</strong>입니다.
          </p>
        )}
      </div>
    </ToggleCard>
    </div>
  );
}
