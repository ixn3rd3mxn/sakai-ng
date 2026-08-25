import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const AppPreset = definePreset(Aura, {
    components: {
        tag: {
            colorScheme: {
                dark: {
                    secondary: { background: '{surface.0}', color: '{surface.950}' },
                    contrast: { background: '{surface.800}', color: '{surface.300}' }
                }
            }
        }
    }
});
