import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_READER_PREFERENCES } from '../../domain/reading/readerPreferences'
import { ReaderComfortControls } from './ReaderComfortControls'

const RADIO_GROUP_CASES = [
  {
    name: '字型大小',
    preferenceKey: 'fontScale',
    preferenceValues: ['small', 'medium', 'large', 'extra-large'],
    selectedIndex: 1,
  },
  {
    name: '內文字型',
    preferenceKey: 'fontFamily',
    preferenceValues: ['serif', 'sans-serif'],
    selectedIndex: 1,
  },
  {
    name: '行距',
    preferenceKey: 'lineSpacing',
    preferenceValues: ['compact', 'comfortable', 'spacious'],
    selectedIndex: 1,
  },
  {
    name: '字距',
    preferenceKey: 'letterSpacing',
    preferenceValues: ['compact', 'normal', 'relaxed'],
    selectedIndex: 1,
  },
  {
    name: '閱讀主題',
    preferenceKey: 'theme',
    preferenceValues: ['light', 'sepia', 'dark'],
    selectedIndex: 0,
  },
  {
    name: '閱讀模式',
    preferenceKey: 'readingMode',
    preferenceValues: ['continuous', 'paged'],
    selectedIndex: 0,
  },
] as const

const ARROW_DIRECTIONS = [
  { key: 'ArrowRight', delta: 1 },
  { key: 'ArrowDown', delta: 1 },
  { key: 'ArrowLeft', delta: -1 },
  { key: 'ArrowUp', delta: -1 },
] as const

const ARROW_GROUP_CASES = RADIO_GROUP_CASES.filter((group) =>
  ['字型大小', '字距', '閱讀模式'].includes(group.name),
)

