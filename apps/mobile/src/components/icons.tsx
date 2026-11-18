import Svg, { Circle, Path } from 'react-native-svg';

type P = { color: string; size?: number };
const base = (size: number) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none' as const, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const HomeIcon = ({ color, size = 24 }: P) => (
  <Svg {...base(size)} stroke={color}><Path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></Svg>
);
export const SearchIcon = ({ color, size = 24 }: P) => (
  <Svg {...base(size)} stroke={color}><Circle cx="11" cy="11" r="7" /><Path d="m20 20-3.5-3.5" /></Svg>
);
export const RadarIcon = ({ color, size = 24 }: P) => (
  <Svg {...base(size)} stroke={color}><Circle cx="12" cy="12" r="9" /><Circle cx="12" cy="12" r="5" /><Path d="M12 12 18 6" /></Svg>
);
export const BellIcon = ({ color, size = 24 }: P) => (
  <Svg {...base(size)} stroke={color}><Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Svg>
);
export const MenuIcon = ({ color, size = 24 }: P) => (
  <Svg {...base(size)} stroke={color}><Path d="M4 6h16M4 12h16M4 18h16" /></Svg>
);
