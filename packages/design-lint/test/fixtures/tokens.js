// a minimal token set shared by the rule tests.
//
// colors matter most: color-tokens bails out entirely when tokens.colors is empty, so
// a test that forgets them passes for the wrong reason. the other three rules ship
// their own default scales and work without any tokens at all.
export const tokens = {
  colors: {
    primary: '#6366f1',
    danger: '#ef4444',
    surface: '#ffffff'
  },
  spacing: {
    1: '4px',
    2: '8px',
    4: '16px'
  },
  typography: {
    fontFamily: {},
    fontSize: { base: '16px', lg: '18px' },
    fontWeight: {},
    lineHeight: {}
  },
  borderRadius: {
    sm: '2px',
    md: '6px'
  },
  shadows: {},
  sources: []
};

// wraps a snippet in a component so the babel parse in each rule has something valid
export function jsx(body) {
  return `export default function Demo() {\n  return (\n${body}\n  );\n}\n`;
}
