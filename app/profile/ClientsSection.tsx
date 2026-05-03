"use client";

import { useEffect, useState } from "react";
import { clientRepository } from "@/lib/storage/client-repository";
import { ClientForm } from "./ClientForm";
import type { Client } from "@/lib/storage/types";

type EditState = { type: "add" } | { type: "edit"; client: Client } | null;

export function ClientsSection() {
  const [clients, setClients] = useState<Client[]>([]);
  const [editState, setEditState] = useState<EditState>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function reload() {
    const list = await clientRepository.list();
    setClients(list);
  }

  useEffect(() => {
    clientRepository.list().then(setClients);
  }, []);

  async function handleAdd(data: Omit<Client, "id" | "userId" | "createdAt" | "updatedAt">) {
    await clientRepository.create(data);
    setEditState(null);
    await reload();
  }

  async function handleEdit(id: string, data: Omit<Client, "id" | "userId" | "createdAt" | "updatedAt">) {
    await clientRepository.update(id, data);
    setEditState(null);
    await reload();
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    await clientRepository.remove(id);
    setDeletingId(null);
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">의뢰인 관리</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            위임받은 납세자를 등록하여 의뢰인별로 세액을 계산·관리합니다.
          </p>
        </div>
        {editState === null && (
          <button
            type="button"
            onClick={() => setEditState({ type: "add" })}
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            + 의뢰인 추가
          </button>
        )}
      </div>

      {/* 추가 폼 */}
      {editState?.type === "add" && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary mb-3">새 의뢰인</p>
          <ClientForm
            onSubmit={handleAdd}
            onCancel={() => setEditState(null)}
          />
        </div>
      )}

      {/* 의뢰인 목록 */}
      {clients.length === 0 && editState === null ? (
        <p className="text-sm text-muted-foreground text-center py-6 rounded-xl border border-dashed border-border">
          등록된 의뢰인이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-background">
              {editState?.type === "edit" && editState.client.id === c.id ? (
                <div className="p-4">
                  <p className="text-xs font-semibold text-primary mb-3">의뢰인 수정</p>
                  <ClientForm
                    initial={c}
                    onSubmit={(data) => handleEdit(c.id, data)}
                    onCancel={() => setEditState(null)}
                  />
                </div>
              ) : (
                <div className="flex items-start justify-between p-4 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {c.birthDate && <span>{c.birthDate}</span>}
                      {c.phone && <span>{c.phone}</span>}
                      {c.email && <span className="truncate">{c.email}</span>}
                    </div>
                    {c.memo && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{c.memo}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditState({ type: "edit", client: c })}
                      className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted/60 transition-colors"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletingId === c.id}
                      className="rounded-md border border-destructive/40 text-destructive px-2.5 py-1 text-xs hover:bg-destructive/10 transition-colors disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
