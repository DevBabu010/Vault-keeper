/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#F5FBF8',
    tint: '#B7FF48',
    background: '#071014',
    foreground: '#F5FBF8',
    card: '#111F24',
    cardForeground: '#F5FBF8',
    primary: '#B7FF48',
    primaryForeground: '#071014',
    secondary: '#17292F',
    secondaryForeground: '#D8E7E3',
    muted: '#122126',
    mutedForeground: '#8AA49F',
    accent: '#B7FF48',
    accentForeground: '#071014',
    destructive: '#FF6F7E',
    destructiveForeground: '#190A0D',
    border: '#2A4748',
    input: '#20383A',
  },
  dark: {
    text: '#F5FBF8',
    tint: '#B7FF48',
    background: '#071014',
    foreground: '#F5FBF8',
    card: '#111F24',
    cardForeground: '#F5FBF8',
    primary: '#B7FF48',
    primaryForeground: '#071014',
    secondary: '#17292F',
    secondaryForeground: '#D8E7E3',
    muted: '#122126',
    mutedForeground: '#8AA49F',
    accent: '#B7FF48',
    accentForeground: '#071014',
    destructive: '#FF6F7E',
    destructiveForeground: '#190A0D',
    border: '#2A4748',
    input: '#20383A',
  },
  radius: 22,
};

export default colors;
