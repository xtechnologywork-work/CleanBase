import React from 'react';

interface BrandProps {
    /** Height of the mark in px. The wordmark scales with it. */
    size?: number;
    className?: string;
}

/** The CleanBase name as text, so it follows the surrounding text color (parchment, white and dark tiles). */
export const Brand: React.FC<BrandProps> = ({ size = 22, className }) => (
    <span
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.38, color: 'inherit', lineHeight: 1 }}
    >
        <span
            style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: size * 0.95,
                letterSpacing: '-0.035em',
            }}
        >
            CleanBase
        </span>
    </span>
);
