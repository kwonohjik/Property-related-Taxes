"use client";

/**
 * FilingFormPersonalInfoPanel — 신고서 인적사항 입력 패널
 *
 * 설계: ui.design §3
 * - 로컬 useState만 — zustand·API·Dexie/sessionStorage 저장 전부 금지 (주민번호 민감정보)
 * - 주민번호: 화면 기본 마스킹, 토글로 표시, 인쇄 시 원본 출력
 * - 미입력 = 해당 칸 빈칸 (검증 차단 없음)
 * - SelectOnFocusProvider 전역 적용 — 개별 onFocus 추가 불필요
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { BESSHI_CELL_LABEL } from "./comprehensive-filing-constants";

interface PersonalInfo {
  name: string;
  residentId: string;
  address: string;
  officeTel: string;
  mobileTel: string;
  email: string;
  filingDate: string;        // YYYY-MM-DD
  agentName: string;         // 세무대리인 성명
  agentBusinessNo: string;   // 세무대리인 사업자번호
  agentTel: string;          // 세무대리인 전화
}

const INITIAL: PersonalInfo = {
  name: "",
  residentId: "",
  address: "",
  officeTel: "",
  mobileTel: "",
  email: "",
  filingDate: "",
  agentName: "",
  agentBusinessNo: "",
  agentTel: "",
};

/** 주민번호 마스킹: 123456-1****** */
function maskId(raw: string): string {
  if (!raw) return "";
  const clean = raw.replace(/[^0-9-]/g, "");
  if (clean.length <= 7) return clean;
  const idx = clean.indexOf("-");
  if (idx >= 0) {
    const front = clean.slice(0, idx);
    const back = clean.slice(idx + 1);
    return `${front}-${back.slice(0, 1)}${"*".repeat(back.length > 1 ? back.length - 1 : 0)}`;
  }
  return `${clean.slice(0, 6)}-${clean[6]}${"*".repeat(Math.max(0, clean.length - 7))}`;
}

function InputRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className={`${BESSHI_CELL_LABEL} w-32 shrink-0 font-medium text-gray-600 dark:text-gray-400 pt-1`}>
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

const inputCls =
  "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400";

interface Props {
  /** 인쇄 시 인적사항 표시용 외부 노출 (신고서 컴포넌트에서 읽기) */
  onChange?: (info: PersonalInfo) => void;
}

export function FilingFormPersonalInfoPanel({ onChange }: Props) {
  const [info, setInfo] = useState<PersonalInfo>(INITIAL);
  const [showId, setShowId] = useState(false);

  function update(patch: Partial<PersonalInfo>) {
    const next = { ...info, ...patch };
    setInfo(next);
    onChange?.(next);
  }

  return (
    <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20 p-3 space-y-2.5 text-xs">
      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
        신고서 기재사항 (선택 입력 — 계산과 무관)
      </p>

      <InputRow label="성명">
        <input
          className={inputCls}
          placeholder="성명"
          value={info.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </InputRow>

      <InputRow label="주민등록번호">
        <div className="flex items-center gap-1">
          <input
            className={`${inputCls} flex-1`}
            placeholder="000000-0000000"
            value={showId ? info.residentId : maskId(info.residentId)}
            onChange={(e) => update({ residentId: e.target.value })}
            onFocus={() => setShowId(true)}
            onBlur={() => setShowId(false)}
          />
          <button
            type="button"
            onClick={() => setShowId((v) => !v)}
            className="p-1 text-gray-500 hover:text-gray-700 print:hidden"
            title={showId ? "숨기기" : "표시"}
          >
            {showId ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
      </InputRow>

      <InputRow label="주소">
        <input
          className={inputCls}
          placeholder="주소"
          value={info.address}
          onChange={(e) => update({ address: e.target.value })}
        />
      </InputRow>

      <div className="flex gap-2">
        <div className="flex-1">
          <InputRow label="사무실(집) 전화">
            <input
              className={inputCls}
              placeholder="전화번호"
              value={info.officeTel}
              onChange={(e) => update({ officeTel: e.target.value })}
            />
          </InputRow>
        </div>
        <div className="flex-1">
          <InputRow label="휴대폰">
            <input
              className={inputCls}
              placeholder="휴대폰 번호"
              value={info.mobileTel}
              onChange={(e) => update({ mobileTel: e.target.value })}
            />
          </InputRow>
        </div>
      </div>

      <InputRow label="E-메일">
        <input
          className={inputCls}
          placeholder="이메일 주소"
          value={info.email}
          onChange={(e) => update({ email: e.target.value })}
        />
      </InputRow>

      <InputRow label="신고일">
        <DateInput
          value={info.filingDate}
          onChange={(v) => update({ filingDate: v })}
        />
      </InputRow>

      <div className="border-t border-blue-200 dark:border-blue-700 pt-2">
        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">세무대리인</p>
        <div className="flex gap-2">
          <div className="flex-1">
            <InputRow label="성명">
              <input
                className={inputCls}
                placeholder="세무대리인 성명"
                value={info.agentName}
                onChange={(e) => update({ agentName: e.target.value })}
              />
            </InputRow>
          </div>
          <div className="flex-1">
            <InputRow label="사업자번호">
              <input
                className={inputCls}
                placeholder="000-00-00000"
                value={info.agentBusinessNo}
                onChange={(e) => update({ agentBusinessNo: e.target.value })}
              />
            </InputRow>
          </div>
          <div className="flex-1">
            <InputRow label="전화">
              <input
                className={inputCls}
                placeholder="전화번호"
                value={info.agentTel}
                onChange={(e) => update({ agentTel: e.target.value })}
              />
            </InputRow>
          </div>
        </div>
      </div>

      {/* 인쇄 전용: 실제 인적사항 표시 (화면에서는 숨김) */}
      <div className="hidden print:block text-micro text-gray-700 space-y-0.5">
        <p>성명: {info.name} | 주민등록번호: {info.residentId}</p>
        <p>주소: {info.address}</p>
        <p>전화: {info.officeTel} | 휴대폰: {info.mobileTel} | 이메일: {info.email}</p>
        <p>신고일: {info.filingDate} | 세무대리인: {info.agentName} ({info.agentBusinessNo}, {info.agentTel})</p>
      </div>
    </div>
  );
}
