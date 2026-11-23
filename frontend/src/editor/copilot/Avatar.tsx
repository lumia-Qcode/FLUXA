import React from "react";

interface AvatarProps {
  size?: number;
  withGlow?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  size = 36,
  withGlow = false,
  className = "",
}) => {
  return (
    <div
      className={`fluxa-avatar-container ${withGlow ? "fluxa-avatar-ring" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        background: "#F2B5C4",
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <svg
        width={Math.round(size * 0.72)}
        height={Math.round(size * 0.72)}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Antenna */}
        <circle cx="12" cy="2.5" r="1.3" fill="#FFFFFF" />
        <path
          d="M12 3.8V6"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Head outer shell */}
        <rect
          x="3.5"
          y="6"
          width="17"
          height="14"
          rx="6"
          fill="#FFFFFF"
        />

        {/* Side ear pods */}
        <rect
          x="1.8"
          y="10.5"
          width="2.2"
          height="5"
          rx="1.1"
          fill="#FBE3EA"
        />
        <rect
          x="20"
          y="10.5"
          width="2.2"
          height="5"
          rx="1.1"
          fill="#FBE3EA"
        />

        {/* Dark Visor */}
        <rect
          x="5.5"
          y="8.5"
          width="13"
          height="7.5"
          rx="3.5"
          fill="#13141F"
        />

        {/* Glowing eyes */}
        <circle cx="9" cy="12" r="1.5" fill="#AEBFFF" />
        <circle cx="15" cy="12" r="1.5" fill="#AEBFFF" />

        {/* Subtle cute smile */}
        <path
          d="M10.8 14.2C11.3 14.6 12.7 14.6 13.2 14.2"
          stroke="#AEBFFF"
          strokeWidth="1"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
};
