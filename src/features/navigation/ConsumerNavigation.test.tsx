import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsumerNavigation } from './ConsumerNavigation'

afterEach(() => {
  cleanup()
})

describe('ConsumerNavigation', () => {
  it('renders two labeled destinations and marks Bookstore as current', () => {
    render(
      <ConsumerNavigation
        currentDestination="catalog"
        onNavigate={vi.fn()}
      />,
    )

    const navigation = screen.getByRole('navigation', { name: '主要導覽' })
    const bookstore = within(navigation).getByRole('button', { name: '書城' })
    const library = within(navigation).getByRole('button', {
      name: '我的書架',
    })

    expect(bookstore).toHaveAttribute('aria-current', 'page')
    expect(library).not.toHaveAttribute('aria-current')
  })

  it('invokes each destination and marks Library as current', () => {
    const onNavigate = vi.fn()
    const { rerender } = render(
      <ConsumerNavigation
        currentDestination="catalog"
        onNavigate={onNavigate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '我的書架' }))
    expect(onNavigate).toHaveBeenLastCalledWith('library')

    rerender(
      <ConsumerNavigation
        currentDestination="library"
        onNavigate={onNavigate}
      />,
    )

    expect(screen.getByRole('button', { name: '我的書架' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('button', { name: '書城' })).not.toHaveAttribute(
      'aria-current',
    )

    fireEvent.click(screen.getByRole('button', { name: '書城' }))
    expect(onNavigate).toHaveBeenLastCalledWith('catalog')
  })
})
