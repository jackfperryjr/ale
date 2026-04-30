import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ale: {
          bg:      '#080E12',
          card:    '#0D1418',
          border:  '#1E2830',
          amber:   '#E8A020',
          gold:    '#FFB84A',
          muted:   '#60707A',
          real:    '#00C875',
          mixed:   '#F07820',
          skunked: '#E03050',
        }
      },
      fontFamily: {
        serif: ['Georgia', 'Times New Roman', 'serif'],
      }
    }
  },
  plugins: []
}
export default config
