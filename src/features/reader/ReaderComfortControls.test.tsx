import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_READER_PREFERENCES } from '../../domain/reading/readerPreferences'
import { ReaderComfortControls } from './ReaderComfortControls'

describe('ReaderComfortControls font-family preference', () => {
  afterEach(() => {
    cleanup()
  })

  it('exposes the selected font family with accessible radio semantics', () => {
    render(
      <ReaderComfortControls
        preferences={{
          ...DEFAULT_READER_PREFERENCES,
          fontFamily: 'serif',
        }}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: '內文字型' })
    expect(
      within(group).getByRole('radio', { name: '襯線' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      within(group).getByRole('radio', { name: '無襯線' }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('selects either font family through keyboard activation', () => {
    const onChangePreferences = vi.fn()
    render(
      <ReaderComfortControls
        preferences={DEFAULT_READER_PREFERENCES}
        onChangePreferences={onChangePreferences}
        onResetPreferences={vi.fn()}
      />,
    )

    const serifOption = screen.getByRole('radio', { name: '襯線' })
    serifOption.focus()
    fireEvent.keyDown(serifOption, { key: 'Enter' })

    expect(onChangePreferences).toHaveBeenCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      fontFamily: 'serif',
    })

    const sansSerifOption = screen.getByRole('radio', { name: '無襯線' })
    sansSerifOption.focus()
    fireEvent.keyDown(sansSerifOption, { key: ' ' })

    expect(onChangePreferences).toHaveBeenLastCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      fontFamily: 'sans-serif',
    })
  })
})
