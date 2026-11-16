import { useEffect } from 'react';

/**
 * Escape closes the top-most full-screen page or dialog that older screens render themselves.
 * (Pages built with the shared Modal already handle Escape on their own.)
 * It presses the screen's own Cancel / Close button, so each screen keeps its normal close logic.
 */
export const SheetKeys = () => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const layers = document.querySelectorAll<HTMLElement>('.sheet-legacy, .dialog-back');
            const top = layers[layers.length - 1];
            if (!top) return;
            const buttons = [...top.querySelectorAll<HTMLButtonElement>('button')];
            const label = (b: HTMLButtonElement) => (b.getAttribute('aria-label') || b.textContent || '').trim();
            const target =
                buttons.find(b => /^(cancel|close|back|no, keep.*|keep.*)$/i.test(label(b))) ||
                buttons.find(b => label(b) === '');           // an icon-only button in the header is the close X
            target?.click();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    return null;
};
