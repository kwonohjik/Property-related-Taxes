"use client";

import { useEffect, useState } from "react";
import { clientRepository } from "@/lib/storage/client-repository";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { ClientForm } from "@/app/profile/ClientForm";
import type { Client } from "@/lib/storage/types";

interface Props {
  onNext: () => void;
}

/**
 * 세무사 모드에서 계산 마법사 진입 시 표시되는 의뢰인 선택 단계.
 * 선택한 의뢰인 ID는 professionalStore.activeClientId에 저장된다.
 */
export function ClientSelectStep({ onNext }: Props) {
  const [clients, setClients] = useState<Client[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const { activeClientId, setActiveClientId } = useProfessionalStore();

  async function reload() {
    const list = await clientRepository.list();
    setClients(list);
  }

  useEffect(() => {
    clientRepository.list().then(setClients);
  }, []);

  async function handleAdd(data: Omit<Client, "id" | "userId" | "createdAt" | "updatedAt">) {
    const created = await clientRepository.create(data);
    setShowAdd(false);
    await reload();
    setActiveClientId(created.id);
  }

  function handleSelect(id: string) {
    setActiveClientId(id);
  }

  function handleNext() {
    if (!activeClientId) return;
    onNext();
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold">의뢰인 선택</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          이번 계산의 납세자(의뢰인)를 선택하거나 새로 등록하세요.
        </p>
      </div>

      {/* 의뢰인 목록 */}
      <ul className="space-y-2">
        {clients.map((c) => {
          const selected = activeClientId === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => handleSelect(c.id)}
                className={[
                  "w-full rounded-xl border-2 p-4 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted/40",
                ].join(" ")}
              >
                <p className={`text-sm font-semibold ${selected ? "text-primary" : ""}`}>
                  {c.name}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {c.birthDate && <span>{c.birthDate}</span>}
                  {c.phone && <span>{c.phone}</span>}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 새 의뢰인 추가 */}
      {showAdd ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary mb-3">새 의뢰인 등록</p>
          <ClientForm
            onSubmit={handleAdd}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full rounded-xl border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          + 새 의뢰인 등록
        </button>
      )}

      {clients.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground text-center">
          등록된 의뢰인이 없습니다. 위에서 새 의뢰인을 등록해 주세요.
        </p>
      )}

      {/* 다음 버튼 */}
      <button
        type="button"
        onClick={handleNext}
        disabled={!activeClientId}
        className="w-full rounded-lg bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {activeClientId
          ? `${clients.find((c) => c.id === activeClientId)?.name ?? "선택된 의뢰인"}으로 계산 시작`
          : "의뢰인을 선택하세요"}
      </button>
    </div>
  );
}
