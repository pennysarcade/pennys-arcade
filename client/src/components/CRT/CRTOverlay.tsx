import { useCRT } from '../../context/CRTContext'
import '../../styles/crt.css'

export default function CRTOverlay() {
  const { settings } = useCRT()

  // If settings is null or disabled, don't render anything
  if (!settings || !settings.enabled) {
    return null
  }

  const { scanlines, glow, curvature, chromaticAberration, noise, vignette, brightness, contrast, saturation } = settings

  // Build CSS custom properties for the effects
  const overlayStyle: React.CSSProperties = {
    // Filter adjustments applied to the entire overlay
    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`,
  }

  const scanlineStyle: React.CSSProperties = {
    '--scanline-intensity': scanlines.intensity,
    '--scanline-spacing': `${scanlines.spacing}px`,
  } as React.CSSProperties

  const vignetteStyle: React.CSSProperties = {
    '--vignette-intensity': vignette.intensity,
  } as React.CSSProperties

  const noiseStyle: React.CSSProperties = {
    '--noise-intensity': noise.intensity,
  } as React.CSSProperties

  const glowStyle: React.CSSProperties = {
    '--glow-color': hexToRgba(glow.color, glow.intensity),
  } as React.CSSProperties

  const curvatureStyle: React.CSSProperties = {
    '--curvature-radius': `${curvature.intensity * 100}px`,
  } as React.CSSProperties

  const chromaticStyle: React.CSSProperties = {
    '--chromatic-intensity': chromaticAberration.intensity * 0.05,
  } as React.CSSProperties

  return (
    <div className="crt-overlay" style={overlayStyle}>
      {scanlines.enabled && (
        <div className="crt-scanlines" style={scanlineStyle} />
      )}
      {vignette.enabled && (
        <div className="crt-vignette" style={vignetteStyle} />
      )}
      {noise.enabled && (
        <div
          className={`crt-noise ${noise.animated ? 'animated' : ''}`}
          style={noiseStyle}
        />
      )}
      {glow.enabled && (
        <div className="crt-glow" style={glowStyle} />
      )}
      {curvature.enabled && (
        <div className="crt-curvature" style={curvatureStyle} />
      )}
      {chromaticAberration.enabled && (
        <div className="crt-chromatic-aberration" style={chromaticStyle} />
      )}
    </div>
  )
}

// Helper to convert hex color to rgba
function hexToRgba(hex: string, alpha: number): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return `rgba(0, 255, 255, ${alpha})`

  const r = parseInt(result[1], 16)
  const g = parseInt(result[2], 16)
  const b = parseInt(result[3], 16)

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
