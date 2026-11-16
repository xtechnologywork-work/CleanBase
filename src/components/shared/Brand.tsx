import React from 'react';

interface BrandProps {
    /** Height of the mark in px. The wordmark scales with it. */
    size?: number;
    /** Hide the "CleanBase" wordmark and show only the slashes. */
    markOnly?: boolean;
    className?: string;
}

/**
 * CleanBase logo drawn in code so it follows the surrounding text color
 * (works on parchment, white and dark tiles).
 */
export const Brand: React.FC<BrandProps> = ({ size = 22, markOnly = false, className }) => (
    <span
        className={className}
        style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.38, color: 'inherit', lineHeight: 1 }}
    >
        <svg
            width={size * 1.5}
            height={size}
            viewBox="0 0 340 230"
            fill="none"
            aria-hidden="true"
            focusable="false"
        >
            <circle cx="42" cy="62" r="27" fill="currentColor" />
            <path d="M105 200 L188 58" stroke="currentColor" strokeWidth="52" strokeLinecap="round" />
            <path d="M218 200 L301 58" stroke="currentColor" strokeWidth="52" strokeLinecap="round" />
        </svg>
        {!markOnly && (
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
        )}
        {markOnly && <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>CleanBase</span>}
    </span>
);
