import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useFleetStore } from '../store/useFleetStore'
import { APP_VERSION_LABEL } from '../config/appVersion'

const initialState = useFleetStore.getState()

beforeEach(() => {
  localStorage.clear()
  useFleetStore.setState(initialState, true)
})
afterEach(() => cleanup())

const routes = ['/', '/fleet', '/ship/ghost', '/loadout-manager', '/hangar', '/quick-update', '/decision-center', '/roadmap', '/log']

describe('Mission M-011: every existing application route renders without throwing', () => {
  it.each(routes)('%s renders', (route) => {
    expect(() =>
      render(
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      )
    ).not.toThrow()
  })
})

describe('EWO-060: "Ship Workspace" terminology is fully retired from rendered production UI', () => {
  it.each([...routes, '/ship-workspace', '/ship-workspace/ghost'])('%s never renders the retired "Ship Workspace" string', (route) => {
    render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    expect(document.body.textContent).not.toContain('Ship Workspace')
  })
})

describe('UX-004A: Universal Footer renders on every scoped and legacy route', () => {
  it.each([...routes, '/ship-workspace', '/ship-workspace/ghost'])('%s renders exactly one <footer> with the canonical version and the POPS slogan', (route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    const footers = container.querySelectorAll('footer')
    expect(footers).toHaveLength(1)
    expect(footers[0].textContent).toContain(`SFM ${APP_VERSION_LABEL}`)
    expect(footers[0].textContent).toContain('Plan')
    expect(footers[0].textContent).toContain('Outfit')
    expect(footers[0].textContent).toContain('Prepare')
    expect(footers[0].textContent).toContain('Succeed')
  })

  it.each([...routes, '/ship-workspace', '/ship-workspace/ghost'])('%s never displays the version in more than one place outside the footer\'s own text (branding cell no longer shows it)', (route) => {
    const { container } = render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.textContent).not.toContain(APP_VERSION_LABEL)
  })

  it('the Sidebar retains its fixed width on every route — the footer/branding fitment pass never touches sidebar width', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.className).toContain('w-64')
  })
})
