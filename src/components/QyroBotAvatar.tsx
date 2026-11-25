import React, { useState } from 'react';
import {
  AVATAR_COLORS,
  MOOD_TO_ANIMATION,
  type AvatarAnimation,
  type AvatarColorDef,
  type AvatarExpression,
  type AvatarShape,
  type BotAvatarSpec,
  type WorkingMood,
} from '../core/types';

export function getAvatarColorDef(colorId: BotAvatarSpec['color']): AvatarColorDef {
  return (AVATAR_COLORS.find((c) => c.id === colorId) ?? AVATAR_COLORS[0]) as AvatarColorDef;
}

interface QyroBotAvatarProps {
  spec: BotAvatarSpec;
  mood?: WorkingMood;
  animationOverride?: AvatarAnimation | null;
  size?: number;
  isChiefOfStaff?: boolean;
  className?: string;
  label?: string;
}

function renderShapePath(shape: AvatarShape, fill: string, stroke: string) {
  switch (shape) {
    case 'circle':
      return <circle cx="32" cy="34" r="22" fill={fill} stroke={stroke} strokeWidth="1.2" />;
    case 'pebble':
      return (
        <path
          d="M14 37 C12 24, 21 13, 34 13 C46 13, 54 22, 53 35 C52 48, 43 56, 30 56 C19 56, 15 47, 14 37 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      );
    case 'squircle':
      return (
        <rect
          x="11"
          y="13"
          width="42"
          height="42"
          rx="14"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      );
    case 'capsule':
      return (
        <rect
          x="16"
          y="11"
          width="32"
          height="46"
          rx="16"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      );
    case 'triangle':
      return (
        <path
          d="M32 12 C35 12, 37 14, 39 17 L52 45 C54 50, 51 55, 45 55 L19 55 C13 55, 10 50, 12 45 L25 17 C27 14, 29 12, 32 12 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      );
    case 'hexagon':
      return (
        <path
          d="M32 12 L51 22.5 L51 45.5 L32 56 L13 45.5 L13 22.5 Z"
          strokeLinejoin="round"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.6"
        />
      );
    case 'cloud':
      return (
        <path
          d="M21 53 C14 53, 10 48, 10 42 C10 37, 13 33, 17 32 C17 22, 24 15, 33 15 C41 15, 47 20, 48 28 C52 29, 55 34, 55 39 C55 47, 50 53, 42 53 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      );
    case 'droplet':
      return (
        <path
          d="M32 11 C32 11, 52 29, 52 41 C52 50, 43 56, 32 56 C21 56, 12 50, 12 41 C12 29, 32 11, 32 11 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="1.2"
        />
      );
  }
}

function renderEyes(expression: AvatarExpression, eyeHex: string, animation: AvatarAnimation) {
  if (animation === 'wink') {
    return (
      <g>
        <circle cx="24.5" cy="34" r="3.1" fill={eyeHex} />
        <path
          d="M35.5 34.5 Q39.5 31.5 43.5 34.5"
          fill="none"
          stroke={eyeHex}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (animation === 'wide_eyes') {
    return (
      <g>
        <circle cx="24.5" cy="33.5" r="4.5" fill={eyeHex} />
        <circle cx="39.5" cy="33.5" r="4.5" fill={eyeHex} />
        <circle cx="25.5" cy="32.2" r="1.2" fill="#0a0a0c" fillOpacity="0.35" />
        <circle cx="40.5" cy="32.2" r="1.2" fill="#0a0a0c" fillOpacity="0.35" />
      </g>
    );
  }
  if (animation === 'sleep') {
    return (
      <g>
        <path d="M21 35 Q24.5 38 28 35" fill="none" stroke={eyeHex} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M36 35 Q39.5 38 43 35" fill="none" stroke={eyeHex} strokeWidth="2.4" strokeLinecap="round" />
      </g>
    );
  }

  switch (expression) {
    case 'neutral':
      return (
        <g className="qyro-anim-blink">
          <circle cx="24.5" cy="34" r="3.1" fill={eyeHex} />
          <circle cx="39.5" cy="34" r="3.1" fill={eyeHex} />
        </g>
      );
    case 'attentive':
      return (
        <g className="qyro-anim-blink">
          <ellipse cx="24.5" cy="33.2" rx="3.1" ry="4.2" fill={eyeHex} />
          <ellipse cx="39.5" cy="33.2" rx="3.1" ry="4.2" fill={eyeHex} />
        </g>
      );
    case 'surprised':
      return (
        <g>
          <circle cx="24.5" cy="33" r="4.3" fill={eyeHex} />
          <circle cx="39.5" cy="33" r="4.3" fill={eyeHex} />
        </g>
      );
    case 'excited':
      return (
        <g>
          <path d="M21 36 L24.5 31 L28 36" fill="none" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M36 36 L39.5 31 L43 36" fill="none" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'happy':
      return (
        <g>
          <path d="M20.5 35.5 Q24.5 30.5 28.5 35.5" fill="none" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M35.5 35.5 Q39.5 30.5 43.5 35.5" fill="none" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" />
        </g>
      );
    case 'laughing':
      return (
        <g>
          <path d="M20.5 34.5 Q24.5 29.5 28.5 34.5" fill="none" stroke={eyeHex} strokeWidth="2.7" strokeLinecap="round" />
          <path d="M35.5 34.5 Q39.5 29.5 43.5 34.5" fill="none" stroke={eyeHex} strokeWidth="2.7" strokeLinecap="round" />
          <path d="M27 40.5 Q32 45 37 40.5" fill="none" stroke={eyeHex} strokeWidth="2.2" strokeLinecap="round" />
        </g>
      );
    case 'angry':
      return (
        <g>
          <line x1="20.5" y1="30" x2="28.5" y2="33.5" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" />
          <line x1="43.5" y1="30" x2="35.5" y2="33.5" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="24.5" cy="36" r="2.6" fill={eyeHex} />
          <circle cx="39.5" cy="36" r="2.6" fill={eyeHex} />
        </g>
      );
    case 'sad':
      return (
        <g>
          <line x1="20.5" y1="33.5" x2="28" y2="31" stroke={eyeHex} strokeWidth="2.3" strokeLinecap="round" />
          <line x1="43.5" y1="33.5" x2="36" y2="31" stroke={eyeHex} strokeWidth="2.3" strokeLinecap="round" />
          <circle cx="24.5" cy="36.5" r="2.8" fill={eyeHex} />
          <circle cx="39.5" cy="36.5" r="2.8" fill={eyeHex} />
        </g>
      );
    case 'scared':
      return (
        <g>
          <circle cx="24.5" cy="34" r="4.1" fill="none" stroke={eyeHex} strokeWidth="2.3" />
          <circle cx="39.5" cy="34" r="4.1" fill="none" stroke={eyeHex} strokeWidth="2.3" />
          <circle cx="24.5" cy="34" r="1.6" fill={eyeHex} />
          <circle cx="39.5" cy="34" r="1.6" fill={eyeHex} />
        </g>
      );
    case 'suspicious':
      return (
        <g>
          <rect x="20.5" y="33" width="8" height="2.6" rx="1.3" fill={eyeHex} />
          <circle cx="39.5" cy="34" r="3.1" fill={eyeHex} />
        </g>
      );
    case 'confused':
      return (
        <g>
          <circle cx="24.5" cy="35.5" r="2.5" fill={eyeHex} />
          <circle cx="39.5" cy="32.5" r="3.8" fill={eyeHex} />
        </g>
      );
    case 'curious':
      return (
        <g className="qyro-anim-blink">
          <circle cx="26" cy="33.5" r="3.2" fill={eyeHex} />
          <circle cx="41" cy="33.5" r="3.2" fill={eyeHex} />
        </g>
      );
    case 'proud':
      return (
        <g>
          <path d="M20.5 34 Q24.5 36.5 28.5 34" fill="none" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M35.5 34 Q39.5 36.5 43.5 34" fill="none" stroke={eyeHex} strokeWidth="2.6" strokeLinecap="round" />
        </g>
      );
    case 'shy':
      return (
        <g>
          <circle cx="24.5" cy="35.5" r="2.7" fill={eyeHex} />
          <circle cx="39.5" cy="35.5" r="2.7" fill={eyeHex} />
          <ellipse cx="19" cy="39.5" rx="2.4" ry="1.2" fill={eyeHex} fillOpacity="0.35" />
          <ellipse cx="45" cy="39.5" rx="2.4" ry="1.2" fill={eyeHex} fillOpacity="0.35" />
        </g>
      );
    case 'unimpressed':
      return (
        <g>
          <rect x="20.5" y="33.2" width="8.2" height="2.4" rx="1.2" fill={eyeHex} />
          <rect x="35.3" y="33.2" width="8.2" height="2.4" rx="1.2" fill={eyeHex} />
        </g>
      );
    case 'sleepy':
      return (
        <g>
          <path d="M20.5 34.5 Q24.5 37.5 28.5 34.5" fill="none" stroke={eyeHex} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M35.5 34.5 Q39.5 37.5 43.5 34.5" fill="none" stroke={eyeHex} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      );
  }
}

function renderAnimationOverlay(animation: AvatarAnimation, accentHex: string) {
  switch (animation) {
    case 'thinking':
      return (
        <g>
          <circle cx="48" cy="14" r="2.1" fill="#3b93f0" className="qyro-anim-dot-1" />
          <circle cx="54" cy="11" r="2.1" fill="#3b93f0" className="qyro-anim-dot-2" />
          <circle cx="59" cy="8" r="2.1" fill="#3b93f0" className="qyro-anim-dot-3" />
        </g>
      );
    case 'notification':
      return (
        <g>
          <circle cx="52" cy="14" r="5.5" fill="#3b93f0" stroke="#09090b" strokeWidth="1.8" />
        </g>
      );
    case 'alert':
    case 'exclamation':
      return (
        <g>
          <circle cx="52" cy="14" r="6.5" fill="#e8483f" stroke="#09090b" strokeWidth="1.5" />
          <line x1="52" y1="10.8" x2="52" y2="14.8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="52" cy="17.3" r="1.1" fill="#ffffff" />
        </g>
      );
    case 'orbit':
      return (
        <g className="qyro-anim-orbit">
          <circle cx="32" cy="34" r="27" fill="none" stroke={accentHex} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="6 6" />
          <circle cx="32" cy="7" r="2.6" fill="#3b93f0" />
        </g>
      );
    case 'swirl':
      return (
        <g className="qyro-anim-swirl">
          <circle cx="32" cy="34" r="26.5" fill="none" stroke="#8b5cf6" strokeOpacity="0.6" strokeWidth="1.6" strokeDasharray="16 12" />
        </g>
      );
    case 'burst':
      return (
        <g className="qyro-anim-burst">
          <line x1="32" y1="3" x2="32" y2="7.5" stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" />
          <line x1="55" y1="12" x2="51.5" y2="15" stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" />
          <line x1="9" y1="12" x2="12.5" y2="15" stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" />
          <line x1="58" y1="34" x2="54" y2="34" stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" />
          <line x1="6" y1="34" x2="10" y2="34" stroke="#3ecf8e" strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'comet':
      return (
        <g className="qyro-anim-orbit">
          <path d="M12 15 Q32 3 52 15" fill="none" stroke="#f0b429" strokeWidth="2" strokeLinecap="round" />
          <circle cx="52" cy="15" r="2.5" fill="#f0b429" />
        </g>
      );
    case 'play':
      return (
        <g>
          <circle cx="52" cy="50" r="6.5" fill="#18181c" stroke="#27272e" strokeWidth="1.2" />
          <polygon points="50.2,47 55.2,50 50.2,53" fill="#3ecf8e" />
        </g>
      );
    case 'hexagon':
      return (
        <polygon
          points="32,5 56,19 56,49 32,61 8,49 8,19"
          fill="none"
          stroke={accentHex}
          strokeOpacity="0.45"
          strokeWidth="1.3"
        />
      );
    case 'egg':
      return (
        <ellipse
          cx="32"
          cy="34"
          rx="25"
          ry="28"
          fill="none"
          stroke={accentHex}
          strokeOpacity="0.4"
          strokeWidth="1.3"
        />
      );
    case 'sleep':
      return (
        <g>
          <text x="48" y="16" fontSize="9" fontWeight="700" fill="#9a9aa6">
            Z
          </text>
          <text x="54" y="11" fontSize="7" fontWeight="700" fill="#9a9aa6" fillOpacity="0.7">
            z
          </text>
        </g>
      );
    default:
      return null;
  }
}

export const QyroBotAvatar: React.FC<QyroBotAvatarProps> = ({
  spec,
  mood = 'idle',
  animationOverride,
  size = 40,
  isChiefOfStaff = false,
  className = '',
  label = 'Bot avatar',
}) => {
  const [imgBroken, setImgBroken] = useState(false);
  const colorDef = getAvatarColorDef(spec.color);
  const activeAnimation: AvatarAnimation =
    animationOverride ?? spec.animationOverride ?? MOOD_TO_ANIMATION[mood] ?? 'idle';

  const hasExternalAsset =
    (spec.type === 'uploaded' || spec.type === 'generated') &&
    Boolean(spec.assetPath) &&
    !imgBroken;

  const bodyMotionClass =
    activeAnimation === 'alert' || activeAnimation === 'exclamation'
      ? 'qyro-anim-shake'
      : activeAnimation === 'idle'
        ? ''
        : 'qyro-anim-float';

  const subtleStroke = spec.color === 'ink' ? '#3f3f46' : spec.color === 'cream' ? '#d4d4d8' : 'rgba(255,255,255,0.14)';

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {hasExternalAsset ? (
        <img
          src={spec.assetPath!}
          alt={label}
          referrerPolicy="no-referrer"
          onError={() => setImgBroken(true)}
          className="w-full h-full object-cover rounded-xl border border-[var(--border-subtle)]"
        />
      ) : (
        <svg
          viewBox="0 0 64 64"
          width={size}
          height={size}
          className="overflow-visible"
          aria-hidden="true"
        >
          <g className={bodyMotionClass}>
            {renderShapePath(spec.shape, colorDef.hex, subtleStroke)}
            {renderEyes(spec.expression, colorDef.eyeHex, activeAnimation)}
          </g>
          {renderAnimationOverlay(activeAnimation, colorDef.hex)}
          {isChiefOfStaff && (
            <g transform="translate(21, 1)">
              <path
                d="M2 11 L4 3 L8.5 7.5 L11 2 L13.5 7.5 L18 3 L20 11 Z"
                fill="#f0b429"
                stroke="#09090b"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      )}
      {hasExternalAsset && isChiefOfStaff && (
        <svg
          viewBox="0 0 22 14"
          width={Math.max(14, Math.round(size * 0.42))}
          height={Math.max(9, Math.round(size * 0.28))}
          className="absolute -top-1.5 left-1/2 -translate-x-1/2"
          aria-hidden="true"
        >
          <path
            d="M2 12 L4 3 L8.5 8 L11 2 L13.5 8 L18 3 L20 12 Z"
            fill="#f0b429"
            stroke="#09090b"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
};
