import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

  it('the hero grows taller for fallback artwork than for real photography', () => {
    const { unmount } = render(
      <ShipHeroFrame name="Gladius" manufacturer="Aegis" ownership="Owned" activeBuildLabel="Factory Build" />
    )
    const fallbackHero = screen.getByTestId('ship-hero-image-area')
    expect(fallbackHero.className).toContain('h-[360px]')
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
    expect(photoHero.className).not.toContain('h-[360px]')
    expect(photoHero.className).toContain('h-44')
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
})
