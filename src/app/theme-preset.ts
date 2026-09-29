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
        // An "on" float label sits across the field's top border, half on the
        // card and half on the field. Stock Aura fills it with the field's
        // colour only, which is invisible in light mode (both white) but in
        // dark mode draws a darker box above the border (field surface.950 on
        // a surface.900 card). Split at the border, each half matches what is
        // behind it.
        floatlabel: {
            on: {
                active: { background: 'linear-gradient(to bottom, {content.background} 50%, {form.field.background} 50%)' }
            }
        },
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
