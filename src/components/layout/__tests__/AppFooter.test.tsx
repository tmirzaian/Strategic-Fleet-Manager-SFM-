import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import AppFooter from '../AppFooter'
import { APP_VERSION_LABEL } from '../../../config/appVersion'

afterEach(() => cleanup())

describe('UX-004A: <AppFooter />', () => {
  it('Deliverable 1: displays the canonical version on the left, prefixed with "SFM"', () => {
    render(<AppFooter />)
    expect(screen.getByText(`SFM ${APP_VERSION_LABEL}`)).toBeInTheDocument()
  })

  it('Deliverable 1: displays the exact POPS slogan wording and order, never re-worded', () => {
    render(<AppFooter />)
    const order = ['Plan', 'Outfit', 'Prepare', 'Succeed']
    const rendered = order.map((word) => screen.getByText(word))
    // Each word is present, and DOM order (not just presence) matches the
    // required left-to-right sequence.
    const positions = rendered.map((el) => Array.prototype.indexOf.call(el.parentElement!.children, el))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('Deliverable 1: preserves the four-stage color treatment — Plan/Succeed Quartermaster Blue, Outfit Readiness Green, Prepare Quartermaster Gold', () => {
    render(<AppFooter />)
    expect(screen.getByText('Plan').className).toContain('text-cyan')
    expect(screen.getByText('Outfit').className).toContain('text-success')
    expect(screen.getByText('Prepare').className).toContain('text-gold')
    expect(screen.getByText('Succeed').className).toContain('text-cyan')
  })

  it('Deliverable 2: is a visual boundary, not a content panel — no .panel card class, no border on all sides (top divider only)', () => {
    const { container } = render(<AppFooter />)
    const footer = container.querySelector('footer') as HTMLElement
    expect(footer).not.toBeNull()
    expect(footer.className).not.toContain('panel')
    expect(footer.className).toContain('border-t')
    expect(footer.className).not.toMatch(/\bborder\b(?!-)/)
  })

  it('renders as a semantic <footer> element exactly once', () => {
    const { container } = render(<AppFooter />)
    expect(container.querySelectorAll('footer')).toHaveLength(1)
  })
})
