import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

export const AppPreset = definePreset(Aura, {
    semantic: {
        colorScheme: {
            // Dropdown section headers (ใช้ล่าสุด / ทั้งหมด / amphoe names) sit one
            // step lighter than stock Aura so they read as labels, not options.
            light: { list: { optionGroup: { color: '{surface.400}' } } },
            dark: { list: { optionGroup: { color: '{surface.500}' } } }
        }
    },
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
