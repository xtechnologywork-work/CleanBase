import React from 'react';
import { FileText } from 'lucide-react';
import { isPdfRef } from '../../services/documents';
import { PhotoImg } from './PhotoImg';

/** Small preview of a staff document: the photo itself, or a PDF tile. */
export const DocThumb: React.FC<{ file: string; size?: number }> = ({ file, size = 44 }) => (
    isPdfRef(file)
        ? <span style={{ width: size, height: size, borderRadius: 8, background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, color: '#d70015' }} aria-label="PDF document">
            <FileText size={Math.round(size * 0.42)} /><b style={{ fontSize: Math.max(8, Math.round(size * 0.2)), letterSpacing: 0.3 }}>PDF</b>
        </span>
        : <PhotoImg src={file} alt="" style={{ width: size, height: size, objectFit: 'cover', borderRadius: 8 }} />
);
