import React, { useEffect, useState } from 'react';
import { resolvePhoto } from '../../services/photos';

export const PhotoImg: React.FC<React.ImgHTMLAttributes<HTMLImageElement> & { src: string }> = ({ src, alt, ...rest }) => {
    const [url, setUrl] = useState(src.startsWith('sb:') ? '' : src);
    useEffect(() => {
        let alive = true;
        resolvePhoto(src).then(u => { if (alive) setUrl(u); }).catch(() => { if (alive) setUrl(''); });
        return () => { alive = false; };
    }, [src]);
    if (!url) return <span style={{ width: 88, height: 88, borderRadius: 10, background: 'var(--color-bg-subtle)', display: 'inline-block' }} aria-label="Loading photo" />;
    return <img src={url} alt={alt} {...rest} />;
};
