export const primitiveColors = {
  neutral: {
    0: '#FFFFFF',
    50: '#F7F8FA',
    100: '#F1F3F7',
    200: '#E9EBF1',
    300: '#D6D9DF',
    500: '#5D677C',
    900: '#1C2028',
    950: '#121417',
  },
  indigo: { 500: '#4C60DC', 300: '#A492FF' },
  ocean: { 500: '#0EA5E9', 300: '#7DD3FC' },
  jade: { 500: '#10B981', 300: '#6EE7B7' },
  rose: { 500: '#F43F5E', 300: '#FDA4AF' },
  amber: { 500: '#F59E0B', 300: '#FCD34D' },
  red: { 600: '#C92A2A', 300: '#FF8A80' },
  orange: { 600: '#C85A17', 300: '#FDBA74' },
  slate: { 500: '#64748B', 300: '#CBD5E1' },
} as const;

export const semanticColors = {
  light: {
    canvas: primitiveColors.neutral[50],
    surface: primitiveColors.neutral[0],
    surfaceSubtle: primitiveColors.neutral[100],
    text: primitiveColors.neutral[900],
    textMuted: primitiveColors.neutral[500],
    border: primitiveColors.neutral[300],
    action: primitiveColors.indigo[500],
    actionSoft: '#EEF0FF',
    danger: primitiveColors.red[600],
  },
  dark: {
    canvas: primitiveColors.neutral[950],
    surface: '#1E2126',
    surfaceSubtle: '#2A2E36',
    text: '#EEF0F4',
    textMuted: '#A2AAB8',
    border: '#3A3F4A',
    action: primitiveColors.indigo[300],
    actionSoft: '#292D3A',
    danger: primitiveColors.red[300],
  },
} as const;

export const accentColors = {
  light: {
    indigo: '#4C60DC',
    ocean: '#087FB5',
    jade: '#087F62',
    rose: '#C93658',
    amber: '#A96305',
  },
  dark: {
    indigo: '#A492FF',
    ocean: '#7DD3FC',
    jade: '#6EE7B7',
    rose: '#FDA4AF',
    amber: '#FCD34D',
  },
} as const;

export const priorityColors = {
  light: {
    p1: '#CC0615',
    p2: '#B93700',
    p3: '#576583',
    p4: '#57667D',
  },
  dark: {
    p1: '#F87171',
    p2: '#FB923C',
    p3: '#8B9AB8',
    p4: '#94A3B8',
  },
} as const;

export const projectColors = {
  light: {
    indigo: '#6366F1',
    ocean: '#0EA5E9',
    jade: '#10B981',
    rose: '#F43F5E',
    amber: '#F59E0B',
  },
  dark: {
    indigo: '#818CF8',
    ocean: '#38BDF8',
    jade: '#34D399',
    rose: '#FB7185',
    amber: '#FBBF24',
  },
} as const;

export const providerColors = {
  google: '#4285F4',
  external: primitiveColors.amber[500],
} as const;

export const spacing = {
  0.5: 2,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
} as const;

export const radii = {
  chip: 6,
  control: 8,
  panel: 12,
  round: 9999,
} as const;

export const componentTokens = {
  taskDetail: {
    rowMinHeight: 36,
    panelWidth: 416,
    sectionGap: spacing[3],
  },
  calendar: {
    eventRadius: radii.chip,
    gridLine: semanticColors.light.border,
    nowIndicator: priorityColors.light.p1,
  },
} as const;
