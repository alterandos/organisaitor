import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const native = () => Capacitor.isNativePlatform();

export const hapticLight   = () => { if (native()) void Haptics.impact({ style: ImpactStyle.Light }); };
export const hapticMedium  = () => { if (native()) void Haptics.impact({ style: ImpactStyle.Medium }); };
export const hapticSuccess = () => { if (native()) void Haptics.notification({ type: NotificationType.Success }); };
export const hapticWarning = () => { if (native()) void Haptics.notification({ type: NotificationType.Warning }); };
