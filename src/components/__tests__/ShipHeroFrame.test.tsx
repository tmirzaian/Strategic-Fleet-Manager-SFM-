import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import ShipHeroFrame from '../ShipHeroFrame'

afterEach(() => cleanup())

describe('<ShipHeroFrame /> adaptive layout', () => {
  it('fallback metadata band renders below the image, not overlaid on top of it', () => {
    render(
      <ShipHeroFrame
        name="Gladius"
        manufacturer="Aegis Dynamics"
        ownership="Owned"
        activeBuildLabel="Factory Build"
        imported
      />
    )
    // No src at all -> fallback artwork -> metadata band, not overlay.
    expect(screen.getByTestId('ship-hero-metadata-band')).toBeInTheDocument()
    expect(screen.queryByTestId('ship-hero-overlay-info')).not.toBeInTheDocument()
  })

  it('no overlay text appears on top of fallback artwork — the image area contains only the image', () => {
    render(
      <ShipHeroFrame
        name="Avenger Titan"
        manufacturer="Aegis Dynamics"
        ownership="Owned"
        activeBuildLabel="Factory Build"
        imported
      />
    )
    const imageArea = screen.getByTestId('ship-hero-image-area')
    // The ship name/build/readiness text must not exist inside the image area.
    expect(imageArea.textContent).not.toContain('Avenger Titan')
    expect(imageArea.textContent).not.toContain('Factory Build')
  })

  it('the metadata band shows ship name, ownership, manufacturer, active build, and imported badge', () => {
    render(
      <ShipHeroFrame
        name="Gladius"
        manufacturer="Aegis Dynamics"
        ownership="Owned"
        activeBuildLabel="Factory Build"
        imported
      />
    )
    const band = screen.getByTestId('ship-hero-metadata-band')
    expect(band.textContent).toContain('Gladius')
    expect(band.textContent).toContain('Aegis Dynamics')
    expect(band.textContent).toContain('Factory Build')
    expect(screen.getByText('Owned')).toBeInTheDocument()
    expect(screen.getByText('Imported')).toBeInTheDocument()
  })

  it('real ship photography uses the overlay layout, not the metadata band', () => {
    render(
      <ShipHeroFrame
        imageSrc="https://example.com/real-ship.jpg"
        name="Ghost"
        manufacturer="Anvil"
        ownership="Owned"
        activeBuildLabel="Stealth Build"
      />
    )
    expect(screen.getByTestId('ship-hero-overlay-info')).toBeInTheDocument()
    expect(screen.queryByTestId('ship-hero-metadata-band')).not.toBeInTheDocument()
  })

  it('EWO-095A: the text-legibility gradient is localized to the bottom half of the hero, not the full image — only the text-overlay region darkens', () => {
    const { container } = render(
      <ShipHeroFrame
        imageSrc="https://example.com/real-ship.jpg"
        name="Ghost"
        manufacturer="Anvil"
        ownership="Owned"
        activeBuildLabel="Stealth Build"
      />
    )
    const gradient = container.querySelector('.bg-gradient-to-t') as HTMLElement
    expect(gradient).not.toBeNull()
    expect(gradient.className).toContain('h-1/2')
    expect(gradient.className).not.toContain('inset-0')
  })

  it('EWO-033A (Task 5): the hero uses the exact same fixed height for fallback artwork and real photography — no height change based on image availability', () => {
    const { unmount } = render(
      <ShipHeroFrame name="Gladius" manufacturer="Aegis" ownership="Owned" activeBuildLabel="Factory Build" />
    )
    const fallbackHero = screen.getByTestId('ship-hero-image-area')
    const fallbackClass = fallbackHero.className
    expect(fallbackClass).toContain('h-44')
    unmount()

    render(
      <ShipHeroFrame
        imageSrc="https://example.com/real-ship.jpg"
        name="Ghost"
        manufacturer="Anvil"
        ownership="Owned"
        activeBuildLabel="Stealth Build"
      />
    )
    const photoHero = screen.getByTestId('ship-hero-image-area')
    expect(photoHero.className).toContain('h-44')
    expect(photoHero.className).toBe(fallbackClass)
  })

  it('16. Data Link Pending artwork/label displays for an imported ship definition with no resolved image', () => {
    render(
      <ShipHeroFrame
        name="Avenger Titan"
        manufacturer="Aegis Dynamics"
        ownership="Purchased"
        activeBuildLabel="Factory Build"
        imported
      />
    )
    const band = screen.getByTestId('ship-hero-metadata-band')
    expect(band.textContent).toContain('Data Link Pending')
  })

  it('manufacturer logo renders in the hero (top-left, above ship identity)', () => {
    render(<ShipHeroFrame name="Ghost" manufacturer="Anvil" ownership="Owned" activeBuildLabel="Stealth Build" />)
    expect(screen.getByTitle('Anvil')).toBeInTheDocument()
  })

  it('a reserved Mission Ready placeholder only renders when isMissionReady is true', () => {
    const { rerender } = render(<ShipHeroFrame name="Corsair" manufacturer="Drake" ownership="Owned" activeBuildLabel="Gunship Build" isMissionReady={false} />)
    expect(screen.queryByTitle(/Quartermaster certification/i)).not.toBeInTheDocument()

    rerender(<ShipHeroFrame name="Corsair" manufacturer="Drake" ownership="Owned" activeBuildLabel="Gunship Build" isMissionReady />)
    expect(screen.getByTitle(/Quartermaster certification/i)).toBeInTheDocument()
  })

  it('no readiness bar/percentage renders in the hero at all anymore', () => {
    render(<ShipHeroFrame name="Ghost" manufacturer="Anvil" ownership="Owned" activeBuildLabel="Stealth Build" />)
    expect(screen.queryByText(/^\d+%$/)).not.toBeInTheDocument()
  })

  describe('EWO-065 (Part A): onOpenSettings — opt-in Ship Settings control replaces the manufacturer plate', () => {
    it('omitted: the manufacturer logo renders exactly as before (backward compatible default — Ship Detail/ImportedShipDetail are unaffected)', () => {
      render(<ShipHeroFrame name="Ghost" manufacturer="Anvil" ownership="Owned" activeBuildLabel="Stealth Build" />)
      expect(screen.getByTitle('Anvil')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Ship Settings' })).not.toBeInTheDocument()
    })

    it('supplied: a Ship Settings control replaces the manufacturer plate, and clicking it calls the handler', () => {
      const onOpenSettings = vi.fn()
      render(<ShipHeroFrame name="Ghost" manufacturer="Anvil" ownership="Owned" activeBuildLabel="Stealth Build" onOpenSettings={onOpenSettings} />)
      expect(screen.queryByTitle('Anvil')).not.toBeInTheDocument()
      const settingsButton = screen.getByRole('button', { name: 'Ship Settings' })
      expect(settingsButton).toBeInTheDocument()
      fireEvent.click(settingsButton)
      expect(onOpenSettings).toHaveBeenCalledTimes(1)
    })
  })

  describe('EWO-065 (Part F): quartermasterSeal — the upgraded Quartermaster Completion Seal', () => {
    it('omitted/null: renders nothing in the accomplishment corner (even if isMissionReady is also unset)', () => {
      render(<ShipHeroFrame name="Ghost" manufacturer="Anvil" ownership="Owned" activeBuildLabel="Stealth Build" />)
      expect(screen.queryByTestId('quartermaster-completion-seal')).not.toBeInTheDocument()
    })

    it('supplied: renders the headline and detail text, distinct from the plain isMissionReady placeholder', () => {
      render(
        <ShipHeroFrame
          name="Ghost"
          manufacturer="Anvil"
          ownership="Owned"
          activeBuildLabel="Stealth Build"
          quartermasterSeal={{ headline: 'QUARTERMASTER CERTIFIED', detail: 'Ghost — Stealth Build' }}
        />
      )
      const seal = screen.getByTestId('quartermaster-completion-seal')
      expect(seal.textContent).toContain('QUARTERMASTER CERTIFIED')
      expect(seal.textContent).toContain('Ghost — Stealth Build')
      // Never both at once — no caller passes isMissionReady alongside quartermasterSeal.
      expect(screen.queryByTitle(/Quartermaster certification badge reserved/i)).not.toBeInTheDocument()
    })

    it('EWO-065A (Part C): the border/glow and headline are Quartermaster Gold; the shield/check glyph itself stays green', () => {
      render(
        <ShipHeroFrame
          name="Ghost"
          manufacturer="Anvil"
          ownership="Owned"
          activeBuildLabel="Stealth Build"
          quartermasterSeal={{ headline: 'QUARTERMASTER CERTIFIED', detail: 'Ghost — Stealth Build' }}
        />
      )
      const seal = screen.getByTestId('quartermaster-completion-seal')
      expect(seal.className).toContain('border-gold')
      const headline = within(seal).getByText('QUARTERMASTER CERTIFIED')
      expect(headline.className).toContain('text-gold')
      const glyphHousing = seal.querySelector('.text-success') as HTMLElement
      expect(glyphHousing).toBeTruthy()
    })
  })
})
