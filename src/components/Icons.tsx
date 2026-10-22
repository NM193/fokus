import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

/** One stroke weight throughout, so the icons read as a set. */
function base({ size = 18, ...rest }: Props) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...rest,
  };
}

export const TimerIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2.5" />
    <path d="M10 2h4" />
  </svg>
);

export const HistoryIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M21 20H3" />
  </svg>
);

export const SettingsIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const PlayIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </svg>
);

export const PauseIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M8 5v14M16 5v14" strokeWidth={2.5} />
  </svg>
);

export const ResetIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5" />
    <path d="M4 4v4.5h4.5" />
  </svg>
);

export const SkipIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 5v14l10-7z" />
    <path d="M19 5v14" />
  </svg>
);

export const WidgetIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="15" rx="2.5" />
    <rect x="12" y="11" width="6" height="5" rx="1" />
  </svg>
);

export const PlusIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
);

export const CheckIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="m5 12 4.5 4.5L19 7" />
  </svg>
);

export const CloseIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const PencilIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 20h4L18.5 9.5a2.83 2.83 0 0 0-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </svg>
);

/** Two rules: the handle a row is dragged by. */
export const GripIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 9.5h14M5 14.5h14" />
  </svg>
);
