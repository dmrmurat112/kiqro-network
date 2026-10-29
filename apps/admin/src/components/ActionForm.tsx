'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { ActionState } from '@/lib/action';

interface Props {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: React.ReactNode;
  className?: string;
  buttonClass?: string;
  /** Clear the inputs after a successful submit (create forms). */
  resetOnSuccess?: boolean;
  confirm?: string;
}

/** A form bound to a server action that shows the action's error or success message. */
export function ActionForm({ action, submitLabel, children, className = 'stack', buttonClass, resetOnSuccess, confirm }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <div className="row">
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? 'Kaydediliyor…' : submitLabel}
        </button>
        {state?.error && <span className="notice error">{state.error}</span>}
        {state?.ok && <span className="notice ok">{state.ok}</span>}
      </div>
    </form>
  );
}
