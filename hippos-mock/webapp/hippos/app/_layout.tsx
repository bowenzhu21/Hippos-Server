import { Buffer } from 'buffer';
import { Stack } from 'expo-router';

(global as any).Buffer = Buffer;

export default function RootLayout() {
  return <Stack />;
}
