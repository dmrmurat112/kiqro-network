'use client';

import { useActionState, useState } from 'react';
import type { CampaignInput } from '@kiqro/network/admin';
import type { ActionState } from '@/lib/action';

type Task = CampaignInput['tasks'][number];

const emptyTask = (): Task => ({ event: '', timeLimitDays: 7, nameEn: '', nameTr: '', prices: [{ country: '*', priceUsd: '' }] });

interface Props {
  initial: CampaignInput;
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  /** Tasks and prices are read-only once the campaign has clicks. */
  tasksLocked?: boolean;
}

/**
 * Campaign editor. Plain fields are regular inputs; the task list is kept in state and sent
 * as one JSON field ("tasks") because it is a nested, variable-length structure.
 */
export function CampaignForm({ initial, action, submitLabel, tasksLocked }: Props) {
  const [tasks, setTasks] = useState<Task[]>(initial.tasks.length ? initial.tasks : [{ ...emptyTask(), event: 'install', timeLimitDays: 1, nameEn: 'Install and open', nameTr: 'Yükle ve aç' }]);
  const [state, formAction, pending] = useActionState(action, undefined);

  const updateTask = (i: number, patch: Partial<Task>) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const updatePrice = (i: number, k: number, patch: Partial<Task['prices'][number]>) =>
    updateTask(i, { prices: tasks[i]!.prices.map((p, j) => (j === k ? { ...p, ...patch } : p)) });

  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="productId" value={initial.productId} />
      <input type="hidden" name="tasks" value={JSON.stringify(tasks)} />

      <div className="card">
        <h2>Temel bilgiler</h2>
        <div className="fields">
          <label>
            Kampanya adı (dahili)
            <input name="name" defaultValue={initial.name} required />
          </label>
          <label>
            Teklif başlığı (EN)
            <input name="titleEn" defaultValue={initial.titleEn} required />
          </label>
          <label>
            Teklif başlığı (TR)
            <input name="titleTr" defaultValue={initial.titleTr} />
          </label>
          <label>
            Ülkeler (virgülle)
            <input name="countries" defaultValue={initial.countries.join(', ')} placeholder="FI, DE, TR" required />
          </label>
        </div>
        <div className="fields" style={{ marginTop: 12 }}>
          <label>
            Açıklama (EN)
            <textarea name="descriptionEn" rows={2} defaultValue={initial.descriptionEn} />
          </label>
          <label>
            Açıklama (TR)
            <textarea name="descriptionTr" rows={2} defaultValue={initial.descriptionTr} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Takip ve kurallar</h2>
        <label>
          MMP takip linki — {'{click_id}'} zorunlu; {'{source_id}'}, {'{sub_source}'}, {'{country}'} isteğe bağlı
          <input name="trackingUrl" defaultValue={initial.trackingUrl} placeholder="https://app.appsflyer.com/com.app?pid=kiqro_int&clickid={click_id}&af_siteid={source_id}" required />
        </label>
        <div className="fields" style={{ marginTop: 12 }}>
          <label>
            Atıf penceresi (gün)
            <input name="attributionWindowDays" type="number" min={1} max={30} defaultValue={initial.attributionWindowDays} required />
          </label>
          <label>
            Minimum tıklama→yükleme (sn)
            <input name="ctitMinSeconds" type="number" min={0} max={3600} defaultValue={initial.ctitMinSeconds} required />
          </label>
          <label>
            Başlangıç (UTC, isteğe bağlı)
            <input name="startAt" type="datetime-local" defaultValue={String(initial.startAt ?? '')} />
          </label>
          <label>
            Bitiş (UTC, isteğe bağlı)
            <input name="endAt" type="datetime-local" defaultValue={String(initial.endAt ?? '')} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Bütçe</h2>
        <div className="fields">
          <label>
            Toplam bütçe (USD)
            <input name="totalBudgetUsd" defaultValue={initial.totalBudgetUsd} required />
          </label>
          <label>
            Günlük bütçe (USD, isteğe bağlı)
            <input name="dailyBudgetUsd" defaultValue={initial.dailyBudgetUsd ?? ''} />
          </label>
        </div>
        <p className="muted">Bütçe yalnızca yeni kullanıcı alımını durdurur; görevi başlamış kullanıcıların sonraki adımları ödenmeye devam eder.</p>
      </div>

      <div className="card">
        <div className="row spread">
          <h2>Görevler ve reklamveren fiyatları</h2>
          {!tasksLocked && (
            <button type="button" className="secondary small" onClick={() => setTasks((ts) => [...ts, emptyTask()])}>
              + Görev ekle
            </button>
          )}
        </div>
        {tasksLocked && <p className="notice info">Bu kampanyada tıklama olduğu için görevler ve fiyatlar kilitli. Fiyat değişikliği için kampanyayı kopyalayın.</p>}
        <div className="stack" style={{ display: 'grid', gap: 12 }}>
          {tasks.map((task, i) => (
            <fieldset key={i} className="task" disabled={tasksLocked}>
              <div className="row spread">
                <strong>Adım {i + 1}</strong>
                {!tasksLocked && tasks.length > 1 && (
                  <button type="button" className="secondary small" onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))}>
                    Kaldır
                  </button>
                )}
              </div>
              <div className="fields">
                <label>
                  MMP olay adı (birebir)
                  <input value={task.event} onChange={(e) => updateTask(i, { event: e.target.value })} placeholder="install / af_level_achieved_10" required />
                </label>
                <label>
                  Süre limiti (kurulumdan itibaren gün)
                  <input type="number" min={1} max={90} value={task.timeLimitDays} onChange={(e) => updateTask(i, { timeLimitDays: Number(e.target.value) })} required />
                </label>
                <label>
                  Kullanıcıya görünen ad (EN)
                  <input value={task.nameEn} onChange={(e) => updateTask(i, { nameEn: e.target.value })} required />
                </label>
                <label>
                  Kullanıcıya görünen ad (TR)
                  <input value={task.nameTr ?? ''} onChange={(e) => updateTask(i, { nameTr: e.target.value })} />
                </label>
              </div>
              <div className="prices">
                <span className="muted">Fiyatlar — "*" varsayılan, diğerleri ülke kodu</span>
                {task.prices.map((price, k) => (
                  <div key={k} className="price-row">
                    <input value={price.country} onChange={(e) => updatePrice(i, k, { country: e.target.value.toUpperCase() })} placeholder="* veya DE" aria-label="Ülke" />
                    <input value={price.priceUsd} onChange={(e) => updatePrice(i, k, { priceUsd: e.target.value })} placeholder="USD, ör. 2.50" aria-label="Fiyat (USD)" />
                    {task.prices.length > 1 && !tasksLocked ? (
                      <button type="button" className="secondary small" onClick={() => updateTask(i, { prices: task.prices.filter((_, j) => j !== k) })}>
                        Sil
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                {!tasksLocked && (
                  <div>
                    <button type="button" className="secondary small" onClick={() => updateTask(i, { prices: [...task.prices, { country: '', priceUsd: '' }] })}>
                      + Ülke fiyatı
                    </button>
                  </div>
                )}
              </div>
            </fieldset>
          ))}
        </div>
      </div>

      <div className="row">
        <button type="submit" disabled={pending}>
          {pending ? 'Kaydediliyor…' : submitLabel}
        </button>
        {state?.error && <span className="notice error">{state.error}</span>}
        {state?.ok && <span className="notice ok">{state.ok}</span>}
      </div>
    </form>
  );
}
