import { Capacitor } from '@capacitor/core';

export function usePlatform() {
  const platform = Capacitor.getPlatform();
  return {
    isAndroid: platform === 'android',
    isNative:  Capacitor.isNativePlatform(),
    isWeb:     platform === 'web',
  };
}
