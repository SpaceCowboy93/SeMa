'use client'

export interface BlobConfig {
  color: string
  size: number         // px
  top: string
  left: string
  duration: number     // animation duration in seconds
  delay?: number       // animation delay in seconds
}

interface Props {
  blobs: BlobConfig[]
  className?: string
}

export function AnimatedBackground({ blobs, className }: Props) {
  return (
    <div
      className={`pointer-events-none fixed inset-0 overflow-hidden z-[-1] ${className ?? ''}`}
      aria-hidden="true"
    >
      {blobs.map((blob, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            borderRadius: '50%',
            background: blob.color,
            filter: `blur(${Math.round(blob.size * 0.42)}px)`,
            opacity: 0.20,
            animation: `bgBlob ${blob.duration}s ease-in-out ${blob.delay ?? 0}s infinite alternate`,
            willChange: 'transform',
          }}
        />
      ))}

      <style>{`
        @keyframes bgBlob {
          0%   { transform: translate(0, 0) scale(1); }
          33%  { transform: translate(22px, -28px) scale(1.07); }
          66%  { transform: translate(-18px, 16px) scale(0.94); }
          100% { transform: translate(14px, 24px) scale(1.04); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes bgBlob {
            0%, 100% { transform: none; }
          }
        }
      `}</style>
    </div>
  )
}
