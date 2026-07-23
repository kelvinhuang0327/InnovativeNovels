import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('application shell', () => {
  it('identifies the project without introducing a product feature', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: 'Reading, built on explicit contracts.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('InnovativeNovels')).toBeInTheDocument()
  })
})
