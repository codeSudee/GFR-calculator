/** Client-side rendering shared by every calculator: the result card and its step-by-step working. */
import type { GfrResult } from './gfr';

export function escapeHtml(input: string): string {
	return input.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function stageBadgeClasses(stage: string): string {
	const map: Record<string, string> = {
		G1: 'bg-success-soft text-success',
		G2: 'bg-success-soft text-success',
		G3a: 'bg-warning-soft text-warning-deep',
		G3b: 'bg-warning-soft text-warning-deep',
		G4: 'bg-[#ffe0cc] text-[#ab3a0a]',
		G5: 'bg-[#ffd6d6] text-error-deep',
	};
	return map[stage] ?? 'bg-hairline-soft text-body';
}

export function resultHtml(result: GfrResult, extraHtml = ''): string {
	const stepsHtml = result.steps
		.map(
			(step) => `
		<li class="border-b border-hairline-soft py-2.5 last:border-0">
			<p class="text-xs font-medium uppercase tracking-wide text-mute">${escapeHtml(step.label)}</p>
			<p class="mt-1 font-mono text-sm text-ink break-words">${escapeHtml(step.expression)}</p>
			${step.result ? `<p class="mt-1 font-mono text-sm font-semibold text-ink">= ${escapeHtml(step.result)}</p>` : ''}
		</li>
	`,
		)
		.join('');

	const notesHtml = result.notes?.length
		? `<div class="mt-4 space-y-2 rounded-sm bg-hairline-soft p-3 text-xs text-body">
				${result.notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('')}
			</div>`
		: '';

	return `
		<div class="mt-6 rounded-md border border-hairline bg-canvas p-4 sm:p-5">
			<div class="flex flex-wrap items-baseline justify-between gap-3">
				<div>
					<p class="text-xs font-bold uppercase tracking-[0.08em] text-mute">${escapeHtml(result.formulaName)}</p>
					<p class="mt-1 text-3xl font-semibold tracking-tight text-ink [font-variant-numeric:tabular-nums]">
						${result.egfr} <span class="text-base font-normal text-body">${escapeHtml(result.unit)}</span>
					</p>
				</div>
				<span class="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${stageBadgeClasses(result.stage.stage)}">
					${escapeHtml(result.stage.label)} &middot; ${escapeHtml(result.stage.range)}
				</span>
			</div>
			<p class="mt-2 text-sm text-body">${escapeHtml(result.stage.description)}</p>
			${extraHtml}
			${notesHtml}

			<details class="mt-5 group" open>
				<summary class="cursor-pointer select-none text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
					<span class="inline-flex items-center gap-1.5">
						Show step-by-step working
						<svg class="h-3.5 w-3.5 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
					</span>
				</summary>
				<ol class="mt-3 divide-y divide-hairline-soft">
					${stepsHtml}
				</ol>
			</details>

			<p class="mt-4 border-t border-hairline-soft pt-4 text-sm text-body">
				Next: <a href="/egfr-results" class="text-link hover:text-link-deep">what your number means</a>
				&middot; <a href="/ckd-stages" class="text-link hover:text-link-deep">CKD stages chart</a>
				&middot; <a href="/how-to-improve-gfr" class="text-link hover:text-link-deep">protecting your GFR</a>
			</p>
		</div>
	`;
}

/** Reads a required number from an input, writing a message to its error element when out of range. */
export function readNumber(id: string, min: number, max: number, message: string): number | null {
	const input = document.getElementById(id) as HTMLInputElement | null;
	const error = document.getElementById(`${id}-error`);
	const value = Number(input?.value ?? '');
	const ok = Boolean(input?.value) && Number.isFinite(value) && value >= min && value <= max;
	if (error) error.textContent = ok ? '' : message;
	return ok ? value : null;
}

/** Reads the checked value of a radio group or the value of a select. */
export function readChoice<T extends string>(name: string): T {
	const checked = document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
	const select = document.querySelector<HTMLSelectElement>(`select[name="${name}"]`);
	return (checked?.value ?? select?.value) as T;
}
