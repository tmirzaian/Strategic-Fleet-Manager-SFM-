import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { useFleetStore } from '../store/useFleetStore'

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
