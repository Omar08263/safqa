import { useWindowDimensions } from 'react-native';

/** Phone: 2 columns, small tablet: 3, big tablet / landscape: 4. */
export function useGrid() {
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 4 : width >= 640 ? 3 : 2;
  const gutter = width >= 640 ? 24 : 16;
  const content = Math.min(width, 1200);
  return { width, columns, gutter, content, tablet: width >= 640 };
}