describe('ReaderComfortControls preferences', () => {
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

  it('keeps native button keyboard activation single-shot', () => {
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
    fireEvent.click(serifOption)

    expect(onChangePreferences).toHaveBeenCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      fontFamily: 'serif',
    })
    expect(onChangePreferences).toHaveBeenCalledTimes(1)

    const sansSerifOption = screen.getByRole('radio', { name: '無襯線' })
    sansSerifOption.focus()
    fireEvent.keyDown(sansSerifOption, { key: ' ' })
    fireEvent.click(sansSerifOption)

    expect(onChangePreferences).toHaveBeenLastCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      fontFamily: 'sans-serif',
    })
    expect(onChangePreferences).toHaveBeenCalledTimes(2)
  })

  it('keeps the selected radio as the only tab stop in every group', () => {
    render(
      <ReaderComfortControls
        preferences={DEFAULT_READER_PREFERENCES}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
      />,
    )

    for (const groupCase of RADIO_GROUP_CASES) {
      const group = screen.getByRole('radiogroup', { name: groupCase.name })
      const options = within(group).getAllByRole('radio')

      expect(options).toHaveLength(groupCase.preferenceValues.length)
      options.forEach((option, index) => {
        expect(option).toHaveAttribute(
          'tabindex',
          index === groupCase.selectedIndex ? '0' : '-1',
        )
      })
    }
  })

  it.each(ARROW_DIRECTIONS)(
    'moves, selects, focuses, and wraps with $key for representative groups',
    ({ key, delta }) => {
      for (const groupCase of ARROW_GROUP_CASES) {
        const onChangePreferences = vi.fn()
        const { unmount } = render(
          <ReaderComfortControls
            preferences={DEFAULT_READER_PREFERENCES}
            onChangePreferences={onChangePreferences}
            onResetPreferences={vi.fn()}
          />,
        )
        const group = screen.getByRole('radiogroup', { name: groupCase.name })
        const options = within(group).getAllByRole('radio')
        const sourceIndex = groupCase.selectedIndex
        const targetIndex =
          (sourceIndex + delta + options.length) % options.length
        const keyDownEvent = createEvent.keyDown(options[sourceIndex], { key })

        options[sourceIndex].focus()
        fireEvent(options[sourceIndex], keyDownEvent)

        expect(keyDownEvent.defaultPrevented).toBe(true)
        expect(options[targetIndex]).toHaveFocus()
        expect(onChangePreferences).toHaveBeenCalledTimes(1)
        expect(onChangePreferences).toHaveBeenCalledWith({
          ...DEFAULT_READER_PREFERENCES,
          [groupCase.preferenceKey]: groupCase.preferenceValues[targetIndex],
        })

        const boundaryIndex = delta === 1 ? options.length - 1 : 0
        const wrappedIndex = delta === 1 ? 0 : options.length - 1
        const wrapEvent = createEvent.keyDown(options[boundaryIndex], { key })

        options[boundaryIndex].focus()
        fireEvent(options[boundaryIndex], wrapEvent)

        expect(wrapEvent.defaultPrevented).toBe(true)
        expect(options[wrappedIndex]).toHaveFocus()
        expect(onChangePreferences).toHaveBeenCalledTimes(2)
        expect(onChangePreferences).toHaveBeenLastCalledWith({
          ...DEFAULT_READER_PREFERENCES,
          [groupCase.preferenceKey]: groupCase.preferenceValues[wrappedIndex],
        })

        unmount()
      }
    },
  )

  it('preserves unrelated preferences during arrow selection', () => {
    const onChangePreferences = vi.fn()
    const preferences = {
      ...DEFAULT_READER_PREFERENCES,
      fontFamily: 'serif' as const,
      lineSpacing: 'spacious' as const,
      letterSpacing: 'relaxed' as const,
      theme: 'dark' as const,
      readingMode: 'paged' as const,
    }

    render(
      <ReaderComfortControls
        preferences={preferences}
        onChangePreferences={onChangePreferences}
        onResetPreferences={vi.fn()}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: '字型大小' })
    const options = within(group).getAllByRole('radio')
    options[1].focus()
    fireEvent.keyDown(options[1], { key: 'ArrowRight' })

    expect(onChangePreferences).toHaveBeenCalledTimes(1)
    expect(onChangePreferences).toHaveBeenCalledWith({
      ...preferences,
      fontScale: 'large',
    })
  })

  it('offers exactly three letter-spacing modes and reports the selected mode', () => {
    const onChangePreferences = vi.fn()
    render(
      <ReaderComfortControls
        preferences={DEFAULT_READER_PREFERENCES}
        onChangePreferences={onChangePreferences}
        onResetPreferences={vi.fn()}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: '字距' })
    const options = within(group).getAllByRole('radio')
    expect(options).toHaveLength(3)
    expect(
      within(group).getByRole('radio', { name: '緊密字距' }),
    ).toHaveAttribute('aria-checked', 'false')
    expect(
      within(group).getByRole('radio', { name: '標準字距' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      within(group).getByRole('radio', { name: '寬鬆字距' }),
    ).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(within(group).getByRole('radio', { name: '寬鬆字距' }))
    expect(onChangePreferences).toHaveBeenCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      letterSpacing: 'relaxed',
    })
  })

  it('offers exactly continuous and paged modes and selects paged mode', () => {
    const onChangePreferences = vi.fn()
    render(
      <ReaderComfortControls
        preferences={DEFAULT_READER_PREFERENCES}
        onChangePreferences={onChangePreferences}
        onResetPreferences={vi.fn()}
      />,
    )

    const group = screen.getByRole('radiogroup', { name: '閱讀模式' })
    const options = within(group).getAllByRole('radio')
    expect(options).toHaveLength(2)
    expect(
      within(group).getByRole('radio', { name: '連續捲動' }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      within(group).getByRole('radio', { name: '分頁閱讀' }),
    ).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(within(group).getByRole('radio', { name: '分頁閱讀' }))
    expect(onChangePreferences).toHaveBeenCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      readingMode: 'paged',
    })
  })

  it('keeps reset-preferences behavior intact', () => {
    const onResetPreferences = vi.fn()
    render(
      <ReaderComfortControls
        preferences={DEFAULT_READER_PREFERENCES}
        onChangePreferences={vi.fn()}
        onResetPreferences={onResetPreferences}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '重設預設值' }))

    expect(onResetPreferences).toHaveBeenCalledTimes(1)
  })
})
