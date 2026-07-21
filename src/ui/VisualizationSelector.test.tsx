import { fireEvent, render, screen } from '@solidjs/testing-library'
import { describe, expect, it, vi } from 'vitest'
import type { Messages } from '../i18n'
import { en } from '../i18n/locales/en'
import es from '../i18n/locales/es'
import fr from '../i18n/locales/fr'
import pl from '../i18n/locales/pl'
import ptBR from '../i18n/locales/pt-BR'
import zhCN from '../i18n/locales/zh-CN'
import { VisualizationSelector } from './VisualizationSelector'

describe('VisualizationSelector', () => {
  it('shows distinct piano and guitar choices and reports selection changes', () => {
    const onChange = vi.fn()
    render(() => <VisualizationSelector mode="piano" onChange={onChange} disabled={false} />)

    expect(screen.getByRole('radiogroup', { name: en['visualization.aria'] })).toBeTruthy()
    expect(
      (
        screen.getByRole('radio', {
          name: en['visualization.piano.aria'],
        }) as HTMLInputElement
      ).checked,
    ).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: en['visualization.guitar.aria'] }))
    expect(onChange).toHaveBeenCalledWith('guitar')
  })

  it('uses one native radio group for browser keyboard navigation', () => {
    render(() => <VisualizationSelector mode="piano" onChange={vi.fn()} disabled={false} />)
    const piano = screen.getByRole('radio', { name: en['visualization.piano.aria'] })
    const guitar = screen.getByRole('radio', { name: en['visualization.guitar.aria'] })

    expect(piano.tagName).toBe('INPUT')
    expect(piano.getAttribute('type')).toBe('radio')
    expect(guitar.getAttribute('name')).toBe(piano.getAttribute('name'))
  })

  it('disables both choices and exposes the piano-only Learn explanation', () => {
    const onChange = vi.fn()
    const reason = en['visualization.learnPianoRequired']
    render(() => (
      <VisualizationSelector
        mode="piano"
        onChange={onChange}
        disabled={true}
        disabledReason={reason}
      />
    ))

    const group = screen.getByRole('radiogroup', { name: en['visualization.aria'] })
    const explanation = screen.getByRole('status')
    expect(explanation.textContent).toBe(reason)
    expect(group.getAttribute('aria-describedby')).toBe(explanation.id)
    for (const choice of screen.getAllByRole('radio')) {
      expect((choice as HTMLInputElement).disabled).toBe(true)
    }
    fireEvent.click(screen.getByRole('radio', { name: en['visualization.guitar.aria'] }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ships matching visualization and guitar-renderer keys in every locale', () => {
    const locales: readonly Messages[] = [es, fr, pl, ptBR, zhCN]
    const keys = Object.keys(en).filter(
      (key) => key.startsWith('visualization.') || key.startsWith('guitar.'),
    )

    expect(keys.length).toBeGreaterThan(0)
    for (const messages of locales) {
      expect(keys.filter((key) => !(key in messages))).toEqual([])
    }
  })
})
