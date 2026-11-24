import { useEffect } from 'react';
import '../applock.css';

/**
 * Makes a page behave like an app while it is open: the screen cannot be pinch-zoomed or pushed sideways,
 * and tapping a field does not zoom in. The normal viewport is put back when the page closes,
 * so the rest of the site keeps its usual zoom for accessibility.
 */
export function useAppViewport() {
    useEffect(() => {
        const meta = document.querySelector('meta[name="viewport"]');
        const before = meta?.getAttribute('content') ?? null;
        meta?.setAttribute('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
        document.documentElement.classList.add('app-lock');
        return () => {
            document.documentElement.classList.remove('app-lock');
            if (meta && before !== null) meta.setAttribute('content', before);
        };
    }, []);
}
