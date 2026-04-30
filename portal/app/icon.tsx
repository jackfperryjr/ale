import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#080E12',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '12px',
      }}
    >
      <span style={{ fontSize: 40, lineHeight: 1 }}>🍺</span>
    </div>,
    { ...size }
  )
}
